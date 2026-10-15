export const productionProjectRef: string
export const productionSupabaseApiUrl: string
export const initialSuperadminRole: 'VISOR'

export interface InitialIdentityInput {
  email: string
  password: string
  nombre: string
}

export interface InitialAdminInput {
  superadmin: InitialIdentityInput
  owner: InitialIdentityInput
  kiosco: {
    nombre: string
  }
}

export interface ValidatedInitialAdminInput {
  superadmin: InitialIdentityInput
  owner: InitialIdentityInput
  kioskName: string
}

export interface ProductionClientConfig {
  connectionString: string
  ssl: {
    rejectUnauthorized: boolean
    servername: string
  }
  connectionTimeoutMillis: number
  query_timeout: number
}

export function validateProductionSupabaseApiUrl(
  value: unknown,
  confirmedRef?: string,
): URL

export function validateProductionSecretKey(
  value: unknown,
): string

export function validateProductionPublishableKey(
  value: unknown,
): string

export function validateInitialAdminInput(
  input: unknown,
): ValidatedInitialAdminInput

export function validateInitialBootstrapEvidence<T>(
  value: T,
  targetRef?: string,
): T

export function validateInitialIdentityState<
  T extends Record<string, unknown>,
>(
  rows: T,
  expectedAuthIds: string[],
): T

export function createInitialAdminEvidence(args: {
  targetProjectRef?: string
  bootstrapEvidenceSha256: string
  now?: string
}): {
  targetProjectRef: string
  [key: string]: unknown
}

export function verifyProductionPrivilegeSeparation(
  client: any,
  superadminAuthId: string,
  ownerAuthId: string,
  ownerKioskId: string,
): Promise<'PASS'>

export function executeInitialPlatformAdminBootstrap(
  args: {
    databaseUrl: string
    targetRef?: string
    supabaseUrl: string
    secretKey: string
    publishableKey: string
    input: InitialAdminInput
    bootstrapEvidence: unknown
    evidencePath: string

    clientFactory?: (
      config: ProductionClientConfig,
    ) => any

    adminClientFactory?: (
      url: string,
      key: string,
    ) => any

    fetchImpl?: (...args: any[]) => any

    verifyPrivileges?: (
      client: any,
      superadminAuthId: string,
      ownerAuthId: string,
      ownerKioskId: string,
    ) => Promise<'PASS'> | 'PASS'

    now?: () => string
  },
): Promise<any>
