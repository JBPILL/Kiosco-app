import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FiscalOwnerReviewPanel } from '../components/pos/FiscalOwnerReviewPanel'
import type { FiscalOwnerApproval, FiscalOwnerReview } from '../../supabase/functions/_shared/fiscalOwnerReview'
import { wsfeSample } from './fixtures/fiscalWsfe'

const id = '11111111-1111-4111-8111-111111111111'
const review: FiscalOwnerReview = { operacion_id: '22222222-2222-4222-8222-222222222222', estado: 'RESERVADA', revision: 1,
  solicitud: { version: 1, sha256: 'a'.repeat(64), solicitud: wsfeSample }, aprobacion: null }
const ack = (): FiscalOwnerApproval => ({ id, operacion_id: review.operacion_id, solicitud_sha256: review.solicitud.sha256,
  revision: 1, aprobada: true, emision_habilitada: false, vence_en: new Date(Date.now() + 600000).toISOString() })
afterEach(() => vi.useRealTimers())
function checkAndApprove() {
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Aprobar revisión' }))
}
it('muestra cuerpo exacto y no deja aprobar sin revisión explícita', () => {
  const approve = vi.fn()
  render(<FiscalOwnerReviewPanel review={review} approvalId={id} onApprove={approve} />)
  expect(screen.getByText(/Revisar y aprobar no emite/)).toBeTruthy()
  expect(screen.getByText(wsfeSample.cuitEmisor)).toBeTruthy()
  expect(screen.getByText('PES / 1')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Aprobar revisión' }) as HTMLButtonElement).disabled).toBe(true)
  expect(approve).not.toHaveBeenCalled()
})
it('envía UUID/hash/revisión exactos y distingue aprobación de emisión', async () => {
  const approve = vi.fn().mockResolvedValue(ack())
  render(<FiscalOwnerReviewPanel review={review} approvalId={id} onApprove={approve} />)
  checkAndApprove()
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('todavía no se emitió'))
  expect(approve).toHaveBeenCalledExactlyOnceWith({ id, operacion_id: review.operacion_id, solicitud_sha256: review.solicitud.sha256, revision: 1 })
})
it('un ACK de otro cuerpo no aparece como aprobado', async () => {
  render(<FiscalOwnerReviewPanel review={review} approvalId={id} onApprove={vi.fn().mockResolvedValue({ ...ack(), solicitud_sha256: 'b'.repeat(64) })} />)
  checkAndApprove()
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  expect(screen.queryByRole('status')).toBeNull()
})
it('falla de red permite repetir con el mismo identificador, sin aprobación local', async () => {
  const approve = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(ack())
  render(<FiscalOwnerReviewPanel review={review} approvalId={id} onApprove={approve} />)
  checkAndApprove()
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Aprobar revisión' }))
  await screen.findByRole('status')
  expect(approve.mock.calls[0]).toEqual(approve.mock.calls[1])
})
it('una respuesta tardía no aprueba el cuerpo nuevo', async () => {
  let resolve!: (approval: FiscalOwnerApproval) => void
  const pending = new Promise<FiscalOwnerApproval>(done => { resolve = done })
  const props = { approvalId: id, onApprove: vi.fn(() => pending) }
  const view = render(<FiscalOwnerReviewPanel review={review} {...props} />)
  checkAndApprove()
  view.rerender(<FiscalOwnerReviewPanel review={{ ...review, solicitud: { ...review.solicitud, sha256: 'b'.repeat(64) } }} {...props} />)
  await act(async () => resolve(ack()))
  expect(screen.queryByRole('status')).toBeNull()
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
})
it.each(['ENVIO_INCIERTO', 'AUTORIZADA'] as const)('no ofrece aprobación para estado %s', estado => {
  render(<FiscalOwnerReviewPanel review={{ ...review, estado }} approvalId={id} onApprove={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'Aprobar revisión' })).toBeNull()
  expect(screen.getByRole('status')).toBeTruthy()
})
it('la aprobación que vence con la ventana abierta deja de mostrarse vigente', () => {
  vi.useFakeTimers()
  render(<FiscalOwnerReviewPanel review={{ ...review, aprobacion: { ...ack(), vence_en: new Date(Date.now() + 1500).toISOString() } }} approvalId={id} onApprove={vi.fn()} />)
  act(() => vi.advanceTimersByTime(2000))
  expect(screen.getByRole('status').textContent).toContain('venció')
  expect((screen.getByRole('button', { name: 'Aprobar revisión' }) as HTMLButtonElement).disabled).toBe(true)
})
