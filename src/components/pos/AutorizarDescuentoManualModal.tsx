import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { autorizarDescuentoSupervisor } from '../../lib/supervisorPinClient'
import type { CobroManualLocal } from '../../lib/manualCheckoutOutbox'
import { formatPrecio } from '../../lib/utils'
import { SupervisorPinBloqueado } from '../../lib/supervisorPinBlocked'

export function AutorizarDescuentoManualModal({ cobro, onClose, onAutorizado }: {
  cobro: CobroManualLocal; onClose: () => void; onAutorizado: () => void
}) {
  const [pin, setPin] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const enviando = useRef(false)
  const vigente = useRef(true)
  useEffect(() => { vigente.current = true; return () => { vigente.current = false } }, [])

  async function autorizar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (enviando.current || !/^[0-9]{4,6}$/.test(pin)) return
    enviando.current = true
    setOcupado(true)
    setError('')
    try {
      await autorizarDescuentoSupervisor(cobro.entrada, pin)
      if (vigente.current) onAutorizado()
    } catch (causa) {
      if (vigente.current) setError(causa instanceof SupervisorPinBloqueado ? causa.message : 'No se pudo autorizar. Revisá el PIN, la sesión y la conexión.')
    } finally {
      enviando.current = false
      if (vigente.current) { setPin(''); setOcupado(false) }
    }
  }

  return <Modal isOpen title="Autorizar descuento" size="sm" onClose={() => { if (!enviando.current) onClose() }}>
    <form onSubmit={autorizar} className="space-y-4" autoComplete="off">
      <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-3 shadow-xs">
        <p className="text-xs text-gray-500 dark:text-gray-400">Ticket {cobro.id.slice(0, 8).toUpperCase()}</p>
        <p className="text-lg font-bold text-indigo-600 dark:text-indigo-300">{formatPrecio(cobro.entrada.totalEsperado)}</p>
      </div>
      <label className="block space-y-2 text-sm font-semibold dark:text-gray-200">
        <span>PIN del supervisor</span>
        <input autoFocus aria-label="PIN del supervisor" type="password" inputMode="numeric" minLength={4} maxLength={6} pattern="[0-9]{4,6}" autoComplete="off" required disabled={ocupado} value={pin} onChange={event => setPin(event.target.value)} className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 px-4 py-3 text-center text-xl tracking-widest outline-none focus:ring-2 focus:ring-indigo-500/30" />
      </label>
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" size="sm" disabled={ocupado} onClick={onClose}>Cancelar</Button><Button type="submit" size="sm" loading={ocupado} disabled={!/^[0-9]{4,6}$/.test(pin)}>Autorizar</Button></div>
    </form>
  </Modal>
}
