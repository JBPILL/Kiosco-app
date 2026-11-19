import type { RestoreJournal } from './restore-acceptance-engine.mjs'
import type { RestorePreservationBaseline } from './restore-preservation.mjs'
export interface RestoreReadOnlyPort {
  readDependencyMetadata(): Promise<{status: 'METADATA_MATCH_ONLY'; structureHash: string}>
  readInitialPreflight(): Promise<{status: 'METADATA_MATCH_ONLY'; structureHash: string; initialState: 'ABSENT_FIXTURES_NO_COLLISIONS_ONLY'}>
  readOwnedState(journal: RestoreJournal): Promise<{status: 'METADATA_MATCH_ONLY'; structureHash: string; ownedState: 'OWNED_FIXTURES_MATCH_ONLY'; cursor: number}>
  capturePreservationBaseline(journal: RestoreJournal): Promise<{baselineHash: string; preparationOnly: true; status: 'METADATA_MATCH_ONLY'; ownedState: 'OWNED_FIXTURES_MATCH_ONLY'; initialState: 'ABSENT_FIXTURES_NO_COLLISIONS_ONLY'; cursor: number}>
  readPreservedState(journal: RestoreJournal,baseline: RestorePreservationBaseline,reviewedHash: string): Promise<{commercialPreservation: 'REVIEWED_COMMERCIAL_INVENTORY_MATCH_ONLY'; status: 'METADATA_MATCH_ONLY'; ownedState: 'OWNED_FIXTURES_MATCH_ONLY'; cursor: number}>
  dispose(): Promise<void>
}
export interface RestoreReadOnlyClient {
  connection?: {stream?: {encrypted?: boolean; authorized?: boolean}}
  on(event: string, listener: () => void): void
  connect(): Promise<void>
  query(sql: string): Promise<unknown>
  end(): Promise<void>
}
export type RestoreConnectDiagnostic =
  | 'CONNECT_AUTH_OR_HANDSHAKE'
  | 'CONNECT_TIMEOUT'
  | 'CONNECT_NETWORK'
  | 'CONNECT_STARTUP_OPTIONS'
  | 'CONNECT_TLS'
  | 'CONNECT_SESSION_SET'
  | 'CONNECT_SESSION_PROBE'
  | 'CONNECT_SESSION_PROBE_READ_ONLY'
  | 'CONNECT_SESSION_PROBE_SEARCH_PATH'
  | 'CONNECT_SESSION_PROBE_ROLE'
  | 'CONNECT_SESSION_PROBE_DATABASE'
  | 'CONNECT_CLOSE'
export const RESTORE_CONNECT_DIAGNOSTICS: readonly RestoreConnectDiagnostic[]
export function connectRestoreReadOnlyPostgres(credentials: {password: string; rootCertificate: string}, dependencies?: {Client?: new (config: unknown) => RestoreReadOnlyClient; now?: () => number}): Promise<RestoreReadOnlyPort>
