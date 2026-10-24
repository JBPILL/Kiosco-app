import { expect, it } from 'vitest'
import { distribuirTotalConEnvases } from './distribuirTotalConEnvases'

it('preserva el crédito completo del envase al aplicar descuento sobre mercadería', () => {
  expect(distribuirTotalConEnvases([{ subtotal: 10000 }, { subtotal: -1000, es_devolucion_envase: true }], 8000)).toEqual([9000, -1000])
})
it('conserva créditos al repartir descuento entre varias líneas y recargo', () => {
  const items = [{ subtotal: 4000 }, { subtotal: -1000, es_devolucion_envase: true }, { subtotal: 6000 }]
  expect(distribuirTotalConEnvases(items, 8000)).toEqual([3600, -1000, 5400])
  expect(distribuirTotalConEnvases(items, 10000)).toEqual([4400, -1000, 6600])
})
it('admite compra cubierta por envases, sin inventar una venta negativa', () => {
  expect(distribuirTotalConEnvases([{ subtotal: 1000 }, { subtotal: -1000, es_devolucion_envase: true }], 0)).toEqual([1000, -1000])
  expect(() => distribuirTotalConEnvases([{ subtotal: 100 }, { subtotal: -1000, es_devolucion_envase: true }], 0)).toThrow('superan')
})
it('preserva el algoritmo anterior cuando no hay envases', () => {
  expect(distribuirTotalConEnvases([{ subtotal: 33 }, { subtotal: 67 }], 75)).toEqual([25, 50])
})
it('no redondea silenciosamente un crédito fraccional ni admite recepción sin compra', () => {
  expect(() => distribuirTotalConEnvases([{ subtotal: 1000 }, { subtotal: -100.5, es_devolucion_envase: true }], 900)).toThrow('pesos enteros')
  expect(() => distribuirTotalConEnvases([{ subtotal: 0, es_devolucion_envase: true }], 0)).toThrow('sin compra')
})
