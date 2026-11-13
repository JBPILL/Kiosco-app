import type { KeyObject } from 'node:crypto'

export const CONTRACT_VERSION: '1.0'
export const SCHEMA_VERSION: '1.0'
export const PR02_P0_SCOPE: 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'
export const PR02_P0_COLECTOR_IDENTIDAD: 'scripts/fiscal/execute-pr02-p0-official-evidence.mjs'
export const MAX_JSON_NESTING_DEPTH: number
export const ATTESTATION_REQUEST_ALLOWED_KEYS: ReadonlySet<string>
export const SUPPORTED_SIGNING_ALGORITHM: 'Ed25519'

export function safeParseStrictJson(
  rawText: string,
  options?: { readonly maxDepth?: number }
): Record<string, any>

export function assertNoPrototypePollution(
  value: unknown,
  depth?: number,
  maxDepth?: number
): void

export function serializeCanonicalAttestationRequest(pkg: Record<string, any>): string
export function computeAttestationRequestDigest(pkg: Record<string, any>): string
export function serializeCanonicalAttestationResponsePayload(res: Record<string, any>): string
export function computeAttestationResponsePayloadDigest(res: Record<string, any>): string
export function validateAttestationRequestStrict(pkg: Record<string, any>): {
  readonly valid: true
  readonly requestSha256: string
}

export abstract class AttestationSigningProvider {
  readonly signerType: string
  readonly trustScope: string
  readonly signerOrigin: string
  readonly algorithm: 'Ed25519'
  readonly authorityId: string
  readonly keyId: string | null
  readonly publicKeySpki: string | null
  isProductionReady(): boolean
  fallbackToLocal(): never
  sign(canonicalPayload: string | Buffer): string | Promise<string>
}

export class TestSigningProvider extends AttestationSigningProvider {
  constructor(options?: {
    readonly authorityId?: string
    readonly keyId?: string
    readonly privateKey?: KeyObject
    readonly publicKey?: KeyObject
    readonly declareProduction?: boolean
    readonly isProduction?: boolean
    readonly isProductionReady?: boolean
    readonly algorithm?: string
  })

  readonly publicKey: KeyObject
  sign(canonicalPayload: string | Buffer): string
}

export class ProductionKmsSigningProvider extends AttestationSigningProvider {
  constructor(options?: {
    readonly authorityId?: string
    readonly keyId?: string
    readonly publicKeySpki?: string
    readonly keyVersionName?: string
    readonly algorithm?: string
    readonly kmsEndpoint?: string
    readonly kmsClient?: {
      readonly sign: (params: {
        readonly keyVersionName: string
        readonly data: Buffer
        readonly algorithm: 'Ed25519'
      }) => Promise<string>
    }
  })

  readonly keyVersionName: string | null
  readonly kmsEndpoint: string | null
  accessPrivateKey(): never
  sign(canonicalPayload: string | Buffer): Promise<string>
}

export class ServiceAntiReplayGuard {
  constructor(options?: {
    readonly storageType?: 'memory' | 'file' | 'distributed'
    readonly filePath?: string
    readonly distributedStore?: {
      readonly hasRequestId: (id: string) => Promise<boolean> | boolean
      readonly hasRequestHash: (sha: string) => Promise<boolean> | boolean
      readonly hasAttestationId: (id: string) => Promise<boolean> | boolean
      readonly recordOnce: (entry: {
        readonly requestId: string
        readonly requestSha256: string
        readonly attestationId: string
      }) => Promise<void> | void
      readonly isHealthy?: () => Promise<boolean> | boolean
    }
  })

  readonly storageType: 'memory' | 'file' | 'distributed'
  readonly guaranteeLevel:
    | 'HOST_LOCAL_SERVICE_IN_MEMORY_ONE_TIME_USE'
    | 'HOST_LOCAL_SERVICE_DURABLE_ONE_TIME_USE'
    | 'DISTRIBUTED_MULTI_NODE_ONE_TIME_USE'
  readonly antiReplayTier: 'IN_MEMORY' | 'LOCAL_DURABLE' | 'DISTRIBUTED_MULTI_NODE'

  readonly size: number
  flush(): void
  isHealthy(): Promise<boolean>
  check(request: { readonly requestId: string; readonly requestSha256?: string }): boolean
  checkAsync(request: { readonly requestId: string; readonly requestSha256?: string }): Promise<boolean>
  record(
    request: { readonly requestId: string; readonly requestSha256?: string },
    response: { readonly attestationId: string }
  ): void
  recordAsync(
    request: { readonly requestId: string; readonly requestSha256?: string },
    response: { readonly attestationId: string }
  ): Promise<void>
}

