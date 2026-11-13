export const PR02_P0_SCOPE: string
export const PR02_P1_SCOPE: string
export const PR02_P1_LEGACY_SCOPE: string
export const PR02_P2_SCOPE: string
export const PR02_PARAMETERS_ALLOWED_SCOPES: readonly string[]

export const PR02_PARAMETERS_TARGET_PROJECT_REF: string
export const PR02_PARAMETERS_TARGET_REVISION: number
export const PR02_PARAMETERS_HISTORICAL_REVISION: number
export const PR02_PARAMETERS_EXPECTED_ISSUER_CUIT: string
export const PR02_PARAMETERS_EXPECTED_ISSUER_PV: number
export const PR02_P0_COLECTOR_IDENTIDAD: string
export const REV3_SOURCE_SHA256: string
export const PR02_CATALOG_REV3_HASH: string

export function computeCatalogRowDigest(row: {
  revision: number
  condiciones: unknown
  alicuotas: unknown
  fuente_sha256: string
  consultado_en: string | Date
  vence_en: string | Date
  habilitado: boolean
}): string

export const PR02_EXECUTION_OUTCOMES: {
  readonly NOT_STARTED: string
  readonly PREFLIGHT_FAILED_NO_WRITE: string
  readonly TRANSACTION_ROLLED_BACK_CONFIRMED: string
  readonly WRITE_COMMITTED: string
  readonly WRITE_COMMITTED_POSTCHECK_FAILED: string
  readonly COMMIT_OUTCOME_UNKNOWN: string
  readonly ROLLBACK_OUTCOME_UNKNOWN: string
  readonly CONNECTION_CLOSE_FAILED_AFTER_COMMIT: string
}

export const UNCERTAIN_WRITE_RETRY_FORBIDDEN: true

export const PR02_PARAMETERS_REQUIRED_CALLS: readonly string[]
export const PR02_PARAMETERS_PROHIBITED_CALLS: readonly string[]

export const PR02_PARAMETERS_CALL_LIMITS_REUSABLE: {
  readonly loginCmsMax: number
  readonly tiposIvaMax: number
  readonly condicionIvaReceptorMax: number
  readonly totalMax: number
}

export const PR02_PARAMETERS_CALL_LIMITS_NON_REUSABLE: {
  readonly loginCmsMax: number
  readonly tiposIvaMax: number
  readonly condicionIvaReceptorMax: number
  readonly totalMax: number
}

export const FECAESOLICITAR_REACHABLE: false
export const FECOMPCONSULTAR_REACHABLE: false
export const PR02_P1_EMISSION_CAPABLE: false
export const PR02_P2_EMISSION_CAPABLE: false
export const EMITTER_ENABLE_DURING_PR02_PARAMETERS: false
export const REVISION_3_MUTATED: false
export const REVISION_4_INSERT_ONLY: true

export function isArcaOperationPermitted(operation: unknown): boolean
export function assertNoProhibitedOperation(operation: unknown): void

export interface Pr02ParametersCallTracker {
  readonly loginCmsCount: number
  readonly tiposIvaCount: number
  readonly condicionIvaReceptorCount: number
  readonly totalCalls: number
  readonly isTaReusable: boolean
  recordCall(operation: string): void
  verifyLimits(): void
}

export function createPr02ParametersCallTracker(isTaReusable?: boolean): Pr02ParametersCallTracker

export interface ExistingTaEvaluation {
  readonly reusable: boolean
  readonly loginCmsRequired: boolean
  readonly expiration: string | null
  readonly reason: string
}

export function evaluateExistingTa(taRecord: unknown, now?: Date | string | number): ExistingTaEvaluation

export function validateTiposIvaEvidence(text: string, expectedChecksum?: string): {
  readonly count: number
  readonly hash: string
  readonly rates: unknown[]
}

export function validateCondicionIvaReceptorEvidence(text: string, expectedChecksum?: string): {
  readonly count: number
  readonly hash: string
  readonly conditions: unknown[]
}

export const PR02_P0_AUTHORITY_ENV: string
export const PR02_P0_GO_PUBLIC_KEY_ENV: string
export const PR02_P0_ATTESTATION_PUBLIC_KEY_ENV: string
export const PR02_P0_ATTESTATION_REPLAY_DIR_ENV: string
export const PR02_P0_GO_AUTHORITY_ENV: string
export const PR02_P0_ATTESTATION_ENDPOINT_ENV: string
export const PR02_P0_ATTESTATION_AUTHORITY_ID_ENV: string
export const PR02_P0_ATTESTATION_KEY_ID_ENV: string
export const PR02_P0_COMPROMISED_SECRETS: readonly string[]
export const PR02_P0_COMPROMISED_KEYS: readonly string[]
export const ANTI_REPLAY_GUARANTEE_LEVEL: 'HOST_LOCAL_DURABLE_ONE_TIME_USE'
export const AUTHORITY_ADAPTER_IMPLEMENTED: true
export const EXTERNAL_AUTHORITY_SERVICE_IMPLEMENTED: true
export const AUTHORITY_REAL_WORLD_AVAILABLE: false

export function validateAttestationEndpointUrl(
  endpoint: string,
  options?: { readonly allowHttp?: boolean }
): string

export function assertAuthoritiesSeparated(params?: {
  goAuthorityId?: string
  trustedGoAuthorityId?: string
  goApproverId?: string
  attestationAuthorityId?: string
  authorityId?: string
  expectedAuthorityId?: string
  goKeyId?: string
  trustedGoKeyId?: string
  attestationKeyId?: string
  keyId?: string
  expectedKeyId?: string
  trustedGoPublicKey?: unknown
  goPublicKey?: unknown
  trustedAttestationPublicKey?: unknown
  authorityPublicKey?: unknown
  publicKeySpki?: unknown
  goAuthorizationDoc?: unknown
  allowTestKeys?: boolean
}): true

export const ATTESTATION_SIGNER_ORIGINS: {
  readonly TEST_SIGNER: 'TEST_SIGNER'
  readonly PRODUCTION_ATTESTATION_AUTHORITY: 'PRODUCTION_ATTESTATION_AUTHORITY'
}

export const ATTESTATION_AUTHORITY_TYPES: {
  readonly PRODUCTION_AUTHORITY: 'PRODUCTION_AUTHORITY'
  readonly TEST_AUTHORITY: 'TEST_AUTHORITY'
}

export const ATTESTATION_ALLOWED_ALGORITHMS: readonly ['Ed25519']

export const ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL: 'HOST_LOCAL_DURABLE_ONE_TIME_USE'

export function isAttestationResponseConsumedProcessLocal(responseKey: string): boolean
export function consumeAttestationResponseProcessLocal(responseKey: string): boolean
export function serializeCanonicalAttestationResponseReplayIdentity(response: unknown): string
export function computeAttestationResponseReplayId(response: unknown): string
export function validateAttestationReplayDirectory(
  dirPath: unknown,
  options?: { repoRoot?: string; createIfMissing?: boolean }
): string
export function computePublicKeyId(pubKeyInput: unknown): string

