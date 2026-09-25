import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import { useLoteStore } from './loteStore'
import { getCachedProductos, saveCachedProductos } from '../lib/utils'
import type { ItemCombo, Producto } from '../types/database'
import toast from 'react-hot-toast'

interface ComboState {
  itemsCombo: ItemCombo[]
  cargando: boolean

  cargarCombos: (kioscoId?: string) => Promise<void>
  obtenerComponentesDeCombo: (comboProductoId: string) => ItemCombo[]
  guardarComponentes: (
    comboProductoId: string,
    componentes: { componente_producto_id: string; cantidad: number }[],
    kioscoId: string
  ) => Promise<boolean>
  calcularStockCombo: (comboProductoId: string, todosLosProductos: Producto[]) => number
  calcularCostoSugerido: (
    componentes: { componente_producto_id: string; cantidad: number }[],
    todosLosProductos: Producto[]
  ) => { costoTotal: number; ventaSumada: number }
  descontarStockComponentesCombo: (
    comboProductoId: string,
    cantidadVendida: number,
    kioscoId: string,
    usuarioId?: string | null,
    ventaIdRef?: string,
    fechaVenta?: string
  ) => Promise<void>
}

const getStorageKey = (kioscoId?: string) => `kiosko_combos_${kioscoId || 'default'}`

