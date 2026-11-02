// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { runCashierSessionPreflight, CASHIER_AUTH_ID, CASHIER_EMAIL } from '../../scripts/backup/restore-cashier-preflight.mjs'
import { loadRestorePlan } from '../../scripts/backup/restore-acceptance-engine.mjs'

const plan = loadRestorePlan()
const target = 'https://acoyfwwmhaeruciyedri.supabase.co'
const encode = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url')
const jwt = (data: object = {}) =>
  encode({ alg: 'ES256' }) +
  '.' +
  encode({
    role: 'authenticated',
    sub: CASHIER_AUTH_ID,
    iss: target + '/auth/v1',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...data,
  }) +
  '.SYNTHETIC'

function createMockRequest(options: {
  authStatus?: number
  subjectMismatch?: boolean
  profileRole?: string
  profileActive?: boolean
  profileSuperadmin?: boolean
  profileKioskId?: string
  logoutStatus?: number
} = {}) {
  const {
    authStatus = 200,
    subjectMismatch = false,
    profileRole = 'CAJERO',
    profileActive = true,
    profileSuperadmin = false,
    profileKioskId = plan.kioskId,
    logoutStatus = 204,
  } = options

  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input)
    if (url.includes('/auth/v1/token?grant_type=password')) {
      if (authStatus !== 200) {
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: authStatus })
      }
      const tokenSub = subjectMismatch ? '99999999-9999-4999-8999-999999999999' : CASHIER_AUTH_ID
      return new Response(
        JSON.stringify({
          access_token: jwt({ sub: tokenSub }),
          token_type: 'bearer',
          user: { id: tokenSub },
        }),
        { status: 200 }
      )
    }
    if (url.includes('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: CASHIER_AUTH_ID, role: 'authenticated' }), { status: 200 })
    }
    if (url.includes('/rest/v1/usuarios')) {
      return new Response(
        JSON.stringify([
          {
            id: '33333333-3333-4333-8333-333333333333',
            auth_user_id: CASHIER_AUTH_ID,
            kiosco_id: profileKioskId,
            rol: profileRole,
            activo: profileActive,
            es_superadmin: profileSuperadmin,
          },
        ]),
        { status: 200 }
      )
    }
    if (url.includes('/auth/v1/logout')) {
      if (logoutStatus !== 200 && logoutStatus !== 204) {
        return new Response(JSON.stringify({ error: 'logout_failed' }), { status: logoutStatus })
      }
      return new Response(null, { status: logoutStatus })
    }
    throw Error('Unexpected url: ' + url)
  })
}

it('rejects if request function is not provided or not a function', async () => {
  await expect(
    // @ts-expect-error testing missing request argument
    runCashierSessionPreflight({
      publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
      email: CASHIER_EMAIL,
      password: 'password',
    })
  ).rejects.toThrow('CASHIER_PREFLIGHT_REQUEST_REQUIRED')

  await expect(
    // @ts-expect-error testing invalid request argument
    runCashierSessionPreflight({
      publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
      email: CASHIER_EMAIL,
      password: 'password',
    }, 'not_a_function')
  ).rejects.toThrow('CASHIER_PREFLIGHT_REQUEST_REQUIRED')
})

it('rejects if email does not match exact cashier email', async () => {
  const request = createMockRequest()
  await expect(
    runCashierSessionPreflight({
      publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
      email: 'wrong@example.test',
      password: 'any_password',
    }, request)
  ).rejects.toThrow('CASHIER_EMAIL_MISMATCH')
  expect(request).not.toHaveBeenCalled()
})

it('rejects if auth password grant fails', async () => {
  const request = createMockRequest({ authStatus: 401 })
  await expect(
    runCashierSessionPreflight({
      publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
      email: CASHIER_EMAIL,
      password: 'wrong_password',
    }, request)
  ).rejects.toThrow()
})

it('rejects if token subject does not match cashier auth id', async () => {
  const request = createMockRequest({ subjectMismatch: true })
  await expect(
    runCashierSessionPreflight({
      publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
      email: CASHIER_EMAIL,
      password: 'password',
    }, request)
  ).rejects.toThrow()
})

it('rejects if profile has unexpected role', async () => {
  const request = createMockRequest({ profileRole: 'DUEÑO' })
  await expect(
    runCashierSessionPreflight({
      publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
      email: CASHIER_EMAIL,
      password: 'password',
    }, request)
  ).rejects.toThrow()
})

it('rejects if profile is inactive', async () => {
  const request = createMockRequest({ profileActive: false })
  await expect(
    runCashierSessionPreflight({
      publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
      email: CASHIER_EMAIL,
      password: 'password',
    }, request)
  ).rejects.toThrow()
})

it('rejects if profile has wrong kiosk id', async () => {
  const request = createMockRequest({ profileKioskId: '00000000-0000-4000-8000-000000000000' })
  await expect(
    runCashierSessionPreflight({
      publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
      email: CASHIER_EMAIL,
      password: 'password',
    }, request)
  ).rejects.toThrow()
})

it('rejects if logout fails after valid session', async () => {
  const request = createMockRequest({ logoutStatus: 500 })
  await expect(
    runCashierSessionPreflight({
      publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
      email: CASHIER_EMAIL,
      password: 'password',
    }, request)
  ).rejects.toThrow()
})

it('returns CASHIER_SESSION_PREFLIGHT = PASS when auth and logout succeed', async () => {
  const request = createMockRequest()
  const result = await runCashierSessionPreflight({
    publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
    email: ' Prueba2@Example.Test ',
    password: 'correct_password',
  }, request)
  expect(result).toBe('CASHIER_SESSION_PREFLIGHT = PASS')
})
