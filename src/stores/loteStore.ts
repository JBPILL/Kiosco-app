import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import type { LoteProducto } from '../types/database'

interface LoteState {
  lotes: LoteProducto[]
  cargando: boolean

  cargarLotes: (kioscoId?: string) => Promise<void>
  crearLote: (datos: {
    kiosco_id: string
    producto_id: string
    numero_lote?: string | null
    fecha_vencimiento: string
    cantidad: number
  }) => Promise<LoteProducto>
  descontarStockFEFO: (
    productoId: string,
    cantidad: number
  ) => Promise<{ loteId: string; cantidadDescontada: number; fechaVencimiento: string; stockFaltante?: number }[]>
  restituirStockLote: (
    productoId: string,
    cantidad: number,
    kioscoId?: string | null
  ) => Promise<boolean>
  darDeBajaLote: (loteId: string) => Promise<LoteProducto | null>
  obtenerLotesDeProducto: (productoId: string) => LoteProducto[]
  obtenerAlertas: (diasVentana?: number) => {
    vencidos: LoteProducto[]
    criticos: LoteProducto[]
    proximos: LoteProducto[]
    vigentes: LoteProducto[]
  }
}

const STORAGE_PREFIX = 'kiosko_lotes_'

function obtenerStorageKey(kioscoId?: string): string {
  return `${STORAGE_PREFIX}${kioscoId || 'default'}`
}

function leerLotesLocales(kioscoId?: string): LoteProducto[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(obtenerStorageKey(kioscoId))
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    console.warn('Error leyendo lotes locales:', e)
    return []
  }
}

function guardarLotesLocales(lotes: LoteProducto[], kioscoId?: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(obtenerStorageKey(kioscoId), JSON.stringify(lotes))
  } catch (e) {
    console.warn('Error guardando lotes locales:', e)
  }
}

export function calcularDiasHastaVencimiento(fechaVencimiento: string): number {
  if (!fechaVencimiento) return 999
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const partes = fechaVencimiento.split('-')
  if (partes.length < 3) return 999
  const vto = new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10))
  const diffTime = vto.getTime() - hoy.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

