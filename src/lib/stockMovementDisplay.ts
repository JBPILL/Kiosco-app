import type { MovimientoStock } from '../types/database'

export type DireccionDeltaStock = 'up' | 'down' | 'neutral'

export interface MovimientoStockDeltaInput {
  tipo: MovimientoStock['tipo'] | string
  cantidad?: number | string | null
  delta_stock?: number | string | null
  stock_anterior?: number | string | null
  stock_nuevo?: number | string | null
  costo_unitario_referencia?: number | string | null
}

function toFiniteNumber(valor: number | string | null | undefined): number | null {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : null
  }
  if (typeof valor === 'string') {
    const limpio = valor.trim()
    if (!limpio) return null
    const parsed = Number(limpio)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeDelta(valor: number): number {
  const redondeado = Number(valor.toFixed(3))
  return redondeado === 0 ? 0 : redondeado
}

/**
 * Resuelve la variación neta con signo del movimiento priorizando `delta_stock`.
 * En registros históricos sin `delta_stock`, deriva de `stock_nuevo - stock_anterior`
 * o aplica la convención de signo según el `tipo`.
 */
export function resolveStockMovementDelta(movimiento: MovimientoStockDeltaInput): number {
  const deltaExplicito = toFiniteNumber(movimiento.delta_stock)
  if (deltaExplicito !== null) {
    return normalizeDelta(deltaExplicito)
  }

  const stockAnterior = toFiniteNumber(movimiento.stock_anterior)
  const stockNuevo = toFiniteNumber(movimiento.stock_nuevo)
  if (stockAnterior !== null && stockNuevo !== null) {
    return normalizeDelta(stockNuevo - stockAnterior)
  }

  const cantidad = toFiniteNumber(movimiento.cantidad) ?? 0
  const tipo = String(movimiento.tipo || '').trim().toUpperCase()

  if (tipo === 'INGRESO' || tipo === 'ENTRADA') {
    return normalizeDelta(Math.abs(cantidad))
  }
  if (tipo === 'EGRESO' || tipo === 'SALIDA' || tipo === 'MERMA' || tipo === 'VENTA' || tipo === 'BAJA') {
    return normalizeDelta(-Math.abs(cantidad))
  }
  return normalizeDelta(cantidad)
}

export function getStockMovementDirection(delta: number): DireccionDeltaStock {
  const limpio = normalizeDelta(delta)
  if (limpio > 0) return 'up'
  if (limpio < 0) return 'down'
  return 'neutral'
}

export function formatStockMovementDelta(delta: number): string {
  const limpio = normalizeDelta(delta)
  if (limpio > 0) return `+${limpio}`
  if (limpio < 0) return `${limpio}`
  return '0'
}

/** Presenta la variación firmada real (vía `delta_stock`) sin valorar ajustes al costo. */
export function presentarMovimientoStock(movimiento: MovimientoStockDeltaInput): {
  cantidad: string
  estimacion: number | null
} {
  const tipo = String(movimiento.tipo || '').trim().toUpperCase()
  const delta = resolveStockMovementDelta(movimiento)
  const costo = toFiniteNumber(movimiento.costo_unitario_referencia)
  const tieneCantidadFinita =
    toFiniteNumber(movimiento.delta_stock) !== null || toFiniteNumber(movimiento.cantidad) !== null
  const importe =
    tipo !== 'AJUSTE' && costo !== null && costo >= 0 && tieneCantidadFinita
      ? Math.abs(delta) * costo
      : null
  return {
    cantidad: formatStockMovementDelta(delta),
    estimacion: importe !== null && Number.isFinite(importe) ? importe : null,
  }
}
