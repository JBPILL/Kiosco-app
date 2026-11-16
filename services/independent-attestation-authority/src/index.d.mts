import type { KeyObject } from 'node:crypto'

export const CONTRACT_VERSION: '1.0'
export const SCHEMA_VERSION: '1.0'
export const PR02_P0_SCOPE: 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'
export const PR02_P0_COLECTOR_IDENTIDAD: 'scripts/fiscal/execute-pr02-p0-official-evidence.mjs'
export const MAX_JSON_NESTING_DEPTH: number
export const ATTESTATION_REQUEST_ALLOWED_KEYS: ReadonlySet<string>
export const ATTESTATION_RESPONSE_ALLOWED_KEYS_V1_0: ReadonlySet<string>
export const ATTESTATION_RESPONSE_ALLOWED_KEYS_V1_1: ReadonlySet<string>
export const SUPPORTED_SIGNING_ALGORITHM: 'Ed25519'

export const GO_GRANT_SCHEMA_VERSION: '1.1'
export const GO_SIGNATURE_DOMAIN_SEPARATOR: 'KIOSKOPOS_GO_AUTHORIZATION_GRANT_V1_1'
export const DEFAULT_MAX_GO_GRANT_TTL_MS: number
export const GO_GRANT_ALLOWED_KEYS: ReadonlySet<string>

export const CLIENT_AUTH_MODES: Readonly<{
  SIMULATED_TEST_ONLY: 'SIMULATED_TEST_ONLY'
  INJECTED_VERIFIER: 'INJECTED_VERIFIER'
}>

export const EVIDENCE_INTEGRITY_LEVELS: Readonly<{
  LEVEL_1_DIGEST_ONLY: 'LEVEL_1_DIGEST_ONLY'
  LEVEL_2A_SUBMITTED_CONTENT: 'LEVEL_2A_SUBMITTED_CONTENT'
  LEVEL_2B_INDEPENDENT_OBSERVED: 'LEVEL_2B_INDEPENDENT_OBSERVED'
}>

export const FORBIDDEN_CLIENT_EVIDENCE_ELEVATION_FIELDS: readonly string[]

export const ANTI_REPLAY_ENTRY_STATES: Readonly<{
  RESERVED: 'RESERVED'
  CONSUMED: 'CONSUMED'
  FAILED_CONSUMED: 'FAILED_CONSUMED'
  FAILED: 'FAILED'
  EXPIRED: 'EXPIRED'
}>

export const DISTRIBUTED_RESERVATION_STATES: Readonly<{
  AVAILABLE: 'AVAILABLE'
  RESERVED: 'RESERVED'
  CONSUMED: 'CONSUMED'
  FAILED: 'FAILED'
  EXPIRED: 'EXPIRED'
}>

export const ALLOWED_RESERVATION_TRANSITIONS: Readonly<
  Record<
    'AVAILABLE' | 'RESERVED' | 'CONSUMED' | 'FAILED' | 'EXPIRED',
    readonly ('RESERVED' | 'CONSUMED' | 'FAILED' | 'EXPIRED')[]
  >
>

export const REQUIRED_DISTRIBUTED_STORE_METHODS: readonly string[]
export const DEFAULT_RESERVATION_LEASE_TTL_MS: number

export const EXTERNAL_SIGNING_PROVIDER_KINDS: Readonly<{
  LOCAL_TEST: 'LOCAL_TEST'
  EXTERNAL_KMS: 'EXTERNAL_KMS'
  AWS_KMS: 'AWS_KMS'
  GCP_KMS: 'GCP_KMS'
}>

export const PROVIDER_REAL_WORLD_TESTED: false
export const POSTGRESQL_PRODUCTION_READY: false
export const POSTGRESQL_REAL_INTEGRATION_TESTED: false
export const AWS_DYNAMODB_REAL_TESTED: false
export const DYNAMODB_PRODUCTION_READY: false

export interface GoAuthorizationGrantV11 {
  readonly schemaVersion: '1.1'
  readonly authorizationId: string
  readonly issuerAuthorityId?: string
  readonly issuerKeyId: string
  readonly requestId: string
  readonly processId: string
  readonly executionScope: 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'
  readonly environment: 'HOMOLOGACION'
  readonly projectRef: string
  readonly commitSha: string
  readonly requestSha256: string
  readonly issuedAt: string
  readonly notBefore?: string
  readonly expiresAt: string
  readonly singleUse: true
  readonly signature: string
}

export interface ClientAuthVerificationResult {
  readonly authenticated: boolean
  readonly clientId: string
  readonly authMechanism?: string
  readonly allowedScopes: readonly string[]
  readonly isGoAuthority?: boolean
  readonly simulated?: boolean
  readonly subject?: string | null
  readonly issuer?: string | null
  readonly tokenJti?: string | null
  readonly certFingerprintSha256?: string | null
}

export interface ObjectClientAuthVerifier {
  readonly verifierKind?: string
  readonly trustScope?: string
  readonly simulated?: boolean
  readonly realOidcConfigured?: boolean
  readonly realMtlsConfigured?: boolean
  readonly trustedCaPem?: string | null
  readonly isProductionAuthVerifier?: () => boolean
  readonly isHealthy?: () => Promise<boolean>
  verify(
    headers: Record<string, unknown>,
    context: {
      readonly serviceEnvironment: string
      readonly protectedMode?: boolean
      readonly requestedScope?: string | null
      readonly transportSecurity?: Record<string, unknown> | null
      readonly now?: Date | string | number
    }
  ): Promise<boolean | ClientAuthVerificationResult> | boolean | ClientAuthVerificationResult
}

export type ClientAuthVerifier =
  | ((
      headers: Record<string, unknown>,
      context: {
        readonly serviceEnvironment: string
        readonly protectedMode?: boolean
        readonly requestedScope?: string | null
        readonly transportSecurity?: Record<string, unknown> | null
        readonly now?: Date | string | number
      }
    ) => Promise<boolean | ClientAuthVerificationResult> | boolean | ClientAuthVerificationResult)
  | ObjectClientAuthVerifier

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
export function verifyServiceAttestationResponse(
  response: Record<string, any>,
  options: {
    readonly trustedAttestationPublicKey: string | KeyObject
    readonly pinnedKeyId?: string | null
  }
): {
  readonly valid: true
  readonly schemaVersion: string
  readonly keyId: string
  readonly derivedKeyId: string
  readonly attestationPayloadSha256: string
}

export function computeEd25519SpkiKeyId(publicKeyInput: string | KeyObject): string
export function parseStrictGoAuthorizationGrant(rawGrantOrObj: string | Record<string, any>): Record<string, any>
export function serializeCanonicalGoGrantPayload(grant: Record<string, any>): string
export function buildDomainSeparatedGoGrantSigningBytes(grant: Record<string, any>): Buffer
export function computeGoGrantDigest(grant: Record<string, any>): string
export function verifyGoAuthorizationGrant(
  rawGrantOrObj: string | Record<string, any>,
  options: {
    readonly trustedGoPublicKeySpki: string | KeyObject
    readonly trustedGoKeyId?: string | null
    readonly trustedGoAuthorityId?: string | null
    readonly requestPkg?: Record<string, any>
    readonly expectedProjectRef?: string | null
    readonly expectedCommitSha?: string | null
    readonly attestationAuthorityId?: string | null
    readonly attestationKeyId?: string | null
    readonly attestationPublicKeySpki?: string | null
    readonly now?: Date | string | number
    readonly maxTtlMs?: number
    readonly clockSkewMs?: number
  }
): {
  readonly valid: true
  readonly schemaVersion: '1.1'
  readonly authorizationId: string
  readonly issuerAuthorityId: string | null
  readonly issuerKeyId: string
  readonly requestId: string
  readonly processId: string
  readonly executionScope: string
  readonly environment: string
  readonly projectRef: string
  readonly commitSha: string
  readonly requestSha256: string
  readonly issuedAt: string
  readonly notBefore: string
  readonly expiresAt: string
  readonly grantSha256: string
}

export class TestOnlyGoAuthorityIssuer {
  constructor(options?: {
    readonly authorityId?: string
    readonly privateKey?: KeyObject
    readonly publicKey?: KeyObject
    readonly forbiddenAttestationKeyId?: string | null
    readonly forbiddenAttestationPublicKeySpki?: string | null
  })

