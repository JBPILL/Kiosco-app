import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import { validateFiscalReceipt } from './fiscalReceipt.ts'
import type { FiscalReceipt } from './fiscalReceipt.ts'
import { validateFiscalDiagnosis } from './fiscalDiagnosis.ts'
import type { FiscalDiagnosis } from './fiscalDiagnosis.ts'

const fail = (): never => { throw new Error('FISCAL_CONSTANCIA_NO_CONFIRMADA') }
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

/** Auth original verificado una sola vez; lectura histórica sin custodia/TA/red fiscal. */
async function loadDocument(admin: FiscalAuthClient, token: string, saleId: string, operationId: string, rpc: 'cargar_constancia_fiscal_homologacion' | 'cargar_diagnostico_fiscal_homologacion'): Promise<unknown> {
  try {
    if (!uuid(saleId) || !uuid(operationId) || typeof token !== 'string' || token.length > 16384 || !/^\S+$/.test(token)) return fail()
    const auth = await admin.auth.getUser(token), actorAuthId = auth.data.user?.id
    if (auth.error || !uuid(actorAuthId)) return fail()
    const response = await admin.rpc(rpc, {
      p_actor_auth_id: actorAuthId, p_venta_id: saleId, p_operacion_id: operationId,
    })
    if (response.error) return fail()
    return response.data
  } catch { return fail() }
}
export async function loadFiscalReceipt(admin: FiscalAuthClient, token: string, saleId: string, operationId: string): Promise<Readonly<FiscalReceipt>> {
  try { return await validateFiscalReceipt(await loadDocument(admin, token, saleId, operationId, 'cargar_constancia_fiscal_homologacion'), { operationId, saleId }) } catch { return fail() }
}
export async function loadFiscalDiagnosis(admin: FiscalAuthClient, token: string, saleId: string, operationId: string): Promise<Readonly<FiscalDiagnosis>> {
  try { return validateFiscalDiagnosis(await loadDocument(admin, token, saleId, operationId, 'cargar_diagnostico_fiscal_homologacion'), saleId, operationId) } catch { return fail() }
}
