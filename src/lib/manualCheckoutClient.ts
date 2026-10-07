import { useCartStore } from '../stores/cartStore'
import { supabase } from './supabase'
import { useAuthStore } from '../stores/authStore'
import { firmaManual, leerEntradaCheckoutManual } from '../../supabase/functions/_shared/manualCheckoutRequest'
import { leerPermisoSupervisorManual } from './manualCheckoutSupervisorPermission'
import type { PermisoSupervisorManual } from './manualCheckoutSupervisorPermission'
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
  const cobro = await outbox.cobros.get(entrada.checkoutId)
  if (cobro && firmaManual(cobro.entrada) !== firmaManual(entrada)) throw new Error('La entrada original no coincide')
  const headers: Record<string, string> = { Authorization: `Bearer ${data.session.access_token}` }
  if (cobro?.autorizacionSupervisor) {
    headers['x-supervisor-autorizacion'] = leerPermisoSupervisorManual(cobro.autorizacionSupervisor).autorizacionId
  }
  const actual = validarContextoLocal(entrada)
  if (actual.id !== usuario.id || actual.auth_user_id !== usuario.auth_user_id) throw new Error('La sesión original cambió')
  const { data: resultado, error: errorCierre } = await supabase.functions.invoke('checkout-manual', {
    body: entrada, headers,
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

export async function guardarAutorizacionCobroManual(entrada: EntradaCheckoutManual, permiso: unknown): Promise<void> {
  validarContextoLocal(entrada)
  await outbox.guardarAutorizacionSupervisor(entrada, permiso)
}

export async function guardarCobroManualLocal(entrada: EntradaCheckoutManual, ticketClave: string, recibo: TicketData, permiso?: PermisoSupervisorManual) {
  validarContextoLocal(entrada)
  return outbox.guardar(entrada, ticketClave, recibo, permiso)
}

export function reclamarComprobanteManual(id: string, permitirPendiente = false) {
  return outbox.reclamarPresentacion(id, permitirPendiente)
}

function contextoCola(kioscoId: string, usuarioId: string) {
  const { usuario, kiosco } = useAuthStore.getState()
  if (!usuario?.activo || usuario.id !== usuarioId || usuario.kiosco_id !== kioscoId || kiosco?.id !== kioscoId) return null
  return usuario
}

export function observarCobrosManualesLocales(kioscoId: string, usuarioId: string) {
  return liveQuery(async () => {
    const usuario = contextoCola(kioscoId, usuarioId)
    if (!usuario) return []
    return outbox.visibles(kioscoId, usuarioId, usuario.rol === 'DUEÑO')
  })
}

export async function hayCobrosManualesPendientes(kioscoId: string, sesionId: string): Promise<boolean> {
  return (await outbox.cobros.where('estado').equals('PENDIENTE').toArray())
    .some(c => c.kioscoId === kioscoId && c.entrada.sesionCajaId === sesionId)
}

export async function sincronizarCobrosManualesLocales(kioscoId: string, usuarioId: string): Promise<{ exitosas: number; fallidas: number }> {
  const usuario = contextoCola(kioscoId, usuarioId)
  if (!usuario) throw new Error('La sesión cambió; recuperá el operador original')
  // Si la sesión cambió después de archivar pero antes de liberar el carrito,
  // recuperar la liberación a partir del acuse durable, sin reenviar la venta.
  const idsBloqueados = [...new Set(Object.values(useCartStore.getState().cobrosBloqueados))]
  for (const cobro of await outbox.cobros.bulkGet(idsBloqueados)) {
    if (cobro?.estado === 'CANCELADO' && cobro.kioscoId === kioscoId && cobro.usuarioId === usuarioId && cobro.cancelacionConfirmada) {
      await outbox.confirmarCancelacion(cobro.id, cobro.cancelacionConfirmada)
      completarTicketCancelado(cobro)
    }
  }
  const pendientes = (await outbox.visibles(kioscoId, usuarioId, usuario.rol === 'DUEÑO'))
    .filter(c => c.estado === 'PENDIENTE' && (c.usuarioId === usuarioId || Boolean(c.cancelacion)))
  let exitosas = 0
  let fallidas = 0
  for (const cobro of pendientes) {
    try {
      if (await conciliarCancelacionManualLocal(cobro.id)) { exitosas++; continue }
      if (cobro.cancelacion) await cancelarCobroManualLocal(cobro.id, cobro.cancelacion)
      else await cerrarCobroManualLocal(cobro.entrada, cobro.ticketClave)
      exitosas++
    } catch { fallidas++ }
  }
  return { exitosas, fallidas }
}

export async function consultarCancelacionManual(entrada: EntradaCheckoutManual): Promise<unknown> {
  function validar() {
    const { usuario, kiosco } = useAuthStore.getState()
    if (!usuario?.activo || usuario.kiosco_id !== entrada.kioscoId || kiosco?.id !== entrada.kioscoId
      || !['DUEÑO', 'CAJERO'].includes(usuario.rol) || (usuario.rol === 'CAJERO' && usuario.id !== entrada.usuarioId)) {
      throw new Error('Sesión no autorizada para conciliar')
    }
    return usuario
  }
  const usuario = validar()
  const { data, error } = await supabase.rpc('consultar_cancelacion_checkout_manual', { p_entrada: entrada })
  const actual = validar()
  if (actual.id !== usuario.id || actual.auth_user_id !== usuario.auth_user_id || error) throw new Error('Conciliación sin confirmar')
  return data
}

export async function conciliarCancelacionManualLocal(id: string): Promise<boolean> {
  const original = await outbox.cobros.get(id)
  if (!original || original.estado !== 'PENDIENTE') return false
  const respuesta = await consultarCancelacionManual(original.entrada)
  if (respuesta === null) return false
  const cobro = await outbox.conciliarCancelacionRemota(id, respuesta)
  completarTicketCancelado(cobro)
  return true
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
  if (durable.estado === 'CANCELADO' && durable.cancelacionConfirmada) {
    completarTicketCancelado(durable)
    return durable.cancelacionConfirmada
  }
  if (!durable.cancelacion) throw new Error('No se encontró la cancelación original')
  const respuesta = await enviarCancelacionCheckoutManual(durable.entrada, durable.cancelacion)
  const confirmacion = await outbox.confirmarCancelacion(id, respuesta)
  completarTicketCancelado(durable)
  return confirmacion
}

export async function cancelarCobroManualRemoto(entrada: EntradaCheckoutManual, solicitud: SolicitudCancelacionManual) {
  validarDuenoCancelacion(entrada)
  const durable = await outbox.solicitarCancelacionRemota(entrada, solicitud)
  return cancelarCobroManualLocal(durable.id, solicitud)
}

export async function recuperarCancelacionManualLocal(id: string) {
  const cobro = await outbox.cobros.get(id)
  if (!cobro?.cancelacion) return undefined
  validarDuenoCancelacion(cobro.entrada)
  return cobro
}

function completarTicketCancelado(cobro: import('./manualCheckoutOutbox').CobroManualLocal) {
  const actual = useAuthStore.getState()
  const carrito = useCartStore.getState()
  if (actual.usuario?.id === cobro.usuarioId && actual.kiosco?.id === cobro.kioscoId
    && carrito.cobrosBloqueados[cobro.ticketClave] === cobro.id) carrito.completarCobroTab(cobro.ticketClave)
}
