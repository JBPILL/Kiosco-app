import type { FiscalCreditDraftScope } from './fiscalCreditDraftAck.ts'
import { fiscalUuid,fiscalSha } from './fiscalReplacement.ts'
export type FiscalCreditTransportState='SIN_INTENCION'|'ENVIO_INCIERTO'|'RECHAZO_RECIBIDO'|'CONFLICTO_NC'|'CAE_CONFIRMADO'
export type FiscalCreditTransportIncident='RESPUESTA_INVALIDA'|'SIN_CONFIRMACION'|'DATOS_DISTINTOS'|'ASOCIACION_INCOMPLETA'|'CAE_CONTRADICTORIO'
export interface FiscalCreditTransportStatus {
 version:1;venta_id:string;operacion_origen_id:string;solicitud_id:string;propuesta_sha256:string;cuerpo_sha256:string;estado:FiscalCreditTransportState
 intento_id:string|null;revision_id:string|null;consulta_id:string|null;cae:string|null;vencimiento:string|null;codigos:readonly number[];resolucion_registrada:boolean
 incidencia:FiscalCreditTransportIncident|null
 emision_habilitada:false;reintegro_habilitado:false;reposicion_habilitada:false
}
const fail=():never=>{throw new Error('FISCAL_ESTADO_ENVIO_NC_NO_CONFIRMADO')}
export function validateFiscalCreditTransportStatus(input:unknown,scope:Readonly<FiscalCreditDraftScope>,expectedBody?:string):Readonly<FiscalCreditTransportStatus>{
 if(!fiscalUuid(scope.saleId)||!fiscalUuid(scope.operationId)||!fiscalUuid(scope.requestId)||!fiscalSha(scope.sha256)||expectedBody!==undefined&&!fiscalSha(expectedBody))return fail()
 if(!input||typeof input!=='object'||Array.isArray(input))return fail()
 const r=structuredClone(input) as Record<string,unknown>,keys=['version','venta_id','operacion_origen_id','solicitud_id','propuesta_sha256','cuerpo_sha256','estado','incidencia','intento_id','revision_id','consulta_id','cae','vencimiento','codigos','resolucion_registrada','emision_habilitada','reintegro_habilitado','reposicion_habilitada']
 if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k))||r.version!==1||r.venta_id!==scope.saleId||r.operacion_origen_id!==scope.operationId||r.solicitud_id!==scope.requestId||r.propuesta_sha256!==scope.sha256||!fiscalSha(r.cuerpo_sha256)||expectedBody!==undefined&&r.cuerpo_sha256!==expectedBody||typeof r.resolucion_registrada!=='boolean'||r.emision_habilitada!==false||r.reintegro_habilitado!==false||r.reposicion_habilitada!==false)return fail()
 if(r.estado!=='SIN_INTENCION'&&r.estado!=='ENVIO_INCIERTO'&&r.estado!=='RECHAZO_RECIBIDO'&&r.estado!=='CONFLICTO_NC'&&r.estado!=='CAE_CONFIRMADO')return fail()
 if(!Array.isArray(r.codigos)||r.codigos.length>200||r.codigos.some(c=>!Number.isInteger(c)||c<1||c>2147483647))return fail()
 if(r.incidencia!==null&&!['RESPUESTA_INVALIDA','SIN_CONFIRMACION','DATOS_DISTINTOS','ASOCIACION_INCOMPLETA','CAE_CONTRADICTORIO'].includes(String(r.incidencia)))return fail()
 if((r.estado==='SIN_INTENCION'||r.estado==='CAE_CONFIRMADO')&&r.incidencia!==null)return fail()
 if(r.estado==='SIN_INTENCION'){if(r.intento_id!==null||r.revision_id!==null||r.consulta_id!==null||r.cae!==null||r.vencimiento!==null||r.resolucion_registrada||r.codigos.length)return fail()}
 else if(!fiscalUuid(r.intento_id)||!fiscalUuid(r.revision_id)||r.consulta_id!==null&&!fiscalUuid(r.consulta_id))return fail()
 if(r.estado==='CAE_CONFIRMADO'){
  if(!fiscalUuid(r.consulta_id)||typeof r.cae!=='string'||!/^\d{14}$/.test(r.cae)||/^0+$/.test(r.cae)||typeof r.vencimiento!=='string'||!/^\d{8}$/.test(r.vencimiento)||r.vencimiento.startsWith('0000'))return fail()
  const date=r.vencimiento.slice(0,4)+'-'+r.vencimiento.slice(4,6)+'-'+r.vencimiento.slice(6,8),parsed=new Date(date+'T00:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return fail()
 }else if(r.cae!==null||r.vencimiento!==null)return fail()
 return Object.freeze({version:1,venta_id:scope.saleId,operacion_origen_id:scope.operationId,solicitud_id:scope.requestId,propuesta_sha256:scope.sha256,cuerpo_sha256:r.cuerpo_sha256,estado:r.estado,incidencia:r.incidencia as FiscalCreditTransportIncident|null,intento_id:r.intento_id as string|null,revision_id:r.revision_id as string|null,consulta_id:r.consulta_id as string|null,cae:r.cae as string|null,vencimiento:r.vencimiento as string|null,codigos:Object.freeze([...r.codigos]),resolucion_registrada:r.resolucion_registrada,emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false})
}
