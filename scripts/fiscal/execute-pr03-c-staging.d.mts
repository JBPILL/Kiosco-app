// Type definitions for PR03-C Staging Parameter Refresh Execution.

export interface Pr03cCliArgs {
  readonly authorized: boolean
  readonly dryRun: boolean
  readonly scope: string
  readonly projectRef: string
}

export interface Pr03cExecutionOptions {
  readonly execution?: 'DRY_RUN' | 'EXECUTE'
  readonly authorized?: boolean
  readonly dryRun?: boolean
  readonly scope?: string
  readonly projectRef?: string
  readonly password?: string
  readonly argv?: string[]
  readonly dryRunEvidence?: {
    readonly ivaText: string
    readonly conditionText: string
    readonly baselineText: string
  }
}

export interface Pr03cExecutionReport {
  readonly PR03_C_REMOTE_EXECUTION_READY: true
  readonly REAL_LOGINCMS_EXECUTOR: 'IMPLEMENTED'
  readonly REAL_TIPOS_IVA_EXECUTOR: 'IMPLEMENTED'
  readonly REAL_CONDICIONES_IVA_EXECUTOR: 'IMPLEMENTED'
  readonly EXACT_CALL_ALLOWLIST: 'PASS'
  readonly MAX_ARCA_CALLS: 3
  readonly AUTO_RETRY: false
  readonly REVISION_3_DB_INSERT: 'IMPLEMENTED'
  readonly REVISION_3_PRECHECK: 'IMPLEMENTED'
  readonly REVISION_3_POSTCHECK: 'IMPLEMENTED'
  readonly REVISION_2_IMMUTABILITY: 'PASS'
  readonly EMITTER_REMAINS_DISABLED: 'PASS'
  readonly SECRETS_IN_REPORTS: 0
  readonly PR03_C_PREPARATION: 'PASS'
  readonly PR03_C_EXTERNAL_CALL_PLAN: 'PASS'
  readonly PR03_C_REQUIRED_CALLS: readonly string[]
  readonly EXISTING_TA_REUSABLE: boolean
  readonly LOGINCMS_REQUIRED: boolean
  readonly TIPOS_IVA_PLAN: 'PASS'
  readonly TIPOS_IVA_COUNT?: number
  readonly TIPOS_IVA_HASH?: string
  readonly CONDICIONES_IVA_PLAN: 'PASS'
  readonly CONDICIONES_IVA_COUNT?: number
  readonly CONDICIONES_IVA_HASH?: string
  readonly REVISION_3_CANONICAL: 'PASS'
  readonly REVISION_3_INSERT_ONLY: 'PASS'
  readonly REVISION_2_MUTATED: false
  readonly EMITTER_ENABLE_DURING_PR03_C: false
  readonly EMITTER_ENABLE_REQUIRED_FOR_PR03_B: true
  readonly FECAESOLICITAR_REACHABLE: false
  readonly FECOMPCONSULTAR_REACHABLE: false
  readonly PR03_C_EMISSION_CAPABLE: false
  readonly PR03_C_PACKAGE: 'PREPARED'
  readonly ARCA_CALLS_NEW: 0
  readonly STAGING_WRITES_NEW: 0
  readonly PRODUCTION_MUTATIONS: 0
  readonly CALL_LIMITS: {
    readonly loginCmsMax: number
    readonly tiposIvaMax: number
    readonly condicionIvaReceptorMax: number
    readonly totalMax: number
  }
  readonly PACKAGE_SHA256: string
}

export const PR03_C_EXECUTION_TARGET: 'acoyfwwmhaeruciyedri'
export const PR03_C_DB_HOST: string
export const PR03_C_DB_PORT: number
export const PR03_C_DB_USER: string
export const PR03_C_DB_NAME: string

export function checkSoapFault(doc: unknown, serviceName?: string): void
export function checkWsfeErrors(doc: unknown): void
export function buildWsaaLoginCmsSoapRequest(cmsBase64: string): string
export function parseWsaaLoginCmsResponse(soapXml: string, now?: Date | string | number): {
  token: string
  sign: string
  expirationTime: string
}
export function buildWsfeTiposIvaRequest(params: { token: string; sign: string; cuit: string }): string
export function parseWsfeTiposIvaResponse(soapXml: string, consultedAt?: string): {
  ivaText: string
  count: number
  hash: string
  rates: unknown[]
}
export function buildWsfeCondicionIvaReceptorRequest(params: { token: string; sign: string; cuit: string }): string
export function parseWsfeCondicionIvaReceptorResponse(soapXml: string, consultedAt?: string): {
  conditionText: string
  count: number
  hash: string
  conditions: unknown[]
}

export function validatePr03cCliArgs(argv?: string[]): Pr03cCliArgs
export function checkPr03cEnvironment(): { projectRef: string; isStaging: boolean }
export function executePr03cStaging(
  rawOptions?: Pr03cExecutionOptions,
  deps?: Record<string, unknown>
): Promise<Readonly<Record<string, unknown>>>