export const ATTESTATION_TRUST_MODELS: {
  readonly SELF_ATTESTED: 'SELF_ATTESTED'
  readonly INDEPENDENT_ATTESTED: 'INDEPENDENT_ATTESTED'
  readonly TEST_ONLY: 'TEST_ONLY'
  readonly UNVERIFIED: 'UNVERIFIED'
}

export const EVIDENCE_INTEGRITY_STATES: {
  readonly PASS: 'PASS'
  readonly FAIL: 'FAIL'
  readonly NOT_RUN: 'NOT_RUN'
}

export const TRUSTED_EXECUTION_BOUNDARY_STATES: {
  readonly VERIFIED: 'VERIFIED'
  readonly UNVERIFIED: 'UNVERIFIED'
}

export function verifyRuntimeSigningIsolation(options?: {
  fiscalScriptsDir?: string
  env?: Record<string, string | undefined>
  forceRescan?: boolean
}): {
  readonly valid: boolean
  readonly reason?: string
  readonly file?: string
  readonly detail?: string
  readonly productionSigningInRuntime?: boolean
  readonly privateKeysDetected?: number
}
export function assertRuntimeSigningIsolation(options?: { fiscalScriptsDir?: string }): void

export interface AttestationRequestArtifact {
  readonly name: string
  readonly sha256: string
}

export interface AttestationRequestPackage {
  readonly schemaVersion: '1.0'
  readonly requestId: string
  readonly processId: string
  readonly executionScope: string
  readonly commitSha: string
  readonly environment: 'HOMOLOGACION'
  readonly authorizationId: string
  readonly goAuthorizationDocumentSha256: string
  readonly manifestSha256: string
  readonly rawSoapArtifacts: readonly AttestationRequestArtifact[]
  readonly normalizedArtifacts: readonly AttestationRequestArtifact[]
  readonly consultadoEn: string
  readonly requestedAt: string
  readonly collectorIdentity: string
  readonly requestSha256: string
}

export function serializeCanonicalAttestationRequest(req: unknown): string
export function computeAttestationRequestDigest(req: unknown): string
export function validateAttestationRequest(
  req: unknown,
  options?: { expectedCommitSha?: string; manifest?: unknown }
): {
  readonly valid: true
  readonly requestSha256: string
  readonly canonicalJson: string
}
export function createAttestationRequest(params: {
  manifest: unknown
  commitSha?: string
  authorizationId?: string
  goAuthorizationDocumentSha256?: string
  requestedAt?: string | number | Date
  requestId?: string
}): AttestationRequestPackage

export function assertNoSelfAttestationElevation(
  params?: Record<string, unknown>,
  env?: Record<string, string | undefined>
): void

export function isTestAuthorityKey(secret: unknown): boolean
export function parseEd25519PublicKey(raw: unknown, name?: string): import('node:crypto').KeyObject
export function validateP0GoPublicKey(keyInput: unknown, allowTestKeys?: boolean): import('node:crypto').KeyObject
export function validateP0AttestationPublicKey(keyInput: unknown, allowTestKeys?: boolean): import('node:crypto').KeyObject
export function validateP0AuthoritySecret(secret: unknown, allowTestKeys?: boolean): import('node:crypto').KeyObject
export function validateP0GoAuthoritySecret(secret: unknown, allowTestKeys?: boolean): import('node:crypto').KeyObject

export function getConsumedAuthorizationFilePath(authId: unknown, options?: { consumedAuthorizationsDir?: string }): {
  targetPath: string
  realBase: string
  cleanId: string
  idDigest: string
}
export function isGoAuthorizationConsumedDurable(authId: unknown, options?: { consumedAuthorizationsDir?: string }): boolean
export function consumeGoAuthorizationDurable(authId: unknown, options?: { consumedAuthorizationsDir?: string; now?: string | number | Date }): void
export function markGoAuthorizationConsumed(authId: unknown, options?: { consumedAuthorizationsDir?: string }): void
export function isGoAuthorizationConsumed(authId: unknown, options?: { consumedAuthorizationsDir?: string }): boolean

export interface GoAuthorityInterface {
  readonly validateAuthorization: typeof validatePr02P0GoAuthorization
  readonly validatePublicKey: typeof validateP0GoPublicKey
  readonly validateSecret: typeof validateP0GoPublicKey
  readonly consumeAuthorizationDurable: typeof consumeGoAuthorizationDurable
  readonly isConsumed: typeof isGoAuthorizationConsumedDurable
  readonly markConsumed: typeof consumeGoAuthorizationDurable
  readonly ANTI_REPLAY_GUARANTEE_LEVEL: 'HOST_LOCAL_DURABLE_ONE_TIME_USE'
}
export const GoAuthority: GoAuthorityInterface

export interface Pr02P0GoAuthorizationDoc {
  readonly version?: string
  readonly identificador?: string
  readonly aprobador_identidad?: string
  readonly scope?: string
  readonly project_ref?: string
  readonly entorno?: string
  readonly commit_sha?: string
  readonly operaciones_permitidas?: readonly string[]
  readonly limites?: {
    readonly loginCmsMax: number
    readonly tiposIvaMax: number
    readonly condicionIvaReceptorMax: number
    readonly totalMax: number
  }
  readonly emitido_en?: string
  readonly vence_en?: string
  readonly single_use_nonce?: string
}

export interface Pr02P0SignedGoAuthorization {
  readonly authorization: Pr02P0GoAuthorizationDoc
  readonly signature: string
}

export function validatePr02P0GoAuthorization(
  signedGoDoc: unknown,
  options?: {
    expectedHead?: string
    trustedGoPublicKey?: unknown
    trustedGoAuthoritySecret?: unknown
    allowTestKeys?: boolean
    consumedAuthorizationsDir?: string
    now?: string | number | Date
  }
): {
  readonly valid: true
  readonly authorizationId: string
  readonly approverId: string
  readonly scope: string
  readonly projectRef: string
  readonly commitSha: string
  readonly documentSha256: string
  readonly canonicalDocument: Pr02P0GoAuthorizationDoc
  readonly expiresAt: string
  readonly issuedAt: string
  readonly singleUseNonce: string
}

