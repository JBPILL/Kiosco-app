import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import toast from 'react-hot-toast'
import type { Producto, ItemCarrito } from '../types/database'

export type TipoAjuste =
  | 'NINGUNO'
  | 'DESCUENTO_PORCENTAJE'
  | 'DESCUENTO_FIJO'
  | 'RECARGO_PORCENTAJE'
  | 'RECARGO_FIJO'

export interface VentaEnEspera {
  id: string
  fecha: string
  nota: string
  items: ItemCarrito[]
  tipoAjuste: TipoAjuste
  valorAjuste: number
  total: number
}

interface CartState {
  // Estado del carrito activo
  items: ItemCarrito[]
  tipoAjuste: TipoAjuste
  valorAjuste: number

  // Ventas en espera
  ventasEnEspera: VentaEnEspera[]

  // Acciones de productos
  agregarProducto: (producto: Producto) => void
  agregarItemLibre: (descripcion: string, precio: number, cantidad?: number) => void
  quitarProducto: (productoId: string) => void
  actualizarCantidad: (productoId: string, cantidad: number) => void
  vaciarCarrito: () => void

  // Acciones de descuentos y recargos
  aplicarAjuste: (tipo: TipoAjuste, valor: number) => void
  quitarAjuste: () => void

  // Acciones de ventas en espera
  suspenderVentaActual: (nota?: string) => boolean
  recuperarVenta: (id: string) => void
  eliminarVentaEnEspera: (id: string) => void

  // Computed
  totalItems: () => number
  subtotalMonto: () => number
  montoAjuste: () => number
  totalMonto: () => number
  descripcionAjuste: () => string | null
}

const STORAGE_KEY_ESPERA = 'kioskopos_ventas_espera'

