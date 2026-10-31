import { authorizeFiscalActor } from './fiscalWorkerAuthorization.ts'
import type { FiscalEmissionDependencies } from './fiscalEmissionWorker.ts'
import { FISCAL_STAGING_URL } from './fiscalSupabaseAdmin.ts'
import { validateFiscalPreparationContext } from './fiscalPreparationPublic.ts'
import { verifySavedFiscalPreparation, requestFromPreparedFiscalData } from './fiscalPreparation.ts'
import type { PreparedFiscalData } from './fiscalPreparation.ts'
import { consultLastFiscalNumber } from './fiscalWsfeEmission.ts'
import { serializeFiscalRequest } from './fiscalReconciliation.ts'
import { validateFiscalOwnerReview } from './fiscalOwnerReview.ts'
import type { FiscalOwnerReview } from './fiscalOwnerReview.ts'

const fail=():never=>{throw new Error('FISCAL_PREPARACION_CUERPO_NO_CONFIRMADA')}
/** Reserva/cuerpo, nunca FECAESolicitar. La activación y toda consulta ARCA real
 * requieren su autorización específica; el gate privado queda cerrado por defecto. */
export async function prepareFiscalVoucher(deps:FiscalEmissionDependencies,token:string,operationId:string):Promise<Readonly<FiscalOwnerReview>> {
 if(deps.readSecret('SUPABASE_URL')!==FISCAL_STAGING_URL||deps.readSecret('ARCA_HOMO_BACKEND_ENABLED')!=='true')return fail()
 const {binding,actorAuthId}=await authorizeFiscalActor(deps.admin,token,operationId)
 async function source():Promise<Readonly<PreparedFiscalData>|null> {
  const response=await deps.admin.rpc('cargar_fuente_preparacion_homologacion',{p_actor_auth_id:actorAuthId,p_operacion_id:operationId})
  if(response.error||!response.data||typeof response.data!=='object'||Array.isArray(response.data))return fail()
  const value=response.data as Record<string,unknown>,keys=['operacion_id','estado','contexto','canonico','preparacion_sha256']
  if(Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key))||value.operacion_id!==operationId)return fail()
  if(value.estado==='CUERPO_EXISTENTE'){
   if(value.contexto!==null||value.canonico!==null||value.preparacion_sha256!==null)return fail()
   return null
  }
  if(value.estado!=='DATOS_PREPARADOS')return fail()
  const context=validateFiscalPreparationContext(value.contexto)
  if(context.cuit_emisor!==binding.cuit_emisor||context.punto_venta!==binding.punto_venta)return fail()
  return verifySavedFiscalPreparation(context,value.canonico,value.preparacion_sha256)
 }
 async function read(prepared?:Readonly<PreparedFiscalData>):Promise<Readonly<FiscalOwnerReview>> {
  const response=await deps.admin.rpc('cargar_revision_fiscal_homologacion',{p_actor_auth_id:actorAuthId,p_operacion_id:operationId})
  if(response.error)return fail()
  const review=await validateFiscalOwnerReview(response.data,binding)
  if(prepared&&(await requestFromPreparedFiscalData(prepared,review.solicitud.solicitud.numero)).sha256!==review.solicitud.sha256)return fail()
  return review
 }
 const prepared=await source()
 // ACK perdido/concurrencia: recuperar antes de TA, incluso si se cerró el gate.
 if(prepared===null)return read()
 if(deps.readSecret('ARCA_HOMO_PREPARATION_ENABLED')!=='true')throw new Error('FISCAL_PREPARACION_CUERPO_NO_HABILITADA')
 const ticket=await deps.cache.get(binding,deps.load),s=prepared.datos
 let last:{ultimo:number;consultado_en:string}
 try{
  last=await consultLastFiscalNumber({entorno:s.entorno,cuitEmisor:s.cuitEmisor,puntoVenta:s.puntoVenta,tipoComprobante:s.tipoComprobante},ticket,deps.fetcher,15000,async()=>{
   if(deps.readSecret('ARCA_HOMO_PREPARATION_ENABLED')!=='true')return fail()
   const fresh=await source()
   if(!fresh||fresh.sha256!==prepared.sha256||fresh.canonico!==prepared.canonico)return fail()
  })
 }catch{
  // No reconsultar automáticamente: sólo recuperar un cuerpo que ya sea durable.
  return read(prepared)
 }
 if(deps.readSecret('ARCA_HOMO_PREPARATION_ENABLED')!=='true'||last.ultimo>=99999999)return fail()
 const frozen=await requestFromPreparedFiscalData(prepared,last.ultimo+1),canonical=await serializeFiscalRequest(frozen)
 try{
  await deps.admin.rpc('persistir_preparacion_fiscal_homologacion',{
   p_actor_auth_id:actorAuthId,p_operacion_id:operationId,p_canonico:canonical,p_sha:frozen.sha256,
   p_ultimo_autorizado:last.ultimo,p_consultado_en:last.consultado_en,
  })
 }catch{ /* Respuesta perdida no prueba rollback. GET con la misma identidad. */ }
 return read(prepared)
}
