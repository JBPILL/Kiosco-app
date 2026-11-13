import { fiscalSha } from './fiscalReplacement.ts'
import { parseFiscalJson } from './fiscalStrictJson.ts'
import { validateFiscalCreditCommercialSource } from './fiscalCreditCommercialSource.ts'
import type { FiscalCreditCommercialSource } from './fiscalCreditCommercialSource.ts'
import type { FiscalRepresentation } from './fiscalRepresentation.ts'

interface UnitMetadata { producto_id: string; es_pesable: boolean; unidad_medida: 'UN' | 'KG' | 'GR' | 'LT' }
export interface FiscalCreditUnitLine extends UnitMetadata {
  detalle_id: string; tipo: 'PRODUCTO' | 'COMBO' | 'LIBRE'; componentes: readonly Readonly<UnitMetadata>[]
}
export interface FiscalCreditUnitFacts { version: 1; venta_id: string; checkout_sha256: string; lineas: readonly Readonly<FiscalCreditUnitLine>[] }
interface Base {
  version: 1; venta_id: string; operacion_origen_id: string; solicitud_sha256: string; checkout_sha256: string
  emision_habilitada: false; reintegro_habilitado: false; reposicion_habilitada: false
}
export type FiscalCreditUnits = Base & (
  { estado: 'NO_REGISTRADAS'; unidades: null }
  | { estado: 'CAPTURADAS'; unidades: Readonly<{ canonico: string; sha256: string; datos: Readonly<FiscalCreditUnitFacts> }> }
)
const fail = (): never => { throw new Error('FISCAL_UNIDADES_NC_NO_CONFIRMADAS') }
function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail()
  const v = input as Record<string, unknown>
  if (Object.keys(v).length !== keys.length || keys.some(key => !Object.hasOwn(v, key))) return fail()
  return v
}
function unit(v: Record<string, unknown>, product: string): Readonly<UnitMetadata> {
  if (v.producto_id !== product || typeof v.es_pesable !== 'boolean'
    || v.unidad_medida !== 'UN' && v.unidad_medida !== 'KG' && v.unidad_medida !== 'GR' && v.unidad_medida !== 'LT') return fail()
  return Object.freeze({ producto_id: product, es_pesable: v.es_pesable, unidad_medida: v.unidad_medida })
}
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    const v = item as Record<string, unknown>
    return Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]]))
  })
}
/** Acredita metadata capturada, no saldo ni permiso de devolver o emitir. */
export async function validateFiscalCreditUnits(input: unknown, original: Readonly<FiscalRepresentation>, commercial: Readonly<FiscalCreditCommercialSource>): Promise<Readonly<FiscalCreditUnits>> {
  try {
    const captured = structuredClone(original), source = structuredClone(commercial)
    const v = object(structuredClone(input), ['version', 'venta_id', 'operacion_origen_id', 'solicitud_sha256', 'checkout_sha256', 'estado', 'unidades', 'emision_habilitada', 'reintegro_habilitado', 'reposicion_habilitada'])
    const verified = await validateFiscalCreditCommercialSource(source, captured)
    if (v.version !== 1 || v.venta_id !== verified.venta_id || v.operacion_origen_id !== verified.operacion_origen_id
      || v.solicitud_sha256 !== verified.solicitud_sha256 || v.checkout_sha256 !== verified.checkout_sha256
      || v.emision_habilitada !== false || v.reintegro_habilitado !== false || v.reposicion_habilitada !== false) return fail()
    const base: Base = { version: 1, venta_id: verified.venta_id, operacion_origen_id: verified.operacion_origen_id, solicitud_sha256: verified.solicitud_sha256,
      checkout_sha256: verified.checkout_sha256, emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false }
    if (v.estado === 'NO_REGISTRADAS') { if (v.unidades !== null) return fail(); return Object.freeze({ ...base, estado: 'NO_REGISTRADAS', unidades: null }) }
    if (v.estado !== 'CAPTURADAS') return fail()
    const proposal = object(v.unidades, ['canonico', 'sha256'])
    if (typeof proposal.canonico !== 'string' || new TextEncoder().encode(proposal.canonico).length > 2097152 || !fiscalSha(proposal.sha256)) return fail()
    const root = object(parseFiscalJson(proposal.canonico), ['version', 'venta_id', 'checkout_sha256', 'lineas'])
    if (root.version !== 1 || root.venta_id !== verified.venta_id || root.checkout_sha256 !== verified.checkout_sha256
      || !Array.isArray(root.lineas) || root.lineas.length !== verified.lineas.length) return fail()
    const lineas: Readonly<FiscalCreditUnitLine>[] = []
    for (let index = 0; index < verified.lineas.length; index++) {
      const historical = verified.lineas[index]
      const line = object(root.lineas[index], ['detalle_id', 'producto_id', 'tipo', 'es_pesable', 'unidad_medida', 'componentes'])
      const metadata = unit(line, historical.producto_id), quantity = BigInt(historical.cantidad.replace('.', ''))
      if (line.detalle_id !== historical.detalle_id || line.tipo !== historical.tipo || !Array.isArray(line.componentes)
        || line.componentes.length !== historical.componentes.length || !metadata.es_pesable && quantity % 1000n !== 0n) return fail()
      const componentes: Readonly<UnitMetadata>[] = []
      for (let n = 0; n < historical.componentes.length; n++) {
        const physical = historical.componentes[n], current = unit(object(line.componentes[n], ['producto_id', 'es_pesable', 'unidad_medida']), physical.producto_id)
        const scaled = quantity * BigInt(physical.cantidad.replace('.', ''))
        if (scaled % (current.es_pesable ? 1000n : 1000000n) !== 0n) return fail()
        componentes.push(current)
      }
      if (historical.tipo === 'LIBRE' && (metadata.es_pesable || metadata.unidad_medida !== 'UN')
        || historical.tipo === 'PRODUCTO' && (componentes[0].es_pesable !== metadata.es_pesable || componentes[0].unidad_medida !== metadata.unidad_medida)) return fail()
      lineas.push(Object.freeze({ ...metadata, detalle_id: historical.detalle_id, tipo: historical.tipo, componentes: Object.freeze(componentes) }))
    }
    const datos: Readonly<FiscalCreditUnitFacts> = Object.freeze({ version: 1, venta_id: verified.venta_id, checkout_sha256: verified.checkout_sha256, lineas: Object.freeze(lineas) })
    if (canonical(datos) !== proposal.canonico) return fail()
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(proposal.canonico)))
    if ([...digest].map(byte => byte.toString(16).padStart(2, '0')).join('') !== proposal.sha256) return fail()
    return Object.freeze({ ...base, estado: 'CAPTURADAS', unidades: Object.freeze({ canonico: proposal.canonico, sha256: proposal.sha256, datos }) })
  } catch { return fail() }
}
export function fiscalCreditUnitsWire(value: Readonly<FiscalCreditUnits>): Record<string, unknown> {
  return value.estado === 'NO_REGISTRADAS' ? { ...value } : { ...value, unidades: { canonico: value.unidades.canonico, sha256: value.unidades.sha256 } }
}
