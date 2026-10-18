import { supabase } from './supabase'
import { useAuthStore } from '../stores/authStore'
import { EnvasesOutbox, procesarOperacionEnvase, type ResultadoEnvase } from './envasesOutbox'
import { CashReturnOutbox, procesarDevolucionEfectivo, type ResultadoDevolucionEfectivo } from './cashReturnOutbox'
import { envasesTransaccionalesActivos, devolucionesEfectivoActivas } from './pilotExpansion'

export interface ContextoOperacionPiloto {
  kioscoId: string
  usuarioId: string
  authId: string
}

export const envasesOutbox = new EnvasesOutbox()
export const cashReturnOutbox = new CashReturnOutbox()

export function contextoOperacionPiloto(): ContextoOperacionPiloto {
  const usuario = useAuthStore.getState().usuario
  if (!usuario?.activo || !usuario.kiosco_id || !usuario.auth_user_id
    || !['DUEÑO', 'CAJERO'].includes(usuario.rol)) {
    throw new Error('Ingresá con un usuario activo del comercio para operar.')
  }
  return { kioscoId: usuario.kiosco_id, usuarioId: usuario.id, authId: usuario.auth_user_id }
}

function exigirContexto(contexto: ContextoOperacionPiloto): void {
  const actual = contextoOperacionPiloto()
  if (actual.kioscoId !== contexto.kioscoId || actual.usuarioId !== contexto.usuarioId || actual.authId !== contexto.authId) {
    throw new Error('Cambió la sesión. Recuperá la operación desde el usuario original.')
  }
}

/** Bind the request to the identity captured before the durable write, even if Auth changes meanwhile. */
async function tokenParaContexto(contexto: ContextoOperacionPiloto): Promise<string> {
  exigirContexto(contexto)
  const { data, error } = await supabase.auth.getSession()
  exigirContexto(contexto)
  if (error || !data.session?.access_token || data.session.user.id !== contexto.authId) {
    throw new Error('La sesión no corresponde al usuario de la operación. Volvé a ingresar.')
  }
  return data.session.access_token
}

export async function ejecutarOperacionEnvase(contexto: ContextoOperacionPiloto, valor: unknown): Promise<ResultadoEnvase> {
  exigirContexto(contexto)
  const solicitud = envasesOutbox.parsear(valor)
  const anterior = await envasesOutbox.operaciones.get(solicitud.id)
  exigirContexto(contexto)
  if (!anterior && !envasesTransaccionalesActivos()) throw new Error('Envases todavía no está habilitado para nuevas operaciones.')
  const resultado = await procesarOperacionEnvase(envasesOutbox, contexto.kioscoId, contexto.usuarioId, solicitud, async cuerpo => {
    const token = await tokenParaContexto(contexto)
    return await supabase.rpc('operar_envases_atomico', { p_solicitud: cuerpo })
      .setHeader('Authorization', `Bearer ${token}`)
  })
  exigirContexto(contexto)
  return resultado
}

export async function ejecutarDevolucionEfectivo(contexto: ContextoOperacionPiloto, valor: unknown): Promise<ResultadoDevolucionEfectivo> {
  exigirContexto(contexto)
  const solicitud = cashReturnOutbox.parsear(valor)
  const anterior = await cashReturnOutbox.operaciones.get(solicitud.id)
  exigirContexto(contexto)
  if (!anterior && !devolucionesEfectivoActivas()) throw new Error('Devoluciones todavía no está habilitado para nuevas operaciones.')
  const resultado = await procesarDevolucionEfectivo(cashReturnOutbox, contexto.kioscoId, contexto.usuarioId, solicitud, async cuerpo => {
    const token = await tokenParaContexto(contexto)
    return await supabase.rpc('confirmar_devolucion_efectivo_piloto', { p_solicitud: cuerpo })
      .setHeader('Authorization', `Bearer ${token}`)
  })
  exigirContexto(contexto)
  return resultado
}

export async function confirmarEntregaPiloto(contexto: ContextoOperacionPiloto, tipo: 'ENVASES' | 'DEVOLUCION', id: string): Promise<void> {
  exigirContexto(contexto)
  const outbox = tipo === 'ENVASES' ? envasesOutbox : cashReturnOutbox
  await outbox.confirmarEntregaLocal(id, contexto.kioscoId, contexto.usuarioId)
  exigirContexto(contexto)
}