export interface Pr02P0Attestation {
  readonly version: string
  readonly processId: string
  readonly executionId: string
  readonly executionScope: string
  readonly commitSha: string
  readonly consultadoEn: string
  readonly entorno: string
  readonly transportType: string
  readonly executorIdentity?: string
  readonly operacionesWsfe?: readonly string[]
  readonly ivaRawSha: string
  readonly ivaNormSha: string
  readonly condRawSha: string
  readonly condNormSha: string
  readonly goAuthorizationId?: string | null
  readonly goAuthorizationSha256?: string | null
  readonly goAuthorization?: string | null
  readonly requestId?: string
  readonly requestSha256?: string
  readonly manifestSha256?: string
  readonly signerOrigin?: 'TEST_SIGNER' | 'PRODUCTION_ATTESTATION_AUTHORITY'
  readonly issuedAt: string
  readonly expiresAt?: string
  readonly signature: string | null
  readonly accredited: boolean
  readonly provenance: string
  readonly EVIDENCE_INTEGRITY?: 'PASS' | 'FAIL' | 'NOT_RUN'
  readonly EVIDENCE_CUSTODY_ATTESTED?: boolean
  readonly ATTESTATION_TRUST_MODEL?: 'SELF_ATTESTED' | 'INDEPENDENT_ATTESTED' | 'UNVERIFIED'
  readonly TRUSTED_EXECUTION_BOUNDARY?: 'VERIFIED' | 'UNVERIFIED'
  readonly ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED?: boolean
  readonly INDEPENDENT_ATTESTATION_AVAILABLE?: boolean
  readonly P1_IMPORT_ALLOWED?: boolean
  readonly trustModel?: string
  readonly antiReplayGuarantee?: string
}

export function createP0Attestation(params?: {
  manifest: unknown
  commitSha?: string
  transportType?: string
  authoritySecret?: string
  goAuthorizationId?: string
  goAuthorizationSha256?: string
  goAuthorization?: string | unknown
  executorIdentity?: string
  operacionesWsfe?: readonly string[]
  now?: string | number | Date
  env?: Record<string, string | undefined>
}): Pr02P0Attestation

export function verifyIndependentAttestation(
  attestation: unknown,
  options?: {
    manifest?: unknown
    attestationRequest?: unknown
    commitSha?: string
    trustedAttestationPublicKey?: unknown
    authoritySecret?: unknown
    trustedGoPublicKey?: unknown
    trustedGoAuthoritySecret?: unknown
    goAuthorizationId?: string
    goAuthorizationSha256?: string
    allowTestKeys?: boolean
    fiscalScriptsDir?: string
    now?: string | number | Date
    env?: Record<string, string | undefined>
  }
): {
  readonly valid: boolean
  readonly reason?: string
  readonly errorCategory?: string
  readonly trustModel?: 'SELF_ATTESTED' | 'INDEPENDENT_ATTESTED' | 'UNVERIFIED'
  readonly ATTESTATION_TRUST_MODEL?: 'SELF_ATTESTED' | 'INDEPENDENT_ATTESTED' | 'UNVERIFIED'
  readonly EVIDENCE_INTEGRITY?: 'PASS' | 'FAIL' | 'NOT_RUN'
  readonly EVIDENCE_CUSTODY_ATTESTED?: boolean
  readonly TRUSTED_EXECUTION_BOUNDARY?: 'VERIFIED' | 'UNVERIFIED'
  readonly ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED?: false
  readonly INDEPENDENT_ATTESTATION_AVAILABLE?: boolean
  readonly P1_IMPORT_ALLOWED?: boolean
  readonly signerOrigin?: 'TEST_SIGNER' | 'PRODUCTION_ATTESTATION_AUTHORITY'
}

export function verifyP0Attestation(
  attestation: unknown,
  options?: {
    manifest?: unknown
    attestationRequest?: unknown
    commitSha?: string
    trustedAttestationPublicKey?: unknown
    authoritySecret?: unknown
    trustedGoPublicKey?: unknown
    trustedGoAuthoritySecret?: unknown
    goAuthorizationId?: string
    goAuthorizationSha256?: string
    allowTestKeys?: boolean
    fiscalScriptsDir?: string
    now?: string | number | Date
    env?: Record<string, string | undefined>
  }
): ReturnType<typeof verifyIndependentAttestation>

export type AttestationAuthorityType = 'PRODUCTION_AUTHORITY' | 'TEST_AUTHORITY'
export type AttestationAllowedAlgorithm = 'Ed25519'
export type AttestationSignerOrigin = 'TEST_SIGNER' | 'PRODUCTION_ATTESTATION_AUTHORITY'

export type AttestationRejectionReason =
  | 'ATTESTATION_RESPONSE_MISSING'
  | 'ATTESTATION_RESPONSE_INVALID'
  | 'ATTESTATION_REQUEST_MISMATCH'
  | 'ATTESTATION_MANIFEST_MISMATCH'
  | 'ATTESTATION_PAYLOAD_MISMATCH'
  | 'ATTESTATION_AUTHORITY_MISMATCH'
  | 'ATTESTATION_KEY_ID_MISMATCH'
  | 'ATTESTATION_ALGORITHM_FORBIDDEN'
  | 'ATTESTATION_SIGNATURE_INVALID'
  | 'ATTESTATION_ISSUED_AT_INVALID'
  | 'ATTESTATION_TEST_SIGNER_PROHIBITED'
  | 'ATTESTATION_RESPONSE_REPLAY_DETECTED'
  | 'COLLAPSED_AUTHORITIES_REJECTED'
  | 'PUBLIC_KEY_SUBSTITUTION_REJECTED'
  | 'INDEPENDENT_ATTESTATION_AUTHORITY_NOT_AVAILABLE'
  | 'SELF_ATTESTATION_AUTO_ELEVATION_REJECTED'
  | 'RUNTIME_PRIVATE_KEY_DETECTED'
  | 'GO_AUTHORITY_KEY_INVALID'

export interface AttestationResponse {
  readonly schemaVersion: '1.0'
  readonly responseId: string
  readonly attestationId?: string
  readonly authorityType: AttestationAuthorityType
  readonly authorityId: string
  readonly keyId: string
  readonly algorithm: AttestationAllowedAlgorithm
  readonly requestId: string
  readonly requestSha256: string
  readonly manifestSha256: string
  readonly processId: string
  readonly executionScope: string
  readonly commitSha: string
  readonly environment: 'HOMOLOGACION'
  readonly authorizationId: string
  readonly goAuthorizationDocumentSha256: string
  readonly rawSoapArtifacts: readonly AttestationRequestArtifact[]
  readonly normalizedArtifacts: readonly AttestationRequestArtifact[]
  readonly consultadoEn: string
  readonly issuedAt: string
  readonly expiresAt?: string
  readonly signerOrigin: AttestationSignerOrigin
  readonly attestationPayloadSha256: string
  readonly signature: string
}

