import { supabase } from './supabase'
import { useAuthStore } from '../stores/authStore'
import { leerEntradaCheckoutManual } from '../../supabase/functions/_shared/manualCheckoutRequest'
import { ManualCheckoutOutbox, procesarCheckoutManual } from './manualCheckoutOutbox'
import type { EntradaCheckoutManual, ResultadoCheckoutManual } from '../types/checkoutManual'

const outbox = new ManualCheckoutOutbox()

function validarContextoLocal(entrada: EntradaCheckoutManual) {
  const { usuario, kiosco } = useAuthStore.getState()
  if (!usuario?.activo || usuario.id !== entrada.usuarioId || usuario.kiosco_id !== entrada.kioscoId
    || kiosco?.id !== entrada.kioscoId || !['DUEÑO', 'CAJERO'].includes(usuario.rol)) {
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

export async function sincronizarCobrosManualesLocales(kioscoId: string, usuarioId: string): Promise<{ exitosas: number; fallidas: number }> {
  const pendientes = await outbox.pendientes(kioscoId, usuarioId)
  let exitosas = 0
  let fallidas = 0
  for (const cobro of pendientes) {
    try {
      await cerrarCobroManualLocal(cobro.entrada, cobro.ticketClave)
      exitosas++
    } catch { fallidas++ }
  }
  return { exitosas, fallidas }
}
