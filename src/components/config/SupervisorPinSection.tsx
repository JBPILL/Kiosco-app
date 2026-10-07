import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { consultarPinSupervisor, configurarPinSupervisor } from '../../lib/supervisorPinClient'
import { Button } from '../ui/Button'

export function SupervisorPinSection() {
  const usuario = useAuthStore(state => state.usuario)
  const [configurado, setConfigurado] = useState<boolean | null>(null)
  const [pin, setPin] = useState('')
  const [repetirPin, setRepetirPin] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const generacion = useRef(0)
  const enviando = useRef(false)

  useEffect(() => {
    const turno = ++generacion.current
    setPin('')
    setRepetirPin('')
    setConfigurado(null)
    setOcupado(false)
    setMensaje('')
    if (usuario?.rol === 'DUEÑO') {
      void consultarPinSupervisor().then(valor => {
        if (generacion.current === turno) setConfigurado(valor)
      }).catch(() => {
        if (generacion.current === turno) setMensaje('No se pudo consultar el PIN de supervisor')
      })
    }
    return () => { generacion.current++ }
  }, [usuario?.id, usuario?.auth_user_id, usuario?.kiosco_id, usuario?.rol])

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (enviando.current || !/^[0-9]{4,6}$/.test(pin) || pin !== repetirPin) return
    enviando.current = true
    const turno = generacion.current
    setOcupado(true)
    setMensaje('')
    try {
      await configurarPinSupervisor(pin, repetirPin)
      if (generacion.current === turno) {
        setConfigurado(true)
        setMensaje('PIN de supervisor guardado')
      }
    } catch {
      if (generacion.current === turno) setMensaje('No se pudo guardar el PIN. Revisá la conexión y repetí la operación.')
    } finally {
      enviando.current = false
      if (generacion.current === turno) {
        setPin('')
        setRepetirPin('')
        setOcupado(false)
      }
    }
  }

  if (usuario?.rol !== 'DUEÑO') return null
  const valido = /^[0-9]{4,6}$/.test(pin) && pin === repetirPin
  const estilo = 'w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 px-3.5 py-2.5 text-sm dark:text-gray-100 outline-none focus:ring-2 focus:ring-indigo-500/30'
  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6 shadow-xs">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">PIN de supervisor</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">{configurado === null ? 'Estado sin verificar' : configurado ? 'Configurado' : 'Sin configurar'}</span>
      </div>
      <form onSubmit={guardar} className="space-y-4" autoComplete="off">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
            <span className="block">{configurado ? 'Nuevo PIN' : 'PIN'} (4 a 6 dígitos)</span>
            <input aria-label="PIN de supervisor" type="password" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} autoComplete="new-password" required value={pin} disabled={ocupado} onChange={event => setPin(event.target.value)} className={estilo} />
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
            <span className="block">Repetir PIN</span>
            <input aria-label="Repetir PIN de supervisor" type="password" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} autoComplete="new-password" required value={repetirPin} disabled={ocupado} onChange={event => setRepetirPin(event.target.value)} className={estilo} />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-xs text-gray-500 dark:text-gray-400">{mensaje || (repetirPin && pin !== repetirPin ? 'Los PIN no coinciden' : '')}</p>
          <Button type="submit" size="sm" loading={ocupado} disabled={!valido}>{configurado ? 'Cambiar PIN' : 'Guardar PIN'}</Button>
        </div>
      </form>
    </section>
  )
}
