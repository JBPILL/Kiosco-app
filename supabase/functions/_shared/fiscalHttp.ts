import { reconcileFiscalCreditOperation } from './fiscalCreditConsultWorker.ts'
import { loadFiscalRepresentation } from './fiscalRepresentationService.ts'
import { loadFiscalCreditOwnerReview, approveFiscalCreditOwnerReview } from './fiscalCreditOwnerReviewService.ts'
import { fiscalCreditOwnerReviewWire } from './fiscalCreditOwnerReview.ts'
import { loadFiscalCreditRequest } from './fiscalCreditDraftService.ts'
import { prepareFiscalCreditNumber } from './fiscalCreditNumberWorker.ts'
import { createCreditConsultWsaaTicketSource, createCreditWsaaTicketSource } from './fiscalCreditWsaa.ts'
import { createPrivateCreditConsultFiscalCustody, createPrivateCreditFiscalCustody } from './fiscalPrivateCustody.ts'
import { fiscalCreditPreparationWire } from './fiscalCreditPreparation.ts'
import { saveFiscalCreditDraft, loadFiscalCreditDraft, cancelFiscalCreditDraft, loadFiscalCreditHistory, loadFiscalCreditCommercialSource, loadFiscalCreditUnits, loadFiscalCreditContext, loadFiscalCreditPreparation, saveFiscalCreditPreparation } from './fiscalCreditDraftService.ts'
import { fiscalCreditUnitsWire } from './fiscalCreditUnits.ts'
import { fiscalCreditHistoryWire } from './fiscalCreditHistory.ts'
import { fiscalRepresentationWire } from './fiscalRepresentation.ts'
import { loadFiscalPresentationContext } from './fiscalPresentationContextService.ts'
import { loadFiscalPresentation,saveFiscalPresentation } from './fiscalPresentationService.ts'
import { loadFiscalPresentationApproval,approveFiscalPresentation } from './fiscalPresentationReviewService.ts'
import { loadFiscalObservation } from './fiscalObservationService.ts'
import { correctRejectedFiscalVoucher } from './fiscalRejectedCorrection.ts'
import { loadFiscalRejectedCorrection } from './fiscalRejectedCorrectionService.ts'
import { loadFiscalReplacement, replaceFiscalPreparation } from './fiscalReplacementService.ts'
import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import { authorizeFiscalActor } from './fiscalWorkerAuthorization.ts'
import { reconcileAuthorizedFiscalVoucher } from './fiscalAuthorizedReconciliation.ts'
import { createFiscalTicketCache } from './fiscalTicketCache.ts'
import { createSharedFiscalTicketLoader } from './fiscalSharedTickets.ts'
import { createPrivateFiscalCustody, createPrivateFiscalTicketKeys } from './fiscalPrivateCustody.ts'
import type { FiscalSecretReader } from './fiscalPrivateCustody.ts'
import { createWsaaTicketSource } from './fiscalWsaa.ts'
import { FISCAL_STAGING_URL } from './fiscalSupabaseAdmin.ts'
import { withFiscalDeadline } from './fiscalVoucherXml.ts'
import { validateFiscalOwnerReview, validateFiscalOwnerApproval } from './fiscalOwnerReview.ts'
import { loadFiscalPreparation, resolveFiscalSale, saveFiscalPreparation } from './fiscalPreparationService.ts'
import { parseFiscalJson } from './fiscalStrictJson.ts'
import { prepareFiscalVoucher } from './fiscalPreparationWorker.ts'
import { loadFiscalReceipt, loadFiscalDiagnosis } from './fiscalReceiptService.ts'
import { cancelFiscalPreparation, loadFiscalPreparationCancellation } from './fiscalCancellationService.ts'

