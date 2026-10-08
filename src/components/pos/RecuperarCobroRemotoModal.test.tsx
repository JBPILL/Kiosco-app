import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { EntradaCheckoutManual } from '../../types/checkoutManual'

const mocks = vi.hoisted(() => ({ sesion: vi.fn(), enviar: vi.fn(), estado: {
  usuario: { id: 'dueño', auth_user_id: 'auth-dueño', rol: 'DUEÑO', activo: true, kiosco_id: '10000000-0000-0000-0000-000000000001' },
  kiosco: { id: '10000000-0000-0000-0000-000000000001', estado_suscripcion: 'ACTIVO' },
} }))
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: mocks.sesion }, functions: { invoke: mocks.enviar } } }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: { getState: () => mocks.estado } }))
import { RecuperarCobroRemotoModal } from './RecuperarCobroRemotoModal'
import { confirmarEntradaPorDueno } from '../../lib/manualCheckoutOwnerRecovery'

const id = (numero: number) => `${numero}0000000-0000-0000-0000-000000000001`
const entrada: EntradaCheckoutManual = { version: 1, checkoutId: id(2), kioscoId: id(1), usuarioId: id(3), sesionCajaId: id(4),
  fechaHora: '2026-10-08T12:00:00.000Z', clienteId: null, notas: 'Original', tipoAjuste: 'NINGUNO', valorAjuste: 0,
  totalEsperado: 100, subtotalesEsperados: [100], componentesEsperados: [],
  lineas: [{ tipo: 'PRODUCTO', id: id(5), productoId: id(6), cantidad: 1, sinEnvase: false }],
  pagos: [{ id: id(7), medio: 'EFECTIVO', montoCentavos: 10000, referencia: null }] }
const resultado = { venta_id: entrada.checkoutId, kiosco_id: entrada.kioscoId, fecha_hora: entrada.fechaHora, total: 100,
  stock: [{ producto_id: id(6), stock_actual: 9 }], saldo_cliente: null }
function preparar() {
  mocks.sesion.mockResolvedValue({ data: { session: { access_token: 'token-sintetico', user: { id: 'auth-dueño' } } }, error: null })
  mocks.enviar.mockResolvedValue({ data: resultado, error: null })
}
afterEach(() => {
  cleanup(); mocks.sesion.mockReset(); mocks.enviar.mockReset()
  mocks.estado.usuario = { id: 'dueño', auth_user_id: 'auth-dueño', rol: 'DUEÑO', activo: true, kiosco_id: id(1) }
})

it('requiere declaración del cobro y envía exactamente los datos originales', async () => {
  preparar(); const confirmado = vi.fn()
  render(<RecuperarCobroRemotoModal entrada={entrada} onClose={vi.fn()} onConfirmado={confirmado} />)
  const boton = screen.getByRole('button', { name: 'Confirmar cobro original' }) as HTMLButtonElement
  expect(boton.disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(boton)
  await waitFor(() => expect(confirmado).toHaveBeenCalledOnce())
  expect(mocks.enviar).toHaveBeenCalledWith('checkout-manual', { body: entrada, headers: { Authorization: 'Bearer token-sintetico' } })
})

it('conserva el formulario y reintenta el mismo identificador tras respuesta perdida', async () => {
  preparar(); mocks.enviar.mockResolvedValueOnce({ data: null, error: new Error('timeout') })
  const confirmado = vi.fn()
  render(<RecuperarCobroRemotoModal entrada={entrada} onClose={vi.fn()} onConfirmado={confirmado} />)
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cobro original' }))
  expect((await screen.findByRole('alert')).textContent).toContain('No vuelvas a cobrar')
  expect(confirmado).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cobro original' }))
  await waitFor(() => expect(confirmado).toHaveBeenCalledOnce())
  expect(mocks.enviar.mock.calls[0]).toEqual(mocks.enviar.mock.calls[1])
})

it('rechaza cajero antes de consultar sesión o enviar el cierre', async () => {
  preparar(); mocks.estado.usuario = { ...mocks.estado.usuario, rol: 'CAJERO' }
  await expect(confirmarEntradaPorDueno(entrada)).rejects.toThrow('sesión del dueño')
  expect(mocks.sesion).not.toHaveBeenCalled(); expect(mocks.enviar).not.toHaveBeenCalled()
})

it('rechaza token de otra identidad', async () => {
  preparar(); mocks.sesion.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'otro' } } }, error: null })
  await expect(confirmarEntradaPorDueno(entrada)).rejects.toThrow('Sesión inválida')
  expect(mocks.enviar).not.toHaveBeenCalled()
})

it('rechaza cambio de identidad durante consulta de sesión', async () => {
  preparar(); mocks.sesion.mockImplementation(async () => {
    mocks.estado.usuario = { ...mocks.estado.usuario, auth_user_id: 'otro' }
    return { data: { session: { access_token: 'token', user: { id: 'auth-dueño' } } }, error: null }
  })
  await expect(confirmarEntradaPorDueno(entrada)).rejects.toThrow('sesión del dueño')
  expect(mocks.enviar).not.toHaveBeenCalled()
})

it.each(['venta_id', 'kiosco_id', 'total', 'fecha_hora'])('rechaza resultado que cambia %s', async campo => {
  preparar(); mocks.enviar.mockResolvedValue({ data: { ...resultado, [campo]: campo === 'total' ? 200 : 'otro' }, error: null })
  await expect(confirmarEntradaPorDueno(entrada)).rejects.toThrow()
})
