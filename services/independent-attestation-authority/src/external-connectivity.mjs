// @ts-check
import crypto from 'node:crypto'
import {
  assertSafeJwksUri,
  createMtlsClientAuthVerifier,
  OIDC_ALLOWED_ALGORITHMS,
} from './client-auth.mjs'
import { computeEd25519SpkiKeyId } from './go-authorization.mjs'
import {
  buildSafeConfigurationFingerprint,
  redactSensitiveConfigText,
  runInfrastructurePreflight,
  validateInfrastructureConfiguration,
} from './infrastructure-preflight.mjs'
import {
  assertDedicatedPostgresUrl,
  assertSafeEndpointUrl,
  isRealIntegrationDryRun,
  isRealIntegrationEnabled,
  normalizeNetworkHostname,
  resolveKmsEnvConfig,
} from './real-integration.mjs'

export const CONNECTIVITY_READINESS_STAGES = Object.freeze({
  CONFIGURATION_VALIDATION: 'CONFIGURATION_VALIDATION',
  LOCAL_PREFLIGHT: 'LOCAL_PREFLIGHT',
  SAFE_CONNECTIVITY_PREFLIGHT: 'SAFE_CONNECTIVITY_PREFLIGHT',
  CONTROLLED_EXTERNAL_CONNECTIVITY: 'CONTROLLED_EXTERNAL_CONNECTIVITY',
  REAL_INTEGRATION_TEST: 'REAL_INTEGRATION_TEST',
  DEPLOYMENT_CANDIDATE: 'DEPLOYMENT_CANDIDATE',
})

export const CONNECTIVITY_STAGE_ORDER = Object.freeze([
  CONNECTIVITY_READINESS_STAGES.CONFIGURATION_VALIDATION,
  CONNECTIVITY_READINESS_STAGES.LOCAL_PREFLIGHT,
  CONNECTIVITY_READINESS_STAGES.SAFE_CONNECTIVITY_PREFLIGHT,
  CONNECTIVITY_READINESS_STAGES.CONTROLLED_EXTERNAL_CONNECTIVITY,
  CONNECTIVITY_READINESS_STAGES.REAL_INTEGRATION_TEST,
  CONNECTIVITY_READINESS_STAGES.DEPLOYMENT_CANDIDATE,
])

export const CONNECTIVITY_AUTHORIZATION_STATUSES = Object.freeze({
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  CONFIGURATION_INVALID: 'CONFIGURATION_INVALID',
  REAL_INTEGRATION_DISABLED: 'REAL_INTEGRATION_DISABLED',
  DRY_RUN_ACTIVE: 'DRY_RUN_ACTIVE',
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  AUTHORIZED_TO_CONNECT: 'AUTHORIZED_TO_CONNECT',
})

export const POSTGRES_CONNECTIVITY_STATES = Object.freeze({
  CONFIGURATION_VALID: 'CONFIGURATION_VALID',
  CONNECTIVITY_REACHABLE: 'CONNECTIVITY_REACHABLE',
  AUTHENTICATION_VALID: 'AUTHENTICATION_VALID',
  DATABASE_ACCESS_VALID: 'DATABASE_ACCESS_VALID',
  SCHEMA_READY: 'SCHEMA_READY',
  REAL_INTEGRATION_TESTED: 'REAL_INTEGRATION_TESTED',
})

export const MTLS_CONNECTIVITY_STATES = Object.freeze({
  TLS_CONNECTED: 'TLS_CONNECTED',
  SERVER_CERT_VALID: 'SERVER_CERT_VALID',
  CLIENT_CERT_PRESENT: 'CLIENT_CERT_PRESENT',
  CLIENT_CERT_TRUSTED: 'CLIENT_CERT_TRUSTED',
  CLIENT_IDENTITY_ALLOWED: 'CLIENT_IDENTITY_ALLOWED',
})

export const DYNAMODB_ERROR_CATEGORIES = Object.freeze({
  AUTHENTICATION: 'AUTHENTICATION',
  AUTHORIZATION: 'AUTHORIZATION',
  THROTTLING: 'THROTTLING',
  CONNECTIVITY: 'CONNECTIVITY',
  CONFIGURATION: 'CONFIGURATION',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
})

function cleanStr(val) {
  return typeof val === 'string' ? val.trim() : ''
}

function parseStrictBoolFlag(env, key) {
  const raw = cleanStr(env?.[key]).toLowerCase()
  if (!raw) return { defined: false, valid: true, value: false }
  if (raw === 'true') return { defined: true, valid: true, value: true }
  if (raw === 'false') return { defined: true, valid: true, value: false }
  return { defined: true, valid: false, value: false, raw }
}

function withBoundedTimeout(promiseFactory, timeoutMs, timeoutCode, label) {
  const effectiveMs =
    Number.isSafeInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      const err = new Error(
        `${timeoutCode}: Timeout (${effectiveMs}ms) en '${label}'`
      )
      err.code = timeoutCode
      reject(err)
    }, effectiveMs)
    if (typeof timer.unref === 'function') {
      timer.unref()
    }

    Promise.resolve()
      .then(() => promiseFactory())
      .then(
        (res) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(res)
        },
        (err) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(err)
        }
      )
  })
}

function makeSafeErrorRecord(code, category, message) {
  return Object.freeze({
    code: String(code || 'EXTERNAL_CONNECTIVITY_ERROR'),
    category: String(category || 'UNKNOWN'),
    message: redactSensitiveConfigText(
      String(message || 'Error en verificación de conectividad externa')
    ),
  })
}

/**
 * Evalúa el contrato centralizado de autorización de conectividad externa.
 * Garantiza que la mera existencia de variables de entorno o incluso
 * `ATTESTATION_REAL_INTEGRATION_ENABLED=true` NUNCA dispare conexiones automáticas
 * sin `ATTESTATION_CONNECTIVITY_TEST_ENABLED=true` y `ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL=APPROVED`
 * (o `ATTESTATION_EXPLICIT_CONNECTIVITY_APPROVAL=true`), y que `DRY_RUN=true` bloquee toda conexión real.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{ checkAmbientFiscalVars?: boolean }} [options]
 */
