import type { PointOrderSnapshot } from './pointClient.ts'
import type { PointPendingNotification, PointProcessingContext } from './pointNotificationProcessor.ts'
import { conciliarOrdenPoint } from './pointReconciliation.ts'
import { contextoPointDesdeRegistro, type PointServerAccounts } from './pointServerConfig.ts'

interface Dependencies {
  cuentas: PointServerAccounts
  consultar: (orderId: string, kioscoId: string) => Promise<PointOrderSnapshot>
  buscarIntento: (attemptId: string, kioscoId: string) => Promise<unknown>
  vincular: (context: PointProcessingContext) => Promise<void>
}

/** Recupera únicamente una orden consultada al proveedor y un intento ya congelado. */
export async function recuperarOrdenPoint(
  notification: PointPendingNotification, deps: Dependencies,
): Promise<PointProcessingContext | null> {
  const candidatos: PointProcessingContext[] = []
  for (const [kioscoId, cuenta] of Object.entries(deps.cuentas)) {
    if (cuenta.applicationId !== notification.applicationId) continue
    let orden: PointOrderSnapshot
    try {
      orden = await deps.consultar(notification.orderId, kioscoId)
    } catch {
      // Una cuenta que no puede consultar la orden no constituye evidencia de identidad.
      continue
    }
    if (orden.id !== notification.orderId || orden.accountId !== cuenta.accountId
      || !orden.externalReference || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(orden.externalReference)) continue
    const registro = await deps.buscarIntento(orden.externalReference, kioscoId)
    if (!registro || typeof registro !== 'object' || Array.isArray(registro)) continue
    const fila = registro as Record<string, unknown>
    if (fila.order_id !== null && fila.order_id !== notification.orderId) continue
    const context = contextoPointDesdeRegistro({ ...fila, order_id: notification.orderId }, deps.cuentas)
    if (context.kioscoId.toLowerCase() !== kioscoId || context.applicationId !== notification.applicationId
      || conciliarOrdenPoint(orden, context.expected).estado === 'CONCILIAR') continue
    candidatos.push(context)
  }
  if (candidatos.length !== 1) return null
  await deps.vincular(candidatos[0])
  return candidatos[0]
}
