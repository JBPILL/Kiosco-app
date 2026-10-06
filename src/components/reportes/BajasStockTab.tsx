import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { formatPrecio, getFechaLocal } from '../../lib/utils'
import { ETIQUETAS_BAJAS, validarReporteBajas, type ReporteBajas } from '../../lib/stockLossReport'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

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
  const sinCosto = reporte?.por_motivo.reduce((total, fila) => total + fila.sin_costo, 0) ?? 0
  const conCosto = (reporte?.movimientos ?? 0) - sinCosto
  const estimacion = reporte?.por_motivo.reduce((total, fila) => total + (fila.estimacion ?? 0), 0) ?? 0
  return (
    <section className="space-y-5 min-w-0" aria-label="Bajas de inventario del período">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">Bajas de inventario</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">Incluye todos los movimientos del período, por día argentino. Estimación de gestión; no modifica el resultado fiscal.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40"><Input label="Desde" aria-label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="w-40"><Input label="Hasta" aria-label="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          <Button variant="secondary" size="sm" disabled={cargando} onClick={() => setRevision((valor) => valor + 1)}>Actualizar</Button>
        </div>
      </div>
      {cargando && <p role="status" className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center text-sm text-gray-500 dark:text-gray-400">Cargando bajas...</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {reporte && !error && !cargando && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Bajas registradas', valor: reporte.movimientos, detalle: 'Movimientos identificados del período', color: 'text-indigo-600 dark:text-indigo-400' },
            { label: 'Estimación a costo', valor: conCosto > 0 || reporte.movimientos === 0 ? formatPrecio(estimacion) : 'No disponible', detalle: sinCosto > 0 ? 'Importe parcial de los costos conocidos' : 'Costo histórico de las bajas', color: 'text-rose-600 dark:text-rose-400' },
            { label: 'Con costo conocido', valor: conCosto, detalle: 'Movimientos incluidos en la estimación', color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Sin costo histórico', valor: sinCosto, detalle: 'Movimientos pendientes de valoración', color: 'text-amber-600 dark:text-amber-400' },
          ].map((indicador) => (
            <article key={indicador.label} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-xs">
              <p className={`text-xs font-bold uppercase tracking-wide ${indicador.color}`}>{indicador.label}</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-gray-100 mt-3 tabular-nums">{indicador.valor}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">{indicador.detalle}</p>
            </article>
          ))}
        </div>
      )}
      {reporte && !error && !cargando && (
        reporte.movimientos === 0 ? <p className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center text-sm text-gray-500 dark:text-gray-400">No hay bajas registradas en este período.</p> : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5 shadow-xs">
            <table className="w-full min-w-[520px] text-sm text-left text-gray-700 dark:text-gray-200">
              <caption className="text-left pb-3 font-semibold">Estimación a costo histórico · {reporte.movimientos} movimientos</caption>
              <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700"><tr><th scope="col" className="py-3">Motivo</th><th scope="col">Movimientos</th><th scope="col">Sin costo conocido</th><th scope="col">Estimación conocida</th></tr></thead>
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
