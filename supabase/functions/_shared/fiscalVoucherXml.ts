import { DOMParser } from '@xmldom/xmldom'
import type { Element as XmlElement, Node as XmlNode } from '@xmldom/xmldom'
import { buildFiscalVoucherQuery, reconcileFiscalVoucher, verifyFiscalRequest } from './fiscalReconciliation.ts'
import type { FiscalIdentity, FiscalReconciliation, FrozenFiscalRequest } from './fiscalReconciliation.ts'

const SOAP='http://schemas.xmlsoap.org/soap/envelope/'
const WSFE='http://ar.gov.afip.dif.FEV1/'
const XSI='http://www.w3.org/2001/XMLSchema-instance'
const MAX_BYTES=1048576
function invalid(): never { throw new Error('FISCAL_XML_INVALIDO') }
function children(node: XmlNode): XmlElement[] {
  const result: XmlElement[]=[]
  for (let i=0;i<node.childNodes.length;i++) {
    const child=node.childNodes.item(i)
    if(child?.nodeType===1)result.push(child as XmlElement)
    else if(child && ![3,4,7,8].includes(child.nodeType))return invalid()
  }
  return result
}
function whitespace(node: XmlElement): void {
  for(let i=0;i<node.childNodes.length;i++) {
    const child=node.childNodes.item(i)
    if(child && [3,4].includes(child.nodeType) && child.textContent?.trim())return invalid()
  }
}
function schema(node: XmlElement, allowed: readonly string[], namespace=WSFE): void {
  const seen=new Set<string>()
  for (const child of children(node)) {
    const name=child.localName
    if(!name || (child.namespaceURI??'')!==namespace || !allowed.includes(name) || seen.has(name))return invalid()
    seen.add(name)
  }
  whitespace(node)
}
function one(node: XmlElement, name: string, required=true, namespace=WSFE): XmlElement | null {
  const matches=children(node).filter(c=>(c.namespaceURI??'')===namespace && c.localName===name)
  if(matches.length>1 || (required && matches.length!==1))return invalid()
  return matches[0]??null
}
function text(node: XmlElement,name: string,required=true): string {
  const element=one(node,name,required)
  if(!element)return ''
  if(children(element).length)return invalid()
  return element.textContent?.trim()??''
}
function number(node: XmlElement,name: string): number {
  const value=text(node,name)
  if(!/^[0-9]{1,10}$/.test(value))return invalid()
  const n=Number(value)
  if(!Number.isSafeInteger(n) || n>2147483647)return invalid()
  return n
}
function list(node: XmlElement,name: string,item: string,fields: readonly string[]): XmlElement[] {
  const parent=one(node,name,false)
  if(!parent)return []
  whitespace(parent)
  const nodes=children(parent)
  if(nodes.length>100)return invalid()
  for(const child of nodes) {
    if(child.namespaceURI!==WSFE || child.localName!==item)return invalid()
    schema(child,fields)
  }
  return nodes
}
export function parseFiscalXmlRoot(xml: string): XmlElement {
  if(typeof xml!=='string' || new TextEncoder().encode(xml).length>MAX_BYTES
    || /<!\s*(?:DOCTYPE|ENTITY)/i.test(xml) || (xml.match(/</g)?.length??0)>5000)return invalid()
  try {
    const doc=new DOMParser({onError:()=>invalid()}).parseFromString(xml,'text/xml')
    const root=doc.documentElement
    if(!root)return invalid()
    const pending:[XmlNode,number][]=[[doc,0]]
    let count=0
    while(pending.length) {
      const [node,depth]=pending.pop()!
      if(depth>32 || ++count>10000 || [5,6,10,12].includes(node.nodeType))return invalid()
      if(node.nodeType===1) {
        const element=node as XmlElement,nil=element.getAttributeNS(XSI,'nil')
        if(nil!==null && nil!=='' && !['true','false','1','0'].includes(nil))return invalid()
        if((nil==='true'||nil==='1') && (children(element).length || element.textContent?.trim()))return invalid()
      }
      for(let i=0;i<node.childNodes.length;i++) {
        const child=node.childNodes.item(i)
        if(child)pending.push([child,depth+1])
      }
    }
    return root
  }catch{return invalid()}
}
/** Sólo interpretar una respuesta del transporte privado y de esta consulta exacta.
 * Campos no soportados se rechazan: nunca descartar datos fiscales silenciosamente. */
