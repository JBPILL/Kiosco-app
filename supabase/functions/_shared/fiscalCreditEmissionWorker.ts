import { validateFiscalCreditSendResponse } from './fiscalCreditSendResponse.ts'
import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import type { FiscalCreditDraftScope } from './fiscalCreditDraftAck.ts'
import type { FiscalTicketKeys } from './fiscalSharedTickets.ts'
import type { GuardedCreditSendWsaaTicketLoader,GuardedCreditConsultWsaaTicketLoader } from './fiscalCreditSharedTickets.ts'
import { createSharedFiscalCreditSendTicketLoader } from './fiscalCreditSharedTickets.ts'
import { validateFiscalRepresentation } from './fiscalRepresentation.ts'
import { validateFiscalCreditDraftProposal } from './fiscalCreditDraft.ts'
import { validateFiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import { validateFiscalCreditSendSource } from './fiscalCreditSendSource.ts'
import { validateFiscalCreditIntentRecord } from './fiscalCreditConsultation.ts'
import type { FiscalCreditConsultationReceipt } from './fiscalCreditConsultation.ts'
import type { FiscalCreditConsultIntent } from './fiscalCreditConsultSource.ts'
import { consultLastFiscalCreditNumber } from './fiscalCreditNumberXml.ts'
import { sendFiscalCreditEmission } from './fiscalCreditEmission.ts'
import { reconcileFiscalCreditOperation } from './fiscalCreditConsultWorker.ts'
import { withFiscalDeadline } from './fiscalVoucherXml.ts'
import { fiscalUuid,fiscalSha } from './fiscalReplacement.ts'
import { FISCAL_STAGING_URL } from './fiscalSupabaseAdmin.ts'
export interface FiscalCreditEmissionWorkerDependencies {
 signal?:AbortSignal
 admin:FiscalAuthClient;readSecret:(name:string)=>string|undefined;keys:FiscalTicketKeys;fetcher:typeof fetch
 createSendWsaa:(guard:()=>Promise<void>)=>GuardedCreditSendWsaaTicketLoader
 createConsultWsaa:(guard:()=>Promise<void>)=>GuardedCreditConsultWsaaTicketLoader
}
export type FiscalCreditEmissionWorkerResult=Readonly<FiscalCreditConsultationReceipt>|Readonly<FiscalCreditConsultIntent&{reintegro_habilitado:false;reposicion_habilitada:false}>
const fail=():never=>{throw new Error('FISCAL_OPERACION_NC_NO_CONFIRMADA')}
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))return fail();return v as Record<string,unknown>}
/** Privado, default cerrado. Recuperación nunca requiere permiso de envío vigente.
 * Respuesta candidata de envío no es autorización CAE. */
