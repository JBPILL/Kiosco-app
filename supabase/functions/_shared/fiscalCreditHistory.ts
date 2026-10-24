import { fiscalRepresentationWire, validateFiscalRepresentation } from './fiscalRepresentation.ts'
import type { FiscalRepresentation } from './fiscalRepresentation.ts'
import { validateFiscalCreditDraftProposal } from './fiscalCreditDraft.ts'
import type { FiscalCreditDraft } from './fiscalCreditDraft.ts'
import { validateFiscalCreditDraftAck } from './fiscalCreditDraftAck.ts'
import type { FiscalCreditDraftAck } from './fiscalCreditDraftAck.ts'

export interface FiscalCreditHistoryCase { secuencia: number; acuse: Readonly<FiscalCreditDraftAck>; propuesta: Readonly<FiscalCreditDraft> }
export interface FiscalCreditHistory {
  version: 1; venta_id: string; operacion_origen_id: string; despues: number
  casos: readonly Readonly<FiscalCreditHistoryCase>[]; continuar_desde: number | null
}
const fail = (): never => { throw new Error('FISCAL_HISTORIAL_NC_NO_CONFIRMADO') }
function object(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail()
  const v = input as Record<string, unknown>
  if (Object.keys(v).length !== keys.length || keys.some(key => !Object.hasOwn(v, key))) return fail()
  return v
}
/** Página histórica: el hash identifica el caso, no acredita CAE o saldo disponible hoy. */
export async function validateFiscalCreditHistory(input: unknown, original: Readonly<FiscalRepresentation>, after: number): Promise<Readonly<FiscalCreditHistory>> {
  try {
    const captured = structuredClone(original), v = object(structuredClone(input), ['version', 'venta_id', 'operacion_origen_id', 'despues', 'casos', 'continuar_desde'])
    if (Object.keys(captured).length !== 10 || !Number.isSafeInteger(after) || after < 0 || after > 2147483647) return fail()
    const source = await validateFiscalRepresentation(fiscalRepresentationWire(captured), captured.venta_id, captured.operacion_id)
    if (v.version !== 1 || v.venta_id !== source.venta_id || v.operacion_origen_id !== source.operacion_id || v.despues !== after
      || !Array.isArray(v.casos) || v.casos.length > 10) return fail()
    const rows: Readonly<FiscalCreditHistoryCase>[] = [], ids = new Set<string>()
    let previous = after
    for (const input of v.casos) {
      const entry = object(input, ['secuencia', 'acuse', 'propuesta'])
      if (typeof entry.secuencia !== 'number' || !Number.isSafeInteger(entry.secuencia) || entry.secuencia <= previous || entry.secuencia > 2147483647) return fail()
      const propuesta = await validateFiscalCreditDraftProposal(source, entry.propuesta)
      const acuse = validateFiscalCreditDraftAck(entry.acuse, { saleId: source.venta_id, operationId: source.operacion_id, requestId: propuesta.datos.solicitud_id, sha256: propuesta.sha256 })
      if (ids.has(acuse.solicitud_id)) return fail()
      ids.add(acuse.solicitud_id); previous = entry.secuencia
      rows.push(Object.freeze({ secuencia: entry.secuencia, acuse, propuesta }))
    }
    if (v.continuar_desde !== null && (rows.length !== 10 || v.continuar_desde !== previous)) return fail()
    return Object.freeze({ version: 1, venta_id: source.venta_id, operacion_origen_id: source.operacion_id, despues: after, casos: Object.freeze(rows), continuar_desde: v.continuar_desde as number | null })
  } catch { return fail() }
}
export function fiscalCreditHistoryWire(history: Readonly<FiscalCreditHistory>): Record<string, unknown> {
  return { version: history.version, venta_id: history.venta_id, operacion_origen_id: history.operacion_origen_id, despues: history.despues,
    casos: history.casos.map(entry => ({ secuencia: entry.secuencia, acuse: entry.acuse, propuesta: { canonico: entry.propuesta.canonico, sha256: entry.propuesta.sha256 } })), continuar_desde: history.continuar_desde }
}
