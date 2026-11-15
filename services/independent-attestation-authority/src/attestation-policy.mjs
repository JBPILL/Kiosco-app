// @ts-check

export const SERVICE_ENVIRONMENTS = Object.freeze({
  TEST: 'TEST',
  DEVELOPMENT: 'DEVELOPMENT',
  STAGING: 'STAGING',
  PRODUCTION: 'PRODUCTION',
})

const PR02_P0_SCOPE_VALUE = 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'

export const ALLOWED_EXECUTION_SCOPES = Object.freeze([
  PR02_P0_SCOPE_VALUE,
])

export const ALLOWED_ENVIRONMENTS = Object.freeze(['HOMOLOGACION'])

export const FORBIDDEN_SCOPE_TOKENS = Object.freeze([
  'PRODUCTION',
  'PRODUCCION',
  'P1',
  'P2',
  'PV2',
  'CAE',
  'EMISION',
  'EMISSION',
  'FISCAL_MUTATION',
])

/**
 * Valida aislamiento estricto entre entornos TEST/DEVELOPMENT y STAGING/PRODUCTION.
 * Impide que un proveedor de prueba o configuración efímera opere en producción o staging,
 * y rechaza confiar en NODE_ENV=production como único parámetro de seguridad.
 * @param {{
 *   serviceEnvironment: string,
 *   signingProvider: { signerType?: string, trustScope?: string, isProductionReady?: () => boolean },
 *   antiReplayGuard?: { storageType?: string },
 *   env?: Record<string, string | undefined>
 * }} params
 * @returns {string}
 */
export function assertServiceEnvironmentIsolation(params) {
  const {
    serviceEnvironment,
    signingProvider,
    antiReplayGuard,
    clientAuthVerifier,
    env = process.env,
  } = params || {}

  if (
    typeof serviceEnvironment !== 'string' ||
    !Object.values(SERVICE_ENVIRONMENTS).includes(serviceEnvironment)
  ) {
    throw new Error(
      `INVALID_SERVICE_ENVIRONMENT: Entorno de servicio '${serviceEnvironment}' inválido. Permitidos: ${Object.values(SERVICE_ENVIRONMENTS).join(', ')}`
    )
  }

  // Nunca permitir TestSigningProvider si NODE_ENV indica producción
  if (
    env &&
    env.NODE_ENV === 'production' &&
    signingProvider &&
    (signingProvider.signerType === 'TEST_SIGNER' ||
      signingProvider.trustScope === 'TEST_ONLY')
  ) {
    throw new Error(
      'TEST_SIGNER_FORBIDDEN_WHEN_NODE_ENV_PRODUCTION: Prohibido operar con TestSigningProvider cuando NODE_ENV=production'
    )
  }

  // En STAGING o PRODUCTION se exige configuración explícita de KMS, almacenamiento durable y auth no simulada
  if (
    serviceEnvironment === SERVICE_ENVIRONMENTS.PRODUCTION ||
    serviceEnvironment === SERVICE_ENVIRONMENTS.STAGING
  ) {
    if (
      !signingProvider ||
      signingProvider.signerType === 'TEST_SIGNER' ||
      signingProvider.trustScope === 'TEST_ONLY'
    ) {
      throw new Error(
        `TEST_SIGNER_FORBIDDEN_IN_${serviceEnvironment}: El entorno '${serviceEnvironment}' prohíbe el uso de TestSigningProvider`
      )
    }

    if (signingProvider.signerType !== 'PRODUCTION_KMS_SIGNER') {
      throw new Error(
        `PRODUCTION_KMS_REQUIRED: El entorno '${serviceEnvironment}' exige ProductionKmsSigningProvider`
      )
    }

    if (
      typeof signingProvider.isProductionReady !== 'function' ||
      !signingProvider.isProductionReady()
    ) {
      throw new Error(
        `PRODUCTION_KMS_NOT_CONFIGURED: Proveedor KMS no listo o no configurado para '${serviceEnvironment}'`
      )
    }

    if (antiReplayGuard && antiReplayGuard.storageType === 'memory') {
      throw new Error(
        `DURABLE_ANTI_REPLAY_REQUIRED: El entorno '${serviceEnvironment}' prohíbe anti-replay en memoria volátil`
      )
    }

    if (
      clientAuthVerifier &&
      (clientAuthVerifier.simulated === true ||
        clientAuthVerifier.trustScope === 'TEST_ONLY' ||
        clientAuthVerifier.verifierKind === 'SIMULATED_TEST_AUTH_VERIFIER' ||
        (typeof clientAuthVerifier.isProductionAuthVerifier === 'function' &&
          !clientAuthVerifier.isProductionAuthVerifier()))
    ) {
      throw new Error(
        `SIMULATED_CLIENT_AUTH_FORBIDDEN_IN_${serviceEnvironment}: El entorno '${serviceEnvironment}' prohíbe verificadores de autenticación simulados o no aptos para producción`
      )
    }
  }

  return serviceEnvironment
}

