export type ProductionBootstrapManifest = {
  version: number
  profile: string
  importWindowAfter: string
  postImportFiles: string[]
  files: Array<{ path: string; sha256: string }>
}

export type ProductionPackageManifest = {
  PRE_CUTOVER: boolean
  export_mode: string
  contract_version: string
  source_schema_fingerprint: string
  files: Array<{ file: string; row_count: number; checksum_sha256: string }>
  total_migrable_rows: number
  content_sha256: string
  [key: string]: unknown
}

export type ProductionPlan = {
  schemaVersion: number
  status: 'PLANNED'
  targetProjectRef: string
  bootstrapManifestSha256: string
  sqlFiles: Array<{ file: string; sha256: string }>
  transactionModel: { mode: string; files: Array<{ path: string; transaction: string }> }
  preImportSqlFiles: string[]
  importWindowAfter: string
  importAction: 'ZERO_ROW_NO_DML'
  postImportSqlFiles: string[]
  packageManifestSha256: string
  packageContentSha256: string
  expectedMigrableRows: 0
  checks: string[]
}

export function validateProjectRef(value: unknown, label?: string): string
export function assertAcceptedOptions(options: Record<string, unknown>, allowed: string[]): void
export function assertProductionTargetUrl(value: unknown, confirmedRef: unknown): URL
export function assertApprovedZeroRowPackagePath(packageDirectory: unknown): string
export function validateCanonicalPlan(bootstrapManifest: ProductionBootstrapManifest, packageManifest: ProductionPackageManifest): {
  preImportSqlFiles: string[]
  postImportSqlFiles: string[]
  packageFiles: string[]
  totalMigrableRows: number
}
export function validateTransactionModel(bootstrapManifest: ProductionBootstrapManifest, readSql?: (file: string) => Promise<string>): Promise<{
  mode: 'ONE_TRANSACTION_PER_MANIFEST_SQL_FILE'
  files: Array<{ path: string; transaction: 'FILE_ATOMIC_BEGIN_COMMIT' }>
}>
export function classifyBootstrapFailure(writeAttempted: boolean): 'TAINTED_BOOTSTRAP' | 'BLOCKED_NO_WRITES'
export function buildProductionBootstrapPlan(options: {
  targetRef: unknown
  packageDirectory: string
  readPackage?: (directory: string) => Promise<{ packageManifest: ProductionPackageManifest }>
  readBytes?: (file: string) => Promise<Buffer>
}): Promise<ProductionPlan>
export interface ProductionBootstrapQueryClient {
  query(statement: string, parameters?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>
}
export function assertCleanTarget(client: ProductionBootstrapQueryClient, expectedRef: string, actualRef: string, options?: { allowedExtensions?: Set<string> }): Promise<{
  role: 'postgres'
  database: 'postgres'
  publicObjects: number
  allowlistedExtensionObjects: number
}>
export function createEvidenceRecord(plan: ProductionPlan, now?: string): {
  schemaVersion: number
  status: 'PLANNED'
  timestamp: string
  targetProjectRef: string
  bootstrapManifestSha256: string
  sqlFiles: ProductionPlan['sqlFiles']
  packageManifestSha256: string
  packageContentSha256: string
  expectedMigrableRows: 0
  stepStatuses: Record<string, 'NOT_RUN'>
  lastPassedStep: null
  writeAttempted: false
  schemaSecurityCounts: null
  triggerCount: null
  reconciliationStatus: 'NOT_RUN'
  finalStatus: 'PLANNED'
}
