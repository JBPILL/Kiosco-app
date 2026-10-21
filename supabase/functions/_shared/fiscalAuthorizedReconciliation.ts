import { authorizeFiscalWorker } from './fiscalWorkerAuthorization.ts'
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
):Promise<FiscalReconciliationAck> {
  const binding=await authorizeFiscalWorker(admin,token,operationId)
  return reconcilePersistedFiscalVoucher(admin,operationId,observationId,
    ()=>cache.get(binding,load),fetcher,{cuitEmisor:binding.cuit_emisor,puntoVenta:binding.punto_venta})
}
