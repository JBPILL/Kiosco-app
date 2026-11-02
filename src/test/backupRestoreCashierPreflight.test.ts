// @vitest-environment node
import { expect, it, vi, describe } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  runCashierSessionPreflight,
  CASHIER_AUTH_ID,
  CASHIER_EMAIL,
  PREFLIGHT_STAGES,
  type CashierPreflightCredentials,
} from '../../scripts/backup/restore-cashier-preflight.mjs'
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
  authNetworkError?: boolean
  authNonJson?: boolean
  subjectMismatch?: boolean
  tokenTypeMismatch?: boolean
  identityStatus?: number
  identityNetworkError?: boolean
  identityIdMismatch?: boolean
  identityRoleMismatch?: boolean
  profileStatus?: number
  profileNetworkError?: boolean
  profileRole?: string
  profileActive?: boolean
  profileSuperadmin?: boolean
  profileKioskId?: string
  profileEmpty?: boolean
  logoutStatus?: number
  logoutNetworkError?: boolean
} = {}) {
  const {
    authStatus = 200,
    authNetworkError = false,
    authNonJson = false,
    subjectMismatch = false,
    tokenTypeMismatch = false,
    identityStatus = 200,
    identityNetworkError = false,
    identityIdMismatch = false,
    identityRoleMismatch = false,
    profileStatus = 200,
    profileNetworkError = false,
    profileRole = 'CAJERO',
    profileActive = true,
    profileSuperadmin = false,
    profileKioskId = plan.kioskId,
    profileEmpty = false,
    logoutStatus = 204,
    logoutNetworkError = false,
  } = options

  return vi.fn<typeof fetch>(async (input, _init) => {
    const url = String(input)
    if (url.includes('/auth/v1/token?grant_type=password')) {
      if (authNetworkError) {
        throw new TypeError('fetch failed: network error')
      }
      if (authNonJson) {
        return new Response('NOT_A_JSON', { status: 200 })
      }
      if (authStatus !== 200) {
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: authStatus })
      }
      const tokenSub = subjectMismatch ? '99999999-9999-4999-8999-999999999999' : CASHIER_AUTH_ID
      return new Response(
        JSON.stringify({
          access_token: jwt({ sub: tokenSub }),
          token_type: tokenTypeMismatch ? 'invalid_type' : 'bearer',
          user: { id: tokenSub },
        }),
        { status: 200 }
      )
    }
    if (url.includes('/auth/v1/user')) {
      if (identityNetworkError) {
        throw new TypeError('fetch failed: identity timeout')
      }
      if (identityStatus !== 200) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: identityStatus })
      }
      const userId = identityIdMismatch ? '88888888-8888-4888-8888-888888888888' : CASHIER_AUTH_ID
      const userRole = identityRoleMismatch ? 'anon' : 'authenticated'
      return new Response(JSON.stringify({ id: userId, role: userRole }), { status: 200 })
    }
    if (url.includes('/rest/v1/usuarios')) {
      if (profileNetworkError) {
        throw new TypeError('fetch failed: profile network error')
      }
      if (profileStatus !== 200) {
        return new Response(JSON.stringify({ error: 'profile_error' }), { status: profileStatus })
      }
      if (profileEmpty) {
        return new Response(JSON.stringify([]), { status: 200 })
      }
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
      if (logoutNetworkError) {
        throw new TypeError('fetch failed: logout error')
      }
      if (logoutStatus !== 200 && logoutStatus !== 204) {
        return new Response(JSON.stringify({ error: 'logout_failed' }), { status: logoutStatus })
      }
      return new Response(null, { status: logoutStatus })
    }
    throw Error('Unexpected url: ' + url)
  })
}

