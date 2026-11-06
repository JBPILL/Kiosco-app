export interface Pr03bEnvironmentCheck {
  readonly status: 'PASS'
  readonly scope: string
  readonly antiArcaGuard: 'PASS'
  readonly arcaTransportReachable: false
  readonly planValidation: 'PASS'
  readonly fixtureValidation: 'PASS'
  readonly testCasesCount: number
}

export interface Pr03bPreparationResult {
  readonly environment: Pr03bEnvironmentCheck
  readonly readyForAuthorizedExecution: boolean
  readonly stagingWritesAttempted: number
  readonly arcaCallsAttempted: number
}

export interface Pr03bCliArgs {
  readonly authorized: boolean
  readonly dryRun: boolean
  readonly scope: string
  readonly projectRef: string
  readonly runId: string | null
  readonly cleanResiduals?: boolean
}

export interface Pr03bExecutionOptions {
  readonly authorized?: boolean
  readonly scope?: string
  readonly projectRef?: string
  readonly runId?: string
  readonly password?: string
  readonly kioskId?: string
  readonly ownerAuthId?: string
  readonly syntheticKioskId?: string
  readonly syntheticOwnerAuthId?: string
  readonly syntheticPv?: number
  readonly allowSyntheticKiosk?: boolean
  readonly cleanResiduals?: boolean
}

export interface Pr03bDryRunResult {
  readonly execution: 'DRY_RUN'
  readonly readyForRemoteExecution: false
  readonly environment: Pr03bEnvironmentCheck
  readonly arcaTransportReachable: false
  readonly stagingWrites: number
  readonly arcaCalls: number
  readonly message: string
}

export interface Pr03bExecutionResult {
  readonly execution: 'AUTHORIZED_EXECUTION'
  readonly PR03_B_EXECUTION: 'PASS' | 'FAIL'
  readonly PR03_B_REMOTE_EXECUTION_READY: true
  readonly SYNTHETIC_TARGET_IMMUTABLE: 'PASS' | 'FAIL'
  readonly SYNTHETIC_TENANT_WIRED: 'PASS' | 'FAIL'
  readonly SYNTHETIC_KIOSK_ID_MATCH: 'PASS' | 'FAIL'
  readonly SYNTHETIC_OWNER_MATCH: 'PASS' | 'FAIL'
  readonly SYNTHETIC_PV_MATCH: 'PASS' | 'FAIL'
  readonly SYNTHETIC_PV: number
  readonly REAL_PV2_GUARD: 'PASS' | 'FAIL'
  readonly REAL_PV2_ENABLED_DURING_PR03_B: false
  readonly REAL_PV2_SERIES_TOUCHED: false
  readonly CATALOG_REV3_USABLE: 'PASS' | 'FAIL'
  readonly SYNTHETIC_EMITTER_LIFECYCLE: 'PASS' | 'FAIL'
  readonly CLEANUP_FULL_EMITTER_IDENTITY_GUARD: 'PASS' | 'FAIL'
  readonly SYNTHETIC_EMITTER_IDENTITY_MATCH: 'PASS' | 'FAIL' | 'NOT_APPLICABLE'
  readonly SYNTHETIC_EMITTER_FAILSAFE_IDENTITY_GUARD: 'PASS' | 'FAIL'
  readonly CANONICAL_PRIVATE_PREPARATION: 'PASS' | 'FAIL'
  readonly IDEMPOTENCY_REPLAY: 'PASS' | 'FAIL'
  readonly REPLAY_REAL_PG: 'PASS' | 'FAIL'
  readonly IDEMPOTENCY_CONFLICT: 'PASS' | 'FAIL'
  readonly CONFLICT_SQLSTATE: string | null
  readonly CONFLICT_EXPECTED_SQLSTATE: '40001'
  readonly CONFLICT_REAL_PG: 'PASS' | 'FAIL'
  readonly CONCURRENCY_SEMANTICS: 'SINGLE_PENDING_RESERVATION'
  readonly LOCK_OBSERVATION_SOURCE: 'PG_LOCKS'
  readonly LOCK_OBSERVATION_DETERMINISTIC: 'PASS' | 'FAIL'
  readonly CONCURRENCY_LOCK_OBSERVED: 'PASS' | 'FAIL'
  readonly CONCURRENCY_REJECTION_SQLSTATE: string | null
  readonly CONCURRENCY_EXPECTED_SQLSTATE: '55000'
  readonly CONCURRENCY_REAL_PG: 'PASS' | 'FAIL'
  readonly NUMBERING_CONCURRENCY: 'PASS' | 'FAIL'
  readonly PREFLIGHT_READ_ONLY: 'PASS' | 'FAIL'
  readonly PREFLIGHT_ROLLBACK_CONFIRMED: boolean
  readonly SYNTHETIC_PV_USED: number
  readonly AUTO_CLEANUP_ON_UNKNOWN_ERROR: false
  readonly SYNTHETIC_EMITTER_FAILSAFE: 'PASS' | 'FAIL' | 'NOT_NEEDED'
  readonly REAL_COMMERCIAL_BASELINE_PRESERVED: boolean
  readonly SYNTHETIC_COMMERCIAL_BASELINE_PRESERVED: boolean
  readonly COMMERCIAL_BASELINE_PRESERVED: boolean
  readonly BASELINE_BEFORE_HASH: string
  readonly BASELINE_AFTER_HASH: string
  readonly SUCCESS_CLEANUP: 'PASS' | 'NOT_APPLICABLE' | 'FAIL'
  readonly RESIDUAL_SYNTHETIC_FISCAL_STATE: number
  readonly RUN_ID: string
  readonly ARCA_CALLS: 0
  readonly ARCA_CALLS_NEW: 0
  readonly COMMERCIAL_WRITES: 0
  readonly FIXTURE_OPERATIONS_CREATED: number
  readonly FIXTURE_CLEANUP: 'PASS' | 'NOT_APPLICABLE' | 'FAIL'
  readonly CONNECTION_CLOSE_REQUIRED_FOR_PASS: 'PASS' | 'FAIL'
  readonly CLIENT1_CLOSED: boolean
  readonly CLIENT2_CLOSED: boolean
  readonly PG_CONNECTIONS_CLOSED: 'PASS' | 'FAIL'
}

export interface PgClientMock {
  connect(): Promise<void>
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>
  end(): Promise<void>
}

export interface Pr03bExecutionDependencies {
  readonly clientFactory?: (config: Record<string, unknown>) => Promise<PgClientMock>
  readonly logger?: (msg: string) => void
}

export const PR03_B_EXECUTION_TARGET: string
export const PR03_B_DB_HOST: string
export const PR03_B_DB_PORT: number
export const PR03_B_DB_USER: string
export const PR03_B_DB_NAME: string

export function assertNoForbiddenCredentials(password: unknown): void
export function validatePr03bCliArgs(argv?: string[]): Pr03bCliArgs
export function checkPr03bEnvironment(): Pr03bEnvironmentCheck
export function defaultPgClientFactory(config: Record<string, unknown>): Promise<PgClientMock>
export function runPr03bPreparation(): Promise<Pr03bPreparationResult>
export function executePr03bStaging(
  rawOptions?: Pr03bExecutionOptions,
  deps?: Pr03bExecutionDependencies
): Promise<Pr03bDryRunResult | Pr03bExecutionResult>
