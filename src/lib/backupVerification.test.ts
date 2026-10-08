import { expect, it } from 'vitest'
import { verificarProductosBackup, verificarLotesBackup } from './backupVerification'
const esperado = [{ id: 'destino', campos: { precio_costo: 10, precio_venta: 20, stock_actual: 3.5, es_combo: true } }]
const producto = { id: 'destino', precio_costo: 10, precio_venta: 20, stock_actual: 3.5, es_combo: true }
const lote = { id: 'lote-destino', producto_id: 'producto-destino', numero_lote: null,
  fecha_vencimiento: '2027-01-01', cantidad_inicial: 10, cantidad_actual: 3.5, activo: true }
const { id: idLote, ...camposLote } = lote
const lotesEsperados = [{ id: idLote, campos: camposLote }]
it('verifica cantidades y relación al producto remapeado del lote', () => {
  expect(verificarLotesBackup(lotesEsperados, [lote])).toBe(1)
})
it.each(Object.keys(camposLote))('rechaza diferencias persistidas de lote en %s', campo => {
  expect(() => verificarLotesBackup(lotesEsperados, [{ ...lote, [campo]: 'alterado' }])).toThrow(campo)
})
it('rechaza lotes ausentes, duplicados y respuesta inválida', () => {
  expect(() => verificarLotesBackup(lotesEsperados, [])).toThrow('encontró')
  expect(() => verificarLotesBackup(lotesEsperados, [lote, lote])).toThrow('Identificadores')
  expect(() => verificarLotesBackup(lotesEsperados, null)).toThrow('lotes')
  expect(() => verificarLotesBackup([...lotesEsperados, ...lotesEsperados], [lote])).toThrow('esperados')
})
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
