// Preflight session check for CASHIER role; secrets through stdin, never argv or files.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { loadRestorePlan } from './restore-acceptance-engine.mjs'

export const CASHIER_AUTH_ID = '7cc03499-a91f-4d9b-b1b8-0c37b9d3dfea'
export const CASHIER_EMAIL = 'prueba2@example.test'

export const PREFLIGHT_STAGES = Object.freeze([
  'INPUT',
  'EMAIL_GUARD',
  'PUBLIC_KEY',
  'AUTH_REQUEST',
  'AUTH_HTTP',
  'TOKEN_SUBJECT',
  'AUTH_IDENTITY',
  'PROFILE',
  'LOGOUT_LOCAL',
  'COMPLETE',
])

const target = 'https://acoyfwwmhaeruciyedri.supabase.co'
const origin = 'https://kiosco-app-staging.vercel.app'
const uuidRegex = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const plan = loadRestorePlan()

function claims(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function validPublicKey(key) {
  const data = typeof key === 'string' && key.length <= 4096 ? claims(key) : null
  return (
    typeof key === 'string' &&
    key.length <= 4096 &&
    (/^sb_publishable_[A-Za-z0-9_-]{10,200}$/.test(key) ||
      (data?.role === 'anon' && data?.ref === 'acoyfwwmhaeruciyedri'))
  )
}

async function boundedBody(response) {
  if (response.body?.getReader) {
    const reader = response.body.getReader()
    const chunks = []
    let length = 0
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        length += part.value.byteLength
        if (length > 4096) throw Error('RESTORE_HTTP_BODY_TOO_LARGE')
        chunks.push(part.value)
      }
    } finally {
      reader.releaseLock()
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
  }
  if (typeof response.text === 'function') {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > 4096) throw Error('RESTORE_HTTP_BODY_TOO_LARGE')
    return text
  }
  throw Error('RESTORE_HTTP_BODY_UNAVAILABLE')
}

