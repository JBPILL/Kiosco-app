import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import { fiscalUuid } from './fiscalReplacement.ts'
import { validateFiscalRejectedCorrection } from './fiscalRejectedCorrectionContract.ts'
import type { FiscalRejectedCorrection } from './fiscalRejectedCorrectionContract.ts'

/** Recuperación durable: sólo lectura con Auth real, sin TA ni consultas WSFE. */
export async function loadFiscalRejectedCorrection(
  admin: FiscalAuthClient, token: string, sale: string, operation: string,
): Promise<Readonly<FiscalRejectedCorrection> | null> {
  try {
    if (!fiscalUuid(sale) || !fiscalUuid(operation) || typeof token !== 'string'
      || token.length > 16384 || !/^\S+$/.test(token)) throw new Error()
    const auth = await admin.auth.getUser(token), actor = auth.data.user?.id
    if (auth.error || !fiscalUuid(actor)) throw new Error()
    const response = await admin.rpc('consultar_correccion_rechazo_homologacion', {
      p_actor_auth_id: actor, p_venta_id: sale, p_operacion_id: operation,
    })
    if (response.error) throw new Error()
    return response.data === null ? null : validateFiscalRejectedCorrection(response.data, sale, operation)
  } catch {
    throw new Error('FISCAL_RECHAZO_NO_CONFIRMADO')
  }
}
