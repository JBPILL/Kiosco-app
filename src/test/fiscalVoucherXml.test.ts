// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { consultFiscalVoucher, decodeFiscalVoucherXml } from '../../supabase/functions/_shared/fiscalVoucherXml'
import { freezeFiscalRequest, reconcileFiscalVoucher } from '../../supabase/functions/_shared/fiscalReconciliation'
import type { FiscalIdentity, FiscalRequestData } from '../../supabase/functions/_shared/fiscalReconciliation'

const sample: FiscalRequestData = {version:1,entorno:'HOMOLOGACION',cuitEmisor:'20123456786',puntoVenta:2,tipoComprobante:11,numero:42,
  concepto:1,tipoDocumento:99,numeroDocumento:'0',condicionIvaReceptor:5,fecha:'20261020',servicioDesde:null,servicioHasta:null,
  vencimientoPago:null,moneda:'PES',cotizacion:'1',importes:{total:'123.45',neto:'123.45',iva:'0',noGravado:'0',exento:'0',tributos:'0'},iva:[],tributos:[]}
const key: FiscalIdentity={entorno:sample.entorno,cuitEmisor:sample.cuitEmisor,puntoVenta:sample.puntoVenta,tipoComprobante:sample.tipoComprobante,numero:sample.numero}
const ticket=()=>({token:'SYNTHETIC_TOKEN',sign:'SYNTHETIC_SIGN',expiresAt:Date.now()+120000})
const response=(body: BodyInit|null,status=200)=>new Response(body,{status,headers:{'Content-Type':'text/xml; charset=utf-8'}})
const prefix='<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECompConsultarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompConsultarResult>'
const suffix='</FECompConsultarResult></FECompConsultarResponse></s:Body></s:Envelope>'
const detail=`<Concepto>1</Concepto><DocTipo>99</DocTipo><DocNro>0</DocNro><CbteDesde>42</CbteDesde><CbteHasta>42</CbteHasta><CbteFch>20261020</CbteFch>
  <ImpTotal>123.4500</ImpTotal><ImpTotConc>0</ImpTotConc><ImpNeto>123.45</ImpNeto><ImpOpEx>0</ImpOpEx><ImpTrib>0</ImpTrib><ImpIVA>0</ImpIVA>
  <FchServDesde/><FchServHasta/><FchVtoPago/><MonId>PES</MonId><MonCotiz>1.000000</MonCotiz><CanMisMonExt>N</CanMisMonExt><CondicionIVAReceptorId>5</CondicionIVAReceptorId>
  <Resultado>A</Resultado><CodAutorizacion>11111111111111</CodAutorizacion><EmisionTipo>CAE</EmisionTipo><FchVto>20261030</FchVto><FchProceso>20261020123456</FchProceso><PtoVta>2</PtoVta><CbteTipo>11</CbteTipo>`
