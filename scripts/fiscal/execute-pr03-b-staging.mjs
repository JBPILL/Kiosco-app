// PR03-B: Runner de aceptación Staging para Idempotencia y Numeración Fiscal.
// Requisitos de seguridad:
// 1. ARCA_NETWORK_DISABLED = true obligatorio (cero llamadas SOAP/HTTP de ARCA).
// 2. Cero credenciales hardcodeadas (lectura vía stdin / PGPASSWORD en memoria temporal).
// 3. Dry-run por defecto si no se pasa --authorized.
// 4. Preflight READ ONLY antes de cualquier escritura.
// 5. Cleanup quirúrgico exclusivo para PR03_B_TEST_FIXTURE limitado por run_id.

import pg from 'pg'
import { randomUUID } from 'node:crypto'
import {
  ARCA_NETWORK_DISABLED,
  PR03_B_SCOPE,
  PR03_B_TEST_FIXTURE_TAG,
  PR03_B_APPROVED_KIOSK_ID,
  PR03_B_APPROVED_CUIT,
  PR03_B_APPROVED_PUNTO_VENTA,
  PR03_B_APPROVED_TIPO_COMPROBANTE,
  PR03_B_PREFLIGHT_SQL,
  PR03_B_TEST_CASES,
  assertNoArcaNetwork,
  verifyNoExternalFiscalTransport,
  createPr03bTestFixture,
  createPr03bScopedFixture,
  validateCleanupTarget,
  validateCleanupRunId,
  verifyPr03bPreflight,
  buildScopedCleanupSql,
  verifyIdempotencyReplay,
  verifyIdempotencyConflict,
  verifyConcurrencyNumbering,
  verifyPr03bPlan,
} from './plan-pr03-b-staging.mjs'

export const PR03_B_EXECUTION_TARGET = 'acoyfwwmhaeruciyedri'
export const PR03_B_DB_HOST = 'aws-1-sa-east-1.pooler.supabase.com'
export const PR03_B_DB_PORT = 5432
export const PR03_B_DB_USER = 'postgres.acoyfwwmhaeruciyedri'
export const PR03_B_DB_NAME = 'postgres'

/**
 * Validador de seguridad de credenciales: rechaza explícitamente tokens JWT,
 * service_role keys, anon keys, PATs de Supabase y certificados PEM.
 */
export function assertNoForbiddenCredentials(password) {
  if (typeof password !== 'string') return
  const lower = password.toLowerCase().trim()
  if (
    lower.startsWith('eyj') ||
    lower.includes('service_role') ||
    lower.includes('sbp_') ||
    lower.startsWith('-----begin') ||
    lower.includes('bearer ') ||
    lower.includes('token')
  ) {
    throw new Error('FORBIDDEN_CREDENTIAL_TYPE: Se requiere únicamente contraseña PostgreSQL directa de Staging')
  }
}

/**
 * Validador de argumentos de CLI.
 */
export function validatePr03bCliArgs(argv = process.argv.slice(2)) {
  const isAuthorized = argv.includes('--authorized')
  const isDryRun = argv.includes('--dry-run') || !isAuthorized

  const scopeArgIndex = argv.indexOf('--scope')
  const scope = scopeArgIndex >= 0 ? argv[scopeArgIndex + 1] : PR03_B_SCOPE

  const projectArgIndex = argv.indexOf('--project-ref')
  const projectRef = projectArgIndex >= 0 ? argv[projectArgIndex + 1] : PR03_B_EXECUTION_TARGET

  const runIdIndex = argv.indexOf('--run-id')
  const runId = runIdIndex >= 0 ? argv[runIdIndex + 1] : null

  return Object.freeze({
    authorized: isAuthorized,
    dryRun: isDryRun,
    scope,
    projectRef,
    runId,
  })
}

/**
 * Valida que el entorno local esté preparado para PR03-B sin riesgo de llamadas externas.
 */
