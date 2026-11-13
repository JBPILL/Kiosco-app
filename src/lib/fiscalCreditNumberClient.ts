import type { FiscalClientScope } from './fiscalClient'
import type { FiscalCreditClientDependencies } from './fiscalCreditClient'
import type { FiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
import type { FiscalCreditDraft } from '../../supabase/functions/_shared/fiscalCreditDraft'
import { validateFiscalCreditDraftProposal } from '../../supabase/functions/_shared/fiscalCreditDraft'
import { fiscalCreditPreparationWire, validateFiscalCreditPreparationWire } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import { validateFiscalCreditOwnerReviewWire } from '../../supabase/functions/_shared/fiscalCreditOwnerReview'
import type { FiscalCreditOwnerReview } from '../../supabase/functions/_shared/fiscalCreditOwnerReview'
import { fiscalUuid, fiscalSha } from '../../supabase/functions/_shared/fiscalReplacement'

export interface PendingFiscalCreditNumber {
  version: 1; operationId: string; requestId: string; proposalSha: string; preparationSha: string; reservationId: string
}
const fail = (): never => { throw new Error('FISCAL_NUMERACION_NC_CLIENTE_NO_CONFIRMADA') }
export function createFiscalCreditNumberClient(scope: FiscalClientScope, deps: FiscalCreditClientDependencies, blocked: () => boolean) {
  if (![scope.authId, scope.kioskId, scope.saleId].every(fiscalUuid)) return fail()
  const sale = scope.saleId.toLowerCase(), key = `kioskopos:fiscal:v1:${scope.authId.toLowerCase()}:${scope.kioskId.toLowerCase()}:${sale}:credit:number`
  const pendingNumber = (): Readonly<PendingFiscalCreditNumber> | null => {
    try {
      const raw = deps.storage.getItem(key)
      if (raw === null || raw === 'null') return null
      if (raw.length > 2048) return fail()
      const value: unknown = JSON.parse(raw)
      if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
      const row = value as Record<string, unknown>, fields = ['version', 'operationId', 'requestId', 'proposalSha', 'preparationSha', 'reservationId']
      if (Object.keys(row).length !== fields.length || fields.some(field => !Object.hasOwn(row, field)) || row.version !== 1
        || !fiscalUuid(row.operationId) || !fiscalUuid(row.requestId) || !fiscalUuid(row.reservationId) || !fiscalSha(row.proposalSha) || !fiscalSha(row.preparationSha)) return fail()
      return Object.freeze({ version: 1, operationId: row.operationId, requestId: row.requestId, proposalSha: row.proposalSha, preparationSha: row.preparationSha, reservationId: row.reservationId })
    } catch { return fail() }
  }
  const write = (record: Readonly<PendingFiscalCreditNumber> | null) => {
    deps.storage.setItem(key, JSON.stringify(record))
    if (JSON.stringify(pendingNumber()) !== JSON.stringify(record)) return fail()
  }
  const capture = async (source: Readonly<FiscalRepresentation>, proposal: Readonly<FiscalCreditDraft>, preparation: unknown) => {
    const original = structuredClone(source), captured = structuredClone(proposal), prep = structuredClone(preparation)
    if (original.venta_id !== sale) return fail()
    const draft = await validateFiscalCreditDraftProposal(original, { canonico: captured.canonico, sha256: captured.sha256 })
    const stored = await validateFiscalCreditPreparationWire(prep, original, draft)
    if (stored.estado !== 'DATOS_NC_PREPARADOS') return fail()
    return { original, draft, prep: fiscalCreditPreparationWire(stored), preparationSha: stored.preparacion.sha256 }
  }
  type Captured = Awaited<ReturnType<typeof capture>>
  const identity = (value: Captured) => ({ venta_id: sale, operacion_origen_id: value.original.operacion_id, solicitud_id: value.draft.datos.solicitud_id, propuesta_sha256: value.draft.sha256 })
  const read = async (value: Captured): Promise<Readonly<FiscalCreditOwnerReview> | null> => {
    const raw = await deps.invoke({ accion: 'CUERPO_NC', ...identity(value) })
    if (raw === null) return null
    const body = await validateFiscalCreditOwnerReviewWire(raw, value.original, value.draft, value.prep)
    if (body.aprobacion !== null) return fail()
    return body
  }
  const matches = (value: Captured, record: Readonly<PendingFiscalCreditNumber>) => record.operationId === value.original.operacion_id
    && record.requestId === value.draft.datos.solicitud_id && record.proposalSha === value.draft.sha256 && record.preparationSha === value.preparationSha
  const recover = async (value: Captured, record: Readonly<PendingFiscalCreditNumber>) => {
    if (!matches(value, record)) return fail()
    const body = await read(value)
    if (body) {
      // Otro trabajador puede haber reservado primero. El cuerpo durable del mismo caso/preparación prevalece.
      if (JSON.stringify(pendingNumber()) !== JSON.stringify(record)) return fail()
      write(null)
    }
    return body
  }
  const send = async (value: Captured, record: Readonly<PendingFiscalCreditNumber>) => {
    if (!matches(value, record) || JSON.stringify(pendingNumber()) !== JSON.stringify(record)) return fail()
    try { await deps.invoke({ accion: 'NUMERAR_NC', ...identity(value), preparacion_sha256: record.preparationSha, reserva_id: record.reservationId }) }
    catch { /* Un ACK perdido no prueba rollback: sólo GET acredita cuerpo durable. */ }
    const body = await recover(value, record)
    if (!body) return fail()
    return body
  }
  const reserve = async (value: Captured, retry: boolean) => deps.exclusive(async () => {
    if (blocked()) return fail()
    const previous = pendingNumber()
    if (previous) {
      const body = await recover(value, previous)
      if (body) return body
      if (!retry) return fail()
      return send(value, previous)
    }
    if (retry) return fail()
    const existing = await read(value)
    if (existing) return existing
    const record: PendingFiscalCreditNumber = { version: 1, operationId: value.original.operacion_id, requestId: value.draft.datos.solicitud_id,
      proposalSha: value.draft.sha256, preparationSha: value.preparationSha, reservationId: crypto.randomUUID() }
    write(record)
    return send(value, record)
  })
  return {
    pendingNumber,
    async body(source: Readonly<FiscalRepresentation>, proposal: Readonly<FiscalCreditDraft>, preparation: unknown): Promise<Readonly<FiscalCreditOwnerReview> | null> {
      try { return await read(await capture(source, proposal, preparation)) } catch { return fail() }
    },
    async recoverNumber(source: Readonly<FiscalRepresentation>, proposal: Readonly<FiscalCreditDraft>, preparation: unknown): Promise<Readonly<FiscalCreditOwnerReview> | null> {
      try { const value = await capture(source, proposal, preparation); return await deps.exclusive(async () => { const record = pendingNumber(); return record ? recover(value, record) : null }) } catch { return fail() }
    },
    async number(source: Readonly<FiscalRepresentation>, proposal: Readonly<FiscalCreditDraft>, preparation: unknown): Promise<Readonly<FiscalCreditOwnerReview>> {
      try { return await reserve(await capture(source, proposal, preparation), false) } catch { return fail() }
    },
    async retryNumber(source: Readonly<FiscalRepresentation>, proposal: Readonly<FiscalCreditDraft>, preparation: unknown): Promise<Readonly<FiscalCreditOwnerReview>> {
      try { return await reserve(await capture(source, proposal, preparation), true) } catch { return fail() }
    },
  }
}
