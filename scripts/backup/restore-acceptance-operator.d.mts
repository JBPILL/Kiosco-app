import type { RestoreJournal, RestoreRole } from './restore-acceptance-engine.mjs'
import type { RestoreHttpClient } from './restore-acceptance-http.mjs'
export interface RestorePhaseOptions {
  journal: RestoreJournal
  role: RestoreRole
  allowRun?: boolean
  reviewedPlanHash?: string
  expiresAt: string
  now?: () => number
  preflight: (context: {role: RestoreRole; cursor: number; planHash: string}) => Promise<boolean>
  openSession: (role: RestoreRole) => Promise<RestoreHttpClient>
}
export function runRestoreRolePhase(options: RestorePhaseOptions): Promise<{
  status: 'ROLE_PHASE_PASS' | 'ROLE_PHASE_NOT_CONFIRMED'
  stage: string
  confirmed: number
  logout: 'NOT_ESTABLISHED' | 'NOT_CONFIRMED' | 'CONFIRMED'
  mayRetry: false
}>
