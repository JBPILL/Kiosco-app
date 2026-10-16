// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { readProvisionRequest, receiveProvisionUser } from '../../supabase/functions/_shared/provisionUserHttp'
import type { ProvisionDependencies, ProvisionProfile } from '../../supabase/functions/_shared/provisionUserHttp'

const kioskId = '10000000-0000-4000-8000-000000000001'
const targetId = '20000000-0000-4000-8000-000000000001'
const origin = 'https://pos.example.test'
const staff = { action: 'create_staff', email: 'staff@example.test', password: 'synthetic-test-password', nombre: 'Empleado', rol: 'CAJERO' }
const link = { action: 'link_credentials', email: staff.email, password: staff.password, usuarioId: targetId }
const profile: ProvisionProfile = { id: targetId, kiosco_id: kioskId, nombre: 'Empleado', rol: 'CAJERO', activo: true, es_superadmin: false, auth_user_id: null }

function dependencies(): ProvisionDependencies {
  return {
    origins: [origin],
    authenticate: vi.fn().mockResolvedValue({ kiosco_id: kioskId, rol: 'DUEÑO', activo: true, es_superadmin: false }),
    findTarget: vi.fn().mockResolvedValue(profile),
    createIdentity: vi.fn().mockResolvedValue('new-auth-id'),
    insertProfile: vi.fn().mockResolvedValue(profile),
    linkProfile: vi.fn().mockResolvedValue(profile),
    deleteIdentity: vi.fn().mockResolvedValue(undefined),
  }
}
function request(body: unknown = staff, headers: Record<string, string> = {}): Request {
  return new Request('https://edge.example.test/provision-user', {
    method: 'POST', headers: { authorization: 'Bearer synthetic-session', origin, ...headers }, body: JSON.stringify(body),
  })
}
function expectNoWrites(deps: ProvisionDependencies): void {
  expect(deps.createIdentity).not.toHaveBeenCalled()
  expect(deps.insertProfile).not.toHaveBeenCalled()
  expect(deps.linkProfile).not.toHaveBeenCalled()
  expect(deps.deleteIdentity).not.toHaveBeenCalled()
}

