#!/usr/bin/env node
/**
 * Production-only, one-shot initial platform-admin bootstrap for the approved
 * clean Supabase Production project. Auth users are created through the hosted
 * Supabase Auth admin API; business rows are committed in one PostgreSQL
 * transaction. Secrets are read from process environment only and are never
 * printed or persisted.
 */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'
import { assertProductionTargetUrl } from './f6-3b-production-bootstrap.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const productionProjectRef = 'lllkjnqpltnwvxzphncr'
export const productionSupabaseApiUrl = `https://${productionProjectRef}.supabase.co/`
const profileRoleValues = new Set(['DUEÑO', 'CAJERO', 'VISOR'])
export const initialSuperadminRole = 'VISOR'
const kioskNameLimit = 120
const profileNameLimit = 120
const advisoryLockKey = [1634365523, 1]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function validateProductionSupabaseApiUrl(
  value,
  confirmedRef = productionProjectRef,
) {
  assert(
    confirmedRef === productionProjectRef,
    'Initial-admin Production target ref is not the approved Production project.',
  )
  assert(
    typeof value === 'string' && value.length > 0,
    'Production Supabase API URL is required.',
  )

  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('Invalid Production Supabase API URL.')
  }

  assert(
    url.protocol === 'https:',
    'Production Supabase API URL requires HTTPS.',
  )
  assert(
    url.hostname === `${confirmedRef}.supabase.co`,
    'Production Supabase API hostname must match the exact confirmed project ref.',
  )
  assert(
    url.port === '' && url.pathname === '/',
    'Production Supabase API URL must use the canonical root endpoint.',
  )
  assert(
    !url.username &&
      !url.password &&
      !url.search &&
      !url.hash,
    'Production Supabase API URL must not contain credentials, query parameters, or fragments.',
  )

  return url
}

export function validateProductionSecretKey(value) {
  assert(
    typeof value === 'string' &&
      value.startsWith('sb_secret_') &&
      value.length > 'sb_secret_'.length,
    'Production initial-admin bootstrap requires an sb_secret_ key.',
  )

  return value
}

export function validateProductionPublishableKey(value) {
  assert(
    typeof value === 'string' &&
      value.startsWith('sb_publishable_') &&
      value.length > 'sb_publishable_'.length,
    'Production initial-admin bootstrap requires an sb_publishable_ key.',
  )

  return value
}

export function validateInitialAdminInput(input) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 'Initial-admin input must be an object.')
  assert(Object.keys(input).sort().join(',') === 'kiosco,owner,superadmin', 'Initial-admin input contains missing or unexpected sections.')
  const validateIdentity = (identity, label) => {
    assert(identity && typeof identity === 'object' && !Array.isArray(identity), `${label} input is invalid.`)
    assert(Object.keys(identity).sort().join(',') === 'email,nombre,password', `${label} input contains missing or unexpected fields.`)
    assert(typeof identity.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email.trim()), `${label} email is invalid.`)
    assert(typeof identity.nombre === 'string' && identity.nombre.trim().length >= 1 && identity.nombre.trim().length <= profileNameLimit, `${label} profile name is invalid.`)
    assert(typeof identity.password === 'string' && identity.password.length >= 12 && identity.password.length <= 128, `${label} password must contain 12–128 characters.`)
    return { email: identity.email.trim().toLowerCase(), nombre: identity.nombre.trim(), password: identity.password }
  }
  const superadmin = validateIdentity(input.superadmin, 'SuperAdmin')
  const owner = validateIdentity(input.owner, 'Owner')
  assert(superadmin.email !== owner.email, 'SuperAdmin and Owner must use distinct new identities.')
  assert(input.kiosco && typeof input.kiosco === 'object' && !Array.isArray(input.kiosco), 'Initial kiosk input is invalid.')
  assert(Object.keys(input.kiosco).sort().join(',') === 'nombre', 'Initial kiosk input contains missing or unexpected fields.')
  assert(typeof input.kiosco.nombre === 'string' && input.kiosco.nombre.trim().length >= 1 && input.kiosco.nombre.trim().length <= kioskNameLimit, 'Initial kiosk name is invalid.')
  assert(profileRoleValues.has(initialSuperadminRole), 'Configured SuperAdmin role is not permitted by the profile contract.')
  return { superadmin, owner, kioskName: input.kiosco.nombre.trim() }
}