  readonly issuerScope: 'TEST_ONLY'
  readonly isProductionGoAuthority: false
  readonly authorityId: string
  readonly keyId: string
  readonly publicKeySpki: string

  issueGrant(params: {
    readonly authorizationId?: string
    readonly requestId: string
    readonly processId: string
    readonly executionScope?: string
    readonly environment?: string
    readonly projectRef: string
    readonly commitSha: string
    readonly requestSha256: string
    readonly issuedAt?: string
    readonly notBefore?: string
    readonly expiresAt?: string
    readonly ttlMs?: number
    readonly now?: Date | string | number
  }): GoAuthorizationGrantV11
}

export const OIDC_ALLOWED_ALGORITHMS: readonly ['EdDSA', 'RS256', 'ES256']

export function normalizeClientAuthVerifier(verifier: unknown): Record<string, unknown> | null
export function assertNormalizedAuthenticatedClient(
  rawResult: unknown,
  context: {
    readonly protectedMode: boolean
    readonly requestedScope?: string | null
    readonly trustedGoAuthorityId?: string | null
    readonly trustedGoKeyId?: string | null
    readonly attestationAuthorityId?: string | null
  }
): ClientAuthVerificationResult

export function createSimulatedClientAuthVerifier(options?: {
  readonly validTokens?: Record<
    string,
    {
      readonly clientId: string
      readonly allowedScopes: string[]
      readonly mechanism?: 'SIMULATED_OIDC' | 'SIMULATED_MTLS'
    }
  >
  readonly headerName?: string
}): ClientAuthVerifier

export interface OidcJwkKey {
  readonly kty: string
  readonly kid?: string
  readonly use?: string
  readonly alg?: string
  readonly crv?: string
  readonly x?: string
  readonly n?: string
  readonly e?: string
  readonly y?: string
}

export function createOidcJwtClientAuthVerifier(options: {
  readonly issuer: string | readonly string[]
  readonly audience: string | readonly string[]
  readonly jwksUri?: string
  readonly allowedJwksHosts?: readonly string[]
  readonly jwks?: { readonly keys: readonly OidcJwkKey[] }
  readonly jwksFetcher?: () => Promise<{ readonly keys: readonly OidcJwkKey[] }>
  readonly allowedAlgorithms?: readonly ('EdDSA' | 'RS256' | 'ES256')[]
  readonly allowedClientIds?: readonly string[]
  readonly clockSkewSeconds?: number
  readonly jwksCacheTtlMs?: number
  readonly jwksFetchTimeoutMs?: number
  readonly minRefreshIntervalMs?: number
  readonly requireNbf?: boolean
  readonly allowInsecureLocalhostHttp?: boolean
  readonly allowNetworkFetch?: boolean
  readonly realOidcEnabled?: boolean
  readonly dryRun?: boolean
  readonly now?: (() => number | Date | string) | number | Date | string
}): ObjectClientAuthVerifier & {
  readonly refreshJwks: (force?: boolean) => Promise<readonly OidcJwkKey[]>
  readonly isHealthy: () => Promise<boolean>
}

export function createMtlsClientAuthVerifier(options: {
  readonly trustedCaPem: string
  readonly trustedClients: ReadonlyArray<{
    readonly clientId: string
    readonly allowedScopes: readonly string[]
    readonly sha256Fingerprint?: string
    readonly commonName?: string
    readonly subjectCN?: string
    readonly subjectAltName?: string
    readonly sanDnsNames?: readonly string[]
    readonly sanUris?: readonly string[]
  }>
  readonly now?: (() => number | Date | string) | number | Date | string
}): ObjectClientAuthVerifier & {
  readonly trustedCaPem: string
  readonly isHealthy: () => Promise<boolean>
}

export function assertNoClientEvidenceElevation(requestPkg: Record<string, any>): void

export abstract class EvidenceIntegrityEvaluator {
  readonly level: string
  inspect(requestPkg: Record<string, any>): Promise<{
    readonly evidenceLevel: string
    readonly inspectedMode: string
    readonly rawSoapVerified: boolean
    readonly normalizedTablesRecomputed: boolean
    readonly arcaOriginVerified: boolean
    readonly provenanceClass: string
  }>
}

export class Level1DigestOnlyEvidenceEvaluator extends EvidenceIntegrityEvaluator {
  readonly level: 'LEVEL_1_DIGEST_ONLY'
}
export class Level2ASubmittedContentEvaluatorStub extends EvidenceIntegrityEvaluator {
  readonly level: 'LEVEL_2A_SUBMITTED_CONTENT'
}
export class Level2BIndependentObservedEvaluatorStub extends EvidenceIntegrityEvaluator {
  readonly level: 'LEVEL_2B_INDEPENDENT_OBSERVED'
}

export abstract class AttestationSigningProvider {
  readonly providerKind: string
  readonly signerType: string
  readonly trustScope: string
  readonly signerOrigin: string
  readonly algorithm: 'Ed25519'
  readonly authorityId: string
  readonly keyId: string | null
  readonly publicKeySpki: string | null
  isProductionReady(): boolean
  isRealWorldTested(): boolean
  isHealthy(): Promise<boolean>
  getMetadata(): Readonly<{
    providerKind: string
    signerType: string
    trustScope: string
    signerOrigin: string
    algorithm: 'Ed25519'
    authorityId: string
    keyId: string | null
    productionReady: boolean
    realWorldTested: boolean
  }>
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

export interface GenericKmsClient {
  readonly sign: (params: {
    readonly keyVersionName: string
    readonly data: Buffer
    readonly algorithm: 'Ed25519'
  }) => Promise<
    | string
    | Buffer
    | Uint8Array
    | {
        readonly Signature?: Buffer | Uint8Array | string
        readonly signature?: Buffer | Uint8Array | string
        readonly SigningAlgorithm?: string
        readonly algorithm?: string
        readonly KeyId?: string
        readonly keyVersionName?: string
        readonly name?: string
      }
  >
  readonly getPublicKey?: (params: {
    readonly keyVersionName: string
  }) => Promise<string | { readonly pem?: string; readonly PublicKey?: Buffer | Uint8Array }>
  readonly healthCheck?: (params: {
    readonly keyVersionName: string
  }) => Promise<boolean>
}

export class ProductionKmsSigningProvider extends AttestationSigningProvider {
  constructor(options?: {
    readonly authorityId?: string
    readonly keyId?: string
    readonly publicKeySpki?: string
    readonly keyVersionName?: string
    readonly cloudProvider?: string
    readonly algorithm?: string
    readonly kmsEndpoint?: string
    readonly kmsTimeoutMs?: number
    readonly testDoubleOnly?: boolean
    readonly kmsClient?: GenericKmsClient
  })

  readonly cloudProvider: string
  readonly keyVersionName: string | null
  readonly kmsEndpoint: string | null
  accessPrivateKey(): never
  isHealthy(): Promise<boolean>
  sign(canonicalPayload: string | Buffer): Promise<string>
}

export class AwsKmsSigningProvider extends ProductionKmsSigningProvider {
  constructor(options?: {
    readonly authorityId?: string
    readonly keyId?: string
    readonly publicKeySpki?: string
    readonly kmsKeyArn?: string
    readonly keyVersionName?: string
    readonly region?: string
    readonly awsSigningAlgorithm?: string
    readonly kmsEndpoint?: string
    readonly kmsTimeoutMs?: number
    readonly testDoubleOnly?: boolean
    readonly awsKmsClient?: {
      readonly sign?: (params: {
        readonly KeyId: string
        readonly Message: Buffer
        readonly MessageType: 'RAW'
        readonly SigningAlgorithm: string
      }) => Promise<
        | {
            readonly Signature?: Buffer | Uint8Array | string
            readonly SigningAlgorithm?: string
            readonly KeyId?: string
          }
        | string
        | Buffer
      >
      readonly send?: (params: {
        readonly KeyId: string
        readonly Message: Buffer
        readonly MessageType: 'RAW'
        readonly SigningAlgorithm: string
      }) => Promise<
        | {
            readonly Signature?: Buffer | Uint8Array | string
            readonly SigningAlgorithm?: string
            readonly KeyId?: string
          }
        | string
        | Buffer
      >
      readonly getPublicKey?: (params: { readonly KeyId: string }) => Promise<{
        readonly PublicKey?: Buffer | Uint8Array
        readonly pem?: string
      }>
      readonly healthCheck?: (params: { readonly KeyId: string }) => Promise<boolean>
    }
    readonly kmsClient?: GenericKmsClient
  })

