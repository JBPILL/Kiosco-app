import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FiscalPreparationForm } from '../components/pos/FiscalPreparationForm'
import type { FiscalPreparationContext } from '../../supabase/functions/_shared/fiscalPreparationContract'

const context: FiscalPreparationContext = { version: 1, venta_id: '11111111-1111-4111-8111-111111111111', total: '123.45', cuit_emisor: '20123456786', punto_venta: 7, incluye_recepcion_envases: false, revision_parametros: 1,
  condiciones: [{ id: 5, descripcion: 'Condición de ensayo', comprobantes: [11] }], alicuotas: [] }
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }) }
function fill() {
  change('Condición fiscal del emisor', 'MONOTRIBUTO')
  change('Tipo de comprobante', '11')
  change('Concepto', '1')
  change('Fecha del comprobante', '22/10/2026')
  change('Documento del receptor', '99')
  change('Número de documento (cero si corresponde)', '0')
  change('Condición IVA del receptor', '5')
  change('Moneda / cotización', 'PES')
  change('Neto', '123,45')
  for (const label of ['IVA total', 'No gravado', 'Exento', 'Otros tributos total']) change(label, '0')
}
function submit() { fireEvent.submit(screen.getByRole('form', { name: 'Preparación fiscal explícita' })) }
it('no precarga IVA, receptor, fecha ni importes y mantiene identidad de servidor fuera del formulario editable', () => {
  render(<FiscalPreparationForm context={context} onPrepare={vi.fn()} />)
  for (const label of ['Condición fiscal del emisor', 'Tipo de comprobante', 'Concepto', 'Documento del receptor', 'Condición IVA del receptor', 'Moneda / cotización', 'Neto', 'IVA total']) expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe('')
  expect(screen.getByText('20123456786').tagName).toBe('DD')
  expect(screen.getByText('7').tagName).toBe('DD')
})
it('prepara datos expresos sin número, CUIT, punto ni total elegidos por el navegador', async () => {
  const prepare = vi.fn().mockResolvedValue(undefined)
  render(<FiscalPreparationForm context={context} onPrepare={prepare} />)
  fill(); submit()
  await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1))
  expect(prepare.mock.calls[0][0]).toEqual({ condicionEmisor: 'MONOTRIBUTO', datos: {
    tipoComprobante: 11, concepto: 1, tipoDocumento: 99, numeroDocumento: '0', condicionIvaReceptor: 5, fecha: '20261022',
    servicioDesde: null, servicioHasta: null, vencimientoPago: null, moneda: 'PES', cotizacion: '1',
    importes: { neto: '123.45', iva: '0', noGravado: '0', exento: '0', tributos: '0' }, iva: [], tributos: [],
  } })
})
it.each(['31/02/2026', '2026-10-22', '22/10/26'])('no envía fecha inválida o con orden incorrecto %s', async value => {
  const prepare = vi.fn()
  render(<FiscalPreparationForm context={context} onPrepare={prepare} />)
  fill(); change('Fecha del comprobante', value); submit()
  await screen.findByRole('alert')
  expect(prepare).not.toHaveBeenCalled()
})
it('exige cero explícito y no redondea centavos', async () => {
  const prepare = vi.fn()
  render(<FiscalPreparationForm context={context} onPrepare={prepare} />)
  fill(); change('IVA total', ''); submit()
  await screen.findByRole('alert')
  expect(prepare).not.toHaveBeenCalled()
  change('IVA total', '0'); change('Neto', '123,451'); submit()
  expect(prepare).not.toHaveBeenCalled()
})
it('bloquea ventas con envases mientras falta criterio contable', () => {
  const prepare = vi.fn()
  render(<FiscalPreparationForm context={{ ...context, incluye_recepcion_envases: true }} onPrepare={prepare} />)
  expect(screen.getByRole('alert').textContent).toContain('contador')
  submit()
  expect(prepare).not.toHaveBeenCalled()
})
it('cambiar la venta elimina datos de la anterior', () => {
  const view = render(<FiscalPreparationForm context={context} onPrepare={vi.fn()} />)
  fill()
  view.rerender(<FiscalPreparationForm context={{ ...context, venta_id: '22222222-2222-4222-8222-222222222222' }} onPrepare={vi.fn()} />)
  expect((screen.getByLabelText('Neto') as HTMLInputElement).value).toBe('')
})
it('un fallo no muestra éxito fiscal ni filtra el error privado', async () => {
  render(<FiscalPreparationForm context={context} onPrepare={vi.fn().mockRejectedValue(new Error('PRIVATE_INTERNAL_DETAIL'))} />)
  fill(); submit()
  await screen.findByRole('alert')
  expect(screen.getByRole('alert').textContent).not.toContain('PRIVATE_INTERNAL_DETAIL')
  expect(screen.queryByRole('status')).toBeNull()
})
