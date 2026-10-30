export type RestoreRole = 'OWNER' | 'CASHIER'
export type RestoreRpc = 'restaurar_contacto_backup' | 'restaurar_producto_backup' | 'restaurar_lote_backup'
export interface RestoreStep {
  name: string
  rpc: RestoreRpc
  params: Record<string, unknown>
  expected: 'ACK_AND_SINGLE_EXPLICIT_REPLAY' | 'REJECT'
  sqlstate?: string
}
export interface RestorePlan {
  version: number
  status: string
  kioskId: string
  fixtureIds: Record<string, string>
  steps: RestoreStep[]
  cashierDeniedCalls: RestoreStep[]
  expectedTotalExplicitRpcCalls: number
}
export interface JournalIntent {
  kind: 'INTENT'
  index: number
  rpc: RestoreRpc
  operationId: string
  paramsHash: string
  requestHash: string
  actorAuthId: string
}
export interface JournalRecord {
  kind: string
  sequence: number
  recordedAt: string
  previous: string
  hash: string
  operationId?: string
  requestHash?: string
  ackHash?: string
}
export interface RestoreState {
  cursor: number
  pending: JournalIntent | null
  acks: Record<string, string>
  actors: Record<RestoreRole, string>
  complete: boolean
}
export interface RestoreActor { role: string; authId: string; kioskId: string }
export const PLAN_HASH: string
export function valueHash(value: unknown): string
export function loadRestorePlan(): RestorePlan
export class RestoreJournal {
  constructor(file: string)
  file: string
  records(): JournalRecord[]
  append(event: Record<string, unknown>): void
}
export function createRestoreJournal(file: string, actors: Record<RestoreRole, string>): RestoreJournal
export function inspectRestoreJournal(journal: RestoreJournal): RestoreState
export function executeNextRestoreAction(journal: RestoreJournal, actor: RestoreActor, transport: (rpc: RestoreRpc, params: Record<string, unknown>) => Promise<unknown>): Promise<{ confirmedIndex: number }>
export function inspectUncertainRestoreAction(journal: RestoreJournal, readOperation: (operationId: string) => Promise<unknown>): Promise<{
  outcome: 'ABSENCE_NOT_PROOF_OF_NONEXECUTION' | 'ACK_MATCH_REQUIRES_REVIEW' | 'CONFLICT_STOP'
  mayResend: false
  mayAdvance: false
}>