export interface AttestationResponseVerificationOptions {
  readonly attestationRequest?: AttestationRequestPackage | unknown
  readonly manifest?: Pr02P0OfficialEvidenceManifest | unknown
  readonly commitSha?: string
  readonly expectedHead?: string
  readonly trustedAttestationPublicKey?: unknown
  readonly authorityPublicKey?: unknown
  readonly publicKeySpki?: unknown
  readonly pinnedPublicKeySpki?: unknown
  readonly expectedPublicKeySpki?: unknown
  readonly authoritySecret?: unknown
  readonly trustedGoPublicKey?: unknown
  readonly goAuthorityId?: string
  readonly trustedGoAuthorityId?: string
  readonly goApproverId?: string
  readonly goKeyId?: string
  readonly trustedGoKeyId?: string
  readonly goAuthorizationDoc?: unknown
  readonly allowedAuthorityIds?: readonly string[] | Set<string>
  readonly authorityId?: string
  readonly expectedAuthorityId?: string
  readonly allowedKeyIds?: readonly string[] | Set<string>
  readonly keyId?: string
  readonly expectedKeyId?: string
  readonly pinnedKeyId?: string
  readonly allowTestKeys?: boolean
  readonly isTestAuthority?: boolean
  readonly fiscalScriptsDir?: string
  readonly env?: Record<string, string | undefined>
  readonly now?: string | number | Date
  readonly checkReplay?: boolean
  readonly consumedResponsesDir?: string
  readonly attestationReplayDir?: string
  readonly replayRegistryDir?: string
  readonly repoRoot?: string
  readonly fsWriteExclusive?: (targetPath: string, content: string) => void
  readonly enforceAntiReplay?: boolean
  readonly consumeOnVerify?: boolean
  readonly allowProcessLocalFallback?: boolean
  readonly degradeToProcessLocal?: boolean
  readonly fallbackToMemory?: boolean
  readonly processLocal?: unknown
  readonly fallback?: unknown
  readonly allowMemoryReplay?: boolean
  readonly disableDurableReplay?: boolean
  readonly skipReplayStorage?: boolean
  readonly inMemoryReplay?: boolean
  readonly antiReplayGuarantee?: string
  readonly skipVerification?: boolean
  readonly preVerified?: boolean
  readonly trustPreviousVerify?: boolean
  readonly verified?: boolean
  readonly independentAuthorityAvailable?: boolean
  readonly elevateToIndependent?: boolean
  readonly forceIndependentAttestation?: boolean
  readonly allowSelfAttestedAsIndependent?: boolean
  readonly elevateTrustModel?: boolean
  readonly forceProductionAuthority?: boolean
}

export interface AttestationResponseVerificationResult {
  readonly valid: boolean
  readonly consumed: boolean
  readonly ATTESTATION_RESPONSE_CONSUMPTION: 'NOT_CONSUMED' | 'CONSUMED'
  readonly replayId?: string
  readonly responseId?: string
  readonly attestationId?: string
  readonly consumedAt?: string
  readonly reason: 'VERIFIED' | 'VERIFIED_TEST_ONLY' | AttestationRejectionReason | 'ATTESTATION_REPLAY_STORAGE_INVALID'
  readonly errorCategory?: string
  readonly detail?: string
  readonly authorityType?: AttestationAuthorityType
  readonly authorityId?: string
  readonly keyId?: string
  readonly algorithm?: AttestationAllowedAlgorithm
  readonly requestId?: string
  readonly requestSha256?: string
  readonly manifestSha256?: string
  readonly attestationPayloadSha256?: string
  readonly trustScope?: 'PRODUCTION_ATTESTED' | 'TEST_ONLY'
  readonly trustModel?: 'INDEPENDENT_ATTESTED' | 'TEST_ONLY' | 'UNVERIFIED'
  readonly ATTESTATION_TRUST_MODEL: 'INDEPENDENT_ATTESTED' | 'TEST_ONLY' | 'UNVERIFIED'
  readonly PRODUCTION_ATTESTED: boolean
  readonly OFFICIAL_PROVENANCE_VERIFIED: boolean
  readonly ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED: false
  readonly EVIDENCE_CUSTODY_ATTESTED: boolean
  readonly TRUSTED_EXECUTION_BOUNDARY: 'VERIFIED' | 'UNVERIFIED'
  readonly INDEPENDENT_ATTESTATION_AVAILABLE: boolean
  readonly P1_IMPORT_ALLOWED: boolean
  readonly antiReplayGuarantee: 'HOST_LOCAL_DURABLE_ONE_TIME_USE'
}

export function serializeCanonicalAttestationResponsePayload(res: unknown): string
export function computeAttestationResponsePayloadDigest(res: unknown): string
export function verifyAttestationResponse(
  response: unknown,
  options?: AttestationResponseVerificationOptions
): AttestationResponseVerificationResult
export function validateAttestationResponse(
  response: unknown,
  options?: AttestationResponseVerificationOptions
): AttestationResponseVerificationResult
export function isAttestationResponseConsumedDurable(
  response: unknown,
  options?: AttestationResponseVerificationOptions
): boolean
export function consumeAttestationResponseDurable(
  response: unknown,
  options?: AttestationResponseVerificationOptions
): AttestationResponseVerificationResult
export function reserveAttestationResponseDurable(
  response: unknown,
  options?: AttestationResponseVerificationOptions
): AttestationResponseVerificationResult

export type AttestationAuthorityTransportFn = (
  requestPkg: AttestationRequestPackage
) => Promise<AttestationResponse> | AttestationResponse

export interface AttestationAuthorityTransportObject {
  sendAttestationRequest(requestPkg: AttestationRequestPackage): Promise<AttestationResponse> | AttestationResponse
}

export interface IndependentAttestationAuthorityAdapterConfig {
  readonly authorityId?: string
  readonly expectedAuthorityId?: string
  readonly keyId?: string
  readonly expectedKeyId?: string
  readonly pinnedKeyId?: string
  readonly endpoint?: string | null
  readonly endpointUrl?: string | null
  readonly allowHttp?: boolean
  readonly allowedAuthorityIds?: readonly string[] | Set<string>
  readonly trustedAttestationPublicKey?: unknown
  readonly authorityPublicKey?: unknown
  readonly publicKeySpki?: unknown
  readonly pinnedPublicKeySpki?: unknown
  readonly expectedPublicKeySpki?: unknown
  readonly trustedGoPublicKey?: unknown
  readonly goAuthorityId?: string
  readonly trustedGoAuthorityId?: string
  readonly goApproverId?: string
  readonly goKeyId?: string
  readonly trustedGoKeyId?: string
  readonly goAuthorizationDoc?: unknown
  readonly allowedKeyIds?: readonly string[] | Set<string>
  readonly transport?: AttestationAuthorityTransportFn | AttestationAuthorityTransportObject
  readonly allowTestKeys?: boolean
  readonly requireAvailable?: boolean
  readonly manifest?: Pr02P0OfficialEvidenceManifest | unknown
  readonly commitSha?: string
  readonly fiscalScriptsDir?: string
  readonly env?: Record<string, string | undefined>
  readonly now?: string | number | Date
  readonly consumedResponsesDir?: string
  readonly attestationReplayDir?: string
  readonly replayRegistryDir?: string
  readonly repoRoot?: string
  readonly fsWriteExclusive?: (targetPath: string, content: string) => void
  readonly enforceAntiReplay?: boolean
  readonly consumeOnVerify?: boolean
  readonly allowProcessLocalFallback?: boolean
  readonly degradeToProcessLocal?: boolean
  readonly fallbackToMemory?: boolean
  readonly processLocal?: unknown
  readonly fallback?: unknown
  readonly allowMemoryReplay?: boolean
  readonly disableDurableReplay?: boolean
  readonly skipReplayStorage?: boolean
  readonly inMemoryReplay?: boolean
  readonly antiReplayGuarantee?: string
  readonly independentAuthorityAvailable?: boolean
  readonly INDEPENDENT_ATTESTATION_AVAILABLE?: boolean
  readonly authorityRealWorldAvailable?: boolean
  readonly AUTHORITY_REAL_WORLD_AVAILABLE?: boolean
  readonly elevateToIndependent?: boolean
  readonly forceIndependentAttestation?: boolean
  readonly allowSelfAttestedAsIndependent?: boolean
  readonly elevateTrustModel?: boolean
  readonly forceProductionAuthority?: boolean
  readonly P1_IMPORT_ALLOWED?: boolean
  readonly ATTESTATION_TRUST_MODEL?: string
  readonly fallbackToLocalSigner?: unknown
  readonly localFallbackSigner?: unknown
  readonly fallbackSigner?: unknown
  readonly signLocallyOnFailure?: unknown
  readonly useLocalSigner?: unknown
  readonly enableLocalSigningFallback?: unknown
  readonly localPrivateKey?: unknown
  readonly privateKey?: unknown
  readonly authorityPrivateKey?: unknown
  readonly secretKey?: unknown
  readonly autoDiscoverRemoteAuthority?: boolean
  readonly implicitNetworkAccess?: boolean
  readonly timeoutMs?: number
  readonly maxResponseSizeBytes?: number
  readonly fetchImpl?: typeof fetch
}

