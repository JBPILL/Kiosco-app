// Type definitions for PR03-C Parameter Refresh Planning Contract.

export interface Pr03cCallLimits {
  readonly loginCmsMax: number
  readonly tiposIvaMax: number
  readonly condicionIvaReceptorMax: number
  readonly totalMax: number
}

export interface Pr03cCallCounterTracker {
  recordCall(operation: string): void
  readonly loginCmsCount: number
  readonly tiposIvaCount: number
  readonly condicionIvaReceptorCount: number
  readonly totalCalls: number
  readonly isTaReusable: boolean
  verifyLimits(): void
}

export interface Pr03cTaEvaluation {
  readonly reusable: boolean
  readonly loginCmsRequired: boolean
  readonly expiration: string | null
  readonly reason: string
}

export interface Pr03cPreflightResult {
  readonly status: 'PASS' | 'FAIL'
  readonly transactionReadOnly: boolean
  readonly expectedIssuerPresent: boolean
  readonly expectedIssuerEnabled: boolean
  readonly unexpectedEnabledIssuers: number
  readonly catalogRev2Expired: boolean
  readonly catalogRev3Exists: boolean
  readonly existingTaReusable: boolean
  readonly loginCmsRequired: boolean
  readonly baselineRevisions: number[]
}

export interface Pr03cExecutionPackage {
  readonly scope: 'PR03_C_PARAMETER_REFRESH'
  readonly projectRef: string
  readonly targetRevision: 3
  readonly headCommit: string
  readonly expectedIssuerCuit: string
  readonly expectedIssuerPuntoVenta: number
  readonly requiredCalls: readonly string[]
  readonly prohibitedCalls: readonly string[]
  readonly callLimits: Pr03cCallLimits
  readonly emissionProhibited: {
    readonly fecaesolicitarReachable: false
    readonly fecompconsultarReachable: false
    readonly emissionCapable: false
  }
  readonly emitterStatus: {
    readonly enabledDuringPr03c: false
    readonly requiredForPr03b: true
  }
  readonly revisionIntegrity: {
    readonly revision2Mutated: false
    readonly revision3InsertOnly: true
  }
  readonly packageSha256: string
  readonly preparedAt: string
}

export interface Pr03cCanonicalRevision3Result {
  readonly revision: 3
  readonly condiciones: Array<{ id: number; descripcion: string; comprobantes: number[] }>
  readonly alicuotas: Array<{ id: number; descripcion: string }>
  readonly fuente_sha256: string
  readonly consultado_en: string
  readonly vence_en: string
  readonly habilitado: false
  readonly sql: string
  readonly plan_sha256: string
}

export const PR03_C_SCOPE: 'PR03_C_PARAMETER_REFRESH'
export const PR03_C_TARGET_PROJECT_REF: 'acoyfwwmhaeruciyedri'
export const PR03_C_TARGET_REVISION: 3
export const PR03_C_EXPECTED_ISSUER_CUIT: '20415005963'
export const PR03_C_EXPECTED_ISSUER_PV: 2
export const PR03_C_REQUIRED_CALLS: readonly ['LoginCms', 'FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor']
export const PR03_C_PROHIBITED_CALLS: readonly ['FECAESolicitar', 'FECompConsultar', 'FECompUltimoAutorizado', 'FEParamGetPtosVenta']
export const PR03_C_CALL_LIMITS_REUSABLE: Pr03cCallLimits
export const PR03_C_CALL_LIMITS_NON_REUSABLE: Pr03cCallLimits

export const FECAESOLICITAR_REACHABLE: false
export const FECOMPCONSULTAR_REACHABLE: false
export const PR03_C_EMISSION_CAPABLE: false
export const EMITTER_ENABLE_DURING_PR03_C: false
export const EMITTER_ENABLE_REQUIRED_FOR_PR03_B: true
export const REVISION_2_MUTATED: false
export const REVISION_3_INSERT_ONLY: true

export const PR03_C_PREFLIGHT_SELECT_SQL: string

export function assertNoProhibitedOperation(operation: string): void
export function isArcaOperationPermitted(operation: string): boolean
export function createPr03cCallTracker(isTaReusable: boolean): Pr03cCallCounterTracker
export function evaluateExistingTa(taRecord: unknown, now?: string | number | Date): Pr03cTaEvaluation
export function verifyPr03cPreflight(raw: unknown): Pr03cPreflightResult
export function validateTiposIvaEvidence(text: string, expectedChecksum?: string): { count: number; hash: string; rates: unknown[] }
export function validateCondicionIvaReceptorEvidence(text: string, expectedChecksum?: string): { count: number; hash: string; conditions: unknown[] }
export function buildPr03cCanonicalRevision3(input: {
  ivaText: string
  conditionText: string
  ivaSha256?: string
  conditionSha256?: string
  baselineText: string
  baselineSha256?: string
  now?: string
  expiresAt?: string
}): Pr03cCanonicalRevision3Result
export function createPr03cExecutionPackage(opts?: { headCommit?: string; isTaReusable?: boolean }): Pr03cExecutionPackage
