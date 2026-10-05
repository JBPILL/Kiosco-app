import { expect, it } from 'vitest'
import { presentarMovimientoStock } from './stockMovementDisplay'

it('presenta egresos históricos positivos y actuales negativos como salidas', () => {
  for (const cantidad of [3, -3]) {
    expect(presentarMovimientoStock({ tipo: 'EGRESO', cantidad, costo_unitario_referencia: 12 }))
      .toEqual({ cantidad: '-3', estimacion: 36 })
  }
})

it('no interpreta ajustes de formato desconocido como stock final ni como pérdida', () => {
  for (const cantidad of [10, -4]) {
    expect(presentarMovimientoStock({ tipo: 'AJUSTE', cantidad, costo_unitario_referencia: 12 }))
      .toEqual({ cantidad: `Registro: ${cantidad}`, estimacion: null })
  }
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