export function decodeFiscalVoucherXml(xml: string,consulta: FiscalIdentity): unknown {
  const root=parseFiscalXmlRoot(xml)
  if(root.namespaceURI!==SOAP||root.localName!=='Envelope')return invalid()
  schema(root,['Header','Body'],SOAP)
  const body=one(root,'Body',true,SOAP)!
  schema(body,['FECompConsultarResponse'])
  const response=one(body,'FECompConsultarResponse')!
  schema(response,['FECompConsultarResult'])
  const result=one(response,'FECompConsultarResult')!
  schema(result,['ResultGet','Errors','Events'])
  const errors=list(result,'Errors','Err',['Code','Msg']).map(e=>({codigo:number(e,'Code')}))
  list(result,'Events','Evt',['Code','Msg']).forEach(e=>number(e,'Code'))
  const voucher=one(result,'ResultGet',false)
  if(errors.length || !voucher || ['true','1'].includes(voucher.getAttributeNS(XSI,'nil')??'')) {
    return {consulta,comprobante:null,autorizacion:null,errores:errors}
  }
  schema(voucher,['Concepto','DocTipo','DocNro','CbteDesde','CbteHasta','CbteFch','ImpTotal','ImpTotConc',
    'ImpNeto','ImpOpEx','ImpTrib','ImpIVA','FchServDesde','FchServHasta','FchVtoPago','MonId','MonCotiz',
    'CanMisMonExt','CondicionIVAReceptorId','Iva','Tributos','Resultado','CodAutorizacion','EmisionTipo',
    'FchVto','FchProceso','Observaciones','PtoVta','CbteTipo'])
  const desde=number(voucher,'CbteDesde')
  if(desde!==number(voucher,'CbteHasta'))return invalid()
  const doc=text(voucher,'DocNro')
  if(!/^[0-9]{1,11}$/.test(doc))return invalid()
  const cotizacion=text(voucher,'MonCotiz'),misma=text(voucher,'CanMisMonExt',false)
  if(misma!==''&&misma!=='N')return invalid()
  list(voucher,'Observaciones','Obs',['Code','Msg']).forEach(e=>number(e,'Code'))
  return {consulta,errores:errors,comprobante:{version:1,entorno:consulta.entorno,cuitEmisor:consulta.cuitEmisor,
    puntoVenta:number(voucher,'PtoVta'),tipoComprobante:number(voucher,'CbteTipo'),numero:desde,
    concepto:number(voucher,'Concepto'),tipoDocumento:number(voucher,'DocTipo'),numeroDocumento:BigInt(doc).toString(),
    condicionIvaReceptor:number(voucher,'CondicionIVAReceptorId'),fecha:text(voucher,'CbteFch'),
    servicioDesde:text(voucher,'FchServDesde',false)||null,servicioHasta:text(voucher,'FchServHasta',false)||null,
    vencimientoPago:text(voucher,'FchVtoPago',false)||null,moneda:text(voucher,'MonId'),cotizacion:/^0*1(?:\.0+)?$/.test(cotizacion)?'1':cotizacion,
    importes:{total:text(voucher,'ImpTotal'),neto:text(voucher,'ImpNeto'),iva:text(voucher,'ImpIVA'),
      noGravado:text(voucher,'ImpTotConc'),exento:text(voucher,'ImpOpEx'),tributos:text(voucher,'ImpTrib')},
    iva:list(voucher,'Iva','AlicIva',['Id','BaseImp','Importe']).map(e=>({id:number(e,'Id'),base:text(e,'BaseImp'),importe:text(e,'Importe')})),
    tributos:list(voucher,'Tributos','Tributo',['Id','Desc','BaseImp','Alic','Importe']).map(e=>({id:number(e,'Id'),
      descripcion:text(e,'Desc'),base:text(e,'BaseImp'),alicuota:text(e,'Alic'),importe:text(e,'Importe')}))},
  autorizacion:{resultado:text(voucher,'Resultado'),tipo:text(voucher,'EmisionTipo'),cae:text(voucher,'CodAutorizacion'),
    vencimiento:text(voucher,'FchVto'),procesadoEn:text(voucher,'FchProceso',false)||null}}
}
function deadline<T>(promise: Promise<T>,signal: AbortSignal): Promise<T> {
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(new Error('FISCAL_CONSULTA_TIMEOUT'))
    if(signal.aborted){abort();return}
    signal.addEventListener('abort',abort,{once:true})
    promise.then(value=>{signal.removeEventListener('abort',abort);resolve(value)},
      error=>{signal.removeEventListener('abort',abort);reject(error)})
  })
}
export { children as fiscalXmlChildren, schema as fiscalXmlSchema, one as fiscalXmlOne, deadline as withFiscalDeadline }
class FiscalVoucherTransportUnconfirmed extends Error {}
/** Transporte común acotado: destino/consulta se construyen desde el cuerpo
 * verificado; ninguna respuesta cruda ni credencial sale de este módulo. */
