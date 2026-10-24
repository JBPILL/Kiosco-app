import type { FiscalRepresentation } from './fiscalRepresentation.ts'
import type { FiscalCreditDraft } from './fiscalCreditDraft.ts'
import { validateFiscalCreditPreparationWire } from './fiscalCreditPreparation.ts'
import type { FiscalCreditPreparationData } from './fiscalCreditPreparation.ts'
import { fiscalSha, fiscalUuid } from './fiscalReplacement.ts'

export interface FiscalCreditReservation {
  version: 1; entorno: 'HOMOLOGACION'; venta_id: string; operacion_origen_id: string; solicitud_id: string
  propuesta_sha256: string; preparacion_sha256: string; reserva_id: string
  cuit_emisor: string; punto_venta: number; tipo_comprobante: 3 | 8 | 13; numero: number
  estado: 'RESERVADA'; emision_habilitada: false
}
export interface FiscalCreditRequestData {
  version: 1; clase: 'NOTA_CREDITO'; entorno: 'HOMOLOGACION'; venta_id: string; operacion_origen_id: string; solicitud_id: string
  propuesta_sha256: string; preparacion_sha256: string; reserva_id: string
  solicitud: Readonly<FiscalCreditPreparationData['datos'] & { version: 1; entorno: 'HOMOLOGACION'; numero: number }>
}
export interface FiscalCreditRequest {
  version: 1; estado: 'CUERPO_NC_NO_PERSISTIDO'; emision_habilitada: false
  canonico: string; sha256: string; datos: Readonly<FiscalCreditRequestData>
}
const fail = (): never => { throw new Error('FISCAL_CUERPO_NC_INVALIDO') }
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    const row = item as Record<string, unknown>
    return Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]]))
  })
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
/** Contrato puro: valida enlace/forma de una reserva, no prueba su existencia ni
 * vigencia en SQL. El futuro adaptador privado debe obtenerla bajo exclusión de
 * serie y revalidar caso/contexto antes de persistir. No es permiso ni XML emitible. */
export async function prepareFiscalCreditRequest(source: Readonly<FiscalRepresentation>, draft: Readonly<FiscalCreditDraft>, preparation: unknown, reservation: unknown): Promise<Readonly<FiscalCreditRequest>> {
  try {
    const original = structuredClone(source), proposal = structuredClone(draft), wire: unknown = structuredClone(preparation), raw: unknown = structuredClone(reservation)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail()
    const value = raw as Record<string, unknown>, keys = ['version', 'entorno', 'venta_id', 'operacion_origen_id', 'solicitud_id', 'propuesta_sha256', 'preparacion_sha256', 'reserva_id', 'cuit_emisor', 'punto_venta', 'tipo_comprobante', 'numero', 'estado', 'emision_habilitada']
    if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)) || value.version !== 1 || value.entorno !== 'HOMOLOGACION'
      || value.estado !== 'RESERVADA' || value.emision_habilitada !== false || !fiscalUuid(value.reserva_id)
      || !fiscalSha(value.preparacion_sha256) || !fiscalSha(value.propuesta_sha256)
      || typeof value.numero !== 'number' || !Number.isSafeInteger(value.numero) || value.numero < 1 || value.numero > 99999999) return fail()
    const stored = await validateFiscalCreditPreparationWire(wire, original, proposal)
    const data = stored.preparacion.datos, body = data.datos
    if (stored.estado !== 'DATOS_NC_PREPARADOS' || value.venta_id !== data.venta_id || value.operacion_origen_id !== data.operacion_origen_id
      || value.solicitud_id !== data.solicitud_id || value.propuesta_sha256 !== data.propuesta_sha256 || value.preparacion_sha256 !== stored.preparacion.sha256
      || value.cuit_emisor !== body.cuitEmisor || value.punto_venta !== body.puntoVenta || value.tipo_comprobante !== body.tipoComprobante) return fail()
    const datos: FiscalCreditRequestData = { version: 1, clase: 'NOTA_CREDITO', entorno: 'HOMOLOGACION', venta_id: data.venta_id,
      operacion_origen_id: data.operacion_origen_id, solicitud_id: data.solicitud_id, propuesta_sha256: data.propuesta_sha256,
      preparacion_sha256: stored.preparacion.sha256, reserva_id: value.reserva_id,
      solicitud: { ...structuredClone(body), version: 1, entorno: 'HOMOLOGACION', numero: value.numero } }
    const canonico = canonical(datos)
    if (new TextEncoder().encode(canonico).length > 131072) return fail()
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonico)))
    const sha256 = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')
    return freeze({ version: 1, estado: 'CUERPO_NC_NO_PERSISTIDO', emision_habilitada: false, canonico, sha256, datos })
  } catch { return fail() }
}
