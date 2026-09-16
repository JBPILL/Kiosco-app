import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import type { Promocion, ItemCarrito } from '../types/database'
import toast from 'react-hot-toast'

interface PromocionState {
  promociones: Promocion[]
  cargando: boolean

  cargarPromociones: (kioscoId?: string) => Promise<void>
  crearPromocion: (promo: Omit<Promocion, 'id' | 'created_at' | 'producto' | 'categoria'>) => Promise<boolean>
  actualizarPromocion: (id: string, cambios: Partial<Promocion>) => Promise<boolean>
  eliminarPromocion: (id: string) => Promise<boolean>
  toggleActiva: (id: string) => Promise<boolean>
  evaluarCarrito: (items: ItemCarrito[]) => ItemCarrito[]
  totalAhorroPromociones: (items: ItemCarrito[]) => number
}

const STORAGE_KEY_PROMOS = 'kiosko_promociones'

function cargarPromocionesLocal(): Promocion[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROMOS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function guardarPromocionesLocal(promos: Promocion[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_PROMOS, JSON.stringify(promos))
  } catch (e) {
    console.error('Error guardando promociones local:', e)
  }
}

export function evaluarItemPromociones(
  item: ItemCarrito,
  promosActivas: Promocion[]
): { descuento: number; promoNombre?: string } {
  const subtotalBase = Math.round(item.cantidad * item.producto.precio_venta)
  if (subtotalBase <= 0) return { descuento: 0 }

  const hoyStr = new Date().toISOString().split('T')[0]
  const diaHoy = new Date().getDay() // 0=Domingo, 1=Lunes, ...

  // Filtrar promociones vigentes para este producto o categoría
  const aplicables = promosActivas.filter((p) => {
    if (!p.activo) return false
    if (p.fecha_inicio && hoyStr < p.fecha_inicio) return false
    if (p.fecha_fin && hoyStr > p.fecha_fin) return false
    if (p.dias_semana && p.dias_semana.length > 0 && !p.dias_semana.includes(diaHoy)) return false

    if (p.producto_id) {
      return p.producto_id === item.producto.id
    }
    if (p.categoria_id) {
      return p.categoria_id === item.producto.categoria_id
    }
    return false
  })

  if (aplicables.length === 0) return { descuento: 0 }

  let mejorDescuento = 0
  let mejorNombre: string | undefined

  for (const promo of aplicables) {
    let descuentoCalculado = 0
    let etiqueta = promo.nombre

    if (promo.tipo === 'NXM') {
      const min = Number(promo.cantidad_minima)
      const paga = Number(promo.cantidad_paga || 1)
      if (min > 1 && paga < min && item.cantidad >= min) {
        const packs = Math.floor(item.cantidad / min)
        const unidadesGratis = packs * (min - paga)
        descuentoCalculado = Math.round(unidadesGratis * item.producto.precio_venta)
        etiqueta = `${promo.nombre} (${unidadesGratis} gratis)`
      }
    } else if (promo.tipo === 'VOLUMEN') {
      const min = Number(promo.cantidad_minima)
      if (item.cantidad >= min) {
        if (promo.precio_unitario_promo !== null && promo.precio_unitario_promo !== undefined) {
          const ahorroUnit = Math.max(0, item.producto.precio_venta - promo.precio_unitario_promo)
          descuentoCalculado = Math.round(item.cantidad * ahorroUnit)
          etiqueta = `${promo.nombre} ($${promo.precio_unitario_promo.toLocaleString('es-AR')} c/u)`
        } else if (promo.descuento_porcentaje) {
          descuentoCalculado = Math.round((subtotalBase * promo.descuento_porcentaje) / 100)
          etiqueta = `${promo.nombre} (${promo.descuento_porcentaje}% OFF)`
        }
      }
    } else if (promo.tipo === 'PORCENTAJE') {
      if (promo.descuento_porcentaje && promo.descuento_porcentaje > 0) {
        descuentoCalculado = Math.round((subtotalBase * promo.descuento_porcentaje) / 100)
        etiqueta = `${promo.nombre} (${promo.descuento_porcentaje}% OFF)`
      }
    }

    if (descuentoCalculado > mejorDescuento) {
      mejorDescuento = descuentoCalculado
      mejorNombre = etiqueta
    }
  }

  return {
    descuento: Math.min(mejorDescuento, subtotalBase),
    promoNombre: mejorNombre,
  }
}

