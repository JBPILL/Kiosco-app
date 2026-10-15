export type C2FixtureRow = Record<string, unknown>
export type C2Fixture = {
  authMapping: Array<Record<string, string>>
  authUsers: Array<{ id: string }>
  tables: Record<string, C2FixtureRow[]>
}

export interface C2QueryClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    statement: string,
    parameters?: unknown[],
  ): Promise<{ rows: Row[] }>
}

export type C2ForeignKeyMetadata = {
  tableSchema: string
  tableName: string
  constraintName: string
  foreignTableSchema: string
  foreignTableName: string
  sourceColumns: string[]
  destinationColumns: string[]
}

export function validateLocalDatabaseUrl(value: unknown): URL
export function assertBootstrapManifestShape(value: unknown): Record<string, unknown>
export function assertPackageManifestShape(value: unknown): Record<string, unknown>
export function createZeroRowImportPlan(bootstrapManifest: Record<string, unknown>, packageManifest: Record<string, unknown>): {
  preImportSqlFiles: string[]
  postImportSqlFiles: string[]
  packageFiles: string[]
  totalMigrableRows: number
}
export function assertZeroRowPackageArtifact(packageArtifact: { files: Record<string, string>; manifest: Record<string, unknown> }, exportContract: { tables: Array<{ name: string; enabled?: boolean }> }): { files: number; totalMigrableRows: number }
export function loadZeroRowPackage(directory: string): Promise<{
  bootstrapManifest: Record<string, unknown>
  packageManifest: Record<string, unknown>
  mapping: Record<string, unknown>
  migration: Record<string, unknown>
  exportContract: Record<string, unknown>
  files: Record<string, string>
  result: { files: number; totalMigrableRows: number }
  sqlPlan: ReturnType<typeof createZeroRowImportPlan>
}>
export function reconcileZeroRowDestination(client: C2QueryClient, mapping: Record<string, unknown>, migration: Record<string, unknown>, options?: { phase?: 'pre-trigger' | 'final' }): Promise<Record<string, unknown>>
export function assertFixtureStructure(fixture: unknown, mapping: unknown): void
export function assertKeyMetadataContract(value: unknown): void
export function assertForeignKeyMetadata(value: unknown): C2ForeignKeyMetadata
export type C2Reconciliation = {
  counts: Record<string, number>
  salesByState: Array<{ estado: string; n: number; total: string }>
  evidence: Record<string, number>
  foreignKeysChecked: number
  crossKiosk: number
  outOfScopeRows: Record<string, number>
}
export function reconcile(client: C2QueryClient, fixture: C2Fixture): Promise<C2Reconciliation>
export function runC2OneShotPhases(phases: {
  preImport: () => Promise<void>
  preImportStepCount: number
  importFixture: () => Promise<void>
  postImportFiles: string[]
  applySql: (file: string) => Promise<unknown>
  reconcileAt: (phase: 'pre-trigger' | 'final') => Promise<C2Reconciliation>
  checkTriggers: () => Promise<number>
  postflight: () => Promise<void>
}): Promise<{
  preImportStepCount: number
  expectedPostImportTriggersBefore042: 0
  preTriggerReconciliation: 'PASS'
  postImportTriggerCount: number
  finalReconciliation: 'PASS'
  reconciliation: C2Reconciliation
}>
export function executeImportLocal(databaseUrl: unknown, options: { target: 'local'; zeroRowPackageDirectory?: string }): ReturnType<typeof runC2OneShotPhases>
export function validateC2Artifacts(): Promise<{
  sqlFiles: number
  preImportFiles: number
  postImportFiles: number
  fixtureRows: number
  kiosks: number
}>