describe('provision-user boundary', () => {
  it('normalizes email/name without changing password and accepts exact actions', () => {
    expect(readProvisionRequest({ ...staff, email: ' Staff@Example.test ', nombre: ' Empleado ' })).toEqual(staff)
    expect(readProvisionRequest(link)).toEqual(link)
  })
  it.each([
    null, [], {}, { ...staff, action: 'create_owner' }, { ...staff, rol: 'DUEÑO' },
    { ...staff, rol: 'ENCARGADO' }, { ...staff, es_superadmin: true }, { ...staff, kiosco_id: kioskId },
    { ...staff, usuarioId: targetId }, { ...staff, nombre: null }, { ...staff, nombre: ' ' },
    { ...staff, nombre: 'a'.repeat(121) }, { ...staff, password: null }, { ...staff, password: 'short' },
    { ...staff, password: 'a'.repeat(129) }, { ...staff, email: 'invalid' }, { ...staff, email: 'a'.repeat(255) },
    { ...link, usuarioId: 'invalid' }, { ...link, usuarioId: null }, { ...link, rol: 'VISOR' },
  ])('rejects invalid JSON contract before writes: case %#', async body => {
    const deps = dependencies()
    expect((await receiveProvisionUser(request(body), deps)).status).toBe(400)
    expectNoWrites(deps)
  })
  it('rejects a missing exact key', async () => {
    const deps = dependencies()
    const { nombre: _nombre, ...body } = staff
    expect((await receiveProvisionUser(request(body), deps)).status).toBe(400)
    expectNoWrites(deps)
  })
  it('bounds actual streamed bytes independently of Content-Length', async () => {
    const deps = dependencies()
    const req = new Request('https://edge.example.test', { method: 'POST', headers: { authorization: 'Bearer test', origin }, body: ' '.repeat(8192) + JSON.stringify(staff) })
    expect((await receiveProvisionUser(req, deps)).status).toBe(400)
    expectNoWrites(deps)
  })
  it('rejects malformed JSON', async () => {
    const deps = dependencies()
    const req = new Request('https://edge.example.test', { method: 'POST', headers: { authorization: 'Bearer test' }, body: '{' })
    expect((await receiveProvisionUser(req, deps)).status).toBe(400)
    expectNoWrites(deps)
  })
  it('denies foreign origins before authentication and never reflects them', async () => {
    const deps = dependencies()
    const res = await receiveProvisionUser(request(staff, { origin: 'https://evil.example.test' }), deps)
    expect(res.status).toBe(403)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(deps.authenticate).not.toHaveBeenCalled()
    expectNoWrites(deps)
  })
  it('fails closed for browser requests with an empty allowlist', async () => {
    const deps = dependencies(); deps.origins = []
    expect((await receiveProvisionUser(request(), deps)).status).toBe(403)
    expectNoWrites(deps)
  })
  it('permits an allowed preflight without authentication or writes', async () => {
    const deps = dependencies()
    const res = await receiveProvisionUser(new Request('https://edge.example.test', { method: 'OPTIONS', headers: { origin } }), deps)
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(origin)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('vary')).toBe('Origin')
    expect(deps.authenticate).not.toHaveBeenCalled()
    expectNoWrites(deps)
  })
  it.each(['', 'Basic test', 'Bearer two tokens'])('rejects invalid authorization: %#', async authorization => {
    const deps = dependencies()
    expect((await receiveProvisionUser(request(staff, { authorization }), deps)).status).toBe(401)
    expectNoWrites(deps)
  })
  it('rejects unsupported methods', async () => {
    const deps = dependencies()
    expect((await receiveProvisionUser(new Request('https://edge.example.test'), deps)).status).toBe(405)
    expectNoWrites(deps)
  })
  it('rejects missing Auth identity or profile', async () => {
    const deps = dependencies(); vi.mocked(deps.authenticate).mockResolvedValue(null)
    expect((await receiveProvisionUser(request(), deps)).status).toBe(401)
    expectNoWrites(deps)
  })
  it('returns unavailable on authentication failure without leaking error details', async () => {
    const deps = dependencies(); vi.mocked(deps.authenticate).mockRejectedValue(new Error('sensitive detail'))
    const res = await receiveProvisionUser(request(), deps)
    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('sensitive detail')
    expectNoWrites(deps)
  })
  it.each([
    { rol: 'CAJERO' }, { rol: 'VISOR' }, { rol: 'ENCARGADO' }, { activo: false },
    { kiosco_id: null }, { es_superadmin: true, rol: 'VISOR', kiosco_id: null },
  ])('rejects unauthorized or tenantless actors: %#', async changes => {
    const deps = dependencies()
    vi.mocked(deps.authenticate).mockResolvedValue({ kiosco_id: kioskId, rol: 'DUEÑO', activo: true, es_superadmin: false, ...changes })
    expect((await receiveProvisionUser(request(), deps)).status).toBe(403)
    expectNoWrites(deps)
  })
  it.each(['CAJERO', 'VISOR'])('creates only allowed staff role %s', async rol => {
    const deps = dependencies()
    expect((await receiveProvisionUser(request({ ...staff, rol }), deps)).status).toBe(200)
    expect(deps.createIdentity).toHaveBeenCalledWith({ ...staff, rol }, kioskId, rol)
    expect(deps.deleteIdentity).not.toHaveBeenCalled()
  })
  it.each([
    null, { ...profile, kiosco_id: targetId }, { ...profile, activo: false }, { ...profile, es_superadmin: true },
  ])('rejects foreign/inactive/global target: %#', async target => {
    const deps = dependencies(); vi.mocked(deps.findTarget).mockResolvedValue(target)
    expect((await receiveProvisionUser(request(link), deps)).status).toBe(404)
    expectNoWrites(deps)
  })
  it('does not replace existing credentials', async () => {
    const deps = dependencies(); vi.mocked(deps.findTarget).mockResolvedValue({ ...profile, auth_user_id: 'existing' })
    expect((await receiveProvisionUser(request(link), deps)).status).toBe(409)
    expectNoWrites(deps)
  })
  it('preserves the existing owner role when linking credentials', async () => {
    const deps = dependencies(); vi.mocked(deps.findTarget).mockResolvedValue({ ...profile, rol: 'DUEÑO' })
    expect((await receiveProvisionUser(request(link), deps)).status).toBe(200)
    expect(deps.createIdentity).toHaveBeenCalledWith(link, kioskId, 'DUEÑO')
  })
  it('compensates only its own identity on a definitive rejected write', async () => {
    const deps = dependencies(); vi.mocked(deps.linkProfile).mockResolvedValue(null)
    expect((await receiveProvisionUser(request(link), deps)).status).toBe(409)
    expect(deps.deleteIdentity).toHaveBeenCalledExactlyOnceWith('new-auth-id')
  })
  it('does not create Auth when target lookup fails', async () => {
    const deps = dependencies(); vi.mocked(deps.findTarget).mockRejectedValue(new Error('database unavailable'))
    expect((await receiveProvisionUser(request(link), deps)).status).toBe(503)
    expectNoWrites(deps)
  })
  it('preserves an unknown Auth result and does not write or delete a profile', async () => {
    const deps = dependencies(); vi.mocked(deps.createIdentity).mockRejectedValue(new Error('response lost'))
    const res = await receiveProvisionUser(request(), deps)
    expect(res.status).toBe(503)
    expect((await res.json()).codigo).toBe('IDENTIDAD_NO_CONFIRMADA')
    expect(deps.insertProfile).not.toHaveBeenCalled()
    expect(deps.deleteIdentity).not.toHaveBeenCalled()
  })
  it('does not delete Auth after an ambiguous new profile commit', async () => {
    const deps = dependencies(); vi.mocked(deps.insertProfile).mockRejectedValue(new Error('response lost'))
    const res = await receiveProvisionUser(request(), deps)
    expect(res.status).toBe(503)
    expect((await res.json()).codigo).toBe('RESULTADO_INCIERTO')
    expect(deps.deleteIdentity).not.toHaveBeenCalled()
  })
  it('does not delete Auth after an ambiguous profile commit', async () => {
    const deps = dependencies(); vi.mocked(deps.linkProfile).mockRejectedValue(new Error('response lost'))
    const res = await receiveProvisionUser(request(link), deps)
    expect(res.status).toBe(503)
    expect((await res.json()).codigo).toBe('RESULTADO_INCIERTO')
    expect(deps.deleteIdentity).not.toHaveBeenCalled()
  })
  it('reports failed compensation explicitly without sensitive details or retries', async () => {
    const deps = dependencies(); vi.mocked(deps.insertProfile).mockResolvedValue(null)
    vi.mocked(deps.deleteIdentity).mockRejectedValue(new Error('sensitive detail'))
    const res = await receiveProvisionUser(request(), deps)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.codigo).toBe('COMPENSACION_PENDIENTE')
    expect(JSON.stringify(body)).not.toContain('sensitive detail')
    expect(deps.createIdentity).toHaveBeenCalledTimes(1)
    expect(deps.deleteIdentity).toHaveBeenCalledTimes(1)
  })
})

