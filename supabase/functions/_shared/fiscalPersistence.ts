/** Orquestación privada; no es endpoint ni autentica al actor/tenant.
 * El worker debe resolver esa autorización y custodia antes de invocarla. */
import { verifyFiscalRequest } from './fiscalReconciliation.ts'
import { consultFiscalVoucher } from './fiscalVoucherXml.ts'

export interface FiscalRpc {
  rpc(name: string, args: Record<string, unknown>): Promise<{data: unknown; error: unknown}>
}
import { validateFiscalReconciliationAck as ack } from './fiscalReconciliationContract.ts'
import type { FiscalReconciliationAck } from './fiscalReconciliationContract.ts'
export type { FiscalReconciliationAck } from './fiscalReconciliationContract.ts'
const fail = (): never => { throw new Error('FISCAL_PERSISTENCIA_NO_CONFIRMADA') }
function record(value: unknown): Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value))return fail()
  return value as Record<string,unknown>
}
function uuid(value: unknown): value is string {
  return typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
/** Un ID representa una observación: replay recupera su ACK histórico sin red.
 * Para otra consulta pendiente se necesita otro ID; nunca se reenvía FECAESolicitar. */
export async function reconcilePersistedFiscalVoucher(
  db: FiscalRpc, operationId: string, observationId: string,
  ticket: {token:string;sign:string;expiresAt:number} | (()=>Promise<{token:string;sign:string;expiresAt:number}>), fetcher: typeof fetch,
  issuer?: {cuitEmisor:string;puntoVenta:number},
  controls?: { beforeConsult: () => Promise<void>; beforeSave: () => Promise<void> },
): Promise<FiscalReconciliationAck> {
  if(!uuid(operationId) || !uuid(observationId))return fail()
  async function call(name:string,args:Record<string,unknown>):Promise<unknown> {
    try {
      const result=await db.rpc(name,args)
      if(result.error)return fail()
      return result.data
    } catch { return fail() }
  }
  const prior=await call('consultar_reconciliacion_homologacion',{p_operacion_id:operationId,p_id:observationId})
  if(prior!==null)return ack(prior,operationId)
  const context=record(await call('cargar_contexto_conciliacion_homologacion',{p_operacion_id:operationId}))
  if(context.operacion_id!==operationId || !uuid(context.intento_id) || ![1,2].includes(Number(context.revision)))return fail()
  let frozen
  try { frozen=await verifyFiscalRequest(context.solicitud) } catch { return fail() }
  if(issuer&&(frozen.solicitud.cuitEmisor!==issuer.cuitEmisor||frozen.solicitud.puntoVenta!==issuer.puntoVenta))return fail()
  if(context.resultado!==null)return ack(context.resultado,operationId,frozen.sha256)
  if(context.revision!==1)return fail()
  await controls?.beforeConsult()
  let privateTicket
  try {privateTicket=typeof ticket==='function'?await ticket():ticket} catch {return fail()}
  const decision=await consultFiscalVoucher(frozen,privateTicket,fetcher,15000,controls?.beforeConsult)
  await controls?.beforeSave()
  try { await call('registrar_reconciliacion_fiscal_homologacion',{
    p_id:observationId,p_operacion_id:operationId,p_intento_id:context.intento_id,
    p_sha:frozen.sha256,p_revision:context.revision,p_decision:decision,
  }) } catch { /* La lectura durable decide si hubo commit tras ACK perdido. */ }
  const saved=await call('consultar_reconciliacion_homologacion',{p_operacion_id:operationId,p_id:observationId})
  const result=ack(saved,operationId,frozen.sha256)
  if(result.numero!==frozen.solicitud.numero)return fail()
  return result
}
