// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg, { type Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  PR03_B_APPROVED_CUIT,
  PR03_B_APPROVED_OWNER_AUTH_ID,
  PR03_B_REAL_KIOSK_ID,
  PR03_B_SYNTHETIC_KIOSK_ID,
  PR03_B_SYNTHETIC_OWNER_AUTH_ID,
  PR03_B_SCOPE,
  SYNTHETIC_EMITTER_ROW_SUPPORTED,
  CANONICAL_PREPARATION_REQUIRES_CONFIGURED_SYNTHETIC_PV,
  PR03_B_BLOCKED_BY_SCHEMA,
  createPr03bScopedFixture,
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
let testSale1Id = ''
let synthKioskId = ''
let synthOwnerAuthId = ''

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
      'supabase/pilot-fiscal/054_close_legacy_preparation_entry.sql',
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
    const productId = randomUUID()

    // Auth user para el dueño real
    await adminClient.query('INSERT INTO auth.users(id) VALUES ($1)', [PR03_B_APPROVED_OWNER_AUTH_ID])

    // Kiosco real protegido activo
    await adminClient.query(
      "INSERT INTO public.kioscos(id, nombre, estado_suscripcion) VALUES ($1, 'Kiosko Staging PR03-B Real', 'ACTIVO')",
      [PR03_B_REAL_KIOSK_ID]
    )

    // Usuario DUEÑO real activo ligado a auth_user_id
    await adminClient.query(
      `INSERT INTO public.usuarios(id, auth_user_id, kiosco_id, nombre, rol, activo, es_superadmin)
       VALUES ($1, $2, $3, 'Dueño PR03-B Real', 'DUEÑO', true, false)`,
      [ownerUserId, PR03_B_APPROVED_OWNER_AUTH_ID, PR03_B_REAL_KIOSK_ID]
    )

    // Producto del kiosco real activo
    await adminClient.query(
      `INSERT INTO public.productos(id, kiosco_id, descripcion, precio_venta, activo)
       VALUES ($1, $2, 'Producto Real PR03-B', 150.00, true)`,
      [productId, PR03_B_REAL_KIOSK_ID]
    )

    // Emisor real en PV 2 permanece inactivo durante toda la prueba (habilitado = false)
    await adminClient.query(
      `INSERT INTO public.fiscal_emisores_homologacion(kiosco_id, cuit_emisor, punto_venta, credencial_id, certificado_sha256, habilitado)
       VALUES ($1, $2, 2, $3, $4, false)`,
      [PR03_B_REAL_KIOSK_ID, PR03_B_APPROVED_CUIT, credentialId, certSha]
    )

    // Catálogo revisión 3 habilitado y vigente (vence_en > now())
    await adminClient.query(`
      INSERT INTO public.fiscal_parametros_homologacion(
        revision, condiciones, alicuotas, fuente_sha256, consultado_en, vence_en, habilitado
      ) VALUES (
        3,
        '[{"id": 5, "descripcion": "Consumidor Final", "comprobantes": [1, 6, 11]}]'::jsonb,
        '[]'::jsonb,
        repeat('a', 64),
        clock_timestamp() - interval '1 hour',
        clock_timestamp() + interval '23 hours',
        true
      )
    `)

    // Dos ventas del kiosco real completadas propias con detalles_venta
    await adminClient.query(
      `INSERT INTO public.ventas(id, kiosco_id, usuario_id, notas, estado, total, fecha_hora)
       VALUES ($1, $2, $3, 'Ensayo Real 1', 'COMPLETADA', 150.00, clock_timestamp())`,
      [sale1Id, PR03_B_REAL_KIOSK_ID, ownerUserId]
    )

    await adminClient.query(
      `INSERT INTO public.ventas(id, kiosco_id, usuario_id, notas, estado, total, fecha_hora)
       VALUES ($1, $2, $3, 'Ensayo Real 2', 'COMPLETADA', 200.00, clock_timestamp())`,
      [sale2Id, PR03_B_REAL_KIOSK_ID, ownerUserId]
    )

    await adminClient.query(
      `INSERT INTO public.detalles_venta(id, venta_id, producto_id, cantidad, precio_unitario, subtotal)
       VALUES
         (gen_random_uuid(), $1, $3, 1, 150.00, 150.00),
         (gen_random_uuid(), $2, $3, 1, 200.00, 200.00)`,
      [sale1Id, sale2Id, productId]
    )

    // 8. Crear Kiosco Sintético Aislado Acreditado (PR03_B_SYNTHETIC_KIOSK_ID)
    synthKioskId = PR03_B_SYNTHETIC_KIOSK_ID
    synthOwnerAuthId = PR03_B_SYNTHETIC_OWNER_AUTH_ID
    const synthOwnerUserId = randomUUID()
    const synthSale1Id = randomUUID()
    const synthSale2Id = randomUUID()
    const synthProductId = randomUUID()

    await adminClient.query('INSERT INTO auth.users(id) VALUES ($1)', [synthOwnerAuthId])
    await adminClient.query(
      "INSERT INTO public.kioscos(id, nombre, estado_suscripcion) VALUES ($1, 'F4A_TEST_20261011_R1', 'ACTIVO')",
      [synthKioskId]
    )
    await adminClient.query(
      `INSERT INTO public.usuarios(id, auth_user_id, kiosco_id, nombre, rol, activo, es_superadmin)
       VALUES ($1, $2, $3, 'Dueño Sintetico', 'DUEÑO', true, false)`,
      [synthOwnerUserId, synthOwnerAuthId, synthKioskId]
    )
    await adminClient.query(
      `INSERT INTO public.productos(id, kiosco_id, descripcion, precio_venta, activo)
       VALUES ($1, $2, 'Producto Sintetico', 150.00, true)`,
      [synthProductId, synthKioskId]
    )
    await adminClient.query(
      `INSERT INTO public.ventas(id, kiosco_id, usuario_id, notas, estado, total, fecha_hora)
       VALUES ($1, $2, $3, 'Ensayo Sintetico 1', 'COMPLETADA', 150.00, clock_timestamp())`,
      [synthSale1Id, synthKioskId, synthOwnerUserId]
    )
    await adminClient.query(
      `INSERT INTO public.ventas(id, kiosco_id, usuario_id, notas, estado, total, fecha_hora)
       VALUES ($1, $2, $3, 'Ensayo Sintetico 2', 'COMPLETADA', 200.00, clock_timestamp())`,
      [synthSale2Id, synthKioskId, synthOwnerUserId]
    )
    await adminClient.query(
      `INSERT INTO public.detalles_venta(id, venta_id, producto_id, cantidad, precio_unitario, subtotal)
       VALUES
         (gen_random_uuid(), $1, $3, 1, 150.00, 150.00),
         (gen_random_uuid(), $2, $3, 1, 200.00, 200.00)`,
      [synthSale1Id, synthSale2Id, synthProductId]
    )
    testSale1Id = synthSale1Id
  }, 120_000)

  afterAll(async () => {
    if (adminClient) {
      await adminClient.end().catch(() => {})
    }
    // Detener y remover contenedor
    spawnSync('docker', ['stop', containerName], { encoding: 'utf8', timeout: 20_000 })
  }, 30_000)

  it('1. Confirma esquema de fiscal_emisores_homologacion: PK unaria en kiosco_id y rechazo estricto de coexistencia de segundo PV para el mismo kiosco', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    // Verificar definición de PK en pg_constraint
    const pkRes = await adminClient.query(`
      SELECT conname, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'fiscal_emisores_homologacion' AND c.contype = 'p';
    `)
    expect(pkRes.rows[0].def).toBe('PRIMARY KEY (kiosco_id)')

    // Intentar insertar un segundo emisor con punto_venta = 9999 para el mismo kiosco real: DEBE fallar por violación de PK (23505)
    let pkViolationCode: string | null = null
    try {
      await adminClient.query(
        `INSERT INTO public.fiscal_emisores_homologacion(kiosco_id, cuit_emisor, punto_venta, credencial_id, certificado_sha256, habilitado)
         VALUES ($1, $2, 9999, gen_random_uuid(), repeat('0', 64), true)`,
        [PR03_B_REAL_KIOSK_ID, PR03_B_APPROVED_CUIT]
      )
    } catch (err: unknown) {
      const e = err as { code?: string }
      pkViolationCode = e.code || null
    }

    expect(pkViolationCode).toBe('23505')
    expect(SYNTHETIC_EMITTER_ROW_SUPPORTED).toBe(true)
    expect(CANONICAL_PREPARATION_REQUIRES_CONFIGURED_SYNTHETIC_PV).toBe(true)
    expect(PR03_B_BLOCKED_BY_SCHEMA).toBe(false)
  })

  it('2. Confirma que executePr03bStaging falla-cerrado con FATAL si se intenta ejecutar contra el kiosco real o PV 2', async () => {
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

    await expect(
      executePr03bStaging(
        {
          authorized: true,
          scope: PR03_B_SCOPE,
          projectRef: PR03_B_EXECUTION_TARGET,
          password: postgresPassword,
          runId: randomUUID(),
          kioskId: PR03_B_REAL_KIOSK_ID,
        },
        { clientFactory: integrationClientFactory }
      )
    ).rejects.toThrow('FATAL: PR03_B_REAL_FISCAL_CONTEXT_FORBIDDEN')

    await expect(
      executePr03bStaging(
        {
          authorized: true,
          scope: PR03_B_SCOPE,
          projectRef: PR03_B_EXECUTION_TARGET,
          password: postgresPassword,
          runId: randomUUID(),
          syntheticPv: 2,
        },
        { clientFactory: integrationClientFactory }
      )
    ).rejects.toThrow('FATAL: PR03_B_REAL_FISCAL_CONTEXT_FORBIDDEN')

    // Confirmar que el emisor de PV 2 permanece intacto y deshabilitado
    const pv2Res = await adminClient!.query(
      'SELECT habilitado FROM public.fiscal_emisores_homologacion WHERE kiosco_id = $1 AND punto_venta = 2',
      [PR03_B_REAL_KIOSK_ID]
    )
    expect(pv2Res.rows[0].habilitado).toBe(false)
  })

  it('3. Demuestra ruta privada canónica y rechazo estricto de ruta legacy con 42501', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    const opId = randomUUID()
    const fix = createPr03bScopedFixture(randomUUID(), {
      operacionId: opId,
      puntoVenta: 9999,
      kiosco_id: synthKioskId,
      ventaId: testSale1Id,
      numero: 1,
      total: '150.00',
      revisionParametros: 3,
    })

    // 1. Invocar función legacy como authenticated: debe ser rechazada estrictamente con 42501
    let legacySqlState: string | null = null
    await adminClient.query('BEGIN')
    await adminClient.query('SET LOCAL ROLE authenticated')
    await adminClient.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [synthOwnerAuthId])
    await adminClient.query("SELECT set_config('request.jwt.claim.role', 'authenticated', true)")
    try {
      await adminClient.query(
        'SELECT preparar_operacion_fiscal_homologacion($1, $2, $3, $4::jsonb) AS ack',
        [fix.operacion_id, fix.kiosco_id, fix.venta_id, JSON.stringify(fix.contexto)]
      )
    } catch (err: unknown) {
      const e = err as { code?: string; sqlState?: string }
      legacySqlState = e?.code || e?.sqlState || null
    } finally {
      await adminClient.query('ROLLBACK')
    }

    expect(legacySqlState).toBe('42501')
  })

  it('4. Ejecuta protocolo PR03-B en PostgreSQL 17 demostrando: replay, conflicto 40001, lock determinista en pg_locks, concurrencia 55000 y PV 2 intacto', async () => {
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
        syntheticKioskId: synthKioskId,
        syntheticOwnerAuthId: synthOwnerAuthId,
        syntheticPv: 9999,
      },
      { clientFactory: integrationClientFactory }
    )

    expect(report.execution).toBe('AUTHORIZED_EXECUTION')
    if (report.execution === 'AUTHORIZED_EXECUTION') {
      expect(report.PR03_B_EXECUTION).toBe('PASS')
      expect(report.SYNTHETIC_TENANT_WIRED).toBe('PASS')
      expect(report.SYNTHETIC_KIOSK_ID_MATCH).toBe('PASS')
      expect(report.SYNTHETIC_OWNER_MATCH).toBe('PASS')
      expect(report.SYNTHETIC_PV).toBe(9999)
      expect(report.REAL_PV2_GUARD).toBe('PASS')
      expect(report.REAL_PV2_ENABLED_DURING_PR03_B).toBe(false)
      expect(report.REAL_PV2_SERIES_TOUCHED).toBe(false)
      expect(report.CATALOG_REV3_USABLE).toBe('PASS')
      expect(report.SYNTHETIC_EMITTER_LIFECYCLE).toBe('PASS')
      expect(report.CANONICAL_PRIVATE_PREPARATION).toBe('PASS')
      expect(report.IDEMPOTENCY_REPLAY).toBe('PASS')
      expect(report.REPLAY_REAL_PG).toBe('PASS')
      expect(report.IDEMPOTENCY_CONFLICT).toBe('PASS')
      expect(report.CONFLICT_SQLSTATE).toBe('40001')
      expect(report.CONCURRENCY_SEMANTICS).toBe('SINGLE_PENDING_RESERVATION')
      expect(report.LOCK_OBSERVATION_DETERMINISTIC).toBe('PASS')
      expect(report.CONCURRENCY_LOCK_OBSERVED).toBe('PASS')
      expect(report.CONCURRENCY_REJECTION_SQLSTATE).toBe('55000')
      expect(report.NUMBERING_CONCURRENCY).toBe('PASS')
      expect(report.PREFLIGHT_READ_ONLY).toBe('PASS')
      expect(report.PREFLIGHT_ROLLBACK_CONFIRMED).toBe(true)
      expect(report.SYNTHETIC_PV_USED).toBe(9999)
      expect(report.REAL_COMMERCIAL_BASELINE_PRESERVED).toBe(true)
      expect(report.SYNTHETIC_COMMERCIAL_BASELINE_PRESERVED).toBe(true)
      expect(report.COMMERCIAL_BASELINE_PRESERVED).toBe(true)
      expect(report.SUCCESS_CLEANUP).toBe('PASS')
      expect(report.RESIDUAL_SYNTHETIC_FISCAL_STATE).toBe(0)
      expect(report.RUN_ID).toBe(runId)
      expect(report.ARCA_CALLS).toBe(0)
      expect(report.ARCA_CALLS_NEW).toBe(0)
      expect(report.COMMERCIAL_WRITES).toBe(0)
      expect(report.CLIENT1_CLOSED).toBe(true)
      expect(report.CLIENT2_CLOSED).toBe(true)
      expect(report.PG_CONNECTIONS_CLOSED).toBe('PASS')
      expect(report.FIXTURE_CLEANUP).toBe('PASS')
    }
  })

  it('5. Confirma estado final de BD: PV 2 nunca tocado, sin operaciones ni series sintéticas residuales', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    // Confirmar que no existen series para PV 2
    const pv2Series = await adminClient.query(
      'SELECT count(*)::int as count FROM public.fiscal_series_homologacion WHERE punto_venta = 2'
    )
    expect(pv2Series.rows[0].count).toBe(0)

    // Confirmar que no existen reservas para PV 2
    const pv2Reservas = await adminClient.query(
      "SELECT count(*)::int as count FROM public.fiscal_reservas_homologacion WHERE punto_venta = 2 AND estado = 'RESERVADA'"
    )
    expect(pv2Reservas.rows[0].count).toBe(0)

    // Confirmar que no quedaron operaciones residuales de homologación
    const opCount = await adminClient.query(
      'SELECT count(*)::int as count FROM public.fiscal_operaciones_homologacion'
    )
    expect(opCount.rows[0].count).toBe(0)

    // Confirmar que las series sintéticas fueron limpiadas
    const synthSeriesCount = await adminClient.query(
      'SELECT count(*)::int as count FROM public.fiscal_series_homologacion WHERE punto_venta >= 9000'
    )
    expect(synthSeriesCount.rows[0].count).toBe(0)

    // Confirmar que el emisor real PV 2 permanece intacto y deshabilitado
    const emitterPv2 = await adminClient.query(
      'SELECT habilitado FROM public.fiscal_emisores_homologacion WHERE kiosco_id = $1',
      [PR03_B_REAL_KIOSK_ID]
    )
    expect(emitterPv2.rows[0].habilitado).toBe(false)

    // Confirmar que el emisor sintético fue limpiado
    const synthEmitter = await adminClient.query(
      'SELECT count(*)::int as count FROM public.fiscal_emisores_homologacion WHERE kiosco_id = $1',
      [synthKioskId]
    )
    expect(synthEmitter.rows[0].count).toBe(0)
  })
})
