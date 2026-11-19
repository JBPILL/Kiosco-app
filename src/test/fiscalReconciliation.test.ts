// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFiscalVoucherQuery, freezeFiscalRequest, reconcileFiscalVoucher } from '../../supabase/functions/_shared/fiscalReconciliation'
import type { FiscalRequestData } from '../../supabase/functions/_shared/fiscalReconciliation'

const sample: FiscalRequestData = {
  version:1,entorno:'HOMOLOGACION',cuitEmisor:'20123456786',puntoVenta:2,tipoComprobante:11,numero:42,
  concepto:1,tipoDocumento:99,numeroDocumento:'0',condicionIvaReceptor:5,fecha:'20261020',
  servicioDesde:null,servicioHasta:null,vencimientoPago:null,moneda:'PES',cotizacion:'1',
  importes:{total:'123.45',neto:'123.45',iva:'0',noGravado:'0',exento:'0',tributos:'0'},iva:[],tributos:[],
}
const copy = (): FiscalRequestData => structuredClone(sample)
function observed(request: FiscalRequestData = sample) {
  return {consulta:{entorno:request.entorno,cuitEmisor:request.cuitEmisor,puntoVenta:request.puntoVenta,
    tipoComprobante:request.tipoComprobante,numero:request.numero},comprobante:structuredClone(request),
  autorizacion:{resultado:'A',tipo:'CAE',cae:'11111111111111',vencimiento:'20261030',procesadoEn:'20261020123456'},errores:[]}
}
afterEach(()=>vi.restoreAllMocks())

