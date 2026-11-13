import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import type { FiscalCreditClient } from '../../lib/fiscalCreditClient'
import type { FiscalRepresentation } from '../../../supabase/functions/_shared/fiscalRepresentation'
import type { FiscalCreditDraft } from '../../../supabase/functions/_shared/fiscalCreditDraft'
import { validateFiscalCreditContext } from '../../../supabase/functions/_shared/fiscalCreditContext'
import type { FiscalCreditContext } from '../../../supabase/functions/_shared/fiscalCreditContext'

interface Props {
  source: Readonly<FiscalRepresentation>; proposal: Readonly<FiscalCreditDraft>
  client: Pick<FiscalCreditClient, 'context'>; sequence: number
}
export function FiscalCreditContextPanel(props: Props) {
  return <ContextBody key={`${props.source.venta_id}:${props.source.operacion_id}:${props.proposal.sha256}`} {...props} />
}
function ContextBody({ source, proposal, client, sequence }: Props) {
  const [context, setContext] = useState<Readonly<FiscalCreditContext> | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const alive = useRef(true), running = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function consult(): Promise<void> {
    if (running.current) return
    running.current = true; setBusy(true); setError(''); setContext(null)
    try {
      const original = structuredClone(source), captured = structuredClone(proposal)
      const result = await client.context(original, captured)
      if (!alive.current) return
      const verified = await validateFiscalCreditContext(result, original, captured)
      if (alive.current) setContext(verified)
    } catch {
      if (alive.current) setError('No se pudo confirmar el contexto fiscal de este caso. Revisá su estado, los datos originales, el emisor y el catálogo. Esta consulta no habilita emisión ni devolución.')
    } finally { running.current = false; if (alive.current) setBusy(false) }
  }
  return <section aria-label={`Contexto fiscal del caso ${sequence}`} className="rounded-lg border p-3 space-y-2">
    <Button type="button" variant="secondary" loading={busy} onClick={() => { void consult() }}>Consultar contexto fiscal del caso {sequence}</Button>
    {error && <p role="alert">{error}</p>}
    {context && <>
      <p role="status">Datos fiscales verificados para esta consulta. Todavía falta preparar, revisar y autorizar la nota de crédito.</p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div><dt>CUIT del emisor</dt><dd className="font-bold">{context.cuit_emisor}</dd></div>
        <div><dt>Punto de venta de la NC</dt><dd className="font-bold">{context.punto_venta}</dd></div>
        <div><dt>Comprobante a preparar</dt><dd className="font-bold">Nota de crédito {({ 3: 'A', 8: 'B', 13: 'C' } as const)[context.tipo_nota_credito]}</dd></div>
        <div><dt>Condición IVA del receptor del caso</dt><dd>{context.condiciones.find(row => row.id === proposal.datos.condicion_iva_receptor)?.descripcion}</dd></div>
      </dl>
      <p className="text-sm">Revisión de parámetros {context.revision_parametros}. Los datos se comprobarán nuevamente antes de cualquier preparación o envío. Esta consulta no reserva número ni obtiene CAE; no entregues efectivo ni repongas stock.</p>
    </>}
  </section>
}
