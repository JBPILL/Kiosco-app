import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { consultarPinSupervisor, configurarPinSupervisor } from '../../lib/supervisorPinClient'
import { Button } from '../ui/Button'
import { Key } from './ConfigIcons'

export interface SupervisorPinSectionProps {
  recargaTrigger?: number
}

export function SupervisorPinSection({ recargaTrigger = 0 }: SupervisorPinSectionProps = {}) {
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
  }, [usuario?.id, usuario?.auth_user_id, usuario?.kiosco_id, usuario?.rol, recargaTrigger])

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
  const estilo = 'w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 px-3.5 py-2.5 text-sm dark:text-gray-100 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-700/60">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-indigo-50 dark:bg-indigo-950/40 p-2.5 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
            <Key size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">PIN de supervisor</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Autorización obligatoria para desbloquear descuentos superiores o anular comprobantes en caja.
            </p>
          </div>
        </div>

        <div>
          {configurado === null ? (
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-700/80 text-gray-600 dark:text-gray-300">
              Estado sin verificar
            </span>
          ) : configurado ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Configurado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Sin configurar
            </span>
          )}
        </div>
      </div>

      <form onSubmit={guardar} className="space-y-4" autoComplete="off">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
            <span className="block">{configurado ? 'Nuevo PIN' : 'PIN'} (4 a 6 dígitos)</span>
            <input
              aria-label="PIN de supervisor"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4,6}"
              minLength={4}
              maxLength={6}
              autoComplete="new-password"
              required
              value={pin}
              disabled={ocupado}
              placeholder="••••"
              onChange={event => setPin(event.target.value)}
              className={estilo}
            />
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
            <span className="block">Repetir PIN</span>
            <input
              aria-label="Repetir PIN de supervisor"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4,6}"
              minLength={4}
              maxLength={6}
              autoComplete="new-password"
              required
              value={repetirPin}
              disabled={ocupado}
              placeholder="••••"
              onChange={event => setRepetirPin(event.target.value)}
              className={estilo}
            />
          </label>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
          <p
            role="status"
            className={`text-xs ${
              mensaje.includes('guardado')
                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                : mensaje.includes('No se pudo')
                ? 'text-amber-600 dark:text-amber-400 font-medium'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {mensaje || (repetirPin && pin !== repetirPin ? 'Los PIN no coinciden' : '')}
          </p>
          <Button type="submit" size="sm" loading={ocupado} disabled={!valido} className="shadow-xs font-semibold">
            {configurado ? 'Cambiar PIN' : 'Guardar PIN'}
          </Button>
        </div>
      </form>
    </section>
  )
}

