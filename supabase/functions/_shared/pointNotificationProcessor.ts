import type { PointOrderSnapshot } from './pointClient.ts'
import { conciliarOrdenPoint, type ExpectedPointOrder, type PointReconciliation } from './pointReconciliation.ts'

export interface PointPendingNotification {
  id: string
  orderId: string
  applicationId: string
}

export interface PointProcessingContext {
  kioscoId: string
  applicationId: string
  expected: ExpectedPointOrder
  pagoConfirmado?: { paymentId: string; revisionPendiente: boolean }
}

export interface PointProcessorDependencies {
  buscarContexto: (orderId: string) => Promise<PointProcessingContext | null>
  recuperarContexto?: (notification: PointPendingNotification) => Promise<PointProcessingContext | null>
  consultarProveedor: (orderId: string, kioscoId: string) => Promise<PointOrderSnapshot>
  guardarResultado: (notification: PointPendingNotification, context: PointProcessingContext, result: PointReconciliation) => Promise<string>
  confirmarVenta: (context: PointProcessingContext) => Promise<string>
}

export interface PointProcessingResult {
  evaluacion: PointReconciliation
  estadoPersistido: string
  ventaId?: string
}

export class PointNotificationUnlinkedError extends Error {
  constructor() { super('La notificación Point sigue pendiente de vinculación') }
}

/** Consulta fresca y cierre comunes al webhook y al sondeo de órdenes conocidas. */
export async function procesarOrdenPoint(context: PointProcessingContext, deps: {
  consultarProveedor: PointProcessorDependencies['consultarProveedor']
  guardarResultado: (context: PointProcessingContext, result: PointReconciliation) => Promise<string>
  confirmarVenta: PointProcessorDependencies['confirmarVenta']
  recuperarCierrePersistido?: boolean
}): Promise<PointProcessingResult> {
  if (!context.expected.orderId) throw new Error('Orden Point no vinculada')
  if (deps.recuperarCierrePersistido && context.pagoConfirmado?.revisionPendiente) {
    return { evaluacion: { estado: 'CONCILIAR', motivo: 'El pago confirmado requiere revisión' }, estadoPersistido: 'PAGO_CONFIRMADO' }
  }
  if (deps.recuperarCierrePersistido && context.pagoConfirmado) {
    const result: PointReconciliation = { estado: 'PAGO_CONFIRMADO', paymentId: context.pagoConfirmado.paymentId }
    // Recupera el cierre del intento; una recepción siempre consulta evidencia fresca.
    const persistido = await deps.guardarResultado(context, result)
    if (!['PAGO_CONFIRMADO','VENTA_CONFIRMADA'].includes(persistido)) return { evaluacion: result, estadoPersistido: persistido }
    const ventaId = await deps.confirmarVenta(context)
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(ventaId)) throw new Error('Confirmación de venta inválida')
    return { evaluacion: result, estadoPersistido: 'VENTA_CONFIRMADA', ventaId }
  }
  const orden = await deps.consultarProveedor(context.expected.orderId, context.kioscoId)
  const result = conciliarOrdenPoint(orden, context.expected)
  const estadoPersistido = await deps.guardarResultado(context, result)
  if (result.estado === 'PAGO_CONFIRMADO' && ['PAGO_CONFIRMADO','VENTA_CONFIRMADA'].includes(estadoPersistido)) {
    const ventaId = await deps.confirmarVenta(context)
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(ventaId)) throw new Error('Confirmación de venta inválida')
    return { evaluacion: result, estadoPersistido: 'VENTA_CONFIRMADA', ventaId }
  }
  return { evaluacion: result, estadoPersistido }
}

/** No acepta el estado del webhook ni elimina trabajos ante fallas. */
export async function procesarNotificacionPoint(
  notification: PointPendingNotification, deps: PointProcessorDependencies,
): Promise<PointProcessingResult> {
  const context = await deps.buscarContexto(notification.orderId)
    ?? await deps.recuperarContexto?.(notification)
  if (!context) throw new PointNotificationUnlinkedError()
  if (context.applicationId !== notification.applicationId
    || context.expected.orderId !== notification.orderId) {
    throw new Error('La notificación Point sigue pendiente de vinculación')
  }
  return procesarOrdenPoint(context, { ...deps,
    guardarResultado: (context, result) => deps.guardarResultado(notification, context, result) })
}