async function tryLogout(request, publicKey, jwt) {
  try {
    await request(target + '/auth/v1/logout?scope=local', {
      method: 'POST',
      headers: {
        apikey: publicKey,
        Authorization: 'Bearer ' + jwt,
        Origin: origin,
      },
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    // Best-effort cleanup
  }
}

function createStageError(stage, code) {
  const err = Error(code)
  err.stage = stage
  return err
}

export async function runCashierSessionPreflight(credentials, request) {
  if (typeof request !== 'function') {
    throw createStageError('INPUT', 'CASHIER_PREFLIGHT_REQUEST_REQUIRED')
  }
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
    throw createStageError('INPUT', 'CASHIER_PREFLIGHT_INPUT_INVALID')
  }

  const { publicKey, email, password } = credentials

  if (
    typeof password !== 'string' ||
    !password.length ||
    Buffer.byteLength(password, 'utf8') > 1024 ||
    password.includes('\0')
  ) {
    throw createStageError('INPUT', 'CASHIER_PREFLIGHT_PASSWORD_INVALID')
  }

  if (typeof email !== 'string' || email.trim().toLowerCase() !== CASHIER_EMAIL) {
    throw createStageError('EMAIL_GUARD', 'CASHIER_EMAIL_MISMATCH')
  }
  const normalizedEmail = email.trim().toLowerCase()

  const normalizedPublicKey = typeof publicKey === 'string' ? publicKey.trim() : publicKey
  if (
    typeof normalizedPublicKey !== 'string' ||
    normalizedPublicKey.length > 4096 ||
    !validPublicKey(normalizedPublicKey)
  ) {
    throw createStageError('PUBLIC_KEY', 'CASHIER_PREFLIGHT_PUBLIC_KEY_INVALID')
  }

  let response
  try {
    response = await request(target + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: {
        apikey: normalizedPublicKey,
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: normalizedEmail, password }),
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw createStageError('AUTH_REQUEST', 'CASHIER_PREFLIGHT_AUTH_REQUEST_FAILED')
  }

  let text, data
  try {
    text = await boundedBody(response)
    data = JSON.parse(text)
  } catch {
    throw createStageError('AUTH_HTTP', 'CASHIER_PREFLIGHT_AUTH_HTTP_FAILED')
  }

  if (response.status !== 200) {
    throw createStageError('AUTH_HTTP', 'CASHIER_PREFLIGHT_AUTH_HTTP_FAILED')
  }

  const jwt = data?.access_token
  const tokenSub = typeof jwt === 'string' ? claims(jwt)?.sub : null
  if (
    typeof jwt !== 'string' ||
    jwt.length > 16400 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt) ||
    tokenSub !== CASHIER_AUTH_ID ||
    data?.token_type !== 'bearer' ||
    data?.user?.id !== CASHIER_AUTH_ID
  ) {
    if (typeof jwt === 'string' && claims(jwt)?.role === 'authenticated') {
      await tryLogout(request, normalizedPublicKey, jwt)
    }
    throw createStageError('TOKEN_SUBJECT', 'CASHIER_PREFLIGHT_TOKEN_SUBJECT_MISMATCH')
  }

  const authHeaders = Object.freeze({
    apikey: normalizedPublicKey,
    Authorization: 'Bearer ' + jwt,
    Origin: origin,
  })

  let identityRes
  try {
    identityRes = await request(target + '/auth/v1/user', {
      method: 'GET',
      headers: authHeaders,
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    await tryLogout(request, normalizedPublicKey, jwt)
    throw createStageError('AUTH_IDENTITY', 'CASHIER_PREFLIGHT_AUTH_IDENTITY_FAILED')
  }

  let idText, idData
  try {
    idText = await boundedBody(identityRes)
    idData = JSON.parse(idText)
  } catch {
    await tryLogout(request, normalizedPublicKey, jwt)
    throw createStageError('AUTH_IDENTITY', 'CASHIER_PREFLIGHT_AUTH_IDENTITY_FAILED')
  }

  if (
    identityRes.status !== 200 ||
    idData?.id !== CASHIER_AUTH_ID ||
    idData?.role !== 'authenticated'
  ) {
    await tryLogout(request, normalizedPublicKey, jwt)
    throw createStageError('AUTH_IDENTITY', 'CASHIER_PREFLIGHT_AUTH_IDENTITY_FAILED')
  }

  let profileRes
  try {
    profileRes = await request(
      target +
        '/rest/v1/usuarios?select=id,auth_user_id,kiosco_id,rol,activo,es_superadmin&auth_user_id=eq.' +
        CASHIER_AUTH_ID +
        '&limit=2',
      {
        method: 'GET',
        headers: authHeaders,
        redirect: 'error',
        credentials: 'omit',
        signal: AbortSignal.timeout(15000),
      }
    )
  } catch {
    await tryLogout(request, normalizedPublicKey, jwt)
    throw createStageError('PROFILE', 'CASHIER_PREFLIGHT_PROFILE_FAILED')
  }

  let profText, profData
  try {
    profText = await boundedBody(profileRes)
    profData = JSON.parse(profText)
  } catch {
    await tryLogout(request, normalizedPublicKey, jwt)
    throw createStageError('PROFILE', 'CASHIER_PREFLIGHT_PROFILE_FAILED')
  }

  const rows = profData
  if (
    profileRes.status !== 200 ||
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    !uuidRegex.test(rows[0]?.id) ||
    rows[0]?.auth_user_id !== CASHIER_AUTH_ID ||
    rows[0]?.rol !== 'CAJERO' ||
    rows[0]?.activo !== true ||
    rows[0]?.es_superadmin !== false ||
    rows[0]?.kiosco_id !== plan.kioskId
  ) {
    await tryLogout(request, normalizedPublicKey, jwt)
    throw createStageError('PROFILE', 'CASHIER_PREFLIGHT_PROFILE_FAILED')
  }

  let logoutRes
  try {
    logoutRes = await request(target + '/auth/v1/logout?scope=local', {
      method: 'POST',
      headers: authHeaders,
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw createStageError('LOGOUT_LOCAL', 'CASHIER_PREFLIGHT_LOGOUT_FAILED')
  }

  if (![200, 204].includes(logoutRes.status)) {
    throw createStageError('LOGOUT_LOCAL', 'CASHIER_PREFLIGHT_LOGOUT_FAILED')
  }

  return 'CASHIER_SESSION_PREFLIGHT = PASS'
}

const isEntryFile = () => {
  try {
    return Boolean(process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)))
  } catch {
    return false
  }
}

if (isEntryFile()) {
  let text = '', credentials
  try {
    if (process.platform !== 'win32') {
      throw createStageError('INPUT', 'Windows')
    }
    for await (const part of process.stdin) {
      text += part
      if (Buffer.byteLength(text) > 65536) {
        throw createStageError('INPUT', 'Input')
      }
    }
    try {
      credentials = JSON.parse(text)
    } catch {
      throw createStageError('INPUT', 'JSON')
    }
    text = ''
    const result = await runCashierSessionPreflight(credentials, globalThis.fetch)
    console.log(result)
  } catch (caught) {
    process.exitCode = 1
    const stage =
      caught && typeof caught === 'object' && PREFLIGHT_STAGES.includes(caught.stage)
        ? caught.stage
        : 'INPUT'
    console.log(`CASHIER_SESSION_PREFLIGHT = FAIL stage=${stage}`)
  } finally {
    credentials = null
    text = ''
  }
}