export interface SubmitAttestationRequestResult {
  readonly valid: true
  readonly request: AttestationRequestPackage
  readonly response: AttestationResponse
  readonly verification: AttestationResponseVerificationResult
}

export function submitAttestationRequest(
  requestPkg: AttestationRequestPackage,
  adapterOrConfig?: IndependentAttestationAuthorityAdapterConfig
): Promise<SubmitAttestationRequestResult>

export interface IndependentAttestationAuthorityAdapterInstance {
  readonly adapterVersion: '1.0'
  readonly authorityId: string | null
  readonly keyId: string | null
  readonly publicKeySpki: string | null
  readonly allowedAuthorityIds: readonly string[]
  readonly allowedKeyIds: readonly string[]
  readonly endpoint: string | null
  readonly algorithm: 'Ed25519'
  readonly transportContract: IndependentAttestationAuthorityTransportContract
  readonly AUTHORITY_ADAPTER_IMPLEMENTED: true
  readonly EXTERNAL_AUTHORITY_SERVICE_IMPLEMENTED: true
  readonly EXTERNAL_AUTHORITY_ENDPOINT_CONFIGURED: boolean
  readonly AUTHORITY_REAL_WORLD_AVAILABLE: false
  readonly ATTESTATION_TRUST_MODEL: 'SELF_ATTESTED'
  readonly INDEPENDENT_ATTESTATION_AVAILABLE: false
  readonly P1_IMPORT_ALLOWED: false
  readonly antiReplayGuarantee: 'HOST_LOCAL_DURABLE_ONE_TIME_USE'
  readonly isConfigured: () => boolean
  readonly isEndpointConfigured: () => boolean
  readonly isAuthorityAvailable: () => false
  readonly createAttestationRequest: typeof createAttestationRequest
  readonly validateAttestationRequest: typeof validateAttestationRequest
  readonly submitAttestationRequest: (
    requestPkg: AttestationRequestPackage,
    submitOptions?: IndependentAttestationAuthorityAdapterConfig
  ) => Promise<SubmitAttestationRequestResult>
  readonly verifyAttestationResponse: (
    response: unknown,
    verifyOptions?: AttestationResponseVerificationOptions
  ) => AttestationResponseVerificationResult
  readonly validateAttestationResponse: (
    response: unknown,
    verifyOptions?: AttestationResponseVerificationOptions
  ) => AttestationResponseVerificationResult
  readonly consumeAttestationResponse: (
    response: unknown,
    consumeOptions?: AttestationResponseVerificationOptions
  ) => AttestationResponseVerificationResult
  readonly reserveAttestationResponse: (
    response: unknown,
    consumeOptions?: AttestationResponseVerificationOptions
  ) => AttestationResponseVerificationResult
  readonly isAttestationResponseConsumed: (
    response: unknown,
    checkOptions?: AttestationResponseVerificationOptions
  ) => boolean
  readonly signProductionAttestation: () => never
  readonly accessProductionPrivateKey: () => never
  readonly fallbackToLocalSigner: () => never
}

export function assertAdapterConfigSecurity(config?: Record<string, unknown>): void

export function createIndependentAttestationAuthorityAdapter(
  config?: IndependentAttestationAuthorityAdapterConfig
): IndependentAttestationAuthorityAdapterInstance

export const EXTERNAL_AUTHORITY_TRANSPORT_CONTRACT_VERSION: '1.0'
export const EXTERNAL_AUTHORITY_ENDPOINT_SPEC: {
  readonly method: 'POST'
  readonly defaultPath: '/attestations'
  readonly contentType: 'application/json'
}

export interface IndependentAttestationAuthorityTransport {
  readonly sendAttestationRequest: (
    requestPkg: AttestationRequestPackage
  ) => Promise<AttestationResponse>
}

export interface IndependentAttestationAuthorityTransportContract {
  readonly contractVersion: '1.0'
  readonly endpointSpec: {
    readonly method: 'POST'
    readonly defaultPath: '/attestations'
    readonly contentType: 'application/json'
  }
  readonly requestSchemaVersion: '1.0'
  readonly responseSchemaVersion: '1.0'
  readonly algorithm: 'Ed25519'
  readonly executionScope: typeof PR02_P0_SCOPE
  readonly environment: 'HOMOLOGACION'
  readonly prohibitedPayloadFields: readonly string[]
  readonly requiredRequestFields: readonly string[]
  readonly requiredResponseFields: readonly string[]
  readonly invariants: {
    readonly NO_PRIVATE_KEYS_IN_RUNTIME: true
    readonly NO_SECRET_TRANSMISSION: true
    readonly CANONICAL_SERIALIZATION_REQUIRED: true
    readonly GO_AND_ATTESTATION_AUTHORITIES_SEPARATED: true
    readonly VERIFY_BEFORE_CONSUME_REQUIRED: true
    readonly HOST_LOCAL_DURABLE_ONE_TIME_USE_REPLAY_PROTECTION: true
    readonly HONEST_AVAILABILITY_STATE: true
  }
}

export const IndependentAttestationAuthorityTransportContract: IndependentAttestationAuthorityTransportContract

export function isAttestationEndpointConfigured(options?: {
  readonly endpoint?: string
  readonly endpointUrl?: string
  readonly env?: Record<string, string | undefined>
}): boolean

