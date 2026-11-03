// Type definitions for PR03-C Staging Parameter Refresh Execution.

export interface Pr03cCliArgs {
  readonly authorized: boolean
  readonly dryRun: boolean
  readonly scope: string
  readonly projectRef: string
  readonly resumeExistingRevision3: boolean
}

export interface Pr03cExecutionOptions {
  readonly execution?: 'DRY_RUN' | 'EXECUTE'
  readonly authorized?: boolean
  readonly dryRun?: boolean
  readonly scope?: string
  readonly projectRef?: string
  readonly password?: string
  readonly cmsBase64?: string
  readonly caCertPath?: string
  readonly headCommit?: string
  readonly remoteHead?: string
  readonly resumeExistingRevision3?: boolean
  readonly expectedRevision3Hash?: string
  readonly ssl?: {
    readonly rejectUnauthorized: boolean
    readonly ca?: string
  }
  readonly argv?: string[]
  readonly dryRunEvidence?: {
    readonly ivaText: string
    readonly conditionText: string
    readonly baselineText: string
  }
}

export interface Pr03cExecutionReport {
  readonly PR03_C_REMOTE_EXECUTION_READY: true
  readonly SCOPE: string
  readonly REAL_LOGINCMS_EXECUTOR: 'IMPLEMENTED'
  readonly REAL_TIPOS_IVA_EXECUTOR: 'IMPLEMENTED'
  readonly REAL_CONDICIONES_IVA_EXECUTOR: 'IMPLEMENTED'
  readonly EXACT_CALL_ALLOWLIST: 'PASS'
  readonly MAX_ARCA_CALLS: 3
  readonly AUTO_RETRY: false
  readonly REVISION_3_DB_INSERT: string
  readonly REVISION_3_PRECHECK: 'IMPLEMENTED'
  readonly REVISION_3_POSTCHECK: 'IMPLEMENTED'
  readonly REVISION_3_C2_ENABLE: string
  readonly REVISION_2_IMMUTABILITY: 'PASS'
  readonly EMITTER_REMAINS_DISABLED: 'PASS'
  readonly SECRETS_IN_REPORTS: 0
  readonly LOGIN_CMS: string
  readonly TA_CREATED: boolean
  readonly TA_EXPIRATION: string | null
  readonly TOKEN_PRESENT: boolean
  readonly SIGN_PRESENT: boolean
  readonly LOGIN_CMS_CALLS: number
  readonly TIPOS_IVA_QUERY: string
  readonly TIPOS_IVA_COUNT?: number
  readonly TIPOS_IVA_HASH?: string
  readonly TIPOS_IVA_CALLS: number
  readonly CONDICIONES_IVA_QUERY: string
  readonly CONDICIONES_IVA_COUNT?: number
  readonly CONDICIONES_IVA_HASH?: string
  readonly CONDICIONES_IVA_CALLS: number
  readonly REVISION_3_CANONICAL: 'PASS'
  readonly REVISION_3_INSERT_ONLY: string
  readonly REVISION_2_MUTATED: false
  readonly EMITTER_ENABLE_DURING_PR03_C: false
  readonly EMITTER_ENABLE_REQUIRED_FOR_PR03_B: true
  readonly FECAESOLICITAR_REACHABLE: false
  readonly FECOMPCONSULTAR_REACHABLE: false
  readonly PR03_C_EMISSION_CAPABLE: false
  readonly ARCA_CALLS_TOTAL: number
  readonly REVISION_3_EXISTS: boolean
  readonly REVISION_3_ENABLED: boolean
  readonly EXPECTED_ISSUER_ENABLED: false
  readonly REV2_HASH_BEFORE?: string | null
  readonly CATALOG_REVISIONS_BEFORE?: number[]
  readonly ISSUER_ENABLED_BEFORE?: boolean
  readonly CATALOG_REVISIONS_AFTER_C1?: number[]
  readonly REV3_HASH_AFTER_C1?: string
  readonly REV3_ENABLED_AFTER_C1?: boolean
  readonly CATALOG_REVISIONS_AFTER_C2?: number[]
  readonly REV3_HASH_AFTER_C2?: string
  readonly REV3_ENABLED_AFTER_C2?: boolean
  readonly CATALOG_ENABLE_ROWS_AFFECTED?: number
  readonly PG_CONNECTION_CLOSED: 'PASS' | 'FAIL' | 'NOT_APPLICABLE' | 'NOT_RUN'
}

export const PR03_C_EXECUTION_TARGET: 'acoyfwwmhaeruciyedri'
export const PR03_C_DB_HOST: string
export const PR03_C_DB_PORT: number
export const PR03_C_DB_USER: string
export const PR03_C_DB_NAME: string

export function resolvePostgresSslConfig(options?: {
  caCertPath?: string
  ssl?: { rejectUnauthorized: boolean; ca?: string }
}): { readonly rejectUnauthorized: true; readonly ca: string }

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
