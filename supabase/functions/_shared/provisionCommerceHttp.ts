export interface CommerceBody {
  operacionId: string; email: string; password: string; nombreDueno: string
  nombreKiosco: string; direccion: string; telefono: string; rubro: string
  planId: string; diasValidez: number
}
export interface CommerceReservation {
  estado: string; claimed?: boolean; auth_user_id?: string | null
  resultado?: Record<string, unknown> | null
}
export class CommerceFailure extends Error {
  readonly definite: boolean
  constructor(definite: boolean) { super('Fallo de provisioning'); this.definite = definite }
}
export interface CommerceDependencies {
  allowedOrigins: readonly string[]
  authenticate: (token: string) => Promise<{ authId: string; superadmin: boolean } | null>
  reserve: (actor: string, body: Omit<CommerceBody, 'password'>, hash: string) => Promise<CommerceReservation>
  createAuth: (body: CommerceBody) => Promise<string>
  transition: (op: string, actor: string, action: string, authId?: string) => Promise<CommerceReservation>
  finalize: (op: string, actor: string) => Promise<Record<string, unknown>>
  deleteAuth: (id: string) => Promise<void>
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
export function validateCommerceBody(value: unknown): CommerceBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('body')
  const b = value as Record<string, unknown>
  const allowed = ['operacionId', 'email', 'password', 'nombreDueno', 'nombreKiosco', 'direccion', 'telefono', 'rubro', 'planId', 'diasValidez']
  if (Object.keys(b).some(k => !allowed.includes(k))) throw new Error('extra')
  const field = (key: string, max: number, optional = false): string => {
    if (optional && b[key] === undefined) return ''
    if (typeof b[key] !== 'string') throw new Error(key)
    const v = (b[key] as string).trim()
    if ((!optional && !v) || v.length > max) throw new Error(key)
    return v
  }
  const operacionId = field('operacionId', 36), planId = field('planId', 36)
  const email = field('email', 254).toLowerCase()
  const rubro = b.rubro === undefined ? 'KIOSCO' : field('rubro', 40)
  if (!uuid.test(operacionId) || !uuid.test(planId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !['KIOSCO', 'FOTOCOPIADORA_LIBRERIA', 'GENERAL', 'PETSHOP_VETERINARIA', 'ELECTRONICA_CELULARES', 'DIETETICA', 'BAZAR'].includes(rubro)
    || typeof b.password !== 'string' || b.password.length < 12 || b.password.length > 128
    || !Number.isInteger(b.diasValidez) || Number(b.diasValidez) < 1 || Number(b.diasValidez) > 366) throw new Error('invalid')
  return { operacionId, planId, email, password: b.password, rubro, diasValidez: Number(b.diasValidez),
    nombreDueno: field('nombreDueno', 120), nombreKiosco: field('nombreKiosco', 120),
    direccion: field('direccion', 250, true), telefono: field('telefono', 40, true) }
}
async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('type')
  const reader = request.body?.getReader()
  if (!reader) throw new Error('body')
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 8192) { await reader.cancel(); throw new Error('size') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const all = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length }
  return JSON.parse(new TextDecoder().decode(all))
}
export async function provisionCommerceHttp(request: Request, deps: CommerceDependencies): Promise<Response> {
  const origin = request.headers.get('origin')
  const headers = { 'content-type': 'application/json', 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...(origin && deps.allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}) }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
  if (!deps.allowedOrigins.length) return json({ error: 'Servicio no configurado' }, 503)
  if (origin && !deps.allowedOrigins.includes(origin)) return json({ error: 'Origen no permitido' }, 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const token = request.headers.get('authorization')?.match(/^Bearer\s+([^\s]+)$/i)?.[1]
  if (!token) return json({ error: 'Autenticación requerida' }, 401)
  let actor: { authId: string; superadmin: boolean } | null
  try { actor = await deps.authenticate(token) } catch { return json({ error: 'Autenticación no disponible' }, 503) }
  if (!actor) return json({ error: 'Sesión inválida' }, 401)
  if (!actor.superadmin) return json({ error: 'Sólo SuperAdmin puede crear comercios' }, 403)
  let body: CommerceBody
  try { body = validateCommerceBody(await readBody(request)) } catch { return json({ error: 'Solicitud inválida' }, 400) }
  const { password: _password, ...safeBody } = body
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body)))
  const hash = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('')
  let reservation: CommerceReservation
  try { reservation = await deps.reserve(actor.authId, safeBody, hash) }
  catch { return json({ error: 'No se pudo reservar la operación; revisar solicitud y permisos' }, 409) }
  if (reservation.estado === 'PASS' && reservation.resultado) return json(reservation.resultado)
  if (!reservation.claimed && reservation.estado !== 'AUTH_READY') {
    return json({ error: 'Operación pendiente o fallida: requiere conciliación administrativa', operacionId: body.operacionId }, 409)
  }
  let authId = reservation.auth_user_id ?? undefined
  if (reservation.claimed) {
    try {
      authId = await deps.createAuth(body)
      await deps.transition(body.operacionId, actor.authId, 'AUTH_READY', authId)
    } catch (error) {
      // An uncertain Auth/DB response must never trigger blind creation/deletion.
      try { await deps.transition(body.operacionId, actor.authId,
        !authId && error instanceof CommerceFailure && error.definite ? 'FAILED' : 'UNCERTAIN') } catch { /* durable claim remains */ }
      return json({ error: 'Alta no confirmada; requiere conciliación administrativa', operacionId: body.operacionId }, 503)
    }
  }
  try { return json(await deps.finalize(body.operacionId, actor.authId)) }
  catch (error) {
    if (!(error instanceof CommerceFailure && error.definite) || !authId) {
      try {
        const state = await deps.transition(body.operacionId, actor.authId, 'UNCERTAIN')
        if (state.estado === 'PASS' && state.resultado) return json(state.resultado)
      } catch { /* never infer rollback from a transport error */ }
      return json({ error: 'Respuesta incierta; no se eliminó la identidad. Conciliación requerida', operacionId: body.operacionId }, 503)
    }
    try {
      const claim = await deps.transition(body.operacionId, actor.authId, 'COMPENSATING', authId)
      if (claim.estado === 'PASS' && claim.resultado) return json(claim.resultado)
      if (claim.estado !== 'COMPENSATING') throw new Error('state')
      try {
        await deps.deleteAuth(authId)
        await deps.transition(body.operacionId, actor.authId, 'FAILED', authId)
      } catch {
        await deps.transition(body.operacionId, actor.authId, 'TAINTED', authId)
        return json({ error: 'Compensación no confirmada; operación TAINTED. No reintentar automáticamente', operacionId: body.operacionId }, 409)
      }
      return json({ error: 'Alta revertida tras fallo confirmado de perfil', operacionId: body.operacionId }, 409)
    } catch { return json({ error: 'Conciliación requerida; no se confirmó compensación', operacionId: body.operacionId }, 409) }
  }
}