function cargarVentasEnEspera(): VentaEnEspera[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ESPERA)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function guardarVentasEnEspera(ventas: VentaEnEspera[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_ESPERA, JSON.stringify(ventas))
  } catch (e) {
    console.error('Error guardando ventas en espera:', e)
  }
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  tipoAjuste: 'NINGUNO',
  valorAjuste: 0,
  ventasEnEspera: cargarVentasEnEspera(),

  agregarProducto: (producto: Producto) => {
    // Si el producto figura con stock 0 en sistema, emitir aviso pero permitir agregarlo
    if (producto.stock_actual <= 0) {
      toast(`Aviso: "${producto.descripcion}" figura con stock 0 (se registrará con stock negativo)`, {
        duration: 3500,
      })
    }

    set((state) => {
      const existente = state.items.find((item) => item.producto.id === producto.id)
      if (existente) {
        if (producto.stock_actual > 0 && existente.cantidad >= producto.stock_actual) {
          toast(
            `Aviso: Superando stock disponible de "${producto.descripcion}" (${producto.stock_actual} en sistema)`,
            { duration: 3000 }
          )
        }

        return {
          items: state.items.map((item) =>
            item.producto.id === producto.id
              ? {
                  ...item,
                  cantidad: item.cantidad + 1,
                  subtotal: (item.cantidad + 1) * item.producto.precio_venta,
                }
              : item
          ),
        }
      }

      return {
        items: [
          ...state.items,
          {
            producto,
            cantidad: 1,
            subtotal: producto.precio_venta,
          },
        ],
      }
    })
  },

  agregarItemLibre: (descripcion: string, precio: number, cantidad = 1) => {
    const desc = descripcion.trim() || 'Varios'
    const cant = Math.max(1, Math.round(cantidad))
    const precioUnitario = Math.max(1, Math.round(precio))

    const productoLibre: Producto = {
      id: uuidv4(),
      kiosco_id: '',
      categoria_id: null,
      codigo_barras: null,
      descripcion: desc,
      precio_costo: 0,
      precio_venta: precioUnitario,
      stock_actual: 99999,
      stock_minimo: 0,
      es_favorito: false,
      activo: false,
      fecha_creacion: new Date().toISOString(),
      fecha_actualizacion: new Date().toISOString(),
    }

    set((state) => ({
      items: [
        ...state.items,
        {
          producto: productoLibre,
          cantidad: cant,
          subtotal: precioUnitario * cant,
        },
      ],
    }))

    toast.success(`"${desc}" agregado al ticket`)
  },

  quitarProducto: (productoId: string) => {
    set((state) => ({
      items: state.items.filter((item) => item.producto.id !== productoId),
    }))
  },

  actualizarCantidad: (productoId: string, cantidad: number) => {
    if (cantidad <= 0) {
      get().quitarProducto(productoId)
      return
    }

    const state = get()
    const itemTarget = state.items.find((it) => it.producto.id === productoId)
    const cantidadAjustada = cantidad

    if (itemTarget && itemTarget.producto.stock_actual > 0 && cantidad > itemTarget.producto.stock_actual) {
      toast(
        `Aviso: Superando stock disponible de "${itemTarget.producto.descripcion}" (${itemTarget.producto.stock_actual} en sistema)`,
        { duration: 3000 }
      )
    }

    set((state) => ({
      items: state.items.map((item) =>
        item.producto.id === productoId
          ? {
              ...item,
              cantidad: cantidadAjustada,
              subtotal: cantidadAjustada * item.producto.precio_venta,
            }
          : item
      ),
    }))
  },

  vaciarCarrito: () =>
    set({
      items: [],
      tipoAjuste: 'NINGUNO',
      valorAjuste: 0,
    }),

  aplicarAjuste: (tipo: TipoAjuste, valor: number) => {
    set({
      tipoAjuste: tipo,
      valorAjuste: Math.max(0, valor),
    })
  },

  quitarAjuste: () =>
    set({
      tipoAjuste: 'NINGUNO',
      valorAjuste: 0,
    }),

  suspenderVentaActual: (nota?: string) => {
    const { items, tipoAjuste, valorAjuste, totalMonto } = get()
    if (items.length === 0) return false

    const nuevaVentaEspera: VentaEnEspera = {
      id: uuidv4(),
      fecha: new Date().toISOString(),
      nota: nota?.trim() || `Venta #${get().ventasEnEspera.length + 1}`,
      items: [...items],
      tipoAjuste,
      valorAjuste,
      total: totalMonto(),
    }

    const actualizadas = [nuevaVentaEspera, ...get().ventasEnEspera]
    guardarVentasEnEspera(actualizadas)

    set({
      items: [],
      tipoAjuste: 'NINGUNO',
      valorAjuste: 0,
      ventasEnEspera: actualizadas,
    })

    return true
  },

  recuperarVenta: (id: string) => {
    const venta = get().ventasEnEspera.find((v) => v.id === id)
    if (!venta) return

    const restantes = get().ventasEnEspera.filter((v) => v.id !== id)
    guardarVentasEnEspera(restantes)

    set({
      items: venta.items,
      tipoAjuste: venta.tipoAjuste,
      valorAjuste: venta.valorAjuste,
      ventasEnEspera: restantes,
    })
  },

  eliminarVentaEnEspera: (id: string) => {
    const restantes = get().ventasEnEspera.filter((v) => v.id !== id)
    guardarVentasEnEspera(restantes)
    set({ ventasEnEspera: restantes })
  },

  totalItems: () => get().items.reduce((sum, item) => sum + item.cantidad, 0),

  subtotalMonto: () => Math.round(get().items.reduce((sum, item) => sum + item.subtotal, 0)),

  montoAjuste: () => {
    const { tipoAjuste, valorAjuste } = get()
    const subtotal = get().subtotalMonto()

    if (tipoAjuste === 'DESCUENTO_PORCENTAJE') {
      return Math.round((subtotal * valorAjuste) / 100)
    }
    if (tipoAjuste === 'DESCUENTO_FIJO') {
      return Math.round(Math.min(valorAjuste, subtotal))
    }
    if (tipoAjuste === 'RECARGO_PORCENTAJE') {
      return Math.round((subtotal * valorAjuste) / 100)
    }
    if (tipoAjuste === 'RECARGO_FIJO') {
      return Math.round(valorAjuste)
    }
    return 0
  },

  totalMonto: () => {
    const subtotal = get().subtotalMonto()
    const ajuste = get().montoAjuste()
    const { tipoAjuste } = get()

    if (tipoAjuste.startsWith('DESCUENTO')) {
      return Math.round(Math.max(0, subtotal - ajuste))
    }
    if (tipoAjuste.startsWith('RECARGO')) {
      return Math.round(subtotal + ajuste)
    }
    return Math.round(subtotal)
  },

  descripcionAjuste: () => {
    const { tipoAjuste, valorAjuste } = get()
    const monto = get().montoAjuste()
    if (tipoAjuste === 'DESCUENTO_PORCENTAJE') return `Descuento ${valorAjuste}% (-$${monto.toLocaleString('es-AR')})`
    if (tipoAjuste === 'DESCUENTO_FIJO') return `Descuento -$${monto.toLocaleString('es-AR')}`
    if (tipoAjuste === 'RECARGO_PORCENTAJE') return `Recargo ${valorAjuste}% (+$${monto.toLocaleString('es-AR')})`
    if (tipoAjuste === 'RECARGO_FIJO') return `Recargo +$${monto.toLocaleString('es-AR')}`
    return null
  },
}))
