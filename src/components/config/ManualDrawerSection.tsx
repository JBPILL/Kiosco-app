import { useRef, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { solicitarAperturaManualCajon } from '../../lib/manualDrawer'

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
    setOcupado(true); setMensaje('')
    const resultado = await solicitarAperturaManualCajon(motivo)
    const actual = useAuthStore.getState().usuario
    if (solicitud === secuencia.current && actual?.activo && actual.rol === 'DUEÑO'
      && JSON.stringify([actual.id, actual.auth_user_id, actual.kiosco_id]) === contexto) {
      setContextoMensaje(contexto); setMensaje(resultado.mensaje)
      if (resultado.ok) setMotivo('')
    }
    setOcupado(false)
  }
  return <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-xs">
    <h2 className="text-sm font-bold dark:text-gray-100">Apertura manual del cajón</h2>
    <div className="mt-3 flex flex-wrap gap-3">
      <input aria-label="Motivo de apertura manual" placeholder="Motivo de apertura" maxLength={300} value={motivo} onChange={event => setMotivo(event.target.value)} disabled={ocupado} className="min-w-0 flex-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-transparent p-3 dark:text-gray-100" />
      <button type="button" disabled={ocupado || motivo.trim().length < 5} onClick={() => void ejecutar()} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{ocupado ? 'Solicitando…' : 'Abrir cajón'}</button>
    </div>
    {mensaje && contextoMensaje === contexto && <p role="status" className="mt-3 text-xs text-gray-500">{mensaje}</p>}
  </section>
}
