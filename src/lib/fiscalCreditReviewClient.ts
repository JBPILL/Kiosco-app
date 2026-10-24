import type { FiscalClientScope } from './fiscalClient'
import type { FiscalCreditClientDependencies } from './fiscalCreditClient'
import type { FiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
import type { FiscalCreditDraft } from '../../supabase/functions/_shared/fiscalCreditDraft'
import type { FiscalCreditOwnerReview } from '../../supabase/functions/_shared/fiscalCreditOwnerReview'
import { fiscalCreditOwnerReviewWire, validateFiscalCreditOwnerReviewWire } from '../../supabase/functions/_shared/fiscalCreditOwnerReview'
import { fiscalUuid, fiscalSha } from '../../supabase/functions/_shared/fiscalReplacement'

export interface PendingFiscalCreditReview {
  version: 1; operationId: string; requestId: string; proposalSha: string; preparationSha: string; bodySha: string; reviewId: string
}
const fail = (): never => { throw new Error('FISCAL_REVISION_NC_CLIENTE_NO_CONFIRMADA') }
export function createFiscalCreditReviewClient(scope: FiscalClientScope, deps: FiscalCreditClientDependencies, blocked: () => boolean) {
  if (![scope.authId, scope.kioskId, scope.saleId].every(fiscalUuid)) return fail()
  const sale = scope.saleId.toLowerCase(), key = `kioskopos:fiscal:v1:${scope.authId.toLowerCase()}:${scope.kioskId.toLowerCase()}:${sale}:credit:review`
  const pendingReview = (): Readonly<PendingFiscalCreditReview> | null => {
    const raw = deps.storage.getItem(key)
    if (raw === null || raw === 'null') return null
    if (raw.length > 2048) return fail()
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
    const row = value as Record<string, unknown>, fields = ['version', 'operationId', 'requestId', 'proposalSha', 'preparationSha', 'bodySha', 'reviewId']
    if (Object.keys(row).length !== fields.length || fields.some(field => !Object.hasOwn(row, field)) || row.version !== 1
      || !fiscalUuid(row.operationId) || !fiscalUuid(row.requestId) || !fiscalUuid(row.reviewId) || !fiscalSha(row.proposalSha) || !fiscalSha(row.preparationSha) || !fiscalSha(row.bodySha)) return fail()
    return Object.freeze({ version: 1, operationId: row.operationId, requestId: row.requestId, proposalSha: row.proposalSha, preparationSha: row.preparationSha, bodySha: row.bodySha, reviewId: row.reviewId })
  }
  const write = (record: Readonly<PendingFiscalCreditReview> | null) => {
    deps.storage.setItem(key, JSON.stringify(record))
    if (JSON.stringify(pendingReview()) !== JSON.stringify(record)) return fail()
  }
  const read = async (source: Readonly<FiscalRepresentation>, proposal: Readonly<FiscalCreditDraft>, preparation: unknown, id: string | null) => {
    if (source.venta_id !== sale) return fail()
    const result = await deps.invoke({ accion: 'REVISION_NC', venta_id: sale, operacion_origen_id: source.operacion_id,
      solicitud_id: proposal.datos.solicitud_id, propuesta_sha256: proposal.sha256, revision_id: id })
    const review = await validateFiscalCreditOwnerReviewWire(result, source, proposal, preparation)
    if (id === null ? review.aprobacion !== null : review.aprobacion?.id !== id) return fail()
    return review
  }
  const recover = async (source: Readonly<FiscalRepresentation>, proposal: Readonly<FiscalCreditDraft>, preparation: unknown, record: Readonly<PendingFiscalCreditReview>) => {
    if (record.operationId !== source.operacion_id || record.requestId !== proposal.datos.solicitud_id || record.proposalSha !== proposal.sha256) return fail()
    const review = await read(source, proposal, preparation, record.reviewId)
    if (review.cuerpo.sha256 !== record.bodySha || review.cuerpo.datos.preparacion_sha256 !== record.preparationSha || JSON.stringify(pendingReview()) !== JSON.stringify(record)) return fail()
    write(null)
    return review
  }
  return {
    pendingReview,
    async review(source: Readonly<FiscalRepresentation>, proposal: Readonly<FiscalCreditDraft>, preparation: unknown): Promise<Readonly<FiscalCreditOwnerReview>> {
      try { return await read(structuredClone(source), structuredClone(proposal), structuredClone(preparation), null) } catch { return fail() }
    },
    async recoverReview(source: Readonly<FiscalRepresentation>, proposal: Readonly<FiscalCreditDraft>, preparation: unknown): Promise<Readonly<FiscalCreditOwnerReview> | null> {
      try {
        const original = structuredClone(source), draft = structuredClone(proposal), prep = structuredClone(preparation)
        return await deps.exclusive(async () => { const record = pendingReview(); return record ? recover(original, draft, prep, record) : null })
      } catch { return fail() }
    },
    async approveReview(source: Readonly<FiscalRepresentation>, proposal: Readonly<FiscalCreditDraft>, preparation: unknown, expected: Readonly<FiscalCreditOwnerReview>): Promise<Readonly<FiscalCreditOwnerReview>> {
      try {
        const original = structuredClone(source), draft = structuredClone(proposal), prep = structuredClone(preparation)
        const checked = await validateFiscalCreditOwnerReviewWire(fiscalCreditOwnerReviewWire(expected), original, draft, prep)
        return await deps.exclusive(async () => {
          if (blocked()) return fail()
          const previous = pendingReview()
          if (previous) return recover(original, draft, prep, previous)
          const current = await read(original, draft, prep, null)
          if (current.cuerpo.canonico !== checked.cuerpo.canonico || current.cuerpo.sha256 !== checked.cuerpo.sha256) return fail()
          const record: PendingFiscalCreditReview = { version: 1, operationId: original.operacion_id, requestId: draft.datos.solicitud_id,
            proposalSha: draft.sha256, preparationSha: checked.cuerpo.datos.preparacion_sha256, bodySha: checked.cuerpo.sha256, reviewId: crypto.randomUUID() }
          write(record)
          try { await deps.invoke({ accion: 'APROBAR_REVISION_NC', venta_id: sale, operacion_origen_id: record.operationId, solicitud_id: record.requestId,
            propuesta_sha256: record.proposalSha, revision_id: record.reviewId, cuerpo_sha256: record.bodySha, preparacion_sha256: record.preparationSha }) }
          catch { /* Recuperar antes de repetir o retirar la identidad. */ }
          return recover(original, draft, prep, record)
        })
      } catch { return fail() }
    },
  }
}
