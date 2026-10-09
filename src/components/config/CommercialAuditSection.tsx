import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { RefreshButton } from '../ui/RefreshButton'
import { History } from './ConfigIcons'

interface EventoComercial {
  id: string
  fecha: string
  accion: string
  entidad: string
  entidad_id: string
  motivo: string | null
  actor_auth_id: string | null
  actor_rol: string | null
  detalles: Record<string, unknown>
}

function leerEventos(datos: unknown): EventoComercial[] {
  if (!Array.isArray(datos) || datos.length > 50) throw new Error('Auditoría inválida')
  return datos.map((valor: unknown) => {
    if (!valor || typeof valor !== 'object') throw new Error('Evento inválido')
    const fila = valor as Record<string, unknown>
    if (
      Object.keys(fila).length !== 9 ||
      !['id', 'fecha', 'accion', 'entidad', 'entidad_id'].every(k => typeof fila[k] === 'string') ||
      !Number.isFinite(Date.parse(String(fila.fecha))) ||
      !['motivo', 'actor_auth_id', 'actor_rol'].every(k => fila[k] === null || typeof fila[k] === 'string') ||
      !fila.detalles ||
      typeof fila.detalles !== 'object' ||
      Array.isArray(fila.detalles)
    ) {
      throw new Error('Evento inválido')
    }
    const detalles = fila.detalles as Record<string, unknown>
    if (fila.accion === 'PRECIO_VENTA_MODIFICADO' && fila.entidad === 'productos') {
      if (
        Object.keys(detalles).length !== 2 ||
        !['precio_anterior', 'precio_nuevo'].every(k => typeof detalles[k] === 'number' && Number.isFinite(detalles[k]) && Number(detalles[k]) >= 0)
      ) {
        throw new Error('Precios inválidos')
      }
    } else if (fila.accion === 'CAJON_RESULTADO_DECLARADO' && fila.entidad === 'solicitudes_cajon') {
      if (
        Object.keys(detalles).length !== 2 ||
        detalles.origen !== 'NAVEGADOR' ||
        !['PULSO_ENVIADO', 'ERROR_TRANSPORTE', 'NO_ENVIADO'].includes(String(detalles.resultado))
      ) {
        throw new Error('Resultado inválido')
      }
    } else if (
      !(
        (fila.accion === 'VENTA_ANULADA' && fila.entidad === 'ventas') ||
        (fila.accion === 'CAJON_APERTURA_SOLICITADA' && fila.entidad === 'kioscos')
      ) ||
      Object.keys(detalles).length !== 0
    ) {
      throw new Error('Acción inválida')
    }
    return fila as unknown as EventoComercial
  })
}

const moneda = (valor: unknown) => Number(valor).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
const acciones: Record<string, string> = {
  VENTA_ANULADA: 'Venta anulada',
  PRECIO_VENTA_MODIFICADO: 'Cambio de precio',
  CAJON_APERTURA_SOLICITADA: 'Solicitud de apertura de cajón',
  CAJON_RESULTADO_DECLARADO: 'Resultado declarado del cajón',
}
const resultados: Record<string, string> = {
  PULSO_ENVIADO: 'El navegador informó pulso enviado',
  ERROR_TRANSPORTE: 'El navegador informó error de transporte',
  NO_ENVIADO: 'El navegador informó pulso no enviado',
}

function accionBadgeClass(accion: string): string {
  switch (accion) {
    case 'VENTA_ANULADA':
      return 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-800/60'
    case 'PRECIO_VENTA_MODIFICADO':
      return 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/60'
    case 'CAJON_APERTURA_SOLICITADA':
    case 'CAJON_RESULTADO_DECLARADO':
    default:
      return 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200/80 dark:border-indigo-800/60'
  }
}

export interface CommercialAuditSectionProps {
  recargaTrigger?: number
  mostrarBotonRefresco?: boolean
}

export function CommercialAuditSection({
  recargaTrigger = 0,
  mostrarBotonRefresco = false,
}: CommercialAuditSectionProps = {}) {
  const usuario = useAuthStore(state => state.usuario)
  const [eventos, setEventos] = useState<EventoComercial[]>([])
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
        const { data, error: fallo } = await supabase.rpc('consultar_auditoria_comercial', { p_limite: 50 })
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
    <section aria-busy={cargando} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-700/60">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-purple-50 dark:bg-purple-950/40 p-2.5 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/50">
            <History size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Auditoría comercial</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Control de anulaciones de tickets, modificaciones de precios y aperturas manuales de cajón.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {corresponde && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              {eventos.length} registros
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

      {corresponde && cargando && (
        <div role="status" className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 text-xs text-indigo-700 dark:text-indigo-300 font-medium flex items-center gap-2">
          <div className="h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span>Consultando auditoría…</span>
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
              key={fila.id}
              className="rounded-xl border border-gray-200/80 dark:border-gray-700/80 bg-gray-50/40 dark:bg-gray-900/30 p-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${accionBadgeClass(fila.accion)}`}>
                  {acciones[fila.accion]}
                </span>
                <span className="text-indigo-600 dark:text-indigo-300 font-mono text-xs font-semibold bg-indigo-50/60 dark:bg-indigo-950/40 px-2 py-0.5 rounded">
                  {fila.entidad_id.slice(0, 8)}
                </span>
              </div>

              {fila.accion === 'CAJON_RESULTADO_DECLARADO' && (
                <p className="mt-2 text-xs font-semibold text-gray-800 dark:text-gray-200">
                  {resultados[String(fila.detalles.resultado)]}
                </p>
              )}

              {fila.accion === 'PRECIO_VENTA_MODIFICADO' && (
                <div className="mt-2 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-amber-50/60 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200/60 dark:border-amber-800/40 inline-block">
                  {moneda(fila.detalles.precio_anterior)} → {moneda(fila.detalles.precio_nuevo)}
                </div>
              )}

              <p className="mt-2 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                {fila.motivo || 'Sin motivo registrado'}
              </p>

              <div className="mt-2.5 pt-2 border-t border-gray-200/60 dark:border-gray-700/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                <span>{new Date(fila.fecha).toLocaleString('es-AR')}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono bg-gray-200/70 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[10px]">
                    Actor {fila.actor_auth_id?.slice(0, 8) || 'No registrado'}
                  </span>
                  <span>· {fila.actor_rol || 'Sin rol registrado'}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

