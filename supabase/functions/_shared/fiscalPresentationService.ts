import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import { validateFiscalPresentationProposal,validateFiscalPresentationRecord } from './fiscalPresentation.ts'
import type { FiscalPresentationRecord } from './fiscalPresentation.ts'
import { fiscalUuid,fiscalSha } from './fiscalReplacement.ts'
const fail=():never=>{throw new Error('FISCAL_PRESENTACION_NO_CONFIRMADA')}
async function actor(admin:FiscalAuthClient,token:string,sale:string,operation:string):Promise<string>{
 if(!fiscalUuid(sale)||!fiscalUuid(operation)||typeof token!=='string'||token.length>16384||!/^\S+$/.test(token))return fail()
 const auth=await admin.auth.getUser(token),id=auth.data.user?.id
 if(auth.error||!fiscalUuid(id))return fail()
 return id
}
async function read(admin:FiscalAuthClient,id:string,sale:string,operation:string):Promise<Readonly<FiscalPresentationRecord>|null>{
 const response=await admin.rpc('cargar_presentacion_fiscal_homologacion',{p_actor_auth_id:id,p_venta_id:sale,p_operacion_id:operation})
 if(response.error)return fail()
 return response.data===null?null:validateFiscalPresentationRecord(response.data,sale,operation)
}
export async function loadFiscalPresentation(admin:FiscalAuthClient,token:string,sale:string,operation:string):Promise<Readonly<FiscalPresentationRecord>|null>{
 try{return await read(admin,await actor(admin,token,sale,operation),sale,operation)}catch{return fail()}
}
/** Sólo hechos previos a revisión; nunca credenciales, TA, permiso o emisión. */
export async function saveFiscalPresentation(admin:FiscalAuthClient,token:string,sale:string,operation:string,bodySha:string,proposal:unknown):Promise<Readonly<FiscalPresentationRecord>>{
 try{
  if(!fiscalSha(bodySha))return fail()
  const value=await validateFiscalPresentationProposal(proposal),id=await actor(admin,token,sale,operation)
  try{await admin.rpc('guardar_presentacion_fiscal_homologacion',{p_actor_auth_id:id,p_venta_id:sale,p_operacion_id:operation,p_solicitud_sha:bodySha,p_canonico:value.canonico,p_sha:value.sha256})}catch{/* Recuperar el mismo cuerpo después de ACK perdido. */}
  const stored=await read(admin,id,sale,operation)
  if(!stored||stored.solicitud_sha256!==bodySha||stored.presentacion_sha256!==value.sha256||stored.canonico!==value.canonico)return fail()
  return stored
 }catch{return fail()}
}