export const useLoteStore = create<LoteState>((set, get) => ({
  lotes: [],
  cargando: false,

  cargarLotes: async (kioscoId?: string) => {
    set({ cargando: true })

    // 1. Cargar primero de caché local (Cache-First para operación offline instantánea)
    const locales = leerLotesLocales(kioscoId)
    set({ lotes: locales, cargando: false })

    // 2. Si hay conexión y kioscoId, intentar sincronizar con Supabase
    if (kioscoId && navigator.onLine) {
      try {
        const { data, error } = await supabase
          .from('lotes_producto')
          .select('*')
          .eq('kiosco_id', kioscoId)
          .eq('activo', true)
          .order('fecha_vencimiento', { ascending: true })

        if (!error && data) {
          set({ lotes: data })
          guardarLotesLocales(data, kioscoId)
        }
      } catch (e) {
        // En caso de que la tabla aún no exista en Supabase o falle la red, operamos con local
        console.warn('Sincronización remota de lotes pospuesta (modo local activo):', e)
      }
    }
  },

  crearLote: async (datos) => {
    const nuevoLote: LoteProducto = {
      id: uuidv4(),
      kiosco_id: datos.kiosco_id,
      producto_id: datos.producto_id,
      numero_lote: datos.numero_lote?.trim() || null,
      fecha_vencimiento: datos.fecha_vencimiento,
      cantidad_inicial: datos.cantidad,
      cantidad_actual: datos.cantidad,
      fecha_ingreso: new Date().toISOString(),
      activo: true,
    }

    const actualizados = [nuevoLote, ...get().lotes]
    set({ lotes: actualizados })
    guardarLotesLocales(actualizados, datos.kiosco_id)

    // Intento no bloqueante de sincronizar con Supabase
    if (navigator.onLine) {
      Promise.resolve(
        supabase
          .from('lotes_producto')
          .insert({
            id: nuevoLote.id,
            kiosco_id: nuevoLote.kiosco_id,
            producto_id: nuevoLote.producto_id,
            numero_lote: nuevoLote.numero_lote,
            fecha_vencimiento: nuevoLote.fecha_vencimiento,
            cantidad_inicial: nuevoLote.cantidad_inicial,
            cantidad_actual: nuevoLote.cantidad_actual,
            fecha_ingreso: nuevoLote.fecha_ingreso,
            activo: nuevoLote.activo,
          })
      )
        .then(({ error }: any) => {
          if (error) console.warn('Aviso: guardado local de lote OK, sincronización remota:', error.message)
        })
        .catch(() => {})
    }

    return nuevoLote
  },

  descontarStockFEFO: async (productoId: string, cantidad: number) => {
    if (cantidad <= 0) return []

    // 1. Filtrar lotes activos de este producto con stock > 0
    const lotesProducto = get().lotes
      .filter((l) => l.producto_id === productoId && l.activo && l.cantidad_actual > 0)
      // Ordenar por fecha_vencimiento ASC (FEFO: el que vence más pronto se descuenta primero)
      .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))

    let restante = cantidad
    const deducciones: { loteId: string; cantidadDescontada: number; fechaVencimiento: string; stockFaltante?: number }[] = []
    const lotesModificados = new Map<string, LoteProducto>()

    for (const lote of lotesProducto) {
      if (restante <= 0) break

      const disponibleEnLote = lote.cantidad_actual
      const aDescontar = Math.min(restante, disponibleEnLote)

      const nuevaCantidad = Number((disponibleEnLote - aDescontar).toFixed(3))
      const loteActualizado: LoteProducto = {
        ...lote,
        cantidad_actual: nuevaCantidad,
        activo: nuevaCantidad > 0, // Se inactiva si llegó a 0
      }

      lotesModificados.set(lote.id, loteActualizado)
      deducciones.push({
        loteId: lote.id,
        cantidadDescontada: aDescontar,
        fechaVencimiento: lote.fecha_vencimiento,
      })

      restante = Number((restante - aDescontar).toFixed(3))
    }

    // BUG-09: Si quedó stock sin descontar (lotes insuficientes), agregar indicador
    if (restante > 0) {
      console.warn(
        `[FEFO] Deducción incompleta para producto ${productoId}: ` +
        `se solicitaron ${cantidad} unidades pero solo se encontraron ${(cantidad - restante).toFixed(3)} en lotes activos. ` +
        `Faltan ${restante.toFixed(3)} unidades en lotes.`
      )
      // Agregar entrada especial con stockFaltante para que el caller pueda detectarlo
      deducciones.push({
        loteId: '__sin_lote__',
        cantidadDescontada: 0,
        fechaVencimiento: '',
        stockFaltante: restante,
      })
    }

    if (lotesModificados.size > 0) {
      const actualizados = get().lotes.map((l) => lotesModificados.get(l.id) || l)
      set({ lotes: actualizados })
      const kioscoId = lotesProducto[0]?.kiosco_id
      guardarLotesLocales(actualizados, kioscoId)

      // Actualizar en Supabase en segundo plano
      if (navigator.onLine) {
        for (const [, mod] of lotesModificados) {
          Promise.resolve(
            supabase
              .from('lotes_producto')
              .update({
                cantidad_actual: mod.cantidad_actual,
                activo: mod.activo,
              })
              .eq('id', mod.id)
          ).catch(() => {})
        }
      }
    }

    return deducciones
  },

  restituirStockLote: async (productoId: string, cantidad: number, kioscoId?: string | null) => {
    if (cantidad <= 0) return false

    // Buscar lotes de este producto ordenados por fecha de vencimiento DESC (restituir al lote más lejano)
    const lotesProducto = get()
      .lotes.filter((l) => l.producto_id === productoId)
      .sort((a, b) => b.fecha_vencimiento.localeCompare(a.fecha_vencimiento))

    if (lotesProducto.length === 0) return false

    const loteDestino = lotesProducto.find((l) => l.activo) || lotesProducto[0]
    const nuevaCantidad = Number(((loteDestino.cantidad_actual || 0) + cantidad).toFixed(3))

    const loteActualizado: LoteProducto = {
      ...loteDestino,
      cantidad_actual: nuevaCantidad,
      activo: true,
    }

    const actualizados = get().lotes.map((l) => (l.id === loteDestino.id ? loteActualizado : l))
    set({ lotes: actualizados })
    const targetKioscoId = kioscoId || loteDestino.kiosco_id
    guardarLotesLocales(actualizados, targetKioscoId)

    if (navigator.onLine) {
      Promise.resolve(
        supabase
          .from('lotes_producto')
          .update({
            cantidad_actual: nuevaCantidad,
            activo: true,
          })
          .eq('id', loteDestino.id)
      ).catch(() => {})
    }

    return true
  },

  darDeBajaLote: async (loteId: string) => {
    const lote = get().lotes.find((l) => l.id === loteId)
    if (!lote) return null

    const actualizado: LoteProducto = {
      ...lote,
      cantidad_actual: 0,
      activo: false,
    }

    const actualizados = get().lotes.map((l) => (l.id === loteId ? actualizado : l))
    set({ lotes: actualizados })
    guardarLotesLocales(actualizados, lote.kiosco_id)

    if (navigator.onLine) {
      Promise.resolve(
        supabase
          .from('lotes_producto')
          .update({ cantidad_actual: 0, activo: false })
          .eq('id', loteId)
      ).catch(() => {})
    }

    return actualizado
  },

  obtenerLotesDeProducto: (productoId: string) => {
    return get()
      .lotes.filter((l) => l.producto_id === productoId && l.activo && l.cantidad_actual > 0)
      .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
  },

  obtenerAlertas: (diasVentana = 30) => {
    const activos = get().lotes.filter((l) => l.activo && l.cantidad_actual > 0)

    const vencidos: LoteProducto[] = []
    const criticos: LoteProducto[] = [] // 0 a 7 días
    const proximos: LoteProducto[] = [] // 8 a díasVentana
    const vigentes: LoteProducto[] = [] // > díasVentana

    for (const lote of activos) {
      const dias = calcularDiasHastaVencimiento(lote.fecha_vencimiento)
      if (dias < 0) {
        vencidos.push(lote)
      } else if (dias <= 7) {
        criticos.push(lote)
      } else if (dias <= diasVentana) {
        proximos.push(lote)
      } else {
        vigentes.push(lote)
      }
    }

    // Ordenar de más urgente a menos urgente
    const ordenarPorVto = (arr: LoteProducto[]) =>
      arr.sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))

    return {
      vencidos: ordenarPorVto(vencidos),
      criticos: ordenarPorVto(criticos),
      proximos: ordenarPorVto(proximos),
      vigentes: ordenarPorVto(vigentes),
    }
  },
}))
