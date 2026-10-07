import { leerEntradaCheckoutManual } from './manualCheckoutRequest.ts'
import { verificarPinConLimite, type DependenciasVerificacionPin } from './supervisorPinVerification.ts'
import type { EntradaCheckoutManual } from '../../../src/types/checkoutManual.ts'

export interface DependenciasAutorizacionDescuento extends Omit<DependenciasVerificacionPin, 'reservar'> {
  reservarOperacion: (actorAuthId: string, accion: 'DESCUENTO', entrada: EntradaCheckoutManual) => Promise<unknown>
  emitir: (actorAuthId: string, intentoId: string) => Promise<unknown>
}
export type ResultadoAutorizacionDescuento =
  | { estado: 'AUTORIZADO'; autorizacionId: string; venceEn: string }
  | { estado: 'INVALIDO' | 'BLOQUEADO' | 'NO_CONFIGURADO'; reintentarEn?: string }

/** actorAuthId procede de auth.getUser(JWT), nunca de un campo del navegador. */
export async function autorizarDescuentoConPin(actorAuthId: string, entradaSinValidar: unknown, pin: string,
  deps: DependenciasAutorizacionDescuento): Promise<ResultadoAutorizacionDescuento> {
  const entrada = leerEntradaCheckoutManual(entradaSinValidar)
  if (!['DESCUENTO_PORCENTAJE', 'DESCUENTO_FIJO'].includes(entrada.tipoAjuste)) throw new Error('Operación de descuento inválida')
  const verificacion = await verificarPinConLimite(actorAuthId, entrada.kioscoId, pin, {
    reservar: actor => deps.reservarOperacion(actor, 'DESCUENTO', entrada),
    finalizar: deps.finalizar, obtenerPepper: deps.obtenerPepper,
  })
  if (verificacion.estado !== 'VALIDO') return { estado: verificacion.estado, reintentarEn: verificacion.reintentarEn }
  if (!verificacion.intentoId) throw new Error('Autorización sin confirmar')
  try {
    const respuesta = await deps.emitir(actorAuthId, verificacion.intentoId)
    if (!respuesta || typeof respuesta !== 'object') throw new Error('Permiso inválido')
    const datos = respuesta as Record<string, unknown>
    if (typeof datos.autorizacion_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(datos.autorizacion_id)
      || typeof datos.vence_en !== 'string' || !Number.isFinite(Date.parse(datos.vence_en)) || Date.parse(datos.vence_en) <= Date.now()) throw new Error('Permiso inválido')
    return { estado: 'AUTORIZADO', autorizacionId: datos.autorizacion_id, venceEn: datos.vence_en }
  } catch { throw new Error('Autorización sin confirmar') }
}
