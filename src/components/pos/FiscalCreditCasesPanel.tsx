import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { FiscalCreditSourcePanel } from './FiscalCreditSourcePanel'
import { FiscalCreditContextPanel } from './FiscalCreditContextPanel'
import { FiscalCreditPreparationPanel } from './FiscalCreditPreparationPanel'
import { prepareFiscalCreditDraft } from '../../../supabase/functions/_shared/fiscalCreditDraft'
import type { FiscalCreditDraftInput } from '../../../supabase/functions/_shared/fiscalCreditDraft'
import { validateFiscalCreditDraftAck } from '../../../supabase/functions/_shared/fiscalCreditDraftAck'
import type { FiscalClient } from '../../lib/fiscalClient'
import type { PendingFiscalCredit } from '../../lib/fiscalCreditClient'
import type { FiscalReceipt } from '../../../supabase/functions/_shared/fiscalReceipt'
import type { FiscalRepresentation } from '../../../supabase/functions/_shared/fiscalRepresentation'
import { validateFiscalCreditHistory } from '../../../supabase/functions/_shared/fiscalCreditHistory'
import { fiscalCreditHistoryWire } from '../../../supabase/functions/_shared/fiscalCreditHistory'
import type { FiscalCreditHistoryCase } from '../../../supabase/functions/_shared/fiscalCreditHistory'