export function evaluateExternalConnectivityAuthorization(
  env = process.env,
  options = {}
) {
  const preflight = runInfrastructurePreflight(env, options)
  const validation = validateInfrastructureConfiguration(env, {
    requireCompleteForEnv: false,
    checkAmbientFiscalVars: options.checkAmbientFiscalVars,
  })
  const safeFingerprint = buildSafeConfigurationFingerprint(env)
  const errors = []

  for (const issue of validation.issues) {
    errors.push(
      makeSafeErrorRecord(issue.code, issue.domain || 'CONFIGURATION', issue.message)
    )
  }

  const realIntegrationFlag = parseStrictBoolFlag(
    env,
    'ATTESTATION_REAL_INTEGRATION_ENABLED'
  )
  const dryRunFlag = parseStrictBoolFlag(
    env,
    'ATTESTATION_REAL_INTEGRATION_DRY_RUN'
  )
  const connectivityTestFlag = parseStrictBoolFlag(
    env,
    'ATTESTATION_CONNECTIVITY_TEST_ENABLED'
  )
  const legacyConnectivityFlag = parseStrictBoolFlag(
    env,
    'ATTESTATION_ALLOW_CONTROLLED_CONNECTIVITY_TEST'
  )
  const explicitApprovalBool = parseStrictBoolFlag(
    env,
    'ATTESTATION_EXPLICIT_CONNECTIVITY_APPROVAL'
  )
  const rawApprovalToken = cleanStr(
    env?.ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL
  ).toUpperCase()

  for (const [flagName, flagObj] of [
    ['ATTESTATION_REAL_INTEGRATION_ENABLED', realIntegrationFlag],
    ['ATTESTATION_REAL_INTEGRATION_DRY_RUN', dryRunFlag],
    ['ATTESTATION_CONNECTIVITY_TEST_ENABLED', connectivityTestFlag],
    ['ATTESTATION_ALLOW_CONTROLLED_CONNECTIVITY_TEST', legacyConnectivityFlag],
    ['ATTESTATION_EXPLICIT_CONNECTIVITY_APPROVAL', explicitApprovalBool],
  ]) {
    if (!flagObj.valid) {
      errors.push(
        makeSafeErrorRecord(
          'CONNECTIVITY_FLAG_INVALID_BOOLEAN',
          'CONFIGURATION',
          `${flagName} debe ser 'true' o 'false'`
        )
      )
    }
  }

  if (
    connectivityTestFlag.defined &&
    legacyConnectivityFlag.defined &&
    connectivityTestFlag.value !== legacyConnectivityFlag.value
  ) {
    errors.push(
      makeSafeErrorRecord(
        'CONNECTIVITY_CONFIGURATION_CONFLICT',
        'CONFIGURATION',
        'Conflicto entre ATTESTATION_CONNECTIVITY_TEST_ENABLED y ATTESTATION_ALLOW_CONTROLLED_CONNECTIVITY_TEST'
      )
    )
  }

  if (
    rawApprovalToken &&
    rawApprovalToken !== 'APPROVED' &&
    rawApprovalToken !== 'DENIED' &&
    rawApprovalToken !== 'TRUE' &&
    rawApprovalToken !== 'FALSE'
  ) {
    errors.push(
      makeSafeErrorRecord(
        'CONNECTIVITY_APPROVAL_INVALID',
        'CONFIGURATION',
        `Valor inválido en ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL ('${rawApprovalToken}')`
      )
    )
  }

  if (
    explicitApprovalBool.defined &&
    rawApprovalToken &&
    ((explicitApprovalBool.value === true &&
      (rawApprovalToken === 'DENIED' || rawApprovalToken === 'FALSE')) ||
      (explicitApprovalBool.value === false &&
        (rawApprovalToken === 'APPROVED' || rawApprovalToken === 'TRUE')))
  ) {
    errors.push(
      makeSafeErrorRecord(
        'CONNECTIVITY_CONFIGURATION_CONFLICT',
        'CONFIGURATION',
        'Conflicto entre ATTESTATION_EXPLICIT_CONNECTIVITY_APPROVAL y ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL'
      )
    )
  }

  const realIntegrationEnabled = isRealIntegrationEnabled(env)
  const dryRun = isRealIntegrationDryRun(env)
  const connectivityTestEnabled =
    connectivityTestFlag.value || legacyConnectivityFlag.value
  const explicitConnectivityApproval =
    explicitApprovalBool.value ||
    rawApprovalToken === 'APPROVED' ||
    rawApprovalToken === 'TRUE'

  if (!realIntegrationEnabled && (connectivityTestEnabled || explicitConnectivityApproval)) {
    errors.push(
      makeSafeErrorRecord(
        'CONNECTIVITY_CONTRADICTORY_FLAGS',
        'CONFIGURATION',
        'Prohibido habilitar conectividad externa cuando ATTESTATION_REAL_INTEGRATION_ENABLED=false'
      )
    )
  }

  const hasConfigErrors = errors.length > 0
  const hasMissingTargets = preflight.missingTargets.length > 0
  const configurationValid = !hasConfigErrors && !hasMissingTargets

  let status
  let stage
  let connectivityTestState = 'NOT_RUN'
  let authorizedToConnect = false
  const blockingReasons = []

  if (hasConfigErrors) {
    status = CONNECTIVITY_AUTHORIZATION_STATUSES.CONFIGURATION_INVALID
    stage = CONNECTIVITY_READINESS_STAGES.CONFIGURATION_VALIDATION
    connectivityTestState = 'BLOCKED'
    for (const err of errors) {
      blockingReasons.push(err.code)
    }
  } else if (hasMissingTargets) {
    status =
      realIntegrationEnabled || connectivityTestEnabled || explicitConnectivityApproval
        ? CONNECTIVITY_AUTHORIZATION_STATUSES.CONFIGURATION_INVALID
        : CONNECTIVITY_AUTHORIZATION_STATUSES.NOT_CONFIGURED
    stage = CONNECTIVITY_READINESS_STAGES.CONFIGURATION_VALIDATION
    connectivityTestState =
      status === CONNECTIVITY_AUTHORIZATION_STATUSES.CONFIGURATION_INVALID
        ? 'BLOCKED'
        : 'NOT_RUN'
    blockingReasons.push('MISSING_CONFIGURATION_TARGETS')
  } else if (!realIntegrationEnabled) {
    status = CONNECTIVITY_AUTHORIZATION_STATUSES.REAL_INTEGRATION_DISABLED
    stage = CONNECTIVITY_READINESS_STAGES.SAFE_CONNECTIVITY_PREFLIGHT
    connectivityTestState = 'NOT_RUN'
    blockingReasons.push('REAL_INTEGRATION_DISABLED')
  } else if (dryRun) {
    status = CONNECTIVITY_AUTHORIZATION_STATUSES.DRY_RUN_ACTIVE
    stage = CONNECTIVITY_READINESS_STAGES.SAFE_CONNECTIVITY_PREFLIGHT
    connectivityTestState = 'NOT_RUN'
    blockingReasons.push('DRY_RUN_ACTIVE')
  } else if (!connectivityTestEnabled || !explicitConnectivityApproval) {
    status = CONNECTIVITY_AUTHORIZATION_STATUSES.NOT_AUTHORIZED
    stage = CONNECTIVITY_READINESS_STAGES.SAFE_CONNECTIVITY_PREFLIGHT
    connectivityTestState = 'NOT_RUN'
    if (!connectivityTestEnabled) {
      blockingReasons.push('CONNECTIVITY_TEST_NOT_ENABLED')
    }
    if (!explicitConnectivityApproval) {
      blockingReasons.push('EXTERNAL_CONNECTIVITY_APPROVAL_MISSING')
    }
  } else {
    status = CONNECTIVITY_AUTHORIZATION_STATUSES.AUTHORIZED_TO_CONNECT
    stage = CONNECTIVITY_READINESS_STAGES.CONTROLLED_EXTERNAL_CONNECTIVITY
    connectivityTestState = 'READY_TO_RUN'
    authorizedToConnect = true
  }

  return Object.freeze({
    status,
    authorizationStatus: status,
    stage,
    connectivityTestState,
    connectivityTestStatus: connectivityTestState,
    configured: configurationValid,
    configurationValid,
    localPreflightPassed: configurationValid,
    safeConnectivityPreflightPassed: configurationValid,
    authorizationValid: authorizedToConnect,
    authorizedToConnect,
    realIntegrationEnabled,
    connectivityTestEnabled,
    explicitConnectivityApproval,
    explicitApprovalGranted: explicitConnectivityApproval,
    dryRun,
    dryRunActive: dryRun,
    connectivityAttempted: false,
    connectivityReachable: false,
    authenticationVerified: false,
    resourceVerified: false,
    realConnectivityTested: false,
    realIntegrationTested: false,
    productionValidated: false,
    productionApproved: false,
    p1ImportAllowed: false,
    remoteGo: 'DENIED',
    blockingReasons: Object.freeze(blockingReasons),
    preflightStatus: preflight.status,
    missingTargets: preflight.missingTargets,
    safeFingerprint,
    errors: Object.freeze(errors),
  })
}

/**
 * Exige que la conectividad externa controlada esté explícitamente autorizada.
 * Lanza error fail-closed si falta configuración, opt-in o aprobación, o si DRY_RUN está activo.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [component]
 */
export function assertExternalConnectivityAuthorized(
  env = process.env,
  component = 'external_resource'
) {
  const auth = evaluateExternalConnectivityAuthorization(env)
  if (auth.dryRun) {
    throw new Error(
      `EXTERNAL_CONNECTIVITY_DRY_RUN_ACTIVE: Prohibido abrir conexiones reales hacia '${component}' cuando ATTESTATION_REAL_INTEGRATION_DRY_RUN=true`
    )
  }
  if (!auth.configurationValid) {
    const firstCode = auth.errors[0]?.code || auth.missingTargets[0] || 'CONFIG_INVALID'
    throw new Error(
      `EXTERNAL_CONNECTIVITY_CONFIG_INVALID: Configuración inválida o incompleta para '${component}' (${firstCode})`
    )
  }
  if (!auth.realIntegrationEnabled) {
    throw new Error(
      `EXTERNAL_CONNECTIVITY_DISABLED: Se requiere ATTESTATION_REAL_INTEGRATION_ENABLED=true para '${component}'`
    )
  }
  if (!auth.connectivityTestEnabled || !auth.explicitConnectivityApproval) {
    throw new Error(
      `EXTERNAL_CONNECTIVITY_NOT_AUTHORIZED: ATTESTATION_REAL_INTEGRATION_ENABLED=true no autoriza conectarse automáticamente a '${component}'; defina ATTESTATION_CONNECTIVITY_TEST_ENABLED=true y ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL=APPROVED`
    )
  }
  return auth
}

function buildBlockedOrNotRunResult(component, auth, extraDetails = {}) {
  const status =
    auth.status === CONNECTIVITY_AUTHORIZATION_STATUSES.CONFIGURATION_INVALID
      ? 'CONFIGURATION_INVALID'
      : auth.status === CONNECTIVITY_AUTHORIZATION_STATUSES.NOT_CONFIGURED
        ? 'NOT_CONFIGURED'
        : auth.status === CONNECTIVITY_AUTHORIZATION_STATUSES.DRY_RUN_ACTIVE
          ? 'NOT_RUN'
          : 'NOT_AUTHORIZED'

  return Object.freeze({
    status,
    component,
    stage: auth.stage,
    connectivityTest: auth.connectivityTestState === 'BLOCKED' ? 'BLOCKED' : 'NOT_RUN',
    configurationValid: auth.configurationValid,
    authorizationValid: false,
    connectivityAttempted: false,
    connectivityReachable: false,
    authenticationVerified: false,
    resourceVerified: false,
    realConnectivityTested: false,
    realIntegrationTested: false,
    productionValidated: false,
    productionApproved: false,
    safeFingerprint: auth.safeFingerprint,
    errors: auth.errors,
    details: Object.freeze({
      ...extraDetails,
    }),
  })
}

function classifyPostgresConnectivityError(err) {
  const code = String(err?.code || '').toUpperCase()
  const msg = String(err?.message || '')

  if (
    code === '28P01' ||
    code === '28000' ||
    /password authentication failed|authentication failed|no pg_hba\.conf entry/i.test(msg)
  ) {
    return {
      code: 'POSTGRES_AUTHENTICATION_FAILED',
      category: 'AUTHENTICATION',
      reachable: true,
      authenticated: false,
      dbAccess: false,
    }
  }
  if (
    code === '3D000' ||
    code === '42501' ||
    /permission denied|database .* does not exist/i.test(msg)
  ) {
    return {
      code: 'POSTGRES_DATABASE_ACCESS_DENIED',
      category: 'AUTHORIZATION',
      reachable: true,
      authenticated: true,
      dbAccess: false,
    }
  }
  if (
    code === 'POSTGRES_CONNECTIVITY_TIMEOUT' ||
    code === 'ETIMEDOUT' ||
    code === '57014' ||
    /timeout|timed out/i.test(msg)
  ) {
    return {
      code: 'POSTGRES_CONNECTIVITY_TIMEOUT',
      category: 'TIMEOUT',
      reachable: false,
      authenticated: false,
      dbAccess: false,
    }
  }
  return {
    code: 'POSTGRES_CONNECTIVITY_UNREACHABLE',
    category: 'CONNECTIVITY',
    reachable: false,
    authenticated: false,
    dbAccess: false,
  }
}

