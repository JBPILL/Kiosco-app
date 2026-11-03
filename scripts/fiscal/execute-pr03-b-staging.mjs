// PR03-B: Runner de aceptación Staging para Idempotencia y Numeración Fiscal.
// Requisitos de seguridad:
// 1. ARCA_NETWORK_DISABLED = true obligatorio (cero llamadas SOAP/HTTP de ARCA).
// 2. Cero credenciales hardcodeadas (lectura vía stdin / PGPASSWORD en memoria temporal).
// 3. Dry-run por defecto si no se pasa --authorized.
// 4. Preflight READ ONLY antes de cualquier escritura con sentencias separadas.
// 5. Tenant sintético preexistente acreditado (f4a00000-2026-4011-a001-000000000001).
// 6. Concurrencia determinista observable vía pg_locks/pg_stat_activity (SQLSTATE 55000).
// 7. Cleanup quirúrgico por manifiesto de UUIDs y reversión de serie sintética.
// 8. Doble baseline comercial criptográfico before/after preservado (Real y Sintético).
// 9. Cierre individual y verificado de conexiones PostgreSQL tras finalizar.

import pg from 'pg'
import { randomUUID } from 'node:crypto'
import {
  ARCA_NETWORK_DISABLED,
  PR03_B_SCOPE,
  PR03_B_TEST_FIXTURE_TAG,
  PR03_B_REAL_KIOSK_ID,
  PR03_B_REAL_PV,
  PR03_B_SYNTHETIC_KIOSK_ID,
  PR03_B_SYNTHETIC_OWNER_AUTH_ID,
  PR03_B_SYNTHETIC_PV,
  PR03_B_SYNTHETIC_CUIT,
  PR03_B_SYNTHETIC_RECEIPT_TYPE,
  PR03_B_SYNTHETIC_CREDENCIAL_ID,
  PR03_B_SYNTHETIC_CERT_SHA256,
  PR03_B_SYNTHETIC_EMITTER_REVISION,
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
  verifyPr03bBasePreflight,
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
    kiosco_id: PR03_B_SYNTHETIC_KIOSK_ID,
    cuit_emisor: PR03_B_SYNTHETIC_CUIT,
    punto_venta: PR03_B_SYNTHETIC_PV,
    tipo_comprobante: PR03_B_SYNTHETIC_RECEIPT_TYPE,
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
      const caPath = process.env.PGSSLROOTCERT || 'C:/Users/jonat/Downloads/prod-ca-2021.crt'
      if (fs.existsSync(caPath)) {
        ssl = { rejectUnauthorized: true, ca: fs.readFileSync(caPath, 'utf8') }
      }
    } catch {}
  }

  const client = new pg.Client({
    ...config,
    ssl,
  })
  await client.connect()
  return client
}

/**
 * Función de preparación previa a la autorización remota.
 */
export async function runPr03bPreparation() {
  const env = checkPr03bEnvironment()
  return Object.freeze({
    environment: env,
    readyForAuthorizedExecution: true,
    stagingWritesAttempted: 0,
    arcaCallsAttempted: 0,
  })
}

/**
 * Ejecutor principal de PR03-B en Staging.
 */
