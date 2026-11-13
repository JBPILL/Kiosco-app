// @ts-check
import { pathToFileURL } from 'node:url'
import {
  assertServiceEnvironmentIsolation,
  SERVICE_ENVIRONMENTS,
} from './attestation-policy.mjs'
import {
  ProductionKmsSigningProvider,
  TestSigningProvider,
} from './signing-providers.mjs'
import { ServiceAntiReplayGuard } from './service-anti-replay.mjs'
import { IndependentAttestationAuthorityService } from './authority-service.mjs'
import { IndependentAttestationHttpServer } from './http-server.mjs'

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
 * Falla cerrado ante configuraciones ambiguas, inválidas o intentos de usar TEST_SIGNER en STAGING/PRODUCTION.
 * @param {Record<string, string | undefined>} [env=process.env]
 * @param {{ kmsClient?: object, distributedStore?: object, tlsOptions?: object, logger?: object }} [deps={}]
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

  const configuredKeyId = env.ATTESTATION_PUBLIC_KEY_ID || env.ATTESTATION_KEY_ID
  const configuredKeyVersion =
    env.ATTESTATION_KMS_KEY_VERSION || env.ATTESTATION_KMS_KEY_ID

  const signingProvider =
    providerKind === 'PRODUCTION_KMS_SIGNER'
      ? new ProductionKmsSigningProvider({
          authorityId,
          keyId: configuredKeyId,
          publicKeySpki: env.ATTESTATION_PUBLIC_KEY_SPKI,
          keyVersionName: configuredKeyVersion,
          kmsClient: deps.kmsClient,
        })
      : new TestSigningProvider({
          authorityId,
        })

  const storageType = normalizeAntiReplayStorage(env, serviceEnvironment)

  const antiReplayGuard = new ServiceAntiReplayGuard({
    storageType,
    filePath:
      storageType === 'file'
        ? env.ATTESTATION_ANTI_REPLAY_FILE ||
          '/var/run/attestation/anti-replay.json'
        : undefined,
    distributedStore: deps.distributedStore,
  })

  assertServiceEnvironmentIsolation({
    serviceEnvironment,
    signingProvider,
    antiReplayGuard,
    env,
  })

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
    authorityId,
    trustedGoKeyId: env.ATTESTATION_GO_KEY_ID || undefined,
    trustedGoPublicKeySpki: env.ATTESTATION_GO_PUBLIC_KEY_SPKI || undefined,
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

  const server = new IndependentAttestationHttpServer({
    service,
    host,
    requireHttps,
    trustProxyHttps,
    maxBodySizeBytes,
    tlsOptions: deps.tlsOptions,
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
