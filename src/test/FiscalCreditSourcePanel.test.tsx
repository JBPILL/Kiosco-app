import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FiscalCreditSourcePanel } from '../components/pos/FiscalCreditSourcePanel'
import { fiscalCreditUnitsFixture } from './fixtures/fiscalCreditUnits'
import { validateFiscalCreditUnits } from '../../supabase/functions/_shared/fiscalCreditUnits'
import { validateFiscalCreditCommercialSource } from '../../supabase/functions/_shared/fiscalCreditCommercialSource'
import type { FiscalCreditClient } from '../lib/fiscalCreditClient'
async function fixture() {
  const f = await fiscalCreditUnitsFixture()
  const client = {
    commercialSource: vi.fn<FiscalCreditClient['commercialSource']>(async () => validateFiscalCreditCommercialSource(f.commercial, f.source)),
    units: vi.fn<FiscalCreditClient['units']>(async () => validateFiscalCreditUnits(f.packet, f.source, f.commercial)),
  }
  const props = { source: f.source, client }
  const consult = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Consultar datos originales' })) }
  return { ...f, props, client, consult }
}
it('consulta explícita muestra pagos y unidades originales sin crear casos ni ofrecer reintegro', async () => {
  const f = await fixture(); render(<FiscalCreditSourcePanel {...f.props} />)
  expect(f.client.commercialSource).not.toHaveBeenCalled(); f.consult()
  await screen.findByText('Unidades originales verificadas.', { exact: false })
  expect(screen.getByText('Efectivo · $ 123,45')).toBeTruthy()
  expect(screen.getByText('Unidades enteras registradas')).toBeTruthy()
  expect(screen.getByText('Componente 1 · 1,000 por unidad vendida · UN (entero)')).toBeTruthy()
  expect(screen.getAllByRole('button')).toHaveLength(1)
  expect(f.client.units).toHaveBeenCalledTimes(1)
})
it('registro ausente explícito informa conciliación y nunca infiere unidades actuales', async () => {
  const f = await fixture()
  f.client.units.mockResolvedValue(await validateFiscalCreditUnits({ ...f.packet, estado: 'NO_REGISTRADAS', unidades: null }, f.source, f.commercial))
  render(<FiscalCreditSourcePanel {...f.props} />); f.consult()
  await screen.findByText('La venta no tiene unidades históricas registradas.', { exact: false })
  expect(screen.getByText('2,000 (unidad sin registro) · $ 123,45')).toBeTruthy()
  expect(screen.queryByText('Unidades originales verificadas.', { exact: false })).toBeNull()
})
it('pago mixto advierte sobre el medio original y conserva hechos sin prometer efectivo', async () => {
  const f = await fixture()
  const mixed = await validateFiscalCreditCommercialSource({ ...f.commercial, pago_integro_efectivo: false, pagos: [{ medio: 'TARJETA', importe: '123.45' }] }, f.source)
  f.client.commercialSource.mockResolvedValue(mixed)
  render(<FiscalCreditSourcePanel {...f.props} />); f.consult()
  await screen.findByText('Tarjeta · $ 123,45')
  expect(screen.getByText('La venta incluye otro medio de pago.', { exact: false })).toBeTruthy()
})
it.each(['commercial', 'units'] as const)('error de %s retira resultados previos, no equivale a ausencia y sanea mensajes', async stage => {
  const f = await fixture(); render(<FiscalCreditSourcePanel {...f.props} />); f.consult()
  await screen.findByText('Unidades originales verificadas.', { exact: false })
  if (stage === 'commercial') f.client.commercialSource.mockRejectedValueOnce(new Error('PRIVATE_SQL'))
  else f.client.units.mockRejectedValueOnce(new Error('PRIVATE_SQL'))
  f.consult(); const alert = await screen.findByRole('alert')
  expect(alert.textContent).not.toContain('PRIVATE_SQL')
  expect(screen.queryByLabelText('Pagos originales')).toBeNull()
  expect(screen.queryByText('La venta no tiene unidades históricas registradas.', { exact: false })).toBeNull()
})
it('respuesta de otra factura se rechaza antes de consultar unidades', async () => {
  const f = await fixture(), other = await fixture()
  f.client.commercialSource.mockResolvedValue(await other.client.commercialSource(other.source))
  render(<FiscalCreditSourcePanel {...f.props} />); f.consult(); await screen.findByRole('alert')
  expect(f.client.units).not.toHaveBeenCalled(); expect(screen.queryByLabelText('Pagos originales')).toBeNull()
})
it('cambio de factura descarta respuesta tardía y doble clic no duplica consultas', async () => {
  const f = await fixture(), other = await fixture()
  let finish!: (value: Awaited<ReturnType<FiscalCreditClient['commercialSource']>>) => void
  f.client.commercialSource.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const view = render(<FiscalCreditSourcePanel {...f.props} />); f.consult(); f.consult()
  expect(f.client.commercialSource).toHaveBeenCalledTimes(1)
  view.rerender(<FiscalCreditSourcePanel {...other.props} />)
  await act(async () => { finish(await validateFiscalCreditCommercialSource(f.commercial, f.source)) })
  expect(f.client.units).not.toHaveBeenCalled(); expect(screen.queryByLabelText('Pagos originales')).toBeNull()
})
it('unidades de otra factura no se muestran y desmontar descarta respuesta de unidades', async () => {
  const f = await fixture(), other = await fixture()
  f.client.units.mockResolvedValue(await other.client.units(other.source, other.commercial))
  const view = render(<FiscalCreditSourcePanel {...f.props} />); f.consult(); await screen.findByRole('alert')
  expect(screen.queryByLabelText('Pagos originales')).toBeNull()
  let finish!: (value: Awaited<ReturnType<FiscalCreditClient['units']>>) => void
  f.client.units.mockReturnValue(new Promise(resolve => { finish = resolve })); f.consult()
  await act(async () => { await vi.waitFor(() => expect(f.client.units).toHaveBeenCalledTimes(2)) })
  view.unmount()
  await act(async () => { finish(await validateFiscalCreditUnits(f.packet, f.source, f.commercial)) })
  expect(screen.queryByLabelText('Pagos originales')).toBeNull()
})