  readonly region: string | null
  readonly awsSigningAlgorithm: string
  buildAwsSignCommandInput(canonicalPayload: string | Buffer): Readonly<{
    KeyId: string
    Message: Buffer
    MessageType: 'RAW'
    SigningAlgorithm: string
  }>
  isRealWorldTested(): false
}

export class GcpKmsSigningProvider extends ProductionKmsSigningProvider {
  constructor(options?: {
    readonly authorityId?: string
    readonly keyId?: string
    readonly publicKeySpki?: string
    readonly keyVersionName?: string
    readonly kmsEndpoint?: string
    readonly kmsTimeoutMs?: number
    readonly testDoubleOnly?: boolean
    readonly gcpKmsClient?: {
      readonly asymmetricSign?: (params: {
        readonly name: string
        readonly data: Buffer
      }) => Promise<
        | { readonly signature?: Buffer | Uint8Array | string; readonly name?: string }
        | readonly [{ readonly signature?: Buffer | Uint8Array | string; readonly name?: string }]
      >
      readonly sign?: (params: {
        readonly keyVersionName: string
        readonly data: Buffer
        readonly algorithm: 'Ed25519'
      }) => Promise<string | Buffer | Uint8Array>
      readonly getPublicKey?: (params: { readonly name: string }) => Promise<
        | { readonly pem?: string }
        | readonly [{ readonly pem?: string }]
        | string
      >
      readonly healthCheck?: (params: { readonly name: string }) => Promise<boolean>
    }
    readonly kmsClient?: GenericKmsClient
  })

  buildGcpAsymmetricSignRequest(canonicalPayload: string | Buffer): Readonly<{
    name: string
    data: Buffer
  }>
  isRealWorldTested(): false
}

export type DistributedReservationState =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'CONSUMED'
  | 'FAILED'
  | 'EXPIRED'

export interface DistributedReservationRecord {
  readonly idempotencyKey: string
  readonly requestId: string
  readonly requestSha256: string
  readonly authorizationId: string | null
  readonly goAuthorizationId: string | null
  readonly attestationId: string
  readonly state: DistributedReservationState
  readonly ownerNodeId: string
  readonly reservationToken: string
  readonly kmsAttempted: boolean
  readonly reservedAt: string
  readonly leaseExpiresAt: string
  readonly leaseExpiresAtMs?: number
  readonly consumedAt: string | null
  readonly failedAt: string | null
  readonly expiredAt: string | null
  readonly failureReason: string | null
  readonly responseDigest: string | null
}

export interface DistributedReservationReceipt {
  readonly reserved: true
  readonly state: 'RESERVED'
  readonly idempotencyKey: string
  readonly requestId: string
  readonly requestSha256: string
  readonly authorizationId: string | null
  readonly attestationId: string
  readonly ownerNodeId: string
  readonly reservationToken: string
  readonly leaseExpiresAt: string
}

export interface DistributedStoreReserveInput {
  readonly requestId: string
  readonly requestSha256?: string
  readonly attestationId: string
  readonly authorizationId?: string | null
  readonly goAuthorizationId?: string | null
  readonly ownerNodeId?: string
  readonly reservationToken?: string
  readonly leaseTtlMs?: number
  readonly now?: Date | number | string
}

export interface DistributedAntiReplayStoreContract {
  readonly backendKind?: string
  readonly multiNodeAtomicGuaranteed?: boolean
  readonly isSimulatedReferenceStore?: boolean
  readonly isRealInfrastructureTested?: boolean
  readonly isProductionDistributedReady?: boolean
  readonly hasRequestId: (id: string) => Promise<boolean> | boolean
  readonly hasRequestHash: (sha: string) => Promise<boolean> | boolean
  readonly hasAttestationId: (id: string) => Promise<boolean> | boolean
  readonly hasAuthorizationId?: (id: string) => Promise<boolean> | boolean
  readonly hasGoAuthorizationId?: (id: string) => Promise<boolean> | boolean
  readonly reserveOnce?: (
    entry: DistributedStoreReserveInput
  ) => Promise<DistributedReservationReceipt | void> | DistributedReservationReceipt | void
  readonly getReservation?: (
    requestId: string
  ) => Promise<DistributedReservationRecord | null> | DistributedReservationRecord | null
  readonly markSigningAttemptStarted?: (params: {
    readonly requestId: string
    readonly attestationId?: string
    readonly ownerNodeId?: string
    readonly reservationToken?: string
    readonly now?: Date | number | string
  }) => Promise<unknown> | unknown
  readonly commitReservation?: (params: {
    readonly requestId: string
    readonly requestSha256?: string
    readonly attestationId: string
    readonly authorizationId?: string | null
    readonly goAuthorizationId?: string | null
    readonly ownerNodeId?: string
    readonly reservationToken?: string
    readonly responseDigest?: string | null
    readonly now?: Date | number | string
  }) => Promise<unknown> | unknown
  readonly recordOnce: (entry: {
    readonly requestId: string
    readonly requestSha256: string
    readonly attestationId: string
    readonly goAuthorizationId?: string | null
  }) => Promise<unknown> | unknown
  readonly markReservationFailed?: (params: {
    readonly requestId: string
    readonly attestationId?: string
    readonly ownerNodeId?: string
    readonly reservationToken?: string
    readonly reason?: string
    readonly now?: Date | number | string
  }) => Promise<unknown> | unknown
  readonly markFailed?: (entry: {
    readonly requestId: string
    readonly attestationId: string
    readonly reason?: string
  }) => Promise<unknown> | unknown
  readonly expireReservation?: (
    params:
      | string
      | {
          readonly requestId: string
          readonly now?: Date | number | string
          readonly reason?: string
        }
  ) => Promise<DistributedReservationRecord | null> | DistributedReservationRecord | null
  readonly isHealthy?: () => Promise<boolean> | boolean
}

export function normalizeEffectiveNowMs(nowInput?: Date | number | string): number
export function computeDistributedIdempotencyKey(input: {
  readonly authorizationId?: string | null
  readonly goAuthorizationId?: string | null
  readonly requestId: string
  readonly requestSha256?: string | null
}): string
export function assertValidReservationTransition(
  fromState: string,
  toState: string,
  contextLabel?: string
): void
export function assertDistributedStoreContract(store: unknown): DistributedAntiReplayStore

export abstract class DistributedAntiReplayStore implements DistributedAntiReplayStoreContract {
  readonly backendKind: string
  readonly multiNodeAtomicGuaranteed: boolean
  readonly isSimulatedReferenceStore: boolean
  readonly isRealInfrastructureTested: boolean
  readonly isProductionDistributedReady: boolean
  reserveOnce(entry: DistributedStoreReserveInput): Promise<DistributedReservationReceipt>
  getReservation(requestId: string): Promise<DistributedReservationRecord | null>
  markSigningAttemptStarted(params: {
    readonly requestId: string
    readonly attestationId?: string
    readonly ownerNodeId?: string
    readonly reservationToken?: string
    readonly now?: Date | number | string
  }): Promise<DistributedReservationRecord | null>
  commitReservation(params: {
    readonly requestId: string
    readonly requestSha256?: string
    readonly attestationId: string
    readonly authorizationId?: string | null
    readonly goAuthorizationId?: string | null
    readonly ownerNodeId?: string
    readonly reservationToken?: string
    readonly responseDigest?: string | null
    readonly now?: Date | number | string
  }): Promise<DistributedReservationRecord | null>
  recordOnce(params: {
    readonly requestId: string
    readonly requestSha256?: string
    readonly attestationId: string
    readonly goAuthorizationId?: string | null
  }): Promise<DistributedReservationRecord | null>
  markReservationFailed(params: {
    readonly requestId: string
    readonly attestationId?: string
    readonly ownerNodeId?: string
    readonly reservationToken?: string
    readonly reason?: string
    readonly now?: Date | number | string
  }): Promise<DistributedReservationRecord | null>
  markFailed(params: {
    readonly requestId: string
    readonly attestationId?: string
    readonly reason?: string
  }): Promise<DistributedReservationRecord | null>
  hasAuthorizationId(authorizationId: string): Promise<boolean>
  hasGoAuthorizationId(authorizationId: string): Promise<boolean>
  hasRequestId(requestId: string): Promise<boolean>
  hasRequestHash(requestSha256: string): Promise<boolean>
  hasAttestationId(attestationId: string): Promise<boolean>
  expireReservation(
    params:
      | string
      | {
          readonly requestId: string
          readonly now?: Date | number | string
          readonly reason?: string
        }
  ): Promise<DistributedReservationRecord | null>
  isHealthy(): Promise<boolean>
}

export class ReferenceInProcessDistributedStore extends DistributedAntiReplayStore {
  constructor(options?: {
    readonly defaultLeaseTtlMs?: number
    readonly simulatedLatencyMs?: number
    readonly now?: (() => number | string | Date) | number | string | Date
  })
  setHealthy(healthy: boolean): void
  setCorrupted(corrupted: boolean): void
  injectFailureOnce(methodName: string, errorOrMessage: Error | string): void
  getStats(): Readonly<{
    totalReservations: number
    RESERVED: number
    CONSUMED: number
    FAILED: number
    EXPIRED: number
  }>
}

export class SharedFileCoordinatorDistributedStore extends DistributedAntiReplayStore {
  constructor(options: {
    readonly filePath: string
    readonly defaultLeaseTtlMs?: number
    readonly lockAcquireTimeoutMs?: number
    readonly lockRetryIntervalMs?: number
    readonly now?: (() => number | string | Date) | number | string | Date
  })
}

export interface PostgresQueryResultRow {
  readonly [column: string]: unknown
}

export interface PostgresQueryExecutor {
  readonly query: (
    sql: string,
    params?: readonly unknown[]
  ) => Promise<{ readonly rows: readonly PostgresQueryResultRow[]; readonly rowCount?: number }>
  readonly exec?: (sql: string) => Promise<unknown>
  readonly transaction?: <T>(
    fn: (tx: {
      readonly query: (
        sql: string,
        params?: readonly unknown[]
      ) => Promise<{ readonly rows: readonly PostgresQueryResultRow[]; readonly rowCount?: number }>
    }) => Promise<T>
  ) => Promise<T>
}

export interface PostgresPoolExecutor {
  readonly connect: () => Promise<{
    readonly query: (
      sql: string,
      params?: readonly unknown[]
    ) => Promise<{ readonly rows: readonly PostgresQueryResultRow[]; readonly rowCount?: number }>
    readonly release: () => void
  }>
  readonly query?: (
    sql: string,
    params?: readonly unknown[]
  ) => Promise<{ readonly rows: readonly PostgresQueryResultRow[]; readonly rowCount?: number }>
}

export function buildPostgresAntiReplaySqlStatements(tableName?: string): Readonly<{
  schemaDdl: string
  reserveSql: string
  findConflictSql: string
  getByRequestIdSql: string
  markAttemptSql: string
  commitSql: string
  markFailedSql: string
  expireSql: string
  hasAuthorizationIdSql: string
  hasRequestIdSql: string
  hasRequestHashSql: string
  hasAttestationIdSql: string
  healthCheckSql: string
}>

export const ALLOWED_POSTGRES_ISOLATION_LEVELS: readonly [
  'READ COMMITTED',
  'REPEATABLE READ',
  'SERIALIZABLE',
]

export class PostgresDistributedAntiReplayStore extends DistributedAntiReplayStore {
  constructor(options?: {
    readonly pool?: PostgresPoolExecutor
    readonly queryClient?: PostgresQueryExecutor
    readonly tableName?: string
    readonly defaultLeaseTtlMs?: number
    readonly queryTimeoutMs?: number
    readonly healthCheckTimeoutMs?: number
    readonly statementTimeoutMs?: number
    readonly isolationLevel?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE'
    readonly now?: (() => number | string | Date) | number | string | Date
  })
  readonly tableName: string
  readonly sqlStatements: ReturnType<typeof buildPostgresAntiReplaySqlStatements>
  ensureSchema(): Promise<void>
}

export const DYNAMODB_KEY_PREFIXES: Readonly<{
  REQUEST: 'REQ#'
  HASH: 'HASH#'
  AUTHORIZATION: 'AUTH#'
  ATTESTATION: 'ATT#'
}>

export const DYNAMODB_TABLE_DESIGN: Readonly<{
  tableName: string
  partitionKey: Readonly<{ name: string; type: string }>
  billingMode: string
  pointInTimeRecovery: boolean
  deletionProtection: boolean
  itemTypes: Readonly<Record<string, string>>
  transactionGuarantee: string
}>

export interface DynamoDbClientAdapter {
  readonly transactWriteItems: (input: { readonly TransactItems: readonly unknown[] }) => Promise<unknown>
  readonly updateItem: (input: Record<string, unknown>) => Promise<{ readonly Attributes?: Record<string, unknown> | null }>
  readonly getItem: (input: {
    readonly TableName: string
    readonly Key: Readonly<{ pk: string }>
    readonly ConsistentRead?: boolean
  }) => Promise<{ readonly Item?: Record<string, unknown> | null }>
  readonly describeTable?: (input: { readonly TableName: string }) => Promise<{
    readonly Table?: { readonly TableStatus?: string }
  }>
}

export function buildDynamoDbReserveTransactItems(
  tableName: string,
  norm: Readonly<Record<string, unknown>>,
  options?: { readonly retentionTtlSeconds?: number | null }
): Readonly<{ ClientRequestToken: string; TransactItems: readonly unknown[] }>

export class DynamoDbDistributedAntiReplayStore extends DistributedAntiReplayStore {
  constructor(options?: {
    readonly client?: DynamoDbClientAdapter
    readonly tableName?: string
    readonly defaultLeaseTtlMs?: number
    readonly operationTimeoutMs?: number
    readonly healthCheckTimeoutMs?: number
    readonly retentionTtlSeconds?: number | null
    readonly now?: (() => number | string | Date) | number | string | Date
  })
  readonly awsDynamoDbRealTested: false
  readonly tableName: string
  readonly tableDesign: typeof DYNAMODB_TABLE_DESIGN
}

export class ServiceAntiReplayGuard {
  constructor(options?: {
    readonly storageType?: 'memory' | 'file' | 'distributed'
    readonly filePath?: string
    readonly nodeId?: string
    readonly leaseTtlMs?: number
    readonly now?: (() => number | string | Date) | number | string | Date
    readonly distributedStore?: DistributedAntiReplayStoreContract
  })

