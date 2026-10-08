import { useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import type { EntradaCheckoutManual } from '../../types/checkoutManual'
import { confirmarEntradaPorDueno } from '../../lib/manualCheckoutOwnerRecovery'
import { clearCachedProductos, formatPrecio, labelMedioPago } from '../../lib/utils'

export function RecuperarCobroRemotoModal({ entrada, onClose, onConfirmado }: {
  entrada: EntradaCheckoutManual; onClose: () => void; onConfirmado: () => void
}) {
  const bloqueado = useRef(false)
  const [ocupado, setOcupado] = useState(false)
  const [recibido, setRecibido] = useState(false)
  const [error, setError] = useState('')
  async function confirmar(event: React.FormEvent) {
    event.preventDefault()
    if (bloqueado.current || !recibido) return
    bloqueado.current = true; setOcupado(true); setError('')
    try {
      await confirmarEntradaPorDueno(entrada)
      try { clearCachedProductos(entrada.kioscoId) } catch { /* Venta confirmada. */ }
      onConfirmado()
    } catch {
      setError('Cierre sin confirmar. Conservá este ticket y reintentá con la misma solicitud. No vuelvas a cobrar al cliente; revisá Reportes si persiste.')
    } finally { bloqueado.current = false; setOcupado(false) }
  }
  return <Modal isOpen title="Recuperar cobro original" onClose={() => { if (!bloqueado.current) onClose() }} size="md">
    <form className="space-y-4" onSubmit={confirmar}>
      <p className="text-sm">Ticket {entrada.checkoutId.slice(0, 8).toUpperCase()} · <strong>{formatPrecio(entrada.totalEsperado)}</strong></p>
      <p className="text-xs text-gray-500">Se conserva el vendedor, la caja, el descuento y los pagos originales.</p>
      <ul className="space-y-2 text-sm">{entrada.pagos.map(pago => <li key={pago.id}>{labelMedioPago(pago.medio)}: {formatPrecio(pago.montoCentavos / 100)}</li>)}</ul>
      <label className="flex gap-3 text-sm"><input type="checkbox" required checked={recibido} disabled={ocupado} onChange={e => setRecibido(e.target.checked)} /><span>Confirmo que el cobro original ya se recibió o que el fiado fue acordado. Esta acción registra la venta; no cobra dinero nuevamente.</span></label>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={ocupado} onClick={onClose}>Volver</Button><Button type="submit" loading={ocupado} disabled={!recibido || ocupado}>Confirmar cobro original</Button></div>
    </form>
  </Modal>
}
