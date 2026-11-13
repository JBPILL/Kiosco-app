import type { RestoreJournal } from './restore-acceptance-engine.mjs'
export function buildRestoreStateReadSql(journal: RestoreJournal): string
export function verifyRestoreStateRead(journal: RestoreJournal, value: unknown, now?: number): {
 status: 'OWNED_FIXTURES_MATCH_ONLY'
 cursor: number
 operations: number
 stockOperations: number
}