export function validateInitialBootstrapEvidence(value, targetRef = productionProjectRef) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Production bootstrap evidence is required.')
  assert(value.status === 'PASS' && value.finalStatus === 'PASS', 'Production bootstrap evidence must have PASS status.')
  assert(value.reconciliationStatus === 'PASS', 'Production bootstrap evidence must include passing final reconciliation.')
  assert(value.expectedMigrableRows === 0, 'Production bootstrap evidence must be for the approved zero-row package.')
  assert(value.lastPassedStep === 'RECONCILIATION_FINAL', 'Production bootstrap evidence is incomplete.')
  assert(value.targetProjectRef === targetRef && targetRef === productionProjectRef, 'Initial-admin bootstrap evidence must be bound to the exact approved Production target.')
  return value
}

export function validateInitialIdentityState(rows, expectedAuthIds) {
  assert(rows.authUsers === 2, `Expected exactly 2 Auth users, found ${rows.authUsers}.`)
  assert(rows.profiles === 2, `Expected exactly 2 public.usuarios profiles, found ${rows.profiles}.`)
  assert(rows.kiosks === 1, `Expected exactly 1 initial kiosk, found ${rows.kiosks}.`)
  assert(rows.superadmins === 1, `Expected exactly 1 SuperAdmin, found ${rows.superadmins}.`)
  assert(rows.owners === 1, `Expected exactly 1 Owner, found ${rows.owners}.`)
  assert(rows.activeProfiles === 2, 'Both initial profiles must be active.')
  assert(rows.authMappings === 2, 'Both initial profiles must map to newly created Auth users.')
  assert(rows.authIdsMatch === true, 'Auth identities differ from the two users created in this run.')
  assert(rows.superadminRole === initialSuperadminRole, 'SuperAdmin profile role differs from the least-privilege schema role.')
  assert(rows.superadminNullKiosk === true, 'SuperAdmin must have a NULL kiosk_id.')
  assert(rows.ownerKioskAssigned === true, 'Owner must belong to the sole initial kiosk.')
  assert(expectedAuthIds?.length === 2 && expectedAuthIds[0] !== expectedAuthIds[1], 'Two distinct Auth user IDs are required.')
  return rows
}

export function createInitialAdminEvidence({ targetProjectRef = productionProjectRef, bootstrapEvidenceSha256, now = new Date().toISOString() }) {
  return {
    schemaVersion: 1,
    operation: 'INITIAL_PLATFORM_ADMIN_BOOTSTRAP',
    targetProjectRef,
    timestamp: now,
    status: 'PLANNED',
    writeAttempted: false,
    productionBootstrapEvidenceSha256: bootstrapEvidenceSha256,
    resultCounts: null,
    authenticatedTests: { superadmin: 'NOT_RUN', owner: 'NOT_RUN' },
    privilegeSeparation: 'NOT_RUN',
    finalStatus: 'PLANNED',
  }
}

async function assertEvidencePathAvailable(evidencePath) {
  assert(typeof evidencePath === 'string' && evidencePath.length > 0, '--evidence is required.')
  const absolute = path.resolve(evidencePath)
  const parent = await realpath(path.dirname(absolute))
  const repo = await realpath(repoRoot)
  const relative = path.relative(repo, path.join(parent, path.basename(absolute)))
  assert(relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), 'Evidence output must be outside the repository.')
  try {
    await lstat(absolute)
    throw new Error('Evidence output already exists; refusing to overwrite it.')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  return absolute
}

