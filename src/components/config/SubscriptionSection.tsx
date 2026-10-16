import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { administracionComercialHabilitada } from '../../lib/commercialScope'
import { useAuthStore } from '../../stores/authStore'
import type { PagoSuscripcion, Suscripcion } from '../../types/database'
import type { ConfiguracionAdmin } from '../../stores/configAdminStore'
import { formatearLinkWhatsApp } from '../../stores/configAdminStore'
import { formatPrecio, formatFechaCorta } from '../../lib/utils'

interface Snapshot {
  suscripcion: Suscripcion | null
  estado: 'ACTIVO' | 'SOLO_LECTURA' | 'SUSPENDIDO'
  dias_restantes: number | null
  pagos: PagoSuscripcion[]
  instrucciones: ConfiguracionAdmin
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
  return <section className="space-y-4" aria-label="Suscripción del comercio">
    <h2 className="text-lg font-bold">Suscripción del comercio</h2>
    {loading && <p role="status">Consultando suscripción...</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={loading} onClick={() => setRevision(r => r + 1)}>Actualizar suscripción</button>
    {snapshot && <>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt>Plan actual</dt><dd>{sub?.plan?.nombre || 'Plan no disponible'}</dd></div>
        <div><dt>Precio mensual</dt><dd>{sub?.plan ? formatPrecio(sub.plan.precio_mensual) : 'Precio no disponible'}</dd></div>
        <div><dt>Estado</dt><dd>{snapshot.estado}</dd></div>
        <div><dt>Fecha de inicio</dt><dd>{sub?.fecha_inicio ? formatFechaCorta(sub.fecha_inicio) : 'No disponible'}</dd></div>
        <div><dt>Vencimiento</dt><dd>{sub?.fecha_vencimiento ? formatFechaCorta(sub.fecha_vencimiento) : 'No disponible'}</dd></div>
        <div><dt>Días restantes</dt><dd>{snapshot.dias_restantes ?? 'No disponibles'}</dd></div>
      </dl>
      {snapshot.estado === 'SOLO_LECTURA' && <p role="status">Modo solo lectura: las nuevas ventas y escrituras operativas están bloqueadas. Contactá administración para regularizar.</p>}
      {snapshot.estado === 'SUSPENDIDO' && <p role="status">Servicio suspendido. La reactivación requiere autorización de administración.</p>}
      {snapshot.estado === 'ACTIVO' && snapshot.dias_restantes !== null && snapshot.dias_restantes <= 5 && <p role="status">La suscripción está próxima a vencer.</p>}
      <h3 className="font-semibold">Historial de pagos</h3>
      {snapshot.pagos.length === 0 ? <p>No hay pagos registrados.</p> : <table><thead><tr><th>Fecha</th><th>Monto</th><th>Medio</th><th>Meses</th></tr></thead>
        <tbody>{snapshot.pagos.map(p => <tr key={p.id}><td>{formatFechaCorta(p.fecha_pago)}</td><td>{formatPrecio(p.monto)}</td><td>{p.medio_pago || '—'}</td><td>{p.meses ?? '—'}</td></tr>)}</tbody></table>}
      <h3 className="font-semibold">Regularización</h3>
      <p>La renovación se confirma por administración después de verificar el pago manual.</p>
      {contact?.titular_cuenta && <p>Titular: {contact.titular_cuenta}</p>}
      {contact?.banco_nombre && <p>Banco: {contact.banco_nombre}</p>}
      {contact?.alias_mp && <p>Alias: {contact.alias_mp}</p>}
      {contact?.cbu_banco && <p>CBU: {contact.cbu_banco}</p>}
      {contact?.whatsapp_soporte
        ? <a href={formatearLinkWhatsApp(contact.whatsapp_soporte, contact.mensaje_soporte)} target="_blank" rel="noopener noreferrer">Contactar administración</a>
        : <p>Solicitá las instrucciones de pago a administración.</p>}
    </>}
  </section>
}
