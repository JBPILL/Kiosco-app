export interface Pr03bEnvironmentCheck {
  readonly status: 'PASS'
  readonly scope: string
  readonly antiArcaGuard: 'PASS'
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

export const PR03_B_EXECUTION_TARGET: string
export const PR03_B_DB_HOST: string
export const PR03_B_DB_PORT: number
export const PR03_B_DB_USER: string
export const PR03_B_DB_NAME: string

export function checkPr03bEnvironment(): Pr03bEnvironmentCheck
export function runPr03bPreparation(): Promise<Pr03bPreparationResult>
