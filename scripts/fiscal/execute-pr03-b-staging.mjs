// PR03-B: Runner de aceptación Staging para Idempotencia y Numeración Fiscal.
// Requisitos de seguridad:
// 1. ARCA_NETWORK_DISABLED = true obligatorio (cero llamadas SOAP/HTTP de ARCA).
// 2. Cero credenciales hardcodeadas (lectura vía stdin / PGPASSWORD en memoria temporal).
// 3. Dry-run por defecto si no se pasa --authorized.
// 4. Cleanup quirúrgico exclusivo para PR03_B_TEST_FIXTURE.

import pg from 'pg'
import {
  ARCA_NETWORK_DISABLED,
  PR03_B_SCOPE,
  PR03_B_TEST_FIXTURE_TAG,
  PR03_B_APPROVED_KIOSK_ID,
  PR03_B_APPROVED_CUIT,
  PR03_B_APPROVED_PUNTO_VENTA,
  PR03_B_APPROVED_TIPO_COMPROBANTE,
  PR03_B_CLEANUP_SQL,
  PR03_B_TEST_CASES,
  assertNoArcaNetwork,
  createPr03bTestFixture,
  validateCleanupTarget,
  verifyIdempotencyReplay,
  verifyIdempotencyConflict,
  verifyConcurrencyNumbering,
  verifyPr03bPlan,
} from './plan-pr03-b-staging.mjs'

export const PR03_B_EXECUTION_TARGET = 'acoyfwwmhaeruciyedri'
export const PR03_B_DB_HOST = 'aws-1-sa-east-1.pooler.supabase.com'
export const PR03_B_DB_PORT = 5432
export const PR03_B_DB_USER = 'postgres.acoyfwwmhaeruciyedri'
export const PR03_B_DB_NAME = 'postgres'

/**
 * Valida que el entorno local esté preparado para PR03-B sin riesgo de llamadas externas.
 */
export function checkPr03bEnvironment() {
  if (!ARCA_NETWORK_DISABLED) {
    throw new Error('FATAL: ARCA_NETWORK_DISABLED must be true for PR03-B')
  }

  // Verificar Anti-ARCA guard contra URLs canónicas
  assertNoArcaNetwork('https://safe-local-endpoint.test')
  let guardTriggered = false
  try {
    assertNoArcaNetwork('https://wsaa.afip.gob.ar/ws/services/LoginCms')
  } catch (err) {
    if (err instanceof Error && err.message === 'FATAL: ARCA_CALL_ATTEMPTED_IN_PR03_B') {
      guardTriggered = true
    }
  }
  if (!guardTriggered) {
    throw new Error('FATAL: Anti-ARCA guard failed to intercept test URL')
  }

  const planValidation = verifyPr03bPlan({
    scope: PR03_B_SCOPE,
    kiosco_id: PR03_B_APPROVED_KIOSK_ID,
    cuit_emisor: PR03_B_APPROVED_CUIT,
    punto_venta: PR03_B_APPROVED_PUNTO_VENTA,
    tipo_comprobante: PR03_B_APPROVED_TIPO_COMPROBANTE,
    anti_arca_guard: true,
    catalog_revision_3_excluded: true,
  })

  const fixture = createPr03bTestFixture()
  validateCleanupTarget(fixture)

  return Object.freeze({
    status: 'PASS',
    scope: PR03_B_SCOPE,
    antiArcaGuard: 'PASS',
    planValidation: planValidation.status,
    fixtureValidation: 'PASS',
    testCasesCount: PR03_B_TEST_CASES.length,
  })
}

/**
 * Función principal de preparación / dry-run de PR03-B.
 */
export async function runPr03bPreparation() {
  const envCheck = checkPr03bEnvironment()
  return Object.freeze({
    environment: envCheck,
    readyForAuthorizedExecution: true,
    stagingWritesAttempted: 0,
    arcaCallsAttempted: 0,
  })
}
