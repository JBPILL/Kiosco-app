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
    readonly anti_arca_guard: boolean
    readonly created_at: string
  }
}

export interface Pr03bScopedFixture extends Pr03bTestFixture {
  readonly run_id: string
  readonly contexto: Record<string, unknown>
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

export interface Pr03bConcurrencyNumberingResult {
  readonly status: 'PASS'
  readonly serialized: boolean
  readonly collisionCount: number
  readonly uniqueNumbers: boolean
  readonly assignedNumbers: readonly number[]
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
  readonly catalog_revision_3_excluded: boolean
}

export interface Pr03bPlanValidationResult {
  readonly status: 'PASS'
  readonly scopeValidated: boolean
  readonly fixtureValidated: boolean
  readonly antiArcaGuardActive: boolean
  readonly testCasesCount: number
}

export interface Pr03bPreflightResult {
  readonly status: 'PASS'
  readonly transactionReadOnly: boolean
  readonly kioskActive: boolean
  readonly expectedIssuerPresent: boolean
  readonly expectedIssuerInactive: boolean
  readonly catalogRev3Absent: boolean
  readonly residualFixturesCount: number
  readonly pendingSeriesReservationsCount: number
}

export const ARCA_NETWORK_DISABLED: true
export const PR03_B_SCOPE: string
export const PR03_B_TEST_FIXTURE_TAG: string
export const PR03_B_OPERACION_PREFIX: string
export const PR03_B_APPROVED_KIOSK_ID: string
export const PR03_B_APPROVED_CUIT: string
export const PR03_B_APPROVED_PUNTO_VENTA: number
export const PR03_B_APPROVED_TIPO_COMPROBANTE: number
export const PR03_B_BLOCKED_HOST_PATTERNS: readonly RegExp[]
export const PR03_B_PREFLIGHT_SQL: string
export const PR03_B_CLEANUP_SQL: string
export const PR03_B_TEST_CASES: readonly Pr03bTestCase[]

export function assertNoArcaNetwork(targetUrl?: string): void
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
export function createPr03bTestFixture(opts?: Pr03bFixtureOptions): Pr03bTestFixture
export function createPr03bScopedFixture(runId: string, opts?: Pr03bFixtureOptions): Pr03bScopedFixture
export function verifyPr03bPreflight(raw: unknown): Pr03bPreflightResult
export function buildScopedCleanupSql(runId: string): string
export function validateCleanupTarget(context: unknown): boolean
export function verifyIdempotencyReplay(first: unknown, replay: unknown): Pr03bIdempotencyReplayResult
export function verifyIdempotencyConflict(error: unknown): Pr03bIdempotencyConflictResult
export function verifyConcurrencyNumbering(results: unknown): Pr03bConcurrencyNumberingResult
export function verifyPr03bPlan(plan: unknown): Pr03bPlanValidationResult
