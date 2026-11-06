import type { FiscalReceipt } from '../../../supabase/functions/_shared/fiscalReceipt'

const date = (value: string) => `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`
const money = (value: string) => `$ ${value.replace('.', ',')}`
const voucher: Record<number, string> = { 1: 'Factura A', 6: 'Factura B', 11: 'Factura C' }

export function FiscalReceiptPanel({ receipt }: { receipt: Readonly<FiscalReceipt> }) {
  const body = receipt.solicitud.solicitud, authorization = receipt.autorizacion
  return <section aria-label="Constancia fiscal de homologación" className="space-y-4">
    <p role="status" className="font-bold">Autorización guardada en homologación. Comprobante de prueba sin validez fiscal.</p>
    <dl className="grid grid-cols-2 gap-3 rounded-lg border p-4">
      <div><dt>Comprobante</dt><dd className="font-bold">{voucher[body.tipoComprobante]} · {String(body.puntoVenta).padStart(5, '0')}-{String(body.numero).padStart(8, '0')}</dd></div>
      <div><dt>CUIT emisor</dt><dd>{body.cuitEmisor}</dd></div>
      <div><dt>Fecha</dt><dd>{date(body.fecha)}</dd></div>
      <div><dt>Documento receptor (tipo {body.tipoDocumento})</dt><dd>{body.numeroDocumento}</dd></div>
      <div><dt>Condición IVA receptor</dt><dd>Código {body.condicionIvaReceptor}</dd></div>
      <div><dt>Concepto</dt><dd>Código {body.concepto}</dd></div>
      <div><dt>CAE</dt><dd className="font-bold break-all">{authorization.cae}</dd></div>
      <div><dt>Vencimiento del CAE</dt><dd className="font-bold">{date(authorization.vencimiento)}</dd></div>
      <div><dt>Fecha y hora de proceso informadas</dt><dd>{authorization.procesado_en ? `${date(authorization.procesado_en.slice(0, 8))} ${authorization.procesado_en.slice(8, 10)}:${authorization.procesado_en.slice(10, 12)}:${authorization.procesado_en.slice(12, 14)}` : 'No informadas'}</dd></div>
      <div><dt>Moneda / cotización</dt><dd>{body.moneda} / {body.cotizacion}</dd></div>
      {body.servicioDesde && <div><dt>Servicio desde</dt><dd>{date(body.servicioDesde)}</dd></div>}
      {body.servicioHasta && <div><dt>Servicio hasta</dt><dd>{date(body.servicioHasta)}</dd></div>}
      {body.vencimientoPago && <div><dt>Vencimiento de pago</dt><dd>{date(body.vencimientoPago)}</dd></div>}
    </dl>
    <dl className="grid grid-cols-2 gap-2 rounded-lg border p-4">
      {([['Neto', body.importes.neto], ['IVA', body.importes.iva], ['No gravado', body.importes.noGravado], ['Exento', body.importes.exento], ['Tributos', body.importes.tributos], ['Total', body.importes.total]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="font-bold">{money(value)}</dd></div>)}
    </dl>
    {body.iva.length > 0 && <div><h3 className="font-bold">Detalle de IVA</h3><ul>{body.iva.map(line => <li key={`${line.id}:${line.base}:${line.importe}`}>Código {line.id} · Base {money(line.base)} · IVA {money(line.importe)}</li>)}</ul></div>}
    {body.tributos.length > 0 && <div><h3 className="font-bold">Otros tributos</h3><ul>{body.tributos.map(line => <li key={`${line.id}:${line.descripcion}:${line.base}`}>{line.descripcion} (código {line.id}) · Base {money(line.base)} · Alícuota {line.alicuota} · Importe {money(line.importe)}</li>)}</ul></div>}
    <details><summary>Identificación de la constancia</summary><p className="break-all">Operación {receipt.operacion_id}</p><p className="break-all">Venta {receipt.venta_id}</p><p className="break-all">{receipt.solicitud.sha256}</p></details>
  </section>
}
