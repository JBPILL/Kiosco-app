import { fiscalRepresentationWire, validateFiscalRepresentation } from './fiscalRepresentation.ts'
import type { FiscalRepresentation } from './fiscalRepresentation.ts'
import { fiscalUuid } from './fiscalReplacement.ts'
import { parseFiscalJson } from './fiscalStrictJson.ts'

interface CreditLine { detalle_id: string; cantidad: string; importe: string; reingresa_stock: boolean }
interface CreditVat { id: number; base: string; importe: string }
interface CreditTax extends CreditVat { descripcion: string; alicuota: string }
interface CreditAmounts { total: string; neto: string; iva: string; noGravado: string; exento: string; tributos: string }
export interface FiscalCreditDraftInput {
  version: 1; solicitud_id: string; fecha: string; motivo: string; condicion_iva_receptor: number
  lineas: readonly CreditLine[]; importes: CreditAmounts; iva: readonly CreditVat[]; tributos: readonly CreditTax[]
}
export interface FiscalCreditDraft {
  version: 1; estado: 'PROPUESTA_NO_PERSISTIDA'; emision_habilitada: false; canonico: string; sha256: string
  datos: Readonly<FiscalCreditDraftInput & {
    clase: 'DEVOLUCION'; entorno: 'HOMOLOGACION'; tipo_nota_credito: 3 | 8 | 13
    origen: Readonly<{ venta_id: string; operacion_id: string; solicitud_sha256: string; presentacion_sha256: string; cae: string;
      cuit: string; tipo: number; punto_venta: number; numero: number; fecha: string; tipo_documento_receptor: number; numero_documento_receptor: string }>
  }>
}
const fail = (): never => { throw new Error('FISCAL_PROPUESTA_NC_INVALIDA') }
function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail()
  const value = input as Record<string, unknown>
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return fail()
  return value
}
function decimal(input: unknown, precision = 2): string {
  if (typeof input !== 'string' || !new RegExp(`^(0|[1-9]\\d{0,9})\\.\\d{${precision}}$`).test(input)) return fail()
  return input
}
const units = (input: string): bigint => BigInt(input.replace('.', ''))
function date(input: unknown): string {
  if (typeof input !== 'string' || !/^\d{8}$/.test(input)) return fail()
  const y = Number(input.slice(0, 4)), m = Number(input.slice(4, 6)), d = Number(input.slice(6, 8))
  const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1]) return fail()
  return input
}
function text(input: unknown, max: number): string {
  if (typeof input !== 'string' || !input.trim() || [...input].length > max || [...input].some(c => {
    const n = c.codePointAt(0)!; return n < 32 || n >= 127 && n <= 159 || n >= 0xd800 && n <= 0xdfff
  })) return fail()
  return input
}
function id(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 1 || input > 2147483647) return fail()
  return input
}
function canonical(input: unknown): string {
  if (Array.isArray(input)) return '[' + input.map(canonical).join(',') + ']'
  if (input && typeof input === 'object') return '{' + Object.entries(input).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => JSON.stringify(key) + ':' + canonical(value)).join(',') + '}'
  return JSON.stringify(input)
}
function freeze<T>(input: T): T {
  if (input && typeof input === 'object') { Object.values(input).forEach(freeze); Object.freeze(input) }
  return input
}
const amountKeys = ['total', 'neto', 'iva', 'noGravado', 'exento', 'tributos'] as const
const sum = <T>(items: readonly T[], select: (item: T) => string): bigint => items.reduce((n, item) => n + units(select(item)), 0n)
const taxKey = (line: CreditTax): string => JSON.stringify([line.id, line.descripcion, line.alicuota])

