import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import { getFechaLocal } from '../lib/utils'
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

function cargarPromocionesLocal(kioscoId?: string): Promocion[] {
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

function calcularSubtotalBaseItem(item: ItemCarrito): number {
  if (item.es_devolucion_envase) {
    return item.producto.precio_venta * item.cantidad
  }
  const base = Math.round(item.cantidad * item.producto.precio_venta)
  const extraEnvase = item.sin_envase
    ? Math.round(item.cantidad * (item.precio_envase_unitario || item.producto.precio_envase || 0))
    : 0
  return base + extraEnvase
}

export function evaluarItemPromociones(
  item: ItemCarrito,
  promosActivas: Promocion[]
): { descuento: number; promoNombre?: string } {
  const subtotalBase = Math.round(item.cantidad * item.producto.precio_venta)
  if (subtotalBase <= 0) return { descuento: 0 }

  const hoyStr = getFechaLocal()
  const diaHoy = new Date().getDay() // 0=Domingo, 1=Lunes, ...

  // Filtrar promociones vigentes para este producto o categoría
  const aplicables = promosActivas.filter((p) => {
    if (!p.activo) return false
    const inicioNorm = p.fecha_inicio ? p.fecha_inicio.slice(0, 10) : null
    const finNorm = p.fecha_fin ? p.fecha_fin.slice(0, 10) : null

    if (inicioNorm && hoyStr < inicioNorm) return false
    if (finNorm && hoyStr > finNorm) return false
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
    const nuevaPromo: Promocion = {
      ...promoData,
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
      toast.success('Promoción guardada localmente (modo offline)')
      return true
    }
  },

  actualizarPromocion: async (id: string, cambios: Partial<Promocion>) => {
    const promoExistente = get().promociones.find((p) => p.id === id)
    const kioscoId = promoExistente?.kiosco_id

    const actualizadas = get().promociones.map((p) => (p.id === id ? { ...p, ...cambios } : p))
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
        if (cambios[key] !== undefined) {
          payload[key] = cambios[key]
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
      toast.success('Cambios guardados localmente')
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
        const subtotalOrig = calcularSubtotalBaseItem(it)
        return {
          ...it,
          subtotal: subtotalOrig,
          descuento_promo: 0,
          promo_nombre: undefined,
        }
      })
    }

    const hoyStr = getFechaLocal()
    const diaHoy = new Date().getDay()

    // 1. Inicializar items con montos originales
    const resItems: ItemCarrito[] = items.map((it) => {
      const subtotalOrig = calcularSubtotalBaseItem(it)
      return {
        ...it,
        subtotal: subtotalOrig,
        descuento_promo: 0,
        promo_nombre: undefined,
      }
    })

    // 2. Evaluar COMBOS vigentes
    const comboPromos = promosActivas.filter((p) => {
      if (p.tipo !== 'COMBO') return false
      if (!p.items_combo || p.items_combo.length === 0) return false
      if (!p.precio_combo || p.precio_combo <= 0) return false
      if (p.fecha_inicio && hoyStr < p.fecha_inicio) return false
      if (p.fecha_fin && hoyStr > p.fecha_fin) return false
      if (p.dias_semana && p.dias_semana.length > 0 && !p.dias_semana.includes(diaHoy)) return false
      return true
    })

    // BUG-55: Rastrear unidades de productos ya consumidas por combos previos para no duplicar descuentos
    const cantUsadaEnCombo: Record<string, number> = {}

    for (const promo of comboPromos) {
      const itemsReq = promo.items_combo!
      // Verificar cuántas veces se cumple el combo completo con unidades disponibles
      let veces = Infinity
      for (const ic of itemsReq) {
        const cartIt = resItems.find((it) => it.producto.id === ic.producto_id)
        if (!cartIt || ic.cantidad <= 0) {
          veces = 0
          break
        }
        const cantLibre = Math.max(0, cartIt.cantidad - (cantUsadaEnCombo[ic.producto_id] || 0))
        const disponibles = Math.floor((cantLibre + 0.0001) / ic.cantidad)
        if (disponibles < veces) {
          veces = disponibles
        }
      }

      if (veces > 0 && isFinite(veces)) {
        // Registrar cantidades consumidas para este combo
        for (const ic of itemsReq) {
          cantUsadaEnCombo[ic.producto_id] = (cantUsadaEnCombo[ic.producto_id] || 0) + ic.cantidad * veces
        }

        // Calcular precio regular de 1 combo
        let regular1Combo = 0
        for (const ic of itemsReq) {
          const cartIt = resItems.find((it) => it.producto.id === ic.producto_id)!
          regular1Combo += ic.cantidad * cartIt.producto.precio_venta
        }

        const ahorro1Combo = Math.max(0, regular1Combo - (promo.precio_combo || 0))
        if (ahorro1Combo > 0 && regular1Combo > 0 && veces > 0) {
          const ahorroTotal = Math.round(ahorro1Combo * veces)
          let ahorroRestante = ahorroTotal
          const totalRegular = regular1Combo * veces

          itemsReq.forEach((ic, idx) => {
            const cartIt = resItems.find((it) => it.producto.id === ic.producto_id)!
            const esUltimo = idx === itemsReq.length - 1
            const itemSubtotal = ic.cantidad * cartIt.producto.precio_venta * veces
            const descItem = esUltimo
              ? ahorroRestante
              : Math.min(
                  ahorroRestante,
                  totalRegular > 0 ? Math.round((itemSubtotal / totalRegular) * ahorroTotal) : 0
                )

            ahorroRestante -= descItem
            cartIt.descuento_promo = (cartIt.descuento_promo || 0) + descItem
            cartIt.subtotal = Math.max(0, cartIt.subtotal - descItem)
            cartIt.promo_nombre = cartIt.promo_nombre
              ? `${cartIt.promo_nombre} + ${promo.nombre}`
              : `Combo: ${promo.nombre}`
          })
        }
      }
    }

    // 3. Para productos que NO recibieron descuento de combo, evaluar promociones individuales (NxM, Volumen, Porcentaje)
    const singlePromos = promosActivas.filter((p) => p.tipo !== 'COMBO')
    for (const item of resItems) {
      if (!item.descuento_promo || item.descuento_promo === 0) {
        const subtotalOrig = calcularSubtotalBaseItem(item)
        const { descuento, promoNombre } = evaluarItemPromociones(item, singlePromos)
        if (descuento > 0) {
          item.descuento_promo = descuento
          item.promo_nombre = promoNombre
          item.subtotal = Math.max(0, subtotalOrig - descuento)
        }
      }
    }

    return resItems
  },

  totalAhorroPromociones: (items: ItemCarrito[]) => {
    return items.reduce((acc, it) => acc + (it.descuento_promo || 0), 0)
  },
}))
