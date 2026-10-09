import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { RefreshButton } from '../ui/RefreshButton'
import { ShieldCheck } from './ConfigIcons'

interface EventoSupervisor {
  id: string
  fecha: string
  evento: string
  resultado: string
  accion: string
  actor_auth_id: string
  revision: number
}

function detallePolitica(accion: string): string | null {
  const valores = /^UMBRAL (\d{1,3}(?:\.\d{1,2})?) -> (\d{1,3}(?:\.\d{1,2})?)$/.exec(accion)
  if (!valores || Number(valores[1]) > 100 || Number(valores[2]) > 100) return null
  return `Umbral: ${Number(valores[1]).toLocaleString('es-AR')}% → ${Number(valores[2]).toLocaleString('es-AR')}%`
}

function leerEventos(datos: unknown): EventoSupervisor[] {
  if (!Array.isArray(datos) || datos.length > 50) throw new Error('Auditoría inválida')
  return datos.map((valor: unknown) => {
    if (!valor || typeof valor !== 'object') throw new Error('Evento inválido')
    const fila = valor as Record<string, unknown>
    if (
      Object.keys(fila).length !== 7 ||
      !['id', 'fecha', 'evento', 'resultado', 'accion', 'actor_auth_id'].every(k => typeof fila[k] === 'string') ||
      !Number.isFinite(Date.parse(String(fila.fecha))) ||
      !Number.isSafeInteger(fila.revision) ||
      Number(fila.revision) < 1 ||
      !['INTENTO_PIN', 'CONFIGURACION_PIN', 'PERMISO', 'POLITICA_DESCUENTO'].includes(String(fila.evento)) ||
      !['VALIDO', 'INVALIDO', 'VENCIDO', 'PENDIENTE', 'CONFIGURADO', 'CONSUMIDO', 'VIGENTE'].includes(String(fila.resultado))
    ) {
      throw new Error('Evento inválido')
    }
    if (fila.evento === 'POLITICA_DESCUENTO' && (fila.resultado !== 'CONFIGURADO' || !detallePolitica(String(fila.accion)))) {
      throw new Error('Política inválida')
    }
    return fila as unknown as EventoSupervisor
  })
}

const etiquetas: Record<string, string> = {
  INTENTO_PIN: 'Intento de PIN',
  CONFIGURACION_PIN: 'Configuración del PIN',
  PERMISO: 'Permiso de descuento',
  POLITICA_DESCUENTO: 'Política de descuento',
  VALIDO: 'PIN válido',
  INVALIDO: 'PIN rechazado',
  VENCIDO: 'Vencido',
  PENDIENTE: 'Pendiente',
  CONFIGURADO: 'Guardado',
  CONSUMIDO: 'Utilizado',
  VIGENTE: 'Vigente',
}

function resultadoBadgeClass(resultado: string): string {
  switch (resultado) {
    case 'VALIDO':
    case 'CONFIGURADO':
    case 'CONSUMIDO':
      return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60'
    case 'INVALIDO':
    case 'VENCIDO':
      return 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-800/60'
    case 'PENDIENTE':
    case 'VIGENTE':
    default:
      return 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200/80 dark:border-indigo-800/60'
  }
}

export interface SupervisorAuditSectionProps {
  recargaTrigger?: number
  mostrarBotonRefresco?: boolean
}

export function SupervisorAuditSection({
  recargaTrigger = 0,
  mostrarBotonRefresco = false,
}: SupervisorAuditSectionProps = {}) {
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
    setEventos([])
    setError('')
    setCargando(false)
    if (usuario?.rol !== 'DUEÑO' || !usuario.activo) return
    setCargando(true)
    void (async () => {
      try {
        const { data, error: fallo } = await supabase.rpc('consultar_auditoria_supervisor', { p_limite: 50 })
        const actual = useAuthStore.getState().usuario
        if (
          secuencia.current !== solicitud ||
          actual?.id !== usuario.id ||
          actual.auth_user_id !== usuario.auth_user_id ||
          actual.kiosco_id !== usuario.kiosco_id ||
          !actual.activo ||
          actual.rol !== 'DUEÑO'
        ) {
          return
        }
        if (fallo) throw new Error('Consulta fallida')
        setEventos(leerEventos(data))
      } catch {
        if (secuencia.current === solicitud) {
          setError('No se pudo consultar la auditoría. Verificá la migración y la conexión.')
        }
      } finally {
        if (secuencia.current === solicitud) setCargando(false)
      }
    })()
    return () => { secuencia.current++ }
  }, [usuario?.id, usuario?.auth_user_id, usuario?.kiosco_id, usuario?.rol, usuario?.activo, recarga, recargaTrigger])

  if (usuario?.rol !== 'DUEÑO' || !usuario.activo) return null
  const corresponde = contextoResultado === contexto

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-700/60">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-blue-50 dark:bg-blue-950/40 p-2.5 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Auditoría del supervisor</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Historial de validaciones de PIN, autorizaciones y modificaciones de umbral.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {corresponde && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              {eventos.length} eventos registrados
            </span>
          )}
          {mostrarBotonRefresco && (
            <RefreshButton
              refreshing={cargando}
              label="Actualizar auditoría"
              onClick={() => setRecarga(valor => valor + 1)}
            />
          )}
        </div>
      </div>

      {corresponde && error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 font-medium">
          {error}
        </div>
      )}

      {corresponde && !error && !cargando && !eventos.length && (
        <div className="py-8 text-center bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-700/60">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Sin eventos registrados</p>
        </div>
      )}

      {corresponde && Boolean(eventos.length) && (
        <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
          {eventos.map(fila => (
            <article
              key={`${fila.evento}/${fila.id}`}
              className="rounded-xl border border-gray-200/80 dark:border-gray-700/80 bg-gray-50/40 dark:bg-gray-900/30 p-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
                  {etiquetas[fila.evento]}
                </span>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${resultadoBadgeClass(fila.resultado)}`}>
                  {etiquetas[fila.resultado]}
                </span>
              </div>

              {fila.evento === 'POLITICA_DESCUENTO' && (
                <p className="mt-1.5 text-xs text-indigo-600 dark:text-indigo-300 font-semibold">
                  {detallePolitica(fila.accion)}
                </p>
              )}

              <div className="mt-2 pt-2 border-t border-gray-200/60 dark:border-gray-700/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                <span>{new Date(fila.fecha).toLocaleString('es-AR')}</span>
                <div className="flex items-center gap-2 font-mono">
                  <span className="bg-gray-200/70 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[10px]">
                    Actor {fila.actor_auth_id.slice(0, 8)}
                  </span>
                  <span className="text-[10px] text-gray-400">Rev. {fila.revision}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