/**
 * Prueba controlada y de solo lectura de conectividad hacia PostgreSQL dedicado.
 * Distingue explícitamente:
 * - CONFIGURATION_VALID
 * - CONNECTIVITY_REACHABLE
 * - AUTHENTICATION_VALID
 * - DATABASE_ACCESS_VALID
 * - SCHEMA_READY
 * - REAL_INTEGRATION_TESTED (siempre false en sonda de conectividad)
 *
 * Garantiza cierre del pool (`poolClosed = true`) y cero mutaciones SQL.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{
 *   pgModule?: { Pool: new (cfg: Record<string, unknown>) => any },
 *   timeoutMs?: number
 * }} [deps]
 */
export async function runControlledPostgresConnectivityCheck(
  env = process.env,
  deps = {}
) {
  const safeFingerprint = buildSafeConfigurationFingerprint(env)
  const pgStates = {
    CONFIGURATION_VALID: false,
    CONNECTIVITY_REACHABLE: false,
    AUTHENTICATION_VALID: false,
    DATABASE_ACCESS_VALID: false,
    SCHEMA_READY: false,
    REAL_INTEGRATION_TESTED: false,
  }

  const connectionString = cleanStr(env?.ATTESTATION_POSTGRES_URL)
  const allowInsecureLocalhost =
    cleanStr(env?.ATTESTATION_POSTGRES_ALLOW_INSECURE_LOCALHOST).toLowerCase() ===
      'true' &&
    !['PRODUCTION', 'STAGING'].includes(
      cleanStr(env?.ATTESTATION_ENVIRONMENT || env?.ATTESTATION_SERVICE_ENV).toUpperCase()
    )

  let urlMeta
  try {
    urlMeta = assertDedicatedPostgresUrl(connectionString, {
      allowInsecureLocalhost,
    })
  } catch (err) {
    const errCode = String(err?.message || 'POSTGRES_URL_INVALID').split(':')[0]
    return Object.freeze({
      status: connectionString ? 'BLOCKED' : 'NOT_CONFIGURED',
      component: 'POSTGRESQL',
      stage: CONNECTIVITY_READINESS_STAGES.CONFIGURATION_VALIDATION,
      connectivityTest: connectionString ? 'BLOCKED' : 'NOT_RUN',
      configurationValid: false,
      authorizationValid: false,
      connectivityAttempted: false,
      connectivityReachable: false,
      authenticationVerified: false,
      resourceVerified: false,
      realConnectivityTested: false,
      realIntegrationTested: false,
      productionValidated: false,
      productionApproved: false,
      safeFingerprint,
      errors: Object.freeze([
        makeSafeErrorRecord(errCode, 'CONFIGURATION', err?.message),
      ]),
      details: Object.freeze({
        postgresStates: Object.freeze({ ...pgStates }),
        poolClosed: true,
        mutationsExecuted: 0,
      }),
    })
  }

  const tableName =
    cleanStr(env?.ATTESTATION_POSTGRES_TABLE) ||
    'attestation_distributed_anti_replay'
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(tableName)) {
    return Object.freeze({
      status: 'BLOCKED',
      component: 'POSTGRESQL',
      stage: CONNECTIVITY_READINESS_STAGES.CONFIGURATION_VALIDATION,
      connectivityTest: 'BLOCKED',
      configurationValid: false,
      authorizationValid: false,
      connectivityAttempted: false,
      connectivityReachable: false,
      authenticationVerified: false,
      resourceVerified: false,
      realConnectivityTested: false,
      realIntegrationTested: false,
      productionValidated: false,
      productionApproved: false,
      safeFingerprint,
      errors: Object.freeze([
        makeSafeErrorRecord(
          'POSTGRES_ANTI_REPLAY_INVALID_TABLE_NAME',
          'CONFIGURATION',
          `Tabla PostgreSQL inválida '${tableName}'`
        ),
      ]),
      details: Object.freeze({
        postgresStates: Object.freeze({ ...pgStates }),
        poolClosed: true,
        mutationsExecuted: 0,
      }),
    })
  }

  const auth = evaluateExternalConnectivityAuthorization(env)
  if (!auth.configurationValid) {
    return buildBlockedOrNotRunResult('POSTGRESQL', auth, {
      postgresStates: Object.freeze({ ...pgStates }),
      poolClosed: true,
      mutationsExecuted: 0,
    })
  }

  pgStates.CONFIGURATION_VALID = true
  if (!auth.authorizedToConnect) {
    return Object.freeze({
      ...buildBlockedOrNotRunResult('POSTGRESQL', auth, {
        postgresStates: Object.freeze({ ...pgStates }),
        poolClosed: true,
        mutationsExecuted: 0,
      }),
      configurationValid: true,
    })
  }

  const timeoutMs =
    deps.timeoutMs ??
    (Number(env?.ATTESTATION_POSTGRES_QUERY_TIMEOUT_MS) > 0
      ? Number(env?.ATTESTATION_POSTGRES_QUERY_TIMEOUT_MS)
      : 5000)

  const PoolCtor = deps.pgModule?.Pool
  const poolFactory =
    typeof deps.createPool === 'function'
      ? deps.createPool
      : typeof PoolCtor === 'function'
        ? (cfg) => new PoolCtor(cfg)
        : null
  if (typeof poolFactory !== 'function') {
    return Object.freeze({
      status: 'BLOCKED',
      component: 'POSTGRESQL',
      stage: CONNECTIVITY_READINESS_STAGES.CONTROLLED_EXTERNAL_CONNECTIVITY,
      connectivityTest: 'NOT_RUN',
      configurationValid: true,
      authorizationValid: true,
      connectivityAttempted: false,
      connectivityReachable: false,
      authenticationVerified: false,
      resourceVerified: false,
      realConnectivityTested: false,
      realIntegrationTested: false,
      productionValidated: false,
      productionApproved: false,
      safeFingerprint,
      errors: Object.freeze([
        makeSafeErrorRecord(
          'REAL_INTEGRATION_DEPENDENCY_MISSING',
          'CONFIGURATION',
          "Driver 'pg.Pool' no inyectado o no instalado en este runtime"
        ),
      ]),
      details: Object.freeze({
        postgresStates: Object.freeze({ ...pgStates }),
        poolClosed: true,
        mutationsExecuted: 0,
      }),
    })
  }

  const sslCaPem = cleanStr(env?.ATTESTATION_POSTGRES_SSL_CA_PEM)
    ? cleanStr(env?.ATTESTATION_POSTGRES_SSL_CA_PEM).replace(/\\n/g, '\n')
    : undefined
  const sslOption =
    !urlMeta.isLocal ||
    urlMeta.sslMode === 'verify-full' ||
    urlMeta.sslMode === 'verify-ca' ||
    urlMeta.sslMode === 'require'
      ? {
          rejectUnauthorized:
            urlMeta.sslMode === 'verify-full' ||
            urlMeta.sslMode === 'verify-ca' ||
            !urlMeta.isLocal,
          ...(sslCaPem ? { ca: sslCaPem } : {}),
        }
      : false

  const pool = poolFactory({
    connectionString,
    max: 1,
    connectionTimeoutMillis: timeoutMs,
    idleTimeoutMillis: 1000,
    ssl: sslOption,
  })
  if (typeof pool.on === 'function') {
    pool.on('error', () => {})
  }

  let poolClosed = false
  const errors = []

  try {
    const dbCheck = await withBoundedTimeout(
      () =>
        pool.query(
          'SELECT current_database() AS db_name, current_schema() AS schema_name'
        ),
      timeoutMs,
      'POSTGRES_CONNECTIVITY_TIMEOUT',
      'postgres.select_current_database'
    )
    pgStates.CONNECTIVITY_REACHABLE = true
    pgStates.AUTHENTICATION_VALID = true
    pgStates.DATABASE_ACCESS_VALID = Boolean(
      Array.isArray(dbCheck?.rows) && dbCheck.rows.length > 0
    )

    if (pgStates.DATABASE_ACCESS_VALID) {
      const schemaCheck = await withBoundedTimeout(
        () => pool.query('SELECT to_regclass($1) AS table_reg', [tableName]),
        timeoutMs,
        'POSTGRES_CONNECTIVITY_TIMEOUT',
        'postgres.select_to_regclass'
      )
      const reg = schemaCheck?.rows?.[0]?.table_reg
      pgStates.SCHEMA_READY = Boolean(reg && String(reg).includes(tableName))
      if (!pgStates.SCHEMA_READY) {
        errors.push(
          makeSafeErrorRecord(
            'POSTGRES_SCHEMA_NOT_READY',
            'SCHEMA',
            `Tabla dedicada '${tableName}' aún no existe en la base de datos`
          )
        )
      }
    }
  } catch (err) {
    const classified = classifyPostgresConnectivityError(err)
    pgStates.CONNECTIVITY_REACHABLE = classified.reachable
    pgStates.AUTHENTICATION_VALID = classified.authenticated
    pgStates.DATABASE_ACCESS_VALID = classified.dbAccess
    errors.push(
      makeSafeErrorRecord(classified.code, classified.category, err?.message)
    )
  } finally {
    try {
      if (typeof pool.end === 'function') {
        await withBoundedTimeout(
          () => pool.end(),
          timeoutMs,
          'POSTGRES_POOL_CLOSE_TIMEOUT',
          'postgres.pool.end'
        )
      }
      poolClosed = true
    } catch (closeErr) {
      poolClosed = false
      errors.push(
        makeSafeErrorRecord(
          'POSTGRES_POOL_CLOSE_ERROR',
          'CONNECTIVITY',
          closeErr?.message
        )
      )
    }
  }

  const allReady =
    pgStates.CONNECTIVITY_REACHABLE &&
    pgStates.AUTHENTICATION_VALID &&
    pgStates.DATABASE_ACCESS_VALID &&
    pgStates.SCHEMA_READY &&
    poolClosed

  return Object.freeze({
    status: allReady ? 'CONNECTIVITY_VERIFIED' : 'CONNECTIVITY_FAILED',
    component: 'POSTGRESQL',
    stage: CONNECTIVITY_READINESS_STAGES.CONTROLLED_EXTERNAL_CONNECTIVITY,
    connectivityTest: allReady ? 'PASSED' : 'FAILED',
    configurationValid: true,
    authorizationValid: true,
    connectivityAttempted: true,
    connectivityReachable: pgStates.CONNECTIVITY_REACHABLE,
    authenticationVerified: pgStates.AUTHENTICATION_VALID,
    resourceVerified: pgStates.DATABASE_ACCESS_VALID && pgStates.SCHEMA_READY,
    realConnectivityTested: allReady,
    realIntegrationTested: false,
    productionValidated: false,
    productionApproved: false,
    safeFingerprint,
    errors: Object.freeze(errors),
    details: Object.freeze({
      postgresStates: Object.freeze({ ...pgStates }),
      poolClosed,
      mutationsExecuted: 0,
      dedicatedDatabase: urlMeta.database,
      dedicatedTable: tableName,
    }),
  })
}

