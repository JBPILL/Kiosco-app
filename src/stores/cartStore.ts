import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import toast from 'react-hot-toast'
import type { Producto, ItemCarrito } from '../types/database'
import { usePromocionStore } from './promocionStore'

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

export interface CarritoTab {
  id: string
  nombre: string
  items: ItemCarrito[]
  tipoAjuste: TipoAjuste
  valorAjuste: number
}

interface CartState {
  // Estado del carrito activo
  items: ItemCarrito[]
  tipoAjuste: TipoAjuste
  valorAjuste: number

  // Pestañas de tickets en simultáneo (estilo Odoo POS)
  tabs: CarritoTab[]
  tabActivaId: string
  crearNuevaTab: (nombre?: string) => string
  cambiarTab: (id: string) => void
  cerrarTab: (id: string) => void
  renombrarTab: (id: string, nombre: string) => void

  // Ventas en espera
  ventasEnEspera: VentaEnEspera[]

  // Acciones de productos
  agregarProducto: (producto: Producto, cantidad?: number) => void
  agregarItemLibre: (descripcion: string, precio: number, cantidad?: number) => void
  quitarProducto: (productoId: string) => void
  actualizarCantidad: (productoId: string, cantidad: number) => void
  vaciarCarrito: () => void

  // Acciones de descuentos y recargos
  aplicarAjuste: (tipo: TipoAjuste, valor: number) => void
  quitarAjuste: () => void

  // Promociones automáticas
  recalcularPromociones: () => void
  totalAhorroPromociones: () => number

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

function evaluarConPromociones(items: ItemCarrito[]): ItemCarrito[] {
  try {
    return usePromocionStore.getState().evaluarCarrito(items)
  } catch {
    return items
  }
}

const TAB_INICIAL_ID = uuidv4()
const TAB_INICIAL: CarritoTab = {
  id: TAB_INICIAL_ID,
  nombre: 'Ticket 1',
  items: [],
  tipoAjuste: 'NINGUNO',
  valorAjuste: 0,
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  tipoAjuste: 'NINGUNO',
  valorAjuste: 0,
  tabs: [TAB_INICIAL],
  tabActivaId: TAB_INICIAL_ID,
  ventasEnEspera: cargarVentasEnEspera(),

  crearNuevaTab: (nombre?: string) => {
    const state = get()
    const tabsSync = state.tabs.map((t) =>
      t.id === state.tabActivaId
        ? { ...t, items: state.items, tipoAjuste: state.tipoAjuste, valorAjuste: state.valorAjuste }
        : t
    )
    const nuevoId = uuidv4()
    const nuevaTab: CarritoTab = {
      id: nuevoId,
      nombre: nombre?.trim() || `Ticket ${state.tabs.length + 1}`,
      items: [],
      tipoAjuste: 'NINGUNO',
      valorAjuste: 0,
    }
    set({
      tabs: [...tabsSync, nuevaTab],
      tabActivaId: nuevoId,
      items: [],
      tipoAjuste: 'NINGUNO',
      valorAjuste: 0,
    })
    return nuevoId
  },

  cambiarTab: (targetId: string) => {
    const state = get()
    if (state.tabActivaId === targetId) return
    const target = state.tabs.find((t) => t.id === targetId)
    if (!target) return

    const tabsSync = state.tabs.map((t) =>
      t.id === state.tabActivaId
        ? { ...t, items: state.items, tipoAjuste: state.tipoAjuste, valorAjuste: state.valorAjuste }
        : t
    )

    set({
      tabs: tabsSync,
      tabActivaId: targetId,
      items: target.items,
      tipoAjuste: target.tipoAjuste,
      valorAjuste: target.valorAjuste,
    })
  },

  cerrarTab: (targetId: string) => {
    const state = get()
    if (state.tabs.length <= 1) {
      get().vaciarCarrito()
      return
    }

    const restantes = state.tabs.filter((t) => t.id !== targetId)
    if (state.tabActivaId === targetId) {
      const siguiente = restantes[0]
      set({
        tabs: restantes,
        tabActivaId: siguiente.id,
        items: siguiente.items,
        tipoAjuste: siguiente.tipoAjuste,
        valorAjuste: siguiente.valorAjuste,
      })
    } else {
      set({ tabs: restantes })
    }
  },

  renombrarTab: (id: string, nombre: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, nombre: nombre.trim() || t.nombre } : t)),
    }))
  },

  agregarProducto: (producto: Producto, cantidad: number = 1) => {
    const cantAgregar = cantidad > 0 ? cantidad : 1
    // Si el producto figura con stock 0 en sistema, emitir aviso pero permitir agregarlo
    if (producto.stock_actual <= 0) {
      toast(`Aviso: "${producto.descripcion}" figura con stock 0 (se registrará con stock negativo)`, {
        duration: 3500,
      })
    }

    set((state) => {
      const existente = state.items.find((item) => item.producto.id === producto.id)
      let nuevosItems: ItemCarrito[] = []

      if (existente) {
        const nuevaCantidad = Number((existente.cantidad + cantAgregar).toFixed(3))
        if (producto.stock_actual > 0 && nuevaCantidad > producto.stock_actual) {
          toast(
            `Aviso: Superando stock disponible de "${producto.descripcion}" (${producto.stock_actual} en sistema)`,
            { duration: 3000 }
          )
        }

        nuevosItems = state.items.map((item) =>
          item.producto.id === producto.id
            ? {
                ...item,
                cantidad: nuevaCantidad,
                subtotal: Math.round(nuevaCantidad * item.producto.precio_venta),
              }
            : item
        )
      } else {
        const cantRedondeada = Number(cantAgregar.toFixed(3))
        nuevosItems = [
          ...state.items,
          {
            producto,
            cantidad: cantRedondeada,
            subtotal: Math.round(cantRedondeada * producto.precio_venta),
          },
        ]
      }

      return {
        items: evaluarConPromociones(nuevosItems),
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

    set((state) => {
      const nuevosItems = [
        ...state.items,
        {
          producto: productoLibre,
          cantidad: cant,
          subtotal: precioUnitario * cant,
        },
      ]
      return {
        items: evaluarConPromociones(nuevosItems),
      }
    })

    toast.success(`"${desc}" agregado al ticket`)
  },

  quitarProducto: (productoId: string) => {
    set((state) => {
      const filtrados = state.items.filter((item) => item.producto.id !== productoId)
      return {
        items: evaluarConPromociones(filtrados),
      }
    })
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

    const nuevos = state.items.map((item) =>
      item.producto.id === productoId
        ? {
            ...item,
            cantidad: cantidadAjustada,
            subtotal: Math.round(cantidadAjustada * item.producto.precio_venta),
          }
        : item
    )

    set({ items: evaluarConPromociones(nuevos) })
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

  recalcularPromociones: () =>
    set((state) => ({
      items: evaluarConPromociones(state.items),
    })),

  totalAhorroPromociones: () =>
    get().items.reduce((acc, it) => acc + (it.descuento_promo || 0), 0),

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
      items: evaluarConPromociones(venta.items),
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

  totalItems: () =>
    get().items.reduce(
      (sum, item) => sum + (item.producto.es_pesable ? 1 : Math.round(item.cantidad)),
      0
    ),

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
