import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { formatPrecio, getFechaLocal } from '../../lib/utils'
import { ETIQUETAS_BAJAS, validarReporteBajas, type ReporteBajas } from '../../lib/stockLossReport'
import { Button } from '../ui/Button'

export function BajasStockTab() {
  const { usuario, kiosco } = useAuthStore()
  const autorizado = usuario?.rol === 'DUEÑO' || Boolean(usuario?.es_superadmin)
  const kioscoId = usuario?.kiosco_id || kiosco?.id
  const [desde, setDesde] = useState(() => `${getFechaLocal().slice(0, 7)}-01`)
  const [hasta, setHasta] = useState(() => getFechaLocal())
  const [revision, setRevision] = useState(0)
  const [reporte, setReporte] = useState<ReporteBajas | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    let vigente = true
    setReporte(null)
    setError('')
    setCargando(false)
    if (!autorizado) return
    if (!kioscoId) { setError('Seleccioná un comercio para consultar las bajas.'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
      setError('Revisá el rango de fechas: Desde debe ser anterior o igual a Hasta.')
      return
    }
    setCargando(true)
    const cargar = async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('resumir_bajas_stock', {
          p_kiosco_id: kioscoId, p_desde: desde, p_hasta: hasta,
        })
        if (rpcError) {
          throw new Error(rpcError.code === 'PGRST202' || rpcError.code === '42883'
            ? 'Falta instalar supabase_fase_reporte_bajas_stock.sql en Supabase.'
            : rpcError.message)
        }
        const resultado = validarReporteBajas(data)
        if (vigente) setReporte(resultado)
      } catch (err) {
        if (vigente) setError(err instanceof Error ? err.message : 'No se pudieron cargar las bajas de inventario.')
      } finally {
        if (vigente) setCargando(false)
      }
    }
    void cargar()
    return () => { vigente = false }
  }, [autorizado, kioscoId, desde, hasta, revision])

  if (!autorizado) return null
  return (
    <section className="space-y-4" aria-label="Bajas de inventario del período">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Bajas de inventario</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Incluye todos los movimientos del período, por día argentino. Estimación de gestión; no modifica el resultado fiscal.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-700 dark:text-gray-300">Desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="block rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1" />
          </label>
          <label className="text-sm text-gray-700 dark:text-gray-300">Hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="block rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1" />
          </label>
          <Button variant="secondary" size="sm" disabled={cargando} onClick={() => setRevision((valor) => valor + 1)}>Actualizar</Button>
        </div>
      </div>
      {cargando && <p role="status">Cargando bajas...</p>}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {reporte && !error && !cargando && (
        reporte.movimientos === 0 ? <p>No hay bajas registradas en este período.</p> : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <table className="w-full text-sm text-left text-gray-700 dark:text-gray-200">
              <caption className="text-left pb-3 font-semibold">Estimación a costo histórico · {reporte.movimientos} movimientos</caption>
              <thead><tr><th scope="col">Motivo</th><th scope="col">Movimientos</th><th scope="col">Sin costo conocido</th><th scope="col">Estimación conocida</th></tr></thead>
              <tbody>{reporte.por_motivo.map((fila) => (
                <tr key={fila.motivo}>
                  <th scope="row" className="py-3 font-medium">{ETIQUETAS_BAJAS[fila.motivo]}</th>
                  <td>{fila.movimientos}</td><td>{fila.sin_costo}</td>
                  <td>{fila.estimacion === null ? 'No disponible' : formatPrecio(fila.estimacion)}</td>
                </tr>
              ))}</tbody>
            </table>
            {reporte.por_motivo.some((fila) => fila.sin_costo > 0) && <p className="text-xs text-amber-700 dark:text-amber-400 mt-3">La estimación es parcial: excluye movimientos sin costo histórico conocido.</p>}
          </div>
        )
      )}
    </section>
  )
}
