import type { FiscalRejectedCorrection } from '../../supabase/functions/_shared/fiscalRejectedCorrectionContract'
import { validateFiscalRejectedCorrection } from '../../supabase/functions/_shared/fiscalRejectedCorrectionContract'
import { fiscalSha, validateFiscalReplacement, validateFiscalReplacementProposal } from '../../supabase/functions/_shared/fiscalReplacement'
import type { FiscalReplacement, FiscalReplacementProposal } from '../../supabase/functions/_shared/fiscalReplacement'
import type { FiscalPreparationInput, FiscalPreparationContext } from '../../supabase/functions/_shared/fiscalPreparationContract'
import { prepareFiscalData } from '../../supabase/functions/_shared/fiscalPreparation'
import { validateFiscalReceipt } from '../../supabase/functions/_shared/fiscalReceipt'
import { validateFiscalDiagnosis } from '../../supabase/functions/_shared/fiscalDiagnosis'
import { validateFiscalPreparationCancellation } from '../../supabase/functions/_shared/fiscalCancellation'
import type { FiscalOwnerReview } from '../../supabase/functions/_shared/fiscalOwnerReview'
import { validateFiscalPreparationContext, validateFiscalSaleResolution } from '../../supabase/functions/_shared/fiscalPreparationPublic'
import { validateFiscalOwnerApproval, validatePublicFiscalOwnerReview } from '../../supabase/functions/_shared/fiscalOwnerReview'

