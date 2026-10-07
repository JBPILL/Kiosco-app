import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { CobrosManualesPendientes } from './CobrosManualesPendientes'

const mocks = vi.hoisted(() => ({ observar: vi.fn(), reclamar: vi.fn(), sincronizar: vi.fn(), completar: vi.fn(), auth: vi.fn(), online: vi.fn() }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: Object.assign(() => mocks.auth(), { getState: mocks.auth }) }))
vi.mock('../../stores/cartStore', () => ({ useCartStore: { getState: () => ({ completarCobroTab: mocks.completar }) } }))
vi.mock('../../lib/manualCheckoutClient', () => ({ observarCobrosManualesLocales: mocks.observar, reclamarComprobanteManual: mocks.reclamar, sincronizarCobrosManualesLocales: mocks.sincronizar }))
vi.mock('../../lib/manualCheckoutCart', () => ({ checkoutManualTransaccionalActivo: () => true }))
vi.mock('../../hooks/useOnlineStatus', () => ({ useOnlineStatus: mocks.online }))
const recibo = { ventaId: 'venta-1', fecha: '2026-10-07T12:00:00Z', total: 100, subtotal: 100, medioPago: 'EFECTIVO', items: [] }
function observar(filas: unknown[]) {
  mocks.observar.mockReturnValue({ subscribe: ({ next }: { next: (value: unknown[]) => void }) => {
    next(filas)
    return { unsubscribe: vi.fn() }
  } })
}
const pendiente = { usuarioId: 'u1', kioscoId: 'k1', id: 'venta-1', ticketClave: 'tab-1', estado: 'PENDIENTE', recibo,
  entrada: { fechaHora: recibo.fecha, totalEsperado: 100, tipoAjuste: 'NINGUNO' } }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockReturnValue({ usuario: { id: 'u1', kiosco_id: 'k1' }, kiosco: { id: 'k1' } })
  mocks.online.mockReturnValue(false)
  mocks.reclamar.mockResolvedValue(null)
  mocks.sincronizar.mockResolvedValue({ exitosas: 0, fallidas: 1 })
  observar([pendiente])
})

it('ofrece autorización sólo para descuentos pendientes del operador original', async () => {
  observar([{ ...pendiente, entrada: { ...pendiente.entrada, tipoAjuste: 'DESCUENTO_PORCENTAJE' } },
    { ...pendiente, id: 'otro', usuarioId: 'u2', entrada: { ...pendiente.entrada, tipoAjuste: 'DESCUENTO_PORCENTAJE' } }])
  render(<CobrosManualesPendientes onVerTicket={vi.fn()} />)
  const botones = await screen.findAllByRole('button', { name: /Autorizar descuento/ })
  expect(botones).toHaveLength(1)
  expect((botones[0] as HTMLButtonElement).disabled).toBe(true)
})

it('muestra el pendiente offline y recupera su comprobante sin volver a cobrar', async () => {
  const ver = vi.fn()
  render(<CobrosManualesPendientes onVerTicket={ver} />)
  expect(await screen.findByText(/Pendiente de confirmación/)).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Reintentar pendientes' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Ver comprobante' }))
  await waitFor(() => expect(ver).toHaveBeenCalledOnce())
  expect(ver.mock.calls[0][0].notas).toContain('[GUARDADO OFFLINE]')
  expect(mocks.completar).toHaveBeenCalledWith('tab-1')
  expect(mocks.sincronizar).not.toHaveBeenCalled()
})

it('con red reintenta sin imprimir ni abrir comprobantes automáticamente', async () => {
  mocks.online.mockReturnValue(true)
  const ver = vi.fn()
  render(<CobrosManualesPendientes onVerTicket={ver} />)
  await screen.findByRole('alert')
  expect(mocks.sincronizar).toHaveBeenCalledWith('k1', 'u1')
  expect(ver).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar pendientes' }))
  await waitFor(() => expect(mocks.sincronizar).toHaveBeenCalledTimes(2))
})

it('no presenta el comprobante si cambia la sesión durante la recuperación', async () => {
  let terminar: (value: null) => void = () => undefined
  mocks.reclamar.mockReturnValue(new Promise<null>(resolve => { terminar = resolve }))
  const ver = vi.fn()
  render(<CobrosManualesPendientes onVerTicket={ver} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Ver comprobante' }))
  mocks.auth.mockReturnValue({ usuario: { id: 'u2', kiosco_id: 'k1' }, kiosco: { id: 'k1' } })
  await act(async () => { terminar(null) })
  expect(ver).not.toHaveBeenCalled()
  expect(mocks.completar).not.toHaveBeenCalled()
})
it('reserva la cancelación del pendiente al dueño y requiere conexión', async () => {
  render(<CobrosManualesPendientes onVerTicket={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'Cancelar pendiente' })).toBeNull()
})

it('el dueño puede revisar un pendiente ajeno sin recuperar su comprobante', async () => {
 mocks.auth.mockReturnValue({ usuario: { id: 'u1', kiosco_id: 'k1', rol: 'DUEÑO', activo: true }, kiosco: { id: 'k1' } })
 observar([{ ...pendiente, usuarioId: 'u2' }])
 render(<CobrosManualesPendientes onVerTicket={vi.fn()} />)
 expect(await screen.findByText(/Otro operador: revisión del dueño/)).toBeTruthy()
 expect((screen.getByRole('button', { name: 'Ver comprobante' }) as HTMLButtonElement).disabled).toBe(true)
 expect(screen.getByRole('button', { name: 'Cancelar pendiente' })).toBeTruthy()
})
