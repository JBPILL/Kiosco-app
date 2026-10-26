import type { FiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import type { FiscalCreditConsultIntent } from './fiscalCreditConsultSource.ts'
import type { FiscalEmissionReceipt } from './fiscalEmissionReceipt.ts'
import { validateFiscalEmissionReceipt } from './fiscalEmissionReceipt.ts'
export interface FiscalCreditSendObservation {intento_id:string;solicitud_sha256:string;recibido_en:string;resultado:Readonly<FiscalEmissionReceipt>;emision_habilitada:false}
export interface FiscalCreditSendResponse {version:1;solicitud_id:string;intento_id:string;solicitud_sha256:string;estado:'RESPUESTA_NC_REGISTRADA_NO_CONFIRMADA';observacion:Readonly<FiscalCreditSendObservation>;emision_habilitada:false;reintegro_habilitado:false;reposicion_habilitada:false}
const fail=():never=>{throw new Error('FISCAL_RESPUESTA_NC_NO_CONFIRMADA')}
function object(v:unknown,keys:readonly string[]):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))return fail();const value=v as Record<string,unknown>;if(Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))return fail();return value}
/** Recuperación histórica de049, nunca prueba de CAE ni permiso de reenvío. */
export function validateFiscalCreditSendResponse(input:unknown,body:Readonly<FiscalCreditRequestRecord>,intent:Readonly<FiscalCreditConsultIntent>):Readonly<FiscalCreditSendResponse>{
 const r=object(structuredClone(input),['version','solicitud_id','intento_id','solicitud_sha256','estado','observacion','emision_habilitada','reintegro_habilitado','reposicion_habilitada'])
 if(r.version!==1||r.solicitud_id!==body.datos.solicitud_id||r.intento_id!==intent.intento_id||r.solicitud_sha256!==body.sha256||r.estado!=='RESPUESTA_NC_REGISTRADA_NO_CONFIRMADA'||r.emision_habilitada!==false||r.reintegro_habilitado!==false||r.reposicion_habilitada!==false)return fail()
 const o=object(r.observacion,['intento_id','solicitud_sha256','recibido_en','resultado','emision_habilitada'])
 if(o.intento_id!==intent.intento_id||o.solicitud_sha256!==body.sha256||o.emision_habilitada!==false||typeof o.recibido_en!=='string'||!Number.isFinite(Date.parse(o.recibido_en)))return fail()
 const resultado=validateFiscalEmissionReceipt(o.resultado)
 return Object.freeze({version:1,solicitud_id:body.datos.solicitud_id,intento_id:intent.intento_id,solicitud_sha256:body.sha256,estado:'RESPUESTA_NC_REGISTRADA_NO_CONFIRMADA',observacion:Object.freeze({intento_id:intent.intento_id,solicitud_sha256:body.sha256,recibido_en:o.recibido_en,resultado,emision_habilitada:false}),emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false})
}