const origin='https://kiosco-app-staging.vercel.app'
const invalid=():never=>{throw new Error('FISCAL_SOLICITUD_INVALIDA')}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
type FiscalHttpCommand=
  | {accion:'CONCILIAR_NC';venta_id:string;operacion_origen_id:string;solicitud_id:string;propuesta_sha256:string;consulta_id:string}
  | {accion:'CUERPO_NC';venta_id:string;operacion_origen_id:string;solicitud_id:string;propuesta_sha256:string}
  | {accion:'NUMERAR_NC';venta_id:string;operacion_origen_id:string;solicitud_id:string;propuesta_sha256:string;preparacion_sha256:string;reserva_id:string}
  | {accion:'REVISION_NC';venta_id:string;operacion_origen_id:string;solicitud_id:string;propuesta_sha256:string;revision_id:string|null}
  | {accion:'APROBAR_REVISION_NC';venta_id:string;operacion_origen_id:string;solicitud_id:string;propuesta_sha256:string;revision_id:string;cuerpo_sha256:string;preparacion_sha256:string}
  | {accion:'PREPARACION_NC';venta_id:string;operacion_origen_id:string;solicitud_id:string;propuesta_sha256:string}
  | {accion:'GUARDAR_PREPARACION_NC';venta_id:string;operacion_origen_id:string;solicitud_id:string;propuesta_sha256:string;contexto_sha256:string;entrada:unknown}
  | {accion:'CONTEXTO_NC';venta_id:string;operacion_origen_id:string;solicitud_id:string;propuesta_sha256:string}
  | {accion:'UNIDADES_NC';venta_id:string;operacion_origen_id:string}
  | {accion:'FUENTE_COMERCIAL_NC';venta_id:string;operacion_origen_id:string}
  | {accion:'HISTORIAL_BORRADORES_NC';venta_id:string;operacion_origen_id:string;despues:number}
  | {accion:'GUARDAR_BORRADOR_NC';venta_id:string;operacion_origen_id:string;propuesta:unknown}
  | {accion:'BORRADOR_NC';venta_id:string;operacion_origen_id:string;solicitud_id:string;propuesta_sha256:string}
  | {accion:'CANCELAR_BORRADOR_NC';venta_id:string;operacion_origen_id:string;solicitud_id:string;propuesta_sha256:string}
  | {accion:'REPRESENTACION_COMPROBANTE';venta_id:string;operacion_id:string}
  | {accion:'CONTEXTO_REPRESENTACION';venta_id:string;operacion_id:string}
  | {accion:'DATOS_REPRESENTACION';venta_id:string;operacion_id:string}
  | {accion:'GUARDAR_REPRESENTACION';venta_id:string;operacion_id:string;solicitud_sha256:string;propuesta:unknown}
  | {accion:'APROBAR_REPRESENTACION';venta_id:string;operacion_id:string;revision_id:string;solicitud_sha256:string;revision:1;presentacion_sha256:string}
  | {accion:'APROBACION_REPRESENTACION';venta_id:string;operacion_id:string;revision_id:string;solicitud_sha256:string;revision:1;presentacion_sha256:string}
  | {accion:'CONSULTAR_CONCILIACION';venta_id:string;operacion_id:string;observacion_id:string}
  | {accion:'CORRECCION_RECHAZO_FISCAL';venta_id:string;operacion_id:string}
  | {accion:'SUSTITUIR_PREPARACION_FISCAL';venta_id:string;operacion_id:string;sucesora_id:string;anterior_sha256:string;propuesta:unknown}
  | {accion:'CORREGIR_RECHAZO_FISCAL';venta_id:string;operacion_id:string;sucesora_id:string;anterior_sha256:string;propuesta:unknown}
  | {accion:'SUSTITUCION_PREPARACION_FISCAL';venta_id:string;operacion_id:string}
  | {accion:'CANCELAR_PREPARACION_FISCAL';venta_id:string;operacion_id:string}
  | {accion:'CANCELACION_PREPARACION_FISCAL';venta_id:string;operacion_id:string}
  | {accion:'CONSTANCIA_COMPROBANTE';venta_id:string;operacion_id:string}
  | {accion:'DIAGNOSTICO_COMPROBANTE';venta_id:string;operacion_id:string}
  | {accion:'RESOLVER_VENTA';venta_id:string}
  | {accion:'DATOS_FISCALES_VENTA';venta_id:string}
  | {accion:'GUARDAR_DATOS_FISCALES';venta_id:string;operacion_id:string;entrada:unknown}
  | {accion:'CONCILIAR';operacion_id:string;observacion_id:string}
  | {accion:'ESTADO_TA';operacion_id:string}
  | {accion:'REVISAR_COMPROBANTE';operacion_id:string}
  | {accion:'PREPARAR_COMPROBANTE';operacion_id:string}
  | {accion:'APROBAR_REVISION';operacion_id:string;revision_id:string;solicitud_sha256:string;revision:number}
  | {accion:'CANCELAR_PREPARACION_TA';operacion_id:string;intento_id:string;revision:number}