interface Props { client: Pick<FiscalClient, 'credits' | 'representation'>; receipt: Readonly<FiscalReceipt> }
const money = (value: string): string => `$ ${value.replace('.', ',')}`
const date = (value: string): string => `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`
export function FiscalCreditCasesPanel(props: Props) {
  const r = props.receipt
  return <CasesBody key={`${r.venta_id}:${r.operacion_id}:${r.solicitud.sha256}:${r.autorizacion.cae}`} {...props} />
}
function CasesBody({ client, receipt }: Props) {
  const [source, setSource] = useState<Readonly<FiscalRepresentation> | null>(null)
  const [rows, setRows] = useState<readonly Readonly<FiscalCreditHistoryCase>[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [pending, setPending] = useState<Readonly<PendingFiscalCredit> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [target, setTarget] = useState<Readonly<PendingFiscalCredit> | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const alive = useRef(true), running = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  function localPending(): Readonly<PendingFiscalCredit> | null {
    const value = client.credits.pending()
    if (value && value.operationId !== receipt.operacion_id) throw new Error('FISCAL_NC_PENDIENTE_DISTINTO')
    return value
  }
  async function history(original: Readonly<FiscalRepresentation>, after: number): Promise<void> {
    const response = await client.credits.history(original, after)
    const page = await validateFiscalCreditHistory(fiscalCreditHistoryWire(response), original, after)
    if (!alive.current) return
    setRows(previous => after === 0 ? page.casos : [...previous, ...page.casos])
    setNext(page.continuar_desde); setLoaded(true)
  }
  async function execute(action: () => Promise<void>): Promise<void> {
    if (running.current) return
    running.current = true; setBusy(true); setError(''); setMessage('')
    try { await action() }
    catch { if (alive.current) setError('No se pudo confirmar la consulta o el cambio. Conservá el intento original y volvé a consultar; no entregues efectivo ni repongas stock.') }
    finally { running.current = false; if (alive.current) setBusy(false) }
  }
  async function refresh(): Promise<void> {
    await execute(async () => {
      setTarget(null); setConfirmed(false); setLoaded(false); setRows([]); setSource(null); setNext(null)
      setPending(localPending())
      const original = await client.representation(receipt.operacion_id)
      if (!alive.current) return
      if (original.venta_id !== receipt.venta_id || original.operacion_id !== receipt.operacion_id
        || original.constancia.solicitud.sha256 !== receipt.solicitud.sha256
        || original.constancia.autorizacion.cae !== receipt.autorizacion.cae
        || original.constancia.autorizacion.vencimiento !== receipt.autorizacion.vencimiento) throw new Error('FISCAL_NC_ORIGEN_DISTINTO')
      setSource(original); await history(original, 0)
    })
  }
  async function recover(): Promise<void> {
    await execute(async () => {
      const before = localPending()
      if (!before) { setPending(null); setMessage('No hay un intento pendiente en este equipo. Consultá los casos guardados.'); return }
      const ack = await client.credits.recover()
      if (!alive.current) return
      setPending(localPending()); setTarget(null); setConfirmed(false)
      setMessage(!ack ? 'Todavía no hay confirmación del intento. Se conserva el pendiente; podés volver a consultar o solicitar su cancelación.'
        : ack.estado === 'CANCELADA' ? 'Cancelación confirmada. Se conserva el historial.'
          : before.intention === 'CANCELAR' ? 'El caso está guardado, pero su cancelación sigue pendiente. No se confirmó la cancelación.'
            : 'Caso guardado recuperado. Todavía no es una nota de crédito autorizada.')
      if (source) { setRows([]); setLoaded(false); setNext(null); await history(source, 0) }
    })
  }
  async function cancel(): Promise<void> {
    if (!target || !confirmed) return
    const selected = target
    await execute(async () => {
      setConfirmed(false)
      try {
        const ack = await client.credits.cancel(selected.operationId, selected.requestId, selected.sha256)
        if (!alive.current) return
        if (ack.estado !== 'CANCELADA') throw new Error('FISCAL_NC_CANCELACION_NO_CONFIRMADA')
        setTarget(null); setMessage('Cancelación confirmada. La venta, el cobro y el historial se conservan.')
        if (source) { setRows([]); setLoaded(false); setNext(null); await history(source, 0) }
      } finally { if (alive.current) setPending(localPending()) }
    })
  }
  async function saveCase(original: Readonly<FiscalRepresentation>, input: FiscalCreditDraftInput): Promise<void> {
    if (running.current || localPending() || !loaded || next !== null || target) throw new Error('FISCAL_NC_NO_DISPONIBLE')
    running.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const captured = structuredClone(input), proposal = await prepareFiscalCreditDraft(original, captured, captured.fecha)
      if (!alive.current) return
      const response = await client.credits.save(original, captured)
      const ack = validateFiscalCreditDraftAck(response, { saleId: original.venta_id, operationId: original.operacion_id, requestId: proposal.datos.solicitud_id, sha256: proposal.sha256 })
      if (!alive.current) return
      setMessage(ack.estado === 'CANCELADA' ? 'El intento está cancelado. No se creó un caso nuevo ni se emitió una nota de crédito.' : 'Caso guardado y confirmado. Todavía no es una nota de crédito autorizada; no entregues efectivo ni repongas stock.')
      setRows([]); setLoaded(false); setNext(null)
      try { await history(original, 0) }
      catch { if (alive.current) setError('El resultado del intento se confirmó, pero no se pudo actualizar el historial. Volvé a consultar los casos guardados.') }
    } finally {
      running.current = false
      if (alive.current) { setBusy(false); setPending(localPending()) }
    }
  }
  const latestActive = next === null && loaded ? [...rows].reverse().find(row => row.acuse.estado === 'SALDO_RESERVADO_NO_EMITIR') : undefined
  function choose(value: Readonly<PendingFiscalCredit>): void { setTarget(value); setConfirmed(false); setMessage('') }
  return <section aria-label="Casos de notas de crédito" className="rounded-lg border p-4 space-y-3">
    <h3 className="font-bold">Notas de crédito de homologación</h3>
    <p className="text-sm">Estos casos todavía no son notas de crédito autorizadas. El efectivo y la reposición sólo se habilitarán después de la confirmación de ARCA.</p>
    <Button type="button" variant="secondary" loading={busy} onClick={() => { void refresh() }}>Consultar casos guardados</Button>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {source && <FiscalCreditSourcePanel source={source} client={client.credits} disabled={busy || !!pending || !!target}
      onSave={loaded && next === null ? input => saveCase(source, input) : undefined} />}
    {pending && <div className="rounded-lg border p-3 space-y-2" aria-label="Intento NC pendiente">
      <p>Este equipo conserva {pending.intention === 'CANCELAR' ? 'una cancelación' : 'un guardado'} pendiente de confirmación.</p>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => { void recover() }}>Recuperar intento pendiente</Button>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => choose(pending)}>Solicitar cancelación del pendiente</Button>
    </div>}
    {loaded && rows.length === 0 && <p role="status">No hay casos guardados en esta factura. Una consulta vacía no cancela un intento pendiente.</p>}
    {rows.map(row => <article key={row.acuse.solicitud_id} className="rounded-lg border p-3 space-y-2" aria-label={`Caso ${row.secuencia}`}>
      <div className="flex justify-between gap-3"><h4 className="font-bold">Caso {row.secuencia} · {date(row.propuesta.datos.fecha)}</h4><strong>{money(row.propuesta.datos.importes.total)}</strong></div>
      <p>{row.acuse.estado === 'CANCELADA' ? 'Cancelado · historial conservado' : 'Guardado · sin emitir'}</p>
      <p>{row.propuesta.datos.motivo}</p>
      {row.acuse.estado === 'SALDO_RESERVADO_NO_EMITIR' && source && !busy && !pending && !target && <FiscalCreditContextPanel source={source} proposal={row.propuesta} client={client.credits} sequence={row.secuencia} />}
      {row.acuse.estado === 'SALDO_RESERVADO_NO_EMITIR' && source && !busy && !pending && !target && <FiscalCreditPreparationPanel source={source} proposal={row.propuesta} client={client.credits} reviewClient={client.credits} sequence={row.secuencia} onCancelled={() => {
        setRows(previous => previous.map(item => item.acuse.solicitud_id === row.acuse.solicitud_id ? { ...item, acuse: { ...item.acuse, estado: 'CANCELADA' } } : item))
        setMessage('Cancelación confirmada. Se conserva el historial del caso y de su preparación.')
      }} />}
      <details><summary>Detalle del caso</summary><ul>{row.propuesta.datos.lineas.map(line => <li key={line.detalle_id}>{source?.hechos.datos.lineas.find(item => item.detalle_id === line.detalle_id)?.descripcion ?? 'Artículo histórico'} · {line.cantidad.replace('.', ',')} · {money(line.importe)} · {line.reingresa_stock ? 'Reposición solicitada, aún sin aplicar' : 'Sin reposición solicitada'}</li>)}</ul><p className="break-all">Referencia {row.acuse.solicitud_id}</p></details>
      {latestActive === row && !pending && <Button type="button" variant="secondary" disabled={busy} onClick={() => choose({ version: 1, operationId: row.acuse.operacion_origen_id, requestId: row.acuse.solicitud_id, sha256: row.acuse.propuesta_sha256, intention: 'CANCELAR' })}>Solicitar cancelación del caso {row.secuencia}</Button>}
    </article>)}
    {next !== null && source && <Button type="button" variant="secondary" disabled={busy} onClick={() => { void execute(() => history(source, next)) }}>Ver más casos</Button>}
    {target && <div className="rounded-lg border p-3 space-y-2" aria-label="Confirmar cancelación NC">
      <p>Se conservará el historial. Esto no devuelve dinero ni modifica el stock. Sólo puede cancelarse el caso activo más reciente; el servidor comprobará su estado.</p>
      <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />Confirmo que quiero cancelar este intento.</label>
      <Button type="button" variant="danger" disabled={busy || !confirmed} onClick={() => { void cancel() }}>Confirmar cancelación del intento</Button>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => { setTarget(null); setConfirmed(false) }}>Volver</Button>
    </div>}
  </section>
}
