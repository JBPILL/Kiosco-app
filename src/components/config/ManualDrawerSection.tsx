import { useRef, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { solicitarAperturaManualCajon } from '../../lib/manualDrawer'
import { Inbox } from './ConfigIcons'

export function ManualDrawerSection() {
  const usuario = useAuthStore(state => state.usuario)
  if (!usuario?.activo || usuario.rol !== 'DUEÑO' || !usuario.auth_user_id || !usuario.kiosco_id) return null
  const contexto = JSON.stringify([usuario.id, usuario.auth_user_id, usuario.kiosco_id])
  return <ManualDrawerForm key={contexto} contexto={contexto} />
}

function ManualDrawerForm({ contexto }: { contexto: string }) {
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [contextoMensaje, setContextoMensaje] = useState('')
  const secuencia = useRef(0)

  const ejecutar = async () => {
    const solicitud = ++secuencia.current
    setOcupado(true)
    setMensaje('')
    const resultado = await solicitarAperturaManualCajon(motivo)
    const actual = useAuthStore.getState().usuario
    if (
      solicitud === secuencia.current &&
      actual?.activo &&
      actual.rol === 'DUEÑO' &&
      JSON.stringify([actual.id, actual.auth_user_id, actual.kiosco_id]) === contexto
    ) {
      setContextoMensaje(contexto)
      setMensaje(resultado.mensaje)
      if (resultado.ok) setMotivo('')
    }
    setOcupado(false)
  }

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b border-gray-100 dark:border-gray-700/60">
        <span className="rounded-xl bg-teal-50 dark:bg-teal-950/40 p-2.5 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-900/50">
          <Inbox size={20} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Apertura manual del cajón</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Disparo directo de pulso al cajón monedero con registro obligatorio del motivo para auditoría.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            aria-label="Motivo de apertura manual"
            placeholder="Motivo de apertura (ej. Reponer cambio o extracción autorizada)"
            maxLength={300}
            value={motivo}
            onChange={event => setMotivo(event.target.value)}
            disabled={ocupado}
            className="min-w-0 flex-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 px-3.5 py-2.5 text-sm dark:text-gray-100 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
          <button
            type="button"
            disabled={ocupado || motivo.trim().length < 5}
            onClick={() => void ejecutar()}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed shrink-0"
          >
            {ocupado ? 'Solicitando…' : 'Abrir cajón'}
          </button>
        </div>

        {mensaje && contextoMensaje === contexto && (
          <p
            role="status"
            className={`text-xs ${
              mensaje.includes('enviado')
                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'text-amber-600 dark:text-amber-400 font-medium'
            }`}
          >
            {mensaje}
          </p>
        )}
      </div>
    </section>
  )
}