it('congela copia profunda y hash SHA256, sin mutar ni compartir datos del llamador',async()=>{
  const input=copy(),frozen=await freezeFiscalRequest(input)
  expect(frozen.sha256).toMatch(/^[0-9a-f]{64}$/)
  expect(frozen.solicitud.importes.total).toBe('123.45')
  expect(frozen.solicitud.importes.iva).toBe('0.00')
  input.importes.total='999'
  expect(frozen.solicitud.importes.total).toBe('123.45')
  expect(Object.isFrozen(frozen.solicitud.importes)).toBe(true)
  expect(Object.isFrozen(frozen.solicitud.iva)).toBe(true)
  expect((await freezeFiscalRequest(copy())).sha256).toBe(frozen.sha256)
})
it('normaliza representación decimal y orden de claves sin redondear',async()=>{
  const a=await freezeFiscalRequest(sample)
  const input=copy();input.importes.total='000123.45000';input.importes.neto='123.4500'
  expect((await freezeFiscalRequest(Object.fromEntries(Object.entries(input).reverse()))).sha256).toBe(a.sha256)
})
it('reconoce coincidencia íntegra y nunca habilita reenvío',async()=>{
  const expected=await freezeFiscalRequest(sample)
  expect(await reconcileFiscalVoucher(observed(),expected)).toEqual({estado:'AUTORIZACION_COINCIDENTE',
    cae:'11111111111111',vencimiento:'20261030',procesadoEn:'20261020123456',solicitudSha256:expected.sha256,puedeReenviar:false})
})
it('permite recuperar autorización histórica aunque su vencimiento ya haya pasado',async()=>{
  const req=copy();req.fecha='20200101'
  const result=observed(req);result.autorizacion.vencimiento='20200111';result.autorizacion.procesadoEn='20200101120000'
  expect((await reconcileFiscalVoucher(result,await freezeFiscalRequest(req))).estado).toBe('AUTORIZACION_COINCIDENTE')
})
it('permite ausencia de fecha de proceso opcional sin inventarla',async()=>{
  const result={...observed(),autorizacion:{...observed().autorizacion,procesadoEn:null}}
  expect(await reconcileFiscalVoucher(result,await freezeFiscalRequest(sample))).toMatchObject({estado:'AUTORIZACION_COINCIDENTE',procesadoEn:null})
})
it.each(['puntoVenta','tipoComprobante','numero','cuitEmisor','entorno'])('rechaza consulta de otra identidad %s',async field=>{
  const result=observed(),obj=result.consulta as unknown as Record<string,unknown>
  obj[field]=field==='cuitEmisor'?'30123456789':field==='entorno'?'PRODUCCION':field==='tipoComprobante'?6:3
  expect((await reconcileFiscalVoucher(result,await freezeFiscalRequest(sample))).estado).toBe('CONCILIAR')
})
it.each(['fecha','condicionIvaReceptor','numeroDocumento','concepto','importe'])('rechaza datos distintos %s',async field=>{
  const result=observed()
  if(field==='importe'){result.comprobante.importes.total='124.45';result.comprobante.importes.neto='124.45'}
  else if(field==='fecha')result.comprobante.fecha='20261019'
  else if(field==='condicionIvaReceptor')result.comprobante.condicionIvaReceptor=1
  else if(field==='numeroDocumento'){result.comprobante.tipoDocumento=96;result.comprobante.numeroDocumento='12345678'}
  else {result.comprobante.concepto=2;result.comprobante.servicioDesde='20261001';result.comprobante.servicioHasta='20261020';result.comprobante.vencimientoPago='20261020'}
  expect(await reconcileFiscalVoucher(result,await freezeFiscalRequest(sample))).toMatchObject({estado:'CONCILIAR',puedeReenviar:false})
})
it('una solicitud modificada con el hash anterior no se acepta',async()=>{
  const frozen=await freezeFiscalRequest(sample),mutated=structuredClone(frozen)
  mutated.solicitud.importes.total='222.22';mutated.solicitud.importes.neto='222.22'
  expect(await reconcileFiscalVoucher(observed(),mutated)).toMatchObject({estado:'CONCILIAR',codigo:'SOLICITUD_INVALIDA'})
})
it.each([null,{},[],{token:'SYNTHETIC_SECRET'}])('respuesta incompleta queda pendiente %#',async result=>{
  const decision=await reconcileFiscalVoucher(result,await freezeFiscalRequest(sample))
  expect(decision).toMatchObject({estado:'CONCILIAR',puedeReenviar:false})
  expect(JSON.stringify(decision)).not.toContain('SYNTHETIC_SECRET')
})
it('un error de negocio prevalece sobre un resultado aparentemente autorizado',async()=>{
  const result={...observed(),errores:[{codigo:602,mensaje:'SYNTHETIC_SECRET'}]}
  expect(await reconcileFiscalVoucher(result,await freezeFiscalRequest(sample))).toEqual({estado:'CONCILIAR',codigo:'SIN_CONFIRMACION',puedeReenviar:false})
})
it.each([{resultado:'R'},{tipo:'CAEA'},{cae:'00000000000000'},{cae:'123'},
  {vencimiento:'20260230'},{vencimiento:'20261019'},{procesadoEn:'20261020256060'}])('no acepta autorización inválida %#',async change=>{
  const result=observed();Object.assign(result.autorizacion,change)
  expect((await reconcileFiscalVoucher(result,await freezeFiscalRequest(sample))).estado).toBe('CONCILIAR')
})
describe.each([1,6])('comparación de factura tipo %s',tipo=>{
  function taxed(): FiscalRequestData {
    const req=copy();req.tipoComprobante=tipo
    req.importes={total:'122',neto:'100',iva:'21',noGravado:'0',exento:'0',tributos:'1'}
    req.iva=[{id:5,base:'100',importe:'21'}]
    req.tributos=[{id:99,descripcion:'Tributo sintético',base:'100',alicuota:'1',importe:'1'}]
    return req
  }
  it('compara IVA, base y tributos además del total',async()=>{
    const req=taxed(),expected=await freezeFiscalRequest(req)
    expect((await reconcileFiscalVoucher(observed(req),expected)).estado).toBe('AUTORIZACION_COINCIDENTE')
    const wrong=taxed();wrong.tributos=[{...wrong.tributos[0],descripcion:'Otra descripción'}]
    expect((await reconcileFiscalVoucher(observed(wrong),expected)).estado).toBe('CONCILIAR')
    const other=taxed();other.iva=[{...other.iva[0],id:4}]
    expect((await reconcileFiscalVoucher(observed(other),expected)).estado).toBe('CONCILIAR')
  })
  it('rechaza sumas inconsistentes de IVA o tributos',async()=>{
    const req=taxed();req.iva=[{id:5,base:'100',importe:'20'}]
    await expect(freezeFiscalRequest(req)).rejects.toThrow('FISCAL_CONTRATO_INVALIDO')
    const second=taxed();second.tributos=[]
    await expect(freezeFiscalRequest(second)).rejects.toThrow('FISCAL_CONTRATO_INVALIDO')
  })
})
it.each([123.45,'123,45','NaN','Infinity','1e2','-1.00','123.451'])('rechaza importe no exacto %s',async amount=>{
  const req=copy() as unknown as Record<string,unknown>
  req.importes={...sample.importes,total:amount}
  await expect(freezeFiscalRequest(req)).rejects.toThrow('FISCAL_CONTRATO_INVALIDO')
})
it.each([{version:2},{entorno:'PRODUCCION'},{cuitEmisor:'20123456780'},{puntoVenta:0},{numero:100000000},
  {tipoComprobante:99},{fecha:'20260229'},{moneda:'DOL'},{cotizacion:'1.1'},{token:'SYNTHETIC_SECRET'},
  {concepto:2},{condicionIvaReceptor:0},{numeroDocumento:'1'}])('rechaza contrato fuera de alcance o inválido %#',async change=>{
  await expect(freezeFiscalRequest({...copy(),...change})).rejects.toThrow('FISCAL_CONTRATO_INVALIDO')
})
it('crea sólo consulta homologada con XML escapado y nunca llama fetch',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No red'))
  const expected=await freezeFiscalRequest(sample),now=Date.parse('2026-10-20T20:00:00Z')
  const request=await buildFiscalVoucherQuery(expected,{token:'SYNTHETIC_<&"',sign:'SYNTHETIC_SIGN',expiresAt:now+120000},now)
  expect(request.url).toBe('https://wswhomo.afip.gov.ar/wsfev1/service.asmx')
  expect(request.redirect).toBe('error')
  expect(request.headers.get('SOAPAction')).toBe('"http://ar.gov.afip.dif.FEV1/FECompConsultar"')
  const body=await request.text()
  expect(body).toContain('SYNTHETIC_&lt;&amp;&quot;')
  expect(body).toContain('<CbteNro>42</CbteNro>')
  expect(body).not.toContain('FECAESolicitar')
  expect(fetch).not.toHaveBeenCalled()
})
it.each([0,60000,NaN])('rechaza TA vencido o sin margen suficiente %#',async extra=>{
  const now=Date.now()
  await expect(buildFiscalVoucherQuery(await freezeFiscalRequest(sample),{token:'SYNTHETIC',sign:'SYNTHETIC',expiresAt:now+extra},now)).rejects.toThrow('FISCAL_CONTRATO_INVALIDO')
})