describe('deployed adapter compare-and-set', () => {
  it('two simultaneous links preserve one winner and compensate only the loser', async () => {
    const source = readFileSync('supabase/functions/provision-user/index.ts', 'utf8').replace(/^import .*\r?\n/gm, '')
    let handler: (req: Request) => Promise<Response> = async () => new Response(null, { status: 500 })
    let linkedAuth: string | null = null
    let created = 0
    const deleted: string[] = []
    const admin = {
      auth: { admin: {
        createUser: async () => ({ data: { user: { id: `identity-${++created}` } }, error: null }),
        deleteUser: async (id: string) => { deleted.push(id); return { error: null } },
      } },
      from: () => {
        const filters = new Map<string, unknown>()
        let update: { auth_user_id: string } | null = null
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => { filters.set(column, value); return query },
          is: (column: string, value: unknown) => { filters.set(column, value); return query },
          update: (value: { auth_user_id: string }) => { update = value; return query },
          maybeSingle: async () => {
            if (update) {
              expect(filters.get('id')).toBe(targetId)
              expect(filters.get('kiosco_id')).toBe(kioskId)
              expect(filters.get('activo')).toBe(true)
              expect(filters.get('es_superadmin')).toBe(false)
              expect(filters.get('rol')).toBe('CAJERO')
              expect(filters.has('auth_user_id')).toBe(true)
              expect(filters.get('auth_user_id')).toBeNull()
              if (linkedAuth) return { data: null, error: null }
              linkedAuth = update.auth_user_id
              return { data: profile, error: null }
            }
            return { data: filters.has('auth_user_id')
              ? { kiosco_id: kioskId, rol: 'DUEÑO', activo: true, es_superadmin: false } : { ...profile }, error: null }
          },
        }
        return query
      },
    }
    const caller = { auth: { getUser: async () => ({ data: { user: { id: 'caller' } }, error: null }) } }
    // Execute only the repository adapter, replacing Deno/SDK entrypoints with test doubles.
    new Function('serve', 'createClient', 'Deno', 'readSupabaseSecretKey', 'readSupabasePublishableKey', 'receiveProvisionUser', source)(
      (callback: typeof handler) => { handler = callback },
      (_url: string, key: string) => key === 'synthetic-secret' ? admin : caller,
      { env: { get: (name: string) => name === 'CHECKOUT_ALLOWED_ORIGINS' ? origin : 'https://api.example.test' } },
      () => 'synthetic-secret', () => 'synthetic-public', receiveProvisionUser,
    )
    const responses = await Promise.all([handler(request(link)), handler(request({ ...link, email: 'other@example.test' }))])
    expect(responses.map(res => res.status).sort()).toEqual([200, 409])
    expect(created).toBe(2)
    expect(deleted).toHaveLength(1)
    expect(deleted[0]).not.toBe(linkedAuth)
  })
})