export const LOCAL_TEST_AUTHORITY_AVAILABLE: boolean
export const EXTERNAL_AUTHORITY_ENDPOINT_REACHABLE: boolean
export const EXTERNAL_AUTHORITY_CRYPTOGRAPHICALLY_VERIFIED: boolean
export const PRODUCTION_TRUST_AVAILABLE: boolean
export const HISTORICAL_042_REEMISSION_FORBIDDEN: true
export const HISTORICAL_042_IDENTIFICATION: 'UNRESOLVED'

export interface ExternalAuthorityReadinessAssessment {
  readonly AUTHORITY_ADAPTER_IMPLEMENTED: true
  readonly EXTERNAL_AUTHORITY_SERVICE_IMPLEMENTED: true
  readonly EXTERNAL_AUTHORITY_DEPLOYMENT_READY: true
  readonly EXTERNAL_AUTHORITY_SERVICE_DEPLOYED: false
  readonly PRODUCTION_SIGNING_PROVIDER_CONFIGURED: false
  readonly LOCAL_TEST_AUTHORITY_AVAILABLE: true
  readonly EXTERNAL_AUTHORITY_ENDPOINT_CONFIGURED: boolean
  readonly EXTERNAL_AUTHORITY_ENDPOINT_REACHABLE: false
  readonly AUTHORITY_REAL_WORLD_AVAILABLE: false
  readonly EXTERNAL_AUTHORITY_CRYPTOGRAPHICALLY_VERIFIED: false
  readonly PRODUCTION_TRUST_AVAILABLE: false
  readonly INDEPENDENT_ATTESTATION_AVAILABLE: false
  readonly P1_IMPORT_ALLOWED: false
  readonly ATTESTATION_TRUST_MODEL: 'SELF_ATTESTED'
  readonly BLOCK_REASON: 'NO_GENUINELY_INDEPENDENT_AUTHORITY_ENVIRONMENT'
  readonly READINESS_STAGES: {
    readonly IMPLEMENTED: true
    readonly DEPLOYMENT_READY: true
    readonly CONFIGURED: boolean
    readonly DEPLOYED: false
    readonly REACHABLE: false
    readonly CRYPTOGRAPHICALLY_VERIFIED: false
    readonly REAL_WORLD_AVAILABLE: false
  }
}

export function evaluateExternalAuthorityReadiness(options?: {
  readonly endpoint?: string
  readonly endpointUrl?: string
  readonly env?: Record<string, string | undefined>
  readonly authorityId?: string
  readonly publicKeySpki?: string
  readonly keyId?: string
  readonly kmsKeyId?: string
}): ExternalAuthorityReadinessAssessment

export interface ExternalAuthoritySigner {
  readonly signerType: 'TEST_SIGNER' | 'PRODUCTION_EXTERNAL_SIGNER'
  readonly trustScope: 'TEST_ONLY' | 'PRODUCTION'
  readonly signerOrigin: string
  readonly authorityId: string | null
  readonly keyId: string | null
  readonly publicKeySpki: string | null
  readonly algorithm: 'Ed25519'
  readonly isProductionReady: () => boolean
  readonly sign: (canonicalPayload: string) => string
}

export function createExternalAuthoritySigner(config?: {
  readonly signerType?: 'TEST_SIGNER' | 'PRODUCTION_EXTERNAL_SIGNER'
  readonly authorityId?: string
  readonly keyId?: string
  readonly publicKeySpki?: string
  readonly allowTestKeys?: boolean
  readonly isTestSigner?: boolean
  readonly sign?: (payload: string) => string
  readonly signPayload?: (payload: string) => string
  readonly externalSignProvider?: { readonly sign: (payload: string) => string }
}): ExternalAuthoritySigner

export interface ExternalAttestationAuthorityServiceInstance {
  readonly serviceVersion: '1.0'
  readonly transportContract: IndependentAttestationAuthorityTransportContract
  readonly authorityId: string
  readonly keyId: string | null
  readonly publicKeySpki: string | null
  readonly signerType: string
  readonly trustScope: string
  readonly isProductionReady: () => boolean
  readonly handleRequest: (rawBodyOrPkg: string | AttestationRequestPackage | unknown) => Promise<AttestationResponse>
}

export function createExternalAttestationAuthorityService(options: {
  readonly signer: ExternalAuthoritySigner
  readonly authorityId?: string
  readonly keyId?: string
  readonly publicKeySpki?: string
}): ExternalAttestationAuthorityServiceInstance

export function executeHttpsAttestationTransport(
  endpointUrl: string,
  requestPkg: AttestationRequestPackage,
  options?: {
    readonly allowHttp?: boolean
    readonly timeoutMs?: number
    readonly maxResponseSizeBytes?: number
    readonly fetchImpl?: typeof fetch
  }
): Promise<AttestationResponse>

export interface IndependentAttestationAuthorityAdapterNamespace {
  readonly AUTHORITY_ADAPTER_IMPLEMENTED: true
  readonly EXTERNAL_AUTHORITY_SERVICE_IMPLEMENTED: true
  readonly AUTHORITY_REAL_WORLD_AVAILABLE: false
  readonly INDEPENDENT_ATTESTATION_AVAILABLE: false
  readonly transportContract: IndependentAttestationAuthorityTransportContract
  readonly TRANSPORT_CONTRACT_VERSION: '1.0'
  readonly ENDPOINT_SPEC: typeof EXTERNAL_AUTHORITY_ENDPOINT_SPEC
  readonly ENDPOINT_ENV: string
  readonly AUTHORITY_ID_ENV: string
  readonly KEY_ID_ENV: string
  readonly validateAttestationEndpointUrl: typeof validateAttestationEndpointUrl
  readonly isEndpointConfigured: typeof isAttestationEndpointConfigured
  readonly executeHttpsTransport: typeof executeHttpsAttestationTransport
  readonly createExternalAuthoritySigner: typeof createExternalAuthoritySigner
  readonly createExternalService: typeof createExternalAttestationAuthorityService
  readonly createAdapter: typeof createIndependentAttestationAuthorityAdapter
  readonly createAttestationRequest: typeof createAttestationRequest
  readonly validateAttestationRequest: typeof validateAttestationRequest
  readonly submitAttestationRequest: typeof submitAttestationRequest
  readonly verifyAttestationResponse: typeof verifyAttestationResponse
  readonly validateAttestationResponse: typeof validateAttestationResponse
  readonly consumeAttestationResponse: typeof consumeAttestationResponseDurable
  readonly reserveAttestationResponse: typeof reserveAttestationResponseDurable
  readonly isAttestationResponseConsumed: typeof isAttestationResponseConsumedDurable
  readonly serializeCanonicalAttestationResponsePayload: typeof serializeCanonicalAttestationResponsePayload
  readonly computeAttestationResponsePayloadDigest: typeof computeAttestationResponsePayloadDigest
  readonly serializeCanonicalAttestationResponseReplayIdentity: typeof serializeCanonicalAttestationResponseReplayIdentity
  readonly computeAttestationResponseReplayId: typeof computeAttestationResponseReplayId
  readonly validateAttestationReplayDirectory: typeof validateAttestationReplayDirectory
  readonly computePublicKeyId: typeof computePublicKeyId
  readonly assertAuthoritiesSeparated: typeof assertAuthoritiesSeparated
  readonly AUTHORITY_TYPES: typeof ATTESTATION_AUTHORITY_TYPES
  readonly ALLOWED_ALGORITHMS: typeof ATTESTATION_ALLOWED_ALGORITHMS
  readonly ANTI_REPLAY_GUARANTEE_LEVEL: typeof ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL
}

