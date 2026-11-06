import type { FiscalRepresentation } from './fiscalRepresentation.ts'
import type { FiscalCreditDraft } from './fiscalCreditDraft.ts'
import type { FiscalCreditSendBinding } from './fiscalCreditSendSource.ts'
import { validateFiscalCreditSendSource } from './fiscalCreditSendSource.ts'
import { validateFiscalCreditIntentRecord } from './fiscalCreditConsultation.ts'
import type { WsaaTicketEnvelope } from './fiscalTicketCache.ts'
import type { FiscalEmissionReceipt } from './fiscalEmissionReceipt.ts'
import { validateFiscalEmissionReceipt } from './fiscalEmissionReceipt.ts'
import { buildFiscalAuthForCuit } from './fiscalReconciliation.ts'
import { buildPrivateFiscalDetailXml,decodePrivateFiscalEmissionReceipt,postPrivateFiscalCreditEmission } from './fiscalWsfeEmission.ts'
import { withFiscalDeadline } from './fiscalVoucherXml.ts'
export interface FiscalCreditEmissionInput {packet:unknown;source:Readonly<FiscalRepresentation>;draft:Readonly<FiscalCreditDraft>;actorAuthId:string}
export interface FiscalCreditEmissionDependencies {
 fetcher:typeof fetch;signal:AbortSignal;timeoutMs?:number
 /** Trabajador privado: consumir042 y devolver ACK original nuevo_envio=true.
  * No debe fabricar un ACK ni reconstruirlo desde GET. ACK incierto exige consulta. */
 consumeIntent:(binding:Readonly<FiscalCreditSendBinding>,signal:AbortSignal)=>Promise<unknown>
}
const fail=():never=>{throw new Error('FISCAL_ENVIO_NC_NO_CONFIRMADO')}
async function prepare(input:FiscalCreditEmissionInput,ticket:WsaaTicketEnvelope){
 const raw=structuredClone(input),ta={entorno:ticket.entorno,servicio:ticket.servicio,cuitEmisor:ticket.cuitEmisor,credencialId:ticket.credencialId,certificadoSha256:ticket.certificadoSha256,token:ticket.token,sign:ticket.sign,expiresAt:ticket.expiresAt}
 const validated=await validateFiscalCreditSendSource(raw.packet,raw.source,raw.draft,raw.actorAuthId),b=validated.binding,s=validated.cuerpo.datos.solicitud
 if(ta.entorno!==b.entorno||ta.servicio!==b.servicio||ta.cuitEmisor!==b.cuit_emisor||ta.credencialId!==b.credencial_id||ta.certificadoSha256!==b.certificado_sha256)return fail()
 const auth=buildFiscalAuthForCuit(b.cuit_emisor,ta),details=buildPrivateFiscalDetailXml(s)
 const req=new Request('https://wswhomo.afip.gov.ar/wsfev1/service.asmx',{method:'POST',redirect:'error',headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:'"http://ar.gov.afip.dif.FEV1/FECAESolicitar"'},body:`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECAESolicitar xmlns="http://ar.gov.afip.dif.FEV1/">${auth}<FeCAEReq><FeCabReq><CantReg>1</CantReg><PtoVta>${s.puntoVenta}</PtoVta><CbteTipo>${s.tipoComprobante}</CbteTipo></FeCabReq><FeDetReq><FECAEDetRequest>${details}</FECAEDetRequest></FeDetReq></FeCAEReq></FECAESolicitar></s:Body></s:Envelope>`})
 return{validated,req,expiresAt:ta.expiresAt}
}
/** Construye XML; no autoriza/consume intención ni ejecuta red. */
export async function buildFiscalCreditEmissionRequest(input:FiscalCreditEmissionInput,ticket:WsaaTicketEnvelope):Promise<Request>{
 try{return(await prepare(input,ticket)).req}catch{return fail()}
}
/** Un único envío privado. Sin persistencia/CAE comercial; reconciliar siempre.
 * Fuente043 antes del intento; consumeIntent debe ser el POST042 del worker. */
export async function sendFiscalCreditEmission(input:FiscalCreditEmissionInput,ticket:WsaaTicketEnvelope,deps:FiscalCreditEmissionDependencies):Promise<Readonly<FiscalEmissionReceipt>>{
 const controller=new AbortController();let parent:AbortSignal|undefined,timer:ReturnType<typeof setTimeout>|undefined
 const abort=()=>controller.abort()
 try{
  const {signal,fetcher,consumeIntent,timeoutMs=15000}=deps;parent=signal
  if(!signal||signal.aborted||typeof fetcher!=='function'||typeof consumeIntent!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>40000)return fail()
  signal.addEventListener('abort',abort,{once:true});timer=setTimeout(abort,timeoutMs)
  const prepared=await withFiscalDeadline(prepare(input,ticket),controller.signal),b=prepared.validated.binding
  const xml=await postPrivateFiscalCreditEmission(prepared.req,fetcher,timeoutMs,prepared.expiresAt,async()=>{
   if(controller.signal.aborted||prepared.expiresAt<=Date.now()+15000)return fail()
   const raw=await withFiscalDeadline(consumeIntent(b,controller.signal),controller.signal)
   if(!raw||typeof raw!=='object'||Array.isArray(raw)||!('nuevo_envio' in raw)||raw.nuevo_envio!==true)return fail()
   const intent=validateFiscalCreditIntentRecord({...raw,nuevo_envio:false},prepared.validated.cuerpo,b.actor_auth_id)
   if(intent.permiso_id!==b.permiso_id||intent.revision_id!==b.revision_id||controller.signal.aborted)return fail()
  },controller.signal)
  if(controller.signal.aborted)return fail()
  return validateFiscalEmissionReceipt(decodePrivateFiscalEmissionReceipt(xml,prepared.validated.cuerpo.datos.solicitud))
 }catch{return fail()}finally{if(timer!==undefined)clearTimeout(timer);parent?.removeEventListener('abort',abort);controller.abort()}
}
