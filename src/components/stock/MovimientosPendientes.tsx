import { useCallback, useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { supabase } from '../../lib/supabase'
import { listarMovimientosStockPendientes, prepararMovimientoStock, type MovimientoStockPendiente } from '../../lib/stockOperation'
import toast from 'react-hot-toast'

interface Props {
  kioscoId?: string
  onRefrescar: () => Promise<unknown>
  nombreProducto: (id: string) => string
}

export function MovimientosPendientes({ kioscoId, onRefrescar, nombreProducto }: Props) {
  const [pendientes, setPendientes] = useState<MovimientoStockPendiente[]>([])
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const cargar = useCallback(() => {
    try { setPendientes(kioscoId ? listarMovimientosStockPendientes(kioscoId) : []); setError('') }
    catch { setError('No se pudieron leer los movimientos pendientes de este dispositivo.') }
  }, [kioscoId])
  useEffect(() => {
    cargar()
    window.addEventListener('kiosko-stock-pendientes', cargar)
    window.addEventListener('storage', cargar)
    return () => { window.removeEventListener('kiosko-stock-pendientes', cargar); window.removeEventListener('storage', cargar) }
  }, [cargar])

  const resolver = async (pendiente: MovimientoStockPendiente, accion: 'CONSULTAR' | 'REINTENTAR' | 'CANCELAR') => {
    if (ocupado || !kioscoId) return
    setOcupado(true)
    try {
      const operacion = prepararMovimientoStock(kioscoId, pendiente.solicitud)
      const respuesta = accion === 'REINTENTAR'
        ? await supabase.rpc('registrar_movimiento_stock_idempotente', operacion.parametros)
        : await supabase.rpc('resolver_operacion_stock', {
          p_operacion_id: pendiente.id, p_kiosco_id: kioscoId, p_producto_id: pendiente.productoId, p_cancelar: accion === 'CANCELAR',
        })
      if (respuesta.error) throw new Error(respuesta.error.message)
      const estado = accion === 'REINTENTAR' ? 'APLICADA' : respuesta.data?.estado
      if (accion === 'REINTENTAR' && !((Array.isArray(respuesta.data) ? respuesta.data[0] : respuesta.data)?.movimiento_id)) {
        throw new Error('El servidor no confirmó el movimiento.')
      }
      if (estado === 'NO_REGISTRADA') {
        toast('El servidor todavía no registra esta operación. Podés reintentar la solicitud original o cancelarla.')
        return
      }
      if (estado !== 'APLICADA' && estado !== 'CANCELADA') throw new Error('El servidor no confirmó el estado de la operación.')
      if (estado === 'APLICADA' && accion !== 'REINTENTAR' && !respuesta.data?.resultado?.movimiento_id) {
        throw new Error('El servidor no confirmó el movimiento aplicado.')
      }
      await onRefrescar()
      operacion.confirmar()
      toast.success(estado === 'APLICADA' ? 'Movimiento confirmado y datos de stock actualizados.' : 'Solicitud cancelada sin modificar stock.')
      cargar()
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'No se pudo resolver la solicitud. Se conserva pendiente.') }
    finally { setOcupado(false) }
  }

  if (!error && pendientes.length === 0) return null
  return <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30" aria-label="Movimientos pendientes">
    <h2 className="text-sm font-bold text-amber-900 dark:text-amber-200">Movimientos pendientes de este dispositivo</h2>
    <p className="mt-1 text-sm">Consultá su estado antes de cargar otro movimiento del mismo producto. Cancelar no revierte movimientos ya aplicados.</p>
    {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
    {pendientes.map((pendiente) => <div key={pendiente.id} className="mt-3 space-y-2 border-t border-amber-200 pt-3 text-sm">
      <p>{String(pendiente.solicitud.p_tipo || 'Movimiento')} · Cantidad: {String(pendiente.solicitud.p_cantidad)} · Motivo: {String(pendiente.solicitud.p_motivo || '')}</p>
      <p className="text-xs">Producto: {nombreProducto(pendiente.productoId)}</p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" size="sm" disabled={ocupado} onClick={() => void resolver(pendiente,'CONSULTAR')}>Consultar estado</Button>
        <Button type="button" variant="primary" size="sm" disabled={ocupado} onClick={() => void resolver(pendiente,'REINTENTAR')}>Reintentar solicitud original</Button>
        <Button type="button" variant="danger" size="sm" disabled={ocupado} onClick={() => void resolver(pendiente,'CANCELAR')}>Cancelar solicitud pendiente</Button>
      </div>
    </div>)}
  </section>
}
