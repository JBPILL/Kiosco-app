import { supabase } from './supabase'
import { useAuthStore } from '../stores/authStore'
import { leerPoliticaDescuentoSupervisor } from './supervisorDiscountPolicy'
import type { PoliticaDescuentoSupervisor } from './supervisorDiscountPolicy'

function contextoPolitica() {
  const { usuario, kiosco } = useAuthStore.getState()
  if (!usuario?.activo || !usuario.auth_user_id || !kiosco || usuario.kiosco_id !== kiosco.id
    || kiosco.estado_suscripcion !== 'ACTIVO' || !['DUEÑO','CAJERO'].includes(usuario.rol)) throw new Error('Recuperá la sesión del comercio')
  return JSON.stringify([usuario.id, usuario.auth_user_id, kiosco.id, usuario.rol])
}

async function solicitarPolitica(nombre: string, parametros: Record<string, number>): Promise<PoliticaDescuentoSupervisor> {
  const contexto = contextoPolitica()
  async function verificar() {
    if (contextoPolitica() !== contexto) throw new Error('La sesión cambió; repetí la operación')
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session?.access_token || data.session.user.id !== useAuthStore.getState().usuario?.auth_user_id
      || contextoPolitica() !== contexto) throw new Error('No se pudo verificar la sesión')
  }
  await verificar()
  const { data, error } = await supabase.rpc(nombre, parametros)
  await verificar()
  if (error) throw new Error('No se pudo confirmar la política de descuento')
  return leerPoliticaDescuentoSupervisor(data)
}

export function consultarPoliticaSupervisor(): Promise<PoliticaDescuentoSupervisor> {
  return solicitarPolitica('consultar_politica_descuento_supervisor', {})
}

export async function configurarPoliticaSupervisor(umbralPorcentaje: number): Promise<PoliticaDescuentoSupervisor> {
  contextoPolitica()
  if (useAuthStore.getState().usuario?.rol !== 'DUEÑO') throw new Error('Sólo el dueño puede configurar el umbral')
  leerPoliticaDescuentoSupervisor({ umbralPorcentaje, revision: 0 })
  const resultado = await solicitarPolitica('configurar_politica_descuento_supervisor', { p_umbral_porcentaje: umbralPorcentaje })
  if (resultado.umbralPorcentaje !== umbralPorcentaje || resultado.revision < 1) throw new Error('No se pudo confirmar el umbral guardado')
  return resultado
}
