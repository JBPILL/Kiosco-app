import { PointApiError, type PointOrderSnapshot } from './pointClient.ts'
import type { PointPendingNotification, PointProcessingContext } from './pointNotificationProcessor.ts'
import { conciliarOrdenPoint } from './pointReconciliation.ts'
import { contextoPointDesdeRegistro, type PointServerAccounts } from './pointServerConfig.ts'

export interface PointRecoveryCheckpoint {
  configuracion: string
  siguiente: number
  candidatos: Array<{ intentoId: string; kioscoId: string }>
}
interface Dependencies {
  cuentas: PointServerAccounts
  consultar: (orderId: string, kioscoId: string) => Promise<PointOrderSnapshot>
  buscarIntento: (attemptId: string, kioscoId: string) => Promise<unknown>
  vincular: (context: PointProcessingContext) => Promise<void>
  checkpoint?: unknown
  guardarCheckpoint: (checkpoint: PointRecoveryCheckpoint | null) => Promise<void>
}

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/
function leerCheckpoint(value: unknown, configuracion: string, total: number): PointRecoveryCheckpoint {
  const inicial = { configuracion, siguiente: 0, candidatos: [] }
  if (value === null || value === undefined) return inicial
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Recuperación Point inválida')
  const fila = value as Record<string, unknown>
  if (fila.configuracion !== configuracion) return inicial
  if (!Number.isSafeInteger(fila.siguiente) || (fila.siguiente as number) < 0 || (fila.siguiente as number) > total
    || !Array.isArray(fila.candidatos) || fila.candidatos.length > total) throw new Error('Recuperación Point inválida')
  const candidatos = fila.candidatos.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Candidato Point inválido')
    const candidato = value as Record<string, unknown>
    if (typeof candidato.intentoId !== 'string' || !uuid.test(candidato.intentoId)
      || typeof candidato.kioscoId !== 'string' || !uuid.test(candidato.kioscoId)) throw new Error('Candidato Point inválido')
    return { intentoId: candidato.intentoId, kioscoId: candidato.kioscoId }
  })
  return { configuracion, siguiente: fila.siguiente as number, candidatos }
}

/** Una consulta por invocación; ningún fallo incierto descarta una cuenta candidata. */
export async function recuperarOrdenPoint(
  notification: PointPendingNotification, deps: Dependencies,
): Promise<PointProcessingContext | null> {
  const cuentas = Object.entries(deps.cuentas).filter(([, cuenta]) => cuenta.applicationId === notification.applicationId)
    .sort(([a], [b]) => a.localeCompare(b))
  if (cuentas.length > 256) throw new Error('Demasiadas cuentas para recuperar la orden Point')
  // Identidades públicas; las credenciales nunca forman parte del checkpoint.
  const identidades = cuentas.map(([kioscoId, cuenta]) => [kioscoId, cuenta.applicationId, cuenta.accountId, cuenta.modo])
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(identidades)))
  const configuracion = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
  let checkpoint = leerCheckpoint(deps.checkpoint, configuracion, cuentas.length)
  if (checkpoint.siguiente < cuentas.length) {
    const [kioscoId, cuenta] = cuentas[checkpoint.siguiente]
    let orden: PointOrderSnapshot | null
    try { orden = await deps.consultar(notification.orderId, kioscoId) }
    catch (error) {
      if (!(error instanceof PointApiError) || error.httpStatus !== 404) throw error
      orden = null
    }
    let candidato: { intentoId: string; kioscoId: string } | null = null
    if (orden && orden.id === notification.orderId && orden.accountId === cuenta.accountId
      && orden.externalReference && uuid.test(orden.externalReference)) {
      const registro = await deps.buscarIntento(orden.externalReference, kioscoId)
      if (registro && typeof registro === 'object' && !Array.isArray(registro)) {
        const fila = registro as Record<string, unknown>
        if (fila.order_id === null || fila.order_id === notification.orderId) {
          const context = contextoPointDesdeRegistro({ ...fila, order_id: notification.orderId }, deps.cuentas)
          if (context.kioscoId.toLowerCase() === kioscoId && context.applicationId === notification.applicationId
            && conciliarOrdenPoint(orden, context.expected).estado !== 'CONCILIAR') {
            candidato = { intentoId: context.expected.attemptId, kioscoId }
          }
        }
      }
    }
    checkpoint = { ...checkpoint, siguiente: checkpoint.siguiente + 1,
      candidatos: candidato ? [...checkpoint.candidatos, candidato] : checkpoint.candidatos }
    await deps.guardarCheckpoint(checkpoint)
  }
  if (checkpoint.siguiente < cuentas.length) return null
  if (checkpoint.candidatos.length !== 1) {
    await deps.guardarCheckpoint(null)
    return null
  }
  const candidato = checkpoint.candidatos[0]
  const registro = await deps.buscarIntento(candidato.intentoId, candidato.kioscoId)
  if (!registro || typeof registro !== 'object' || Array.isArray(registro)) throw new Error('Intento recuperado no disponible')
  const fila = registro as Record<string, unknown>
  if (fila.order_id !== null && fila.order_id !== notification.orderId) throw new Error('Orden recuperada no coincide')
  const context = contextoPointDesdeRegistro({ ...fila, order_id: notification.orderId }, deps.cuentas)
  if (context.kioscoId.toLowerCase() !== candidato.kioscoId || context.applicationId !== notification.applicationId) {
    throw new Error('Identidad recuperada no coincide')
  }
  await deps.vincular(context)
  return context
}
