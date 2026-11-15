// @ts-check
import crypto from 'node:crypto'
import {
  ALLOWED_ENVIRONMENTS,
  ALLOWED_EXECUTION_SCOPES,
  SERVICE_ENVIRONMENTS,
} from './attestation-policy.mjs'
import { assertNoProhibitedSecretsInText, safeParseStrictJson } from './contract.mjs'
import { OIDC_ALLOWED_ALGORITHMS } from './client-auth.mjs'
import {
  computeEd25519SpkiKeyId,
  verifyGoAuthorizationGrant,
} from './go-authorization.mjs'
import { ALLOWED_POSTGRES_ISOLATION_LEVELS } from './postgres-anti-replay-adapter.mjs'
import {
  assertDedicatedPostgresUrl,
  assertSafeEndpointUrl,
  isRealIntegrationDryRun,
  isRealIntegrationEnabled,
  normalizeNetworkHostname,
  resolveKmsEnvConfig,
} from './real-integration.mjs'

export const PREFLIGHT_STATUSES = Object.freeze({
  CONFIGURATION_VALID: 'CONFIGURATION_VALID',
  CONFIGURATION_INVALID: 'CONFIGURATION_INVALID',
  REAL_INTEGRATION_DISABLED: 'REAL_INTEGRATION_DISABLED',
  REAL_INTEGRATION_NOT_CONFIGURED: 'REAL_INTEGRATION_NOT_CONFIGURED',
  REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST:
    'REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST',
})

export const INTEGRATION_PHASES = Object.freeze({
  PHASE_0_CONFIG_VALIDATION: 'PHASE_0_CONFIG_VALIDATION',
  PHASE_1_READ_ONLY_CONNECTIVITY: 'PHASE_1_READ_ONLY_CONNECTIVITY',
  PHASE_2_NON_PRODUCTION_MUTATION: 'PHASE_2_NON_PRODUCTION_MUTATION',
  PHASE_3_CONCURRENCY_VALIDATION: 'PHASE_3_CONCURRENCY_VALIDATION',
  PHASE_4_KMS_SIGNING_VALIDATION: 'PHASE_4_KMS_SIGNING_VALIDATION',
  PHASE_5_AUTHENTICATION_VALIDATION: 'PHASE_5_AUTHENTICATION_VALIDATION',
  PHASE_6_DEPLOYMENT_CANDIDATE: 'PHASE_6_DEPLOYMENT_CANDIDATE',
})

export const INTEGRATION_PHASE_ORDER = Object.freeze([
  INTEGRATION_PHASES.PHASE_0_CONFIG_VALIDATION,
  INTEGRATION_PHASES.PHASE_1_READ_ONLY_CONNECTIVITY,
  INTEGRATION_PHASES.PHASE_2_NON_PRODUCTION_MUTATION,
  INTEGRATION_PHASES.PHASE_3_CONCURRENCY_VALIDATION,
  INTEGRATION_PHASES.PHASE_4_KMS_SIGNING_VALIDATION,
  INTEGRATION_PHASES.PHASE_5_AUTHENTICATION_VALIDATION,
  INTEGRATION_PHASES.PHASE_6_DEPLOYMENT_CANDIDATE,
])

export const MATURITY_STATES = Object.freeze({
  UNIT_TESTED: 'UNIT_TESTED',
  LOCAL_TESTED: 'LOCAL_TESTED',
  SIMULATION_TESTED: 'SIMULATION_TESTED',
  REAL_CONNECTIVITY_TESTED: 'REAL_CONNECTIVITY_TESTED',
  REAL_INTEGRATION_TESTED: 'REAL_INTEGRATION_TESTED',
  PRODUCTION_VALIDATED: 'PRODUCTION_VALIDATED',
})

export const DEFAULT_MATURITY_FLAGS = Object.freeze({
  POSTGRESQL_REAL_INTEGRATION_TESTED: false,
  AWS_DYNAMODB_REAL_TESTED: false,
  AWS_KMS_REAL_TESTED: false,
  GCP_KMS_REAL_TESTED: false,
  OIDC_REAL_INTEGRATION_TESTED: false,
  MTLS_REAL_INTEGRATION_TESTED: false,
  PRODUCTION_VALIDATED: false,
  PRODUCTION_APPROVED: false,
  P1_IMPORT_ALLOWED: false,
  PR02_READY_FOR_EMISSION_GO: false,
})

const ANTI_REPLAY_MODE_MAP = Object.freeze({
  memory: 'memory',
  IN_MEMORY: 'memory',
  file: 'file',
  LOCAL_DURABLE: 'file',
  distributed: 'distributed',
  DISTRIBUTED_MULTI_NODE: 'distributed',
})

const AWS_REGION_RE = /^[a-z]{2}(?:-[a-z]+)+-\d+$/
const AWS_KMS_ARN_RE =
  /^arn:aws(?:-[a-z]+)?:kms:([a-z0-9-]+):(\d{12}):(?:key|alias)\/[a-zA-Z0-9/_-]+$/
const GCP_KMS_KEY_VERSION_RE =
  /^projects\/[a-zA-Z0-9._-]+\/locations\/[a-zA-Z0-9-]+\/keyRings\/[a-zA-Z0-9._-]+\/cryptoKeys\/[a-zA-Z0-9._-]+\/cryptoKeyVersions\/[a-zA-Z0-9._-]+$/
const PG_TABLE_RE = /^[a-z_][a-z0-9_]{0,62}$/
const DDB_TABLE_RE = /^[a-zA-Z0-9_.-]{3,255}$/

const FORBIDDEN_FISCAL_ENV_KEYS = Object.freeze([
  'ARCA_WSAA_TOKEN',
  'ARCA_WSAA_SIGN',
  'ARCA_PRIVATE_KEY',
  'ARCA_CERT_PEM',
  'AFIP_WSAA_TOKEN',
  'AFIP_PRIVATE_KEY',
  'AFIP_CERT_PEM',
  'WSAA_TOKEN',
  'WSAA_SIGN',
  'SUPABASE_SERVICE_ROLE_KEY',
])

const PHASE_REQUIRED_OPT_IN_ENV = Object.freeze({
  [INTEGRATION_PHASES.PHASE_0_CONFIG_VALIDATION]: null,
  [INTEGRATION_PHASES.PHASE_1_READ_ONLY_CONNECTIVITY]:
    'ATTESTATION_REAL_INTEGRATION_ENABLED',
  [INTEGRATION_PHASES.PHASE_2_NON_PRODUCTION_MUTATION]:
    'ATTESTATION_ALLOW_CONTROLLED_MUTATION_TEST',
  [INTEGRATION_PHASES.PHASE_3_CONCURRENCY_VALIDATION]:
    'ATTESTATION_ALLOW_CONTROLLED_CONCURRENCY_TEST',
  [INTEGRATION_PHASES.PHASE_4_KMS_SIGNING_VALIDATION]:
    'ATTESTATION_ALLOW_CONTROLLED_KMS_TEST',
  [INTEGRATION_PHASES.PHASE_5_AUTHENTICATION_VALIDATION]:
    'ATTESTATION_ALLOW_CONTROLLED_AUTH_TEST',
  [INTEGRATION_PHASES.PHASE_6_DEPLOYMENT_CANDIDATE]:
    'ATTESTATION_DEPLOYMENT_CANDIDATE_OPT_IN',
})

/**
 * Redacta credenciales, tokens, headers Authorization y bloques de clave privada de textos diagnósticos.
 * @param {unknown} rawText
 * @returns {string}
 */
