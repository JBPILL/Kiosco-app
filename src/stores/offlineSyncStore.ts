import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useClienteStore } from './clienteStore'
import { useComboStore } from './comboStore'
import toast from 'react-hot-toast'
import { v5 as uuidv5 } from 'uuid'

export interface DetalleVentaOffline {
  id: string
  producto_id: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  sin_envase?: boolean
  precio_envase_unitario?: number
  es_devolucion_envase?: boolean
  articulo_libre?: { descripcion: string; precio_venta: number }
}

export interface PagoVentaOffline {
  medio_pago: string
  monto: number
  referencia?: string | null
}

export interface VentaOfflinePendiente {
  id: string
  kiosco_id: string
  usuario_id: string | null
  sesion_caja_id: string | null
  fecha_hora: string
  total: number
  estado: string
  notas: string | null
  detalles: DetalleVentaOffline[]
  pagos: PagoVentaOffline[]
  cliente_id?: string | null
  fecha_encolado: string
}

interface OfflineSyncState {
  cola: VentaOfflinePendiente[]
  sincronizando: boolean
  ultimaSincronizacion: string | null

  cargarCola: (kioscoId: string) => VentaOfflinePendiente[]
  encolarVenta: (venta: VentaOfflinePendiente) => void
  sincronizarCola: (kioscoId: string) => Promise<{ exitosas: number; fallidas: number }>
  limpiarCola: (kioscoId: string) => void
}

function getStorageKey(kioscoId: string): string {
  return `kioskopos_cola_offline_${kioscoId || 'default'}`
}