const xml=()=>prefix+'<ResultGet>'+detail+'</ResultGet>'+suffix
async function decide(body: string) {return reconcileFiscalVoucher(decodeFiscalVoucherXml(body,key),await freezeFiscalRequest(sample))}
afterEach(()=>vi.restoreAllMocks())
it('decodifica sólo el cuerpo directo y compara el contrato heredado completo',async()=>{
  expect((await decide('<?xml version="1.0" encoding="utf-8"?>'+xml())).estado).toBe('AUTORIZACION_COINCIDENTE')
})
it('acepta prefijos equivalentes, cabecera informativa y comentarios inocuos',async()=>{
  const body=xml().replace('<s:Body>','<s:Header><FEHeaderInfo xmlns="http://ar.gov.afip.dif.FEV1/"><ambiente>Homologacion</ambiente></FEHeaderInfo></s:Header><s:Body><!--dato-->')
  expect((await decide(body.replace(/<(\/?)s:/g,'<$1soap:').replace('xmlns:s=','xmlns:soap='))).estado).toBe('AUTORIZACION_COINCIDENTE')
})
it.each([
  ()=>xml().replace('<ImpTotal>123.4500</ImpTotal>','<ImpTotal>123.45</ImpTotal><ImpTotal>123.45</ImpTotal>'),
  ()=>xml().replace('<s:Body>','<s:Body/><s:Body>'),
  ()=>xml().replace('http://ar.gov.afip.dif.FEV1/','https://unexpected.test/'),
  ()=>xml().replace('<ResultGet>','<ResultGet xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">'),
  ()=>xml().replace('<ImpTotal>123.4500</ImpTotal>','<ImpTotal><otro>123.45</otro></ImpTotal>'),
  ()=>xml().replace('<CbteTipo>11</CbteTipo>','<CbteTipo>11</CbteTipo><Opcionales/>'),
  ()=>xml().replace('<DocNro>0</DocNro>','<DocNro>not-a-number</DocNro>'),
  ()=>xml().replace('<CbteHasta>42</CbteHasta>','<CbteHasta>43</CbteHasta>'),
  ()=>xml().replace('</ResultGet>','</ResultGet><ResultGet/>'),
  ()=>xml().replace('<MonId>PES</MonId>','<MonId>PES</MonId><Iva>mixed-text</Iva>'),
  ()=>'<outer>'+xml()+'</outer>',
  ()=>xml().slice(0,-20),
  ()=>'<!DOCTYPE a [<!ENTITY x SYSTEM "file:///SYNTHETIC_PRIVATE">]>'+xml(),
  ()=>'<!DOCTYPE a [<!ENTITY x "EXPANSION">]>'+xml(),
  ()=>'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultstring>SYNTHETIC_SECRET</faultstring></s:Fault></s:Body></s:Envelope>',
])('rechaza XML ambiguo, externo o no soportado %#',make=>{
  expect(()=>decodeFiscalVoucherXml(make(),key)).toThrow('FISCAL_XML_INVALIDO')
})
it('rechaza tamaño y profundidad excesivos antes de aceptar datos',()=>{
  expect(()=>decodeFiscalVoucherXml('x'.repeat(1048577),key)).toThrow('FISCAL_XML_INVALIDO')
  const body=xml().replace('<s:Body>', '<s:Header>'+'<a>'.repeat(40)+'x'+'</a>'.repeat(40)+'</s:Header><s:Body>')
  expect(()=>decodeFiscalVoucherXml(body,key)).toThrow('FISCAL_XML_INVALIDO')
})
it('un dato escondido en cabecera no reemplaza el dato real del cuerpo',async()=>{
  const body=xml().replace('<s:Body>','<s:Header><ImpTotal xmlns="http://ar.gov.afip.dif.FEV1/">123.45</ImpTotal></s:Header><s:Body>')
    .replace('<ImpTotal>123.4500</ImpTotal>','<ImpTotal>999</ImpTotal>')
  expect((await decide(body)).estado).toBe('CONCILIAR')
})
it('no registra autorización si no hay resultado o hay errores, sin filtrar Msg',async()=>{
  const body=prefix+'<Errors><Err><Code>602</Code><Msg>SYNTHETIC_SECRET</Msg></Err></Errors>'+suffix
  const result=await decide(body)
  expect(result).toMatchObject({estado:'CONCILIAR',codigo:'SIN_CONFIRMACION',puedeReenviar:false})
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC_SECRET')
})
it('compara IVA y tributos extraídos de XML en factura B',async()=>{
  const req=structuredClone(sample);req.tipoComprobante=6
  req.importes={total:'122',neto:'100',iva:'21',tributos:'1',exento:'0',noGravado:'0'}
  req.iva=[{id:5,base:'100',importe:'21'}];req.tributos=[{id:99,descripcion:'Ensayo & prueba',base:'100',alicuota:'1',importe:'1'}]
  const d=detail.replace('<CbteTipo>11</CbteTipo>','<CbteTipo>6</CbteTipo>').replace('<ImpTotal>123.4500</ImpTotal>','<ImpTotal>122</ImpTotal>')
    .replace('<ImpNeto>123.45</ImpNeto>','<ImpNeto>100</ImpNeto>').replace('<ImpIVA>0</ImpIVA>','<ImpIVA>21</ImpIVA>').replace('<ImpTrib>0</ImpTrib>','<ImpTrib>1</ImpTrib>')
  const arrays='<Iva><AlicIva><Id>5</Id><BaseImp>100</BaseImp><Importe>21</Importe></AlicIva></Iva><Tributos><Tributo><Id>99</Id><Desc>Ensayo &amp; prueba</Desc><BaseImp>100</BaseImp><Alic>1</Alic><Importe>1</Importe></Tributo></Tributos>'
  const body=prefix+'<ResultGet>'+d+arrays+'</ResultGet>'+suffix
  const result=await reconcileFiscalVoucher(decodeFiscalVoucherXml(body,{...key,tipoComprobante:6}),await freezeFiscalRequest(req))
  expect(result.estado).toBe('AUTORIZACION_COINCIDENTE')
})
it('transporte hace una sola consulta y no emite ni toca DB',async()=>{
  const fetcher=vi.fn<typeof fetch>(async input=>{
    expect(input).toBeInstanceOf(Request)
    const request=input as Request
    expect(request.url).toBe('https://wswhomo.afip.gov.ar/wsfev1/service.asmx')
    expect(request.redirect).toBe('error')
    expect(await request.text()).not.toContain('FECAESolicitar')
    return response(xml())
  })
  expect((await consultFiscalVoucher(await freezeFiscalRequest(sample),ticket(),fetcher)).estado).toBe('AUTORIZACION_COINCIDENTE')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('captura snapshot antes de red aunque el llamador cambie su objeto al esperar',async()=>{
  const expected=structuredClone(await freezeFiscalRequest(sample))
  const fetcher=vi.fn<typeof fetch>(async()=>{
    expected.solicitud.importes.total='999';expected.solicitud.importes.neto='999'
    expected.sha256=(await freezeFiscalRequest(expected.solicitud)).sha256
    return response(xml())
  })
  expect((await consultFiscalVoucher(expected,ticket(),fetcher)).estado).toBe('AUTORIZACION_COINCIDENTE')
})
it.each([500,404,202])('HTTP %s no confirma autorización',async status=>{
  const fetcher=vi.fn<typeof fetch>(async()=>response('SYNTHETIC_SECRET',status))
  const result=await consultFiscalVoucher(await freezeFiscalRequest(sample),ticket(),fetcher)
  expect(result).toMatchObject({estado:'CONCILIAR',puedeReenviar:false})
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC_SECRET')
})
it('XML inválido no imprime respuesta ni excepción remota',async()=>{
  const error=vi.spyOn(console,'error').mockImplementation(()=>{})
  const fetcher=vi.fn<typeof fetch>(async()=>response(xml().replace('<ImpTotal>','<bad>')))
  expect((await consultFiscalVoucher(await freezeFiscalRequest(sample),ticket(),fetcher)).estado).toBe('CONCILIAR')
  expect(error).not.toHaveBeenCalled()
})
it('limita tamaño, UTF8 y tipo de contenido',async()=>{
  for(const r of [response('x'.repeat(1048577)),response(new Uint8Array([0xff,0xfe])),new Response(xml())]) {
    const fetcher=vi.fn<typeof fetch>(async()=>r)
    expect((await consultFiscalVoucher(await freezeFiscalRequest(sample),ticket(),fetcher)).estado).toBe('CONCILIAR')
  }
})
it('timeout incluye fetch que nunca contesta',async()=>{
  let signal: AbortSignal | undefined
  const fetcher=vi.fn<typeof fetch>(async input=>{signal=(input as Request).signal;return new Promise<Response>(()=>{})})
  expect((await consultFiscalVoucher(await freezeFiscalRequest(sample),ticket(),fetcher,30)).estado).toBe('CONCILIAR')
  expect(signal?.aborted).toBe(true)
})
it('timeout incluye cuerpo que queda detenido',async()=>{
  let cancelled=false
  const stream=new ReadableStream<Uint8Array>({cancel(){cancelled=true}})
  const fetcher=vi.fn<typeof fetch>(async()=>response(stream))
  expect((await consultFiscalVoucher(await freezeFiscalRequest(sample),ticket(),fetcher,30)).estado).toBe('CONCILIAR')
  expect(cancelled).toBe(true)
})
it('hash inválido no permite llamar a la red',async()=>{
  const expected={...await freezeFiscalRequest(sample),sha256:'0'.repeat(64)}
  const fetcher=vi.fn<typeof fetch>(async()=>response(xml()))
  expect((await consultFiscalVoucher(expected,ticket(),fetcher)).estado).toBe('CONCILIAR')
  expect(fetcher).not.toHaveBeenCalled()
})
