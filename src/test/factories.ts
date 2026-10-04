import type { ItemCarrito, Producto, Promocion } from '../types/database'

export function crearProducto(overrides: Partial<Producto> = {}): Producto {
  return {
    id: 'prod-1',
    kiosco_id: 'k1',
    categoria_id: null,
    codigo_barras: null,
    descripcion: 'Producto de prueba',
    precio_costo: 50,
    precio_venta: 100,
    stock_actual: 100,
    stock_minimo: 5,
    es_favorito: false,
    activo: true,
    fecha_creacion: '2026-01-01T00:00:00.000Z',
    fecha_actualizacion: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function crearPromocion(overrides: Partial<Promocion> = {}): Promocion {
  return {
    id: 'promo-1',
    kiosco_id: 'k1',
    nombre: 'Promo',
    tipo: 'PORCENTAJE',
    producto_id: 'prod-1',
    categoria_id: null,
    cantidad_minima: 1,
    cantidad_paga: null,
    precio_unitario_promo: null,
    descuento_porcentaje: null,
    precio_combo: null,
    items_combo: null,
    dias_semana: null,
    fecha_inicio: null,
    fecha_fin: null,
    activo: true,
    ...overrides,
  }
}

export function crearItem(producto: Producto, cantidad: number, overrides: Partial<ItemCarrito> = {}): ItemCarrito {
  return {
    producto,
    cantidad,
    subtotal: Math.round(cantidad * producto.precio_venta),
    ...overrides,
  }
}
