import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SupervisorPinSection } from './SupervisorPinSection'

const mocks = vi.hoisted(() => ({ rol: 'DUEÑO', consultar: vi.fn(), configurar: vi.fn() }))
vi.mock('../../lib/supervisorPinClient', () => ({ consultarPinSupervisor: mocks.consultar, configurarPinSupervisor: mocks.configurar }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ usuario: { id: 'u1', auth_user_id: 'a1', kiosco_id: 'k1', rol: mocks.rol } }) }))
beforeEach(() => { mocks.rol = 'DUEÑO'; mocks.consultar.mockReset().mockResolvedValue(false); mocks.configurar.mockReset().mockResolvedValue(undefined) })
afterEach(cleanup)

it('oculta la configuración a cajeros', () => {
  mocks.rol = 'CAJERO'
  const { container } = render(<SupervisorPinSection />)
  expect(container.innerHTML).toBe('')
  expect(mocks.consultar).not.toHaveBeenCalled()
})

it('conserva ceros iniciales, guarda y limpia ambos campos', async () => {
  render(<SupervisorPinSection />)
  await screen.findByText('Sin configurar')
  const pin = screen.getByLabelText('PIN de supervisor') as HTMLInputElement
  const repetir = screen.getByLabelText('Repetir PIN de supervisor') as HTMLInputElement
  fireEvent.change(pin, { target: { value: '0012' } })
  fireEvent.change(repetir, { target: { value: '0012' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar PIN' }))
  await screen.findByText('PIN de supervisor guardado')
  expect(mocks.configurar).toHaveBeenCalledWith('0012', '0012')
  expect(pin.value).toBe('')
  expect(repetir.value).toBe('')
})

it('no permite PIN no numérico ni confirmaciones diferentes', async () => {
  render(<SupervisorPinSection />)
  await screen.findByText('Sin configurar')
  fireEvent.change(screen.getByLabelText('PIN de supervisor'), { target: { value: '1234' } })
  fireEvent.change(screen.getByLabelText('Repetir PIN de supervisor'), { target: { value: '1235' } })
  expect((screen.getByRole('button', { name: 'Guardar PIN' }) as HTMLButtonElement).disabled).toBe(true)
  expect(mocks.configurar).not.toHaveBeenCalled()
})

it('limpia el PIN después de un error y no expone su mensaje remoto', async () => {
  mocks.configurar.mockRejectedValue(new Error('secreto remoto'))
  render(<SupervisorPinSection />)
  await screen.findByText('Sin configurar')
  fireEvent.change(screen.getByLabelText('PIN de supervisor'), { target: { value: '1234' } })
  fireEvent.change(screen.getByLabelText('Repetir PIN de supervisor'), { target: { value: '1234' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar PIN' }))
  await waitFor(() => expect((screen.getByLabelText('PIN de supervisor') as HTMLInputElement).value).toBe(''))
  expect(screen.queryByText('secreto remoto')).toBeNull()
})
