import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CancelarCobroManualModal } from './CancelarCobroManualModal'
import type { CobroManualLocal } from '../../lib/manualCheckoutOutbox'
const mocks = vi.hoisted(() => ({ cancelar: vi.fn(), auth: vi.fn() }))
vi.mock('../../lib/manualCheckoutClient', () => ({ cancelarCobroManualLocal: mocks.cancelar }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: { getState: mocks.auth } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
function cobro(): CobroManualLocal { return { id: 'checkout-1', kioscoId: 'k1', usuarioId: 'u1', ticketClave: 'tab-1', estado: 'PENDIENTE', resultado: null, ultimoError: null, entrada: { totalEsperado: 100 } as CobroManualLocal['entrada'] } }
function preparar() { mocks.auth.mockReturnValue({ usuario: { id: 'u1', kiosco_id: 'k1', activo: true, rol: 'DUEÑO' } }); mocks.cancelar.mockResolvedValue({ estado: 'CANCELADO' }) }
it('exige declaración del dinero y confirma con el motivo original', async () => {
 preparar(); const terminado = vi.fn()
 render(<CancelarCobroManualModal cobro={cobro()} onClose={vi.fn()} onCancelado={terminado} />)
 const boton = screen.getByRole('button', { name: 'Confirmar cancelación' }) as HTMLButtonElement
 expect(boton.disabled).toBe(true)
 fireEvent.change(screen.getByRole('textbox', { name: 'Motivo de cancelación' }), { target: { value: 'No se cobró la venta' } })
 fireEvent.click(screen.getByRole('checkbox'))
 fireEvent.click(boton)
 await waitFor(() => expect(terminado).toHaveBeenCalledOnce())
 expect(mocks.cancelar).toHaveBeenCalledWith('checkout-1', { motivo: 'No se cobró la venta', resolucion: 'NO_COBRADO', referencia: null })
})
it('mantiene abierto y conserva los datos si el servidor no confirma', async () => {
 preparar(); mocks.cancelar.mockRejectedValue(new Error('ERROR INTERNO'))
 const terminado = vi.fn()
 render(<CancelarCobroManualModal cobro={cobro()} onClose={vi.fn()} onCancelado={terminado} />)
 fireEvent.change(screen.getByRole('textbox', { name: 'Motivo de cancelación' }), { target: { value: 'No se cobró la venta' } })
 fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }))
 expect(await screen.findByRole('alert')).toBeTruthy()
 expect(terminado).not.toHaveBeenCalled()
 expect((screen.getByRole('textbox', { name: 'Motivo de cancelación' }) as HTMLTextAreaElement).value).toBe('No se cobró la venta')
})
