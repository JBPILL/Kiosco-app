import { supabase } from './supabase'
import { leerColeccionPorId } from './backupPagination'
import { validarUuid } from './durablePilotOperationOutbox'

export interface MovimientoEnvaseCompartido {
  id: string
  tipo_id: string
  accion: 'AJUSTAR_SALDO' | 'ENTREGAR_DISTRIBUIDOR' | 'RECIBIR_EFECTIVO' | 'RECIBIR_TICKET' | 'DEVOLVER_CLIENTE' | 'AJUSTAR_PENDIENTES' | 'RECIBIR_PENDIENTES'
  pendientes_delta?: number
  pendientes_resultantes?: number | null
  cantidad: number
  stock_resultante: number
  importe: number
  distribuidor: string | null
  creado_en: string
}
export interface HistorialDevolucionesTicket {
  operaciones: number
  importeReintegrado: number
  cantidadesPorDetalle: Record<string, number>
}
function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Historial incompleto o inválido.')
  return valor as Record<string, unknown>
}
function numero(valor: unknown, decimales: number, maximo: number): number {
  const n = typeof valor === 'string' && /^-?\d+(\.\d+)?$/.test(valor) ? Number(valor) : valor
  if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > maximo || Number(n.toFixed(decimales)) !== n) throw new Error('Importe o cantidad del historial inválido.')
  return n
}
export async function cargarMovimientosEnvases(kioscoId: string, desde: string, hasta: string): Promise<MovimientoEnvaseCompartido[]> {
  const kid = validarUuid(kioscoId)
  if (!Number.isFinite(Date.parse(desde)) || !Number.isFinite(Date.parse(hasta)) || Date.parse(desde) > Date.parse(hasta)) throw new Error('Período de envases inválido.')
  const filas = await leerColeccionPorId<{ id: string }>(async ultimo => {
    let q = supabase.from('envases_movimientos').select('id,tipo_id,accion,cantidad,stock_resultante,importe,distribuidor,creado_en,pendientes_delta,pendientes_resultantes')
      .eq('kiosco_id', kid).gte('creado_en', desde).lte('creado_en', hasta).order('id').limit(500)
    if (ultimo) q = q.gt('id', ultimo)
    return await q
  }, 'movimientos de envases')
  return filas.map(fila => {
    const r = objeto(fila)
    const acciones = ['AJUSTAR_SALDO', 'ENTREGAR_DISTRIBUIDOR', 'RECIBIR_EFECTIVO', 'RECIBIR_TICKET', 'DEVOLVER_CLIENTE', 'AJUSTAR_PENDIENTES', 'RECIBIR_PENDIENTES'] as const
    if (!acciones.some(a => a === r.accion) || typeof r.tipo_id !== 'string' || !r.tipo_id
      || typeof r.creado_en !== 'string' || !Number.isFinite(Date.parse(r.creado_en))
      || !(r.distribuidor === null || typeof r.distribuidor === 'string')) throw new Error('Movimiento de envase inválido.')
    const cantidad = numero(r.cantidad, 0, 999999999), stock_resultante = numero(r.stock_resultante, 0, 999999999), importe = numero(r.importe, 2, 9999999999.99)
    if (stock_resultante < 0 || importe < 0
      || (['ENTREGAR_DISTRIBUIDOR', 'DEVOLVER_CLIENTE'].includes(String(r.accion)) && (cantidad >= 0 || importe !== 0))
      || (r.accion === 'AJUSTAR_SALDO' && importe !== 0)
      || (['RECIBIR_EFECTIVO', 'RECIBIR_TICKET'].includes(String(r.accion)) && (cantidad <= 0 || importe <= 0))) throw new Error('Movimiento de envase inconsistente.')
    const pendientes_delta = r.pendientes_delta === undefined ? 0 : numero(r.pendientes_delta, 0, 999999999)
    const pendientes_resultantes = r.pendientes_resultantes == null ? null : numero(r.pendientes_resultantes, 0, 999999999)
    if (pendientes_resultantes !== null && pendientes_resultantes < 0) throw new Error('Pendientes inválidos.')
    if (['AJUSTAR_PENDIENTES', 'RECIBIR_PENDIENTES'].includes(String(r.accion)) && pendientes_resultantes === null) throw new Error('Historial de pendientes incompleto.')
    return { pendientes_delta, pendientes_resultantes, id: validarUuid(r.id), tipo_id: r.tipo_id, accion: r.accion as MovimientoEnvaseCompartido['accion'], cantidad, stock_resultante, importe, distribuidor: r.distribuidor, creado_en: r.creado_en }
  }).sort((a, b) => Date.parse(b.creado_en) - Date.parse(a.creado_en) || b.id.localeCompare(a.id))
}

export async function cargarHistorialDevolucionesTicket(kioscoId: string, ventaId: string): Promise<HistorialDevolucionesTicket> {
  const kid = validarUuid(kioscoId), venta = validarUuid(ventaId)
  const filas = await leerColeccionPorId<{ id: string }>(async ultimo => {
    let q = supabase.from('devoluciones_venta').select('id,monto_total,detalles:detalles_devolucion(detalle_venta_id,cantidad)')
      .eq('kiosco_id', kid).eq('venta_id', venta).order('id').limit(500)
    if (ultimo) q = q.gt('id', ultimo)
    return await q
  }, 'devoluciones del ticket')
  let centavos = 0
  const milesimas: Record<string, number> = {}
  for (const fila of filas) {
    const r = objeto(fila), importe = numero(r.monto_total, 2, 9999999999.99)
    validarUuid(r.id)
    if (importe <= 0 || !Array.isArray(r.detalles) || !r.detalles.length) throw new Error('Devolución histórica sin detalle verificable.')
    centavos += Math.round(importe * 100)
    const vistos = new Set<string>()
    for (const valor of r.detalles) {
      const d = objeto(valor), id = validarUuid(d.detalle_venta_id), cantidad = numero(d.cantidad, 3, 999999)
      if (cantidad <= 0 || vistos.has(id)) throw new Error('Detalle histórico de devolución inválido.')
      vistos.add(id)
      milesimas[id] = (milesimas[id] ?? 0) + Math.round(cantidad * 1000)
    }
  }
  if (!Number.isSafeInteger(centavos) || Object.values(milesimas).some(n => !Number.isSafeInteger(n))) throw new Error('Historial fuera de rango.')
  return { operaciones: filas.length, importeReintegrado: centavos / 100, cantidadesPorDetalle: Object.fromEntries(Object.entries(milesimas).map(([id, n]) => [id, n / 1000])) }
}
