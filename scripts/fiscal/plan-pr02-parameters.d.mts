export const PR02_P1_SCOPE = 'PR02_P1_PARAMETER_REFRESH'
export const PR02_P2_SCOPE = 'PR02_P2_CATALOG_ENABLE'
export const PR02_PARAMETERS_ALLOWED_SCOPES: readonly [string, string]

export const PR02_PARAMETERS_TARGET_PROJECT_REF = 'acoyfwwmhaeruciyedri'
export const PR02_PARAMETERS_TARGET_REVISION = 4
export const PR02_PARAMETERS_HISTORICAL_REVISION = 3
export const PR02_PARAMETERS_EXPECTED_ISSUER_CUIT = '20415005963'
export const PR02_PARAMETERS_EXPECTED_ISSUER_PV = 2
export const PR02_CATALOG_REV3_HASH = '11e9d2244b4fd418df4ab9bc3798c303d66f181785ba678597fdeffa76d5e884'

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
export const PR02_P2_POSTCHECK_SELECT_SQL: string

export function verifyPr02P2Postcheck(raw: unknown, expected?: { fuenteSha256?: string }): {
  readonly status: 'PASS'
  readonly rev4Exists: true
  readonly rev4Enabled: true
  readonly rev4Valid: true
  readonly rev4HashMatch: true
  readonly rev3Unchanged: true
  readonly expectedIssuerEnabled: false
}
