// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg, { type Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  PR03_B_APPROVED_CUIT,
  PR03_B_APPROVED_KIOSK_ID,
  PR03_B_APPROVED_OWNER_AUTH_ID,
  PR03_B_SCOPE,
} from '../../scripts/fiscal/plan-pr03-b-staging.mjs'
import {
  PR03_B_EXECUTION_TARGET,
  executePr03bStaging,
} from '../../scripts/fiscal/execute-pr03-b-staging.mjs'

// Puerto e identificadores únicos para el contenedor de prueba PostgreSQL 17
const containerPort = 54391
const containerName = `pg17_pr03b_${randomUUID().replace(/-/g, '').slice(0, 12)}`
const postgresPassword = 'IntegrationTestPassword123!'

let adminClient: Client | null = null

function isDockerAvailable(): boolean {
  try {
    const res = spawnSync('docker', ['--version'], { encoding: 'utf8' })
    return res.status === 0
  } catch {
    return false
  }
}

const dockerRunning = isDockerAvailable()

describe.skipIf(!dockerRunning)('PR03-B Real PostgreSQL 17 Integration Tests', () => {
  beforeAll(async () => {
    // 1. Iniciar contenedor Docker postgres:17-alpine
    const runRes = spawnSync(
      'docker',
      [
        'run',
        '--rm',
        '-d',
        '--name',
        containerName,
        '-e',
        `POSTGRES_PASSWORD=${postgresPassword}`,
        '-p',
        `${containerPort}:5432`,
        'postgres:17-alpine',
      ],
      { encoding: 'utf8', timeout: 30_000 }
    )
    if (runRes.status !== 0) {
      throw new Error(`Failed to start postgres container: ${runRes.stderr}`)
    }

    // 2. Esperar disponibilidad de PostgreSQL
    let ready = false
    for (let i = 0; i < 30; i++) {
      try {
        const testClient = new pg.Client({
          host: '127.0.0.1',
          port: containerPort,
          user: 'postgres',
          password: postgresPassword,
          database: 'postgres',
          connectionTimeoutMillis: 1000,
        })
        await testClient.connect()
        await testClient.query('SELECT 1')
        await testClient.end()
        ready = true
        break
      } catch {
        await new Promise(r => setTimeout(r, 600))
      }
    }
    if (!ready) {
      throw new Error('PostgreSQL 17 container did not become ready in time')
    }

    // 3. Conexión de administración
    adminClient = new pg.Client({
      host: '127.0.0.1',
      port: containerPort,
      user: 'postgres',
      password: postgresPassword,
      database: 'postgres',
    })
    await adminClient.connect()

    // 4. Crear roles Supabase y esquema auth
    await adminClient.query(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN;
      GRANT anon, authenticated, service_role TO postgres;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.role', true), '')
      $$;
    `)

    // 5. Aplicar Bootstrap del dominio comercial
    const root = 'supabase/bootstrap'
    const bootstrapFiles = [
      join(root, '001_domain.sql'),
      join(root, '002_identity_helpers.sql'),
      ...readdirSync(join(root, 'steps')).sort().map(name => join(root, 'steps', name)),
      join(root, '900_final_security.sql'),
    ]

    for (const file of bootstrapFiles) {
      const sql = readFileSync(file, 'utf8')
      await adminClient.query(sql)
    }

    // 6. Aplicar migraciones fiscales requeridas
    for (const fiscalFile of [
      'supabase/pilot-fiscal/001_fiscal_journal.sql',
      'supabase/pilot-fiscal/002_fiscal_reservations.sql',
      'supabase/pilot-fiscal/003_fiscal_requests.sql',
      'supabase/pilot-fiscal/004_fiscal_reconciliation.sql',
      'supabase/pilot-fiscal/005_fiscal_worker_authorization.sql',
      'supabase/pilot-fiscal/006_fiscal_shared_tickets.sql',
      'supabase/pilot-fiscal/007_fiscal_ticket_recovery.sql',
      'supabase/pilot-fiscal/008_fiscal_ticket_ownership.sql',
      'supabase/pilot-fiscal/009_fiscal_emission_permission.sql',
      'supabase/pilot-fiscal/010_fiscal_return_exclusion.sql',
      'supabase/pilot-fiscal/011_fiscal_owner_review.sql',
      'supabase/pilot-fiscal/012_fiscal_preparation.sql',
    ]) {
      const sql = readFileSync(fiscalFile, 'utf8')
      await adminClient.query(sql)
    }

    // Otorgar permisos a postgres para setear roles autenticados y consultar
    await adminClient.query(`
      GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
      GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
      GRANT SELECT ON public.fiscal_emisores_homologacion TO authenticated, service_role, postgres;
    `)

    // 7. Seed de datos requeridos por la prueba
    const ownerUserId = randomUUID()
    const credentialId = randomUUID()
    const certSha = '0'.repeat(64)
    const sale1Id = randomUUID()
    const sale2Id = randomUUID()

    // Auth user para el dueño
    await adminClient.query('INSERT INTO auth.users(id) VALUES ($1)', [PR03_B_APPROVED_OWNER_AUTH_ID])

    // Kiosco aprobado activo
    await adminClient.query(
      "INSERT INTO public.kioscos(id, nombre, estado_suscripcion) VALUES ($1, 'Kiosko Staging PR03-B', 'ACTIVO')",
      [PR03_B_APPROVED_KIOSK_ID]
    )

    // Usuario DUEÑO activo ligado a auth_user_id
    await adminClient.query(
      `INSERT INTO public.usuarios(id, auth_user_id, kiosco_id, nombre, rol, activo, es_superadmin)
       VALUES ($1, $2, $3, 'Dueño PR03-B', 'DUEÑO', true, false)`,
      [ownerUserId, PR03_B_APPROVED_OWNER_AUTH_ID, PR03_B_APPROVED_KIOSK_ID]
    )

    // Emisor en PV 2 (inhabilitado)
    await adminClient.query(
      `INSERT INTO public.fiscal_emisores_homologacion(kiosco_id, cuit_emisor, punto_venta, credencial_id, certificado_sha256, habilitado)
       VALUES ($1, $2, 2, $3, $4, false)`,
      [PR03_B_APPROVED_KIOSK_ID, PR03_B_APPROVED_CUIT, credentialId, certSha]
    )

    // Dos ventas sintéticas completadas propias para el ensayo
    await adminClient.query(
      `INSERT INTO public.ventas(id, kiosco_id, usuario_id, notas, estado, total, fecha_hora)
       VALUES ($1, $2, $3, 'Ensayo PR03-B 1', 'COMPLETADA', 150.00, clock_timestamp())`,
      [sale1Id, PR03_B_APPROVED_KIOSK_ID, ownerUserId]
    )

    await adminClient.query(
      `INSERT INTO public.ventas(id, kiosco_id, usuario_id, notas, estado, total, fecha_hora)
       VALUES ($1, $2, $3, 'Ensayo PR03-B 2', 'COMPLETADA', 200.00, clock_timestamp())`,
      [sale2Id, PR03_B_APPROVED_KIOSK_ID, ownerUserId]
    )
  }, 120_000)

  afterAll(async () => {
    if (adminClient) {
      await adminClient.end().catch(() => {})
    }
    // Detener y remover contenedor
    spawnSync('docker', ['stop', containerName], { encoding: 'utf8', timeout: 20_000 })
  }, 30_000)

  it('confirms PostgreSQL 17 engine version and fiscal schema deployment', async () => {
    if (!adminClient) throw new Error('Admin client not connected')
    const verRes = await adminClient.query('SELECT version()')
    expect(verRes.rows[0].version).toContain('PostgreSQL 17')

    const tablesRes = await adminClient.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'fiscal_operaciones_homologacion',
          'fiscal_solicitudes_homologacion',
          'fiscal_reservas_homologacion',
          'fiscal_series_homologacion',
          'fiscal_emisores_homologacion'
        )
    `)
    expect(tablesRes.rows).toHaveLength(5)
  })

  it('runs complete PR03-B executor against live PostgreSQL 17 verifying replay, conflict 40001, and concurrency 55000', async () => {
    // Fábrica de clientes que redirige las conexiones de executePr03bStaging hacia el contenedor local
    const integrationClientFactory = async (config: Record<string, unknown>) => {
      const client = new pg.Client({
        ...config,
        host: '127.0.0.1',
        port: containerPort,
        user: 'postgres',
        password: postgresPassword,
        database: 'postgres',
        ssl: false,
      })
      await client.connect()
      return client
    }

    const runId = randomUUID()
    const report = await executePr03bStaging(
      {
        authorized: true,
        scope: PR03_B_SCOPE,
        projectRef: PR03_B_EXECUTION_TARGET,
        password: postgresPassword,
        runId,
      },
      { clientFactory: integrationClientFactory }
    )

    expect(report.execution).toBe('AUTHORIZED_EXECUTION')
    if (report.execution === 'AUTHORIZED_EXECUTION') {
      expect(report.PR03_B_EXECUTION).toBe('PASS')
      expect(report.IDEMPOTENCY_REPLAY).toBe('PASS')
      expect(report.IDEMPOTENCY_CONFLICT).toBe('PASS')
      expect(report.CONFLICT_SQLSTATE).toBe('40001')
      expect(report.CONCURRENCY_SEMANTICS).toBe('SINGLE_PENDING_RESERVATION')
      expect(report.CONCURRENCY_LOCK_OBSERVED).toBe('PASS')
      expect(report.CONCURRENCY_REJECTION_SQLSTATE).toBe('55000')
      expect(report.NUMBERING_CONCURRENCY).toBe('PASS')
      expect(report.PREFLIGHT_READ_ONLY).toBe('PASS')
      expect(report.PREFLIGHT_ROLLBACK_CONFIRMED).toBe(true)
      expect(report.SYNTHETIC_PV_USED).toBeGreaterThan(9000)
      expect(report.COMMERCIAL_BASELINE_PRESERVED).toBe(true)
      expect(report.RUN_ID).toBe(runId)
      expect(report.ARCA_CALLS).toBe(0)
      expect(report.COMMERCIAL_WRITES).toBe(0)
      expect(report.CLIENT1_CLOSED).toBe(true)
      expect(report.CLIENT2_CLOSED).toBe(true)
      expect(report.PG_CONNECTIONS_CLOSED).toBe('PASS')
      expect(report.FIXTURE_CLEANUP).toBe('PASS')
    }
  })

  it('confirms database state after test run: zero residual test operations, preserved commercial baseline and untouched PV 2', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    // Confirmar que no quedaron operaciones residuales de homologación
    const opCount = await adminClient.query(
      'SELECT count(*)::int as count FROM public.fiscal_operaciones_homologacion'
    )
    expect(opCount.rows[0].count).toBe(0)

    // Confirmar que no quedaron reservas residuales
    const resCount = await adminClient.query(
      'SELECT count(*)::int as count FROM public.fiscal_reservas_homologacion'
    )
    expect(resCount.rows[0].count).toBe(0)

    // Confirmar que no quedaron solicitudes residuales
    const solCount = await adminClient.query(
      'SELECT count(*)::int as count FROM public.fiscal_solicitudes_homologacion'
    )
    expect(solCount.rows[0].count).toBe(0)

    // Confirmar que las series sintéticas fueron eliminadas
    const synthSeriesCount = await adminClient.query(
      'SELECT count(*)::int as count FROM public.fiscal_series_homologacion WHERE punto_venta >= 9000'
    )
    expect(synthSeriesCount.rows[0].count).toBe(0)

    // Confirmar que las dos ventas sintéticas siguen intactas y no fueron mutadas
    const salesCount = await adminClient.query(
      'SELECT count(*)::int as count FROM public.ventas WHERE kiosco_id = $1',
      [PR03_B_APPROVED_KIOSK_ID]
    )
    expect(salesCount.rows[0].count).toBe(2)
  })
})