/**
 * Validador de política de atestación estricta y fail-closed.
 * La autoridad externa rechaza atestar cualquier alcance que no sea exclusivamente
 * la recolección oficial de evidencia P0 en homologación.
 * @param {Record<string, any>} requestPkg
 * @param {{ expectedProjectRef?: string | null, expectedCommitSha?: string | null }} [policyOptions={}]
 * @returns {true}
 */
export function validateAttestationPolicy(requestPkg, policyOptions = {}) {
  if (!requestPkg || typeof requestPkg !== 'object' || Array.isArray(requestPkg)) {
    throw new Error('ATTESTATION_POLICY_ERROR: Request nulo o no estructurado')
  }

  const scope = requestPkg.executionScope
  if (typeof scope === 'string' && scope !== PR02_P0_SCOPE_VALUE) {
    for (const token of FORBIDDEN_SCOPE_TOKENS) {
      if (scope.toUpperCase().includes(token)) {
        throw new Error(
          `ATTESTATION_POLICY_FORBIDDEN_SCOPE: Scope '${scope}' contiene token prohibido '${token}'`
        )
      }
    }
  }

  if (!ALLOWED_EXECUTION_SCOPES.includes(scope)) {
    throw new Error(
      `ATTESTATION_POLICY_SCOPE_REJECTED: executionScope '${scope}' no está permitido. Solo se autoriza '${ALLOWED_EXECUTION_SCOPES.join(', ')}'`
    )
  }

  const env = requestPkg.environment
  if (
    typeof env === 'string' &&
    (env.toUpperCase() === 'PRODUCTION' || env.toUpperCase() === 'PRODUCCION')
  ) {
    throw new Error(
      'ATTESTATION_POLICY_ENVIRONMENT_REJECTED: La autoridad independiente rechaza atestar entorno de PRODUCCION en esta fase'
    )
  }

  if (!ALLOWED_ENVIRONMENTS.includes(env)) {
    throw new Error(
      `ATTESTATION_POLICY_ENVIRONMENT_REJECTED: environment '${env}' no está permitido. Solo se autoriza '${ALLOWED_ENVIRONMENTS.join(', ')}'`
    )
  }

  // Rechazar identificadores ambiguos (espacios extremos, saltos de línea, no NFC)
  for (const field of ['requestId', 'processId', 'authorizationId', 'projectRef']) {
    const val = requestPkg[field]
    if (val !== undefined) {
      if (
        typeof val !== 'string' ||
        val.trim().length === 0 ||
        val !== val.trim() ||
        /[\r\n\t\x00-\x1f\x7f]/.test(val) ||
        val.normalize('NFC') !== val
      ) {
        throw new Error(
          `ATTESTATION_POLICY_AMBIGUOUS_IDENTIFIER: Campo '${field}' inválido o con caracteres/espacios ambiguos`
        )
      }
    }
  }

  if (
    policyOptions.expectedProjectRef &&
    requestPkg.projectRef !== undefined &&
    requestPkg.projectRef !== policyOptions.expectedProjectRef
  ) {
    throw new Error(
      `ATTESTATION_POLICY_PROJECT_MISMATCH: projectRef '${requestPkg.projectRef}' no coincide con '${policyOptions.expectedProjectRef}'`
    )
  }

  if (
    policyOptions.expectedCommitSha &&
    typeof requestPkg.commitSha === 'string' &&
    requestPkg.commitSha.toLowerCase() !==
      String(policyOptions.expectedCommitSha).toLowerCase()
  ) {
    throw new Error(
      `ATTESTATION_POLICY_COMMIT_MISMATCH: commitSha '${requestPkg.commitSha}' no coincide con '${policyOptions.expectedCommitSha}'`
    )
  }

  // Prevenir inyección de flags de elevación en el request
  if (
    requestPkg.P1_IMPORT_ALLOWED !== undefined ||
    requestPkg.P2_IMPORT_ALLOWED !== undefined ||
    requestPkg.PRODUCTION_ATTESTED !== undefined ||
    requestPkg.accredited !== undefined ||
    requestPkg.elevateTrustModel !== undefined
  ) {
    throw new Error(
      'ATTESTATION_POLICY_ELEVATION_REJECTED: La solicitud intenta auto-atribuirse flags de confianza o importación'
    )
  }

  return true
}