async function command(request:Request):Promise<FiscalHttpCommand> {
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??'')
    ||!['', 'identity'].includes(request.headers.get('content-encoding')??''))return invalid()
  const length=request.headers.get('content-length')
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>65536))return invalid()
  const reader=request.body?.getReader();if(!reader)return invalid()
  const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,3000)
  request.signal.addEventListener('abort',abort,{once:true})
  try {
    if(request.signal.aborted)return invalid()
    const chunks:Uint8Array[]=[];let size=0
    while(true){const part=await withFiscalDeadline(reader.read(),controller.signal);if(part.done)break
      size+=part.value.length;if(size>65536)return invalid();chunks.push(part.value)}
    const bytes=new Uint8Array(size);let offset=0
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),parsed:unknown=parseFiscalJson(text)
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return invalid()
    const b=parsed as Record<string,unknown>,keys=Object.keys(b)
    if(b.accion==='CONCILIAR_NC'&&size<=2048&&(length===null||Number(length)<=2048)&&keys.length===6
      &&keys.every(k=>['accion','venta_id','operacion_origen_id','solicitud_id','propuesta_sha256','consulta_id'].includes(k))
      &&uuid(b.venta_id)&&uuid(b.operacion_origen_id)&&uuid(b.solicitud_id)&&uuid(b.consulta_id)
      &&typeof b.propuesta_sha256==='string'&&/^[0-9a-f]{64}$/.test(b.propuesta_sha256))return {accion:b.accion,venta_id:b.venta_id,operacion_origen_id:b.operacion_origen_id,solicitud_id:b.solicitud_id,propuesta_sha256:b.propuesta_sha256,consulta_id:b.consulta_id}
    if(b.accion==='NUMERAR_NC'&&size<=2048&&(length===null||Number(length)<=2048)&&keys.length===7
      &&keys.every(k=>['accion','venta_id','operacion_origen_id','solicitud_id','propuesta_sha256','preparacion_sha256','reserva_id'].includes(k))
      &&uuid(b.venta_id)&&uuid(b.operacion_origen_id)&&uuid(b.solicitud_id)&&uuid(b.reserva_id)
      &&typeof b.propuesta_sha256==='string'&&/^[0-9a-f]{64}$/.test(b.propuesta_sha256)&&typeof b.preparacion_sha256==='string'&&/^[0-9a-f]{64}$/.test(b.preparacion_sha256))
      return {accion:b.accion,venta_id:b.venta_id.toLowerCase(),operacion_origen_id:b.operacion_origen_id.toLowerCase(),solicitud_id:b.solicitud_id.toLowerCase(),propuesta_sha256:b.propuesta_sha256,preparacion_sha256:b.preparacion_sha256,reserva_id:b.reserva_id.toLowerCase()}
    if((b.accion==='REVISION_NC'||b.accion==='APROBAR_REVISION_NC')&&size<=2048&&(length===null||Number(length)<=2048)
      &&uuid(b.venta_id)&&uuid(b.operacion_origen_id)&&uuid(b.solicitud_id)&&typeof b.propuesta_sha256==='string'&&/^[0-9a-f]{64}$/.test(b.propuesta_sha256)){
      const scope={venta_id:b.venta_id.toLowerCase(),operacion_origen_id:b.operacion_origen_id.toLowerCase(),solicitud_id:b.solicitud_id.toLowerCase(),propuesta_sha256:b.propuesta_sha256}
      if(b.accion==='REVISION_NC'&&keys.length===6&&keys.every(k=>['accion','venta_id','operacion_origen_id','solicitud_id','propuesta_sha256','revision_id'].includes(k))&&(b.revision_id===null||uuid(b.revision_id)))
        return {accion:b.accion,...scope,revision_id:b.revision_id===null?null:b.revision_id.toLowerCase()}
      if(b.accion==='APROBAR_REVISION_NC'&&keys.length===8&&keys.every(k=>['accion','venta_id','operacion_origen_id','solicitud_id','propuesta_sha256','revision_id','cuerpo_sha256','preparacion_sha256'].includes(k))
        &&uuid(b.revision_id)&&typeof b.cuerpo_sha256==='string'&&/^[0-9a-f]{64}$/.test(b.cuerpo_sha256)&&typeof b.preparacion_sha256==='string'&&/^[0-9a-f]{64}$/.test(b.preparacion_sha256))
        return {accion:b.accion,...scope,revision_id:b.revision_id.toLowerCase(),cuerpo_sha256:b.cuerpo_sha256,preparacion_sha256:b.preparacion_sha256}
      return invalid()
    }
    if(b.accion==='GUARDAR_PREPARACION_NC'&&size<=2048&&(length===null||Number(length)<=2048)&&keys.length===7
      &&keys.every(k=>['accion','venta_id','operacion_origen_id','solicitud_id','propuesta_sha256','contexto_sha256','entrada'].includes(k))
      &&uuid(b.venta_id)&&uuid(b.operacion_origen_id)&&uuid(b.solicitud_id)
      &&typeof b.propuesta_sha256==='string'&&/^[0-9a-f]{64}$/.test(b.propuesta_sha256)
      &&typeof b.contexto_sha256==='string'&&/^[0-9a-f]{64}$/.test(b.contexto_sha256)
      &&b.entrada&&typeof b.entrada==='object'&&!Array.isArray(b.entrada)) {
      const entry=b.entrada as Record<string,unknown>
      if(Object.keys(entry).length!==3||!['servicioDesde','servicioHasta','vencimientoPago'].every(k=>Object.hasOwn(entry,k)
        &&(entry[k]===null||typeof entry[k]==='string'&&/^\d{8}$/.test(entry[k]))))return invalid()
      return {accion:b.accion,venta_id:b.venta_id.toLowerCase(),operacion_origen_id:b.operacion_origen_id.toLowerCase(),solicitud_id:b.solicitud_id.toLowerCase(),propuesta_sha256:b.propuesta_sha256,contexto_sha256:b.contexto_sha256,entrada:entry}
    }
    if((b.accion==='FUENTE_COMERCIAL_NC'||b.accion==='UNIDADES_NC')&&size<=2048&&(length===null||Number(length)<=2048)&&keys.length===3&&keys.every(k=>['accion','venta_id','operacion_origen_id'].includes(k))
      &&uuid(b.venta_id)&&uuid(b.operacion_origen_id))
      return {accion:b.accion,venta_id:b.venta_id.toLowerCase(),operacion_origen_id:b.operacion_origen_id.toLowerCase()}
    if(b.accion==='HISTORIAL_BORRADORES_NC'&&size<=2048&&(length===null||Number(length)<=2048)&&keys.length===4&&keys.every(k=>['accion','venta_id','operacion_origen_id','despues'].includes(k))
      &&uuid(b.venta_id)&&uuid(b.operacion_origen_id)&&typeof b.despues==='number'&&Number.isSafeInteger(b.despues)&&b.despues>=0&&b.despues<=2147483647)
      return {accion:b.accion,venta_id:b.venta_id.toLowerCase(),operacion_origen_id:b.operacion_origen_id.toLowerCase(),despues:b.despues}
    if(b.accion==='GUARDAR_BORRADOR_NC'&&keys.length===4&&keys.every(k=>['accion','venta_id','operacion_origen_id','propuesta'].includes(k))
      &&uuid(b.venta_id)&&uuid(b.operacion_origen_id)&&b.propuesta&&typeof b.propuesta==='object'&&!Array.isArray(b.propuesta))
      return {accion:b.accion,venta_id:b.venta_id.toLowerCase(),operacion_origen_id:b.operacion_origen_id.toLowerCase(),propuesta:b.propuesta}
    if((b.accion==='BORRADOR_NC'||b.accion==='CANCELAR_BORRADOR_NC'||b.accion==='CONTEXTO_NC'||b.accion==='PREPARACION_NC'||b.accion==='CUERPO_NC')&&size<=2048&&(length===null||Number(length)<=2048)&&keys.length===5
      &&keys.every(k=>['accion','venta_id','operacion_origen_id','solicitud_id','propuesta_sha256'].includes(k))
      &&uuid(b.venta_id)&&uuid(b.operacion_origen_id)&&uuid(b.solicitud_id)&&typeof b.propuesta_sha256==='string'&&/^[0-9a-f]{64}$/.test(b.propuesta_sha256))
      return {accion:b.accion,venta_id:b.venta_id.toLowerCase(),operacion_origen_id:b.operacion_origen_id.toLowerCase(),solicitud_id:b.solicitud_id.toLowerCase(),propuesta_sha256:b.propuesta_sha256}
    if((b.accion==='RESOLVER_VENTA'||b.accion==='DATOS_FISCALES_VENTA')&&keys.length===2&&uuid(b.venta_id)&&size<=2048&&(length===null||Number(length)<=2048))
      return b.accion==='RESOLVER_VENTA'?{accion:'RESOLVER_VENTA',venta_id:b.venta_id.toLowerCase()}:{accion:'DATOS_FISCALES_VENTA',venta_id:b.venta_id.toLowerCase()}
    if(b.accion==='GUARDAR_DATOS_FISCALES'&&keys.length===4&&keys.every(k=>['accion','venta_id','operacion_id','entrada'].includes(k))
      &&uuid(b.venta_id)&&uuid(b.operacion_id)&&b.entrada&&typeof b.entrada==='object'&&!Array.isArray(b.entrada))
      return {accion:b.accion,venta_id:b.venta_id.toLowerCase(),operacion_id:b.operacion_id.toLowerCase(),entrada:b.entrada}
    if(b.accion==='GUARDAR_REPRESENTACION'&&keys.length===5&&keys.every(k=>['accion','venta_id','operacion_id','solicitud_sha256','propuesta'].includes(k))
      &&uuid(b.venta_id)&&uuid(b.operacion_id)&&typeof b.solicitud_sha256==='string'&&/^[0-9a-f]{64}$/.test(b.solicitud_sha256)&&b.propuesta&&typeof b.propuesta==='object'&&!Array.isArray(b.propuesta))
      return {accion:b.accion,venta_id:b.venta_id.toLowerCase(),operacion_id:b.operacion_id.toLowerCase(),solicitud_sha256:b.solicitud_sha256,propuesta:b.propuesta}
    if((b.accion==='SUSTITUIR_PREPARACION_FISCAL'||b.accion==='CORREGIR_RECHAZO_FISCAL')&&keys.length===6&&keys.every(k=>['accion','venta_id','operacion_id','sucesora_id','anterior_sha256','propuesta'].includes(k))
      &&uuid(b.venta_id)&&uuid(b.operacion_id)&&uuid(b.sucesora_id)&&b.operacion_id!==b.sucesora_id&&typeof b.anterior_sha256==='string'&&/^[0-9a-f]{64}$/.test(b.anterior_sha256)
      &&b.propuesta&&typeof b.propuesta==='object'&&!Array.isArray(b.propuesta))
      return {accion:b.accion,venta_id:b.venta_id.toLowerCase(),operacion_id:b.operacion_id.toLowerCase(),sucesora_id:b.sucesora_id.toLowerCase(),anterior_sha256:b.anterior_sha256,propuesta:b.propuesta}
    if(size>2048||length!==null&&Number(length)>2048||!uuid(b.operacion_id))return invalid()
    const op=b.operacion_id.toLowerCase()
    if(b.accion==='REPRESENTACION_COMPROBANTE'&&keys.length===3&&uuid(b.venta_id))return {accion:b.accion,venta_id:b.venta_id.toLowerCase(),operacion_id:op}
    if((b.accion==='CONTEXTO_REPRESENTACION'||b.accion==='DATOS_REPRESENTACION')&&keys.length===3&&uuid(b.venta_id))return {accion:b.accion,operacion_id:op,venta_id:b.venta_id.toLowerCase()}
    if((b.accion==='APROBAR_REPRESENTACION'||b.accion==='APROBACION_REPRESENTACION')&&keys.length===7&&keys.every(k=>['accion','venta_id','operacion_id','revision_id','solicitud_sha256','revision','presentacion_sha256'].includes(k))
      &&uuid(b.venta_id)&&uuid(b.revision_id)&&typeof b.solicitud_sha256==='string'&&/^[0-9a-f]{64}$/.test(b.solicitud_sha256)&&b.revision===1&&typeof b.presentacion_sha256==='string'&&/^[0-9a-f]{64}$/.test(b.presentacion_sha256))
      return {accion:b.accion,venta_id:b.venta_id.toLowerCase(),operacion_id:op,revision_id:b.revision_id.toLowerCase(),solicitud_sha256:b.solicitud_sha256,revision:1,presentacion_sha256:b.presentacion_sha256}
    if(b.accion==='CONSULTAR_CONCILIACION'&&keys.length===4&&uuid(b.venta_id)&&uuid(b.observacion_id))return {accion:b.accion,operacion_id:op,venta_id:b.venta_id.toLowerCase(),observacion_id:b.observacion_id.toLowerCase()}
    if(b.accion==='CORRECCION_RECHAZO_FISCAL'&&keys.length===3&&uuid(b.venta_id))return {accion:b.accion,operacion_id:op,venta_id:b.venta_id.toLowerCase()}
    if(b.accion==='SUSTITUCION_PREPARACION_FISCAL'&&keys.length===3&&uuid(b.venta_id))return {accion:b.accion,operacion_id:op,venta_id:b.venta_id.toLowerCase()}
    if((b.accion==='CANCELAR_PREPARACION_FISCAL'||b.accion==='CANCELACION_PREPARACION_FISCAL')&&keys.length===3&&uuid(b.venta_id))return {accion:b.accion,operacion_id:op,venta_id:b.venta_id.toLowerCase()}
    if(b.accion==='CONSTANCIA_COMPROBANTE'&&keys.length===3&&uuid(b.venta_id))return {accion:b.accion,operacion_id:op,venta_id:b.venta_id.toLowerCase()}
    if(b.accion==='DIAGNOSTICO_COMPROBANTE'&&keys.length===3&&uuid(b.venta_id))return {accion:b.accion,operacion_id:op,venta_id:b.venta_id.toLowerCase()}
    if(b.accion==='ESTADO_TA'&&keys.length===2)return {accion:b.accion,operacion_id:op}
    if(b.accion==='REVISAR_COMPROBANTE'&&keys.length===2)return {accion:b.accion,operacion_id:op}
    if(b.accion==='PREPARAR_COMPROBANTE'&&keys.length===2)return {accion:b.accion,operacion_id:op}
    if(b.accion==='APROBAR_REVISION'&&keys.length===5&&uuid(b.revision_id)&&typeof b.solicitud_sha256==='string'&&/^[0-9a-f]{64}$/.test(b.solicitud_sha256)&&Number.isSafeInteger(b.revision)&&Number(b.revision)>0)
      return {accion:b.accion,operacion_id:op,revision_id:b.revision_id.toLowerCase(),solicitud_sha256:b.solicitud_sha256,revision:Number(b.revision)}
    if(b.accion==='CONCILIAR'&&keys.length===3&&uuid(b.observacion_id))return {accion:b.accion,operacion_id:op,observacion_id:b.observacion_id.toLowerCase()}
    if(b.accion==='CANCELAR_PREPARACION_TA'&&keys.length===4&&uuid(b.intento_id)&&Number.isSafeInteger(b.revision)&&Number(b.revision)>0)
      return {accion:b.accion,operacion_id:op,intento_id:b.intento_id.toLowerCase(),revision:Number(b.revision)}
    return invalid()
  }finally{clearTimeout(timer);controller.abort();request.signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});reader.releaseLock()}
}
function taResult(value:unknown,cmd:Extract<FiscalHttpCommand,{accion:'ESTADO_TA'|'CANCELAR_PREPARACION_TA'}>):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))return invalid()
  const v=value as Record<string,unknown>
  if(Object.keys(v).length!==3||!Object.keys(v).every(k=>['estado','intento_id','revision'].includes(k))
    ||!Number.isSafeInteger(v.revision)||Number(v.revision)<0)return invalid()
  if(cmd.accion==='CANCELAR_PREPARACION_TA'){
    if(v.estado!=='CANCELADA'||v.intento_id!==cmd.intento_id||v.revision!==cmd.revision)return invalid()
  }else if(v.estado==='VACIO'||v.estado==='COMPARTIDA'){
    if(v.intento_id!==null||v.revision!==0)return invalid()
  }else if(!['PREPARADA','ENVIO_INCIERTO','DISPONIBLE'].includes(String(v.estado))||!uuid(v.intento_id)||Number(v.revision)<1)return invalid()
  return {...v}
}

