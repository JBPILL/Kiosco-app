import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import { evaluarCarritoPromociones } from '../lib/promocionesEngine'
export { evaluarItemPromociones } from '../lib/promocionesEngine'
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

function getPromosStorageKey(kioscoId?: string): string {
  return `kiosko_promociones_${kioscoId || 'default'}`
}

export function cargarPromocionesLocal(kioscoId?: string): Promocion[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(getPromosStorageKey(kioscoId))
    if (!raw && (!kioscoId || kioscoId === 'default')) {
      const fallback = localStorage.getItem('kiosko_promociones')
      return fallback ? JSON.parse(fallback) : []
    }
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function guardarPromocionesLocal(promos: Promocion[], kioscoId?: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(getPromosStorageKey(kioscoId), JSON.stringify(promos))
  } catch (e) {
    console.error('Error guardando promociones local:', e)
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

      const cached = cargarPromocionesLocal(kioscoId)
      if (cached && cached.length > 0) {
        set({ promociones: cached })
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
        .limit(5000)

      if (error) {
        console.warn('Error cargando promociones de Supabase (usando local):', error.message)
      } else if (data) {
        set({ promociones: data })
        guardarPromocionesLocal(data, kioscoId)
      }
    } catch (e) {
      console.warn('Fallo de red cargando promociones (modo offline):', e)
    } finally {
      set({ cargando: false })
    }
  },

  crearPromocion: async (promoData) => {
    let cantPaga = promoData.cantidad_paga
    if (promoData.tipo === 'NXM') {
      const min = Math.max(2, Number(promoData.cantidad_minima || 2))
      cantPaga = Math.max(1, Math.min(Number(promoData.cantidad_paga) || 1, min - 1))
    }

    const nuevaPromo: Promocion = {
      ...promoData,
      cantidad_paga: cantPaga,
      id: uuidv4(),
      created_at: new Date().toISOString(),
    }

    // Actualizar estado local inmediatamente
    const actualizadas = [nuevaPromo, ...get().promociones]
    set({ promociones: actualizadas })
    guardarPromocionesLocal(actualizadas, nuevaPromo.kiosco_id)

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
        precio_combo: nuevaPromo.precio_combo || null,
        items_combo: nuevaPromo.items_combo || null,
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
      toast('⚠️ Promoción guardada localmente (sin conexión). Se sincronizará cuando haya internet.', { icon: '📶', duration: 4000 })
      return true
    }
  },

  actualizarPromocion: async (id: string, cambios: Partial<Promocion>) => {
    const promoExistente = get().promociones.find((p) => p.id === id)
    const kioscoId = promoExistente?.kiosco_id

    const cambiosNormalizados = { ...cambios }
    if (cambios.tipo === 'NXM' || (!cambios.tipo && promoExistente?.tipo === 'NXM')) {
      const min = Math.max(2, Number(cambios.cantidad_minima ?? promoExistente?.cantidad_minima ?? 2))
      if (cambios.cantidad_paga !== undefined && cambios.cantidad_paga !== null) {
        cambiosNormalizados.cantidad_paga = Math.max(1, Math.min(Number(cambios.cantidad_paga) || 1, min - 1))
      }
    }

    const actualizadas = get().promociones.map((p) => (p.id === id ? { ...p, ...cambiosNormalizados } : p))
    set({ promociones: actualizadas })
    guardarPromocionesLocal(actualizadas, kioscoId)

    try {
      const payload: Record<string, any> = {}
      const allowedKeys: (keyof Promocion)[] = [
        'nombre',
        'tipo',
        'producto_id',
        'categoria_id',
        'cantidad_minima',
        'cantidad_paga',
        'precio_unitario_promo',
        'descuento_porcentaje',
        'precio_combo',
        'items_combo',
        'dias_semana',
        'fecha_inicio',
        'fecha_fin',
        'activo',
      ]

      for (const key of allowedKeys) {
        if (cambiosNormalizados[key] !== undefined) {
          payload[key] = cambiosNormalizados[key]
        }
      }

      const { error } = await supabase
        .from('promociones')
        .update(payload)
        .eq('id', id)

      if (error) throw error
      toast.success('Promoción actualizada')
      return true
    } catch (err: any) {
      console.error('Error actualizando promoción en Supabase:', err)
      toast('⚠️ Cambios guardados localmente (sin conexión). Se sincronizará cuando haya internet.', { icon: '📶', duration: 4000 })
      return true
    }
  },

  eliminarPromocion: async (id: string) => {
    const promoExistente = get().promociones.find((p) => p.id === id)
    const kioscoId = promoExistente?.kiosco_id

    const actualizadas = get().promociones.filter((p) => p.id !== id)
    set({ promociones: actualizadas })
    guardarPromocionesLocal(actualizadas, kioscoId)

    try {
      const { error } = await supabase.from('promociones').delete().eq('id', id)
      if (error) throw error
      toast.success('Promoción eliminada')
      return true
    } catch (err: any) {
      console.error('Error eliminando promoción en Supabase:', err)
      toast('⚠️ Promoción eliminada localmente (sin conexión). Se sincronizará cuando haya internet.', { icon: '📶', duration: 4000 })
      return true
    }
  },

  toggleActiva: async (id: string) => {
    const promo = get().promociones.find((p) => p.id === id)
    if (!promo) return false
    const nuevoEstado = !promo.activo
    return get().actualizarPromocion(id, { activo: nuevoEstado })
  },

  evaluarCarrito: (items: ItemCarrito[]) => evaluarCarritoPromociones(items, get().promociones),

  totalAhorroPromociones: (items: ItemCarrito[]) => {
    return items.reduce((acc, it) => acc + (it.descuento_promo || 0), 0)
  },
}))
