import { expect, it } from 'vitest'
import { crearProducto } from '../test/factories'
import { buscarCodigoCamaraLocal } from './cameraBarcodeCache'
it('encuentra código exacto del comercio y no expone costo cacheado', () => {
  const producto = crearProducto({ kiosco_id: 'k1', codigo_barras: '001234', precio_costo: 100 })
  expect(buscarCodigoCamaraLocal([producto], 'k1', '001234')).toMatchObject({ id: producto.id, precio_costo: 0 })
  expect(producto.precio_costo).toBe(100)
})
it('descarta otro comercio, inactivos y coincidencias parciales', () => {
  const producto = crearProducto({ kiosco_id: 'k1', codigo_barras: '001234' })
  expect(buscarCodigoCamaraLocal([producto], 'k2', '001234')).toBeNull()
  expect(buscarCodigoCamaraLocal([{ ...producto, activo: false }], 'k1', '001234')).toBeNull()
  expect(buscarCodigoCamaraLocal([producto], 'k1', '1234')).toBeNull()
})
it('no elige arbitrariamente si hay códigos duplicados', () => {
  const producto = crearProducto({ kiosco_id: 'k1', codigo_barras: '001234' })
  expect(buscarCodigoCamaraLocal([producto, { ...producto, id: 'otro' }], 'k1', '001234')).toBeNull()
})