/** Propuesta local: no acredita permisos/saldos vigentes, no reserva ni habilita devolución/emisión. */
export async function prepareFiscalCreditDraft(original: Readonly<FiscalRepresentation>, input: unknown, businessDate: string): Promise<Readonly<FiscalCreditDraft>> {
  try {
    const captured = structuredClone(original), proposal = structuredClone(input), today = date(businessDate)
    object(captured, ['version', 'entorno', 'estado', 'venta_id', 'operacion_id', 'condicion_emisor', 'condicion_receptor', 'constancia', 'hechos', 'contexto'])
    const source = await validateFiscalRepresentation(fiscalRepresentationWire(captured), captured.venta_id, captured.operacion_id)
    const body = source.constancia.solicitud.solicitud
    const value = object(proposal, ['version', 'solicitud_id', 'fecha', 'motivo', 'condicion_iva_receptor', 'lineas', 'importes', 'iva', 'tributos'])
    if (value.version !== 1 || !fiscalUuid(value.solicitud_id) || !Array.isArray(value.lineas) || !value.lineas.length || value.lineas.length > 200
      || !Array.isArray(value.iva) || value.iva.length > 100 || !Array.isArray(value.tributos) || value.tributos.length > 100) return fail()
    const fecha = date(value.fecha), motivo = text(value.motivo, 120), condition = id(value.condicion_iva_receptor)
    // Política del piloto: no antedatar la NC respecto de su factura ni proponer fecha futura.
    if (fecha < body.fecha || fecha > today) return fail()
    const originals = new Map(source.contexto.lineas.map(line => [line.detalle_id, line]))
    const lineas = value.lineas.map(input => {
      const line = object(input, ['detalle_id', 'cantidad', 'importe', 'reingresa_stock'])
      if (!fiscalUuid(line.detalle_id) || typeof line.reingresa_stock !== 'boolean') return fail()
      const detalle_id = line.detalle_id.toLowerCase(), original = originals.get(detalle_id)
      const cantidad = decimal(line.cantidad, 3), importe = decimal(line.importe)
      if (!original || units(cantidad) <= 0n || units(cantidad) > units(original.cantidad) || units(importe) > units(original.subtotal)) return fail()
      return { detalle_id, cantidad, importe, reingresa_stock: line.reingresa_stock }
    }).sort((a, b) => a.detalle_id < b.detalle_id ? -1 : a.detalle_id > b.detalle_id ? 1 : 0)
    if (new Set(lineas.map(line => line.detalle_id)).size !== lineas.length) return fail()
    const raw = object(value.importes, amountKeys)
    const importes: CreditAmounts = { total: decimal(raw.total), neto: decimal(raw.neto), iva: decimal(raw.iva), noGravado: decimal(raw.noGravado), exento: decimal(raw.exento), tributos: decimal(raw.tributos) }
    if (units(importes.total) <= 0n || sum(lineas, line => line.importe) !== units(importes.total)
      || amountKeys.slice(1).reduce((n, key) => n + units(importes[key]), 0n) !== units(importes.total)
      || amountKeys.some(key => units(importes[key]) > units(body.importes[key]))) return fail()
    const iva = value.iva.map(input => { const line = object(input, ['id', 'base', 'importe']); return { id: id(line.id), base: decimal(line.base), importe: decimal(line.importe) } }).sort((a, b) => a.id - b.id)
    if (new Set(iva.map(line => line.id)).size !== iva.length || sum(iva, line => line.importe) !== units(importes.iva)
      || (body.tipoComprobante === 11 ? iva.length !== 0 || units(importes.iva) !== 0n : sum(iva, line => line.base) !== units(importes.neto))
      || iva.some(line => { const old = body.iva.find(item => item.id === line.id); return !old || units(line.base) > units(old.base) || units(line.importe) > units(old.importe) })) return fail()
    const tributos = value.tributos.map(input => {
      const line = object(input, ['id', 'descripcion', 'base', 'alicuota', 'importe'])
      const alicuota = decimal(line.alicuota, 4)
      // WSFEv1 4.7: descripción 80 caracteres y alícuota 3+2; conservar escala canónica sin redondear.
      if (!/^(0|[1-9]\d{0,2})\.\d{2}00$/.test(alicuota)) return fail()
      return { id: id(line.id), descripcion: text(line.descripcion, 80), base: decimal(line.base), alicuota, importe: decimal(line.importe) }
    }).sort((a, b) => taxKey(a) < taxKey(b) ? -1 : taxKey(a) > taxKey(b) ? 1 : 0)
    if (new Set(tributos.map(taxKey)).size !== tributos.length || sum(tributos, line => line.importe) !== units(importes.tributos)
      || tributos.some(line => {
        const old = body.tributos.filter(item => taxKey(item) === taxKey(line))
        return !old.length || units(line.base) > sum(old, item => item.base) || units(line.importe) > sum(old, item => item.importe)
      })) return fail()
    const tipo_nota_credito = ({ 1: 3, 6: 8, 11: 13 } as const)[body.tipoComprobante as 1 | 6 | 11]
    const datos: FiscalCreditDraft['datos'] = { version: 1, solicitud_id: value.solicitud_id.toLowerCase(), fecha, motivo, condicion_iva_receptor: condition,
      lineas, importes, iva, tributos, clase: 'DEVOLUCION', entorno: 'HOMOLOGACION', tipo_nota_credito,
      origen: { venta_id: source.venta_id, operacion_id: source.operacion_id, solicitud_sha256: source.constancia.solicitud.sha256,
        presentacion_sha256: source.hechos.presentacion_sha256, cae: source.constancia.autorizacion.cae,
        cuit: body.cuitEmisor, tipo: body.tipoComprobante, punto_venta: body.puntoVenta, numero: body.numero, fecha: body.fecha,
        tipo_documento_receptor: body.tipoDocumento, numero_documento_receptor: body.numeroDocumento } }
    const canonico = canonical(datos), bytes = new TextEncoder().encode(canonico)
    if (bytes.length > 60000) return fail()
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), sha256 = [...hash].map(n => n.toString(16).padStart(2, '0')).join('')
    return freeze({ version: 1, estado: 'PROPUESTA_NO_PERSISTIDA', emision_habilitada: false, canonico, sha256, datos })
  } catch { return fail() }
}

/** Reconstruye un borrador histórico exacto; no valida fecha/saldo actual para emitirlo. */
export async function validateFiscalCreditDraftProposal(original: Readonly<FiscalRepresentation>, input: unknown): Promise<Readonly<FiscalCreditDraft>> {
  try {
    const value = object(structuredClone(input), ['canonico', 'sha256'])
    if (typeof value.canonico !== 'string' || new TextEncoder().encode(value.canonico).length > 60000
      || typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256)) return fail()
    const data = object(parseFiscalJson(value.canonico), ['version', 'solicitud_id', 'fecha', 'motivo', 'condicion_iva_receptor', 'lineas', 'importes', 'iva', 'tributos', 'clase', 'entorno', 'tipo_nota_credito', 'origen'])
    const { clase: _kind, entorno: _environment, tipo_nota_credito: _type, origen: _original, ...entrada } = data
    if (typeof entrada.fecha !== 'string') return fail()
    const proposal = await prepareFiscalCreditDraft(original, entrada, entrada.fecha)
    if (proposal.canonico !== value.canonico || proposal.sha256 !== value.sha256) return fail()
    return proposal
  } catch { return fail() }
}
