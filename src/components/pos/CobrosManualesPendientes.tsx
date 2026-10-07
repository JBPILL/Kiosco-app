import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '../ui/Button'
import { useAuthStore } from '../../stores/authStore'
import { useCartStore } from '../../stores/cartStore'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { observarCobrosManualesLocales, reclamarComprobanteManual, sincronizarCobrosManualesLocales } from '../../lib/manualCheckoutClient'
import { checkoutManualTransaccionalActivo } from '../../lib/manualCheckoutCart'
import { formatPrecio } from '../../lib/utils'
import type { CobroManualLocal } from '../../lib/manualCheckoutOutbox'
import type { TicketData } from './TicketReceiptModal'

export function CobrosManualesPendientes({ onVerTicket }: { onVerTicket: (ticket: TicketData) => void }) {
  const { usuario, kiosco } = useAuthStore()
  if (!checkoutManualTransaccionalActivo() || !usuario?.id || kiosco?.id !== usuario.kiosco_id) return null
  return <Contenido key={`${kiosco.id}/${usuario.id}`} kioscoId={kiosco.id} usuarioId={usuario.id} onVerTicket={onVerTicket} />
}

function Contenido({ kioscoId, usuarioId, onVerTicket }: { kioscoId: string; usuarioId: string; onVerTicket: (ticket: TicketData) => void }) {
  const online = useOnlineStatus()
  const [cobros, setCobros] = useState<CobroManualLocal[]>([])
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const ocupadoRef = useRef(false)
  const vigenteRef = useRef(true)
  useEffect(() => {
    vigenteRef.current = true
    const sub = observarCobrosManualesLocales(kioscoId, usuarioId).subscribe({
      next: filas => { if (vigenteRef.current) { setCobros(filas.sort((a, b) => a.entrada.fechaHora.localeCompare(b.entrada.fechaHora))); setError('') } },
      error: () => { if (vigenteRef.current) setError('No se pudo leer la cola de cobros de este equipo.') },
    })
    return () => { vigenteRef.current = false; sub.unsubscribe() }
  }, [kioscoId, usuarioId])

  async function sincronizar() {
    if (!online || ocupadoRef.current) return
    ocupadoRef.current = true; setOcupado(true)
    try {
      const res = await sincronizarCobrosManualesLocales(kioscoId, usuarioId)
      if (vigenteRef.current && res.fallidas) setError('Hay cierres sin confirmar. Revisá sesión, caja, precios y disponibilidad; no vuelvas a cobrar.')
      if (res.exitosas) window.dispatchEvent(new Event('kiosko-manual-checkout-confirmado'))
    } catch { if (vigenteRef.current) setError('No se pudo sincronizar. Las solicitudes originales se conservan en este equipo.') }
    finally { ocupadoRef.current = false; if (vigenteRef.current) setOcupado(false) }
  }
  useEffect(() => { if (online) void sincronizar() }, [online, kioscoId, usuarioId]) // sólo al reconectar o cambiar contexto

  async function ver(cobro: CobroManualLocal) {
    if (!cobro.recibo || ocupadoRef.current) return
    const actual = useAuthStore.getState()
    if (actual.usuario?.id !== usuarioId || actual.kiosco?.id !== kioscoId) return
    try {
      const primero = await reclamarComprobanteManual(cobro.id, cobro.estado === 'PENDIENTE')
      const vigente = useAuthStore.getState()
      if (!vigenteRef.current || vigente.usuario?.id !== usuarioId || vigente.kiosco?.id !== kioscoId) return
      useCartStore.getState().completarCobroTab(cobro.ticketClave)
      const ticket = primero ?? { ...cobro.recibo, notas: `${cobro.recibo.notas || ''}${cobro.estado === 'PENDIENTE' ? ' [GUARDADO OFFLINE] [PENDIENTE DE CONFIRMACIÓN]' : ''}` }
      onVerTicket(ticket)
    } catch { toast.error('No se pudo recuperar el comprobante original.') }
  }

  if (!cobros.length && !error) return null
  return <section className="shrink-0 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-amber-800 dark:text-amber-300">Cobros guardados en este equipo</h2><p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Conservan el ticket original. No vuelvas a cobrar al cliente.</p></div><Button size="sm" variant="secondary" loading={ocupado} disabled={!online} onClick={() => void sincronizar()}>Reintentar pendientes</Button></div>
    {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    <div className="mt-3 max-h-36 overflow-y-auto space-y-2">{cobros.map(c => <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"><div><p className="text-sm font-semibold">Ticket {c.id.slice(0, 8).toUpperCase()} · {formatPrecio(c.entrada.totalEsperado)}</p><p className="text-xs text-gray-500 dark:text-gray-400">{c.estado === 'CONFIRMADO' ? 'Confirmado · comprobante por recuperar' : 'Pendiente de confirmación'} · {new Date(c.entrada.fechaHora).toLocaleString('es-AR')}</p></div><Button size="sm" variant="secondary" disabled={!c.recibo || ocupado} onClick={() => void ver(c)}>Ver comprobante</Button></div>)}</div>
  </section>
}
