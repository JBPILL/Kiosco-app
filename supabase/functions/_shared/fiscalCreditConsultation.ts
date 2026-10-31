import type { FiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import type { FiscalCreditConsultIntent } from './fiscalCreditConsultSource.ts'
import type { FiscalCreditVoucherQueryResult } from './fiscalCreditVoucherQuery.ts'
import type { FiscalCreditVoucherReconciliation } from './fiscalCreditVoucherXml.ts'
import { fiscalUuid } from './fiscalReplacement.ts'
export interface FiscalCreditConsultationReceipt {version:1;consulta_id:string;solicitud_id:string;intento_id:string;solicitud_sha256:string;estado:'CAE_NC_REGISTRADO_NO_APLICADO'|'CONSULTA_NC_REGISTRADA'|'CONFLICTO_NC_NO_APLICAR';observacion:Readonly<FiscalCreditVoucherQueryResult>;emision_habilitada:false;reintegro_habilitado:false;reposicion_habilitada:false}
const fail=():never=>{throw new Error('FISCAL_DIARIO_NC_NO_CONFIRMADO')}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return fail();const v=value as Record<string,unknown>;if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))return fail();return v}
function date(value:unknown):string{if(typeof value!=='string'||!/^\d{8}$/.test(value)||value.startsWith('0000'))return fail();const iso=value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8),d=new Date(iso+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==iso)return fail();return value}
/** Forma/enlace de042 histórico; no acredita emisor actual ni habilita envío. */
export function validateFiscalCreditIntentRecord(input:unknown,body:Readonly<FiscalCreditRequestRecord>,actor:string):Readonly<FiscalCreditConsultIntent>{
 const p=object(structuredClone(input),['version','estado','solicitud_id','operacion_origen_id','intento_id','permiso_id','revision_id','reserva_id','propuesta_sha256','preparacion_sha256','solicitud_sha256','actor_auth_id','nuevo_envio','emision_habilitada']),d=body.datos
 if(p.version!==1||p.estado!=='ENVIO_INCIERTO'||p.nuevo_envio!==false||p.emision_habilitada!==false||p.actor_auth_id!==actor||!fiscalUuid(actor)||!fiscalUuid(p.intento_id)||!fiscalUuid(p.permiso_id)||!fiscalUuid(p.revision_id)||p.solicitud_id!==d.solicitud_id||p.operacion_origen_id!==d.operacion_origen_id||p.reserva_id!==d.reserva_id||p.propuesta_sha256!==d.propuesta_sha256||p.preparacion_sha256!==d.preparacion_sha256||p.solicitud_sha256!==body.sha256)return fail()
 return Object.freeze({version:1,estado:'ENVIO_INCIERTO',solicitud_id:d.solicitud_id,operacion_origen_id:d.operacion_origen_id,intento_id:p.intento_id,permiso_id:p.permiso_id,revision_id:p.revision_id,reserva_id:d.reserva_id,propuesta_sha256:d.propuesta_sha256,preparacion_sha256:d.preparacion_sha256,solicitud_sha256:body.sha256,actor_auth_id:actor,nuevo_envio:false,emision_habilitada:false})
}
/** Receipt047/048 validado desde GET privado, no un payload de aprobación del cliente. */
export function validateFiscalCreditConsultation(input:unknown,body:Readonly<FiscalCreditRequestRecord>,intent:Readonly<FiscalCreditConsultIntent>,queryId?:string):Readonly<FiscalCreditConsultationReceipt>{
 const r=object(structuredClone(input),['version','consulta_id','solicitud_id','intento_id','solicitud_sha256','estado','observacion','emision_habilitada','reintegro_habilitado','reposicion_habilitada'])
 if(r.version!==1||!fiscalUuid(r.consulta_id)||queryId!==undefined&&r.consulta_id!==queryId||r.solicitud_id!==body.datos.solicitud_id||r.intento_id!==intent.intento_id||r.solicitud_sha256!==body.sha256||r.emision_habilitada!==false||r.reintegro_habilitado!==false||r.reposicion_habilitada!==false)return fail()
 const o=object(r.observacion,['intento_id','solicitud_sha256','consultado_en','resultado','emision_habilitada'])
 if(o.intento_id!==intent.intento_id||o.solicitud_sha256!==body.sha256||o.emision_habilitada!==false||typeof o.consultado_en!=='string'||!Number.isFinite(Date.parse(o.consultado_en)))return fail()
 const raw=o.resultado;let result:FiscalCreditVoucherReconciliation,state:FiscalCreditConsultationReceipt['estado']
 if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&'estado' in raw&&raw.estado==='CONCILIAR'){
  const v=object(raw,['estado','codigo','puedeReenviar']);if(v.puedeReenviar!==false||v.codigo!=='RESPUESTA_INVALIDA'&&v.codigo!=='SIN_CONFIRMACION'&&v.codigo!=='DATOS_DISTINTOS'&&v.codigo!=='ASOCIACION_INCOMPLETA')return fail()
  result={estado:'CONCILIAR',codigo:v.codigo,puedeReenviar:false};state='CONSULTA_NC_REGISTRADA'
 }else{
  const v=object(raw,['estado','cae','vencimiento','procesadoEn','solicitudSha256','puedeReenviar'])
  if(v.estado!=='AUTORIZACION_NC_COINCIDENTE'||v.puedeReenviar!==false||v.solicitudSha256!==body.sha256||typeof v.cae!=='string'||!/^\d{14}$/.test(v.cae)||/^0+$/.test(v.cae)||typeof v.procesadoEn!=='string'||!/^\d{8}(?:\d{6})?$/.test(v.procesadoEn))return fail()
  const expiry=date(v.vencimiento),processed=date(v.procesadoEn.slice(0,8));if(expiry<body.datos.solicitud.fecha||processed<body.datos.solicitud.fecha||processed>expiry||v.procesadoEn.length===14&&(Number(v.procesadoEn.slice(8,10))>23||Number(v.procesadoEn.slice(10,12))>59||Number(v.procesadoEn.slice(12,14))>59))return fail()
  result={estado:'AUTORIZACION_NC_COINCIDENTE',cae:v.cae,vencimiento:expiry,procesadoEn:v.procesadoEn,solicitudSha256:body.sha256,puedeReenviar:false};state='CAE_NC_REGISTRADO_NO_APLICADO'
 }
 if(r.estado==='CONFLICTO_NC_NO_APLICAR'){
  if(result.estado!=='AUTORIZACION_NC_COINCIDENTE'&&result.codigo!=='DATOS_DISTINTOS')return fail()
  state='CONFLICTO_NC_NO_APLICAR'
 }
 if(r.estado!==state)return fail()
 const observation:FiscalCreditVoucherQueryResult={intento_id:intent.intento_id,solicitud_sha256:body.sha256,consultado_en:o.consultado_en,resultado:Object.freeze(result),emision_habilitada:false}
 return Object.freeze({version:1,consulta_id:r.consulta_id,solicitud_id:body.datos.solicitud_id,intento_id:intent.intento_id,solicitud_sha256:body.sha256,estado:state,observacion:Object.freeze(observation),emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false})
}
