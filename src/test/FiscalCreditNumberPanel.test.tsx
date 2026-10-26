import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FiscalCreditNumberPanel } from '../components/pos/FiscalCreditNumberPanel'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { prepareFiscalCreditPreparation, validateFiscalCreditPreparationRecord, fiscalCreditPreparationWire } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import { prepareFiscalCreditRequest } from '../../supabase/functions/_shared/fiscalCreditRequest'
import { validateFiscalCreditOwnerReview } from '../../supabase/functions/_shared/fiscalCreditOwnerReview'
import type { FiscalCreditClient } from '../lib/fiscalCreditClient'

async function fixture() {
  const f = await fiscalCreditContextFixture(), context = await validateFiscalCreditContext(f.context, f.source, f.proposal)
  const prepared = await prepareFiscalCreditPreparation(f.source, f.proposal, context, { servicioDesde: null, servicioHasta: null, vencimientoPago: null })
  const packet = { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation, solicitud_id: f.input.solicitud_id,
    propuesta_sha256: f.proposal.sha256, estado: 'DATOS_NC_PREPARADOS', contexto: context, preparacion: { canonico: prepared.canonico, sha256: prepared.sha256 },
    propuesta: { canonico: f.proposal.canonico, sha256: f.proposal.sha256 }, emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false }
  const preparation = await validateFiscalCreditPreparationRecord(packet, f.source, f.proposal), reservationId = crypto.randomUUID()
  const reservation = { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation, solicitud_id: f.input.solicitud_id,
    propuesta_sha256: f.proposal.sha256, preparacion_sha256: prepared.sha256, reserva_id: reservationId, cuit_emisor: context.cuit_emisor,
    punto_venta: context.punto_venta, tipo_comprobante: context.tipo_nota_credito, numero: 23, estado: 'RESERVADA', emision_habilitada: false }
  const request = await prepareFiscalCreditRequest(f.source, f.proposal, fiscalCreditPreparationWire(preparation), reservation)
  const body = await validateFiscalCreditOwnerReview({ version: 1, cuerpo: { preparacion: packet, reserva: reservation, cuerpo: { canonico: request.canonico, sha256: request.sha256 } }, aprobacion: null, emision_habilitada: false }, f.source, f.proposal)
  const pending = { version: 1 as const, operationId: f.operation, requestId: f.input.solicitud_id, proposalSha: f.proposal.sha256, preparationSha: prepared.sha256, reservationId }
  const client = { pendingNumber: vi.fn<FiscalCreditClient['pendingNumber']>(() => null), body: vi.fn<FiscalCreditClient['body']>(async () => null),
    recoverNumber: vi.fn<FiscalCreditClient['recoverNumber']>(async () => body), number: vi.fn<FiscalCreditClient['number']>(async () => body), retryNumber: vi.fn<FiscalCreditClient['retryNumber']>(async () => body) }
  const reviewClient = { pendingReview: vi.fn(() => null), review: vi.fn(), recoverReview: vi.fn(), approveReview: vi.fn(), retryReview: vi.fn() }
  return { ...f, body, pending, client, reviewClient, props: { source: f.source, proposal: f.proposal, preparation, sequence: 1, client, reviewClient } }
}
const consult = () => fireEvent.click(screen.getByRole('button', { name: 'Consultar o recuperar numeración' }))
it('consulta manual y confirmación preceden reserva; revisión aparece sólo con cuerpo verificado', async () => {
  const f = await fixture(); render(<FiscalCreditNumberPanel {...f.props} />)
  expect(f.client.body).not.toHaveBeenCalled(); expect(screen.queryByRole('checkbox')).toBeNull()
  consult(); const reserve = await screen.findByRole('button', { name: 'Reservar número para revisar' })
  expect(reserve.hasAttribute('disabled')).toBe(true)
  expect(screen.queryByRole('button', { name: 'Consultar o recuperar revisión' })).toBeNull()
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(reserve)
  await screen.findByText('Cuerpo numerado guardado; estado de emisión sin consultar: 00007-00000023.')
  expect(f.client.number).toHaveBeenCalledTimes(1); expect(f.reviewClient.review).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Consultar o recuperar revisión' })).toBeTruthy()
})
it('recupera pendiente sin reserva ni revisión automáticas', async () => {
  const f = await fixture(); f.client.pendingNumber.mockReturnValue(f.pending)
  render(<FiscalCreditNumberPanel {...f.props} />); consult()
  await screen.findByText('Cuerpo numerado guardado; estado de emisión sin consultar: 00007-00000023.')
  expect(f.client.recoverNumber).toHaveBeenCalledTimes(1); expect(f.client.body).not.toHaveBeenCalled(); expect(f.client.number).not.toHaveBeenCalled()
  expect(f.reviewClient.review).not.toHaveBeenCalled()
})
it('ausencia confirmada con pendiente exige confirmación para reintentar el original', async () => {
  const f = await fixture(); f.client.pendingNumber.mockReturnValue(f.pending); f.client.recoverNumber.mockResolvedValue(null)
  render(<FiscalCreditNumberPanel {...f.props} />); consult()
  const retry = await screen.findByRole('button', { name: 'Reintentar reserva original, sin emitir' })
  expect(retry.hasAttribute('disabled')).toBe(true); expect(f.client.retryNumber).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(retry)
  await screen.findByText('Cuerpo numerado guardado; estado de emisión sin consultar: 00007-00000023.')
  expect(f.client.retryNumber).toHaveBeenCalledTimes(1); expect(f.client.number).not.toHaveBeenCalled()
})
it('error de lectura no se trata como ausencia ni habilita reserva', async () => {
  const f = await fixture(); f.client.body.mockRejectedValue(new Error('NETWORK'))
  render(<FiscalCreditNumberPanel {...f.props} />); consult(); await screen.findByRole('alert')
  expect(screen.queryByRole('checkbox')).toBeNull(); expect(f.client.number).not.toHaveBeenCalled()
})
it('ACK perdido bloquea otra reserva y permite recuperar el original', async () => {
  const f = await fixture(); f.client.number.mockImplementation(async () => { f.client.pendingNumber.mockReturnValue(f.pending); throw new Error('ACK_LOST') })
  render(<FiscalCreditNumberPanel {...f.props} />); consult(); await screen.findByRole('checkbox')
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Reservar número para revisar' }))
  await screen.findByRole('alert'); expect(screen.queryByRole('checkbox')).toBeNull()
  consult(); await screen.findByText('Cuerpo numerado guardado; estado de emisión sin consultar: 00007-00000023.')
  expect(f.client.number).toHaveBeenCalledTimes(1); expect(f.client.recoverNumber).toHaveBeenCalledTimes(1)
})
it('cuerpo alterado no abre revisión', async () => {
  const f = await fixture(); f.client.body.mockResolvedValue({ ...f.body, cuerpo: { ...f.body.cuerpo, sha256: 'e'.repeat(64) } })
  render(<FiscalCreditNumberPanel {...f.props} />); consult(); await screen.findByRole('alert')
  expect(screen.queryByRole('button', { name: 'Consultar o recuperar revisión' })).toBeNull()
})
it('respuesta tardía de otro cuerpo no cambia la pantalla actual', async () => {
  const f = await fixture(); let resolve!: (value: typeof f.body) => void
  f.client.body.mockReturnValue(new Promise(done => { resolve = done }))
  const view = render(<FiscalCreditNumberPanel {...f.props} />); consult(); await waitFor(() => expect(f.client.body).toHaveBeenCalledTimes(1))
  view.rerender(<FiscalCreditNumberPanel {...f.props} proposal={{ ...f.proposal, sha256: 'e'.repeat(64) }} />)
  await act(async () => resolve(f.body))
  expect(screen.queryByText('Cuerpo numerado guardado; estado de emisión sin consultar: 00007-00000023.')).toBeNull()
})
