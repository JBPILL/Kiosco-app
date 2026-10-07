import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SupervisorAuditSection } from './SupervisorAuditSection'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), rol: 'DUEÑO' }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('../../stores/authStore', () => {
  const getState = () => ({ usuario: { id: 'u1', auth_user_id: 'a1', kiosco_id: 'k1', activo: true, rol: mocks.rol } })
  return { useAuthStore: Object.assign((selector: (state: ReturnType<typeof getState>) => unknown) => selector(getState()), { getState }) }
})
beforeEach(() => { mocks.rol = 'DUEÑO'; mocks.rpc.mockReset().mockResolvedValue({ data: [], error: null }) })
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
