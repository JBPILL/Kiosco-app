import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import type { FiscalCreditClient } from '../../lib/fiscalCreditClient'
import type { FiscalRepresentation } from '../../../supabase/functions/_shared/fiscalRepresentation'
import type { FiscalCreditDraft } from '../../../supabase/functions/_shared/fiscalCreditDraft'
import type { FiscalCreditPreparationRecord } from '../../../supabase/functions/_shared/fiscalCreditPreparation'
import { fiscalCreditPreparationWire } from '../../../supabase/functions/_shared/fiscalCreditPreparation'
import type { FiscalCreditOwnerReview } from '../../../supabase/functions/_shared/fiscalCreditOwnerReview'
import { fiscalCreditOwnerReviewWire, validateFiscalCreditOwnerReviewWire } from '../../../supabase/functions/_shared/fiscalCreditOwnerReview'

interface Props {
  source: Readonly<FiscalRepresentation>; proposal: Readonly<FiscalCreditDraft>; preparation: Readonly<FiscalCreditPreparationRecord>; sequence: number
  client: Pick<FiscalCreditClient, 'pendingReview' | 'review' | 'recoverReview' | 'approveReview' | 'retryReview'>
}
const date = (value: string): string => `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`
const amountLabels: Record<string, string> = { total: 'Total', neto: 'Neto gravado', iva: 'IVA', noGravado: 'No gravado', exento: 'Exento', tributos: 'Otros tributos' }
export function FiscalCreditReviewPanel(props: Props) {
  return <ReviewBody key={`${props.source.venta_id}:${props.proposal.sha256}:${props.preparation.preparacion.sha256}`} {...props} />
}
function ReviewBody({ source, proposal, preparation, sequence, client }: Props) {
  const [review, setReview] = useState<Readonly<FiscalCreditOwnerReview> | null>(null)
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [locked, setLocked] = useState(false)
  const [retry, setRetry] = useState(false)
  const [error, setError] = useState(''), alive = useRef(true), running = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function action(approve: boolean): Promise<void> {
    if (running.current) return
    running.current = true; setBusy(true); setError('')
    try {
      const original = structuredClone(source), draft = structuredClone(proposal), prep = fiscalCreditPreparationWire(preparation)
      let result: Readonly<FiscalCreditOwnerReview> | null
      if (approve) {
        if (!review || !confirmed || locked) throw new Error('CONFIRMACION_REQUERIDA')
        setLocked(true); setConfirmed(false)
        result = retry ? await client.retryReview(original, draft, prep, review) : await client.approveReview(original, draft, prep, review)
      } else {
        setReview(null); setConfirmed(false); setRetry(false)
        const pending = client.pendingReview()
        setLocked(Boolean(pending))
        if (pending) {
          try { result = await client.recoverReview(original, draft, prep); if (!result) throw new Error('PENDIENTE_NO_CONFIRMADO') }
          catch {
            result = await client.review(original, draft, prep)
            const checked = await validateFiscalCreditOwnerReviewWire(fiscalCreditOwnerReviewWire(result), original, draft, prep)
            if (checked.cuerpo.sha256 !== pending.bodySha || checked.cuerpo.datos.preparacion_sha256 !== pending.preparationSha
              || checked.cuerpo.datos.solicitud_id !== pending.requestId || checked.cuerpo.datos.operacion_origen_id !== pending.operationId || checked.cuerpo.datos.propuesta_sha256 !== pending.proposalSha) throw new Error('PENDIENTE_DISTINTO')
            if (alive.current) setRetry(true)
          }
        } else result = await client.review(original, draft, prep)
      }
      if (!result) throw new Error('REVISION_NO_CONFIRMADA')
      const checked = await validateFiscalCreditOwnerReviewWire(fiscalCreditOwnerReviewWire(result), original, draft, prep)
      if (approve && !checked.aprobacion) throw new Error('APROBACION_NO_CONFIRMADA')
      if (alive.current) { setReview(checked); setLocked(Boolean(checked.aprobacion)) }
    } catch {
      if (alive.current) { setLocked(true); setError('No se confirmó la revisión. Conservá el caso y usá Consultar o recuperar revisión. No vuelvas a aprobar con otro identificador.') }
    } finally { running.current = false; if (alive.current) setBusy(false) }
  }
  const body = review?.cuerpo.datos.solicitud
  return <section aria-label={`Revisión de nota de crédito del caso ${sequence}`} className="rounded-lg border p-3 space-y-3">
    <h4 className="font-bold">Revisión del Dueño · Caso {sequence}</h4>
    <p>Consultá si ya hay un cuerpo numerado antes de aprobar. Si falta reservar numeración, este paso seguirá pendiente. Aprobar guarda tu revisión; no emite la nota de crédito ni obtiene CAE.</p>
    <Button type="button" variant="secondary" loading={busy} onClick={() => { void action(false) }}>Consultar o recuperar revisión</Button>
    {error && <p role="alert">{error}</p>}
    {retry && !review?.aprobacion && <p role="status">La aprobación sigue sin confirmarse. Revisá el mismo cuerpo y confirmá el reintento: se conservará el identificador original. Esto no demuestra que la primera solicitud haya fallado.</p>}
    {body && review && <>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div><dt>Numeración reservada, sin emitir</dt><dd className="font-bold">NC {({ 3: 'A', 8: 'B', 13: 'C' } as const)[body.tipoComprobante]} · {String(body.puntoVenta).padStart(5, '0')}-{String(body.numero).padStart(8, '0')}</dd></div>
        <div><dt>Fecha</dt><dd>{date(body.fecha)}</dd></div>
        <div><dt>CUIT emisor</dt><dd>{body.cuitEmisor}</dd></div>
        <div><dt>Documento del receptor</dt><dd>Tipo {body.tipoDocumento} · {body.numeroDocumento} · Condición IVA {body.condicionIvaReceptor}</dd></div>
      </dl>
      <p>Comprobante asociado: {body.comprobantesAsociados.map(item => `tipo ${item.tipo} · ${item.puntoVenta}-${item.numero} · ${date(item.fecha)}`).join('; ')}</p>
      <ul>{proposal.datos.lineas.map(line => <li key={line.detalle_id}>{source.hechos.datos.lineas.find(item => item.detalle_id === line.detalle_id)?.descripcion ?? 'Artículo histórico'} · Cantidad {line.cantidad.replace('.', ',')} · $ {line.importe}</li>)}</ul>
      <p>Concepto {body.concepto} · Moneda {body.moneda} · Cotización {body.cotizacion}</p>
      {body.servicioDesde && body.servicioHasta && body.vencimientoPago && <p>Servicios: {date(body.servicioDesde)} al {date(body.servicioHasta)} · Pago: {date(body.vencimientoPago)}</p>}
      <ul>{Object.entries(body.importes).map(([name, amount]) => <li key={name}>{amountLabels[name]}: $ {amount}</li>)}</ul>
      <details><summary>IVA y tributos revisados</summary>
        {body.iva.length === 0 && <p>Sin IVA discriminado.</p>}
        <ul>{body.iva.map(item => <li key={item.id}>{preparation.contexto.alicuotas.find(rate => rate.id === item.id)?.descripcion ?? `IVA ${item.id}`} · Base $ {item.base} · Importe $ {item.importe}</li>)}</ul>
        {body.tributos.length === 0 && <p>Sin otros tributos.</p>}
        <ul>{body.tributos.map(item => <li key={item.id}>{item.descripcion} · Base $ {item.base} · Alícuota {item.alicuota}% · Importe $ {item.importe}</li>)}</ul>
      </details>
      <p className="font-bold">Total de la NC: $ {body.importes.total}</p>
      {review.aprobacion ? <div role="status"><p>Aprobación guardada para este cuerpo. No es una nota de crédito emitida.</p>
        <p>Vencimiento registrado: {new Date(review.aprobacion.vence_en).toLocaleString('es-AR')}. El servidor debe comprobar su vigencia antes de cualquier envío.</p></div>
        : <label className="flex gap-2"><input type="checkbox" disabled={busy || locked} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Revisé el emisor, receptor, comprobante asociado, importes e impuestos de esta NC.</label>}
      {!review.aprobacion && <Button type="button" disabled={busy || locked || !confirmed} loading={busy} onClick={() => { void action(true) }}>{retry ? 'Reintentar aprobación guardada, sin emitir' : 'Guardar aprobación del Dueño, sin emitir'}</Button>}
      <details><summary>Referencia del cuerpo revisado</summary><p className="break-all">{review.cuerpo.sha256}</p></details>
    </>}
    <p>No entregues efectivo ni repongas stock: falta la confirmación de ARCA de la nota de crédito.</p>
  </section>
}
