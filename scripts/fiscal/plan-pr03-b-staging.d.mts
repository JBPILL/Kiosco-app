export interface FiscalRequestParams {
  cuitEmisor: string
  puntoVenta: number
  tipoComprobante: number
  numero: number
  total: string
  fecha: string
  concepto?: number
  tipoDocumento?: number
  numeroDocumento?: string
  condicionIvaReceptor?: number
  servicioDesde?: string | null
  servicioHasta?: string | null
  vencimientoPago?: string | null
  neto?: string
  iva?: string
  noGravado?: string
  exento?: string
  tributos?: string
  ivaArray?: Array<{ id: number; base: string; importe: string }>
  tributosArray?: Array<{ id: number; descripcion: string; base: string; alicuota: string; importe: string }>
}

export interface Pr03bFixtureOptions {
  operacionId?: string
  ventaId?: string
  total?: string
  fecha?: string
  numero?: number
  puntoVenta?: number
  revisionParametros?: number
}

export interface FiscalPreparationParams {
  ventaId: string
  total: string
  cuitEmisor: string
  puntoVenta: number
  tipoComprobante?: number
  revisionParametros?: number
  condicionEmisor?: string
  fecha?: string
}

export interface Pr03bTestFixture {
  readonly tag: string
  readonly scope: string
  readonly kiosco_id: string
  readonly cuit_emisor: string
  readonly punto_venta: number
  readonly tipo_comprobante: number
  readonly operacion_id: string
  readonly venta_id: string
  readonly total: string
  readonly solicitud: Record<string, unknown>
  readonly cuerpo_canonico: string
  readonly solicitud_sha256: string
  readonly metadata: {
    readonly fixture: string
    readonly kiosco_id: string
    readonly scope: string
    readonly run_id?: string
    readonly punto_venta?: number
    readonly anti_arca_guard: boolean
    readonly created_at: string
  }
}

export interface Pr03bScopedFixture extends Pr03bTestFixture {
  readonly run_id: string
  readonly revision_parametros: number
  readonly contexto: Record<string, unknown>
  readonly preparacion: Record<string, unknown>
  readonly preparacion_canonico: string
  readonly preparacion_sha256: string
}

export interface Pr03bIdempotencyReplayResult {
  readonly status: 'PASS'
  readonly identicalReservation: boolean
  readonly mutated: boolean
  readonly operacion_id: string
  readonly numero: number
}

export interface Pr03bIdempotencyConflictResult {
  readonly status: 'PASS'
  readonly rejectedWithExpectedCode: boolean
  readonly errorCode: string
}

export interface Pr03bConcurrencyLockResult {
  readonly status: 'PASS'
  readonly concurrencyExpectation: 'SINGLE_PENDING_RESERVATION'
  readonly lockSerialization: 'PASS'
  readonly noSimultaneousPendingReservations: boolean
  readonly numberCollision: boolean
}

export interface Pr03bTestCase {
  readonly id: string
  readonly description: string
  readonly expectedStatus: 'PASS'
}

export interface Pr03bPlanConfig {
  readonly scope: string
  readonly kiosco_id: string
  readonly cuit_emisor: string
  readonly punto_venta: number
  readonly tipo_comprobante: number
  readonly anti_arca_guard: boolean
}

export interface Pr03bPlanValidationResult {
  readonly status: 'PASS'
  readonly scopeValidated: boolean
  readonly fixtureValidated: boolean
  readonly antiArcaGuardActive: boolean
  readonly testCasesCount: number
}

export interface Pr03bPreflightSyntheticSale {
  readonly id: string
  readonly kiosco_id: string
  readonly total: string
  readonly estado: string
}

export interface Pr03bPreflightResult {
  readonly status: 'PASS'
  readonly transactionReadOnly: boolean
  readonly kioskActive: boolean
  readonly expectedIssuerPresent: boolean
  readonly expectedIssuerInactive: boolean
  readonly catalogRev3Exists: boolean
  readonly catalogRev3Enabled: boolean
  readonly catalogRev3Usable: boolean
  readonly residualFixturesCount: number
  readonly syntheticSalesCount: number
  readonly chosenSyntheticPv: number
  readonly syntheticSales: readonly Pr03bPreflightSyntheticSale[]
}

export const ARCA_NETWORK_DISABLED: true
export const PR03_B_SCOPE: string
export const PR03_B_TEST_FIXTURE_TAG: string
export const PR03_B_OPERACION_PREFIX: string
export const PR03_B_APPROVED_KIOSK_ID: string
export const PR03_B_APPROVED_OWNER_AUTH_ID: string
export const PR03_B_APPROVED_CUIT: string
export const PR03_B_APPROVED_PUNTO_VENTA: number
export const PR03_B_APPROVED_TIPO_COMPROBANTE: number
export const PR03_B_SYNTHETIC_PV_CANDIDATES: readonly number[]
export const PR03_B_BLOCKED_HOST_PATTERNS: readonly RegExp[]
export const PR03_B_PREFLIGHT_SELECT_SQL: string
export const PR03_B_CONCURRENCY_WAIT_SELECT_SQL: string
export const PR03_B_COMMERCIAL_BASELINE_SQL: string
export const PR03_B_TEST_CASES: readonly Pr03bTestCase[]

export const SYNTHETIC_EMITTER_ROW_SUPPORTED: false
export const CANONICAL_PREPARATION_REQUIRES_CONFIGURED_SYNTHETIC_PV: true
export const PR03_B_BLOCKED_BY_SCHEMA: true

export function assertNoArcaNetwork(targetUrl?: string): void
export function assertNoRealPv2Usage(target: unknown): void
export function verifyNoExternalFiscalTransport(): { readonly arcaTransportReachable: false; readonly status: 'PASS' }
export function createAntiArcaFetch(): (input: unknown) => never
export function canonicalJson(value: unknown): string
export function computeSha256(content: string): string
export function validateCleanupRunId(runId: unknown): boolean
export function buildCanonicalFiscalRequest(params: FiscalRequestParams): {
  request: Record<string, unknown>
  canonical: string
  sha256: string
}
export function buildCanonicalFiscalPreparation(params: FiscalPreparationParams): {
  preparation: Record<string, unknown>
  canonical: string
  sha256: string
}
export function createPr03bTestFixture(opts?: Pr03bFixtureOptions): Pr03bTestFixture
export function createPr03bScopedFixture(runId: string, opts?: Pr03bFixtureOptions): Pr03bScopedFixture
export function verifyPr03bBasePreflight(raw: unknown): Pr03bPreflightResult
export function verifyPr03bPreflight(raw: unknown, opts?: unknown): Pr03bPreflightResult
export function computeCommercialBaselineHash(baseline: unknown): string
export function validateCleanupTarget(context: unknown): boolean
export function buildManifestCleanupSql(operationIds: readonly string[], opts?: { syntheticPv?: number }): string
export function verifyIdempotencyReplay(first: unknown, replay: unknown): Pr03bIdempotencyReplayResult
export function verifyIdempotencyConflict(error: unknown): Pr03bIdempotencyConflictResult
export function verifyConcurrencySinglePendingReservation(check: unknown): Pr03bConcurrencyLockResult
export function verifyPr03bPlan(plan: unknown): Pr03bPlanValidationResult