export interface FiscalClientScope { authId: string; kioskId: string; saleId: string }
export interface FiscalClientDependencies {
  storage: Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>
  send: (command: Record<string, unknown>) => Promise<unknown>
  runExclusive?: <T>(name: string, task: () => Promise<T>) => Promise<T>
}
const queues = new WeakMap<object, Map<string, Promise<void>>>()
function localExclusive<T>(storage: object, name: string, task: () => Promise<T>): Promise<T> {
  const scopeQueues = queues.get(storage) ?? new Map<string, Promise<void>>()
  queues.set(storage, scopeQueues)
  const result = (scopeQueues.get(name) ?? Promise.resolve()).then(task)
  const settled = result.then(() => {}, () => {})
  scopeQueues.set(name, settled)
  void settled.then(() => { if (scopeQueues.get(name) === settled) scopeQueues.delete(name) })
  return result
}
interface PendingReplacement { version: 1 | 2; kind?: 'RECHAZO'; operationId: string; successorId: string; previousHash: string; numero: number; proposal: FiscalReplacementProposal }
interface Pending { version: 1; operationId: string; input: FiscalPreparationInput | null }
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const fail = (): never => { throw new Error('FISCAL_CLIENTE_NO_CONFIRMADO') }
const object = (input: unknown, keys: string[]): Record<string, unknown> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail()
  const value = input as Record<string, unknown>
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return fail()
  return value
}
/** Sólo DTO públicos. Ningún adaptador de firma/custodia/TA entra al navegador. */
export function createFiscalClient(scope: FiscalClientScope, deps: FiscalClientDependencies) {
  if (![scope.authId, scope.kioskId, scope.saleId].every(uuid)) return fail()
  const sale = scope.saleId.toLowerCase()
  const key = `kioskopos:fiscal:v1:${scope.authId.toLowerCase()}:${scope.kioskId.toLowerCase()}:${sale}`
  const exclusive = <T,>(task: () => Promise<T>): Promise<T> => deps.runExclusive ? deps.runExclusive(key, task) : localExclusive(deps.storage, key, task)
  const write = (name: string, value: unknown) => {
    const raw = JSON.stringify(value)
    deps.storage.setItem(name, raw)
    if (deps.storage.getItem(name) !== raw) return fail()
  }
  const erase = (name: string) => {
    if (deps.storage.removeItem) {
      deps.storage.removeItem(name)
      if (deps.storage.getItem(name) !== null) return fail()
    } else write(name, null)
  }
  const retire = () => erase(key)
  const replacementKey = `${key}:replacement`
  const pending = (): Pending | null => {
    const raw = deps.storage.getItem(key)
    if (raw === null || raw === 'null') return null
    if (raw.length > 65536) return fail()
    const value = object(JSON.parse(raw), ['version', 'operationId', 'input'])
    if (value.version !== 1 || !uuid(value.operationId) || value.input !== null && (!value.input || typeof value.input !== 'object' || Array.isArray(value.input))) return fail()
    return value as unknown as Pending
  }
  const invoke = async (command: Record<string, unknown>) => {
    const value = object(await deps.send(command), ['version', 'entorno', 'emision_habilitada', 'resultado'])
    if (value.version !== 1 || value.entorno !== 'HOMOLOGACION' || value.emision_habilitada !== false) return fail()
    return value.resultado
  }
  const pendingReplacement = (): PendingReplacement | null => {
    const raw = deps.storage.getItem(replacementKey)
    if (raw === null || raw === 'null') return null
    if (raw.length > 65536) return fail()
    const parsed: unknown = JSON.parse(raw)
    const rejected = !!parsed && typeof parsed === 'object' && 'version' in parsed && parsed.version === 2
    const v = object(parsed, rejected ? ['version', 'kind', 'operationId', 'successorId', 'previousHash', 'numero', 'proposal'] : ['version', 'operationId', 'successorId', 'previousHash', 'numero', 'proposal'])
    const proposal = object(v.proposal, ['canonico', 'sha256'])
    if ((rejected ? v.version !== 2 || v.kind !== 'RECHAZO' : v.version !== 1) || !uuid(v.operationId) || !uuid(v.successorId) || v.operationId === v.successorId || !fiscalSha(v.previousHash)
      || !Number.isSafeInteger(v.numero) || Number(v.numero) < 1 || Number(v.numero) > 99999999 || typeof proposal.canonico !== 'string' || !fiscalSha(proposal.sha256)) return fail()
    return v as unknown as PendingReplacement
  }
  const replacement = async (operationId: string) => {
    const value = await invoke({ accion: 'SUSTITUCION_PREPARACION_FISCAL', venta_id: sale, operacion_id: operationId })
    return value === null ? null : validateFiscalReplacement(value, sale, operationId)
  }
  const rejectedCorrection = async (operationId: string) => {
    const value = await invoke({ accion: 'CORRECCION_RECHAZO_FISCAL', venta_id: sale, operacion_id: operationId })
    return value === null ? null : validateFiscalRejectedCorrection(value, sale, operationId)
  }
  const correctionClosure = (record: PendingReplacement) => record.version === 2 ? rejectedCorrection(record.operationId) : replacement(record.operationId)
  const retireReplacement = (record: PendingReplacement) => {
    const stored = pendingReplacement()
    if (!stored || JSON.stringify(stored) !== JSON.stringify(record)) return fail()
    erase(replacementKey)
  }
  const matchesReplacement = (record: PendingReplacement, result: Readonly<FiscalReplacement | FiscalRejectedCorrection>) =>
    (record.version === 2 ? result.estado === 'RECHAZO_CORREGIDO' : result.estado === 'SUSTITUIDA') && result.sucesora_id === record.successorId && result.anterior_sha256 === record.previousHash
    && result.preparacion_sha256 === record.proposal.sha256 && result.numero === record.numero
  const finishReplacement = (record: PendingReplacement, result: Readonly<FiscalReplacement | FiscalRejectedCorrection>) => {
    if (!matchesReplacement(record, result)) return fail()
    const stored = pendingReplacement()
    if (!stored || JSON.stringify(stored) !== JSON.stringify(record)) return fail()
    const original = pending()
    if (!original || original.operationId === record.operationId || original.operationId === record.successorId) write(key, { version: 1, operationId: record.successorId, input: null })
    retireReplacement(record)
  }
  const replacementCommand = (record: PendingReplacement) => {
    const command = { accion: record.version === 2 ? 'CORREGIR_RECHAZO_FISCAL' : 'SUSTITUIR_PREPARACION_FISCAL', venta_id: sale, operacion_id: record.operationId,
      sucesora_id: record.successorId, anterior_sha256: record.previousHash, propuesta: record.proposal }
    if (new TextEncoder().encode(JSON.stringify(command)).length > 65536) return fail()
    return command
  }
  const submitReplacement = async (record: PendingReplacement) => {
    await validateFiscalReplacementProposal(record.proposal, sale)
    const already = record.version === 2 ? await correctionClosure(record) : null
    if (already) { finishReplacement(record, already); return already }
    try { await invoke(replacementCommand(record)) } catch { /* Confirmar por lectura durable, nunca crear otra identidad. */ }
    const result = await correctionClosure(record)
    if (!result) return fail()
    finishReplacement(record, result)
    return result
  }
  const cancellation = async (operationId: string) => {
    const value = await invoke({ accion: 'CANCELACION_PREPARACION_FISCAL', venta_id: sale, operacion_id: operationId })
    return value === null ? null : validateFiscalPreparationCancellation(value, sale, operationId)
  }
  return {
    pending,
    pendingReplacement,
    async replace(review: FiscalOwnerReview, input: FiscalPreparationInput, context: FiscalPreparationContext, kind: 'RESERVA' | 'RECHAZO' = 'RESERVA') {
      const originalReview = structuredClone(review), candidate = structuredClone(input), validationContext = structuredClone(context)
      return exclusive(async () => {
        if (!uuid(originalReview.operacion_id) || !['RESERVA', 'RECHAZO'].includes(kind) || originalReview.estado !== (kind === 'RECHAZO' ? 'ENVIO_INCIERTO' : 'RESERVADA') || originalReview.revision !== 1
          || !fiscalSha(originalReview.solicitud.sha256) || validationContext.venta_id !== sale) return fail()
        const previous = pending()
        if (previous && previous.operationId !== originalReview.operacion_id) return fail()
        await validatePublicFiscalOwnerReview(originalReview, originalReview.operacion_id)
        const prepared = await prepareFiscalData(validationContext, candidate)
        const previousBody = originalReview.solicitud.solicitud
        if (prepared.datos.cuitEmisor !== previousBody.cuitEmisor || prepared.datos.puntoVenta !== previousBody.puntoVenta
          || prepared.datos.tipoComprobante !== previousBody.tipoComprobante) return fail()
        let record = pendingReplacement()
        if (record && ((record.version === 2) !== (kind === 'RECHAZO') || record.operationId !== originalReview.operacion_id || record.previousHash !== originalReview.solicitud.sha256
          || record.proposal.canonico !== prepared.canonico || record.proposal.sha256 !== prepared.sha256)) return fail()
        if (!record) {
          record = { version: kind === 'RECHAZO' ? 2 : 1, ...(kind === 'RECHAZO' ? {kind: 'RECHAZO' as const} : {}), operationId: originalReview.operacion_id, successorId: crypto.randomUUID(), previousHash: originalReview.solicitud.sha256,
            numero: originalReview.solicitud.solicitud.numero, proposal: { canonico: prepared.canonico, sha256: prepared.sha256 } }
          if (JSON.stringify(record).length > 65536) return fail()
          replacementCommand(record)
          write(replacementKey, record)
        }
        return submitReplacement(record)
      })
    },
    async cancelReplacement() {
      return exclusive(async () => {
        const record = pendingReplacement()
        if (!record) return fail()
        await validateFiscalReplacementProposal(record.proposal, sale)
        const closed = await correctionClosure(record)
        if (closed && matchesReplacement(record, closed)) { finishReplacement(record, closed); return 'RECUPERADA' as const }
        // Cerrar el UUID sucesor aún no creado impide que un POST tardío lo use.
        // SQL 017 rechaza si la sustitución ya reservó cuerpo: nunca cancela número.
        try { await invoke({ accion: 'CANCELAR_PREPARACION_FISCAL', venta_id: sale, operacion_id: record.successorId }) } catch { /* Leer el cierre o la sustitución ganadora. */ }
        if (await cancellation(record.successorId)) {
          retireReplacement(record)
          return 'DESCARTADA' as const
        }
        const recovered = await correctionClosure(record)
        if (!recovered) return fail()
        finishReplacement(record, recovered)
        return 'RECUPERADA' as const
      })
    },
    async retryReplacement() {
      return exclusive(async () => { const record = pendingReplacement(); if (!record) return fail(); return submitReplacement(record) })
    },
    async diagnosis(operationId: string) {
      if (!uuid(operationId)) return fail()
      return validateFiscalDiagnosis(await invoke({ accion: 'DIAGNOSTICO_COMPROBANTE', venta_id: sale, operacion_id: operationId }), sale, operationId)
    },
    async receipt(operationId: string) {
      if (!uuid(operationId)) return fail()
      return validateFiscalReceipt(await invoke({ accion: 'CONSTANCIA_COMPROBANTE', venta_id: sale, operacion_id: operationId }), { operationId, saleId: sale })
    },
    async resolve() {
      return exclusive(async () => {
        let result = validateFiscalSaleResolution(await invoke({ accion: 'RESOLVER_VENTA', venta_id: sale }), sale)
        const correction = pendingReplacement()
        if (correction) {
          await validateFiscalReplacementProposal(correction.proposal, sale)
          const closed = await correctionClosure(correction)
          if (closed && matchesReplacement(correction, closed)) finishReplacement(correction, closed)
          else if (await cancellation(correction.successorId)) retireReplacement(correction)
          if (!pendingReplacement()) result = validateFiscalSaleResolution(await invoke({ accion: 'RESOLVER_VENTA', venta_id: sale }), sale)
        }
        // Seguir sólo enlaces durables. Nunca confundir sustitución con liberación.
        for (let hop = 0; hop < 16; hop++) {
          const before = pending()
          if (!before || result.operacion_id === before.operationId) break
          if (await cancellation(before.operationId)) { retire(); break }
          const closed = await replacement(before.operationId) ?? await rejectedCorrection(before.operationId)
          if (!closed) break
          write(key, { version: 1, operationId: closed.sucesora_id, input: null })
          if (hop === 15) return fail()
        }
        if (result.operacion_id) {
          const original = pending()
          if (original?.operationId === result.operacion_id && original.input !== null) write(key, { ...original, input: null })
        }
        return result
      })
    },
    async cancel(operationId: string) {
      if (!uuid(operationId)) return fail()
      return exclusive(async () => {
        if (pendingReplacement()) return fail()
        try { await invoke({ accion: 'CANCELAR_PREPARACION_FISCAL', venta_id: sale, operacion_id: operationId }) } catch { /* Sólo lectura durable confirma el cierre. */ }
        const result = await cancellation(operationId)
        if (!result) return fail()
        if (pending()?.operationId === operationId) retire()
        return result
      })
    },
    async context() {
      const value = validateFiscalPreparationContext(await invoke({ accion: 'DATOS_FISCALES_VENTA', venta_id: sale }))
      if (value.venta_id !== sale) return fail()
      return value
    },
    async save(input: FiscalPreparationInput, context?: FiscalPreparationContext) {
      const candidate = structuredClone(input)
      const validationContext = context ? structuredClone(context) : undefined
      return exclusive(async () => {
        if (pendingReplacement()) return fail()
        let original = pending()
        if (original && (original.input === null || JSON.stringify(original.input) !== JSON.stringify(candidate))) return fail()
        if (!original) {
          if (!validationContext || validationContext.venta_id !== sale) return fail()
          await prepareFiscalData(validationContext, candidate)
          // La validación es asíncrona: otro intento pudo guardar identidad mientras.
          original = pending()
          if (original && (original.input === null || JSON.stringify(original.input) !== JSON.stringify(candidate))) return fail()
          if (!original) {
            original = { version: 1, operationId: crypto.randomUUID(), input: candidate }
            if (JSON.stringify(original).length > 65536) return fail()
            write(key, original)
          }
        }
        const ack = object(await invoke({ accion: 'GUARDAR_DATOS_FISCALES', venta_id: sale, operacion_id: original.operationId, entrada: original.input }), ['operacion_id', 'venta_id', 'preparacion_sha256', 'estado', 'emision_habilitada'])
        if (ack.operacion_id !== original.operationId || ack.venta_id !== sale || ack.estado !== 'DATOS_PREPARADOS' || ack.emision_habilitada !== false
          || typeof ack.preparacion_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(ack.preparacion_sha256)) return fail()
        const result = validateFiscalSaleResolution(ack, sale)
        // Una vez confirmado en servidor, conservar sólo UUID local, sin documento
        // ni desglose del receptor. Si se pierde el ACK, mantener datos para replay.
        write(key, { ...original, input: null })
        return result
      })
    },
    async rejectedCorrection(operationId: string) {
      if (!uuid(operationId)) return fail()
      return rejectedCorrection(operationId)
    },
    async review(operationId: string) {
      if (!uuid(operationId)) return fail()
      return validatePublicFiscalOwnerReview(await invoke({ accion: 'REVISAR_COMPROBANTE', operacion_id: operationId }), operationId)
    },
    async prepare(operationId: string) {
      if (!uuid(operationId)) return fail()
      return exclusive(async () => { if (pendingReplacement()) return fail(); return validatePublicFiscalOwnerReview(await invoke({ accion: 'PREPARAR_COMPROBANTE', operacion_id: operationId }), operationId) })
    },
    approvalId(review: FiscalOwnerReview) {
      const name = `${key}:review:${review.operacion_id}:${review.revision}:${review.solicitud.sha256}`
      const raw = deps.storage.getItem(name)
      if (raw !== null) {
        const stored = object(JSON.parse(raw), ['id', 'expires'])
        if (!uuid(stored.id) || stored.expires !== null && (typeof stored.expires !== 'string' || !Number.isFinite(Date.parse(stored.expires)))) return fail()
        if (stored.expires === null || Date.parse(String(stored.expires)) > Date.now()) return stored.id
      }
      const id = crypto.randomUUID()
      write(name, { id, expires: null })
      return id
    },
    async approve(review: FiscalOwnerReview, id: string) {
      const captured = structuredClone(review)
      const expectedId = this.approvalId(review)
      return exclusive(async () => {
        const active = pending()
        if (pendingReplacement() || active && active.operationId !== captured.operacion_id || !uuid(id) || expectedId !== id) return fail()
        const result = validateFiscalOwnerApproval(await invoke({ accion: 'APROBAR_REVISION', operacion_id: captured.operacion_id, revision_id: id, solicitud_sha256: captured.solicitud.sha256, revision: captured.revision }), captured.operacion_id, captured.solicitud.sha256, captured.revision, id)
        write(`${key}:review:${captured.operacion_id}:${captured.revision}:${captured.solicitud.sha256}`, { id, expires: result.vence_en })
        return result
      })
    },
  }
}
export type FiscalClient = ReturnType<typeof createFiscalClient>