it('hash estable para el orden de alícuotas, sin colación dependiente del sistema',async()=>{
  const req=copy();req.tipoComprobante=6
  req.importes={total:'231.50',neto:'200',iva:'31.50',noGravado:'0',exento:'0',tributos:'0'}
  req.iva=[{id:5,base:'100',importe:'21'},{id:4,base:'100',importe:'10.50'}]
  const first=await freezeFiscalRequest(req)
  req.iva=[...req.iva].reverse()
  expect((await freezeFiscalRequest(req)).sha256).toBe(first.sha256)
})
it('alícuotas duplicadas o sumas de bases distintas no se aceptan',async()=>{
  const req=copy();req.tipoComprobante=6
  req.importes={total:'121',neto:'100',iva:'21',noGravado:'0',exento:'0',tributos:'0'}
  req.iva=[{id:5,base:'50',importe:'10'},{id:5,base:'50',importe:'11'}]
  await expect(freezeFiscalRequest(req)).rejects.toThrow('FISCAL_CONTRATO_INVALIDO')
  req.iva=[{id:5,base:'90',importe:'21'}]
  await expect(freezeFiscalRequest(req)).rejects.toThrow('FISCAL_CONTRATO_INVALIDO')
})
it('no construye XML con controles inválidos en las credenciales',async()=>{
  const now=Date.now(),secret='SYNTHETIC_'+String.fromCharCode(0)
  await expect(buildFiscalVoucherQuery(await freezeFiscalRequest(sample),{token:secret,sign:'SYNTHETIC',expiresAt:now+120000},now)).rejects.toThrow('FISCAL_CONTRATO_INVALIDO')
})
