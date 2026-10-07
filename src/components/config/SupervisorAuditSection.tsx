import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { RefreshButton } from '../ui/RefreshButton'

interface EventoSupervisor {
  id: string; fecha: string; evento: string; resultado: string; accion: string; actor_auth_id: string; revision: number
}
function leerEventos(datos: unknown): EventoSupervisor[] {
  if (!Array.isArray(datos) || datos.length > 50) throw new Error('Auditoría inválida')
  return datos.map((valor: unknown) => {
    if (!valor || typeof valor !== 'object') throw new Error('Evento inválido')
    const fila = valor as Record<string, unknown>
    if (Object.keys(fila).length !== 7 || !['id','fecha','evento','resultado','accion','actor_auth_id'].every(k => typeof fila[k] === 'string')
      || !Number.isFinite(Date.parse(String(fila.fecha))) || !Number.isSafeInteger(fila.revision) || Number(fila.revision) < 1
      || !['INTENTO_PIN','CONFIGURACION_PIN','PERMISO'].includes(String(fila.evento))
      || !['VALIDO','INVALIDO','VENCIDO','PENDIENTE','CONFIGURADO','CONSUMIDO','VIGENTE'].includes(String(fila.resultado))) throw new Error('Evento inválido')
    return fila as unknown as EventoSupervisor
  })
}
const etiquetas: Record<string, string> = { INTENTO_PIN: 'Intento de PIN', CONFIGURACION_PIN: 'Configuración del PIN', PERMISO: 'Permiso de descuento',
  VALIDO: 'PIN válido', INVALIDO: 'PIN rechazado', VENCIDO: 'Vencido', PENDIENTE: 'Pendiente', CONFIGURADO: 'Guardado', CONSUMIDO: 'Utilizado', VIGENTE: 'Vigente' }

export function SupervisorAuditSection() {
  const usuario = useAuthStore(state => state.usuario)
  const [eventos, setEventos] = useState<EventoSupervisor[]>([])
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [recarga, setRecarga] = useState(0)
  const contexto = JSON.stringify([usuario?.id, usuario?.auth_user_id, usuario?.kiosco_id, usuario?.rol, usuario?.activo])
  const [contextoResultado, setContextoResultado] = useState('')
  const secuencia = useRef(0)
  useEffect(() => {
    const solicitud = ++secuencia.current
    setContextoResultado(contexto)
    setEventos([]); setError(''); setCargando(false)
    if (usuario?.rol !== 'DUEÑO' || !usuario.activo) return
    setCargando(true)
    void (async () => {
      try {
        const { data, error: fallo } = await supabase.rpc('consultar_auditoria_supervisor', { p_limite: 50 })
        const actual = useAuthStore.getState().usuario
        if (secuencia.current !== solicitud || actual?.id !== usuario.id || actual.auth_user_id !== usuario.auth_user_id
          || actual.kiosco_id !== usuario.kiosco_id || !actual.activo || actual.rol !== 'DUEÑO') return
        if (fallo) throw new Error('Consulta fallida')
        setEventos(leerEventos(data))
      } catch { if (secuencia.current === solicitud) setError('No se pudo consultar la auditoría. Verificá la migración y la conexión.') }
      finally { if (secuencia.current === solicitud) setCargando(false) }
    })()
    return () => { secuencia.current++ }
  }, [usuario?.id, usuario?.auth_user_id, usuario?.kiosco_id, usuario?.rol, usuario?.activo, recarga])
  if (usuario?.rol !== 'DUEÑO' || !usuario.activo) return null
  const corresponde = contextoResultado === contexto
  return <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6 shadow-xs">
    <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-bold dark:text-gray-100">Auditoría del supervisor</h2><RefreshButton refreshing={cargando} label="Actualizar auditoría" onClick={() => setRecarga(valor => valor + 1)} /></div>
    {corresponde && error && <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
    {corresponde && !error && !cargando && !eventos.length && <p className="mt-3 text-xs text-gray-500">Sin eventos registrados</p>}
    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{(corresponde ? eventos : []).map(fila => <article key={`${fila.evento}/${fila.id}`} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex flex-wrap justify-between gap-2 text-xs"><span className="font-semibold dark:text-gray-200">{etiquetas[fila.evento]}</span><span className="text-indigo-600 dark:text-indigo-300">{etiquetas[fila.resultado]}</span></div>
      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{new Date(fila.fecha).toLocaleString('es-AR')} · Actor {fila.actor_auth_id.slice(0, 8)} · Revisión {fila.revision}</p>
    </article>)}</div>
  </section>
}
