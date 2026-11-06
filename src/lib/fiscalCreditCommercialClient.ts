import type { FiscalClientScope } from './fiscalClient'
import type { FiscalCreditClientDependencies } from './fiscalCreditClient'
import type { FiscalCreditDraftScope } from '../../supabase/functions/_shared/fiscalCreditDraftAck'
import { validateFiscalCreditCommercialApplication } from '../../supabase/functions/_shared/fiscalCreditCommercialApplication'
import { fiscalSha,fiscalUuid } from '../../supabase/functions/_shared/fiscalReplacement'
export interface PendingFiscalCreditCommercial {version:1;operationId:string;requestId:string;sha256:string;cashId:string}
const fail=():never=>{throw new Error('FISCAL_APLICACION_NC_CLIENTE_NO_CONFIRMADA')}
/** IDs only. Browser storage and POST ACKs never establish commercial success. */
export function createFiscalCreditCommercialClient(input:FiscalClientScope,deps:FiscalCreditClientDependencies,blocked:()=>boolean){
 const scope=Object.freeze({...input});if(![scope.authId,scope.kioskId,scope.saleId].every(fiscalUuid))return fail()
 const sale=scope.saleId.toLowerCase(),key=`kioskopos:fiscal:v1:${scope.authId.toLowerCase()}:${scope.kioskId.toLowerCase()}:${sale}:credit:commercial`
 const pending=():Readonly<PendingFiscalCreditCommercial>|null=>{
  const raw=deps.storage.getItem(key);if(raw===null||raw==='null')return null;if(raw.length>2048)return fail()
  const value:unknown=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))return fail()
  const r=value as Record<string,unknown>,keys=['version','operationId','requestId','sha256','cashId']
  if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k))||r.version!==1||!fiscalUuid(r.operationId)||!fiscalUuid(r.requestId)||!fiscalSha(r.sha256)||!fiscalUuid(r.cashId))return fail()
  return Object.freeze({version:1,operationId:r.operationId,requestId:r.requestId,sha256:r.sha256,cashId:r.cashId})
 }
 const write=(r:Readonly<PendingFiscalCreditCommercial>|null)=>{deps.storage.setItem(key,JSON.stringify(r));if(JSON.stringify(pending())!==JSON.stringify(r))return fail()}
 const command=(accion:'APLICACION_NC'|'APLICAR_NC',r:Readonly<PendingFiscalCreditCommercial>)=>({accion,venta_id:sale,operacion_origen_id:r.operationId,solicitud_id:r.requestId,propuesta_sha256:r.sha256,...(accion==='APLICAR_NC'?{sesion_caja_id:r.cashId}:{})})
 const read=async(r:Readonly<PendingFiscalCreditCommercial>)=>{const value=await deps.invoke(command('APLICACION_NC',r));if(value===null)return null;const result=validateFiscalCreditCommercialApplication(value,{saleId:sale,operationId:r.operationId,requestId:r.requestId,sha256:r.sha256},r.cashId);if(result.kiosco_id!==scope.kioskId.toLowerCase())return fail();return result}
 const recover=async(r:Readonly<PendingFiscalCreditCommercial>)=>{const result=await read(r);if(!result||JSON.stringify(pending())!==JSON.stringify(r))return fail();write(null);return result}
 return{
  pending,
  async status(target:FiscalCreditDraftScope){try{
   const t=Object.freeze({...target});if(t.saleId!==sale||!fiscalUuid(t.operationId)||!fiscalUuid(t.requestId)||!fiscalSha(t.sha256))return fail()
   return await deps.exclusive(async()=>{
    const value=await deps.invoke({accion:'APLICACION_NC',venta_id:sale,operacion_origen_id:t.operationId,solicitud_id:t.requestId,propuesta_sha256:t.sha256})
    if(value===null)return null
    if(!value||typeof value!=='object'||Array.isArray(value)||!('sesion_caja_id' in value)||!fiscalUuid(value.sesion_caja_id))return fail()
    const result=validateFiscalCreditCommercialApplication(value,t,value.sesion_caja_id);if(result.kiosco_id!==scope.kioskId.toLowerCase())return fail();return result
   })
  }catch{return fail()}},
  async recover(){try{return await deps.exclusive(async()=>{const r=pending();return r?recover(r):null})}catch{return fail()}},
  async apply(target:FiscalCreditDraftScope,cashId:string){
   try{
    const t=Object.freeze({...target});if(t.saleId!==sale||!fiscalUuid(t.operationId)||!fiscalUuid(t.requestId)||!fiscalSha(t.sha256)||!fiscalUuid(cashId))return fail()
    return await deps.exclusive(async()=>{
     if(blocked())return fail();const prior=pending();if(prior){if(prior.operationId!==t.operationId||prior.requestId!==t.requestId||prior.sha256!==t.sha256||prior.cashId!==cashId)return fail();return recover(prior)}
     const r:Readonly<PendingFiscalCreditCommercial>=Object.freeze({version:1,operationId:t.operationId,requestId:t.requestId,sha256:t.sha256,cashId})
     const old=await read(r);if(old)return old
     write(r)
     if(blocked()||JSON.stringify(pending())!==JSON.stringify(r))return fail()
     try{await deps.invoke(command('APLICAR_NC',r))}catch{/* Preserve original identity until GET confirms. */}
     return recover(r)
    })
   }catch{return fail()}
  },
  /** Explicit owner decision only; never replace the stored case/hash/cash identity. */
  async retry(){try{return await deps.exclusive(async()=>{
   if(blocked())return fail();const r=pending();if(!r)return fail()
   try{return await recover(r)}catch{/* Read failure is not proof of absence; this explicit retry remains idempotent. */}
   if(blocked()||JSON.stringify(pending())!==JSON.stringify(r))return fail()
   try{await deps.invoke(command('APLICAR_NC',r))}catch{/* Confirm only through original GET. */}
   return recover(r)
  })}catch{return fail()}},
 }
}