  readonly storageType: 'memory' | 'file' | 'distributed'
  readonly guaranteeLevel:
    | 'HOST_LOCAL_SERVICE_IN_MEMORY_ONE_TIME_USE'
    | 'HOST_LOCAL_SERVICE_DURABLE_ONE_TIME_USE'
    | 'DISTRIBUTED_MULTI_NODE_ONE_TIME_USE'
  readonly antiReplayTier: 'IN_MEMORY' | 'LOCAL_DURABLE' | 'DISTRIBUTED_MULTI_NODE'
  readonly multiNodeAtomicGuaranteed: boolean
  readonly nodeId: string
  readonly leaseTtlMs: number
  readonly distributedBackendKind: string | null
  readonly isFormalDistributedContract: boolean
  readonly isRealInfrastructureTested: boolean

  readonly size: number
  flush(): void
  isHealthy(): Promise<boolean>
  check(request: { readonly requestId: string; readonly requestSha256?: string; readonly authorizationId?: string }): boolean
  checkAsync(request: { readonly requestId: string; readonly requestSha256?: string; readonly authorizationId?: string }): Promise<boolean>
  reserveBeforeSign(
    request: Record<string, unknown>,
    reservedAttestationId: string,
    options?: { readonly now?: Date | number | string; readonly leaseTtlMs?: number }
  ): Promise<{
    readonly idempotencyKey: string
    readonly requestId: string
    readonly requestSha256: string
    readonly authorizationId: string | null
    readonly goAuthorizationId: string | null
    readonly attestationId: string
    readonly ownerNodeId: string
    readonly reservationToken: string
    readonly leaseExpiresAt: string
  }>
  markSigningAttemptStarted(
    reservation: {
      readonly requestId: string
      readonly attestationId?: string
      readonly ownerNodeId?: string
      readonly reservationToken?: string
    },
    options?: { readonly now?: Date | number | string }
  ): Promise<void>
  commitReservation(
    reservation: {
      readonly requestId: string
      readonly requestSha256: string
      readonly attestationId: string
      readonly goAuthorizationId: string | null
      readonly ownerNodeId?: string
      readonly reservationToken?: string
    },
    response: { readonly attestationId: string; readonly attestationPayloadSha256?: string },
    options?: { readonly now?: Date | number | string }
  ): Promise<void>
  markReservationFailed(
    reservation: {
      readonly requestId: string
      readonly attestationId: string
      readonly ownerNodeId?: string
      readonly reservationToken?: string
    },
    reason: string,
    options?: { readonly now?: Date | number | string }
  ): Promise<void>
  expireReservation(
    requestIdOrTarget: string | { readonly requestId: string },
    options?: { readonly now?: Date | number | string; readonly reason?: string }
  ): Promise<DistributedReservationRecord | null>
  getReservation(requestId: string): Promise<DistributedReservationRecord | null>
  hasAuthorizationId(authorizationId: string): Promise<boolean>
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
  readonly clientAuthVerifier?: unknown
  readonly env?: Record<string, string | undefined>
}): string

