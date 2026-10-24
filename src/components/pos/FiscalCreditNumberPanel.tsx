import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { FiscalCreditReviewPanel } from './FiscalCreditReviewPanel'
import type { FiscalCreditClient } from '../../lib/fiscalCreditClient'
import type { FiscalRepresentation } from '../../../supabase/functions/_shared/fiscalRepresentation'
import type { FiscalCreditDraft } from '../../../supabase/functions/_shared/fiscalCreditDraft'
import type { FiscalCreditPreparationRecord } from '../../../supabase/functions/_shared/fiscalCreditPreparation'
import { fiscalCreditPreparationWire, validateFiscalCreditPreparationWire } from '../../../supabase/functions/_shared/fiscalCreditPreparation'
import type { FiscalCreditOwnerReview } from '../../../supabase/functions/_shared/fiscalCreditOwnerReview'
import { fiscalCreditOwnerReviewWire, validateFiscalCreditOwnerReviewWire } from '../../../supabase/functions/_shared/fiscalCreditOwnerReview'

interface Props {
  source: Readonly<FiscalRepresentation>; proposal: Readonly<FiscalCreditDraft>; preparation: Readonly<FiscalCreditPreparationRecord>; sequence: number
  client: Pick<FiscalCreditClient, 'pendingNumber' | 'body' | 'recoverNumber' | 'number' | 'retryNumber'>
  reviewClient?: Pick<FiscalCreditClient, 'pendingReview' | 'review' | 'recoverReview' | 'approveReview' | 'retryReview'>
}
export function FiscalCreditNumberPanel(props: Props) {
  return <NumberBody key={`${props.source.venta_id}:${props.proposal.sha256}:${props.preparation.preparacion.sha256}`} {...props} />
}
function NumberBody({ source, proposal, preparation, sequence, client, reviewClient }: Props) {
  const [body, setBody] = useState<Readonly<FiscalCreditOwnerReview> | null>(null)
  const [display, setDisplay] = useState<Readonly<FiscalCreditPreparationRecord> | null>(null)
  const [absent, setAbsent] = useState(false), [pending, setPending] = useState(false), [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false), [locked, setLocked] = useState(false), [error, setError] = useState('')
  const alive = useRef(true), running = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function action(reserve: boolean): Promise<void> {
    if (running.current) return
    running.current = true; setBusy(true); setError('')
    try {
      const original = structuredClone(source), draft = structuredClone(proposal), stored = structuredClone(preparation)
      const prep = await validateFiscalCreditPreparationWire(fiscalCreditPreparationWire(stored), original, draft)
      if (prep.estado !== 'DATOS_NC_PREPARADOS') throw new Error('PREPARACION_NO_ACTIVA')
      if (alive.current) setDisplay(prep)
      const wire = fiscalCreditPreparationWire(prep)
      let result: Readonly<FiscalCreditOwnerReview> | null
      if (reserve) {
        if (!confirmed || !absent || locked) throw new Error('CONFIRMACION_REQUERIDA')
        setLocked(true); setConfirmed(false); setAbsent(false)
        result = pending ? await client.retryNumber(original, draft, wire) : await client.number(original, draft, wire)
      } else {
        setBody(null); setAbsent(false); setConfirmed(false)
        const record = client.pendingNumber(); setPending(Boolean(record)); setLocked(Boolean(record))
        result = record ? await client.recoverNumber(original, draft, wire) : await client.body(original, draft, wire)
      }
      if (result === null && !reserve) {
        if (alive.current) { setAbsent(true); setLocked(false) }
        return
      }
      if (!result) throw new Error('CUERPO_NO_CONFIRMADO')
      const checked = await validateFiscalCreditOwnerReviewWire(fiscalCreditOwnerReviewWire(result), original, draft, wire)
      if (checked.aprobacion !== null) throw new Error('CUERPO_DISTINTO')
      if (alive.current) { setBody(checked); setPending(false); setAbsent(false); setLocked(true) }
    } catch {
      if (alive.current) { setLocked(true); setError('No se confirmó la numeración. Conservá el caso y consultá o recuperá la solicitud original antes de volver a reservar.') }
    } finally { running.current = false; if (alive.current) setBusy(false) }
  }
  const data = display?.preparacion.datos.datos
  return <section aria-label={`Numeración de nota de crédito del caso ${sequence}`} className="rounded-lg border p-3 space-y-3">
    <h4 className="font-bold">Numeración para revisión · Caso {sequence}</h4>
    <p>Primero consultá si ya hay un cuerpo reservado. Reservar fija el número y los datos: después no podrás cambiarlos ni cancelar este caso como borrador. No emite ni obtiene CAE.</p>
    <Button type="button" variant="secondary" loading={busy} onClick={() => { void action(false) }}>Consultar o recuperar numeración</Button>
    {error && <p role="alert">{error}</p>}
    {absent && !body && data && <div className="space-y-2">
      <p>No hay un cuerpo numerado confirmado para esta preparación.</p>
      <p>NC {({ 3: 'A', 8: 'B', 13: 'C' } as const)[data.tipoComprobante]} · Punto de venta {data.puntoVenta} · Total $ {data.importes.total}</p>
      {pending && <p role="status">Se conserva la solicitud pendiente. El reintento usará el mismo identificador.</p>}
      <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy || locked} onChange={event => setConfirmed(event.target.checked)} />Confirmo fijar estos datos y reservar numeración, sin emitir.</label>
      <Button type="button" disabled={busy || locked || !confirmed} loading={busy} onClick={() => { void action(true) }}>{pending ? 'Reintentar reserva original, sin emitir' : 'Reservar número para revisar'}</Button>
    </div>}
    {body && <>
      <p role="status" className="font-bold">Cuerpo numerado confirmado, aún sin emitir: {String(body.cuerpo.datos.solicitud.puntoVenta).padStart(5, '0')}-{String(body.cuerpo.datos.solicitud.numero).padStart(8, '0')}.</p>
      {reviewClient && <FiscalCreditReviewPanel source={source} proposal={proposal} preparation={preparation} sequence={sequence} client={reviewClient} />}
    </>}
    <p>No entregues efectivo ni repongas stock antes de confirmar el CAE de la nota de crédito.</p>
  </section>
}
