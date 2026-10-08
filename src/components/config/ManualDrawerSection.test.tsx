import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ManualDrawerSection } from './ManualDrawerSection'
const mocks = vi.hoisted(() => ({ solicitar: vi.fn(), rol: 'DUEÑO', kiosco: 'k1' }))
vi.mock('../../lib/manualDrawer', () => ({ solicitarAperturaManualCajon: mocks.solicitar }))
vi.mock('../../stores/authStore', () => {
  const getState = () => ({ usuario: { id: 'u1', auth_user_id: 'a1', activo: true, rol: mocks.rol, kiosco_id: mocks.kiosco } })
  return { useAuthStore: Object.assign((selector: (state: ReturnType<typeof getState>) => unknown) => selector(getState()), { getState }) }
})
beforeEach(() => { mocks.rol = 'DUEÑO'; mocks.kiosco = 'k1'; mocks.solicitar.mockReset().mockResolvedValue({ ok: true, mensaje: 'Pulso enviado' }) })
afterEach(cleanup)
it('limpia el motivo al cambiar de comercio', () => {
  const vista = render(<ManualDrawerSection />)
  fireEvent.change(screen.getByLabelText('Motivo de apertura manual'), { target: { value: 'Motivo privado' } })
  mocks.kiosco = 'k2'
  vista.rerender(<ManualDrawerSection />)
  expect((screen.getByLabelText('Motivo de apertura manual') as HTMLInputElement).value).toBe('')
})
it('limpia el motivo cuando pierde y recupera el rol de dueño', () => {
  const vista = render(<ManualDrawerSection />)
  fireEvent.change(screen.getByLabelText('Motivo de apertura manual'), { target: { value: 'Motivo privado' } })
  mocks.rol = 'CAJERO'
  vista.rerender(<ManualDrawerSection />)
  expect(vista.container.innerHTML).toBe('')
  mocks.rol = 'DUEÑO'
  vista.rerender(<ManualDrawerSection />)
  expect((screen.getByLabelText('Motivo de apertura manual') as HTMLInputElement).value).toBe('')
})
it('envía el motivo y limpia el formulario tras el pulso', async () => {
  render(<ManualDrawerSection />)
  fireEvent.change(screen.getByLabelText('Motivo de apertura manual'), { target: { value: 'Reponer cambio' } })
  fireEvent.click(screen.getByRole('button', { name: 'Abrir cajón' }))
  expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Pulso enviado')
  expect(mocks.solicitar).toHaveBeenCalledWith('Reponer cambio')
  expect((screen.getByLabelText('Motivo de apertura manual') as HTMLInputElement).value).toBe('')
})
