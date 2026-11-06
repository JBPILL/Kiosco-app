import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import type { FiscalClient } from '../../lib/fiscalClient'
import type { FiscalReceipt } from '../../../supabase/functions/_shared/fiscalReceipt'

interface Props { client: Pick<FiscalClient, 'representation'>; receipt: Readonly<FiscalReceipt> }
export function FiscalRepresentationExport(props: Props) {
  const r = props.receipt
  return <ExportBody key={`${r.operacion_id}:${r.solicitud.sha256}:${r.autorizacion.cae}`} {...props} />
}
function ExportBody({ client, receipt }: Props) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const running = useRef(false), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function download(): Promise<void> {
    if (running.current) return
    running.current = true; setBusy(true); setMessage('')
    try {
      const source = await client.representation(receipt.operacion_id)
      if (!alive.current) return
      if (source.venta_id !== receipt.venta_id || source.operacion_id !== receipt.operacion_id
        || source.constancia.solicitud.sha256 !== receipt.solicitud.sha256
        || source.constancia.autorizacion.cae !== receipt.autorizacion.cae
        || source.constancia.autorizacion.vencimiento !== receipt.autorizacion.vencimiento) throw new Error('FISCAL_REPRESENTACION_DISTINTA')
      const { createFiscalRepresentationPdf } = await import('../../lib/fiscalRepresentationPdf')
      if (!alive.current) return
      const result = await createFiscalRepresentationPdf(source)
      if (!alive.current) return
      result.doc.save(result.fileName)
      setMessage('PDF de homologación preparado. Sin validez fiscal.')
    } catch (error) {
      if (alive.current) setMessage(error instanceof Error && error.message === 'FISCAL_PDF_FUENTE_NO_COMPATIBLE'
        ? 'La fuente del PDF no admite alguno de los caracteres del comprobante. Conservá la constancia; sus datos no se modificarán.'
        : 'No se pudo generar el PDF con los datos históricos autorizados. Conservá la constancia y volvé a consultar; no prepares otro comprobante.')
    } finally { running.current = false; if (alive.current) setBusy(false) }
  }
  return <section aria-label="PDF de homologación" className="space-y-2">
    <Button type="button" variant="secondary" loading={busy} onClick={() => { void download() }}>Descargar PDF de homologación</Button>
    <p className="text-sm">Incluye el detalle comercial histórico y los importes fiscales autorizados. Esta descarga no emite un comprobante nuevo.</p>
    {message && <p role="status">{message}</p>}
  </section>
}
