import { expect, it, vi } from 'vitest'
import { procesarNotificacionPoint, procesarOrdenPoint, type PointProcessorDependencies } from '../../supabase/functions/_shared/pointNotificationProcessor'
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

it('sondea una orden conocida sin inventar una notificación ni enviar otro cobro', async () => {
  const deps = dependencias()
  const guardarResultado = vi.fn().mockResolvedValue('PAGO_CONFIRMADO')
  expect((await procesarOrdenPoint(context, { ...deps,guardarResultado })).estadoPersistido).toBe('VENTA_CONFIRMADA')
  expect(guardarResultado).toHaveBeenCalledWith(context, { estado: 'PAGO_CONFIRMADO',paymentId: 'PAY123' })
  expect(deps.buscarContexto).not.toHaveBeenCalled()
})

it('reintenta el cierre de un pago persistido aunque el proveedor esté caído', async () => {
  const deps = dependencias()
  const confirmado = { ...context, pagoConfirmado: { paymentId: 'PAY123', revisionPendiente: false } }
  const guardarResultado = vi.fn().mockResolvedValue('PAGO_CONFIRMADO')
  const cierre = { ...deps, guardarResultado, recuperarCierrePersistido: true }
  deps.consultarProveedor.mockRejectedValue(new Error('Proveedor caído'))
  deps.confirmarVenta.mockRejectedValueOnce(new Error('Falló venta'))
  await expect(procesarOrdenPoint(confirmado, cierre)).rejects.toThrow('Falló venta')
  expect((await procesarOrdenPoint(confirmado, cierre)).estadoPersistido).toBe('VENTA_CONFIRMADA')
  expect(deps.consultarProveedor).not.toHaveBeenCalled()
  expect(guardarResultado).toHaveBeenCalledWith(confirmado, { estado: 'PAGO_CONFIRMADO', paymentId: 'PAY123' })
  expect(deps.consultarProveedor).not.toHaveBeenCalled()
})

it('mantiene en conciliación un pago persistido con revisión pendiente', async () => {
  const deps = dependencias()
  const confirmado = { ...context, pagoConfirmado: { paymentId: 'PAY123', revisionPendiente: true } }
  expect(await procesarOrdenPoint(confirmado, { ...deps, recuperarCierrePersistido: true })).toMatchObject({
    evaluacion: { estado: 'CONCILIAR' }, estadoPersistido: 'PAGO_CONFIRMADO',
  })
  expect(deps.confirmarVenta).not.toHaveBeenCalled()
  expect(deps.guardarResultado).not.toHaveBeenCalled()
  expect(deps.consultarProveedor).not.toHaveBeenCalled()
})

it('una notificación nueva consulta evidencia fresca aunque el pago ya esté persistido', async () => {
  const deps = dependencias()
  const confirmado = { ...context, pagoConfirmado: { paymentId: 'PAY123', revisionPendiente: false } }
  deps.buscarContexto.mockResolvedValue(confirmado)
  deps.consultarProveedor.mockResolvedValue({ ...orden, status: 'canceled', payments: [{ ...orden.payments[0], status: 'canceled' }] })
  expect((await procesarNotificacionPoint(notification, deps)).evaluacion.estado).toBe('CANCELADO')
  expect(deps.consultarProveedor).toHaveBeenCalledWith('ORD123', 'k1')
  expect(deps.guardarResultado).toHaveBeenCalledWith(notification, confirmado, { estado: 'CANCELADO' })
  expect(deps.confirmarVenta).not.toHaveBeenCalled()
})
