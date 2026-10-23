import { authorizeFiscalActor, validateFiscalWorkerBinding } from './fiscalWorkerAuthorization.ts'
import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import { reconcilePersistedFiscalVoucher } from './fiscalPersistence.ts'
import type { FiscalReconciliationAck } from './fiscalPersistence.ts'
import { createFiscalTicketCache } from './fiscalTicketCache.ts'
import type { WsaaTicketLoader } from './fiscalTicketCache.ts'

/** Composición servidor. La fuente real de credenciales y renovación distribuida
 * siguen siendo requisitos previos a desplegar; no instala ni abre un endpoint. */
export async function reconcileAuthorizedFiscalVoucher(
  admin: FiscalAuthClient, token:string, operationId:string, observationId:string,
  cache:ReturnType<typeof createFiscalTicketCache>, load:WsaaTicketLoader, fetcher:typeof fetch,
  beforeConsult?:()=>Promise<void>,
):Promise<FiscalReconciliationAck> {
  const checked: FiscalAuthClient = { auth: admin.auth, rpc: (name,args) => admin.rpc(name === 'autorizar_consulta_fiscal_homologacion' ? 'autorizar_conciliacion_revisada_homologacion' : name,args) }
  const {binding,actorAuthId}=await authorizeFiscalActor(checked,token,operationId)
  const revalidate=async()=>{
    try {
    await beforeConsult?.()
    const response=await admin.rpc('autorizar_conciliacion_revisada_homologacion',{p_actor_auth_id:actorAuthId,p_operacion_id:operationId})
    if(response.error)throw new Error('FISCAL_CONSULTA_NO_AUTORIZADA')
    const fresh=validateFiscalWorkerBinding(response.data,operationId)
    if(Object.entries(binding).some(([key,value])=>fresh[key as keyof typeof fresh]!==value))throw new Error('FISCAL_CONSULTA_NO_AUTORIZADA')
    } catch(error) {
      if(error instanceof Error&&error.message==='FISCAL_CONCILIACION_NO_HABILITADA')throw new Error('FISCAL_CONCILIACION_NO_HABILITADA')
      throw new Error('FISCAL_CONSULTA_NO_AUTORIZADA')
    }
  }
  const durable = { rpc: (name:string,args:Record<string,unknown>) => name === 'registrar_reconciliacion_fiscal_homologacion'
    ? admin.rpc('registrar_conciliacion_revisada_homologacion',{...args,p_actor_auth_id:actorAuthId,p_binding:binding})
    : admin.rpc(name,args) }
  return reconcilePersistedFiscalVoucher(durable,operationId,observationId,
    ()=>cache.get(binding,load),fetcher,{cuitEmisor:binding.cuit_emisor,puntoVenta:binding.punto_venta},{beforeConsult:revalidate,beforeSave:revalidate})
}
