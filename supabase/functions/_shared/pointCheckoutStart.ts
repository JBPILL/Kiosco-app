import type { SolicitudCotizacionPoint } from './pointQuoteRequest.ts'
import type { PermisosCotizacionPoint } from './pointQuoteAuthorization.ts'
import type { cotizarCobroPoint } from './pointQuote.ts'
import { crearOrdenIntentoPoint } from './pointOrderCreation.ts'
import type { IntentoPointPreparado, PointCreationDependencies } from './pointOrderCreation.ts'

type CotizacionCongelada = ReturnType<typeof cotizarCobroPoint>
export interface RegistroInicioPoint {
  intento: IntentoPointPreparado
  entrada: SolicitudCotizacionPoint
  usuarioId: string
  cotizacion: CotizacionCongelada
}

export interface InicioPointDependencies extends PointCreationDependencies {
  cuenta: { applicationId: string; accountId: string; modo: 'sandbox' | 'production'; terminalId: string }
  buscar: (id: string, kioscoId: string) => Promise<RegistroInicioPoint | null>
  cotizar: (permisos: PermisosCotizacionPoint, entrada: SolicitudCotizacionPoint) => Promise<CotizacionCongelada>
  reservar: (registro: RegistroInicioPoint) => Promise<RegistroInicioPoint>
}

function firmaEntrada(entrada: SolicitudCotizacionPoint): string {
  // PostgreSQL JSONB reordena las claves; la comparación debe conservar sólo su contenido.
  return JSON.stringify(entrada, (_key, value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    const registro = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(registro).sort().map((key) => [key, registro[key]]))
  })
}

function comprobarRegistro(registro: RegistroInicioPoint, permisos: PermisosCotizacionPoint,
  entrada: SolicitudCotizacionPoint, deps: InicioPointDependencies): void {
  const { intento } = registro
  if (intento.id !== entrada.intentoId || intento.kioscoId !== permisos.kioscoId
    || registro.usuarioId !== permisos.usuarioId
    || firmaEntrada(registro.entrada) !== firmaEntrada(entrada)
    || intento.applicationId !== deps.cuenta.applicationId || intento.accountId !== deps.cuenta.accountId
    || intento.modo !== deps.cuenta.modo || intento.terminalId !== deps.cuenta.terminalId
    || intento.montoCentavos !== registro.cotizacion.cobro.montoPointCentavos) {
    throw new Error('El intento no coincide con el ticket o configuración original')
  }
}

/** Cotizar y reservar antes de acceder al proveedor. Reintentos recuperan el snapshot original. */
export async function iniciarCheckoutPoint(
  permisos: PermisosCotizacionPoint, entrada: SolicitudCotizacionPoint, deps: InicioPointDependencies,
): Promise<{ orderId: string; estadoPersistido: string; total: number; montoPointCentavos: number }> {
  if (entrada.tipoAjuste !== 'NINGUNO' && !permisos.permiteAjustes) throw new Error('Ajuste no autorizado')
  if (entrada.lineas.some((linea) => linea.tipo === 'SERVICIO') && !permisos.permiteServicios) {
    throw new Error('Servicio no autorizado')
  }
  if (deps.cuenta.modo === 'production' && !deps.permitirProduccion) throw new Error('Point producción no habilitado')
  let registro = await deps.buscar(entrada.intentoId, permisos.kioscoId)
  if (!registro) {
    const cotizacion = await deps.cotizar(permisos, entrada)
    registro = await deps.reservar({ entrada, usuarioId: permisos.usuarioId, cotizacion,
      intento: { id: entrada.intentoId, kioscoId: permisos.kioscoId,
        applicationId: deps.cuenta.applicationId, accountId: deps.cuenta.accountId,
        modo: deps.cuenta.modo, terminalId: deps.cuenta.terminalId,
        montoCentavos: cotizacion.cobro.montoPointCentavos, estado: 'PREPARADO', orderId: null } })
  }
  comprobarRegistro(registro, permisos, entrada, deps)
  const resultado = await crearOrdenIntentoPoint(registro.intento, deps)
  return { ...resultado, total: registro.cotizacion.ticket.total,
    montoPointCentavos: registro.cotizacion.cobro.montoPointCentavos }
}
