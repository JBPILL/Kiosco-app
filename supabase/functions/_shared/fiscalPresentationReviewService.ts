import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import { fiscalUuid,fiscalSha } from './fiscalReplacement.ts'
import { validateFiscalPresentationApproval } from './fiscalPresentationReview.ts'
import type { FiscalPresentationApproval } from './fiscalPresentationReview.ts'
const fail=():never=>{throw new Error('FISCAL_REVISION_PRESENTACION_NO_CONFIRMADA')}
export interface FiscalPresentationReviewIdentity {sale:string;operation:string;id:string;bodySha:string;revision:number;presentationSha:string}
function validate(v:FiscalPresentationReviewIdentity):Readonly<FiscalPresentationReviewIdentity>{
 if(!fiscalUuid(v.sale)||!fiscalUuid(v.operation)||!fiscalUuid(v.id)||!fiscalSha(v.bodySha)||!fiscalSha(v.presentationSha)||v.revision!==1)return fail()
 return Object.freeze({...v})
}
async function actor(admin:FiscalAuthClient,token:string):Promise<string>{
 if(typeof token!=='string'||token.length>16384||!/^\S+$/.test(token))return fail()
 const result=await admin.auth.getUser(token),id=result.data.user?.id
 if(result.error||!fiscalUuid(id))return fail()
 return id
}
async function read(admin:FiscalAuthClient,auth:string,v:FiscalPresentationReviewIdentity):Promise<Readonly<FiscalPresentationApproval>|null>{
 const result=await admin.rpc('cargar_revision_presentacion_homologacion',{p_actor_auth_id:auth,p_venta_id:v.sale,p_operacion_id:v.operation,p_revision_id:v.id})
 if(result.error)return fail()
 return result.data===null?null:validateFiscalPresentationApproval(result.data,v.operation,v.bodySha,v.revision,v.id,v.presentationSha)
}
export async function loadFiscalPresentationApproval(admin:FiscalAuthClient,token:string,identity:FiscalPresentationReviewIdentity):Promise<Readonly<FiscalPresentationApproval>|null>{
 try{const v=validate(identity);return await read(admin,await actor(admin,token),v)}catch{return fail()}
}
export async function approveFiscalPresentation(admin:FiscalAuthClient,token:string,identity:FiscalPresentationReviewIdentity):Promise<Readonly<FiscalPresentationApproval>>{
 try{
  const v=validate(identity),auth=await actor(admin,token),existing=await read(admin,auth,v)
  if(existing)return existing
  try{await admin.rpc('aprobar_revision_presentacion_homologacion',{p_actor_auth_id:auth,p_venta_id:v.sale,p_operacion_id:v.operation,p_revision_id:v.id,p_solicitud_sha:v.bodySha,p_revision:v.revision,p_presentacion_sha:v.presentationSha})}catch{/* Recuperar mismo UUID tras ACK perdido. */}
  const stored=await read(admin,auth,v)
  if(!stored)return fail()
  return stored
 }catch{return fail()}
}
