import { verificarPinSupervisor } from './supervisorPinCrypto.ts'

export interface DependenciasVerificacionPin {
  reservar: (actorAuthId: string) => Promise<unknown>
  finalizar: (actorAuthId: string, intentoId: string, valido: boolean) => Promise<unknown>
  obtenerPepper: (version: string) => Promise<Uint8Array>
}
export interface ResultadoVerificacionPin {
  estado: 'VALIDO' | 'INVALIDO' | 'BLOQUEADO' | 'NO_CONFIGURADO'
  intentoId?: string
  reintentarEn?: string
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** El backend obtiene actor/comercio de un JWT verificado. No concede permisos. */
export async function verificarPinConLimite(actorAuthId: string, kioscoId: string, pin: string,
  deps: DependenciasVerificacionPin): Promise<ResultadoVerificacionPin> {
  if (!uuid.test(actorAuthId) || !uuid.test(kioscoId)) throw new Error('Contexto de supervisor inválido')
  try {
    const respuesta = await deps.reservar(actorAuthId)
    if (!respuesta || typeof respuesta !== 'object') throw new Error('Reserva inválida')
    const reserva = respuesta as Record<string, unknown>
    if (reserva.estado === 'NO_CONFIGURADO') return { estado: 'NO_CONFIGURADO' }
    if (reserva.estado === 'BLOQUEADO') {
      if (typeof reserva.reintentar_en !== 'string' || !Number.isFinite(Date.parse(reserva.reintentar_en))) throw new Error('Reserva inválida')
      return { estado: 'BLOQUEADO', reintentarEn: reserva.reintentar_en }
    }
    if (reserva.estado !== 'RESERVADO' || typeof reserva.id !== 'string' || !uuid.test(reserva.id)
      || reserva.kiosco_id !== kioscoId || reserva.actor_auth_id !== actorAuthId
      || !Number.isSafeInteger(reserva.revision) || Number(reserva.revision) < 1
      || !reserva.pin_hash || typeof reserva.pin_hash !== 'object') throw new Error('Reserva inválida')
    const registro = reserva.pin_hash as Record<string, unknown>
    if (typeof registro.pepperVersion !== 'string') throw new Error('Hash inválido')
    const pepper = await deps.obtenerPepper(registro.pepperVersion)
    const valido = await verificarPinSupervisor(pin, kioscoId, pepper, registro.pepperVersion, registro)
    const finalizado = await deps.finalizar(actorAuthId, reserva.id, valido)
    if (!finalizado || typeof finalizado !== 'object') throw new Error('Verificación sin confirmar')
    const resultado = finalizado as Record<string, unknown>
    if (resultado.estado !== 'FINALIZADO' || typeof resultado.valido !== 'boolean' || (!valido && resultado.valido)) {
      throw new Error('Verificación sin confirmar')
    }
    return { estado: resultado.valido ? 'VALIDO' : 'INVALIDO', intentoId: reserva.id }
  } catch { throw new Error('No se pudo verificar el PIN de supervisor') }
}
