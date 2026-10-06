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
    confirmarVenta: vi.fn().mockResolvedValue('33333333-3333-3333-3333-333333333333'),
  } satisfies PointProcessorDependencies
}

it('consulta el proveedor con el comercio resuelto y persiste la conciliación', async () => {
  const deps = dependencias()
  expect(await procesarNotificacionPoint(notification, deps)).toEqual({
    evaluacion: { estado: 'PAGO_CONFIRMADO', paymentId: 'PAY123' }, estadoPersistido: 'VENTA_CONFIRMADA',
    ventaId: '33333333-3333-3333-3333-333333333333',
  })
  expect(deps.consultarProveedor).toHaveBeenCalledWith('ORD123', 'k1')
  expect(deps.guardarResultado).toHaveBeenCalledWith(notification, context, { estado: 'PAGO_CONFIRMADO', paymentId: 'PAY123' })
  expect(deps.confirmarVenta).toHaveBeenCalledWith(context)
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
  expect(deps.confirmarVenta).not.toHaveBeenCalled()
})

it('propaga fallas de cierre para reintentar un pago confirmado sin crear otra orden', async () => {
  const deps = dependencias()
  deps.confirmarVenta.mockRejectedValueOnce(new Error('Falló venta'))
  await expect(procesarNotificacionPoint(notification, deps)).rejects.toThrow('Falló venta')
  deps.guardarResultado.mockResolvedValue('VENTA_CONFIRMADA')
  expect((await procesarNotificacionPoint(notification, deps)).estadoPersistido).toBe('VENTA_CONFIRMADA')
  expect(deps.confirmarVenta).toHaveBeenCalledTimes(2)
})

it('no confirma ante resultado pendiente o un rechazo persistido', async () => {
  const deps = dependencias()
  deps.guardarResultado.mockResolvedValue('RECHAZADO')
  await procesarNotificacionPoint(notification, deps)
  expect(deps.confirmarVenta).not.toHaveBeenCalled()
  deps.guardarResultado.mockResolvedValue('PAGO_CONFIRMADO')
  deps.consultarProveedor.mockResolvedValue({ ...orden, status: 'at_terminal',
    payments: [{ ...orden.payments[0], status: 'at_terminal', paidAmount: null, statusDetail: null }] })
  await procesarNotificacionPoint(notification, deps)
  expect(deps.confirmarVenta).not.toHaveBeenCalled()
})