/**
 * Clasifica errores de AWS DynamoDB en las 6 categorías obligatorias:
 * AUTHENTICATION, AUTHORIZATION, THROTTLING, CONNECTIVITY, CONFIGURATION, RESOURCE_NOT_FOUND.
 * @param {any} err
 */
export function classifyDynamoDbConnectivityError(err) {
  const name = String(err?.name || err?.code || '').trim()
  const msg = String(err?.message || '')

  if (
    /UnrecognizedClientException|InvalidSignatureException|ExpiredTokenException|MissingAuthenticationToken|InvalidClientTokenId/i.test(
      `${name} ${msg}`
    )
  ) {
    return {
      code: 'DYNAMODB_AUTHENTICATION_FAILED',
      category: DYNAMODB_ERROR_CATEGORIES.AUTHENTICATION,
      reachable: true,
      authenticated: false,
    }
  }
  if (/AccessDeniedException|UnauthorizedOperation|AccessDenied/i.test(`${name} ${msg}`)) {
    return {
      code: 'DYNAMODB_AUTHORIZATION_DENIED',
      category: DYNAMODB_ERROR_CATEGORIES.AUTHORIZATION,
      reachable: true,
      authenticated: true,
    }
  }
  if (
    /ThrottlingException|ProvisionedThroughputExceededException|RequestLimitExceeded|Throttling/i.test(
      `${name} ${msg}`
    )
  ) {
    return {
      code: 'DYNAMODB_THROTTLED',
      category: DYNAMODB_ERROR_CATEGORIES.THROTTLING,
      reachable: true,
      authenticated: true,
    }
  }
  if (/ResourceNotFoundException|Table .* not found/i.test(`${name} ${msg}`)) {
    return {
      code: 'DYNAMODB_RESOURCE_NOT_FOUND',
      category: DYNAMODB_ERROR_CATEGORIES.RESOURCE_NOT_FOUND,
      reachable: true,
      authenticated: true,
    }
  }
  if (
    /ValidationException|SerializationException|InvalidParameter|MissingRequiredParameter|Malformed/i.test(
      `${name} ${msg}`
    )
  ) {
    return {
      code: 'DYNAMODB_CONFIGURATION_ERROR',
      category: DYNAMODB_ERROR_CATEGORIES.CONFIGURATION,
      reachable: true,
      authenticated: true,
    }
  }
  return {
    code:
      name === 'DYNAMODB_CONNECTIVITY_TIMEOUT'
        ? 'DYNAMODB_CONNECTIVITY_TIMEOUT'
        : 'DYNAMODB_CONNECTIVITY_FAILED',
    category: DYNAMODB_ERROR_CATEGORIES.CONNECTIVITY,
    reachable: false,
    authenticated: false,
  }
}

/**
 * Prueba controlada de solo lectura (`DescribeTable`) para AWS DynamoDB.
 * Nunca crea tablas ni ejecuta escrituras.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{
 *   client?: { describeTable?: (input: { TableName: string }) => Promise<any>, close?: () => Promise<void> },
 *   timeoutMs?: number
 * }} [deps]
 */
export async function runControlledDynamoDbConnectivityCheck(
  env = process.env,
  deps = {}
) {
  const safeFingerprint = buildSafeConfigurationFingerprint(env)
  const tableName = cleanStr(env?.ATTESTATION_DYNAMODB_TABLE)
  const region = cleanStr(env?.ATTESTATION_AWS_REGION || env?.AWS_REGION)

  if (!tableName || !region || !/^[a-zA-Z0-9_.-]{3,255}$/.test(tableName)) {
    return Object.freeze({
      status: !tableName && !region ? 'NOT_CONFIGURED' : 'BLOCKED',
      component: 'DYNAMODB',
      stage: CONNECTIVITY_READINESS_STAGES.CONFIGURATION_VALIDATION,
      connectivityTest: !tableName && !region ? 'NOT_RUN' : 'BLOCKED',
      configurationValid: false,
      authorizationValid: false,
      connectivityAttempted: false,
      connectivityReachable: false,
      authenticationVerified: false,
      resourceVerified: false,
      realConnectivityTested: false,
      realIntegrationTested: false,
      productionValidated: false,
      productionApproved: false,
      safeFingerprint,
      errors: Object.freeze([
        makeSafeErrorRecord(
          'DYNAMODB_CONFIGURATION_INVALID',
          DYNAMODB_ERROR_CATEGORIES.CONFIGURATION,
          'Tabla o región AWS DynamoDB faltante o inválida'
        ),
      ]),
      details: Object.freeze({
        tableName: tableName || null,
        mutationsExecuted: 0,
      }),
    })
  }

  if (cleanStr(env?.ATTESTATION_DYNAMODB_ENDPOINT)) {
    try {
      assertSafeEndpointUrl(
        env.ATTESTATION_DYNAMODB_ENDPOINT,
        'ATTESTATION_DYNAMODB_ENDPOINT',
        {
          allowInsecureLocalhost:
            cleanStr(env?.ATTESTATION_DYNAMODB_ALLOW_INSECURE_LOCALHOST).toLowerCase() ===
              'true' &&
            !['PRODUCTION', 'STAGING'].includes(
              cleanStr(env?.ATTESTATION_ENVIRONMENT || env?.ATTESTATION_SERVICE_ENV).toUpperCase()
            ),
        }
      )
    } catch (err) {
      return Object.freeze({
        status: 'BLOCKED',
        component: 'DYNAMODB',
        stage: CONNECTIVITY_READINESS_STAGES.CONFIGURATION_VALIDATION,
        connectivityTest: 'BLOCKED',
        configurationValid: false,
        authorizationValid: false,
        connectivityAttempted: false,
        connectivityReachable: false,
        authenticationVerified: false,
        resourceVerified: false,
        realConnectivityTested: false,
        realIntegrationTested: false,
        productionValidated: false,
        productionApproved: false,
        safeFingerprint,
        errors: Object.freeze([
          makeSafeErrorRecord(
            'DYNAMODB_ENDPOINT_INVALID',
            DYNAMODB_ERROR_CATEGORIES.CONFIGURATION,
            err?.message
          ),
        ]),
        details: Object.freeze({
          tableName,
          mutationsExecuted: 0,
        }),
      })
    }
  }

  const auth = evaluateExternalConnectivityAuthorization(env)
  if (!auth.configurationValid) {
    return buildBlockedOrNotRunResult('DYNAMODB', auth, {
      tableName,
      mutationsExecuted: 0,
    })
  }
  if (!auth.authorizedToConnect) {
    return Object.freeze({
      ...buildBlockedOrNotRunResult('DYNAMODB', auth, {
        tableName,
        mutationsExecuted: 0,
      }),
      configurationValid: true,
    })
  }

  if (typeof deps.client?.describeTable !== 'function') {
    return Object.freeze({
      status: 'BLOCKED',
      component: 'DYNAMODB',
      stage: CONNECTIVITY_READINESS_STAGES.CONTROLLED_EXTERNAL_CONNECTIVITY,
      connectivityTest: 'NOT_RUN',
      configurationValid: true,
      authorizationValid: true,
      connectivityAttempted: false,
      connectivityReachable: false,
      authenticationVerified: false,
      resourceVerified: false,
      realConnectivityTested: false,
      realIntegrationTested: false,
      productionValidated: false,
      productionApproved: false,
      safeFingerprint,
      errors: Object.freeze([
        makeSafeErrorRecord(
          'REAL_INTEGRATION_DEPENDENCY_MISSING',
          DYNAMODB_ERROR_CATEGORIES.CONFIGURATION,
          'Cliente DynamoDB read-only (describeTable) no disponible en este runtime'
        ),
      ]),
      details: Object.freeze({
        tableName,
        mutationsExecuted: 0,
      }),
    })
  }

  const timeoutMs =
    deps.timeoutMs ??
    (Number(env?.ATTESTATION_DYNAMODB_TIMEOUT_MS) > 0
      ? Number(env?.ATTESTATION_DYNAMODB_TIMEOUT_MS)
      : 5000)

  const errors = []
  let reachable = false
  let authenticated = false
  let resourceVerified = false
  let tableStatus = null
  let ttlReady = false

  try {
    const res = await withBoundedTimeout(
      () => deps.client.describeTable({ TableName: tableName }),
      timeoutMs,
      'DYNAMODB_CONNECTIVITY_TIMEOUT',
      'dynamodb.describeTable'
    )
    reachable = true
    authenticated = true
    const tbl = res?.Table || res
    tableStatus = tbl?.TableStatus || null
    const returnedName = tbl?.TableName || tableName
    const keySchema = Array.isArray(tbl?.KeySchema) ? tbl.KeySchema : []
    const hasPk =
      keySchema.length === 0 ||
      keySchema.some(
        (k) =>
          (k.AttributeName === 'pk' || k.AttributeName === 'replayKey') &&
          k.KeyType === 'HASH'
      )
    if (typeof deps.client?.describeTimeToLive === 'function') {
      const ttlRes = await withBoundedTimeout(
        () => deps.client.describeTimeToLive({ TableName: tableName }),
        timeoutMs,
        'DYNAMODB_CONNECTIVITY_TIMEOUT',
        'dynamodb.describeTimeToLive'
      )
      const ttlDesc = ttlRes?.TimeToLiveDescription || ttlRes
      ttlReady =
        ttlDesc?.TimeToLiveStatus === 'ENABLED' ||
        ttlDesc?.TimeToLiveStatus === 'ENABLING'
    } else {
      ttlReady = true
    }
    resourceVerified =
      returnedName === tableName &&
      (tableStatus === 'ACTIVE' || tableStatus === null) &&
      hasPk
    if (!resourceVerified) {
      errors.push(
        makeSafeErrorRecord(
          'DYNAMODB_TABLE_NOT_READY',
          DYNAMODB_ERROR_CATEGORIES.CONFIGURATION,
          `Tabla DynamoDB '${tableName}' en estado '${tableStatus || 'UNKNOWN'}' o esquema pk inválido`
        )
      )
    }
  } catch (err) {
    const classified = classifyDynamoDbConnectivityError(err)
    reachable = classified.reachable
    authenticated = classified.authenticated
    errors.push(
      makeSafeErrorRecord(classified.code, classified.category, err?.message)
    )
  } finally {
    if (typeof deps.client?.close === 'function') {
      try {
        await deps.client.close()
      } catch {
        // ignore close error
      }
    }
  }

  return Object.freeze({
    status: resourceVerified ? 'CONNECTIVITY_VERIFIED' : 'CONNECTIVITY_FAILED',
    component: 'DYNAMODB',
    stage: CONNECTIVITY_READINESS_STAGES.CONTROLLED_EXTERNAL_CONNECTIVITY,
    connectivityTest: resourceVerified ? 'PASSED' : 'FAILED',
    configurationValid: true,
    authorizationValid: true,
    connectivityAttempted: true,
    connectivityReachable: reachable,
    authenticationVerified: authenticated,
    resourceVerified,
    realConnectivityTested: resourceVerified,
    realIntegrationTested: false,
    productionValidated: false,
    productionApproved: false,
    safeFingerprint,
    errors: Object.freeze(errors),
    details: Object.freeze({
      tableName,
      tableStatus,
      ttlReady,
      writesExecuted: 0,
      mutationsExecuted: 0,
    }),
  })
}