describe('backupRestoreCashierPreflight - Stage & Allowlist Integrity', () => {
  it('defines the 10 exact closed preflight stages', () => {
    expect(PREFLIGHT_STAGES).toEqual([
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
    expect(Object.isFrozen(PREFLIGHT_STAGES)).toBe(true)
  })
})

describe('backupRestoreCashierPreflight - Transport Exactness (CAMBIO 1 & 5)', () => {
  it('EMAIL_TRANSPORT_EXACT: normalizes email and transports exact expected email', async () => {
    const request = createMockRequest()
    const result = await runCashierSessionPreflight(
      {
        publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
        email: '  Prueba2@Example.Test  ',
        password: 'correct_password',
      },
      request
    )
    expect(result).toBe('CASHIER_SESSION_PREFLIGHT = PASS')
    const tokenCall = request.mock.calls.find((call) =>
      String(call[0]).includes('/auth/v1/token')
    )
    expect(tokenCall).toBeDefined()
    const parsedBody = JSON.parse(tokenCall![1]?.body as string)
    expect(parsedBody.email).toBe(CASHIER_EMAIL)
  })

  it.each([
    { name: 'with $ symbol', pass: 'p@$$w0rd$Value' },
    { name: 'with ! symbol', pass: 'Ultra!Secure!Pass!' },
    { name: 'with & symbol', pass: 'Bits&Bytes&More' },
    { name: 'with double quotes', pass: 'Pass"With"Quotes' },
    { name: 'with single quotes', pass: "Pass'With'Singles" },
    { name: 'with backticks', pass: 'Pass`With`Backticks' },
    { name: 'with backslash', pass: 'Pass\\With\\Backslash' },
    { name: 'with Unicode & accents & emoji', pass: 'Contraseña_Café_123!🔑' },
    { name: 'with internal spaces', pass: 'my secure pass phrase with internal spaces' },
    { name: 'with leading and trailing spaces - NO TRIM', pass: '   secret_with_spaces   ' },
  ])('PASSWORD_TRANSPORT_EXACT: preserves password exact byte-by-byte for $name', async ({ pass }) => {
    const request = createMockRequest()
    const result = await runCashierSessionPreflight(
      {
        publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
        email: CASHIER_EMAIL,
        password: pass,
      },
      request
    )
    expect(result).toBe('CASHIER_SESSION_PREFLIGHT = PASS')
    const tokenCall = request.mock.calls.find((call) =>
      String(call[0]).includes('/auth/v1/token')
    )
    expect(tokenCall).toBeDefined()
    const parsedBody = JSON.parse(tokenCall![1]?.body as string)
    expect(parsedBody.password).toBe(pass)
    expect(parsedBody.password.length).toBe(pass.length)
  })

  it.each([
    { name: 'raw valid key', key: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345' },
    { name: 'leading whitespace', key: '   sb_publishable_SYNTHETIC_PUBLIC_KEY_12345' },
    { name: 'trailing whitespace', key: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345   ' },
    { name: 'exterior CRLF and spaces', key: '\r\n  sb_publishable_SYNTHETIC_PUBLIC_KEY_12345\r\n' },
  ])('PUBLIC_KEY_TRANSPORT_EXACT: normalizes public key with trim for $name', async ({ key }) => {
    const request = createMockRequest()
    const result = await runCashierSessionPreflight(
      {
        publicKey: key,
        email: CASHIER_EMAIL,
        password: 'correct_password',
      },
      request
    )
    expect(result).toBe('CASHIER_SESSION_PREFLIGHT = PASS')
    const tokenCall = request.mock.calls.find((call) =>
      String(call[0]).includes('/auth/v1/token')
    )
    expect(tokenCall).toBeDefined()
    const headers = tokenCall![1]?.headers as Record<string, string>
    expect(headers.apikey).toBe('sb_publishable_SYNTHETIC_PUBLIC_KEY_12345')
  })

  it('SERVICE_ROLE_REJECTED_LOCALLY: rejects synthetic service_role key without network', async () => {
    const request = vi.fn()
    const serviceRoleKey =
      encode({ alg: 'HS256' }) +
      '.' +
      encode({ role: 'service_role', ref: 'acoyfwwmhaeruciyedri' }) +
      '.SYNTHETIC'

    let caughtError: any
    try {
      await runCashierSessionPreflight(
        {
          publicKey: serviceRoleKey,
          email: CASHIER_EMAIL,
          password: 'correct_password',
        },
        request as unknown as typeof fetch
      )
    } catch (err) {
      caughtError = err
    }

    expect(caughtError).toBeDefined()
    expect(caughtError.stage).toBe('PUBLIC_KEY')
    expect(request).not.toHaveBeenCalled()
  })
})

describe('backupRestoreCashierPreflight - Stage Classification (CAMBIO 2 & 5)', () => {
  it('stage INPUT: rejects when request is missing or not a function', async () => {
    await expect(
      (runCashierSessionPreflight as unknown as (credentials: unknown) => Promise<unknown>)({
        publicKey: 'k',
        email: CASHIER_EMAIL,
        password: 'p',
      })
    ).rejects.toMatchObject({
      stage: 'INPUT',
    })
    await expect(
      runCashierSessionPreflight(
        { publicKey: 'k', email: CASHIER_EMAIL, password: 'p' },
        'invalid' as unknown as typeof fetch
      )
    ).rejects.toMatchObject({
      stage: 'INPUT',
    })
  })

  it('stage INPUT: rejects when credentials are invalid', async () => {
    const request = vi.fn()
    await expect(
      runCashierSessionPreflight(null as unknown as CashierPreflightCredentials, request as unknown as typeof fetch)
    ).rejects.toMatchObject({
      stage: 'INPUT',
    })
    await expect(
      runCashierSessionPreflight(
        'not-an-object' as unknown as CashierPreflightCredentials,
        request as unknown as typeof fetch
      )
    ).rejects.toMatchObject({
      stage: 'INPUT',
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('stage INPUT: rejects when password is invalid (empty, too long, null byte)', async () => {
    const request = vi.fn()
    await expect(
      runCashierSessionPreflight(
        { publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345', email: CASHIER_EMAIL, password: '' },
        request as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ stage: 'INPUT' })

    await expect(
      runCashierSessionPreflight(
        { publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345', email: CASHIER_EMAIL, password: 'a\0b' },
        request as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ stage: 'INPUT' })

    await expect(
      runCashierSessionPreflight(
        { publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345', email: CASHIER_EMAIL, password: 'x'.repeat(1025) },
        request as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ stage: 'INPUT' })

    expect(request).not.toHaveBeenCalled()
  })

  it('stage EMAIL_GUARD: rejects when email does not match exact cashier email', async () => {
    const request = vi.fn()
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: 'wrong@example.test',
          password: 'any_password',
        },
        request as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ stage: 'EMAIL_GUARD' })

    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: 'prueba2@gmail.com',
          password: 'any_password',
        },
        request as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ stage: 'EMAIL_GUARD' })

    expect(request).not.toHaveBeenCalled()
  })

  it('stage PUBLIC_KEY: rejects malformed or non-anon public key locally', async () => {
    const request = vi.fn()
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'invalid_key',
          email: CASHIER_EMAIL,
          password: 'password',
        },
        request as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ stage: 'PUBLIC_KEY' })

    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'k'.repeat(4097),
          email: CASHIER_EMAIL,
          password: 'password',
        },
        request as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ stage: 'PUBLIC_KEY' })

    expect(request).not.toHaveBeenCalled()
  })

  it('stage AUTH_REQUEST: emits AUTH_REQUEST when network fails during token request', async () => {
    const request = createMockRequest({ authNetworkError: true })
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: CASHIER_EMAIL,
          password: 'password',
        },
        request
      )
    ).rejects.toMatchObject({ stage: 'AUTH_REQUEST' })
  })

  it('stage AUTH_HTTP: emits AUTH_HTTP when status is not 200 or body is invalid', async () => {
    const request401 = createMockRequest({ authStatus: 401 })
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: CASHIER_EMAIL,
          password: 'wrong_password',
        },
        request401
      )
    ).rejects.toMatchObject({ stage: 'AUTH_HTTP' })

    const requestNonJson = createMockRequest({ authNonJson: true })
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: CASHIER_EMAIL,
          password: 'password',
        },
        requestNonJson
      )
    ).rejects.toMatchObject({ stage: 'AUTH_HTTP' })
  })

  it('stage TOKEN_SUBJECT: emits TOKEN_SUBJECT when token subject or type mismatches', async () => {
    const requestSubject = createMockRequest({ subjectMismatch: true })
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: CASHIER_EMAIL,
          password: 'password',
        },
        requestSubject
      )
    ).rejects.toMatchObject({ stage: 'TOKEN_SUBJECT' })

    const requestType = createMockRequest({ tokenTypeMismatch: true })
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: CASHIER_EMAIL,
          password: 'password',
        },
        requestType
      )
    ).rejects.toMatchObject({ stage: 'TOKEN_SUBJECT' })
  })

  it('stage AUTH_IDENTITY: emits AUTH_IDENTITY when /auth/v1/user verification fails', async () => {
    const requestIdMismatch = createMockRequest({ identityIdMismatch: true })
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: CASHIER_EMAIL,
          password: 'password',
        },
        requestIdMismatch
      )
    ).rejects.toMatchObject({ stage: 'AUTH_IDENTITY' })

    const requestRoleMismatch = createMockRequest({ identityRoleMismatch: true })
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: CASHIER_EMAIL,
          password: 'password',
        },
        requestRoleMismatch
      )
    ).rejects.toMatchObject({ stage: 'AUTH_IDENTITY' })

    const requestStatus401 = createMockRequest({ identityStatus: 401 })
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: CASHIER_EMAIL,
          password: 'password',
        },
        requestStatus401
      )
    ).rejects.toMatchObject({ stage: 'AUTH_IDENTITY' })
  })

  it('stage PROFILE: emits PROFILE when /rest/v1/usuarios verification fails', async () => {
    const requestWrongRole = createMockRequest({ profileRole: 'DUEÑO' })
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: CASHIER_EMAIL,
          password: 'password',
        },
        requestWrongRole
      )
    ).rejects.toMatchObject({ stage: 'PROFILE' })

    const requestInactive = createMockRequest({ profileActive: false })
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: CASHIER_EMAIL,
          password: 'password',
        },
        requestInactive
      )
    ).rejects.toMatchObject({ stage: 'PROFILE' })

    const requestSuperadmin = createMockRequest({ profileSuperadmin: true })
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: CASHIER_EMAIL,
          password: 'password',
        },
        requestSuperadmin
      )
    ).rejects.toMatchObject({ stage: 'PROFILE' })

    const requestWrongKiosk = createMockRequest({ profileKioskId: '00000000-0000-4000-8000-000000000000' })
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: CASHIER_EMAIL,
          password: 'password',
        },
        requestWrongKiosk
      )
    ).rejects.toMatchObject({ stage: 'PROFILE' })

    const requestEmptyRows = createMockRequest({ profileEmpty: true })
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: CASHIER_EMAIL,
          password: 'password',
        },
        requestEmptyRows
      )
    ).rejects.toMatchObject({ stage: 'PROFILE' })
  })

  it('stage LOGOUT_LOCAL: emits LOGOUT_LOCAL when /auth/v1/logout fails after valid session', async () => {
    const requestLogout500 = createMockRequest({ logoutStatus: 500 })
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: CASHIER_EMAIL,
          password: 'password',
        },
        requestLogout500
      )
    ).rejects.toMatchObject({ stage: 'LOGOUT_LOCAL' })

    const requestLogoutNet = createMockRequest({ logoutNetworkError: true })
    await expect(
      runCashierSessionPreflight(
        {
          publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
          email: CASHIER_EMAIL,
          password: 'password',
        },
        requestLogoutNet
      )
    ).rejects.toMatchObject({ stage: 'LOGOUT_LOCAL' })
  })
})

