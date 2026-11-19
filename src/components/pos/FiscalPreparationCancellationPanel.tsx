import { useState } from 'react'
import { Button } from '../ui/Button'

interface Props { disabled: boolean; loading: boolean; onCancel: () => Promise<void> }
export function FiscalPreparationCancellationPanel({ disabled, loading, onCancel }: Props) {
  const [checked, setChecked] = useState(false)
  return <section aria-label="Cancelar preparación sin número" className="space-y-3 rounded-lg border p-4">
    <p>Podés cerrar esta preparación antes de que tenga cuerpo o número fiscal y volver a cargar los datos. El historial, la venta y el cobro se conservan.</p>
    <label className="flex gap-2"><input type="checkbox" checked={checked} disabled={disabled || loading} onChange={event => setChecked(event.target.checked)} />Confirmo que quiero cerrar este intento y cargar otra preparación.</label>
    <Button variant="secondary" disabled={!checked || disabled} loading={loading} onClick={() => { void onCancel() }}>Cancelar preparación sin número</Button>
  </section>
}