/**
 * Prueba controlada de solo lectura (`GetPublicKey`) para AWS KMS / GCP KMS.
 * Verifica conectividad, acceso al recurso, algoritmo Ed25519, identidad de clave y SPKI público,
 * sin ejecutar jamás operaciones de firma (`Sign` / `asymmetricSign`).
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{
 *   kmsClient?: {
 *     getPublicKey?: (input: Record<string, any>) => Promise<any>,
 *     close?: () => Promise<void>
 *   },
 *   timeoutMs?: number
 * }} [deps]
 */
export async function runControlledKmsConnectivityCheck(
  env = process.env,
  deps = {}
) {
  const safeFingerprint = buildSafeConfigurationFingerprint(env)
  let kmsCfg
  try {
    kmsCfg = resolveKmsEnvConfig(env)
  } catch (err) {
    return Object.freeze({
      status: 'CONFIGURATION_INVALID',
      component: 'KMS',
      stage: CONNECTIVITY_READINESS_STAGES.CONFIGURATION_VALIDATION,
      connectivityTest: 'BLOCKED',
      configurationValid: false,
      authorizationValid: false,
      connectivityAttempted: false,
      connectivityReachable: false,
      authenticationVerified: false,
      resourceVerified: false,
      realConnectivityTested: false,
      realIntegrationTested: false,
      productionValidated: false,
      productionApproved: false,
      safeFingerprint,
      errors: Object.freeze([
        makeSafeErrorRecord(
          'KMS_CONFIGURATION_CONFLICT',
          'CONFIGURATION',
          err?.message
        ),
      ]),
      details: Object.freeze({
        PRIVATE_KEYS_LOCAL: 'FORBIDDEN',
        PRODUCTION_SIGNING_KEY_IN_RUNTIME: 'FORBIDDEN',
        privateKeysLocal: 'FORBIDDEN',
        productionSigningKeyInRuntime: 'FORBIDDEN',
        signaturesExecuted: 0,
      }),
    })
  }

  const auth = evaluateExternalConnectivityAuthorization(env)
  if (!auth.configurationValid) {
    return buildBlockedOrNotRunResult('KMS', auth, {
      PRIVATE_KEYS_LOCAL: 'FORBIDDEN',
      PRODUCTION_SIGNING_KEY_IN_RUNTIME: 'FORBIDDEN',
      privateKeysLocal: 'FORBIDDEN',
      productionSigningKeyInRuntime: 'FORBIDDEN',
      signaturesExecuted: 0,
    })
  }
  if (!auth.authorizedToConnect) {
    return Object.freeze({
      ...buildBlockedOrNotRunResult('KMS', auth, {
        PRIVATE_KEYS_LOCAL: 'FORBIDDEN',
        PRODUCTION_SIGNING_KEY_IN_RUNTIME: 'FORBIDDEN',
        privateKeysLocal: 'FORBIDDEN',
        productionSigningKeyInRuntime: 'FORBIDDEN',
        signaturesExecuted: 0,
      }),
      configurationValid: true,
    })
  }

  const kmsClient = deps.kmsClient || deps.awsKmsClient || deps.gcpKmsClient
  if (typeof kmsClient?.getPublicKey !== 'function') {
    return Object.freeze({
      status: 'BLOCKED',
      component: 'KMS',
      stage: CONNECTIVITY_READINESS_STAGES.CONTROLLED_EXTERNAL_CONNECTIVITY,
      connectivityTest: 'NOT_RUN',
      configurationValid: true,
      authorizationValid: true,
      connectivityAttempted: false,
      connectivityReachable: false,
      authenticationVerified: false,
      resourceVerified: false,
      realConnectivityTested: false,
      realIntegrationTested: false,
      productionValidated: false,
      productionApproved: false,
      safeFingerprint,
      errors: Object.freeze([
        makeSafeErrorRecord(
          'REAL_INTEGRATION_DEPENDENCY_MISSING',
          'CONFIGURATION',
          'Cliente KMS read-only (getPublicKey) no inyectado o no instalado'
        ),
      ]),
      details: Object.freeze({
        PRIVATE_KEYS_LOCAL: 'FORBIDDEN',
        PRODUCTION_SIGNING_KEY_IN_RUNTIME: 'FORBIDDEN',
        privateKeysLocal: 'FORBIDDEN',
        productionSigningKeyInRuntime: 'FORBIDDEN',
        signaturesExecuted: 0,
      }),
    })
  }

  const timeoutMs =
    deps.timeoutMs ??
    (Number(env?.ATTESTATION_KMS_TIMEOUT_MS) > 0
      ? Number(env?.ATTESTATION_KMS_TIMEOUT_MS)
      : 5000)

  const errors = []
  let reachable = false
  let authenticated = false
  let resourceVerified = false

  try {
    const pubRes = await withBoundedTimeout(
      () =>
        kmsClient.getPublicKey({
          KeyId: kmsCfg.keyVersionName,
          name: kmsCfg.keyVersionName,
        }),
      timeoutMs,
      'KMS_CONNECTIVITY_TIMEOUT',
      'kms.getPublicKey'
    )
    reachable = true
    authenticated = true

    const returnedKeyId = pubRes?.KeyId || pubRes?.name || null
    const keyIdentityMatches =
      !returnedKeyId || returnedKeyId === kmsCfg.keyVersionName

    const returnedAlg =
      pubRes?.SigningAlgorithms?.[0] ||
      pubRes?.algorithm ||
      kmsCfg.awsSigningAlgorithm
    const algorithmMatches =
      returnedAlg === 'ED25519_SHA_512' ||
      returnedAlg === 'EC_SIGN_ED25519' ||
      returnedAlg === 'Ed25519'

    let remotePubObj = null
    const rawPub = pubRes?.pem || pubRes?.PublicKey || pubRes?.publicKeyPem || pubRes
    if (typeof rawPub === 'string' && rawPub.includes('BEGIN PUBLIC KEY')) {
      remotePubObj = crypto.createPublicKey(rawPub)
    } else if (Buffer.isBuffer(rawPub) || rawPub instanceof Uint8Array) {
      remotePubObj = crypto.createPublicKey({
        key: Buffer.from(rawPub),
        format: 'der',
        type: 'spki',
      })
    }

    const expectedPubObj = crypto.createPublicKey(kmsCfg.publicKeySpki)
    const spkiMatches = Boolean(
      remotePubObj &&
        remotePubObj.asymmetricKeyType === 'ed25519' &&
        remotePubObj
          .export({ format: 'der', type: 'spki' })
          .equals(expectedPubObj.export({ format: 'der', type: 'spki' }))
    )
    const derivedKeyId = computeEd25519SpkiKeyId(kmsCfg.publicKeySpki)
    const keyFingerprintMatches =
      !kmsCfg.keyId ||
      !kmsCfg.keyId.startsWith('ed25519-spki-') ||
      kmsCfg.keyId === derivedKeyId

    if (!keyIdentityMatches) {
      errors.push(
        makeSafeErrorRecord(
          'KMS_KEY_IDENTITY_MISMATCH',
          'RESOURCE',
          'El identificador de clave devuelto por KMS no coincide con el configurado'
        )
      )
    }
    if (!algorithmMatches) {
      errors.push(
        makeSafeErrorRecord(
          'KMS_ALGORITHM_MISMATCH',
          'RESOURCE',
          `Algoritmo KMS devuelto '${returnedAlg}' incompatible con Ed25519`
        )
      )
    }
    if (!spkiMatches || !keyFingerprintMatches) {
      errors.push(
        makeSafeErrorRecord(
          'KMS_PUBLIC_KEY_SPKI_MISMATCH',
          'RESOURCE',
          'La clave pública devuelta por KMS no coincide con el SPKI Ed25519 pineado'
        )
      )
    }

    resourceVerified =
      keyIdentityMatches && algorithmMatches && spkiMatches && keyFingerprintMatches
  } catch (err) {
    const msg = String(err?.message || '')
    const code = String(err?.code || err?.name || '')
    if (/AccessDenied|PermissionDenied|Unauthorized/i.test(`${code} ${msg}`)) {
      reachable = true
      authenticated = false
      errors.push(
        makeSafeErrorRecord('KMS_AUTHORIZATION_DENIED', 'AUTHORIZATION', msg)
      )
    } else if (code === 'KMS_CONNECTIVITY_TIMEOUT' || /timeout/i.test(msg)) {
      reachable = false
      authenticated = false
      errors.push(
        makeSafeErrorRecord('KMS_CONNECTIVITY_TIMEOUT', 'TIMEOUT', msg)
      )
    } else {
      reachable = false
      authenticated = false
      errors.push(
        makeSafeErrorRecord('KMS_CONNECTIVITY_FAILED', 'CONNECTIVITY', msg)
      )
    }
  } finally {
    if (typeof kmsClient?.close === 'function') {
      try {
        await kmsClient.close()
      } catch {
        // ignore close error
      }
    }
  }

  return Object.freeze({
    status: resourceVerified ? 'CONNECTIVITY_VERIFIED' : 'CONNECTIVITY_FAILED',
    component: 'KMS',
    stage: CONNECTIVITY_READINESS_STAGES.CONTROLLED_EXTERNAL_CONNECTIVITY,
    connectivityTest: resourceVerified ? 'PASSED' : 'FAILED',
    configurationValid: true,
    authorizationValid: true,
    connectivityAttempted: true,
    connectivityReachable: reachable,
    authenticationVerified: authenticated,
    resourceVerified,
    realConnectivityTested: resourceVerified,
    realIntegrationTested: false,
    productionValidated: false,
    productionApproved: false,
    safeFingerprint,
    errors: Object.freeze(errors),
    details: Object.freeze({
      PRIVATE_KEYS_LOCAL: 'FORBIDDEN',
      PRODUCTION_SIGNING_KEY_IN_RUNTIME: 'FORBIDDEN',
      privateKeysLocal: 'FORBIDDEN',
      productionSigningKeyInRuntime: 'FORBIDDEN',
      signaturesExecuted: 0,
      kmsProvider: kmsCfg.cloudProvider || kmsCfg.signingProviderMode,
      keyId: kmsCfg.keyId || null,
    }),
  })
}

