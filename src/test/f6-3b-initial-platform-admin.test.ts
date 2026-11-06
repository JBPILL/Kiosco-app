// @vitest-environment node
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupInitialAdminEvidence } from './helpers/initialAdminEvidenceCleanup'
import {
  createInitialAdminEvidence,
  executeInitialPlatformAdminBootstrap,
  initialSuperadminRole,
  validateInitialAdminInput,
  validateInitialBootstrapEvidence,
  validateInitialIdentityState,
  validateLocalSupabaseApiUrl,
} from '../../scripts/f6-3b-initial-platform-admin.mjs'

const tempDirectories: string[] = []
const superadminAuth = '00000000-0000-4000-8000-000000000001'
const ownerAuth = '00000000-0000-4000-8000-000000000002'
const input = {
  superadmin: { email: 'platform-admin@synthetic.invalid', password: 'synthetic-superadmin-password-1', nombre: 'Synthetic platform admin' },
  owner: { email: 'first-owner@synthetic.invalid', password: 'synthetic-owner-password-2', nombre: 'Synthetic first owner' },
  kiosco: { nombre: 'Synthetic first kiosk' },
}
const bootstrapEvidence = {
  status: 'PASS', finalStatus: 'PASS', targetProjectRef: 'local', reconciliationStatus: 'PASS',
  expectedMigrableRows: 0, lastPassedStep: 'RECONCILIATION_FINAL',
}

async function createDb({ prepopulate = false } = {}) {
  const db = new PGlite()
  await db.exec(`CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE NOT NULL);
    CREATE TABLE public.kioscos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nombre text NOT NULL);
    CREATE TABLE public.platform_initial_admin_bootstrap_state(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
      status text NOT NULL CHECK(status IN ('IN_PROGRESS','READY','PASS','TAINTED')),initialized_at timestamptz,
      CHECK((status='PASS' AND initialized_at IS NOT NULL) OR (status<>'PASS' AND initialized_at IS NULL)));
    CREATE TABLE public.usuarios(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
      kiosco_id uuid REFERENCES public.kioscos(id) ON DELETE CASCADE, nombre text NOT NULL,email text,
      rol text NOT NULL CHECK(rol IN ('DUEÑO','CAJERO','VISOR')), activo boolean NOT NULL DEFAULT true,
      es_superadmin boolean NOT NULL DEFAULT false,
      CHECK((es_superadmin AND kiosco_id IS NULL) OR (NOT es_superadmin AND kiosco_id IS NOT NULL))
    );`)
  if (prepopulate) await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', ['10000000-0000-4000-8000-000000000001','existing@synthetic.invalid'])
  const client = {
    connected: false,
    async connect() { this.connected = true },
    async query(sql: string, values?: unknown[]) {
      if (sql.includes('pg_advisory_lock') || sql.includes('pg_advisory_unlock')) return { rows: [] }
      const result = await db.query(sql, values)
      return { rows: result.rows as Array<Record<string, unknown>> }
    },
    async end() { this.connected = false },
  }
  return { db, client }
}

async function makeEvidencePath() {
  const folder = await mkdtemp(join(tmpdir(), 'f6-initial-admin-'))
  tempDirectories.push(folder)
  return join(folder, 'initial-admin-evidence.json')
}

function authFetch({ failOwnerLogin = false, failOwnerCreate = false, failOwnerProfile = false } = {}) {
  let nextId = 0
  return async (inputUrl: RequestInfo | URL, init?: RequestInit) => {
    const url = inputUrl instanceof Request ? new URL(inputUrl.url) : new URL(inputUrl)
    if (url.pathname === '/auth/v1/admin/users' && init?.method === 'POST') {
      const payload = JSON.parse(String(init.body)) as { email: string; password: string }
      if (failOwnerCreate && payload.email === input.owner.email) return new Response('{}', { status: 500 })
      nextId += 1
      const id = nextId === 1 ? superadminAuth : ownerAuth
      await (globalThis as unknown as { authDb?: PGlite }).authDb?.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [id,payload.email])
      return Response.json({ id })
    }
    if (url.pathname.startsWith('/auth/v1/admin/users/') && init?.method === 'DELETE') {
      const id = url.pathname.split('/').at(-1)
      await (globalThis as unknown as { authDb?: PGlite }).authDb?.query('DELETE FROM auth.users WHERE id=$1', [id])
      return new Response('{}', { status: 200 })
    }
    if (url.pathname === '/auth/v1/token' && init?.method === 'POST') {
      const payload = JSON.parse(String(init.body)) as { email: string }
      if (failOwnerLogin && payload.email === input.owner.email) return new Response('{}', { status: 400 })
      const id = payload.email === input.superadmin.email ? superadminAuth : ownerAuth
      if (failOwnerProfile && payload.email === input.owner.email) return new Response('{}', { status: 400 })
      return Response.json({ access_token: 'synthetic-token-never-persist', user: { id } })
    }
    return new Response('{}', { status: 404 })
  }
}

