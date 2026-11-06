import type { RestoreJournal } from './restore-acceptance-engine.mjs'
export function buildUncertainRestoreReadSql(journal: RestoreJournal): string
export function decodeUncertainRestoreRead(journal: RestoreJournal, evidence: unknown): null | {
  operationId: string
  kioskId: string
  actorAuthId: string
  requestHash: string
  ack: unknown
}
