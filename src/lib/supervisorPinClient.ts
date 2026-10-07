import { supabase } from './supabase'
import { useAuthStore } from '../stores/authStore'
import { leerEntradaCheckoutManual } from '../../supabase/functions/_shared/manualCheckoutRequest'
import { guardarAutorizacionCobroManual } from './manualCheckoutClient'
import { leerPermisoSupervisorManual } from './manualCheckoutSupervisorPermission'
import type { EntradaCheckoutManual } from '../types/checkoutManual'

function contextoSupervisor() {
  const { usuario, kiosco } = useAuthStore.getState()
  if (!usuario?.activo || !kiosco || usuario.kiosco_id !== kiosco.id
    || kiosco.estado_suscripcion !== 'ACTIVO' || !['DUEÑO', 'CAJERO'].includes(usuario.rol)) {
    throw new Error('Recuperá la sesión del comercio')
  }
  return { usuario, kiosco }
}

function validarPin(pin: string): void {
  if (!/^[0-9]{4,6}$/.test(pin)) throw new Error('Ingresá un PIN de 4 a 6 dígitos')
}

/** El PIN sólo viaja al servidor; nunca se persiste ni se incluye en errores. */
async function solicitar(cuerpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const original = contextoSupervisor()
  const comprobarSesion = () => {
    const actual = contextoSupervisor()
    if (actual.usuario.id !== original.usuario.id || actual.usuario.auth_user_id !== original.usuario.auth_user_id
      || actual.kiosco.id !== original.kiosco.id || actual.usuario.rol !== original.usuario.rol) {
      throw new Error('La sesión cambió; repetí la operación')
    }
  }
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token || data.session.user.id !== original.usuario.auth_user_id) {
    throw new Error('No se pudo verificar la sesión')
  }
  comprobarSesion()
  const respuesta = await supabase.functions.invoke('supervisor-pin', {
    body: cuerpo, headers: { Authorization: `Bearer ${data.session.access_token}` },
  })
  comprobarSesion()
  // No inspeccionar mensajes arbitrarios del servidor ni reproducir el cuerpo.
  if (respuesta.error) throw new Error('No se pudo confirmar la operación de supervisor')
  const valor: unknown = respuesta.data
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Respuesta de supervisor inválida')
  return valor as Record<string, unknown>
}

export async function consultarPinSupervisor(): Promise<boolean> {
  const resultado = await solicitar({ accion: 'ESTADO' })
  if (Object.keys(resultado).length !== 1 || typeof resultado.configurado !== 'boolean') {
    throw new Error('Respuesta de supervisor inválida')
  }
  return resultado.configurado
}

export async function configurarPinSupervisor(pin: string, repetirPin: string): Promise<void> {
  if (contextoSupervisor().usuario.rol !== 'DUEÑO') throw new Error('Sólo el dueño puede configurar el PIN')
  validarPin(pin)
  if (pin !== repetirPin) throw new Error('Los PIN no coinciden')
  const resultado = await solicitar({ accion: 'CONFIGURAR', pin, repetirPin })
  if (Object.keys(resultado).length !== 1 || resultado.estado !== 'CONFIGURADO') {
    throw new Error('No se pudo confirmar la configuración del PIN')
  }
}

export async function autorizarDescuentoSupervisor(entradaSinValidar: EntradaCheckoutManual, pin: string): Promise<void> {
  validarPin(pin)
  const entrada = leerEntradaCheckoutManual(entradaSinValidar)
  const { usuario, kiosco } = contextoSupervisor()
  if (entrada.usuarioId !== usuario.id || entrada.kioscoId !== kiosco.id || !entrada.tipoAjuste.startsWith('DESCUENTO')) {
    throw new Error('El descuento no corresponde a esta sesión')
  }
  const resultado = await solicitar({ accion: 'AUTORIZAR_DESCUENTO', pin, entrada })
  if (resultado.estado === 'INVALIDO') throw new Error('PIN incorrecto')
  if (resultado.estado === 'NO_CONFIGURADO') throw new Error('El dueño debe configurar el PIN')
  if (resultado.estado !== 'AUTORIZADO' || Object.keys(resultado).length !== 3) {
    throw new Error('No se pudo confirmar la autorización')
  }
  const permiso = leerPermisoSupervisorManual({ autorizacionId: resultado.autorizacionId, venceEn: resultado.venceEn })
  await guardarAutorizacionCobroManual(entrada, permiso)
}
