import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import { validateFiscalReceipt } from './fiscalReceipt.ts'
import type { FiscalReceipt } from './fiscalReceipt.ts'

const fail = (): never => { throw new Error('FISCAL_CONSTANCIA_NO_CONFIRMADA') }
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

/** Auth original verificado una sola vez; lectura histórica sin custodia/TA/red fiscal. */
export async function loadFiscalReceipt(admin: FiscalAuthClient, token: string, saleId: string, operationId: string): Promise<Readonly<FiscalReceipt>> {
  try {
    if (!uuid(saleId) || !uuid(operationId) || typeof token !== 'string' || token.length > 16384 || !/^\S+$/.test(token)) return fail()
    const auth = await admin.auth.getUser(token), actorAuthId = auth.data.user?.id
    if (auth.error || !uuid(actorAuthId)) return fail()
    const response = await admin.rpc('cargar_constancia_fiscal_homologacion', {
      p_actor_auth_id: actorAuthId, p_venta_id: saleId, p_operacion_id: operationId,
    })
    if (response.error) return fail()
    return await validateFiscalReceipt(response.data, { operationId, saleId })
  } catch { return fail() }
}
