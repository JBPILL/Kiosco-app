import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import { validateFiscalPreparationCancellation } from './fiscalCancellation.ts'
import type { FiscalPreparationCancellation } from './fiscalCancellation.ts'

const fail = (): never => { throw new Error('FISCAL_CANCELACION_NO_CONFIRMADA') }
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
async function actor(admin: FiscalAuthClient, token: string, sale: string, operation: string): Promise<string> {
  if (!uuid(sale) || !uuid(operation) || typeof token !== 'string' || token.length > 16384 || !/^\S+$/.test(token)) return fail()
  const auth = await admin.auth.getUser(token), id = auth.data.user?.id
  if (auth.error || !uuid(id)) return fail()
  return id
}
async function read(admin: FiscalAuthClient, actorAuthId: string, saleId: string, operationId: string): Promise<Readonly<FiscalPreparationCancellation> | null> {
  const response = await admin.rpc('consultar_cancelacion_preparacion_homologacion', { p_actor_auth_id: actorAuthId, p_venta_id: saleId, p_operacion_id: operationId })
  if (response.error) return fail()
  return response.data === null ? null : validateFiscalPreparationCancellation(response.data, saleId, operationId)
}
export async function loadFiscalPreparationCancellation(admin: FiscalAuthClient, token: string, sale: string, operation: string): Promise<Readonly<FiscalPreparationCancellation> | null> {
  try { return await read(admin, await actor(admin, token, sale, operation), sale, operation) } catch { return fail() }
}
/** Auth una vez; conservar actor y UUID incluso si se pierde el ACK de escritura. */
export async function cancelFiscalPreparation(admin: FiscalAuthClient, token: string, sale: string, operation: string): Promise<Readonly<FiscalPreparationCancellation>> {
  try {
    const actorAuthId = await actor(admin, token, sale, operation)
    try { await admin.rpc('cancelar_preparacion_fiscal_homologacion', { p_actor_auth_id: actorAuthId, p_venta_id: sale, p_operacion_id: operation }) } catch { /* Recuperar el mismo registro durable. */ }
    const result = await read(admin, actorAuthId, sale, operation)
    if (!result) return fail()
    return result
  } catch { return fail() }
}
