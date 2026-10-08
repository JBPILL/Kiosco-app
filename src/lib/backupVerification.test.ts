import { expect, it } from 'vitest'
import { verificarProductosBackup } from './backupVerification'
const esperado = [{ id: 'destino', campos: { precio_costo: 10, precio_venta: 20, stock_actual: 3.5, es_combo: true } }]
const producto = { id: 'destino', precio_costo: 10, precio_venta: 20, stock_actual: 3.5, es_combo: true }
it('confirma valores exactos del producto remapeado', () => {
  expect(verificarProductosBackup(esperado,[producto,{ id:'otro' }])).toBe(1)
})
it.each(['precio_costo','precio_venta','stock_actual','es_combo'])('rechaza diferencias en %s', campo => {
  expect(() => verificarProductosBackup(esperado,[{ ...producto,[campo]:null }])).toThrow(campo)
})
it('rechaza productos ausentes, duplicados y catálogo inválido', () => {
  expect(() => verificarProductosBackup(esperado,[])).toThrow('encontró')
  expect(() => verificarProductosBackup(esperado,[producto,producto])).toThrow('Identificadores')
  expect(() => verificarProductosBackup(esperado,null)).toThrow('catálogo')
})
it('no incluye los valores privados en el error', () => {
  expect(() => verificarProductosBackup(esperado,[{ ...producto,precio_costo:123456 }])).toThrow('precio_costo')
  try { verificarProductosBackup(esperado,[{ ...producto,precio_costo:123456 }]) }
  catch (error) { expect(String(error)).not.toContain('123456') }
})
