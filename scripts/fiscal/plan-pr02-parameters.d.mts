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
  readonly origen_verificado: string
  readonly accredited: true
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
}): Pr02P0OfficialEvidenceManifest

export function validatePr02P0Manifest(manifest: unknown): boolean

export function validatePr02P1ImportEvidence(options?: {
  manifest?: unknown
  ivaText: string
  conditionText: string
  rawIvaSoapText?: string
  rawConditionSoapText?: string
  now?: string | number | Date
  expectedHashes?: { iva?: string; condition?: string }
}): {
  readonly status: 'PASS'
  readonly officialEvidenceVerified: true
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
