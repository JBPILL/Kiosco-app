import { parsearSolicitudDevolucionParcial, type SolicitudDevolucionParcial } from '../../supabase/functions/_shared/partialReturnRequest'
import { DurablePilotOperationOutbox, procesarOperacionPiloto, validarUuid, type OperacionPilotoLocal, type EnviarOperacionPiloto } from './durablePilotOperationOutbox'

export type SolicitudDevolucionEfectivo = Omit<SolicitudDevolucionParcial, 'metodo' | 'sesionReintegroId'> & { metodo: 'EFECTIVO_CAJA'; sesionReintegroId: string }
export interface ResultadoDevolucionEfectivo {
  id: string
  venta_id: string
  kiosco_id: string
  sesion_caja_id: string
  monto_total: number
  detalles: { detalle_id: string; cantidad: number; importe: number }[]
  stock: { producto_id: string; stock_actual: number }[]
}
function parsear(valor: unknown): SolicitudDevolucionEfectivo {
  const s = parsearSolicitudDevolucionParcial(valor)
  if (s.metodo !== 'EFECTIVO_CAJA' || !s.sesionReintegroId) throw new Error('El piloto requiere reintegro en efectivo y nueva venta para cambios')
  return { ...s, metodo: 'EFECTIVO_CAJA', sesionReintegroId: s.sesionReintegroId }
}
function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Confirmación de devolución inválida')
  return valor as Record<string, unknown>
}
function numero(valor: unknown): number {
  const n = typeof valor === 'string' && /^\d+(\.\d{1,3})?$/.test(valor) ? Number(valor) : valor
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw new Error('Importe o cantidad de devolución inválido')
  return n
}
function moneda(valor: unknown): number {
  const n = numero(valor)
  if (n > 9999999999.99 || Number(n.toFixed(2)) !== n) throw new Error('Importe de devolución inválido')
  return n
}
function validarResultado(valor: unknown, op: OperacionPilotoLocal<SolicitudDevolucionEfectivo, ResultadoDevolucionEfectivo>): ResultadoDevolucionEfectivo {
  const r = objeto(valor)
  if (r.id !== op.id || r.kiosco_id !== op.kioscoId || r.venta_id !== op.solicitud.ventaId || r.sesion_caja_id !== op.solicitud.sesionReintegroId
    || !Array.isArray(r.detalles) || !Array.isArray(r.stock) || r.detalles.length !== op.solicitud.items.length) throw new Error('Confirmación de devolución incompatible')
  const vistos = new Set<string>()
  const detalles = r.detalles.map(valorDetalle => {
    const d = objeto(valorDetalle), detalle_id = validarUuid(d.detalle_id), cantidad = numero(d.cantidad)
    const original = op.solicitud.items.find(item => item.detalleId === detalle_id)
    if (!original || vistos.has(detalle_id) || original.cantidad !== cantidad) throw new Error('Detalle confirmado incompatible')
    vistos.add(detalle_id)
    return { detalle_id, cantidad, importe: moneda(d.importe) }
  })
  const monto_total = moneda(r.monto_total)
  if (monto_total <= 0 || detalles.reduce((suma, d) => suma + Math.round(d.importe * 100), 0) !== Math.round(monto_total * 100)) throw new Error('Total confirmado incompatible')
  const productos = new Set<string>()
  const stock = r.stock.map(valorStock => {
    const fila = objeto(valorStock), producto_id = validarUuid(fila.producto_id), stock_actual = numero(fila.stock_actual)
    if (productos.has(producto_id) || stock_actual > 999999999.999 || Number(stock_actual.toFixed(3)) !== stock_actual) throw new Error('Stock confirmado incompatible')
    productos.add(producto_id)
    return { producto_id, stock_actual }
  })
  return { id: op.id, venta_id: op.solicitud.ventaId, kiosco_id: op.kioscoId, sesion_caja_id: op.solicitud.sesionReintegroId, monto_total, detalles, stock }
}
export class CashReturnOutbox extends DurablePilotOperationOutbox<SolicitudDevolucionEfectivo, ResultadoDevolucionEfectivo> {
  constructor(nombre = 'KioskoPOSDevolucionesEfectivo') { super(nombre, parsear, validarResultado, () => true) }
}
export async function procesarDevolucionEfectivo(outbox: CashReturnOutbox, kioscoId: string, usuarioId: string, valor: unknown, enviar: EnviarOperacionPiloto<SolicitudDevolucionEfectivo>): Promise<ResultadoDevolucionEfectivo> {
  return procesarOperacionPiloto(outbox, kioscoId, usuarioId, valor, enviar)
}
