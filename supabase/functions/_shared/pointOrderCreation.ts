import type { PointOrderInput } from './pointOrder.ts'
import type { PointOrderSnapshot } from './pointClient.ts'
import { conciliarOrdenPoint } from './pointReconciliation.ts'

export interface IntentoPointPreparado {
  id: string
  kioscoId: string
  applicationId: string
  accountId: string
  modo: 'sandbox' | 'production'
  terminalId: string
  montoCentavos: number
  estado: string
  orderId: string | null
}

export interface PointCreationDependencies {
  permitirProduccion: boolean
  crear: (input: PointOrderInput) => Promise<PointOrderSnapshot>
  vincular: (intento: IntentoPointPreparado, orderId: string | null) => Promise<string>
}

/** Ejecutar sólo sobre el registro congelado retornado por preparar_intento_point. */
export async function crearOrdenIntentoPoint(
  intento: IntentoPointPreparado, deps: PointCreationDependencies,
): Promise<{ orderId: string; estadoPersistido: string }> {
  if (intento.modo === 'production' && !deps.permitirProduccion) throw new Error('Point producción no habilitado')
  if (intento.orderId) {
    if (['CANCELADO', 'RECHAZADO'].includes(intento.estado)) throw new Error('El intento ya terminó')
    return { orderId: intento.orderId, estadoPersistido: intento.estado }
  }
  if (!['PREPARADO', 'CONCILIAR'].includes(intento.estado)) throw new Error('El intento no admite crear una orden')
  try {
    const orden = await deps.crear({ intentoId: intento.id, terminalId: intento.terminalId, montoCentavos: intento.montoCentavos })
    const evaluacion = conciliarOrdenPoint(orden, { attemptId: intento.id, orderId: null,
      accountId: intento.accountId, terminalId: intento.terminalId, amountCentavos: intento.montoCentavos })
    if (evaluacion.estado === 'CONCILIAR') throw new Error('La respuesta Point requiere revisión')
    const estadoPersistido = await deps.vincular(intento, orden.id)
    return { orderId: orden.id, estadoPersistido }
  } catch {
    // Incluso un error HTTP deja el mismo intento bloqueado; no libera el checkout.
    await deps.vincular(intento, null)
    throw new Error('No se pudo confirmar la orden Point; el intento requiere conciliación')
  }
}