describe('backupRestoreCashierPreflight - CLI Stdin Process Execution', () => {
  const cliScript = resolve('scripts/backup/restore-cashier-preflight.mjs')

  it.skipIf(process.platform !== 'win32')('CLI outputs FAIL stage=PUBLIC_KEY and exit 1 on service_role without leak', () => {
    const serviceRoleKey =
      encode({ alg: 'HS256' }) +
      '.' +
      encode({ role: 'service_role', ref: 'acoyfwwmhaeruciyedri' }) +
      '.SYNTHETIC'

    const payload = JSON.stringify({
      publicKey: serviceRoleKey,
      email: CASHIER_EMAIL,
      password: 'my_secret_password',
    })

    const res = spawnSync(process.execPath, [cliScript], {
      input: payload,
      encoding: 'utf8',
      timeout: 10000,
    })

    expect(res.status).toBe(1)
    expect(res.stdout.trim()).toBe('CASHIER_SESSION_PREFLIGHT = FAIL stage=PUBLIC_KEY')
    expect(res.stderr).toBe('')
    expect(res.stdout).not.toContain('my_secret_password')
    expect(res.stdout).not.toContain(serviceRoleKey)
    expect(res.stdout).not.toContain(CASHIER_EMAIL)
  })

  it.skipIf(process.platform !== 'win32')('CLI outputs FAIL stage=EMAIL_GUARD on mismatched email', () => {
    const payload = JSON.stringify({
      publicKey: 'sb_publishable_SYNTHETIC_PUBLIC_KEY_12345',
      email: 'otro@example.test',
      password: 'password',
    })

    const res = spawnSync(process.execPath, [cliScript], {
      input: payload,
      encoding: 'utf8',
      timeout: 10000,
    })

    expect(res.status).toBe(1)
    expect(res.stdout.trim()).toBe('CASHIER_SESSION_PREFLIGHT = FAIL stage=EMAIL_GUARD')
    expect(res.stderr).toBe('')
    expect(res.stdout).not.toContain('otro@example.test')
  })

  it.skipIf(process.platform !== 'win32')('CLI outputs FAIL stage=INPUT on malformed json', () => {
    const res = spawnSync(process.execPath, [cliScript], {
      input: 'NOT_VALID_JSON',
      encoding: 'utf8',
      timeout: 10000,
    })

    expect(res.status).toBe(1)
    expect(res.stdout.trim()).toBe('CASHIER_SESSION_PREFLIGHT = FAIL stage=INPUT')
    expect(res.stderr).toBe('')
  })
})
