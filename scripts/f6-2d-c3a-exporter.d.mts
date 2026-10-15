export type C3AExportTable = {
  name: string
  key: string
  columns?: string[]
  disposition?: string
  countOnly?: boolean
  enabled?: boolean
  filter?: string
  [key: string]: unknown
}

export type C3AExportQuery = { text: string; values: unknown[] }
export type C3ARow = Record<string, unknown>

export function assertLegacySourceUrl(value: unknown, confirmedRef: unknown): URL
export function assertApprovedSourceFingerprint(approvedFingerprint: unknown, currentFingerprint: unknown): void
export function evaluateDemoOnlyZeroRowCutover(input: { conditions: Record<string, boolean>; blockers: Record<string, number>; expectedBlockers: Record<string, number> }): {
  cutoverClass: 'DEMO_ONLY_ZERO_ROW_CUTOVER_NOT_APPLICABLE' | 'OPERATIONAL_CUTOVER_REQUIRED'
  cashClosureRequirement: 'NOT_APPLICABLE_DEMO_ONLY_SOURCE' | 'CUTOVER_BLOCKER'
  finalDataDeltaRequired: boolean
  finalDataExportRequired: boolean
  blockers: Record<string, number>
  failedConditions: string[]
  mismatchedBlockers: string[]
}
export function assertOutputPathAbsent(output: string): Promise<void>
export function validateOutputDirectory(directory: unknown): Promise<string>
export function fingerprintSchemaRows(rows: C3ARow[], contract: { tables: C3AExportTable[] }): string
export function canonicalizeTimestamptz(value: unknown): string
export function canonicalizeDate(value: unknown): string
export function normalizeHistoricalStockMovements(inputRows: C3ARow[]): C3ARow[]
export function validateExportContract(mapping: unknown, migration: unknown): { version: string; mode: string; tables: C3AExportTable[]; [key: string]: unknown }
export function buildSelectQuery(table: C3AExportTable, options?: {
  saleIds?: string[]
  closedSessionIds?: string[]
  stockMovementIds?: string[]
  approvedIds?: string[]
  idOnly?: boolean
}): C3AExportQuery
export function validateClassification(classification: unknown, tableContract: Pick<C3AExportTable, 'name' | 'key'>, candidateRows: C3ARow[]): C3ARow[]
export function validatePreCutoverBaseline(classification: unknown, actualCounts: Record<string, number>, migration: unknown): void
export function validateReviewedBaseline(classification: unknown, migration: unknown): void
export function validateApprovedClassification(classification: unknown, migration: unknown): void
export function approvedCandidateDependencies(tableName: string, classification: C3ARow, closedSessionIds?: string[]): Record<string, string[]>
export function validateExportPackage(packageArtifact: { files: Record<string, string>; manifest: Record<string, unknown> }, contract: { tables: C3AExportTable[] }, classification?: C3ARow | null): { files: number; totalMigrableRows: number }
export function writeExportPackageAtomically(output: string, packageArtifact: { files: Record<string, string>; manifest: Record<string, unknown> }, contract: { tables: C3AExportTable[] }, classification?: C3ARow | null, fileOperations?: object): Promise<{ files: number; totalMigrableRows: number }>
export function runReadOnlyExport(options: Record<string, unknown>, mapping: unknown, migration: unknown, contract: { tables: C3AExportTable[] }, dependencies?: { createClient?: (config: Record<string, unknown>) => unknown }): Promise<Record<string, unknown>>
export function buildClassificationDraft(input: {
  mapping: unknown
  migration: unknown
  candidateIds: Record<string, string[]>
  block03Counts: Record<string, number>
  block11Rows: C3ARow[]
  sourceSchemaFingerprint: string
  openSessions: number
  openSessionSales: number
  baselineStatus: string
}): C3ARow
export function buildExportPackage(input: {
  mapping: unknown
  migration: unknown
  rowsByTable: Record<string, C3ARow[]>
  generatedAt: string
  sourceSchemaFingerprint: string
  classification?: C3ARow | null
}): { files: Record<string, string>; manifest: Record<string, unknown> }

export function buildEnrichmentSql(candidateArtifact: unknown): string
