import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import { fiscalUuid } from './fiscalReplacement.ts'
import { validateFiscalRepresentation } from './fiscalRepresentation.ts'
import type { FiscalRepresentation } from './fiscalRepresentation.ts'
export async function loadFiscalRepresentation(admin:FiscalAuthClient,token:string,sale:string,operation:string):Promise<Readonly<FiscalRepresentation>>{
 try{
  if(!fiscalUuid(sale)||!fiscalUuid(operation)||typeof token!=='string'||token.length>16384||!/^\S+$/.test(token))throw new Error()
  const auth=await admin.auth.getUser(token),actor=auth.data.user?.id
  if(auth.error||!fiscalUuid(actor))throw new Error()
  const result=await admin.rpc('cargar_representacion_fiscal_homologacion',{p_actor_auth_id:actor,p_venta_id:sale,p_operacion_id:operation})
  if(result.error)throw new Error()
  return await validateFiscalRepresentation(result.data,sale,operation)
 }catch{throw new Error('FISCAL_REPRESENTACION_NO_CONFIRMADA')}
}
