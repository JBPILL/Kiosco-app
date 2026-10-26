import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { FiscalCreditReviewPanel } from './FiscalCreditReviewPanel'
import { FiscalCreditNumberPanel } from './FiscalCreditNumberPanel'
import type { FiscalCreditClient } from '../../lib/fiscalCreditClient'
import type { FiscalRepresentation } from '../../../supabase/functions/_shared/fiscalRepresentation'
import type { FiscalCreditDraft } from '../../../supabase/functions/_shared/fiscalCreditDraft'
import type { FiscalCreditContext } from '../../../supabase/functions/_shared/fiscalCreditContext'
import { prepareFiscalCreditPreparation, fiscalCreditPreparationWire, validateFiscalCreditPreparationWire } from '../../../supabase/functions/_shared/fiscalCreditPreparation'
import type { FiscalCreditPreparationRecord } from '../../../supabase/functions/_shared/fiscalCreditPreparation'
import { validateFiscalCreditDraftAck } from '../../../supabase/functions/_shared/fiscalCreditDraftAck'

interface Props {
  onConflict?: () => void
  source: Readonly<FiscalRepresentation>; proposal: Readonly<FiscalCreditDraft>; sequence: number
  onCancelled?: () => void
  reviewClient?: Pick<FiscalCreditClient, 'pendingReview' | 'review' | 'recoverReview' | 'approveReview' | 'retryReview'> & Partial<Pick<FiscalCreditClient, 'transport'>>
  numberClient?: Pick<FiscalCreditClient, 'pendingNumber' | 'body' | 'recoverNumber' | 'number' | 'retryNumber'>
  client: Pick<FiscalCreditClient, 'context' | 'preparation' | 'pendingPreparation' | 'recoverPreparation' | 'savePreparation' | 'cancel'>
}
const style = 'mt-1 w-full rounded border bg-transparent p-2'
const displayDate = (value: string): string => `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`
function date(value: string): string {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) throw new Error('FECHA_INVALIDA')
  return `${value.slice(6)}${value.slice(3, 5)}${value.slice(0, 2)}`
}
export function FiscalCreditPreparationPanel(props: Props) {
  return <PreparationBody key={`${props.source.venta_id}:${props.source.operacion_id}:${props.proposal.sha256}`} {...props} />
}
function PreparationBody({ source, proposal, client, sequence, onCancelled, reviewClient, numberClient, onConflict }: Props) {
  const [context, setContext] = useState<Readonly<FiscalCreditContext> | null>(null)
  const [stored, setStored] = useState<Readonly<FiscalCreditPreparationRecord> | null>(null)
  const [from, setFrom] = useState(''), [until, setUntil] = useState(''), [due, setDue] = useState('')
  const [confirmed, setConfirmed] = useState(false), [locked, setLocked] = useState(false), [cancelled, setCancelled] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const alive = useRef(true), running = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const services = source.constancia.solicitud.solicitud.concepto !== 1
  async function action(kind: 'consult' | 'save' | 'cancel'): Promise<void> {
    if (running.current) return
    running.current = true; setBusy(true); setError(''); setMessage('')
    let sent = false
    try {
      const original = structuredClone(source), captured = structuredClone(proposal)
      if (kind === 'cancel') {
        if (!confirmCancel) throw new Error('CONFIRMACION_REQUERIDA')
        const ack = validateFiscalCreditDraftAck(await client.cancel(original.operacion_id, captured.datos.solicitud_id, captured.sha256),
          { saleId: original.venta_id, operationId: original.operacion_id, requestId: captured.datos.solicitud_id, sha256: captured.sha256 })
        if (ack.estado !== 'CANCELADA') throw new Error('CANCELACION_NO_CONFIRMADA')
        if (alive.current) { setCancelled(true); setContext(null); setStored(null); setLocked(true); setMessage('Caso cancelado y pendiente cerrado. No se emitió una nota de crédito desde esta pantalla.'); onCancelled?.() }
        return
      }
      if (kind === 'consult') {
        if (alive.current) { setStored(null); setContext(null) }
        const pending = client.pendingPreparation()
        setLocked(Boolean(pending))
        const result = pending ? await client.recoverPreparation(original, captured) : await client.preparation(original, captured)
        if (!alive.current) return
        if (result) {
          const verified = await validateFiscalCreditPreparationWire(fiscalCreditPreparationWire(result), original, captured)
          if (alive.current) { setStored(verified); setLocked(true) }
          return
        }
        if (pending) { setLocked(true); setMessage('La preparación sigue sin confirmarse. Conservamos el pendiente. Podés consultar nuevamente o cancelar este caso.'); return }
        const current = await client.context(original, captured)
        if (alive.current) { setContext(current); setLocked(false) }
        return
      }
      if (!context || !confirmed || locked) throw new Error('DATOS_INCOMPLETOS')
      const entry = services ? { servicioDesde: date(from), servicioHasta: date(until), vencimientoPago: date(due) }
        : { servicioDesde: null, servicioHasta: null, vencimientoPago: null }
      await prepareFiscalCreditPreparation(original, captured, context, entry)
      if (!alive.current) return
      sent = true; setLocked(true)
      const result = await client.savePreparation(original, captured, context, entry)
      const verified = await validateFiscalCreditPreparationWire(fiscalCreditPreparationWire(result), original, captured)
      if (alive.current) setStored(verified)
    } catch {
      if (alive.current) setError(sent ? 'No se confirmó el guardado. Conservá este caso y consultá la preparación; no vuelvas a crearla con otros datos.'
        : 'No se pudo completar la operación. Revisá las fechas dd/mm/aaaa y consultá el estado del caso. El pendiente no se elimina por un error.')
    } finally { running.current = false; if (alive.current) setBusy(false) }
  }
  return <section aria-label={`Preparación de nota de crédito del caso ${sequence}`} className="rounded-lg border p-3 space-y-3">
    <h4 className="font-bold">Preparación de nota de crédito · Caso {sequence}</h4>
    <p>Guardar prepara los datos para una revisión posterior. No reserva numeración ni obtiene CAE; tampoco devuelve dinero o stock.</p>
    {!cancelled && <Button type="button" variant="secondary" loading={busy} onClick={() => { void action('consult') }}>Consultar preparación guardada</Button>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {stored && <div role="status">
      <p className="font-bold">{stored.estado === 'CANCELADA' ? 'Preparación histórica cancelada.' : 'Preparación guardada y verificada. Falta revisar y autorizar la emisión.'}</p>
      <p>NC {({ 3: 'A', 8: 'B', 13: 'C' } as const)[stored.preparacion.datos.datos.tipoComprobante]} · Punto de venta {stored.preparacion.datos.datos.puntoVenta} · Total $ {stored.preparacion.datos.datos.importes.total}</p>
      {stored.preparacion.datos.datos.servicioDesde && stored.preparacion.datos.datos.servicioHasta && stored.preparacion.datos.datos.vencimientoPago && <p>
        Servicios: {displayDate(stored.preparacion.datos.datos.servicioDesde)} al {displayDate(stored.preparacion.datos.datos.servicioHasta)} · Vencimiento: {displayDate(stored.preparacion.datos.datos.vencimientoPago)}
      </p>}
      <p>{numberClient ? 'Consultá la numeración guardada antes de revisar o aprobar. Esta preparación no acredita CAE.' : reviewClient ? 'Consultá la revisión para conocer la numeración reservada. Esta preparación no acredita CAE.' : 'Sin número ni CAE.'} No entregues efectivo ni repongas stock.</p>
    </div>}
    {stored?.estado === 'DATOS_NC_PREPARADOS' && numberClient && <FiscalCreditNumberPanel source={source} proposal={proposal} preparation={stored} sequence={sequence} client={numberClient} reviewClient={reviewClient} onConflict={onConflict} />}
    {stored?.estado === 'DATOS_NC_PREPARADOS' && !numberClient && reviewClient && <FiscalCreditReviewPanel source={source} proposal={proposal} preparation={stored} sequence={sequence} client={reviewClient} onConflict={onConflict} />}
    {context && !stored && !cancelled && <form onSubmit={event => { event.preventDefault(); void action('save') }} className="space-y-3">
      <p>Comprobante asociado: tipo {proposal.datos.origen.tipo}, punto de venta {proposal.datos.origen.punto_venta}, número {proposal.datos.origen.numero} · Fecha del caso: {displayDate(proposal.datos.fecha)} · Total $ {proposal.datos.importes.total}</p>
      <fieldset disabled={busy || locked} className="space-y-2">
        {services ? <>
          <label className="block">Servicio desde<input className={style} value={from} placeholder="dd/mm/aaaa" required onChange={event => setFrom(event.target.value)} /></label>
          <label className="block">Servicio hasta<input className={style} value={until} placeholder="dd/mm/aaaa" required onChange={event => setUntil(event.target.value)} /></label>
          <label className="block">Vencimiento de pago<input className={style} value={due} placeholder="dd/mm/aaaa" required onChange={event => setDue(event.target.value)} /></label>
        </> : <p>Venta de productos: no corresponde período de servicios.</p>}
        <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Confirmo estos datos para guardar la preparación, sin emitir.</label>
        <Button type="submit" loading={busy} disabled={!confirmed || locked}>Guardar preparación NC</Button>
      </fieldset>
    </form>}
    {locked && !stored && !cancelled && <div className="space-y-2">
      <label className="flex gap-2"><input type="checkbox" disabled={busy} checked={confirmCancel} onChange={event => setConfirmCancel(event.target.checked)} />Confirmo cancelar este caso y conservar su historial.</label>
      <Button type="button" variant="danger" disabled={busy || !confirmCancel} onClick={() => { void action('cancel') }}>Cancelar este caso y cerrar pendiente</Button>
    </div>}
  </section>
}
