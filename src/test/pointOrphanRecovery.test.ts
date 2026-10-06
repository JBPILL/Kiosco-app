import { expect, it, vi } from 'vitest'
import { recuperarOrdenPoint } from '../../supabase/functions/_shared/pointOrphanRecovery'

const kid = '11111111-1111-1111-1111-111111111111'
const attempt = '22222222-2222-2222-2222-222222222222'
const notification = { id: 'n1', orderId: 'ORD123', applicationId: '123' }
function dependencies() {
  return {
    cuentas: { [kid]: { applicationId: '123', accountId: '456', accessToken: 'private', modo: 'sandbox' as const } },
    consultar: vi.fn().mockResolvedValue({ id: 'ORD123', type: 'point', countryCode: 'AR',
      externalReference: attempt, accountId: '456', terminalId: 'terminal', status: 'processed',
      payments: [{ id: 'PAY123', amount: '150', paidAmount: '150', status: 'processed', statusDetail: 'accredited' }] }),
    buscarIntento: vi.fn().mockResolvedValue({ id: attempt, kiosco_id: kid, order_id: null,
      terminal_id: 'terminal', monto_centavos: 15000, application_id: '123', account_id: '456', modo: 'sandbox' }),
    vincular: vi.fn().mockResolvedValue(undefined),
  }
}

it('recupera y vincula el intento existente desde la orden consultada', async () => {
  const deps = dependencies()
  const result = await recuperarOrdenPoint(notification, deps)
  expect(result?.expected.attemptId).toBe(attempt)
  expect(deps.buscarIntento).toHaveBeenCalledWith(attempt, kid)
  expect(deps.vincular).toHaveBeenCalledWith(result)
})

it('no vincula importes discrepantes ni una orden ya vinculada a otra identidad', async () => {
  for (const cambio of [{ monto_centavos: 15001 }, { order_id: 'ORDotro' }]) {
    const deps = dependencies()
    const fila = await deps.buscarIntento()
    deps.buscarIntento.mockResolvedValue({ ...fila, ...cambio })
    expect(await recuperarOrdenPoint(notification, deps)).toBeNull()
    expect(deps.vincular).not.toHaveBeenCalled()
  }
})

it('deja pendiente la notificación ante fallas de consulta y no consulta otra aplicación', async () => {
  const deps = dependencies()
  deps.consultar.mockRejectedValue(new Error('Sin conexión'))
  expect(await recuperarOrdenPoint(notification, deps)).toBeNull()
  deps.consultar.mockClear()
  expect(await recuperarOrdenPoint({ ...notification, applicationId: 'otra' }, deps)).toBeNull()
  expect(deps.consultar).not.toHaveBeenCalled()
  expect(deps.vincular).not.toHaveBeenCalled()
})
