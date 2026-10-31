export const REVIEWED_RESTORE_STRUCTURE_HASH: string
export function verifyRestoreDependencyMetadata(input: unknown, now?: number): {
  status: 'METADATA_MATCH_ONLY'
  structureHash: string
  tables: number
  functions: number
  triggers: number
  columns: number
  constraints: number
}
