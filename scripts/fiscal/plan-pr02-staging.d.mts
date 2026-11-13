export const PR02_P0_SCOPE: string
export const PR02_P1_SCOPE: string
export const PR02_P2_SCOPE: string

export const PR02_TARGET_KIOSK_ID: string
export const PR02_TARGET_CUIT: string
export const PR02_TARGET_PV: number
export const PR02_TARGET_RECEIPT_TYPE: number
export const PR02_TARGET_CERT_SHA256: string
export const PR02_HISTORICAL_CATALOG_REVISION: number
export const PR02_TARGET_CATALOG_REVISION_R4: number
export const PR02_EXPECTED_CATALOG_REVISION: number
export const PR02_SUPPORTED_CATALOG_REVISIONS: readonly [number, number]
export const IS_PR02_SIMULATION_TEST_ONLY: true

export interface Pr02Phase {
  readonly id: string
  readonly description: string
  readonly arcaCallsMax: number
  readonly emissionAllowed: boolean
  readonly readOnly?: boolean
  readonly stagingWrites?: number
  readonly service?: string
  readonly noAutoRetry?: boolean
  readonly targetRevision?: number
}

export const PR02_PHASES: {
  readonly PR02_A0: Pr02Phase
  readonly PR02_P0: Pr02Phase
  readonly PR02_P1: Pr02Phase
  readonly PR02_P2: Pr02Phase
  readonly PR02_A1: Pr02Phase
  readonly PR02_A2: Pr02Phase
  readonly PR02_B: Pr02Phase
  readonly PR02_C: Pr02Phase
  readonly PR02_D: Pr02Phase
}

export interface OwnerApprovalAudit {
  approvedByAuthId: string
  approvedVentaId: string
  approvedAt: string | number
}

export interface CandidateSaleAuditEvidence {
  returnsAudit: string
  pendingOperationsAudit: string
  uncertainIntentsAudit: string
  ownerApprovalAudit?: OwnerApprovalAudit
}

export interface CandidateSaleInput {
  id: string
  kiosco_id: string
  estado: string
  total: string | number
  detalles: Array<{
    producto_id?: string
    cantidad: number | string
    precio_unitario: number | string
  }>
  cae?: string | null
  auditEvidence?: CandidateSaleAuditEvidence
}

export interface ValidatedCandidateSale {
  readonly valid: true
  readonly kioskId: string
  readonly puntoVenta: number
  readonly tipoComprobante: number
  readonly saleId: string
  readonly total: string
}

export function validatePr02CandidateSale(sale: unknown): ValidatedCandidateSale

export interface IntentDescriptor {
  id?: string
  intento_id?: string
  operacion_id?: string
  accion?: string
  action?: string
  isHistorical042?: boolean
  tag?: string
  estado?: string
  hasUncertainIntent?: boolean
  allowReemission?: boolean
}

export function assertNotHistoricalIntent042(intent?: IntentDescriptor | null): void

export interface OfficialNumberingObservation {
  cuit: string
  puntoVenta: number
  tipoComprobante: number
  ultimoNumero: number
  observedAt: number
}

export interface PreconditionsInput {
  catalogRevision?: number
  catalogEnabled?: boolean
  catalogExpired?: boolean
  taValid?: boolean
  taExpiresAt?: number
  cuit?: string
  puntoVenta?: number
  kioskId?: string
  certSha?: string
  workerEmissionEnabled?: boolean
  officialNumberingObservation?: OfficialNumberingObservation
}

export interface VerifiedPreconditions {
  readonly status: 'PASS'
  readonly STAGING_SQL_PREFLIGHT: string
  readonly WSAA_AUTHENTICATION_STATUS: string
  readonly WSFE_NUMBERING_OBSERVATION: string
  readonly EMISSION_PERMISSION: string
  readonly catalogReady: true
  readonly credentialsReady: true
  readonly emitterReady: true
  readonly workerReady: true
}

export function verifyPr02Preconditions(opts: PreconditionsInput): VerifiedPreconditions

export interface SimulationParams {
  sale: CandidateSaleInput
  frozenRequest: {
    solicitud: { numero: number }
    sha256: string
  }
  intentId: string
}

export interface SimulationExistingIntent {
  estado: string
  cae?: string | null
  vencimiento?: string
  codigos?: number[]
}

export interface SimulationDeps {
  getExistingIntent?: (id: string) => Promise<SimulationExistingIntent | null | undefined>
  persistIntentDurable: (data: {
    intentId: string
    saleId: string
    sha256: string
    numero: number
    estado: string
  }) => Promise<{
    estado: string
    intentId?: string
    saleId?: string
    sha256?: string
    numero?: number
  }>
  persistIntentUncertain?: (data: {
    intentId: string
    saleId: string
    estado: string
    error: string
  }) => Promise<{ confirmed: boolean }>
  sendSoapEmission: (frozen: unknown) => Promise<{
    estado: 'APROBACION_RECIBIDA' | 'RECHAZO_RECIBIDO'
    codigos?: number[]
  }>
  consultSoapVoucher: (frozen: unknown) => Promise<{
    estado: 'AUTORIZACION_COINCIDENTE' | 'CONCILIAR'
    cae: string
    vencimiento: string
  }>
  applyCommercialResolution: (data: {
    saleId: string
    cae: string
    vencimiento: string
  }) => Promise<{ alreadyApplied: boolean }>
  markIntentRejected?: (id: string, codes?: number[]) => Promise<void>
  saveIntentState?: (id: string, result: unknown) => Promise<void>
}

export interface SimulationResult {
  readonly estado: string
  readonly puedeReenviar: boolean
  readonly cae: string | null
  readonly vencimiento?: string
  readonly commercialApplied?: 'APPLIED' | 'IDEMPOTENT'
  readonly codigos?: number[]
  readonly error?: string
  readonly blockedForReconciliation?: boolean
  readonly UNCERTAIN_STATE_DURABLY_CONFIRMED?: boolean
  readonly REPLAY_SECOND_SOAP_CALL?: number
}

export function executePr02Simulation(
  params: SimulationParams,
  deps: SimulationDeps
): Promise<SimulationResult>

export function validatePr02CatalogContract(
  catalog: unknown,
  expectedRevision?: number,
  options?: { now?: string | number; requireAccreditedProvenance?: boolean }
): boolean
