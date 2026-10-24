import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FiscalCreditDraftForm } from '../components/pos/FiscalCreditDraftForm'
import { fiscalCreditUnitsFixture } from './fixtures/fiscalCreditUnits'
import { validateFiscalCreditUnits } from '../../supabase/functions/_shared/fiscalCreditUnits'
import { prepareFiscalCreditCase } from '../lib/fiscalCreditCasePreparation'
import { validateFiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
import type { FiscalCreditDraftInput } from '../../supabase/functions/_shared/fiscalCreditDraft'
async function fixture() {
  const f = await fiscalCreditUnitsFixture(), units = await validateFiscalCreditUnits(f.packet, f.source, f.commercial)
  const onSave = vi.fn<(input: FiscalCreditDraftInput) => Promise<void>>(async () => {})
  const props = { source: f.source, commercial: f.commercial, units, onSave }
  const change = (label: string, value: string): void => { fireEvent.change(screen.getByLabelText(label), { target: { value } }) }
  const fill = (): void => {
    change('Fecha del caso', '23/10/2026'); change('Motivo del caso', 'Producto dañado'); change('Código de condición IVA del receptor', '5')
    fireEvent.click(screen.getByLabelText('Incluir artículo 1'))
    change('Cantidad artículo 1', '2'); change('Importe artículo 1', '123,45')
    for (const label of ['Total del caso', 'Neto']) change(label, '123,45')
    for (const label of ['IVA total', 'No gravado', 'Exento', 'Otros tributos total']) change(label, '0')
    fireEvent.click(screen.getByLabelText('Confirmo estos datos para guardar un caso sin emitir ni entregar efectivo o reponer stock.'))
  }
  const submit = (): void => { fireEvent.submit(screen.getByRole('form', { name: 'Preparar caso NC' })) }
  return { ...f, units, onSave, props, fill, change, submit }
}
it('sin defaults; confirma cantidades/importes exactos y reposición no preseleccionada', async () => {
  const f = await fixture(); render(<FiscalCreditDraftForm {...f.props} />)
  expect((screen.getByLabelText('Código de condición IVA del receptor') as HTMLInputElement).value).toBe('')
  f.submit(); expect(f.onSave).not.toHaveBeenCalled()
  f.fill(); expect((screen.getByLabelText('Solicitar reposición artículo 1 sólo después del CAE NC') as HTMLInputElement).checked).toBe(false)
  f.submit(); f.submit(); await screen.findByText('Consulta de guardado terminada.', { exact: false })
  expect(f.onSave).toHaveBeenCalledTimes(1)
  expect(f.onSave.mock.calls[0][0]).toMatchObject({ fecha: '20261023', motivo: 'Producto dañado', condicion_iva_receptor: 5,
    lineas: [{ cantidad: '2.000', importe: '123.45', reingresa_stock: false }], importes: { total: '123.45', neto: '123.45', iva: '0.00' }, iva: [], tributos: [] })
})
it.each(['fecha', 'fraccion', 'suma', 'vacio', 'miles'] as const)('entrada %s inválida no se envía y admite corrección', async reason => {
  const f = await fixture(); render(<FiscalCreditDraftForm {...f.props} />); f.fill()
  const label = reason === 'fecha' ? 'Fecha del caso' : reason === 'fraccion' ? 'Cantidad artículo 1' : 'Neto'
  f.change(label, reason === 'fecha' ? '31/02/2026' : reason === 'fraccion' ? '1,5' : reason === 'suma' ? '1' : reason === 'vacio' ? '' : '1.000,00')
  f.submit(); await screen.findByRole('alert'); expect(f.onSave).not.toHaveBeenCalled()
  f.change(label, reason === 'fecha' ? '23/10/2026' : reason === 'fraccion' ? '2' : '123,45')
  f.submit(); await waitFor(() => expect(f.onSave).toHaveBeenCalledTimes(1))
})
it('resultado incierto congela contenido e identidad; no repite ni genera otro caso', async () => {
  const f = await fixture(); f.onSave.mockRejectedValue(new Error('PRIVATE_RPC'))
  render(<FiscalCreditDraftForm {...f.props} />); f.fill(); f.submit()
  expect((await screen.findByRole('alert')).textContent).not.toContain('PRIVATE_RPC')
  const identity = f.onSave.mock.calls[0][0].solicitud_id
  expect(identity).toMatch(/^[0-9a-f-]{36}$/)
  expect(screen.getByLabelText('Motivo del caso').matches(':disabled')).toBe(true)
  f.submit(); expect(f.onSave).toHaveBeenCalledTimes(1)
})
it('falta de unidades bloquea captura sin inventar metadata ni guardar', async () => {
  const f = await fixture(), units = await validateFiscalCreditUnits({ ...f.packet, estado: 'NO_REGISTRADAS', unidades: null }, f.source, f.commercial)
  render(<FiscalCreditDraftForm {...f.props} units={units} />)
  expect(screen.getByRole('alert').textContent).toContain('Falta conciliar')
  f.submit(); expect(f.onSave).not.toHaveBeenCalled()
})
it('desmontar durante validación no inicia guardado', async () => {
  const f = await fixture(), view = render(<FiscalCreditDraftForm {...f.props} />)
  f.fill(); f.submit(); view.unmount()
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  expect(f.onSave).not.toHaveBeenCalled()
})
it('precomprobación valida receta física para combo fraccionado y niega reposición de libre', async () => {
  const f = await fixture(), physical = crypto.randomUUID()
  const source = await validateFiscalRepresentation({ ...f.wire, contexto: { ...f.wire.contexto, lineas: f.wire.contexto.lineas.map(line => ({ ...line, cantidad: '0.500' })) } }, f.sale, f.operation)
  const commercial = { ...f.commercial, lineas: [{ ...f.commercial.lineas[0], tipo: 'COMBO' as const, cantidad: '0.500', componentes: [{ producto_id: physical, cantidad: '2.000' }] }] }
  const packet = await f.wrap({ ...f.data, lineas: [{ ...f.data.lineas[0], tipo: 'COMBO', es_pesable: true, unidad_medida: 'KG', componentes: [{ producto_id: physical, es_pesable: false, unidad_medida: 'UN' }] }] })
  const units = await validateFiscalCreditUnits(packet, source, commercial)
  const input = { ...f.input, lineas: [{ ...f.input.lineas[0], cantidad: '0.500' }] }
  expect((await prepareFiscalCreditCase(source, commercial, units, input)).estado).toBe('PROPUESTA_NO_PERSISTIDA')
  await expect(prepareFiscalCreditCase(source, commercial, units, { ...input, lineas: [{ ...input.lineas[0], cantidad: '0.250' }] })).rejects.toThrow('FISCAL_NC_CANTIDAD_INVALIDA')
  const free = { ...f.commercial, lineas: [{ ...f.commercial.lineas[0], tipo: 'LIBRE' as const, componentes: [] }] }
  const freePacket = await f.wrap({ ...f.data, lineas: [{ ...f.data.lineas[0], tipo: 'LIBRE', componentes: [] }] })
  const freeUnits = await validateFiscalCreditUnits(freePacket, f.source, free)
  await expect(prepareFiscalCreditCase(f.source, free, freeUnits, f.input)).rejects.toThrow('FISCAL_NC_CANTIDAD_INVALIDA')
})
