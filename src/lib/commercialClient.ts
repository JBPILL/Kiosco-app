import { v4 as uuidv4 } from 'uuid'
import { supabase } from './supabase'
import { administracionComercialHabilitada } from './commercialScope'
import { useAuthStore } from '../stores/authStore'
import { ERROR_RECURSOS_COMERCIALES_FUERA_DE_ALCANCE } from './kioskPilotScope'

export function exigirAdminComercial(): string {
  if (!administracionComercialHabilitada()) throw new Error(ERROR_RECURSOS_COMERCIALES_FUERA_DE_ALCANCE)
  const user = useAuthStore.getState().usuario
  if (!user?.activo || user.es_superadmin !== true) throw new Error('Sólo SuperAdmin puede administrar suscripciones.')
  return user.auth_user_id || user.id
}
interface Pending { id: string; solicitud: Record<string, unknown> }
/** Fail closed if durable storage is unavailable/corrupt. Never pass passwords here. */
export function prepararOperacionComercial(scope: string, solicitud: Record<string, unknown>): { key: string; pending: Pending } {
  const key = `kioskopos_comercial_${exigirAdminComercial()}_${scope}`
  const serialized = JSON.stringify(solicitud)
  let raw: string | null
  try { raw = localStorage.getItem(key) } catch { throw new Error('No se pudo leer la solicitud comercial pendiente.') }
  if (raw) {
    let pending: Pending
    try {
      pending = JSON.parse(raw) as Pending
      if (!pending || typeof pending.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(pending.id) || !pending.solicitud) throw new Error('corrupt')
    } catch { throw new Error('Solicitud comercial pendiente corrupta; requiere conciliación.') }
    if (JSON.stringify(pending.solicitud) !== serialized) throw new Error('Hay una solicitud pendiente. Reintentá con los datos originales antes de cambiarlos.')
    return { key, pending }
  }
  const pending = { id: uuidv4(), solicitud: JSON.parse(serialized) as Record<string, unknown> }
  try {
    localStorage.setItem(key, JSON.stringify(pending))
    if (localStorage.getItem(key) !== JSON.stringify(pending)) throw new Error('storage')
  } catch { throw new Error('No se pudo conservar la solicitud comercial; no se envió la operación.') }
  return { key, pending }
}
export function confirmarOperacionComercial(key: string): void {
  try { localStorage.removeItem(key) } catch { /* Same ID safely replays the confirmed ACK. */ }
}
export async function ejecutarMutacionComercial(name: string, scope: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { key, pending } = prepararOperacionComercial(scope, args)
  const datos = { ...pending.solicitud, ...(name === 'actualizar_plan' && !args.p_plan_id ? { p_plan_id: pending.id } : {}),
    p_operacion_id: pending.id }
  const { data, error } = await supabase.rpc(name, datos)
  if (error || !data || typeof data !== 'object' || data.success !== true) {
    throw new Error('El backend no confirmó la operación comercial. Conservá los datos y reintentá.')
  }
  confirmarOperacionComercial(key)
  return data as Record<string, unknown>
}