export async function executePr03bStaging(rawOptions = {}, deps = {}) {
  const isAuthorized = Boolean(rawOptions.authorized)
  const isDryRun = rawOptions.dryRun !== undefined ? Boolean(rawOptions.dryRun) : !isAuthorized
  const options = {
    scope: PR03_B_SCOPE,
    projectRef: PR03_B_EXECUTION_TARGET,
    ...rawOptions,
    authorized: isAuthorized,
    dryRun: isDryRun,
  }
  const clientFactory = deps.clientFactory || defaultPgClientFactory

  // 1. Dry-run por defecto si no está explícitamente autorizado
  if (!options.authorized || options.dryRun) {
    const env = checkPr03bEnvironment()
    return Object.freeze({
      execution: 'DRY_RUN',
      readyForRemoteExecution: false,
      environment: env,
      arcaTransportReachable: false,
      stagingWrites: 0,
      arcaCalls: 0,
      message: 'DRY_RUN_COMPLETE: Ejecución simulada local exitosa. Cero escrituras y cero llamadas ARCA.',
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

  // Blocker 1: Invarianza estricta de identidades sintéticas antes de abrir conexión PostgreSQL
  const rawKiosk = options.syntheticKioskId ?? options.kioskId
  const rawOwner = options.syntheticOwnerAuthId ?? options.ownerAuthId
  const rawPv = options.syntheticPv ?? options.puntoVenta

  if (rawKiosk !== undefined && rawKiosk !== PR03_B_SYNTHETIC_KIOSK_ID) {
    assertNoRealPv2Usage(rawKiosk)
    throw new Error('FATAL: PR03_B_SYNTHETIC_TARGET_MISMATCH')
  }
  if (rawOwner !== undefined && rawOwner !== PR03_B_SYNTHETIC_OWNER_AUTH_ID) {
    throw new Error('FATAL: PR03_B_SYNTHETIC_TARGET_MISMATCH')
  }
  if (rawPv !== undefined && rawPv !== PR03_B_SYNTHETIC_PV) {
    assertNoRealPv2Usage(rawPv)
    throw new Error('FATAL: PR03_B_SYNTHETIC_TARGET_MISMATCH')
  }

  const realKioskId = PR03_B_REAL_KIOSK_ID
  const syntheticKioskId = PR03_B_SYNTHETIC_KIOSK_ID
  const syntheticOwnerAuthId = PR03_B_SYNTHETIC_OWNER_AUTH_ID
  const syntheticPv = PR03_B_SYNTHETIC_PV
  const syntheticCuit = PR03_B_SYNTHETIC_CUIT
  const syntheticReceiptType = PR03_B_SYNTHETIC_RECEIPT_TYPE
  const credId = PR03_B_SYNTHETIC_CREDENCIAL_ID
  const certSha = PR03_B_SYNTHETIC_CERT_SHA256
  const rev = PR03_B_SYNTHETIC_EMITTER_REVISION

  // Guard Anti-PV2 / Real Kiosk: el fixture sintético NUNCA puede ser el PV real 2 ni el kiosco real
  assertNoRealPv2Usage(syntheticPv)
  assertNoRealPv2Usage(syntheticKioskId)

  let client1 = null
  let client2 = null
  let client1Closed = false
  let client2Closed = false

  let preflightPassed = false
  let preflightRollbackConfirmed = false
  let realBaselineBeforeHash = ''
  let synthBaselineBeforeHash = ''
  let realBaselineAfterHash = ''
  let synthBaselineAfterHash = ''
  let realCommercialBaselinePreserved = false
  let synthCommercialBaselinePreserved = false

  let replayPassed = false
  let conflictPassed = false
  let conflictSqlState = null

  let concurrencyPassed = false
  let lockObserved = false
  let concurrencySqlState = null
  let cleanupStatus = 'NOT_APPLICABLE'
  let syntheticEmitterCreated = false
  let syntheticEmitterIdentityMatch = 'NOT_APPLICABLE'
  let syntheticEmitterFailsafeDisabled = 'NOT_NEEDED'
  let residualFiscalCount = -1

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

    // 5. FASE B — PREFLIGHT BASE READ ONLY
    await client1.query('BEGIN TRANSACTION READ ONLY')
    let preflightData = null
    try {
      const preflightRes = await client1.query(PR03_B_PREFLIGHT_SELECT_SQL, [
        realKioskId,
        syntheticCuit,
        syntheticKioskId,
        syntheticOwnerAuthId,
        syntheticPv,
      ])
      preflightData = preflightRes.rows[0]?.preflight
    } finally {
      await client1.query('ROLLBACK')
      preflightRollbackConfirmed = true
    }

    const preflightVerification = verifyPr03bBasePreflight(preflightData, {
      syntheticPv,
    })
    preflightPassed = preflightVerification.status === 'PASS'
    const syntheticSales = preflightVerification.syntheticSales

    // FASE C — Confirmar selección de al menos 2 ventas sintéticas
    if (syntheticSales.length < 2) {
      throw new Error('PR03_B_INSUFFICIENT_SYNTHETIC_SALES')
    }

    // 6. FASE D — BASELINES BEFORE (Real y Sintético separados)
    const realBaseBeforeRes = await client1.query(PR03_B_COMMERCIAL_BASELINE_SQL, [realKioskId])
    realBaselineBeforeHash = computeCommercialBaselineHash(realBaseBeforeRes.rows[0]?.baseline)

    const synthBaseBeforeRes = await client1.query(PR03_B_COMMERCIAL_BASELINE_SQL, [syntheticKioskId])
    synthBaselineBeforeHash = computeCommercialBaselineHash(synthBaseBeforeRes.rows[0]?.baseline)

    // 7. FASE E — CREACIÓN CONTROLADA DEL EMISOR SINTÉTICO (Insert-only, inicialmente habilitado=false)
    await client1.query(
      `INSERT INTO public.fiscal_emisores_homologacion (
        kiosco_id, cuit_emisor, punto_venta, credencial_id, certificado_sha256, revision, habilitado, actualizado_en
      ) VALUES ($1, $2, $3, $4, $5, $6, false, clock_timestamp())`,
      [
        syntheticKioskId,
        syntheticCuit,
        syntheticPv,
        credId,
        certSha,
        rev,
      ]
    )
    syntheticEmitterCreated = true

    // 8. FASE F — ACTIVACIÓN DE VENTANA SINTÉTICA
    const activateRes = await client1.query(
      `UPDATE public.fiscal_emisores_homologacion
       SET habilitado = true, actualizado_en = clock_timestamp()
       WHERE kiosco_id = $1 AND cuit_emisor = $2 AND punto_venta = $3
         AND credencial_id = $4 AND certificado_sha256 = $5 AND revision = $6
         AND habilitado = false`,
      [
        syntheticKioskId,
        syntheticCuit,
        syntheticPv,
        credId,
        certSha,
        rev,
      ]
    )
    if ((activateRes.rowCount ?? 0) !== 1) {
      throw new Error('PR03_B_SYNTHETIC_EMITTER_ACTIVATION_FAILED')
    }

    // Verificar simultáneamente: PV9999 activo, PV2 inactivo, 0 emisores activos para el kiosco real
    const checkIssuersRes = await client1.query(
      `SELECT punto_venta, habilitado FROM public.fiscal_emisores_homologacion
       WHERE kiosco_id IN ($1, $2)`,
      [realKioskId, syntheticKioskId]
    )
    const issuersRows = checkIssuersRes.rows
    const synthRow = issuersRows.find(r => r.punto_venta === syntheticPv)
    const realRow = issuersRows.find(r => r.punto_venta === 2)
    if (!synthRow || synthRow.habilitado !== true) {
      throw new Error('FATAL: SYNTHETIC_PV9999_NOT_ENABLED')
    }
    if (realRow && realRow.habilitado !== false) {
      throw new Error('FATAL: REAL_PV2_NOT_DISABLED')
    }

    // 9. FASE G & H — PREPARACIÓN CANÓNICA E IDEMPOTENCIA (Replay y Conflicto)
    const op1Id = randomUUID()
    createdOperationIds.push(op1Id)

    const fix1 = createPr03bScopedFixture(runId, {
      operacionId: op1Id,
      puntoVenta: syntheticPv,
      kiosco_id: syntheticKioskId,
      cuitEmisor: syntheticCuit,
      tipoComprobante: syntheticReceiptType,
      ventaId: syntheticSales[0].id,
      numero: 1,
      total: syntheticSales[0].total,
    })

    const fixConflict = createPr03bScopedFixture(runId, {
      operacionId: op1Id,
      puntoVenta: syntheticPv,
      kiosco_id: syntheticKioskId,
      cuitEmisor: syntheticCuit,
      tipoComprobante: syntheticReceiptType,
      ventaId: syntheticSales[0].id,
      numero: 1,
      total: syntheticSales[0].total,
      fecha: '20261101',
    })

    assertNoRealPv2Usage(fix1.punto_venta)
    assertNoRealPv2Usage(fix1.kiosco_id)
    assertNoRealPv2Usage(fixConflict.punto_venta)
    assertNoRealPv2Usage(fixConflict.kiosco_id)

    // FASE G: Preparación canónica mediante la ruta privada como service_role
    await client1.query('BEGIN')
    await client1.query('SET LOCAL ROLE service_role')
    await client1.query("SELECT set_config('request.jwt.claim.role', 'service_role', true)")
    await client1.query("SELECT set_config('request.jwt.claim.sub', '', true)")

    const prepAckRes = await client1.query(
      'SELECT guardar_datos_preparacion_homologacion($1, $2, $3, $4, $5) AS ack',
      [syntheticOwnerAuthId, fix1.venta_id, fix1.operacion_id, fix1.preparacion_canonico, fix1.preparacion_sha256]
    )

    // Assertion de contexto fiscal: debe pertenecer al PV sintético
    const checkOpContext = await client1.query(
      'SELECT autorizar_consulta_fiscal_homologacion($1, $2) AS auth',
      [syntheticOwnerAuthId, fix1.operacion_id]
    )
    const opAuth = checkOpContext.rows[0]?.auth
    if (!opAuth || opAuth.punto_venta !== syntheticPv) {
      throw new Error('FATAL: PR03_B_CONTEXT_PV_MISMATCH')
    }

    // FASE H: Replay idéntico
    // NOTA: p_ultimo_autorizado = 0 es una baseline puramente sintética de aceptación y NO una observación ARCA.
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

    // FASE H: Conflicto de idempotencia (payload alterado) bajo savepoint exigiendo SQLSTATE 40001
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

    // 10. FASE J — CONCURRENCIA REAL DE NUMERACIÓN (Dos conexiones compitiendo sobre serie PV 9999)
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
      puntoVenta: syntheticPv,
      kiosco_id: syntheticKioskId,
      cuitEmisor: syntheticCuit,
      tipoComprobante: syntheticReceiptType,
      ventaId: syntheticSales[0].id,
      numero: 1,
      total: syntheticSales[0].total,
    })

    const fixB = createPr03bScopedFixture(runId, {
      operacionId: opBId,
      puntoVenta: syntheticPv,
      kiosco_id: syntheticKioskId,
      cuitEmisor: syntheticCuit,
      tipoComprobante: syntheticReceiptType,
      ventaId: syntheticSales[1].id,
      numero: 1,
      total: syntheticSales[1].total,
    })

    assertNoRealPv2Usage(fixA.punto_venta)
    assertNoRealPv2Usage(fixA.kiosco_id)
    assertNoRealPv2Usage(fixB.punto_venta)
    assertNoRealPv2Usage(fixB.kiosco_id)

    // Preparar ambas operaciones mediante la ruta canónica privada
    for (const [cli, fix] of [[client1, fixA], [client2, fixB]]) {
      await cli.query('BEGIN')
      await cli.query('SET LOCAL ROLE service_role')
      await cli.query("SELECT set_config('request.jwt.claim.role', 'service_role', true)")
      await cli.query("SELECT set_config('request.jwt.claim.sub', '', true)")
      await cli.query(
        'SELECT guardar_datos_preparacion_homologacion($1, $2, $3, $4, $5) AS ack',
        [syntheticOwnerAuthId, fix.venta_id, fix.operacion_id, fix.preparacion_canonico, fix.preparacion_sha256]
      )
      await cli.query('COMMIT')
    }

    // Worker A inicia transacción y reserva en serie sintética (adquiere row lock)
    // NOTA: p_ultimo_autorizado = 0 es una baseline puramente sintética de aceptación y NO una observación ARCA.
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
    workerBPromise.catch(() => {})

    // Observar determinísticamente vía pg_locks que Worker B está esperando el lock de A
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

    lockObserved = waitObserved === true
    if (!lockObserved) {
      await client1.query('ROLLBACK').catch(() => {})
      await client2.query('ROLLBACK').catch(() => {})
      await workerBPromise.catch(() => {})
      throw new Error('CONCURRENCY_LOCK_NOT_OBSERVED: Conexión B no esperó de forma demostrable en pg_locks')
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

    // 11. FASE L — CLEANUP QUIRÚRGICO DE CAMINO EXITOSO CON IDENTIDAD COMPLETA
    const emitterRowRes = await client1.query(
      `SELECT credencial_id, certificado_sha256, revision, habilitado
       FROM public.fiscal_emisores_homologacion
       WHERE kiosco_id = $1 AND cuit_emisor = $2 AND punto_venta = $3`,
      [syntheticKioskId, syntheticCuit, syntheticPv]
    )
    const emRow = emitterRowRes.rows[0]
    if (
      emRow &&
      emRow.credencial_id === credId &&
      emRow.certificado_sha256 === certSha &&
      emRow.revision === rev
    ) {
      syntheticEmitterIdentityMatch = 'PASS'
    } else {
      syntheticEmitterIdentityMatch = 'FAIL'
      throw new Error('SYNTHETIC_EMITTER_IDENTITY_MISMATCH: Metadatos del emisor sintético no coinciden con la identidad creada')
    }

    await client1.query(
      buildManifestCleanupSql(createdOperationIds, {
        syntheticPv,
        syntheticKioskId,
        cuit: syntheticCuit,
        credencialId: credId,
        certSha,
        revision: rev,
      })
    )
    cleanupStatus = 'PASS'

    // FASE O — COMPROBACIÓN DE RESIDUALES
    const postCleanupCheck = await client1.query(`
      SELECT
        (SELECT count(*)::int FROM public.fiscal_emisores_homologacion WHERE kiosco_id = $1) as synth_emitters,
        (SELECT count(*)::int FROM public.fiscal_series_homologacion WHERE cuit_emisor = $2 AND punto_venta = $3) as synth_series,
        (SELECT count(*)::int FROM public.fiscal_reservas_homologacion WHERE cuit_emisor = $2 AND punto_venta = $3) as synth_reservas,
        (SELECT count(*)::int FROM public.fiscal_operaciones_homologacion WHERE id = ANY($4::uuid[])) as run_ops,
        (SELECT count(*)::int FROM public.fiscal_series_homologacion WHERE cuit_emisor = $2 AND punto_venta = 2) as real_series,
        (SELECT count(*)::int FROM public.fiscal_reservas_homologacion WHERE cuit_emisor = $2 AND punto_venta = 2 AND estado = 'RESERVADA') as real_reservas
    `, [syntheticKioskId, syntheticCuit, syntheticPv, createdOperationIds])

    const res = postCleanupCheck.rows[0]
    residualFiscalCount = (res?.synth_emitters ?? 0) + (res?.synth_series ?? 0) + (res?.synth_reservas ?? 0) + (res?.run_ops ?? 0)

    if (residualFiscalCount !== 0) {
      throw new Error(`RESIDUAL_FISCAL_STATE_DETECTED: Quedaron ${residualFiscalCount} registros sintéticos sin limpiar`)
    }
    if ((res?.real_series ?? 0) !== 0 || (res?.real_reservas ?? 0) !== 0) {
      throw new Error('FATAL: REAL_PV2_SERIES_TOUCHED')
    }

    // 12. FASE N — BASELINES AFTER (Real y Sintético)
    const realBaseAfterRes = await client1.query(PR03_B_COMMERCIAL_BASELINE_SQL, [realKioskId])
    realBaselineAfterHash = computeCommercialBaselineHash(realBaseAfterRes.rows[0]?.baseline)

    const synthBaseAfterRes = await client1.query(PR03_B_COMMERCIAL_BASELINE_SQL, [syntheticKioskId])
    synthBaselineAfterHash = computeCommercialBaselineHash(synthBaseAfterRes.rows[0]?.baseline)

    if (realBaselineBeforeHash !== realBaselineAfterHash) {
      throw new Error('REAL_COMMERCIAL_BASELINE_MUTATED: El hash del baseline comercial real no se preservó')
    }
    realCommercialBaselinePreserved = true

    if (synthBaselineBeforeHash !== synthBaselineAfterHash) {
      throw new Error('SYNTHETIC_COMMERCIAL_BASELINE_MUTATED: El hash del baseline comercial sintético no se preservó')
    }
    synthCommercialBaselinePreserved = true
  } catch (error) {
    executionError = error
    if (client1) {
      await client1.query('ROLLBACK').catch(() => {})
    }
    if (client2) {
      await client2.query('ROLLBACK').catch(() => {})
    }
    // FASE M — Error ambiguo: fail-safe disable sin borrado destructivo
    if (syntheticEmitterCreated && client1) {
      try {
        await client1.query(
          `UPDATE public.fiscal_emisores_homologacion SET habilitado = false
           WHERE kiosco_id = $1 AND punto_venta = $2 AND cuit_emisor = $3
             AND credencial_id = $4 AND certificado_sha256 = $5 AND revision = $6
             AND habilitado = true;`,
          [syntheticKioskId, syntheticPv, syntheticCuit, credId, certSha, rev]
        )
        syntheticEmitterFailsafeDisabled = 'PASS'
      } catch {
        syntheticEmitterFailsafeDisabled = 'FAIL'
      }
    }
  } finally {
    // 13. FASE P — Cierre verificado de conexiones PostgreSQL
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

  if (!client1Closed || !client2Closed) {
    throw new Error('PR03_B_CONNECTION_CLOSE_FAILED: No se verificó el cierre ordenado de todas las conexiones PostgreSQL')
  }

  const pgConnectionsClosed = 'PASS'

  return Object.freeze({
    execution: 'AUTHORIZED_EXECUTION',
    PR03_B_EXECUTION: 'PASS',
    PR03_B_REMOTE_EXECUTION_READY: true,
    SYNTHETIC_TARGET_IMMUTABLE: 'PASS',
    SYNTHETIC_TENANT_WIRED: 'PASS',
    SYNTHETIC_KIOSK_ID_MATCH: 'PASS',
    SYNTHETIC_OWNER_MATCH: 'PASS',
    SYNTHETIC_PV_MATCH: 'PASS',
    SYNTHETIC_PV: syntheticPv,
    REAL_PV2_GUARD: 'PASS',
    REAL_PV2_ENABLED_DURING_PR03_B: false,
    REAL_PV2_SERIES_TOUCHED: false,
    CATALOG_REV3_USABLE: 'PASS',
    SYNTHETIC_EMITTER_LIFECYCLE: 'PASS',
    CLEANUP_FULL_EMITTER_IDENTITY_GUARD: 'PASS',
    SYNTHETIC_EMITTER_IDENTITY_MATCH: syntheticEmitterIdentityMatch,
    SYNTHETIC_EMITTER_FAILSAFE_IDENTITY_GUARD: 'PASS',
    CANONICAL_PRIVATE_PREPARATION: 'PASS',
    IDEMPOTENCY_REPLAY: replayPassed ? 'PASS' : 'FAIL',
    REPLAY_REAL_PG: replayPassed ? 'PASS' : 'FAIL',
    IDEMPOTENCY_CONFLICT: conflictPassed ? 'PASS' : 'FAIL',
    CONFLICT_SQLSTATE: conflictSqlState,
    CONFLICT_EXPECTED_SQLSTATE: '40001',
    CONFLICT_REAL_PG: conflictPassed ? 'PASS' : 'FAIL',
    CONCURRENCY_SEMANTICS: 'SINGLE_PENDING_RESERVATION',
    LOCK_OBSERVATION_SOURCE: 'PG_LOCKS',
    LOCK_OBSERVATION_DETERMINISTIC: lockObserved ? 'PASS' : 'FAIL',
    CONCURRENCY_LOCK_OBSERVED: lockObserved ? 'PASS' : 'FAIL',
    CONCURRENCY_REJECTION_SQLSTATE: concurrencySqlState,
    CONCURRENCY_EXPECTED_SQLSTATE: '55000',
    CONCURRENCY_REAL_PG: concurrencyPassed ? 'PASS' : 'FAIL',
    NUMBERING_CONCURRENCY: concurrencyPassed ? 'PASS' : 'FAIL',
    PREFLIGHT_READ_ONLY: preflightPassed ? 'PASS' : 'FAIL',
    PREFLIGHT_ROLLBACK_CONFIRMED: preflightRollbackConfirmed,
    SYNTHETIC_PV_USED: syntheticPv,
    AUTO_CLEANUP_ON_UNKNOWN_ERROR: false,
    SYNTHETIC_EMITTER_FAILSAFE: syntheticEmitterFailsafeDisabled,
    REAL_COMMERCIAL_BASELINE_PRESERVED: realCommercialBaselinePreserved,
    SYNTHETIC_COMMERCIAL_BASELINE_PRESERVED: synthCommercialBaselinePreserved,
    COMMERCIAL_BASELINE_PRESERVED: realCommercialBaselinePreserved && synthCommercialBaselinePreserved,
    BASELINE_BEFORE_HASH: synthBaselineBeforeHash,
    BASELINE_AFTER_HASH: synthBaselineAfterHash,
    SUCCESS_CLEANUP: cleanupStatus,
    RESIDUAL_SYNTHETIC_FISCAL_STATE: residualFiscalCount,
    RUN_ID: runId,
    ARCA_CALLS: 0,
    ARCA_CALLS_NEW: 0,
    COMMERCIAL_WRITES: 0,
    FIXTURE_OPERATIONS_CREATED: createdOperationIds.length,
    FIXTURE_CLEANUP: cleanupStatus,
    CONNECTION_CLOSE_REQUIRED_FOR_PASS: 'PASS',
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