export async function emitFiscalCreditOperation(deps:FiscalCreditEmissionWorkerDependencies,token:string,input:FiscalCreditDraftScope,revisionId:string,permissionId:string|null,attemptId:string,queryId:string):Promise<FiscalCreditEmissionWorkerResult>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000),parent=deps.signal,abort=()=>controller.abort()
 parent?.addEventListener('abort',abort,{once:true})
 try{
  const scope=Object.freeze({...input}),{admin,readSecret,keys,fetcher,createSendWsaa,createConsultWsaa}=deps
  if(parent?.aborted||!fiscalUuid(scope.saleId)||!fiscalUuid(scope.operationId)||!fiscalUuid(scope.requestId)||!fiscalSha(scope.sha256)||![revisionId,attemptId,queryId].every(fiscalUuid)||permissionId!==null&&!fiscalUuid(permissionId)||typeof token!=='string'||token.length>16384||!/^\S+$/.test(token))return fail()
  const backend=()=>{if(controller.signal.aborted||readSecret('SUPABASE_URL')!==FISCAL_STAGING_URL||readSecret('ARCA_HOMO_BACKEND_ENABLED')!=='true')return fail()}
  const enabled=()=>{backend();if(readSecret('ARCA_HOMO_CREDIT_SEND_ENABLED')!=='true')return fail()}
  const rpc=async(name:string,args:Record<string,unknown>)=>{backend();const r=await withFiscalDeadline(admin.rpc(name,args),controller.signal);if(r.error)return fail();return r.data}
  backend();const auth=await withFiscalDeadline(admin.auth.getUser(token),controller.signal),actor=auth.data.user?.id
  if(auth.error||!fiscalUuid(actor))return fail()
  const original=await withFiscalDeadline(validateFiscalRepresentation(await rpc('cargar_representacion_fiscal_homologacion',{p_actor_auth_id:actor,p_venta_id:scope.saleId,p_operacion_id:scope.operationId}),scope.saleId,scope.operationId),controller.signal)
  const args={p_actor_auth_id:actor,p_venta_id:scope.saleId,p_operacion_origen_id:scope.operationId,p_id:scope.requestId,p_sha:scope.sha256}
  const packet=await rpc('cargar_fuente_cuerpo_nc_homologacion',args),proposal=await withFiscalDeadline(validateFiscalCreditDraftProposal(original,object(object(packet).preparacion).propuesta),controller.signal)
  if(proposal.sha256!==scope.sha256||proposal.datos.solicitud_id!==scope.requestId)return fail()
  const body=await withFiscalDeadline(validateFiscalCreditRequestRecord(packet,original,proposal),controller.signal)
  const read=async()=>{const raw=await rpc('cargar_intencion_nc_homologacion',args);return raw===null?null:validateFiscalCreditIntentRecord(raw,body,actor)}
  const historic={p_actor:actor,p_venta:scope.saleId,p_operacion:scope.operationId,p_caso:scope.requestId,p_sha:scope.sha256}
  const readResponse=async(intent:Readonly<FiscalCreditConsultIntent>)=>{const raw=await rpc('cargar_respuesta_envio_nc_homologacion',historic);return raw===null?null:validateFiscalCreditSendResponse(raw,body,intent)}
  const recover=async(intent:Readonly<FiscalCreditConsultIntent>):Promise<FiscalCreditEmissionWorkerResult>=>{
   await readResponse(intent)
   try{return await withFiscalDeadline(reconcileFiscalCreditOperation({admin,readSecret,keys,fetcher,createWsaa:createConsultWsaa,expectedActorAuthId:actor,signal:controller.signal},token,scope,queryId),controller.signal)}
   catch{backend();const confirmed=await read();if(!confirmed||confirmed.intento_id!==intent.intento_id)return fail();return Object.freeze({...confirmed,reintegro_habilitado:false,reposicion_habilitada:false})}
  }
  const existing=await read();if(existing)return await recover(existing)
  enabled()
  let selectedPermission=permissionId
  if(selectedPermission===null){const available=object(await rpc('cargar_permiso_envio_nc_homologacion',{...args,p_cuerpo_sha:body.sha256,p_revision_id:revisionId}));if(available.estado!=='PERMISO_NC_VERIFICADO'||available.actor_auth_id!==actor||available.solicitud_id!==scope.requestId||available.solicitud_sha256!==body.sha256||available.revision_id!==revisionId||available.emision_habilitada!==false||!fiscalUuid(available.permiso_id))return fail();selectedPermission=available.permiso_id}
  const source=async()=>{enabled();const raw=await rpc('cargar_fuente_envio_nc_homologacion',{...args,p_cuerpo_sha:body.sha256,p_revision_id:revisionId,p_permiso_id:selectedPermission});return{raw,valid:await withFiscalDeadline(validateFiscalCreditSendSource(raw,original,proposal,actor),controller.signal)}}
  try{
   const initial=await source(),binding=initial.valid.binding
   if(initial.valid.cuerpo.canonico!==body.canonico)return fail()
   const guard=async()=>{const fresh=await source();if(JSON.stringify(fresh.valid.binding)!==JSON.stringify(binding)||fresh.valid.cuerpo.canonico!==body.canonico)return fail();enabled()}
   const ticket=await withFiscalDeadline(createSharedFiscalCreditSendTicketLoader(admin,keys,createSendWsaa(guard),guard)(binding,controller.signal),controller.signal)
   if(ticket.entorno!==binding.entorno||ticket.servicio!==binding.servicio||ticket.cuitEmisor!==binding.cuit_emisor||ticket.credencialId!==binding.credencial_id||ticket.certificadoSha256!==binding.certificado_sha256)return fail()
   const last=await withFiscalDeadline(consultLastFiscalCreditNumber({entorno:'HOMOLOGACION',cuitEmisor:binding.cuit_emisor,puntoVenta:binding.punto_venta,tipoComprobante:binding.tipo_comprobante},ticket,fetcher,guard,15000,controller.signal),controller.signal)
   await guard()
   // Snapshot de numeración autenticada sólo por transporte/TA;042 revalida bajo lock.
   if(last.ultimo+1!==binding.numero)return fail()
   const candidate=await sendFiscalCreditEmission({packet:initial.raw,source:original,draft:proposal,actorAuthId:actor},ticket,{fetcher,signal:controller.signal,consumeIntent:async(b,signal)=>{
    if(signal.aborted||JSON.stringify(b)!==JSON.stringify(binding))return fail()
    await guard()
    const ack=await rpc('registrar_intencion_nc_homologacion',{...args,p_cuerpo_sha:body.sha256,p_revision_id:revisionId,p_permiso_id:selectedPermission,p_intento_id:attemptId,p_ultimo_autorizado:last.ultimo,p_consultado_en:last.consultado_en})
    enabled();return ack
   }})
   const intent=await read();if(!intent||intent.intento_id!==attemptId)return fail()
   const observed={intento_id:intent.intento_id,solicitud_sha256:body.sha256,recibido_en:new Date().toISOString(),resultado:candidate,emision_habilitada:false}
   try{await rpc('registrar_respuesta_envio_nc_homologacion',{...historic,p_datos:observed})}catch{/* ACK incierto: GET, nunca otro registro/envío. */}
   const stored=await readResponse(intent)
   if(stored&&JSON.stringify(stored.observacion)!==JSON.stringify(observed))return fail()
  }catch{/* ACK/red/SOAP inciertos: sólo recuperar intención, nunca repetir envío. */}
  const confirmed=await read();if(!confirmed)return fail()
  return await recover(confirmed)
 }catch{return fail()}finally{clearTimeout(timer);parent?.removeEventListener('abort',abort);controller.abort()}
}
