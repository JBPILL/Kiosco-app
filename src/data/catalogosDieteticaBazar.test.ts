import { describe, expect, it } from 'vitest'
import { CATALOGO_MAESTRO_DIETETICA } from './catalogoMaestroDietetica'
import { CATALOGO_MAESTRO_BAZAR } from './catalogoMaestroBazar'
import { obtenerCatalogoPorRubro, esCatalogoPlantilla } from './catalogosPorRubro'

describe.each([
  { rubro: 'DIETETICA' as const, prefijo: 'DIE-', productos: CATALOGO_MAESTRO_DIETETICA, cantidad: 86, categorias: 11 },
  { rubro: 'BAZAR' as const, prefijo: 'BAZ-', productos: CATALOGO_MAESTRO_BAZAR, cantidad: 120, categorias: 10 },
])('$rubro', ({ rubro, prefijo, productos, cantidad, categorias }) => {
  it('selecciona la plantilla propia en lugar de mercadería del kiosco', () => {
    expect(esCatalogoPlantilla(rubro)).toBe(true)
    expect(obtenerCatalogoPorRubro(rubro)).toBe(productos)
    expect(productos).toHaveLength(cantidad)
    expect(new Set(productos.map(p => p.categoria_nombre)).size).toBe(categorias)
    expect(productos.every(p => p.codigo_barras.startsWith(prefijo))).toBe(true)
    expect(productos.some(p => /cerveza|cigarrillo|retornable/i.test(p.descripcion))).toBe(false)
  })
  it('ofrece códigos y descripciones únicos sin inventar precios ni existencias', () => {
    expect(new Set(productos.map(p => p.codigo_barras)).size).toBe(productos.length)
    expect(new Set(productos.map(p => p.descripcion)).size).toBe(productos.length)
    for (const producto of productos) {
      expect(producto).toMatchObject({ precio_costo_ref: 0, precio_venta_sugerido: 0, stock_inicial_sugerido: 0 })
      expect(producto.descripcion.trim()).not.toBe('')
    }
  })
})

it('dietética maneja los 56 artículos de granel en KG y los 30 envasados en UN', () => {
  const granel = CATALOGO_MAESTRO_DIETETICA.filter(p => p.es_pesable)
  expect(granel).toHaveLength(56)
  expect(granel.every(p => p.unidad_medida === 'KG')).toBe(true)
  const envasados = CATALOGO_MAESTRO_DIETETICA.filter(p => !p.es_pesable)
  expect(envasados).toHaveLength(30)
  expect(envasados.every(p => p.unidad_medida === 'UN')).toBe(true)
  expect(CATALOGO_MAESTRO_DIETETICA.every(p => p.requiere_vencimiento && p.dias_alerta_vencimiento === 30)).toBe(true)
})

it('bazar vende todos los artículos por unidad sin lotes ni pesaje', () => {
  expect(CATALOGO_MAESTRO_BAZAR.every(p => p.unidad_medida === 'UN' && p.es_pesable === false && p.requiere_vencimiento === false)).toBe(true)
  expect(new Set(CATALOGO_MAESTRO_BAZAR.map(p => p.categoria_nombre))).toEqual(new Set([
    'Cocina y Vajilla', 'Utensilios de cocina', 'Cocción y repostería', 'Organización y Limpieza',
    'Conservación y recipientes', 'Decoración y Regalería', 'Baño', 'Textiles del hogar', 'Juguetería', 'Jardín y exteriores',
  ]))
})