export const IndependentAttestationAuthorityAdapter: IndependentAttestationAuthorityAdapterNamespace

export interface IndependentAttestationAuthorityInterface {
  readonly AUTHORITY_ADAPTER_IMPLEMENTED: true
  readonly EXTERNAL_AUTHORITY_SERVICE_IMPLEMENTED: true
  readonly LOCAL_TEST_AUTHORITY_AVAILABLE: true
  readonly EXTERNAL_AUTHORITY_ENDPOINT_REACHABLE: false
  readonly AUTHORITY_REAL_WORLD_AVAILABLE: false
  readonly EXTERNAL_AUTHORITY_CRYPTOGRAPHICALLY_VERIFIED: false
  readonly PRODUCTION_TRUST_AVAILABLE: false
  readonly INDEPENDENT_ATTESTATION_AVAILABLE: false
  readonly P1_IMPORT_ALLOWED: false
  readonly evaluateReadiness: typeof evaluateExternalAuthorityReadiness
  readonly transportContract: IndependentAttestationAuthorityTransportContract
  readonly TRANSPORT_CONTRACT_VERSION: '1.0'
  readonly ENDPOINT_SPEC: typeof EXTERNAL_AUTHORITY_ENDPOINT_SPEC
  readonly ENDPOINT_ENV: string
  readonly AUTHORITY_ID_ENV: string
  readonly KEY_ID_ENV: string
  readonly validateAttestationEndpointUrl: typeof validateAttestationEndpointUrl
  readonly isEndpointConfigured: typeof isAttestationEndpointConfigured
  readonly executeHttpsTransport: typeof executeHttpsAttestationTransport
  readonly createExternalAuthoritySigner: typeof createExternalAuthoritySigner
  readonly createExternalService: typeof createExternalAttestationAuthorityService
  readonly createAttestationRequest: typeof createAttestationRequest
  readonly validateAttestationRequest: typeof validateAttestationRequest
  readonly computeAttestationRequestDigest: typeof computeAttestationRequestDigest
  readonly serializeCanonicalAttestationRequest: typeof serializeCanonicalAttestationRequest
  readonly serializeCanonicalAttestationResponsePayload: typeof serializeCanonicalAttestationResponsePayload
  readonly computeAttestationResponsePayloadDigest: typeof computeAttestationResponsePayloadDigest
  readonly serializeCanonicalAttestationResponseReplayIdentity: typeof serializeCanonicalAttestationResponseReplayIdentity
  readonly computeAttestationResponseReplayId: typeof computeAttestationResponseReplayId
  readonly validateAttestationReplayDirectory: typeof validateAttestationReplayDirectory
  readonly computePublicKeyId: typeof computePublicKeyId
  readonly assertAuthoritiesSeparated: typeof assertAuthoritiesSeparated
  readonly verifyAttestationResponse: typeof verifyAttestationResponse
  readonly validateAttestationResponse: typeof validateAttestationResponse
  readonly consumeAttestationResponse: typeof consumeAttestationResponseDurable
  readonly reserveAttestationResponse: typeof reserveAttestationResponseDurable
  readonly isAttestationResponseConsumed: typeof isAttestationResponseConsumedDurable
  readonly createAdapter: typeof createIndependentAttestationAuthorityAdapter
  readonly submitAttestationRequest: typeof submitAttestationRequest
  readonly verifyIndependentAttestation: typeof verifyIndependentAttestation
  readonly verifyAttestation: typeof verifyP0Attestation
  readonly validatePublicKey: typeof validateP0AttestationPublicKey
  readonly validateSecret: typeof validateP0AttestationPublicKey
  readonly createSelfAttestation: typeof createP0Attestation
  readonly createAttestation: typeof createP0Attestation
  readonly verifyRuntimeSigningIsolation: typeof verifyRuntimeSigningIsolation
  readonly assertRuntimeSigningIsolation: typeof assertRuntimeSigningIsolation
  readonly assertNoSelfAttestationElevation: typeof assertNoSelfAttestationElevation
  readonly signProductionAttestation: () => never
  readonly accessProductionPrivateKey: () => never
  readonly generateTrustedIndependentAttestation: () => never
  readonly fallbackToLocalSigner: () => never
  readonly isPublicKeyConfigured: (options?: {
    trustedAttestationPublicKey?: unknown
    publicKeySpki?: unknown
    allowTestKeys?: boolean
    independentAuthorityAvailable?: boolean
  }) => boolean
  readonly isRealWorldAuthorityAvailable: (options?: {
    trustedAttestationPublicKey?: unknown
    allowTestKeys?: boolean
    independentAttestation?: unknown
    independentAuthorityAvailable?: boolean
    INDEPENDENT_ATTESTATION_AVAILABLE?: boolean
    authorityRealWorldAvailable?: boolean
    AUTHORITY_REAL_WORLD_AVAILABLE?: boolean
  }) => false
  readonly isAuthorityAvailable: (options?: {
    trustedAttestationPublicKey?: unknown
    allowTestKeys?: boolean
    independentAttestation?: unknown
    independentAuthorityAvailable?: boolean
    INDEPENDENT_ATTESTATION_AVAILABLE?: boolean
    authorityRealWorldAvailable?: boolean
    AUTHORITY_REAL_WORLD_AVAILABLE?: boolean
  }) => boolean
  readonly PUBLIC_KEY_ENV: string
  readonly REPLAY_DIR_ENV: string
  readonly AUTHORITY_ENV: string
  readonly SIGNER_ORIGINS: typeof ATTESTATION_SIGNER_ORIGINS
  readonly AUTHORITY_TYPES: typeof ATTESTATION_AUTHORITY_TYPES
  readonly ALLOWED_ALGORITHMS: typeof ATTESTATION_ALLOWED_ALGORITHMS
  readonly TRUST_MODELS: typeof ATTESTATION_TRUST_MODELS
  readonly RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL: typeof ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL
}

export const IndependentAttestationAuthority: IndependentAttestationAuthorityInterface
export type AttestationAuthorityInterface = IndependentAttestationAuthorityInterface
export const AttestationAuthority: AttestationAuthorityInterface