function getLocalCola(kioscoId: string): VentaOfflinePendiente[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(getStorageKey(kioscoId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalCola(kioscoId: string, cola: VentaOfflinePendiente[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(getStorageKey(kioscoId), JSON.stringify(cola))
  } catch (e) {
    console.error('Error guardando cola offline:', e)
  }
}

export const useOfflineSyncStore = create<OfflineSyncState>((set, get) => ({
  cola: [],
  sincronizando: false,
  ultimaSincronizacion: null,

  cargarCola: (kioscoId: string) => {
    const cola = getLocalCola(kioscoId)
    set({ cola })
    return cola
  },

  encolarVenta: (venta: VentaOfflinePendiente) => {
    const colaActual = getLocalCola(venta.kiosco_id)
    if (colaActual.some((v) => v.id === venta.id)) {
      return
    }
    const nuevaCola = [...colaActual, venta]
    saveLocalCola(venta.kiosco_id, nuevaCola)
    set({ cola: nuevaCola })
  },

  limpiarCola: (kioscoId: string) => {
    saveLocalCola(kioscoId, [])
    set({ cola: [] })
  },

  sincronizarCola: async (kioscoId: string) => {
    // BUG-18: Verificar y fijar el semáforo de forma atómica antes de cualquier await
    if (get().sincronizando) return { exitosas: 0, fallidas: 0 }
    set({ sincronizando: true })  // fijar inmediatamente (síncrono, antes del primer await)

    const pendientes = getLocalCola(kioscoId)
    if (pendientes.length === 0) {
      set({ sincronizando: false })
      return { exitosas: 0, fallidas: 0 }
    }

    if (!navigator.onLine) {
      toast.error('Sin conexión a internet para sincronizar ventas pendientes', { icon: '📶' })
      set({ sincronizando: false })
      return { exitosas: 0, fallidas: pendientes.length }
    }

    const toastId = toast.loading(`Sincronizando ${pendientes.length} venta(s) guardadas offline...`)

    let exitosas = 0
    const noSincronizadas: VentaOfflinePendiente[] = []

    for (const v of pendientes) {
      try {
        const articulosLibres = v.detalles.filter((detalle) => detalle.articulo_libre)
        if (articulosLibres.length > 0) {
          const { error } = await supabase.from('productos').upsert(
            articulosLibres.map((detalle) => ({
              id: detalle.producto_id,
              kiosco_id: v.kiosco_id,
              descripcion: detalle.articulo_libre!.descripcion,
              precio_costo: 0,
              precio_venta: Math.max(0, detalle.articulo_libre!.precio_venta),
              stock_actual: 99999,
              stock_minimo: 0,
              es_favorito: false,
              activo: false,
              fecha_creacion: v.fecha_hora,
              fecha_actualizacion: v.fecha_hora,
            })),
            { onConflict: 'id' }
          )
          if (error) throw error
        }
        // 1. Insertar cabecera de venta
        const { error: errVenta } = await supabase.from('ventas').insert({
          id: v.id,
          kiosco_id: v.kiosco_id,
          usuario_id: v.usuario_id,
          sesion_caja_id: v.sesion_caja_id,
          fecha_hora: v.fecha_hora,
          total: v.total,
          estado: 'COMPLETADA',
          notas: v.notas,
          sincronizado: true,
        })

        if (errVenta && !errVenta.message?.includes('duplicate key')) {
          throw errVenta
        }

        // 2. Insertar renglones de detalles — BUG-17: throw en lugar de warn para no crear venta huérfana
        if (v.detalles && v.detalles.length > 0) {
          const detallesAInsertar = v.detalles.map((d) => ({
            id: d.id,
            venta_id: v.id,
            producto_id: d.producto_id,
            cantidad: d.cantidad,
            precio_unitario: d.precio_unitario,
            subtotal: d.subtotal,
            sin_envase: Boolean(d.sin_envase),
            precio_envase_unitario: d.precio_envase_unitario || 0,
            es_devolucion_envase: Boolean(d.es_devolucion_envase),
          }))

          const { error: errDetalles } = await supabase.from('detalles_venta').insert(detallesAInsertar)
          if (errDetalles && !errDetalles.message?.includes('duplicate key')) {
            // BUG-17: Lanzar error para que la venta quede en noSincronizadas y se reintente.
            // Si pasamos silenciosamente, la venta queda huérfana (existe en 'ventas' sin detalles ni pagos).
            throw errDetalles
          }
        }

        // 3. Insertar pagos — BUG-17: ídem
        if (v.pagos && v.pagos.length > 0) {
          const pagosAInsertar = v.pagos.map((p, indice) => ({
            id: uuidv5(`kioskopos:offline:${v.kiosco_id}:${v.id}:pago:${indice}`, uuidv5.URL),
            venta_id: v.id,
            medio_pago: p.medio_pago,
            monto: p.monto,
            referencia: p.referencia || null,
          }))

          const { error: errPagos } = await supabase.from('pagos_venta').upsert(pagosAInsertar, {
            onConflict: 'id',
            ignoreDuplicates: true,
          })
          if (errPagos) {
            throw errPagos
          }
        }

        // 4. Si fue cuenta corriente con cliente asignado, impactar cargo en cuenta corriente
        const tieneCC = v.pagos.some((p) => p.medio_pago === 'CUENTA_CORRIENTE')
        if (tieneCC && v.cliente_id) {
          const montoCC = v.pagos
            .filter((p) => p.medio_pago === 'CUENTA_CORRIENTE')
            .reduce((acc, p) => acc + p.monto, 0)

          if (montoCC > 0) {
            try {
              await useClienteStore.getState().imputarCargoVenta(v.cliente_id, v.id, montoCC, 'Cargo por venta offline')
            } catch (errCargo) {
              console.warn('Aviso registrando cargo en cuenta corriente offline:', errCargo)
            }
          }
        }

        // 5. Impactar movimientos de stock y actualizar stock_actual en Supabase
        for (const item of v.detalles) {
          try {
            // BUG-57: Ignorar devoluciones de envases retornables (no son egreso de mercadería)
            if (item.es_devolucion_envase || item.articulo_libre) continue

            // Verificar si es un combo para descontar sus componentes físicos
            const componentes = useComboStore.getState().obtenerComponentesDeCombo(item.producto_id)
            if (componentes && componentes.length > 0) {
              await useComboStore
                .getState()
                .descontarStockComponentesCombo(
                  item.producto_id,
                  item.cantidad,
                  v.kiosco_id,
                  v.usuario_id,
                  v.id,
                  v.fecha_hora  // BUG-04: fecha original de la venta para consistencia en historial
                )
              continue
            }

            // Actualizar stock_actual real en Supabase para mantener la consistencia
            const { data: pActual } = await supabase
              .from('productos')
              .select('stock_actual, activo')
              .eq('id', item.producto_id)
              .eq('kiosco_id', v.kiosco_id)
              .maybeSingle()

            // BUG-57: Si el producto no existe en la base (ej. ítem libre con UUID transitorio), no insertar en movimientos_stock para evitar violaciones de clave foránea
            if (!pActual || pActual.activo === false || typeof pActual.stock_actual !== 'number') {
              continue
            }

            const nuevoStock = Number((pActual.stock_actual - item.cantidad).toFixed(3))
            await supabase
              .from('productos')
              .update({
                stock_actual: nuevoStock,
                fecha_actualizacion: new Date().toISOString(),
              })
              .eq('id', item.producto_id)

            // Registrar renglón en historial de movimientos
            await supabase.from('movimientos_stock').insert({
              kiosco_id: v.kiosco_id,
              producto_id: item.producto_id,
              tipo: 'EGRESO',
              cantidad: -item.cantidad,
              motivo: 'VENTA',
              notas: `Venta offline sincronizada #${v.id.slice(0, 8).toUpperCase()}`,
              usuario_id: v.usuario_id,
              fecha: v.fecha_hora,
            })
          } catch (errMov) {
            console.warn('Aviso movimiento stock offline:', errMov)
          }
        }

        exitosas++
      } catch (errVenta) {
        console.error('Error sincronizando venta offline:', v.id, errVenta)
        noSincronizadas.push(v)
      }
    }

    // BUG-PM-04: Combinar las ventas que fallaron con cualquier nueva venta que haya sido encolada durante el proceso de sincronización
    const colaFresca = getLocalCola(kioscoId)
    const idsProcesados = new Set(pendientes.map((p) => p.id))
    const nuevosEncolados = colaFresca.filter((item) => !idsProcesados.has(item.id))
    const colaFinal = [...noSincronizadas, ...nuevosEncolados]

    saveLocalCola(kioscoId, colaFinal)
    set({
      cola: colaFinal,
      sincronizando: false,
      ultimaSincronizacion: new Date().toISOString(),
    })

    toast.dismiss(toastId)
    if (exitosas > 0) {
      toast.success(
        noSincronizadas.length === 0
          ? `¡Todas las ventas offline (${exitosas}) fueron sincronizadas con éxito en la nube!`
          : `Se sincronizaron ${exitosas} ventas. Quedan ${noSincronizadas.length} pendientes.`,
        { icon: '☁️', duration: 5000 }
      )
    } else if (noSincronizadas.length > 0) {
      toast.error('No se pudieron sincronizar las ventas offline. Se reintentará automáticamente.', { duration: 5000 })
    }

    return { exitosas, fallidas: noSincronizadas.length }
  },
}))