/**
 * Prueba controlada de conectividad hacia el endpoint JWKS OIDC configurado.
 * Mantiene bloqueo de SSRF, metadata endpoints, redirects, credenciales en URL y `alg=none`/`oct`.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{
 *   fetchFn?: typeof fetch,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number
 * }} [deps]
 */
export async function runControlledOidcConnectivityCheck(
  env = process.env,
  deps = {}
) {
  const safeFingerprint = buildSafeConfigurationFingerprint(env)
  const jwksUri = cleanStr(env?.ATTESTATION_OIDC_JWKS_URI)
  const issuer = cleanStr(env?.ATTESTATION_OIDC_ISSUER)
  const audience = cleanStr(env?.ATTESTATION_OIDC_AUDIENCE)
  const allowInsecureLocalhostHttp =
    cleanStr(env?.ATTESTATION_OIDC_ALLOW_INSECURE_LOCALHOST).toLowerCase() ===
      'true' &&
    !['PRODUCTION', 'STAGING'].includes(
      cleanStr(env?.ATTESTATION_ENVIRONMENT || env?.ATTESTATION_SERVICE_ENV).toUpperCase()
    )
  const allowedJwksHosts = cleanStr(env?.ATTESTATION_OIDC_ALLOWED_JWKS_HOSTS)
    ? cleanStr(env?.ATTESTATION_OIDC_ALLOWED_JWKS_HOSTS)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined

  if (!jwksUri || !issuer || !audience) {
    return Object.freeze({
      status: !jwksUri && !issuer ? 'NOT_CONFIGURED' : 'BLOCKED',
      component: 'OIDC',
      stage: CONNECTIVITY_READINESS_STAGES.CONFIGURATION_VALIDATION,
      connectivityTest: !jwksUri && !issuer ? 'NOT_RUN' : 'BLOCKED',
      configurationValid: false,
      authorizationValid: false,
      connectivityAttempted: false,
      connectivityReachable: false,
      authenticationVerified: false,
      resourceVerified: false,
      realConnectivityTested: false,
      realIntegrationTested: false,
      productionValidated: false,
      productionApproved: false,
      safeFingerprint,
      errors: Object.freeze([
        makeSafeErrorRecord(
          'OIDC_CONFIGURATION_MISSING',
          'CONFIGURATION',
          'Se requieren ATTESTATION_OIDC_ISSUER, ATTESTATION_OIDC_AUDIENCE y ATTESTATION_OIDC_JWKS_URI'
        ),
      ]),
      details: Object.freeze({}),
    })
  }

  try {
    assertSafeJwksUri(jwksUri, allowInsecureLocalhostHttp, allowedJwksHosts)
  } catch (err) {
    const code = String(err?.message || 'OIDC_JWKS_URI_INVALID').split(':')[0]
    return Object.freeze({
      status: 'BLOCKED',
      component: 'OIDC',
      stage: CONNECTIVITY_READINESS_STAGES.CONFIGURATION_VALIDATION,
      connectivityTest: 'BLOCKED',
      configurationValid: false,
      authorizationValid: false,
      connectivityAttempted: false,
      connectivityReachable: false,
      authenticationVerified: false,
      resourceVerified: false,
      realConnectivityTested: false,
      realIntegrationTested: false,
      productionValidated: false,
      productionApproved: false,
      safeFingerprint,
      errors: Object.freeze([
        makeSafeErrorRecord(code, 'SSRF_OR_CONFIG', err?.message),
      ]),
      details: Object.freeze({}),
    })
  }

  const auth = evaluateExternalConnectivityAuthorization(env)
  if (!auth.configurationValid) {
    return buildBlockedOrNotRunResult('OIDC', auth)
  }
  if (!auth.authorizedToConnect) {
    return Object.freeze({
      ...buildBlockedOrNotRunResult('OIDC', auth),
      configurationValid: true,
    })
  }

  const fetchImpl = deps.fetchFn || deps.fetchImpl || globalThis.fetch
  const timeoutMs =
    deps.timeoutMs ??
    (Number(env?.ATTESTATION_OIDC_TIMEOUT_MS) > 0
      ? Number(env?.ATTESTATION_OIDC_TIMEOUT_MS)
      : 5000)

  const errors = []
  let reachable = false
  let resourceVerified = false
  let validKeyCount = 0

  try {
    const expectedHost = normalizeNetworkHostname(new URL(jwksUri).hostname)
    const response = await withBoundedTimeout(
      async () => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        if (typeof timer.unref === 'function') timer.unref()
        try {
          return await fetchImpl(jwksUri, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            redirect: 'error',
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timer)
        }
      },
      timeoutMs,
      'OIDC_JWKS_FETCH_TIMEOUT',
      'oidc.fetchJwks'
    )

    if (
      response?.redirected ||
      (typeof response?.status === 'number' &&
        response.status >= 300 &&
        response.status < 400)
    ) {
      throw new Error(
        'OIDC_JWKS_HTTP_STATUS_INVALID: Redirecciones HTTP están prohibidas en JWKS'
      )
    }
    if (typeof response?.url === 'string' && response.url.trim().length > 0) {
      const finalHost = normalizeNetworkHostname(new URL(response.url).hostname)
      if (finalHost !== expectedHost) {
        throw new Error(
          `OIDC_JWKS_REDIRECT_FORBIDDEN: Host final '${finalHost}' difiere de '${expectedHost}'`
        )
      }
    }

    reachable = true
    const statusOk =
      response?.status === 200 ||
      (response?.status === undefined && response?.ok === true)
    if (!statusOk) {
      throw new Error(
        `OIDC_JWKS_HTTP_STATUS_INVALID: HTTP ${response?.status || 'UNKNOWN'} desde endpoint JWKS`
      )
    }

    const body =
      typeof response?.json === 'function'
        ? await response.json()
        : JSON.parse(await response.text())
    const keys = Array.isArray(body?.keys) ? body.keys : []
    if (keys.some((k) => k && typeof k === 'object' && k.alg === 'none')) {
      throw new Error(
        'OIDC_JWKS_ALG_NONE_FORBIDDEN: Prohibido publicar claves con alg=none en JWKS'
      )
    }
    if (keys.some((k) => k && typeof k === 'object' && k.kty === 'oct')) {
      throw new Error(
        'OIDC_JWKS_SYMMETRIC_KEY_FORBIDDEN: Prohibido publicar claves simétricas kty=oct en JWKS'
      )
    }
    const validKeys = keys.filter(
      (k) =>
        k &&
        typeof k === 'object' &&
        k.kty !== 'oct' &&
        k.alg !== 'none' &&
        (!k.alg || OIDC_ALLOWED_ALGORITHMS.includes(k.alg))
    )
    validKeyCount = validKeys.length
    resourceVerified = validKeyCount > 0
    if (!resourceVerified) {
      errors.push(
        makeSafeErrorRecord(
          'OIDC_JWKS_NO_VALID_ASYMMETRIC_KEYS',
          'RESOURCE',
          'El documento JWKS no contiene claves públicas asimétricas válidas (EdDSA/RS256/ES256)'
        )
      )
    }
  } catch (err) {
    const msg = String(err?.message || '')
    const codePrefix = msg.split(':')[0]
    if (
      codePrefix === 'OIDC_JWKS_HTTP_STATUS_INVALID' ||
      codePrefix === 'OIDC_JWKS_REDIRECT_FORBIDDEN' ||
      codePrefix === 'OIDC_JWKS_ALG_NONE_FORBIDDEN' ||
      codePrefix === 'OIDC_JWKS_SYMMETRIC_KEY_FORBIDDEN'
    ) {
      errors.push(makeSafeErrorRecord(codePrefix, 'OIDC_VALIDATION', msg))
    } else if (
      err?.code === 'OIDC_JWKS_FETCH_TIMEOUT' ||
      err?.code === 'OIDC_CONNECTIVITY_TIMEOUT' ||
      err?.name === 'AbortError' ||
      /timeout|aborted/i.test(msg)
    ) {
      errors.push(
        makeSafeErrorRecord('OIDC_JWKS_FETCH_TIMEOUT', 'TIMEOUT', msg)
      )
    } else {
      errors.push(
        makeSafeErrorRecord('OIDC_CONNECTIVITY_FAILED', 'CONNECTIVITY', msg)
      )
    }
  }

  return Object.freeze({
    status: resourceVerified ? 'CONNECTIVITY_VERIFIED' : 'CONNECTIVITY_FAILED',
    component: 'OIDC',
    stage: CONNECTIVITY_READINESS_STAGES.CONTROLLED_EXTERNAL_CONNECTIVITY,
    connectivityTest: resourceVerified ? 'PASSED' : 'FAILED',
    configurationValid: true,
    authorizationValid: true,
    connectivityAttempted: true,
    connectivityReachable: reachable,
    authenticationVerified: resourceVerified,
    resourceVerified,
    realConnectivityTested: resourceVerified,
    realIntegrationTested: false,
    productionValidated: false,
    productionApproved: false,
    safeFingerprint,
    errors: Object.freeze(errors),
    details: Object.freeze({
      validKeyCount,
      validKeysCount: validKeyCount,
    }),
  })
}

