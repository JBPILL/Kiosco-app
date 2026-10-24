import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { FiscalRepresentationExport } from '../components/pos/FiscalRepresentationExport'
import { fiscalRepresentationFixture } from './fixtures/fiscalRepresentation'
import { validateFiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
import type { FiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
const mocks = vi.hoisted(() => ({ save: vi.fn(), create: vi.fn() }))
vi.mock('../lib/fiscalRepresentationPdf', () => ({ createFiscalRepresentationPdf: mocks.create }))
beforeEach(() => { mocks.save.mockReset(); mocks.create.mockReset().mockResolvedValue({ doc: { save: mocks.save }, fileName: 'homologacion.pdf', pages: 1 }) })
async function fixture() {
  const f = await fiscalRepresentationFixture(), source = await validateFiscalRepresentation(f.wire, f.sale, f.operation)
  return { source, client: { representation: vi.fn(async () => source) } }
}
it('consulta sólo al solicitar la descarga y conserva el cuerpo autorizado', async () => {
  const f = await fixture(); render(<FiscalRepresentationExport client={f.client} receipt={f.source.constancia} />)
  expect(f.client.representation).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Descargar PDF de homologación' }))
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('homologacion.pdf'))
  expect(f.client.representation).toHaveBeenCalledExactlyOnceWith(f.source.operacion_id)
  expect(mocks.create).toHaveBeenCalledExactlyOnceWith(f.source)
  expect(screen.getByRole('status').textContent).toContain('Sin validez fiscal')
})
it('doble clic no duplica generación y cerrar durante consulta no descarga', async () => {
  const f = await fixture(); let finish!: (v: Readonly<FiscalRepresentation>) => void
  f.client.representation.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const view = render(<FiscalRepresentationExport client={f.client} receipt={f.source.constancia} />)
  const button = screen.getByRole('button', { name: 'Descargar PDF de homologación' })
  fireEvent.click(button); fireEvent.click(button); expect(f.client.representation).toHaveBeenCalledTimes(1)
  view.unmount(); await act(async () => { finish(f.source) })
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled()
})
it('cerrar durante generación tampoco descarga un PDF tardío', async () => {
  const f = await fixture(); let finish!: () => void
  mocks.create.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ doc: { save: mocks.save }, fileName: 'late.pdf' }) }))
  const view = render(<FiscalRepresentationExport client={f.client} receipt={f.source.constancia} />)
  fireEvent.click(screen.getByRole('button', { name: 'Descargar PDF de homologación' }))
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
  view.unmount(); await act(async () => { finish() }); expect(mocks.save).not.toHaveBeenCalled()
})
it('fuente de otra venta no genera PDF ni altera la constancia', async () => {
  const f = await fixture(), other = await fixture(); f.client.representation.mockResolvedValue(other.source)
  render(<FiscalRepresentationExport client={f.client} receipt={f.source.constancia} />)
  fireEvent.click(screen.getByRole('button', { name: 'Descargar PDF de homologación' }))
  await screen.findByRole('status'); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled()
  expect(screen.getByRole('status').textContent).toContain('Conservá la constancia')
})
it('cambiar de comprobante descarta la consulta anterior sin descargarla', async () => {
  const f = await fixture(), next = await fixture(); let finish!: (v: Readonly<FiscalRepresentation>) => void
  f.client.representation.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const view = render(<FiscalRepresentationExport client={f.client} receipt={f.source.constancia} />)
  fireEvent.click(screen.getByRole('button', { name: 'Descargar PDF de homologación' }))
  view.rerender(<FiscalRepresentationExport client={next.client} receipt={next.source.constancia} />)
  await act(async () => { finish(f.source) })
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled()
  expect(next.client.representation).not.toHaveBeenCalled()
})
it('fallos y glifos incompatibles permiten reconsultar sin otra preparación o emisión', async () => {
  const f = await fixture(); f.client.representation.mockRejectedValueOnce(new Error('PRIVATE_SYNTHETIC_ERROR'))
  mocks.create.mockRejectedValueOnce(new Error('FISCAL_PDF_FUENTE_NO_COMPATIBLE'))
  render(<FiscalRepresentationExport client={f.client} receipt={f.source.constancia} />)
  const button = screen.getByRole('button', { name: 'Descargar PDF de homologación' })
  fireEvent.click(button); await screen.findByRole('status')
  expect(screen.getByRole('status').textContent).not.toContain('PRIVATE_SYNTHETIC_ERROR')
  fireEvent.click(button); await waitFor(() => expect(screen.getByRole('status').textContent).toContain('no admite alguno'))
  expect(mocks.save).not.toHaveBeenCalled()
})
