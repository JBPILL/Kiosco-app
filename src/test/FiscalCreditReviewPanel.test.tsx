import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FiscalCreditReviewPanel } from '../components/pos/FiscalCreditReviewPanel'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { prepareFiscalCreditPreparation, validateFiscalCreditPreparationRecord, fiscalCreditPreparationWire } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import { prepareFiscalCreditRequest } from '../../supabase/functions/_shared/fiscalCreditRequest'
import { validateFiscalCreditOwnerReview } from '../../supabase/functions/_shared/fiscalCreditOwnerReview'
import type { FiscalCreditClient } from '../lib/fiscalCreditClient'

async function fixture(concept: 1 | 2 = 1) {
  const f = await fiscalCreditContextFixture(11, concept), context = await validateFiscalCreditContext(f.context, f.source, f.proposal)
  const periods = concept === 1 ? { servicioDesde: null, servicioHasta: null, vencimientoPago: null }
    : { servicioDesde: '20261002', servicioHasta: '20261019', vencimientoPago: '20261027' }
  const prepared = await prepareFiscalCreditPreparation(f.source, f.proposal, context, periods)
  const preparationPacket = { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation, solicitud_id: f.input.solicitud_id,
    propuesta_sha256: f.proposal.sha256, estado: 'DATOS_NC_PREPARADOS', contexto: context, preparacion: { canonico: prepared.canonico, sha256: prepared.sha256 },
    propuesta: { canonico: f.proposal.canonico, sha256: f.proposal.sha256 }, emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false }
  const preparation = await validateFiscalCreditPreparationRecord(preparationPacket, f.source, f.proposal)
  const reservation = { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation, solicitud_id: f.input.solicitud_id,
    propuesta_sha256: f.proposal.sha256, preparacion_sha256: prepared.sha256, reserva_id: crypto.randomUUID(), cuit_emisor: context.cuit_emisor,
    punto_venta: context.punto_venta, tipo_comprobante: context.tipo_nota_credito, numero: 23, estado: 'RESERVADA', emision_habilitada: false }
  const request = await prepareFiscalCreditRequest(f.source, f.proposal, fiscalCreditPreparationWire(preparation), reservation)
  const packet = { version: 1, cuerpo: { preparacion: preparationPacket, reserva: reservation, cuerpo: { canonico: request.canonico, sha256: request.sha256 } }, aprobacion: null, emision_habilitada: false }
  const review = await validateFiscalCreditOwnerReview(packet, f.source, f.proposal), reviewId = crypto.randomUUID()
  const approved = await validateFiscalCreditOwnerReview({ ...packet, aprobacion: { id: reviewId, solicitud_id: f.input.solicitud_id, reserva_id: reservation.reserva_id,
    solicitud_sha256: request.sha256, preparacion_sha256: prepared.sha256, aprobada: true, vence_en: '2026-10-24T12:00:00Z', emision_habilitada: false } }, f.source, f.proposal)
  const pending = { version: 1 as const, operationId: f.operation, requestId: f.input.solicitud_id, proposalSha: f.proposal.sha256, preparationSha: prepared.sha256, bodySha: request.sha256, reviewId }
  const client = { pendingReview: vi.fn<FiscalCreditClient['pendingReview']>(() => null), review: vi.fn<FiscalCreditClient['review']>(async () => review),
    recoverReview: vi.fn<FiscalCreditClient['recoverReview']>(async () => approved), approveReview: vi.fn<FiscalCreditClient['approveReview']>(async () => approved), retryReview: vi.fn<FiscalCreditClient['retryReview']>(async () => approved) }
  return { ...f, review, approved, pending, client, props: { source: f.source, proposal: f.proposal, preparation, client, sequence: 1 } }
}
const consult = () => fireEvent.click(screen.getByRole('button', { name: 'Consultar o recuperar revisión' }))
it('consulta manual muestra numeración reservada y exige confirmación antes de aprobar', async () => {
  const f = await fixture(); render(<FiscalCreditReviewPanel {...f.props} />)
  expect(f.client.review).not.toHaveBeenCalled(); consult()
  await screen.findByText('NC C · 00007-00000023')
  const save = screen.getByRole('button', { name: 'Guardar aprobación del Dueño, sin emitir' })
  expect(save.hasAttribute('disabled')).toBe(true); fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(save)
  await screen.findByText('Aprobación guardada para este cuerpo. No es una nota de crédito emitida.')
  expect(f.client.approveReview).toHaveBeenCalledTimes(1); expect(screen.queryByRole('button', { name: /Emitir/ })).toBeNull()
  expect(screen.getByText(/El servidor debe comprobar su vigencia/)).toBeTruthy()
})
it('recupera pendiente antes de consultar y no vuelve a aprobar automáticamente', async () => {
  const f = await fixture(); f.client.pendingReview.mockReturnValue(f.pending)
  render(<FiscalCreditReviewPanel {...f.props} />); consult()
  await screen.findByText('Aprobación guardada para este cuerpo. No es una nota de crédito emitida.')
  expect(f.client.recoverReview).toHaveBeenCalledTimes(1); expect(f.client.review).not.toHaveBeenCalled(); expect(f.client.approveReview).not.toHaveBeenCalled()
})
it('aprobación no confirmada conserva recuperación y bloquea otra aprobación', async () => {
  const f = await fixture(); f.client.approveReview.mockRejectedValue(new Error('ACK_LOST'))
  render(<FiscalCreditReviewPanel {...f.props} />); consult(); await screen.findByRole('checkbox')
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Guardar aprobación del Dueño, sin emitir' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Guardar aprobación del Dueño, sin emitir' }).hasAttribute('disabled')).toBe(true)
  expect(f.client.approveReview).toHaveBeenCalledTimes(1)
})
it('respuesta alterada no se muestra como aprobación confirmada', async () => {
  const f = await fixture(); f.client.review.mockResolvedValue({ ...f.review, cuerpo: { ...f.review.cuerpo, sha256: 'f'.repeat(64) } })
  render(<FiscalCreditReviewPanel {...f.props} />); consult(); await screen.findByRole('alert')
  expect(screen.queryByRole('checkbox')).toBeNull(); expect(f.client.approveReview).not.toHaveBeenCalled()
})
it('descarta respuesta tardía al cambiar de cuerpo', async () => {
  const f = await fixture(); let resolve!: (value: typeof f.review) => void
  f.client.review.mockReturnValue(new Promise(done => { resolve = done }))
  const view = render(<FiscalCreditReviewPanel {...f.props} />); consult()
  await waitFor(() => expect(f.client.review).toHaveBeenCalledTimes(1))
  view.rerender(<FiscalCreditReviewPanel {...f.props} proposal={{ ...f.proposal, sha256: 'e'.repeat(64) }} />)
  await act(async () => resolve(f.review))
  expect(screen.queryByText('NC C · 00007-00000023')).toBeNull()
})
it('muestra períodos de servicios explícitos en orden día mes año', async () => {
  const f = await fixture(2); render(<FiscalCreditReviewPanel {...f.props} />); consult()
  await screen.findByText('Servicios: 02/10/2026 al 19/10/2026 · Pago: 27/10/2026')
  expect(f.client.approveReview).not.toHaveBeenCalled()
})
it('pendiente no recuperado permite reintentar sólo tras revisar el cuerpo y confirmar', async () => {
  const f = await fixture(); f.client.pendingReview.mockReturnValue(f.pending); f.client.recoverReview.mockRejectedValue(new Error('UNKNOWN'))
  render(<FiscalCreditReviewPanel {...f.props} />); consult()
  const retry = await screen.findByRole('button', { name: 'Reintentar aprobación guardada, sin emitir' })
  expect(retry.hasAttribute('disabled')).toBe(true); expect(f.client.retryReview).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(retry)
  await screen.findByText('Aprobación guardada para este cuerpo. No es una nota de crédito emitida.')
  expect(f.client.retryReview).toHaveBeenCalledTimes(1); expect(f.client.approveReview).not.toHaveBeenCalled()
})