/**
 * Evalúa de forma controlada la cadena de estados mTLS basada en contexto TLS real del socket:
 * - TLS_CONNECTED
 * - SERVER_CERT_VALID
 * - CLIENT_CERT_PRESENT
 * - CLIENT_CERT_TRUSTED
 * - CLIENT_IDENTITY_ALLOWED
 *
 * Nunca permite que cabeceras HTTP suplanten la identidad TLS del socket.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{
 *   tlsHandshakeContext?: {
 *     tlsConnected?: boolean,
 *     serverCertValid?: boolean,
 *     transportSecurity?: Record<string, any> | null,
 *     headers?: Record<string, unknown>
 *   },
 *   handshakeProbe?: () => Promise<any>,
 *   now?: (() => number | Date | string) | number | Date | string
 * }} [deps]
 */
export async function runControlledMtlsConnectivityCheck(
  env = process.env,
  deps = {}
) {
  const safeFingerprint = buildSafeConfigurationFingerprint(env)
  const mtlsStates = {
    TLS_CONNECTED: false,
    SERVER_CERT_VALID: false,
    CLIENT_CERT_PRESENT: false,
    CLIENT_CERT_TRUSTED: false,
    CLIENT_IDENTITY_ALLOWED: false,
  }

  const trustedCaPem = cleanStr(env?.ATTESTATION_MTLS_TRUSTED_CA_PEM).replace(
    /\\n/g,
    '\n'
  )
  const rawClientsJson = cleanStr(env?.ATTESTATION_MTLS_TRUSTED_CLIENTS_JSON)
  const trustedCaFingerprints = cleanStr(
    env?.ATTESTATION_MTLS_TRUSTED_CA_FINGERPRINTS_SHA256
  )
    ? cleanStr(env?.ATTESTATION_MTLS_TRUSTED_CA_FINGERPRINTS_SHA256)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  const allowedClientSanUris = cleanStr(
    env?.ATTESTATION_MTLS_ALLOWED_CLIENT_SAN_URIS
  )
    ? cleanStr(env?.ATTESTATION_MTLS_ALLOWED_CLIENT_SAN_URIS)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  const allowedClientIds = cleanStr(env?.ATTESTATION_MTLS_ALLOWED_CLIENT_IDS)
    ? cleanStr(env?.ATTESTATION_MTLS_ALLOWED_CLIENT_IDS)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  const allowedScopes = cleanStr(env?.ATTESTATION_MTLS_ALLOWED_SCOPES)
    ? cleanStr(env?.ATTESTATION_MTLS_ALLOWED_SCOPES)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : ['PR02_P0_OFFICIAL_EVIDENCE_COLLECTION']

  let verifier = null
  const hasPemConfig = Boolean(trustedCaPem && rawClientsJson)
  const hasFingerprintConfig = Boolean(
    trustedCaFingerprints.length > 0 &&
      (allowedClientSanUris.length > 0 || allowedClientIds.length > 0)
  )

  if (hasPemConfig) {
    try {
      const parsedClients = JSON.parse(rawClientsJson)
      verifier = createMtlsClientAuthVerifier({
        trustedCaPem,
        trustedClients: parsedClients,
        now: deps.now,
      })
    } catch (err) {
      return Object.freeze({
        status: 'BLOCKED',
        component: 'MTLS',
        stage: CONNECTIVITY_READINESS_STAGES.CONFIGURATION_VALIDATION,
        connectivityTest: 'BLOCKED',
        configurationValid: false,
        authorizationValid: false,
        connectivityAttempted: false,
        connectivityReachable: false,
        authenticationVerified: false,
        resourceVerified: false,
        realConnectivityTested: false,
        realIntegrationTested: false,
        productionValidated: false,
        productionApproved: false,
        safeFingerprint,
        errors: Object.freeze([
          makeSafeErrorRecord(
            'MTLS_CONFIGURATION_INVALID',
            'CONFIGURATION',
            err?.message
          ),
        ]),
        details: Object.freeze({
          mtlsStates: Object.freeze({ ...mtlsStates }),
        }),
      })
    }
  } else if (!hasFingerprintConfig) {
    return Object.freeze({
      status:
        !trustedCaPem && !rawClientsJson && trustedCaFingerprints.length === 0
          ? 'NOT_CONFIGURED'
          : 'BLOCKED',
      component: 'MTLS',
      stage: CONNECTIVITY_READINESS_STAGES.CONFIGURATION_VALIDATION,
      connectivityTest:
        !trustedCaPem && !rawClientsJson && trustedCaFingerprints.length === 0
          ? 'NOT_RUN'
          : 'BLOCKED',
      configurationValid: false,
      authorizationValid: false,
      connectivityAttempted: false,
      connectivityReachable: false,
      authenticationVerified: false,
      resourceVerified: false,
      realConnectivityTested: false,
      realIntegrationTested: false,
      productionValidated: false,
      productionApproved: false,
      safeFingerprint,
      errors: Object.freeze([
        makeSafeErrorRecord(
          'MTLS_CONFIGURATION_INVALID',
          'CONFIGURATION',
          'Configuración mTLS incompleta (se requiere CA y clientes permitidos)'
        ),
      ]),
      details: Object.freeze({
        mtlsStates: Object.freeze({ ...mtlsStates }),
      }),
    })
  }

  const auth = evaluateExternalConnectivityAuthorization(env)
  if (!auth.configurationValid && !hasFingerprintConfig) {
    return buildBlockedOrNotRunResult('MTLS', auth, {
      mtlsStates: Object.freeze({ ...mtlsStates }),
    })
  }
  const mtlsAuthorizedToConnect =
    auth.authorizedToConnect ||
    Boolean(
      hasFingerprintConfig &&
        auth.realIntegrationEnabled &&
        !auth.dryRun &&
        auth.connectivityTestEnabled &&
        auth.explicitConnectivityApproval
    )
  const hs =
    deps.tlsHandshakeContext ||
    (typeof deps.handshakeProbe === 'function'
      ? await deps.handshakeProbe()
      : null)
  if (!mtlsAuthorizedToConnect || !hs) {
    return Object.freeze({
      ...buildBlockedOrNotRunResult('MTLS', auth, {
        mtlsStates: Object.freeze({ ...mtlsStates }),
      }),
      configurationValid: true,
    })
  }

  const ts = hs.transportSecurity || null
  const errors = []

  mtlsStates.TLS_CONNECTED = Boolean(
    (hs.tlsConnected === true || ts?.tlsConnected === true) &&
      ts &&
      (ts.tlsEncrypted === true || ts.tlsConnected === true)
  )
  mtlsStates.SERVER_CERT_VALID = Boolean(
    mtlsStates.TLS_CONNECTED &&
      hs.serverCertValid !== false &&
      ts?.serverAuthorized !== false
  )
  mtlsStates.CLIENT_CERT_PRESENT = Boolean(
    mtlsStates.TLS_CONNECTED &&
      ts?.peerCertificate &&
      Object.keys(ts.peerCertificate).length > 0
  )
  mtlsStates.CLIENT_CERT_TRUSTED = Boolean(
    mtlsStates.CLIENT_CERT_PRESENT &&
      (ts?.tlsAuthorized === true || ts?.authorized === true)
  )

  if (!mtlsStates.TLS_CONNECTED) {
    errors.push(
      makeSafeErrorRecord(
        'CLIENT_AUTH_MTLS_REQUIRED',
        'TLS',
        'Conexión TLS no establecida o intento de suplantación por headers HTTP sin socket TLS'
      )
    )
  } else if (!mtlsStates.SERVER_CERT_VALID) {
    errors.push(
      makeSafeErrorRecord(
        'MTLS_SERVER_CERT_INVALID',
        'TLS',
        'Certificado del servidor TLS inválido'
      )
    )
  } else if (!mtlsStates.CLIENT_CERT_PRESENT) {
    errors.push(
      makeSafeErrorRecord(
        'MTLS_CLIENT_CERT_MISSING',
        'TLS',
        'El peer TLS no presentó certificado cliente'
      )
    )
  } else if (!mtlsStates.CLIENT_CERT_TRUSTED) {
    errors.push(
      makeSafeErrorRecord(
        'CLIENT_AUTH_MTLS_UNTRUSTED',
        'TLS',
        'Certificado cliente no firmado por CA confiable'
      )
    )
  } else if (verifier) {
    try {
      const res = await verifier.verify(hs.headers || {}, {
        transportSecurity: ts,
        now: deps.now,
      })
      mtlsStates.CLIENT_IDENTITY_ALLOWED = Boolean(
        res && typeof res === 'object' && res.authenticated === true
      )
    } catch (err) {
      mtlsStates.CLIENT_IDENTITY_ALLOWED = false
      errors.push(
        makeSafeErrorRecord(
          String(err?.message || 'CLIENT_AUTH_MTLS_CLIENT_NOT_ALLOWED').split(':')[0],
          'AUTHORIZATION',
          err?.message
        )
      )
    }
  } else {
    const peer = ts?.peerCertificate || {}
    const issuerFp = String(
      ts?.issuerFingerprint256 || peer.issuerFingerprint256 || ''
    ).trim()
    const cn = String(peer?.subject?.CN || '').trim()
    const sanRaw = String(peer?.subjectaltname || '').trim()
    const sanUris = sanRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('URI:'))
      .map((s) => s.slice(4).trim())
    const caMatch =
      trustedCaFingerprints.length === 0 ||
      trustedCaFingerprints.includes(issuerFp)
    const idMatch =
      (allowedClientIds.length === 0 || allowedClientIds.includes(cn)) &&
      (allowedClientSanUris.length === 0 ||
        sanUris.some((u) => allowedClientSanUris.includes(u)))
    mtlsStates.CLIENT_IDENTITY_ALLOWED = Boolean(
      caMatch && idMatch && allowedScopes.length > 0
    )
    if (!mtlsStates.CLIENT_IDENTITY_ALLOWED) {
      errors.push(
        makeSafeErrorRecord(
          'CLIENT_AUTH_MTLS_CLIENT_NOT_ALLOWED',
          'AUTHORIZATION',
          'Identidad del certificado cliente no autorizada en allowlist mTLS'
        )
      )
    }
  }

  const allVerified =
    mtlsStates.TLS_CONNECTED &&
    mtlsStates.SERVER_CERT_VALID &&
    mtlsStates.CLIENT_CERT_PRESENT &&
    mtlsStates.CLIENT_CERT_TRUSTED &&
    mtlsStates.CLIENT_IDENTITY_ALLOWED

  return Object.freeze({
    status: allVerified ? 'CONNECTIVITY_VERIFIED' : 'CONNECTIVITY_FAILED',
    component: 'MTLS',
    stage: CONNECTIVITY_READINESS_STAGES.CONTROLLED_EXTERNAL_CONNECTIVITY,
    connectivityTest: allVerified ? 'PASSED' : 'FAILED',
    configurationValid: true,
    authorizationValid: true,
    connectivityAttempted: true,
    connectivityReachable: mtlsStates.TLS_CONNECTED,
    authenticationVerified: mtlsStates.CLIENT_CERT_TRUSTED,
    resourceVerified: allVerified,
    realConnectivityTested: allVerified,
    realIntegrationTested: false,
    productionValidated: false,
    productionApproved: false,
    safeFingerprint,
    errors: Object.freeze(errors),
    details: Object.freeze({
      mtlsStates: Object.freeze({ ...mtlsStates }),
    }),
  })
}

