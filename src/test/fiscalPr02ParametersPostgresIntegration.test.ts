// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg, { type Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  PR02_P1_SCOPE,
  PR02_P2_SCOPE,
  PR02_PARAMETERS_TARGET_PROJECT_REF,
  PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
  PR02_PARAMETERS_EXPECTED_ISSUER_PV,
  PR02_CATALOG_REV3_HASH,
  REV3_SOURCE_SHA256,
  computeCatalogRowDigest,
  PR02_EXECUTION_OUTCOMES,
  UNCERTAIN_WRITE_RETRY_FORBIDDEN,
  PR02_P1_PREFLIGHT_SELECT_SQL,
  PR02_P1_ATOMIC_GUARD_SQL,
  PR02_P2_ATOMIC_GUARD_SQL,
  verifyPr02P1Preflight,
  verifyPr02P1InTxGuard,
  verifyPr02P2InTxGuard,
} from '../../scripts/fiscal/plan-pr02-parameters.mjs'
import { executePr02ParametersStaging } from '../../scripts/fiscal/execute-pr02-parameters-staging.mjs'
import { PR02_TARGET_KIOSK_ID } from '../../scripts/fiscal/plan-pr02-staging.mjs'

// Puerto e identificadores únicos para el contenedor de prueba PostgreSQL 17
const containerPort = 54393
const containerName = `pg17_pr02p_${randomUUID().replace(/-/g, '').slice(0, 12)}`
const postgresPassword = 'IntegrationTestPasswordPr02Parameters!'
const VALID_HEAD = 'dee0ef6d0550d78d441a92c3a8b29c9a746ab15b'

let adminClient: Client | null = null
let testOwnerUserId = ''
let testOwnerAuthId = ''
let testProductId = ''
let testSaleId = ''
let generatedRev4Hash = ''

function isDockerAvailable(): boolean {
  try {
    const res = spawnSync('docker', ['--version'], { encoding: 'utf8' })
    return res.status === 0
  } catch {
    return false
  }
}

const dockerRunning = isDockerAvailable()

function createTestClient(): Client {
  return new pg.Client({
    host: '127.0.0.1',
    port: containerPort,
    user: 'postgres',
    password: postgresPassword,
    database: 'postgres',
  })
}

// Evidencia sintética oficial conforme para TiposIva y CondicionIvaReceptor
const nowIso = new Date().toISOString()
const SYNTHETIC_IVA_EVIDENCE = JSON.stringify({
  version: 1,
  entorno: 'HOMOLOGACION',
  operacion: 'FEParamGetTiposIva',
  origen: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  consultado_en: nowIso,
  respuesta_sha256: 'a'.repeat(64),
  parametros: [
    { Id: 5, Description: '21%', VoucherClasses: '', ValidFrom: '20100917', ValidUntil: 'NULL' },
    { Id: 4, Description: '10.5%', VoucherClasses: '', ValidFrom: '20100917', ValidUntil: 'NULL' },
  ],
  importado_en_staging: false,
  emision_habilitada: false,
})

const SYNTHETIC_CONDITION_EVIDENCE = JSON.stringify({
  version: 1,
  entorno: 'HOMOLOGACION',
  operacion: 'FEParamGetCondicionIvaReceptor',
  origen: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  consultado_en: nowIso,
  respuesta_sha256: 'b'.repeat(64),
  parametros: [
    { Id: 1, Description: 'IVA Responsable Inscripto', VoucherClasses: 'A/ALEY/C', ValidFrom: '', ValidUntil: '' },
    { Id: 5, Description: 'Consumidor Final', VoucherClasses: 'B/C', ValidFrom: '', ValidUntil: '' },
  ],
  importado_en_staging: false,
  emision_habilitada: false,
})

