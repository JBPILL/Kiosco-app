// @ts-check
import { pathToFileURL } from 'node:url'
import {
  assertServiceEnvironmentIsolation,
  SERVICE_ENVIRONMENTS,
} from './attestation-policy.mjs'
import {
  AwsKmsSigningProvider,
  GcpKmsSigningProvider,
  ProductionKmsSigningProvider,
  TestSigningProvider,
} from './signing-providers.mjs'
import { ServiceAntiReplayGuard } from './service-anti-replay.mjs'
import { IndependentAttestationAuthorityService } from './authority-service.mjs'
import { IndependentAttestationHttpServer } from './http-server.mjs'
import {
  createMtlsClientAuthVerifier,
  createOidcJwtClientAuthVerifier,
  createSimulatedClientAuthVerifier,
} from './client-auth.mjs'
import {
  isRealIntegrationDryRun,
  isRealIntegrationEnabled,
  resolveKmsEnvConfig,
} from './real-integration.mjs'
import { safeParseStrictJson } from './contract.mjs'

function parseStrictJsonArray(rawValue) {
  const wrapped = safeParseStrictJson(`{"items":${String(rawValue).trim()}}`)
  return wrapped.items
}

function parseListEnv(rawValue, fallback = undefined) {
  if (rawValue === undefined || rawValue === null) return fallback
  const trimmed = String(rawValue).trim()
  if (!trimmed) return fallback
  if (trimmed.startsWith('[')) {
    const parsed = parseStrictJsonArray(trimmed)
    if (!Array.isArray(parsed)) {
      throw new Error('ATTESTATION_ENV_LIST_INVALID: Se esperaba un arreglo JSON válido')
    }
    return parsed.map((item) => String(item).trim()).filter(Boolean)
  }
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const ANTI_REPLAY_MODE_ALIASES = Object.freeze({
  memory: 'memory',
  IN_MEMORY: 'memory',
  file: 'file',
  LOCAL_DURABLE: 'file',
  distributed: 'distributed',
  DISTRIBUTED_MULTI_NODE: 'distributed',
})

function parseStrictPort(rawValue, fallback = 8080) {
  if (rawValue === undefined || rawValue === '') return fallback
  const trimmed = String(rawValue).trim()
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      `ATTESTATION_PORT_INVALID: Puerto inválido '${trimmed}'; se requiere entero entre 1 y 65535`
    )
  }
  const port = Number(trimmed)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `ATTESTATION_PORT_INVALID: Puerto '${port}' fuera de rango permitido (1..65535)`
    )
  }
  return port
}

function parseStrictMaxBodyBytes(rawValue, fallback = 1048576) {
  if (rawValue === undefined || rawValue === '') return fallback
  const trimmed = String(rawValue).trim()
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      `ATTESTATION_MAX_BODY_BYTES_INVALID: Valor '${trimmed}' inválido; debe ser entero entre 1024 y 10485760`
    )
  }
  const bytes = Number(trimmed)
  if (!Number.isSafeInteger(bytes) || bytes < 1024 || bytes > 10485760) {
    throw new Error(
      `ATTESTATION_MAX_BODY_BYTES_INVALID: Valor '${bytes}' fuera de rango (1024..10485760)`
    )
  }
  return bytes
}

function parseStrictBooleanEnv(rawValue, varName) {
  if (rawValue === undefined || rawValue === '') return false
  const trimmed = String(rawValue).trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  throw new Error(
    `ATTESTATION_BOOLEAN_FLAG_INVALID: ${varName} debe ser 'true' o 'false'`
  )
}

function normalizeAntiReplayStorage(env, serviceEnvironment) {
  const rawMode =
    env.ATTESTATION_ANTI_REPLAY_MODE ?? env.ATTESTATION_ANTI_REPLAY_BACKEND
  if (rawMode === undefined || rawMode === '') {
    return serviceEnvironment === SERVICE_ENVIRONMENTS.TEST ? 'memory' : 'file'
  }
  const mapped = ANTI_REPLAY_MODE_ALIASES[String(rawMode).trim()]
  if (!mapped) {
    throw new Error(
      `ATTESTATION_ANTI_REPLAY_BACKEND_INVALID: Backend anti-replay '${rawMode}' no reconocido`
    )
  }
  return mapped
}

