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
}

export interface PointProcessorDependencies {
  buscarContexto: (orderId: string) => Promise<PointProcessingContext | null>
  recuperarContexto?: (notification: PointPendingNotification) => Promise<PointProcessingContext | null>
  consultarProveedor: (orderId: string, kioscoId: string) => Promise<PointOrderSnapshot>
  guardarResultado: (notification: PointPendingNotification, context: PointProcessingContext, result: PointReconciliation) => Promise<string>
  confirmarVenta: (context: PointProcessingContext) => Promise<string>
}

/** No acepta el estado del webhook ni elimina trabajos ante fallas. */
export async function procesarNotificacionPoint(
  notification: PointPendingNotification, deps: PointProcessorDependencies,
): Promise<{ evaluacion: PointReconciliation; estadoPersistido: string; ventaId?: string }> {
  const context = await deps.buscarContexto(notification.orderId)
    ?? await deps.recuperarContexto?.(notification)
  if (!context || context.applicationId !== notification.applicationId
    || context.expected.orderId !== notification.orderId) {
    throw new Error('La notificación Point sigue pendiente de vinculación')
  }
  const orden = await deps.consultarProveedor(notification.orderId, context.kioscoId)
  const result = conciliarOrdenPoint(orden, context.expected)
  const estadoPersistido = await deps.guardarResultado(notification, context, result)
  if (result.estado === 'PAGO_CONFIRMADO' && ['PAGO_CONFIRMADO','VENTA_CONFIRMADA'].includes(estadoPersistido)) {
    const ventaId = await deps.confirmarVenta(context)
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(ventaId)) {
      throw new Error('Confirmación de venta inválida')
    }
    return { evaluacion: result, estadoPersistido: 'VENTA_CONFIRMADA', ventaId }
  }
  return { evaluacion: result, estadoPersistido }
}