describe.skipIf(!dockerRunning)('PR02-P1 & PR02-P2 Real PostgreSQL 17 Integration Tests', () => {
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
      { encoding: 'utf8', timeout: 60_000 }
    )
    if (runRes.status !== 0) {
      throw new Error(`Failed to start postgres container: ${runRes.stderr || runRes.error?.message || 'unknown error'}`)
    }

    // 2. Esperar disponibilidad de PostgreSQL
    let ready = false
    for (let i = 0; i < 30; i++) {
      try {
        const testClient = createTestClient()
        await testClient.connect()
        await testClient.query('SELECT 1')
        await testClient.end()
        ready = true
        break
      } catch {
        await new Promise((r) => setTimeout(r, 600))
      }
    }
    if (!ready) {
      throw new Error('PostgreSQL 17 container did not become ready in time')
    }

    // 3. Conexión de administración
    adminClient = createTestClient()
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
      ...readdirSync(join(root, 'steps')).sort().map((name) => join(root, 'steps', name)),
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
      'supabase/pilot-fiscal/015_fiscal_emission_receipts.sql',
      'supabase/pilot-fiscal/017_fiscal_preparation_cancellation.sql',
      'supabase/pilot-fiscal/054_close_legacy_preparation_entry.sql',
    ]) {
      const sql = readFileSync(fiscalFile, 'utf8')
      await adminClient.query(sql)
    }

    // Permisos al usuario postgres
    await adminClient.query(`
      GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
      GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
    `)

    // 7. Seed de datos base para PR02
    testOwnerAuthId = randomUUID()
    testOwnerUserId = randomUUID()
    const credentialId = randomUUID()
    testProductId = randomUUID()

    // Auth user
    await adminClient.query('INSERT INTO auth.users(id) VALUES ($1)', [testOwnerAuthId])

    // Kiosco objetivo PR02
    await adminClient.query(
      "INSERT INTO public.kioscos(id, nombre, estado_suscripcion) VALUES ($1, 'Kiosko Staging PR02 Target', 'ACTIVO')",
      [PR02_TARGET_KIOSK_ID]
    )

    // Usuario DUEÑO
    await adminClient.query(
      `INSERT INTO public.usuarios(id, auth_user_id, kiosco_id, nombre, rol, activo, es_superadmin)
       VALUES ($1, $2, $3, 'Dueño PR02', 'DUEÑO', true, false)`,
      [testOwnerUserId, testOwnerAuthId, PR02_TARGET_KIOSK_ID]
    )

    // Producto
    await adminClient.query(
      `INSERT INTO public.productos(id, kiosco_id, descripcion, precio_venta, activo)
       VALUES ($1, $2, 'Gaseosa Cola 2.25L Retornable', 1500.00, true)`,
      [testProductId, PR02_TARGET_KIOSK_ID]
    )

    // Emisor en PV 2 inactivo (habilitado = false)
    await adminClient.query(
      `INSERT INTO public.fiscal_emisores_homologacion(kiosco_id, cuit_emisor, punto_venta, credencial_id, certificado_sha256, habilitado)
       VALUES ($1, $2, $3, $4, $5, false)`,
      [
        PR02_TARGET_KIOSK_ID,
        PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
        PR02_PARAMETERS_EXPECTED_ISSUER_PV,
        credentialId,
        'b'.repeat(64),
      ]
    )

    // Venta de prueba completada con detalle para evaluar cargar_datos_preparacion_homologacion
    testSaleId = randomUUID()
    await adminClient.query(
      `INSERT INTO public.ventas(id, kiosco_id, usuario_id, notas, estado, total, fecha_hora)
       VALUES ($1, $2, $3, 'Venta Test Preparacion', 'COMPLETADA', 1500.00, clock_timestamp())`,
      [testSaleId, PR02_TARGET_KIOSK_ID, testOwnerUserId]
    )
    await adminClient.query(
      `INSERT INTO public.detalles_venta(id, venta_id, producto_id, cantidad, precio_unitario, subtotal)
       VALUES (gen_random_uuid(), $1, $2, 1, 1500.00, 1500.00)`,
      [testSaleId, testProductId]
    )

    // Catálogos previos: Reversión 1 (deshabilitada), Revisión 2 (deshabilitada), Revisión 3 (habilitada pero EXPIRADA)
    await adminClient.query(`
      INSERT INTO public.fiscal_parametros_homologacion(revision, condiciones, alicuotas, fuente_sha256, consultado_en, vence_en, habilitado)
      VALUES
        (
          1,
          '[{"id": 1, "descripcion": "IVA Responsable Inscripto", "comprobantes": [1, 11]}]'::jsonb,
          '[{"id": 5, "descripcion": "21%"}]'::jsonb,
          '1111111111111111111111111111111111111111111111111111111111111111',
          '2026-10-26T22:03:33.000Z'::timestamptz,
          '2026-10-27T02:59:00.000Z'::timestamptz,
          false
        ),
        (
          2,
          '[{"id": 1, "descripcion": "IVA Responsable Inscripto", "comprobantes": [1, 11]}]'::jsonb,
          '[{"id": 5, "descripcion": "21%"}]'::jsonb,
          '2222222222222222222222222222222222222222222222222222222222222222',
          '2026-10-27T10:00:00.000Z'::timestamptz,
          '2026-10-28T02:59:00.000Z'::timestamptz,
          false
        ),
        (
          3,
          '[{"id": 5, "descripcion": "Consumidor Final", "comprobantes": [1, 6, 11]}]'::jsonb,
          '[{"id": 5, "descripcion": "21%"}]'::jsonb,
          $1,
          clock_timestamp() - interval '2 days',
          clock_timestamp() - interval '1 hour',
          true
        );
    `, [PR02_CATALOG_REV3_HASH])
  }, 120_000)

  afterAll(async () => {
    if (adminClient) {
      await adminClient.end().catch(() => {})
    }
    spawnSync('docker', ['stop', containerName], { encoding: 'utf8', timeout: 20_000 })
  }, 30_000)

  // 1. Confirma R3 expirado y PV2 deshabilitado
  it('1. Confirma R3 expirado y preservado sin modificaciones y PV2 deshabilitado', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    const res = await adminClient.query(`
      SELECT
        revision,
        vence_en < clock_timestamp() AS is_expired,
        habilitado,
        fuente_sha256,
        condiciones,
        alicuotas,
        consultado_en,
        vence_en
      FROM public.fiscal_parametros_homologacion
      WHERE revision = 3;
    `)

    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].revision).toBe(3)
    expect(res.rows[0].is_expired).toBe(true)
    expect(res.rows[0].habilitado).toBe(true)
    expect(res.rows[0].fuente_sha256).toBe(PR02_CATALOG_REV3_HASH)
    expect(res.rows[0].fuente_sha256).toBe(REV3_SOURCE_SHA256)

    // Verificar digest de fila R3 y detección de discrepancia de columnas
    const r3Row = res.rows[0] as Parameters<typeof computeCatalogRowDigest>[0]
    const rowDigest = computeCatalogRowDigest(r3Row)
    expect(rowDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(computeCatalogRowDigest(r3Row)).toBe(rowDigest)
    const tamperedCol = { ...r3Row, alicuotas: [] }
    expect(computeCatalogRowDigest(tamperedCol)).not.toBe(rowDigest)

    // PV 2 permanece deshabilitado
    const issuerRes = await adminClient.query(`
      SELECT habilitado
      FROM public.fiscal_emisores_homologacion
      WHERE cuit_emisor = $1 AND punto_venta = $2;
    `, [PR02_PARAMETERS_EXPECTED_ISSUER_CUIT, PR02_PARAMETERS_EXPECTED_ISSUER_PV])

    expect(issuerRes.rows).toHaveLength(1)
    expect(issuerRes.rows[0].habilitado).toBe(false)
  })

  // Bloqueo 8 - Caso 1: Llamada programática sin autorización que no alcanza client.connect()
  it('B8.1. Llamada sin autorización aborta antes de client.connect() (UNAUTHORIZED_CONNECTION_ATTEMPTS = 0)', async () => {
    let connectCalled = false
    const mockClient = {
      connect: async () => { connectCalled = true },
      query: async () => ({ rows: [] }),
      end: async () => {},
    } as unknown as Client

    // Intento con authorized: false, dryRun: false
    await expect(
      executePr02ParametersStaging(
        {
          authorized: false,
          dryRun: false,
          scope: PR02_P1_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
        },
        { client: mockClient, caCert: 'MOCK_CA' }
      )
    ).rejects.toThrow(/UNAUTHORIZED_EXECUTION/)

    expect(connectCalled).toBe(false)

    // Intento con combinación contradictoria authorized: true, dryRun: true
    await expect(
      executePr02ParametersStaging(
        {
          authorized: true,
          dryRun: true,
          scope: PR02_P1_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
        },
        { client: mockClient, caCert: 'MOCK_CA' }
      )
    ).rejects.toThrow(/CLI_ARGUMENT_CONFLICT/)

    expect(connectCalled).toBe(false)
  })

  // Bloqueo 8 - Caso 2: Evidencia arbitraria rechazada sin manifest P0
  it('B8.2. Evidencia arbitraria sin manifiesto oficial P0 es rechazada', async () => {
    const testClient = createTestClient()
    await expect(
      executePr02ParametersStaging(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_P1_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          password: postgresPassword,
          ivaText: SYNTHETIC_IVA_EVIDENCE,
          conditionText: SYNTHETIC_CONDITION_EVIDENCE,
          allowUnaccreditedForTest: false,
        },
        { client: testClient, caCert: 'MOCK_CA' }
      )
    ).rejects.toThrow(/OFFICIAL_EVIDENCE_NOT_ACCREDITED/)
  })

  // Bloqueo 8 - Caso 3: Evidencia vencida rechazada
  it('B8.3. Evidencia vencida rechazada por el contrato', async () => {
    const testClient = createTestClient()
    const expiredNow = '2026-11-06T12:00:00.000Z' // 2 días posterior a SYNTHETIC_IVA_EVIDENCE

    await expect(
      executePr02ParametersStaging(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_P1_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          password: postgresPassword,
          ivaText: SYNTHETIC_IVA_EVIDENCE,
          conditionText: SYNTHETIC_CONDITION_EVIDENCE,
          allowUnaccreditedForTest: true,
          now: expiredNow,
          expiresAt: '2026-11-04T13:00:00.000Z', // vencida respecto a now
        },
        { client: testClient, caCert: 'MOCK_CA' }
      )
    ).rejects.toThrow()
  })

  // 2. P1 preflight pasa en estado limpio
  it('2. P1 preflight pasa en estado limpio (R4 no existe) y falla si R4 ya existe', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    await adminClient.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;')
    let preflight: any
    try {
      const pfRes = await adminClient.query(PR02_P1_PREFLIGHT_SELECT_SQL, [
        PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
        PR02_PARAMETERS_EXPECTED_ISSUER_PV,
      ])
      preflight = pfRes.rows[0]?.preflight
    } finally {
      await adminClient.query('ROLLBACK;')
    }

    const verified = verifyPr02P1Preflight(preflight)

    expect(verified.status).toBe('PASS')
    expect(verified.catalogRev3Expired).toBe(true)
    expect(verified.catalogRev4Exists).toBe(false)
    expect(verified.expectedIssuerEnabled).toBe(false)

    // Falla si rev4_absent es false
    expect(() => {
      verifyPr02P1Preflight({ ...preflight, catalog_rev4_exists: true })
    }).toThrow('PR02_P1_PREFLIGHT_CATALOG_REV4_ALREADY_EXISTS')

    // Falla si el emisor PV2 estuviera habilitado
    expect(() => {
      verifyPr02P1Preflight({ ...preflight, expected_issuer_enabled: true })
    }).toThrow('PR02_P1_PREFLIGHT_ISSUER_UNEXPECTEDLY_ENABLED')
  })

  // Bloqueo 8 - Caso 4: Modificación de R3 antes de INSERT detectada por guarda atómica
  it('B8.4. Modificación de R3 antes de INSERT detectada por guarda atómica en la misma transacción', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    // Simular R3 alterado con hash no baseline dentro de la guarda atómica
    const guardRes = await adminClient.query(PR02_P1_ATOMIC_GUARD_SQL, [
      PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
      PR02_PARAMETERS_EXPECTED_ISSUER_PV,
      '0000000000000000000000000000000000000000000000000000000000000000', // hash discordante
      'a'.repeat(64),
      new Date().toISOString(),
      new Date(Date.now() + 86400000).toISOString(),
    ])

    expect(() => verifyPr02P1InTxGuard(guardRes.rows[0]?.in_tx_guard)).toThrow(/PR02_P1_REV3_HASH_MISMATCH/)
  })

  // Bloqueo 8 - Caso 5: Modificación de emisor antes de INSERT detectada por guarda atómica
  it('B8.5. Modificación de emisor antes de INSERT detectada por guarda atómica', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    // Si emisor PV2 estuviera habilitado
    await adminClient.query(
      'UPDATE public.fiscal_emisores_homologacion SET habilitado = true WHERE punto_venta = 2;'
    )
    try {
      const guardRes = await adminClient.query(PR02_P1_ATOMIC_GUARD_SQL, [
        PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
        PR02_PARAMETERS_EXPECTED_ISSUER_PV,
        PR02_CATALOG_REV3_HASH,
        'a'.repeat(64),
        new Date().toISOString(),
        new Date(Date.now() + 86400000).toISOString(),
      ])

      expect(() => verifyPr02P1InTxGuard(guardRes.rows[0]?.in_tx_guard)).toThrow(/PR02_P1_ISSUER_UNEXPECTEDLY_ENABLED/)
    } finally {
      await adminClient.query(
        'UPDATE public.fiscal_emisores_homologacion SET habilitado = false WHERE punto_venta = 2;'
      )
    }
  })

  // Bloqueo 8 - Caso 6: Bloqueos y concurrencia sobre catálogo y emisor
  it('B8.6. Adquiere SHARE ROW EXCLUSIVE MODE sobre fiscal_parametros_homologacion y fiscal_emisores_homologacion', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    const client1 = createTestClient()
    const client2 = createTestClient()
    await client1.connect()
    await client2.connect()

    try {
      await client1.query('BEGIN;')
      await client1.query('LOCK TABLE public.fiscal_parametros_homologacion IN SHARE ROW EXCLUSIVE MODE;')
      await client1.query('LOCK TABLE public.fiscal_emisores_homologacion IN SHARE ROW EXCLUSIVE MODE;')

      // La tabla está bloqueada; client1 confirma posesión del lock
      const locksRes = await client1.query(`
        SELECT locktype, mode, granted
        FROM pg_locks
        WHERE relation = 'public.fiscal_parametros_homologacion'::regclass;
      `)
      expect(locksRes.rows.some((r) => r.mode === 'ShareRowExclusiveLock' && r.granted)).toBe(true)

      await client1.query('COMMIT;')
    } finally {
      await client1.end().catch(() => {})
      await client2.end().catch(() => {})
    }
  })

  // Escenario d: Concurrencia - alteración concurrente de R3 antes de commit en P1 aborta con ROLLBACK
  it('B8.6b. Guarda atómica in-tx en P1 detecta alteración concurrente de R3 y aborta con ROLLBACK', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    const client = createTestClient()
    await client.connect()
    try {
      await client.query('BEGIN;')
      await client.query('LOCK TABLE public.fiscal_parametros_homologacion IN SHARE ROW EXCLUSIVE MODE;')

      const guardRes = await client.query(PR02_P1_ATOMIC_GUARD_SQL, [
        PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
        PR02_PARAMETERS_EXPECTED_ISSUER_PV,
        'wronghash'.padEnd(64, '0'),
        'a'.repeat(64),
        new Date().toISOString(),
        new Date(Date.now() + 86400000).toISOString(),
      ])

      expect(() => verifyPr02P1InTxGuard(guardRes.rows[0]?.in_tx_guard)).toThrow(/PR02_P1_REV3_HASH_MISMATCH/)
      await client.query('ROLLBACK;')
    } finally {
      await client.end().catch(() => {})
    }
  })

  // 3. P1 inserción atómica de R4
  it('3. P1 inserción de R4: atómica, insert-only, habilitado = false, hash coincide, R3 preservado, PV2 sigue deshabilitado', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    const testClient = createTestClient()
    const report = await executePr02ParametersStaging(
      {
        authorized: true,
        dryRun: false,
        scope: PR02_P1_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        password: postgresPassword,
        ivaText: SYNTHETIC_IVA_EVIDENCE,
        conditionText: SYNTHETIC_CONDITION_EVIDENCE,
        allowUnaccreditedForTest: true,
      },
      { client: testClient, caCert: 'MOCK_CA' }
    )

    expect(report.PR02_P1_EXECUTION).toBe('PASS')
    expect(report.PR02_P1_ATOMIC_GUARDS).toBe('PASS')
    expect(report.PR02_P1_COMMIT_OUTCOME_GUARD).toBe('PASS')
    expect(report.REV3_BASELINE_MATCH_BEFORE_COMMIT).toBe('PASS')
    expect(report.REV4_INSERT_ONLY).toBe('PASS')
    expect(report.REVISION_3_PRESERVED).toBe(true)
    expect(report.REVISION_4_HABILITADO).toBe(false)
    expect(report.REAL_PV2_ENABLED).toBe(false)
    expect(report.REAL_PV2_SERIES_TOUCHED).toBe(false)
    expect(report.HISTORICAL_042_IDENTIFICATION).toBe('UNRESOLVED')
    expect(report.HISTORICAL_042_REEMISSION_FORBIDDEN).toBe(true)
    expect(report.STAGING_WRITES_NEW).toBe(1)
    expect(report.ARCA_CALLS_NEW).toBe(0)

    generatedRev4Hash = report.REVISION_4_HASH || ''
    expect(generatedRev4Hash).toHaveLength(64)

    // Verificar en PostgreSQL real
    const r4Res = await adminClient.query(`
      SELECT revision, habilitado, fuente_sha256, vence_en > clock_timestamp() AS unexpired
      FROM public.fiscal_parametros_homologacion
      WHERE revision = 4;
    `)
    expect(r4Res.rows).toHaveLength(1)
    expect(r4Res.rows[0].revision).toBe(4)
    expect(r4Res.rows[0].habilitado).toBe(false)
    expect(r4Res.rows[0].fuente_sha256).toBe(generatedRev4Hash)
    expect(r4Res.rows[0].unexpired).toBe(true)

    // Revisión 3 intacta
    const r3Res = await adminClient.query(`
      SELECT revision, habilitado, fuente_sha256 FROM public.fiscal_parametros_homologacion WHERE revision = 3;
    `)
    expect(r3Res.rows[0].fuente_sha256).toBe(PR02_CATALOG_REV3_HASH)

    // PV 2 intacto y deshabilitado
    const pv2Res = await adminClient.query(`
      SELECT habilitado FROM public.fiscal_emisores_homologacion WHERE punto_venta = 2;
    `)
    expect(pv2Res.rows[0].habilitado).toBe(false)
  })

  // Bloqueo 8 - Caso 7: R4 preexistente bloqueado para re-insertar
  it('4. R4 preexistente bloqueado para re-insertar (falla con preflight / duplicate key)', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    const testClient = createTestClient()
    await expect(
      executePr02ParametersStaging(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_P1_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          password: postgresPassword,
          ivaText: SYNTHETIC_IVA_EVIDENCE,
          conditionText: SYNTHETIC_CONDITION_EVIDENCE,
          allowUnaccreditedForTest: true,
        },
        { client: testClient, caCert: 'MOCK_CA' }
      )
    ).rejects.toThrow(/PR02_P1_PREFLIGHT_CATALOG_REV4_ALREADY_EXISTS|REVISION_4_ALREADY_EXISTS/)
  })

  // Bloqueo 8 - Caso 8: Cambio de baseline entre preflight y transacción
  it('B8.8. Guarda atómica en transacción detecta cambio en baseline posterior a preflight', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    // Simulando que R3 fue alterado o el baseline cambió (por ejemplo revisión adicional)
    const guardRes = await adminClient.query(PR02_P1_ATOMIC_GUARD_SQL, [
      PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
      PR02_PARAMETERS_EXPECTED_ISSUER_PV,
      'f'.repeat(64), // hash que ya no coincide
      'a'.repeat(64),
      new Date().toISOString(),
      new Date(Date.now() + 86400000).toISOString(),
    ])

    expect(() => verifyPr02P1InTxGuard(guardRes.rows[0]?.in_tx_guard)).toThrow(
      /PR02_P1_BASELINE_COUNT_MISMATCH|PR02_P1_REV3_HASH_MISMATCH/
    )
  })

  // Bloqueo 8 - Caso 9: Guardas P2 y UPDATE en la misma transacción
  it('6. P2 guard check pasa cuando R4 está deshabilitado, vigente y hash coincide', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    const guardRes = await adminClient.query(PR02_P2_ATOMIC_GUARD_SQL, [
      generatedRev4Hash,
      PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
      PR02_PARAMETERS_EXPECTED_ISSUER_PV,
      PR02_CATALOG_REV3_HASH,
    ])

    expect(verifyPr02P2InTxGuard(guardRes.rows[0]?.p2_in_tx_guard)).toBe(true)
  })

  // Bloqueo 8 - Caso 10: R3 con hash discordante durante P2 rechazado
  it('B8.10. R3 con hash discordante durante P2 genera ROLLBACK inmediato', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    const testClient = createTestClient()
    await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion DISABLE TRIGGER fiscal_parametros_inmutables;')
    await adminClient.query(
      "UPDATE public.fiscal_parametros_homologacion SET fuente_sha256 = '3333333333333333333333333333333333333333333333333333333333333333' WHERE revision = 3;"
    )
    await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion ENABLE TRIGGER fiscal_parametros_inmutables;')

    try {
      await expect(
        executePr02ParametersStaging(
          {
            authorized: true,
            dryRun: false,
            scope: PR02_P2_SCOPE,
            projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
            head: VALID_HEAD,
            expectedHead: VALID_HEAD,
            expectedHash: generatedRev4Hash,
            password: postgresPassword,
          },
          { client: testClient, caCert: 'MOCK_CA' }
        )
      ).rejects.toThrow(/PR02_P2_REV3_BASELINE_MISMATCH/)
    } finally {
      await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion DISABLE TRIGGER fiscal_parametros_inmutables;')
      await adminClient.query(
        'UPDATE public.fiscal_parametros_homologacion SET fuente_sha256 = $1 WHERE revision = 3;',
        [PR02_CATALOG_REV3_HASH]
      )
      await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion ENABLE TRIGGER fiscal_parametros_inmutables;')
    }
  })

  // Escenario c: Baseline modificado en P2 (conteo != 4 o falta R1/R2) detectado por guarda in-tx
  it('B8.10b. Baseline modificado en P2 (conteo != 4 o falta R1/R2) detectado por guarda in-tx', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    const guardRes = await adminClient.query(PR02_P2_ATOMIC_GUARD_SQL, [
      generatedRev4Hash,
      PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
      PR02_PARAMETERS_EXPECTED_ISSUER_PV,
      PR02_CATALOG_REV3_HASH,
    ])

    const rawGuard = (guardRes.rows[0]?.p2_in_tx_guard as Record<string, unknown>) || {}
    expect(() =>
      verifyPr02P2InTxGuard({ ...rawGuard, catalog_total_count: 5 })
    ).toThrow(/PR02_P2_BASELINE_COUNT_MISMATCH/)

    expect(() =>
      verifyPr02P2InTxGuard({ ...rawGuard, rev1_exists: false })
    ).toThrow(/PR02_P2_BASELINE_REV1_MISSING/)

    expect(() =>
      verifyPr02P2InTxGuard({ ...rawGuard, rev2_exists: false })
    ).toThrow(/PR02_P2_BASELINE_REV2_MISSING/)
  })

  // Bloqueo 8 - Caso 11: Emisor faltante o habilitado en P2
  it('B8.11. Emisor habilitado en P2 es bloqueado', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    await adminClient.query('UPDATE public.fiscal_emisores_homologacion SET habilitado = true WHERE punto_venta = 2;')
    const testClient = createTestClient()
    try {
      await expect(
        executePr02ParametersStaging(
          {
            authorized: true,
            dryRun: false,
            scope: PR02_P2_SCOPE,
            projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
            head: VALID_HEAD,
            expectedHead: VALID_HEAD,
            expectedHash: generatedRev4Hash,
            password: postgresPassword,
          },
          { client: testClient, caCert: 'MOCK_CA' }
        )
      ).rejects.toThrow(/PR02_P2_ISSUER_PV2_NOT_DISABLED/)
    } finally {
      await adminClient.query('UPDATE public.fiscal_emisores_homologacion SET habilitado = false WHERE punto_venta = 2;')
    }
  })

  // Bloqueo 8 - Caso 12: R4 con fecha de consulta futura rechazado
  it('B8.12. R4 con fecha de consulta en el futuro es bloqueado en P2', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion DISABLE TRIGGER fiscal_parametros_inmutables;')
    await adminClient.query(
      "UPDATE public.fiscal_parametros_homologacion SET consultado_en = clock_timestamp() + interval '1 day', vence_en = clock_timestamp() + interval '2 days' WHERE revision = 4;"
    )
    await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion ENABLE TRIGGER fiscal_parametros_inmutables;')

    const testClient = createTestClient()
    try {
      await expect(
        executePr02ParametersStaging(
          {
            authorized: true,
            dryRun: false,
            scope: PR02_P2_SCOPE,
            projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
            head: VALID_HEAD,
            expectedHead: VALID_HEAD,
            expectedHash: generatedRev4Hash,
            password: postgresPassword,
          },
          { client: testClient, caCert: 'MOCK_CA' }
        )
      ).rejects.toThrow(/PR02_P2_REVISION_4_FUTURE_CONSULTED/)
    } finally {
      await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion DISABLE TRIGGER fiscal_parametros_inmutables;')
      await adminClient.query(
        "UPDATE public.fiscal_parametros_homologacion SET consultado_en = clock_timestamp() - interval '1 hour', vence_en = clock_timestamp() + interval '23 hours' WHERE revision = 4;"
      )
      await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion ENABLE TRIGGER fiscal_parametros_inmutables;')
    }
  })

  // Escenario f: R4 expirado en P2 aborta con PR02_P2_REVISION_4_EXPIRED y ROLLBACK confirmado
  it('B8.12b. R4 expirado en P2 aborta con PR02_P2_REVISION_4_EXPIRED y ROLLBACK confirmado', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion DISABLE TRIGGER fiscal_parametros_inmutables;')
    await adminClient.query(
      "UPDATE public.fiscal_parametros_homologacion SET vence_en = clock_timestamp() - interval '1 hour' WHERE revision = 4;"
    )
    await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion ENABLE TRIGGER fiscal_parametros_inmutables;')

    const testClient = createTestClient()
    try {
      await expect(
        executePr02ParametersStaging(
          {
            authorized: true,
            dryRun: false,
            scope: PR02_P2_SCOPE,
            projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
            head: VALID_HEAD,
            expectedHead: VALID_HEAD,
            expectedHash: generatedRev4Hash,
            password: postgresPassword,
          },
          { client: testClient, caCert: 'MOCK_CA' }
        )
      ).rejects.toThrow(/PR02_P2_REVISION_4_EXPIRED/)
    } finally {
      await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion DISABLE TRIGGER fiscal_parametros_inmutables;')
      await adminClient.query(
        "UPDATE public.fiscal_parametros_homologacion SET vence_en = clock_timestamp() + interval '23 hours' WHERE revision = 4;"
      )
      await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion ENABLE TRIGGER fiscal_parametros_inmutables;')
    }

    // Verificar que R4 NO fue habilitada en BD tras el aborto
    const r4Res = await adminClient.query('SELECT habilitado FROM public.fiscal_parametros_homologacion WHERE revision = 4;')
    expect(r4Res.rows[0].habilitado).toBe(false)
  })

  // 7. P2 habilitación atómica exitosa
  it('7. P2 habilitación: actualiza habilitado = true, postcheck confirma habilitación, R3 intacto, PV2 sigue deshabilitado', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    const testClient = createTestClient()
    const report = await executePr02ParametersStaging(
      {
        authorized: true,
        dryRun: false,
        scope: PR02_P2_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        expectedHash: generatedRev4Hash,
        password: postgresPassword,
      },
      { client: testClient, caCert: 'MOCK_CA' }
    )

    expect(report.PR02_P2_EXECUTION).toBe('PASS')
    expect(report.PR02_P2_ATOMIC_GUARDS).toBe('PASS')
    expect(report.PR02_P2_REV3_BASELINE_GUARD).toBe('PASS')
    expect(report.REVISION_4_HABILITADO).toBe(true)
    expect(report.REVISION_3_PRESERVED).toBe(true)
    expect(report.REAL_PV2_ENABLED).toBe(false)
    expect(report.REAL_PV2_SERIES_TOUCHED).toBe(false)
    expect(report.HISTORICAL_042_IDENTIFICATION).toBe('UNRESOLVED')
    expect(report.HISTORICAL_042_REEMISSION_FORBIDDEN).toBe(true)
    expect(report.STAGING_WRITES_NEW).toBe(1)
    expect(report.ARCA_CALLS_NEW).toBe(0)

    // Verificar en PostgreSQL real
    const r4Res = await adminClient.query(`
      SELECT revision, habilitado, fuente_sha256, vence_en > clock_timestamp() AS unexpired
      FROM public.fiscal_parametros_homologacion
      WHERE revision = 4;
    `)
    expect(r4Res.rows[0].habilitado).toBe(true)
    expect(r4Res.rows[0].fuente_sha256).toBe(generatedRev4Hash)

    // PV2 continúa deshabilitado
    const pv2Res = await adminClient.query(`
      SELECT habilitado FROM public.fiscal_emisores_homologacion WHERE punto_venta = 2;
    `)
    expect(pv2Res.rows[0].habilitado).toBe(false)
  })

  // Bloqueo 8 - Caso 13: COMMIT sin confirmación reporta COMMIT_OUTCOME_UNKNOWN
  it('B8.13. COMMIT sin confirmación es reportado como COMMIT_OUTCOME_UNKNOWN y prohíbe reintento', async () => {
    let outcome = ''
    const mockClient = {
      connect: async () => {},
      query: async (sql: string) => {
        if (sql.includes('COMMIT;')) {
          throw new Error('NETWORK_DROP_DURING_COMMIT')
        }
        if (sql.includes('PR02_P2_ATOMIC_GUARD_SQL') || sql.includes('p2_in_tx_guard')) {
          return {
            rows: [{
              p2_in_tx_guard: {
                rev4_exists: true,
                rev4_enabled: false,
                rev4_hash_match: true,
                rev4_unexpired: true,
                rev4_not_future: true,
                rev3_exists: true,
                rev3_hash_match: true,
                expected_issuer_present: true,
                expected_issuer_enabled: false,
                unexpected_enabled_issuers: 0,
              },
            }],
          }
        }
        if (sql.includes('UPDATE public.fiscal_parametros_homologacion')) {
          return { rowCount: 1, rows: [{ revision: 4, habilitado: true, fuente_sha256: generatedRev4Hash }] }
        }
        return { rows: [] }
      },
      end: async () => {},
    } as unknown as Client

    try {
      await executePr02ParametersStaging(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_P2_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          expectedHash: generatedRev4Hash || 'a'.repeat(64),
          password: 'mock_password',
        },
        { client: mockClient, caCert: 'MOCK_CA' }
      )
    } catch (err: any) {
      outcome = err.executionOutcome
      expect(err.message).toContain('PR02_COMMIT_OUTCOME_UNKNOWN')
    }

    expect(outcome).toBe(PR02_EXECUTION_OUTCOMES.COMMIT_OUTCOME_UNKNOWN)
    expect(UNCERTAIN_WRITE_RETRY_FORBIDDEN).toBe(true)
  })

  // Bloqueo 8 - Caso 14: Postcheck fallido tras COMMIT confirmado reporta WRITE_COMMITTED_POSTCHECK_FAILED
  it('B8.14. Postcheck fallido tras COMMIT confirmado reporta WRITE_COMMITTED_POSTCHECK_FAILED', async () => {
    let outcome = ''
    const mockClient = {
      connect: async () => {},
      query: async (sql: string) => {
        if (sql.includes('PR02_P2_POSTCHECK_SELECT_SQL') || sql.includes('postcheck_p2')) {
          throw new Error('POSTCHECK_QUERY_FAILED')
        }
        if (sql.includes('PR02_P2_ATOMIC_GUARD_SQL') || sql.includes('p2_in_tx_guard')) {
          return {
            rows: [{
              p2_in_tx_guard: {
                rev4_exists: true,
                rev4_enabled: false,
                rev4_hash_match: true,
                rev4_unexpired: true,
                rev4_not_future: true,
                rev3_exists: true,
                rev3_hash_match: true,
                expected_issuer_present: true,
                expected_issuer_enabled: false,
                unexpected_enabled_issuers: 0,
              },
            }],
          }
        }
        if (sql.includes('UPDATE public.fiscal_parametros_homologacion')) {
          return { rowCount: 1, rows: [{ revision: 4, habilitado: true, fuente_sha256: generatedRev4Hash || 'a'.repeat(64) }] }
        }
        return { rows: [] }
      },
      end: async () => {},
    } as unknown as Client

    try {
      await executePr02ParametersStaging(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_P2_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          expectedHash: generatedRev4Hash || 'a'.repeat(64),
          password: 'mock_password',
        },
        { client: mockClient, caCert: 'MOCK_CA' }
      )
    } catch (err: any) {
      outcome = err.executionOutcome
    }

    expect(outcome).toBe(PR02_EXECUTION_OUTCOMES.WRITE_COMMITTED_POSTCHECK_FAILED)
  })

  // Bloqueo 8 - Caso 15: ROLLBACK fallido reporta ROLLBACK_OUTCOME_UNKNOWN
  it('B8.15. ROLLBACK fallido reporta ROLLBACK_OUTCOME_UNKNOWN', async () => {
    let outcome = ''
    const mockClient = {
      connect: async () => {},
      query: async (sql: string) => {
        if (sql.includes('LOCK TABLE')) {
          throw new Error('DEADLOCK_DETECTED')
        }
        if (sql.includes('ROLLBACK;')) {
          throw new Error('ROLLBACK_CONNECTION_BROKEN')
        }
        return { rows: [] }
      },
      end: async () => {},
    } as unknown as Client

    try {
      await executePr02ParametersStaging(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_P2_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          expectedHash: generatedRev4Hash || 'a'.repeat(64),
          password: 'mock_password',
        },
        { client: mockClient, caCert: 'MOCK_CA' }
      )
    } catch (err: any) {
      outcome = err.executionOutcome
    }

    expect(outcome).toBe(PR02_EXECUTION_OUTCOMES.ROLLBACK_OUTCOME_UNKNOWN)
  })

  // Bloqueo 8 - Caso 16: client.end() fallido tras COMMIT reporta CONNECTION_CLOSE_FAILED_AFTER_COMMIT
  it('B8.16. client.end() fallido tras COMMIT confirmado reporta CONNECTION_CLOSE_FAILED_AFTER_COMMIT', async () => {
    let outcome = ''
    const mockClient = {
      connect: async () => {},
      query: async (sql: string) => {
        if (sql.includes('PR02_P2_POSTCHECK_SELECT_SQL') || sql.includes('postcheck_p2')) {
          return {
            rows: [{
              postcheck_p2: {
                transaction_read_only: 'on',
                rev4_exists: true,
                rev4_enabled: true,
                rev4_valid: true,
                rev4_fuente_sha256: generatedRev4Hash || 'a'.repeat(64),
                rev3_exists: true,
                rev3_fuente_sha256: PR02_CATALOG_REV3_HASH,
                expected_issuer_enabled: false,
              },
            }],
          }
        }
        if (sql.includes('PR02_P2_ATOMIC_GUARD_SQL') || sql.includes('p2_in_tx_guard')) {
          return {
            rows: [{
              p2_in_tx_guard: {
                rev4_exists: true,
                rev4_enabled: false,
                rev4_hash_match: true,
                rev4_unexpired: true,
                rev4_not_future: true,
                rev3_exists: true,
                rev3_hash_match: true,
                expected_issuer_present: true,
                expected_issuer_enabled: false,
                unexpected_enabled_issuers: 0,
              },
            }],
          }
        }
        if (sql.includes('UPDATE public.fiscal_parametros_homologacion')) {
          return { rowCount: 1, rows: [{ revision: 4, habilitado: true, fuente_sha256: generatedRev4Hash || 'a'.repeat(64) }] }
        }
        return { rows: [] }
      },
      end: async () => {
        throw new Error('CLOSE_SOCKET_ERROR')
      },
    } as unknown as Client

    try {
      await executePr02ParametersStaging(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_P2_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          expectedHash: generatedRev4Hash || 'a'.repeat(64),
          password: 'mock_password',
        },
        { client: mockClient, caCert: 'MOCK_CA' }
      )
    } catch (err: any) {
      outcome = err.executionOutcome
    }

    expect(outcome).toBe(PR02_EXECUTION_OUTCOMES.CONNECTION_CLOSE_FAILED_AFTER_COMMIT)
  })

  // Bloqueo 8 - Caso 17: Reejecución prohibida si resultado es incierto
  it('B8.17. UNCERTAIN_WRITE_RETRY_FORBIDDEN es inmutable y verdadero', () => {
    expect(UNCERTAIN_WRITE_RETRY_FORBIDDEN).toBe(true)
  })

  // Bloqueo 8 - Caso 18: Wrappers fallan si git fetch tiene exit code != 0
  it('B8.18. Wrappers verifican código de salida de git fetch origin --prune', () => {
    const p1Content = readFileSync('scripts/fiscal/run-pr02-p1-staging-private.ps1', 'utf8')
    const p2Content = readFileSync('scripts/fiscal/run-pr02-p2-staging-private.ps1', 'utf8')

    expect(p1Content).toContain('git fetch origin --prune')
    expect(p1Content).toContain('if ($LASTEXITCODE -ne 0)')
    expect(p1Content).toContain('GIT_FETCH_FAILED')

    expect(p2Content).toContain('git fetch origin --prune')
    expect(p2Content).toContain('if ($LASTEXITCODE -ne 0)')
    expect(p2Content).toContain('GIT_FETCH_FAILED')
  })

  // Bloqueo 8 - Casos 19 & 20: Cero llamadas ARCA y cero escrituras Staging en dry-run
  it('B8.19 & B8.20. Confirma ARCA_CALLS_NEW = 0 y STAGING_WRITES_NEW = 0 en dry-run', async () => {
    const dryRunReport = await executePr02ParametersStaging({
      dryRun: true,
      scope: PR02_P1_SCOPE,
    })

    expect(dryRunReport.execution).toBe('DRY_RUN')
    expect(dryRunReport.ARCA_CALLS_NEW).toBe(0)
    expect(dryRunReport.STAGING_WRITES_NEW).toBe(0)
    expect(dryRunReport.PRODUCTION_MUTATIONS).toBe(0)
    expect(dryRunReport.UNAUTHORIZED_CONNECTION_ATTEMPTS).toBe(0)
  })

  // 9. Función canónica cargar_datos_preparacion_homologacion selecciona automáticamente Revisión 4
  it('9. Función canónica cargar_datos_preparacion_homologacion selecciona automáticamente Revisión 4 cuando está habilitada y vigente', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    // 1. Con emisor deshabilitado: evaluar como service_role (con persistencia a nivel sesión)
    await adminClient.query("SET ROLE service_role; SELECT set_config('request.jwt.claim.role', 'service_role', false);")
    try {
      await expect(
        adminClient.query('SELECT public.cargar_datos_preparacion_homologacion($1, $2)', [testOwnerAuthId, testSaleId])
      ).rejects.toThrow(/Emisor fiscal no disponible|42501/)
    } finally {
      await adminClient.query("RESET ROLE; SELECT set_config('request.jwt.claim.role', '', false);")
    }

    // 2. Habilitar emisor como postgres admin
    await adminClient.query(`
      UPDATE public.fiscal_emisores_homologacion
      SET habilitado = true
      WHERE cuit_emisor = $1 AND punto_venta = $2;
    `, [PR02_PARAMETERS_EXPECTED_ISSUER_CUIT, PR02_PARAMETERS_EXPECTED_ISSUER_PV])

    try {
      // 3. Evaluar con emisor habilitado como service_role
      await adminClient.query("SET ROLE service_role; SELECT set_config('request.jwt.claim.role', 'service_role', false);")
      const prepRes = await adminClient.query(`
        SELECT public.cargar_datos_preparacion_homologacion($1, $2) AS ctx;
      `, [testOwnerAuthId, testSaleId])

      const ctx = (prepRes.rows[0]?.ctx as Record<string, unknown>) || {}
      expect(ctx.revision_parametros).toBe(4)
      expect(ctx.venta_id).toBe(testSaleId)
      expect(ctx.cuit_emisor).toBe(PR02_PARAMETERS_EXPECTED_ISSUER_CUIT)
      expect(ctx.punto_venta).toBe(PR02_PARAMETERS_EXPECTED_ISSUER_PV)
    } finally {
      await adminClient.query("RESET ROLE; SELECT set_config('request.jwt.claim.role', '', false);")
      // Re-deshabilitar emisor inmediatamente como postgres admin
      await adminClient.query(`
        UPDATE public.fiscal_emisores_homologacion
        SET habilitado = false
        WHERE cuit_emisor = $1 AND punto_venta = $2;
      `, [PR02_PARAMETERS_EXPECTED_ISSUER_CUIT, PR02_PARAMETERS_EXPECTED_ISSUER_PV])
    }

    // Confirmar que volvió a quedar deshabilitado
    const checkDisabled = await adminClient.query(`
      SELECT habilitado FROM public.fiscal_emisores_homologacion WHERE punto_venta = 2;
    `)
    expect(checkDisabled.rows[0].habilitado).toBe(false)
  })

  // 10. Trigger de inmutabilidad: cualquier UPDATE a R4 distinto de habilitado es rechazado con 55000
  it('10. Checks de trigger de inmutabilidad: cualquier UPDATE a R4 distinto de habilitado es rechazado con 55000', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    // Intento de modificar fuente_sha256
    await expect(
      adminClient.query(`
        UPDATE public.fiscal_parametros_homologacion
        SET fuente_sha256 = $1
        WHERE revision = 4;
      `, ['a'.repeat(64)])
    ).rejects.toThrow(/Crear nueva revisión de parámetros fiscales|55000/)

    // Intento de borrar fila
    await expect(
      adminClient.query(`
        DELETE FROM public.fiscal_parametros_homologacion
        WHERE revision = 4;
      `)
    ).rejects.toThrow(/Conservar catálogo fiscal histórico|55000/)
  })

  // 11. Fail-closed: rollback en error de consulta, cierre estricto de conexión verificado
  it('11. Fail-closed: rollback en error de consulta, cierre estricto de conexión verificado', async () => {
    const testClient = createTestClient()
    let endCalled = false
    const origEnd = testClient.end.bind(testClient)
    testClient.end = async () => {
      endCalled = true
      return origEnd()
    }

    await expect(
      executePr02ParametersStaging(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_P1_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          password: postgresPassword,
          ivaText: 'INVALID',
          conditionText: SYNTHETIC_CONDITION_EVIDENCE,
          allowUnaccreditedForTest: true,
        },
        { client: testClient, caCert: 'MOCK_CA' }
      )
    ).rejects.toThrow()

    // Cierre obligatorio verificado
    expect(endCalled).toBe(true)
  })
})
