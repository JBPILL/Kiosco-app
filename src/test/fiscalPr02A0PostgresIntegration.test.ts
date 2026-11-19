// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg, { type Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  PR02_A0_SCOPE,
  PR02_A0_EXECUTION_TARGET,
  PR02_TARGET_KIOSK_ID,
  PR02_TARGET_CUIT,
  PR02_TARGET_PV,
  PR02_TARGET_RECEIPT_TYPE,
  PR02_TARGET_CERT_SHA256,
  PR02_CATALOG_REV3_HASH,
  runPr02A0PreflightQueries,
  executePr02A0Staging,
} from '../../scripts/fiscal/execute-pr02-a0-staging.mjs'

// Puerto e identificadores únicos para el contenedor de prueba PostgreSQL 17
const containerPort = 54392
const containerName = `pg17_pr02a0_${randomUUID().replace(/-/g, '').slice(0, 12)}`
const postgresPassword = 'IntegrationTestPasswordPr02A0!'
const VALID_HEAD = '19f6d48ff6e1149743e6aefb40897c79c130ac1d'

let adminClient: Client | null = null
let testOwnerUserId = ''

function isDockerAvailable(): boolean {
  try {
    const res = spawnSync('docker', ['--version'], { encoding: 'utf8' })
    return res.status === 0
  } catch {
    return false
  }
}

const dockerRunning = isDockerAvailable()

