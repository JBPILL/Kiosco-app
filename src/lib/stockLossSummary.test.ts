import { describe, expect, it } from 'vitest'
import { resumirBajasStock } from './stockLossSummary'
import type { MovimientoStock } from '../types/database'

function movimiento(motivo: MovimientoStock['motivo'], cantidad: number, costo: number | null,
  tipo: MovimientoStock['tipo'] = 'EGRESO') {
  return { motivo, cantidad, tipo, costo_unitario_referencia: costo }
}

describe('resumen de bajas de stock', () => {
  it('distingue motivos e ignora ventas, compras, devoluciones y ajustes', () => {
    const resumen = resumirBajasStock([
      movimiento('MERMA', -2, 10), movimiento('ROBO', 3, 20),
      movimiento('CONSUMO_INTERNO', -1, 4), movimiento('ROTURA', -1, 5),
      movimiento('VENCIMIENTO', -1, 6), movimiento('PERDIDA', -1, 7),
      movimiento('VENTA', -100, 10), movimiento('DEVOLUCION', 1, 10),
      movimiento('COMPRA', 10, 10, 'INGRESO'), movimiento('CONTEO', -10, 10, 'AJUSTE'),
    ])
    expect(resumen.map((fila) => fila.motivo)).toEqual([
      'MERMA', 'PERDIDA', 'ROTURA', 'VENCIMIENTO', 'ROBO', 'CONSUMO_INTERNO',
    ])
    expect(resumen.reduce((total, fila) => total + fila.movimientos, 0)).toBe(6)
    expect(resumen.reduce((total, fila) => total + (fila.estimacion ?? 0), 0)).toBe(102)
  })

  it('suma únicamente costos conocidos y cuenta desconocidos sin inventar un costo', () => {
    const [fila] = resumirBajasStock([
      movimiento('MERMA', -2, 10), movimiento('MERMA', -3, null),
    ])
    expect(fila).toEqual({ motivo: 'MERMA', movimientos: 2, sinCosto: 1, estimacion: 20 })
  })

  it('distingue estimación cero real de ausencia total de costos', () => {
    expect(resumirBajasStock([movimiento('MERMA', -2, 0)])[0].estimacion).toBe(0)
    expect(resumirBajasStock([movimiento('MERMA', -2, null)])[0].estimacion).toBeNull()
  })

  it('rechaza cifras no finitas y costos negativos sin contaminar el total', () => {
    const [fila] = resumirBajasStock([
      movimiento('MERMA', -2, Number.NaN), movimiento('MERMA', -2, -10),
      movimiento('MERMA', Number.POSITIVE_INFINITY, 10),
    ])
    expect(fila.sinCosto).toBe(3)
    expect(fila.estimacion).toBeNull()
  })

  it('devuelve vacío cuando no hay bajas y no modifica los movimientos', () => {
    const filas = [Object.freeze(movimiento('MERMA', -1.5, 12))]
    expect(resumirBajasStock(filas)[0].estimacion).toBe(18)
    expect(filas[0].cantidad).toBe(-1.5)
    expect(resumirBajasStock([])).toEqual([])
  })
})