async function persistEvidence(file, evidence, first = false) {
  if (first) {
    await writeFile(file, stableJson(evidence), { flag: 'wx' })
    return
  }
  const temporary = `${file}.tmp-${randomUUID()}`
  try {
    await writeFile(temporary, stableJson(evidence), { flag: 'wx' })
    await rename(temporary, file)
  } catch (error) {
    const { rm } = await import('node:fs/promises')
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

async function readCounts(client) {
  const result = await client.query(`SELECT
    (SELECT count(*)::int FROM auth.users) AS auth_users,
    (SELECT count(*)::int FROM public.usuarios) AS profiles,
    (SELECT count(*)::int FROM public.kioscos) AS kiosks`)
  const row = result.rows[0]
  return { authUsers: row.auth_users, profiles: row.profiles, kiosks: row.kiosks }
}

async function readInitializationState(client) {
  const result = await client.query('SELECT status FROM public.platform_initial_admin_bootstrap_state WHERE singleton=true')
  return result.rows[0]?.status ?? null
}

async function claimInitialBootstrap(client) {
  await client.query('BEGIN')
  try {
    const result = await client.query(`INSERT INTO public.platform_initial_admin_bootstrap_state(singleton,status)
      VALUES(true,'IN_PROGRESS')
      ON CONFLICT(singleton) DO UPDATE SET status='IN_PROGRESS',initialized_at=NULL
      WHERE public.platform_initial_admin_bootstrap_state.status='READY'
      RETURNING status`)
    assert(result.rows.length === 1 && result.rows[0].status === 'IN_PROGRESS', 'Initial-admin bootstrap is already claimed or permanently used.')
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  }
}

async function inspectFinalState(client, superadminAuthId, ownerAuthId) {
  const result = await client.query(`SELECT
    (SELECT count(*)::int FROM auth.users) AS auth_users,
    (SELECT count(*)::int FROM public.usuarios) AS profiles,
    (SELECT count(*)::int FROM public.kioscos) AS kiosks,
    (SELECT count(*)::int FROM public.usuarios WHERE es_superadmin) AS superadmins,
    (SELECT count(*)::int FROM public.usuarios WHERE rol='DUEÑO') AS owners,
    (SELECT count(*)::int FROM public.usuarios WHERE activo) AS active_profiles,
    (SELECT count(*)::int FROM public.usuarios WHERE auth_user_id IN ($1::uuid,$2::uuid)) AS auth_mappings,
    (SELECT count(*)::int FROM auth.users WHERE id IN ($1::uuid,$2::uuid)) AS auth_ids_match,
    (SELECT rol FROM public.usuarios WHERE auth_user_id=$1::uuid AND es_superadmin) AS superadmin_role,
    (SELECT kiosco_id IS NULL FROM public.usuarios WHERE auth_user_id=$1::uuid AND es_superadmin) AS superadmin_null_kiosk,
    (SELECT count(*)=1 FROM public.usuarios WHERE auth_user_id=$2::uuid AND rol='DUEÑO' AND NOT es_superadmin AND kiosco_id IS NOT NULL) AS owner_kiosk_assigned`, [superadminAuthId, ownerAuthId])
  const row = result.rows[0]
  return {
    authUsers: row.auth_users,
    profiles: row.profiles,
    kiosks: row.kiosks,
    superadmins: row.superadmins,
    owners: row.owners,
    activeProfiles: row.active_profiles,
    authMappings: row.auth_mappings,
    superadminRole: row.superadmin_role,
    authIdsMatch: row.auth_ids_match === 2,
    superadminNullKiosk: row.superadmin_null_kiosk === true,
    ownerKioskAssigned: row.owner_kiosk_assigned === true,
  }
}

async function requestAuthAdmin({
  adminClient,
  action,
  payload,
  userId,
}) {
  if (action === 'create') {
    const { data, error } = await adminClient.auth.admin.createUser(payload)

    if (error) {
      throw new Error('Production Auth admin create request rejected.')
    }

    const id = data?.user?.id

    assert(
      typeof id === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id),
      'Production Auth admin did not return a valid new user ID.',
    )

    return id
  }

  const { error } = await adminClient.auth.admin.deleteUser(userId)

  if (error) {
    throw new Error('Production Auth admin delete request rejected.')
  }

  return null
}

async function requestPasswordLogin({ apiUrl, publishableKey, identity, fetchImpl }) {
  let response
  try {
    response = await fetchImpl(new URL('/auth/v1/token?grant_type=password', apiUrl), {
      method: 'POST',
      headers: { apikey: publishableKey, 'content-type': 'application/json' },
      body: JSON.stringify({ email: identity.email, password: identity.password }),
    })
  } catch {
    throw new Error('Production password-authentication smoke test could not reach Supabase Auth.')
  }
  if (!response.ok) throw new Error(`Production password-authentication smoke test failed (HTTP ${response.status}).`)
  const result = await response.json().catch(() => null)
  assert(typeof result?.access_token === 'string' && typeof result?.user?.id === 'string', 'Production password-authentication response was incomplete.')
  return result.user.id
}

export async function verifyProductionPrivilegeSeparation(client, superadminAuthId, ownerAuthId, ownerKioskId) {
  const temporary = await client.query("INSERT INTO public.kioscos(nombre) VALUES('F6 synthetic privilege probe') RETURNING id")
  const probeKioskId = temporary.rows[0]?.id
  assert(typeof probeKioskId === 'string' && probeKioskId !== ownerKioskId, 'Could not create an isolated Production privilege-probe kiosk.')
  try {
    const visibleKiosks = async authId => {
      await client.query('BEGIN')
      try {
        await client.query('SET LOCAL ROLE authenticated')
        await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)", [authId])
        const visible = await client.query('SELECT count(*)::int AS n FROM public.kioscos')
        await client.query('ROLLBACK')
        return visible.rows[0]?.n
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      }
    }
    assert(await visibleKiosks(ownerAuthId) === 1, 'Owner RLS did not restrict reads to the owner kiosk.')
    assert(await visibleKiosks(superadminAuthId) === 2, 'Global SuperAdmin RLS did not match the declared global read contract.')

    let directUpdateDenied = false
    await client.query('BEGIN')
    try {
      await client.query('SET LOCAL ROLE authenticated')
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)", [ownerAuthId])
      await client.query("UPDATE public.usuarios SET es_superadmin=true WHERE auth_user_id=$1::uuid", [ownerAuthId])
    } catch (error) {
      directUpdateDenied = error?.code === '42501'
    } finally {
      await client.query('ROLLBACK').catch(() => {})
    }
    assert(directUpdateDenied, 'Owner was able to issue a direct browser profile privilege update.')
    const grants = await client.query(`SELECT
      has_table_privilege('authenticated','public.usuarios','INSERT') AS profile_insert,
      has_table_privilege('authenticated','public.usuarios','UPDATE') AS profile_update,
      has_table_privilege('authenticated','public.platform_initial_admin_bootstrap_state','SELECT') AS state_select,
      has_table_privilege('service_role','public.platform_initial_admin_bootstrap_state','UPDATE') AS service_state_update`)
    assert(grants.rows[0]?.profile_insert === false && grants.rows[0]?.profile_update === false
      && grants.rows[0]?.state_select === false && grants.rows[0]?.service_state_update === false,
    'Profile or initialization-state table grants exceed the bootstrap contract.')
    return 'PASS'
  } finally {
    await client.query('DELETE FROM public.kioscos WHERE id=$1::uuid', [probeKioskId])
  }
}

