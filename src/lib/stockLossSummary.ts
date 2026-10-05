import type { MovimientoStock } from '../types/database'

const MOTIVOS_BAJA = ['MERMA', 'PERDIDA', 'ROTURA', 'VENCIMIENTO', 'ROBO', 'CONSUMO_INTERNO'] as const
type MotivoBaja = typeof MOTIVOS_BAJA[number]
type MovimientoResumen = Pick<MovimientoStock, 'tipo' | 'motivo' | 'cantidad' | 'costo_unitario_referencia'>

export interface ResumenBajaStock {
  motivo: MotivoBaja
  movimientos: number
  sinCosto: number
  estimacion: number | null
}

/** Solo egresos identificados: no interpreta ajustes antiguos ni resultados fiscales. */
export function resumirBajasStock(movimientos: readonly MovimientoResumen[]): ResumenBajaStock[] {
  return MOTIVOS_BAJA.flatMap((motivo) => {
    const bajas = movimientos.filter((movimiento) => movimiento.tipo === 'EGRESO' && movimiento.motivo === motivo)
    if (bajas.length === 0) return []
    const importes = bajas.map((movimiento): number | null => {
      const costo = movimiento.costo_unitario_referencia
      if (costo == null || !Number.isFinite(costo) || costo < 0 || !Number.isFinite(movimiento.cantidad)) return null
      const importe = Math.abs(movimiento.cantidad) * costo
      return Number.isFinite(importe) ? importe : null
    })
    const conocidos = importes.filter((importe): importe is number => importe !== null)
    return [{
      motivo,
      movimientos: bajas.length,
      sinCosto: bajas.length - conocidos.length,
      estimacion: conocidos.length === 0 ? null : conocidos.reduce((total, importe) => total + importe, 0),
    }]
  })
}
