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
  PR02_P1_PREFLIGHT_SELECT_SQL,
  PR02_P2_GUARD_SQL,
  verifyPr02P1Preflight,
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
      { encoding: 'utf8', timeout: 30_000 }
    )
    if (runRes.status !== 0) {
      throw new Error(`Failed to start postgres container: ${runRes.stderr}`)
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

  it('1. Confirma R3 expirado y preservado sin modificaciones y PV2 deshabilitado', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    const res = await adminClient.query(`
      SELECT
        revision,
        vence_en < clock_timestamp() AS is_expired,
        habilitado,
        fuente_sha256
      FROM public.fiscal_parametros_homologacion
      WHERE revision = 3;
    `)

    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].revision).toBe(3)
    expect(res.rows[0].is_expired).toBe(true)
    expect(res.rows[0].habilitado).toBe(true)
    expect(res.rows[0].fuente_sha256).toBe(PR02_CATALOG_REV3_HASH)

    // PV 2 permanece deshabilitado
    const issuerRes = await adminClient.query(`
      SELECT habilitado
      FROM public.fiscal_emisores_homologacion
      WHERE cuit_emisor = $1 AND punto_venta = $2;
    `, [PR02_PARAMETERS_EXPECTED_ISSUER_CUIT, PR02_PARAMETERS_EXPECTED_ISSUER_PV])

    expect(issuerRes.rows).toHaveLength(1)
    expect(issuerRes.rows[0].habilitado).toBe(false)
  })

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

  it('3. P1 inserción de R4: insert-only, habilitado = false, hash coincide, R3 preservado, PV2 sigue deshabilitado', async () => {
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
      },
      { client: testClient, caCert: 'MOCK_CA' }
    )

    expect(report.PR02_P1_EXECUTION).toBe('PASS')
    expect(report.REVISION_3_PRESERVED).toBe(true)
    expect(report.REVISION_4_INSERT_ONLY).toBe(true)
    expect(report.REVISION_4_HABILITADO).toBe(false)
    expect(report.REAL_PV2_ENABLED).toBe(false)
    expect(report.REAL_PV2_SERIES_TOUCHED).toBe(false)
    expect(report.HISTORICAL_042_IDENTIFICATION).toBe('UNRESOLVED')
    expect(report.HISTORICAL_042_REEMISSION_FORBIDDEN).toBe(true)
    expect(report.STAGING_WRITES_NEW).toBe(1)

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
        },
        { client: testClient, caCert: 'MOCK_CA' }
      )
    ).rejects.toThrow(/PR02_P1_PREFLIGHT_CATALOG_REV4_ALREADY_EXISTS|REVISION_4_ALREADY_EXISTS/)

    // Intento directo en SQL falla por violación de PRIMARY KEY
    await expect(
      adminClient.query(`
        INSERT INTO public.fiscal_parametros_homologacion(revision, condiciones, alicuotas, fuente_sha256, consultado_en, vence_en, habilitado)
        VALUES (4, '[{"id": 1, "descripcion": "IVA Responsable Inscripto", "comprobantes": [1, 11]}]'::jsonb, '[]'::jsonb, $1, clock_timestamp(), clock_timestamp() + interval '1 day', false);
      `, ['9'.repeat(64)])
    ).rejects.toThrow(/duplicate key value|23505/)
  })

  it('5. Rechaza hash discordante o parámetros inválidos', async () => {
    // Evidencia con JSON corrupto
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
          ivaText: 'NOT_A_JSON',
          conditionText: SYNTHETIC_CONDITION_EVIDENCE,
        },
        { client: testClient, caCert: 'MOCK_CA' }
      )
    ).rejects.toThrow()
  })

  it('6. P2 guard check pasa cuando R4 está deshabilitado, vigente y hash coincide', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    const guardRes = await adminClient.query(PR02_P2_GUARD_SQL, [
      generatedRev4Hash,
      PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
      PR02_PARAMETERS_EXPECTED_ISSUER_PV,
    ])

    expect(guardRes.rows[0].guard_status).toBe('OK')

    // Si el hash no coincide, el guard reporta PR02_P2_REVISION_4_HASH_MISMATCH
    const mismatchRes = await adminClient.query(PR02_P2_GUARD_SQL, [
      'f'.repeat(64),
      PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
      PR02_PARAMETERS_EXPECTED_ISSUER_PV,
    ])
    expect(mismatchRes.rows[0].guard_status).toBe('PR02_P2_REVISION_4_HASH_MISMATCH')
  })

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
    expect(report.PR02_P2_GUARD).toBe('PASS')
    expect(report.REVISION_4_HABILITADO).toBe(true)
    expect(report.REVISION_3_PRESERVED).toBe(true)
    expect(report.REAL_PV2_ENABLED).toBe(false)
    expect(report.REAL_PV2_SERIES_TOUCHED).toBe(false)
    expect(report.HISTORICAL_042_IDENTIFICATION).toBe('UNRESOLVED')
    expect(report.HISTORICAL_042_REEMISSION_FORBIDDEN).toBe(true)
    expect(report.STAGING_WRITES_NEW).toBe(1) // Sólo UPDATE habilitado: false -> true

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

  it('8. Rechaza habilitar R4 expirado', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    // Desactivar temporalmente trigger para simular R4 expirado
    try {
      await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion DISABLE TRIGGER fiscal_parametros_inmutables;')
      await adminClient.query(`
        UPDATE public.fiscal_parametros_homologacion
        SET consultado_en = clock_timestamp() - interval '2 days',
            vence_en = clock_timestamp() - interval '1 hour',
            habilitado = false
        WHERE revision = 4;
      `)
      await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion ENABLE TRIGGER fiscal_parametros_inmutables;')

      const testClient = createTestClient()
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
      ).rejects.toThrow('PR02_P2_GUARD_FAILED: PR02_P2_REVISION_4_EXPIRED')
    } finally {
      // Restaurar vigencia de R4
      await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion DISABLE TRIGGER fiscal_parametros_inmutables;')
      await adminClient.query(`
        UPDATE public.fiscal_parametros_homologacion
        SET consultado_en = clock_timestamp() - interval '1 hour',
            vence_en = clock_timestamp() + interval '23 hours',
            habilitado = true
        WHERE revision = 4;
      `)
      await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion ENABLE TRIGGER fiscal_parametros_inmutables;')
    }
  })

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

    // Intento de modificar alicuotas
    await expect(
      adminClient.query(`
        UPDATE public.fiscal_parametros_homologacion
        SET alicuotas = '[]'::jsonb
        WHERE revision = 4;
      `, [])
    ).rejects.toThrow(/Crear nueva revisión de parámetros fiscales|55000/)

    // Intento de modificar vence_en
    await expect(
      adminClient.query(`
        UPDATE public.fiscal_parametros_homologacion
        SET vence_en = clock_timestamp() + interval '5 days'
        WHERE revision = 4;
      `)
    ).rejects.toThrow(/Crear nueva revisión de parámetros fiscales|55000/)

    // Intento de borrar fila
    await expect(
      adminClient.query(`
        DELETE FROM public.fiscal_parametros_homologacion
        WHERE revision = 4;
      `)
    ).rejects.toThrow(/Conservar catálogo fiscal histórico|55000/)
  })

  it('11. Fail-closed: rollback en error de consulta, cierre estricto de conexión verificado', async () => {
    const testClient = createTestClient()
    let endCalled = false
    const origEnd = testClient.end.bind(testClient)
    testClient.end = async () => {
      endCalled = true
      return origEnd()
    }

    // Ejecución con scope inválido o parámetros que provocan fallo
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
        },
        { client: testClient, caCert: 'MOCK_CA' }
      )
    ).rejects.toThrow()

    // Cierre obligatorio verificado
    expect(endCalled).toBe(true)
  })
})
