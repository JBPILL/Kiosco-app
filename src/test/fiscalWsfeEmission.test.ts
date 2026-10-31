// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { buildFiscalEmissionRequest, consultLastFiscalNumber, decodeLastFiscalNumber, decodeFiscalEmissionReceipt, sendFiscalEmission } from '../../supabase/functions/_shared/fiscalWsfeEmission'
import { freezeFiscalRequest } from '../../supabase/functions/_shared/fiscalReconciliation'
import { wsfeSample, wsfeSoap, wsfeLast, wsfeReceipt } from './fixtures/fiscalWsfe'
const series={entorno:'HOMOLOGACION',cuitEmisor:'20123456786',puntoVenta:2,tipoComprobante:11}
const ticket=()=>({token:'SYNTHETIC_TOKEN&',sign:'SYNTHETIC_SIGN<',expiresAt:Date.now()+120000})
const xml=(body:string,status=200)=>new Response(body,{status,headers:{'Content-Type':'text/xml; charset=utf-8'}})
afterEach(()=>vi.useRealTimers())
it.each([0,1,99999999])('último autorizado %s conserva el valor exacto, incluido cero',number=>{
  expect(decodeLastFiscalNumber(wsfeLast(number),series)).toBe(number)
})
it.each([
  ()=>wsfeLast().replace('<PtoVta>2','<PtoVta>3'),()=>wsfeLast().replace('<CbteTipo>11','<CbteTipo>6'),
  ()=>wsfeLast(-1),()=>wsfeLast(100000000),()=>wsfeLast().replace('<CbteNro>0','<CbteNro>0.1'),
  ()=>wsfeLast().replace('</CbteNro>','</CbteNro><CbteNro>1</CbteNro>'),
  ()=>wsfeLast().replace('</CbteNro>','</CbteNro><Errors><Err><Code>11002</Code><Msg>SYNTHETIC_PRIVATE</Msg></Err></Errors>'),
  ()=>wsfeLast().replace('http://ar.gov.afip.dif.FEV1/','https://evil.invalid/'),
  ()=>wsfeLast().replace('<PtoVta>','<PtoVta><X/>'),
  ()=>'<!DOCTYPE a [<!ENTITY x SYSTEM "file:///SYNTHETIC_PRIVATE">]>'+wsfeLast(),
])('no convierte respuesta de numeración inválida %# en secuencia disponible',make=>{
  expect(()=>decodeLastFiscalNumber(make(),series)).toThrow()
})
it('consulta usa endpoint/SOAPAction fijos, TA escapado y no reintenta',async()=>{
  const fetcher=vi.fn<typeof fetch>(async req=>{
    const r=req as Request;expect(r.url).toBe('https://wswhomo.afip.gov.ar/wsfev1/service.asmx');expect(r.redirect).toBe('error')
    expect(r.headers.get('SOAPAction')).toBe('"http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado"')
    expect(await r.text()).toContain('<Token>SYNTHETIC_TOKEN&amp;</Token>');return xml(wsfeLast(42))
  })
  const result=await consultLastFiscalNumber(series,ticket(),fetcher);expect(result.ultimo).toBe(42);expect(Number.isFinite(Date.parse(result.consultado_en))).toBe(true)
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it.each([{...series,entorno:'PRODUCCION'},{...series,puntoVenta:99999},{...series,cuitEmisor:'20123456789'},{...series,numero:1}])('serie inválida %# no llega a red',async value=>{
  const fetcher=vi.fn<typeof fetch>();await expect(consultLastFiscalNumber(value,ticket(),fetcher)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled()
})
it.each([11,1,6])('serializa tipo %s sin defaults monetarios ni redondeo',async type=>{
  const sample=type===11?wsfeSample:{...wsfeSample,tipoComprobante:type,tipoDocumento:80,numeroDocumento:'20123456786',condicionIvaReceptor:1,
    importes:{...wsfeSample.importes,total:'121',neto:'100',iva:'21'},iva:[{id:5,base:'100',importe:'21'}]}
  const frozen=await freezeFiscalRequest(sample),req=await buildFiscalEmissionRequest(frozen,ticket()),body=await req.text()
  expect(req.headers.get('SOAPAction')).toBe('"http://ar.gov.afip.dif.FEV1/FECAESolicitar"')
  expect(body).toContain('<CantReg>1</CantReg>');expect(body).toContain('<CbteDesde>1</CbteDesde><CbteHasta>1</CbteHasta>')
  expect(body).not.toContain('<CanMisMonExt>');expect(body).toContain(`<CondicionIVAReceptorId>${sample.condicionIvaReceptor}</CondicionIVAReceptorId>`)
  expect(body).toContain(type===11?'<ImpTotal>123.45</ImpTotal>':'<ImpTotal>121.00</ImpTotal>')
  expect(body.includes('<Iva>')).toBe(type!==11)
})
it('servicios y tributos conservan texto/CR y decimales canónicos sin inyección XML',async()=>{
  const frozen=await freezeFiscalRequest({...wsfeSample,concepto:2,servicioDesde:'20261001',servicioHasta:'20261020',vencimientoPago:'20261031',
    importes:{...wsfeSample.importes,total:'128.45',tributos:'5'},tributos:[{id:99,descripcion:'A & <B>\rC',base:'100',alicuota:'5',importe:'5'}]})
  const body=await (await buildFiscalEmissionRequest(frozen,ticket())).text()
  expect(body).toContain('<Desc>A &amp; &lt;B&gt;&#13;C</Desc>');expect(body).toContain('<Alic>5.0000</Alic>');expect(body).toContain('<FchServDesde>20261001</FchServDesde>')
})
it.each(['\u0000','\ud800','\uffff','x'.repeat(81)])('texto de tributo inválido %# se rechaza antes del permiso de red',async desc=>{
  const frozen=await freezeFiscalRequest({...wsfeSample,importes:{...wsfeSample.importes,total:'128.45',tributos:'5'},tributos:[{id:99,descripcion:desc,base:'100',alicuota:'5',importe:'5'}]})
  const guard=vi.fn(),fetcher=vi.fn<typeof fetch>();await expect(sendFiscalEmission(frozen,ticket(),fetcher,guard)).rejects.toThrow();expect(guard).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled()
})
it.each(['1.0001','1000'])('no redondea alícuota de tributo %s',async rate=>{
  const frozen=await freezeFiscalRequest({...wsfeSample,tributos:[{id:99,descripcion:'Sintético',base:'100',alicuota:rate,importe:'0'}]})
  await expect(buildFiscalEmissionRequest(frozen,ticket())).rejects.toThrow()
})
it('guarda secuencia de permiso antes del único envío',async()=>{
  const frozen=await freezeFiscalRequest(wsfeSample),order:string[]=[]
  const guard=vi.fn(async()=>{order.push('PERMISO')}),fetcher=vi.fn<typeof fetch>(async()=>{order.push('ENVIO');return xml(wsfeReceipt())})
  expect(await sendFiscalEmission(frozen,ticket(),fetcher,guard)).toMatchObject({estado:'APROBACION_RECIBIDA',puedeReenviar:false})
  expect(order).toEqual(['PERMISO','ENVIO']);expect(fetcher).toHaveBeenCalledTimes(1)
})
it('permiso rechazado/ACK perdido impide el transporte y no refleja mensajes',async()=>{
  const frozen=await freezeFiscalRequest(wsfeSample),fetcher=vi.fn<typeof fetch>()
  await expect(sendFiscalEmission(frozen,ticket(),fetcher,async()=>{throw new Error('SYNTHETIC_PRIVATE')})).rejects.toThrow('FISCAL_WSFE_NO_CONFIRMADO')
  expect(fetcher).not.toHaveBeenCalled()
})
it('aprobación con observaciones devuelve sólo códigos y requiere conciliación completa',async()=>{
  const frozen=await freezeFiscalRequest(wsfeSample),body=wsfeReceipt().replace('</Resultado><CAE>','</Resultado><Observaciones><Obs><Code>10017</Code><Msg>SYNTHETIC_PRIVATE</Msg></Obs></Observaciones><CAE>')
  const result=await decodeFiscalEmissionReceipt(body,frozen);expect(result).toEqual({estado:'APROBACION_RECIBIDA',codigos:[10017],puedeReenviar:false})
  expect(JSON.stringify(result)).not.toMatch(/11111111111111|SYNTHETIC_PRIVATE/)
})
it('rechazo y error general nunca autorizan reenvío ni generan CAE',async()=>{
  const frozen=await freezeFiscalRequest(wsfeSample)
  expect(await decodeFiscalEmissionReceipt(wsfeReceipt('R'),frozen)).toEqual({estado:'RECHAZO_RECIBIDO',codigos:[],puedeReenviar:false})
  expect(await decodeFiscalEmissionReceipt(wsfeSoap('FECAESolicitar','<Errors><Err><Code>10000</Code><Msg>SYNTHETIC_PRIVATE</Msg></Err></Errors>'),frozen)).toEqual({estado:'SIN_CONFIRMACION',codigos:[10000],puedeReenviar:false})
})
it.each([
  ()=>wsfeReceipt('A',{Cuit:'30123456789'}),()=>wsfeReceipt('A',{PtoVta:'3'}),()=>wsfeReceipt('A',{CantReg:'2'}),
  ()=>wsfeReceipt('A',{FchProceso:'20260230120000'}),()=>wsfeReceipt().replace('<DocNro>0','<DocNro>1'),
  ()=>wsfeReceipt().replace('<CbteHasta>1','<CbteHasta>2'),()=>wsfeReceipt().replace('<CAE>11111111111111','<CAE>00000000000000'),
  ()=>wsfeReceipt().replace('<CAEFchVto>20261031','<CAEFchVto>20260230'),
  ()=>wsfeReceipt().replace('</FECAEDetResponse>','</FECAEDetResponse><FECAEDetResponse/>'),
])('respuesta de emisión incoherente %# no se acepta como aprobación',async make=>{
  await expect(decodeFiscalEmissionReceipt(make(),await freezeFiscalRequest(wsfeSample))).rejects.toThrow()
})
it('timeouts cubren fetch, cuerpo y permiso sin repetir ni filtrar',async()=>{
  vi.useFakeTimers();const frozen=await freezeFiscalRequest(wsfeSample)
  for(const phase of ['fetch','body','guard']){
    const fetcher=vi.fn<typeof fetch>(()=>phase==='body'?Promise.resolve(new Response(new ReadableStream({start(){}}),{headers:{'Content-Type':'text/xml'}})):new Promise(()=>{}))
    const guard=vi.fn<()=>Promise<void>>(phase==='guard'?()=>new Promise(()=>{}):async()=>{})
    const p=sendFiscalEmission(frozen,ticket(),fetcher,guard,100)
    const rejected=expect(p).rejects.toThrow('FISCAL_WSFE_NO_CONFIRMADO');await vi.waitFor(()=>expect(guard).toHaveBeenCalledOnce());await vi.advanceTimersByTimeAsync(100);await rejected
    expect(fetcher).toHaveBeenCalledTimes(phase==='guard'?0:1)
  }
})
