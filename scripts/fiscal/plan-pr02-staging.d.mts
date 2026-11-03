export const PR02_TARGET_KIOSK_ID: string
export const PR02_TARGET_CUIT: string
export const PR02_TARGET_PV: number
export const PR02_TARGET_RECEIPT_TYPE: number
export const PR02_TARGET_CERT_SHA256: string
export const PR02_EXPECTED_CATALOG_REVISION: number

export interface Pr02Phase {
  readonly id: string
  readonly description: string
  readonly arcaCallsMax: number
  readonly emissionAllowed: boolean
  readonly readOnly?: boolean
  readonly noAutoRetry?: boolean
}

export const PR02_PHASES: {
  readonly PR02_A: Pr02Phase
  readonly PR02_B: Pr02Phase
  readonly PR02_C: Pr02Phase
  readonly PR02_D: Pr02Phase
}

export interface CandidateSaleInput {
  id: string
  estado: string
  total: string | number
  detalles: Array<{
    producto_id?: string
    cantidad: number | string
    precio_unitario: number | string
  }>
  cae?: string | null
  hasIncompatibleReturns?: boolean
  hasPendingFiscalOperation?: boolean
  hasUncertainIntent?: boolean
  ownerApproved?: boolean
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
}

export function assertNotHistoricalIntent042(intent?: IntentDescriptor | null): void

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
}

export interface VerifiedPreconditions {
  readonly status: 'PASS'
  readonly catalogReady: true
  readonly credentialsReady: true
  readonly emitterReady: true
  readonly workerReady: true
}

export function verifyPr02Preconditions(opts?: PreconditionsInput): VerifiedPreconditions

export interface SimulationParams {
  sale: CandidateSaleInput
  frozenRequest: {
    solicitud: { numero: number }
    sha256: string
  }
  intentId: string
}

export interface SimulationDeps {
  persistIntentDurable: (data: {
    intentId: string
    saleId: string
    sha256: string
    numero: number
    estado: string
  }) => Promise<{ estado: string }>
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
  markIntentUncertain?: (id: string) => Promise<void>
  markIntentRejected?: (id: string, codes?: number[]) => Promise<void>
}

export interface SimulationResult {
  readonly estado: string
  readonly puedeReenviar: boolean
  readonly cae: string | null
  readonly vencimiento?: string
  readonly commercialApplied?: 'APPLIED' | 'IDEMPOTENT'
  readonly codigos?: number[]
  readonly error?: string
}

export function executePr02Simulation(
  params: SimulationParams,
  deps: SimulationDeps
): Promise<SimulationResult>
