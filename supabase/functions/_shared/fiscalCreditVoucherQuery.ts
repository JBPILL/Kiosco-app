import { withFiscalDeadline } from './fiscalVoucherXml.ts'
import type { FiscalRepresentation } from './fiscalRepresentation.ts'
import type { FiscalCreditDraft } from './fiscalCreditDraft.ts'
import type { WsaaTicketEnvelope } from './fiscalTicketCache.ts'
import type { FiscalCreditConsultBinding } from './fiscalCreditConsultSource.ts'
import { validateFiscalCreditConsultSource } from './fiscalCreditConsultSource.ts'
import { buildFiscalAuthForCuit } from './fiscalReconciliation.ts'
import { postPrivateFiscalCreditQuery } from './fiscalWsfeEmission.ts'
import { reconcileFiscalCreditVoucherXml } from './fiscalCreditVoucherXml.ts'
import type { FiscalCreditVoucherReconciliation } from './fiscalCreditVoucherXml.ts'
export interface FiscalCreditVoucherQueryInput {packet:unknown;source:Readonly<FiscalRepresentation>;draft:Readonly<FiscalCreditDraft>;actorAuthId:string}
export interface FiscalCreditVoucherQueryDependencies {fetcher:typeof fetch;beforeSend:(binding:Readonly<FiscalCreditConsultBinding>,signal:AbortSignal)=>Promise<void>;signal:AbortSignal;timeoutMs?:number}
export interface FiscalCreditVoucherQueryResult {intento_id:string;solicitud_sha256:string;consultado_en:string;resultado:FiscalCreditVoucherReconciliation;emision_habilitada:false}
const fail=():never=>{throw new Error('FISCAL_CONSULTA_NC_NO_CONFIRMADA')}
/** Sólo desde045/046 y guard privado actual. No guarda CAE ni autoriza efectos/reenvío. */
export async function consultFiscalCreditVoucher(input:FiscalCreditVoucherQueryInput,ticket:WsaaTicketEnvelope,deps:FiscalCreditVoucherQueryDependencies):Promise<Readonly<FiscalCreditVoucherQueryResult>> {
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,parent:AbortSignal|undefined
 const abort=()=>controller.abort()
 try {
  const {fetcher,beforeSend,signal:parentSignal,timeoutMs=15000}=deps
  parent=parentSignal
  const signal=controller.signal
  if(typeof beforeSend!=='function'||typeof fetcher!=='function'||!parent||parent.aborted||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>40000)return fail()
  parent.addEventListener('abort',abort,{once:true});timer=setTimeout(abort,timeoutMs)
  const raw=structuredClone(input),captured={entorno:ticket.entorno,servicio:ticket.servicio,cuitEmisor:ticket.cuitEmisor,credencialId:ticket.credencialId,certificadoSha256:ticket.certificadoSha256,token:ticket.token,sign:ticket.sign,expiresAt:ticket.expiresAt}
  const authority=await withFiscalDeadline(validateFiscalCreditConsultSource(raw.packet,raw.source,raw.draft,raw.actorAuthId),signal),b=authority.binding
  if(signal.aborted||captured.entorno!==b.entorno||captured.servicio!==b.servicio||captured.cuitEmisor!==b.cuit_emisor||captured.credencialId!==b.credencial_id||captured.certificadoSha256!==b.certificado_sha256)return fail()
  const auth=buildFiscalAuthForCuit(b.cuit_emisor,captured)
  const request=new Request('https://wswhomo.afip.gov.ar/wsfev1/service.asmx',{method:'POST',redirect:'error',headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:'"http://ar.gov.afip.dif.FEV1/FECompConsultar"'},body:`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECompConsultar xmlns="http://ar.gov.afip.dif.FEV1/">${auth}<FeCompConsReq><CbteTipo>${b.tipo_comprobante}</CbteTipo><CbteNro>${b.numero}</CbteNro><PtoVta>${b.punto_venta}</PtoVta></FeCompConsReq></FECompConsultar></s:Body></s:Envelope>`})
  const xml=await postPrivateFiscalCreditQuery(request,fetcher,timeoutMs,captured.expiresAt,async()=>{await beforeSend(b,signal);if(signal.aborted)return fail()},signal)
  await withFiscalDeadline(beforeSend(b,signal),signal);if(signal.aborted)return fail()
  if(!raw.packet||typeof raw.packet!=='object'||Array.isArray(raw.packet))return fail()
  const packet=raw.packet as Record<string,unknown>
  const resultado=await withFiscalDeadline(reconcileFiscalCreditVoucherXml(xml,packet.cuerpo,raw.source,raw.draft),signal)
  if(signal.aborted)return fail()
  return Object.freeze({intento_id:b.intento_id,solicitud_sha256:b.solicitud_sha256,consultado_en:new Date().toISOString(),resultado:Object.freeze(resultado),emision_habilitada:false})
 }catch{return fail()}finally{if(timer!==undefined)clearTimeout(timer);parent?.removeEventListener('abort',abort);controller.abort()}
}
