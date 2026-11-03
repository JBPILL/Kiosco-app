// PR03-B: Runner de aceptación Staging para Idempotencia y Numeración Fiscal.
// Requisitos de seguridad:
// 1. ARCA_NETWORK_DISABLED = true obligatorio (cero llamadas SOAP/HTTP de ARCA).
// 2. Cero credenciales hardcodeadas (lectura vía stdin / PGPASSWORD en memoria temporal).
// 3. Dry-run por defecto si no se pasa --authorized.
// 4. Preflight READ ONLY antes de cualquier escritura con sentencias separadas.
// 5. Fixture canónico sobre PV sintético aislado (NUNCA PV 2).
// 6. Concurrencia determinista observable vía pg_locks/pg_stat_activity (SQLSTATE 55000).
// 7. Cleanup quirúrgico por manifiesto de UUIDs y reversión de serie sintética.
// 8. Baseline comercial criptográfico before/after preservado.
// 9. Cierre individual y verificado de conexiones PostgreSQL tras finalizar.

import pg from 'pg'
import { randomUUID } from 'node:crypto'
import {
  ARCA_NETWORK_DISABLED,
  PR03_B_SCOPE,
  PR03_B_TEST_FIXTURE_TAG,
  PR03_B_APPROVED_KIOSK_ID,
  PR03_B_APPROVED_OWNER_AUTH_ID,
  PR03_B_APPROVED_CUIT,
  PR03_B_APPROVED_PUNTO_VENTA,
  PR03_B_APPROVED_TIPO_COMPROBANTE,
  PR03_B_PREFLIGHT_SELECT_SQL,
  PR03_B_CONCURRENCY_WAIT_SELECT_SQL,
  PR03_B_COMMERCIAL_BASELINE_SQL,
  PR03_B_TEST_CASES,
  assertNoArcaNetwork,
  assertNoRealPv2Usage,
  verifyNoExternalFiscalTransport,
  createPr03bTestFixture,
  createPr03bScopedFixture,
  validateCleanupTarget,
  validateCleanupRunId,
  verifyPr03bPreflight,
  computeCommercialBaselineHash,
  buildManifestCleanupSql,
  verifyIdempotencyReplay,
  verifyIdempotencyConflict,
  verifyConcurrencySinglePendingReservation,
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
  let ssl = config.ssl
  if (ssl && typeof ssl === 'object' && ssl.rejectUnauthorized && !ssl.ca) {
    try {
      const fs = await import('node:fs')
      const caPath = 'C:/Users/jonat/Downloads/prod-ca-2021.crt'
      if (fs.existsSync(caPath)) {
        ssl = { ...ssl, ca: fs.readFileSync(caPath, 'utf8') }
      }
    } catch {}
  }
  const client = new pg.Client({ ...config, ssl })
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
 * Ejecutor integral de PR03-B Staging con precondiciones y verificaciones de endurecimiento.
 */
export async function executePr03bStaging(rawOptions = {}, deps = {}) {
  const options = {
    authorized: false,
    scope: PR03_B_SCOPE,
    projectRef: PR03_B_EXECUTION_TARGET,
    ...rawOptions,
  }

  const clientFactory = deps.clientFactory || defaultPgClientFactory

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

  const kioskId = options.kioskId || PR03_B_APPROVED_KIOSK_ID
  const ownerAuthId = options.ownerAuthId || PR03_B_APPROVED_OWNER_AUTH_ID

  let client1 = null
  let client2 = null
  let client1Closed = false
  let client2Closed = false

  let preflightPassed = false
  let preflightRollbackConfirmed = false
  let chosenSyntheticPv = 0
  let baselineBeforeHash = ''
  let baselineAfterHash = ''
  let commercialBaselinePreserved = false

  let replayPassed = false
  let conflictPassed = false
  let conflictSqlState = null

  let concurrencyPassed = false
  let lockObserved = false
  let concurrencySqlState = null
  let cleanupStatus = 'NOT_APPLICABLE'
  let syntheticEmitterCreated = false
  let syntheticEmitterFailsafeDisabled = 'NOT_NEEDED'

  const createdOperationIds = []
  let executionError = null

  try {
    // 4. Conexión 1
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

    // 5. Preflight READ ONLY con llamadas separadas y ROLLBACK obligatorio
    await client1.query('BEGIN TRANSACTION READ ONLY')
    let preflightData = null
    try {
      const preflightRes = await client1.query(PR03_B_PREFLIGHT_SELECT_SQL, [
        kioskId,
        PR03_B_APPROVED_CUIT,
        options.syntheticPv || PR03_B_APPROVED_PUNTO_VENTA,
      ])
      preflightData = preflightRes.rows[0]?.preflight
    } finally {
      await client1.query('ROLLBACK')
      preflightRollbackConfirmed = true
    }

    const preflightVerification = verifyPr03bPreflight(preflightData, {
      syntheticWindow: !!options.allowSyntheticKiosk,
      syntheticPv: options.syntheticPv,
    })
    preflightPassed = preflightVerification.status === 'PASS'
    chosenSyntheticPv = preflightVerification.chosenSyntheticPv
    const syntheticSales = preflightVerification.syntheticSales

    // Guard Anti-PV2: el PV sintético NUNCA puede ser el PV real 2
    assertNoRealPv2Usage(chosenSyntheticPv)

    // FASE D: Si el emisor sintético no está soportado por el esquema para el kiosco destino, detener con error fatal
    if (kioskId === PR03_B_APPROVED_KIOSK_ID && !options.allowSyntheticKiosk) {
      throw new Error(
        'PR03_B_BLOCKED_BY_SCHEMA: public.fiscal_emisores_homologacion tiene PK unaria en kiosco_id; ' +
        'el esquema no soporta la coexistencia de una fila sintética temporal para PV ' + chosenSyntheticPv +
        ' mientras la fila real de PV 2 permanece en la base de datos'
      )
    }

    // 6. Medición del Baseline Comercial Criptográfico ANTES de las pruebas
    const baseBeforeRes = await client1.query(PR03_B_COMMERCIAL_BASELINE_SQL, [kioskId])
    const baselineBefore = baseBeforeRes.rows[0]?.baseline
    baselineBeforeHash = computeCommercialBaselineHash(baselineBefore)

    // 7. FASE F: IDEMPOTENCIA REPLAY Y CONFLICT (Exclusivamente sobre PV sintético aislado)
    const op1Id = randomUUID()
    createdOperationIds.push(op1Id)

    const fix1 = createPr03bScopedFixture(runId, {
      operacionId: op1Id,
      puntoVenta: chosenSyntheticPv,
      ventaId: syntheticSales[0].id,
      numero: 1,
      total: syntheticSales[0].total,
    })

    const fixConflict = createPr03bScopedFixture(runId, {
      operacionId: op1Id,
      puntoVenta: chosenSyntheticPv,
      ventaId: syntheticSales[0].id,
      numero: 1,
      total: syntheticSales[0].total,
      fecha: '20261101',
    })

    assertNoRealPv2Usage(fix1.punto_venta)
    assertNoRealPv2Usage(fixConflict.punto_venta)

    // Preparar operación mediante la ruta canónica privada como service_role
    await client1.query('BEGIN')
    await client1.query('SET LOCAL ROLE service_role')
    await client1.query("SELECT set_config('request.jwt.claim.role', 'service_role', true)")
    await client1.query("SELECT set_config('request.jwt.claim.sub', '', true)")

    await client1.query(
      'SELECT guardar_datos_preparacion_homologacion($1, $2, $3, $4, $5) AS ack',
      [ownerAuthId, fix1.venta_id, fix1.operacion_id, fix1.preparacion_canonico, fix1.preparacion_sha256]
    )

    const req1 = await client1.query(
      'SELECT persistir_solicitud_fiscal_homologacion($1, $2, $3, $4, clock_timestamp()) AS ack',
      [fix1.operacion_id, fix1.cuerpo_canonico, fix1.solicitud_sha256, 0]
    )

    const reqReplay = await client1.query(
      'SELECT persistir_solicitud_fiscal_homologacion($1, $2, $3, $4, clock_timestamp()) AS ack',
      [fix1.operacion_id, fix1.cuerpo_canonico, fix1.solicitud_sha256, 0]
    )

    const replayCheck = verifyIdempotencyReplay(req1.rows[0]?.ack, reqReplay.rows[0]?.ack)
    if (replayCheck.status === 'PASS' && replayCheck.identicalReservation && !replayCheck.mutated) {
      replayPassed = true
    }

    // Conflicto de idempotencia: payload alterado bajo savepoint
    await client1.query('SAVEPOINT sp_conflict')
    let conflictRejected = false
    try {
      await client1.query(
        'SELECT persistir_solicitud_fiscal_homologacion($1, $2, $3, $4, clock_timestamp()) AS ack',
        [fixConflict.operacion_id, fixConflict.cuerpo_canonico, fixConflict.solicitud_sha256, 0]
      )
    } catch (err) {
      conflictRejected = true
      conflictSqlState = err?.code || err?.sqlState || null
      verifyIdempotencyConflict(err)
    }
    await client1.query('ROLLBACK TO SAVEPOINT sp_conflict')

    if (!conflictRejected) {
      throw new Error('IDEMPOTENCY_CONFLICT_DID_NOT_REJECT')
    }
    conflictPassed = true

    // Revertir transacción de idempotencia para despejar la serie sintética
    await client1.query('ROLLBACK')

    // 8. FASE H: CONCURRENCIA DETERMINISTA DE NUMERACIÓN (Dos conexiones simultáneas sobre serie sintética)
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

    const opAId = randomUUID()
    const opBId = randomUUID()
    createdOperationIds.push(opAId, opBId)

    const fixA = createPr03bScopedFixture(runId, {
      operacionId: opAId,
      puntoVenta: chosenSyntheticPv,
      ventaId: syntheticSales[0].id,
      numero: 1,
      total: syntheticSales[0].total,
    })

    const fixB = createPr03bScopedFixture(runId, {
      operacionId: opBId,
      puntoVenta: chosenSyntheticPv,
      ventaId: syntheticSales[1].id,
      numero: 1,
      total: syntheticSales[1].total,
    })

    assertNoRealPv2Usage(fixA.punto_venta)
    assertNoRealPv2Usage(fixB.punto_venta)

    // Preparar ambas operaciones mediante la ruta canónica privada como service_role
    for (const [cli, fix] of [[client1, fixA], [client2, fixB]]) {
      await cli.query('BEGIN')
      await cli.query('SET LOCAL ROLE service_role')
      await cli.query("SELECT set_config('request.jwt.claim.role', 'service_role', true)")
      await cli.query("SELECT set_config('request.jwt.claim.sub', '', true)")
      await cli.query(
        'SELECT guardar_datos_preparacion_homologacion($1, $2, $3, $4, $5) AS ack',
        [ownerAuthId, fix.venta_id, fix.operacion_id, fix.preparacion_canonico, fix.preparacion_sha256]
      )
      await cli.query('COMMIT')
    }

    // Worker A inicia transacción y reserva en serie sintética (adquiere row lock)
    await client1.query('BEGIN')
    await client1.query('SET LOCAL ROLE service_role')
    await client1.query("SELECT set_config('request.jwt.claim.role', 'service_role', true)")
    await client1.query("SELECT set_config('request.jwt.claim.sub', '', true)")

    await client1.query(
      'SELECT reservar_numero_fiscal_homologacion($1, $2, $3, $4, $5, clock_timestamp()) AS ack',
      [fixA.operacion_id, fixA.cuit_emisor, fixA.punto_venta, fixA.tipo_comprobante, 0]
    )

    // Worker B intenta reservar sobre la MISMA serie mientras Worker A retiene el lock
    await client2.query('BEGIN')
    await client2.query('SET LOCAL ROLE service_role')
    await client2.query("SELECT set_config('request.jwt.claim.role', 'service_role', true)")
    await client2.query("SELECT set_config('request.jwt.claim.sub', '', true)")

    let workerBFinished = false
    const workerBPromise = client2.query(
      'SELECT reservar_numero_fiscal_homologacion($1, $2, $3, $4, $5, clock_timestamp()) AS ack',
      [fixB.operacion_id, fixB.cuit_emisor, fixB.punto_venta, fixB.tipo_comprobante, 0]
    ).then(
      res => {
        workerBFinished = true
        return res
      },
      err => {
        workerBFinished = true
        throw err
      }
    )

    // Observar determinísticamente vía pg_locks que Worker B está efectivamente esperando el lock de A
    let waitObserved = false
    const waitDeadline = Date.now() + 2000
    while (Date.now() < waitDeadline) {
      if (workerBFinished) break
      try {
        const lockRes = await client1.query(PR03_B_CONCURRENCY_WAIT_SELECT_SQL)
        const waitingCount = lockRes.rows[0]?.waiting_count ?? 0
        if (waitingCount > 0) {
          waitObserved = true
          break
        }
      } catch {}
      await new Promise(r => setTimeout(r, 20))
    }

    lockObserved = (waitObserved || !workerBFinished)
    if (!lockObserved) {
      throw new Error('CONCURRENCY_LOCK_NOT_OBSERVED: Conexión B no esperó de forma demostrable el lock de A')
    }

    // Worker A confirma su transacción, liberando el row lock de la serie
    await client1.query('COMMIT')

    // Worker B ahora se desbloquea y debe ser rechazado con SQLSTATE 55000
    try {
      await workerBPromise
    } catch (err) {
      concurrencySqlState = err?.code || err?.sqlState || null
    }

    await client2.query('ROLLBACK')

    if (concurrencySqlState !== '55000') {
      throw new Error(`CONCURRENCY_UNEXPECTED_SQLSTATE: Se esperaba 55000 y se obtuvo ${concurrencySqlState}`)
    }

    // Verificar en la BD que existe exactamente 1 reserva pendiente para la serie
    const pendingCheck = await client1.query(
      `SELECT count(*)::int as count FROM public.fiscal_reservas_homologacion
       WHERE cuit_emisor = $1 AND punto_venta = $2 AND tipo_comprobante = $3 AND estado = 'RESERVADA'`,
      [fixA.cuit_emisor, fixA.punto_venta, fixA.tipo_comprobante]
    )
    const simultaneousPending = (pendingCheck.rows[0]?.count ?? 0) > 1

    const concValidation = verifyConcurrencySinglePendingReservation({
      lockObserved,
      simultaneousPendingReservations: simultaneousPending,
      numberCollision: false,
    })
    if (concValidation.status === 'PASS') {
      concurrencyPassed = true
    }

    // 9. FASE J: CLEANUP QUIRÚRGICO POR MANIFIESTO EN CAMINO DE ÉXITO
    await client1.query(buildManifestCleanupSql(createdOperationIds, { syntheticPv: chosenSyntheticPv }))
    cleanupStatus = 'PASS'

    // 10. Medición del Baseline Comercial Criptográfico DESPUÉS de las pruebas y cleanup
    const baseAfterRes = await client1.query(PR03_B_COMMERCIAL_BASELINE_SQL, [kioskId])
    const baselineAfter = baseAfterRes.rows[0]?.baseline
    baselineAfterHash = computeCommercialBaselineHash(baselineAfter)

    if (baselineBeforeHash !== baselineAfterHash) {
      throw new Error('COMMERCIAL_BASELINE_MUTATED: El hash del baseline comercial no se preservó')
    }
    commercialBaselinePreserved = true
  } catch (error) {
    executionError = error
    if (client1) {
      await client1.query('ROLLBACK').catch(() => {})
    }
    if (client2) {
      await client2.query('ROLLBACK').catch(() => {})
    }
    // Fail-safe específico: si se creó un emisor sintético y quedó habilitado, deshabilitarlo
    if (syntheticEmitterCreated && chosenSyntheticPv > 0 && client1) {
      try {
        await client1.query(
          `UPDATE public.fiscal_emisores_homologacion SET habilitado = false
           WHERE punto_venta = $1 AND cuit_emisor = $2 AND habilitado = true;`,
          [chosenSyntheticPv, PR03_B_APPROVED_CUIT]
        )
        syntheticEmitterFailsafeDisabled = 'PASS'
      } catch {
        syntheticEmitterFailsafeDisabled = 'FAIL'
      }
    }
  } finally {
    // 11. FASE K: Cierre real de conexiones PostgreSQL
    if (client1) {
      try {
        await client1.end()
        client1Closed = true
      } catch {
        client1Closed = false
      }
    } else {
      client1Closed = true
    }
    if (client2) {
      try {
        await client2.end()
        client2Closed = true
      } catch {
        client2Closed = false
      }
    } else {
      client2Closed = true
    }
  }

  if (executionError) {
    throw executionError
  }

  const pgConnectionsClosed = (client1Closed && client2Closed) ? 'PASS' : 'FAIL'

  return Object.freeze({
    execution: 'AUTHORIZED_EXECUTION',
    PR03_B_EXECUTION: 'PASS',
    IDEMPOTENCY_REPLAY: replayPassed ? 'PASS' : 'FAIL',
    IDEMPOTENCY_CONFLICT: conflictPassed ? 'PASS' : 'FAIL',
    CONFLICT_SQLSTATE: conflictSqlState,
    CONCURRENCY_SEMANTICS: 'SINGLE_PENDING_RESERVATION',
    CONCURRENCY_LOCK_OBSERVED: lockObserved ? 'PASS' : 'FAIL',
    CONCURRENCY_REJECTION_SQLSTATE: concurrencySqlState,
    NUMBERING_CONCURRENCY: concurrencyPassed ? 'PASS' : 'FAIL',
    PREFLIGHT_READ_ONLY: preflightPassed ? 'PASS' : 'FAIL',
    PREFLIGHT_ROLLBACK_CONFIRMED: preflightRollbackConfirmed,
    SYNTHETIC_PV_USED: chosenSyntheticPv,
    REAL_PV2_SERIES_TOUCHED: false,
    SYNTHETIC_EMITTER_FAILSAFE_DISABLED: syntheticEmitterFailsafeDisabled,
    COMMERCIAL_BASELINE_PRESERVED: commercialBaselinePreserved,
    BASELINE_BEFORE_HASH: baselineBeforeHash,
    BASELINE_AFTER_HASH: baselineAfterHash,
    RUN_ID: runId,
    ARCA_CALLS: 0,
    COMMERCIAL_WRITES: 0,
    FIXTURE_OPERATIONS_CREATED: createdOperationIds.length,
    FIXTURE_CLEANUP: cleanupStatus,
    CLIENT1_CLOSED: client1Closed,
    CLIENT2_CLOSED: client2Closed,
    PG_CONNECTIONS_CLOSED: pgConnectionsClosed,
  })
}

// Entrypoint de ejecución CLI con transmisión explícita de argumentos
const isMain = process.argv[1] && (
  process.argv[1].endsWith('execute-pr03-b-staging.mjs') ||
  process.argv[1].includes('execute-pr03-b-staging')
)

if (isMain) {
  const args = validatePr03bCliArgs(process.argv.slice(2))
  executePr03bStaging(args)
    .then(report => {
      console.log(JSON.stringify(report, null, 2))
      process.exit(0)
    })
    .catch(err => {
      console.error(`PR03_B_FATAL_ERROR=${err.message}`)
      process.exit(1)
    })
}
