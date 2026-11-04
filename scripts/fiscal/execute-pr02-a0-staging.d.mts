export const PR02_A0_SCOPE: 'PR02_A0_STAGING_SQL_READ_ONLY'
export const PR02_A0_EXECUTION_TARGET: 'acoyfwwmhaeruciyedri'
export const PR02_A0_DB_HOST: string
export const PR02_A0_DB_PORT: number
export const PR02_A0_DB_USER: string
export const PR02_A0_DB_NAME: string

export const PR02_TARGET_KIOSK_ID: string
export const PR02_TARGET_CUIT: string
export const PR02_TARGET_PV: number
export const PR02_TARGET_RECEIPT_TYPE: number
export const PR02_TARGET_CERT_SHA256: string
export const PR02_EXPECTED_CATALOG_REVISION: number
export const PR02_CATALOG_REV3_HASH: string

export function assertNoForbiddenCredentials(password?: string): void

export interface Pr02A0CliArgs {
  readonly authorized: boolean
  readonly dryRun: boolean
  readonly scope: string
  readonly projectRef: string
  readonly head?: string | null
  readonly expectedHead?: string | null
}

export function validatePr02A0CliArgs(argv?: string[]): Pr02A0CliArgs

export interface CandidateSaleSample {
  id: string
  total: string
  fecha_hora: string
  detail_count: number
}

export interface Pr02A0PreflightQueryResult {
  readonly PR02_A0_READ_ONLY_GUARD: string
  readonly PR02_A0_REAL_PV2_GUARD: string
  readonly PR02_A0_CATALOG_GUARD: string
  readonly PR02_A0_HISTORY_GUARD: string
  readonly HISTORICAL_042_IDENTIFICATION: 'VERIFIED' | 'UNRESOLVED'
  readonly catalog_is_expired: boolean
  readonly server_now?: string
  readonly catalog_revision?: number
  readonly emitter_pv?: number
  readonly emitter_cuit?: string
  readonly candidate_sales_count: number
  readonly candidate_sales_sample: CandidateSaleSample[]
}

export function runPr02A0PreflightQueries(client: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}): Promise<Pr02A0PreflightQueryResult>

export interface Pr02A0Options {
  argv?: string[]
  authorized?: boolean
  dryRun?: boolean
  scope?: string
  projectRef?: string
  head?: string | null
  expectedHead?: string | null
  password?: string
  caCertPath?: string
}

export interface Pr02A0Deps {
  client?: {
    connect: () => Promise<void>
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
    end: () => Promise<void>
  }
  Client?: new (config: unknown) => {
    connect: () => Promise<void>
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
    end: () => Promise<void>
  }
  caCert?: string
}

export interface Pr02A0Report {
  readonly execution: string
  readonly scope: string
  readonly projectRef: string
  readonly PR02_A0_LOCAL_PREPARATION: 'PASS'
  readonly PR02_A0_READ_ONLY_AUDIT?: string
  readonly PR02_A0_OPERATIONAL_READINESS?: string
  readonly PR02_A0_REMOTE_EXECUTION_READY: boolean
  readonly PR02_A0_REMOTE_EXECUTED: boolean
  readonly DRY_RUN_REMOTE_CHECKS?: string
  readonly SQL_READ_ONLY_VERIFICATION?: string
  readonly TLS_REMOTE_VERIFICATION?: string
  readonly CATALOG_REMOTE_VERIFICATION?: string
  readonly HISTORY_REMOTE_VERIFICATION?: string
  readonly PR02_A0_READ_ONLY_GUARD: string
  readonly PR02_A0_TLS_GUARD: string
  readonly PR02_A0_ROLLBACK_GUARD: string
  readonly PR02_A0_CONNECTION_CLOSE: string
  readonly PR02_A0_CATALOG_GUARD: string
  readonly PR02_A0_REAL_PV2_GUARD: string
  readonly PR02_A0_HISTORY_GUARD: string
  readonly HISTORICAL_042_IDENTIFICATION?: string
  readonly PR02_A0_CANDIDATE_AUTO_SELECTION: false
  readonly PR02_A0_ARCA_REACHABLE: false
  readonly TA_STATUS: 'NOT_CHECKED_IN_A0'
  readonly OFFICIAL_NUMBERING: 'NOT_OBSERVED_IN_A0'
  readonly EMISSION_PERMISSION: 'DISABLED'
  readonly ARCA_CALLS_NEW: 0
  readonly STAGING_WRITES_NEW: 0
  readonly PRODUCTION_MUTATIONS: 0
  readonly server_now?: string
  readonly catalog_revision?: number
  readonly candidate_sales_count?: number
  readonly candidate_sales_sample?: CandidateSaleSample[]
}

export function executePr02A0Staging(
  options?: Pr02A0Options,
  deps?: Pr02A0Deps
): Promise<Pr02A0Report>