describe.skipIf(!dockerRunning)('PR02-A0 Real PostgreSQL 17 Integration Tests', () => {
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
        await new Promise((r) => setTimeout(r, 600))
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
      ...readdirSync(join(root, 'steps')).sort().map((name) => join(root, 'steps', name)),
      join(root, '900_final_security.sql'),
    ]

    for (const file of bootstrapFiles) {
      const sql = readFileSync(file, 'utf8')
      await adminClient.query(sql)
    }

    // 6. Aplicar migraciones fiscales requeridas incluyendo 004 y 015
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

    // Otorgar permisos al usuario postgres para operar las tablas
    await adminClient.query(`
      GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
      GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
    `)

    // 7. Seed de datos base para PR02-A0
    const ownerAuthId = randomUUID()
    testOwnerUserId = randomUUID()
    const credentialId = randomUUID()
    const productId = randomUUID()

    // Auth user
    await adminClient.query('INSERT INTO auth.users(id) VALUES ($1)', [ownerAuthId])

    // Kiosco objetivo PR02
    await adminClient.query(
      "INSERT INTO public.kioscos(id, nombre, estado_suscripcion) VALUES ($1, 'Kiosko Staging PR02 Target', 'ACTIVO')",
      [PR02_TARGET_KIOSK_ID]
    )

    // Usuario DUEÑO
    await adminClient.query(
      `INSERT INTO public.usuarios(id, auth_user_id, kiosco_id, nombre, rol, activo, es_superadmin)
       VALUES ($1, $2, $3, 'Dueño PR02', 'DUEÑO', true, false)`,
      [testOwnerUserId, ownerAuthId, PR02_TARGET_KIOSK_ID]
    )

    // Producto
    await adminClient.query(
      `INSERT INTO public.productos(id, kiosco_id, descripcion, precio_venta, activo)
       VALUES ($1, $2, 'Producto PR02', 150.00, true)`,
      [productId, PR02_TARGET_KIOSK_ID]
    )

    // Emisor en PV 2 inactivo (habilitado = false)
    await adminClient.query(
      `INSERT INTO public.fiscal_emisores_homologacion(kiosco_id, cuit_emisor, punto_venta, credencial_id, certificado_sha256, habilitado)
       VALUES ($1, $2, $3, $4, $5, false)`,
      [PR02_TARGET_KIOSK_ID, PR02_TARGET_CUIT, PR02_TARGET_PV, credentialId, PR02_TARGET_CERT_SHA256]
    )

    // Catálogo revisión 3 habilitado y vigente (vence_en > now())
    await adminClient.query(
      `INSERT INTO public.fiscal_parametros_homologacion(
        revision, condiciones, alicuotas, fuente_sha256, consultado_en, vence_en, habilitado
      ) VALUES (
        3,
        '[{"id": 5, "descripcion": "Consumidor Final", "comprobantes": [1, 6, 11]}]'::jsonb,
        '[]'::jsonb,
        $1,
        clock_timestamp() - interval '1 hour',
        clock_timestamp() + interval '23 hours',
        true
      )`,
      [PR02_CATALOG_REV3_HASH]
    )

    // 2 Ventas limpias completadas propias con detalles_venta (nunca asociadas a operaciones fiscales)
    const cleanSale1Id = randomUUID()
    const cleanSale2Id = randomUUID()

    await adminClient.query(
      `INSERT INTO public.ventas(id, kiosco_id, usuario_id, notas, estado, total, fecha_hora)
       VALUES
         ($1, $3, $4, 'Venta Limpia 1', 'COMPLETADA', 150.00, clock_timestamp()),
         ($2, $3, $4, 'Venta Limpia 2', 'COMPLETADA', 250.00, clock_timestamp());`,
      [cleanSale1Id, cleanSale2Id, PR02_TARGET_KIOSK_ID, testOwnerUserId]
    )

    await adminClient.query(
      `INSERT INTO public.detalles_venta(id, venta_id, producto_id, cantidad, precio_unitario, subtotal)
       VALUES
         (gen_random_uuid(), $1, $3, 1, 150.00, 150.00),
         (gen_random_uuid(), $2, $3, 1, 250.00, 250.00);`,
      [cleanSale1Id, cleanSale2Id, productId]
    )
  }, 120_000)

  afterAll(async () => {
    if (adminClient) {
      await adminClient.end().catch(() => {})
    }
    spawnSync('docker', ['stop', containerName], { encoding: 'utf8', timeout: 20_000 })
  }, 30_000)

  it('1. Confirma esquema contractual real: fiscal_respuestas_emision_homologacion no tiene columnas resp.cae, resp.resultado, resp.creado_en', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    const colsRes = await adminClient.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fiscal_respuestas_emision_homologacion'
      ORDER BY ordinal_position;
    `)
    const colNames = colsRes.rows.map((r) => r.column_name)

    expect(colNames).toEqual([
      'operacion_id',
      'intento_id',
      'actor_auth_id',
      'solicitud_sha256',
      'respuesta',
      'registrado_en',
    ])
    expect(colNames).not.toContain('cae')
    expect(colNames).not.toContain('resultado')
    expect(colNames).not.toContain('creado_en')

    // Confirma que CAE reside en fiscal_autorizaciones_homologacion
    const authColsRes = await adminClient.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fiscal_autorizaciones_homologacion'
      ORDER BY ordinal_position;
    `)
    const authColNames = authColsRes.rows.map((r) => r.column_name)
    expect(authColNames).toContain('cae')
    expect(authColNames).toContain('vencimiento')
    expect(authColNames).toContain('confirmado_en')
  })

  it('2. Ejecuta consultas preflight A0 contra PostgreSQL 17 con historial vacío: sin SQLSTATE 42703 ni 42P01', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    const results = await runPr02A0PreflightQueries(adminClient)

    expect(results.PR02_A0_READ_ONLY_GUARD).toBe('PASS')
    expect(results.PR02_A0_REAL_PV2_GUARD).toBe('PASS')
    expect(results.PR02_A0_CATALOG_GUARD).toBe('PASS')
    expect(results.PR02_A0_HISTORY_GUARD).toBe('PASS')
    expect(results.HISTORICAL_042_IDENTIFICATION).toBe('UNRESOLVED')
    expect(results.HISTORICAL_042_REEMISSION_FORBIDDEN).toBe(true)
    expect(results.catalog_is_expired).toBe(false)
    expect(results.candidate_sales_count).toBeGreaterThanOrEqual(1)
  })

  it('3. Ejecuta consulta histórica con respuestas y autorizaciones persistidas: preserva UNRESOLVED y PASS', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    const opId = randomUUID()
    const attemptId = randomUUID()
    const test3SaleId = randomUUID()

    // Venta dedicada para la prueba de historial
    await adminClient.query(
      `INSERT INTO public.ventas(id, kiosco_id, usuario_id, notas, estado, total, fecha_hora)
       VALUES ($1, $2, $3, 'Venta Test 3 Historial', 'COMPLETADA', 150.00, clock_timestamp());`,
      [test3SaleId, PR02_TARGET_KIOSK_ID, testOwnerUserId]
    )

    // Insertar serie, operación, solicitud, reserva, autorización y respuesta
    await adminClient.query(
      `INSERT INTO public.fiscal_series_homologacion(cuit_emisor, punto_venta, tipo_comprobante, ultimo_observado, observado_en)
       VALUES ($1, $2, $3, 1, clock_timestamp())
       ON CONFLICT (cuit_emisor, punto_venta, tipo_comprobante) DO UPDATE SET ultimo_observado = 1;`,
      [PR02_TARGET_CUIT, PR02_TARGET_PV, PR02_TARGET_RECEIPT_TYPE]
    )

    await adminClient.query(
      `INSERT INTO public.fiscal_operaciones_homologacion(id, kiosco_id, venta_id, usuario_id, entorno, estado, contexto, venta_snapshot, creado_en)
       VALUES ($1, $2, $3, $4, 'HOMOLOGACION', 'PREPARADA', '{}'::jsonb, '{}'::jsonb, clock_timestamp());`,
      [opId, PR02_TARGET_KIOSK_ID, test3SaleId, testOwnerUserId]
    )

    await adminClient.query(
      `INSERT INTO public.fiscal_solicitudes_homologacion(operacion_id, cuerpo_canonico, cuerpo, solicitud_sha256, revision, creado_en)
       VALUES ($1, '{}', '{}'::jsonb, encode(sha256(convert_to('{}', 'UTF8')), 'hex'), 1, clock_timestamp());`,
      [opId]
    )
    const actualSha = (
      await adminClient.query(`SELECT encode(sha256(convert_to('{}', 'UTF8')), 'hex') AS sha;`)
    ).rows[0].sha

    await adminClient.query(
      `INSERT INTO public.fiscal_reservas_homologacion(operacion_id, cuit_emisor, punto_venta, tipo_comprobante, numero, estado, intento_id, creado_en, intento_en, solicitud_sha256)
       VALUES ($1, $2, $3, $4, 1, 'AUTORIZADA', $5, clock_timestamp(), clock_timestamp(), $6);`,
      [opId, PR02_TARGET_CUIT, PR02_TARGET_PV, PR02_TARGET_RECEIPT_TYPE, attemptId, actualSha]
    )

    await adminClient.query(
      `INSERT INTO public.fiscal_autorizaciones_homologacion(operacion_id, intento_id, solicitud_sha256, cae, vencimiento, procesado_en, resultado, confirmado_en)
       VALUES ($1, $2, $3, '74123456789012', '20261130', '2026-11-04T12:00:00Z', '{"resultado": "A"}'::jsonb, clock_timestamp());`,
      [opId, attemptId, actualSha]
    )

    await adminClient.query(
      `INSERT INTO public.fiscal_respuestas_emision_homologacion(operacion_id, intento_id, actor_auth_id, solicitud_sha256, respuesta, registrado_en)
       VALUES ($1, $2, gen_random_uuid(), $3, '{"estado": "APROBACION_RECIBIDA", "codigos": [1], "puedeReenviar": false}'::jsonb, clock_timestamp());`,
      [opId, attemptId, actualSha]
    )

    // Ejecutar preflight con fila persistida en las tablas reales
    const results = await runPr02A0PreflightQueries(adminClient)

    expect(results.PR02_A0_READ_ONLY_GUARD).toBe('PASS')
    expect(results.PR02_A0_HISTORY_GUARD).toBe('PASS')
    expect(results.HISTORICAL_042_IDENTIFICATION).toBe('UNRESOLVED')
    expect(results.HISTORICAL_042_REEMISSION_FORBIDDEN).toBe(true)

    // Limpiar para siguientes pruebas desactivando temporalmente triggers inmutables
    await adminClient.query('ALTER TABLE public.fiscal_respuestas_emision_homologacion DISABLE TRIGGER fiscal_respuesta_emision_inmutable;')
    await adminClient.query('ALTER TABLE public.fiscal_operaciones_homologacion DISABLE TRIGGER fiscal_operacion_conservar_cancelacion;')
    await adminClient.query('DELETE FROM public.fiscal_respuestas_emision_homologacion WHERE operacion_id = $1;', [opId])
    await adminClient.query('DELETE FROM public.fiscal_autorizaciones_homologacion WHERE operacion_id = $1;', [opId])
    await adminClient.query('DELETE FROM public.fiscal_reservas_homologacion WHERE operacion_id = $1;', [opId])
    await adminClient.query('DELETE FROM public.fiscal_solicitudes_homologacion WHERE operacion_id = $1;', [opId])
    await adminClient.query('DELETE FROM public.fiscal_operaciones_homologacion WHERE id = $1;', [opId])
    await adminClient.query('ALTER TABLE public.fiscal_operaciones_homologacion ENABLE TRIGGER fiscal_operacion_conservar_cancelacion;')
    await adminClient.query('ALTER TABLE public.fiscal_respuestas_emision_homologacion ENABLE TRIGGER fiscal_respuesta_emision_inmutable;')
    await adminClient.query('DELETE FROM public.ventas WHERE id = $1;', [test3SaleId])
  })

  it('4. Falla con FISCAL_HISTORY_REQUIRES_RECONCILIATION si existe reserva en ENVIO_INCIERTO en PostgreSQL 17 real', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    const opId = randomUUID()
    const attemptId = randomUUID()
    const test4SaleId = randomUUID()

    // Crear venta dedicada para evitar colisión de clave única
    await adminClient.query(
      `INSERT INTO public.ventas(id, kiosco_id, usuario_id, notas, estado, total, fecha_hora)
       VALUES ($1, $2, $3, 'Venta Test 4', 'COMPLETADA', 150.00, clock_timestamp())`,
      [test4SaleId, PR02_TARGET_KIOSK_ID, testOwnerUserId]
    )

    await adminClient.query(
      `INSERT INTO public.fiscal_operaciones_homologacion(id, kiosco_id, venta_id, usuario_id, entorno, estado, contexto, venta_snapshot, creado_en)
       VALUES ($1, $2, $3, $4, 'HOMOLOGACION', 'PREPARADA', '{}'::jsonb, '{}'::jsonb, clock_timestamp());`,
      [opId, PR02_TARGET_KIOSK_ID, test4SaleId, testOwnerUserId]
    )

    const actualSha = (
      await adminClient.query(`SELECT encode(sha256(convert_to('{}', 'UTF8')), 'hex') AS sha;`)
    ).rows[0].sha

    await adminClient.query(
      `INSERT INTO public.fiscal_solicitudes_homologacion(operacion_id, cuerpo_canonico, cuerpo, solicitud_sha256, revision, creado_en)
       VALUES ($1, '{}', '{}'::jsonb, $2, 1, clock_timestamp());`,
      [opId, actualSha]
    )

    await adminClient.query(
      `INSERT INTO public.fiscal_reservas_homologacion(operacion_id, cuit_emisor, punto_venta, tipo_comprobante, numero, estado, intento_id, creado_en, intento_en, solicitud_sha256)
       VALUES ($1, $2, $3, $4, 2, 'ENVIO_INCIERTO', $5, clock_timestamp(), clock_timestamp(), $6);`,
      [opId, PR02_TARGET_CUIT, PR02_TARGET_PV, PR02_TARGET_RECEIPT_TYPE, attemptId, actualSha]
    )

    await expect(runPr02A0PreflightQueries(adminClient)).rejects.toThrow(
      'FISCAL_HISTORY_REQUIRES_RECONCILIATION: Existe una reserva en estado ENVIO_INCIERTO'
    )

    // Cleanup desactivando temporalmente triggers inmutables
    await adminClient.query('ALTER TABLE public.fiscal_operaciones_homologacion DISABLE TRIGGER fiscal_operacion_conservar_cancelacion;')
    await adminClient.query('DELETE FROM public.fiscal_reservas_homologacion WHERE operacion_id = $1;', [opId])
    await adminClient.query('DELETE FROM public.fiscal_solicitudes_homologacion WHERE operacion_id = $1;', [opId])
    await adminClient.query('DELETE FROM public.fiscal_operaciones_homologacion WHERE id = $1;', [opId])
    await adminClient.query('ALTER TABLE public.fiscal_operaciones_homologacion ENABLE TRIGGER fiscal_operacion_conservar_cancelacion;')
    await adminClient.query('DELETE FROM public.ventas WHERE id = $1;', [test4SaleId])
  })

  it('5. Diagnóstico de catálogo vencido en PostgreSQL 17 real: BLOCKED_CATALOG_EXPIRED, EXPIRED, y PR02_READY_FOR_EMISSION_GO = false', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    // Marcar catálogo vencido desactivando temporalmente trigger inmutable
    await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion DISABLE TRIGGER fiscal_parametros_inmutables;')
    await adminClient.query(`
      UPDATE public.fiscal_parametros_homologacion
      SET vence_en = clock_timestamp() - interval '1 hour'
      WHERE revision = 3;
    `)
    await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion ENABLE TRIGGER fiscal_parametros_inmutables;')

    const preflight = await runPr02A0PreflightQueries(adminClient)
    expect(preflight.catalog_is_expired).toBe(true)
    expect(preflight.PR02_A0_CATALOG_GUARD).toBe('EXPIRED')

    const createTestClient = () => {
      return new pg.Client({
        host: '127.0.0.1',
        port: containerPort,
        user: 'postgres',
        password: postgresPassword,
        database: 'postgres',
      })
    }

    // Ejecutar executePr02A0Staging con cliente real inyectado (no conectado previamente)
    const clientExpired = createTestClient()
    const reportExpired = await executePr02A0Staging(
      {
        authorized: true,
        dryRun: false,
        scope: PR02_A0_SCOPE,
        projectRef: PR02_A0_EXECUTION_TARGET,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        password: 'ValidPostgresPassword123!',
      },
      { client: clientExpired, caCert: 'MOCK_CA_CERT' }
    )

    expect(reportExpired.PR02_A0_SQL_SCHEMA_COMPATIBILITY).toBe('PASS')
    expect(reportExpired.PR02_A0_READ_ONLY_AUDIT).toBe('EXECUTED')
    expect(reportExpired.PR02_A0_OPERATIONAL_READINESS).toBe('BLOCKED_CATALOG_EXPIRED')
    expect(reportExpired.PR02_A0_CATALOG_GUARD).toBe('EXPIRED')
    expect(reportExpired.PR02_A0_REMOTE_EXECUTION_READY).toBe(false)
    expect(reportExpired.PR02_READY_FOR_EMISSION_GO).toBe(false)
    expect(reportExpired.HISTORICAL_042_IDENTIFICATION).toBe('UNRESOLVED')
    expect(reportExpired.HISTORICAL_042_REEMISSION_FORBIDDEN).toBe(true)

    // Restaurar vigencia del catálogo desactivando temporalmente trigger inmutable
    await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion DISABLE TRIGGER fiscal_parametros_inmutables;')
    await adminClient.query(`
      UPDATE public.fiscal_parametros_homologacion
      SET vence_en = clock_timestamp() + interval '23 hours'
      WHERE revision = 3;
    `)
    await adminClient.query('ALTER TABLE public.fiscal_parametros_homologacion ENABLE TRIGGER fiscal_parametros_inmutables;')

    // Volver a evaluar con cliente real inyectado
    const clientValid = createTestClient()
    const reportValid = await executePr02A0Staging(
      {
        authorized: true,
        dryRun: false,
        scope: PR02_A0_SCOPE,
        projectRef: PR02_A0_EXECUTION_TARGET,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        password: 'ValidPostgresPassword123!',
      },
      { client: clientValid, caCert: 'MOCK_CA_CERT' }
    )

    expect(reportValid.PR02_A0_OPERATIONAL_READINESS).toBe('READY')
    expect(reportValid.PR02_A0_CATALOG_GUARD).toBe('PASS')
    expect(reportValid.PR02_A0_REMOTE_EXECUTION_READY).toBe(true)
    expect(reportValid.PR02_READY_FOR_EMISSION_GO).toBe(false)
  })

  it('6. Rechazo estricto ante escrituras dentro de la transacción READ ONLY (SQLSTATE 25006)', async () => {
    if (!adminClient) throw new Error('Admin client not connected')

    await adminClient.query('BEGIN;')
    await adminClient.query('SET TRANSACTION READ ONLY;')

    let writeError: any = null
    try {
      await adminClient.query(
        "INSERT INTO public.kioscos(id, nombre) VALUES (gen_random_uuid(), 'Write Attempt Should Fail');"
      )
    } catch (err) {
      writeError = err
    } finally {
      await adminClient.query('ROLLBACK;')
    }

    expect(writeError).not.toBeNull()
    expect(writeError.code).toBe('25006') // read_only_sql_transaction
  })
})
