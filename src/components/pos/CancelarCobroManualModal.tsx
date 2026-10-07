import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { cancelarCobroManualLocal } from '../../lib/manualCheckoutClient'
import { useAuthStore } from '../../stores/authStore'
import type { CobroManualLocal, SolicitudCancelacionManual } from '../../lib/manualCheckoutOutbox'
import { formatPrecio } from '../../lib/utils'

interface Props { cobro: CobroManualLocal; onClose: () => void; onCancelado: () => void; onConfirmar?: (solicitud: SolicitudCancelacionManual) => Promise<unknown> }
export function CancelarCobroManualModal({ cobro, onClose, onCancelado, onConfirmar }: Props) {
  const [motivo, setMotivo] = useState(cobro.cancelacion?.motivo || '')
  const [resolucion, setResolucion] = useState<SolicitudCancelacionManual['resolucion']>(cobro.cancelacion?.resolucion || 'NO_COBRADO')
  const [referencia, setReferencia] = useState(cobro.cancelacion?.referencia || '')
  const [declarado, setDeclarado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const original = Boolean(cobro.cancelacion)
  async function confirmar(event: React.FormEvent) {
    event.preventDefault()
    if (ocupado || !declarado) return
    const actor = useAuthStore.getState().usuario
    if (!actor?.activo || actor.rol !== 'DUEÑO' || actor.kiosco_id !== cobro.kioscoId) { setError('Se requiere la sesión del dueño del comercio.'); return }
    setOcupado(true); setError('')
    try {
      const solicitud = { motivo, resolucion, referencia: referencia || null }
      if (onConfirmar) await onConfirmar(solicitud)
      else await cancelarCobroManualLocal(cobro.id, solicitud)
      const vigente = useAuthStore.getState().usuario
      if (vigente?.id !== actor.id || vigente.kiosco_id !== actor.kiosco_id) return
      onCancelado()
    } catch {
      setError('Cancelación sin confirmar. La solicitud se conserva; reintentá con sus datos originales. Si existe una venta, revisala en Reportes.')
    } finally { setOcupado(false) }
  }
  const campo = 'w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100'
  return <Modal isOpen onClose={() => { if (!ocupado) onClose() }} title="Cancelar cobro pendiente" size="md">
    <form onSubmit={confirmar} className="space-y-4">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4"><p className="text-xs text-gray-500">Ticket {cobro.id.slice(0, 8).toUpperCase()}</p><p className="mt-1 text-xl font-bold">{formatPrecio(cobro.entrada.totalEsperado)}</p></div>
      <label className="block text-xs font-semibold">Resolución del dinero<select aria-label="Resolución del dinero" className={`${campo} mt-2`} value={resolucion} disabled={original || ocupado} onChange={event => setResolucion(event.target.value as SolicitudCancelacionManual['resolucion'])}><option value="NO_COBRADO">No se cobró al cliente</option><option value="REINTEGRADO">Dinero reintegrado manualmente</option></select></label>
      <label className="block text-xs font-semibold">Motivo<textarea aria-label="Motivo de cancelación" className={`${campo} mt-2`} required minLength={5} maxLength={1000} value={motivo} disabled={original || ocupado} onChange={event => setMotivo(event.target.value)} /></label>
      {resolucion === 'REINTEGRADO' && <label className="block text-xs font-semibold">Referencia del reintegro<input aria-label="Referencia del reintegro" className={`${campo} mt-2`} required minLength={5} maxLength={500} value={referencia} disabled={original || ocupado} onChange={event => setReferencia(event.target.value)} /></label>}
      <label className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs"><input type="checkbox" required checked={declarado} disabled={ocupado} onChange={event => setDeclarado(event.target.checked)} className="mt-0.5 accent-indigo-600" /><span>Confirmo que no se cobró al cliente o que ya reintegré el dinero. Esta acción no realiza devoluciones de dinero.</span></label>
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 dark:border-gray-700 pt-4"><Button type="button" variant="secondary" disabled={ocupado} onClick={onClose}>Volver</Button><Button type="submit" variant="danger" loading={ocupado} disabled={!declarado}>Confirmar cancelación</Button></div>
    </form>
  </Modal>
}