export function validateAttestationPolicy(
  requestPkg: {
    readonly executionScope?: string
    readonly environment?: string
    readonly [key: string]: unknown
  },
  policyOptions?: {
    readonly expectedProjectRef?: string | null
    readonly expectedCommitSha?: string | null
  }
): true

export class IndependentAttestationAuthorityService {
  constructor(options: {
    readonly signingProvider: AttestationSigningProvider
    readonly antiReplayGuard?: ServiceAntiReplayGuard
    readonly serviceEnvironment?: 'TEST' | 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION'
    readonly protectedMode?: boolean
    readonly requireSignedGoGrant?: boolean
    readonly authorityId?: string
    readonly keyId?: string | null
    readonly trustedGoAuthorityId?: string | null
    readonly trustedGoKeyId?: string | null
    readonly trustedGoPublicKeySpki?: string | null
    readonly expectedProjectRef?: string | null
    readonly expectedCommitSha?: string | null
    readonly attestationResponseVersion?: '1.0' | '1.1'
    readonly clientAuthVerifier?: ClientAuthVerifier
    readonly evidenceEvaluator?: EvidenceIntegrityEvaluator
    readonly now?: (() => number | string | Date) | number | string | Date
    readonly env?: Record<string, string | undefined>
    readonly logger?: { readonly info: (event: string, meta: Record<string, unknown>) => void }
  })

  readonly authorityId: string
  readonly keyId: string | null
  readonly serviceEnvironment: 'TEST' | 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION'
  readonly protectedMode: boolean
  readonly testModeIsolated: boolean
  readonly requireSignedGoGrant: boolean
  readonly evidenceIntegrityLevel: string
  readonly signingProvider: AttestationSigningProvider
  readonly antiReplayGuard: ServiceAntiReplayGuard
  readonly serviceVersion: '1.0' | '1.1'

