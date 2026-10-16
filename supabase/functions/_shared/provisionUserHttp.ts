import { leerCuerpo } from './pointQuoteHttp.ts'

type StaffRole = 'CAJERO' | 'VISOR'
export type ProvisionRole = StaffRole | 'DUEÑO'
export interface ProvisionActor {
  kiosco_id: string | null
  rol: string
  activo: boolean
  es_superadmin: boolean
}
export interface ProvisionProfile {
  id: string
  kiosco_id: string
  nombre: string
  rol: ProvisionRole
  activo: boolean
  es_superadmin?: boolean
  auth_user_id?: string | null
}
export type ProvisionRequest = { email: string; password: string } & (
  | { action: 'create_staff'; nombre: string; rol: StaffRole }
  | { action: 'link_credentials'; usuarioId: string }
)
export interface ProvisionDependencies {
  origins: string[]
  authenticate: (token: string) => Promise<ProvisionActor | null>
  findTarget: (id: string, kioskId: string) => Promise<ProvisionProfile | null>
  createIdentity: (body: ProvisionRequest, kioskId: string, role: ProvisionRole) => Promise<string>
  insertProfile: (body: Extract<ProvisionRequest, { action: 'create_staff' }>, kioskId: string, authId: string) => Promise<ProvisionProfile | null>
  linkProfile: (target: ProvisionProfile, email: string, authId: string) => Promise<ProvisionProfile | null>
  deleteIdentity: (authId: string) => Promise<void>
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function readProvisionRequest(value: unknown): ProvisionRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Solicitud inválida')
  const body = value as Record<string, unknown>
  const keys = body.action === 'create_staff'
    ? ['action', 'email', 'password', 'nombre', 'rol']
    : body.action === 'link_credentials' ? ['action', 'email', 'password', 'usuarioId'] : []
  if (!keys.length || Object.keys(body).length !== keys.length || !keys.every(key => Object.hasOwn(body, key))) {
    throw new Error('Campos inválidos')
  }
  if (typeof body.email !== 'string' || body.email.length > 254 ||
      typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
    throw new Error('Credenciales inválidas')
  }
  const email = body.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email inválido')
  if (body.action === 'create_staff') {
    if (body.rol !== 'CAJERO' && body.rol !== 'VISOR') throw new Error('Rol no permitido')
    if (typeof body.nombre !== 'string' || !body.nombre.trim() || body.nombre.trim().length > 120) {
      throw new Error('Nombre inválido')
    }
    return { action: 'create_staff', email, password: body.password, nombre: body.nombre.trim(), rol: body.rol }
  }
  if (typeof body.usuarioId !== 'string' || !uuid.test(body.usuarioId)) throw new Error('Usuario inválido')
  return { action: 'link_credentials', email, password: body.password, usuarioId: body.usuarioId.toLowerCase() }
}

export async function receiveProvisionUser(request: Request, deps: ProvisionDependencies): Promise<Response> {
  const origin = request.headers.get('origin')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers })
  if (origin && !deps.origins.includes(origin)) return json(403, { error: 'Origen no autorizado' })
  if (origin) headers['Access-Control-Allow-Origin'] = origin
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return json(405, { error: 'Método no permitido' })
  const authorization = request.headers.get('authorization') || ''
  if (!/^Bearer \S+$/i.test(authorization)) return json(401, { error: 'Autenticación requerida' })
  let actor: ProvisionActor | null
  try { actor = await deps.authenticate(authorization.slice(7)) }
  catch { return json(503, { error: 'No se pudo verificar la sesión' }) }
  if (!actor) return json(401, { error: 'Sesión inválida' })
  if (!actor.activo || (actor.rol !== 'DUEÑO' && !actor.es_superadmin) ||
      !actor.kiosco_id || !uuid.test(actor.kiosco_id)) {
    return json(403, { error: 'Sólo un administrador activo con comercio puede administrar usuarios' })
  }
  let body: ProvisionRequest
  try { body = readProvisionRequest(await leerCuerpo(request, 8192)) }
  catch { return json(400, { error: 'Solicitud inválida' }) }
  let target: ProvisionProfile | null = null
  if (body.action === 'link_credentials') {
    try { target = await deps.findTarget(body.usuarioId, actor.kiosco_id) }
    catch { return json(503, { error: 'No se pudo consultar el usuario objetivo' }) }
    if (!target?.activo || target.es_superadmin !== false || target.kiosco_id !== actor.kiosco_id ||
        !['DUEÑO', 'CAJERO', 'VISOR'].includes(target.rol)) {
      return json(404, { error: 'Usuario objetivo no disponible' })
    }
    if (target.auth_user_id) return json(409, { error: 'El usuario ya tiene credenciales asociadas' })
  }
  let authId: string
  try { authId = await deps.createIdentity(body, actor.kiosco_id, target?.rol ?? (body.action === 'create_staff' ? body.rol : 'CAJERO')) }
  catch {
    return json(503, { codigo: 'IDENTIDAD_NO_CONFIRMADA', error: 'No se confirmó la creación de la identidad. Revisá Auth antes de reintentar.' })
  }
  let profile: ProvisionProfile | null = null
  try {
    profile = target ? await deps.linkProfile(target, body.email, authId)
      : body.action === 'create_staff' ? await deps.insertProfile(body, actor.kiosco_id, authId) : null
  } catch {
    // A lost response may follow a committed profile. Deleting Auth could cascade-delete that profile.
    return json(503, { codigo: 'RESULTADO_INCIERTO', error: 'No se pudo confirmar la vinculación. Requiere conciliación del administrador; no reintentar automáticamente.' })
  }
  if (!profile) {
    try { await deps.deleteIdentity(authId) }
    catch {
      return json(503, { codigo: 'COMPENSACION_PENDIENTE', error: 'No se confirmó la reversión de la identidad. Requiere conciliación del administrador; no reintentar automáticamente.' })
    }
    return json(409, { error: 'No se pudo vincular el perfil; la identidad creada fue revertida' })
  }
  return json(200, { usuario: profile, id: profile.id })
}
