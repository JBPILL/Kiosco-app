import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import toast from 'react-hot-toast'
import type { Producto, ItemCarrito } from '../types/database'
import { usePromocionStore } from './promocionStore'
import { useEnvasesStore } from './envasesStore'

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
  cerrarTab: (id: string, revertirEnvases?: boolean) => void
  renombrarTab: (id: string, nombre: string) => void

  // Ventas en espera
  ventasEnEspera: VentaEnEspera[]

  // Acciones de productos
  agregarProducto: (producto: Producto, cantidad?: number) => void
  agregarItemLibre: (descripcion: string, precio: number, cantidad?: number) => void
  quitarProducto: (productoId: string) => void
  actualizarCantidad: (productoId: string, cantidad: number) => void
  actualizarStockProductoEnCarrito: (productoId: string, nuevoStock: number) => void
  vaciarCarrito: (revertirEnvases?: boolean) => void
  completarVentaTabActiva: () => void
  toggleEnvaseItem: (productoId: string) => void
  agregarDevolucionEnvase: (nombreEnvase: string, precioUnitario: number, cantidad?: number, tipoEnvaseId?: string) => void

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

function calcularSubtotalItem(item: ItemCarrito): number {
  if (item.es_devolucion_envase) {
    return item.producto.precio_venta * item.cantidad
  }
  const base = Math.round(item.cantidad * item.producto.precio_venta)
  const extraEnvase = item.sin_envase
    ? Math.round(item.cantidad * (item.precio_envase_unitario || item.producto.precio_envase || 0))
    : 0
  const promo = item.descuento_promo || 0
  return Math.max(0, base + extraEnvase - promo)
}

function evaluarConPromociones(items: ItemCarrito[]): ItemCarrito[] {
  try {
    return usePromocionStore.getState().evaluarCarrito(items)
  } catch {
    return items
  }
}

