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
    if((b.accion==='RESOLVER_VENTA'||b.accion==='DATOS_FISCALES_VENTA')&&keys.length===2&&uuid(b.venta_id)&&size<=2048&&(length===null||Number(length)<=2048))
      return b.accion==='RESOLVER_VENTA'?{accion:'RESOLVER_VENTA',venta_id:b.venta_id.toLowerCase()}:{accion:'DATOS_FISCALES_VENTA',venta_id:b.venta_id.toLowerCase()}
    if(b.accion==='GUARDAR_DATOS_FISCALES'&&keys.length===4&&keys.every(k=>['accion','venta_id','operacion_id','entrada'].includes(k))
      &&uuid(b.venta_id)&&uuid(b.operacion_id)&&b.entrada&&typeof b.entrada==='object'&&!Array.isArray(b.entrada))
      return {accion:b.accion,venta_id:b.venta_id.toLowerCase(),operacion_id:b.operacion_id.toLowerCase(),entrada:b.entrada}
    if((b.accion==='SUSTITUIR_PREPARACION_FISCAL'||b.accion==='CORREGIR_RECHAZO_FISCAL')&&keys.length===6&&keys.every(k=>['accion','venta_id','operacion_id','sucesora_id','anterior_sha256','propuesta'].includes(k))
      &&uuid(b.venta_id)&&uuid(b.operacion_id)&&uuid(b.sucesora_id)&&b.operacion_id!==b.sucesora_id&&typeof b.anterior_sha256==='string'&&/^[0-9a-f]{64}$/.test(b.anterior_sha256)
      &&b.propuesta&&typeof b.propuesta==='object'&&!Array.isArray(b.propuesta))
      return {accion:b.accion,venta_id:b.venta_id.toLowerCase(),operacion_id:b.operacion_id.toLowerCase(),sucesora_id:b.sucesora_id.toLowerCase(),anterior_sha256:b.anterior_sha256,propuesta:b.propuesta}
    if(size>2048||length!==null&&Number(length)>2048||!uuid(b.operacion_id))return invalid()
    const op=b.operacion_id.toLowerCase()
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
      const admin=deps.createAdmin(FISCAL_STAGING_URL),token=auth.slice(7)
      let result:unknown
      if(cmd.accion==='CORREGIR_RECHAZO_FISCAL'){
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
        result=await reconcileAuthorizedFiscalVoucher(admin,token,cmd.operacion_id,cmd.observacion_id,cache,load,deps.fetcher)
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
      if(error instanceof Error&&error.message==='FISCAL_CORRECCION_RECHAZO_NO_HABILITADA')return json({codigo:'CORRECCION_RECHAZO_NO_HABILITADA'},503)
      if(error instanceof Error&&error.message==='FISCAL_PREPARACION_CUERPO_NO_HABILITADA')return json({codigo:'PREPARACION_CUERPO_NO_HABILITADA'},503)
      if(error instanceof Error&&error.message==='FISCAL_CONSULTA_NO_AUTORIZADA')return json({codigo:'CONSULTA_NO_AUTORIZADA'},403)
      return json({codigo:'OPERACION_NO_CONFIRMADA',error:'Conservá los identificadores originales y revisá el estado antes de reintentar.'},409)
    }
  }
}
