import { expect, it } from 'vitest'
import { verificarProductosBackup, verificarLotesBackup, verificarPromocionesBackup, verificarCombosBackup } from './backupVerification'
const esperado = [{ id: 'destino', campos: { precio_costo: 10, precio_venta: 20, stock_actual: 3.5, es_combo: true } }]
const producto = { id: 'destino', precio_costo: 10, precio_venta: 20, stock_actual: 3.5, es_combo: true }
const lote = { id: 'lote-destino', producto_id: 'producto-destino', numero_lote: null,
  fecha_vencimiento: '2027-01-01', cantidad_inicial: 10, cantidad_actual: 3.5, activo: true }
const { id: idLote, ...camposLote } = lote
const lotesEsperados = [{ id: idLote, campos: camposLote }]
const promocion = { id: 'promo', producto_id: 'destino', categoria_id: null,
  items_combo: [{ producto_id: 'destino', cantidad: 2 }], dias_semana: [1, 3], descuento_porcentaje: 20 }
const { id: idPromo, ...camposPromo } = promocion
const promosEsperadas = [{ id: idPromo, campos: camposPromo }]
const componentes = [{ componente_producto_id: 'a', cantidad: 2 }, { componente_producto_id: 'b', cantidad: 0.5 }]
it('verifica recetas por ID remapeado independientemente de orden', () => {
  expect(verificarCombosBackup([{ id: 'pack', componentes }], [{ id: 'pack', componentes_combo: [...componentes].reverse() }])).toBe(1)
})
it.each([undefined, [], [componentes[0], componentes[0]], [{ ...componentes[0], cantidad: 3 }, componentes[1]],
  [{ ...componentes[0], componente_producto_id: 'otro' }, componentes[1]]])('rechaza receta persistida diferente %j', receta => {
  expect(() => verificarCombosBackup([{ id: 'pack', componentes }], [{ id: 'pack', componentes_combo: receta }])).toThrow()
})
it('verifica eliminación de receta al convertir combo en físico', () => {
  expect(verificarCombosBackup([{ id: 'pack', componentes: [] }], [{ id: 'pack', componentes_combo: [] }])).toBe(1)
})
it.each([0, -1, NaN, Infinity, 1000000, 0.0001])('rechaza cantidad esperada inválida incluso coincidente %s', cantidad => {
  const componentes = [{ componente_producto_id: 'a', cantidad }]
  expect(() => verificarCombosBackup([{ id: 'pack', componentes }], [{ id: 'pack', componentes_combo: componentes }])).toThrow('esperado')
})
it('rechaza duplicados esperados aunque sus cantidades coincidan', () => {
  const duplicados = [componentes[0], componentes[0]]
  expect(() => verificarCombosBackup([{ id: 'pack', componentes: duplicados }], [{ id: 'pack', componentes_combo: componentes }])).toThrow('esperado')
  expect(() => verificarCombosBackup([{ id: 'pack', componentes }, { id: 'pack', componentes }], [{ id: 'pack', componentes_combo: componentes }])).toThrow('Identificadores esperados')
})
it('compara relaciones JSON sin depender del orden de claves', () => {
  expect(verificarPromocionesBackup(promosEsperadas, [{ ...promocion,
    items_combo: [{ cantidad: 2, producto_id: 'destino' }] }])).toBe(1)
})
it.each([
  { producto_id: 'otro' }, { items_combo: [{ producto_id: 'destino', cantidad: 3 }] },
  { dias_semana: [1] }, { categoria_id: undefined }, { descuento_porcentaje: 15 },
])('rechaza cambios persistidos de promoción %j', cambio => {
  expect(() => verificarPromocionesBackup(promosEsperadas, [{ ...promocion, ...cambio }])).toThrow('no conservó')
})
it('rechaza promociones ausentes o duplicadas', () => {
  expect(() => verificarPromocionesBackup(promosEsperadas, [])).toThrow('encontró')
  expect(() => verificarPromocionesBackup(promosEsperadas, [promocion, promocion])).toThrow('Identificadores')
})
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
