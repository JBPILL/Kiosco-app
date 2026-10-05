import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getCachedProductos, saveCachedProductos } from '../lib/utils'
import type { Producto } from '../types/database'

// Registro de IDs modificados localmente para detectar echos
const toquesLocalesRecientes = new Map<string, number>()

/**
 * Registra que un producto fue modificado por esta terminal recientemente (ej. por cobro o edición manual).
 * Permite que useRealtimeSync distinga entre cambios locales y modificaciones originadas en otra terminal.
 */
export function registrarToqueLocal(productoId: string) {
  toquesLocalesRecientes.set(productoId, Date.now())
}

export function esToqueLocalReciente(productoId: string, maxEdadMs = 2500): boolean {
  const t = toquesLocalesRecientes.get(productoId)
  if (!t) return false
  if (Date.now() - t > maxEdadMs) {
    toquesLocalesRecientes.delete(productoId)
    return false
  }
  return true
}

export interface KioskoProductsUpdatedDetail {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  producto?: Producto
  productoOld?: Producto
  esEchoLocal: boolean
}

// Control de canal único por kiosco con conteo de suscriptores
let canalActivo: any = null
let canalKioscoIdActivo: string | null = null
let cantidadSuscriptores = 0

/**
 * Suscribe la aplicación a cambios en tiempo real en la base de datos de Supabase.
 * Permite que modificaciones de stock, precios y catálogo realizadas desde otra terminal
 * o desde el celular del dueño se reflejen instantáneamente sin recargar la página.
 */
export function useRealtimeSync(kioscoId?: string, onProductChange?: () => void) {
  const onProductChangeRef = useRef(onProductChange)
  useEffect(() => {
    onProductChangeRef.current = onProductChange
  }, [onProductChange])

  useEffect(() => {
    if (!kioscoId) return

    // Si ya hay un canal activo para este mismo kiosco, incrementar suscriptores y reutilizarlo
    if (canalActivo && canalKioscoIdActivo === kioscoId) {
      cantidadSuscriptores++
    } else {
      // Si había un canal de otro kiosco, desuscribirlo
      if (canalActivo) {
        try {
          supabase.removeChannel(canalActivo)
        } catch (e) {
          console.warn('Error removiendo canal previo realtime:', e)
        }
      }

      canalKioscoIdActivo = kioscoId
      cantidadSuscriptores = 1

      const channelName = `realtime_kiosco_${kioscoId}`

      // Si existe canal huérfano con este topic en el cliente, limpiarlo
      const canalesExistentes = supabase.getChannels ? supabase.getChannels() : []
      const canalPrevio = canalesExistentes.find(
        (c: any) => c.topic === channelName || c.subTopic === channelName
      )
      if (canalPrevio) {
        try {
          supabase.removeChannel(canalPrevio)
        } catch {}
      }

      canalActivo = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'productos',
            filter: `kiosco_id=eq.${kioscoId}`,
          },
          (payload: any) => {
            try {
              const cached: Producto[] = getCachedProductos(kioscoId)
              const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
              const nuevo = payload.new as Producto | undefined
              const viejo = payload.old as Producto | undefined
              const prodId = nuevo?.id || viejo?.id

              const esEcho = prodId ? esToqueLocalReciente(prodId) : false

              if (eventType === 'UPDATE' && nuevo) {
                // Filtrar no-ops si no hubo alteraciones relevantes
                const anterior = cached.find((p) => p.id === nuevo.id)
                if (
                  anterior &&
                  anterior.stock_actual === nuevo.stock_actual &&
                  anterior.precio_venta === nuevo.precio_venta &&
                  anterior.precio_costo === nuevo.precio_costo &&
                  anterior.activo === nuevo.activo &&
                  anterior.es_favorito === nuevo.es_favorito &&
                  anterior.descripcion === nuevo.descripcion
                ) {
                  return
                }

                const next = cached.map((p) => (p.id === nuevo.id ? { ...p, ...nuevo } : p))
                saveCachedProductos(next, kioscoId)

                if (typeof window !== 'undefined') {
                  window.dispatchEvent(
                    new CustomEvent<KioskoProductsUpdatedDetail>('kiosko-products-updated', {
                      detail: { eventType, producto: nuevo, productoOld: viejo, esEchoLocal: esEcho },
                    })
                  )
                }
              } else if (eventType === 'INSERT' && nuevo) {
                if (!cached.some((p) => p.id === nuevo.id)) {
                  saveCachedProductos([nuevo, ...cached], kioscoId)
                }
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(
                    new CustomEvent<KioskoProductsUpdatedDetail>('kiosko-products-updated', {
                      detail: { eventType, producto: nuevo, productoOld: viejo, esEchoLocal: esEcho },
                    })
                  )
                }
              } else if (eventType === 'DELETE') {
                const deletedId = viejo?.id || (payload.old as any)?.id
                if (deletedId) {
                  saveCachedProductos(cached.filter((p) => p.id !== deletedId), kioscoId)
                }
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(
                    new CustomEvent<KioskoProductsUpdatedDetail>('kiosko-products-updated', {
                      detail: { eventType, producto: nuevo, productoOld: viejo, esEchoLocal: esEcho },
                    })
                  )
                }
              }
            } catch (e) {
              console.warn('Aviso sincronizando productos en realtime:', e)
            }

            if (onProductChangeRef.current) {
              onProductChangeRef.current()
            }
          }
        )
        .subscribe()
    }

    return () => {
      cantidadSuscriptores--
      if (cantidadSuscriptores <= 0 && canalActivo) {
        try {
          supabase.removeChannel(canalActivo)
        } catch (e) {
          console.warn('Error removiendo canal realtime en unmount:', e)
        }
        canalActivo = null
        canalKioscoIdActivo = null
        cantidadSuscriptores = 0
      }
    }
  }, [kioscoId])
}
