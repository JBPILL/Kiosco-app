import { expect, it, vi } from 'vitest'
import { registrarFalloCheckout } from '../../supabase/functions/_shared/checkoutDiagnostic'
it('registra etapa y código sin reproducir datos privados', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    registrarFalloCheckout('PREPARAR', { code: '42501', message: 'TOKEN_SECRETO', details: 'PIN_SECRETO' })
    expect(log).toHaveBeenCalledWith('CHECKOUT_DIAGNOSTICO', { etapa: 'PREPARAR', codigo: '42501' })
    registrarFalloCheckout('CONFIRMAR', { code: 'TOKEN_SECRETO' })
    expect(log).toHaveBeenLastCalledWith('CHECKOUT_DIAGNOSTICO', { etapa: 'CONFIRMAR', codigo: 'SIN_CODIGO' })
  } finally { log.mockRestore() }
})
