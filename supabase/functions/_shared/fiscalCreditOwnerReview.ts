import type { FiscalRepresentation } from './fiscalRepresentation.ts'
import type { FiscalCreditDraft } from './fiscalCreditDraft.ts'
import type { FiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import { validateFiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import { fiscalUuid } from './fiscalReplacement.ts'
import { validateFiscalCreditPreparationWire } from './fiscalCreditPreparation.ts'
import { parseFiscalJson } from './fiscalStrictJson.ts'

export interface FiscalCreditOwnerApproval {
  id: string; solicitud_id: string; reserva_id: string; solicitud_sha256: string; preparacion_sha256: string
  aprobada: true; vence_en: string; emision_habilitada: false
}
export interface FiscalCreditOwnerReview {
  version: 1; cuerpo: Readonly<FiscalCreditRequestRecord>; aprobacion: Readonly<FiscalCreditOwnerApproval> | null; emision_habilitada: false
}
/** DTO explícito sin contexto/custodia ni paquete SQL crudo. */
export function fiscalCreditOwnerReviewWire(review: Readonly<FiscalCreditOwnerReview>): { version: 1; cuerpo: Pick<FiscalCreditRequestRecord, 'canonico' | 'sha256'>; aprobacion: Readonly<FiscalCreditOwnerApproval> | null; emision_habilitada: false } {
  const approval = review.aprobacion
  return { version: 1, cuerpo: { canonico: review.cuerpo.canonico, sha256: review.cuerpo.sha256 },
    aprobacion: approval === null ? null : { id: approval.id, solicitud_id: approval.solicitud_id, reserva_id: approval.reserva_id,
      solicitud_sha256: approval.solicitud_sha256, preparacion_sha256: approval.preparacion_sha256, aprobada: true,
      vence_en: approval.vence_en, emision_habilitada: false }, emision_habilitada: false }
}
const fail = (): never => { throw new Error('FISCAL_REVISION_NC_NO_CONFIRMADA') }
/** Reconstruye contra preparación explícita ya validada, no confía en el canónico recibido. */
export async function validateFiscalCreditOwnerReviewWire(input: unknown, source: Readonly<FiscalRepresentation>, draft: Readonly<FiscalCreditDraft>, preparation: unknown): Promise<Readonly<FiscalCreditOwnerReview>> {
  try {
    const original = structuredClone(source), proposal = structuredClone(draft), prepared = structuredClone(preparation)
    const value = object(structuredClone(input), ['version', 'cuerpo', 'aprobacion', 'emision_habilitada'])
    const body = object(value.cuerpo, ['canonico', 'sha256'])
    if (typeof body.canonico !== 'string' || new TextEncoder().encode(body.canonico).length > 131072) return fail()
    const data = object(parseFiscalJson(body.canonico), ['version', 'clase', 'entorno', 'venta_id', 'operacion_origen_id', 'solicitud_id', 'propuesta_sha256', 'preparacion_sha256', 'reserva_id', 'solicitud'])
    const request = data.solicitud
    if (!request || typeof request !== 'object' || Array.isArray(request)) return fail()
    const fields = request as Record<string, unknown>, stored = await validateFiscalCreditPreparationWire(prepared, original, proposal), prep = stored.preparacion.datos
    return await validateFiscalCreditOwnerReview({ ...value, cuerpo: {
      cuerpo: body,
      preparacion: { version: 1, entorno: 'HOMOLOGACION', venta_id: prep.venta_id, operacion_origen_id: prep.operacion_origen_id,
        solicitud_id: prep.solicitud_id, propuesta_sha256: prep.propuesta_sha256, estado: stored.estado, contexto: stored.contexto,
        preparacion: { canonico: stored.preparacion.canonico, sha256: stored.preparacion.sha256 }, propuesta: { canonico: proposal.canonico, sha256: proposal.sha256 },
        emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false },
      reserva: { version: 1, entorno: 'HOMOLOGACION', venta_id: data.venta_id, operacion_origen_id: data.operacion_origen_id, solicitud_id: data.solicitud_id,
        propuesta_sha256: data.propuesta_sha256, preparacion_sha256: data.preparacion_sha256, reserva_id: data.reserva_id,
        cuit_emisor: fields.cuitEmisor, punto_venta: fields.puntoVenta, tipo_comprobante: fields.tipoComprobante, numero: fields.numero, estado: 'RESERVADA', emision_habilitada: false },
    } }, original, proposal)
  } catch { return fail() }
}
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