async function compensate({ client, createdAuthIds, committedKioskId, authAdmin, evidence, evidencePath, verifyCounts }) {
  await client.query('ROLLBACK').catch(() => {})
  let compensationError = false
  if (committedKioskId) {
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM public.usuarios WHERE auth_user_id = ANY($1::uuid[])', [createdAuthIds])
      await client.query('DELETE FROM public.kioscos WHERE id=$1::uuid', [committedKioskId])
      await client.query('COMMIT')
    } catch {
      compensationError = true
      await client.query('ROLLBACK').catch(() => {})
    }
  }
  for (const userId of [...createdAuthIds].reverse()) {
    try { await authAdmin.deleteUser(userId) } catch { compensationError = true }
  }
  try {
    const counts = await verifyCounts()
    if (counts.authUsers !== 0 || counts.profiles !== 0 || counts.kiosks !== 0) compensationError = true
  } catch { compensationError = true }
  try {
    if (compensationError) {
      await client.query(`INSERT INTO public.platform_initial_admin_bootstrap_state(singleton,status)
        VALUES(true,'TAINTED') ON CONFLICT(singleton) DO UPDATE SET status='TAINTED',initialized_at=NULL`)
    } else {
      const ready = await client.query(`INSERT INTO public.platform_initial_admin_bootstrap_state(singleton,status)
        VALUES(true,'READY') ON CONFLICT(singleton) DO UPDATE SET status='READY',initialized_at=NULL
        WHERE public.platform_initial_admin_bootstrap_state.status IN ('IN_PROGRESS','READY') RETURNING status`)
      if (ready.rows.length !== 1) compensationError = true
    }
  } catch { compensationError = true }
  evidence.status = compensationError ? 'TAINTED_INITIAL_ADMIN_BOOTSTRAP' : 'FAILED_COMPENSATED'
  evidence.finalStatus = evidence.status
  evidence.failure = 'Bootstrap failed; credentials and personal identifiers are intentionally omitted.'
  await persistEvidence(evidencePath, evidence).catch(() => {})
  return compensationError ? 'TAINTED_INITIAL_ADMIN_BOOTSTRAP' : 'FAILED_COMPENSATED'
}