export interface Pr02P0OfficialEvidenceManifest {
  readonly entorno: string
  readonly operaciones: readonly string[]
  readonly consultado_en: string
  readonly identificador_proceso: string
  readonly colector_identidad: string
  readonly ejecucion_autorizada_id: string
  readonly ejecucion_autorizada_scope: string
  readonly iva_respuesta_original_sha256: string
  readonly iva_archivo_normalizado_sha256: string
  readonly condition_respuesta_original_sha256: string
  readonly condition_archivo_normalizado_sha256: string
  readonly transporte_validado: true
  readonly transport_type?: string
  readonly origen_verificado: string
  readonly accredited: boolean
  readonly go_authorization_id?: string | null
  readonly go_authorization_sha256?: string | null
  readonly attestation?: Pr02P0Attestation | null
  readonly manifest_sha256: string
}

export function createPr02P0OfficialEvidenceManifest(params?: {
  entorno?: string
  origen_verificado?: string
  consultado_en: string
  now?: string | number | Date
  identificador_proceso: string
  colector_identidad?: string
  ejecucion_autorizada_id?: string
  ejecucion_autorizada_scope?: string
  iva_respuesta_original_sha256: string
  iva_archivo_normalizado_sha256: string
  condition_respuesta_original_sha256: string
  condition_archivo_normalizado_sha256: string
  transporte_validado: boolean
  transport_type?: string
  isSimulated?: boolean
  accredited?: boolean
  attestation?: Pr02P0Attestation
  commit_sha?: string
  authoritySecret?: string
  trustedAttestationPublicKey?: unknown
  allowTestKeys?: boolean
  go_authorization_id?: string
  go_authorization_sha256?: string
  goAuthorization?: string | unknown
}): Pr02P0OfficialEvidenceManifest

export function computeP0ManifestDigest(manifest: unknown): string

export function validatePr02P0Manifest(manifest: unknown, options?: { allowUnaccredited?: boolean }): boolean

export function validatePr02P1ImportEvidence(options?: {
  manifest?: unknown
  ivaText: string
  conditionText: string
  rawIvaSoapText?: string
  rawConditionSoapText?: string
  now?: string | number | Date
  expectedHead?: string
  head?: string
  authoritySecret?: unknown
  trustedAuthoritySecret?: unknown
  trustedAttestationPublicKey?: unknown
  trustedGoPublicKey?: unknown
  trustedGoAuthoritySecret?: unknown
  goAuthorizationDoc?: unknown
  independentAttestation?: unknown
  attestationRequest?: AttestationRequestPackage | unknown
  attestationResponse?: AttestationResponse | unknown
  allowedAuthorityIds?: readonly string[] | Set<string>
  allowedKeyIds?: readonly string[] | Set<string>
  enforceAntiReplay?: boolean
  consumeOnVerify?: boolean
  isSimulated?: boolean
  allowTestKeys?: boolean
  consumedAuthorizationsDir?: string
  fiscalScriptsDir?: string
  env?: Record<string, string | undefined>
  expectedHashes?: { iva?: string; condition?: string }
  [key: string]: unknown
}): {
  readonly status: 'PASS'
  readonly officialEvidenceVerified: true
  readonly P1_IMPORT_ALLOWED: true
  readonly INDEPENDENT_ATTESTATION_AVAILABLE: true
  readonly EVIDENCE_INTEGRITY: 'PASS'
  readonly EVIDENCE_CUSTODY_ATTESTED: true
  readonly ATTESTATION_TRUST_MODEL: 'INDEPENDENT_ATTESTED'
  readonly TRUSTED_EXECUTION_BOUNDARY: 'VERIFIED'
  readonly ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED: false
  readonly trustModel: 'LIMITED'
  readonly ANTI_REPLAY_GUARANTEE_LEVEL: 'HOST_LOCAL_DURABLE_ONE_TIME_USE'
  readonly consultado_en: string
  readonly ivaSha256: string
  readonly conditionSha256: string
  readonly manifestSha256: string
}

export const PR02_P1_PREFLIGHT_SELECT_SQL: string
export function verifyPr02P1Preflight(raw: unknown): {
  readonly status: 'PASS'
  readonly transactionReadOnly: true
  readonly expectedIssuerPresent: true
  readonly expectedIssuerEnabled: false
  readonly unexpectedEnabledIssuers: 0
  readonly catalogRev3Expired: true
  readonly catalogRev4Exists: false
  readonly existingTaReusable: boolean
  readonly loginCmsRequired: boolean
  readonly baselineRevisions: unknown[]
}

export const PR02_P1_ATOMIC_GUARD_SQL: string
export function verifyPr02P1InTxGuard(raw: unknown): boolean

export function buildPr02CanonicalRevision4(input: {
  ivaText: string
  conditionText: string
  baselineText: string
  ivaSha256?: string
  conditionSha256?: string
  baselineSha256?: string
  now?: string | number | Date
  expiresAt?: string
}): {
  readonly revision: 4
  readonly condiciones: unknown[]
  readonly alicuotas: unknown[]
  readonly fuente_sha256: string
  readonly consultado_en: string
  readonly vence_en: string
  readonly habilitado: false
  readonly sql: string
  readonly plan_sha256: string
}

export function resolveCurrentGitHead(opts?: { headCommit?: string }): string | null
export function resolveCurrentGitRemoteHead(opts?: { remoteHead?: string }): string | null

export function createPr02ParametersExecutionPackage(opts?: {
  headCommit?: string
  remoteHead?: string
  scope?: string
  isTaReusable?: boolean
}): Record<string, unknown>

export const PR02_P1_POSTCHECK_SELECT_SQL: string
export function verifyPr02P1Postcheck(raw: unknown, expected?: { fuenteSha256?: string; rev3FuenteSha256?: string }): {
  readonly status: 'PASS'
  readonly rev4Exists: true
  readonly rev4Enabled: false
  readonly rev4HashMatch: true
  readonly rev3Unchanged: true
  readonly expectedIssuerEnabled: false
}

export const PR02_P2_GUARD_SQL: string
export const PR02_P2_ENABLE_SQL: string
export const PR02_P2_ATOMIC_GUARD_SQL: string
export function verifyPr02P2InTxGuard(raw: unknown): boolean
export const PR02_P2_POSTCHECK_SELECT_SQL: string

export function verifyPr02P2Postcheck(raw: unknown, expected?: { fuenteSha256?: string; rev3FuenteSha256?: string }): {
  readonly status: 'PASS'
  readonly rev4Exists: true
  readonly rev4Enabled: true
  readonly rev4Valid: true
  readonly rev4HashMatch: true
  readonly rev3Unchanged: true
  readonly expectedIssuerEnabled: false
}

export function parseWsfeTiposIvaResponse(rawXml: string, consultadoEn?: string): {
  ivaText: string
  alicuotas: unknown[]
}

export function parseWsfeCondicionIvaReceptorResponse(rawXml: string, consultadoEn?: string): {
  conditionText: string
  condiciones: unknown[]
}
