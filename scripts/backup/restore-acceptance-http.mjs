// Private fixed-route transport; no CLI, login/password reader, ambient fetch or env access.
import { loadRestorePlan, PLAN_HASH, valueHash } from './restore-acceptance-engine.mjs'
const target = 'https://acoyfwwmhaeruciyedri.supabase.co'
const origin = 'https://kiosco-app-staging.vercel.app'
const plan = loadRestorePlan(), uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const error = code => { throw Error(code) }
function claims(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) } catch { return null }
}
async function boundedBody(response) {
  if (!response.body?.getReader) error('RESTORE_HTTP_BODY_UNAVAILABLE')
  let reader
  try { reader = response.body.getReader() } catch { error('RESTORE_HTTP_BODY_UNAVAILABLE') }
  const chunks = []
  let length = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > 4096) error('RESTORE_HTTP_BODY_TOO_LARGE')
      chunks.push(part.value)
    }
  } catch (caught) {
    try { await reader.cancel() } catch { /* Never publish cancellation errors. */ }
    if (caught?.message === 'RESTORE_HTTP_BODY_TOO_LARGE') error('RESTORE_HTTP_BODY_TOO_LARGE')
    error('RESTORE_HTTP_BODY_UNAVAILABLE')
  } finally { reader.releaseLock() }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)) } catch { error('RESTORE_HTTP_BODY_INVALID') }
}
export function createRestoreHttpClient(config, request) {
  const { publicKey, jwt, authId, role, allowMutations = false, reviewedPlanHash } = config ?? {}
  const session = typeof jwt === 'string' && jwt.length <= 16400 ? claims(jwt) : null
  const publicClaims = typeof publicKey === 'string' && publicKey.length <= 4096 ? claims(publicKey) : null
  if (typeof request !== 'function' || !uuid.test(authId) || !['OWNER', 'CASHIER'].includes(role)
    || typeof jwt !== 'string' || jwt.length > 16400 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt)
    || session?.role !== 'authenticated' || session.sub !== authId || session.iss !== target + '/auth/v1'
    || !(typeof publicKey === 'string' && publicKey.length <= 4096 && ( /^sb_publishable_[A-Za-z0-9_-]{10,200}$/.test(publicKey)
      || publicClaims?.role === 'anon' && publicClaims.ref === 'acoyfwwmhaeruciyedri' ))
    || ![true, false].includes(allowMutations) || allowMutations && reviewedPlanHash !== PLAN_HASH) error('RESTORE_HTTP_CONFIG_INVALID')
  // Claims only reject obvious wrong context. The Auth API below verifies identity.
  let verified = null, closed = false
  const headers = Object.freeze({ apikey: publicKey, Authorization: 'Bearer ' + jwt, Origin: origin })
  async function send(path, method = 'GET', body) {
    let response
    try {
      response = await request(target + path, {
        method, headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15000),
      })
    } catch { error('RESTORE_HTTP_UNAVAILABLE') }
    if (response.status === 204) return { status: 204, data: null }
    const text = await boundedBody(response)
    let data
    try { data = JSON.parse(text) } catch { error('RESTORE_HTTP_JSON_INVALID') }
    return { status: response.status, data }
  }
  function requireOpen() { if (closed) error('RESTORE_HTTP_SESSION_CLOSED') }
  return Object.freeze({
    async verifyIdentity() {
      requireOpen()
      if (verified) return verified
      const identity = await send('/auth/v1/user')
      if (identity.status !== 200 || identity.data?.id !== authId || identity.data.role !== 'authenticated') error('RESTORE_HTTP_IDENTITY_NOT_CONFIRMED')
      const profile = await send('/rest/v1/usuarios?select=id,auth_user_id,kiosco_id,rol,activo,es_superadmin&auth_user_id=eq.' + authId + '&limit=2')
      const rows = profile.data, expectedRole = role === 'OWNER' ? 'DUE\u00d1O' : 'CAJERO'
      if (profile.status !== 200 || !Array.isArray(rows) || rows.length !== 1 || !uuid.test(rows[0].id)
        || rows[0].auth_user_id !== authId || rows[0].rol !== expectedRole || rows[0].activo !== true
        || rows[0].es_superadmin !== false || rows[0].kiosco_id !== plan.kioskId) error('RESTORE_HTTP_PROFILE_NOT_CONFIRMED')
      verified = Object.freeze({ role, authId, kioskId: plan.kioskId, profileId: rows[0].id })
      return verified
    },
    async requestPlannedRpc(rpc, params) {
      requireOpen()
      if (!verified) error('RESTORE_HTTP_IDENTITY_REQUIRED')
      if (!allowMutations) error('RESTORE_HTTP_MUTATIONS_CLOSED')
      const allowed = role === 'OWNER' ? plan.steps : plan.cashierDeniedCalls
      if (!allowed.some(step => step.rpc === rpc && valueHash(step.params) === valueHash(params))) error('RESTORE_HTTP_REQUEST_NOT_IN_PLAN')
      return send('/rest/v1/rpc/' + rpc, 'POST', params)
    },
    async logoutLocal() {
      requireOpen(); closed = true
      const reply = await send('/auth/v1/logout?scope=local', 'POST')
      if (![200, 204].includes(reply.status)) error('RESTORE_HTTP_LOGOUT_NOT_CONFIRMED')
      return { logoutLocalConfirmed: true }
    },
  })
}
