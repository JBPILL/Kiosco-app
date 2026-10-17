import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { administracionComercialHabilitada } from '../../lib/commercialScope'
import { useAuthStore } from '../../stores/authStore'
import type { PagoSuscripcion, Suscripcion } from '../../types/database'
import type { ConfiguracionAdmin } from '../../stores/configAdminStore'
import { formatearLinkWhatsApp } from '../../stores/configAdminStore'
import { formatPrecio, formatFechaCorta } from '../../lib/utils'
import { ArrowUpRight, CalendarDays, Clock3, CreditCard, ReceiptText, RefreshCw, ShieldCheck, Wallet } from './ConfigIcons'
import { Button } from '../ui/Button'

interface Snapshot {
  suscripcion: Suscripcion | null
  estado: 'ACTIVO' | 'SOLO_LECTURA' | 'SUSPENDIDO'
  dias_restantes: number | null
  pagos: PagoSuscripcion[]
  instrucciones: ConfiguracionAdmin
}
// SQL DATE represents a commercial day, not midnight UTC in the viewer's timezone.
function fechaComercial(fecha?: string | null): string {
  if (!fecha) return 'No disponible'
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha.split('-').reverse().join('/') : formatFechaCorta(fecha)
}
const estados = {
  ACTIVO: { label: 'Activo', style: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
  SOLO_LECTURA: { label: 'Solo lectura', style: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300' },
  SUSPENDIDO: { label: 'Suspendido', style: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300' },
}
export function SubscriptionSection() {
  const { usuario } = useAuthStore()
  const enabled = administracionComercialHabilitada()
  const permitido = usuario?.activo === true && usuario.rol === 'DUEÑO' && !!usuario.kiosco_id
  const identity = `${usuario?.id}:${usuario?.auth_user_id}:${usuario?.kiosco_id}`
  const [revision, setRevision] = useState(0)
  const [response, setResponse] = useState<{ identity: string; value: Snapshot } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let vigente = true
    setResponse(null); setError(null)
    if (!enabled || !permitido) { setLoading(false); return }
    setLoading(true)
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('obtener_mi_suscripcion_comercial')
        if (rpcError || !data || !['ACTIVO', 'SOLO_LECTURA', 'SUSPENDIDO'].includes(data.estado)
          || !Array.isArray(data.pagos) || !data.instrucciones) throw new Error('snapshot')
        if (vigente) setResponse({ identity, value: data as Snapshot })
      } catch { if (vigente) setError('No se pudo consultar la suscripción. Reintentá o contactá administración.') }
      finally { if (vigente) setLoading(false) }
    })()
    return () => { vigente = false }
  }, [enabled, permitido, identity, revision])
  if (!enabled) return <section role="status"><h2>Administración comercial fuera del piloto</h2><p>La administración comercial y de suscripciones está fuera del alcance del piloto.</p></section>
  if (!permitido) return <section role="status">La información de suscripción está disponible únicamente para el Dueño.</section>
  const snapshot = response?.identity === identity ? response.value : null
  const sub = snapshot?.suscripcion
  const contact = snapshot?.instrucciones
  const estado = snapshot ? estados[snapshot.estado] : null
  const card = 'rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 shadow-xs'
  const bankDetails = [
    ['Titular', contact?.titular_cuenta], ['Banco', contact?.banco_nombre],
    ['Alias', contact?.alias_mp], ['CBU', contact?.cbu_banco],
  ].filter(([, value]) => Boolean(value))
  return <section className="space-y-5" aria-label="Suscripción del comercio" aria-busy={loading}>
    <header className={`${card} flex flex-col gap-4 bg-linear-to-br from-indigo-50/80 via-white to-white p-5 dark:from-indigo-950/40 dark:via-gray-800 dark:to-gray-800 sm:flex-row sm:items-center sm:justify-between sm:p-6`}>
      <div className="flex items-center gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-100 text-indigo-600 dark:border-indigo-700/60 dark:bg-indigo-900/60 dark:text-indigo-300"><CreditCard size={24} aria-hidden="true" /></span>
        <div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">Administración comercial</p>
          <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-100">Suscripción del comercio</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">Tu plan, su vigencia y los pagos confirmados, en un solo lugar.</p>
        </div>
      </div>
      <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={() => setRevision(r => r + 1)} className="shrink-0 self-start sm:self-auto">
        <RefreshCw size={15} aria-hidden="true" className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />Actualizar suscripción
      </Button>
    </header>
    {loading && <div className={`${card} p-6`}><p role="status" className="text-sm text-gray-500 dark:text-gray-400">Consultando suscripción...</p></div>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
    {snapshot && <>
      <div className={`${card} overflow-hidden`}>
        <dl className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
          <div><dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Plan actual</dt>
            <dd className="mt-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{sub?.plan?.nombre || 'Plan no disponible'}</dd>
            <dt className="sr-only">Estado</dt><dd className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${estado?.style}`}><ShieldCheck size={13} aria-hidden="true" />{estado?.label}</dd>
          </div>
          <div className="sm:border-l sm:border-gray-200 sm:pl-6 dark:sm:border-gray-700"><dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Precio mensual</dt>
            <dd className="mt-2"><span className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{sub?.plan ? formatPrecio(sub.plan.precio_mensual) : 'Precio no disponible'}</span><span className="mt-2 block text-xs text-gray-500 dark:text-gray-400">La renovación se confirma por administración.</span></dd>
          </div>
        </dl>
        <dl className="grid divide-y divide-gray-200 border-t border-gray-200 bg-gray-50/70 text-sm dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-900/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { label: 'Fecha de inicio', value: fechaComercial(sub?.fecha_inicio), Icon: CalendarDays },
            { label: 'Vencimiento', value: fechaComercial(sub?.fecha_vencimiento), Icon: CalendarDays },
            { label: 'Días restantes', value: snapshot.dias_restantes ?? 'No disponibles', Icon: Clock3 },
          ].map(({ label, value, Icon }) => <div key={label} className="flex items-center gap-3 px-5 py-4 sm:px-6"><Icon size={17} aria-hidden="true" className="shrink-0 text-gray-400 dark:text-gray-500" /><div><dt className="text-[11px] text-gray-500 dark:text-gray-400">{label}</dt><dd className="mt-1 font-semibold tabular-nums text-gray-900 dark:text-gray-100">{value}</dd></div></div>)}
        </dl>
      </div>
      {snapshot.estado !== 'ACTIVO' && <p role="status" className={`rounded-xl border p-4 text-sm leading-relaxed ${estado?.style}`}>{snapshot.estado === 'SOLO_LECTURA' ? 'Modo solo lectura: las nuevas ventas y escrituras operativas están bloqueadas. Contactá administración para regularizar.' : 'Servicio suspendido. La reactivación requiere autorización de administración.'}</p>}
      {snapshot.estado === 'ACTIVO' && snapshot.dias_restantes !== null && snapshot.dias_restantes <= 5 && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">La suscripción está próxima a vencer.</p>}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className={`${card} min-w-0 overflow-hidden`} aria-labelledby="subscription-payments-heading">
          <div className="flex items-center gap-2.5 border-b border-gray-200 px-5 py-4 dark:border-gray-700"><ReceiptText size={18} aria-hidden="true" className="text-indigo-500 dark:text-indigo-300" /><h3 id="subscription-payments-heading" className="text-sm font-bold text-gray-900 dark:text-gray-100">Historial de pagos</h3><span className="ml-auto rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-500 dark:bg-gray-700 dark:text-gray-300">{snapshot.pagos.length}</span></div>
          {snapshot.pagos.length === 0 ? <div className="px-6 py-9 text-center"><span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-700/50 dark:text-gray-500"><ReceiptText size={21} aria-hidden="true" /></span><p className="text-sm font-semibold text-gray-700 dark:text-gray-200">No hay pagos registrados.</p><p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-gray-500 dark:text-gray-400">Cuando administración confirme un pago, lo vas a encontrar acá.</p></div>
            : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Pagos confirmados de tu suscripción</caption><thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 dark:bg-gray-900/20 dark:text-gray-400"><tr>{['Fecha','Monto','Medio','Meses'].map(label => <th key={label} scope="col" className="whitespace-nowrap px-5 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 text-gray-700 dark:divide-gray-700 dark:text-gray-200">{snapshot.pagos.map(p => <tr key={p.id}><td className="whitespace-nowrap px-5 py-3 tabular-nums">{formatFechaCorta(p.fecha_pago)}</td><td className="whitespace-nowrap px-5 py-3 font-semibold tabular-nums">{formatPrecio(p.monto)}</td><td className="px-5 py-3">{p.medio_pago || '—'}</td><td className="px-5 py-3 tabular-nums">{p.meses ?? '—'}</td></tr>)}</tbody></table></div>}
        </section>
        <section className={`${card} p-5 sm:p-6`} aria-labelledby="subscription-renewal-heading">
          <div className="mb-4 flex items-center gap-2.5"><Wallet size={18} aria-hidden="true" className="text-indigo-500 dark:text-indigo-300" /><h3 id="subscription-renewal-heading" className="text-sm font-bold text-gray-900 dark:text-gray-100">Regularización</h3></div>
          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">La renovación se confirma por administración después de verificar el pago manual.</p>
          {bankDetails.length > 0 && <dl className="mt-4 space-y-3 rounded-xl bg-gray-50 p-4 dark:bg-gray-900/30">{bankDetails.map(([label,value]) => <div key={label}><dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</dt><dd className="mt-0.5 break-all text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</dd></div>)}</dl>}
          {contact?.whatsapp_soporte ? <a className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500" href={formatearLinkWhatsApp(contact.whatsapp_soporte, contact.mensaje_soporte)} target="_blank" rel="noopener noreferrer">Contactar administración<ArrowUpRight size={16} aria-hidden="true" /></a>
            : <p className="mt-4 rounded-xl border border-dashed border-gray-200 p-3 text-xs leading-relaxed text-gray-500 dark:border-gray-600 dark:text-gray-400">Solicitá las instrucciones de pago a administración.</p>}
        </section>
      </div>
    </>}
  </section>
}
