import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import type { FiscalPreparationContext } from './fiscalPreparationContract.ts'
import { prepareFiscalData, validateFiscalPreparationContext } from './fiscalPreparation.ts'

export interface FiscalPreparationDependencies {
 admin:FiscalAuthClient
 readSecret:(name:string)=>string|undefined
}
export interface FiscalPreparationAck {
 operacion_id:string;venta_id:string;preparacion_sha256:string;estado:'DATOS_PREPARADOS';emision_habilitada:false
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const fail=():never=>{throw new Error('FISCAL_PREPARACION_NO_CONFIRMADA')}
async function actor(deps:FiscalPreparationDependencies,token:string,sale:string):Promise<string> {
 if(deps.readSecret('SUPABASE_URL')!=='https://acoyfwwmhaeruciyedri.supabase.co'
  ||deps.readSecret('ARCA_HOMO_BACKEND_ENABLED')!=='true'||!uuid(sale)
  ||typeof token!=='string'||token.length>16384||!/^\S+$/.test(token))return fail()
 const response=await deps.admin.auth.getUser(token)
 if(response.error||!uuid(response.data.user?.id))return fail()
 return response.data.user.id
}
async function context(deps:FiscalPreparationDependencies,actorAuthId:string,sale:string):Promise<FiscalPreparationContext> {
 const result=await deps.admin.rpc('cargar_datos_preparacion_homologacion',{p_actor_auth_id:actorAuthId,p_venta_id:sale})
 if(result.error)return fail()
 const value=validateFiscalPreparationContext(result.data)
 if(value.venta_id!==sale)return fail()
 return value
}
/** Auth real una sola vez por acción. El DTO nunca contiene custodia, TA ni binding privado. */
export async function loadFiscalPreparation(deps:FiscalPreparationDependencies,token:string,sale:string):Promise<FiscalPreparationContext> {
 try{return await context(deps,await actor(deps,token,sale),sale)}catch{return fail()}
}
/** No reserva número, no solicita TA y no llama ARCA. El llamador conserva el
 * UUID original antes del POST; errores y ACK perdido nunca crean otro UUID. */
export async function saveFiscalPreparation(deps:FiscalPreparationDependencies,token:string,sale:string,operationId:string,input:unknown):Promise<Readonly<FiscalPreparationAck>> {
 try{
  if(!uuid(operationId))return fail()
  const actorAuthId=await actor(deps,token,sale),current=await context(deps,actorAuthId,sale)
  const prepared=await prepareFiscalData(current,input)
  const result=await deps.admin.rpc('guardar_datos_preparacion_homologacion',{
   p_actor_auth_id:actorAuthId,p_venta_id:sale,p_operacion_id:operationId,p_canonico:prepared.canonico,p_sha:prepared.sha256,
  })
  if(result.error||!result.data||typeof result.data!=='object'||Array.isArray(result.data))return fail()
  const ack=result.data as Record<string,unknown>,keys=['operacion_id','venta_id','preparacion_sha256','estado','emision_habilitada']
  if(Object.keys(ack).length!==keys.length||keys.some(key=>!Object.hasOwn(ack,key))
   ||ack.operacion_id!==operationId||ack.venta_id!==sale||ack.preparacion_sha256!==prepared.sha256
   ||ack.estado!=='DATOS_PREPARADOS'||ack.emision_habilitada!==false)return fail()
  return Object.freeze({...ack}) as unknown as Readonly<FiscalPreparationAck>
 }catch{return fail()}
}
