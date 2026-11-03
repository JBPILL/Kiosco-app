// Type definitions for PR03-C Staging Parameter Refresh Execution.

export interface Pr03cExecutionOptions {
  readonly execution?: 'DRY_RUN' | 'EXECUTE'
  readonly authorized?: boolean
  readonly scope?: string
  readonly projectRef?: string
  readonly password?: string
  readonly dryRunEvidence?: {
    readonly ivaText: string
    readonly conditionText: string
    readonly baselineText: string
  }
}

export interface Pr03cExecutionReport {
  readonly PR03_C_PREPARATION: 'PASS' | 'FAIL'
  readonly PR03_C_EXTERNAL_CALL_PLAN: 'PASS' | 'FAIL'
  readonly PR03_C_REQUIRED_CALLS: readonly string[]
  readonly EXISTING_TA_REUSABLE: boolean
  readonly LOGINCMS_REQUIRED: boolean
  readonly TIPOS_IVA_PLAN: 'PASS' | 'FAIL'
  readonly TIPOS_IVA_COUNT?: number
  readonly TIPOS_IVA_HASH?: string
  readonly CONDICIONES_IVA_PLAN: 'PASS' | 'FAIL'
  readonly CONDICIONES_IVA_COUNT?: number
  readonly CONDICIONES_IVA_HASH?: string
  readonly REVISION_3_CANONICAL: 'PASS' | 'FAIL'
  readonly REVISION_3_INSERT_ONLY: 'PASS' | 'FAIL'
  readonly REVISION_2_MUTATED: false
  readonly EMITTER_ENABLE_DURING_PR03_C: false
  readonly EMITTER_ENABLE_REQUIRED_FOR_PR03_B: true
  readonly FECAESOLICITAR_REACHABLE: false
  readonly FECOMPCONSULTAR_REACHABLE: false
  readonly PR03_C_EMISSION_CAPABLE: false
  readonly PR03_C_PACKAGE: 'PREPARED' | 'FAIL'
  readonly ARCA_CALLS_NEW: 0
  readonly STAGING_WRITES_NEW: 0
  readonly PRODUCTION_MUTATIONS: 0
  readonly CALL_LIMITS: {
    readonly loginCmsMax: number
    readonly tiposIvaMax: number
    readonly condicionIvaReceptorMax: number
    readonly totalMax: number
  }
  readonly PACKAGE_SHA256: string
}

export const PR03_C_EXECUTION_TARGET: 'acoyfwwmhaeruciyedri'

export function checkPr03cEnvironment(): { projectRef: string; isStaging: boolean }
export function executePr03cStaging(
  rawOptions?: Pr03cExecutionOptions,
  deps?: Record<string, unknown>
): Promise<Pr03cExecutionReport>
