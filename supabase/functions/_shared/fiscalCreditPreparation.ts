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
const fail = (): never => { throw new Error('FISCAL_PREPARACION_NC_INVALIDA') }
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    const record = item as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, record[key]]))
  })
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
