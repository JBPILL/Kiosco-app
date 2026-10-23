import { authorizeFiscalActor } from './fiscalWorkerAuthorization.ts'
import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import type { FiscalSecretReader } from './fiscalPrivateCustody.ts'
import type { WsaaTicketLoader } from './fiscalTicketCache.ts'
import { createFiscalTicketCache } from './fiscalTicketCache.ts'
import { verifyFiscalRequest } from './fiscalReconciliation.ts'
import { consultLastFiscalNumber, sendFiscalEmission, verifyFiscalEmissionRequest } from './fiscalWsfeEmission.ts'
import { reconcileVerifiedFiscalVoucher } from './fiscalAuthorizedReconciliation.ts'
import type { FiscalReconciliationAck } from './fiscalPersistence.ts'
import { FISCAL_STAGING_URL } from './fiscalSupabaseAdmin.ts'
import { validateFiscalOwnerReview } from './fiscalOwnerReview.ts'
import { persistFiscalEmissionReceipt } from './fiscalEmissionReceiptPersistence.ts'
import type { FiscalEmissionReceipt } from './fiscalEmissionReceipt.ts'

export interface FiscalEmissionDependencies {
  admin:FiscalAuthClient
  readSecret:FiscalSecretReader
  cache:ReturnType<typeof createFiscalTicketCache>
  load:WsaaTicketLoader
  fetcher:typeof fetch
}
const fail=():never=>{throw new Error('FISCAL_EMISION_NO_CONFIRMADA')}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
/** Sólo consume cuerpos persistidos y permisos privados exactos. No crea IVA,
 * cambia importes, reenvía ni habilita un endpoint/UI de emisión. */
export async function emitAuthorizedFiscalVoucher(deps:FiscalEmissionDependencies,token:string,operationId:string,attemptId:string,observationId:string):Promise<FiscalReconciliationAck> {
  if(deps.readSecret('SUPABASE_URL')!==FISCAL_STAGING_URL||deps.readSecret('ARCA_HOMO_BACKEND_ENABLED')!=='true'
    ||!uuid(operationId)||!uuid(attemptId)||!uuid(observationId))return fail()
  const {binding,actorAuthId}=await authorizeFiscalActor(deps.admin,token,operationId)
  const loaded=await deps.admin.rpc('cargar_preparacion_envio_homologacion',{p_operacion_id:operationId})
  if(loaded.error||!loaded.data||typeof loaded.data!=='object'||Array.isArray(loaded.data))return fail()
  const ctx=loaded.data as Record<string,unknown>,keys=['operacion_id','estado','intento_id','revision','solicitud','resultado','permiso']
  if(Object.keys(ctx).length!==keys.length||Object.keys(ctx).some(k=>!keys.includes(k))||ctx.operacion_id!==operationId)return fail()
  const frozen=await verifyFiscalRequest(ctx.solicitud),s=frozen.solicitud
  if(s.cuitEmisor!==binding.cuit_emisor||s.puntoVenta!==binding.punto_venta)return fail()
  const reconciliationEnabled=async()=>{if(deps.readSecret('ARCA_HOMO_RECONCILIATION_ENABLED')!=='true')throw new Error('FISCAL_CONCILIACION_NO_HABILITADA')}
  const reconcile=()=>reconcileVerifiedFiscalVoucher(deps.admin,actorAuthId,binding,observationId,deps.cache,deps.load,deps.fetcher,reconciliationEnabled)
  if(ctx.estado==='ENVIO_INCIERTO'||ctx.estado==='AUTORIZADA'){
    if(!uuid(ctx.intento_id)||ctx.permiso!==null||ctx.revision!==(ctx.estado==='AUTORIZADA'?2:1)
      ||(ctx.resultado!==null)!==(ctx.estado==='AUTORIZADA'))return fail()
    return reconcile()
  }
  if(ctx.estado!=='RESERVADA'||ctx.intento_id!==null||ctx.revision!==1||ctx.resultado!==null||!uuid(ctx.permiso)
    ||deps.readSecret('ARCA_HOMO_EMISSION_ENABLED')!=='true'||deps.readSecret('ARCA_HOMO_RECONCILIATION_ENABLED')!=='true')return fail()
  await verifyFiscalEmissionRequest(frozen)
  const reviewResult=await deps.admin.rpc('cargar_revision_fiscal_homologacion',{p_operacion_id:operationId,p_actor_auth_id:actorAuthId})
  if(reviewResult.error)return fail()
  const review=await validateFiscalOwnerReview(reviewResult.data,binding)
  if(review.estado!=='RESERVADA'||review.solicitud.sha256!==frozen.sha256||!review.aprobacion||Date.parse(review.aprobacion.vence_en)<=Date.now())return fail()
  const ticket=await deps.cache.get(binding,deps.load)
  const last=await consultLastFiscalNumber({entorno:s.entorno,cuitEmisor:s.cuitEmisor,puntoVenta:s.puntoVenta,tipoComprobante:s.tipoComprobante},ticket,deps.fetcher)
  if(last.ultimo!==s.numero-1)return fail()
  let permitted=false
  let received:FiscalEmissionReceipt|undefined
  try {
    received=await sendFiscalEmission(frozen,ticket,deps.fetcher,async()=>{
      const result=await deps.admin.rpc('registrar_envio_revisado_homologacion',{
        p_actor_auth_id:actorAuthId,p_operacion_id:operationId,p_intento_id:attemptId,p_sha:frozen.sha256,p_autorizacion_id:ctx.permiso,
        p_ultimo_autorizado:last.ultimo,p_consultado_en:last.consultado_en,
      })
      if(result.error||!result.data||typeof result.data!=='object'||Array.isArray(result.data))return fail()
      const a=result.data as Record<string,unknown>
      const ackKeys=['operacion_id','numero','estado','revision','solicitud_sha256','nuevo_intento','requiere_conciliacion','emision_habilitada','autorizacion_id']
      if(Object.keys(a).length!==ackKeys.length||Object.keys(a).some(k=>!ackKeys.includes(k))||a.operacion_id!==operationId||a.numero!==s.numero||a.estado!=='ENVIO_INCIERTO'||a.revision!==1||a.solicitud_sha256!==frozen.sha256
        ||a.nuevo_intento!==true||a.requiere_conciliacion!==false||a.emision_habilitada!==true||a.autorizacion_id!==ctx.permiso)return fail()
      permitted=true
    })
  }catch{if(!permitted)return fail()}
  let auditFailed=false
  if(received)try{await persistFiscalEmissionReceipt(deps.admin,actorAuthId,operationId,attemptId,frozen.sha256,received)}catch{auditFailed=true}
  // Un CAE recibido no confirma importes/IVA: cerrar sólo tras consulta íntegra.
  const result=await reconcile()
  if(auditFailed)throw new Error('FISCAL_RESPUESTA_NO_CONFIRMADA')
  return result
}
