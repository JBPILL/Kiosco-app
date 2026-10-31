import type { FiscalClientScope } from './fiscalClient'
import type { FiscalCreditClientDependencies } from './fiscalCreditClient'
import type { FiscalCreditDraftScope } from '../../supabase/functions/_shared/fiscalCreditDraftAck'
import { validateFiscalCreditTransportStatus } from '../../supabase/functions/_shared/fiscalCreditTransportStatus'
import { fiscalUuid,fiscalSha } from '../../supabase/functions/_shared/fiscalReplacement'

export interface PendingFiscalCreditTransport {
 version:1;kind:'ENVIAR'|'CONSULTAR';operationId:string;requestId:string;proposalSha:string;bodySha:string
 reviewId:string|null;attemptId:string|null;queryId:string
}
const fail=():never=>{throw new Error('FISCAL_TRANSPORTE_NC_CLIENTE_NO_CONFIRMADO')}
/** IDs/hash only. POST acknowledgements and browser storage never establish a CAE. */
export function createFiscalCreditTransportClient(input:FiscalClientScope,deps:FiscalCreditClientDependencies,blocked:()=>boolean){
 const identity=Object.freeze({...input})
 if(![identity.authId,identity.kioskId,identity.saleId].every(fiscalUuid))return fail()
 const sale=identity.saleId.toLowerCase(),key=`kioskopos:fiscal:v1:${identity.authId.toLowerCase()}:${identity.kioskId.toLowerCase()}:${sale}:credit:transport`
 const pending=():Readonly<PendingFiscalCreditTransport>|null=>{
  const raw=deps.storage.getItem(key);if(raw===null||raw==='null')return null
  if(raw.length>2048)return fail()
  const value:unknown=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))return fail()
  const r=value as Record<string,unknown>,keys=['version','kind','operationId','requestId','proposalSha','bodySha','reviewId','attemptId','queryId']
  if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k))||r.version!==1||r.kind!=='ENVIAR'&&r.kind!=='CONSULTAR'||!fiscalUuid(r.operationId)||!fiscalUuid(r.requestId)||!fiscalSha(r.proposalSha)||!fiscalSha(r.bodySha)||!fiscalUuid(r.queryId))return fail()
  if(r.kind==='ENVIAR'?!fiscalUuid(r.reviewId)||!fiscalUuid(r.attemptId):r.reviewId!==null||r.attemptId!==null)return fail()
  return Object.freeze({version:1,kind:r.kind,operationId:r.operationId,requestId:r.requestId,proposalSha:r.proposalSha,bodySha:r.bodySha,reviewId:r.reviewId as string|null,attemptId:r.attemptId as string|null,queryId:r.queryId})
 }
 const write=(r:Readonly<PendingFiscalCreditTransport>|null)=>{deps.storage.setItem(key,JSON.stringify(r));if(JSON.stringify(pending())!==JSON.stringify(r))return fail()}
 const target=(r:Readonly<PendingFiscalCreditTransport>):FiscalCreditDraftScope=>({saleId:sale,operationId:r.operationId,requestId:r.requestId,sha256:r.proposalSha})
 const capture=(t:FiscalCreditDraftScope)=>{const c=Object.freeze({...t});if(c.saleId!==sale||!fiscalUuid(c.operationId)||!fiscalUuid(c.requestId)||!fiscalSha(c.sha256))return fail();return c}
 const matches=(r:Readonly<PendingFiscalCreditTransport>,t:FiscalCreditDraftScope)=>r.operationId===t.operationId&&r.requestId===t.requestId&&r.proposalSha===t.sha256
 const read=async(t:FiscalCreditDraftScope,r?:Readonly<PendingFiscalCreditTransport>)=>validateFiscalCreditTransportStatus(await deps.invoke({accion:'ESTADO_ENVIO_NC',venta_id:sale,operacion_origen_id:t.operationId,solicitud_id:t.requestId,propuesta_sha256:t.sha256,...(r?{consulta_id:r.queryId}:{})}),t,r?.bodySha)
 const recover=async(r:Readonly<PendingFiscalCreditTransport>)=>{
  const result=await read(target(r),r)
  const confirmed=r.kind==='ENVIAR'?result.estado!=='SIN_INTENCION':result.consulta_id===r.queryId||result.estado==='CAE_CONFIRMADO'||result.estado==='CONFLICTO_NC'
  if(!confirmed||JSON.stringify(pending())!==JSON.stringify(r))return fail()
  write(null);return result
 }
 const post=async(r:Readonly<PendingFiscalCreditTransport>)=>{
  if(blocked()||JSON.stringify(pending())!==JSON.stringify(r))return fail()
  try{await deps.invoke({accion:r.kind==='ENVIAR'?'ENVIAR_NC':'CONCILIAR_NC',venta_id:sale,operacion_origen_id:r.operationId,solicitud_id:r.requestId,propuesta_sha256:r.proposalSha,consulta_id:r.queryId,...(r.kind==='ENVIAR'?{revision_id:r.reviewId,intento_id:r.attemptId}:{})})}catch{/* Recover the same durable identity; never trust the POST ACK. */}
  return recover(r)
 }
 return {
  pending,
  async status(input:FiscalCreditDraftScope){try{const t=capture(input);return await deps.exclusive(async()=>{const r=pending();if(r&&!matches(r,t))return read(t);return read(t,r??undefined)})}catch{return fail()}},
  async recover(){try{return await deps.exclusive(async()=>{const r=pending();return r?recover(r):null})}catch{return fail()}},
  async send(input:FiscalCreditDraftScope,bodySha:string,reviewId:string){try{
   const t=capture(input);if(!fiscalSha(bodySha)||!fiscalUuid(reviewId))return fail()
   return await deps.exclusive(async()=>{
    if(blocked())return fail();const prior=pending()
    if(prior){if(!matches(prior,t)||prior.bodySha!==bodySha)return fail();return recover(prior)}
    const before=await read(t);if(before.cuerpo_sha256!==bodySha)return fail();if(before.estado!=='SIN_INTENCION')return before
    const r:Readonly<PendingFiscalCreditTransport>=Object.freeze({version:1,kind:'ENVIAR',operationId:t.operationId,requestId:t.requestId,proposalSha:t.sha256,bodySha,reviewId,attemptId:crypto.randomUUID(),queryId:crypto.randomUUID()})
    write(r);return post(r)
   })
  }catch{return fail()}},
  async consult(input:FiscalCreditDraftScope){try{
   const t=capture(input);return await deps.exclusive(async()=>{
    if(blocked())return fail();const prior=pending();if(prior){if(!matches(prior,t))return fail();return recover(prior)}
    const before=await read(t);if(before.estado==='SIN_INTENCION')return fail()
    const r:Readonly<PendingFiscalCreditTransport>=Object.freeze({version:1,kind:'CONSULTAR',operationId:t.operationId,requestId:t.requestId,proposalSha:t.sha256,bodySha:before.cuerpo_sha256,reviewId:null,attemptId:null,queryId:crypto.randomUUID()})
    write(r);return post(r)
   })
  }catch{return fail()}},
  /** Explicit retry preserves case, body, attempt and query. A renewed review may only bind that same body. */
  async retry(reviewId?:string){try{
   if(reviewId!==undefined&&!fiscalUuid(reviewId))return fail()
   return await deps.exclusive(async()=>{
    if(blocked())return fail();let r=pending();if(!r)return fail()
    try{return await recover(r)}catch{/* An explicit retry remains subject to the server's durable intent guard. */}
    if(reviewId!==undefined){if(r.kind!=='ENVIAR')return fail();r=Object.freeze({...r,reviewId});write(r)}
    return post(r)
   })
  }catch{return fail()}},
 }
}
