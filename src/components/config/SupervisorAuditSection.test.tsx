import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SupervisorAuditSection } from './SupervisorAuditSection'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), rol: 'DUEÑO', activo: true, kiosco: 'k1' }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('../../stores/authStore', () => {
  const getState = () => ({ usuario: { id: 'u1', auth_user_id: 'a1', kiosco_id: mocks.kiosco, activo: mocks.activo, rol: mocks.rol } })
  return { useAuthStore: Object.assign((selector: (state: ReturnType<typeof getState>) => unknown) => selector(getState()), { getState }) }
})
beforeEach(() => { mocks.rol = 'DUEÑO'; mocks.activo = true; mocks.kiosco = 'k1'; mocks.rpc.mockReset().mockResolvedValue({ data: [], error: null }) })
afterEach(cleanup)
it('consulta un máximo de 50 eventos y presenta vacío sólo con respuesta correcta', async () => {
  render(<SupervisorAuditSection />)
  expect(await screen.findByText('Sin eventos registrados')).toBeTruthy()
  expect(mocks.rpc).toHaveBeenCalledWith('consultar_auditoria_supervisor', { p_limite: 50 })
})
it('no consulta ni muestra tarjeta al cajero', () => {
  mocks.rol = 'CAJERO'
  const { container } = render(<SupervisorAuditSection />)
  expect(container.innerHTML).toBe('')
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('error remoto no se presenta como vacío ni expone su mensaje', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: new Error('SECRET_SQL') })
  render(<SupervisorAuditSection />)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.queryByText('Sin eventos registrados')).toBeNull()
  expect(screen.queryByText('SECRET_SQL')).toBeNull()
})

it('oculta la tarjeta y no consulta cuando el dueño está inactivo', () => {
  mocks.activo = false
  const { container } = render(<SupervisorAuditSection />)
  expect(container.innerHTML).toBe('')
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it('descarta la respuesta del comercio anterior aunque llegue después de la nueva', async () => {
  const evento = { id: 'e1', fecha: '2026-10-07T12:00:00Z', evento: 'INTENTO_PIN', resultado: 'VALIDO', accion: 'VERIFICACION', actor_auth_id: 'actor-anterior', revision: 1 }
  let resolver: (respuesta: { data: typeof evento[]; error: null }) => void = () => {}
  mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { resolver = resolve }))
  const vista = render(<SupervisorAuditSection />)
  mocks.kiosco = 'k2'
  vista.rerender(<SupervisorAuditSection />)
  expect(await screen.findByText('Sin eventos registrados')).toBeTruthy()
  await act(async () => { resolver({ data: [evento], error: null }) })
  expect(screen.queryByText('Intento de PIN')).toBeNull()
  expect(mocks.rpc).toHaveBeenCalledTimes(2)
})

it('rechaza respuestas con campos privados en lugar de mostrarlas', async () => {
  mocks.rpc.mockResolvedValue({ data: [{ id: 'e1', fecha: '2026-10-07T12:00:00Z', evento: 'INTENTO_PIN', resultado: 'VALIDO', accion: 'VERIFICACION', actor_auth_id: 'a1', revision: 1, pin: '1234' }], error: null })
  render(<SupervisorAuditSection />)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.queryByText('Intento de PIN')).toBeNull()
})
