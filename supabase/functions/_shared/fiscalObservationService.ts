import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import { fiscalUuid } from './fiscalReplacement.ts'
import { validateFiscalReconciliationAck } from './fiscalReconciliationContract.ts'
import type { FiscalReconciliationAck } from './fiscalReconciliationContract.ts'
/** Sólo lectura: ausencia durable no se transforma en una nueva consulta WSFE. */
export async function loadFiscalObservation(admin:FiscalAuthClient,token:string,sale:string,operation:string,id:string):Promise<Readonly<FiscalReconciliationAck>|null> {
 try {
  if(![sale,operation,id].every(fiscalUuid)||typeof token!=='string'||token.length>16384||!/^\S+$/.test(token))throw new Error()
  const auth=await admin.auth.getUser(token),actor=auth.data.user?.id
  if(auth.error||!fiscalUuid(actor))throw new Error()
  const result=await admin.rpc('cargar_observacion_fiscal_homologacion',{p_actor_auth_id:actor,p_venta_id:sale,p_operacion_id:operation,p_id:id})
  if(result.error)throw new Error()
  return result.data===null?null:validateFiscalReconciliationAck(result.data,operation)
 } catch {throw new Error('FISCAL_OBSERVACION_NO_CONFIRMADA')}
}
