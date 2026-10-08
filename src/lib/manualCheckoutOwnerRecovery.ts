import { supabase } from './supabase'
import { useAuthStore } from '../stores/authStore'
import { leerEntradaCheckoutManual, fechaManual } from '../../supabase/functions/_shared/manualCheckoutRequest'
import type { EntradaCheckoutManual } from '../types/checkoutManual'

export async function confirmarEntradaPorDueno(original: EntradaCheckoutManual): Promise<void> {
  const entrada = leerEntradaCheckoutManual(original)
  const inicial = useAuthStore.getState().usuario
  function validar() {
    const { usuario, kiosco } = useAuthStore.getState()
    if (!inicial?.auth_user_id || !usuario?.activo || usuario.rol !== 'DUEÑO'
      || usuario.id !== inicial.id || usuario.auth_user_id !== inicial.auth_user_id
      || usuario.kiosco_id !== entrada.kioscoId || kiosco?.id !== entrada.kioscoId
      || kiosco.estado_suscripcion !== 'ACTIVO') throw new Error('Se requiere la sesión del dueño original')
  }
  validar()
  const { data: sesion, error } = await supabase.auth.getSession()
  validar()
  if (error || !sesion.session?.access_token || sesion.session.user.id !== inicial?.auth_user_id) throw new Error('Sesión inválida')
  const { data, error: fallo } = await supabase.functions.invoke('checkout-manual', {
    body: entrada, headers: { Authorization: `Bearer ${sesion.session.access_token}` },
  })
  validar()
  if (fallo || !data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Cierre sin confirmar')
  const resultado = data as Record<string, unknown>
  if (resultado.venta_id !== entrada.checkoutId || resultado.kiosco_id !== entrada.kioscoId
    || resultado.total !== entrada.totalEsperado || fechaManual(resultado.fecha_hora) !== entrada.fechaHora) throw new Error('Resultado inconsistente')
  // No aplicar stock ni saldos potencialmente históricos al reintentar.
}
