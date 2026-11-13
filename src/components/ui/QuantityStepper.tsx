import { useId } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  max: number
  min?: number
  fractional?: boolean
  label: string
}
/** Keep invalid pasted quantities visible for correction, never concatenate or round them. */
export function QuantityStepper({ value, onChange, max, min = 0, fractional = false, label }: Props) {
  const inputId = useId()
  const n = Number(value)
  const valid = value !== '' && Number.isFinite(n) && n >= min && n <= max && (fractional ? Number(n.toFixed(3)) === n : Number.isInteger(n))
  function move(delta: number) {
    const current = Number.isFinite(n) ? n : min
    onChange(String(Math.min(max, Math.max(min, Math.round((current + delta) * 1000) / 1000))))
  }
  return <div className="space-y-1">
    <label htmlFor={inputId} className="block text-sm font-medium">{label}</label>
      <span className="mt-1 flex items-center gap-2">
        <button type="button" aria-label={`Restar ${label.toLowerCase()}`} disabled={n <= min} onClick={() => move(-1)} className="h-11 w-11 shrink-0 rounded-lg border font-bold disabled:opacity-40">−</button>
        <input id={inputId} aria-invalid={value !== '' && !valid} className="h-11 min-w-0 w-full rounded-lg border border-gray-300 bg-white text-center text-lg font-bold text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" type="text" min={min} max={max} inputMode={fractional ? 'decimal' : 'numeric'} value={value} placeholder="0" onFocus={e => { if (value === '0') onChange(''); e.target.select() }} onChange={e => onChange(e.target.value.replace(',', '.'))} />
        <button type="button" aria-label={`Sumar ${label.toLowerCase()}`} disabled={n >= max} onClick={() => move(1)} className="h-11 w-11 shrink-0 rounded-lg border font-bold disabled:opacity-40">+</button>
      </span>
    {value !== '' && !valid && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fractional ? `Ingresá una cantidad entre ${min} y ${max}, con hasta 3 decimales.` : `Ingresá una cantidad entera entre ${min} y ${max}.`}</p>}
  </div>
}
