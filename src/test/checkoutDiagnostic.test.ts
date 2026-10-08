import { expect, it, vi } from 'vitest'
import { registrarFalloCheckout } from '../../supabase/functions/_shared/checkoutDiagnostic'
it('registra etapa y código sin reproducir datos privados', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    registrarFalloCheckout('PREPARAR', { code: '42501', message: 'TOKEN_SECRETO', details: 'PIN_SECRETO' })
    expect(log).toHaveBeenCalledWith('CHECKOUT_DIAGNOSTICO', { etapa: 'PREPARAR', codigo: '42501' })
    registrarFalloCheckout('CONFIRMAR', { code: 'TOKEN_SECRETO' })
    expect(log).toHaveBeenLastCalledWith('CHECKOUT_DIAGNOSTICO', { etapa: 'CONFIRMAR', codigo: 'SIN_CODIGO' })
    registrarFalloCheckout('PREPARAR', { code: 'P0001', message: 'Caja original no disponible para preparar' })
    expect(log).toHaveBeenLastCalledWith('CHECKOUT_DIAGNOSTICO', {
      etapa: 'PREPARAR', codigo: 'P0001', motivo: 'CAJA_ORIGINAL_NO_DISPONIBLE',
    })
    registrarFalloCheckout('PREPARAR', { code: 'P0001', message: 'toString' })
    expect(log).toHaveBeenLastCalledWith('CHECKOUT_DIAGNOSTICO', { etapa: 'PREPARAR', codigo: 'P0001' })
  } finally { log.mockRestore() }
})
