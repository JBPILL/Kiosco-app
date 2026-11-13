import type { Client } from 'pg'

export const PR02_PARAMETERS_EXECUTION_TARGET: string
export const PR02_PARAMETERS_DB_HOST: string
export const PR02_PARAMETERS_DB_PORT: number
export const PR02_PARAMETERS_DB_USER: string
export const PR02_PARAMETERS_DB_NAME: string
export const REV3_SOURCE_SHA256: string
export const PR02_CATALOG_REV3_HASH: string

export function resolvePostgresSslConfig(options?: {
  ssl?: { rejectUnauthorized?: boolean; ca?: string }
  caCertPath?: string
}): { readonly rejectUnauthorized: true; readonly ca: string }

export function checkSoapFault(doc: unknown, serviceName?: string): void
export function checkWsfeErrors(doc: unknown): void

export function buildWsaaLoginCmsSoapRequest(cmsBase64: string): string
export function parseWsaaLoginCmsResponse(soapXml: string, now?: Date | string | number): {
  token: string
  sign: string
  expirationTime: string
}

export function buildWsfeTiposIvaRequest(auth: { token: string; sign: string; cuit: string }): string
export function parseWsfeTiposIvaResponse(soapXml: string, consultedAt?: string): string

export function buildWsfeCondicionIvaReceptorRequest(auth: { token: string; sign: string; cuit: string }): string
export function parseWsfeCondicionIvaReceptorResponse(soapXml: string, consultedAt?: string): string

export function validatePr02ParametersCliArgs(argv?: string[]): {
  readonly authorized: boolean
  readonly dryRun: boolean
  readonly scope: string
  readonly projectRef: string
  readonly head: string | null
  readonly expectedHead: string | null
  readonly expectedHash: string | null
  readonly ivaFile: string | null
  readonly conditionFile: string | null
  readonly manifestFile: string | null
  readonly caCertPath: string | null
}

export function assertNoForbiddenCredentials(password: unknown): void

export interface Pr02ParametersOptions {
  argv?: string[]
  authorized?: boolean
  dryRun?: boolean
  scope?: string
  projectRef?: string
  head?: string
  expectedHead?: string
  expectedHash?: string
  password?: string
  caCertPath?: string
  ivaText?: string
  conditionText?: string
  ivaFile?: string
  conditionFile?: string
  manifestFile?: string
  manifest?: unknown
  allowUnaccreditedForTest?: boolean
  expectedHashes?: { iva?: string; condition?: string }
  now?: string | Date
  expiresAt?: string
}

export interface Pr02ParametersReport {
  readonly execution: string
  readonly scope: string
  readonly projectRef: string
  readonly PR02_P1_EXECUTION?: string
  readonly PR02_P2_EXECUTION?: string
  readonly PR02_P1_IMPORT_ONLY?: boolean
  readonly PR02_P1_OFFICIAL_EVIDENCE_VERIFIED?: string
  readonly PR02_P1_AUTHORIZATION_GUARD?: string
  readonly PR02_P1_ATOMIC_GUARDS?: string
  readonly PR02_P1_COMMIT_OUTCOME_GUARD?: string
  readonly PR02_P2_ATOMIC_GUARDS?: string
  readonly PR02_P2_REV3_BASELINE_GUARD?: string
  readonly PR02_P0_REMOTE_EXECUTION_READY?: boolean
  readonly PR02_P1_REMOTE_EXECUTION_READY?: boolean
  readonly PR02_P2_REMOTE_EXECUTION_READY?: boolean
  readonly PR02_PARAMETERS_LOCAL_PREPARATION?: string
  readonly PR02_PARAMETERS_REMOTE_EXECUTION_READY: boolean
  readonly PR02_PARAMETERS_REMOTE_EXECUTED: boolean
  readonly PR02_READY_FOR_EMISSION_GO: false
  readonly PR02_P1_PREFLIGHT_GUARD?: string
  readonly PR02_P1_POSTCHECK_GUARD?: string
  readonly PR02_P2_GUARD?: string
  readonly PR02_P2_POSTCHECK_GUARD?: string
  readonly REV3_BASELINE_MATCH_BEFORE_COMMIT?: string
  readonly REV4_INSERT_ONLY?: string | boolean
  readonly UNCERTAIN_WRITE_RETRY_FORBIDDEN?: boolean
  readonly REVISION_3_PRESERVED: true
  readonly REVISION_4_HABILITADO: boolean
  readonly REVISION_4_HASH?: string
  readonly REVISION_4_VENCE_EN?: string
  readonly REAL_PV2_ENABLED: false
  readonly REAL_PV2_SERIES_TOUCHED: false
  readonly HISTORICAL_042_IDENTIFICATION: 'UNRESOLVED'
  readonly HISTORICAL_042_REEMISSION_FORBIDDEN: true
  readonly ARCA_CALLS_NEW: number
  readonly STAGING_WRITES_NEW: number
  readonly PRODUCTION_MUTATIONS: number
  readonly UNAUTHORIZED_CONNECTION_ATTEMPTS?: number
  readonly EXECUTION_OUTCOME?: string
}

export function executePr02ParametersStaging(
  options?: Pr02ParametersOptions,
  deps?: {
    Client?: new (config: unknown) => Client
    client?: Client
    caCert?: string
  }
): Promise<Pr02ParametersReport>
