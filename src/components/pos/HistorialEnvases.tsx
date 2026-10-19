import { useEffect, useRef, useState } from 'react'
import { cargarMovimientosEnvases, type MovimientoEnvaseCompartido } from '../../lib/pilotOperationHistory'
import type { TipoEnvaseCompartido } from '../../lib/envasesData'
import { formatFecha, formatPrecio } from '../../lib/utils'
import { Button } from '../ui/Button'

const etiquetas: Record<MovimientoEnvaseCompartido['accion'], string> = {
  AJUSTAR_SALDO: 'Ajuste por conteo', ENTREGAR_DISTRIBUIDOR: 'Entrega al distribuidor',
  RECIBIR_EFECTIVO: 'Recepción con efectivo', RECIBIR_TICKET: 'Recepción en ticket',
  DEVOLVER_CLIENTE: 'Entrega al cliente por devolución',
}
interface Props { kioscoId: string; tipos: TipoEnvaseCompartido[] }
export function HistorialEnvases({ kioscoId, tipos }: Props) {
  return <ContenidoHistorial key={kioscoId} kioscoId={kioscoId} tipos={tipos} />
}
function ContenidoHistorial({ kioscoId, tipos }: Props) {
  const corte = useRef(new Date()).current
  const hasta = corte.toISOString(), desde = new Date(corte.getTime() - 30 * 86400000).toISOString()
  const [movimientos, setMovimientos] = useState<MovimientoEnvaseCompartido[] | null>(null)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let vigente = true
    setMovimientos(null); setError(false)
    void cargarMovimientosEnvases(kioscoId, desde, hasta).then(datos => { if (vigente) setMovimientos(datos) })
      .catch(() => { if (vigente) setError(true) })
    return () => { vigente = false }
  }, [kioscoId, desde, hasta, revision])

  return <section aria-label="Historial de envases" className="border-t border-gray-300 pt-4 dark:border-gray-600 space-y-2">
    <h3 className="font-semibold">Movimientos de los últimos 30 días</h3>
    {error ? <div role="alert" className="text-sm space-y-2"><p>No se pudo cargar el historial completo del período.</p><Button size="sm" variant="secondary" onClick={() => setRevision(n => n + 1)}>Reintentar movimientos</Button></div>
      : movimientos === null ? <p role="status" className="text-sm">Cargando movimientos…</p>
      : movimientos.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-300">No hay movimientos registrados en este período.</p>
      : <ul className="max-h-64 overflow-y-auto space-y-2" aria-label="Movimientos registrados">
        {movimientos.map(m => <li key={m.id} className="rounded-lg border border-gray-300 p-3 text-sm dark:border-gray-600 space-y-1">
          <p className="font-semibold">{etiquetas[m.accion]} · {tipos.find(t => t.id === m.tipo_id)?.nombre ?? m.tipo_id}</p>
          <p>{formatFecha(m.creado_en)} · Cantidad: {m.cantidad} · Saldo: {m.stock_resultante} vacíos</p>
          {m.importe > 0 && <p>Valor reconocido: {formatPrecio(m.importe)}</p>}
          {m.distribuidor && <p>Distribuidor: {m.distribuidor}</p>}
        </li>)}
      </ul>}
  </section>
}
