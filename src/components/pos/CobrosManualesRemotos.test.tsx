import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ consultar: vi.fn(), recuperar: vi.fn(), durable: vi.fn(), cancelar: vi.fn(), online: true }))
vi.mock('../../lib/manualCheckoutRemote', () => ({ consultarPendientesRemotos: mocks.consultar, recuperarEntradaRemota: mocks.recuperar }))
vi.mock('../../lib/manualCheckoutClient', () => ({ cancelarCobroManualRemoto: mocks.cancelar, recuperarCancelacionManualLocal: mocks.durable }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: { getState: () => ({ usuario: { id: 'dueño', kiosco_id: 'comercio', activo: true, rol: 'DUEÑO' } }) } }))
vi.mock('../../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => mocks.online }))
import { CobrosManualesRemotos } from './CobrosManualesRemotos'
afterEach(() => { cleanup(); mocks.consultar.mockReset(); mocks.recuperar.mockReset(); mocks.durable.mockReset(); mocks.cancelar.mockReset(); mocks.online = true })
it('consulta al entrar y actualiza con el botón de icono', async () => {
 mocks.consultar.mockResolvedValue([])
 render(<CobrosManualesRemotos kioscoId="comercio" />)
 await waitFor(() => expect(mocks.consultar).toHaveBeenCalledTimes(1))
 const boton = screen.getByRole('button', { name: 'Actualizar pendientes del servidor' })
 await waitFor(() => expect((boton as HTMLButtonElement).disabled).toBe(false))
 fireEvent.click(boton)
 await waitFor(() => expect(mocks.consultar).toHaveBeenCalledTimes(2))
 expect(mocks.consultar).toHaveBeenLastCalledWith('comercio', null)
})
it('recupera la entrada original y solicita cancelación desde el formulario del dueño', async () => {
 const fila = { id: 'checkout-remoto', kioscoId: 'comercio', usuarioId: 'operador', sesionCajaId: 'caja', total: 100, fechaHora: '2026-10-07T12:00:00Z' }
 const entrada = { checkoutId: fila.id, totalEsperado: 100 }
 mocks.consultar.mockResolvedValueOnce([fila]).mockResolvedValue([])
 mocks.recuperar.mockResolvedValue(entrada); mocks.durable.mockResolvedValue(undefined); mocks.cancelar.mockResolvedValue({ estado: 'CANCELADO' })
 render(<CobrosManualesRemotos kioscoId="comercio" />)
 const revisar = await screen.findByRole('button', { name: 'Revisar cancelación' })
 await waitFor(() => expect((revisar as HTMLButtonElement).disabled).toBe(false))
 fireEvent.click(revisar)
 fireEvent.change(await screen.findByRole('textbox', { name: 'Motivo de cancelación' }), { target: { value: 'No se cobró la venta' } })
 fireEvent.click(screen.getByRole('checkbox'))
 fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }))
 await waitFor(() => expect(mocks.cancelar).toHaveBeenCalledWith(entrada, { motivo: 'No se cobró la venta', resolucion: 'NO_COBRADO', referencia: null }))
 await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Motivo de cancelación' })).toBeNull())
 expect(mocks.recuperar).toHaveBeenCalledWith(fila)
})
it('muestra fallo de consulta sin simular un cierre ni un pago', async () => {
 mocks.consultar.mockRejectedValue(new Error('servidor'))
 render(<CobrosManualesRemotos kioscoId="comercio" />)
 expect((await screen.findByRole('alert')).textContent).toContain('No se pudo actualizar')
 expect(screen.queryByRole('button', { name: /Cancelar|Cobrar/ })).toBeNull()
})
it('no consulta al servidor sin conexión', () => {
 mocks.online = false
 render(<CobrosManualesRemotos kioscoId="comercio" />)
 expect(mocks.consultar).not.toHaveBeenCalled()
 expect((screen.getByRole('button', { name: 'Actualizar pendientes del servidor' }) as HTMLButtonElement).disabled).toBe(true)
})
it('pagina por identificador y reinicia la revisión completa al actualizar', async () => {
 const filas = Array.from({ length: 50 }, (_, i) => ({ id: `id-${i}`, usuarioId: 'operador', sesionCajaId: 'caja', total: 100, fechaHora: '2026-10-07T12:00:00Z' }))
 mocks.consultar.mockResolvedValueOnce(filas).mockResolvedValueOnce([]).mockResolvedValueOnce([])
 render(<CobrosManualesRemotos kioscoId="comercio" />)
 fireEvent.click(await screen.findByRole('button', { name: 'Ver más pendientes' }))
 await waitFor(() => expect(mocks.consultar).toHaveBeenLastCalledWith('comercio', 'id-49'))
 const actualizar = screen.getByRole('button', { name: 'Actualizar pendientes del servidor' })
 await waitFor(() => expect((actualizar as HTMLButtonElement).disabled).toBe(false))
 fireEvent.click(actualizar)
 await waitFor(() => expect(mocks.consultar).toHaveBeenLastCalledWith('comercio', null))
 await waitFor(() => expect(screen.queryByText(/ID-49/)).toBeNull())
})
