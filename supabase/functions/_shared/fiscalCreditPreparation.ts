import { fiscalRepresentationWire, validateFiscalRepresentation } from './fiscalRepresentation.ts'
import type { FiscalRepresentation } from './fiscalRepresentation.ts'
import { validateFiscalCreditDraftProposal } from './fiscalCreditDraft.ts'
import type { FiscalCreditDraft } from './fiscalCreditDraft.ts'
import { validateFiscalCreditContext } from './fiscalCreditContext.ts'
import type { FiscalCreditContext } from './fiscalCreditContext.ts'

export interface FiscalCreditPreparationInput { servicioDesde: string | null; servicioHasta: string | null; vencimientoPago: string | null }
export interface FiscalCreditPreparationData {
  version: 1; clase: 'PREPARACION_NC'; entorno: 'HOMOLOGACION'; venta_id: string; operacion_origen_id: string; solicitud_id: string
  propuesta_sha256: string; contexto_sha256: string; fuente_comercial_sha256: string; checkout_sha256: string; unidades_sha256: string
  revision_emisor: number; revision_parametros: number
  datos: Readonly<FiscalCreditPreparationInput & {
    cuitEmisor: string; puntoVenta: number; tipoComprobante: 3 | 8 | 13; concepto: number; tipoDocumento: number; numeroDocumento: string
    condicionIvaReceptor: number; fecha: string; moneda: 'PES'; cotizacion: '1'
    importes: FiscalCreditDraft['datos']['importes']; iva: FiscalCreditDraft['datos']['iva']; tributos: FiscalCreditDraft['datos']['tributos']
    comprobantesAsociados: readonly Readonly<{ tipo: number; puntoVenta: number; numero: number; cuit: string; fecha: string }>[]
  }>
}
export interface FiscalCreditPreparation {
  version: 1; estado: 'PREPARACION_NC_NO_PERSISTIDA'; emision_habilitada: false; canonico: string; sha256: string; datos: Readonly<FiscalCreditPreparationData>
}
export interface FiscalCreditPreparationRecord {
  version: 1; estado: 'DATOS_NC_PREPARADOS' | 'CANCELADA'; preparacion: Readonly<FiscalCreditPreparation>
  emision_habilitada: false; reintegro_habilitado: false; reposicion_habilitada: false
}
const fail = (): never => { throw new Error('FISCAL_PREPARACION_NC_INVALIDA') }
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    const record = item as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, record[key]]))
  })
}

