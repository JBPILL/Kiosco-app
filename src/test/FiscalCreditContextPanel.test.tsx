import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FiscalCreditContextPanel } from '../components/pos/FiscalCreditContextPanel'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import type { FiscalCreditClient } from '../lib/fiscalCreditClient'
async function fixture() {
  const f = await fiscalCreditContextFixture(), context = await validateFiscalCreditContext(f.context, f.source, f.proposal)
  const client = { context: vi.fn<FiscalCreditClient['context']>(async () => context) }
  const props = { source: f.source, proposal: f.proposal, client, sequence: 1 }
  const consult = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Consultar contexto fiscal del caso 1' })) }
  return { ...f, model: context, client, props, consult }
}
it('consulta manual muestra contexto exacto sin ofrecer emisión, numeración o devolución', async () => {
  const f = await fixture(); render(<FiscalCreditContextPanel {...f.props} />)
  expect(f.client.context).not.toHaveBeenCalled(); f.consult()
  await screen.findByText('Nota de crédito C'); expect(screen.getByText('Condición sintética')).toBeTruthy()
  expect(screen.getByText('Datos fiscales verificados para esta consulta.', { exact: false })).toBeTruthy()
  expect(screen.getAllByRole('button')).toHaveLength(1)
})
it('error de nueva consulta retira contexto anterior y no se convierte en autorización o ausencia', async () => {
  const f = await fixture(); render(<FiscalCreditContextPanel {...f.props} />); f.consult(); await screen.findByText('Nota de crédito C')
  f.client.context.mockRejectedValueOnce(new Error('PRIVATE_SQL')); f.consult()
  expect((await screen.findByRole('alert')).textContent).not.toContain('PRIVATE_SQL')
  expect(screen.queryByText('Nota de crédito C')).toBeNull()
})
it('respuesta de otra factura o caso no se muestra', async () => {
  const f = await fixture(), other = await fixture()
  f.client.context.mockResolvedValueOnce(other.model)
  render(<FiscalCreditContextPanel {...f.props} />); f.consult(); await screen.findByRole('alert')
  expect(screen.queryByText('Nota de crédito C')).toBeNull()
  f.client.context.mockResolvedValueOnce({ ...f.model, solicitud_id: other.model.solicitud_id })
  f.consult(); await screen.findByRole('alert'); expect(screen.queryByText('Nota de crédito C')).toBeNull()
})
it('doble clic no duplica y cambiar comprobante descarta respuesta tardía', async () => {
  const f = await fixture(), other = await fixture()
  let finish!: (value: Awaited<ReturnType<FiscalCreditClient['context']>>) => void
  f.client.context.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const view = render(<FiscalCreditContextPanel {...f.props} />); f.consult(); f.consult()
  expect(f.client.context).toHaveBeenCalledTimes(1)
  view.rerender(<FiscalCreditContextPanel {...other.props} />)
  await act(async () => { finish(f.model) }); expect(screen.queryByText('Nota de crédito C')).toBeNull()
  expect(other.client.context).not.toHaveBeenCalled()
})
it('desmontar mientras consulta no presenta resultado tardío', async () => {
  const f = await fixture(); let finish!: (value: Awaited<ReturnType<FiscalCreditClient['context']>>) => void
  f.client.context.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const view = render(<FiscalCreditContextPanel {...f.props} />); f.consult(); view.unmount()
  await act(async () => { finish(f.model) }); expect(screen.queryByText('Nota de crédito C')).toBeNull()
})
