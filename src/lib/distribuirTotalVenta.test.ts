import { describe, expect, it } from 'vitest'
import { distribuirTotalVenta } from './distribuirTotalVenta'

describe('distribuirTotalVenta', () => {
  it('conserva el total cuando el descuento deja fracciones iguales', () => {
    expect(distribuirTotalVenta([100, 100, 100], 100)).toEqual([34, 33, 33])
  })
  it('incluye reintegros negativos sin perder pesos', () => {
    const importes = distribuirTotalVenta([101, 101, -50], 101)
    expect(importes.reduce((suma, importe) => suma + importe, 0)).toBe(101)
    expect(importes[2]).toBeLessThan(0)
  })
  it('reconcilia artículos pesables aun sin ajuste explícito', () => {
    expect(distribuirTotalVenta([1.4, 1.4], 3)).toEqual([2, 1])
  })
  it('admite descuento total y no modifica la entrada', () => {
    const entrada = [100, -20]
    expect(distribuirTotalVenta(entrada, 0)).toEqual([0, 0])
    expect(entrada).toEqual([100, -20])
  })
  it('rechaza importes o bases inválidas', () => {
    for (const subtotales of [[], [NaN], [Infinity], [10, -10], [-1]]) {
      expect(() => distribuirTotalVenta(subtotales, 10)).toThrow()
    }
    expect(() => distribuirTotalVenta([10], 1.5)).toThrow()
  })
})
