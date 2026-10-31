import { fiscalUuid, fiscalSha } from './fiscalReplacement.ts'
import { fiscalRepresentationWire, validateFiscalRepresentation } from './fiscalRepresentation.ts'
import type { FiscalRepresentation } from './fiscalRepresentation.ts'

export interface FiscalCreditCommercialLine {
  detalle_id: string; producto_id: string; cantidad: string; subtotal: string
  tipo: 'PRODUCTO' | 'COMBO' | 'LIBRE'; componentes: readonly Readonly<{ producto_id: string; cantidad: string }>[]
  sin_envase: boolean; precio_envase_unitario: string
}
export interface FiscalCreditCommercialSource {
  version: 1; venta_id: string; operacion_origen_id: string; solicitud_sha256: string; checkout_sha256: string
  total: string; pago_integro_efectivo: boolean; unidades_historicas: 'NO_REGISTRADAS'
  lineas: readonly Readonly<FiscalCreditCommercialLine>[]
  pagos: readonly Readonly<{ medio: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'MERCADOPAGO' | 'CUENTA_CORRIENTE'; importe: string }>[]
  emision_habilitada: false; reintegro_habilitado: false; reposicion_habilitada: false
}
const fail = (): never => { throw new Error('FISCAL_FUENTE_COMERCIAL_NC_NO_CONFIRMADA') }
function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail()
  const value = input as Record<string, unknown>
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return fail()
  return value
}
function decimal(input: unknown, scale: 2 | 3, positive = false): string {
  if (typeof input !== 'string' || !(scale === 2 ? /^(0|[1-9]\d{0,9})\.\d{2}$/ : /^(0|[1-9]\d{0,8})\.\d{3}$/).test(input)
    || positive && BigInt(input.replace('.', '')) === 0n) return fail()
  return input
}
/** Hechos históricos: no acredita saldo, catálogo NC, unidades ni permiso de emisión. */
export async function validateFiscalCreditCommercialSource(input: unknown, original: Readonly<FiscalRepresentation>): Promise<Readonly<FiscalCreditCommercialSource>> {
  try {
    const captured = structuredClone(original)
    const v = object(structuredClone(input), ['version', 'venta_id', 'operacion_origen_id', 'solicitud_sha256', 'checkout_sha256', 'total', 'pago_integro_efectivo', 'unidades_historicas', 'lineas', 'pagos', 'emision_habilitada', 'reintegro_habilitado', 'reposicion_habilitada'])
    if (Object.keys(captured).length !== 10) return fail()
    const source = await validateFiscalRepresentation(fiscalRepresentationWire(captured), captured.venta_id, captured.operacion_id)
    if (v.version !== 1 || v.venta_id !== source.venta_id || v.operacion_origen_id !== source.operacion_id
      || v.solicitud_sha256 !== source.constancia.solicitud.sha256 || !fiscalSha(v.checkout_sha256)
      || v.total !== source.constancia.solicitud.solicitud.importes.total || v.unidades_historicas !== 'NO_REGISTRADAS'
      || typeof v.pago_integro_efectivo !== 'boolean' || v.emision_habilitada !== false || v.reintegro_habilitado !== false || v.reposicion_habilitada !== false
      || !Array.isArray(v.lineas) || v.lineas.length !== source.contexto.lineas.length || v.lineas.length < 1 || v.lineas.length > 200
      || !Array.isArray(v.pagos) || v.pagos.length < 1 || v.pagos.length > 20) return fail()
    const totalText = decimal(v.total, 2, true), total = BigInt(totalText.replace('.', ''))
    const lineas: Readonly<FiscalCreditCommercialLine>[] = []
    let last = '', sum = 0n
    for (const raw of v.lineas) {
      const line = object(raw, ['detalle_id', 'producto_id', 'cantidad', 'subtotal', 'tipo', 'componentes', 'sin_envase', 'precio_envase_unitario'])
      if (!fiscalUuid(line.detalle_id) || line.detalle_id !== line.detalle_id.toLowerCase() || line.detalle_id <= last
        || !fiscalUuid(line.producto_id) || line.producto_id !== line.producto_id.toLowerCase()
        || !['PRODUCTO', 'COMBO', 'LIBRE'].some(type => type === line.tipo) || typeof line.sin_envase !== 'boolean'
        || !Array.isArray(line.componentes) || line.componentes.length > 500) return fail()
      const historical = source.contexto.lineas.find(item => item.detalle_id === line.detalle_id)
      const cantidad = decimal(line.cantidad, 3, true), subtotal = decimal(line.subtotal, 2), precio = decimal(line.precio_envase_unitario, 2)
      if (!historical || historical.cantidad !== cantidad || historical.subtotal !== subtotal
        || line.tipo === 'LIBRE' && BigInt(cantidad.replace('.', '')) % 1000n !== 0n) return fail()
      const componentes: Readonly<{ producto_id: string; cantidad: string }>[] = []
      let previous = ''
      for (const raw of line.componentes) {
        const component = object(raw, ['producto_id', 'cantidad'])
        if (!fiscalUuid(component.producto_id) || component.producto_id !== component.producto_id.toLowerCase() || component.producto_id <= previous) return fail()
        const quantity = decimal(component.cantidad, 3, true)
        if (BigInt(quantity.replace('.', '')) > 999999000n) return fail()
        previous = component.producto_id; componentes.push(Object.freeze({ producto_id: component.producto_id, cantidad: quantity }))
      }
      if (line.tipo === 'LIBRE' && componentes.length !== 0 || line.tipo === 'COMBO' && componentes.length === 0
        || line.tipo === 'PRODUCTO' && (componentes.length !== 1 || componentes[0].producto_id !== line.producto_id || componentes[0].cantidad !== '1.000')) return fail()
      if (line.tipo !== 'PRODUCTO' && line.tipo !== 'COMBO' && line.tipo !== 'LIBRE') return fail()
      last = line.detalle_id; sum += BigInt(subtotal.replace('.', ''))
      lineas.push(Object.freeze({ detalle_id: line.detalle_id, producto_id: line.producto_id, cantidad, subtotal, tipo: line.tipo, componentes: Object.freeze(componentes), sin_envase: line.sin_envase, precio_envase_unitario: precio }))
    }
    const pagos: FiscalCreditCommercialSource['pagos'][number][] = []
    let paid = 0n
    for (const raw of v.pagos) {
      const payment = object(raw, ['medio', 'importe']), medio = payment.medio
      if (medio !== 'EFECTIVO' && medio !== 'TARJETA' && medio !== 'TRANSFERENCIA' && medio !== 'MERCADOPAGO' && medio !== 'CUENTA_CORRIENTE') return fail()
      const importe = decimal(payment.importe, 2, true); paid += BigInt(importe.replace('.', ''))
      pagos.push(Object.freeze({ medio, importe }))
    }
    if (sum !== total || paid !== total || v.pago_integro_efectivo !== pagos.every(payment => payment.medio === 'EFECTIVO')) return fail()
    return Object.freeze({ version: 1, venta_id: source.venta_id, operacion_origen_id: source.operacion_id, solicitud_sha256: source.constancia.solicitud.sha256,
      checkout_sha256: v.checkout_sha256, total: totalText, pago_integro_efectivo: v.pago_integro_efectivo, unidades_historicas: 'NO_REGISTRADAS',
      lineas: Object.freeze(lineas), pagos: Object.freeze(pagos), emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false })
  } catch { return fail() }
}
