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
export const PR02_P0_GO_AUTHORITY_ENV: string
export const PR02_P0_COMPROMISED_SECRETS: readonly string[]
export const ANTI_REPLAY_GUARANTEE_LEVEL: 'PROCESS_LOCAL_ONE_TIME_USE'

export function isTestAuthorityKey(secret: unknown): boolean
export function validateP0AuthoritySecret(secret: unknown): string
export function validateP0GoAuthoritySecret(secret: unknown, allowTestKeys?: boolean): string

export function markGoAuthorizationConsumed(authId: unknown): void
export function isGoAuthorizationConsumed(authId: unknown): boolean
export function resetConsumedGoAuthorizationsForTesting(): void

export interface GoAuthorityInterface {
  readonly validateAuthorization: typeof validatePr02P0GoAuthorization
  readonly createAuthorization: typeof createSignedPr02P0GoAuthorization
  readonly validateSecret: typeof validateP0GoAuthoritySecret
  readonly markConsumed: typeof markGoAuthorizationConsumed
  readonly isConsumed: typeof isGoAuthorizationConsumed
  readonly resetConsumedForTesting: typeof resetConsumedGoAuthorizationsForTesting
  readonly ANTI_REPLAY_GUARANTEE_LEVEL: 'PROCESS_LOCAL_ONE_TIME_USE'
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

export function createSignedPr02P0GoAuthorization(
  doc?: Partial<Pr02P0GoAuthorizationDoc>,
  secret?: string
): Pr02P0SignedGoAuthorization

export function validatePr02P0GoAuthorization(
  signedGoDoc: unknown,
  options?: {
    expectedHead?: string
    trustedGoAuthoritySecret?: string
    allowTestKeys?: boolean
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
  readonly issuedAt: string
  readonly signature: string | null
  readonly accredited: boolean
  readonly provenance: string
  readonly EVIDENCE_INTEGRITY?: 'PASS' | 'FAIL'
  readonly EVIDENCE_CUSTODY_ATTESTED?: boolean
  readonly TRUSTED_EXECUTION_BOUNDARY?: 'VERIFIED' | 'UNVERIFIED'
  readonly ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED?: boolean
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
}): Pr02P0Attestation

export function verifyP0Attestation(
  attestation: unknown,
  options?: {
    manifest?: unknown
    commitSha?: string
    authoritySecret?: string
    goAuthorizationId?: string
    goAuthorizationSha256?: string
  }
): { readonly valid: boolean; readonly reason?: string; readonly errorCategory?: string }

export interface AttestationAuthorityInterface {
  readonly validateSecret: typeof validateP0AuthoritySecret
  readonly createAttestation: typeof createP0Attestation
  readonly verifyAttestation: typeof verifyP0Attestation
  readonly isAuthorityAvailable: () => boolean
  readonly AUTHORITY_ENV: string
}
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
  go_authorization_id?: string
  go_authorization_sha256?: string
  goAuthorization?: string | unknown
}): Pr02P0OfficialEvidenceManifest

export function computeP0ManifestDigest(manifest: unknown): string

export function validatePr02P0Manifest(manifest: unknown): boolean

export function validatePr02P1ImportEvidence(options?: {
  manifest?: unknown
  ivaText: string
  conditionText: string
  rawIvaSoapText?: string
  rawConditionSoapText?: string
  now?: string | number | Date
  expectedHead?: string
  head?: string
  authoritySecret?: string
  trustedAuthoritySecret?: string
  trustedGoAuthoritySecret?: string
  goAuthorizationDoc?: unknown
  allowTestKeys?: boolean
  expectedHashes?: { iva?: string; condition?: string }
}): {
  readonly status: 'PASS'
  readonly officialEvidenceVerified: true
  readonly P1_IMPORT_ALLOWED?: boolean
  readonly EVIDENCE_INTEGRITY: 'PASS'
  readonly EVIDENCE_CUSTODY_ATTESTED: true
  readonly TRUSTED_EXECUTION_BOUNDARY: 'VERIFIED'
  readonly ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED: false
  readonly trustModel: 'LIMITED'
  readonly ANTI_REPLAY_GUARANTEE_LEVEL: 'PROCESS_LOCAL_ONE_TIME_USE'
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