/** Verifica evidencia histórica de035; no acredita vigencia ni autoriza emitir. */
export async function validateFiscalCreditPreparationRecord(input: unknown, source: Readonly<FiscalRepresentation>, draft: Readonly<FiscalCreditDraft>): Promise<Readonly<FiscalCreditPreparationRecord>> {
  try {
    const raw: unknown = structuredClone(input), original = structuredClone(source), proposal = structuredClone(draft)
    const object = (entry: unknown, keys: readonly string[]): Record<string, unknown> => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return fail()
      const value = entry as Record<string, unknown>
      if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return fail()
      return value
    }
    const value = object(raw, ['version', 'entorno', 'venta_id', 'operacion_origen_id', 'solicitud_id', 'propuesta_sha256', 'estado', 'preparacion', 'contexto', 'propuesta', 'emision_habilitada', 'reintegro_habilitado', 'reposicion_habilitada'])
    if (value.version !== 1 || value.entorno !== 'HOMOLOGACION' || value.venta_id !== original.venta_id || value.operacion_origen_id !== original.operacion_id
      || value.solicitud_id !== proposal.datos.solicitud_id || value.propuesta_sha256 !== proposal.sha256
      || value.estado !== 'DATOS_NC_PREPARADOS' && value.estado !== 'CANCELADA'
      || value.emision_habilitada !== false || value.reintegro_habilitado !== false || value.reposicion_habilitada !== false) return fail()
    const storedProposal = object(value.propuesta, ['canonico', 'sha256']), stored = object(value.preparacion, ['canonico', 'sha256'])
    if (storedProposal.canonico !== proposal.canonico || storedProposal.sha256 !== proposal.sha256 || typeof stored.canonico !== 'string'
      || new TextEncoder().encode(stored.canonico).length > 131072 || typeof stored.sha256 !== 'string') return fail()
    const parsed: unknown = JSON.parse(stored.canonico)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail()
    const body: unknown = (parsed as Record<string, unknown>).datos
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail()
    const fields = body as Record<string, unknown>
    const context = await validateFiscalCreditContext(value.contexto, original, proposal)
    const prepared = await prepareFiscalCreditPreparation(original, proposal, context, {
      servicioDesde: fields.servicioDesde, servicioHasta: fields.servicioHasta, vencimientoPago: fields.vencimientoPago,
    })
    if (prepared.canonico !== stored.canonico || prepared.sha256 !== stored.sha256) return fail()
    return freeze({ version: 1, estado: value.estado, preparacion: prepared, emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false })
  } catch { return fail() }
}
async function sha(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
function date(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || !/^\d{8}$/.test(value) || value.startsWith('0000')) return fail()
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  const parsed = new Date(`${iso}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return fail()
  return value
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
/** Datos sin numeración; no son un cuerpo emitible ni reserva/permiso. */
export async function prepareFiscalCreditPreparation(source: Readonly<FiscalRepresentation>, draft: Readonly<FiscalCreditDraft>, context: Readonly<FiscalCreditContext>, input: unknown): Promise<Readonly<FiscalCreditPreparation>> {
  try {
    const captured = structuredClone(source), proposal = { canonico: draft.canonico, sha256: draft.sha256 }, metadata = structuredClone(context), raw: unknown = structuredClone(input)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail()
    const entry = raw as Record<string, unknown>, keys = ['servicioDesde', 'servicioHasta', 'vencimientoPago']
    if (Object.keys(entry).length !== 3 || keys.some(key => !Object.hasOwn(entry, key))) return fail()
    const periods = { servicioDesde: date(entry.servicioDesde), servicioHasta: date(entry.servicioHasta), vencimientoPago: date(entry.vencimientoPago) }
    const original = await validateFiscalRepresentation(fiscalRepresentationWire(captured), captured.venta_id, captured.operacion_id)
    const credit = await validateFiscalCreditDraftProposal(original, proposal), verified = await validateFiscalCreditContext(metadata, original, credit)
    const invoice = original.constancia.solicitud.solicitud
    if (invoice.concepto === 1 ? Object.values(periods).some(value => value !== null)
      : periods.servicioDesde === null || periods.servicioHasta === null || periods.vencimientoPago === null || periods.servicioDesde > periods.servicioHasta) return fail()
    const datos: FiscalCreditPreparationData = { version: 1, clase: 'PREPARACION_NC', entorno: 'HOMOLOGACION', venta_id: original.venta_id,
      operacion_origen_id: original.operacion_id, solicitud_id: credit.datos.solicitud_id, propuesta_sha256: credit.sha256, contexto_sha256: await sha(canonical(verified)),
      fuente_comercial_sha256: verified.fuente_comercial_sha256, checkout_sha256: verified.checkout_sha256, unidades_sha256: verified.unidades_sha256,
      revision_emisor: verified.revision_emisor, revision_parametros: verified.revision_parametros,
      datos: { cuitEmisor: verified.cuit_emisor, puntoVenta: verified.punto_venta, tipoComprobante: verified.tipo_nota_credito, concepto: invoice.concepto,
        tipoDocumento: invoice.tipoDocumento, numeroDocumento: invoice.numeroDocumento, condicionIvaReceptor: credit.datos.condicion_iva_receptor, fecha: credit.datos.fecha,
        ...periods, moneda: invoice.moneda, cotizacion: invoice.cotizacion, importes: structuredClone(credit.datos.importes), iva: structuredClone(credit.datos.iva), tributos: structuredClone(credit.datos.tributos),
        comprobantesAsociados: [{ tipo: invoice.tipoComprobante, puntoVenta: invoice.puntoVenta, numero: invoice.numero, cuit: invoice.cuitEmisor, fecha: invoice.fecha }] } }
    const canonico = canonical(datos)
    if (new TextEncoder().encode(canonico).length > 131072) return fail()
    return freeze({ version: 1, estado: 'PREPARACION_NC_NO_PERSISTIDA', emision_habilitada: false, canonico, sha256: await sha(canonico), datos })
  } catch { return fail() }
}
