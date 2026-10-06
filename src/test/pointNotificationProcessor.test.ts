import { expect, it, vi } from 'vitest'
import { procesarNotificacionPoint, type PointProcessorDependencies } from '../../supabase/functions/_shared/pointNotificationProcessor'
import type { PointOrderSnapshot } from '../../supabase/functions/_shared/pointClient'

const notification = { id: 'n1', orderId: 'ORD123', applicationId: '123' }
const context = { kioscoId: 'k1', applicationId: '123', expected: {
  attemptId: 'i1', orderId: 'ORD123', terminalId: 'terminal', accountId: '456', amountCentavos: 15000,
} }
const orden: PointOrderSnapshot = { id: 'ORD123', externalReference: 'i1', type: 'point', countryCode: 'AR',
  accountId: '456', terminalId: 'terminal', status: 'processed',
  payments: [{ id: 'PAY123', status: 'processed', statusDetail: 'accredited', amount: '150', paidAmount: '150' }],
}
function dependencias() {
  return {
    buscarContexto: vi.fn().mockResolvedValue(context),
    consultarProveedor: vi.fn().mockResolvedValue(orden),
    guardarResultado: vi.fn().mockResolvedValue('PAGO_CONFIRMADO'),
  } satisfies PointProcessorDependencies
}

it('consulta el proveedor con el comercio resuelto y persiste la conciliación', async () => {
  const deps = dependencias()
  expect(await procesarNotificacionPoint(notification, deps)).toEqual({
    evaluacion: { estado: 'PAGO_CONFIRMADO', paymentId: 'PAY123' }, estadoPersistido: 'PAGO_CONFIRMADO',
  })
  expect(deps.consultarProveedor).toHaveBeenCalledWith('ORD123', 'k1')
  expect(deps.guardarResultado).toHaveBeenCalledWith(notification, context, { estado: 'PAGO_CONFIRMADO', paymentId: 'PAY123' })
})

it('no procesa una orden sin contexto o de otra aplicación', async () => {
  for (const contexto of [null, { ...context, applicationId: 'otro' }]) {
    const deps = dependencias()
    deps.buscarContexto.mockResolvedValue(contexto)
    await expect(procesarNotificacionPoint(notification, deps)).rejects.toThrow('vinculación')
    expect(deps.consultarProveedor).not.toHaveBeenCalled()
    expect(deps.guardarResultado).not.toHaveBeenCalled()
  }
})

it('conserva trabajo pendiente ante fallas del proveedor o de persistencia', async () => {
  const deps = dependencias()
  deps.consultarProveedor.mockRejectedValueOnce(new Error('Sin conexión'))
  await expect(procesarNotificacionPoint(notification, deps)).rejects.toThrow('Sin conexión')
  expect(deps.guardarResultado).not.toHaveBeenCalled()
  deps.guardarResultado.mockRejectedValueOnce(new Error('Falló escritura'))
  await expect(procesarNotificacionPoint(notification, deps)).rejects.toThrow('Falló escritura')
})

it('guarda discrepancias para conciliación sin acreditar el pago', async () => {
  const deps = dependencias()
  deps.consultarProveedor.mockResolvedValue({ ...orden, terminalId: 'otra' })
  deps.guardarResultado.mockResolvedValue('CONCILIAR')
  expect((await procesarNotificacionPoint(notification, deps)).estadoPersistido).toBe('CONCILIAR')
  expect(deps.guardarResultado).toHaveBeenCalledWith(notification, context, expect.objectContaining({ estado: 'CONCILIAR' }))
})
