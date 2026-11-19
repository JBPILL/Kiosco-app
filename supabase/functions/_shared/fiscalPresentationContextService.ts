import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import { fiscalUuid } from './fiscalReplacement.ts'
import { validateFiscalPresentationContext } from './fiscalPresentationContext.ts'
import type { FiscalPresentationContext } from './fiscalPresentationContext.ts'
export async function loadFiscalPresentationContext(admin:FiscalAuthClient,token:string,sale:string,operation:string):Promise<Readonly<FiscalPresentationContext>>{
 try{
  if(!fiscalUuid(sale)||!fiscalUuid(operation)||typeof token!=='string'||token.length>16384||!/^\S+$/.test(token))throw new Error()
  const auth=await admin.auth.getUser(token),actor=auth.data.user?.id
  if(auth.error||!fiscalUuid(actor))throw new Error()
  const response=await admin.rpc('cargar_contexto_presentacion_homologacion',{p_actor_auth_id:actor,p_venta_id:sale,p_operacion_id:operation})
  if(response.error)throw new Error()
  return validateFiscalPresentationContext(response.data,sale,operation)
 }catch{throw new Error('FISCAL_FUENTE_PRESENTACION_NO_CONFIRMADA')}
}
