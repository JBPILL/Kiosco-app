import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getState: vi.fn(), getSession: vi.fn(), rpc: vi.fn() }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: Object.assign((selector: (state: unknown) => unknown) => selector(mocks.getState()), { getState: mocks.getState }) }))
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: mocks.getSession }, rpc: mocks.rpc } }))
import { envasesOutbox, cashReturnOutbox } from '../../lib/pilotOperationClient'
import { procesarOperacionEnvase } from '../../lib/envasesOutbox'
import { OperacionesPilotoPendientes } from './OperacionesPilotoPendientes'

const id = (n: number) => `eb000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const usuario = { id: id(1), kiosco_id: id(2), auth_user_id: id(3), activo: true, rol: 'DUEÑO' }
const solicitud = { version: 1, id: id(4), accion: 'RECIBIR_EFECTIVO', tipoId: 'vidrio', datos: { cantidad: 2, sesionCajaId: id(5), precioEsperado: 100, notas: null } }
const resultado = { id: id(4), kiosco_id: id(2), tipo_id: 'vidrio', stock_vacios: 2, importe: 200 }
beforeEach(async () => {
  vi.clearAllMocks()
  mocks.getState.mockReturnValue({ usuario })
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: id(3) }, access_token: 'synthetic-session' } }, error: null })
  await envasesOutbox.operaciones.clear()
  await cashReturnOutbox.operaciones.clear()
})

it('permanece vacío y no consulta red si no hay operaciones locales', async () => {
  const { container } = render(<OperacionesPilotoPendientes />)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  expect(container.textContent).toBe('')
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(mocks.getSession).not.toHaveBeenCalled()
})

it('recupera el ID original y exige verificar entrega sin repetir un RPC al archivarla', async () => {
  await envasesOutbox.guardar(id(2), id(1), solicitud)
  mocks.rpc.mockReturnValue({ setHeader: vi.fn(async () => ({ data: resultado, error: null })) })
  render(<OperacionesPilotoPendientes />)
  fireEvent.click(await screen.findByRole('button', { name: 'Recuperar operación original' }))
  const entregar = await screen.findByRole('button', { name: 'Ya verifiqué la entrega de efectivo' })
  expect(screen.getByText(/Si ya se entregó, no vuelvas a pagar/)).toBeTruthy()
  expect(mocks.rpc).toHaveBeenCalledWith('operar_envases_atomico', { p_solicitud: solicitud })
  fireEvent.click(entregar)
  await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
})

it('al cambiar usuario oculta inmediatamente las operaciones del anterior', async () => {
  await procesarOperacionEnvase(envasesOutbox, id(2), id(1), solicitud, async () => ({ data: resultado, error: null }))
  const { rerender } = render(<OperacionesPilotoPendientes />)
  await screen.findByRole('button', { name: 'Ya verifiqué la entrega de efectivo' })
  mocks.getState.mockReturnValue({ usuario: { ...usuario, id: id(99) } })
  rerender(<OperacionesPilotoPendientes />)
  expect(screen.queryByText(/Registrado en caja/)).toBeNull()
  expect(await envasesOutbox.recuperables(id(2), id(1))).toHaveLength(1)
})