export const useComboStore = create<ComboState>((set, get) => ({
  itemsCombo: [],
  cargando: false,

  cargarCombos: async (kioscoId?: string) => {
    const key = getStorageKey(kioscoId)
    // 1. Cargar caché local inmediato (offline-first)
    try {
      const cached = localStorage.getItem(key)
      if (cached) {
        set({ itemsCombo: JSON.parse(cached) })
      }
    } catch (e) {
      console.warn('Error leyendo combos desde caché local:', e)
    }

    // 2. Traer desde Supabase si hay kiosco_id
    if (!kioscoId) return

    set({ cargando: true })
    try {
      const { data, error } = await supabase
        .from('combo_items')
        .select('*, componente:productos!combo_items_componente_producto_id_fkey(*)')
        .eq('kiosco_id', kioscoId)

      if (error) {
        // Si la tabla aún no existe o da error de foreign key fallback a select simple
        const simpleQuery = await supabase
          .from('combo_items')
          .select('*')
          .eq('kiosco_id', kioscoId)
        
        if (!simpleQuery.error && simpleQuery.data) {
          set({ itemsCombo: simpleQuery.data as ItemCombo[], cargando: false })
          localStorage.setItem(key, JSON.stringify(simpleQuery.data))
          return
        }
        console.warn('Error consultando combo_items en Supabase:', error.message)
      } else if (data) {
        set({ itemsCombo: data as ItemCombo[], cargando: false })
        localStorage.setItem(key, JSON.stringify(data))
      }
    } catch (err) {
      console.warn('Fallo de red al sincronizar combos:', err)
    } finally {
      set({ cargando: false })
    }
  },

  obtenerComponentesDeCombo: (comboProductoId: string) => {
    return get().itemsCombo.filter((item) => item.combo_producto_id === comboProductoId)
  },

  guardarComponentes: async (
    comboProductoId: string,
    componentes: { componente_producto_id: string; cantidad: number }[],
    kioscoId: string
  ) => {
    const key = getStorageKey(kioscoId)
    const nuevosItems: ItemCombo[] = componentes.map((c) => ({
      id: uuidv4(),
      kiosco_id: kioscoId,
      combo_producto_id: comboProductoId,
      componente_producto_id: c.componente_producto_id,
      cantidad: c.cantidad,
    }))

    // 1. Actualización optimista local
    const otrosItems = get().itemsCombo.filter((i) => i.combo_producto_id !== comboProductoId)
    const listaCompleta = [...otrosItems, ...nuevosItems]
    set({ itemsCombo: listaCompleta })

    try {
      localStorage.setItem(key, JSON.stringify(listaCompleta))
    } catch (e) {
      console.warn('Error guardando combos en localStorage:', e)
    }

    // 2. Persistencia en Supabase
    try {
      // Eliminar los anteriores de este combo
      await supabase.from('combo_items').delete().eq('combo_producto_id', comboProductoId)

      if (nuevosItems.length > 0) {
        const payload = nuevosItems.map((item) => ({
          id: item.id,
          kiosco_id: item.kiosco_id,
          combo_producto_id: item.combo_producto_id,
          componente_producto_id: item.componente_producto_id,
          cantidad: item.cantidad,
        }))

        const { error } = await supabase.from('combo_items').insert(payload)
        if (error) {
          console.warn('Error insertando en Supabase combo_items:', error.message)
        }
      }

      // Marcar producto como es_combo: true
      await supabase
        .from('productos')
        .update({ es_combo: true, fecha_actualizacion: new Date().toISOString() })
        .eq('id', comboProductoId)

      toast.success('Componentes del combo guardados correctamente')
      return true
    } catch (e: any) {
      console.warn('Error persistiendo combo en Supabase:', e)
      // BUG-05: No emitir toast.success cuando Supabase falla — el usuario debe saber que
      // el guardado fue solo local y puede perderse si se limpia la caché del navegador.
      toast('Componentes guardados localmente (sin conexión al servidor — sincronizá cuando vuelva internet)', {
        icon: '⚠️',
        duration: 5000,
      })
      return true
    }
  },

  calcularStockCombo: (comboProductoId: string, todosLosProductos: Producto[]): number => {
    const componentes = get().itemsCombo.filter((item) => item.combo_producto_id === comboProductoId)
    if (componentes.length === 0) return 0

    const productosMap = new Map(todosLosProductos.map((p) => [p.id, p]))

    let stockMaximo = Infinity
    for (const comp of componentes) {
      const prod = productosMap.get(comp.componente_producto_id)
      if (!prod || prod.stock_actual <= 0 || comp.cantidad <= 0) {
        return 0
      }
      const disponibles = Math.floor(prod.stock_actual / comp.cantidad)
      if (disponibles < stockMaximo) {
        stockMaximo = disponibles
      }
    }

    return stockMaximo === Infinity ? 0 : stockMaximo
  },

  calcularCostoSugerido: (
    componentes: { componente_producto_id: string; cantidad: number }[],
    todosLosProductos: Producto[]
  ) => {
    const productosMap = new Map(todosLosProductos.map((p) => [p.id, p]))
    let costoTotal = 0
    let ventaSumada = 0

    for (const comp of componentes) {
      const prod = productosMap.get(comp.componente_producto_id)
      if (prod) {
        costoTotal += (prod.precio_costo || 0) * comp.cantidad
        ventaSumada += (prod.precio_venta || 0) * comp.cantidad
      }
    }

    return { costoTotal, ventaSumada }
  },

  descontarStockComponentesCombo: async (
    comboProductoId: string,
    cantidadVendida: number,
    kioscoId: string,
    usuarioId?: string | null,
    ventaIdRef?: string,
    fechaVenta?: string  // BUG-04: fecha original de la venta para consistencia en historial
  ) => {
    const componentes = get().itemsCombo.filter((item) => item.combo_producto_id === comboProductoId)
    if (componentes.length === 0) return

    const ahora = new Date().toISOString()
    const fechaMovimiento = fechaVenta || ahora  // BUG-04: usar fecha original de la venta si existe
    const descVenta = ventaIdRef ? `#${ventaIdRef.slice(0, 8).toUpperCase()}` : ''

    // Deducción por cada componente que integra el combo
    for (const comp of componentes) {
      const totalADescontar = comp.cantidad * cantidadVendida

      try {
        // 1. Obtener stock actual del producto componente
        const { data: prodData } = await supabase
          .from('productos')
          .select('id, stock_actual, descripcion')
          .eq('id', comp.componente_producto_id)
          .single()

        if (prodData) {
          const nuevoStock = Number(((prodData.stock_actual || 0) - totalADescontar).toFixed(3))

          // 2. Actualizar stock en productos
          await supabase
            .from('productos')
            .update({ stock_actual: nuevoStock, fecha_actualizacion: ahora })
            .eq('id', prodData.id)

          // 3. Asentar movimiento de stock con la fecha original de la venta (BUG-04)
          await supabase.from('movimientos_stock').insert({
            kiosco_id: kioscoId,
            producto_id: prodData.id,
            tipo: 'EGRESO',
            cantidad: -totalADescontar,
            motivo: 'VENTA',
            notas: `Venta Combo ${descVenta} (${comp.cantidad} un/combo)`,
            usuario_id: usuarioId || null,
            fecha: fechaMovimiento,
          })

          // 4. Descontar lote por regla FEFO si el componente tiene lotes perecederos
          try {
            await useLoteStore.getState().descontarStockFEFO(prodData.id, totalADescontar)
          } catch (eLote) {
            console.warn(`FEFO lote deduction error en combo para ${prodData.descripcion}:`, eLote)
          }
        }
      } catch (errComp) {
        console.warn('Error al descontar componente de combo:', errComp)
      }
    }

    // Actualizar de forma inmediata en la caché local de productos asegurando coherencia multi-inquilino
    try {
      const cachedProds: Producto[] = getCachedProductos(kioscoId)
      if (cachedProds && cachedProds.length > 0) {
        const deducMap = new Map(componentes.map((c) => [c.componente_producto_id, c.cantidad * cantidadVendida]))

        const actualizados = cachedProds.map((p) => {
          const qty = deducMap.get(p.id)
          if (qty !== undefined) {
            return { ...p, stock_actual: Number(((p.stock_actual || 0) - qty).toFixed(3)) }
          }
          return p
        })

        saveCachedProductos(actualizados, kioscoId)
      }
    } catch (eCache) {
      console.warn('Error actualizando caché local tras venta de combo:', eCache)
    }
  },
}))
