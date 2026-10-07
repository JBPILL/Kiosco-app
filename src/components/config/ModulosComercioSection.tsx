import { Layers, Package, Scale, CalendarClock, Zap } from './ConfigIcons'
import type { CapacidadesOperativas } from '../../types/database'

const modulos = [
  { key: 'envases', titulo: 'Envases retornables', descripcion: 'Recepción de envases y gestión de sus depósitos.', Icono: Package },
  { key: 'balanza', titulo: 'Lectura de balanza y códigos de peso', descripcion: 'Lectura de etiquetas con peso para agilizar la venta.', Icono: Scale },
  { key: 'vencimientos', titulo: 'Lotes y vencimientos', descripcion: 'Seguimiento de partidas y fechas para controlar la mercadería.', Icono: CalendarClock },
  { key: 'serviciosRapidos', titulo: 'Servicios rápidos', descripcion: 'Accesos de cobro para fotocopias, impresiones y otros servicios.', Icono: Zap },
] as const

interface Props {
  value: CapacidadesOperativas
  onChange: (value: CapacidadesOperativas) => void
}

export function ModulosComercioSection({ value, onChange }: Props) {
  return <fieldset className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6 shadow-md dark:shadow-black/20 space-y-4">
    <legend className="sr-only">Módulos operativos de este comercio</legend>
    <div className="flex items-center gap-3"><span className="rounded-xl bg-indigo-50 dark:bg-indigo-900/30 p-2.5 text-indigo-600 dark:text-indigo-300"><Layers size={22} aria-hidden="true" /></span><div><p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Capacidades del local</p><h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Módulos operativos de este comercio</h2></div></div>
    <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">El rubro sugiere una configuración inicial; activá cada capacidad que use tu negocio. Los productos existentes se conservan.</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{modulos.map(({ key, titulo, descripcion, Icono }) => <label key={key} className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors shadow-sm ${value[key] ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 hover:border-indigo-300'}`}>
      <input type="checkbox" aria-label={titulo} checked={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.checked })} className="mt-1 h-4 w-4 shrink-0 accent-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500" />
      <Icono size={20} className="mt-0.5 shrink-0 text-indigo-500" aria-hidden="true" />
      <span className="min-w-0"><span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">{titulo}</span><span className="mt-1 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">{descripcion}</span><span className={`mt-2 inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold ${value[key] ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{value[key] ? 'Activado' : 'Desactivado'}</span></span>
    </label>)}</div>
    <p className="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 p-3 text-xs leading-relaxed text-indigo-700 dark:text-indigo-300">Los productos marcados como pesables siempre permiten ingresar el peso manualmente, aunque la lectura de balanza esté desactivada. Guardá los cambios del comercio para aplicar los módulos.</p>
  </fieldset>
}
