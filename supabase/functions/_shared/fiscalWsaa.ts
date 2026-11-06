import { parseFiscalXmlRoot, fiscalXmlChildren as children, fiscalXmlSchema as schema, fiscalXmlOne as one, withFiscalDeadline as deadline } from './fiscalVoucherXml.ts'
import type { Element as XmlElement } from '@xmldom/xmldom'
import { normalizeWsaaDn } from './fiscalWsaaDn.ts'
import { prepareWsaaRequest } from './fiscalWsaaCms.ts'
import type { PrivateFiscalSigner, PreparedWsaaRequest } from './fiscalWsaaCms.ts'
import type { PrivateWsaaTicket, WsaaTicketEnvelope } from './fiscalTicketCache.ts'
import type { FiscalWorkerBinding } from './fiscalWorkerAuthorization.ts'

const SOAP='http://schemas.xmlsoap.org/soap/envelope/',WSAA='http://wsaa.view.sua.dvadac.desein.afip.gov'
const invalid=():never=>{throw new Error('FISCAL_WSAA_NO_CONFIRMADO')}
function scalar(parent:XmlElement,name:string,raw=false):string {
  const node=one(parent,name,true,'')!
  if(children(node).length)return invalid()
  const value=node.textContent??''
  return raw?value:value.trim()
}
function timestamp(value:string):number {
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if(!match)return invalid()
  const [,y,m,d,h,min,s,zone]=match,date=new Date(Date.UTC(+y,+m-1,+d))
  if(+y<2000||date.getUTCFullYear()!==+y||date.getUTCMonth()!==+m-1||date.getUTCDate()!==+d||+h>23||+min>59||+s>59)return invalid()
  if(zone!=='Z'&&(Number(zone.slice(1,3))>14||Number(zone.slice(4))>59||(Number(zone.slice(1,3))===14&&zone.slice(4)!=='00')))return invalid()
  const result=Date.parse(value)
  if(!Number.isSafeInteger(result))return invalid()
  return result
}
/** Interpreta sólo SOAP/TA recibido por transporte privado autenticado por TLS.
 * El documento no está firmado por esta función; la confianza depende de ese canal. */
