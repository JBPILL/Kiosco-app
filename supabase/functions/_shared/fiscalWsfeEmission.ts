import type { Element as XmlElement } from '@xmldom/xmldom'
import { normalizeFiscalSeries, verifyFiscalRequest, escapeFiscalXml, buildFiscalAuthXml } from './fiscalReconciliation.ts'
import type { FiscalSeries, FrozenFiscalRequest } from './fiscalReconciliation.ts'
import { verifyFiscalEmissionRequest } from './fiscalEmissionContract.ts'
export { verifyFiscalEmissionRequest } from './fiscalEmissionContract.ts'
import type { PrivateWsaaTicket } from './fiscalTicketCache.ts'
import type { FiscalEmissionReceipt } from './fiscalEmissionReceipt.ts'
export type { FiscalEmissionReceipt } from './fiscalEmissionReceipt.ts'
import { parseFiscalXmlRoot, fiscalXmlSchema as schema, fiscalXmlOne as one, fiscalXmlChildren as children, withFiscalDeadline as deadline } from './fiscalVoucherXml.ts'

const SOAP='http://schemas.xmlsoap.org/soap/envelope/',WSFE='http://ar.gov.afip.dif.FEV1/',URL='https://wswhomo.afip.gov.ar/wsfev1/service.asmx'
const fail=():never=>{throw new Error('FISCAL_WSFE_NO_CONFIRMADO')}
function series(input:unknown):Readonly<FiscalSeries> {const value=normalizeFiscalSeries(input);if(value.puntoVenta>99998)return fail();return value}
function field(parent:XmlElement,name:string,required=true):string {
  const child=one(parent,name,required);if(!child)return ''
  if(children(child).length)return fail()
  return child.textContent?.trim()??''
}
function integer(parent:XmlElement,name:string,max=99999999):number {
  const text=field(parent,name);if(!/^(0|[1-9]\d{0,10})$/.test(text)||!Number.isSafeInteger(Number(text))||Number(text)>max)return fail();return Number(text)
}
function codes(parent:XmlElement,name:string,item:string):number[] {
  const list=one(parent,name,false);if(!list)return []
  const nodes=children(list);if(nodes.length>100||list.textContent&&nodes.length===0&&list.textContent.trim())return fail()
  for(let i=0;i<list.childNodes.length;i++){const child=list.childNodes.item(i);if(child&&[3,4].includes(child.nodeType)&&child.textContent?.trim())return fail()}
  return nodes.map(node=>{
    if(node.namespaceURI!==WSFE||node.localName!==item)return fail()
    schema(node,['Code','Msg']);const code=integer(node,'Code',2147483647)
    if(code<1||field(node,'Msg').length>4096)return fail()
    return code
  })
}
function result(xml:string,action:string):XmlElement {
  const root=parseFiscalXmlRoot(xml)
  if(root.namespaceURI!==SOAP||root.localName!=='Envelope')return fail()
  schema(root,['Header','Body'],SOAP);const body=one(root,'Body',true,SOAP)!
  schema(body,[action+'Response']);const response=one(body,action+'Response')!
  schema(response,[action+'Result']);return one(response,action+'Result')!
}
function request(action:'FECompUltimoAutorizado'|'FECAESolicitar',payload:string):Request {
  return new Request(URL,{method:'POST',redirect:'error',headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:'"'+WSFE+action+'"'},
    body:`<s:Envelope xmlns:s="${SOAP}"><s:Body><${action} xmlns="${WSFE}">${payload}</${action}></s:Body></s:Envelope>`})
}
async function post(req:Request,fetcher:typeof fetch,timeoutMs:number,expiresAt:number,beforeSend?:()=>Promise<void>):Promise<string> {
  const controller=new AbortController();let response:Response|undefined
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>40000)return fail()
  const timer=setTimeout(()=>controller.abort(),timeoutMs)
  try {
    if(req.url!==URL||req.method!=='POST'||req.redirect!=='error'
      ||![`"${WSFE}FECompUltimoAutorizado"`,`"${WSFE}FECAESolicitar"`].includes(req.headers.get('SOAPAction')??''))return fail()
    if(beforeSend)await deadline(beforeSend(),controller.signal)
    if(controller.signal.aborted||expiresAt<=Date.now()+15000)return fail()
    response=await deadline(fetcher(new Request(req,{signal:controller.signal})),controller.signal)
    if(response.status!==200||response.redirected||!/^(text\/xml|application\/soap\+xml)(?:;|$)/i.test(response.headers.get('content-type')??''))return fail()
    const reader=response.body?.getReader();if(!reader)return fail()
    const parts:Uint8Array[]=[];let size=0
    try {while(true){const part=await deadline(reader.read(),controller.signal);if(part.done)break;size+=part.value.length;if(size>1048576)return fail();parts.push(part.value)}}
    finally{void reader.cancel().catch(()=>{});reader.releaseLock()}
    const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
    return new TextDecoder('utf-8',{fatal:true}).decode(bytes)
  }catch{return fail()}finally{clearTimeout(timer);controller.abort();if(response?.body&&!response.body.locked)void response.body.cancel().catch(()=>{})}
}
// Transporte privado compartido; no es una acción HTTP pública ni un permiso.
export { post as postPrivateFiscalWsfe }
export function decodeLastFiscalNumber(xml:string,expected:unknown):number {
  const s=series(expected),r=result(xml,'FECompUltimoAutorizado')
  schema(r,['PtoVta','CbteTipo','CbteNro','Errors','Events']);const errors=codes(r,'Errors','Err');codes(r,'Events','Evt')
  if(errors.length||integer(r,'PtoVta',99998)!==s.puntoVenta||integer(r,'CbteTipo',11)!==s.tipoComprobante)return fail()
  return integer(r,'CbteNro')
}
export async function consultLastFiscalNumber(expected:unknown,ticket:PrivateWsaaTicket,fetcher:typeof fetch,timeoutMs=15000,beforeSend?:()=>Promise<void>):Promise<{ultimo:number;consultado_en:string}> {
  const s=series(expected),req=request('FECompUltimoAutorizado',buildFiscalAuthXml(s,ticket)+`<PtoVta>${s.puntoVenta}</PtoVta><CbteTipo>${s.tipoComprobante}</CbteTipo>`)
  const xml=await post(req,fetcher,timeoutMs,ticket.expiresAt,beforeSend)
  return {ultimo:decodeLastFiscalNumber(xml,s),consultado_en:new Date().toISOString()}
}
export async function buildFiscalEmissionRequest(input:unknown,ticket:PrivateWsaaTicket):Promise<Request> {
  const frozen=await verifyFiscalEmissionRequest(input),s=frozen.solicitud
  const identity=series({entorno:s.entorno,cuitEmisor:s.cuitEmisor,puntoVenta:s.puntoVenta,tipoComprobante:s.tipoComprobante})
  const scalar=(name:string,value:string|number)=>`<${name}>${escapeFiscalXml(String(value))}</${name}>`
  const details=scalar('Concepto',s.concepto)+scalar('DocTipo',s.tipoDocumento)+scalar('DocNro',s.numeroDocumento)
    +scalar('CbteDesde',s.numero)+scalar('CbteHasta',s.numero)+scalar('CbteFch',s.fecha)
    +scalar('ImpTotal',s.importes.total)+scalar('ImpTotConc',s.importes.noGravado)+scalar('ImpNeto',s.importes.neto)
    +scalar('ImpOpEx',s.importes.exento)+scalar('ImpTrib',s.importes.tributos)+scalar('ImpIVA',s.importes.iva)
    +(s.servicioDesde?scalar('FchServDesde',s.servicioDesde)+scalar('FchServHasta',s.servicioHasta!)+scalar('FchVtoPago',s.vencimientoPago!):'')
    +scalar('MonId','PES')+scalar('MonCotiz','1')+scalar('CanMisMonExt','N')+scalar('CondicionIVAReceptorId',s.condicionIvaReceptor)
    +(s.tributos.length?'<Tributos>'+s.tributos.map(t=>'<Tributo>'+scalar('Id',t.id)+scalar('Desc',t.descripcion)+scalar('BaseImp',t.base)+scalar('Alic',t.alicuota)+scalar('Importe',t.importe)+'</Tributo>').join('')+'</Tributos>':'')
    +(s.iva.length?'<Iva>'+s.iva.map(t=>'<AlicIva>'+scalar('Id',t.id)+scalar('BaseImp',t.base)+scalar('Importe',t.importe)+'</AlicIva>').join('')+'</Iva>':'')
  const payload=buildFiscalAuthXml(identity,ticket)+`<FeCAEReq><FeCabReq><CantReg>1</CantReg><PtoVta>${s.puntoVenta}</PtoVta><CbteTipo>${s.tipoComprobante}</CbteTipo></FeCabReq><FeDetReq><FECAEDetRequest>${details}</FECAEDetRequest></FeDetReq></FeCAEReq>`
  return request('FECAESolicitar',payload)
}
/** El CAE de esta respuesta no basta para cerrar: conciliar el cuerpo completo
 * con FECompConsultar y guardar el resultado mediante CAS antes de confirmarlo. */