export function redactSensitiveConfigText(rawText) {
  const str = String(rawText ?? '')
  return str
    .replace(
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi,
      '[REDACTED_PRIVATE_KEY]'
    )
    .replace(
      /\b([a-z][a-z0-9+.-]*:\/\/)([^:@\s/]+):([^@\s/]+)@/gi,
      '$1[REDACTED]:[REDACTED]@'
    )
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(
      /([?&](?:password|pass|pwd|secret|token|apikey|api_key|service_role|auth)=)([^&\s]+)/gi,
      '$1[REDACTED]'
    )
    .replace(
      /\b((?:password|pass|pwd|secret|token|apikey|api_key|service_role|auth)\s*[:=]\s*)([^\s"',;]+)/gi,
      '$1[REDACTED]'
    )
    .replace(
      /\b(with\s+(?:secret|password|token)\s+)([^\s"',;]+)/gi,
      '$1[REDACTED]'
    )
    .replace(/\bAKIA[0-9A-Z]{12,}\b/g, '[REDACTED_AWS_KEY]')
}

function cleanStr(val) {
  return typeof val === 'string' ? val.trim() : ''
}

function parseStrictBoolFlag(env, key, issues) {
  const raw = env?.[key]
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { present: false, value: false }
  }
  const norm = String(raw).trim().toLowerCase()
  if (norm === 'true') return { present: true, value: true }
  if (norm === 'false') return { present: true, value: false }
  issues.push({
    domain: 'ENVIRONMENT',
    severity: 'ERROR',
    code: 'ATTESTATION_BOOLEAN_FLAG_INVALID',
    field: key,
    message: `${key} debe ser 'true' o 'false'`,
  })
  return { present: true, value: false }
}

function parseBoundedInt(env, key, min, max, issues) {
  const raw = env?.[key]
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return null
  }
  const n = Number(String(raw).trim())
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    issues.push({
      domain: 'SYNTAX',
      severity: 'ERROR',
      code: 'REAL_INTEGRATION_CONFIG_INVALID',
      field: key,
      message: `${key} debe ser entero seguro entre ${min} y ${max}`,
    })
    return null
  }
  return n
}

function parseListSafe(rawValue) {
  const trimmed = cleanStr(rawValue)
  if (!trimmed) return []
  if (trimmed.startsWith('[')) {
    const wrapped = safeParseStrictJson(`{"items":${trimmed}}`)
    if (!Array.isArray(wrapped.items)) {
      throw new Error('ATTESTATION_ENV_LIST_INVALID: Se esperaba JSON array')
    }
    return wrapped.items.map((x) => cleanStr(String(x))).filter(Boolean)
  }
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function trySanitizeHostAndPort(rawUrl) {
  const trimmed = cleanStr(rawUrl)
  if (!trimmed) return { host: null, port: null, database: null, sslMode: null }
  try {
    const parsed = new URL(trimmed)
    return {
      host: parsed.hostname ? parsed.hostname.toLowerCase() : null,
      port: parsed.port ? Number(parsed.port) : null,
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') || null : null,
      sslMode: parsed.searchParams.get('sslmode')?.trim().toLowerCase() || null,
    }
  } catch {
    return { host: null, port: null, database: null, sslMode: null }
  }
}

function resolveAntiReplaySelection(env) {
  const rawMode = cleanStr(
    env?.ATTESTATION_ANTI_REPLAY_MODE || env?.ATTESTATION_ANTI_REPLAY_BACKEND
  )
  const serviceEnvironment = cleanStr(env?.ATTESTATION_ENVIRONMENT).toUpperCase()
  const storageType = rawMode
    ? ANTI_REPLAY_MODE_MAP[rawMode] || 'INVALID'
    : serviceEnvironment === SERVICE_ENVIRONMENTS.TEST
      ? 'memory'
      : serviceEnvironment
        ? 'file'
        : 'UNSET'

  const explicitProvider = cleanStr(
    env?.ATTESTATION_ANTI_REPLAY_PROVIDER
  ).toUpperCase()
  const hasPgUrl = cleanStr(env?.ATTESTATION_POSTGRES_URL).length > 0
  const hasDdbConfig =
    cleanStr(env?.ATTESTATION_DYNAMODB_TABLE).length > 0 ||
    cleanStr(env?.ATTESTATION_DYNAMODB_ENDPOINT).length > 0

  let distributedProvider = 'NONE'
  if (storageType === 'distributed') {
    if (explicitProvider) {
      distributedProvider = explicitProvider
    } else if (hasPgUrl && hasDdbConfig) {
      distributedProvider = 'AMBIGUOUS'
    } else if (hasPgUrl) {
      distributedProvider = 'POSTGRESQL'
    } else if (hasDdbConfig) {
      distributedProvider = 'DYNAMODB'
    } else {
      distributedProvider = 'UNCONFIGURED'
    }
  }

  return Object.freeze({
    rawMode,
    storageType,
    distributedProvider,
    hasPgUrl,
    hasDdbConfig,
  })
}

/**
 * Construye una huella diagnóstica segura SIN SECRETOS de la configuración de entorno.
 * Nunca incluye contraseñas, tokens bearer, claves privadas, PEM secretos ni connection strings completas.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function buildSafeConfigurationFingerprint(env = process.env) {
  const serviceEnvironment =
    cleanStr(env?.ATTESTATION_ENVIRONMENT).toUpperCase() || 'UNSET'
  const antiReplay = resolveAntiReplaySelection(env)
  const pgMeta = trySanitizeHostAndPort(env?.ATTESTATION_POSTGRES_URL)

  let kmsCfg
  try {
    kmsCfg = resolveKmsEnvConfig(env)
  } catch {
    kmsCfg = {
      signingProviderMode:
        cleanStr(env?.ATTESTATION_SIGNING_PROVIDER).toUpperCase() ||
        cleanStr(env?.ATTESTATION_SIGNING_MODE).toUpperCase() ||
        'CONFLICT',
      cloudProvider: 'CONFLICT',
      authorityId: cleanStr(env?.ATTESTATION_AUTHORITY_ID),
      keyId: '',
      keyVersionName: '',
      publicKeySpki: '',
      region: cleanStr(env?.ATTESTATION_AWS_REGION || env?.AWS_REGION),
      kmsEndpoint: cleanStr(env?.ATTESTATION_KMS_ENDPOINT),
    }
  }

  const kmsEndpointMeta = trySanitizeHostAndPort(kmsCfg.kmsEndpoint)
  const ddbEndpointMeta = trySanitizeHostAndPort(env?.ATTESTATION_DYNAMODB_ENDPOINT)
  const jwksMeta = trySanitizeHostAndPort(env?.ATTESTATION_OIDC_JWKS_URI)

  let firstIssuerOrigin = null
  try {
    const issuers = parseListSafe(env?.ATTESTATION_OIDC_ISSUER)
    if (issuers.length > 0) {
      const parsedIss = trySanitizeHostAndPort(issuers[0])
      firstIssuerOrigin = parsedIss.host || issuers[0]
    }
  } catch {
    firstIssuerOrigin = 'INVALID_LIST'
  }

  let kmsKeyResourceKind = 'NONE'
  if (kmsCfg.keyVersionName) {
    if (kmsCfg.keyVersionName.startsWith('arn:aws')) {
      kmsKeyResourceKind = 'AWS_KMS_ARN'
    } else if (kmsCfg.keyVersionName.startsWith('projects/')) {
      kmsKeyResourceKind = 'GCP_KMS_VERSION'
    } else {
      kmsKeyResourceKind = 'GENERIC_RESOURCE'
    }
  }

  const descriptor = Object.freeze({
    schema: 'INDEPENDENT_ATTESTATION_SAFE_CONFIG_FINGERPRINT_V1',
    serviceEnvironment,
    nodeEnv: cleanStr(env?.NODE_ENV) || 'UNSET',
    realIntegrationEnabled: isRealIntegrationEnabled(env),
    realIntegrationDryRun: isRealIntegrationDryRun(env),
    targetPhase:
      cleanStr(env?.ATTESTATION_INTEGRATION_PHASE).toUpperCase() ||
      INTEGRATION_PHASES.PHASE_0_CONFIG_VALIDATION,
    authorityId:
      cleanStr(env?.ATTESTATION_AUTHORITY_ID) || 'DEFAULT',
    signingProviderMode: kmsCfg.signingProviderMode || 'UNSET',
    kmsProvider: kmsCfg.cloudProvider || 'NONE',
    kmsRegion: kmsCfg.region || null,
    kmsKeyId: kmsCfg.keyId || null,
    kmsKeyResourceKind,
    kmsEndpointHost: kmsEndpointMeta.host,
    antiReplayStorageType: antiReplay.storageType,
    antiReplayProvider: antiReplay.distributedProvider,
    postgresHost: pgMeta.host,
    postgresPort: pgMeta.host ? pgMeta.port || 5432 : null,
    postgresDatabase: pgMeta.database,
    postgresSslMode: pgMeta.sslMode,
    postgresTable:
      cleanStr(env?.ATTESTATION_POSTGRES_TABLE) ||
      (antiReplay.distributedProvider === 'POSTGRESQL'
        ? 'attestation_distributed_anti_replay'
        : null),
    dynamoTableName: cleanStr(env?.ATTESTATION_DYNAMODB_TABLE) || null,
    dynamoRegion:
      cleanStr(env?.ATTESTATION_AWS_REGION || env?.AWS_REGION) || null,
    dynamoEndpointHost: ddbEndpointMeta.host,
    clientAuthMode:
      cleanStr(env?.ATTESTATION_CLIENT_AUTH_MODE).toUpperCase() || 'UNSET',
    oidcIssuer: firstIssuerOrigin,
    oidcJwksHost: jwksMeta.host,
    mtlsEnabled:
      cleanStr(env?.ATTESTATION_CLIENT_AUTH_MODE).toUpperCase() === 'MTLS',
    protectedModeFlag:
      cleanStr(env?.ATTESTATION_PROTECTED_MODE).toLowerCase() || 'DEFAULT',
    httpsRequired:
      cleanStr(env?.ATTESTATION_REQUIRE_HTTPS).toLowerCase() === 'true' ||
      cleanStr(env?.ATTESTATION_TLS_REQUIRED).toLowerCase() === 'true',
    trustProxyHttps:
      cleanStr(env?.ATTESTATION_TRUST_PROXY_HTTPS).toLowerCase() === 'true',
    servicePort: cleanStr(env?.ATTESTATION_SERVICE_PORT || env?.PORT) || '8080',
    allowedScopes: ALLOWED_EXECUTION_SCOPES,
    allowedTargetEnvironments: ALLOWED_ENVIRONMENTS,
  })

  const configFingerprintSha256 = crypto
    .createHash('sha256')
    .update(JSON.stringify(descriptor), 'utf8')
    .digest('hex')

  return Object.freeze({
    ...descriptor,
    configFingerprintSha256,
    secretsIncluded: false,
  })
}

function validateCertificatePem(pemText, varName, issues) {
  const normalized = cleanStr(pemText).replace(/\\n/g, '\n')
  if (!normalized.includes('BEGIN CERTIFICATE')) {
    issues.push({
      domain: 'SECURITY',
      severity: 'ERROR',
      code: 'CERTIFICATE_PEM_INVALID',
      field: varName,
      message: `${varName} no contiene certificado X.509 PEM válido`,
    })
    return false
  }
  try {
    if (typeof crypto.X509Certificate === 'function') {
      const cert = new crypto.X509Certificate(normalized)
      const validToMs = Date.parse(cert.validTo)
      if (Number.isFinite(validToMs) && validToMs <= Date.now()) {
        issues.push({
          domain: 'SECURITY',
          severity: 'ERROR',
          code: 'CERTIFICATE_EXPIRED',
          field: varName,
          message: `${varName} contiene un certificado CA expirado`,
        })
        return false
      }
    }
    return true
  } catch {
    issues.push({
      domain: 'SECURITY',
      severity: 'ERROR',
      code: 'CERTIFICATE_PEM_INVALID',
      field: varName,
      message: `${varName} contiene certificado X.509 malformado`,
    })
    return false
  }
}

/**
 * Ejecuta validación estática completa de sintaxis, seguridad y completitud de configuración
 * SIN abrir conexiones de red ni tocar KMS/DB/ARCA/Supabase.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{ requireCompleteForEnv?: boolean, checkAmbientFiscalVars?: boolean }} [options]
 */
export function validateInfrastructureConfiguration(
  env = process.env,
  options = {}
) {
  const issues = []
  const warnings = []
  const missingRealTargets = []
  const checks = []

  const addCheck = (name, category, valid, code, message) => {
    checks.push(
      Object.freeze({
        name,
        category,
        valid,
        code,
        message: redactSensitiveConfigText(message),
      })
    )
  }

  // 1. Escaneo de secretos fiscales prohibidos dentro de configuración de autoridad
  for (const [key, val] of Object.entries(env || {})) {
    if (
      key.startsWith('ATTESTATION_') &&
      typeof val === 'string' &&
      val.length > 0
    ) {
      try {
        assertNoProhibitedSecretsInText(val)
      } catch (err) {
        issues.push({
          domain: 'SECURITY',
          severity: 'ERROR',
          code: 'PROHIBITED_FISCAL_SECRET_DETECTED',
          field: key,
          message: `${key} contiene material secreto/fiscal prohibido (${redactSensitiveConfigText(err?.message)})`,
        })
      }
    }
  }

  if (options.checkAmbientFiscalVars !== false) {
    for (const forbiddenKey of FORBIDDEN_FISCAL_ENV_KEYS) {
      if (cleanStr(env?.[forbiddenKey])) {
        issues.push({
          domain: 'SECURITY',
          severity: 'ERROR',
          code: 'PROHIBITED_FISCAL_CREDENTIAL_ENV',
          field: forbiddenKey,
          message: `Variable fiscal/POS prohibida '${forbiddenKey}' presente en el entorno de la autoridad`,
        })
      }
    }
  }

  // 2. Flags booleanas y entorno
  const realEnabledFlag = parseStrictBoolFlag(
    env,
    'ATTESTATION_REAL_INTEGRATION_ENABLED',
    issues
  )
  const dryRunFlag = parseStrictBoolFlag(
    env,
    'ATTESTATION_REAL_INTEGRATION_DRY_RUN',
    issues
  )
  const protectedModeFlag = parseStrictBoolFlag(
    env,
    'ATTESTATION_PROTECTED_MODE',
    issues
  )
  const requireSignedGoGrantFlag = parseStrictBoolFlag(
    env,
    'ATTESTATION_REQUIRE_SIGNED_GO_GRANT',
    issues
  )
  const requireHttpsFlag = parseStrictBoolFlag(
    env,
    'ATTESTATION_REQUIRE_HTTPS',
    issues
  )
  const tlsRequiredFlag = parseStrictBoolFlag(
    env,
    'ATTESTATION_TLS_REQUIRED',
    issues
  )
  const trustProxyHttpsFlag = parseStrictBoolFlag(
    env,
    'ATTESTATION_TRUST_PROXY_HTTPS',
    issues
  )
  const allowInsecureOidcLocalFlag = parseStrictBoolFlag(
    env,
    'ATTESTATION_OIDC_ALLOW_INSECURE_LOCALHOST',
    issues
  )
  const allowInsecurePgLocalFlag = parseStrictBoolFlag(
    env,
    'ATTESTATION_POSTGRES_ALLOW_INSECURE_LOCALHOST',
    issues
  )

  const rawServiceEnv = cleanStr(env?.ATTESTATION_ENVIRONMENT)
  const validServiceEnv = Object.values(SERVICE_ENVIRONMENTS).includes(
    rawServiceEnv
  )
  if (!validServiceEnv) {
    issues.push({
      domain: 'ENVIRONMENT',
      severity: 'ERROR',
      code: 'ATTESTATION_ENVIRONMENT_REQUIRED',
      field: 'ATTESTATION_ENVIRONMENT',
      message: `ATTESTATION_ENVIRONMENT '${rawServiceEnv}' inválido; requeridos: ${Object.values(SERVICE_ENVIRONMENTS).join(', ')}`,
    })
  }
  const isProdOrStaging =
    rawServiceEnv === SERVICE_ENVIRONMENTS.PRODUCTION ||
    rawServiceEnv === SERVICE_ENVIRONMENTS.STAGING
  const effectiveProtected =
    isProdOrStaging ||
    protectedModeFlag.value ||
    (rawServiceEnv === SERVICE_ENVIRONMENTS.DEVELOPMENT &&
      (!protectedModeFlag.present || protectedModeFlag.value))

  if (isProdOrStaging && protectedModeFlag.present && !protectedModeFlag.value) {
    issues.push({
      domain: 'SECURITY',
      severity: 'ERROR',
      code: 'PROTECTED_MODE_CANNOT_BE_DISABLED',
      field: 'ATTESTATION_PROTECTED_MODE',
      message: `ATTESTATION_PROTECTED_MODE=false prohibido en '${rawServiceEnv}'`,
    })
  }

  const rawIntegrationPhase = cleanStr(env?.ATTESTATION_INTEGRATION_PHASE)
  if (
    rawIntegrationPhase &&
    !INTEGRATION_PHASE_ORDER.includes(rawIntegrationPhase)
  ) {
    issues.push({
      domain: 'ENVIRONMENT',
      severity: 'ERROR',
      code: 'INVALID_INTEGRATION_PHASE',
      field: 'ATTESTATION_INTEGRATION_PHASE',
      message: `ATTESTATION_INTEGRATION_PHASE '${rawIntegrationPhase}' inválida`,
    })
  } else if (
    rawIntegrationPhase === INTEGRATION_PHASES.PHASE_6_DEPLOYMENT_CANDIDATE &&
    (cleanStr(env?.ATTESTATION_DEPLOYMENT_CANDIDATE_OPT_IN).toLowerCase() !== 'true' ||
      cleanStr(env?.ATTESTATION_REAL_INTEGRATION_ENABLED).toLowerCase() !== 'true')
  ) {
    issues.push({
      domain: 'ENVIRONMENT',
      severity: 'ERROR',
      code: 'PHASE_ESCALATION_FORBIDDEN',
      field: 'ATTESTATION_INTEGRATION_PHASE',
      message:
        'ATTESTATION_INTEGRATION_PHASE=PHASE_6_DEPLOYMENT_CANDIDATE prohibida sin opt-in explícito',
    })
  }

  addCheck(
    'environment_and_flags',
    'SYNTAX',
    validServiceEnv && !issues.some((i) => i.domain === 'ENVIRONMENT'),
    validServiceEnv ? 'OK' : 'ATTESTATION_ENVIRONMENT_REQUIRED',
    validServiceEnv
      ? `Entorno '${rawServiceEnv}' validado`
      : 'Entorno de servicio ausente o inválido'
  )

  // 3. Validación de KMS y proveedor de firma
  let kmsCfg = null
  try {
    kmsCfg = resolveKmsEnvConfig(env)
  } catch (err) {
    issues.push({
      domain: 'KMS',
      severity: 'ERROR',
      code: 'KMS_CONFIGURATION_CONFLICT',
      field: 'ATTESTATION_KMS',
      message: redactSensitiveConfigText(err?.message || 'Conflicto KMS'),
    })
  }

  if (kmsCfg) {
    const rawProvider = cleanStr(env?.ATTESTATION_SIGNING_PROVIDER)
    const rawMode = cleanStr(env?.ATTESTATION_SIGNING_MODE).toUpperCase()
    const effectiveIsTestSigner =
      rawProvider === 'TEST_SIGNER' || rawMode === 'TEST_SIGNER'
    const effectiveIsProdKms =
      rawProvider === 'PRODUCTION_KMS_SIGNER' ||
      rawMode === 'PRODUCTION_KMS_SIGNER' ||
      rawMode === 'AWS_KMS' ||
      rawMode === 'GCP_KMS'

    if (
      rawProvider &&
      rawProvider !== 'TEST_SIGNER' &&
      rawProvider !== 'PRODUCTION_KMS_SIGNER'
    ) {
      issues.push({
        domain: 'KMS',
        severity: 'ERROR',
        code: 'ATTESTATION_SIGNING_PROVIDER_INVALID',
        field: 'ATTESTATION_SIGNING_PROVIDER',
        message: `ATTESTATION_SIGNING_PROVIDER='${rawProvider}' no soportado`,
      })
    } else if (!rawProvider && !rawMode) {
      issues.push({
        domain: 'KMS',
        severity: 'ERROR',
        code: 'ATTESTATION_SIGNING_PROVIDER_REQUIRED',
        field: 'ATTESTATION_SIGNING_PROVIDER',
        message:
          'Se requiere ATTESTATION_SIGNING_PROVIDER (TEST_SIGNER o PRODUCTION_KMS_SIGNER)',
      })
    } else if (
      rawProvider === 'TEST_SIGNER' &&
      (rawMode === 'AWS_KMS' ||
        rawMode === 'GCP_KMS' ||
        rawMode === 'PRODUCTION_KMS_SIGNER')
    ) {
      issues.push({
        domain: 'KMS',
        severity: 'ERROR',
        code: 'KMS_CONFIGURATION_CONFLICT',
        field: 'ATTESTATION_SIGNING_MODE',
        message: 'ATTESTATION_SIGNING_PROVIDER=TEST_SIGNER entra en conflicto con ATTESTATION_SIGNING_MODE',
      })
    }

    if (cleanStr(env?.NODE_ENV) === 'production' && effectiveIsTestSigner) {
      issues.push({
        domain: 'SECURITY',
        severity: 'ERROR',
        code: 'TEST_SIGNER_FORBIDDEN_WHEN_NODE_ENV_PRODUCTION',
        field: 'NODE_ENV',
        message: 'NODE_ENV=production prohíbe TEST_SIGNER',
      })
    }
    if (isProdOrStaging && effectiveIsTestSigner) {
      issues.push({
        domain: 'SECURITY',
        severity: 'ERROR',
        code: `TEST_SIGNER_FORBIDDEN_IN_${rawServiceEnv}`,
        field: 'ATTESTATION_SIGNING_PROVIDER',
        message: `El entorno '${rawServiceEnv}' prohíbe TEST_SIGNER`,
      })
    }

    if (effectiveIsProdKms) {
      if (
        kmsCfg.cloudProvider &&
        !['AWS_KMS', 'GCP_KMS', 'EXTERNAL_KMS', 'GENERIC_KMS'].includes(
          kmsCfg.cloudProvider
        )
      ) {
        issues.push({
          domain: 'KMS',
          severity: 'ERROR',
          code: 'ATTESTATION_KMS_PROVIDER_INVALID',
          field: 'ATTESTATION_KMS_PROVIDER',
          message: `Proveedor KMS '${kmsCfg.cloudProvider}' no soportado`,
        })
      }

      if (
        kmsCfg.cloudProvider === 'AWS_KMS' &&
        kmsCfg.awsSigningAlgorithm !== 'ED25519_SHA_512'
      ) {
        issues.push({
          domain: 'KMS',
          severity: 'ERROR',
          code: 'UNSUPPORTED_SIGNING_ALGORITHM',
          field: 'ATTESTATION_AWS_KMS_SIGNING_ALGORITHM',
          message: `Algoritmo AWS KMS '${kmsCfg.awsSigningAlgorithm}' no soportado; se requiere 'ED25519_SHA_512'`,
        })
      }

      if (!kmsCfg.keyVersionName) {
        missingRealTargets.push('ATTESTATION_KMS_KEY_VERSION_NAME')
      } else if (kmsCfg.cloudProvider === 'AWS_KMS') {
        const arnMatch = AWS_KMS_ARN_RE.exec(kmsCfg.keyVersionName)
        if (!arnMatch) {
          issues.push({
            domain: 'KMS',
            severity: 'ERROR',
            code: 'KMS_AWS_KEY_ARN_INVALID',
            field: 'ATTESTATION_KMS_KEY_VERSION_NAME',
            message:
              'ARN de clave AWS KMS inválido (se requiere arn:aws:kms:<region>:<account>:key/... o alias/...)',
          })
        } else if (kmsCfg.region && arnMatch[1] !== kmsCfg.region) {
          issues.push({
            domain: 'KMS',
            severity: 'ERROR',
            code: 'KMS_AWS_REGION_MISMATCH',
            field: 'ATTESTATION_AWS_REGION',
            message: `La región '${kmsCfg.region}' no coincide con la región del ARN '${arnMatch[1]}'`,
          })
        }
      } else if (kmsCfg.cloudProvider === 'GCP_KMS') {
        if (!GCP_KMS_KEY_VERSION_RE.test(kmsCfg.keyVersionName)) {
          issues.push({
            domain: 'KMS',
            severity: 'ERROR',
            code: 'KMS_GCP_KEY_VERSION_INVALID',
            field: 'ATTESTATION_KMS_KEY_VERSION_NAME',
            message:
              'CryptoKeyVersion GCP KMS inválido (projects/.../locations/.../keyRings/.../cryptoKeys/.../cryptoKeyVersions/...)',
          })
        }
      }

      if (!kmsCfg.publicKeySpki) {
        missingRealTargets.push('ATTESTATION_PUBLIC_KEY_SPKI')
      } else {
        try {
          const pubObj = crypto.createPublicKey(kmsCfg.publicKeySpki)
          if (pubObj.asymmetricKeyType !== 'ed25519') {
            issues.push({
              domain: 'KMS',
              severity: 'ERROR',
              code: 'KMS_PUBLIC_KEY_ALGORITHM_INVALID',
              field: 'ATTESTATION_PUBLIC_KEY_SPKI',
              message: `La clave pública KMS debe ser Ed25519 (recibido '${pubObj.asymmetricKeyType}')`,
            })
          } else {
            const derivedId = computeEd25519SpkiKeyId(kmsCfg.publicKeySpki)
            if (kmsCfg.keyId && kmsCfg.keyId.startsWith('ed25519-spki-') && kmsCfg.keyId !== derivedId) {
              issues.push({
                domain: 'KMS',
                severity: 'ERROR',
                code: 'KMS_KEY_ID_SPKI_MISMATCH',
                field: 'ATTESTATION_KMS_KEY_ID',
                message: `keyId '${kmsCfg.keyId}' no coincide con la huella SPKI '${derivedId}'`,
              })
            }
          }
        } catch {
          issues.push({
            domain: 'KMS',
            severity: 'ERROR',
            code: 'KMS_PUBLIC_KEY_INVALID',
            field: 'ATTESTATION_PUBLIC_KEY_SPKI',
            message: 'Clave pública SPKI Ed25519 inválida o no parseable',
          })
        }
      }

      if (!kmsCfg.keyId) {
        missingRealTargets.push('ATTESTATION_KMS_KEY_ID')
      }

      if (kmsCfg.kmsEndpoint) {
        try {
          assertSafeEndpointUrl(kmsCfg.kmsEndpoint, 'ATTESTATION_KMS_ENDPOINT', {
            allowInsecureLocalhost:
              !isProdOrStaging &&
              cleanStr(env?.ATTESTATION_KMS_ALLOW_INSECURE_LOCALHOST).toLowerCase() === 'true',
          })
        } catch (err) {
          issues.push({
            domain: 'KMS',
            severity: 'ERROR',
            code: 'KMS_ENDPOINT_INVALID',
            field: 'ATTESTATION_KMS_ENDPOINT',
            message: redactSensitiveConfigText(err?.message),
          })
        }
      }

      parseBoundedInt(env, 'ATTESTATION_KMS_TIMEOUT_MS', 100, 60000, issues)
    }
  }

  addCheck(
    'kms_signing_configuration',
    'SECURITY',
    !issues.some((i) => i.domain === 'KMS'),
    issues.find((i) => i.domain === 'KMS')?.code || 'OK',
    issues.find((i) => i.domain === 'KMS')?.message || 'Configuración KMS consistente'
  )

  // 4. Validación de separación de autoridades (GO Authority vs Attestation Authority)
  const goSpki = cleanStr(env?.ATTESTATION_GO_PUBLIC_KEY_SPKI).replace(
    /\\n/g,
    '\n'
  )
  const goKeyId = cleanStr(env?.ATTESTATION_GO_KEY_ID)
  const goAuthorityId = cleanStr(env?.ATTESTATION_GO_AUTHORITY_ID)
  const effectiveAuthorityId =
    cleanStr(env?.ATTESTATION_AUTHORITY_ID) ||
    (cleanStr(env?.ATTESTATION_SIGNING_PROVIDER) === 'PRODUCTION_KMS_SIGNER'
      ? 'kioskopos-independent-attestation-authority-prod'
      : 'test-independent-attestation-authority-v1')

  if (
    goAuthorityId &&
    goAuthorityId.toLowerCase() === effectiveAuthorityId.toLowerCase()
  ) {
    issues.push({
      domain: 'AUTHORITY_SEPARATION',
      severity: 'ERROR',
      code: 'COLLAPSED_AUTHORITIES_REJECTED',
      field: 'ATTESTATION_GO_AUTHORITY_ID',
      message: 'ATTESTATION_GO_AUTHORITY_ID colapsa con ATTESTATION_AUTHORITY_ID',
    })
  }
  if (
    goKeyId &&
    kmsCfg?.keyId &&
    goKeyId.toLowerCase() === kmsCfg.keyId.toLowerCase()
  ) {
    issues.push({
      domain: 'AUTHORITY_SEPARATION',
      severity: 'ERROR',
      code: 'COLLAPSED_AUTHORITIES_REJECTED',
      field: 'ATTESTATION_GO_KEY_ID',
      message: 'ATTESTATION_GO_KEY_ID colapsa con keyId de atestación',
    })
  }
  if (!goSpki) {
    if (effectiveProtected || requireSignedGoGrantFlag.value) {
      missingRealTargets.push('ATTESTATION_GO_PUBLIC_KEY_SPKI')
    }
  } else {
    try {
      const derivedGoId = computeEd25519SpkiKeyId(goSpki)
      if (goKeyId && goKeyId !== derivedGoId) {
        issues.push({
          domain: 'AUTHORITY_SEPARATION',
          severity: 'ERROR',
          code: 'GO_AUTHORIZATION_KEY_ID_MISMATCH',
          field: 'ATTESTATION_GO_KEY_ID',
          message: `ATTESTATION_GO_KEY_ID '${goKeyId}' no coincide con ATTESTATION_GO_PUBLIC_KEY_SPKI (${derivedGoId})`,
        })
      }
      if (
        kmsCfg?.publicKeySpki &&
        goSpki.replace(/[\r\n\s]/g, '') ===
          kmsCfg.publicKeySpki.replace(/[\r\n\s]/g, '')
      ) {
        issues.push({
          domain: 'AUTHORITY_SEPARATION',
          severity: 'ERROR',
          code: 'COLLAPSED_AUTHORITIES_REJECTED',
          field: 'ATTESTATION_GO_PUBLIC_KEY_SPKI',
          message: 'Clave pública GO y clave pública KMS colapsan en la misma clave',
        })
      }
    } catch (err) {
      issues.push({
        domain: 'AUTHORITY_SEPARATION',
        severity: 'ERROR',
        code: 'GO_PUBLIC_KEY_INVALID',
        field: 'ATTESTATION_GO_PUBLIC_KEY_SPKI',
        message: redactSensitiveConfigText(err?.message),
      })
    }
  }

  addCheck(
    'authority_separation',
    'SECURITY',
    !issues.some((i) => i.domain === 'AUTHORITY_SEPARATION'),
    issues.find((i) => i.domain === 'AUTHORITY_SEPARATION')?.code || 'OK',
    issues.find((i) => i.domain === 'AUTHORITY_SEPARATION')?.message ||
      'Separación criptográfica GO Authority vs Attestation Authority verificada'
  )

  // 5. Validación de Anti-Replay y PostgreSQL / DynamoDB
  const antiReplay = resolveAntiReplaySelection(env)
  if (antiReplay.storageType === 'INVALID') {
    issues.push({
      domain: 'ANTI_REPLAY',
      severity: 'ERROR',
      code: 'ATTESTATION_ANTI_REPLAY_BACKEND_INVALID',
      field: 'ATTESTATION_ANTI_REPLAY_MODE',
      message: `Backend anti-replay '${antiReplay.rawMode}' no reconocido`,
    })
  } else if (isProdOrStaging && antiReplay.storageType === 'memory') {
    issues.push({
      domain: 'ANTI_REPLAY',
      severity: 'ERROR',
      code: 'DURABLE_ANTI_REPLAY_REQUIRED',
      field: 'ATTESTATION_ANTI_REPLAY_MODE',
      message: `El entorno '${rawServiceEnv}' prohíbe anti-replay en memoria volátil`,
    })
  }

  parseBoundedInt(env, 'ATTESTATION_RESERVATION_LEASE_TTL_MS', 1000, 3600000, issues)

  if (antiReplay.storageType === 'distributed') {
    if (antiReplay.distributedProvider === 'AMBIGUOUS') {
      issues.push({
        domain: 'ANTI_REPLAY',
        severity: 'ERROR',
        code: 'ANTI_REPLAY_PROVIDER_AMBIGUOUS',
        field: 'ATTESTATION_ANTI_REPLAY_PROVIDER',
        message:
          'Se configuraron variables PostgreSQL y DynamoDB simultáneamente sin definir ATTESTATION_ANTI_REPLAY_PROVIDER',
      })
    } else if (antiReplay.distributedProvider === 'UNCONFIGURED') {
      missingRealTargets.push('ATTESTATION_DISTRIBUTED_ANTI_REPLAY_BACKEND')
    } else if (antiReplay.distributedProvider === 'POSTGRESQL') {
      if (!antiReplay.hasPgUrl) {
        missingRealTargets.push('ATTESTATION_POSTGRES_URL')
      } else {
        if (isProdOrStaging && allowInsecurePgLocalFlag.value) {
          issues.push({
            domain: 'ANTI_REPLAY',
            severity: 'ERROR',
            code: 'POSTGRES_INSECURE_OVERRIDE_FORBIDDEN',
            field: 'ATTESTATION_POSTGRES_ALLOW_INSECURE_LOCALHOST',
            message: `Prohibido ATTESTATION_POSTGRES_ALLOW_INSECURE_LOCALHOST=true en '${rawServiceEnv}'`,
          })
        }
        try {
          const urlMeta = assertDedicatedPostgresUrl(
            String(env?.ATTESTATION_POSTGRES_URL || ''),
            {
              allowInsecureLocalhost:
                !isProdOrStaging && allowInsecurePgLocalFlag.value,
            }
          )
          if (!urlMeta.isLocal && urlMeta.sslMode === 'require') {
            warnings.push(
              'POSTGRES_SSLMODE_VERIFY_FULL_RECOMMENDED: Se recomienda sslmode=verify-full con CA dedicada en lugar de sslmode=require'
            )
          }
        } catch (err) {
          issues.push({
            domain: 'ANTI_REPLAY',
            severity: 'ERROR',
            code: String(err?.message || 'POSTGRES_URL_INVALID').split(':')[0],
            field: 'ATTESTATION_POSTGRES_URL',
            message: redactSensitiveConfigText(err?.message),
          })
        }
      }
      const pgTable = cleanStr(env?.ATTESTATION_POSTGRES_TABLE)
      if (pgTable && !PG_TABLE_RE.test(pgTable)) {
        issues.push({
          domain: 'ANTI_REPLAY',
          severity: 'ERROR',
          code: 'POSTGRES_ANTI_REPLAY_INVALID_TABLE_NAME',
          field: 'ATTESTATION_POSTGRES_TABLE',
          message: `Nombre de tabla PostgreSQL inválido '${pgTable}'`,
        })
      }
      parseBoundedInt(env, 'ATTESTATION_POSTGRES_QUERY_TIMEOUT_MS', 100, 60000, issues)
      parseBoundedInt(env, 'ATTESTATION_POSTGRES_STATEMENT_TIMEOUT_MS', 100, 60000, issues)
      parseBoundedInt(env, 'ATTESTATION_POSTGRES_POOL_MAX', 1, 200, issues)
      const isoLevel = cleanStr(env?.ATTESTATION_POSTGRES_ISOLATION_LEVEL).toUpperCase()
      if (isoLevel && !ALLOWED_POSTGRES_ISOLATION_LEVELS.includes(isoLevel)) {
        issues.push({
          domain: 'ANTI_REPLAY',
          severity: 'ERROR',
          code: 'POSTGRES_ANTI_REPLAY_INVALID_ISOLATION_LEVEL',
          field: 'ATTESTATION_POSTGRES_ISOLATION_LEVEL',
          message: `Nivel de aislamiento PostgreSQL no permitido '${isoLevel}'`,
        })
      }
      if (cleanStr(env?.ATTESTATION_POSTGRES_SSL_CA_PEM)) {
        validateCertificatePem(
          env.ATTESTATION_POSTGRES_SSL_CA_PEM,
          'ATTESTATION_POSTGRES_SSL_CA_PEM',
          issues
        )
      }
    } else if (antiReplay.distributedProvider === 'DYNAMODB') {
      const ddbTable = cleanStr(env?.ATTESTATION_DYNAMODB_TABLE)
      const awsRegion = cleanStr(env?.ATTESTATION_AWS_REGION || env?.AWS_REGION)
      if (!ddbTable) {
        missingRealTargets.push('ATTESTATION_DYNAMODB_TABLE')
      } else if (!DDB_TABLE_RE.test(ddbTable)) {
        issues.push({
          domain: 'ANTI_REPLAY',
          severity: 'ERROR',
          code: 'DYNAMODB_INVALID_TABLE_NAME',
          field: 'ATTESTATION_DYNAMODB_TABLE',
          message: `Nombre de tabla DynamoDB inválido '${ddbTable}'`,
        })
      }
      if (!awsRegion) {
        missingRealTargets.push('ATTESTATION_AWS_REGION')
      } else if (!AWS_REGION_RE.test(awsRegion)) {
        issues.push({
          domain: 'ANTI_REPLAY',
          severity: 'ERROR',
          code: 'DYNAMODB_REGION_INVALID',
          field: 'ATTESTATION_AWS_REGION',
          message: `Región AWS DynamoDB inválida '${awsRegion}'`,
        })
      }
      const ddbEndpoint = cleanStr(env?.ATTESTATION_DYNAMODB_ENDPOINT)
      if (ddbEndpoint) {
        try {
          assertSafeEndpointUrl(ddbEndpoint, 'ATTESTATION_DYNAMODB_ENDPOINT', {
            allowInsecureLocalhost:
              !isProdOrStaging &&
              cleanStr(env?.ATTESTATION_DYNAMODB_ALLOW_INSECURE_LOCALHOST).toLowerCase() === 'true',
          })
        } catch (err) {
          issues.push({
            domain: 'ANTI_REPLAY',
            severity: 'ERROR',
            code: 'DYNAMODB_ENDPOINT_INVALID',
            field: 'ATTESTATION_DYNAMODB_ENDPOINT',
            message: redactSensitiveConfigText(err?.message),
          })
        }
      }
      parseBoundedInt(env, 'ATTESTATION_DYNAMODB_TIMEOUT_MS', 100, 60000, issues)
      parseBoundedInt(
        env,
        'ATTESTATION_DYNAMODB_RETENTION_TTL_SECONDS',
        60,
        315360000,
        issues
      )
    } else {
      issues.push({
        domain: 'ANTI_REPLAY',
        severity: 'ERROR',
        code: 'ANTI_REPLAY_PROVIDER_INVALID',
        field: 'ATTESTATION_ANTI_REPLAY_PROVIDER',
        message: `Proveedor anti-replay distribuido '${antiReplay.distributedProvider}' inválido`,
      })
    }
  }

  addCheck(
    'anti_replay_configuration',
    'SECURITY',
    !issues.some((i) => i.domain === 'ANTI_REPLAY'),
    issues.find((i) => i.domain === 'ANTI_REPLAY')?.code || 'OK',
    issues.find((i) => i.domain === 'ANTI_REPLAY')?.message ||
      `Anti-replay '${antiReplay.storageType}' validado`
  )

  // 6. Validación de Client Auth (OIDC/JWT & mTLS) y transporte TLS
  const authMode = cleanStr(env?.ATTESTATION_CLIENT_AUTH_MODE).toUpperCase()
  if (
    authMode &&
    !['SIMULATED_TEST_ONLY', 'INJECTED_VERIFIER', 'OIDC_JWT', 'MTLS'].includes(
      authMode
    )
  ) {
    issues.push({
      domain: 'AUTH',
      severity: 'ERROR',
      code: 'ATTESTATION_CLIENT_AUTH_MODE_INVALID',
      field: 'ATTESTATION_CLIENT_AUTH_MODE',
      message: `Modo clientAuth '${authMode}' inválido`,
    })
  } else if (isProdOrStaging && authMode === 'SIMULATED_TEST_ONLY') {
    issues.push({
      domain: 'AUTH',
      severity: 'ERROR',
      code: `SIMULATED_CLIENT_AUTH_FORBIDDEN_IN_${rawServiceEnv}`,
      field: 'ATTESTATION_CLIENT_AUTH_MODE',
      message: `El entorno '${rawServiceEnv}' prohíbe autenticación simulada`,
    })
  } else if (!authMode && effectiveProtected) {
    missingRealTargets.push('ATTESTATION_CLIENT_AUTH_MODE')
  }

  if (authMode === 'OIDC_JWT') {
    if (isProdOrStaging && allowInsecureOidcLocalFlag.value) {
      issues.push({
        domain: 'AUTH',
        severity: 'ERROR',
        code: 'OIDC_INSECURE_OVERRIDE_FORBIDDEN',
        field: 'ATTESTATION_OIDC_ALLOW_INSECURE_LOCALHOST',
        message: `Prohibido ATTESTATION_OIDC_ALLOW_INSECURE_LOCALHOST=true en '${rawServiceEnv}'`,
      })
    }

    let issuers = []
    let audiences = []
    try {
      issuers = parseListSafe(env?.ATTESTATION_OIDC_ISSUER)
    } catch (err) {
      issues.push({
        domain: 'AUTH',
        severity: 'ERROR',
        code: 'OIDC_CONFIG_INVALID',
        field: 'ATTESTATION_OIDC_ISSUER',
        message: redactSensitiveConfigText(err?.message),
      })
    }
    try {
      audiences = parseListSafe(env?.ATTESTATION_OIDC_AUDIENCE)
    } catch (err) {
      issues.push({
        domain: 'AUTH',
        severity: 'ERROR',
        code: 'OIDC_CONFIG_INVALID',
        field: 'ATTESTATION_OIDC_AUDIENCE',
        message: redactSensitiveConfigText(err?.message),
      })
    }

    if (issuers.length === 0) missingRealTargets.push('ATTESTATION_OIDC_ISSUER')
    for (const iss of issuers) {
      try {
        const parsedIss = new URL(iss)
        const issProto = parsedIss.protocol.toLowerCase()
        if (issProto !== 'https:') {
          const isLocalIss = ['localhost', '127.0.0.1', '[::1]'].includes(
            parsedIss.hostname.toLowerCase()
          )
          if (
            !(
              issProto === 'http:' &&
              isLocalIss &&
              allowInsecureOidcLocalFlag.value &&
              !isProdOrStaging
            )
          ) {
            issues.push({
              domain: 'AUTH',
              severity: 'ERROR',
              code: 'OIDC_ISSUER_TLS_REQUIRED',
              field: 'ATTESTATION_OIDC_ISSUER',
              message: `Issuer OIDC '${iss}' debe usar HTTPS`,
            })
          }
        }
      } catch {
        if (
          iss.toLowerCase().startsWith('http://') &&
          (!allowInsecureOidcLocalFlag.value || isProdOrStaging)
        ) {
          issues.push({
            domain: 'AUTH',
            severity: 'ERROR',
            code: 'OIDC_ISSUER_TLS_REQUIRED',
            field: 'ATTESTATION_OIDC_ISSUER',
            message: `Issuer OIDC '${iss}' debe usar HTTPS`,
          })
        }
      }
    }
    if (audiences.length === 0) missingRealTargets.push('ATTESTATION_OIDC_AUDIENCE')

    let allowedJwksHosts = []
    try {
      allowedJwksHosts = parseListSafe(env?.ATTESTATION_OIDC_ALLOWED_JWKS_HOSTS)
        .map((h) => normalizeNetworkHostname(h))
        .filter(Boolean)
    } catch (err) {
      issues.push({
        domain: 'AUTH',
        severity: 'ERROR',
        code: 'OIDC_CONFIG_INVALID',
        field: 'ATTESTATION_OIDC_ALLOWED_JWKS_HOSTS',
        message: redactSensitiveConfigText(err?.message),
      })
    }

    const jwksUri = cleanStr(env?.ATTESTATION_OIDC_JWKS_URI)
    const jwksJson = cleanStr(env?.ATTESTATION_OIDC_JWKS_JSON)
    if (!jwksUri && !jwksJson) {
      missingRealTargets.push('ATTESTATION_OIDC_JWKS_URI')
    }
    if (jwksUri) {
      try {
        assertSafeEndpointUrl(jwksUri, 'ATTESTATION_OIDC_JWKS_URI', {
          allowInsecureLocalhost: allowInsecureOidcLocalFlag.value && !isProdOrStaging,
          allowedHosts: allowedJwksHosts.length > 0 ? allowedJwksHosts : undefined,
        })
      } catch (err) {
        const msg = redactSensitiveConfigText(err?.message || 'ATTESTATION_OIDC_JWKS_URI inválido')
        const code = msg.includes('REAL_INTEGRATION_FORBIDDEN_HOST')
          ? 'OIDC_FORBIDDEN_JWKS_HOST'
          : msg.includes('REAL_INTEGRATION_TLS_REQUIRED')
            ? 'OIDC_INSECURE_JWKS_URI_FORBIDDEN'
            : 'OIDC_CONFIG_INVALID'
        issues.push({
          domain: 'AUTH',
          severity: 'ERROR',
          code,
          field: 'ATTESTATION_OIDC_JWKS_URI',
          message: msg,
        })
      }
    }
    if (jwksJson) {
      try {
        const parsed = safeParseStrictJson(jwksJson)
        if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) {
          issues.push({
            domain: 'AUTH',
            severity: 'ERROR',
            code: 'OIDC_JWKS_INVALID',
            field: 'ATTESTATION_OIDC_JWKS_JSON',
            message: 'ATTESTATION_OIDC_JWKS_JSON debe definir arreglo keys[] no vacío',
          })
        } else if (parsed.keys.some((k) => k?.kty === 'oct')) {
          issues.push({
            domain: 'AUTH',
            severity: 'ERROR',
            code: 'OIDC_ALGORITHM_REJECTED',
            field: 'ATTESTATION_OIDC_JWKS_JSON',
            message: 'Claves simétricas JWK (kty=oct) prohibidas',
          })
        }
      } catch {
        issues.push({
          domain: 'AUTH',
          severity: 'ERROR',
          code: 'OIDC_JWKS_INVALID',
          field: 'ATTESTATION_OIDC_JWKS_JSON',
          message: 'JSON inválido en ATTESTATION_OIDC_JWKS_JSON',
        })
      }
    }

    try {
      const algs = parseListSafe(env?.ATTESTATION_OIDC_ALLOWED_ALGORITHMS)
      for (const alg of algs) {
        if (!OIDC_ALLOWED_ALGORITHMS.includes(alg)) {
          issues.push({
            domain: 'AUTH',
            severity: 'ERROR',
            code: 'OIDC_ALGORITHM_REJECTED',
            field: 'ATTESTATION_OIDC_ALLOWED_ALGORITHMS',
            message: `Algoritmo JWT '${alg}' prohibido; permitidos: ${OIDC_ALLOWED_ALGORITHMS.join(', ')}`,
          })
        }
      }
    } catch (err) {
      issues.push({
        domain: 'AUTH',
        severity: 'ERROR',
        code: 'OIDC_CONFIG_INVALID',
        field: 'ATTESTATION_OIDC_ALLOWED_ALGORITHMS',
        message: redactSensitiveConfigText(err?.message),
      })
    }
  } else if (authMode === 'MTLS') {
    const caPem = cleanStr(env?.ATTESTATION_MTLS_TRUSTED_CA_PEM)
    if (!caPem) {
      missingRealTargets.push('ATTESTATION_MTLS_TRUSTED_CA_PEM')
    } else {
      validateCertificatePem(caPem, 'ATTESTATION_MTLS_TRUSTED_CA_PEM', issues)
    }
    const rawClients = cleanStr(env?.ATTESTATION_MTLS_TRUSTED_CLIENTS_JSON)
    if (!rawClients) {
      missingRealTargets.push('ATTESTATION_MTLS_TRUSTED_CLIENTS_JSON')
    } else {
      try {
        const wrapped = safeParseStrictJson(`{"items":${rawClients}}`)
        if (!Array.isArray(wrapped.items) || wrapped.items.length === 0) {
          issues.push({
            domain: 'AUTH',
            severity: 'ERROR',
            code: 'CLIENT_AUTH_MTLS_CONFIG_INVALID',
            field: 'ATTESTATION_MTLS_TRUSTED_CLIENTS_JSON',
            message: 'ATTESTATION_MTLS_TRUSTED_CLIENTS_JSON debe ser un arreglo no vacío',
          })
        } else {
          for (const clientEntry of wrapped.items) {
            const hasAllowedScopes =
              Array.isArray(clientEntry?.allowedScopes) &&
              clientEntry.allowedScopes.some((s) => typeof s === 'string' && s.trim())
            const sanDns = Array.isArray(clientEntry?.sanDnsNames)
              ? clientEntry.sanDnsNames.filter((s) => typeof s === 'string' && s.trim())
              : []
            const sanUris = Array.isArray(clientEntry?.sanUris)
              ? clientEntry.sanUris.filter((s) => typeof s === 'string' && s.trim())
              : []
            const subjectSan = cleanStr(clientEntry?.subjectAltName)
            const subjectCn = cleanStr(clientEntry?.subjectCN || clientEntry?.commonName)
            const hasPin =
              cleanStr(clientEntry?.sha256Fingerprint) ||
              subjectCn ||
              subjectSan ||
              sanDns.length > 0 ||
              sanUris.length > 0
            const hasUnsafeWildcard =
              subjectCn.includes('*') ||
              subjectSan.includes('*') ||
              subjectSan.includes(',') ||
              sanDns.some((d) => d.includes('*') || d.includes(',') || /\s/.test(d)) ||
              sanUris.some((u) => u.includes(',') || /\s/.test(u))
            if (!clientEntry?.clientId || !hasAllowedScopes || !hasPin || hasUnsafeWildcard) {
              issues.push({
                domain: 'AUTH',
                severity: 'ERROR',
                code: 'CLIENT_AUTH_MTLS_CONFIG_INVALID',
                field: 'ATTESTATION_MTLS_TRUSTED_CLIENTS_JSON',
                message:
                  'Cada entrada mTLS requiere clientId, allowedScopes[] y al menos sha256Fingerprint / subjectCN / commonName / SAN sin wildcards ni comas',
              })
            }
          }
        }
      } catch {
        issues.push({
          domain: 'AUTH',
          severity: 'ERROR',
          code: 'CLIENT_AUTH_MTLS_CONFIG_INVALID',
          field: 'ATTESTATION_MTLS_TRUSTED_CLIENTS_JSON',
          message: 'JSON inválido en ATTESTATION_MTLS_TRUSTED_CLIENTS_JSON',
        })
      }
    }
  }

  if (
    isProdOrStaging &&
    !requireHttpsFlag.value &&
    !tlsRequiredFlag.value &&
    !trustProxyHttpsFlag.value
  ) {
    warnings.push(
      'TLS_TERMINATION_EXPLICIT_FLAG_RECOMMENDED: En STAGING/PRODUCTION declare ATTESTATION_REQUIRE_HTTPS=true o ATTESTATION_TRUST_PROXY_HTTPS=true explícitamente'
    )
  }

  addCheck(
    'client_auth_and_tls',
    'SECURITY',
    !issues.some((i) => i.domain === 'AUTH'),
    issues.find((i) => i.domain === 'AUTH')?.code || 'OK',
    issues.find((i) => i.domain === 'AUTH')?.message ||
      `Modo auth '${authMode || 'UNSET'}' validado`
  )

  // 7. HTTP Guardrails
  parseBoundedInt(env, 'ATTESTATION_SERVICE_PORT', 1, 65535, issues)
  parseBoundedInt(env, 'PORT', 1, 65535, issues)
  parseBoundedInt(env, 'ATTESTATION_MAX_BODY_BYTES', 1024, 10485760, issues)

  const hasErrors = issues.length > 0
  const hasMissing = missingRealTargets.length > 0
  const complete = !hasErrors && !hasMissing

  const strictCompleteCheck =
    options.requireCompleteForEnv !== false ? !hasMissing : true
  const status =
    hasErrors || !strictCompleteCheck
      ? PREFLIGHT_STATUSES.CONFIGURATION_INVALID
      : PREFLIGHT_STATUSES.CONFIGURATION_VALID

  return Object.freeze({
    status,
    valid: status === PREFLIGHT_STATUSES.CONFIGURATION_VALID,
    syntaxValid: !issues.some((i) => i.domain === 'SYNTAX' || i.domain === 'ENVIRONMENT'),
    securityPostureValid: !issues.some(
      (i) =>
        i.domain === 'SECURITY' ||
        i.domain === 'AUTHORITY_SEPARATION' ||
        i.domain === 'KMS' ||
        i.domain === 'ANTI_REPLAY' ||
        i.domain === 'AUTH'
    ),
    complete,
    realIntegrationEnabled: realEnabledFlag.value,
    realIntegrationDryRun: dryRunFlag.value,
    issues: Object.freeze(
      issues.map((i) =>
        Object.freeze({
          ...i,
          message: redactSensitiveConfigText(i.message),
        })
      )
    ),
    warnings: Object.freeze([...warnings]),
    missingTargets: Object.freeze([...new Set(missingRealTargets)]),
    checks: Object.freeze(checks),
    fingerprint: buildSafeConfigurationFingerprint(env),
  })
}

/**
 * Capa centralizada de Preflight de Infraestructura Real.
 * Separa explícitamente:
 * - validez sintáctica y postura de seguridad (`CONFIGURATION_VALID` / `CONFIGURATION_INVALID`)
 * - opt-in deshabilitado (`REAL_INTEGRATION_DISABLED`)
 * - opt-in habilitado sin targets completos (`REAL_INTEGRATION_NOT_CONFIGURED`)
 * - listo únicamente para pruebas controladas (`REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST`)
 * NUNCA promueve conectividad ni configuración sintáctica a `PRODUCTION_VALIDATED`.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{ checkAmbientFiscalVars?: boolean }} [options]
 */
export function runInfrastructurePreflight(env = process.env, options = {}) {
  const validation = validateInfrastructureConfiguration(env, {
    requireCompleteForEnv: false,
    checkAmbientFiscalVars: options.checkAmbientFiscalVars,
  })

  const hasSyntaxOrSecurityErrors = validation.issues.length > 0
  const realEnabled = isRealIntegrationEnabled(env)
  const dryRun = isRealIntegrationDryRun(env)
  const antiReplay = resolveAntiReplaySelection(env)
  const authMode = cleanStr(env?.ATTESTATION_CLIENT_AUTH_MODE).toUpperCase()
  const kmsCfg = (() => {
    try {
      return resolveKmsEnvConfig(env)
    } catch {
      return null
    }
  })()

  let configuredRealComponentCount = 0
  if (
    antiReplay.storageType === 'distributed' &&
    ((antiReplay.distributedProvider === 'POSTGRESQL' && antiReplay.hasPgUrl) ||
      (antiReplay.distributedProvider === 'DYNAMODB' &&
        cleanStr(env?.ATTESTATION_DYNAMODB_TABLE).length > 0))
  ) {
    configuredRealComponentCount += 1
  }
  if (
    kmsCfg &&
    kmsCfg.keyVersionName &&
    kmsCfg.publicKeySpki &&
    kmsCfg.keyId
  ) {
    configuredRealComponentCount += 1
  }
  if (
    (authMode === 'OIDC_JWT' &&
      cleanStr(env?.ATTESTATION_OIDC_JWKS_URI).length > 0) ||
    (authMode === 'MTLS' &&
      cleanStr(env?.ATTESTATION_MTLS_TRUSTED_CA_PEM).length > 0)
  ) {
    configuredRealComponentCount += 1
  }

  const effectiveMissingTargets =
    realEnabled &&
    !hasSyntaxOrSecurityErrors &&
    validation.missingTargets.length === 0 &&
    configuredRealComponentCount === 0
      ? Object.freeze(['REAL_INTEGRATION_TARGET_REQUIRED'])
      : validation.missingTargets

  let status
  if (hasSyntaxOrSecurityErrors) {
    status = PREFLIGHT_STATUSES.CONFIGURATION_INVALID
  } else if (!realEnabled) {
    status = PREFLIGHT_STATUSES.REAL_INTEGRATION_DISABLED
  } else if (effectiveMissingTargets.length > 0) {
    status = PREFLIGHT_STATUSES.REAL_INTEGRATION_NOT_CONFIGURED
  } else {
    status = PREFLIGHT_STATUSES.REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST
  }

  return Object.freeze({
    status,
    configurationStatus: hasSyntaxOrSecurityErrors
      ? PREFLIGHT_STATUSES.CONFIGURATION_INVALID
      : PREFLIGHT_STATUSES.CONFIGURATION_VALID,
    syntaxValid: validation.syntaxValid,
    securityPostureValid: validation.securityPostureValid,
    realIntegrationEnabled: realEnabled,
    realIntegrationDryRun: dryRun,
    readyForControlledTest:
      status === PREFLIGHT_STATUSES.REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST,
    connectivityTested: false,
    healthVerified: false,
    realIntegrationTested: false,
    productionValidated: false,
    productionApproved: false,
    readyForProduction: false,
    maturityState: MATURITY_STATES.LOCAL_TESTED,
    maturityFlags: DEFAULT_MATURITY_FLAGS,
    issues: validation.issues,
    warnings: validation.warnings,
    missingTargets: effectiveMissingTargets,
    checks: validation.checks,
    fingerprint: validation.fingerprint,
  })
}

/**
 * Valida transiciones de la máquina de fases controlada de integración real (PHASE_0..PHASE_6).
 * Prohíbe saltos directos (ej. PHASE_0 -> PHASE_6) sin completar fases previas y exige opt-in explícito por fase.
 *
 * @param {{
 *   targetPhase: string,
 *   completedPhases?: readonly string[],
 *   env?: Record<string, string | undefined>,
 *   preflightResult?: ReturnType<typeof runInfrastructurePreflight>,
 *   governanceManualSignOff?: boolean
 * }} params
 */
export function evaluateIntegrationPhaseGate(params) {
  const {
    targetPhase,
    completedPhases = [],
    env = process.env,
    preflightResult,
    governanceManualSignOff = false,
    governanceGrant,
    trustedGoPublicKeySpki,
    trustedGoKeyId,
    trustedGoAuthorityId,
    expectedProjectRef,
    expectedCommitSha,
    now,
  } = params || {}

  const targetIdx = INTEGRATION_PHASE_ORDER.indexOf(targetPhase)
  if (targetIdx < 0) {
    throw new Error(
      `INVALID_INTEGRATION_PHASE: Fase '${targetPhase}' no reconocida`
    )
  }

  if (!Array.isArray(completedPhases)) {
    throw new Error(
      'INVALID_INTEGRATION_PHASE: completedPhases debe ser un arreglo de fases'
    )
  }
  for (const phase of completedPhases) {
    if (!INTEGRATION_PHASE_ORDER.includes(phase)) {
      throw new Error(
        `INVALID_INTEGRATION_PHASE: Fase completada desconocida '${String(phase)}'`
      )
    }
  }

  const envPhaseRaw = cleanStr(env?.ATTESTATION_INTEGRATION_PHASE)
  if (envPhaseRaw) {
    const envPhaseIdx = INTEGRATION_PHASE_ORDER.indexOf(envPhaseRaw)
    if (envPhaseIdx < 0) {
      throw new Error(
        `INVALID_INTEGRATION_PHASE: ATTESTATION_INTEGRATION_PHASE '${envPhaseRaw}' no reconocida`
      )
    }
    if (envPhaseIdx > targetIdx) {
      throw new Error(
        `PHASE_ESCALATION_FORBIDDEN: ATTESTATION_INTEGRATION_PHASE='${envPhaseRaw}' excede targetPhase '${targetPhase}'`
      )
    }
  }

  const preflight = runInfrastructurePreflight(env)
  if (preflightResult !== undefined && preflightResult !== null) {
    if (
      typeof preflightResult !== 'object' ||
      preflightResult.status !== preflight.status ||
      preflightResult.configurationStatus !== preflight.configurationStatus ||
      preflightResult.fingerprint?.configFingerprintSha256 !==
        preflight.fingerprint?.configFingerprintSha256
    ) {
      throw new Error(
        'PHASE_PRECONDITION_FAILED: preflightResult provisto no coincide con la verificación real del entorno'
      )
    }
  }
  if (preflight.configurationStatus !== PREFLIGHT_STATUSES.CONFIGURATION_VALID) {
    throw new Error(
      `PHASE_PRECONDITION_FAILED: Preflight reporta '${preflight.status}' (${preflight.issues[0]?.code || 'CONFIGURATION_INVALID'})`
    )
  }

  const completedSet = new Set(completedPhases)
  const missingPrerequisites = INTEGRATION_PHASE_ORDER.slice(0, targetIdx).filter(
    (phase) => !completedSet.has(phase)
  )
  if (missingPrerequisites.length > 0) {
    throw new Error(
      `PHASE_ESCALATION_FORBIDDEN: Prohibido avanzar a '${targetPhase}' sin completar fases previas [${missingPrerequisites.join(', ')}]`
    )
  }

  const requiredOptInVar = PHASE_REQUIRED_OPT_IN_ENV[targetPhase]
  if (requiredOptInVar) {
    const optInVal = cleanStr(env?.[requiredOptInVar]).toLowerCase()
    if (optInVal !== 'true') {
      throw new Error(
        `PHASE_OPT_IN_REQUIRED: La fase '${targetPhase}' exige opt-in explícito '${requiredOptInVar}=true'`
      )
    }
  }

  if (
    targetIdx >= 1 &&
    preflight.status !== PREFLIGHT_STATUSES.REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST
  ) {
    throw new Error(
      `PHASE_PRECONDITION_FAILED: La fase '${targetPhase}' requiere estado '${PREFLIGHT_STATUSES.REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST}', actual '${preflight.status}'`
    )
  }

  if (targetPhase === INTEGRATION_PHASES.PHASE_6_DEPLOYMENT_CANDIDATE) {
    if (governanceManualSignOff !== true && !governanceGrant) {
      throw new Error(
        'PHASE_GOVERNANCE_APPROVAL_REQUIRED: PHASE_6_DEPLOYMENT_CANDIDATE requiere aprobación manual de gobernanza (nunca auto-promocionable)'
      )
    }
    if (!governanceGrant) {
      throw new Error(
        'PHASE_GOVERNANCE_CRYPTOGRAPHIC_APPROVAL_REQUIRED: Un boolean governanceManualSignOff no sustituye un governanceGrant GO v1.1 firmado y verificable'
      )
    }
    const resolvedGoSpki =
      trustedGoPublicKeySpki || cleanStr(env?.ATTESTATION_GO_PUBLIC_KEY_SPKI)
    verifyGoAuthorizationGrant(governanceGrant, {
      trustedGoPublicKeySpki: resolvedGoSpki,
      trustedGoKeyId:
        trustedGoKeyId !== undefined
          ? trustedGoKeyId
          : cleanStr(env?.ATTESTATION_GO_KEY_ID) || null,
      trustedGoAuthorityId:
        trustedGoAuthorityId !== undefined
          ? trustedGoAuthorityId
          : cleanStr(env?.ATTESTATION_GO_AUTHORITY_ID) || null,
      expectedProjectRef: expectedProjectRef ?? null,
      expectedCommitSha: expectedCommitSha ?? null,
      now,
    })
  }

  return Object.freeze({
    allowed: true,
    targetPhase,
    requiredOptInVar,
    verifiedPrerequisites: Object.freeze(
      INTEGRATION_PHASE_ORDER.slice(0, targetIdx)
    ),
    productionApproved: false,
    productionValidated: false,
    p1ImportAllowed: false,
    remoteGo: 'DENIED',
  })
}

/**
 * Evalúa honestamente el nivel de madurez observado e impide auto-promociones
 * hacia `PRODUCTION_VALIDATED` desde booleanos del llamador, pruebas locales o simulaciones.
 *
 * @param {{
 *   unitTestsPassed?: boolean,
 *   localRuntimeTested?: boolean,
 *   multiNodeSimulated?: boolean,
 *   realConnectivityPassed?: boolean,
 *   realIntegrationPassed?: boolean,
 *   externalGovernanceAccredited?: boolean
 * }} [evidence]
 */
export function evaluateMaturityState(evidence = {}) {
  if (evidence && typeof evidence === 'object') {
    if (evidence.multiNodeSimulated === true) {
      return Object.freeze({
        state: MATURITY_STATES.SIMULATION_TESTED,
        realInfrastructureValidated: false,
        productionValidated: false,
        autoPromotionBlocked: true,
      })
    }
    if (evidence.localRuntimeTested === true) {
      return Object.freeze({
        state: MATURITY_STATES.LOCAL_TESTED,
        realInfrastructureValidated: false,
        productionValidated: false,
        autoPromotionBlocked: true,
      })
    }
  }
  return Object.freeze({
    state: MATURITY_STATES.UNIT_TESTED,
    realInfrastructureValidated: false,
    productionValidated: false,
    autoPromotionBlocked: true,
  })
}

/**
 * Impide promocionar estados locales/simulados directamente a `PRODUCTION_VALIDATED`.
 * @param {{ fromState: string, toState: string, realEvidenceCount?: number }} params
 */
export function assertMaturityPromotionAllowed({
  fromState,
  toState,
  realEvidenceCount = 0,
}) {
  if (!Object.values(MATURITY_STATES).includes(toState)) {
    throw new Error(`MATURITY_STATE_INVALID: Estado '${toState}' inválido`)
  }
  if (toState === MATURITY_STATES.PRODUCTION_VALIDATED) {
    throw new Error(
      `MATURITY_PROMOTION_FORBIDDEN: Prohibido autopromocionar '${fromState}' a 'PRODUCTION_VALIDATED' sin despliegue real y acreditación externa`
    )
  }
  if (
    (toState === MATURITY_STATES.REAL_CONNECTIVITY_TESTED ||
      toState === MATURITY_STATES.REAL_INTEGRATION_TESTED) &&
    (!Number.isFinite(realEvidenceCount) || realEvidenceCount <= 0)
  ) {
    throw new Error(
      `MATURITY_PROMOTION_FORBIDDEN: No es posible pasar de '${fromState}' a '${toState}' sin evidencia real verificable`
    )
  }
  return Object.freeze({
    allowed: true,
    fromState,
    toState,
  })
}

/**
 * Ejecuta una corrida DRY-RUN segura cuando `ATTESTATION_REAL_INTEGRATION_ENABLED=true`
 * y `ATTESTATION_REAL_INTEGRATION_DRY_RUN=true`.
 * No abre sockets, no firma, no inserta reservas, no muta DB y no invoca ARCA/Supabase.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{ checkAmbientFiscalVars?: boolean }} [options]
 */
export function runControlledRealIntegrationDryRun(
  env = process.env,
  options = {}
) {
  if (!isRealIntegrationEnabled(env)) {
    throw new Error(
      'REAL_INTEGRATION_DISABLED: Dry-run real requiere ATTESTATION_REAL_INTEGRATION_ENABLED=true explícito'
    )
  }
  if (!isRealIntegrationDryRun(env)) {
    throw new Error(
      'DRY_RUN_MODE_REQUIRED: Defina ATTESTATION_REAL_INTEGRATION_DRY_RUN=true para ejecutar preflight dry-run sin efectos secundarios'
    )
  }

  const preflight = runInfrastructurePreflight(env, options)
  const antiReplay = resolveAntiReplaySelection(env)
  const authMode = cleanStr(env?.ATTESTATION_CLIENT_AUTH_MODE).toUpperCase()
  let kmsCfg = null
  try {
    kmsCfg = resolveKmsEnvConfig(env)
  } catch {
    kmsCfg = null
  }

  const isPgSelected =
    antiReplay.storageType === 'distributed' &&
    antiReplay.distributedProvider === 'POSTGRESQL' &&
    preflight.status !== PREFLIGHT_STATUSES.CONFIGURATION_INVALID &&
    cleanStr(env?.ATTESTATION_POSTGRES_URL).length > 0

  const isDdbSelected =
    antiReplay.storageType === 'distributed' &&
    antiReplay.distributedProvider === 'DYNAMODB' &&
    preflight.status !== PREFLIGHT_STATUSES.CONFIGURATION_INVALID &&
    cleanStr(env?.ATTESTATION_DYNAMODB_TABLE).length > 0

  const isKmsSelected = Boolean(
    kmsCfg &&
      (kmsCfg.signingProviderMode === 'PRODUCTION_KMS_SIGNER' ||
        kmsCfg.signingProviderMode === 'AWS_KMS' ||
        kmsCfg.signingProviderMode === 'GCP_KMS') &&
      kmsCfg.keyVersionName &&
      kmsCfg.publicKeySpki &&
      preflight.status !== PREFLIGHT_STATUSES.CONFIGURATION_INVALID
  )

  const isOidcSelected =
    authMode === 'OIDC_JWT' &&
    cleanStr(env?.ATTESTATION_OIDC_JWKS_URI).length > 0 &&
    preflight.status !== PREFLIGHT_STATUSES.CONFIGURATION_INVALID

  const isMtlsSelected =
    authMode === 'MTLS' &&
    cleanStr(env?.ATTESTATION_MTLS_TRUSTED_CA_PEM).length > 0 &&
    preflight.status !== PREFLIGHT_STATUSES.CONFIGURATION_INVALID

  const actionMatrix = Object.freeze({
    POSTGRES_CONNECTION_CHECK: isPgSelected
      ? 'WOULD_RUN'
      : 'NOT_RUN_UNCONFIGURED_OR_SKIPPED',
    POSTGRES_WRITE_TEST: 'NOT_RUN',
    DYNAMODB_CONNECTIVITY_CHECK: isDdbSelected
      ? 'WOULD_RUN'
      : 'NOT_RUN_UNCONFIGURED_OR_SKIPPED',
    DYNAMODB_MUTATION: 'NOT_RUN',
    KMS_PUBLIC_KEY_CHECK: isKmsSelected
      ? 'WOULD_RUN'
      : 'NOT_RUN_UNCONFIGURED_OR_SKIPPED',
    KMS_SIGN_OPERATION: 'NOT_RUN',
    OIDC_DISCOVERY: isOidcSelected
      ? 'WOULD_RUN'
      : 'NOT_RUN_UNCONFIGURED_OR_SKIPPED',
    MTLS_HANDSHAKE_VALIDATION: isMtlsSelected
      ? 'WOULD_RUN'
      : 'NOT_RUN_UNCONFIGURED_OR_SKIPPED',
    ARCA: 'FORBIDDEN',
    SUPABASE_POS_MUTATION: 'FORBIDDEN',
  })

  return Object.freeze({
    dryRun: true,
    executedSideEffects: false,
    preflightStatus: preflight.status,
    configurationStatus: preflight.configurationStatus,
    actionMatrix,
    counters: Object.freeze({
      networkCallsExecuted: 0,
      signaturesExecuted: 0,
      reservationsCreated: 0,
      mutationsExecuted: 0,
      arcaCallsExecuted: 0,
      supabasePosOperationsExecuted: 0,
    }),
    productionValidated: false,
    productionApproved: false,
    issues: preflight.issues,
    missingTargets: preflight.missingTargets,
    warnings: preflight.warnings,
    fingerprint: preflight.fingerprint,
  })
}
