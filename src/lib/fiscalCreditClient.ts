import { createFiscalCreditCommercialClient } from './fiscalCreditCommercialClient'
import type { FiscalClientScope } from './fiscalClient'
import { createFiscalCreditReviewClient } from './fiscalCreditReviewClient'
import { createFiscalCreditNumberClient } from './fiscalCreditNumberClient'
import type { FiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
import { prepareFiscalCreditDraft, validateFiscalCreditDraftProposal } from '../../supabase/functions/_shared/fiscalCreditDraft'
import type { FiscalCreditDraft } from '../../supabase/functions/_shared/fiscalCreditDraft'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import type { FiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { prepareFiscalCreditPreparation, validateFiscalCreditPreparationWire } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import type { FiscalCreditPreparationRecord } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import type { FiscalCreditDraftInput } from '../../supabase/functions/_shared/fiscalCreditDraft'
import { validateFiscalCreditDraftAck } from '../../supabase/functions/_shared/fiscalCreditDraftAck'
import type { FiscalCreditDraftAck } from '../../supabase/functions/_shared/fiscalCreditDraftAck'
import { validateFiscalCreditHistory } from '../../supabase/functions/_shared/fiscalCreditHistory'
import type { FiscalCreditHistory } from '../../supabase/functions/_shared/fiscalCreditHistory'
import { validateFiscalCreditCommercialSource } from '../../supabase/functions/_shared/fiscalCreditCommercialSource'
import type { FiscalCreditCommercialSource } from '../../supabase/functions/_shared/fiscalCreditCommercialSource'
import { validateFiscalCreditUnits } from '../../supabase/functions/_shared/fiscalCreditUnits'
import type { FiscalCreditUnits } from '../../supabase/functions/_shared/fiscalCreditUnits'
import { fiscalSha, fiscalUuid } from '../../supabase/functions/_shared/fiscalReplacement'

export interface PendingFiscalCredit { version: 1; operationId: string; requestId: string; sha256: string; intention: 'GUARDAR' | 'CANCELAR' }
export interface PendingFiscalCreditPreparation { version: 1; operationId: string; requestId: string; proposalSha: string; preparationSha: string; contextSha: string }
export interface FiscalCreditClientDependencies {
  storage: Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>
  invoke: (command: Record<string, unknown>) => Promise<unknown>
  exclusive: <T>(task: () => Promise<T>) => Promise<T>
}
const fail = (): never => { throw new Error('FISCAL_NC_CLIENTE_NO_CONFIRMADO') }
/** Sólo IDs/hash/intención en storage; propuesta/fuente/datos del receptor quedan en memoria. */
export function createFiscalCreditClient(scope: FiscalClientScope, deps: FiscalCreditClientDependencies) {
  if (![scope.authId, scope.kioskId, scope.saleId].every(fiscalUuid)) return fail()
  const sale = scope.saleId.toLowerCase()
  const key = `kioskopos:fiscal:v1:${scope.authId.toLowerCase()}:${scope.kioskId.toLowerCase()}:${sale}:credit`
  const preparationKey = `${key}:preparation`
  const pendingPreparation = (): Readonly<PendingFiscalCreditPreparation> | null => {
    try {
      const raw = deps.storage.getItem(preparationKey)
      if (raw === null || raw === 'null') return null
      if (raw.length > 2048) return fail()
      const value: unknown = JSON.parse(raw)
      if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
      const row = value as Record<string, unknown>, keys = ['version', 'operationId', 'requestId', 'proposalSha', 'preparationSha', 'contextSha']
      if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key)) || row.version !== 1
        || !fiscalUuid(row.operationId) || !fiscalUuid(row.requestId) || !fiscalSha(row.proposalSha) || !fiscalSha(row.preparationSha) || !fiscalSha(row.contextSha)) return fail()
      return Object.freeze({ version: 1, operationId: row.operationId, requestId: row.requestId, proposalSha: row.proposalSha, preparationSha: row.preparationSha, contextSha: row.contextSha })
    } catch { return fail() }
  }
  const writePreparation = (record: Readonly<PendingFiscalCreditPreparation> | null): void => {
    const raw = JSON.stringify(record); deps.storage.setItem(preparationKey, raw)
    if (deps.storage.getItem(preparationKey) !== raw) return fail()
  }
  const retirePreparation = (record: Readonly<PendingFiscalCreditPreparation>): void => {
    if (JSON.stringify(pendingPreparation()) !== JSON.stringify(record)) return fail()
    writePreparation(null)
  }
  const retireCancelledPreparation = (record: Readonly<PendingFiscalCredit>): void => {
    const prepared = pendingPreparation()
    if (!prepared) return
    if (prepared.operationId !== record.operationId || prepared.requestId !== record.requestId || prepared.proposalSha !== record.sha256) return fail()
    retirePreparation(prepared)
  }
  const readPreparation = async (source: Readonly<FiscalRepresentation>, proposal: Readonly<FiscalCreditDraft>) => {
    const result = await deps.invoke({ accion: 'PREPARACION_NC', venta_id: sale, operacion_origen_id: source.operacion_id,
      solicitud_id: proposal.datos.solicitud_id, propuesta_sha256: proposal.sha256 })
    return result === null ? null : validateFiscalCreditPreparationWire(result, source, proposal)
  }
  const matchesPreparation = (record: Readonly<PendingFiscalCreditPreparation>, stored: Readonly<FiscalCreditPreparationRecord>): boolean =>
    stored.preparacion.sha256 === record.preparationSha && stored.preparacion.datos.contexto_sha256 === record.contextSha
  const pending = (): Readonly<PendingFiscalCredit> | null => {
    try {
      const raw = deps.storage.getItem(key)
      if (raw === null || raw === 'null') return null
      if (raw.length > 2048) return fail()
      const v: unknown = JSON.parse(raw)
      if (!v || typeof v !== 'object' || Array.isArray(v)) return fail()
      const value = v as Record<string, unknown>, keys = ['version', 'operationId', 'requestId', 'sha256', 'intention']
      if (Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k)) || value.version !== 1
        || !fiscalUuid(value.operationId) || !fiscalUuid(value.requestId) || !fiscalSha(value.sha256)
        || value.intention !== 'GUARDAR' && value.intention !== 'CANCELAR') return fail()
      return Object.freeze({ version: 1, operationId: value.operationId, requestId: value.requestId, sha256: value.sha256, intention: value.intention })
    } catch { return fail() }
  }
  const write = (record: Readonly<PendingFiscalCredit> | null): void => {
    const raw = JSON.stringify(record)
    deps.storage.setItem(key, raw)
    if (deps.storage.getItem(key) !== raw) return fail()
  }
  const retire = (record: Readonly<PendingFiscalCredit>): void => {
    if (JSON.stringify(pending()) !== JSON.stringify(record)) return fail()
    if (deps.storage.removeItem) { deps.storage.removeItem(key); if (deps.storage.getItem(key) !== null) return fail() }
    else write(null)
  }
  const identity = (record: Readonly<PendingFiscalCredit>) => ({ saleId: sale, operationId: record.operationId, requestId: record.requestId, sha256: record.sha256 })
  const command = (action: 'BORRADOR_NC' | 'CANCELAR_BORRADOR_NC', record: Readonly<PendingFiscalCredit>) => ({ accion: action, venta_id: sale, operacion_origen_id: record.operationId, solicitud_id: record.requestId, propuesta_sha256: record.sha256 })
  const read = async (record: Readonly<PendingFiscalCredit>): Promise<Readonly<FiscalCreditDraftAck> | null> => {
    const result = await deps.invoke(command('BORRADOR_NC', record))
    return result === null ? null : validateFiscalCreditDraftAck(result, identity(record))
  }
  let numberPending: () => boolean = () => false
  let commercialPending: () => boolean = () => false
  const reviews = createFiscalCreditReviewClient(scope, deps, () => pending() !== null || pendingPreparation() !== null || numberPending() || commercialPending())
  const numbers = createFiscalCreditNumberClient(scope, deps, () => pending() !== null || pendingPreparation() !== null || reviews.pendingReview() !== null || commercialPending())
  numberPending = () => numbers.pendingNumber() !== null
  const commercial = createFiscalCreditCommercialClient(scope, deps, () => pending() !== null || pendingPreparation() !== null || reviews.pendingReview() !== null || numberPending())
  commercialPending = () => commercial.pending() !== null
  return {
    commercial,
    ...reviews,
    ...numbers,
    pending,
    pendingPreparation,
    async recoverPreparation(source: Readonly<FiscalRepresentation>, proposal: Readonly<FiscalCreditDraft>): Promise<Readonly<FiscalCreditPreparationRecord> | null> {
      try {
        const original = structuredClone(source), captured = { canonico: proposal.canonico, sha256: proposal.sha256 }
        if (original.venta_id !== sale) return fail()
        const checked = await validateFiscalCreditDraftProposal(original, captured)
        return await deps.exclusive(async () => {
          const record = pendingPreparation()
          if (!record) return null
          if (record.operationId !== original.operacion_id || record.requestId !== checked.datos.solicitud_id || record.proposalSha !== checked.sha256) return fail()
          const stored = await readPreparation(original, checked)
          if (stored) { if (!matchesPreparation(record, stored)) return fail(); retirePreparation(record) }
          return stored
        })
      } catch { return fail() }
    },
    async savePreparation(source: Readonly<FiscalRepresentation>, proposal: Readonly<FiscalCreditDraft>, context: Readonly<FiscalCreditContext>, input: unknown): Promise<Readonly<FiscalCreditPreparationRecord>> {
      try {
        const original = structuredClone(source), captured = structuredClone(proposal), metadata = structuredClone(context), entry: unknown = structuredClone(input)
        if (original.venta_id !== sale) return fail()
        const checked = await validateFiscalCreditDraftProposal(original, { canonico: captured.canonico, sha256: captured.sha256 })
        const prepared = await prepareFiscalCreditPreparation(original, checked, metadata, entry)
        const record: PendingFiscalCreditPreparation = { version: 1, operationId: original.operacion_id, requestId: checked.datos.solicitud_id,
          proposalSha: checked.sha256, preparationSha: prepared.sha256, contextSha: prepared.datos.contexto_sha256 }
        return await deps.exclusive(async () => {
          if (pending() || reviews.pendingReview() || numberPending() || commercialPending()) return fail()
          const prior = pendingPreparation()
          if (prior && JSON.stringify(prior) !== JSON.stringify(record)) return fail()
          const before = await readPreparation(original, checked)
          if (before) { if (!matchesPreparation(record, before)) return fail(); if (prior) retirePreparation(prior); return before }
          writePreparation(record)
          try { await deps.invoke({ accion: 'GUARDAR_PREPARACION_NC', venta_id: sale, operacion_origen_id: record.operationId,
            solicitud_id: record.requestId, propuesta_sha256: record.proposalSha, contexto_sha256: record.contextSha, entrada: entry }) }
          catch { /* Conservar identidad; sólo lectura durable confirma. */ }
          const stored = await readPreparation(original, checked)
          if (!stored || !matchesPreparation(record, stored)) return fail()
          retirePreparation(record); return stored
        })
      } catch { return fail() }
    },
    async preparation(source: Readonly<FiscalRepresentation>, proposal: Readonly<FiscalCreditDraft>): Promise<Readonly<FiscalCreditPreparationRecord> | null> {
      try {
        const original = structuredClone(source), captured = { canonico: proposal.canonico, sha256: proposal.sha256 }
        if (original.venta_id !== sale || !fiscalUuid(original.operacion_id)) return fail()
        const checked = await validateFiscalCreditDraftProposal(original, captured)
        const result = await deps.invoke({ accion: 'PREPARACION_NC', venta_id: sale, operacion_origen_id: original.operacion_id,
          solicitud_id: checked.datos.solicitud_id, propuesta_sha256: checked.sha256 })
        return result === null ? null : await validateFiscalCreditPreparationWire(result, original, checked)
      } catch { return fail() }
    },
    async context(source: Readonly<FiscalRepresentation>, proposal: Readonly<FiscalCreditDraft>): Promise<Readonly<FiscalCreditContext>> {
      try {
        const original = structuredClone(source), captured = { canonico: proposal.canonico, sha256: proposal.sha256 }
        if (original.venta_id !== sale || !fiscalUuid(original.operacion_id)) return fail()
        const checked = await validateFiscalCreditDraftProposal(original, captured)
        const command = { accion: 'CONTEXTO_NC', venta_id: sale, operacion_origen_id: original.operacion_id, solicitud_id: checked.datos.solicitud_id, propuesta_sha256: checked.sha256 }
        return await validateFiscalCreditContext(await deps.invoke(command), original, checked)
      } catch { return fail() }
    },
    async units(source: Readonly<FiscalRepresentation>, commercial: Readonly<FiscalCreditCommercialSource>): Promise<Readonly<FiscalCreditUnits>> {
      try {
        const original = structuredClone(source), captured = structuredClone(commercial)
        if (original.venta_id !== sale || !fiscalUuid(original.operacion_id)) return fail()
        return await validateFiscalCreditUnits(await deps.invoke({ accion: 'UNIDADES_NC', venta_id: sale, operacion_origen_id: original.operacion_id }), original, captured)
      } catch { return fail() }
    },
    async commercialSource(source: Readonly<FiscalRepresentation>): Promise<Readonly<FiscalCreditCommercialSource>> {
      try {
        const original = structuredClone(source)
        if (original.venta_id !== sale || !fiscalUuid(original.operacion_id)) return fail()
        return await validateFiscalCreditCommercialSource(await deps.invoke({ accion: 'FUENTE_COMERCIAL_NC', venta_id: sale, operacion_origen_id: original.operacion_id }), original)
      } catch { return fail() }
    },
    async recover(): Promise<Readonly<FiscalCreditDraftAck> | null> {
      try { return await deps.exclusive(async () => {
        const record = pending(); if (!record) return null
        const result = await read(record)
        if (result?.estado === 'CANCELADA') retireCancelledPreparation(record)
        if (result && (result.estado === 'CANCELADA' || record.intention === 'GUARDAR')) retire(record)
        return result
      }) } catch { return fail() }
    },
    async save(source: Readonly<FiscalRepresentation>, input: FiscalCreditDraftInput): Promise<Readonly<FiscalCreditDraftAck>> {
      try {
        const original = structuredClone(source), captured = structuredClone(input)
        if (original.venta_id !== sale) return fail()
        return await deps.exclusive(async () => {
          if (pendingPreparation() || reviews.pendingReview() || numberPending() || commercialPending()) return fail()
          const prior = pending()
          if (prior && (prior.intention !== 'GUARDAR' || prior.operationId !== original.operacion_id)) return fail()
          // Sólo validar forma/hash aquí. Fecha, saldo y elegibilidad finales pertenecen al servidor.
          const proposal = await prepareFiscalCreditDraft(original, captured, captured.fecha)
          if (prior && (prior.requestId !== proposal.datos.solicitud_id || prior.sha256 !== proposal.sha256)) return fail()
          // El UUID pertenece al formulario/intento, no se genera uno nuevo en cada click/retry.
          const record: PendingFiscalCredit = prior ?? { version: 1, operationId: original.operacion_id, requestId: proposal.datos.solicitud_id, sha256: proposal.sha256, intention: 'GUARDAR' }
          const before = await read(record)
          if (before) { if (prior) retire(prior); return before }
          const body = { accion: 'GUARDAR_BORRADOR_NC', venta_id: sale, operacion_origen_id: record.operationId, propuesta: captured }
          if (new TextEncoder().encode(JSON.stringify(body)).length > 65536) return fail()
          write(record)
          try { await deps.invoke(body) } catch { /* Recuperar misma identidad; no sustituir propuesta. */ }
          const stored = await read(record)
          if (!stored) return fail()
          retire(record); return stored
        })
      } catch { return fail() }
    },
    async cancel(operationId: string, requestId: string, sha256: string): Promise<Readonly<FiscalCreditDraftAck>> {
      try {
        if (!fiscalUuid(operationId) || !fiscalUuid(requestId) || !fiscalSha(sha256)) return fail()
        const record: PendingFiscalCredit = { version: 1, operationId, requestId, sha256, intention: 'CANCELAR' }
        return await deps.exclusive(async () => {
          const preparation = pendingPreparation()
          if (reviews.pendingReview() || numberPending() || commercialPending()) return fail()
          if (preparation && (preparation.operationId !== operationId || preparation.requestId !== requestId || preparation.proposalSha !== sha256)) return fail()
          const prior = pending()
          if (prior && (prior.operationId !== operationId || prior.requestId !== requestId || prior.sha256 !== sha256)) return fail()
          write(record)
          const before = await read(record)
          if (before?.estado === 'CANCELADA') { retireCancelledPreparation(record); retire(record); return before }
          try { await deps.invoke(command('CANCELAR_BORRADOR_NC', record)) } catch { /* SQL028 cierra también intentos sin caso confirmado. */ }
          const result = await read(record)
          if (!result || result.estado !== 'CANCELADA') return fail()
          retireCancelledPreparation(record); retire(record); return result
        })
      } catch { return fail() }
    },
    async history(source: Readonly<FiscalRepresentation>, after = 0): Promise<Readonly<FiscalCreditHistory>> {
      try {
        const original = structuredClone(source)
        if (original.venta_id !== sale || !fiscalUuid(original.operacion_id) || !Number.isSafeInteger(after) || after < 0 || after > 2147483647) return fail()
        return await validateFiscalCreditHistory(await deps.invoke({ accion: 'HISTORIAL_BORRADORES_NC', venta_id: sale, operacion_origen_id: original.operacion_id, despues: after }), original, after)
      } catch { return fail() }
    },
  }
}
export type FiscalCreditClient = ReturnType<typeof createFiscalCreditClient>
