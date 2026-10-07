import { supabase } from './supabase'
import { useAuthStore } from '../stores/authStore'

export interface CobroManualRemoto {
  id: string
  kioscoId: string
  usuarioId: string
  sesionCajaId: string
  fechaHora: string
  total: number
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function leerPendientesRemotos(datos: unknown, kioscoId: string): CobroManualRemoto[] {
  if (!Array.isArray(datos) || datos.length > 50) throw new Error('Respuesta de pendientes inválida')
  const ids = new Set<string>()
  return datos.map((dato: unknown) => {
    if (!dato || typeof dato !== 'object') throw new Error('Pendiente inválido')
    const fila = dato as Record<string, unknown>
    for (const clave of ['id', 'kioscoId', 'usuarioId', 'sesionCajaId']) {
      if (typeof fila[clave] !== 'string' || !uuid.test(fila[clave])) throw new Error('Identidad inválida')
    }
    if (fila.kioscoId !== kioscoId || typeof fila.fechaHora !== 'string' || !Number.isFinite(Date.parse(fila.fechaHora))
      || typeof fila.total !== 'number' || !Number.isFinite(fila.total) || fila.total < 0
      || ids.has(String(fila.id))) throw new Error('Pendiente inconsistente')
    ids.add(String(fila.id))
    return { id: String(fila.id), kioscoId, usuarioId: String(fila.usuarioId), sesionCajaId: String(fila.sesionCajaId), fechaHora: fila.fechaHora, total: fila.total }
  })
}

export async function consultarPendientesRemotos(kioscoId: string, despues: string | null = null): Promise<CobroManualRemoto[]> {
  const inicial = useAuthStore.getState().usuario
  function validarContexto() {
    const { usuario, kiosco } = useAuthStore.getState()
    if (!usuario?.activo || usuario.rol !== 'DUEÑO' || usuario.id !== inicial?.id
      || usuario.auth_user_id !== inicial?.auth_user_id || usuario.kiosco_id !== kioscoId || kiosco?.id !== kioscoId) {
      throw new Error('Se requiere la sesión del dueño de este comercio')
    }
  }
  validarContexto()
  if (despues !== null && !uuid.test(despues)) throw new Error('Cursor inválido')
  const { data, error } = await supabase.rpc('consultar_checkouts_manuales_pendientes', { p_despues: despues, p_limite: 50 })
  validarContexto()
  if (error) throw new Error('No se pudieron consultar los pendientes del servidor')
  return leerPendientesRemotos(data, kioscoId)
}
