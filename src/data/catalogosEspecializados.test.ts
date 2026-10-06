import { describe, expect, it } from 'vitest'
import { CATALOGO_MAESTRO_VETERINARIA } from './catalogoMaestroVeterinaria'
import { CATALOGO_MAESTRO_ELECTRONICA } from './catalogoMaestroElectronica'

describe.each([
  { nombre: 'Veterinaria', prefijo: 'VET-', productos: CATALOGO_MAESTRO_VETERINARIA,
    categorias: ['Alimentos para perros', 'Alimentos para gatos', 'Insumos de consultorio veterinario', 'Servicios veterinarios y de mascotas'] },
  { nombre: 'Electrónica', prefijo: 'TEC-', productos: CATALOGO_MAESTRO_ELECTRONICA,
    categorias: ['Celulares y tablets', 'Repuestos para celulares', 'Redes y conectividad', 'Servicios técnicos de electrónica'] },
])('$nombre', ({ prefijo, productos, categorias }) => {
  it('ofrece artículos distintos y códigos internos únicos', () => {
    expect(productos.length).toBeGreaterThan(100)
    expect(new Set(productos.map(p => p.codigo_barras)).size).toBe(productos.length)
    expect(new Set(productos.map(p => p.descripcion.trim().toLocaleLowerCase('es'))).size).toBe(productos.length)
    expect(productos.every(p => p.codigo_barras.startsWith(prefijo) && !/^\d{8,14}$/.test(p.codigo_barras))).toBe(true)
  })
  it('cubre categorías del rubro y exige configurar todos los valores comerciales', () => {
    const disponibles = new Set(productos.map(p => p.categoria_nombre))
    expect(disponibles.size).toBeGreaterThanOrEqual(12)
    for (const categoria of categorias) expect(disponibles.has(categoria)).toBe(true)
    for (const producto of productos) {
      expect(producto.precio_costo_ref).toBe(0)
      expect(producto.precio_venta_sugerido).toBe(0)
      expect(producto.stock_inicial_sugerido).toBe(0)
      expect(['UN', 'KG']).toContain(producto.unidad_medida)
      expect(producto.descripcion.trim()).not.toBe('')
    }
  })
})

it('veterinaria incluye insumos y servicios sin dosis ni prescripciones', () => {
  for (const producto of CATALOGO_MAESTRO_VETERINARIA) {
    expect(producto.descripcion).not.toMatch(/\b(?:mg|mcg|antibiótico|antibiotico|analgésico|analgesico|administrar|aplicar cada|dosis|tratamiento|prescripción|prescripcion)\b/i)
  }
})

it('los dos catálogos no comparten códigos internos', () => {
  const productos = [...CATALOGO_MAESTRO_VETERINARIA, ...CATALOGO_MAESTRO_ELECTRONICA]
  expect(new Set(productos.map(p => p.codigo_barras)).size).toBe(productos.length)
})

it('veterinaria ofrece ocho alimentos a granel pesables y marca alimentos para lotes', () => {
  const granel = CATALOGO_MAESTRO_VETERINARIA.filter(p => p.categoria_nombre === 'Alimentos a granel')
  expect(granel).toHaveLength(8)
  for (const producto of granel) expect(producto).toMatchObject({ unidad_medida: 'KG', es_pesable: true })
  const alimentos = CATALOGO_MAESTRO_VETERINARIA.filter(p => p.categoria_nombre.startsWith('Alimentos') || p.categoria_nombre === 'Premios y snacks')
  expect(alimentos).toHaveLength(48)
  for (const producto of alimentos) expect(producto).toMatchObject({ requiere_vencimiento: true, dias_alerta_vencimiento: 30 })
  for (const producto of CATALOGO_MAESTRO_VETERINARIA.filter(p => !alimentos.includes(p))) {
    expect(producto.requiere_vencimiento).toBeUndefined()
    expect(producto.dias_alerta_vencimiento).toBeUndefined()
  }
})