/** Injectable Production core. Remote access is constrained by exact project, API, DB and TLS guards. */
export async function executeInitialPlatformAdminBootstrap({
  databaseUrl,
  targetRef = productionProjectRef,
  supabaseUrl,
  secretKey,
  publishableKey,
  input,
  bootstrapEvidence,
  evidencePath,
  clientFactory = config => new Client(config),
  adminClientFactory = (url, key) =>
    createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }),
  fetchImpl = fetch,
  verifyPrivileges = verifyProductionPrivilegeSeparation,
  now = () => new Date().toISOString(),
}) {
  assert(
    targetRef === productionProjectRef,
    'Initial-admin bootstrap target must be the exact approved Production project.',
  )
  const dbUrl = assertProductionTargetUrl(databaseUrl, targetRef)
  const apiUrl = validateProductionSupabaseApiUrl(supabaseUrl, targetRef)
  const validatedSecretKey =
    validateProductionSecretKey(secretKey)

  const validatedPublishableKey =
    validateProductionPublishableKey(publishableKey)
  const credentials = validateInitialAdminInput(input)
  const bootstrap = validateInitialBootstrapEvidence(bootstrapEvidence, targetRef)
  const output = await assertEvidencePathAvailable(evidencePath)
  const evidence = createInitialAdminEvidence({ targetProjectRef: targetRef, bootstrapEvidenceSha256: sha256(stableJson(bootstrap)), now: now() })
  await persistEvidence(output, evidence, true)
  evidence.status = 'RUNNING'
  evidence.finalStatus = 'RUNNING'

  const client = clientFactory({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: true, servername: dbUrl.hostname },
    connectionTimeoutMillis: 8000,
    query_timeout: 30000,
  })
  const createdAuthIds = []
  let committedKioskId = null
  let lockHeld = false

  const adminClient = adminClientFactory(
    apiUrl.toString(),
    validatedSecretKey,
  )

  assert(
    adminClient?.auth?.admin,
    'Production Supabase admin client is invalid.',
  )

  const authAdmin = {
    createUser: identity =>
      requestAuthAdmin({
        adminClient,
        action: 'create',
        payload: {
          email: identity.email,
          password: identity.password,
          email_confirm: true,
        },
      }),

    deleteUser: userId =>
      requestAuthAdmin({
        adminClient,
        action: 'delete',
        userId,
      }),
  }
  try {
    await client.connect()
    await client.query('SELECT pg_advisory_lock($1,$2)', advisoryLockKey)
    lockHeld = true
    const empty = await readCounts(client)
    const initializationState = await readInitializationState(client)
    assert(initializationState === null || initializationState === 'READY',
      'Initial platform admin bootstrap is already initialized, in progress, or tainted.')
    assert(empty.authUsers === 0 && empty.profiles === 0 && empty.kiosks === 0,
      'Initial platform admin bootstrap requires auth.users=0, public.usuarios=0 and public.kioscos=0.')

    evidence.writeAttempted = true
    await persistEvidence(output, evidence)
    await claimInitialBootstrap(client)
    createdAuthIds.push(await authAdmin.createUser(credentials.superadmin))
    createdAuthIds.push(await authAdmin.createUser(credentials.owner))
    assert(createdAuthIds[0] !== createdAuthIds[1], 'Auth returned duplicate identities.')

    const afterAuth = await readCounts(client)
    assert(afterAuth.authUsers === 2 && afterAuth.profiles === 0 && afterAuth.kiosks === 0,
      'Auth creation did not leave exactly two identities and no business profiles or kiosks.')
    const authIdCheck = await client.query('SELECT count(*)::int AS n FROM auth.users WHERE id=ANY($1::uuid[])', [createdAuthIds])
    assert(authIdCheck.rows[0]?.n === 2, 'The two Auth identities are not present in the confirmed Production target.')

    await client.query('BEGIN')
    const kiosk = await client.query('INSERT INTO public.kioscos(nombre) VALUES($1) RETURNING id', [credentials.kioskName])
    committedKioskId = kiosk.rows[0]?.id
    assert(typeof committedKioskId === 'string', 'Initial kiosk insert did not return its identifier.')
    await client.query(`INSERT INTO public.usuarios(auth_user_id,kiosco_id,nombre,email,rol,activo,es_superadmin)
      VALUES($1,NULL,$2,$3,$4,true,true),($5,$6,$7,$8,'DUEÑO',true,false)`, [
      createdAuthIds[0], credentials.superadmin.nombre, credentials.superadmin.email, initialSuperadminRole,
      createdAuthIds[1], committedKioskId, credentials.owner.nombre, credentials.owner.email,
    ])
    const transactionState = await inspectFinalState(client, createdAuthIds[0], createdAuthIds[1])
    validateInitialIdentityState(transactionState, createdAuthIds)
    await client.query('COMMIT')

    const finalState = validateInitialIdentityState(await inspectFinalState(client, createdAuthIds[0], createdAuthIds[1]), createdAuthIds)
    const superadminLoginId = await requestPasswordLogin({
      apiUrl,
      publishableKey: validatedPublishableKey,
      identity: credentials.superadmin,
      fetchImpl,
    })
    assert(superadminLoginId === createdAuthIds[0], 'SuperAdmin login resolved to a different Auth identity.')
    evidence.authenticatedTests.superadmin = 'PASS'
    const ownerLoginId = await requestPasswordLogin({
      apiUrl,
      publishableKey: validatedPublishableKey,
      identity: credentials.owner,
      fetchImpl,
    })
    assert(ownerLoginId === createdAuthIds[1], 'Owner login resolved to a different Auth identity.')
    evidence.authenticatedTests.owner = 'PASS'
    assert(await verifyPrivileges(client, createdAuthIds[0], createdAuthIds[1], committedKioskId) === 'PASS',
      'Initial-admin privilege separation checks did not pass.')
    const passedState = await client.query(`UPDATE public.platform_initial_admin_bootstrap_state
      SET status='PASS',initialized_at=clock_timestamp() WHERE singleton=true AND status='IN_PROGRESS' RETURNING status`)
    assert(passedState.rows.length === 1 && passedState.rows[0].status === 'PASS', 'Could not permanently mark the initial-admin bootstrap as complete.')
    evidence.resultCounts = {
      authUsers: finalState.authUsers,
      profiles: finalState.profiles,
      kiosks: finalState.kiosks,
      superadmins: finalState.superadmins,
      owners: finalState.owners,
      activeProfiles: finalState.activeProfiles,
    }
    evidence.privilegeSeparation = 'PASS'
    evidence.status = 'PASS'
    evidence.finalStatus = 'PASS'
    await persistEvidence(output, evidence)
    return { status: 'PASS', evidencePath: output, counts: evidence.resultCounts }
  } catch (error) {
    if (!evidence.writeAttempted) {
      evidence.status = 'BLOCKED_NO_WRITES'
      evidence.finalStatus = 'BLOCKED_NO_WRITES'
      evidence.failure = safeError(error)
      await persistEvidence(output, evidence).catch(() => {})
      throw new Error(`BLOCKED_NO_WRITES: ${safeError(error)}`)
    }
    const status = await compensate({
      client, createdAuthIds, committedKioskId, authAdmin, evidence, evidencePath: output,
      verifyCounts: () => readCounts(client),
    })
    throw new Error(`${status}: ${safeError(error)}`)
  } finally {
    if (lockHeld) await client.query('SELECT pg_advisory_unlock($1,$2)', advisoryLockKey).catch(() => {})
    await client.end().catch(() => {})
  }
}

