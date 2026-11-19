import { expect, it } from 'vitest'
import { presentarMovimientoStock, resolveStockMovementDelta } from './stockMovementDisplay'

it('presenta egresos históricos positivos y actuales negativos como salidas', () => {
  for (const cantidad of [3, -3]) {
    expect(presentarMovimientoStock({ tipo: 'EGRESO', cantidad, costo_unitario_referencia: 12 }))
      .toEqual({ cantidad: '-3', estimacion: 36 })
  }
})

it('presenta ajustes con signo explícito desde delta_stock sin inventar valoración de pérdida', () => {
  expect(presentarMovimientoStock({ tipo: 'AJUSTE', cantidad: 5, delta_stock: -5, costo_unitario_referencia: 12 }))
    .toEqual({ cantidad: '-5', estimacion: null })
  expect(presentarMovimientoStock({ tipo: 'AJUSTE', cantidad: 5, delta_stock: 5, costo_unitario_referencia: 12 }))
    .toEqual({ cantidad: '+5', estimacion: null })
  expect(presentarMovimientoStock({ tipo: 'AJUSTE', cantidad: 0, delta_stock: 0, costo_unitario_referencia: 12 }))
    .toEqual({ cantidad: '0', estimacion: null })
})

it('aplica fallback seguro para ajustes históricos sin delta_stock ni inventar valoración', () => {
  expect(presentarMovimientoStock({ tipo: 'AJUSTE', cantidad: -4, delta_stock: null, costo_unitario_referencia: 12 }))
    .toEqual({ cantidad: '-4', estimacion: null })
  expect(presentarMovimientoStock({ tipo: 'AJUSTE', cantidad: 10, delta_stock: null, costo_unitario_referencia: 12 }))
    .toEqual({ cantidad: '+10', estimacion: null })
  expect(resolveStockMovementDelta({ tipo: 'AJUSTE', cantidad: 8, delta_stock: null, stock_anterior: 10, stock_nuevo: 8 }))
    .toBe(-2)
})

it('conserva costo cero y distingue costo desconocido', () => {
  expect(presentarMovimientoStock({ tipo: 'INGRESO', cantidad: 2, costo_unitario_referencia: 0 }))
    .toEqual({ cantidad: '+2', estimacion: 0 })
  expect(presentarMovimientoStock({ tipo: 'EGRESO', cantidad: 2 }).estimacion).toBeNull()
})

it('no presenta una estimación con costo negativo o cantidad no finita', () => {
  expect(presentarMovimientoStock({ tipo: 'EGRESO', cantidad: -2, costo_unitario_referencia: -10 }).estimacion).toBeNull()
  expect(presentarMovimientoStock({ tipo: 'EGRESO', cantidad: Number.POSITIVE_INFINITY, costo_unitario_referencia: 10 }).estimacion).toBeNull()
})