export function decodeWsaaTicket(xml:string,expected:Pick<PreparedWsaaRequest,'uniqueId'|'destination'>,now=Date.now()):PrivateWsaaTicket {
  try {
    if(!Number.isSafeInteger(now)||!Number.isInteger(expected.uniqueId)||expected.uniqueId<1||expected.uniqueId>4294967295)return invalid()
    const root=parseFiscalXmlRoot(xml)
    if(root.localName!=='Envelope'||root.namespaceURI!==SOAP)return invalid()
    schema(root,['Header','Body'],SOAP)
    const body=one(root,'Body',true,SOAP)!
    schema(body,['loginCmsResponse'],WSAA)
    const response=one(body,'loginCmsResponse',true,WSAA)!,returns=children(response)
    if(returns.length!==1||returns[0].localName!=='loginCmsReturn'||![WSAA,''].includes(returns[0].namespaceURI??''))return invalid()
    schema(response,['loginCmsReturn'],returns[0].namespaceURI??'')
    if(children(returns[0]).length)return invalid()
    const ticket=parseFiscalXmlRoot(returns[0].textContent??'')
    if(ticket.localName!=='loginTicketResponse'||(ticket.namespaceURI??'')!==''||ticket.getAttribute('version')!=='1.0')return invalid()
    schema(ticket,['header','credentials'],'')
    const header=one(ticket,'header',true,'')!,credentials=one(ticket,'credentials',true,'')!
    schema(header,['source','destination','uniqueId','generationTime','expirationTime'],'')
    schema(credentials,['token','sign'],'')
    const uniqueId=scalar(header,'uniqueId')
    if(!/^\d{1,10}$/.test(uniqueId)||Number(uniqueId)!==expected.uniqueId
      ||normalizeWsaaDn(scalar(header,'destination'))!==expected.destination
      ||normalizeWsaaDn(scalar(header,'source'))!==normalizeWsaaDn('CN=wsaa,O=AFIP,C=AR,SERIALNUMBER=CUIT 33693450239'))return invalid()
    const generated=timestamp(scalar(header,'generationTime')),expiresAt=timestamp(scalar(header,'expirationTime'))
    if(generated>now+60000||generated<now-43260000||expiresAt<=now||expiresAt<=generated||expiresAt>now+43260000)return invalid()
    const token=scalar(credentials,'token',true),sign=scalar(credentials,'sign',true)
    for(const text of [token,sign])if(!text.length||text.length>262144||!/^[\x09\x0A\x0D\x20-\x7E]+$/.test(text))return invalid()
    return Object.freeze(Object.defineProperties({expiresAt},{token:{value:token,enumerable:false},sign:{value:sign,enumerable:false},
      toString:{value:()=> '[Ticket WSAA privado]',enumerable:false}})) as PrivateWsaaTicket
  }catch{return invalid()}
}
function base64(bytes:Uint8Array):string {
  if(bytes.length<1||bytes.length>65536)return invalid()
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte)
  return btoa(binary)
}
export async function loginFiscalWsaa(prepared:PreparedWsaaRequest,fetcher:typeof fetch,parent:AbortSignal,timeoutMs=15000):Promise<PrivateWsaaTicket> {
  const controller=new AbortController(),abort=()=>controller.abort()
  let timer:ReturnType<typeof setTimeout>|undefined,response:Response|undefined
  try {
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>40000||parent.aborted)return invalid()
    parent.addEventListener('abort',abort,{once:true});timer=setTimeout(abort,timeoutMs)
    const cms=base64(prepared.cmsDer)
    const request=new Request('https://wsaahomo.afip.gov.ar/ws/services/LoginCms',{method:'POST',redirect:'error',signal:controller.signal,
      headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:'""'},
      body:`<s:Envelope xmlns:s="${SOAP}"><s:Body><w:loginCms xmlns:w="${WSAA}"><in0>${cms}</in0></w:loginCms></s:Body></s:Envelope>`})
    response=await deadline(fetcher(request),controller.signal)
    if(response.status!==200||response.redirected||!/^(text\/xml|application\/soap\+xml)(?:;|$)/i.test(response.headers.get('content-type')??''))return invalid()
    const reader=response.body?.getReader();if(!reader)return invalid()
    const chunks:Uint8Array[]=[];let length=0
    try {
      while(true){const chunk=await deadline(reader.read(),controller.signal);if(chunk.done)break
        length+=chunk.value.length;if(length>1048576)return invalid();chunks.push(chunk.value)}
    }finally{void reader.cancel().catch(()=>{});reader.releaseLock()}
    const bytes=new Uint8Array(length);let offset=0
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    return decodeWsaaTicket(new TextDecoder('utf-8',{fatal:true}).decode(bytes),prepared)
  }catch{return invalid()}finally{
    if(timer)clearTimeout(timer);controller.abort();parent.removeEventListener('abort',abort)
    if(response?.body&&!response.body.locked)void response.body.cancel().catch(()=>{})
  }
}
export type PrivateFiscalCustody=(binding:Readonly<FiscalWorkerBinding>,signal:AbortSignal)=>Promise<PrivateFiscalSigner>
export type GuardedWsaaTicketLoader=(binding:Readonly<FiscalWorkerBinding>,signal:AbortSignal,beforeSend:()=>Promise<void>)=>Promise<WsaaTicketEnvelope>
/** Integrar sólo después del gate Auth y del permiso único de renovación TA.
 * No lee filesystem/.env y no tiene fallback de certificado ni de entorno. */
export function createWsaaTicketSource(custody:PrivateFiscalCustody,fetcher:typeof fetch):GuardedWsaaTicketLoader {
  return async(binding,signal,beforeSend)=>{
    try {
      if(signal.aborted||binding.entorno!=='HOMOLOGACION'||binding.servicio!=='wsfe')return invalid()
      const material=await deadline(custody(binding,signal),signal)
      const prepared=await deadline(prepareWsaaRequest(material,{credentialId:binding.credencial_id,certificateSha256:binding.certificado_sha256}),signal)
      // La autorización durable se obtiene después de preparar/firma y antes
      // de cualquier transporte. Un ACK perdido nunca concede otro envío.
      await beforeSend()
      if(signal.aborted)return invalid()
      const ticket=await loginFiscalWsaa(prepared,fetcher,signal)
      return Object.freeze(Object.defineProperties({entorno:'HOMOLOGACION',servicio:'wsfe',cuitEmisor:binding.cuit_emisor,
        credencialId:binding.credencial_id,certificadoSha256:binding.certificado_sha256,expiresAt:ticket.expiresAt},{
        token:{value:ticket.token,enumerable:false},sign:{value:ticket.sign,enumerable:false}})) as WsaaTicketEnvelope
    }catch{return invalid()}
  }
}
