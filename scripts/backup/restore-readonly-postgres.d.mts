import type { RestoreJournal } from './restore-acceptance-engine.mjs'
export interface RestoreReadOnlyPort {
  readDependencyMetadata(): Promise<{status: 'METADATA_MATCH_ONLY'; structureHash: string}>
  readInitialPreflight(): Promise<{status: 'METADATA_MATCH_ONLY'; structureHash: string; initialState: 'ABSENT_FIXTURES_NO_COLLISIONS_ONLY'}>
  readOwnedState(journal: RestoreJournal): Promise<{status: 'METADATA_MATCH_ONLY'; structureHash: string; ownedState: 'OWNED_FIXTURES_MATCH_ONLY'; cursor: number}>
  dispose(): Promise<void>
}
export interface RestoreReadOnlyClient {
  connection?: {stream?: {encrypted?: boolean; authorized?: boolean}}
  on(event: string, listener: () => void): void
  connect(): Promise<void>
  query(sql: string): Promise<unknown>
  end(): Promise<void>
}
export function connectRestoreReadOnlyPostgres(credentials: {password: string; rootCertificate: string}, dependencies?: {Client?: new (config: unknown) => RestoreReadOnlyClient; now?: () => number}): Promise<RestoreReadOnlyPort>