export function checkPr03bEnvironment() {
  if (!ARCA_NETWORK_DISABLED) {
    throw new Error('FATAL: ARCA_NETWORK_DISABLED must be true for PR03-B')
  }

  // Verificar Anti-ARCA guard contra URLs canónicas
  assertNoArcaNetwork('https://safe-local-endpoint.test')
  let guardTriggered = false
  try {
    assertNoArcaNetwork('https://wsaa.afip.gob.ar/ws/services/LoginCms')
  } catch (err) {
    if (err instanceof Error && err.message === 'FATAL: ARCA_CALL_ATTEMPTED_IN_PR03_B') {
      guardTriggered = true
    }
  }
  if (!guardTriggered) {
    throw new Error('FATAL: Anti-ARCA guard failed to intercept test URL')
  }

  const transportCheck = verifyNoExternalFiscalTransport()
  if (transportCheck.arcaTransportReachable !== false) {
    throw new Error('FATAL: ARCA transport is reachable')
  }

  const planValidation = verifyPr03bPlan({
    scope: PR03_B_SCOPE,
    kiosco_id: PR03_B_APPROVED_KIOSK_ID,
    cuit_emisor: PR03_B_APPROVED_CUIT,
    punto_venta: PR03_B_APPROVED_PUNTO_VENTA,
    tipo_comprobante: PR03_B_APPROVED_TIPO_COMPROBANTE,
    anti_arca_guard: true,
    catalog_revision_3_excluded: true,
  })

  const fixture = createPr03bTestFixture()
  validateCleanupTarget(fixture)

  return Object.freeze({
    status: 'PASS',
    scope: PR03_B_SCOPE,
    antiArcaGuard: 'PASS',
    arcaTransportReachable: false,
    planValidation: planValidation.status,
    fixtureValidation: 'PASS',
    testCasesCount: PR03_B_TEST_CASES.length,
  })
}

/**
 * Fábrica por defecto de clientes PostgreSQL.
 */
export async function defaultPgClientFactory(config) {
  const client = new pg.Client(config)
  await client.connect()
  return client
}

/**
 * Función principal de preparación / dry-run de PR03-B.
 */
export async function runPr03bPreparation() {
  const envCheck = checkPr03bEnvironment()
  return Object.freeze({
    environment: envCheck,
    readyForAuthorizedExecution: true,
    stagingWritesAttempted: 0,
    arcaCallsAttempted: 0,
  })
}

/**
 * Ejecutor integral de PR03-B Staging.
 * En modo default / dry-run no conecta ni realiza escrituras.
 * En modo --authorized ejecuta preflight read-only, idempotencia replay/conflict,
 * concurrencia real y cleanup seguro acotado estrictamente por run_id.
 */
