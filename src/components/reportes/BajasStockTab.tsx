import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { formatPrecio, getFechaLocal } from '../../lib/utils'
import { ETIQUETAS_BAJAS, validarReporteBajas, type ReporteBajas } from '../../lib/stockLossReport'
import { RefreshButton } from '../ui/RefreshButton'
import { Input } from '../ui/Input'
import { Link } from 'react-router-dom'
import { IconoBajas } from './BajasStockIconos'

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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5 shadow-md dark:shadow-black/20">
        <div className="min-w-0">
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300"><IconoBajas tipo="inventario" size={13} />Control de inventario</span>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">Bajas de inventario</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">Incluye todos los movimientos del período, por día argentino. Estimación de gestión; no modifica el resultado fiscal.</p>
        </div>
        <div className="grid w-full lg:w-auto lg:shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] items-end gap-2 sm:gap-3">
          <div className="min-w-0 lg:w-36"><Input label="Desde" aria-label="Desde" type="date" className="h-10 min-w-0 px-2 text-xs sm:text-sm sm:px-3.5" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="min-w-0 lg:w-36"><Input label="Hasta" aria-label="Hasta" type="date" className="h-10 min-w-0 px-2 text-xs sm:text-sm sm:px-3.5" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          <RefreshButton refreshing={cargando} onClick={() => setRevision((valor) => valor + 1)} />
        </div>
      </div>
      {cargando && <p role="status" className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center text-sm text-gray-500 dark:text-gray-400">Cargando bajas...</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {reporte && !error && !cargando && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {([
            { label: 'Bajas registradas', valor: reporte.movimientos, detalle: 'Movimientos identificados del período', color: 'text-indigo-600 dark:text-indigo-400', fondo: 'bg-indigo-50 dark:bg-indigo-900/30', icono: 'inventario' },
            { label: 'Estimación a costo', valor: conCosto > 0 || reporte.movimientos === 0 ? formatPrecio(estimacion) : 'No disponible', detalle: sinCosto > 0 ? 'Importe parcial de los costos conocidos' : 'Costo histórico de las bajas', color: 'text-rose-600 dark:text-rose-400', fondo: 'bg-rose-50 dark:bg-rose-900/30', icono: 'costo' },
            { label: 'Con costo conocido', valor: conCosto, detalle: 'Movimientos incluidos en la estimación', color: 'text-emerald-600 dark:text-emerald-400', fondo: 'bg-emerald-50 dark:bg-emerald-900/30', icono: 'conocido' },
            { label: 'Sin costo histórico', valor: sinCosto, detalle: 'Movimientos excluidos de la estimación', color: 'text-amber-600 dark:text-amber-400', fondo: 'bg-amber-50 dark:bg-amber-900/30', icono: 'pendiente' },
          ] as const).map((indicador) => (
            <article key={indicador.label} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-md dark:shadow-black/20">
              <div className="flex items-start justify-between gap-3"><p className={`text-xs font-bold uppercase tracking-wide ${indicador.color}`}>{indicador.label}</p><span className={`rounded-xl p-2.5 ${indicador.fondo} ${indicador.color}`}><IconoBajas tipo={indicador.icono} /></span></div>
              <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-gray-100 mt-3 tabular-nums">{indicador.valor}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">{indicador.detalle}</p>
            </article>
          ))}
        </div>
      )}
      {reporte && !error && !cargando && (
        reporte.movimientos === 0 ? <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center shadow-md dark:shadow-black/20"><span className="rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 p-4 text-indigo-500"><IconoBajas tipo="inventario" size={30} /></span><p className="text-sm font-semibold text-gray-900 dark:text-gray-100">No hay bajas registradas en este período.</p><p className="max-w-lg text-xs leading-relaxed text-gray-500 dark:text-gray-400">Probá otro rango de fechas. Para registrar una merma, rotura o vencimiento, ingresá a Stock y cargá el movimiento con su motivo.</p><Link to="/stock" className="mt-1 inline-flex items-center gap-2 rounded-lg border-2 border-indigo-500 dark:border-indigo-400 bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white transition-colors"><IconoBajas tipo="inventario" size={16} />Ir a Stock</Link></div> : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5 shadow-md dark:shadow-black/20">
            <table className="w-full min-w-[520px] text-sm text-left text-gray-700 dark:text-gray-200">
              <caption className="text-left pb-3 font-semibold">Estimación a costo histórico · {reporte.movimientos} movimientos</caption>
              <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700"><tr><th scope="col" className="py-3">Motivo</th><th scope="col">Movimientos</th><th scope="col">Sin costo conocido</th><th scope="col">Estimación conocida</th></tr></thead>
              <tbody>{reporte.por_motivo.map((fila) => (
                <tr key={fila.motivo} className="border-b border-gray-100 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
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
      <aside className="rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50 dark:bg-indigo-950/20 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-indigo-900 dark:text-indigo-200"><IconoBajas tipo="ayuda" size={18} />Cómo interpretar este reporte</h3>
        <div className="grid gap-3 sm:grid-cols-3 text-xs leading-relaxed text-gray-600 dark:text-gray-400"><p><strong className="block mb-1 text-gray-800 dark:text-gray-200">Movimientos, no unidades</strong>Una baja puede incluir varias unidades. El contador muestra registros de bajas del período.</p><p><strong className="block mb-1 text-gray-800 dark:text-gray-200">Costo del momento</strong>La estimación utiliza el costo histórico registrado. Las bajas sin ese dato quedan fuera del importe.</p><p><strong className="block mb-1 text-gray-800 dark:text-gray-200">Control de gestión</strong>Merma, pérdida, rotura, vencimiento, robo y consumo interno se agrupan por motivo. Este informe no modifica el resultado fiscal.</p></div>
      </aside>
    </section>
  )
}
