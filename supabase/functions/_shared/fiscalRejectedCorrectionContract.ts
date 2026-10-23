import { fiscalUuid, fiscalSha } from './fiscalReplacement.ts'
import type { FiscalReplacement } from './fiscalReplacement.ts'
export type FiscalRejectedCorrection = Omit<FiscalReplacement,'estado'> & {estado:'RECHAZO_CORREGIDO'}
const fail=():never=>{throw new Error('FISCAL_RECHAZO_NO_CONFIRMADO')}
function object(input:unknown,keys:string[]):Record<string,unknown> {
 if(!input||typeof input!=='object'||Array.isArray(input))return fail()
 const v=input as Record<string,unknown>
 if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))return fail()
 return v
}
export function validateFiscalRejectedCorrection(input:unknown,sale:string,operation:string):Readonly<FiscalRejectedCorrection> {
 const v=object(input,['operacion_id','sucesora_id','venta_id','anterior_sha256','preparacion_sha256','sucesora_sha256','numero','estado','emision_habilitada'])
 if(!fiscalUuid(sale)||!fiscalUuid(operation)||v.operacion_id!==operation||v.venta_id!==sale||!fiscalUuid(v.sucesora_id)||v.sucesora_id===operation
  ||![v.anterior_sha256,v.preparacion_sha256,v.sucesora_sha256].every(fiscalSha)||!Number.isSafeInteger(v.numero)||Number(v.numero)<1||Number(v.numero)>99999999
  ||v.estado!=='RECHAZO_CORREGIDO'||v.emision_habilitada!==false)return fail()
 return Object.freeze({...v}) as unknown as Readonly<FiscalRejectedCorrection>
}
