import { supabase } from './supabase'
import { useAuthStore } from '../stores/authStore'
import { abrirCajonDineroDirecto } from './escposPrinter'

let aperturaEnCurso = false
export async function solicitarAperturaManualCajon(motivo: string): Promise<{ ok: boolean; mensaje: string }> {
  if (aperturaEnCurso) return { ok: false, mensaje: 'Ya hay una apertura en curso.' }
  const actor = useAuthStore.getState().usuario
  const texto = motivo.trim()
  if (!actor?.activo || actor.rol !== 'DUEÑO' || !actor.kiosco_id || !actor.auth_user_id) return { ok: false, mensaje: 'Se requiere una sesión de dueño activa.' }
  if (texto.length < 5 || texto.length > 300) return { ok: false, mensaje: 'Ingresá un motivo de 5 a 300 caracteres.' }
  aperturaEnCurso = true
  try {
    const solicitud = crypto.randomUUID()
    const { data, error } = await supabase.rpc('solicitar_apertura_manual_cajon', { p_solicitud: solicitud, p_motivo: texto })
    const actual = useAuthStore.getState().usuario
    if (error || data !== solicitud) return { ok: false, mensaje: 'No se pudo autorizar la apertura. Verificá la conexión y la migración.' }
    if (!actual?.activo || actual.rol !== 'DUEÑO' || actual.id !== actor.id || actual.auth_user_id !== actor.auth_user_id || actual.kiosco_id !== actor.kiosco_id) return { ok: false, mensaje: 'La sesión cambió; no se envió el pulso.' }
    const resultado = await abrirCajonDineroDirecto()
    let registroConfirmado = false
    try {
      const registro = await supabase.rpc('registrar_resultado_apertura_cajon', {
        p_solicitud: solicitud, p_resultado: resultado.ok ? 'PULSO_ENVIADO' : 'ERROR_TRANSPORTE',
      })
      registroConfirmado = !registro.error && typeof registro.data === 'string' && registro.data.length > 0
    } catch { /* El fallo de auditoría no debe repetir el pulso. */ }
    if (!registroConfirmado) return { ok: resultado.ok, mensaje: resultado.ok
      ? 'Pulso enviado; no se confirmó el registro del resultado. Comprobá el cajón; no repitas la apertura.'
      : 'Error de transporte; no se confirmó el registro del resultado. Comprobá el cajón antes de reintentar.' }
    return resultado.ok ? { ok: true, mensaje: 'Pulso enviado. Comprobá la apertura del cajón.' } : { ok: false, mensaje: 'Solicitud registrada; no se pudo enviar el pulso a la impresora.' }
  } catch {
    return { ok: false, mensaje: 'No se completó la apertura. Comprobá el cajón antes de reintentar.' }
  } finally { aperturaEnCurso = false }
}