export interface FiscalHttpDependencies {
  readSecret:FiscalSecretReader
  createAdmin:(url:string)=>FiscalAuthClient
  fetcher:typeof fetch
}
/** Sólo homologación: preparación de datos, consulta, revisión y recuperación.
 * Deshabilitado por defecto; reservar cuerpo tiene otro gate. No envía facturas. */
export function createFiscalHttpHandler(deps:FiscalHttpDependencies):(request:Request)=>Promise<Response> {
  const cache=createFiscalTicketCache()
  return async request=>{
    const allowed=request.headers.get('origin')===origin
    const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'}
    if(allowed)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'})
    const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers})
    if(!allowed)return json({codigo:'ORIGEN_NO_PERMITIDO'},403)
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers})
    if(request.method!=='POST')return json({codigo:'METODO_NO_PERMITIDO'},405)
    try {
      if(deps.readSecret('SUPABASE_URL')!==FISCAL_STAGING_URL||deps.readSecret('ARCA_HOMO_BACKEND_ENABLED')!=='true')
        return json({codigo:'HOMOLOGACION_NO_HABILITADA'},503)
      const auth=request.headers.get('authorization')
      if(!auth||auth.length>16400||!/^Bearer \S+$/i.test(auth))return json({codigo:'SESION_REQUERIDA'},401)
      let cmd:FiscalHttpCommand
      try{cmd=await command(request)}catch{return json({codigo:'SOLICITUD_INVALIDA'},400)}
      if(cmd.accion==='GUARDAR_BORRADOR_NC'&&deps.readSecret('ARCA_HOMO_CREDIT_DRAFTS_ENABLED')!=='true')return json({codigo:'BORRADORES_NC_NO_HABILITADOS'},503)
      if(cmd.accion==='APROBAR_REVISION_NC'&&deps.readSecret('ARCA_HOMO_CREDIT_REVIEW_ENABLED')!=='true')return json({codigo:'REVISION_NC_NO_HABILITADA'},503)
      if(cmd.accion==='GUARDAR_PREPARACION_NC'&&deps.readSecret('ARCA_HOMO_CREDIT_PREPARATION_ENABLED')!=='true')return json({codigo:'PREPARACION_NC_NO_HABILITADA'},503)
      const admin=deps.createAdmin(FISCAL_STAGING_URL),token=auth.slice(7)
      let result:unknown
      if(cmd.accion==='CONCILIAR_NC'){
        result=await reconcileFiscalCreditOperation({admin,readSecret:deps.readSecret,fetcher:deps.fetcher,
          keys:createPrivateFiscalTicketKeys(deps.readSecret),
          createWsaa:guard=>createCreditConsultWsaaTicketSource(createPrivateCreditConsultFiscalCustody(deps.readSecret,guard),deps.fetcher),
        },token,{saleId:cmd.venta_id,operationId:cmd.operacion_origen_id,requestId:cmd.solicitud_id,sha256:cmd.propuesta_sha256},cmd.consulta_id)
      }else if(cmd.accion==='CUERPO_NC'||cmd.accion==='NUMERAR_NC'){
        const scope={saleId:cmd.venta_id,operationId:cmd.operacion_origen_id,requestId:cmd.solicitud_id,sha256:cmd.propuesta_sha256}
        const body=cmd.accion==='CUERPO_NC'?await loadFiscalCreditRequest(admin,token,scope)
          :await prepareFiscalCreditNumber({admin,readSecret:deps.readSecret,fetcher:deps.fetcher,keys:createPrivateFiscalTicketKeys(deps.readSecret),
            wsaa:createCreditWsaaTicketSource(createPrivateCreditFiscalCustody(deps.readSecret),deps.fetcher)},token,scope,cmd.preparacion_sha256,cmd.reserva_id)
        result=body===null?null:fiscalCreditOwnerReviewWire({version:1,cuerpo:body,aprobacion:null,emision_habilitada:false})
      }else if(cmd.accion==='REVISION_NC'||cmd.accion==='APROBAR_REVISION_NC'){
        const scope={saleId:cmd.venta_id,operationId:cmd.operacion_origen_id,requestId:cmd.solicitud_id,sha256:cmd.propuesta_sha256}
        const review=cmd.accion==='REVISION_NC'?await loadFiscalCreditOwnerReview(admin,token,scope,cmd.revision_id)
          :await approveFiscalCreditOwnerReview(admin,token,scope,cmd.revision_id,cmd.cuerpo_sha256,cmd.preparacion_sha256)
        result=fiscalCreditOwnerReviewWire(review)
      }else if(cmd.accion==='PREPARACION_NC'||cmd.accion==='GUARDAR_PREPARACION_NC'){
        const scope={saleId:cmd.venta_id,operationId:cmd.operacion_origen_id,requestId:cmd.solicitud_id,sha256:cmd.propuesta_sha256}
        const stored=cmd.accion==='PREPARACION_NC'?await loadFiscalCreditPreparation(admin,token,scope):await saveFiscalCreditPreparation(admin,token,scope,cmd.contexto_sha256,cmd.entrada)
        result=stored?fiscalCreditPreparationWire(stored):null
      }else if(cmd.accion==='CONTEXTO_NC'){
        result=await loadFiscalCreditContext(admin,token,{saleId:cmd.venta_id,operationId:cmd.operacion_origen_id,requestId:cmd.solicitud_id,sha256:cmd.propuesta_sha256})
      }else if(cmd.accion==='UNIDADES_NC'){
        result=fiscalCreditUnitsWire(await loadFiscalCreditUnits(admin,token,cmd.venta_id,cmd.operacion_origen_id))
      }else if(cmd.accion==='FUENTE_COMERCIAL_NC'){
        result=await loadFiscalCreditCommercialSource(admin,token,cmd.venta_id,cmd.operacion_origen_id)
      }else if(cmd.accion==='HISTORIAL_BORRADORES_NC'){
        result=fiscalCreditHistoryWire(await loadFiscalCreditHistory(admin,token,cmd.venta_id,cmd.operacion_origen_id,cmd.despues))
      }else if(cmd.accion==='GUARDAR_BORRADOR_NC'){
        result=await saveFiscalCreditDraft(admin,token,cmd.venta_id,cmd.operacion_origen_id,cmd.propuesta)
      }else if(cmd.accion==='BORRADOR_NC'||cmd.accion==='CANCELAR_BORRADOR_NC'){
        const scope={saleId:cmd.venta_id,operationId:cmd.operacion_origen_id,requestId:cmd.solicitud_id,sha256:cmd.propuesta_sha256}
        result=cmd.accion==='BORRADOR_NC'?await loadFiscalCreditDraft(admin,token,scope):await cancelFiscalCreditDraft(admin,token,scope)
      }else if(cmd.accion==='REPRESENTACION_COMPROBANTE'){
        result=fiscalRepresentationWire(await loadFiscalRepresentation(admin,token,cmd.venta_id,cmd.operacion_id))
      }else if(cmd.accion==='CONTEXTO_REPRESENTACION'){
        result=await loadFiscalPresentationContext(admin,token,cmd.venta_id,cmd.operacion_id)
      }else if(cmd.accion==='DATOS_REPRESENTACION'){
        const stored=await loadFiscalPresentation(admin,token,cmd.venta_id,cmd.operacion_id)
        if(stored){const {datos:_derived,...wire}=stored;result=wire}else result=null
      }else if(cmd.accion==='GUARDAR_REPRESENTACION'){
        const stored=await saveFiscalPresentation(admin,token,cmd.venta_id,cmd.operacion_id,cmd.solicitud_sha256,cmd.propuesta)
        const {datos:_derived,...wire}=stored;result=wire
      }else if(cmd.accion==='APROBAR_REPRESENTACION'||cmd.accion==='APROBACION_REPRESENTACION'){
        const identity={sale:cmd.venta_id,operation:cmd.operacion_id,id:cmd.revision_id,bodySha:cmd.solicitud_sha256,revision:cmd.revision,presentationSha:cmd.presentacion_sha256}
        result=cmd.accion==='APROBAR_REPRESENTACION'?await approveFiscalPresentation(admin,token,identity):await loadFiscalPresentationApproval(admin,token,identity)
      }else if(cmd.accion==='CONSULTAR_CONCILIACION'){
        result=await loadFiscalObservation(admin,token,cmd.venta_id,cmd.operacion_id,cmd.observacion_id)
      }else if(cmd.accion==='CORREGIR_RECHAZO_FISCAL'){
        result=await correctRejectedFiscalVoucher({admin,readSecret:deps.readSecret,cache,fetcher:deps.fetcher,
          load:(binding,signal)=>createSharedFiscalTicketLoader(admin,createPrivateFiscalTicketKeys(deps.readSecret),
            createWsaaTicketSource(createPrivateFiscalCustody(deps.readSecret),deps.fetcher))(binding,signal),
        },token,cmd.venta_id,cmd.operacion_id,cmd.sucesora_id,cmd.anterior_sha256,cmd.propuesta)
      }else if(cmd.accion==='CORRECCION_RECHAZO_FISCAL'){
        result=await loadFiscalRejectedCorrection(admin,token,cmd.venta_id,cmd.operacion_id)
      }else if(cmd.accion==='SUSTITUIR_PREPARACION_FISCAL'||cmd.accion==='SUSTITUCION_PREPARACION_FISCAL'){
        result=cmd.accion==='SUSTITUIR_PREPARACION_FISCAL'?await replaceFiscalPreparation(admin,token,cmd.venta_id,cmd.operacion_id,cmd.sucesora_id,cmd.anterior_sha256,cmd.propuesta)
          :await loadFiscalReplacement(admin,token,cmd.venta_id,cmd.operacion_id)
      }else if(cmd.accion==='CANCELAR_PREPARACION_FISCAL'||cmd.accion==='CANCELACION_PREPARACION_FISCAL'){
        result=cmd.accion==='CANCELAR_PREPARACION_FISCAL'?await cancelFiscalPreparation(admin,token,cmd.venta_id,cmd.operacion_id)
          :await loadFiscalPreparationCancellation(admin,token,cmd.venta_id,cmd.operacion_id)
      }else if(cmd.accion==='CONSTANCIA_COMPROBANTE'){
        result=await loadFiscalReceipt(admin,token,cmd.venta_id,cmd.operacion_id)
      }else if(cmd.accion==='DIAGNOSTICO_COMPROBANTE'){
        result=await loadFiscalDiagnosis(admin,token,cmd.venta_id,cmd.operacion_id)
      }else if(cmd.accion==='RESOLVER_VENTA'||cmd.accion==='DATOS_FISCALES_VENTA'||cmd.accion==='GUARDAR_DATOS_FISCALES'){
        const preparation={admin,readSecret:deps.readSecret}
        result=cmd.accion==='RESOLVER_VENTA'?await resolveFiscalSale(preparation,token,cmd.venta_id)
          :cmd.accion==='DATOS_FISCALES_VENTA'?await loadFiscalPreparation(preparation,token,cmd.venta_id)
          :await saveFiscalPreparation(preparation,token,cmd.venta_id,cmd.operacion_id,cmd.entrada)
      }else if(cmd.accion==='PREPARAR_COMPROBANTE'){
        result=await prepareFiscalVoucher({admin,readSecret:deps.readSecret,cache,fetcher:deps.fetcher,
          load:(binding,signal)=>createSharedFiscalTicketLoader(admin,createPrivateFiscalTicketKeys(deps.readSecret),
            createWsaaTicketSource(createPrivateFiscalCustody(deps.readSecret),deps.fetcher))(binding,signal),
        },token,cmd.operacion_id)
      }else if(cmd.accion==='CONCILIAR'){
        const load=createSharedFiscalTicketLoader(admin,createPrivateFiscalTicketKeys(deps.readSecret),
          createWsaaTicketSource(createPrivateFiscalCustody(deps.readSecret),deps.fetcher))
        result=await reconcileAuthorizedFiscalVoucher(admin,token,cmd.operacion_id,cmd.observacion_id,cache,load,deps.fetcher,async()=>{
          if(deps.readSecret('ARCA_HOMO_RECONCILIATION_ENABLED')!=='true')throw new Error('FISCAL_CONCILIACION_NO_HABILITADA')
        })
      }else{
        const {binding,actorAuthId}=await authorizeFiscalActor(admin,token,cmd.operacion_id)
        if(cmd.accion==='REVISAR_COMPROBANTE'||cmd.accion==='APROBAR_REVISION'){
          const response=await admin.rpc('cargar_revision_fiscal_homologacion',{p_operacion_id:cmd.operacion_id,p_actor_auth_id:actorAuthId})
          if(response.error)throw new Error('FISCAL_REVISION_NO_CONFIRMADA')
          const review=await validateFiscalOwnerReview(response.data,binding)
          if(cmd.accion==='REVISAR_COMPROBANTE')result=review
          else{
            if(review.solicitud.sha256!==cmd.solicitud_sha256)throw new Error('FISCAL_REVISION_NO_CONFIRMADA')
            const approved=await admin.rpc('aprobar_revision_fiscal_homologacion',{p_operacion_id:cmd.operacion_id,p_actor_auth_id:actorAuthId,p_id:cmd.revision_id,p_sha:cmd.solicitud_sha256,p_revision:cmd.revision})
            if(approved.error)throw new Error('FISCAL_REVISION_NO_CONFIRMADA')
            result=validateFiscalOwnerApproval(approved.data,cmd.operacion_id,cmd.solicitud_sha256,cmd.revision,cmd.revision_id)
          }
        }else{
        const args={p_operacion_id:cmd.operacion_id,p_credencial_id:binding.credencial_id,p_huella:binding.certificado_sha256,p_revision:binding.revision}
        const response=cmd.accion==='ESTADO_TA'
          ?await admin.rpc('consultar_preparacion_ta_homologacion',args)
          :await admin.rpc('cancelar_preparacion_ta_homologacion',{...args,p_intento_id:cmd.intento_id,p_generacion:cmd.revision})
        if(response.error)throw new Error('FISCAL_RECUPERACION_NO_CONFIRMADA')
        result=taResult(response.data,cmd)
        }
      }
      return json({version:1,entorno:'HOMOLOGACION',emision_habilitada:false,resultado:result})
    }catch(error){
      if(error instanceof Error&&error.message==='FISCAL_CONCILIACION_NO_HABILITADA')return json({codigo:'CONCILIACION_NO_HABILITADA'},503)
      if(error instanceof Error&&error.message==='FISCAL_CORRECCION_RECHAZO_NO_HABILITADA')return json({codigo:'CORRECCION_RECHAZO_NO_HABILITADA'},503)
      if(error instanceof Error&&error.message==='FISCAL_PREPARACION_CUERPO_NO_HABILITADA')return json({codigo:'PREPARACION_CUERPO_NO_HABILITADA'},503)
      if(error instanceof Error&&error.message==='FISCAL_CONSULTA_NO_AUTORIZADA')return json({codigo:'CONSULTA_NO_AUTORIZADA'},403)
      return json({codigo:'OPERACION_NO_CONFIRMADA',error:'Conservá los identificadores originales y revisá el estado antes de reintentar.'},409)
    }
  }
}
