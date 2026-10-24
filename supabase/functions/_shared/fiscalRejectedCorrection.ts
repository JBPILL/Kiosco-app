import type { FiscalEmissionDependencies } from './fiscalEmissionWorker.ts'
import { FISCAL_STAGING_URL } from './fiscalSupabaseAdmin.ts'
import { fiscalUuid, fiscalSha, validateFiscalReplacementProposal } from './fiscalReplacement.ts'
import type { FiscalRejectedCorrection } from './fiscalRejectedCorrectionContract.ts'
import { validateFiscalRejectedCorrection } from './fiscalRejectedCorrectionContract.ts'
export { validateFiscalRejectedCorrection } from './fiscalRejectedCorrectionContract.ts'
export type { FiscalRejectedCorrection } from './fiscalRejectedCorrectionContract.ts'
import { validateFiscalWorkerBinding } from './fiscalWorkerAuthorization.ts'
import { freezeFiscalRequest, verifyFiscalRequest } from './fiscalReconciliation.ts'
import { consultFiscalVoucherAbsence } from './fiscalVoucherXml.ts'
import { consultLastFiscalNumber } from './fiscalWsfeEmission.ts'
const fail=():never=>{throw new Error('FISCAL_RECHAZO_NO_CONFIRMADO')}
function object(input:unknown,keys:string[]):Record<string,unknown> {
 if(!input||typeof input!=='object'||Array.isArray(input))return fail()
 const v=input as Record<string,unknown>
 if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))return fail()
 return v
}
/** Sólo dos consultas de recuperación; nunca emisión, aprobación o permiso.
 * Gate cerrado por defecto. Instalar/consultar ARCA real requiere autorización. */
async function runRejectedFiscalCorrection(deps:FiscalEmissionDependencies,token:string,sale:string,operation:string,successor:string,previousHash:string,proposal:unknown):Promise<Readonly<FiscalRejectedCorrection>> {
 if(deps.readSecret('SUPABASE_URL')!==FISCAL_STAGING_URL||deps.readSecret('ARCA_HOMO_BACKEND_ENABLED')!=='true'
  ||![sale,operation,successor].every(fiscalUuid)||operation===successor||!fiscalSha(previousHash)
  ||typeof token!=='string'||token.length>16384||!/^\S+$/.test(token))return fail()
 const prepared=await validateFiscalReplacementProposal(proposal,sale)
 const declared=(JSON.parse(prepared.canonico) as {datos:Record<string,unknown>}).datos
 const auth=await deps.admin.auth.getUser(token),actorAuthId=auth.data.user?.id
 if(auth.error||!fiscalUuid(actorAuthId))return fail()
 async function read():Promise<Readonly<FiscalRejectedCorrection>|null> {
  const response=await deps.admin.rpc('consultar_correccion_rechazo_homologacion',{p_actor_auth_id:actorAuthId,p_venta_id:sale,p_operacion_id:operation})
  if(response.error)return fail()
  if(response.data===null)return null
  const value=validateFiscalRejectedCorrection(response.data,sale,operation)
  if(value.sucesora_id!==successor||value.anterior_sha256!==previousHash||value.preparacion_sha256!==prepared.sha256
   ||(await freezeFiscalRequest({...declared,numero:value.numero})).sha256!==value.sucesora_sha256)return fail()
  return value
 }
 const stored=await read();if(stored)return stored
 const enabled=()=>{if(deps.readSecret('ARCA_HOMO_REJECTION_RECOVERY_ENABLED')!=='true')throw new Error('FISCAL_CORRECCION_RECHAZO_NO_HABILITADA')}
 enabled()
 async function source(){
  const response=await deps.admin.rpc('cargar_fuente_correccion_rechazo_homologacion',{p_actor_auth_id:actorAuthId,p_venta_id:sale,p_operacion_id:operation})
  if(response.error)return fail()
  const value=object(response.data,['operacion_id','venta_id','intento_id','revision','solicitud','binding'])
  if(value.operacion_id!==operation||value.venta_id!==sale||!fiscalUuid(value.intento_id)||value.revision!==1)return fail()
  const binding=validateFiscalWorkerBinding(value.binding,operation),frozen=await verifyFiscalRequest(value.solicitud),s=frozen.solicitud
  if(frozen.sha256!==previousHash||s.cuitEmisor!==binding.cuit_emisor||s.puntoVenta!==binding.punto_venta||s.puntoVenta>99998
   ||declared.cuitEmisor!==s.cuitEmisor||declared.puntoVenta!==s.puntoVenta||declared.tipoComprobante!==s.tipoComprobante)return fail()
  return {binding,frozen,attempt:value.intento_id}
 }
 try {
  const original=await source()
  const revalidate=async()=>{
   enabled();const fresh=await source()
   if(fresh.attempt!==original.attempt||Object.entries(original.binding).some(([key,v])=>fresh.binding[key as keyof typeof fresh.binding]!==v))return fail()
  }
  const ticket=await deps.cache.get(original.binding,deps.load),s=original.frozen.solicitud
  const absent=await consultFiscalVoucherAbsence(original.frozen,ticket,deps.fetcher,15000,revalidate)
  const last=await consultLastFiscalNumber({entorno:s.entorno,cuitEmisor:s.cuitEmisor,puntoVenta:s.puntoVenta,tipoComprobante:s.tipoComprobante},ticket,deps.fetcher,15000,revalidate)
  if(last.ultimo!==s.numero-1)return fail()
  await revalidate()
  const verification={version:1,resultado:absent.estado,consulta:absent.consulta,codigo:absent.codigo,consultado_en:absent.consultado_en,
   ultimo_autorizado:last.ultimo,ultimo_consultado_en:last.consultado_en}
  try {await deps.admin.rpc('corregir_rechazo_fiscal_homologacion',{p_actor_auth_id:actorAuthId,p_venta_id:sale,p_operacion_id:operation,p_sucesora_id:successor,
   p_intento_id:original.attempt,p_anterior_sha:previousHash,p_canonico:prepared.canonico,p_sha:prepared.sha256,p_verificacion:verification})}catch{/* Leer el mismo cierre después de ACK perdido. */}
 }catch{
  const recovered=await read();if(recovered)return recovered
  return fail()
 }
 const result=await read();if(!result)return fail();return result
}

export async function correctRejectedFiscalVoucher(deps:FiscalEmissionDependencies,token:string,sale:string,operation:string,successor:string,previousHash:string,proposal:unknown):Promise<Readonly<FiscalRejectedCorrection>> {
 try{return await runRejectedFiscalCorrection(deps,token,sale,operation,successor,previousHash,proposal)}
 catch(error){
  if(error instanceof Error&&error.message==='FISCAL_CORRECCION_RECHAZO_NO_HABILITADA')throw new Error('FISCAL_CORRECCION_RECHAZO_NO_HABILITADA')
  return fail()
 }
}
