import type { RestoreJournal } from './restore-acceptance-engine.mjs'
export const RESTORE_PRESERVATION_TABLES: readonly string[]
export const RESTORE_PRESERVATION_SCOPE_HASH: string
export interface RestorePreservationBaseline {
 version: number; planHash: string; scopeHash: string; journalHeader: string; observedAt: string; serverVersion: string
 tables: {name: string; count: number; sha256: string}[]
 baselineHash: string
}
export function buildRestorePreservationReadSql(): string
export function createRestorePreservationBaseline(journal: RestoreJournal,value: unknown,now?: number): RestorePreservationBaseline
export function writeRestorePreservationBaseline(journal: RestoreJournal,value: unknown,now?: number): RestorePreservationBaseline
export function loadRestorePreservationBaseline(journal: RestoreJournal): RestorePreservationBaseline
export function verifyRestorePreservation(journal: RestoreJournal,baseline: RestorePreservationBaseline,value: unknown,reviewedHash: string,now?: number): {status: 'REVIEWED_COMMERCIAL_INVENTORY_MATCH_ONLY'; tables: number; cursor: number; baselineHash: string}
