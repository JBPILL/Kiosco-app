import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SupervisorPolicySection } from './SupervisorPolicySection'
const mocks = vi.hoisted(() => ({ consultar: vi.fn(), guardar: vi.fn(), rol: 'DUEÑO', kiosco: 'k1' }))
vi.mock('../../lib/supervisorPolicyClient', () => ({ consultarPoliticaSupervisor: mocks.consultar, configurarPoliticaSupervisor: mocks.guardar }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ usuario: { id: 'u1', auth_user_id: 'a1', kiosco_id: mocks.kiosco, activo: true, rol: mocks.rol } }) }))
beforeEach(() => { mocks.rol = 'DUEÑO'; mocks.kiosco = 'k1'; mocks.consultar.mockReset().mockResolvedValue({ umbralPorcentaje: 15, revision: 0 }); mocks.guardar.mockReset().mockResolvedValue({ umbralPorcentaje: 10.25, revision: 1 }) })
afterEach(cleanup)
it('cajero no ve ni consulta la configuración', () => {
  mocks.rol = 'CAJERO'
  const { container } = render(<SupervisorPolicySection />)
  expect(container.innerHTML).toBe(''); expect(mocks.consultar).not.toHaveBeenCalled()
})
it('carga porcentaje, admite coma decimal y muestra éxito sólo después del guardado', async () => {
  render(<SupervisorPolicySection />)
  await act(async () => {})
  const campo = screen.getByLabelText('Porcentaje máximo sin PIN') as HTMLInputElement
  expect(campo.value).toBe('15')
  fireEvent.change(campo, { target: { value: '10,25' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar umbral' }))
  expect(await screen.findByText('Umbral guardado')).toBeTruthy()
  expect(mocks.guardar).toHaveBeenCalledWith(10.25)
})
it('una consulta fallida no presenta 15 como valor vigente', async () => {
  mocks.consultar.mockRejectedValue(new Error('SECRET_SQL'))
  render(<SupervisorPolicySection />)
  await act(async () => {})
  expect((screen.getByLabelText('Porcentaje máximo sin PIN') as HTMLInputElement).value).toBe('')
  expect((screen.getByRole('button', { name: 'Guardar umbral' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByText('SECRET_SQL')).toBeNull()
})
it('no muestra éxito de un guardado del comercio anterior', async () => {
  let resolver: (valor: { umbralPorcentaje: number; revision: number }) => void = () => {}
  mocks.guardar.mockImplementation(() => new Promise(resolve => { resolver = resolve }))
  const vista = render(<SupervisorPolicySection />)
  await act(async () => {})
  fireEvent.change(screen.getByLabelText('Porcentaje máximo sin PIN'), { target: { value: '10' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar umbral' }))
  mocks.kiosco = 'k2'; vista.rerender(<SupervisorPolicySection />)
  await act(async () => { resolver({ umbralPorcentaje: 10, revision: 1 }) })
  expect(screen.queryByText('Umbral guardado')).toBeNull()
  expect((screen.getByLabelText('Porcentaje máximo sin PIN') as HTMLInputElement).value).toBe('15')
})