  handleHealth(): Record<string, any>
  handleReadiness(): Promise<Record<string, any>>
  handleRequest(
    rawBodyOrPkg: string | Record<string, unknown>,
    headers?: Record<string, unknown>,
    requestOptions?: {
      readonly now?: Date | string | number
      readonly responseVersion?: '1.0' | '1.1'
      readonly transportSecurity?: Record<string, unknown> | null
    }
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
    readonly tlsOptions?: {
      readonly key: Buffer | string
      readonly cert: Buffer | string
      readonly ca?: Buffer | string | readonly (Buffer | string)[]
      readonly requestCert?: boolean
      readonly rejectUnauthorized?: boolean
    }
    readonly allowedHosts?: readonly string[] | null
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
    readonly kmsClient?: GenericKmsClient
    readonly awsKmsClient?: {
      readonly sign?: (params: {
        readonly KeyId: string
        readonly Message: Buffer
        readonly MessageType: 'RAW'
        readonly SigningAlgorithm: string
      }) => Promise<{ readonly Signature?: Buffer | Uint8Array | string } | string | Buffer>
      readonly send?: (params: {
        readonly KeyId: string
        readonly Message: Buffer
        readonly MessageType: 'RAW'
        readonly SigningAlgorithm: string
      }) => Promise<{ readonly Signature?: Buffer | Uint8Array | string } | string | Buffer>
    }
    readonly gcpKmsClient?: {
      readonly asymmetricSign?: (params: {
        readonly name: string
        readonly data: Buffer
      }) => Promise<
        | { readonly signature?: Buffer | Uint8Array | string }
        | readonly [{ readonly signature?: Buffer | Uint8Array | string }]
      >
      readonly sign?: (params: {
        readonly keyVersionName: string
        readonly data: Buffer
        readonly algorithm: 'Ed25519'
      }) => Promise<string | Buffer | Uint8Array>
    }
    readonly distributedStore?: DistributedAntiReplayStoreContract
    readonly clientAuthVerifier?: ClientAuthVerifier
    readonly oidcJwksFetcher?: () => Promise<{ readonly keys: readonly OidcJwkKey[] }>
    readonly oidcAllowNetworkFetch?: boolean
    readonly tlsOptions?: {
      readonly key: Buffer | string
      readonly cert: Buffer | string
      readonly ca?: Buffer | string | readonly (Buffer | string)[]
      readonly requestCert?: boolean
      readonly rejectUnauthorized?: boolean
    }
    readonly logger?: { readonly info?: (event: string, meta: Record<string, unknown>) => void }
    readonly now?: (() => number | string | Date) | number | string | Date
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

export function isRealIntegrationEnabled(env?: Record<string, string | undefined>): boolean
export function isRealIntegrationDryRun(env?: Record<string, string | undefined>): boolean
export function assertRealIntegrationEnabled(
  env?: Record<string, string | undefined>,
  context?: string
): void
export function assertDedicatedPostgresUrl(
  connectionString: string,
  options?: { readonly allowInsecureLocalhost?: boolean }
): Readonly<{
  hostname: string
  port: number
  database: string
  sslMode: string
  isLocal: boolean
}>
export function normalizeNetworkHostname(rawHostname: string): string
export function classifyNetworkHost(rawHostname: string): Readonly<{
  normalizedHost: string
  isIpLiteral: boolean
  isLoopback: boolean
  isLocalExact: boolean
  isMetadataOrLinkLocal: boolean
  reason: string | null
}>
export function assertSafeEndpointUrl(
  rawUrl: string,
  varName: string,
  options?: {
    readonly allowInsecureLocalhost?: boolean
    readonly allowLoopbackEndpoint?: boolean
    readonly allowedHosts?: readonly string[]
  }
): Readonly<{
  url: string
  hostname: string
  protocol: string
  isLocal: boolean
}>
export function resolveKmsEnvConfig(
  env?: Record<string, string | undefined>
): Readonly<{
  signingProviderMode: string
  cloudProvider: string
  authorityId: string
  keyId: string
  keyVersionName: string
  publicKeySpki: string
  region: string
  kmsEndpoint: string
  awsSigningAlgorithm: string
}>
export function createControlledPostgresStoreFromEnv(
  env?: Record<string, string | undefined>,
  deps?: {
    readonly pgModule?: {
      readonly Pool: new (cfg: Record<string, unknown>) => PostgresPoolExecutor & {
        readonly end?: () => Promise<void>
        readonly on?: (event: string, cb: (err: Error) => void) => void
      }
    }
  }
): Promise<
  Readonly<{
    store: PostgresDistributedAntiReplayStore
    pool: PostgresPoolExecutor
    getLastPoolError: () => Readonly<{ code: string; timestamp: string }> | null
    close: () => Promise<void>
  }>
>
export function createControlledDynamoDbStoreFromEnv(
  env?: Record<string, string | undefined>,
  deps?: {
    readonly client?: DynamoDbClientAdapter
    readonly awsDynamoSdk?: Record<string, unknown>
    readonly awsDynamoLibSdk?: Record<string, unknown>
  }
): Promise<
  Readonly<{
    store: DynamoDbDistributedAntiReplayStore
    close: () => Promise<void>
  }>
>
export function createControlledKmsProviderFromEnv(
  env?: Record<string, string | undefined>,
  deps?: {
    readonly awsKmsSdk?: Record<string, unknown>
    readonly gcpKmsSdk?: Record<string, unknown>
    readonly kmsClient?: Record<string, unknown>
  }
): Promise<
  Readonly<{
    provider: AwsKmsSigningProvider | GcpKmsSigningProvider
    close: () => Promise<void>
  }>
>

export type PreflightStatus =
  | 'CONFIGURATION_VALID'
  | 'CONFIGURATION_INVALID'
  | 'REAL_INTEGRATION_DISABLED'
  | 'REAL_INTEGRATION_NOT_CONFIGURED'
  | 'REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST'

export type IntegrationPhase =
  | 'PHASE_0_CONFIG_VALIDATION'
  | 'PHASE_1_READ_ONLY_CONNECTIVITY'
  | 'PHASE_2_NON_PRODUCTION_MUTATION'
  | 'PHASE_3_CONCURRENCY_VALIDATION'
  | 'PHASE_4_KMS_SIGNING_VALIDATION'
  | 'PHASE_5_AUTHENTICATION_VALIDATION'
  | 'PHASE_6_DEPLOYMENT_CANDIDATE'

export type MaturityState =
  | 'UNIT_TESTED'
  | 'LOCAL_TESTED'
  | 'SIMULATION_TESTED'
  | 'REAL_CONNECTIVITY_TESTED'
  | 'REAL_INTEGRATION_TESTED'
  | 'PRODUCTION_VALIDATED'

export const PREFLIGHT_STATUSES: Readonly<{
  CONFIGURATION_VALID: 'CONFIGURATION_VALID'
  CONFIGURATION_INVALID: 'CONFIGURATION_INVALID'
  REAL_INTEGRATION_DISABLED: 'REAL_INTEGRATION_DISABLED'
  REAL_INTEGRATION_NOT_CONFIGURED: 'REAL_INTEGRATION_NOT_CONFIGURED'
  REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST: 'REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST'
}>

export const INTEGRATION_PHASES: Readonly<{
  PHASE_0_CONFIG_VALIDATION: 'PHASE_0_CONFIG_VALIDATION'
  PHASE_1_READ_ONLY_CONNECTIVITY: 'PHASE_1_READ_ONLY_CONNECTIVITY'
  PHASE_2_NON_PRODUCTION_MUTATION: 'PHASE_2_NON_PRODUCTION_MUTATION'
  PHASE_3_CONCURRENCY_VALIDATION: 'PHASE_3_CONCURRENCY_VALIDATION'
  PHASE_4_KMS_SIGNING_VALIDATION: 'PHASE_4_KMS_SIGNING_VALIDATION'
  PHASE_5_AUTHENTICATION_VALIDATION: 'PHASE_5_AUTHENTICATION_VALIDATION'
  PHASE_6_DEPLOYMENT_CANDIDATE: 'PHASE_6_DEPLOYMENT_CANDIDATE'
}>

export const INTEGRATION_PHASE_ORDER: readonly IntegrationPhase[]

export const MATURITY_STATES: Readonly<{
  UNIT_TESTED: 'UNIT_TESTED'
  LOCAL_TESTED: 'LOCAL_TESTED'
  SIMULATION_TESTED: 'SIMULATION_TESTED'
  REAL_CONNECTIVITY_TESTED: 'REAL_CONNECTIVITY_TESTED'
  REAL_INTEGRATION_TESTED: 'REAL_INTEGRATION_TESTED'
  PRODUCTION_VALIDATED: 'PRODUCTION_VALIDATED'
}>

export const DEFAULT_MATURITY_FLAGS: Readonly<{
  POSTGRESQL_REAL_INTEGRATION_TESTED: false
  AWS_DYNAMODB_REAL_TESTED: false
  AWS_KMS_REAL_TESTED: false
  GCP_KMS_REAL_TESTED: false
  OIDC_REAL_INTEGRATION_TESTED: false
  MTLS_REAL_INTEGRATION_TESTED: false
  PRODUCTION_VALIDATED: false
  PRODUCTION_APPROVED: false
  P1_IMPORT_ALLOWED: false
  PR02_READY_FOR_EMISSION_GO: false
}>

export interface SafeConfigurationFingerprint {
  readonly schema: string
  readonly serviceEnvironment: string
  readonly nodeEnv: string
  readonly realIntegrationEnabled: boolean
  readonly realIntegrationDryRun: boolean
  readonly targetPhase: string
  readonly authorityId: string
  readonly signingProviderMode: string
  readonly kmsProvider: string
  readonly kmsRegion: string | null
  readonly kmsKeyId: string | null
  readonly kmsKeyResourceKind: string
  readonly kmsEndpointHost: string | null
  readonly antiReplayStorageType: string
  readonly antiReplayProvider: string
  readonly postgresHost: string | null
  readonly postgresPort: number | null
  readonly postgresDatabase: string | null
  readonly postgresSslMode: string | null
  readonly postgresTable: string | null
  readonly dynamoTableName: string | null
  readonly dynamoRegion: string | null
  readonly dynamoEndpointHost: string | null
  readonly clientAuthMode: string
  readonly oidcIssuer: string | null
  readonly oidcJwksHost: string | null
  readonly mtlsEnabled: boolean
  readonly protectedModeFlag: string
  readonly httpsRequired: boolean
  readonly trustProxyHttps: boolean
  readonly servicePort: string
  readonly allowedScopes: readonly string[]
  readonly allowedTargetEnvironments: readonly string[]
  readonly configFingerprintSha256: string
  readonly secretsIncluded: false
}

export interface PreflightIssue {
  readonly domain: string
  readonly severity: 'ERROR'
  readonly code: string
  readonly field: string
  readonly message: string
}

export interface PreflightCheck {
  readonly name: string
  readonly category: 'SYNTAX' | 'SECURITY' | 'CONNECTIVITY_PREREQ'
  readonly valid: boolean
  readonly code: string
  readonly message: string
}

export function redactSensitiveConfigText(rawText: unknown): string

export function buildSafeConfigurationFingerprint(
  env?: Record<string, string | undefined>
): SafeConfigurationFingerprint

export function validateInfrastructureConfiguration(
  env?: Record<string, string | undefined>,
  options?: {
    readonly requireCompleteForEnv?: boolean
    readonly checkAmbientFiscalVars?: boolean
  }
): Readonly<{
  status: 'CONFIGURATION_VALID' | 'CONFIGURATION_INVALID'
  valid: boolean
  syntaxValid: boolean
  securityPostureValid: boolean
  complete: boolean
  realIntegrationEnabled: boolean
  realIntegrationDryRun: boolean
  issues: readonly PreflightIssue[]
  warnings: readonly string[]
  missingTargets: readonly string[]
  checks: readonly PreflightCheck[]
  fingerprint: SafeConfigurationFingerprint
}>

export function runInfrastructurePreflight(
  env?: Record<string, string | undefined>,
  options?: { readonly checkAmbientFiscalVars?: boolean }
): Readonly<{
  status: PreflightStatus
  configurationStatus: 'CONFIGURATION_VALID' | 'CONFIGURATION_INVALID'
  syntaxValid: boolean
  securityPostureValid: boolean
  realIntegrationEnabled: boolean
  realIntegrationDryRun: boolean
  readyForControlledTest: boolean
  connectivityTested: false
  healthVerified: false
  realIntegrationTested: false
  productionValidated: false
  productionApproved: false
  readyForProduction: false
  maturityState: MaturityState
  maturityFlags: typeof DEFAULT_MATURITY_FLAGS
  issues: readonly PreflightIssue[]
  warnings: readonly string[]
  missingTargets: readonly string[]
  checks: readonly PreflightCheck[]
  fingerprint: SafeConfigurationFingerprint
}>

export function evaluateIntegrationPhaseGate(params: {
  readonly targetPhase: IntegrationPhase
  readonly completedPhases?: readonly IntegrationPhase[]
  readonly env?: Record<string, string | undefined>
  readonly preflightResult?: ReturnType<typeof runInfrastructurePreflight>
  readonly governanceManualSignOff?: boolean
  readonly governanceGrant?: GoAuthorizationGrantV11 | Record<string, unknown> | string
  readonly trustedGoPublicKeySpki?: string | KeyObject
  readonly trustedGoKeyId?: string | null
  readonly trustedGoAuthorityId?: string | null
  readonly expectedProjectRef?: string | null
  readonly expectedCommitSha?: string | null
  readonly now?: Date | string | number
}): Readonly<{
  allowed: true
  targetPhase: IntegrationPhase
  requiredOptInVar: string | null
  verifiedPrerequisites: readonly IntegrationPhase[]
  productionApproved: false
  productionValidated: false
  p1ImportAllowed: false
  remoteGo: 'DENIED'
}>

export function evaluateMaturityState(evidence?: {
  readonly unitTestsPassed?: boolean
  readonly localRuntimeTested?: boolean
  readonly multiNodeSimulated?: boolean
  readonly realConnectivityPassed?: boolean
  readonly realIntegrationPassed?: boolean
  readonly externalGovernanceAccredited?: boolean
}): Readonly<{
  state: MaturityState
  realInfrastructureValidated: boolean
  productionValidated: false
  autoPromotionBlocked: true
}>

export function assertMaturityPromotionAllowed(params: {
  readonly fromState: MaturityState
  readonly toState: MaturityState
  readonly realEvidenceCount?: number
}): Readonly<{
  allowed: true
  fromState: MaturityState
  toState: MaturityState
}>

export function runControlledRealIntegrationDryRun(
  env?: Record<string, string | undefined>,
  options?: { readonly checkAmbientFiscalVars?: boolean }
): Readonly<{
  dryRun: true
  executedSideEffects: false
  preflightStatus: PreflightStatus
  configurationStatus: 'CONFIGURATION_VALID' | 'CONFIGURATION_INVALID'
  actionMatrix: Readonly<{
    POSTGRES_CONNECTION_CHECK: 'WOULD_RUN' | 'NOT_RUN_UNCONFIGURED_OR_SKIPPED'
    POSTGRES_WRITE_TEST: 'NOT_RUN'
    DYNAMODB_CONNECTIVITY_CHECK: 'WOULD_RUN' | 'NOT_RUN_UNCONFIGURED_OR_SKIPPED'
    DYNAMODB_MUTATION: 'NOT_RUN'
    KMS_PUBLIC_KEY_CHECK: 'WOULD_RUN' | 'NOT_RUN_UNCONFIGURED_OR_SKIPPED'
    KMS_SIGN_OPERATION: 'NOT_RUN'
    OIDC_DISCOVERY: 'WOULD_RUN' | 'NOT_RUN_UNCONFIGURED_OR_SKIPPED'
    MTLS_HANDSHAKE_VALIDATION: 'WOULD_RUN' | 'NOT_RUN_UNCONFIGURED_OR_SKIPPED'
    ARCA: 'FORBIDDEN'
    SUPABASE_POS_MUTATION: 'FORBIDDEN'
  }>
  counters: Readonly<{
    networkCallsExecuted: 0
    signaturesExecuted: 0
    reservationsCreated: 0
    mutationsExecuted: 0
    arcaCallsExecuted: 0
    supabasePosOperationsExecuted: 0
  }>
  productionValidated: false
  productionApproved: false
  issues: readonly PreflightIssue[]
  missingTargets: readonly string[]
  warnings: readonly string[]
  fingerprint: SafeConfigurationFingerprint
}>

export const CONNECTIVITY_READINESS_STAGES: Readonly<{
  readonly CONFIGURATION_VALIDATION: 'CONFIGURATION_VALIDATION'
  readonly LOCAL_PREFLIGHT: 'LOCAL_PREFLIGHT'
  readonly SAFE_CONNECTIVITY_PREFLIGHT: 'SAFE_CONNECTIVITY_PREFLIGHT'
  readonly CONTROLLED_EXTERNAL_CONNECTIVITY: 'CONTROLLED_EXTERNAL_CONNECTIVITY'
  readonly REAL_INTEGRATION_TEST: 'REAL_INTEGRATION_TEST'
  readonly DEPLOYMENT_CANDIDATE: 'DEPLOYMENT_CANDIDATE'
}>

export type ConnectivityReadinessStage =
  (typeof CONNECTIVITY_READINESS_STAGES)[keyof typeof CONNECTIVITY_READINESS_STAGES]

export const CONNECTIVITY_STAGE_ORDER: readonly ConnectivityReadinessStage[]

export const CONNECTIVITY_AUTHORIZATION_STATUSES: Readonly<{
  readonly NOT_CONFIGURED: 'NOT_CONFIGURED'
  readonly CONFIGURATION_INVALID: 'CONFIGURATION_INVALID'
  readonly REAL_INTEGRATION_DISABLED: 'REAL_INTEGRATION_DISABLED'
  readonly DRY_RUN_ACTIVE: 'DRY_RUN_ACTIVE'
  readonly NOT_AUTHORIZED: 'NOT_AUTHORIZED'
  readonly AUTHORIZED_TO_CONNECT: 'AUTHORIZED_TO_CONNECT'
}>

export type ConnectivityAuthorizationStatus =
  (typeof CONNECTIVITY_AUTHORIZATION_STATUSES)[keyof typeof CONNECTIVITY_AUTHORIZATION_STATUSES]

export const POSTGRES_CONNECTIVITY_STATES: Readonly<{
  readonly CONFIGURATION_VALID: 'CONFIGURATION_VALID'
  readonly CONNECTIVITY_REACHABLE: 'CONNECTIVITY_REACHABLE'
  readonly AUTHENTICATION_VALID: 'AUTHENTICATION_VALID'
  readonly DATABASE_ACCESS_VALID: 'DATABASE_ACCESS_VALID'
  readonly SCHEMA_READY: 'SCHEMA_READY'
  readonly REAL_INTEGRATION_TESTED: 'REAL_INTEGRATION_TESTED'
}>

export const MTLS_CONNECTIVITY_STATES: Readonly<{
  readonly TLS_CONNECTED: 'TLS_CONNECTED'
  readonly SERVER_CERT_VALID: 'SERVER_CERT_VALID'
  readonly CLIENT_CERT_PRESENT: 'CLIENT_CERT_PRESENT'
  readonly CLIENT_CERT_TRUSTED: 'CLIENT_CERT_TRUSTED'
  readonly CLIENT_IDENTITY_ALLOWED: 'CLIENT_IDENTITY_ALLOWED'
}>

export const DYNAMODB_ERROR_CATEGORIES: Readonly<{
  readonly AUTHENTICATION: 'AUTHENTICATION'
  readonly AUTHORIZATION: 'AUTHORIZATION'
  readonly THROTTLING: 'THROTTLING'
  readonly CONNECTIVITY: 'CONNECTIVITY'
  readonly CONFIGURATION: 'CONFIGURATION'
  readonly RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND'
}>

export type DynamoDbErrorCategory =
  (typeof DYNAMODB_ERROR_CATEGORIES)[keyof typeof DYNAMODB_ERROR_CATEGORIES]

export interface SafeConnectivityErrorRecord {
  readonly code: string
  readonly category: string
  readonly message: string
}

export interface ExternalConnectivityAuthorizationEvaluation {
  readonly authorizationStatus: ConnectivityAuthorizationStatus
  readonly stage: ConnectivityReadinessStage
  readonly configured: boolean
  readonly configurationValid: boolean
  readonly localPreflightPassed: boolean
  readonly safeConnectivityPreflightPassed: boolean
  readonly realIntegrationEnabled: boolean
  readonly dryRunActive: boolean
  readonly connectivityTestEnabled: boolean
  readonly explicitApprovalGranted: boolean
  readonly authorizedToConnect: boolean
  readonly connectivityTestStatus: 'READY_TO_RUN' | 'NOT_RUN'
  readonly realConnectivityTested: false
  readonly realIntegrationTested: false
  readonly productionValidated: false
  readonly productionApproved: false
  readonly blockingReasons: readonly string[]
  readonly preflightStatus: PreflightStatus
  readonly safeFingerprint: Readonly<Record<string, unknown>>
}

export interface ControlledConnectivityComponentResult {
  readonly status: string
  readonly component: string
  readonly stage: ConnectivityReadinessStage
  readonly connectivityTest: 'PASSED' | 'FAILED' | 'NOT_RUN'
  readonly configurationValid: boolean
  readonly authorizationValid: boolean
  readonly connectivityAttempted: boolean
  readonly connectivityReachable: boolean
  readonly authenticationVerified: boolean
  readonly resourceVerified: boolean
  readonly realConnectivityTested: boolean
  readonly realIntegrationTested: false
  readonly productionValidated: false
  readonly productionApproved: false
  readonly safeFingerprint: Readonly<Record<string, unknown>>
  readonly errors: readonly SafeConnectivityErrorRecord[]
  readonly details: Readonly<Record<string, unknown>>
}

export function evaluateExternalConnectivityAuthorization(
  env?: Record<string, string | undefined>,
  options?: { readonly checkAmbientFiscalVars?: boolean }
): ExternalConnectivityAuthorizationEvaluation

export function assertExternalConnectivityAuthorized(
  env?: Record<string, string | undefined>,
  options?: { readonly checkAmbientFiscalVars?: boolean }
): ExternalConnectivityAuthorizationEvaluation

export function runControlledPostgresConnectivityCheck(
  env?: Record<string, string | undefined>,
  deps?: Record<string, unknown>
): Promise<ControlledConnectivityComponentResult>

export function classifyDynamoDbConnectivityError(
  err: unknown
): Readonly<{
  readonly category: DynamoDbErrorCategory
  readonly code: string
  readonly message: string
}>

export function runControlledDynamoDbConnectivityCheck(
  env?: Record<string, string | undefined>,
  deps?: Record<string, unknown>
): Promise<ControlledConnectivityComponentResult>

export function runControlledKmsConnectivityCheck(
  env?: Record<string, string | undefined>,
  deps?: Record<string, unknown>
): Promise<ControlledConnectivityComponentResult>

export function runControlledOidcConnectivityCheck(
  env?: Record<string, string | undefined>,
  deps?: Record<string, unknown>
): Promise<ControlledConnectivityComponentResult>

export function runControlledMtlsConnectivityCheck(
  env?: Record<string, string | undefined>,
  deps?: Record<string, unknown>
): Promise<ControlledConnectivityComponentResult>

export function runControlledExternalConnectivitySuite(
  env?: Record<string, string | undefined>,
  deps?: Record<string, unknown>
): Promise<
  Readonly<{
    status: string
    stage: ConnectivityReadinessStage
    connectivityTest: 'PASSED' | 'FAILED' | 'NOT_RUN'
    configured: boolean
    authorizedToConnect: boolean
    connectivityAttempted: boolean
    realConnectivityTested: boolean
    realIntegrationTested: false
    productionValidated: false
    productionApproved: false
    authorization: ExternalConnectivityAuthorizationEvaluation
    safeFingerprint: Readonly<Record<string, unknown>>
    components: Readonly<Record<string, ControlledConnectivityComponentResult>>
    invariants: Readonly<{
      PRIVATE_KEYS_LOCAL: 'FORBIDDEN'
      PRODUCTION_SIGNING_KEY_IN_RUNTIME: 'FORBIDDEN'
      PRODUCTION_VALIDATED: false
      PRODUCTION_APPROVED: false
      EXTERNAL_AUTHORITY_DEPLOYED: false
      AUTHORITY_REAL_WORLD_AVAILABLE: false
      P1_IMPORT_ALLOWED: false
      PR02_READY_FOR_EMISSION_GO: false
      REMOTE_GO: 'DENIED'
      HISTORICAL_042_REEMISSION_FORBIDDEN: true
    }>
  }>
>

export const AWS_TARGET_ARCHITECTURE: Readonly<{
  readonly CLOUD_PROVIDER_TARGET: 'AWS'
  readonly AWS_ARCHITECTURE_SELECTED: true
  readonly AWS_IAC_IMPLEMENTED: true
  readonly AWS_RESOURCES_PROVISIONED: false
  readonly AWS_REAL_CONNECTIVITY_TESTED: false
  readonly DYNAMODB_INCLUDED_IN_INITIAL_TARGET: false
  readonly OIDC_DEPLOYED_IN_INITIAL_TARGET: false
  readonly MTLS_DEPLOYED_IN_INITIAL_TARGET: false
  readonly PUBLIC_ENDPOINT_DEPLOYED: false
  readonly SIGNING_KEY_PURPOSE: 'ATTESTATION_SIGNING'
  readonly SIGNING_KEY_SPEC: 'ECC_NIST_EDWARDS25519'
  readonly SIGNING_KEY_USAGE: 'SIGN_VERIFY'
  readonly SIGNING_PRIVATE_KEY_EXPORT: 'FORBIDDEN'
  readonly SIGNING_PRIVATE_KEY_IN_REPOSITORY: false
  readonly SIGNING_PRIVATE_KEY_IN_RUNTIME_FILESYSTEM: false
  readonly SIGNING_KEY_REUSED_FOR_RDS: false
  readonly RDS_ENCRYPTION_KEY_REUSED_FOR_SIGNING: false
  readonly POSTGRES_DEDICATED: true
  readonly POSTGRES_SHARED_WITH_POS: false
  readonly POSTGRES_SUPABASE: false
  readonly PUBLICLY_ACCESSIBLE: false
  readonly TLS_REQUIRED: true
  readonly DATABASE_ENCRYPTED_AT_REST: true
  readonly DATABASE_NAME_DEDICATED: true
  readonly UNRESTRICTED_POSTGRES_INGRESS: false
  readonly INGRESS_0_0_0_0_5432: false
  readonly REPOSITORY_DATABASE_SECRET: false
  readonly HARDCODED_DATABASE_PASSWORD: false
  readonly DATABASE_URL_WITH_PASSWORD_IN_REPO: false
}>

export const AWS_PREFLIGHT_STATES: Readonly<{
  readonly CONFIGURATION_INVALID: 'CONFIGURATION_INVALID'
  readonly CONFIGURATION_VALID: 'CONFIGURATION_VALID'
  readonly AWS_CREDENTIALS_NOT_CHECKED: 'AWS_CREDENTIALS_NOT_CHECKED'
  readonly AWS_CONNECTIVITY_NOT_CHECKED: 'AWS_CONNECTIVITY_NOT_CHECKED'
  readonly AWS_RESOURCES_NOT_PROVISIONED: 'AWS_RESOURCES_NOT_PROVISIONED'
  readonly READY_FOR_CONTROLLED_CONNECTIVITY_CHECK: 'READY_FOR_CONTROLLED_CONNECTIVITY_CHECK'
}>

export const AWS_IAC_CHECK_IDS: readonly string[]

export interface AwsIacCheckResult {
  readonly id: string
  readonly title: string
  readonly passed: boolean
  readonly reason: string
}

export interface AwsIacStaticReadinessReport {
  readonly valid: boolean
  readonly status: 'AWS_IAC_STATIC_VALID' | 'AWS_IAC_STATIC_INVALID'
  readonly iacDir: string
  readonly cloudProviderTarget: 'AWS'
  readonly totalChecks: number
  readonly passedChecks: number
  readonly failedChecks: number
  readonly checks: readonly AwsIacCheckResult[]
  readonly invariants: Readonly<Record<string, unknown>>
}

export function validateAwsIacStaticReadiness(options?: {
  readonly iacDir?: string
  readonly files?: Record<string, string>
}): AwsIacStaticReadinessReport

export function evaluateAwsControlledPreflight(
  env?: Record<string, string | undefined>,
  options?: {
    readonly iacDir?: string
    readonly files?: Record<string, string>
    readonly checkAmbientFiscalVars?: boolean
  }
): Readonly<{
  status: string
  cloudProviderTarget: 'AWS'
  optInRequired: true
  optInEnabled: boolean
  mutatingOperationsExecuted: 0
  awsApiCallsExecuted: 0
  configurationValid: boolean
  iacStaticValid: boolean
  states: Readonly<{
    CONFIGURATION_VALID: boolean
    AWS_CREDENTIALS_NOT_CHECKED: true
    AWS_CONNECTIVITY_NOT_CHECKED: true
    AWS_RESOURCES_NOT_PROVISIONED: true
    AWS_PRODUCTION_READY: false
    PRODUCTION_VALIDATED: false
    PRODUCTION_APPROVED: false
    REAL_INTEGRATION_TESTED: false
    REAL_POSTGRESQL_CONNECTED: false
    REAL_KMS_CONNECTED: false
    REAL_OIDC_CONNECTED: false
    REAL_MTLS_CONNECTED: false
    EXTERNAL_AUTHORITY_DEPLOYED: false
    AUTHORITY_REAL_WORLD_AVAILABLE: false
    P1_IMPORT_ALLOWED: false
    PR02_READY_FOR_EMISSION_GO: false
    REMOTE_GO: 'DENIED'
  }>
  iacReport: AwsIacStaticReadinessReport
  safeFingerprint: SafeConfigurationFingerprint
  errors: readonly Readonly<{ code: string; message: string }>[]
}>
