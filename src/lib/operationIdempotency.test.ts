import { afterEach, expect, it } from 'vitest'
import { confirmarOperacionPendiente, confirmarOperacionPersistida, obtenerIdOperacionPendiente, obtenerOperacionPersistida } from './operationIdempotency'

afterEach(() => localStorage.clear())

it('reuses a stable id for the same pending body and separates changed bodies', () => {
  const first = obtenerIdOperacionPendiente('cash', { amount: 25, session: 's1' })
  expect(obtenerIdOperacionPendiente('cash', { amount: 25, session: 's1' })).toBe(first)
  expect(obtenerIdOperacionPendiente('cash', { amount: 26, session: 's1' })).not.toBe(first)
})

it('releases the stable id after the server confirms the operation', () => {
  const body = { customer: 'c1', amount: 5 }
  const first = obtenerIdOperacionPendiente('credit', body)
  confirmarOperacionPendiente('credit', body)
  expect(obtenerIdOperacionPendiente('credit', body)).not.toBe(first)
})

it('persists the original full request across a retry when a default timestamp would change', () => {
  const identity = { supplier: 'p1', total: 10, dateFromForm: null }
  const first = obtenerOperacionPersistida('purchase', identity, { ...identity, fecha: '2026-10-12T10:00:00Z' })
  const retry = obtenerOperacionPersistida('purchase', identity, { ...identity, fecha: '2026-10-12T10:05:00Z' })
  expect(retry.id).toBe(first.id)
  expect(retry.solicitud).toEqual(first.solicitud)
  confirmarOperacionPersistida('purchase', identity)
})
