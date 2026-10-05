import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { prepararMovimientoStock } from './stockOperation'
beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())
it('mantiene el identificador en reintentos y genera otro después de confirmar', () => {
  const solicitud = { p_producto_id: 'p1', p_cantidad: 2 }
  const first = prepararMovimientoStock('k1', solicitud)
  expect(prepararMovimientoStock('k1', solicitud).parametros).toEqual(first.parametros)
  first.confirmar()
  expect(prepararMovimientoStock('k1', solicitud).parametros.p_operacion_id).not.toBe(first.parametros.p_operacion_id)
})
it('separa productos y comercios', () => {
  const first = prepararMovimientoStock('k1', { p_producto_id: 'p1', cantidad: 2 }).parametros.p_operacion_id
  expect(prepararMovimientoStock('k1', { p_producto_id: 'p2', cantidad: 3 }).parametros.p_operacion_id).not.toBe(first)
  expect(prepararMovimientoStock('k2', { p_producto_id: 'p1', cantidad: 2 }).parametros.p_operacion_id).not.toBe(first)
})
it('impide cambiar la cantidad mientras la solicitud original está pendiente', () => {
  const original = prepararMovimientoStock('k1', { p_producto_id: 'p1', p_cantidad: 2 })
  expect(() => prepararMovimientoStock('k1', { p_producto_id: 'p1', p_cantidad: 3 })).toThrow('pendiente')
  expect(prepararMovimientoStock('k1', { p_producto_id: 'p1', p_cantidad: 2 }).parametros).toEqual(original.parametros)
})
it('la identidad no depende del orden de las propiedades', () => {
  const original = prepararMovimientoStock('k1', { p_producto_id: 'p1', p_cantidad: 2 })
  expect(prepararMovimientoStock('k1', { p_cantidad: 2, p_producto_id: 'p1' }).parametros.p_operacion_id).toBe(original.parametros.p_operacion_id)
})
it('no reemplaza silenciosamente una identidad local dañada', () => {
  prepararMovimientoStock('k1', { p_producto_id: 'p1', p_cantidad: 2 })
  const key = localStorage.key(0)!
  localStorage.setItem(key, 'datos dañados')
  expect(() => prepararMovimientoStock('k1', { p_producto_id: 'p1', p_cantidad: 2 })).toThrow('pendiente')
  expect(localStorage.getItem(key)).toBe('datos dañados')
})
it('informa que no puede conservar la identidad si el almacenamiento rechaza la escritura', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
  expect(() => prepararMovimientoStock('k1', { p_producto_id: 'p1' })).toThrow('guardar')
})
it('rechaza una solicitud sin comercio', () => {
  expect(() => prepararMovimientoStock(undefined, {})).toThrow('comercio')
})
