import { PointNotificationUnlinkedError } from './pointNotificationProcessor.ts'

export interface TrabajoPoint {
  id: string
  intentoId: string | null
  notificacionId: string | null
  leaseToken: string
}
export type ResultadoTrabajoPoint = 'FINALIZADO' | 'PENDIENTE' | 'CONCILIAR' | 'ERROR'
export interface ResumenDespachoPoint {
  tomados: number
  finalizados: number
  pendientes: number
  conciliacion: number
  errores: number
  reservasPerdidas: number
}
export interface DependenciasDespachoPoint {
  tomar: () => Promise<unknown>
  procesar: (trabajo: TrabajoPoint) => Promise<{ estadoPersistido: string; estadoEvaluado: string }>
  terminar: (trabajo: TrabajoPoint, resultado: ResultadoTrabajoPoint) => Promise<boolean>
  ahora: () => number
}
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/
export function leerTrabajoPoint(value: unknown): TrabajoPoint | null {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Trabajo Point inválido')
  const row = value as Record<string, unknown>
  const idValido = (value: unknown): value is string => typeof value === 'string' && uuid.test(value)
  if (!idValido(row.id) || !idValido(row.leaseToken)
    || !(row.intentoId === null && idValido(row.notificacionId)
      || row.notificacionId === null && idValido(row.intentoId))) throw new Error('Identidad del trabajo Point inválida')
  return { id: row.id,leaseToken: row.leaseToken,intentoId: row.intentoId as string | null,
    notificacionId: row.notificacionId as string | null }
}

/** No envía órdenes ni cancela pagos. Una reserva expirada se recupera en la DB. */
export async function despacharPoint(deps: DependenciasDespachoPoint): Promise<ResumenDespachoPoint> {
  const resumen: ResumenDespachoPoint = { tomados: 0,finalizados: 0,pendientes: 0,conciliacion: 0,errores: 0,reservasPerdidas: 0 }
  const inicio = deps.ahora()
  while (resumen.tomados < 5 && deps.ahora() - inicio < 45000) {
    const trabajo = leerTrabajoPoint(await deps.tomar())
    if (!trabajo) break
    resumen.tomados++
    let resultado: ResultadoTrabajoPoint
    try {
      const estado = await deps.procesar(trabajo)
      const persistidos = ['PREPARADO','PENDIENTE','CONCILIAR','CANCELACION_SOLICITADA','PAGO_CONFIRMADO','VENTA_CONFIRMADA','CANCELADO','RECHAZADO']
      const evaluados = ['PENDIENTE','CONCILIAR','PAGO_CONFIRMADO','CANCELADO','RECHAZADO']
      if (!persistidos.includes(estado.estadoPersistido) || !evaluados.includes(estado.estadoEvaluado)) throw new Error('Resultado Point inválido')
      resultado = ['VENTA_CONFIRMADA','CANCELADO','RECHAZADO'].includes(estado.estadoPersistido) ? 'FINALIZADO'
        : estado.estadoEvaluado === 'CONCILIAR' ? 'CONCILIAR' : 'PENDIENTE'
    } catch (error) {
      // Avanzar la exploración sin vínculo aún no es una falla de red o escritura.
      resultado = error instanceof PointNotificationUnlinkedError ? 'PENDIENTE' : 'ERROR'
    }
    // Una falla al guardar el resultado propaga 503 y deja expirar la reserva.
    if (!await deps.terminar(trabajo, resultado)) resumen.reservasPerdidas++
    else if (resultado === 'FINALIZADO') resumen.finalizados++
    else if (resultado === 'CONCILIAR') resumen.conciliacion++
    else if (resultado === 'ERROR') resumen.errores++
    else resumen.pendientes++
  }
  return resumen
}
