import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FiscalCreditPreparationPanel } from '../components/pos/FiscalCreditPreparationPanel'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { prepareFiscalCreditPreparation, validateFiscalCreditPreparationRecord } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import type { FiscalCreditClient, PendingFiscalCreditPreparation } from '../lib/fiscalCreditClient'

async function fixture(concept: 1 | 2 = 1) {
  const f = await fiscalCreditContextFixture(11, concept), context = await validateFiscalCreditContext(f.context, f.source, f.proposal)
  const entry = concept === 1 ? { servicioDesde: null, servicioHasta: null, vencimientoPago: null }
    : { servicioDesde: '20261002', servicioHasta: '20261019', vencimientoPago: '20261027' }
  const prepared = await prepareFiscalCreditPreparation(f.source, f.proposal, context, entry)
  const stored = await validateFiscalCreditPreparationRecord({ version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation,
    solicitud_id: f.input.solicitud_id, propuesta_sha256: f.proposal.sha256, estado: 'DATOS_NC_PREPARADOS', contexto: context,
    preparacion: { canonico: prepared.canonico, sha256: prepared.sha256 }, propuesta: { canonico: f.proposal.canonico, sha256: f.proposal.sha256 },
    emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false }, f.source, f.proposal)
  const client = { context: vi.fn<FiscalCreditClient['context']>(async () => context), preparation: vi.fn<FiscalCreditClient['preparation']>(async () => null),
    pendingPreparation: vi.fn<FiscalCreditClient['pendingPreparation']>(() => null), recoverPreparation: vi.fn<FiscalCreditClient['recoverPreparation']>(async () => null),
    savePreparation: vi.fn<FiscalCreditClient['savePreparation']>(async () => stored), cancel: vi.fn<FiscalCreditClient['cancel']>(async () => ({ ...f.ack, estado: 'CANCELADA' })) }
  const pending: PendingFiscalCreditPreparation = { version: 1, operationId: f.operation, requestId: f.input.solicitud_id, proposalSha: f.proposal.sha256, preparationSha: prepared.sha256, contextSha: prepared.datos.contexto_sha256 }
  const props = { source: f.source, proposal: f.proposal, sequence: 1, client, onCancelled: vi.fn() }
  const consult = () => fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación guardada' }))
  return { ...f, client, props, consult, stored, pending, entry }
}
it('recupera antes de catálogo y no ofrece emisión ni escritura automática', async () => {
  const f = await fixture(); f.client.preparation.mockResolvedValueOnce(f.stored)
  render(<FiscalCreditPreparationPanel {...f.props} />); expect(f.client.preparation).not.toHaveBeenCalled(); f.consult()
  await screen.findByText('Preparación guardada y verificada. Falta revisar y autorizar la emisión.')
  expect(f.client.context).not.toHaveBeenCalled(); expect(f.client.savePreparation).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Guardar preparación NC' })).toBeNull()
})
it('integra revisión numerada sólo después de verificar preparación guardada', async () => {
  const f = await fixture(); f.client.preparation.mockResolvedValueOnce(f.stored)
  const reviewClient = { pendingReview: vi.fn(() => null), review: vi.fn(), recoverReview: vi.fn(), approveReview: vi.fn(), retryReview: vi.fn() }
  render(<FiscalCreditPreparationPanel {...f.props} reviewClient={reviewClient} />)
  expect(screen.queryByRole('button', { name: 'Consultar o recuperar revisión' })).toBeNull()
  f.consult(); await screen.findByRole('button', { name: 'Consultar o recuperar revisión' })
  expect(reviewClient.review).not.toHaveBeenCalled(); expect(reviewClient.approveReview).not.toHaveBeenCalled()
  expect(screen.queryByText('Sin número ni CAE. No entregues efectivo ni repongas stock.')).toBeNull()
})
it('servicios requieren fechas explícitas dd/mm/aaaa y confirmación; guarda sin emitir', async () => {
  const f = await fixture(2); render(<FiscalCreditPreparationPanel {...f.props} />); f.consult()
  const from = await screen.findByLabelText('Servicio desde')
  expect((from as HTMLInputElement).value).toBe('')
  fireEvent.change(from, { target: { value: '31/02/2026' } })
  fireEvent.change(screen.getByLabelText('Servicio hasta'), { target: { value: '19/10/2026' } })
  fireEvent.change(screen.getByLabelText('Vencimiento de pago'), { target: { value: '27/10/2026' } })
  fireEvent.click(screen.getByLabelText('Confirmo estos datos para guardar la preparación, sin emitir.'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar preparación NC' })); await screen.findByRole('alert')
  expect(f.client.savePreparation).not.toHaveBeenCalled()
  fireEvent.change(from, { target: { value: '02/10/2026' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar preparación NC' }))
  await screen.findByText('Preparación guardada y verificada. Falta revisar y autorizar la emisión.')
  expect(f.client.savePreparation).toHaveBeenCalledWith(f.source, f.proposal, expect.anything(), f.entry)
})
it('guardado incierto bloquea edición, consulta pendiente y permite cancelación confirmada', async () => {
  const f = await fixture(); f.client.savePreparation.mockRejectedValueOnce(new Error('PRIVATE_SQL'))
  render(<FiscalCreditPreparationPanel {...f.props} />); f.consult()
  await screen.findByText('Venta de productos: no corresponde período de servicios.')
  fireEvent.click(screen.getByLabelText('Confirmo estos datos para guardar la preparación, sin emitir.'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar preparación NC' }))
  expect((await screen.findByRole('alert')).textContent).not.toContain('PRIVATE_SQL')
  expect(screen.getByRole('button', { name: 'Guardar preparación NC' }).matches(':disabled')).toBe(true)
  f.client.pendingPreparation.mockReturnValue(f.pending); f.consult()
  await screen.findByText('La preparación sigue sin confirmarse.', { exact: false })
  expect(f.client.recoverPreparation).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Cancelar este caso y cerrar pendiente' }).matches(':disabled')).toBe(true)
  fireEvent.click(screen.getByLabelText('Confirmo cancelar este caso y conservar su historial.'))
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar este caso y cerrar pendiente' }))
  await screen.findByText('Caso cancelado y pendiente cerrado.', { exact: false })
  expect(f.client.cancel).toHaveBeenCalledTimes(1)
  expect(f.props.onCancelled).toHaveBeenCalledTimes(1)
})
it('consulta duplicada no repite y una preparación cancelada no ofrece guardado', async () => {
  const f = await fixture(); let finish!: (value: typeof f.stored) => void
  f.client.preparation.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  render(<FiscalCreditPreparationPanel {...f.props} />); f.consult(); f.consult()
  expect(f.client.preparation).toHaveBeenCalledTimes(1)
  await act(async () => { finish({ ...f.stored, estado: 'CANCELADA' }) })
  await screen.findByText('Preparación histórica cancelada.')
  expect(f.client.context).not.toHaveBeenCalled(); expect(f.client.savePreparation).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Guardar preparación NC' })).toBeNull()
})
it('cambiar caso descarta una consulta tardía', async () => {
  const f = await fixture(), other = await fixture(); let finish!: (value: typeof f.stored) => void
  f.client.preparation.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const view = render(<FiscalCreditPreparationPanel {...f.props} />); f.consult()
  await waitFor(() => expect(f.client.preparation).toHaveBeenCalledTimes(1))
  view.rerender(<FiscalCreditPreparationPanel {...other.props} />)
  await act(async () => { finish(f.stored) })
  expect(screen.queryByText('Preparación guardada y verificada.', { exact: false })).toBeNull()
  expect(other.client.context).not.toHaveBeenCalled()
})