export async function decodeFiscalEmissionReceipt(xml:string,input:unknown):Promise<FiscalEmissionReceipt> {
  const {solicitud:s}=await verifyFiscalRequest(input),r=result(xml,'FECAESolicitar')
  schema(r,['FeCabResp','FeDetResp','Errors','Events']);const errors=codes(r,'Errors','Err');codes(r,'Events','Evt')
  const cab=one(r,'FeCabResp',false),det=one(r,'FeDetResp',false)
  if(!cab||!det)return {estado:'SIN_CONFIRMACION',codigos:errors,puedeReenviar:false}
  schema(cab,['Cuit','PtoVta','CbteTipo','FchProceso','CantReg','Resultado','Reproceso'])
  if(field(cab,'Cuit')!==s.cuitEmisor||integer(cab,'PtoVta',99998)!==s.puntoVenta||integer(cab,'CbteTipo',11)!==s.tipoComprobante||integer(cab,'CantReg',1)!==1)return fail()
  const processed=field(cab,'FchProceso');if(!/^\d{14}$/.test(processed))return fail()
  field(cab,'Reproceso',false)
  validDate(processed.slice(0,8));if(Number(processed.slice(8,10))>23||Number(processed.slice(10,12))>59||Number(processed.slice(12,14))>59)return fail()
  schema(det,['FECAEDetResponse']);const d=one(det,'FECAEDetResponse')!
  schema(d,['Concepto','DocTipo','DocNro','CbteDesde','CbteHasta','CbteFch','Resultado','Observaciones','CAE','CAEFchVto'])
  if(integer(d,'Concepto',3)!==s.concepto||integer(d,'DocTipo',99)!==s.tipoDocumento||field(d,'DocNro')!==s.numeroDocumento
    ||integer(d,'CbteDesde')!==s.numero||integer(d,'CbteHasta')!==s.numero||field(d,'CbteFch')!==s.fecha)return fail()
  const all=[...errors,...codes(d,'Observaciones','Obs')],header=field(cab,'Resultado'),detail=field(d,'Resultado')
  if(header==='A'&&detail==='A'&&!errors.length){
    const cae=field(d,'CAE'),expires=field(d,'CAEFchVto');validDate(expires)
    if(!/^[0-9]{14}$/.test(cae)||/^0+$/.test(cae)||expires<s.fecha)return fail()
    return {estado:'APROBACION_RECIBIDA',codigos:all,puedeReenviar:false}
  }
  if(header==='R'&&detail==='R'&&!field(d,'CAE',false)&&!field(d,'CAEFchVto',false))return {estado:'RECHAZO_RECIBIDO',codigos:all,puedeReenviar:false}
  return {estado:'SIN_CONFIRMACION',codigos:all,puedeReenviar:false}
}
function validDate(value:string):void {
  if(!/^\d{8}$/.test(value))return fail()
  const d=new Date(value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8)+'T00:00:00Z')
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10).replace(/-/g,'')!==value)return fail()
}
export async function sendFiscalEmission(expected:FrozenFiscalRequest,ticket:PrivateWsaaTicket,fetcher:typeof fetch,beforeSend:()=>Promise<void>,timeoutMs=15000):Promise<FiscalEmissionReceipt> {
  if(typeof beforeSend!=='function')return fail()
  const frozen=await verifyFiscalRequest(expected),req=await buildFiscalEmissionRequest(frozen,ticket)
  const xml=await post(req,fetcher,timeoutMs,ticket.expiresAt,beforeSend)
  return decodeFiscalEmissionReceipt(xml,frozen)
}
