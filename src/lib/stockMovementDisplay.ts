import type { MovimientoStock } from '../types/database'

type MovimientoVisible = Pick<MovimientoStock, 'tipo' | 'cantidad' | 'costo_unitario_referencia'>

/** Ajustes antiguos pueden guardar conteo absoluto; los nuevos guardan diferencia. */
export function presentarMovimientoStock(movimiento: MovimientoVisible): {
  cantidad: string
  estimacion: number | null
} {
  const { tipo, cantidad, costo_unitario_referencia: costo } = movimiento
  const importe = tipo !== 'AJUSTE' && costo != null && Number.isFinite(costo) && costo >= 0 && Number.isFinite(cantidad)
    ? Math.abs(cantidad) * costo
    : null
  return {
    cantidad: tipo === 'AJUSTE'
      ? `Registro: ${cantidad}`
      : tipo === 'INGRESO' ? `+${Math.abs(cantidad)}` : `-${Math.abs(cantidad)}`,
    estimacion: importe !== null && Number.isFinite(importe) ? importe : null,
  }
}
