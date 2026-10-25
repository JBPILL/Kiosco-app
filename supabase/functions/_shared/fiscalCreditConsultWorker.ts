import type { FiscalCreditVoucherQueryResult } from './fiscalCreditVoucherQuery.ts'
import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import type { FiscalCreditDraftScope } from './fiscalCreditDraftAck.ts'
import type { FiscalTicketKeys } from './fiscalSharedTickets.ts'
import type { GuardedCreditConsultWsaaTicketLoader } from './fiscalCreditSharedTickets.ts'
import { createSharedFiscalCreditConsultTicketLoader } from './fiscalCreditSharedTickets.ts'
import { validateFiscalRepresentation } from './fiscalRepresentation.ts'
import { validateFiscalCreditDraftProposal } from './fiscalCreditDraft.ts'
import { validateFiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import { validateFiscalCreditConsultSource } from './fiscalCreditConsultSource.ts'
import { validateFiscalCreditIntentRecord,validateFiscalCreditConsultation } from './fiscalCreditConsultation.ts'
import type { FiscalCreditConsultationReceipt } from './fiscalCreditConsultation.ts'
import { consultFiscalCreditVoucher } from './fiscalCreditVoucherQuery.ts'
import { withFiscalDeadline } from './fiscalVoucherXml.ts'
import { fiscalUuid,fiscalSha } from './fiscalReplacement.ts'
import { FISCAL_STAGING_URL } from './fiscalSupabaseAdmin.ts'
export interface FiscalCreditConsultDependencies {admin:FiscalAuthClient;readSecret:(name:string)=>string|undefined;keys:FiscalTicketKeys;createWsaa:(guard:()=>Promise<void>)=>GuardedCreditConsultWsaaTicketLoader;fetcher:typeof fetch}
const fail=():never=>{throw new Error('FISCAL_CONCILIACION_NC_NO_CONFIRMADA')}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return fail();return value as Record<string,unknown>}
/** Recuperación antes de flags de trabajo/TA. Sólo consulta/diario, sin emisión ni negocio. */
export async function reconcileFiscalCreditOperation(deps:FiscalCreditConsultDependencies,token:string,input:FiscalCreditDraftScope,queryId:string):Promise<Readonly<FiscalCreditConsultationReceipt>>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000)
 try{
  const scope=Object.freeze({...input}),admin=deps.admin,readSecret=deps.readSecret,keys=deps.keys,createWsaa=deps.createWsaa,fetcher=deps.fetcher
  if(!fiscalUuid(scope.saleId)||!fiscalUuid(scope.operationId)||!fiscalUuid(scope.requestId)||!fiscalSha(scope.sha256)||!fiscalUuid(queryId)||typeof token!=='string'||token.length>16384||!/^\S+$/.test(token))return fail()
  const backend=()=>{if(controller.signal.aborted||readSecret('SUPABASE_URL')!==FISCAL_STAGING_URL||readSecret('ARCA_HOMO_BACKEND_ENABLED')!=='true')return fail()}
  const enabled=()=>{backend();if(readSecret('ARCA_HOMO_CREDIT_CONSULT_ENABLED')!=='true')return fail()}
  backend();const auth=await withFiscalDeadline(admin.auth.getUser(token),controller.signal),actor=auth.data.user?.id
  if(auth.error||!fiscalUuid(actor))return fail()
  const rpc=async(name:string,args:Record<string,unknown>)=>{backend();const r=await withFiscalDeadline(admin.rpc(name,args),controller.signal);if(r.error)return fail();return r.data}
  const original=await validateFiscalRepresentation(await rpc('cargar_representacion_fiscal_homologacion',{p_actor_auth_id:actor,p_venta_id:scope.saleId,p_operacion_id:scope.operationId}),scope.saleId,scope.operationId)
  const args={p_actor_auth_id:actor,p_venta_id:scope.saleId,p_operacion_origen_id:scope.operationId,p_id:scope.requestId,p_sha:scope.sha256}
  const packet=await rpc('cargar_fuente_cuerpo_nc_homologacion',args),proposal=await validateFiscalCreditDraftProposal(original,object(object(packet).preparacion).propuesta)
  if(proposal.sha256!==scope.sha256||proposal.datos.solicitud_id!==scope.requestId)return fail()
  const body=await validateFiscalCreditRequestRecord(packet,original,proposal)
  const historic={p_actor:actor,p_venta:scope.saleId,p_operacion:scope.operationId,p_caso:scope.requestId,p_sha:scope.sha256}
  const intent=validateFiscalCreditIntentRecord(await rpc('cargar_intencion_nc_homologacion',args),body,actor)
  const read=async()=>{
   const authorization=await rpc('cargar_autorizacion_nc_homologacion',historic)
   if(authorization!==null)return validateFiscalCreditConsultation(authorization,body,intent)
   const receipt=await rpc('cargar_consulta_nc_homologacion',{...historic,p_consulta:queryId})
   return receipt===null?null:validateFiscalCreditConsultation(receipt,body,intent,queryId)
  }
  const recovered=await read();if(recovered)return recovered
  enabled()
  const source=async()=>{enabled();const raw=await rpc('cargar_fuente_consulta_nc_homologacion',args);return{raw,valid:await validateFiscalCreditConsultSource(raw,original,proposal,actor)}}
  let observation:Readonly<FiscalCreditVoucherQueryResult>|undefined
  try{
   const initial=await source(),binding=initial.valid.binding
   const guard=async()=>{const fresh=await source();if(JSON.stringify(fresh.valid.binding)!==JSON.stringify(binding)||fresh.valid.cuerpo.canonico!==body.canonico)return fail();enabled()}
   const ticket=await withFiscalDeadline(createSharedFiscalCreditConsultTicketLoader(admin,keys,createWsaa(guard),guard)(binding,controller.signal),controller.signal)
   observation=await consultFiscalCreditVoucher({packet:initial.raw,source:original,draft:proposal,actorAuthId:actor},ticket,{fetcher,signal:controller.signal,beforeSend:async(value)=>{if(JSON.stringify(value)!==JSON.stringify(binding))return fail();await guard()}})
   // Hecho ya recibido: conservarlo mediante047 aunque se cierre el flag de trabajo.
   backend();try{await withFiscalDeadline(admin.rpc('registrar_consulta_nc_homologacion',{...historic,p_consulta:queryId,p_datos:observation}),controller.signal)}catch{/* ACK perdido: recuperar verdad durable, sin otro POST ni consulta. */}
  }catch{/* Otra ejecución pudo registrar resultado. Recuperar antes de concluir. */}
  const confirmed=await read();if(!confirmed)return fail()
  const actual=observation?.resultado,stored=confirmed.observacion.resultado
  if(actual?.estado==='AUTORIZACION_NC_COINCIDENTE'&&(stored.estado!=='AUTORIZACION_NC_COINCIDENTE'||actual.cae!==stored.cae||actual.vencimiento!==stored.vencimiento||actual.solicitudSha256!==stored.solicitudSha256))return fail()
  return confirmed
 }catch{return fail()}finally{clearTimeout(timer);controller.abort()}
}
