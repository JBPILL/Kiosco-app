import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import { fiscalSha, fiscalUuid } from './fiscalReplacement.ts'
import { validateFiscalRepresentation } from './fiscalRepresentation.ts'
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
import { validateFiscalCreditPreparationRecord } from './fiscalCreditPreparation.ts'
import type { FiscalCreditPreparationRecord } from './fiscalCreditPreparation.ts'

const fail = (): never => { throw new Error('FISCAL_NC_NO_CONFIRMADA') }
/** Recuperación histórica sin consultar catálogo actual, escribir o adquirir permiso. */
export async function loadFiscalCreditPreparation(admin: FiscalAuthClient, token: string, scope: FiscalCreditDraftScope): Promise<Readonly<FiscalCreditPreparationRecord> | null> {
  try {
    const captured = { ...scope }; validScope(captured)
    const id = await actor(admin, token, captured.saleId, captured.operationId)
    const response = await admin.rpc('cargar_representacion_fiscal_homologacion', { p_actor_auth_id: id, p_venta_id: captured.saleId, p_operacion_id: captured.operationId })
    if (response.error) return fail()
    const source = await validateFiscalRepresentation(response.data, captured.saleId, captured.operationId)
    const stored = await admin.rpc('cargar_preparacion_nc_homologacion', { p_actor_auth_id: id, p_venta_id: captured.saleId, p_operacion_origen_id: captured.operationId, p_id: captured.requestId, p_sha: captured.sha256 })
    if (stored.error) return fail()
    if (stored.data === null) return null
    const data: unknown = structuredClone(stored.data)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fail()
    const proposal = await validateFiscalCreditDraftProposal(source, (data as Record<string, unknown>).propuesta)
    if (proposal.datos.solicitud_id !== captured.requestId || proposal.sha256 !== captured.sha256) return fail()
    return await validateFiscalCreditPreparationRecord(data, source, proposal)
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
