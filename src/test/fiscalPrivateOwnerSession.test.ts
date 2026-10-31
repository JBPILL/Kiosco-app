// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { authenticatePrivateOwner } from '../../scripts/fiscal-private-owner-session.mjs'
import { positivePlanFixture } from './fixtures/fiscalPositivePlan'
import { planFiscalPositiveAcceptance } from '../../scripts/plan-fiscal-positive-acceptance.mjs'
const base = 'https://acoyfwwmhaeruciyedri.supabase.co'
const stamp = Date.parse('2026-10-28T15:00:00Z')
function jwt(claims: Record<string, unknown>, alg = 'ES256') {
  return [Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify(claims)).toString('base64url'), 'synthetic_signature'].join('.')
}
function fixture() {
  const owner = randomUUID(), kiosk = randomUUID()
  const claims = { sub: owner, iss: base + '/auth/v1', aud: 'authenticated', role: 'authenticated', iat: stamp / 1000, exp: stamp / 1000 + 3600 }
  const state = { token: jwt(claims), userId: owner, profile: { auth_user_id: owner, kiosco_id: kiosk, rol: 'DUEÑO', activo: true, es_superadmin: false }, logout: 204,
    edgeStatus: 503, edgeResult: null as unknown }
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const path = String(url)
    expect(path.startsWith(base + '/')).toBe(true)
    expect(init?.redirect).toBe('error')
    const headers = init?.headers as Record<string, string>
    expect(headers.apikey).toBe(input.publicKey)
    if (path.endsWith('/token?grant_type=password')) {
      expect(headers.Authorization).toBeUndefined()
      return Response.json({ access_token: state.token, refresh_token: 'synthetic_not_retained' })
    }
    expect(headers.Authorization).toBe('Bearer ' + state.token)
    if (path.endsWith('/auth/v1/user')) return Response.json({ id: state.userId })
    if (path.includes('/rest/v1/usuarios?')) return Response.json([state.profile])
    if (path.endsWith('/logout?scope=local')) return new Response(null, { status: state.logout })
    if (path.endsWith('/functions/v1/arca-homologacion')) {
      expect(new Headers(init?.headers).get('origin')).toBe('https://kiosco-app-staging.vercel.app')
      return state.edgeStatus === 503
        ? Response.json({ codigo: 'HOMOLOGACION_NO_HABILITADA' }, { status: 503 })
        : Response.json({ version: 1, entorno: 'HOMOLOGACION', emision_habilitada: false, resultado: state.edgeResult }, { status: state.edgeStatus })
    }
    throw Error('unexpected request')
  })
  const input = { email: 'synthetic@example.test', password: 'synthetic_password_only', publicKey: 'sb_publishable_synthetic', expectedOwnerAuthId: owner, expectedKioskId: kiosk }
  return { state, claims, input, fetcher, options: { fetcher, now: () => stamp } }
}

it('checks actual /user then exact active Owner profile, and returns no authentication material', async () => {
  const { input, options, fetcher, state } = fixture()
  const session = await authenticatePrivateOwner(input, options)
  expect(fetcher.mock.calls.map(([url]) => String(url).split('?')[0])).toEqual([
    base + '/auth/v1/token', base + '/auth/v1/user', base + '/rest/v1/usuarios',
  ])
  expect(await session.checkOwner()).toEqual({ ownerAuthId: input.expectedOwnerAuthId, kioskId: input.expectedKioskId })
  expect(JSON.stringify(session)).not.toContain(state.token)
  expect(JSON.stringify(session)).not.toContain(input.password)
  expect(await session.logoutLocal()).toEqual({ localLogoutConfirmed: true })
  await expect(session.checkOwner()).rejects.toThrow('PRIVATE_OWNER_SESSION_CLOSED')
  await expect(session.logoutLocal()).rejects.toThrow('PRIVATE_OWNER_LOGOUT_ALREADY_ATTEMPTED')
})

