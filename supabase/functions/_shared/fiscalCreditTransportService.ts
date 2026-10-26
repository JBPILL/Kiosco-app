import type { FiscalCreditDraftScope } from './fiscalCreditDraftAck.ts'
import type { FiscalCreditCommercialDependencies } from './fiscalCreditCommercialWorker.ts'
import type { FiscalCreditTransportStatus,FiscalCreditTransportState } from './fiscalCreditTransportStatus.ts'
import { validateFiscalCreditTransportStatus } from './fiscalCreditTransportStatus.ts'
import { validateFiscalRepresentation } from './fiscalRepresentation.ts'
import { validateFiscalCreditDraftProposal } from './fiscalCreditDraft.ts'
import { validateFiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import { validateFiscalCreditIntentRecord,validateFiscalCreditConsultation } from './fiscalCreditConsultation.ts'
import { validateFiscalCreditSendResponse } from './fiscalCreditSendResponse.ts'
import { FISCAL_STAGING_URL } from './fiscalSupabaseAdmin.ts'
import { fiscalUuid,fiscalSha } from './fiscalReplacement.ts'
import { withFiscalDeadline } from './fiscalVoucherXml.ts'
const fail=():never=>{throw new Error('FISCAL_ESTADO_ENVIO_NC_NO_CONFIRMADO')}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return fail();return value as Record<string,unknown>}
/** Reads durable042/047/048/049/050 only. Never WSAA/ARCA, permission grant or application. */
export async function loadFiscalCreditTransportStatus(deps:FiscalCreditCommercialDependencies,token:string,input:FiscalCreditDraftScope,queryId?:string):Promise<Readonly<FiscalCreditTransportStatus>>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000),parent=deps.signal,abort=()=>controller.abort(),expectedActor=deps.expectedActorAuthId
 parent?.addEventListener('abort',abort,{once:true})
 try{
  const scope=Object.freeze({...input}),admin=deps.admin,readSecret=deps.readSecret
  if(queryId!==undefined&&!fiscalUuid(queryId)||parent?.aborted||!fiscalUuid(scope.saleId)||!fiscalUuid(scope.operationId)||!fiscalUuid(scope.requestId)||!fiscalSha(scope.sha256)||expectedActor!==undefined&&!fiscalUuid(expectedActor)||typeof token!=='string'||token.length>16384||!/^\S+$/.test(token))return fail()
  const backend=()=>{if(controller.signal.aborted||readSecret('SUPABASE_URL')!==FISCAL_STAGING_URL||readSecret('ARCA_HOMO_BACKEND_ENABLED')!=='true')return fail()}
  backend();const auth=await withFiscalDeadline(admin.auth.getUser(token),controller.signal),actor=auth.data.user?.id
  if(auth.error||!fiscalUuid(actor)||expectedActor!==undefined&&actor!==expectedActor)return fail()
  const rpc=async(name:string,args:Record<string,unknown>)=>{backend();const r=await withFiscalDeadline(admin.rpc(name,args),controller.signal);backend();if(r.error)return fail();return r.data}
  const original=await validateFiscalRepresentation(await rpc('cargar_representacion_fiscal_homologacion',{p_actor_auth_id:actor,p_venta_id:scope.saleId,p_operacion_id:scope.operationId}),scope.saleId,scope.operationId)
  const args={p_actor_auth_id:actor,p_venta_id:scope.saleId,p_operacion_origen_id:scope.operationId,p_id:scope.requestId,p_sha:scope.sha256},packet=await rpc('cargar_fuente_cuerpo_nc_homologacion',args),proposal=await validateFiscalCreditDraftProposal(original,object(object(packet).preparacion).propuesta)
  if(proposal.sha256!==scope.sha256||proposal.datos.solicitud_id!==scope.requestId)return fail()
  const body=await validateFiscalCreditRequestRecord(packet,original,proposal),rawIntent=await rpc('cargar_intencion_nc_homologacion',args)
  const result:FiscalCreditTransportStatus={version:1,venta_id:scope.saleId,operacion_origen_id:scope.operationId,solicitud_id:scope.requestId,propuesta_sha256:scope.sha256,cuerpo_sha256:body.sha256,estado:'SIN_INTENCION',incidencia:null,intento_id:null,revision_id:null,consulta_id:null,cae:null,vencimiento:null,codigos:[],resolucion_registrada:false,emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false}
  if(rawIntent===null)return validateFiscalCreditTransportStatus(result,scope,body.sha256)
  const intent=validateFiscalCreditIntentRecord(rawIntent,body,actor),historic={p_actor:actor,p_venta:scope.saleId,p_operacion:scope.operationId,p_caso:scope.requestId,p_sha:scope.sha256}
  let state:FiscalCreditTransportState='ENVIO_INCIERTO';result.intento_id=intent.intento_id;result.revision_id=intent.revision_id
  const rawResponse=await rpc('cargar_respuesta_envio_nc_homologacion',historic)
  if(rawResponse!==null){const response=validateFiscalCreditSendResponse(rawResponse,body,intent);result.codigos=response.observacion.resultado.codigos;if(response.observacion.resultado.estado==='RECHAZO_RECIBIDO')state='RECHAZO_RECIBIDO'}
  const authorization=await rpc('cargar_autorizacion_nc_homologacion',historic)
  const rawAuthorization=authorization??(queryId===undefined?null:await rpc('cargar_consulta_nc_homologacion',{...historic,p_consulta:queryId}))
  if(rawAuthorization!==null){const receipt=validateFiscalCreditConsultation(rawAuthorization,body,intent,authorization===null?queryId:undefined);result.consulta_id=receipt.consulta_id
   if(receipt.estado==='CONFLICTO_NC_NO_APLICAR'){state='CONFLICTO_NC';result.incidencia=receipt.observacion.resultado.estado==='CONCILIAR'?'DATOS_DISTINTOS':'CAE_CONTRADICTORIO'}
   else if(receipt.observacion.resultado.estado==='CONCILIAR')result.incidencia=receipt.observacion.resultado.codigo
   else if(receipt.estado==='CAE_NC_REGISTRADO_NO_APLICADO'&&receipt.observacion.resultado.estado==='AUTORIZACION_NC_COINCIDENTE'){state='CAE_CONFIRMADO';result.cae=receipt.observacion.resultado.cae;result.vencimiento=receipt.observacion.resultado.vencimiento}
  }
  const rawResolution=await rpc('cargar_resolucion_nc_homologacion',historic)
  if(rawResolution!==null){const r=object(rawResolution),keys=['version','solicitud_id','intento_id','reserva_id','consulta_id','solicitud_sha256','cae','vencimiento','cuit_emisor','punto_venta','tipo_comprobante','numero','estado','emision_habilitada','reintegro_habilitado','reposicion_habilitada']
   if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k))||r.version!==1||r.solicitud_id!==scope.requestId||r.intento_id!==intent.intento_id||r.reserva_id!==body.datos.reserva_id||!fiscalUuid(r.consulta_id)||r.solicitud_sha256!==body.sha256||typeof r.cae!=='string'||!/^\d{14}$/.test(r.cae)||/^0+$/.test(r.cae)||typeof r.vencimiento!=='string'||!/^\d{8}$/.test(r.vencimiento)||r.cuit_emisor!==body.datos.solicitud.cuitEmisor||r.punto_venta!==body.datos.solicitud.puntoVenta||r.tipo_comprobante!==body.datos.solicitud.tipoComprobante||r.numero!==body.datos.solicitud.numero||r.estado!=='RESOLUCION_NC_REGISTRADA_NO_APLICADA'||r.emision_habilitada!==false||r.reintegro_habilitado!==false||r.reposicion_habilitada!==false||state==='CAE_CONFIRMADO'&&(r.cae!==result.cae||r.vencimiento!==result.vencimiento||r.consulta_id!==result.consulta_id))return fail()
   // Validate historical resolution dates even when a newer conflict masks its CAE.
   validateFiscalCreditTransportStatus({...result,estado:'CAE_CONFIRMADO',incidencia:null,consulta_id:r.consulta_id,cae:r.cae,vencimiento:r.vencimiento},scope,body.sha256)
   result.resolucion_registrada=true
  }
  result.estado=state;return validateFiscalCreditTransportStatus(result,scope,body.sha256)
 }catch{return fail()}finally{clearTimeout(timer);parent?.removeEventListener('abort',abort);controller.abort()}
}
