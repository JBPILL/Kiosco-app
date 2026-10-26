import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import type { FiscalCreditDraftScope } from './fiscalCreditDraftAck.ts'
import type { FiscalCreditCommercialApplication } from './fiscalCreditCommercialApplication.ts'
import { validateFiscalCreditCommercialApplication } from './fiscalCreditCommercialApplication.ts'
import { validateFiscalRepresentation } from './fiscalRepresentation.ts'
import { validateFiscalCreditDraftProposal } from './fiscalCreditDraft.ts'
import { validateFiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import { validateFiscalCreditIntentRecord,validateFiscalCreditConsultation } from './fiscalCreditConsultation.ts'
import { fiscalUuid,fiscalSha } from './fiscalReplacement.ts'
import { FISCAL_STAGING_URL } from './fiscalSupabaseAdmin.ts'
import { withFiscalDeadline } from './fiscalVoucherXml.ts'
export interface FiscalCreditCommercialDependencies {admin:FiscalAuthClient;readSecret:(name:string)=>string|undefined;signal?:AbortSignal;expectedActorAuthId?:string}
const fail=():never=>{throw new Error('FISCAL_APLICACION_NC_NO_CONFIRMADA')}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return fail();return value as Record<string,unknown>}
/** No ARCA transport or credentials. Resolve confirmed local evidence, then apply SQL052 once. */
export async function applyFiscalCreditCommercialOperation(deps:FiscalCreditCommercialDependencies,token:string,input:FiscalCreditDraftScope,cashId:string):Promise<Readonly<FiscalCreditCommercialApplication>>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000),parent=deps.signal,abort=()=>controller.abort(),expectedActor=deps.expectedActorAuthId
 parent?.addEventListener('abort',abort,{once:true})
 try{
  const scope=Object.freeze({...input}),admin=deps.admin,readSecret=deps.readSecret
  if(parent?.aborted||expectedActor!==undefined&&!fiscalUuid(expectedActor)||!fiscalUuid(scope.saleId)||!fiscalUuid(scope.operationId)||!fiscalUuid(scope.requestId)||!fiscalSha(scope.sha256)||!fiscalUuid(cashId)||typeof token!=='string'||token.length>16384||!/^\S+$/.test(token))return fail()
  const backend=()=>{if(controller.signal.aborted||readSecret('SUPABASE_URL')!==FISCAL_STAGING_URL||readSecret('ARCA_HOMO_BACKEND_ENABLED')!=='true')return fail()}
  const enabled=()=>{backend();if(readSecret('ARCA_HOMO_CREDIT_APPLY_ENABLED')!=='true')return fail()}
  backend();const auth=await withFiscalDeadline(admin.auth.getUser(token),controller.signal),actor=auth.data.user?.id
  if(auth.error||!fiscalUuid(actor)||expectedActor!==undefined&&actor!==expectedActor)return fail()
  const rpc=async(name:string,args:Record<string,unknown>)=>{backend();const r=await withFiscalDeadline(admin.rpc(name,args),controller.signal);if(r.error)return fail();return r.data}
  const historic={p_actor:actor,p_venta:scope.saleId,p_operacion:scope.operationId,p_caso:scope.requestId,p_sha:scope.sha256}
  const read=async()=>{const value=await rpc('cargar_aplicacion_comercial_nc_homologacion',historic);return value===null?null:validateFiscalCreditCommercialApplication(value,scope,cashId)}
  const prior=await read();if(prior)return prior
  enabled()
  const original=await validateFiscalRepresentation(await rpc('cargar_representacion_fiscal_homologacion',{p_actor_auth_id:actor,p_venta_id:scope.saleId,p_operacion_id:scope.operationId}),scope.saleId,scope.operationId)
  const args={p_actor_auth_id:actor,p_venta_id:scope.saleId,p_operacion_origen_id:scope.operationId,p_id:scope.requestId,p_sha:scope.sha256}
  const packet=await rpc('cargar_fuente_cuerpo_nc_homologacion',args),draft=await validateFiscalCreditDraftProposal(original,object(object(packet).preparacion).propuesta)
  if(draft.sha256!==scope.sha256||draft.datos.solicitud_id!==scope.requestId)return fail()
  const body=await validateFiscalCreditRequestRecord(packet,original,draft),intent=validateFiscalCreditIntentRecord(await rpc('cargar_intencion_nc_homologacion',args),body,actor)
  const authorization=validateFiscalCreditConsultation(await rpc('cargar_autorizacion_nc_homologacion',historic),body,intent)
  if(authorization.estado!=='CAE_NC_REGISTRADO_NO_APLICADO')return fail()
  enabled()
  try{await withFiscalDeadline(admin.rpc('registrar_resolucion_nc_autorizada_homologacion',historic),controller.signal)}catch{/* Recover the durable fact; never trust a POST ACK. */}
  const resolution=object(await rpc('cargar_resolucion_nc_homologacion',historic)),cae=authorization.observacion.resultado
  const keys=['version','solicitud_id','intento_id','reserva_id','consulta_id','solicitud_sha256','cae','vencimiento','cuit_emisor','punto_venta','tipo_comprobante','numero','estado','emision_habilitada','reintegro_habilitado','reposicion_habilitada']
  if(Object.keys(resolution).length!==keys.length||keys.some(k=>!Object.hasOwn(resolution,k))||resolution.version!==1||resolution.solicitud_id!==scope.requestId||resolution.intento_id!==intent.intento_id||resolution.reserva_id!==body.datos.reserva_id||resolution.consulta_id!==authorization.consulta_id||resolution.solicitud_sha256!==body.sha256||cae.estado!=='AUTORIZACION_NC_COINCIDENTE'||resolution.cae!==cae.cae||resolution.vencimiento!==cae.vencimiento||resolution.cuit_emisor!==body.datos.solicitud.cuitEmisor||resolution.punto_venta!==body.datos.solicitud.puntoVenta||resolution.tipo_comprobante!==body.datos.solicitud.tipoComprobante||resolution.numero!==body.datos.solicitud.numero||resolution.estado!=='RESOLUCION_NC_REGISTRADA_NO_APLICADA'||resolution.emision_habilitada!==false||resolution.reintegro_habilitado!==false||resolution.reposicion_habilitada!==false)return fail()
  enabled()
  try{await withFiscalDeadline(admin.rpc('aplicar_comercial_nc_homologacion',{...historic,p_caja:cashId}),controller.signal)}catch{/* Lost ACK: only GET may confirm the original transaction. */}
  const confirmed=await rpc('cargar_aplicacion_comercial_nc_homologacion',historic)
  return validateFiscalCreditCommercialApplication(confirmed,scope,cashId,body.sha256,draft)
 }catch{return fail()}finally{clearTimeout(timer);parent?.removeEventListener('abort',abort);controller.abort()}
}
