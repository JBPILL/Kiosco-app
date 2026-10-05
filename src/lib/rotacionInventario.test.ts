import { describe, expect, it } from 'vitest'
import {
  calcularRotacionInventario,
  clasificarSegmentoRotacion,
  type LineaVentaHistorial,
} from './rotacionInventario'
import type { Producto } from '../types/database'

function crearProducto(overrides: Partial<Producto> = {}): Producto {
  return {
    id: 'p-1',
    kiosco_id: 'k-1',
    categoria_id: null,
    proveedor_id: null,
    codigo_barras: '123456',
    descripcion: 'Golosina Test',
    precio_costo: 100,
    precio_venta: 200,
    stock_actual: 10,
    stock_minimo: 2,
    es_favorito: false,
    activo: true,
    fecha_creacion: '2026-01-01T00:00:00Z',
    fecha_actualizacion: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('rotacionInventario - clasificarSegmentoRotacion', () => {
  it('clasifica bordes exactos de 0 a 30 días como ACTIVA', () => {
    expect(clasificarSegmentoRotacion(0, false)).toBe('ACTIVA')
    expect(clasificarSegmentoRotacion(15, false)).toBe('ACTIVA')
    expect(clasificarSegmentoRotacion(30, false)).toBe('ACTIVA')
  })

  it('clasifica bordes exactos de 31 a 60 días como ALERTA', () => {
    expect(clasificarSegmentoRotacion(31, false)).toBe('ALERTA')
    expect(clasificarSegmentoRotacion(45, false)).toBe('ALERTA')
    expect(clasificarSegmentoRotacion(60, false)).toBe('ALERTA')
  })

  it('clasifica bordes exactos de 61 a 90 días como ESTANCADO', () => {
    expect(clasificarSegmentoRotacion(61, false)).toBe('ESTANCADO')
    expect(clasificarSegmentoRotacion(75, false)).toBe('ESTANCADO')
    expect(clasificarSegmentoRotacion(90, false)).toBe('ESTANCADO')
  })

  it('clasifica más de 90 días como MUERTO', () => {
    expect(clasificarSegmentoRotacion(91, false)).toBe('MUERTO')
    expect(clasificarSegmentoRotacion(180, false)).toBe('MUERTO')
  })

  it('clasifica productos nunca vendidos como MUERTO sin importar días recientes', () => {
    expect(clasificarSegmentoRotacion(5, true)).toBe('MUERTO')
    expect(clasificarSegmentoRotacion(20, true)).toBe('MUERTO')
  })
})

describe('rotacionInventario - calcularRotacionInventario', () => {
  const fechaCorte = new Date('2026-06-01T12:00:00Z')

  it('excluye productos con stock 0 o inactivos', () => {
    const prods: Producto[] = [
      crearProducto({ id: 'p-cero', stock_actual: 0 }),
      crearProducto({ id: 'p-negativo', stock_actual: -2 }),
      crearProducto({ id: 'p-inactivo', stock_actual: 5, activo: false }),
      crearProducto({ id: 'p-ok', stock_actual: 4, precio_costo: 50 }),
    ]

    const metricas = calcularRotacionInventario(prods, [], fechaCorte)
    expect(metricas.totalProductosAnalizados).toBe(1)
    expect(metricas.items).toHaveLength(1)
    expect(metricas.items[0].producto.id).toBe('p-ok')
    expect(metricas.capitalTotalInventario).toBe(200) // 4 * 50
  })

  it('calcula días sin movimiento desde fecha_creacion para productos nunca vendidos', () => {
    // Creado 40 días antes del corte
    const prods: Producto[] = [
      crearProducto({
        id: 'p-nuevo',
        stock_actual: 5,
        precio_costo: 200,
        fecha_creacion: '2026-04-22T12:00:00Z', // 40 días antes
      }),
    ]

    const metricas = calcularRotacionInventario(prods, [], fechaCorte)
    const item = metricas.items[0]

    expect(item.nuncaVendido).toBe(true)
    expect(item.diasSinMovimiento).toBe(40)
    expect(item.segmento).toBe('MUERTO') // Nunca vendido -> MUERTO
    expect(item.capitalInmovilizado).toBe(1000)
    expect(metricas.capitalInmovilizadoTotal).toBe(1000)
  })

  it('distingue entre producto activo y productos con capital inmovilizado', () => {
    const pActivo = crearProducto({
      id: 'p-activo',
      descripcion: 'Coca Cola',
      stock_actual: 10,
      precio_costo: 100, // Capital: 1000
    })

    const pEstancado = crearProducto({
      id: 'p-estancado',
      descripcion: 'Galleta Rara',
      stock_actual: 5,
      precio_costo: 300, // Capital: 1500
    })

    // Ventas: p-activo vendido hace 5 días, p-estancado hace 70 días
    const lineas: LineaVentaHistorial[] = [
      {
        producto_id: 'p-activo',
        cantidad: 20,
        precio_costo: 100,
        fecha_hora: '2026-05-27T12:00:00Z', // 5 días antes
      },
      {
        producto_id: 'p-estancado',
        cantidad: 1,
        precio_costo: 300,
        fecha_hora: '2026-03-23T12:00:00Z', // 70 días antes
      },
    ]

    const metricas = calcularRotacionInventario([pActivo, pEstancado], lineas, fechaCorte)

    expect(metricas.totalProductosAnalizados).toBe(2)
    expect(metricas.capitalTotalInventario).toBe(2500) // 1000 + 1500
    expect(metricas.capitalInmovilizadoTotal).toBe(1500) // Solo el estancado (>30d)
    expect(metricas.totalProductosInmovilizados).toBe(1)
    expect(metricas.conteoPorSegmento.ACTIVA).toBe(1)
    expect(metricas.conteoPorSegmento.ESTANCADO).toBe(1)

    // Índice de rotación: CMV = (20*100) + (1*300) = 2300. Indice = 2300 / 2500 = 0.92
    expect(metricas.cmvPeriodo).toBe(2300)
    expect(metricas.indiceRotacion).toBe(0.92)
  })

  it('ordena la lista por capital inmovilizado descendente', () => {
    const p1 = crearProducto({ id: 'p1', stock_actual: 2, precio_costo: 100 }) // Capital 200
    const p2 = crearProducto({ id: 'p2', stock_actual: 10, precio_costo: 500 }) // Capital 5000
    const p3 = crearProducto({ id: 'p3', stock_actual: 5, precio_costo: 200 }) // Capital 1000

    const metricas = calcularRotacionInventario([p1, p2, p3], [], fechaCorte)

    expect(metricas.items[0].producto.id).toBe('p2')
    expect(metricas.items[1].producto.id).toBe('p3')
    expect(metricas.items[2].producto.id).toBe('p1')
  })

  it('retorna índice de rotación null si no hay historial de ventas en el período', () => {
    const p = crearProducto({ id: 'p1', stock_actual: 5, precio_costo: 100 })
    const metricas = calcularRotacionInventario([p], [], fechaCorte)

    expect(metricas.indiceRotacion).toBeNull()
  })
})
