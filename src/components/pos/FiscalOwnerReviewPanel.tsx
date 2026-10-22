import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import type { FiscalOwnerApproval, FiscalOwnerReview } from '../../../supabase/functions/_shared/fiscalOwnerReview'

export interface FiscalReviewApprovalCommand {
  id: string
  operacion_id: string
  solicitud_sha256: string
  revision: number
}
interface Props {
  review: Readonly<FiscalOwnerReview>
  approvalId: string
  onApprove: (command: FiscalReviewApprovalCommand) => Promise<Readonly<FiscalOwnerApproval>>
}
const money = (value: string) => `$ ${value.replace('.', ',')}`
const date = (value: string) => `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`
const voucher: Record<number, string> = { 1: 'Factura A', 6: 'Factura B', 11: 'Factura C' }
const document: Record<number, string> = { 80: 'CUIT', 96: 'DNI', 99: 'Consumidor final' }

/** El padre conserva el identificador de aprobación antes de llamar al servidor.
 * Cambiar el cuerpo remonta el panel: una respuesta anterior no aprueba el nuevo. */
export function FiscalOwnerReviewPanel(props: Props) {
  return <ReviewBody key={`${props.review.operacion_id}:${props.review.revision}:${props.review.solicitud.sha256}`} {...props} />
}
function ReviewBody({ review, approvalId, onApprove }: Props) {
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [approval, setApproval] = useState(review.aprobacion)
  const [now, setNow] = useState(() => Date.now())
  const mounted = useRef(true)
  const inFlight = useRef(false)
  useEffect(() => {
    mounted.current = true
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => { mounted.current = false; clearInterval(timer) }
  }, [])
  const request = review.solicitud.solicitud
  const currentApproval = approval && Date.parse(approval.vence_en) > now
  const canApprove = review.estado === 'RESERVADA' && !currentApproval
  async function approve() {
    if (!checked || !canApprove || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const result = await onApprove({ id: approvalId, operacion_id: review.operacion_id,
        solicitud_sha256: review.solicitud.sha256, revision: review.revision })
      if (result.id !== approvalId || result.operacion_id !== review.operacion_id
        || result.solicitud_sha256 !== review.solicitud.sha256 || result.revision !== review.revision
        || result.aprobada !== true || result.emision_habilitada !== false
        || !Number.isFinite(Date.parse(result.vence_en)) || Date.parse(result.vence_en) <= Date.now()) {
        throw new Error('ACK_INVALIDO')
      }
      if (mounted.current) setApproval(result)
    } catch {
      if (mounted.current) setError('No se confirmó la aprobación. Consultá el estado antes de volver a intentarlo; no emitas otro comprobante.')
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return <section className="space-y-4" aria-label="Revisión del comprobante fiscal">
    <p className="rounded-lg border p-3 font-medium">Homologación: comprobante de prueba. Revisar y aprobar no emite una factura ni obtiene un CAE.</p>
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border p-4">
      <div><dt>Comprobante</dt><dd className="font-bold">{voucher[request.tipoComprobante]} · {String(request.puntoVenta).padStart(5, '0')}-{String(request.numero).padStart(8, '0')}</dd></div>
      <div><dt>CUIT del emisor</dt><dd>{request.cuitEmisor}</dd></div>
      <div><dt>Fecha</dt><dd>{date(request.fecha)}</dd></div>
      <div><dt>Receptor</dt><dd>{document[request.tipoDocumento]} · {request.numeroDocumento}</dd></div>
      <div><dt>Condición IVA del receptor</dt><dd>Código ARCA {request.condicionIvaReceptor}</dd></div>
      <div><dt>Concepto</dt><dd>{({ 1: 'Productos', 2: 'Servicios', 3: 'Productos y servicios' } as Record<number, string>)[request.concepto]}</dd></div>
      {request.servicioDesde && <div><dt>Período de servicio</dt><dd>{date(request.servicioDesde)} al {date(request.servicioHasta!)}</dd></div>}
      {request.vencimientoPago && <div><dt>Vencimiento de pago</dt><dd>{date(request.vencimientoPago)}</dd></div>}
      <div><dt>Moneda / cotización</dt><dd>{request.moneda} / {request.cotizacion}</dd></div>
    </dl>
    <dl className="grid grid-cols-2 gap-2 rounded-lg border p-4">
      {([['Neto', request.importes.neto], ['IVA', request.importes.iva], ['No gravado', request.importes.noGravado], ['Exento', request.importes.exento], ['Tributos', request.importes.tributos], ['Total', request.importes.total]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="font-bold">{money(value)}</dd></div>)}
    </dl>
    {request.iva.length > 0 && <div><h3 className="font-bold">Detalle de IVA</h3><ul>{request.iva.map(line => <li key={`${line.id}:${line.base}:${line.importe}`}>Código {line.id} · Base {money(line.base)} · IVA {money(line.importe)}</li>)}</ul></div>}
    {request.tributos.length > 0 && <div><h3 className="font-bold">Otros tributos</h3><ul>{request.tributos.map(line => <li key={`${line.id}:${line.descripcion}:${line.base}`}>{line.descripcion} (código {line.id}) · Base {money(line.base)} · Alícuota {line.alicuota} · Importe {money(line.importe)}</li>)}</ul></div>}
    <details><summary>Identificación de la revisión</summary><p>Revisión {review.revision}</p><p className="break-all">{review.solicitud.sha256}</p></details>
    {review.estado === 'ENVIO_INCIERTO' && <p role="status">El envío requiere conciliación. No se puede aprobar ni reenviar desde esta pantalla.</p>}
    {review.estado === 'AUTORIZADA' && <p role="status">La operación ya figura autorizada en el servidor. Consultá su constancia fiscal; esta pantalla no reemplaza el comprobante.</p>}
    {currentApproval && review.estado === 'RESERVADA' ? <p role="status">Revisión aprobada hasta {new Date(approval.vence_en).toLocaleTimeString('es-AR')}. La emisión requiere una autorización adicional; todavía no se emitió desde esta pantalla.</p> : canApprove && <>
      {approval && <p role="status">La aprobación venció. Volvé a cargar la revisión antes de aprobar nuevamente.</p>}
      <label className="flex gap-2"><input type="checkbox" checked={checked} disabled={busy || !!approval} onChange={event => setChecked(event.target.checked)} />Revisé el receptor, las fechas, los importes y el detalle fiscal de este comprobante.</label>
      <Button fullWidth disabled={!checked || !!approval} loading={busy} onClick={approve}>Aprobar revisión</Button>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>
}
