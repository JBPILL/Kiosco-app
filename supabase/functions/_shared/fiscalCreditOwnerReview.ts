import type { FiscalRepresentation } from './fiscalRepresentation.ts'
import type { FiscalCreditDraft } from './fiscalCreditDraft.ts'
import type { FiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import { validateFiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import { fiscalUuid } from './fiscalReplacement.ts'

export interface FiscalCreditOwnerApproval {
  id: string; solicitud_id: string; reserva_id: string; solicitud_sha256: string; preparacion_sha256: string
  aprobada: true; vence_en: string; emision_habilitada: false
}
export interface FiscalCreditOwnerReview {
  version: 1; cuerpo: Readonly<FiscalCreditRequestRecord>; aprobacion: Readonly<FiscalCreditOwnerApproval> | null; emision_habilitada: false
}
const fail = (): never => { throw new Error('FISCAL_REVISION_NC_NO_CONFIRMADA') }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  const row = value as Record<string, unknown>
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) return fail()
  return row
}
/** Evidencia histórica; forma/fecha no prueban vigencia, Auth ni permiso de envío. */
export async function validateFiscalCreditOwnerReview(input: unknown, source: Readonly<FiscalRepresentation>, draft: Readonly<FiscalCreditDraft>): Promise<Readonly<FiscalCreditOwnerReview>> {
  try {
    const value = object(structuredClone(input), ['version', 'cuerpo', 'aprobacion', 'emision_habilitada'])
    if (value.version !== 1 || value.emision_habilitada !== false) return fail()
    const body = await validateFiscalCreditRequestRecord(value.cuerpo, source, draft)
    let approval: Readonly<FiscalCreditOwnerApproval> | null = null
    if (value.aprobacion !== null) {
      const row = object(value.aprobacion, ['id', 'solicitud_id', 'reserva_id', 'solicitud_sha256', 'preparacion_sha256', 'aprobada', 'vence_en', 'emision_habilitada'])
      if (!fiscalUuid(row.id) || row.solicitud_id !== body.datos.solicitud_id || row.reserva_id !== body.datos.reserva_id
        || row.solicitud_sha256 !== body.sha256 || row.preparacion_sha256 !== body.datos.preparacion_sha256 || row.aprobada !== true || row.emision_habilitada !== false
        || typeof row.vence_en !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(row.vence_en)
        || !Number.isFinite(Date.parse(row.vence_en))) return fail()
      approval = Object.freeze({ id: row.id, solicitud_id: body.datos.solicitud_id, reserva_id: body.datos.reserva_id,
        solicitud_sha256: body.sha256, preparacion_sha256: body.datos.preparacion_sha256, aprobada: true, vence_en: row.vence_en, emision_habilitada: false })
    }
    return Object.freeze({ version: 1, cuerpo: body, aprobacion: approval, emision_habilitada: false })
  } catch { return fail() }
}