/**
 * Construye el servicio y servidor HTTP a partir de variables de entorno explícitas.
 * Falla cerrado ante configuraciones ambiguas, inválidas, ausencia de clientAuthVerifier en modo protegido,
 * o intentos de usar TEST_SIGNER / auth simulada en STAGING/PRODUCTION.
 * @param {Record<string, string | undefined>} [env=process.env]
 * @param {{
 *   kmsClient?: object,
 *   distributedStore?: object,
 *   clientAuthVerifier?: unknown,
 *   tlsOptions?: object,
 *   logger?: object,
 *   now?: (() => number | string | Date) | number | string | Date
 * }} [deps={}]
 */
export function createConfiguredAuthorityFromEnv(env = process.env, deps = {}) {
  const serviceEnvironment = env.ATTESTATION_ENVIRONMENT
  if (
    !serviceEnvironment ||
    !Object.values(SERVICE_ENVIRONMENTS).includes(serviceEnvironment)
  ) {
    throw new Error(
      `ATTESTATION_ENVIRONMENT_REQUIRED: ATTESTATION_ENVIRONMENT debe ser uno de ${Object.values(SERVICE_ENVIRONMENTS).join(', ')}`
    )
  }

  const providerKind = env.ATTESTATION_SIGNING_PROVIDER
  if (
    providerKind !== 'TEST_SIGNER' &&
    providerKind !== 'PRODUCTION_KMS_SIGNER'
  ) {
    throw new Error(
      "ATTESTATION_SIGNING_PROVIDER_INVALID: ATTESTATION_SIGNING_PROVIDER debe ser 'TEST_SIGNER' o 'PRODUCTION_KMS_SIGNER'"
    )
  }

  const authorityId =
    env.ATTESTATION_AUTHORITY_ID ||
    (providerKind === 'PRODUCTION_KMS_SIGNER'
      ? 'kioskopos-independent-attestation-authority-prod'
      : 'test-independent-attestation-authority-v1')

  const kmsCfg = resolveKmsEnvConfig(env)
  const configuredKeyId = kmsCfg.keyId
  const configuredKeyVersion = kmsCfg.keyVersionName
  const configuredKmsPublicKeySpki = kmsCfg.publicKeySpki
  const configuredKmsProviderKind = kmsCfg.cloudProvider
  const configuredKmsEndpoint = kmsCfg.kmsEndpoint || undefined

  let signingProvider
  if (providerKind === 'PRODUCTION_KMS_SIGNER') {
    if (configuredKmsProviderKind === 'AWS_KMS') {
      signingProvider = new AwsKmsSigningProvider({
        authorityId,
        keyId: configuredKeyId,
        publicKeySpki: configuredKmsPublicKeySpki,
        kmsKeyArn: configuredKeyVersion,
        region: kmsCfg.region || undefined,
        awsSigningAlgorithm: kmsCfg.awsSigningAlgorithm,
        kmsEndpoint: configuredKmsEndpoint,
        awsKmsClient: /** @type {any} */ (deps).awsKmsClient,
        kmsClient: /** @type {any} */ (deps.kmsClient),
      })
    } else if (configuredKmsProviderKind === 'GCP_KMS') {
      signingProvider = new GcpKmsSigningProvider({
        authorityId,
        keyId: configuredKeyId,
        publicKeySpki: configuredKmsPublicKeySpki,
        keyVersionName: configuredKeyVersion,
        kmsEndpoint: configuredKmsEndpoint,
        gcpKmsClient: /** @type {any} */ (deps).gcpKmsClient,
        kmsClient: /** @type {any} */ (deps.kmsClient),
      })
    } else if (
      configuredKmsProviderKind === '' ||
      configuredKmsProviderKind === 'EXTERNAL_KMS' ||
      configuredKmsProviderKind === 'GENERIC_KMS'
    ) {
      signingProvider = new ProductionKmsSigningProvider({
        authorityId,
        keyId: configuredKeyId,
        publicKeySpki: configuredKmsPublicKeySpki,
        keyVersionName: configuredKeyVersion,
        kmsEndpoint: configuredKmsEndpoint,
        kmsClient: deps.kmsClient,
      })
    } else {
      throw new Error(
        `ATTESTATION_KMS_PROVIDER_INVALID: Proveedor KMS '${configuredKmsProviderKind}' no soportado`
      )
    }
  } else {
    signingProvider = new TestSigningProvider({
      authorityId,
    })
  }

  const storageType = normalizeAntiReplayStorage(env, serviceEnvironment)
  const rawLeaseTtl = env.ATTESTATION_RESERVATION_LEASE_TTL_MS
  let leaseTtlMs
  if (rawLeaseTtl !== undefined && rawLeaseTtl !== '') {
    const n = Number(rawLeaseTtl)
    if (!Number.isSafeInteger(n) || n <= 0) {
      throw new Error(
        `ATTESTATION_LEASE_TTL_INVALID: ATTESTATION_RESERVATION_LEASE_TTL_MS inválido '${rawLeaseTtl}'`
      )
    }
    leaseTtlMs = n
  }

  const antiReplayGuard = new ServiceAntiReplayGuard({
    storageType,
    filePath:
      storageType === 'file'
        ? env.ATTESTATION_ANTI_REPLAY_FILE ||
          '/var/run/attestation/anti-replay.json'
        : undefined,
    nodeId: env.ATTESTATION_NODE_ID || undefined,
    leaseTtlMs,
    distributedStore: /** @type {any} */ (deps.distributedStore),
    now: deps.now,
  })

  // Resolución estricta de clientAuthVerifier (cableado explícito, sin fallback silencioso en modo protegido)
  let resolvedClientAuthVerifier = deps.clientAuthVerifier || undefined
  const authMode = (env.ATTESTATION_CLIENT_AUTH_MODE || '').trim()
  let resolvedTlsOptions = deps.tlsOptions ? { ...deps.tlsOptions } : undefined

  if (!resolvedClientAuthVerifier && authMode === 'SIMULATED_TEST_ONLY') {
    if (
      serviceEnvironment === SERVICE_ENVIRONMENTS.PRODUCTION ||
      serviceEnvironment === SERVICE_ENVIRONMENTS.STAGING
    ) {
      throw new Error(
        `SIMULATED_CLIENT_AUTH_FORBIDDEN_IN_${serviceEnvironment}: Prohibido usar ATTESTATION_CLIENT_AUTH_MODE=SIMULATED_TEST_ONLY en '${serviceEnvironment}'`
      )
    }
    let parsedTokens = {}
    if (env.ATTESTATION_SIMULATED_CLIENT_TOKENS_JSON) {
      try {
        parsedTokens = safeParseStrictJson(env.ATTESTATION_SIMULATED_CLIENT_TOKENS_JSON)
      } catch {
        throw new Error(
          'ATTESTATION_SIMULATED_CLIENT_TOKENS_INVALID: JSON inválido en ATTESTATION_SIMULATED_CLIENT_TOKENS_JSON'
        )
      }
    }
    resolvedClientAuthVerifier = createSimulatedClientAuthVerifier({
      validTokens: parsedTokens,
    })
  } else if (!resolvedClientAuthVerifier && authMode === 'OIDC_JWT') {
    const issuers = parseListEnv(env.ATTESTATION_OIDC_ISSUER, [])
    const audiences = parseListEnv(env.ATTESTATION_OIDC_AUDIENCE, [])
    const allowedAlgorithms = parseListEnv(
      env.ATTESTATION_OIDC_ALLOWED_ALGORITHMS
    )
    const allowedClientIds = parseListEnv(
      env.ATTESTATION_OIDC_ALLOWED_CLIENT_IDS
    )
    const jwks = env.ATTESTATION_OIDC_JWKS_JSON
      ? safeParseStrictJson(env.ATTESTATION_OIDC_JWKS_JSON)
      : undefined
    const allowInsecureLocalhostHttp = parseStrictBooleanEnv(
      env.ATTESTATION_OIDC_ALLOW_INSECURE_LOCALHOST,
      'ATTESTATION_OIDC_ALLOW_INSECURE_LOCALHOST'
    )
    const realIntegration = isRealIntegrationEnabled(env)
    const dryRun = isRealIntegrationDryRun(env)
    const allowedJwksHosts =
      typeof env.ATTESTATION_OIDC_ALLOWED_JWKS_HOSTS === 'string'
        ? env.ATTESTATION_OIDC_ALLOWED_JWKS_HOSTS.split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined
    resolvedClientAuthVerifier = createOidcJwtClientAuthVerifier({
      issuer: issuers,
      audience: audiences,
      jwksUri: env.ATTESTATION_OIDC_JWKS_URI || undefined,
      allowedJwksHosts,
      jwks,
      jwksFetcher: deps.oidcJwksFetcher,
      allowedAlgorithms,
      allowedClientIds,
      allowInsecureLocalhostHttp,
      allowNetworkFetch:
        !dryRun &&
        (deps.oidcAllowNetworkFetch !== undefined
          ? Boolean(deps.oidcAllowNetworkFetch)
          : realIntegration),
      realOidcEnabled: realIntegration && !dryRun,
      dryRun,
      now: deps.now,
    })
  } else if (!resolvedClientAuthVerifier && authMode === 'MTLS') {
    const trustedCaPem = String(
      env.ATTESTATION_MTLS_TRUSTED_CA_PEM || ''
    ).replace(/\\n/g, '\n')
    let trustedClients = []
    if (env.ATTESTATION_MTLS_TRUSTED_CLIENTS_JSON) {
      try {
        trustedClients = parseStrictJsonArray(
          env.ATTESTATION_MTLS_TRUSTED_CLIENTS_JSON
        )
      } catch {
        throw new Error(
          'CLIENT_AUTH_MTLS_CONFIG_INVALID: JSON inválido en ATTESTATION_MTLS_TRUSTED_CLIENTS_JSON'
        )
      }
    }
    resolvedClientAuthVerifier = createMtlsClientAuthVerifier({
      trustedCaPem,
      trustedClients,
      now: deps.now,
    })
    if (resolvedTlsOptions) {
      if (resolvedTlsOptions.requestCert === false) {
        throw new Error(
          'CLIENT_AUTH_MTLS_CONFIG_INVALID: En modo MTLS no se puede deshabilitar tlsOptions.requestCert'
        )
      }
      resolvedTlsOptions = {
        ...resolvedTlsOptions,
        ca: resolvedTlsOptions.ca || trustedCaPem,
        requestCert: true,
        // Mantiene default fail-closed en socket TLS; si el llamador pasa `rejectUnauthorized: false`
        // para devolver respuestas HTTP 401/403 JSON estructuradas, `createMtlsClientAuthVerifier` igualmente
        // exige `ts.clientCertificateAuthorized === true` y rechaza todo certificado no confiable.
        rejectUnauthorized:
          resolvedTlsOptions.rejectUnauthorized !== undefined
            ? resolvedTlsOptions.rejectUnauthorized
            : true,
      }
    }
  } else if (
    authMode &&
    authMode !== 'SIMULATED_TEST_ONLY' &&
    authMode !== 'INJECTED_VERIFIER' &&
    authMode !== 'OIDC_JWT' &&
    authMode !== 'MTLS'
  ) {
    throw new Error(
      `ATTESTATION_CLIENT_AUTH_MODE_INVALID: Modo '${authMode}' no soportado en esta fase`
    )
  }

  assertServiceEnvironmentIsolation({
    serviceEnvironment,
    signingProvider,
    antiReplayGuard,
    clientAuthVerifier:
      /** @type {any} */ (resolvedClientAuthVerifier) || undefined,
    env,
  })

  const protectedModeEnv =
    env.ATTESTATION_PROTECTED_MODE !== undefined &&
    env.ATTESTATION_PROTECTED_MODE !== ''
      ? parseStrictBooleanEnv(
          env.ATTESTATION_PROTECTED_MODE,
          'ATTESTATION_PROTECTED_MODE'
        )
      : undefined

  const requireSignedGoGrant =
    env.ATTESTATION_REQUIRE_SIGNED_GO_GRANT !== undefined &&
    env.ATTESTATION_REQUIRE_SIGNED_GO_GRANT !== ''
      ? parseStrictBooleanEnv(
          env.ATTESTATION_REQUIRE_SIGNED_GO_GRANT,
          'ATTESTATION_REQUIRE_SIGNED_GO_GRANT'
        )
      : undefined

  const attestationResponseVersion =
    env.ATTESTATION_RESPONSE_VERSION === '1.1' ? '1.1' : '1.0'

  const safeLogger =
    deps.logger ||
    Object.freeze({
      info: (event, meta) => {
        process.stdout.write(JSON.stringify({ event, ...meta }) + '\n')
      },
    })

  const service = new IndependentAttestationAuthorityService({
    signingProvider,
    antiReplayGuard,
    serviceEnvironment:
      /** @type {'TEST' | 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION'} */ (
        serviceEnvironment
      ),
    protectedMode: protectedModeEnv,
    requireSignedGoGrant,
    authorityId,
    trustedGoAuthorityId: env.ATTESTATION_GO_AUTHORITY_ID || undefined,
    trustedGoKeyId: env.ATTESTATION_GO_KEY_ID || undefined,
    trustedGoPublicKeySpki: env.ATTESTATION_GO_PUBLIC_KEY_SPKI || undefined,
    expectedProjectRef: env.ATTESTATION_ALLOWED_PROJECT_REF || undefined,
    expectedCommitSha: env.ATTESTATION_ALLOWED_COMMIT_SHA || undefined,
    attestationResponseVersion,
    clientAuthVerifier: resolvedClientAuthVerifier,
    now: deps.now,
    env,
    logger: safeLogger,
  })

  const port = parseStrictPort(env.ATTESTATION_SERVICE_PORT ?? env.PORT, 8080)
  const host = env.ATTESTATION_SERVICE_HOST || '127.0.0.1'
  const requireHttps =
    parseStrictBooleanEnv(env.ATTESTATION_REQUIRE_HTTPS, 'ATTESTATION_REQUIRE_HTTPS') ||
    parseStrictBooleanEnv(env.ATTESTATION_TLS_REQUIRED, 'ATTESTATION_TLS_REQUIRED')
  const trustProxyHttps = parseStrictBooleanEnv(
    env.ATTESTATION_TRUST_PROXY_HTTPS,
    'ATTESTATION_TRUST_PROXY_HTTPS'
  )
  const maxBodySizeBytes = parseStrictMaxBodyBytes(
    env.ATTESTATION_MAX_BODY_BYTES,
    1048576
  )
  const allowedHosts =
    typeof env.ATTESTATION_ALLOWED_HOSTS === 'string' &&
    env.ATTESTATION_ALLOWED_HOSTS.trim().length > 0
      ? env.ATTESTATION_ALLOWED_HOSTS.split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined

  const server = new IndependentAttestationHttpServer({
    service,
    host,
    requireHttps,
    trustProxyHttps,
    maxBodySizeBytes,
    allowedHosts,
    tlsOptions: resolvedTlsOptions,
    logger: safeLogger,
  })

  return Object.freeze({ service, server, port, host })
}

