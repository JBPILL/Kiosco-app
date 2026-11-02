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
}

export interface Pr03bExecutionOptions {
  readonly authorized?: boolean
  readonly scope?: string
  readonly projectRef?: string
  readonly runId?: string
  readonly password?: string
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
  readonly IDEMPOTENCY_REPLAY: 'PASS' | 'FAIL'
  readonly IDEMPOTENCY_CONFLICT: 'PASS' | 'FAIL'
  readonly CONFLICT_SQLSTATE: string | null
  readonly NUMBERING_CONCURRENCY: 'PASS' | 'FAIL'
  readonly PREFLIGHT_READ_ONLY: 'PASS' | 'FAIL'
  readonly RUN_ID: string
  readonly ARCA_CALLS: 0
  readonly COMMERCIAL_WRITES: 0
  readonly FIXTURE_ROWS_CREATED: number
  readonly FIXTURE_CLEANUP: 'PASS' | 'NOT_APPLICABLE' | 'FAIL'
  readonly PG_CONNECTIONS_CLOSED: 'PASS' | 'FAIL'
}

export interface PgClientMock {
  connect(): Promise<void>
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, any>>; rowCount?: number }>
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
