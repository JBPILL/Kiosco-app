export type InitialAdminIdentity = {
  email: string
  nombre: string
  password: string
}

export type InitialAdminInput = {
  superadmin: InitialAdminIdentity
  owner: InitialAdminIdentity
  kiosco: { nombre: string }
}

export type InitialBootstrapEvidence = {
  status: 'PASS'
  finalStatus: 'PASS'
  targetProjectRef: 'local'
  reconciliationStatus: 'PASS'
  expectedMigrableRows: 0
  lastPassedStep: 'RECONCILIATION_FINAL'
  [key: string]: unknown
}

export type InitialIdentityState = {
  authUsers: number
  profiles: number
  kiosks: number
  superadmins: number
  owners: number
  activeProfiles: number
  authMappings: number
  authIdsMatch: boolean
  superadminRole: string
  superadminNullKiosk: boolean
  ownerKioskAssigned: boolean
}

export type InitialAdminEvidence = {
  schemaVersion: 1
  operation: 'INITIAL_PLATFORM_ADMIN_BOOTSTRAP'
  target: 'local'
  timestamp: string
  status: string
  writeAttempted: boolean
  productionBootstrapEvidenceSha256: string
  resultCounts: null | Record<string, number>
  authenticatedTests: { superadmin: string; owner: string }
  privilegeSeparation: string
  finalStatus: string
  failure?: string
}

export const initialSuperadminRole: 'VISOR'
export function validateLocalSupabaseApiUrl(value: unknown): URL
export function validateInitialAdminInput(value: unknown): InitialAdminInput
export function validateInitialBootstrapEvidence(value: unknown): InitialBootstrapEvidence
export function validateInitialIdentityState(rows: InitialIdentityState, expectedAuthIds: string[]): InitialIdentityState
export function createInitialAdminEvidence(options: { target?: 'local'; bootstrapEvidenceSha256: string; now?: string }): InitialAdminEvidence
export function verifyLocalPrivilegeSeparation(client: {
  query(statement: string, parameters?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>
}, superadminAuthId: string, ownerAuthId: string, ownerKioskId: string): Promise<'PASS'>
export function executeInitialPlatformAdminBootstrap(options: {
  databaseUrl: string | undefined
  supabaseUrl: string | undefined
  serviceRoleKey: string | undefined
  publicKey: string | undefined
  input: unknown
  bootstrapEvidence: unknown
  evidencePath: string
  clientFactory?: (config: Record<string, unknown>) => {
    connected?: boolean
    connect(): Promise<void>
    query(statement: string, parameters?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>
    end(): Promise<void>
  }
  fetchImpl?: typeof fetch
  verifyPrivileges?: (client: unknown, superadminAuthId: string, ownerAuthId: string, ownerKioskId: string) => Promise<'PASS'>
  now?: () => string
}): Promise<{
  status: 'PASS'
  evidencePath: string
  counts: { authUsers: number; profiles: number; kiosks: number; superadmins: number; owners: number; activeProfiles: number }
}>
