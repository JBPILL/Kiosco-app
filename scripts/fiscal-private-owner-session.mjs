// Private terminal runtime only. Credentials/JWT are retained in memory, never
// returned, logged, placed in a URL or persisted. No browser import permitted.
import { Buffer } from 'node:buffer'
const base = 'https://acoyfwwmhaeruciyedri.supabase.co'
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)
const fail = code => { throw Error(code) }

function publicApiKey(value, now) {
  if (typeof value !== 'string' || value.length > 4096) return false
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true
  try {
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return false
    const [header, claims] = value.split('.').slice(0, 2).map(part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')))
    // A public API key is not actor authentication. Reject service_role and
    // foreign-project keys before transmitting any Owner credentials.
    return header.alg === 'HS256' && claims.iss === 'supabase' && claims.role === 'anon'
      && claims.ref === 'acoyfwwmhaeruciyedri' && Number.isSafeInteger(claims.exp) && claims.exp * 1000 > now
  } catch { return false }
}

function tokenClaims(token, expectedId, now) {
  try {
    if (typeof token !== 'string' || token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw Error()
    const [header, claims] = token.split('.').slice(0, 2).map(part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')))
    // These checks are rejection policy, NOT cryptographic authentication.
    // Every use still requires successful Auth /user and exact active profile.
    if (!['ES256', 'RS256', 'HS256'].includes(header.alg) || claims.iss !== base + '/auth/v1'
      || claims.sub !== expectedId || claims.role !== 'authenticated'
      || !(claims.aud === 'authenticated' || Array.isArray(claims.aud) && claims.aud.length === 1 && claims.aud[0] === 'authenticated')
      || !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= now + 30000
      || !Number.isSafeInteger(claims.iat) || claims.iat * 1000 > now + 30000
      || claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf * 1000 > now)) throw Error()
  } catch { fail('PRIVATE_OWNER_JWT_REJECTED') }
}

async function limitedJson(response) {
  if (!response.body || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) fail('PRIVATE_OWNER_RESPONSE_REJECTED')
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > 65536) fail('PRIVATE_OWNER_RESPONSE_REJECTED')
      chunks.push(next.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch { fail('PRIVATE_OWNER_RESPONSE_REJECTED') }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

/** Network adapter for the future reviewed operator, not an executable CLI.
 * fetcher injection supports synthetic tests. Real execution requires the
 * separately approved private operator; constructing this function logs in.
 */
export async function authenticatePrivateOwner(input, { fetcher = fetch, now = Date.now, approvedRequests = [] } = {}) {
  if (!input || Object.keys(input).sort().join(',') !== 'email,expectedKioskId,expectedOwnerAuthId,password,publicKey'
    || !uuid(input.expectedOwnerAuthId) || !uuid(input.expectedKioskId)
    || typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
    || typeof input.password !== 'string' || input.password.length < 1 || input.password.length > 1024
    || !publicApiKey(input.publicKey, now())) fail('PRIVATE_OWNER_INPUT_REJECTED')
  // Accept only public publishable/anon keys, never service_role/secret keys.
  const identity = Object.freeze({ ownerAuthId: input.expectedOwnerAuthId, kioskId: input.expectedKioskId })
  const key = input.publicKey
  const approved = new Set()
  // Only exact reviewed preparation requests, copied before authentication.
  // No arbitrary RPC, approval, send, reconciliation or commercial action.
  const actions = ['RESOLVER_VENTA', 'DATOS_FISCALES_VENTA', 'GUARDAR_DATOS_FISCALES', 'PREPARAR_COMPROBANTE', 'REVISAR_COMPROBANTE']
  if (!Array.isArray(approvedRequests) || ![0, 5].includes(approvedRequests.length)) fail('PRIVATE_PREPARATION_REQUEST_REJECTED')
  for (const [index, command] of approvedRequests.entries()) {
    const keys = index < 2 ? ['accion', 'venta_id'] : index === 2 ? ['accion', 'venta_id', 'operacion_id', 'entrada'] : ['accion', 'operacion_id']
    if (!command || command.accion !== actions[index] || Object.keys(command).length !== keys.length
      || keys.some(key => !Object.hasOwn(command, key)) || JSON.stringify(command).length > 4096
      || index < 3 && !uuid(command.venta_id) || index >= 2 && !uuid(command.operacion_id)
      || index === 2 && (!command.entrada || typeof command.entrada !== 'object' || Array.isArray(command.entrada))
      || index > 0 && index < 3 && command.venta_id !== approvedRequests[0].venta_id
      || index > 2 && command.operacion_id !== approvedRequests[2].operacion_id) fail('PRIVATE_PREPARATION_REQUEST_REJECTED')
    approved.add(JSON.stringify(command))
  }
  let token = null, ended = false, logoutAttempted = false
  async function request(path, { method = 'GET', body, authenticated = true, timeoutMs = 15000 } = {}) {
    try {
      return await fetcher(base + path, { method, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
        headers: { apikey: key, 'Content-Type': 'application/json',
          ...(path === '/functions/v1/arca-homologacion' ? { Origin: 'https://kiosco-app-staging.vercel.app' } : {}),
          ...(authenticated ? { Authorization: 'Bearer ' + token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    } catch { fail('PRIVATE_OWNER_NETWORK_UNCERTAIN') }
  }
  async function probeBackendClosed() {
    const response = await request('/functions/v1/arca-homologacion', { method: 'POST', body: {} })
    if (response.status !== 503) fail('PRIVATE_BACKEND_CLOSED_NOT_CONFIRMED')
    const value = await limitedJson(response)
    if (!value || Object.keys(value).join(',') !== 'codigo' || value.codigo !== 'HOMOLOGACION_NO_HABILITADA') fail('PRIVATE_BACKEND_CLOSED_NOT_CONFIRMED')
    return Object.freeze({ backendClosed503: true })
  }
  async function logout(verifyClosed) {
    if (logoutAttempted) fail('PRIVATE_OWNER_LOGOUT_ALREADY_ATTEMPTED')
    logoutAttempted = true
    ended = true
    try {
      if (!token) fail('PRIVATE_OWNER_LOGOUT_NOT_CONFIRMED')
      const response = await request('/auth/v1/logout?scope=local', { method: 'POST' })
      if (response.status !== 204) fail('PRIVATE_OWNER_LOGOUT_NOT_CONFIRMED')
      // The old access JWT remains private only for this closed-backend probe.
      // No Auth refresh, no fiscal command and no fallback if gateway rejects it.
      if (verifyClosed) {
        try { await probeBackendClosed() } catch { fail('PRIVATE_BACKEND_CLOSED_NOT_CONFIRMED') }
        return Object.freeze({ localLogoutConfirmed: true, backendClosed503: true })
      }
      return Object.freeze({ localLogoutConfirmed: true })
    } catch (error) {
      if (error?.message === 'PRIVATE_BACKEND_CLOSED_NOT_CONFIRMED') throw error
      fail('PRIVATE_OWNER_LOGOUT_NOT_CONFIRMED')
    }
    finally { token = null }
  }
  async function callPreparation(command) {
    const canonical = JSON.stringify(command)
    if (!approved.has(canonical)) fail('PRIVATE_PREPARATION_REQUEST_REJECTED')
    const reviewedCommand = JSON.parse(canonical)
    await checkOwner()
    // Body preparation can include WSAA + WSFE + durable writes, each bounded
    // independently in the backend. Do not abort it at the Auth request budget.
    const response = await request('/functions/v1/arca-homologacion', { method: 'POST', body: reviewedCommand,
      timeoutMs: reviewedCommand.accion === 'PREPARAR_COMPROBANTE' ? 60000 : 15000 })
    if (response.status !== 200) fail('PRIVATE_PREPARATION_ACTION_NOT_CONFIRMED')
    const value = await limitedJson(response)
    if (!value || Object.keys(value).sort().join(',') !== 'emision_habilitada,entorno,resultado,version'
      || value.version !== 1 || value.entorno !== 'HOMOLOGACION' || value.emision_habilitada !== false) fail('PRIVATE_PREPARATION_ACTION_NOT_CONFIRMED')
    // Domain-specific result validation is performed by the preparation flow
    // before any persistence. Never return the raw HTTP envelope or auth data.
    return value.resultado
  }
  async function checkOwner() {
    if (ended || !token) fail('PRIVATE_OWNER_SESSION_CLOSED')
    tokenClaims(token, identity.ownerAuthId, now())
    const response = await request('/auth/v1/user')
    if (response.status !== 200) fail('PRIVATE_OWNER_AUTH_NOT_CONFIRMED')
    const user = await limitedJson(response)
    if (user?.id !== identity.ownerAuthId || user.is_anonymous === true) fail('PRIVATE_OWNER_AUTH_NOT_CONFIRMED')
    const profileResponse = await request('/rest/v1/usuarios?select=auth_user_id,kiosco_id,rol,activo,es_superadmin&auth_user_id=eq.' + identity.ownerAuthId)
    if (profileResponse.status !== 200) fail('PRIVATE_OWNER_PROFILE_NOT_CONFIRMED')
    const profiles = await limitedJson(profileResponse)
    const profile = profiles?.[0]
    if (!Array.isArray(profiles) || profiles.length !== 1 || !profile
      || Object.keys(profile).sort().join(',') !== 'activo,auth_user_id,es_superadmin,kiosco_id,rol'
      || profile.auth_user_id !== identity.ownerAuthId || profile.kiosco_id !== identity.kioskId
      || profile.rol !== 'DUEÑO' || profile.activo !== true || profile.es_superadmin !== false) fail('PRIVATE_OWNER_PROFILE_NOT_CONFIRMED')
    return identity
  }
  try {
    const response = await request('/auth/v1/token?grant_type=password', {
      method: 'POST', authenticated: false, body: { email: input.email, password: input.password },
    })
    if (response.status !== 200) fail('PRIVATE_OWNER_LOGIN_NOT_CONFIRMED')
    const login = await limitedJson(response)
    if (typeof login?.access_token !== 'string' || login.access_token.length > 16384) fail('PRIVATE_OWNER_LOGIN_NOT_CONFIRMED')
    token = login.access_token
    // Do not retain refresh_token, password, full user or raw login response.
    await checkOwner()
    return Object.freeze({ checkOwner, callPreparation,
      probeBackendClosed: async () => { if (ended) fail('PRIVATE_OWNER_SESSION_CLOSED'); return probeBackendClosed() },
      logoutLocal: () => logout(false), logoutAndVerifyClosed: () => logout(true) })
  } catch (error) {
    // A valid Auth login of the wrong actor must also be logged out locally.
    if (token) {
      try { await logout(false) } catch { fail('PRIVATE_OWNER_FAILURE_LOGOUT_NOT_CONFIRMED') }
    }
    throw error
  }
}
