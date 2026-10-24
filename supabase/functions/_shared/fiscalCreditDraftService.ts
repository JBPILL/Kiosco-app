import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import { fiscalSha, fiscalUuid } from './fiscalReplacement.ts'
import { validateFiscalRepresentation } from './fiscalRepresentation.ts'
import type { FiscalRepresentation } from './fiscalRepresentation.ts'
import { prepareFiscalCreditDraft, validateFiscalCreditDraftProposal } from './fiscalCreditDraft.ts'
import { validateFiscalCreditContext } from './fiscalCreditContext.ts'
import type { FiscalCreditContext } from './fiscalCreditContext.ts'
import { validateFiscalCreditDraftAck } from './fiscalCreditDraftAck.ts'
import type { FiscalCreditDraftAck, FiscalCreditDraftScope } from './fiscalCreditDraftAck.ts'
import { validateFiscalCreditHistory } from './fiscalCreditHistory.ts'
import type { FiscalCreditHistory } from './fiscalCreditHistory.ts'
import { validateFiscalCreditCommercialSource } from './fiscalCreditCommercialSource.ts'
import type { FiscalCreditCommercialSource } from './fiscalCreditCommercialSource.ts'
import { validateFiscalCreditUnits } from './fiscalCreditUnits.ts'
import type { FiscalCreditUnits } from './fiscalCreditUnits.ts'
import { prepareFiscalCreditPreparation, validateFiscalCreditPreparationRecord } from './fiscalCreditPreparation.ts'
import type { FiscalCreditPreparationRecord } from './fiscalCreditPreparation.ts'
import { validateFiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import type { FiscalCreditRequestRecord } from './fiscalCreditRequest.ts'

const fail = (): never => { throw new Error('FISCAL_NC_NO_CONFIRMADA') }
export async function loadFiscalCreditRequest(admin: FiscalAuthClient, token: string, scope: FiscalCreditDraftScope): Promise<Readonly<FiscalCreditRequestRecord> | null> {
  try {
    const captured = { ...scope }; validScope(captured)
    const id = await actor(admin, token, captured.saleId, captured.operationId)
    const response = await admin.rpc('cargar_representacion_fiscal_homologacion', { p_actor_auth_id: id, p_venta_id: captured.saleId, p_operacion_id: captured.operationId })
    if (response.error) return fail()
    const source = await validateFiscalRepresentation(response.data, captured.saleId, captured.operationId)
    const result = await admin.rpc('cargar_fuente_cuerpo_nc_homologacion', { p_actor_auth_id: id, p_venta_id: captured.saleId, p_operacion_origen_id: captured.operationId, p_id: captured.requestId, p_sha: captured.sha256 })
    if (result.error) return fail()
    if (result.data === null) return null
    const data: unknown = structuredClone(result.data)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fail()
    const preparation = (data as Record<string, unknown>).preparacion
    if (!preparation || typeof preparation !== 'object' || Array.isArray(preparation)) return fail()
    const proposal = await validateFiscalCreditDraftProposal(source, (preparation as Record<string, unknown>).propuesta)
    if (proposal.datos.solicitud_id !== captured.requestId || proposal.sha256 !== captured.sha256) return fail()
    return await validateFiscalCreditRequestRecord(data, source, proposal)
  } catch { return fail() }
}
/** Recuperación histórica sin consultar catálogo actual, escribir o adquirir permiso. */
export async function loadFiscalCreditPreparation(admin: FiscalAuthClient, token: string, scope: FiscalCreditDraftScope): Promise<Readonly<FiscalCreditPreparationRecord> | null> {
  try {
    const captured = { ...scope }; validScope(captured)
    const id = await actor(admin, token, captured.saleId, captured.operationId)
    const response = await admin.rpc('cargar_representacion_fiscal_homologacion', { p_actor_auth_id: id, p_venta_id: captured.saleId, p_operacion_id: captured.operationId })
    if (response.error) return fail()
    const source = await validateFiscalRepresentation(response.data, captured.saleId, captured.operationId)
    return await readPreparation(admin, id, captured, source)
  } catch { return fail() }
}
async function readPreparation(admin: FiscalAuthClient, id: string, captured: FiscalCreditDraftScope, source: Readonly<FiscalRepresentation>): Promise<Readonly<FiscalCreditPreparationRecord> | null> {
    const stored = await admin.rpc('cargar_preparacion_nc_homologacion', { p_actor_auth_id: id, p_venta_id: captured.saleId, p_operacion_origen_id: captured.operationId, p_id: captured.requestId, p_sha: captured.sha256 })
    if (stored.error) return fail()
    if (stored.data === null) return null
    const data: unknown = structuredClone(stored.data)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fail()
    const proposal = await validateFiscalCreditDraftProposal(source, (data as Record<string, unknown>).propuesta)
    if (proposal.datos.solicitud_id !== captured.requestId || proposal.sha256 !== captured.sha256) return fail()
    return await validateFiscalCreditPreparationRecord(data, source, proposal)
}
/** Una escritura como máximo; sólo la lectura durable confirma el resultado. */
export async function saveFiscalCreditPreparation(admin: FiscalAuthClient, token: string, scope: FiscalCreditDraftScope, contextSha: string, input: unknown): Promise<Readonly<FiscalCreditPreparationRecord>> {
  try {
    const captured = { ...scope }, entry: unknown = structuredClone(input); validScope(captured)
    if (!fiscalSha(contextSha)) return fail()
    const id = await actor(admin, token, captured.saleId, captured.operationId)
    const response = await admin.rpc('cargar_representacion_fiscal_homologacion', { p_actor_auth_id: id, p_venta_id: captured.saleId, p_operacion_id: captured.operationId })
    if (response.error) return fail()
    const source = await validateFiscalRepresentation(response.data, captured.saleId, captured.operationId)
    const matches = (record: Readonly<FiscalCreditPreparationRecord>): boolean => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
      const value = entry as Record<string, unknown>, data = record.preparacion.datos.datos
      return Object.keys(value).length === 3 && ['servicioDesde', 'servicioHasta', 'vencimientoPago'].every(key => Object.hasOwn(value, key))
        && value.servicioDesde === data.servicioDesde && value.servicioHasta === data.servicioHasta && value.vencimientoPago === data.vencimientoPago
        && record.preparacion.datos.contexto_sha256 === contextSha
    }
    const previous = await readPreparation(admin, id, captured, source)
    if (previous) { if (!matches(previous)) return fail(); return previous }
    const result = await admin.rpc('cargar_fuente_contexto_nc_homologacion', { p_actor_auth_id: id, p_venta_id: captured.saleId, p_operacion_origen_id: captured.operationId, p_id: captured.requestId, p_sha: captured.sha256 })
    const raw: unknown = structuredClone(result.data)
    if (result.error || !raw || typeof raw !== 'object' || Array.isArray(raw)) return fail()
    const value = raw as Record<string, unknown>
    if (Object.keys(value).length !== 2 || !Object.hasOwn(value, 'contexto') || !Object.hasOwn(value, 'propuesta')) return fail()
    const proposal = await validateFiscalCreditDraftProposal(source, value.propuesta)
    if (proposal.datos.solicitud_id !== captured.requestId || proposal.sha256 !== captured.sha256) return fail()
    const context = await validateFiscalCreditContext(value.contexto, source, proposal)
    const prepared = await prepareFiscalCreditPreparation(source, proposal, context, entry)
    if (prepared.datos.contexto_sha256 !== contextSha) return fail()
    try {
      await admin.rpc('guardar_preparacion_nc_homologacion', { p_actor_auth_id: id, p_venta_id: captured.saleId, p_operacion_origen_id: captured.operationId,
        p_id: captured.requestId, p_sha: captured.sha256, p_contexto_sha: contextSha, p_entrada: entry })
    } catch { /* ACK incierto: recuperar misma identidad, sin repetir la escritura. */ }
    const stored = await readPreparation(admin, id, captured, source)
    if (!stored || !matches(stored) || stored.preparacion.sha256 !== prepared.sha256) return fail()
    return stored
  } catch { return fail() }
}
/** Consulta por identidad mínima; el canónico se obtiene del caso durable privado. */
export async function loadFiscalCreditContext(admin: FiscalAuthClient, token: string, scope: FiscalCreditDraftScope): Promise<Readonly<FiscalCreditContext>> {
  try {
    const captured = { ...scope }; validScope(captured)
    const id = await actor(admin, token, captured.saleId, captured.operationId)
    const response = await admin.rpc('cargar_representacion_fiscal_homologacion', { p_actor_auth_id: id, p_venta_id: captured.saleId, p_operacion_id: captured.operationId })
    if (response.error) return fail()
    const source = await validateFiscalRepresentation(response.data, captured.saleId, captured.operationId)
    const context = await admin.rpc('cargar_fuente_contexto_nc_homologacion', { p_actor_auth_id: id, p_venta_id: captured.saleId, p_operacion_origen_id: captured.operationId, p_id: captured.requestId, p_sha: captured.sha256 })
    const data: unknown = structuredClone(context.data)
    if (context.error || !data || typeof data !== 'object' || Array.isArray(data)) return fail()
    const value = data as Record<string, unknown>
    if (Object.keys(value).length !== 2 || !Object.hasOwn(value, 'contexto') || !Object.hasOwn(value, 'propuesta')) return fail()
    const proposal = await validateFiscalCreditDraftProposal(source, value.propuesta)
    if (proposal.datos.solicitud_id !== captured.requestId || proposal.sha256 !== captured.sha256) return fail()
    return await validateFiscalCreditContext(value.contexto, source, proposal)
  } catch { return fail() }
}
async function actor(admin: FiscalAuthClient, token: string, sale: string, operation: string): Promise<string> {
  if (!fiscalUuid(sale) || !fiscalUuid(operation) || typeof token !== 'string' || token.length > 16384 || !/^\S+$/.test(token)) return fail()
  const auth = await admin.auth.getUser(token), id = auth.data.user?.id
  if (auth.error || !fiscalUuid(id)) return fail()
  return id
}
function businessDate(now: number): string {
  if (!Number.isFinite(now)) return fail()
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now))
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value ?? '').join('')
}
function validScope(scope: FiscalCreditDraftScope): void {
  if (!fiscalUuid(scope.saleId) || !fiscalUuid(scope.operationId) || !fiscalUuid(scope.requestId) || !fiscalSha(scope.sha256)) return fail()
}
async function read(admin: FiscalAuthClient, id: string, scope: FiscalCreditDraftScope): Promise<Readonly<FiscalCreditDraftAck> | null> {
  const result = await admin.rpc('cargar_borrador_nc_homologacion', { p_actor_auth_id: id, p_venta_id: scope.saleId, p_operacion_origen_id: scope.operationId, p_id: scope.requestId })
  if (result.error) return fail()
  return result.data === null ? null : validateFiscalCreditDraftAck(result.data, scope)
}
export async function loadFiscalCreditDraft(admin: FiscalAuthClient, token: string, scope: FiscalCreditDraftScope): Promise<Readonly<FiscalCreditDraftAck> | null> {
  try { const captured = { ...scope }; validScope(captured); return await read(admin, await actor(admin, token, captured.saleId, captured.operationId), captured) }
  catch { return fail() }
}
/** Reserva un borrador; siempre recupera ACK durable, nunca repite automáticamente la escritura. */
export async function saveFiscalCreditDraft(admin: FiscalAuthClient, token: string, sale: string, operation: string, input: unknown, now = Date.now()): Promise<Readonly<FiscalCreditDraftAck>> {
  try {
    const captured = structuredClone(input), id = await actor(admin, token, sale, operation)
    const source = await admin.rpc('cargar_representacion_fiscal_homologacion', { p_actor_auth_id: id, p_venta_id: sale, p_operacion_id: operation })
    if (source.error) return fail()
    const original = await validateFiscalRepresentation(source.data, sale, operation)
    const proposal = await prepareFiscalCreditDraft(original, captured, businessDate(now))
    const scope = { saleId: sale, operationId: operation, requestId: proposal.datos.solicitud_id, sha256: proposal.sha256 }
    try { await admin.rpc('guardar_borrador_nc_homologacion', { p_actor_auth_id: id, p_venta_id: sale, p_operacion_origen_id: operation, p_canonico: proposal.canonico, p_sha: proposal.sha256 }) }
    catch { /* Puede haber confirmado antes de perderse el ACK; consultar misma identidad. */ }
    const stored = await read(admin, id, scope)
    if (!stored) return fail()
    return stored
  } catch { return fail() }
}
export async function cancelFiscalCreditDraft(admin: FiscalAuthClient, token: string, scope: FiscalCreditDraftScope): Promise<Readonly<FiscalCreditDraftAck>> {
  try {
    const captured = { ...scope }; validScope(captured)
    const id = await actor(admin, token, captured.saleId, captured.operationId)
    try { await admin.rpc('cancelar_borrador_nc_homologacion', { p_actor_auth_id: id, p_venta_id: captured.saleId, p_operacion_origen_id: captured.operationId, p_id: captured.requestId, p_sha: captured.sha256 }) }
    catch { /* Recuperar cancelación durable sin repetirla ni crear otro caso. */ }
    const stored = await read(admin, id, captured)
    if (!stored || stored.estado !== 'CANCELADA') return fail()
    return stored
  } catch { return fail() }
}
export async function loadFiscalCreditHistory(admin: FiscalAuthClient, token: string, sale: string, operation: string, after: number): Promise<Readonly<FiscalCreditHistory>> {
  try {
    if (!Number.isSafeInteger(after) || after < 0 || after > 2147483647) return fail()
    const id = await actor(admin, token, sale, operation)
    const source = await admin.rpc('cargar_representacion_fiscal_homologacion', { p_actor_auth_id: id, p_venta_id: sale, p_operacion_id: operation })
    if (source.error) return fail()
    const original = await validateFiscalRepresentation(source.data, sale, operation)
    const page = await admin.rpc('cargar_historial_nc_homologacion', { p_actor_auth_id: id, p_venta_id: sale, p_operacion_origen_id: operation, p_despues: after })
    if (page.error) return fail()
    return await validateFiscalCreditHistory(page.data, original, after)
  } catch { return fail() }
}
export async function loadFiscalCreditCommercialSource(admin: FiscalAuthClient, token: string, sale: string, operation: string): Promise<Readonly<FiscalCreditCommercialSource>> {
  try {
    const id = await actor(admin, token, sale, operation)
    const source = await admin.rpc('cargar_representacion_fiscal_homologacion', { p_actor_auth_id: id, p_venta_id: sale, p_operacion_id: operation })
    if (source.error) return fail()
    const original = await validateFiscalRepresentation(source.data, sale, operation)
    const commercial = await admin.rpc('cargar_fuente_comercial_nc_homologacion', { p_actor_auth_id: id, p_venta_id: sale, p_operacion_origen_id: operation })
    if (commercial.error) return fail()
    return await validateFiscalCreditCommercialSource(commercial.data, original)
  } catch { return fail() }
}
export async function loadFiscalCreditUnits(admin: FiscalAuthClient, token: string, sale: string, operation: string): Promise<Readonly<FiscalCreditUnits>> {
  try {
    const id = await actor(admin, token, sale, operation)
    const source = await admin.rpc('cargar_representacion_fiscal_homologacion', { p_actor_auth_id: id, p_venta_id: sale, p_operacion_id: operation })
    if (source.error) return fail()
    const original = await validateFiscalRepresentation(source.data, sale, operation)
    const commercial = await admin.rpc('cargar_fuente_comercial_nc_homologacion', { p_actor_auth_id: id, p_venta_id: sale, p_operacion_origen_id: operation })
    if (commercial.error) return fail()
    const verified = await validateFiscalCreditCommercialSource(commercial.data, original)
    const units = await admin.rpc('cargar_unidades_nc_homologacion', { p_actor_auth_id: id, p_venta_id: sale, p_operacion_origen_id: operation })
    if (units.error) return fail()
    return await validateFiscalCreditUnits(units.data, original, verified)
  } catch { return fail() }
}