async function fetchFiscalVoucherXml(expected:FrozenFiscalRequest,ticket:{token:string;sign:string;expiresAt:number},fetcher:typeof fetch,timeoutMs:number,beforeSend?:()=>Promise<void>):Promise<{xml:string;frozen:FrozenFiscalRequest}> {
  const controller=new AbortController();let response:Response|undefined
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>40000)return invalid()
  const timer=setTimeout(()=>controller.abort(),timeoutMs)
  try {
    const frozen=await deadline(verifyFiscalRequest(expected),controller.signal)
    const request=await deadline(buildFiscalVoucherQuery(frozen,ticket),controller.signal)
    if(beforeSend)await deadline(beforeSend(),controller.signal)
    if(controller.signal.aborted||ticket.expiresAt<=Date.now()+15000)return invalid()
    response=await deadline(fetcher(new Request(request,{signal:controller.signal})),controller.signal)
    if(response.status!==200||response.redirected||!/^(text\/xml|application\/soap\+xml)(?:;|$)/i.test(response.headers.get('content-type')??''))throw new FiscalVoucherTransportUnconfirmed()
    const reader=response.body?.getReader();if(!reader)return invalid()
    const chunks:Uint8Array[]=[];let length=0
    try {
      while(true){const part=await deadline(reader.read(),controller.signal);if(part.done)break
        length+=part.value.byteLength;if(length>MAX_BYTES)return invalid();chunks.push(part.value)}
    }finally{void reader.cancel().catch(()=>{});reader.releaseLock()}
    const bytes=new Uint8Array(length);let offset=0
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    return {xml:new TextDecoder('utf-8',{fatal:true}).decode(bytes),frozen}
  }finally{clearTimeout(timer);controller.abort();if(response?.body&&!response.body.locked)void response.body.cancel().catch(()=>{})}
}
export interface FiscalVoucherAbsence {
  estado:'NO_ENCONTRADO';codigo:602;consulta:Readonly<FiscalIdentity>
}
/** Únicamente 602 de FECompConsultar, sin comprobante contradictorio. No basta
 * para reenviar: requiere rechazo recibido y prueba de numeración, en otro gate. */