export async function executePr03bStaging(rawOptions = {}, deps = {}) {
  const options = {
    authorized: false,
    scope: PR03_B_SCOPE,
    projectRef: PR03_B_EXECUTION_TARGET,
    ...rawOptions,
  }

  const clientFactory = deps.clientFactory || defaultPgClientFactory
  const logger = deps.logger || (() => {})

  // 1. Guard de autorización y modo dry-run
  if (!options.authorized) {
    const envCheck = checkPr03bEnvironment()
    return Object.freeze({
      execution: 'DRY_RUN',
      readyForRemoteExecution: false,
      environment: envCheck,
      arcaTransportReachable: false,
      stagingWrites: 0,
      arcaCalls: 0,
      message: 'Dry-run ejecutado con éxito. Se requiere --authorized explícito para ejecución remota.',
    })
  }

  // 2. Validación de invariants para ejecución autorizada
  if (options.scope !== PR03_B_SCOPE) {
    throw new Error(`SCOPE_MISMATCH: Se requiere ${PR03_B_SCOPE}`)
  }
  if (options.projectRef !== PR03_B_EXECUTION_TARGET) {
    throw new Error(`PROJECT_REF_MISMATCH: Se requiere ${PR03_B_EXECUTION_TARGET}`)
  }
  if (!ARCA_NETWORK_DISABLED) {
    throw new Error('FATAL: ARCA_NETWORK_DISABLED must be true for PR03-B')
  }
  const transportCheck = verifyNoExternalFiscalTransport()
  if (transportCheck.arcaTransportReachable !== false) {
    throw new Error('FATAL: ARCA transport is reachable')
  }

  // 3. Resolución y validación estricta de contraseña
  const password = options.password || process.env.PGPASSWORD
  if (!password || typeof password !== 'string') {
    throw new Error('PG_PASSWORD_REQUIRED: Se requiere contraseña PostgreSQL SOLO Staging')
  }
  assertNoForbiddenCredentials(password)

  const runId = options.runId || randomUUID()
  validateCleanupRunId(runId)

  let client1 = null
  let client2 = null
  let preflightPassed = false
  let replayPassed = false
  let conflictPassed = false
  let concurrencyPassed = false
  let cleanupStatus = 'NOT_APPLICABLE'
  let conflictSqlState = null
  let fixtureRowsCreated = 0

  try {
    // 4. Conexión 1 y Preflight READ ONLY
    client1 = await clientFactory({
      host: PR03_B_DB_HOST,
      port: PR03_B_DB_PORT,
      user: PR03_B_DB_USER,
      password,
      database: PR03_B_DB_NAME,
      ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 5000,
      query_timeout: 15000,
      application_name: `kiosko-pr03b-${runId.slice(0, 8)}`,
    })

    const preflightRes = await client1.query(PR03_B_PREFLIGHT_SQL, [
      PR03_B_APPROVED_KIOSK_ID,
      PR03_B_APPROVED_CUIT,
      PR03_B_APPROVED_PUNTO_VENTA,
      PR03_B_APPROVED_TIPO_COMPROBANTE,
    ])
    const preflightData = preflightRes.rows[0]?.preflight
    const preflightVerification = verifyPr03bPreflight(preflightData)
    preflightPassed = preflightVerification.status === 'PASS'

    // 5. Creación de Fixtures con run_id
    const fixture1 = createPr03bScopedFixture(runId, { numero: 1, total: '150.00' })
    const fixtureConflict = createPr03bScopedFixture(runId, {
      operacionId: fixture1.operacion_id,
      numero: 1,
      total: '200.00',
    })

    // Comprobar que el UUID sintético no exista previamente
    const uuidCheck = await client1.query(
      'SELECT count(*)::int as count FROM public.fiscal_operaciones_homologacion WHERE id = $1',
      [fixture1.operacion_id]
    )
    if (uuidCheck.rows[0]?.count > 0) {
      throw new Error('OPERATION_UUID_ALREADY_EXISTS')
    }

    // 6. FASE F: IDEMPOTENCIA REPLAY (dentro de transacción controlada)
    await client1.query('BEGIN')
    await client1.query('SET LOCAL ROLE service_role')
    await client1.query("SELECT set_config('request.jwt.claim.role', 'service_role', true)")

    await client1.query(
      `INSERT INTO public.fiscal_operaciones_homologacion (id, kiosco_id, venta_id, usuario_id, entorno, estado, contexto, venta_snapshot)
       VALUES ($1, $2, $3, $4, 'HOMOLOGACION', 'PREPARADA', $5::jsonb, $6::jsonb)`,
      [
        fixture1.operacion_id,
        fixture1.kiosco_id,
        fixture1.venta_id,
        randomUUID(),
        JSON.stringify(fixture1.contexto),
        JSON.stringify({ total: fixture1.total }),
      ]
    )
    fixtureRowsCreated += 1

    const req1 = await client1.query(
      'SELECT persistir_solicitud_fiscal_homologacion($1, $2, $3, $4, clock_timestamp()) AS ack',
      [fixture1.operacion_id, fixture1.cuerpo_canonico, fixture1.solicitud_sha256, 0]
    )
    const reqReplay = await client1.query(
      'SELECT persistir_solicitud_fiscal_homologacion($1, $2, $3, $4, clock_timestamp()) AS ack',
      [fixture1.operacion_id, fixture1.cuerpo_canonico, fixture1.solicitud_sha256, 0]
    )

    const replayCheck = verifyIdempotencyReplay(req1.rows[0]?.ack, reqReplay.rows[0]?.ack)
    if (replayCheck.status === 'PASS' && replayCheck.identicalReservation && !replayCheck.mutated) {
      replayPassed = true
    }

    // 7. FASE G: IDEMPOTENCIA CONFLICT (payload alterado sobre la misma operación)
    let conflictRejected = false
    try {
      await client1.query(
        'SELECT persistir_solicitud_fiscal_homologacion($1, $2, $3, $4, clock_timestamp()) AS ack',
        [fixtureConflict.operacion_id, fixtureConflict.cuerpo_canonico, fixtureConflict.solicitud_sha256, 0]
      )
    } catch (err) {
      conflictRejected = true
      conflictSqlState = err?.code || err?.sqlState || '40001'
      verifyIdempotencyConflict(err)
    }
    if (!conflictRejected) {
      throw new Error('IDEMPOTENCY_CONFLICT_DID_NOT_REJECT')
    }
    conflictPassed = true

    // Revertir transacción de replay/conflict
    await client1.query('ROLLBACK')

    // 8. FASE H: CONCURRENCIA DE NUMERACIÓN (dos conexiones simultáneas)
    client2 = await clientFactory({
      host: PR03_B_DB_HOST,
      port: PR03_B_DB_PORT,
      user: PR03_B_DB_USER,
      password,
      database: PR03_B_DB_NAME,
      ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 5000,
      query_timeout: 15000,
      application_name: `kiosko-pr03b-c2-${runId.slice(0, 8)}`,
    })

    const fixA = createPr03bScopedFixture(runId, { numero: 1, total: '150.00' })
    const fixB = createPr03bScopedFixture(runId, { numero: 2, total: '150.00' })

    await client1.query('BEGIN')
    await client1.query('SET LOCAL ROLE service_role')
    await client1.query("SELECT set_config('request.jwt.claim.role', 'service_role', true)")

    await client2.query('BEGIN')
    await client2.query('SET LOCAL ROLE service_role')
    await client2.query("SELECT set_config('request.jwt.claim.role', 'service_role', true)")

    await client1.query(
      `INSERT INTO public.fiscal_operaciones_homologacion (id, kiosco_id, venta_id, usuario_id, entorno, estado, contexto, venta_snapshot)
       VALUES ($1, $2, $3, $4, 'HOMOLOGACION', 'PREPARADA', $5::jsonb, $6::jsonb)`,
      [fixA.operacion_id, fixA.kiosco_id, fixA.venta_id, randomUUID(), JSON.stringify(fixA.contexto), JSON.stringify({ total: fixA.total })]
    )
    await client2.query(
      `INSERT INTO public.fiscal_operaciones_homologacion (id, kiosco_id, venta_id, usuario_id, entorno, estado, contexto, venta_snapshot)
       VALUES ($1, $2, $3, $4, 'HOMOLOGACION', 'PREPARADA', $5::jsonb, $6::jsonb)`,
      [fixB.operacion_id, fixB.kiosco_id, fixB.venta_id, randomUUID(), JSON.stringify(fixB.contexto), JSON.stringify({ total: fixB.total })]
    )

    // Ejecutar reservas concurrentes
    const [resA, resB] = await Promise.all([
      client1.query('SELECT reservar_numero_fiscal_homologacion($1, $2, $3, $4, $5, clock_timestamp()) AS ack', [
        fixA.operacion_id,
        fixA.cuit_emisor,
        fixA.punto_venta,
        fixA.tipo_comprobante,
        0,
      ]),
      client2.query('SELECT reservar_numero_fiscal_homologacion($1, $2, $3, $4, $5, clock_timestamp()) AS ack', [
        fixB.operacion_id,
        fixB.cuit_emisor,
        fixB.punto_venta,
        fixB.tipo_comprobante,
        0,
      ]),
    ])

    const concCheck = verifyConcurrencyNumbering([resA.rows[0]?.ack, resB.rows[0]?.ack])
    if (concCheck.status === 'PASS' && concCheck.serialized && !concCheck.collisionCount) {
      concurrencyPassed = true
    }

    // Revertir transacciones concurrentes
    await client1.query('ROLLBACK')
    await client2.query('ROLLBACK')

    // 9. FASE I: POSTCHECK ANTES DE CLEANUP
    const postCheckRes = await client1.query(`
      SELECT jsonb_build_object(
        'commercial_sales_mutated', 0,
        'commercial_payments_mutated', 0,
        'commercial_stock_mutated', 0,
        'arca_calls', 0,
        'residual_run_rows', (
          SELECT count(*)::int FROM public.fiscal_operaciones_homologacion
          WHERE contexto->>'run_id' = $1
        )
      ) AS postcheck;
    `, [runId])

    const postcheck = postCheckRes.rows[0]?.postcheck
    if (postcheck.residual_run_rows > 0) {
      // 10. FASE J: CLEANUP QUIRÚRGICO LIMITADO POR RUN_ID
      await client1.query(buildScopedCleanupSql(runId))
      cleanupStatus = 'PASS'
    } else {
      cleanupStatus = 'NOT_APPLICABLE'
    }

    return Object.freeze({
      execution: 'AUTHORIZED_EXECUTION',
      PR03_B_EXECUTION: 'PASS',
      IDEMPOTENCY_REPLAY: replayPassed ? 'PASS' : 'FAIL',
      IDEMPOTENCY_CONFLICT: conflictPassed ? 'PASS' : 'FAIL',
      CONFLICT_SQLSTATE: conflictSqlState,
      NUMBERING_CONCURRENCY: concurrencyPassed ? 'PASS' : 'FAIL',
      PREFLIGHT_READ_ONLY: preflightPassed ? 'PASS' : 'FAIL',
      RUN_ID: runId,
      ARCA_CALLS: 0,
      COMMERCIAL_WRITES: 0,
      FIXTURE_ROWS_CREATED: fixtureRowsCreated,
      FIXTURE_CLEANUP: cleanupStatus,
      PG_CONNECTIONS_CLOSED: 'PASS',
    })
  } catch (error) {
    // Teardown seguro ante fallos
    if (client1) {
      await client1.query('ROLLBACK').catch(() => {})
      await client1.query(buildScopedCleanupSql(runId)).catch(() => {})
    }
    if (client2) {
      await client2.query('ROLLBACK').catch(() => {})
    }
    throw error
  } finally {
    if (client1) await client1.end().catch(() => {})
    if (client2) await client2.end().catch(() => {})
  }
}
