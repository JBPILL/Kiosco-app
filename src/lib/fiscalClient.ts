import type { FiscalPreparationInput, FiscalPreparationContext } from '../../supabase/functions/_shared/fiscalPreparationContract'
import { prepareFiscalData } from '../../supabase/functions/_shared/fiscalPreparation'
import type { FiscalOwnerReview } from '../../supabase/functions/_shared/fiscalOwnerReview'
import { validateFiscalPreparationContext, validateFiscalSaleResolution } from '../../supabase/functions/_shared/fiscalPreparationPublic'
import { validateFiscalOwnerApproval, validatePublicFiscalOwnerReview } from '../../supabase/functions/_shared/fiscalOwnerReview'

export interface FiscalClientScope { authId: string; kioskId: string; saleId: string }
export interface FiscalClientDependencies {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  send: (command: Record<string, unknown>) => Promise<unknown>
}
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
  const write = (name: string, value: unknown) => {
    const raw = JSON.stringify(value)
    deps.storage.setItem(name, raw)
    if (deps.storage.getItem(name) !== raw) return fail()
  }
  const pending = (): Pending | null => {
    const raw = deps.storage.getItem(key)
    if (raw === null) return null
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
  return {
    pending,
    async resolve() {
      const result = validateFiscalSaleResolution(await invoke({ accion: 'RESOLVER_VENTA', venta_id: sale }), sale)
      if (result.operacion_id) {
        const original = pending()
        if (original?.operationId === result.operacion_id && original.input !== null) write(key, { ...original, input: null })
      }
      return result
    },
    async context() {
      const value = validateFiscalPreparationContext(await invoke({ accion: 'DATOS_FISCALES_VENTA', venta_id: sale }))
      if (value.venta_id !== sale) return fail()
      return value
    },
    async save(input: FiscalPreparationInput, context?: FiscalPreparationContext) {
      const candidate = structuredClone(input)
      let original = pending()
      if (original && (original.input === null || JSON.stringify(original.input) !== JSON.stringify(candidate))) return fail()
      if (!original) {
        if (!context || context.venta_id !== sale) return fail()
        await prepareFiscalData(context, candidate)
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
    },
    async review(operationId: string) {
      if (!uuid(operationId)) return fail()
      return validatePublicFiscalOwnerReview(await invoke({ accion: 'REVISAR_COMPROBANTE', operacion_id: operationId }), operationId)
    },
    async prepare(operationId: string) {
      if (!uuid(operationId)) return fail()
      return validatePublicFiscalOwnerReview(await invoke({ accion: 'PREPARAR_COMPROBANTE', operacion_id: operationId }), operationId)
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
      if (!uuid(id) || this.approvalId(review) !== id) return fail()
      const result = validateFiscalOwnerApproval(await invoke({ accion: 'APROBAR_REVISION', operacion_id: review.operacion_id, revision_id: id, solicitud_sha256: review.solicitud.sha256, revision: review.revision }), review.operacion_id, review.solicitud.sha256, review.revision, id)
      write(`${key}:review:${review.operacion_id}:${review.revision}:${review.solicitud.sha256}`, { id, expires: result.vence_en })
      return result
    },
  }
}
export type FiscalClient = ReturnType<typeof createFiscalClient>
