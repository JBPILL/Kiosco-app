import type { Pr02P0OfficialEvidenceManifest } from './plan-pr02-parameters.d.mts'

export const PR02_P0_SCOPE: string
export const PR02_PARAMETERS_TARGET_PROJECT_REF: string
export const PR02_PARAMETERS_EXPECTED_ISSUER_CUIT: string
export const PR02_PARAMETERS_EXPECTED_ISSUER_PV: number
export const PR02_P0_COLECTOR_IDENTIDAD: string
export const WSAA_HOMO_URL: string
export const WSFE_HOMO_URL: string
export const PROHIBITED_ARCA_OPERATIONS: readonly string[]
export const ALLOWED_P0_ARCA_OPERATIONS: readonly string[]
export const DEFAULT_PRIVATE_EVIDENCE_DIR: string

export const P0_MAX_LIMITS: {
  readonly loginCmsMax: number
  readonly tiposIvaMax: number
  readonly condicionIvaReceptorMax: number
  readonly totalMax: number
}

export function assertNoForbiddenSecrets(val: unknown, context?: string): void
export function validateP0EndpointUrl(url: string, serviceName?: string): void

export function createOfficialArcaTransport(options?: {
  timeoutMs?: number
  maxResponseBytes?: number
  officialGoAuthorized?: boolean
}): {
  readonly type: 'OFFICIAL'
  postSoap(url: string, soapAction: string, soapBody: string): Promise<string>
}

export function validateEvidenceDirectory(dirPath: string, repoRoot?: string): string

export interface Pr02P0CallTracker {
  recordStart(operationName: string): void
  recordCall(operationName: string): void
  recordFailure(operationName: string): void
  getCounts(): {
    readonly loginCms: number
    readonly tiposIva: number
    readonly condicionIvaReceptor: number
    readonly total: number
  }
  getAuditSummary(): {
    readonly started: readonly string[]
    readonly completed: readonly string[]
    readonly failed: readonly string[]
    readonly counts: {
      readonly loginCms: number
      readonly tiposIva: number
      readonly condicionIvaReceptor: number
      readonly total: number
    }
  }
  getOperations(): readonly string[]
}

export function createPr02P0CallTracker(options?: {
  loginCmsMax?: number
  tiposIvaMax?: number
  condicionIvaReceptorMax?: number
  totalMax?: number
}): Pr02P0CallTracker

export interface Pr02P0CliArgs {
  readonly authorized: boolean
  readonly dryRun: boolean
  readonly scope: string
  readonly projectRef: string
  readonly head: string
  readonly expectedHead: string
  readonly evidenceDir: string
  readonly saveEvidence: boolean
}

export function validatePr02P0CliArgs(argv?: readonly string[]): Pr02P0CliArgs

export function saveP0EvidencePackage(params: {
  evidenceDir?: string
  manifest: Pr02P0OfficialEvidenceManifest
  rawIvaSoapXml: string
  ivaNormalizedText: string
  rawConditionSoapXml: string
  conditionNormalizedText: string
}): {
  readonly saved: boolean
  readonly evidenceDir: string
  readonly files: readonly string[]
}

export function loadP0EvidencePackage(evidenceDir?: string): {
  readonly manifest: Pr02P0OfficialEvidenceManifest
  readonly rawIvaSoapXml: string
  readonly ivaNormalizedText: string
  readonly rawConditionSoapXml: string
  readonly conditionNormalizedText: string
}

export interface Pr02P0ExecutionOptions {
  argv?: readonly string[]
  authorized?: boolean
  dryRun?: boolean
  scope?: string
  projectRef?: string
  head?: string
  expectedHead?: string
  evidenceDir?: string
  saveEvidence?: boolean
  cmsBase64?: string
  existingTa?: string | {
    token?: string
    sign?: string
    expirationTime?: string
    vence_en?: string
    estado?: string
    valido?: boolean
    servicio?: string
    cuit?: string
  }
  now?: string | number | Date
  wsaaUrl?: string
  wsfeUrl?: string
  processId?: string
  loginCmsMax?: number
  tiposIvaMax?: number
  condicionIvaReceptorMax?: number
  totalMax?: number
  authoritySecret?: string
  officialGoAuthorized?: boolean
}

export interface Pr02P0ExecutionDeps {
  fetcher?: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>
  wsaaLogin?: () => Promise<string>
  wsfeTiposIva?: (params: { token: string; sign: string; cuit: string }) => Promise<string>
  wsfeCondicionIva?: (params: { token: string; sign: string; cuit: string }) => Promise<string>
  isOfficialExecution?: boolean
  transportType?: string
}

export interface Pr02P0ExecutionReport {
  readonly execution: string
  readonly scope: string
  readonly projectRef: string
  readonly processId?: string
  readonly PR02_P0_EXECUTION?: string
  readonly PR02_P0_LOCAL_PREPARATION: string
  readonly PR02_P0_LOCAL_HARDENING: string
  readonly P0_REAL_TRANSPORT_IMPLEMENTED: string
  readonly P0_CLI_TRANSPORT_WIRING: string
  readonly P0_WSAA_TA_GUARD: string
  readonly P0_EXACT_ENDPOINT_GUARD: string
  readonly P0_CALL_LIMITS_NON_OVERRIDABLE: string
  readonly P0_PROVENANCE_ATTESTATION: string
  readonly P0_FAKE_MANIFEST_REJECTED: string
  readonly P0_PRIVATE_EVIDENCE_STORAGE: string
  readonly P0_AUDIT_COUNTS_ACCURATE: string
  readonly PR02_P0_COLLECTOR_IMPLEMENTATION?: string
  readonly PR02_P0_AUTHORIZATION_GUARD: string
  readonly PR02_P0_WSAA_WSFE_ALLOWLIST: string
  readonly PR02_P0_CALL_LIMIT_GUARD: string
  readonly PR02_P0_SOAP_VALIDATION: string
  readonly PR02_P0_MANIFEST_INTEGRITY: string
  readonly PR02_P0_PROVENANCE_BINDING: string
  readonly CONTENT_INTEGRITY?: string
  readonly OFFICIAL_PROVENANCE: string
  readonly PR02_P0_REMOTE_EXECUTION_READY: boolean
  readonly P0_REMOTE_EXECUTED: boolean
  readonly PR02_P0_REMOTE_EXECUTED: boolean
  readonly PR02_P1_REMOTE_EXECUTION_READY: boolean
  readonly PR02_P2_REMOTE_EXECUTION_READY: boolean
  readonly REAL_PV2_ENABLED: boolean
  readonly HISTORICAL_042_IDENTIFICATION: string
  readonly PR02_READY_FOR_EMISSION_GO: boolean
  readonly ARCA_CALLS_NEW: number
  readonly STAGING_WRITES_NEW: number
  readonly PRODUCTION_MUTATIONS: number
  readonly UNAUTHORIZED_CONNECTION_ATTEMPTS?: number
  readonly auditCounts?: unknown
  readonly manifest?: Pr02P0OfficialEvidenceManifest
  readonly evidenceFiles?: readonly string[]
}

export function executePr02P0OfficialEvidence(
  options?: Pr02P0ExecutionOptions,
  deps?: Pr02P0ExecutionDeps
): Promise<Pr02P0ExecutionReport>