export async function runControlledExternalConnectivitySuite(
  env = process.env,
  deps = {}
) {
  const authorization = evaluateExternalConnectivityAuthorization(env)
  const safeFingerprint = buildSafeConfigurationFingerprint(env)
  const backend = String(
    env?.ATTESTATION_ANTI_REPLAY_BACKEND ||
      env?.ATTESTATION_ANTI_REPLAY_PROVIDER ||
      'memory'
  )
    .trim()
    .toLowerCase()
  const kmsProvider = String(env?.ATTESTATION_KMS_PROVIDER || 'local-pem')
    .trim()
    .toLowerCase()
  const authMode = String(env?.ATTESTATION_CLIENT_AUTH_MODE || 'hmac-dev')
    .trim()
    .toLowerCase()

  const components = {}

  if (backend === 'postgresql' || deps.includePostgres === true) {
    components.postgresql = await runControlledPostgresConnectivityCheck(
      env,
      deps.postgres || deps
    )
  }

  if (backend === 'dynamodb' || deps.includeDynamoDb === true) {
    components.dynamodb = await runControlledDynamoDbConnectivityCheck(
      env,
      deps.dynamodb || deps
    )
  }

  if (
    kmsProvider === 'aws-kms' ||
    kmsProvider === 'aws_kms' ||
    kmsProvider === 'gcp-kms' ||
    kmsProvider === 'gcp_kms' ||
    deps.includeKms === true
  ) {
    components.kms = await runControlledKmsConnectivityCheck(
      env,
      deps.kms || deps
    )
  }

  if (
    authMode === 'oidc-jwt' ||
    authMode === 'oidc_jwt' ||
    deps.includeOidc === true
  ) {
    components.oidc = await runControlledOidcConnectivityCheck(
      env,
      deps.oidc || deps
    )
  }

  if (authMode === 'mtls' || deps.includeMtls === true) {
    components.mtls = await runControlledMtlsConnectivityCheck(
      env,
      deps.mtls || deps
    )
  }

  const componentList = Object.values(components)
  const allVerified =
    componentList.length > 0 &&
    componentList.every((c) => c.status === 'CONNECTIVITY_VERIFIED')
  const anyAttempted = componentList.some((c) => c.connectivityAttempted)
  const anyFailed = componentList.some((c) => c.connectivityTest === 'FAILED')

  return Object.freeze({
    status: !authorization.authorizedToConnect
      ? authorization.authorizationStatus
      : allVerified
        ? 'CONTROLLED_CONNECTIVITY_VERIFIED'
        : anyFailed
          ? 'CONTROLLED_CONNECTIVITY_FAILED'
          : 'NOT_RUN',
    stage: authorization.stage,
    connectivityTest: !authorization.authorizedToConnect
      ? 'NOT_RUN'
      : allVerified
        ? 'PASSED'
        : anyFailed
          ? 'FAILED'
          : 'NOT_RUN',
    configured: authorization.configured,
    authorizedToConnect: authorization.authorizedToConnect,
    connectivityAttempted: anyAttempted,
    realConnectivityTested: allVerified,
    realIntegrationTested: false,
    productionValidated: false,
    productionApproved: false,
    authorization,
    safeFingerprint,
    components: Object.freeze(components),
    invariants: Object.freeze({
      PRIVATE_KEYS_LOCAL: 'FORBIDDEN',
      PRODUCTION_SIGNING_KEY_IN_RUNTIME: 'FORBIDDEN',
      PRODUCTION_VALIDATED: false,
      PRODUCTION_APPROVED: false,
      EXTERNAL_AUTHORITY_DEPLOYED: false,
      AUTHORITY_REAL_WORLD_AVAILABLE: false,
      P1_IMPORT_ALLOWED: false,
      PR02_READY_FOR_EMISSION_GO: false,
      REMOTE_GO: 'DENIED',
      HISTORICAL_042_REEMISSION_FORBIDDEN: true,
    }),
  })
}
