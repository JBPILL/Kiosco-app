export const CASHIER_AUTH_ID: string
export const CASHIER_EMAIL: string

export type CashierPreflightStage =
  | 'INPUT'
  | 'EMAIL_GUARD'
  | 'PUBLIC_KEY'
  | 'AUTH_REQUEST'
  | 'AUTH_HTTP'
  | 'TOKEN_SUBJECT'
  | 'AUTH_IDENTITY'
  | 'PROFILE'
  | 'LOGOUT_LOCAL'
  | 'COMPLETE'

export const PREFLIGHT_STAGES: readonly CashierPreflightStage[]

export interface CashierPreflightCredentials {
  publicKey: string
  email: string
  password: string
}

export function runCashierSessionPreflight(
  credentials: CashierPreflightCredentials,
  request: typeof fetch
): Promise<'CASHIER_SESSION_PREFLIGHT = PASS'>
