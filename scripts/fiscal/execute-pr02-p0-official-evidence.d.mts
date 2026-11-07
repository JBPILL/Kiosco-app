import type {
  Pr02P0OfficialEvidenceManifest,
  AttestationRequestPackage,
} from './plan-pr02-parameters.d.mts'
export {
  createAttestationRequest,
  validateAttestationRequest,
  IndependentAttestationAuthority,
} from './plan-pr02-parameters.d.mts'

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

export function createOfficialArcaTransport(
  verifiedGoAuth: unknown,
  options?: {
    timeoutMs?: number
    maxResponseBytes?: number
  }
): {
  readonly type: 'OFFICIAL'
  postSoap(url: string, soapAction: string, soapBody: string): Promise<string>
}

export function validateEvidenceDirectory(dirPath: string, repoRoot?: string): string

export interface Pr02P0CallTracker {
  recordStart(operationName: string): void
  recordCall(operationName: string): void
  recordSuccess?(operationName: string): void
  recordFailure(operationName: string, isTimeout?: boolean): void
  getCounts(): {
    readonly loginCms: number
    readonly tiposIva: number
    readonly condicionIvaReceptor: number
    readonly total: number
    readonly attempted: number
    readonly completed: number
    readonly failed: number
    readonly outcomeUnknown: number
  }
  getAuditSummary(): {
    readonly started: readonly string[]
    readonly completed: readonly string[]
    readonly failed: readonly string[]
    readonly outcomeUnknown: readonly string[]
    readonly CALLS_ATTEMPTED: number
    readonly CALLS_COMPLETED: number
    readonly CALLS_FAILED: number
    readonly CALLS_OUTCOME_UNKNOWN: number
    readonly counts: {
      readonly loginCms: number
      readonly tiposIva: number
      readonly condicionIvaReceptor: number
      readonly total: number
      readonly attempted: number
      readonly completed: number
      readonly failed: number
      readonly outcomeUnknown: number
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

export const PR02_P0_AUTHORITY_ENV: string
export const PR02_P0_GO_AUTHORITY_ENV: string
export const ANTI_REPLAY_GUARANTEE_LEVEL: 'HOST_LOCAL_DURABLE_ONE_TIME_USE'
export function validatePr02P0GoAuthorization(
  signedGoDoc: unknown,
  options?: {
    expectedHead?: string
    trustedGoAuthoritySecret?: string
    allowTestKeys?: boolean
    now?: string | number | Date
  }
): {
  readonly valid: true
  readonly authorizationId: string
  readonly approverId: string
  readonly scope: string
  readonly projectRef: string
  readonly commitSha: string
  readonly documentSha256: string
  readonly canonicalDocument: unknown
  readonly expiresAt: string
  readonly issuedAt: string
  readonly singleUseNonce: string
}
export function markGoAuthorizationConsumed(authId: unknown): void
export function isGoAuthorizationConsumed(authId: unknown): boolean

export interface Pr02P0CliArgs {
  readonly authorized: boolean
  readonly dryRun: boolean
  readonly scope: string
  readonly projectRef: string
  readonly head: string
  readonly expectedHead: string
  readonly evidenceDir: string
  readonly saveEvidence: boolean
  readonly goFilePath?: string
  readonly cmsFilePath: string
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
  cmsFilePath?: string
  goFilePath?: string
  goAuthorizationDoc?: unknown
  goAuthorization?: string | unknown
  trustedGoPublicKey?: unknown
  trustedGoAuthoritySecret?: string
  trustedAttestationPublicKey?: unknown
  consumedAuthorizationsDir?: string
  allowTestKeys?: boolean
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
}

export interface Pr02P0ExecutionDeps {
  fetcher?: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>
  wsaaLogin?: () => Promise<string>
  wsfeTiposIva?: (params: { token: string; sign: string; cuit: string }) => Promise<string>
  wsfeCondicionIva?: (params: { token: string; sign: string; cuit: string }) => Promise<string>
  isOfficialExecution?: boolean
  transportType?: string
}

export interface Pr02P0ExecutionAuditCounts {
  readonly CALLS_ATTEMPTED: number
  readonly CALLS_COMPLETED: number
  readonly CALLS_FAILED?: number
  readonly CALLS_OUTCOME_UNKNOWN?: number
  readonly LOGIN_CMS_CALLS?: number
  readonly TIPOS_IVA_CALLS?: number
  readonly CONDICION_IVA_CALLS?: number
  readonly TOTAL_CALLS?: number
}

export interface Pr02P0ExecutionReport {
  readonly execution: string
  readonly scope: string
  readonly projectRef: string
  readonly processId?: string
  readonly P0_EXTERNAL_GO_VALIDATION?: string
  readonly P0_GO_SINGLE_USE_GUARD?: string
  readonly P0_GO_SECRET_EXPOSURE?: string
  readonly P0_TRUSTED_ATTESTATION?: string
  readonly P1_UNTRUSTED_SIGNATURE_REJECTION?: string
  readonly P0_CALL_AUDIT_ON_FAILURE?: string
  readonly GO_AUTHORIZATION?: string
  readonly EVIDENCE_PROVENANCE?: string
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
  readonly ANTI_REPLAY_GUARANTEE_LEVEL?: 'HOST_LOCAL_DURABLE_ONE_TIME_USE'
  readonly EVIDENCE_INTEGRITY?: 'PASS' | 'NOT_RUN' | 'FAIL'
  readonly EVIDENCE_CUSTODY_ATTESTED?: boolean
  readonly ATTESTATION_TRUST_MODEL?: 'SELF_ATTESTED' | 'INDEPENDENT_ATTESTED' | 'UNVERIFIED'
  readonly TRUSTED_EXECUTION_BOUNDARY?: 'VERIFIED' | 'UNVERIFIED'
  readonly ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED?: boolean
  readonly INDEPENDENT_ATTESTATION_AVAILABLE?: boolean
  readonly P1_IMPORT_ALLOWED?: boolean
  readonly P0_PROVENANCE_TRUST_MODEL?: 'SELF_ATTESTED'
  readonly P1_OFFICIAL_PROVENANCE_TRUST?: 'LIMITED'
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
  readonly auditCounts?: Pr02P0ExecutionAuditCounts
  readonly manifest?: Pr02P0OfficialEvidenceManifest
  readonly attestationRequest?: AttestationRequestPackage
  readonly evidenceFiles?: readonly string[]
}

export function executePr02P0OfficialEvidence(
  options?: Pr02P0ExecutionOptions,
  deps?: Pr02P0ExecutionDeps
): Promise<Pr02P0ExecutionReport>
