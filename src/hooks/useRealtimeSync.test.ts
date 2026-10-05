import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  registrarToqueLocal,
  esToqueLocalReciente,
} from './useRealtimeSync'
import { useCartStore } from '../stores/cartStore'
import type { Producto } from '../types/database'

function crearProductoMock(overrides: Partial<Producto> = {}): Producto {
  return {
    id: 'prod-1',
    kiosco_id: 'k1',
    categoria_id: null,
    proveedor_id: null,
    codigo_barras: '7791234567890',
    descripcion: 'Alfajor Triple',
    precio_costo: 500,
    precio_venta: 1000,
    stock_actual: 10,
    stock_minimo: 2,
    es_favorito: true,
    activo: true,
    fecha_creacion: '2026-01-01T00:00:00Z',
    fecha_actualizacion: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('Realtime Multi-caja - Detección de eco local', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('detecta un producto tocado localmente recientemente', () => {
    registrarToqueLocal('prod-123')
    expect(esToqueLocalReciente('prod-123')).toBe(true)
    expect(esToqueLocalReciente('otro-prod')).toBe(false)
  })

  it('expira el eco local después del tiempo límite (2.5 s)', () => {
    registrarToqueLocal('prod-456')
    expect(esToqueLocalReciente('prod-456')).toBe(true)

    vi.advanceTimersByTime(3000)
    expect(esToqueLocalReciente('prod-456')).toBe(false)
  })
})

describe('Realtime Multi-caja - Actualización en Carrito sin vaciar ticket', () => {
  beforeEach(() => {
    useCartStore.setState({
      items: [],
      tabs: [{ id: 'tab-1', nombre: 'Ticket 1', items: [], tipoAjuste: 'NINGUNO', valorAjuste: 0 }],
      tabActivaId: 'tab-1',
    })
  })

  it('actualiza el stock_actual del producto en el carrito activo sin perder items ni cantidades', () => {
    const prod = crearProductoMock({ id: 'p1', stock_actual: 10 })
    useCartStore.getState().agregarProducto(prod, 3)

    const cart = useCartStore.getState()
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0].cantidad).toBe(3)
    expect(cart.items[0].producto.stock_actual).toBe(10)

    // Simular que otra caja cobró 5 unidades y el nuevo stock es 5
    useCartStore.getState().actualizarStockProductoEnCarrito('p1', 5)

    const cartActualizado = useCartStore.getState()
    expect(cartActualizado.items).toHaveLength(1)
    expect(cartActualizado.items[0].cantidad).toBe(3) // La cantidad que el cliente tiene en mano no se borra
    expect(cartActualizado.items[0].producto.stock_actual).toBe(5) // Stock actualizado en tiempo real
    expect(cartActualizado.tabActivaId).toBe('tab-1') // Pestaña activa intacta
  })

  it('actualiza el stock en todas las pestañas abiertas simultáneamente', () => {
    const prod = crearProductoMock({ id: 'p2', stock_actual: 8 })

    // Tab 1
    useCartStore.getState().agregarProducto(prod, 2)

    // Crear Tab 2 y agregar el mismo producto
    const tab2Id = useCartStore.getState().crearNuevaTab('Ticket 2')
    useCartStore.getState().cambiarTab(tab2Id)
    useCartStore.getState().agregarProducto(prod, 1)

    // Otra caja cambia el stock a 0
    useCartStore.getState().actualizarStockProductoEnCarrito('p2', 0)

    const state = useCartStore.getState()
    const tab1 = state.tabs.find((t) => t.id === 'tab-1')
    const tab2 = state.tabs.find((t) => t.id === tab2Id)

    expect(tab1?.items[0].producto.stock_actual).toBe(0)
    expect(tab2?.items[0].producto.stock_actual).toBe(0)
    expect(state.items[0].producto.stock_actual).toBe(0)
    // Ningún ticket fue vaciado
    expect(tab1?.items[0].cantidad).toBe(2)
    expect(tab2?.items[0].cantidad).toBe(1)
  })

  it('reacciona automáticamente al evento global kiosko-products-updated', () => {
    const prod = crearProductoMock({ id: 'p3', stock_actual: 20 })
    useCartStore.getState().agregarProducto(prod, 2)

    window.dispatchEvent(
      new CustomEvent('kiosko-products-updated', {
        detail: {
          eventType: 'UPDATE',
          producto: { ...prod, stock_actual: 14 },
          esEchoLocal: false,
        },
      })
    )

    const cart = useCartStore.getState()
    expect(cart.items[0].producto.stock_actual).toBe(14)
  })
})
