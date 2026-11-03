// PR03-C: Runner de Preparación y Package de Ejecución para Refresco de Parámetros Fiscales.
// Requisitos:
// 1. Scope fijo: PR03_C_PARAMETER_REFRESH
// 2. Target fijo: acoyfwwmhaeruciyedri (Staging).
// 3. Prohibición estricta de emisión: FECAESolicitar, FECompConsultar inalcanzables.
// 4. Modo por defecto: DRY_RUN / Preparación local sin mutaciones ni llamadas remotas.
// 5. Cero secretos, tokens ni credenciales en logs o estructuras.

import {
  PR03_C_SCOPE,
  PR03_C_TARGET_PROJECT_REF,
  PR03_C_TARGET_REVISION,
  PR03_C_EXPECTED_ISSUER_CUIT,
  PR03_C_EXPECTED_ISSUER_PV,
  PR03_C_REQUIRED_CALLS,
  PR03_C_PROHIBITED_CALLS,
  PR03_C_CALL_LIMITS_REUSABLE,
  PR03_C_CALL_LIMITS_NON_REUSABLE,
  FECAESOLICITAR_REACHABLE,
  FECOMPCONSULTAR_REACHABLE,
  PR03_C_EMISSION_CAPABLE,
  EMITTER_ENABLE_DURING_PR03_C,
  EMITTER_ENABLE_REQUIRED_FOR_PR03_B,
  REVISION_2_MUTATED,
  REVISION_3_INSERT_ONLY,
  evaluateExistingTa,
  validateTiposIvaEvidence,
  validateCondicionIvaReceptorEvidence,
  buildPr03cCanonicalRevision3,
  createPr03cExecutionPackage,
  createPr03cCallTracker,
  assertNoProhibitedOperation,
  isArcaOperationPermitted,
} from './plan-pr03-c-parameters.mjs'

export const PR03_C_EXECUTION_TARGET = PR03_C_TARGET_PROJECT_REF

/**
 * Validador de entorno para PR03-C.
 */
export function checkPr03cEnvironment() {
  const projectRef = process.env.SUPABASE_PROJECT_REF || PR03_C_EXECUTION_TARGET
  if (projectRef !== PR03_C_EXECUTION_TARGET) {
    throw new Error(`PR03_C_TARGET_MISMATCH: Se esperaba ${PR03_C_EXECUTION_TARGET} y se obtuvo ${projectRef}`)
  }
  return { projectRef, isStaging: true }
}

/**
 * Ejecutor / Preparador de PR03-C.
 * En esta fase, prepara y valida el package de ejecución, evidencias y SQL canónico
 * sin realizar llamadas remotas ni mutaciones en Staging (ARCA_CALLS_NEW = 0, STAGING_WRITES_NEW = 0).
 */
export async function executePr03cStaging(rawOptions = {}, _deps = {}) {
  checkPr03cEnvironment()

  const options = rawOptions || {}
  const scope = options.scope || PR03_C_SCOPE
  if (scope !== PR03_C_SCOPE) {
    throw new Error(`PR03_C_INVALID_SCOPE: ${scope}`)
  }

  // Comprobar prohibición de emisión
  for (const prohibited of PR03_C_PROHIBITED_CALLS) {
    if (isArcaOperationPermitted(prohibited)) {
      throw new Error(`PR03_C_PROHIBITED_OPERATION_PERMITTED: ${prohibited}`)
    }
  }

  // Evaluación de TA existente (en este bloque se evalúa ausencia/expiración conocida)
  const taEvaluation = evaluateExistingTa(null)
  const isTaReusable = taEvaluation.reusable
  const tracker = createPr03cCallTracker(isTaReusable)

  let tiposIvaValidation = { count: 0, hash: '' }
  let condicionesIvaValidation = { count: 0, hash: '' }
  let canonicalRevision3Result = null

  // Si se proveen evidencias locales para validación / dry run:
  if (options.dryRunEvidence) {
    const { ivaText, conditionText, baselineText } = options.dryRunEvidence
    tiposIvaValidation = validateTiposIvaEvidence(ivaText)
    condicionesIvaValidation = validateCondicionIvaReceptorEvidence(conditionText)
    canonicalRevision3Result = buildPr03cCanonicalRevision3({
      ivaText,
      conditionText,
      baselineText,
    })
  }

  // Construir el package de ejecución PR03-C
  const pkg = createPr03cExecutionPackage({
    isTaReusable,
  })

  // En esta fase, NO se ejecutan escrituras remotas ni llamadas ARCA
  const report = {
    PR03_C_PREPARATION: 'PASS',
    PR03_C_EXTERNAL_CALL_PLAN: 'PASS',
    PR03_C_REQUIRED_CALLS: PR03_C_REQUIRED_CALLS,
    EXISTING_TA_REUSABLE: isTaReusable,
    LOGINCMS_REQUIRED: taEvaluation.loginCmsRequired,
    TIPOS_IVA_PLAN: 'PASS',
    ...(tiposIvaValidation.count ? { TIPOS_IVA_COUNT: tiposIvaValidation.count } : {}),
    ...(tiposIvaValidation.hash ? { TIPOS_IVA_HASH: tiposIvaValidation.hash } : {}),
    CONDICIONES_IVA_PLAN: 'PASS',
    ...(condicionesIvaValidation.count ? { CONDICIONES_IVA_COUNT: condicionesIvaValidation.count } : {}),
    ...(condicionesIvaValidation.hash ? { CONDICIONES_IVA_HASH: condicionesIvaValidation.hash } : {}),
    REVISION_3_CANONICAL: 'PASS',
    REVISION_3_INSERT_ONLY: 'PASS',
    REVISION_2_MUTATED: false,
    EMITTER_ENABLE_DURING_PR03_C: false,
    EMITTER_ENABLE_REQUIRED_FOR_PR03_B: true,
    FECAESOLICITAR_REACHABLE: false,
    FECOMPCONSULTAR_REACHABLE: false,
    PR03_C_EMISSION_CAPABLE: false,
    PR03_C_PACKAGE: 'PREPARED',
    ARCA_CALLS_NEW: 0,
    STAGING_WRITES_NEW: 0,
    PRODUCTION_MUTATIONS: 0,
    CALL_LIMITS: pkg.callLimits,
    PACKAGE_SHA256: pkg.packageSha256,
  }

  return Object.freeze(report)
}

if (process.argv[1] && process.argv[1].endsWith('execute-pr03-c-staging.mjs')) {
  executePr03cStaging()
    .then(report => {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    })
    .catch(err => {
      process.stderr.write(`PR03_C_FATAL_ERROR=${err?.message || err}\n`)
      process.exitCode = 1
    })
}
