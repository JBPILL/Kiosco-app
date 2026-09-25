import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getCachedProductos, saveCachedProductos } from '../lib/utils'
import type { Producto } from '../types/database'

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

    const channelName = `realtime_kiosco_${kioscoId}`

    // BUG-15: Si ya existe un canal registrado con este topic en el cliente, limpiarlo antes de abrir otro
    const canalesExistentes = supabase.getChannels ? supabase.getChannels() : []
    const canalPrevio = canalesExistentes.find((c: any) => c.topic === channelName || c.subTopic === channelName)
    if (canalPrevio) {
      supabase.removeChannel(canalPrevio)
    }

    const canal = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'productos',
          filter: `kiosco_id=eq.${kioscoId}`,
        },
        (payload) => {
          try {
            const cached: Producto[] = getCachedProductos(kioscoId)
            if (payload.eventType === 'UPDATE' && payload.new) {
              const updated = payload.new as Producto
              const next = cached.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
              saveCachedProductos(next, kioscoId)
            } else if (payload.eventType === 'INSERT' && payload.new) {
              const nuevo = payload.new as Producto
              if (!cached.some((p) => p.id === nuevo.id)) {
                saveCachedProductos([nuevo, ...cached], kioscoId)
              }
            } else if (payload.eventType === 'DELETE' && payload.old) {
              const deletedId = (payload.old as any).id
              saveCachedProductos(cached.filter((p) => p.id !== deletedId), kioscoId)
            }
          } catch (e) {
            console.warn('Aviso sincronizando productos en realtime:', e)
          }

          if (onProductChangeRef.current) {
            onProductChangeRef.current()
          }
          window.dispatchEvent(new CustomEvent('kiosko-products-updated'))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [kioscoId])
}