it.each(['expired', 'future', 'issuer', 'subject', 'role', 'audience', 'unsigned', 'malformed'])('rejects %s JWT and closes only that login session', async mode => {
  const { claims, state, input, options, fetcher } = fixture()
  if (mode === 'expired') claims.exp = stamp / 1000
  if (mode === 'future') claims.iat = stamp / 1000 + 60
  if (mode === 'issuer') claims.iss = 'https://other-project.example/auth/v1'
  if (mode === 'subject') claims.sub = randomUUID()
  if (mode === 'role') claims.role = 'service_role'
  if (mode === 'audience') claims.aud = 'anon'
  state.token = mode === 'malformed' ? 'invalid-token' : jwt(claims, mode === 'unsigned' ? 'none' : 'ES256')
  await expect(authenticatePrivateOwner(input, options)).rejects.toThrow('PRIVATE_OWNER_JWT_REJECTED')
  expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
    base + '/auth/v1/token?grant_type=password', base + '/auth/v1/logout?scope=local',
  ])
})

it('does not treat decoded JWT claims as verified Auth identity', async () => {
  const { state, input, options, fetcher } = fixture()
  state.userId = randomUUID()
  await expect(authenticatePrivateOwner(input, options)).rejects.toThrow('PRIVATE_OWNER_AUTH_NOT_CONFIRMED')
  expect(fetcher.mock.calls.some(([url]) => String(url).includes('/rest/v1/'))).toBe(false)
  expect(fetcher.mock.calls.at(-1)?.[0]).toBe(base + '/auth/v1/logout?scope=local')
})

it.each(['kiosk', 'cashier', 'inactive', 'superadmin', 'actor'])('rejects %s profile and still logs out locally', async mode => {
  const { state, input, options, fetcher } = fixture()
  if (mode === 'kiosk') state.profile.kiosco_id = randomUUID()
  if (mode === 'actor') state.profile.auth_user_id = randomUUID()
  if (mode === 'cashier') state.profile.rol = 'CAJERO'
  if (mode === 'inactive') state.profile.activo = false
  if (mode === 'superadmin') state.profile.es_superadmin = true
  await expect(authenticatePrivateOwner(input, options)).rejects.toThrow('PRIVATE_OWNER_PROFILE_NOT_CONFIRMED')
  expect(fetcher.mock.calls.at(-1)?.[0]).toBe(base + '/auth/v1/logout?scope=local')
})

it('rechecks /user and profile rather than caching privileges for the window', async () => {
  const { state, input, options } = fixture()
  const session = await authenticatePrivateOwner(input, options)
  state.profile.activo = false
  await expect(session.checkOwner()).rejects.toThrow('PRIVATE_OWNER_PROFILE_NOT_CONFIRMED')
  await session.logoutLocal()
})

it('does not report confirmed logout on a network or server failure', async () => {
  const { state, input, options } = fixture()
  const session = await authenticatePrivateOwner(input, options)
  state.logout = 500
  await expect(session.logoutLocal()).rejects.toThrow('PRIVATE_OWNER_LOGOUT_NOT_CONFIRMED')
  await expect(session.checkOwner()).rejects.toThrow('PRIVATE_OWNER_SESSION_CLOSED')
})