/**
 * Crea un manejador idempotente de apagado ordenado para señales SIGTERM / SIGINT.
 * No invoca process.exit() a menos que el caller suministre explícitamente onExit.
 * @param {{ server: IndependentAttestationHttpServer, logger?: { info?: Function }, onExit?: (code: number) => void }} options
 */
export function createGracefulShutdownHandler({ server, logger, onExit }) {
  let shutdownPromise = null

  return async (signal = 'SIGTERM') => {
    if (shutdownPromise) return shutdownPromise
    shutdownPromise = (async () => {
      if (logger && typeof logger.info === 'function') {
        logger.info('SERVER_SHUTDOWN_INITIATED', {
          signal,
          timestamp: new Date().toISOString(),
        })
      }
      try {
        await server.close()
        if (logger && typeof logger.info === 'function') {
          logger.info('SERVER_SHUTDOWN_COMPLETED', {
            signal,
            timestamp: new Date().toISOString(),
          })
        }
        if (typeof onExit === 'function') onExit(0)
        return { closed: true, signal }
      } catch (err) {
        if (typeof onExit === 'function') onExit(1)
        throw err
      }
    })()
    return shutdownPromise
  }
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  const { server, port } = createConfiguredAuthorityFromEnv(process.env)
  const shutdown = createGracefulShutdownHandler({
    server,
    onExit: (code) => process.exit(code),
  })
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM').catch(() => {})
  })
  process.on('SIGINT', () => {
    void shutdown('SIGINT').catch(() => {})
  })
  server.start(port).catch((err) => {
    process.stderr.write(
      JSON.stringify({
        event: 'STARTUP_FAILED',
        errorCode: String(err?.message || err).split(':')[0],
        timestamp: new Date().toISOString(),
      }) + '\n'
    )
    process.exit(1)
  })
}