afterEach(async () => {
  delete (globalThis as unknown as { authDb?: PGlite }).authDb
  await Promise.all(tempDirectories.splice(0).map(cleanupInitialAdminEvidence))
})

describe('F6.3B-2B initial platform-admin contract', () => {
  it('uses the permitted least-privilege role and rejects invented roles or malformed input', () => {
    expect(initialSuperadminRole).toBe('VISOR')
    expect(validateInitialAdminInput(input).superadmin.email).toBe(input.superadmin.email)
    expect(() => validateInitialAdminInput({ ...input, extra: 'nope' })).toThrow(/unexpected sections/)
    expect(() => validateInitialAdminInput({ ...input, owner: { ...input.owner, password: 'short' } })).toThrow(/12–128/)
    expect(() => validateLocalSupabaseApiUrl('https://example.supabase.co')).toThrow(/HTTP only/)
    expect(() => validateLocalSupabaseApiUrl('http://127.0.0.1:54322')).toThrow(/54321/)
    expect(validateLocalSupabaseApiUrl('http://127.0.0.1:54321').hostname).toBe('127.0.0.1')
  })

  it('requires a complete PASS zero-row bootstrap evidence bound to local', () => {
    expect(validateInitialBootstrapEvidence(bootstrapEvidence)).toBe(bootstrapEvidence)
    expect(() => validateInitialBootstrapEvidence({ ...bootstrapEvidence, finalStatus: 'RUNNING' })).toThrow(/PASS/)
    expect(() => validateInitialBootstrapEvidence({ ...bootstrapEvidence, targetProjectRef: 'wlqujnwxrmksheubfrha' })).toThrow(/local target/)
    expect(() => validateInitialBootstrapEvidence({ ...bootstrapEvidence, expectedMigrableRows: 1 })).toThrow(/zero-row/)
  })

  it('creates exactly one global SuperAdmin and one tenant Owner, authenticates both, and writes secret-free evidence', async () => {
    const { db, client } = await createDb()
    ;(globalThis as unknown as { authDb?: PGlite }).authDb = db
    const evidencePath = await makeEvidencePath()
    const verifyPrivileges = async () => 'PASS' as const
    const result = await executeInitialPlatformAdminBootstrap({
      databaseUrl: 'postgresql://postgres:synthetic@127.0.0.1:54322/postgres',
      supabaseUrl: 'http://127.0.0.1:54321', serviceRoleKey: 'synthetic-local-service-role-key', publicKey: 'synthetic-local-public-key',
      input, bootstrapEvidence, evidencePath, clientFactory: () => client, fetchImpl: authFetch(), verifyPrivileges,
      now: () => '2026-10-13T12:00:00.000Z',
    })
    expect(result).toMatchObject({ status: 'PASS', counts: { authUsers: 2, profiles: 2, kiosks: 1, superadmins: 1, owners: 1 } })
    const rows = await db.query<{ rol: string; activo: boolean; es_superadmin: boolean; kiosco_id: string | null }>('SELECT rol,activo,es_superadmin,kiosco_id FROM public.usuarios ORDER BY es_superadmin DESC')
    expect(rows.rows[0]).toMatchObject({ rol: 'VISOR', activo: true, es_superadmin: true, kiosco_id: null })
    expect(rows.rows[1]).toMatchObject({ rol: 'DUEÑO', activo: true, es_superadmin: false })
    expect((await db.query<{ status: string }>('SELECT status FROM public.platform_initial_admin_bootstrap_state')).rows[0].status).toBe('PASS')
    const evidence = await readFile(evidencePath, 'utf8')
    expect(evidence).toContain('"finalStatus": "PASS"')
    expect(evidence).not.toMatch(/synthetic-superadmin-password|synthetic-owner-password|platform-admin@|first-owner@|service-role-key|access_token/i)
    await db.close()
  }, 30_000)

  it('blocks an already initialized Auth target without deleting existing state', async () => {
    const { db, client } = await createDb({ prepopulate: true })
    ;(globalThis as unknown as { authDb?: PGlite }).authDb = db
    const evidencePath = await makeEvidencePath()
    await expect(executeInitialPlatformAdminBootstrap({
      databaseUrl: 'postgresql://postgres:synthetic@127.0.0.1:54322/postgres',
      supabaseUrl: 'http://127.0.0.1:54321', serviceRoleKey: 'synthetic-local-service-role-key', publicKey: 'synthetic-local-public-key',
      input, bootstrapEvidence, evidencePath, clientFactory: () => client, fetchImpl: authFetch(),
    })).rejects.toThrow(/BLOCKED_NO_WRITES/)
    expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM auth.users')).rows[0].n).toBe(1)
    await db.close()
  }, 30_000)

  it('permanently blocks a previously passed initialization marker even if business rows were removed', async () => {
    const { db, client } = await createDb()
    ;(globalThis as unknown as { authDb?: PGlite }).authDb = db
    await db.query("INSERT INTO public.platform_initial_admin_bootstrap_state(singleton,status,initialized_at) VALUES(true,'PASS',now())")
    const evidencePath = await makeEvidencePath()
    await expect(executeInitialPlatformAdminBootstrap({
      databaseUrl: 'postgresql://postgres:synthetic@127.0.0.1:54322/postgres',
      supabaseUrl: 'http://127.0.0.1:54321', serviceRoleKey: 'synthetic-local-service-role-key', publicKey: 'synthetic-local-public-key',
      input, bootstrapEvidence, evidencePath, clientFactory: () => client, fetchImpl: authFetch(),
    })).rejects.toThrow(/already initialized/)
    expect((await db.query<{ status: string }>('SELECT status FROM public.platform_initial_admin_bootstrap_state')).rows[0].status).toBe('PASS')
    await db.close()
  }, 30_000)

  it('compensates a profile transaction failure and leaves no Auth or business rows', async () => {
    const { db, client } = await createDb()
    ;(globalThis as unknown as { authDb?: PGlite }).authDb = db
    await db.exec(`CREATE FUNCTION public.fail_owner_profile() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.rol='DUEÑO' THEN RAISE EXCEPTION 'synthetic profile failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_owner_profile BEFORE INSERT ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.fail_owner_profile();`)
    const evidencePath = await makeEvidencePath()
    await expect(executeInitialPlatformAdminBootstrap({
      databaseUrl: 'postgresql://postgres:synthetic@127.0.0.1:54322/postgres',
      supabaseUrl: 'http://127.0.0.1:54321', serviceRoleKey: 'synthetic-local-service-role-key', publicKey: 'synthetic-local-public-key',
      input, bootstrapEvidence, evidencePath, clientFactory: () => client, fetchImpl: authFetch(),
    })).rejects.toThrow(/FAILED_COMPENSATED/)
    expect((await db.query<{ auth: number; profiles: number; kiosks: number }>('SELECT (SELECT count(*) FROM auth.users)::int AS auth,(SELECT count(*) FROM public.usuarios)::int AS profiles,(SELECT count(*) FROM public.kioscos)::int AS kiosks')).rows[0])
      .toEqual({ auth: 0, profiles: 0, kiosks: 0 })
    expect(JSON.parse(await readFile(evidencePath, 'utf8')).finalStatus).toBe('FAILED_COMPENSATED')
    await db.close()
  }, 30_000)

  it('classifies invalid final identity combinations as failed closed', () => {
    const valid = { authUsers: 2, profiles: 2, kiosks: 1, superadmins: 1, owners: 1, activeProfiles: 2,
      authMappings: 2, authIdsMatch: true, superadminRole: 'VISOR', superadminNullKiosk: true, ownerKioskAssigned: true }
    expect(validateInitialIdentityState(valid, [superadminAuth, ownerAuth])).toBe(valid)
    expect(() => validateInitialIdentityState({ ...valid, superadmins: 2 }, [superadminAuth, ownerAuth])).toThrow(/exactly 1 SuperAdmin/)
    expect(() => validateInitialIdentityState({ ...valid, superadminRole: 'SUPERADMIN' }, [superadminAuth, ownerAuth])).toThrow(/least-privilege/)
    expect(() => validateInitialIdentityState({ ...valid, ownerKioskAssigned: false }, [superadminAuth, ownerAuth])).toThrow(/initial kiosk/)
  })

  it('evidence contains no Auth credentials or account identifiers', () => {
    const evidence = createInitialAdminEvidence({ bootstrapEvidenceSha256: 'a'.repeat(64), now: '2026-10-13T00:00:00.000Z' })
    expect(JSON.stringify(evidence)).not.toMatch(/email|password|token|service_role|auth_user_id|synthetic/i)
  })
})
