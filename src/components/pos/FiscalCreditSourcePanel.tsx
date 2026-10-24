import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import type { FiscalCreditClient } from '../../lib/fiscalCreditClient'
import type { FiscalRepresentation } from '../../../supabase/functions/_shared/fiscalRepresentation'
import { validateFiscalCreditCommercialSource } from '../../../supabase/functions/_shared/fiscalCreditCommercialSource'
import type { FiscalCreditCommercialSource } from '../../../supabase/functions/_shared/fiscalCreditCommercialSource'
import { fiscalCreditUnitsWire, validateFiscalCreditUnits } from '../../../supabase/functions/_shared/fiscalCreditUnits'
import type { FiscalCreditUnits } from '../../../supabase/functions/_shared/fiscalCreditUnits'

interface Props {
  source: Readonly<FiscalRepresentation>
  client: Pick<FiscalCreditClient, 'commercialSource' | 'units'>
  disabled?: boolean
}
interface Facts { commercial: Readonly<FiscalCreditCommercialSource>; units: Readonly<FiscalCreditUnits> }
const paymentNames = { EFECTIVO: 'Efectivo', MERCADOPAGO: 'Mercado Pago', TRANSFERENCIA: 'Transferencia', TARJETA: 'Tarjeta', CUENTA_CORRIENTE: 'Cuenta corriente' }
const amount = (value: string): string => `$ ${value.replace('.', ',')}`
/** Consulta histórica: no concede elegibilidad final ni permiso de emitir o devolver. */
export function FiscalCreditSourcePanel(props: Props) {
  const s = props.source
  return <SourceBody key={`${s.venta_id}:${s.operacion_id}:${s.constancia.solicitud.sha256}:${s.hechos.presentacion_sha256}`} {...props} />
}
function SourceBody({ source, client, disabled }: Props) {
  const [facts, setFacts] = useState<Facts | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const alive = useRef(true), running = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function consult(): Promise<void> {
    if (running.current || disabled) return
    running.current = true; setBusy(true); setFacts(null); setError('')
    try {
      const original = structuredClone(source)
      const commercial = await validateFiscalCreditCommercialSource(await client.commercialSource(original), original)
      if (!alive.current) return
      const units = await validateFiscalCreditUnits(fiscalCreditUnitsWire(await client.units(original, commercial)), original, commercial)
      if (alive.current) setFacts({ commercial, units })
    } catch {
      if (alive.current) setError('No se pudieron confirmar los datos originales. Volvé a consultar; este error no significa que falten registros ni habilita una devolución.')
    } finally { running.current = false; if (alive.current) setBusy(false) }
  }
  return <section aria-label="Datos originales para nota de crédito" className="rounded-lg border p-3 space-y-3">
    <h4 className="font-bold">Comprobaciones previas del caso</h4>
    <p className="text-sm">Consultá los pagos y las unidades de la venta original. Estos datos no confirman saldo disponible ni autorizan una nota de crédito, efectivo o reposición.</p>
    <Button type="button" variant="secondary" disabled={disabled} loading={busy} onClick={() => { void consult() }}>Consultar datos originales</Button>
    {error && <p role="alert">{error}</p>}
    {facts && <div className="space-y-3">
      <div aria-label="Pagos originales">
        <h5 className="font-bold">Pagos originales · {amount(facts.commercial.total)}</h5>
        <ul>{facts.commercial.pagos.map((payment, index) => <li key={index}>{paymentNames[payment.medio]} · {amount(payment.importe)}</li>)}</ul>
        <p>{facts.commercial.pago_integro_efectivo ? 'Venta pagada íntegramente en efectivo. Esto no autoriza un reintegro.' : 'La venta incluye otro medio de pago. No debe suponerse un reintegro en efectivo.'}</p>
      </div>
      <p role="status">{facts.units.estado === 'CAPTURADAS'
        ? 'Unidades originales verificadas. No se usó el catálogo actual para reconstruirlas.'
        : 'La venta no tiene unidades históricas registradas. Requiere conciliación explícita; no se infieren desde el catálogo actual.'}</p>
      <ul className="space-y-2" aria-label="Artículos originales">
        {facts.commercial.lineas.map((line, index) => {
          const metadata = facts.units.estado === 'CAPTURADAS' ? facts.units.unidades.datos.lineas[index] : null
          const description = source.hechos.datos.lineas.find(item => item.detalle_id === line.detalle_id)?.descripcion ?? 'Artículo histórico'
          return <li key={line.detalle_id} className="rounded-lg border p-3 space-y-1">
            <strong>{description}</strong>
            <p>{line.cantidad.replace('.', ',')} {metadata?.unidad_medida ?? '(unidad sin registro)'} · {amount(line.subtotal)}</p>
            <p>{line.tipo === 'COMBO' ? 'Combo · receta original conservada' : line.tipo === 'LIBRE' ? 'Concepto libre · sin salida física para reponer' : 'Producto'}</p>
            {metadata && <p>{metadata.es_pesable ? 'Cantidad fraccionable registrada' : 'Unidades enteras registradas'}</p>}
            {line.componentes.length > 0 && <details><summary>Componentes físicos originales</summary><ul>{line.componentes.map((component, n) => <li key={component.producto_id}>
              Componente {n + 1} · {component.cantidad.replace('.', ',')} por unidad vendida{metadata ? ` · ${metadata.componentes[n].unidad_medida}${metadata.componentes[n].es_pesable ? ' (fraccionable)' : ' (entero)'}` : ' · unidad sin registro'}
            </li>)}</ul></details>}
            {line.sin_envase && line.precio_envase_unitario !== '0.00' && <p>Incluye un envase cobrado · {amount(line.precio_envase_unitario)} por unidad. Su tratamiento debe comprobarse antes de preparar la devolución.</p>}
          </li>
        })}
      </ul>
      <p className="text-sm">Los descuentos por envases recibidos siguen pendientes de definición con el contador. Esta consulta no habilita esos casos. El efectivo y la reposición sólo se habilitarán después de un CAE de nota de crédito confirmado.</p>
    </div>}
  </section>
}
