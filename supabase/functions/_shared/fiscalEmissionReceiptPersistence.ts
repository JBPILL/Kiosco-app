import { validateFiscalEmissionReceipt } from './fiscalEmissionReceipt.ts'
import type { FiscalEmissionReceipt } from './fiscalEmissionReceipt.ts'
import type { FiscalRpc } from './fiscalPersistence.ts'

/** Evidencia separada del cierre fiscal. El ACK de escritura no prueba commit. */
export async function persistFiscalEmissionReceipt(admin: FiscalRpc, actorAuthId: string, operationId: string, attemptId: string, hash: string, input: unknown): Promise<void> {
  const fail = (): never => { throw new Error('FISCAL_RESPUESTA_NO_CONFIRMADA') }
  const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  if (![actorAuthId, operationId, attemptId].every(uuid) || !/^[0-9a-f]{64}$/.test(hash)) return fail()
  const receipt: Readonly<FiscalEmissionReceipt> = validateFiscalEmissionReceipt(input)
  const args = { p_actor_auth_id: actorAuthId, p_operacion_id: operationId, p_intento_id: attemptId, p_sha: hash }
  try { await admin.rpc('registrar_respuesta_emision_homologacion', { ...args, p_respuesta: receipt }) } catch { /* Recuperar el mismo registro antes de decidir. */ }
  const stored = await admin.rpc('cargar_respuesta_emision_homologacion', args)
  if (stored.error || !stored.data || typeof stored.data !== 'object' || Array.isArray(stored.data)) return fail()
  const value = stored.data as Record<string, unknown>
  const keys = ['operacion_id', 'intento_id', 'solicitud_sha256', 'respuesta', 'registrada']
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))
    || value.operacion_id !== operationId || value.intento_id !== attemptId || value.solicitud_sha256 !== hash || value.registrada !== true) return fail()
  const actual = validateFiscalEmissionReceipt(value.respuesta)
  if (actual.estado !== receipt.estado || JSON.stringify(actual.codigos) !== JSON.stringify(receipt.codigos)) return fail()
}