function revertirStockEnvasesDeItems(items: ItemCarrito[]) {
  try {
    for (const it of items) {
      if (it.es_devolucion_envase && it.tipo_envase_id) {
        useEnvasesStore.getState().ajustarStockVacios(
          it.tipo_envase_id,
          -it.cantidad,
          'AJUSTE_MANUAL',
          undefined,
          undefined,
          `Cancelación recepción ticket (-${it.cantidad})`
        )
      }
    }
  } catch (err) {
    console.warn('Error al revertir stock de envases devueltos:', err)
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

    let autoNombre = nombre?.trim()
    if (!autoNombre) {
      // Buscar los números actualmente en uso en nombres estándar 'Ticket X'
      const usedNumbers = new Set<number>()
      tabsSync.forEach((t) => {
        const m = t.nombre.match(/^Ticket\s+(\d+)$/i)
        if (m) usedNumbers.add(parseInt(m[1], 10))
      })
      // Asignar el menor número entero positivo disponible (1, 2, 3...)
      let nextNum = 1
      while (usedNumbers.has(nextNum)) {
        nextNum++
      }
      autoNombre = `Ticket ${nextNum}`
    }

    const nuevoId = uuidv4()
    const nuevaTab: CarritoTab = {
      id: nuevoId,
      nombre: autoNombre,
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

  cerrarTab: (targetId: string, revertirEnvases = true) => {
    const state = get()
    if (revertirEnvases) {
      const tabCerrada = state.tabs.find((t) => t.id === targetId)
      if (tabCerrada) {
        const itemsTab = tabCerrada.id === state.tabActivaId ? state.items : tabCerrada.items
        revertirStockEnvasesDeItems(itemsTab)
      }
    }

    if (state.tabs.length <= 1) {
      get().vaciarCarrito(false)
      return
    }

    const tabsSync = state.tabs.map((t) =>
      t.id === state.tabActivaId
        ? { ...t, items: state.items, tipoAjuste: state.tipoAjuste, valorAjuste: state.valorAjuste }
        : t
    )

    const restantes = tabsSync.filter((t) => t.id !== targetId)
    // Renumerar secuencialmente las pestañas con nombre por defecto 'Ticket X' para reiniciar el contador
    let ticketCounter = 1
    const renumbered = restantes.map((tab) => {
      if (/^Ticket\s+\d+$/i.test(tab.nombre.trim())) {
        const nuevo = { ...tab, nombre: `Ticket ${ticketCounter}` }
        ticketCounter++
        return nuevo
      }
      return tab
    })

    if (state.tabActivaId === targetId) {
      const siguiente = renumbered[0]
      set({
        tabs: renumbered,
        tabActivaId: siguiente.id,
        items: siguiente.items,
        tipoAjuste: siguiente.tipoAjuste,
        valorAjuste: siguiente.valorAjuste,
      })
    } else {
      set({ tabs: renumbered })
    }
  },

  completarVentaTabActiva: () => {
    const state = get()
    if (state.tabs.length > 1) {
      get().cerrarTab(state.tabActivaId, false)
    } else {
      get().vaciarCarrito(false)
      set((s) => ({
        tabs: s.tabs.map((t) => (/^Ticket\s+\d+$/i.test(t.nombre) ? { ...t, nombre: 'Ticket 1' } : t)),
      }))
    }
  },

  renombrarTab: (id: string, nombre: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, nombre: nombre.trim() || t.nombre } : t)),
    }))
  },

  agregarProducto: (producto: Producto, cantidad: number = 1) => {
    let cantAgregar = cantidad > 0 ? cantidad : 1
    const tieneStockLimitado = !producto.es_pesable && producto.stock_actual > 0 && producto.stock_actual !== 99999

    // Si el producto figura con stock 0 en sistema, emitir aviso pero permitir agregarlo
    if (producto.stock_actual <= 0) {
      toast(`Aviso: "${producto.descripcion}" figura con stock 0 (se registrará con stock negativo)`, {
        duration: 3500,
      })
    }

    // Si tiene stock limitado y ya no hay stock para sumar en el ticket actual
    const stateActual = get()
    const existenteActual = stateActual.items.find((item) => item.producto.id === producto.id)
    if (tieneStockLimitado && existenteActual && existenteActual.cantidad >= producto.stock_actual) {
      toast.error(
        `Stock máximo alcanzado: Ya tenés el total (${producto.stock_actual} u.) de "${producto.descripcion}" en el ticket.`,
        { id: `stock-max-${producto.id}`, duration: 3500 }
      )
      return
    }

    set((state) => {
      const existente = state.items.find((item) => item.producto.id === producto.id)
      let nuevosItems: ItemCarrito[] = []

      if (existente) {
        let nuevaCantidad = Number((existente.cantidad + cantAgregar).toFixed(3))
        if (tieneStockLimitado && nuevaCantidad > producto.stock_actual) {
          const restante = Math.max(0, producto.stock_actual - existente.cantidad)
          if (restante <= 0) {
            toast.error(
              `Stock máximo alcanzado: Ya tenés el total (${producto.stock_actual} u.) de "${producto.descripcion}" en el ticket.`,
              { id: `stock-max-${producto.id}`, duration: 3500 }
            )
            return state
          }
          toast.error(
            `Stock insuficiente: Solo podés sumar ${restante} u. más de "${producto.descripcion}" (Stock total: ${producto.stock_actual})`,
            { id: `stock-max-${producto.id}`, duration: 3500 }
          )
          nuevaCantidad = producto.stock_actual
        }

        nuevosItems = state.items.map((item) => {
          if (item.producto.id !== producto.id) return item
          const itemAct = { ...item, cantidad: nuevaCantidad }
          itemAct.subtotal = calcularSubtotalItem(itemAct)
          return itemAct
        })
      } else {
        if (tieneStockLimitado && cantAgregar > producto.stock_actual) {
          toast.error(
            `Stock insuficiente: Solo hay ${producto.stock_actual} u. de "${producto.descripcion}". Se cargó el máximo disponible.`,
            { id: `stock-max-${producto.id}`, duration: 3500 }
          )
          cantAgregar = producto.stock_actual
        }
        const cantRedondeada = Number(cantAgregar.toFixed(3))
        const nuevoItem: ItemCarrito = {
          producto,
          cantidad: cantRedondeada,
          subtotal: Math.round(cantRedondeada * producto.precio_venta),
          sin_envase: false,
          precio_envase_unitario: producto.precio_envase || 0,
        }
        nuevoItem.subtotal = calcularSubtotalItem(nuevoItem)
        nuevosItems = [
          ...state.items,
          nuevoItem,
        ]
      }

      return {
        items: evaluarConPromociones(nuevosItems),
      }
    })
  },

  toggleEnvaseItem: (productoId: string) => {
    set((state) => {
      const nuevos = state.items.map((it) => {
        if (it.producto.id !== productoId || !it.producto.es_retornable) return it
        const nuevoSinEnvase = !it.sin_envase
        const precioEnv = it.producto.precio_envase || it.precio_envase_unitario || 0
        const itemActualizado: ItemCarrito = {
          ...it,
          sin_envase: nuevoSinEnvase,
          precio_envase_unitario: precioEnv,
        }
        itemActualizado.subtotal = calcularSubtotalItem(itemActualizado)
        return itemActualizado
      })
      return { items: evaluarConPromociones(nuevos) }
    })
  },

  agregarDevolucionEnvase: (nombreEnvase: string, precioUnitario: number, cantidad = 1, tipoEnvaseId?: string) => {
    const cant = Math.max(1, Math.round(cantidad))
    const precio = Math.max(0, Math.round(precioUnitario))
    const desc = `Devolución ${nombreEnvase}`

    const productoDevolucion: Producto = {
      id: uuidv4(),
      kiosco_id: '',
      categoria_id: null,
      codigo_barras: null,
      descripcion: desc,
      precio_costo: precio,
      precio_venta: -precio,
      stock_actual: 99999,
      stock_minimo: 0,
      es_favorito: false,
      activo: false,
      fecha_creacion: new Date().toISOString(),
      fecha_actualizacion: new Date().toISOString(),
      es_retornable: true,
    }

    set((state) => {
      const nuevosItems: ItemCarrito[] = [
        ...state.items,
        {
          producto: productoDevolucion,
          cantidad: cant,
          subtotal: -(precio * cant),
          es_devolucion_envase: true,
          precio_envase_unitario: precio,
          tipo_envase_id: tipoEnvaseId,
        },
      ]
      return {
        items: evaluarConPromociones(nuevosItems),
      }
    })

    toast.success(`${desc} agregada al ticket (-$${(precio * cant).toLocaleString('es-AR')})`)
  },

  agregarItemLibre: (descripcion: string, precio: number, cantidad = 1) => {
    const desc = descripcion.trim() || 'Varios'
    const cant = Math.max(1, Math.round(cantidad))
    const precioUnitario = Math.max(0, Math.round(precio))

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
    const state = get()
    const itemTarget = state.items.find((it) => it.producto.id === productoId)
    if (itemTarget && itemTarget.es_devolucion_envase && itemTarget.tipo_envase_id) {
      revertirStockEnvasesDeItems([itemTarget])
    }

    set((s) => {
      const filtrados = s.items.filter((item) => item.producto.id !== productoId)
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
    let cantidadAjustada = itemTarget?.producto.es_pesable ? cantidad : Math.max(1, Math.round(cantidad))

    if (itemTarget && !itemTarget.producto.es_pesable && itemTarget.producto.stock_actual > 0 && itemTarget.producto.stock_actual !== 99999) {
      if (cantidadAjustada > itemTarget.producto.stock_actual) {
        toast.error(
          `Stock máximo alcanzado: No podés superar las ${itemTarget.producto.stock_actual} unidades disponibles de "${itemTarget.producto.descripcion}".`,
          { id: `stock-max-${productoId}`, duration: 3500 }
        )
        cantidadAjustada = itemTarget.producto.stock_actual
      }
    }

    const nuevos = state.items.map((item) => {
      if (item.producto.id !== productoId) return item
      const itemAct = { ...item, cantidad: cantidadAjustada }
      itemAct.subtotal = calcularSubtotalItem(itemAct)
      return itemAct
    })

    set({ items: evaluarConPromociones(nuevos) })
  },

  actualizarStockProductoEnCarrito: (productoId: string, nuevoStock: number) => {
    set((state) => {
      const tieneEnActivo = state.items.some((it) => it.producto.id === productoId)
      const nuevosItems = state.items.map((it) =>
        it.producto.id === productoId
          ? {
              ...it,
              producto: { ...it.producto, stock_actual: nuevoStock },
            }
          : it
      )

      const nuevasTabs = state.tabs.map((tab) => {
        const sourceItems = tab.id === state.tabActivaId ? nuevosItems : tab.items
        return {
          ...tab,
          items: sourceItems.map((it) =>
            it.producto.id === productoId
              ? {
                  ...it,
                  producto: { ...it.producto, stock_actual: nuevoStock },
                }
              : it
          ),
        }
      })

      if (nuevoStock <= 0 && tieneEnActivo) {
        const item = state.items.find((it) => it.producto.id === productoId)
        if (item) {
          toast(
            `Aviso: "${item.producto.descripcion}" se quedó sin stock disponible en otra terminal.`,
            { id: `stock-agotado-${productoId}`, icon: '⚠️', duration: 4000 }
          )
        }
      }

      return {
        items: nuevosItems,
        tabs: nuevasTabs,
      }
    })
  },

  vaciarCarrito: (revertirEnvases = true) => {
    const state = get()
    if (revertirEnvases) {
      revertirStockEnvasesDeItems(state.items)
    }
    set({
      items: [],
      tipoAjuste: 'NINGUNO',
      valorAjuste: 0,
      tabs: state.tabs.map((t) =>
        t.id === state.tabActivaId
          ? { ...t, items: [], tipoAjuste: 'NINGUNO', valorAjuste: 0 }
          : t
      ),
    })
  },

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
    const state = get()
    const { items, tipoAjuste, valorAjuste, totalMonto } = state
    if (items.length === 0) return false

    const nuevaVentaEspera: VentaEnEspera = {
      id: uuidv4(),
      fecha: new Date().toISOString(),
      nota: nota?.trim() || `Venta #${state.ventasEnEspera.length + 1}`,
      items: [...items],
      tipoAjuste,
      valorAjuste,
      total: totalMonto(),
    }

    const actualizadas = [nuevaVentaEspera, ...state.ventasEnEspera]
    guardarVentasEnEspera(actualizadas)

    set({
      items: [],
      tipoAjuste: 'NINGUNO',
      valorAjuste: 0,
      ventasEnEspera: actualizadas,
      tabs: state.tabs.map((t) =>
        t.id === state.tabActivaId
          ? { ...t, items: [], tipoAjuste: 'NINGUNO', valorAjuste: 0 }
          : t
      ),
    })

    return true
  },

  recuperarVenta: (id: string) => {
    const state = get()
    const venta = state.ventasEnEspera.find((v) => v.id === id)
    if (!venta) return

    const restantes = state.ventasEnEspera.filter((v) => v.id !== id)
    guardarVentasEnEspera(restantes)

    const itemsEvaluados = evaluarConPromociones(venta.items)

    // BUG-22: Si la tab actual ya tiene productos, abrir una nueva tab para no pisar la venta en curso
    if (state.items.length > 0) {
      const tabsSync = state.tabs.map((t) =>
        t.id === state.tabActivaId
          ? { ...t, items: state.items, tipoAjuste: state.tipoAjuste, valorAjuste: state.valorAjuste }
          : t
      )

      const nuevoId = uuidv4()
      const nuevaTab: CarritoTab = {
        id: nuevoId,
        nombre: venta.nota?.slice(0, 14) || 'Ticket Recuperado',
        items: itemsEvaluados,
        tipoAjuste: venta.tipoAjuste,
        valorAjuste: venta.valorAjuste,
      }

      set({
        tabs: [...tabsSync, nuevaTab],
        tabActivaId: nuevoId,
        items: itemsEvaluados,
        tipoAjuste: venta.tipoAjuste,
        valorAjuste: venta.valorAjuste,
        ventasEnEspera: restantes,
      })
      toast.success(`Venta recuperada en nueva pestaña ("${nuevaTab.nombre}")`)
    } else {
      // Si la tab activa está vacía, cargarla directamente aquí
      set({
        items: itemsEvaluados,
        tipoAjuste: venta.tipoAjuste,
        valorAjuste: venta.valorAjuste,
        ventasEnEspera: restantes,
        tabs: state.tabs.map((t) =>
          t.id === state.tabActivaId
            ? { ...t, items: itemsEvaluados, tipoAjuste: venta.tipoAjuste, valorAjuste: venta.valorAjuste }
            : t
        ),
      })
      toast.success('Venta en espera recuperada en el ticket actual')
    }
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

    // Base comercial para descuentos y recargos porcentuales: sólo mercadería real,
    // excluyendo los depósitos de envases retornables y devoluciones de envases.
    const baseMercaderia = Math.max(
      0,
      get().items.reduce((sum, item) => {
        if (item.es_devolucion_envase) return sum
        const extraEnvase = item.sin_envase
          ? Math.round(item.cantidad * (item.precio_envase_unitario || item.producto.precio_envase || 0))
          : 0
        return sum + Math.max(0, item.subtotal - extraEnvase)
      }, 0)
    )

    if (tipoAjuste === 'DESCUENTO_PORCENTAJE') {
      return Math.round((baseMercaderia * valorAjuste) / 100)
    }
    if (tipoAjuste === 'DESCUENTO_FIJO') {
      return Math.round(Math.max(0, Math.min(valorAjuste, subtotal)))
    }
    if (tipoAjuste === 'RECARGO_PORCENTAJE') {
      return Math.round((baseMercaderia * valorAjuste) / 100)
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

// Suscripción automática a eventos de actualización realtime para mantener sincronizado el stock en tickets sin vaciarlos
if (typeof window !== 'undefined') {
  window.addEventListener('kiosko-products-updated', ((e: CustomEvent) => {
    const prod = e.detail?.producto
    if (prod && typeof prod.stock_actual === 'number') {
      useCartStore.getState().actualizarStockProductoEnCarrito(prod.id, prod.stock_actual)
    }
  }) as EventListener)
}