export const SERVICE_ENVIRONMENTS: Readonly<{
  TEST: 'TEST'
  DEVELOPMENT: 'DEVELOPMENT'
  STAGING: 'STAGING'
  PRODUCTION: 'PRODUCTION'
}>

export const ALLOWED_EXECUTION_SCOPES: readonly ['PR02_P0_OFFICIAL_EVIDENCE_COLLECTION']
export const ALLOWED_ENVIRONMENTS: readonly ['HOMOLOGACION']
export const FORBIDDEN_SCOPE_TOKENS: readonly string[]

export function assertServiceEnvironmentIsolation(params: {
  readonly serviceEnvironment: string
  readonly signingProvider: AttestationSigningProvider
  readonly antiReplayGuard?: ServiceAntiReplayGuard
  readonly env?: Record<string, string | undefined>
}): string

export function validateAttestationPolicy(requestPkg: {
  readonly executionScope?: string
  readonly environment?: string
  readonly [key: string]: unknown
}): true

export class IndependentAttestationAuthorityService {
  constructor(options: {
    readonly signingProvider: AttestationSigningProvider
    readonly antiReplayGuard?: ServiceAntiReplayGuard
    readonly serviceEnvironment?: 'TEST' | 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION'
    readonly authorityId?: string
    readonly keyId?: string | null
    readonly trustedGoKeyId?: string | null
    readonly trustedGoPublicKeySpki?: string | null
    readonly clientAuthVerifier?: (
      headers: Record<string, unknown>,
      context: { readonly serviceEnvironment: string }
    ) => Promise<boolean> | boolean
    readonly env?: Record<string, string | undefined>
    readonly logger?: { readonly info: (event: string, meta: Record<string, unknown>) => void }
  })

  readonly authorityId: string
  readonly keyId: string | null
  readonly serviceEnvironment: 'TEST' | 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION'
  readonly signingProvider: AttestationSigningProvider
  readonly antiReplayGuard: ServiceAntiReplayGuard
  readonly serviceVersion: '1.0'

  handleHealth(): {
    readonly status: 'HEALTHY'
    readonly service: 'independent-attestation-authority'
    readonly serviceVersion: '1.0'
    readonly serviceEnvironment: string
    readonly processStarted: true
    readonly httpServerRunning: true
    readonly signingProviderConfigured: boolean
    readonly signingProviderOperational: boolean
    readonly productionSigningReady: boolean
    readonly authorityRealWorldAvailable: false
    readonly timestamp: string
  }

  handleReadiness(): Promise<{
    readonly ready: boolean
    readonly service: 'independent-attestation-authority'
    readonly serviceEnvironment: string
    readonly signerType: string
    readonly trustScope: string
    readonly providerReady: boolean
    readonly antiReplayHealthy: boolean
    readonly antiReplayGuarantee: string
    readonly reason: string
    readonly timestamp: string
  }>

  handleRequest(
    rawBodyOrPkg: string | Record<string, unknown>,
    headers?: Record<string, unknown>
  ): Promise<Record<string, any>>
}

export class IndependentAttestationHttpServer {
  constructor(options: {
    readonly service: IndependentAttestationAuthorityService
    readonly requireHttps?: boolean
    readonly trustProxyHttps?: boolean
    readonly host?: string
    readonly maxBodySizeBytes?: number
    readonly requestTimeoutMs?: number
    readonly headersTimeoutMs?: number
    readonly keepAliveTimeoutMs?: number
    readonly tlsOptions?: { readonly key: Buffer | string; readonly cert: Buffer | string }
    readonly logger?: unknown
  })

  readonly isRunning: boolean
  readonly isShuttingDown: boolean
  readonly inFlightCount: number
  readonly address: unknown
  start(port?: number): Promise<{ port: number; url: string }>
  close(): Promise<void>
}

export function createConfiguredAuthorityFromEnv(
  env?: Record<string, string | undefined>,
  deps?: {
    readonly kmsClient?: object
    readonly distributedStore?: object
    readonly tlsOptions?: object
    readonly logger?: object
  }
): {
  readonly service: IndependentAttestationAuthorityService
  readonly server: IndependentAttestationHttpServer
  readonly port: number
  readonly host: string
}

export function createGracefulShutdownHandler(options: {
  readonly server: IndependentAttestationHttpServer
  readonly logger?: { readonly info?: (event: string, meta: Record<string, unknown>) => void }
  readonly onExit?: (code: number) => void
}): (signal?: string) => Promise<{ readonly closed: boolean; readonly signal: string }>
