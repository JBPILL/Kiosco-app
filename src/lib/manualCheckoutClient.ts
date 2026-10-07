import { supabase } from './supabase'
import { useAuthStore } from '../stores/authStore'
import { leerEntradaCheckoutManual } from '../../supabase/functions/_shared/manualCheckoutRequest'
import type { SolicitudCancelacionManual } from './manualCheckoutOutbox'
import { ManualCheckoutOutbox, procesarCheckoutManual } from './manualCheckoutOutbox'
import type { EntradaCheckoutManual, ResultadoCheckoutManual } from '../types/checkoutManual'
import type { TicketData } from '../components/pos/TicketReceiptModal'
import { liveQuery } from 'dexie'

const outbox = new ManualCheckoutOutbox()

function validarContextoLocal(entrada: EntradaCheckoutManual) {
  const { usuario, kiosco } = useAuthStore.getState()
  if (!usuario?.activo || usuario.id !== entrada.usuarioId || usuario.kiosco_id !== entrada.kioscoId
    || kiosco?.id !== entrada.kioscoId || kiosco.estado_suscripcion !== 'ACTIVO' || !['DUEÑO', 'CAJERO'].includes(usuario.rol)) {
    throw new Error('Recuperá la sesión original antes de sincronizar este cobro')
  }
  return usuario
}

export async function enviarCheckoutManual(entradaSinValidar: EntradaCheckoutManual): Promise<unknown> {
  const entrada = leerEntradaCheckoutManual(entradaSinValidar)
  const usuario = validarContextoLocal(entrada)
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token || data.session.user.id !== usuario.auth_user_id) {
    throw new Error('No se pudo verificar la sesión original')
  }
  const { data: resultado, error: errorCierre } = await supabase.functions.invoke('checkout-manual', {
    body: entrada, headers: { Authorization: `Bearer ${data.session.access_token}` },
  })
  if (errorCierre) throw new Error('El servidor no confirmó el cierre. Conservá el cobro original; no vuelvas a cobrar al cliente.')
  return resultado
}

export async function cerrarCobroManualLocal(entradaSinValidar: EntradaCheckoutManual, ticketClave: string): Promise<ResultadoCheckoutManual> {
  const entrada = leerEntradaCheckoutManual(entradaSinValidar)
  validarContextoLocal(entrada)
  return procesarCheckoutManual(entrada, ticketClave, { outbox, enviar: enviarCheckoutManual })
}

export function recuperarCobroManualLocal(kioscoId: string, usuarioId: string, ticketClave: string) {
  return outbox.recuperarTicket(kioscoId, usuarioId, ticketClave)
}

export async function guardarCobroManualLocal(entrada: EntradaCheckoutManual, ticketClave: string, recibo: TicketData) {
  validarContextoLocal(entrada)
  return outbox.guardar(entrada, ticketClave, recibo)
}

export function reclamarComprobanteManual(id: string, permitirPendiente = false) {
  return outbox.reclamarPresentacion(id, permitirPendiente)
}

export function observarCobrosManualesLocales(kioscoId: string, usuarioId: string) {
  return liveQuery(() => outbox.cobros.where('[kioscoId+usuarioId+visibilidad]')
    .anyOf([[kioscoId, usuarioId, 'PENDIENTE'], [kioscoId, usuarioId, 'RECUPERAR']]).toArray())
}

export async function hayCobrosManualesPendientes(kioscoId: string, sesionId: string): Promise<boolean> {
  return (await outbox.cobros.where('estado').equals('PENDIENTE').toArray())
    .some(c => c.kioscoId === kioscoId && c.entrada.sesionCajaId === sesionId)
}

export async function sincronizarCobrosManualesLocales(kioscoId: string, usuarioId: string): Promise<{ exitosas: number; fallidas: number }> {
  const pendientes = await outbox.pendientes(kioscoId, usuarioId)
  let exitosas = 0
  let fallidas = 0
  for (const cobro of pendientes) {
    try {
      if (cobro.cancelacion) await cancelarCobroManualLocal(cobro.id, cobro.cancelacion)
      else await cerrarCobroManualLocal(cobro.entrada, cobro.ticketClave)
      exitosas++
    } catch { fallidas++ }
  }
  return { exitosas, fallidas }
}

function validarDuenoCancelacion(entrada: EntradaCheckoutManual) {
  const { usuario, kiosco } = useAuthStore.getState()
  if (!usuario?.activo || usuario.rol !== 'DUEÑO' || usuario.kiosco_id !== entrada.kioscoId || kiosco?.id !== entrada.kioscoId) {
    throw new Error('Se requiere el dueño del comercio para cancelar el cobro')
  }
  return usuario
}

export async function enviarCancelacionCheckoutManual(entrada: EntradaCheckoutManual, solicitud: SolicitudCancelacionManual): Promise<unknown> {
  const usuario = validarDuenoCancelacion(entrada)
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token || data.session.user.id !== usuario.auth_user_id) {
    throw new Error('No se pudo verificar la sesión del dueño')
  }
  // Volver a comprobar el contexto después de obtener el JWT evita usar una sesión cambiada.
  if (validarDuenoCancelacion(entrada).id !== usuario.id) throw new Error('La sesión del dueño cambió')
  const { data: resultado, error: fallo } = await supabase.rpc('cancelar_checkout_manual', {
    p_entrada: entrada, p_motivo: solicitud.motivo, p_resolucion: solicitud.resolucion, p_referencia: solicitud.referencia,
  })
  if (fallo) throw new Error('Cancelación sin confirmar. Conservá la solicitud original y revisá si la venta existe en Reportes.')
  return resultado
}

export async function cancelarCobroManualLocal(id: string, solicitud: SolicitudCancelacionManual) {
  const original = await outbox.cobros.get(id)
  if (!original) throw new Error('No se encontró el cobro original')
  validarDuenoCancelacion(original.entrada)
  const durable = await outbox.solicitarCancelacion(id, solicitud)
  if (durable.estado === 'CANCELADO' && durable.cancelacionConfirmada) return durable.cancelacionConfirmada
  if (!durable.cancelacion) throw new Error('No se encontró la cancelación original')
  const respuesta = await enviarCancelacionCheckoutManual(durable.entrada, durable.cancelacion)
  return outbox.confirmarCancelacion(id, respuesta)
}
