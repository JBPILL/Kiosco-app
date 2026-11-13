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

/**
 * Construye el servicio y servidor HTTP a partir de variables de entorno explícitas.
 * Falla cerrado ante configuraciones ambiguas o intentos de usar TEST_SIGNER en STAGING/PRODUCTION.
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

  const signingProvider =
    providerKind === 'PRODUCTION_KMS_SIGNER'
      ? new ProductionKmsSigningProvider({
          authorityId,
          keyId: env.ATTESTATION_PUBLIC_KEY_ID,
          publicKeySpki: env.ATTESTATION_PUBLIC_KEY_SPKI,
          keyVersionName: env.ATTESTATION_KMS_KEY_VERSION,
          kmsClient: deps.kmsClient,
        })
      : new TestSigningProvider({
          authorityId,
        })

  const storageType =
    /** @type {'memory' | 'file' | 'distributed'} */ (
      env.ATTESTATION_ANTI_REPLAY_MODE ||
        (serviceEnvironment === SERVICE_ENVIRONMENTS.TEST ? 'memory' : 'file')
    )

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

  const port = Number.parseInt(
    env.ATTESTATION_SERVICE_PORT || env.PORT || '8080',
    10
  )
  const host = env.ATTESTATION_SERVICE_HOST || '127.0.0.1'
  const requireHttps = env.ATTESTATION_REQUIRE_HTTPS === 'true'
  const trustProxyHttps = env.ATTESTATION_TRUST_PROXY_HTTPS === 'true'

  const server = new IndependentAttestationHttpServer({
    service,
    host,
    requireHttps,
    trustProxyHttps,
    tlsOptions: deps.tlsOptions,
    logger: safeLogger,
  })

  return Object.freeze({ service, server, port, host })
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  const { server, port } = createConfiguredAuthorityFromEnv(process.env)
  const shutdown = async () => {
    try {
      await server.close()
      process.exit(0)
    } catch {
      process.exit(1)
    }
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
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