it('sanitizes uncertain login failures and never retries automatically', async () => {
  const { input } = fixture()
  const fetcher = vi.fn<typeof fetch>(async () => { throw Error('private payload that must not escape') })
  await expect(authenticatePrivateOwner(input, { fetcher, now: () => stamp })).rejects.toThrow('PRIVATE_OWNER_NETWORK_UNCERTAIN')
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it.each(['sb_secret_forbidden', 'service_role', 'Bearer forbidden', ''])('rejects private/malformed key %s before a request', async key => {
  const { input, options, fetcher } = fixture()
  await expect(authenticatePrivateOwner({ ...input, publicKey: key }, options)).rejects.toThrow('PRIVATE_OWNER_INPUT_REJECTED')
  expect(fetcher).not.toHaveBeenCalled()
})

it('also accepts the public legacy anon key of this exact Staging, independently of Owner authentication', async () => {
  const { input, options } = fixture()
  input.publicKey = jwt({ iss: 'supabase', role: 'anon', ref: 'acoyfwwmhaeruciyedri', exp: stamp / 1000 + 3600 }, 'HS256')
  const session = await authenticatePrivateOwner(input, options)
  await session.logoutLocal()
})

it.each(['service-role', 'foreign-project', 'expired'])('rejects %s legacy API key before sending the password', async mode => {
  const { input, options, fetcher } = fixture()
  input.publicKey = jwt({ iss: 'supabase', role: mode === 'service-role' ? 'service_role' : 'anon', ref: mode === 'foreign-project' ? 'another-project' : 'acoyfwwmhaeruciyedri', exp: stamp / 1000 + (mode === 'expired' ? -1 : 3600) }, 'HS256')
  await expect(authenticatePrivateOwner(input, options)).rejects.toThrow('PRIVATE_OWNER_INPUT_REJECTED')
  expect(fetcher).not.toHaveBeenCalled()
})

it('only sends an exact reviewed command, pinned before the asynchronous Auth recheck', async () => {
  const f = fixture(), plan = await planFiscalPositiveAcceptance(positivePlanFixture().config)
  const session = await authenticatePrivateOwner(f.input, { ...f.options, approvedRequests: plan.requests })
  f.state.edgeStatus = 200; f.state.edgeResult = { safeResult: true }
  const command: Record<string, unknown> = { ...plan.requests[0] }
  const pending = session.callPreparation(command)
  command.accion = 'ENVIAR'
  expect(await pending).toEqual({ safeResult: true })
  expect(JSON.parse(String(f.fetcher.mock.calls.at(-1)?.[1]?.body))).toEqual(plan.requests[0])
  const previousCalls = f.fetcher.mock.calls.length
  await expect(session.callPreparation(command)).rejects.toThrow('PRIVATE_PREPARATION_REQUEST_REJECTED')
  expect(f.fetcher).toHaveBeenCalledTimes(previousCalls)
  await session.logoutLocal()
})

it('does not accept approval/send actions in the reviewed preparation capability', async () => {
  const f = fixture(), plan = await planFiscalPositiveAcceptance(positivePlanFixture().config)
  const requests = plan.requests.map(command => ({ ...command }))
  requests[4] = { accion: 'APROBAR_REVISION', operacion_id: requests[3].operacion_id }
  await expect(authenticatePrivateOwner(f.input, { ...f.options, approvedRequests: requests })).rejects.toThrow('PRIVATE_PREPARATION_REQUEST_REJECTED')
  expect(f.fetcher).not.toHaveBeenCalled()
})

it('logs out locally before its final closed-backend probe, without exposing or refreshing the JWT', async () => {
  const f = fixture(), session = await authenticatePrivateOwner(f.input, f.options)
  expect(await session.probeBackendClosed()).toEqual({ backendClosed503: true })
  expect(await session.logoutAndVerifyClosed()).toEqual({ localLogoutConfirmed: true, backendClosed503: true })
  expect(f.fetcher.mock.calls.slice(-2).map(([url]) => String(url))).toEqual([
    base + '/auth/v1/logout?scope=local', base + '/functions/v1/arca-homologacion',
  ])
  expect(f.fetcher.mock.calls.at(-1)?.[1]?.body).toBe('{}')
  await expect(session.probeBackendClosed()).rejects.toThrow('PRIVATE_OWNER_SESSION_CLOSED')
})

it('does not weaken gateway checks or retry if the post-logout probe gets 401', async () => {
  const f = fixture(), session = await authenticatePrivateOwner(f.input, f.options)
  f.state.edgeStatus = 401
  await expect(session.logoutAndVerifyClosed()).rejects.toThrow('PRIVATE_BACKEND_CLOSED_NOT_CONFIRMED')
  await expect(session.logoutAndVerifyClosed()).rejects.toThrow('PRIVATE_OWNER_LOGOUT_ALREADY_ATTEMPTED')
  expect(f.fetcher.mock.calls.filter(([url]) => String(url).includes('/functions/'))).toHaveLength(1)
  await expect(session.checkOwner()).rejects.toThrow('PRIVATE_OWNER_SESSION_CLOSED')
})
