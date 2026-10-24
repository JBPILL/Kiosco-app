import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { prepareFiscalCreditCase } from '../../lib/fiscalCreditCasePreparation'
import type { FiscalCreditDraftInput } from '../../../supabase/functions/_shared/fiscalCreditDraft'
import type { FiscalRepresentation } from '../../../supabase/functions/_shared/fiscalRepresentation'
import type { FiscalCreditCommercialSource } from '../../../supabase/functions/_shared/fiscalCreditCommercialSource'
import type { FiscalCreditUnits } from '../../../supabase/functions/_shared/fiscalCreditUnits'

interface Props {
  source: Readonly<FiscalRepresentation>; commercial: Readonly<FiscalCreditCommercialSource>; units: Readonly<FiscalCreditUnits>
  disabled?: boolean; onSave: (input: FiscalCreditDraftInput) => Promise<void>
}
interface Row { id: string; selected: boolean; quantity: string; amount: string; restock: boolean }
interface Vat { key: number; id: string; base: string; importe: string }
interface Tax extends Vat { descripcion: string; alicuota: string }
const style = 'w-full rounded-lg border p-2 bg-transparent'
const keys = ['total', 'neto', 'iva', 'noGravado', 'exento', 'tributos'] as const
const labels = { total: 'Total del caso', neto: 'Neto', iva: 'IVA total', noGravado: 'No gravado', exento: 'Exento', tributos: 'Otros tributos total' }
function decimal(value: string, scale = 2): string {
  const match = new RegExp(`^(0|[1-9]\\d{0,9})(?:[.,](\\d{1,${scale}}))?$`).exec(value)
  if (!match) throw new Error('Entrada inválida')
  return `${match[1]}.${(match[2] ?? '').padEnd(scale, '0')}`
}
function fiscalDate(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) throw new Error('Fecha inválida')
  return `${match[3]}${match[2]}${match[1]}`
}
function identifier(value: string): number {
  if (!/^[1-9]\d{0,9}$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Código inválido')
  return Number(value)
}
export function FiscalCreditDraftForm(props: Props) {
  return <DraftBody key={`${props.source.operacion_id}:${props.commercial.checkout_sha256}:${props.units.estado === 'CAPTURADAS' ? props.units.unidades.sha256 : 'missing'}`} {...props} />
}
function DraftBody({ source, commercial, units, disabled, onSave }: Props) {
  const [rows, setRows] = useState<Row[]>(() => commercial.lineas.map(line => ({ id: line.detalle_id, selected: false, quantity: '', amount: '', restock: false })))
  const [date, setDate] = useState(''), [reason, setReason] = useState(''), [condition, setCondition] = useState('')
  const [values, setValues] = useState({ total: '', neto: '', iva: '', noGravado: '', exento: '', tributos: '' })
  const [vat, setVat] = useState<Vat[]>([]), [tax, setTax] = useState<Tax[]>([])
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [locked, setLocked] = useState(false)
  const [saved, setSaved] = useState(false), [error, setError] = useState('')
  const identity = useRef<string | null>(null), next = useRef(0), running = useRef(false), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const body = source.constancia.solicitud.solicitud
  const update = (id: string, patch: Partial<Row>): void => setRows(old => old.map(row => row.id === id ? { ...row, ...patch } : row))
  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (disabled || locked || running.current || !confirmed || units.estado !== 'CAPTURADAS') return
    running.current = true; setBusy(true); setError('')
    let saving = false
    try {
      identity.current ??= crypto.randomUUID()
      const input: FiscalCreditDraftInput = { version: 1, solicitud_id: identity.current, fecha: fiscalDate(date), motivo: reason,
        condicion_iva_receptor: identifier(condition),
        lineas: rows.filter(row => row.selected).map(row => ({ detalle_id: row.id, cantidad: decimal(row.quantity, 3), importe: decimal(row.amount), reingresa_stock: row.restock })),
        importes: { total: decimal(values.total), neto: decimal(values.neto), iva: decimal(values.iva), noGravado: decimal(values.noGravado), exento: decimal(values.exento), tributos: decimal(values.tributos) },
        iva: vat.map(row => ({ id: identifier(row.id), base: decimal(row.base), importe: decimal(row.importe) })),
        tributos: tax.map(row => ({ id: identifier(row.id), descripcion: row.descripcion, base: decimal(row.base), alicuota: decimal(row.alicuota, 4), importe: decimal(row.importe) })) }
      await prepareFiscalCreditCase(source, commercial, units, input)
      if (!alive.current) return
      // Desde el primer envío el contenido no puede cambiar; recuperar/cancelar mediante el panel.
      saving = true; setLocked(true)
      await onSave(input)
      if (alive.current) setSaved(true)
    } catch {
      if (alive.current) setError(saving
        ? 'No se confirmó el resultado en esta pantalla. Conservá el intento y usá la recuperación o cancelación del panel; no prepares otro caso para reemplazarlo.'
        : 'Revisá fecha dd/mm/aaaa, motivo, condición IVA, cantidades, importes e impuestos. Completá cero cuando corresponda; no uses separadores de miles. Las unidades y sumas deben coincidir con la factura original.')
    } finally { running.current = false; if (alive.current) setBusy(false) }
  }
  return <form aria-label="Preparar caso NC" className="rounded-lg border p-3 space-y-3" onSubmit={submit}>
    <h5 className="font-bold">Preparar un caso sin emitir</h5>
    <p>Ingresá cantidades e impuestos expresamente. No se calcula IVA proporcional. El servidor comprobará fecha, parámetros y saldo acumulado. Guardar no obtiene CAE ni devuelve dinero o stock.</p>
    {units.estado === 'NO_REGISTRADAS' && <p role="alert">Falta conciliar las unidades originales antes de preparar este caso.</p>}
    {error && <p role="alert">{error}</p>}
    {saved && <p role="status">Consulta de guardado terminada. Revisá el estado confirmado del caso en el panel; todavía no es una nota de crédito emitida.</p>}
    <fieldset className="space-y-3" disabled={disabled || busy || locked || units.estado !== 'CAPTURADAS'}>
      <label className="block">Fecha del caso<input className={style} value={date} placeholder="dd/mm/aaaa" required onChange={event => setDate(event.target.value)} /></label>
      <label className="block">Motivo del caso<input className={style} value={reason} maxLength={120} required onChange={event => setReason(event.target.value)} /></label>
      <label className="block">Código de condición IVA del receptor<input className={style} inputMode="numeric" value={condition} required onChange={event => setCondition(event.target.value)} /></label>
      <p className="text-sm">La condición histórica es {source.condicion_receptor}. El código ingresado se verificará contra parámetros del servidor; no se reutiliza automáticamente.</p>
      {rows.map((row, index) => {
        const line = commercial.lineas[index], metadata = units.estado === 'CAPTURADAS' ? units.unidades.datos.lineas[index] : null
        const description = source.hechos.datos.lineas.find(item => item.detalle_id === row.id)?.descripcion ?? `Artículo ${index + 1}`
        return <fieldset key={row.id} className="rounded-lg border p-3 space-y-2">
          <legend>{description}</legend>
          <label className="flex gap-2"><input type="checkbox" checked={row.selected} onChange={event => update(row.id, { selected: event.target.checked })} />Incluir artículo {index + 1}</label>
          <p>Original: {line.cantidad.replace('.', ',')} {metadata?.unidad_medida} · $ {line.subtotal.replace('.', ',')}. El saldo disponible se verifica al guardar.</p>
          {row.selected && <>
            <label className="block">Cantidad artículo {index + 1}<input className={style} inputMode={metadata?.es_pesable ? 'decimal' : 'numeric'} required value={row.quantity} onChange={event => update(row.id, { quantity: event.target.value })} /></label>
            <label className="block">Importe artículo {index + 1}<input className={style} inputMode="decimal" required value={row.amount} onChange={event => update(row.id, { amount: event.target.value })} /></label>
            {line.tipo !== 'LIBRE' && <label className="flex gap-2"><input type="checkbox" checked={row.restock} onChange={event => update(row.id, { restock: event.target.checked })} />Solicitar reposición artículo {index + 1} sólo después del CAE NC</label>}
          </>}
        </fieldset>
      })}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{keys.map(key => <label key={key}>{labels[key]}<input className={style} inputMode="decimal" value={values[key]} required onChange={event => setValues(old => ({ ...old, [key]: event.target.value }))} /></label>)}</div>
      <details><summary>Detalle de IVA y otros tributos</summary><div className="space-y-3">
        {vat.map((row, index) => <fieldset key={row.key} className="rounded-lg border p-2"><legend>IVA {index + 1}</legend>
          <label>Código IVA {index + 1}<select className={style} required value={row.id} onChange={event => setVat(old => old.map(item => item.key === row.key ? { ...item, id: event.target.value } : item))}><option value="">Seleccionar código de la factura…</option>{body.iva.map(item => <option key={item.id} value={item.id}>{item.id}</option>)}</select></label>
          {(['base', 'importe'] as const).map(key => <label key={key}>{key === 'base' ? 'Base' : 'Importe'} IVA {index + 1}<input className={style} required value={row[key]} onChange={event => setVat(old => old.map(item => item.key === row.key ? { ...item, [key]: event.target.value } : item))} /></label>)}
          <Button type="button" variant="secondary" onClick={() => setVat(old => old.filter(item => item.key !== row.key))}>Quitar IVA {index + 1}</Button>
        </fieldset>)}
        <Button type="button" variant="secondary" disabled={vat.length >= 100 || body.iva.length === 0} onClick={() => setVat(old => [...old, { key: next.current++, id: '', base: '', importe: '' }])}>Agregar IVA del caso</Button>
        {tax.map((row, index) => <fieldset key={row.key} className="rounded-lg border p-2"><legend>Tributo {index + 1}</legend>
          {(['id', 'descripcion', 'base', 'alicuota', 'importe'] as const).map(key => <label key={key}>{({ id: 'Código', descripcion: 'Descripción', base: 'Base', alicuota: 'Alícuota', importe: 'Importe' })[key]} tributo {index + 1}<input className={style} required value={row[key]} onChange={event => setTax(old => old.map(item => item.key === row.key ? { ...item, [key]: event.target.value } : item))} /></label>)}
          <Button type="button" variant="secondary" onClick={() => setTax(old => old.filter(item => item.key !== row.key))}>Quitar tributo {index + 1}</Button>
        </fieldset>)}
        <Button type="button" variant="secondary" disabled={tax.length >= 100 || body.tributos.length === 0} onClick={() => setTax(old => [...old, { key: next.current++, id: '', descripcion: '', base: '', alicuota: '', importe: '' }])}>Agregar tributo del caso</Button>
      </div></details>
      <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Confirmo estos datos para guardar un caso sin emitir ni entregar efectivo o reponer stock.</label>
      <Button type="submit" fullWidth loading={busy} disabled={!confirmed}>Guardar caso sin emitir</Button>
    </fieldset>
  </form>
}