function safeError(error) {
  if (!(error instanceof Error)) {
    return 'Unexpected initial-admin Production bootstrap error.'
  }

  return error.message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url-redacted]')
    .replace(/[^\s@]+@[^\s@]+/g, '[email-redacted]')
}

function parseArgs(argv) {
  const [mode, ...rest] = argv
  const options = {}
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    assert(token.startsWith('--'), `Unexpected argument: ${token}`)
    const key = token.slice(2)
    assert(!Object.hasOwn(options, key), `--${key} was supplied more than once.`)
    const value = rest[++index]
    assert(value && !value.startsWith('--'), `--${key} requires a value.`)
    options[key] = value
  }
  return { mode, options }
}

async function main() {
  const { mode, options } = parseArgs(process.argv.slice(2))

  assert(
    mode === 'INITIAL_PLATFORM_ADMIN_PRODUCTION_BOOTSTRAP',
    'Only INITIAL_PLATFORM_ADMIN_PRODUCTION_BOOTSTRAP is supported.',
  )

  assert(
    Object.keys(options).sort().join(',') ===
      'bootstrap-evidence,confirm-target-ref,enable-production-initial-admin,evidence',
    'Supported options: --enable-production-initial-admin YES --confirm-target-ref <production-ref> --bootstrap-evidence <PASS file> --evidence <new file>.',
  )

  assert(
    options['enable-production-initial-admin'] === 'YES',
    '--enable-production-initial-admin YES is required.',
  )

  assert(
    options['confirm-target-ref'] === productionProjectRef,
    '--confirm-target-ref must match the exact approved Production ref.',
  )

  const bootstrapEvidence = JSON.parse(
    await readFile(options['bootstrap-evidence'], 'utf8'),
  )

  const input = JSON.parse(
    process.env.F6_INITIAL_ADMIN_PRODUCTION_INPUT_JSON || '',
  )

  const result = await executeInitialPlatformAdminBootstrap({
    databaseUrl: process.env.F6_PRODUCTION_DATABASE_URL,
    targetRef: options['confirm-target-ref'],
    supabaseUrl: productionSupabaseApiUrl,
    secretKey:
      process.env.F6_INITIAL_ADMIN_PRODUCTION_SECRET_KEY,
    publishableKey:
      process.env.F6_INITIAL_ADMIN_PRODUCTION_PUBLISHABLE_KEY,
    input,
    bootstrapEvidence,
    evidencePath: options.evidence,
  })

  process.stdout.write(
    `PASS: INITIAL_PLATFORM_ADMIN_PRODUCTION_BOOTSTRAP; AUTH_USERS=${result.counts.authUsers}; USUARIOS=${result.counts.profiles}; KIOSCOS=${result.counts.kiosks}; SUPERADMINS=${result.counts.superadmins}; OWNERS=${result.counts.owners}; evidence=${result.evidencePath}\n`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`BLOCKED: ${safeError(error)}\n`)
    process.exitCode = 2
  })
}
