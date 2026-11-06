import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import type { FiscalIssuerCondition, FiscalPreparationContext, FiscalPreparationInput } from '../../../supabase/functions/_shared/fiscalPreparationContract'
import { prepareFiscalData } from '../../../supabase/functions/_shared/fiscalPreparation'

interface Props {
  disabled?: boolean
  submitLabel?: string
  context: FiscalPreparationContext
  onPrepare: (input: FiscalPreparationInput) => Promise<void>
}
const inputStyle = 'w-full rounded-lg border p-2 bg-transparent'
const amounts = ['neto', 'iva', 'noGravado', 'exento', 'tributos'] as const
const amountLabels = { neto: 'Neto', iva: 'IVA total', noGravado: 'No gravado', exento: 'Exento', tributos: 'Otros tributos total' }
type VatLine = { key: number; id: string; base: string; importe: string }
type TaxLine = VatLine & { descripcion: string; alicuota: string }
class PreparationInputError extends Error {}
function fiscalDate(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) throw new PreparationInputError('Revisá las fechas: usá dd/mm/aaaa.')
  const [, day, month, year] = match
  const iso = `${year}-${month}-${day}`
  const parsed = new Date(`${iso}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) throw new PreparationInputError('La fecha no existe. Revisá día, mes y año.')
  return `${year}${month}${day}`
}
function decimal(value: string, precision = 2): string {
  if (!new RegExp(`^(0|[1-9][0-9]{0,9})([.,][0-9]{1,${precision}})?$`).test(value)) throw new PreparationInputError('Completá todos los importes. Usá cero cuando corresponda, sin separador de miles.')
  return value.replace(',', '.')
}
/** Contexto obtenido del servidor. Ningún dato del afipStore heredado se usa aquí.
 * La validación definitiva y la conservación idempotente corresponden al padre/servidor. */
export function FiscalPreparationForm({ context, onPrepare, disabled, submitLabel }: Props) {
  return <PreparationBody key={`${context.venta_id}:${context.revision_parametros}:${context.cuit_emisor}:${context.punto_venta}:${context.total}`} context={context} onPrepare={onPrepare} disabled={disabled} submitLabel={submitLabel} />
}
function PreparationBody({ context, onPrepare, disabled, submitLabel }: Props) {
  const [issuer, setIssuer] = useState('')
  const [type, setType] = useState('')
  const [concept, setConcept] = useState('')
  const [docType, setDocType] = useState('')
  const [docNumber, setDocNumber] = useState('')
  const [condition, setCondition] = useState('')
  const [date, setDate] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [due, setDue] = useState('')
  const [currency, setCurrency] = useState('')
  const [values, setValues] = useState({ neto: '', iva: '', noGravado: '', exento: '', tributos: '' })
  const [vat, setVat] = useState<VatLine[]>([])
  const [tax, setTax] = useState<TaxLine[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const nextKey = useRef(0)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const services = concept === '2' || concept === '3'
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (disabled || inFlight.current || context.incluye_recepcion_envases) return
    inFlight.current = true
    setError('')
    setBusy(true)
    try {
      if (!issuer || !type || !concept || !docType || !condition || !currency || !docNumber) throw new PreparationInputError('Elegí expresamente la condición fiscal, el comprobante, el concepto, el receptor y la moneda.')
      if (!/^\d+$/.test(docNumber)) throw new PreparationInputError('El documento debe contener sólo números; para consumidor final indicá cero.')
      const input: FiscalPreparationInput = {
        condicionEmisor: issuer as FiscalIssuerCondition,
        datos: {
          tipoComprobante: Number(type), concepto: Number(concept), tipoDocumento: Number(docType), numeroDocumento: docNumber,
          condicionIvaReceptor: Number(condition), fecha: fiscalDate(date),
          servicioDesde: services ? fiscalDate(from) : null, servicioHasta: services ? fiscalDate(to) : null,
          vencimientoPago: services ? fiscalDate(due) : null, moneda: 'PES', cotizacion: '1',
          importes: { neto: decimal(values.neto), iva: decimal(values.iva), noGravado: decimal(values.noGravado), exento: decimal(values.exento), tributos: decimal(values.tributos) },
          iva: vat.map(line => {
            if (!context.alicuotas.some(item => String(item.id) === line.id)) throw new PreparationInputError('Elegí la alícuota de cada línea de IVA.')
            return { id: Number(line.id), base: decimal(line.base), importe: decimal(line.importe) }
          }),
          tributos: tax.map(line => {
            if (!/^[1-9]\d{0,3}$/.test(line.id) || !line.descripcion.trim()) throw new PreparationInputError('Completá código y descripción de cada tributo.')
            return { id: Number(line.id), descripcion: line.descripcion.trim(), base: decimal(line.base), alicuota: decimal(line.alicuota, 4), importe: decimal(line.importe) }
          }),
        },
      }
      try { await prepareFiscalData(context, input) }
      catch { throw new PreparationInputError('Revisá el receptor, las fechas y el desglose fiscal. Los importes y el detalle deben coincidir con el total de la venta.') }
      if (mounted.current) await onPrepare(input)
    } catch (cause) {
      // Sólo errores locales conocidos se muestran; el adaptador no debe filtrar respuestas privadas.
      if (mounted.current) setError(cause instanceof PreparationInputError
        ? cause.message : 'No se confirmó la preparación. Conservá esta venta y consultá su estado antes de reintentar.')
    } finally { inFlight.current = false; if (mounted.current) setBusy(false) }
  }
  const field = (label: string, value: string, setter: (value: string) => void, options: readonly (readonly [string, string])[]) => <label className="block">{label}<select className={inputStyle} value={value} required onChange={event => setter(event.target.value)}><option value="">Seleccionar…</option>{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>
  const text = (label: string, value: string, setter: (value: string) => void, placeholder?: string) => <label className="block">{label}<input className={inputStyle} required value={value} placeholder={placeholder} onChange={event => setter(event.target.value)} /></label>
  return <form onSubmit={submit} className="space-y-4" aria-label="Preparación fiscal explícita">
    <p>Completá los datos fiscales de esta venta. Guardar la preparación no emite una factura ni obtiene un CAE.</p>
    <dl className="grid grid-cols-2 gap-3 rounded-lg border p-3"><div><dt>CUIT del emisor</dt><dd className="font-bold">{context.cuit_emisor}</dd></div><div><dt>Punto de venta</dt><dd className="font-bold">{context.punto_venta}</dd></div><div><dt>Total de la venta</dt><dd className="font-bold">$ {context.total.replace('.', ',')}</dd></div></dl>
    {context.incluye_recepcion_envases && <p role="alert">Esta venta recibió envases descontados del ticket. Falta definir con el contador su tratamiento fiscal.</p>}
    <fieldset disabled={disabled || busy || context.incluye_recepcion_envases} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {field('Condición fiscal del emisor', issuer, value => { setIssuer(value); setType(''); setCondition('') }, [['MONOTRIBUTO', 'Monotributo'], ['RESPONSABLE_INSCRIPTO', 'Responsable inscripto'], ['EXENTO', 'Exento']])}
        {field('Tipo de comprobante', type, value => { setType(value); setCondition('') }, issuer === 'RESPONSABLE_INSCRIPTO' ? [['1', 'Factura A'], ['6', 'Factura B']] : issuer ? [['11', 'Factura C']] : [])}
        {field('Concepto', concept, setConcept, [['1', 'Productos'], ['2', 'Servicios'], ['3', 'Productos y servicios']])}
        {text('Fecha del comprobante', date, setDate, 'dd/mm/aaaa')}
        {field('Documento del receptor', docType, value => { setDocType(value); setDocNumber('') }, [['80', 'CUIT'], ['96', 'DNI'], ['99', 'Consumidor final']])}
        {text('Número de documento (cero si corresponde)', docNumber, setDocNumber)}
        {field('Condición IVA del receptor', condition, setCondition, context.condiciones.filter(item => item.comprobantes.includes(Number(type))).map(item => [String(item.id), item.descripcion]))}
        {field('Moneda / cotización', currency, setCurrency, [['PES', 'Pesos argentinos / 1']])}
        {services && <>{text('Servicio desde', from, setFrom, 'dd/mm/aaaa')}{text('Servicio hasta', to, setTo, 'dd/mm/aaaa')}{text('Vencimiento de pago', due, setDue, 'dd/mm/aaaa')}</>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{amounts.map(name => <label key={name}>{amountLabels[name]}<input className={inputStyle} inputMode="decimal" value={values[name]} required onChange={event => setValues(previous => ({ ...previous, [name]: event.target.value }))} /></label>)}</div>
      <p className="text-sm">Ingresá todos los importes, incluido cero cuando corresponda. No se calcula IVA por defecto. Los totales y el detalle deben coincidir con la venta.</p>
      <section className="space-y-2"><h3 className="font-bold">Detalle de IVA</h3>{vat.map((line, index) => <div key={line.key} className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border p-3">
        {field(`Alícuota IVA ${index + 1}`, line.id, id => setVat(rows => rows.map(row => row.key === line.key ? { ...row, id } : row)), context.alicuotas.map(item => [String(item.id), item.descripcion]))}
        {text(`Base IVA ${index + 1}`, line.base, base => setVat(rows => rows.map(row => row.key === line.key ? { ...row, base } : row)))}
        {text(`Importe IVA ${index + 1}`, line.importe, importe => setVat(rows => rows.map(row => row.key === line.key ? { ...row, importe } : row)))}
        <Button type="button" variant="secondary" onClick={() => setVat(rows => rows.filter(row => row.key !== line.key))}>Quitar línea IVA {index + 1}</Button>
      </div>)}<Button type="button" variant="secondary" disabled={vat.length >= 100 || type === '11' || !type} onClick={() => setVat(rows => [...rows, { key: nextKey.current++, id: '', base: '', importe: '' }])}>Agregar alícuota IVA</Button></section>
      <details><summary>Otros tributos</summary><div className="space-y-2">{tax.map((line, index) => <div key={line.key} className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border p-3">{(['id', 'descripcion', 'base', 'alicuota', 'importe'] as const).map(name => <label key={name}>{({ id: 'Código ARCA', descripcion: 'Descripción', base: 'Base', alicuota: 'Alícuota', importe: 'Importe' })[name]} tributo {index + 1}<input className={inputStyle} required value={line[name]} onChange={event => setTax(rows => rows.map(row => row.key === line.key ? { ...row, [name]: event.target.value } : row))} /></label>)}<Button type="button" variant="secondary" onClick={() => setTax(rows => rows.filter(row => row.key !== line.key))}>Quitar tributo {index + 1}</Button></div>)}<Button type="button" variant="secondary" disabled={tax.length >= 100} onClick={() => setTax(rows => [...rows, { key: nextKey.current++, id: '', descripcion: '', base: '', alicuota: '', importe: '' }])}>Agregar tributo</Button></div></details>
      <Button type="submit" fullWidth loading={busy}>{submitLabel ?? 'Guardar preparación y revisar'}</Button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
  </form>
}