export function decodeFiscalVoucherAbsenceXml(xml:string,consulta:FiscalIdentity):Readonly<FiscalVoucherAbsence> {
  if(!consulta||Object.keys(consulta).length!==5||consulta.entorno!=='HOMOLOGACION'||!/^\d{11}$/.test(consulta.cuitEmisor)
    ||!Number.isSafeInteger(consulta.puntoVenta)||consulta.puntoVenta<1||consulta.puntoVenta>99998
    ||![1,6,11].includes(consulta.tipoComprobante)||!Number.isSafeInteger(consulta.numero)||consulta.numero<1||consulta.numero>99999999)return invalid()
  const root=parseFiscalXmlRoot(xml)
  if(root.namespaceURI!==SOAP||root.localName!=='Envelope')return invalid()
  schema(root,['Header','Body'],SOAP);const body=one(root,'Body',true,SOAP)!
  schema(body,['FECompConsultarResponse']);const response=one(body,'FECompConsultarResponse')!
  schema(response,['FECompConsultarResult']);const result=one(response,'FECompConsultarResult')!
  schema(result,['ResultGet','Errors','Events'])
  const records=one(result,'ResultGet',false)
  if(records){
    if(!['true','1'].includes(records.getAttributeNS(XSI,'nil')??'')||children(records).length||records.textContent?.trim())return invalid()
    for(let i=0;i<records.attributes.length;i++){const a=records.attributes.item(i)!
      if(a.namespaceURI!=='http://www.w3.org/2000/xmlns/'&&!(a.namespaceURI===XSI&&a.localName==='nil'))return invalid()}
  }
  const errors=list(result,'Errors','Err',['Code','Msg'])
  if(errors.length!==1||number(errors[0],'Code')!==602||!text(errors[0],'Msg')||text(errors[0],'Msg').length>4096)return invalid()
  for(const event of list(result,'Events','Evt',['Code','Msg'])){if(number(event,'Code')<1||text(event,'Msg').length>4096)return invalid()}
  return Object.freeze({estado:'NO_ENCONTRADO',codigo:602,consulta:Object.freeze({...consulta})})
}
/** Fallos de red/XML nunca producen una prueba negativa ni habilitan corrección. */
export async function consultFiscalVoucherAbsence(expected:FrozenFiscalRequest,ticket:{token:string;sign:string;expiresAt:number},fetcher:typeof fetch,timeoutMs=15000,beforeSend?:()=>Promise<void>):Promise<Readonly<FiscalVoucherAbsence>&{consultado_en:string}> {
  const {xml,frozen}=await fetchFiscalVoucherXml(expected,ticket,fetcher,timeoutMs,beforeSend),s=frozen.solicitud
  return Object.freeze({...decodeFiscalVoucherAbsenceXml(xml,{entorno:s.entorno,cuitEmisor:s.cuitEmisor,puntoVenta:s.puntoVenta,tipoComprobante:s.tipoComprobante,numero:s.numero}),consultado_en:new Date().toISOString()})
}
/** Nunca emisión/reenvío/DB: la autorización exige comparar y persistir el cuerpo. */
export async function consultFiscalVoucher(expected:FrozenFiscalRequest,ticket:{token:string;sign:string;expiresAt:number},fetcher:typeof fetch,timeoutMs=15000,beforeSend?:()=>Promise<void>):Promise<FiscalReconciliation> {
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>40000)return {estado:'CONCILIAR',codigo:'SIN_CONFIRMACION',puedeReenviar:false}
  try {
    const {xml,frozen}=await fetchFiscalVoucherXml(expected,ticket,fetcher,timeoutMs,beforeSend),s=frozen.solicitud
    return await reconcileFiscalVoucher(decodeFiscalVoucherXml(xml,{entorno:s.entorno,cuitEmisor:s.cuitEmisor,puntoVenta:s.puntoVenta,tipoComprobante:s.tipoComprobante,numero:s.numero}),frozen)
  }catch(error){return {estado:'CONCILIAR',codigo:error instanceof FiscalVoucherTransportUnconfirmed?'SIN_CONFIRMACION':'RESPUESTA_INVALIDA',puedeReenviar:false}}
}
