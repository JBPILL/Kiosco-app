// @ts-check

export const SERVICE_ENVIRONMENTS = Object.freeze({
  TEST: 'TEST',
  DEVELOPMENT: 'DEVELOPMENT',
  STAGING: 'STAGING',
  PRODUCTION: 'PRODUCTION',
})

export const ALLOWED_EXECUTION_SCOPES = Object.freeze([
  'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION',
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

  // En STAGING o PRODUCTION se exige configuración explícita de KMS y almacenamiento durable
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
  }

  return serviceEnvironment
}

/**
 * Validador de política de atestación estricta y fail-closed.
 * La autoridad externa rechaza atestar cualquier alcance que no sea exclusivamente
 * la recolección oficial de evidencia P0 en homologación.
 * @param {Record<string, any>} requestPkg
 * @returns {true}
 */
export function validateAttestationPolicy(requestPkg) {
  if (!requestPkg || typeof requestPkg !== 'object') {
    throw new Error('ATTESTATION_POLICY_ERROR: Request nulo o no estructurado')
  }

  const scope = requestPkg.executionScope
  if (!ALLOWED_EXECUTION_SCOPES.includes(scope)) {
    throw new Error(
      `ATTESTATION_POLICY_SCOPE_REJECTED: executionScope '${scope}' no está permitido. Solo se autoriza '${ALLOWED_EXECUTION_SCOPES.join(', ')}'`
    )
  }

  for (const token of FORBIDDEN_SCOPE_TOKENS) {
    if (
      typeof scope === 'string' &&
      scope.toUpperCase().includes(token) &&
      scope !== 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'
    ) {
      throw new Error(
        `ATTESTATION_POLICY_FORBIDDEN_SCOPE: Scope contiene token prohibido '${token}'`
      )
    }
  }

  const env = requestPkg.environment
  if (!ALLOWED_ENVIRONMENTS.includes(env)) {
    throw new Error(
      `ATTESTATION_POLICY_ENVIRONMENT_REJECTED: environment '${env}' no está permitido. Solo se autoriza '${ALLOWED_ENVIRONMENTS.join(', ')}'`
    )
  }

  if (
    typeof env === 'string' &&
    (env.toUpperCase() === 'PRODUCTION' || env.toUpperCase() === 'PRODUCCION')
  ) {
    throw new Error(
      'ATTESTATION_POLICY_ENVIRONMENT_REJECTED: La autoridad independiente rechaza atestar entorno de PRODUCCION en esta fase'
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
