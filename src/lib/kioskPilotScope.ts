import type { ItemCarrito } from '../types/database'
import { envasesTransaccionalesActivos } from './pilotExpansion'

export const ERROR_FACTURACION_FUERA_DE_ALCANCE = 'La facturación fiscal está fuera del alcance del piloto.'
export const ERROR_ENVASE_FUERA_DE_ALCANCE = 'Las devoluciones de envases están fuera del alcance del piloto.'
export const ERROR_DEVOLUCIONES_FUERA_DE_ALCANCE = 'Las devoluciones y cambios están deshabilitados durante el piloto estricto.'
export const ERROR_RECURSOS_COMERCIALES_FUERA_DE_ALCANCE = 'La administración comercial y de suscripciones está fuera del alcance del piloto.'

export function kioskoPilotStrictScopeActivo(): boolean {
  return import.meta.env.VITE_KIOSKO_PILOT_STRICT_SCOPE === 'true'
}

export function mensajeRecursosComercialesFueraDeAlcance(modoEstricto = kioskoPilotStrictScopeActivo()): string | null {
  return modoEstricto ? ERROR_RECURSOS_COMERCIALES_FUERA_DE_ALCANCE : null
}

export function errorDevolucionFueraDeAlcance(modoEstricto: boolean): string | null {
  return modoEstricto ? ERROR_DEVOLUCIONES_FUERA_DE_ALCANCE : null
}

export function errorCheckoutFueraDeAlcance(
  modoEstricto: boolean,
  solicitaFactura: boolean,
  items: readonly Pick<ItemCarrito, 'es_devolucion_envase'>[],
): string | null {
  if (!modoEstricto) return null
  if (solicitaFactura) return ERROR_FACTURACION_FUERA_DE_ALCANCE
  if (!envasesTransaccionalesActivos() && items.some(item => item.es_devolucion_envase)) return ERROR_ENVASE_FUERA_DE_ALCANCE
  return null
}

export async function ejecutarCheckoutConAlcanceFiscal<T>(
  modoEstricto: boolean,
  solicitaFactura: boolean,
  checkout: () => Promise<T>,
  emitirFactura: (resultado: T) => Promise<void>,
): Promise<T> {
  if (modoEstricto && solicitaFactura) throw new Error(ERROR_FACTURACION_FUERA_DE_ALCANCE)
  const resultado = await checkout()
  if (solicitaFactura && !modoEstricto) await emitirFactura(resultado)
  return resultado
}