export const usePromocionStore = create<PromocionState>((set, get) => ({
  promociones: cargarPromocionesLocal(),
  cargando: false,

  cargarPromociones: async (kioscoId?: string) => {
    set({ cargando: true })
    try {
      if (!kioscoId) {
        set({ cargando: false })
        return
      }

      const { data, error } = await supabase
        .from('promociones')
        .select(`
          *,
          producto:productos(id, descripcion, precio_venta, categoria_id),
          categoria:categorias(id, nombre)
        `)
        .eq('kiosco_id', kioscoId)
        .order('created_at', { ascending: false })

      if (error) {
        console.warn('Error cargando promociones de Supabase (usando local):', error.message)
      } else if (data) {
        set({ promociones: data })
        guardarPromocionesLocal(data)
      }
    } catch (e) {
      console.warn('Fallo de red cargando promociones (modo offline):', e)
    } finally {
      set({ cargando: false })
    }
  },

  crearPromocion: async (promoData) => {
    const nuevaPromo: Promocion = {
      ...promoData,
      id: uuidv4(),
      created_at: new Date().toISOString(),
    }

    // Actualizar estado local inmediatamente
    const actualizadas = [nuevaPromo, ...get().promociones]
    set({ promociones: actualizadas })
    guardarPromocionesLocal(actualizadas)

    try {
      const { error } = await supabase.from('promociones').insert({
        id: nuevaPromo.id,
        kiosco_id: nuevaPromo.kiosco_id,
        nombre: nuevaPromo.nombre,
        tipo: nuevaPromo.tipo,
        producto_id: nuevaPromo.producto_id || null,
        categoria_id: nuevaPromo.categoria_id || null,
        cantidad_minima: nuevaPromo.cantidad_minima,
        cantidad_paga: nuevaPromo.cantidad_paga || null,
        precio_unitario_promo: nuevaPromo.precio_unitario_promo || null,
        descuento_porcentaje: nuevaPromo.descuento_porcentaje || null,
        dias_semana: nuevaPromo.dias_semana || null,
        fecha_inicio: nuevaPromo.fecha_inicio || null,
        fecha_fin: nuevaPromo.fecha_fin || null,
        activo: nuevaPromo.activo,
      })

      if (error) throw error
      toast.success('Promoción creada exitosamente')
      return true
    } catch (err: any) {
      console.error('Error guardando promocion en Supabase:', err)
      toast.success('Promoción guardada localmente (modo offline)')
      return true
    }
  },

  actualizarPromocion: async (id: string, cambios: Partial<Promocion>) => {
    const actualizadas = get().promociones.map((p) => (p.id === id ? { ...p, ...cambios } : p))
    set({ promociones: actualizadas })
    guardarPromocionesLocal(actualizadas)

    try {
      const { error } = await supabase
        .from('promociones')
        .update({
          nombre: cambios.nombre,
          tipo: cambios.tipo,
          producto_id: cambios.producto_id,
          categoria_id: cambios.categoria_id,
          cantidad_minima: cambios.cantidad_minima,
          cantidad_paga: cambios.cantidad_paga,
          precio_unitario_promo: cambios.precio_unitario_promo,
          descuento_porcentaje: cambios.descuento_porcentaje,
          dias_semana: cambios.dias_semana,
          fecha_inicio: cambios.fecha_inicio,
          fecha_fin: cambios.fecha_fin,
          activo: cambios.activo,
        })
        .eq('id', id)

      if (error) throw error
      toast.success('Promoción actualizada')
      return true
    } catch (err: any) {
      console.error('Error actualizando promoción en Supabase:', err)
      toast.success('Cambios guardados localmente')
      return true
    }
  },

  eliminarPromocion: async (id: string) => {
    const actualizadas = get().promociones.filter((p) => p.id !== id)
    set({ promociones: actualizadas })
    guardarPromocionesLocal(actualizadas)

    try {
      const { error } = await supabase.from('promociones').delete().eq('id', id)
      if (error) throw error
      toast.success('Promoción eliminada')
      return true
    } catch (err: any) {
      console.error('Error eliminando promoción en Supabase:', err)
      toast.success('Promoción eliminada localmente')
      return true
    }
  },

  toggleActiva: async (id: string) => {
    const promo = get().promociones.find((p) => p.id === id)
    if (!promo) return false
    const nuevoEstado = !promo.activo
    return get().actualizarPromocion(id, { activo: nuevoEstado })
  },

  evaluarCarrito: (items: ItemCarrito[]) => {
    const promosActivas = get().promociones.filter((p) => p.activo)
    if (promosActivas.length === 0) {
      return items.map((it) => {
        const subtotalOrig = Math.round(it.cantidad * it.producto.precio_venta)
        return {
          ...it,
          subtotal: subtotalOrig,
          descuento_promo: 0,
          promo_nombre: undefined,
        }
      })
    }

    return items.map((item) => {
      const subtotalOrig = Math.round(item.cantidad * item.producto.precio_venta)
      const { descuento, promoNombre } = evaluarItemPromociones(item, promosActivas)
      return {
        ...item,
        descuento_promo: descuento,
        promo_nombre: promoNombre,
        subtotal: Math.max(0, subtotalOrig - descuento),
      }
    })
  },

  totalAhorroPromociones: (items: ItemCarrito[]) => {
    return items.reduce((acc, it) => acc + (it.descuento_promo || 0), 0)
  },
}))
