// @ts-check
import { randomUUID } from 'node:crypto'
import {
  assertNoProhibitedSecretsInText,
  assertNoPrototypePollution,
  computeAttestationResponsePayloadDigest,
  safeParseStrictJson,
  serializeCanonicalAttestationResponsePayload,
  validateAttestationRequestStrict,
} from './contract.mjs'
import {
  assertServiceEnvironmentIsolation,
  SERVICE_ENVIRONMENTS,
  validateAttestationPolicy,
} from './attestation-policy.mjs'
import { AttestationSigningProvider } from './signing-providers.mjs'
import { ServiceAntiReplayGuard } from './service-anti-replay.mjs'
import {
  computeEd25519SpkiKeyId,
  verifyGoAuthorizationGrant,
} from './go-authorization.mjs'
import {
  assertNormalizedAuthenticatedClient,
  normalizeClientAuthVerifier,
} from './client-auth.mjs'
import { Level1DigestOnlyEvidenceEvaluator } from './evidence-integrity.mjs'

const FORBIDDEN_FISCAL_HEADER_NAMES = Object.freeze([
  'x-wsaa-token',
  'x-wsaa-sign',
  'x-arca-cms',
  'x-arca-cert',
  'x-afip-token',
  'x-afip-sign',
  'x-supabase-key',
  'x-supabase-service-role',
])

/**
 * Servicio de Autoridad de Atestación Independiente.
 * Completamente autónomo (cero dependencias en runtime hacia scripts/fiscal o src/ del POS).
 */
export class IndependentAttestationAuthorityService {
  /**
   * @param {object} options
   * @param {AttestationSigningProvider} options.signingProvider
   * @param {ServiceAntiReplayGuard} [options.antiReplayGuard]
   * @param {'TEST' | 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION'} [options.serviceEnvironment]
   * @param {boolean} [options.protectedMode]
   * @param {boolean} [options.requireSignedGoGrant]
   * @param {string} [options.authorityId]
   * @param {string} [options.keyId]
   * @param {string} [options.trustedGoAuthorityId]
   * @param {string} [options.trustedGoKeyId]
   * @param {string} [options.trustedGoPublicKeySpki]
   * @param {string} [options.expectedProjectRef]
   * @param {string} [options.expectedCommitSha]
   * @param {'1.0' | '1.1'} [options.attestationResponseVersion='1.0']
   * @param {unknown} [options.clientAuthVerifier]
   * @param {import('./evidence-integrity.mjs').EvidenceIntegrityEvaluator} [options.evidenceEvaluator]
   * @param {(() => number | string | Date) | number | string | Date} [options.now]
   * @param {Record<string, string | undefined>} [options.env]
   * @param {object} [options.logger]
   */
  constructor(options = {}) {
    if (!options || typeof options !== 'object') {
      throw new Error(
        'AUTHORITY_SERVICE_CONFIG_INVALID: Configuración inválida para servicio de atestación'
      )
    }

    const provider = options.signingProvider
    if (!provider || !(provider instanceof AttestationSigningProvider)) {
      throw new Error(
        'AUTHORITY_SERVICE_SIGNING_PROVIDER_REQUIRED: Se requiere una instancia válida de AttestationSigningProvider'
      )
    }

    this._signingProvider = provider
    this._antiReplayGuard =
      options.antiReplayGuard ||
      new ServiceAntiReplayGuard({ storageType: 'memory' })

    const inferredEnv =
      options.serviceEnvironment ||
      (provider.signerType === 'TEST_SIGNER'
        ? SERVICE_ENVIRONMENTS.TEST
        : SERVICE_ENVIRONMENTS.PRODUCTION)

    const normalizedClientVerifier = normalizeClientAuthVerifier(
      options.clientAuthVerifier
    )

    this._serviceEnvironment = assertServiceEnvironmentIsolation({
      serviceEnvironment: inferredEnv,
      signingProvider: this._signingProvider,
      antiReplayGuard: this._antiReplayGuard,
      clientAuthVerifier: normalizedClientVerifier || undefined,
      env: options.env || process.env,
    })

    const isStagingOrProd =
      this._serviceEnvironment === SERVICE_ENVIRONMENTS.PRODUCTION ||
      this._serviceEnvironment === SERVICE_ENVIRONMENTS.STAGING

    if (isStagingOrProd && options.protectedMode === false) {
      throw new Error(
        `PROTECTED_MODE_CANNOT_BE_DISABLED: No es posible deshabilitar protectedMode en '${this._serviceEnvironment}'`
      )
    }

    // Protected mode es obligatorio en PRODUCTION y STAGING, por defecto en DEVELOPMENT (salvo protectedMode: false explícito en tests),
    // y activable explícitamente en TEST via protectedMode: true. Nunca hay fallback silencioso en entornos protegidos.
    this._protectedMode =
      isStagingOrProd ||
      options.protectedMode === true ||
      (this._serviceEnvironment === SERVICE_ENVIRONMENTS.DEVELOPMENT &&
        options.protectedMode !== false)

    this._testModeIsolated =
      !this._protectedMode &&
      this._serviceEnvironment === SERVICE_ENVIRONMENTS.TEST

    this._authorityId =
      options.authorityId ||
      provider.authorityId ||
      'independent-attestation-authority-v1'
    this._keyId = options.keyId || provider.keyId || null
    this._trustedGoAuthorityId = options.trustedGoAuthorityId || null
    this._trustedGoKeyId = options.trustedGoKeyId || null
    this._trustedGoPublicKeySpki = options.trustedGoPublicKeySpki || null
    this._clientAuthVerifier = normalizedClientVerifier
    this._expectedProjectRef = options.expectedProjectRef || null
    this._expectedCommitSha = options.expectedCommitSha
      ? String(options.expectedCommitSha).toLowerCase()
      : null
    this._attestationResponseVersion =
      options.attestationResponseVersion === '1.1' ? '1.1' : '1.0'
    this._requireSignedGoGrant =
      this._protectedMode ||
      options.requireSignedGoGrant === true ||
      Boolean(this._trustedGoPublicKeySpki)
    this._evidenceEvaluator =
      options.evidenceEvaluator || new Level1DigestOnlyEvidenceEvaluator()
    this._nowProvider =
      typeof options.now === 'function'
        ? options.now
        : options.now !== undefined
          ? () => options.now
          : null
    this._logger = options.logger || null

    this._assertProtectedModeRequirements()
    this._assertSeparationOfAuthorities()
  }

  get authorityId() {
    return this._authorityId
  }

  get keyId() {
    return this._keyId
  }

  get serviceEnvironment() {
    return this._serviceEnvironment
  }

  get protectedMode() {
    return this._protectedMode
  }

  get testModeIsolated() {
    return this._testModeIsolated
  }

  get requireSignedGoGrant() {
    return this._requireSignedGoGrant
  }

  get evidenceIntegrityLevel() {
    return this._evidenceEvaluator.level
  }

  get signingProvider() {
    return this._signingProvider
  }

  get antiReplayGuard() {
    return this._antiReplayGuard
  }

  get serviceVersion() {
    return this._attestationResponseVersion
  }

  /**
   * Valida requisitos fail-closed obligatorios en modo protegido.
   */
  _assertProtectedModeRequirements() {
    if (this._protectedMode && !this._clientAuthVerifier) {
      throw new Error(
        `CLIENT_AUTH_VERIFIER_REQUIRED: El modo protegido ('${this._serviceEnvironment}') exige un clientAuthVerifier configurado; prohibido iniciar sin autenticación`
      )
    }

    if (this._protectedMode && !this._trustedGoPublicKeySpki) {
      throw new Error(
        `GO_TRUST_ANCHOR_REQUIRED: El modo protegido ('${this._serviceEnvironment}') exige trustedGoPublicKeySpki configurada fuera del control del POS`
      )
    }

    if (this._trustedGoPublicKeySpki) {
      const derivedGoKeyId = computeEd25519SpkiKeyId(
        this._trustedGoPublicKeySpki
      )
      if (
        this._trustedGoKeyId &&
        this._trustedGoKeyId !== derivedGoKeyId
      ) {
        throw new Error(
          `GO_AUTHORIZATION_KEY_ID_MISMATCH: trustedGoKeyId ('${this._trustedGoKeyId}') no coincide con trustedGoPublicKeySpki (${derivedGoKeyId})`
        )
      }
      if (!this._trustedGoKeyId) {
        this._trustedGoKeyId = derivedGoKeyId
      }
    }
  }

  /**
   * Garantiza que la autoridad de atestación no comparta identidad ni claves con la GO Authority.
   */
  _assertSeparationOfAuthorities() {
    if (
      this._trustedGoAuthorityId &&
      this._authorityId &&
      this._trustedGoAuthorityId.trim().toLowerCase() ===
        this._authorityId.trim().toLowerCase()
    ) {
      throw new Error(
        `COLLAPSED_AUTHORITIES_REJECTED: authorityId de GO Authority ('${this._trustedGoAuthorityId}') colapsa con Attestation Authority`
      )
    }

    if (this._trustedGoKeyId && this._keyId) {
      if (
        this._trustedGoKeyId.trim().toLowerCase() ===
        this._keyId.trim().toLowerCase()
      ) {
        throw new Error(
          `COLLAPSED_AUTHORITIES_REJECTED: El keyId de Attestation Authority ('${this._keyId}') colapsa con el de GO Authority`
        )
      }
    }

    if (this._trustedGoPublicKeySpki && this._signingProvider.publicKeySpki) {
      const normGo = this._trustedGoPublicKeySpki.replace(/[\r\n\s]/g, '')
      const normAtt = this._signingProvider.publicKeySpki.replace(
        /[\r\n\s]/g,
        ''
      )
      if (normGo === normAtt) {
        throw new Error(
          'COLLAPSED_AUTHORITIES_REJECTED: La clave pública de GO Authority y la de Attestation Authority colapsan en la misma identidad criptográfica'
        )
      }
    }
  }

  /**
   * Endpoint GET /health (liveness sin exponer secretos ni configuración sensible).
   */
  handleHealth() {
    const signingProviderConfigured = Boolean(
      this._signingProvider &&
        (this._signingProvider.keyId || this._signingProvider.publicKeySpki)
    )
    const productionSigningReady = Boolean(
      this._signingProvider &&
        this._signingProvider.signerType === 'PRODUCTION_KMS_SIGNER' &&
        typeof this._signingProvider.isProductionReady === 'function' &&
        this._signingProvider.isProductionReady()
    )
    const signingProviderOperational =
      this._signingProvider?.signerType === 'PRODUCTION_KMS_SIGNER'
        ? productionSigningReady
        : Boolean(this._signingProvider && this._signingProvider.keyId)

    return Object.freeze({
      status: 'HEALTHY',
      livenessState: 'SERVICE_PROCESS_ALIVE',
      processAlive: true,
      service: 'independent-attestation-authority',
      serviceVersion: this.serviceVersion,
      serviceEnvironment: this._serviceEnvironment,
      protectedMode: this._protectedMode,
      testModeIsolated: this._testModeIsolated,
      processStarted: true,
      httpServerRunning: true,
      signingProviderConfigured,
      signingProviderOperational,
      productionSigningReady,
      kmsProviderKind: this._signingProvider?.providerKind || 'UNKNOWN',
      kmsRealWorldTested:
        typeof this._signingProvider?.isRealWorldTested === 'function'
          ? Boolean(this._signingProvider.isRealWorldTested())
          : false,
      clientAuthConfigured: Boolean(this._clientAuthVerifier),
      clientAuthSimulated: Boolean(this._clientAuthVerifier?.simulated),
      goTrustAnchorConfigured: Boolean(this._trustedGoPublicKeySpki),
      evidenceIntegrityLevel: this._evidenceEvaluator.level,
      rawSoapContentVerified: false,
      arcaOriginVerified: false,
      antiReplayStorageType: this._antiReplayGuard.storageType,
      antiReplayTier: this._antiReplayGuard.antiReplayTier,
      distributedBackendKind:
        this._antiReplayGuard.distributedBackendKind ?? null,
      multiNodeAntiReplayGuaranteed:
        this._antiReplayGuard.multiNodeAtomicGuaranteed,
      distributedRealIntegrationTested: Boolean(
        this._antiReplayGuard.isRealInfrastructureTested
      ),
      kmsRealConfigured: Boolean(
        this._signingProvider?.signerType === 'PRODUCTION_KMS_SIGNER' &&
          typeof this._signingProvider?.isRealWorldTested === 'function' &&
          this._signingProvider.isRealWorldTested()
      ),
      oidcRealConfigured: Boolean(this._clientAuthVerifier?.realOidcConfigured),
      mtlsRealConfigured: Boolean(this._clientAuthVerifier?.realMtlsConfigured),
      productionValidated: false,
      productionApproved: false,
      authorityRealWorldAvailable: false,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Endpoint GET /readiness (readiness operativa sin ejecutar firmas ni revelar secretos).
   */
  async handleReadiness() {
    let antiReplayHealthy = false
    try {
      antiReplayHealthy = Boolean(await this._antiReplayGuard.isHealthy())
    } catch {
      antiReplayHealthy = false
    }
    const isProdOrStaging =
      this._serviceEnvironment === SERVICE_ENVIRONMENTS.PRODUCTION ||
      this._serviceEnvironment === SERVICE_ENVIRONMENTS.STAGING

    const providerConfiguredReady =
      this._signingProvider?.signerType === 'PRODUCTION_KMS_SIGNER'
        ? Boolean(this._signingProvider.isProductionReady())
        : isProdOrStaging
          ? false
          : Boolean(this._signingProvider && this._signingProvider.keyId)

    let providerHealthy = false
    if (providerConfiguredReady) {
      if (typeof this._signingProvider?.isHealthy === 'function') {
        try {
          providerHealthy = Boolean(await this._signingProvider.isHealthy())
        } catch {
          providerHealthy = false
        }
      } else {
        providerHealthy = true
      }
    }

    const providerReady = Boolean(providerConfiguredReady && providerHealthy)

    const durableEnough = isProdOrStaging
      ? this._antiReplayGuard.storageType !== 'memory'
      : true

    const authConfigReady = this._protectedMode
      ? Boolean(this._clientAuthVerifier) &&
        (!isProdOrStaging || !this._clientAuthVerifier?.simulated)
      : true

    let authHealthy = true
    if (
      this._clientAuthVerifier &&
      typeof this._clientAuthVerifier.isHealthy === 'function'
    ) {
      try {
        authHealthy = Boolean(await this._clientAuthVerifier.isHealthy())
      } catch {
        authHealthy = false
      }
    }

    const authReady = Boolean(authConfigReady && authHealthy)

    const goTrustReady = this._requireSignedGoGrant
      ? Boolean(this._trustedGoPublicKeySpki)
      : true

    const ready = Boolean(
      providerReady &&
        antiReplayHealthy &&
        durableEnough &&
        authReady &&
        goTrustReady
    )

    let reason = 'READY'
    if (!antiReplayHealthy) {
      reason = 'ANTI_REPLAY_STORAGE_UNAVAILABLE'
    } else if (!durableEnough) {
      reason = 'DURABLE_ANTI_REPLAY_REQUIRED'
    } else if (!authConfigReady) {
      reason = 'CLIENT_AUTH_VERIFIER_REQUIRED'
    } else if (!authHealthy) {
      reason = 'CLIENT_AUTH_VERIFIER_UNHEALTHY'
    } else if (!goTrustReady) {
      reason = 'GO_TRUST_ANCHOR_REQUIRED'
    } else if (!providerReady) {
      reason = 'SIGNING_PROVIDER_NOT_READY'
    }

    return Object.freeze({
      ready,
      readyToSign: ready,
      livenessState: 'SERVICE_PROCESS_ALIVE',
      readinessState: ready
        ? 'SERVICE_READY_TO_SIGN'
        : 'SERVICE_NOT_READY_TO_SIGN',
      service: 'independent-attestation-authority',
      serviceEnvironment: this._serviceEnvironment,
      protectedMode: this._protectedMode,
      signerType: this._signingProvider.signerType,
      kmsProviderKind: this._signingProvider?.providerKind || 'UNKNOWN',
      kmsRealWorldTested:
        typeof this._signingProvider?.isRealWorldTested === 'function'
          ? Boolean(this._signingProvider.isRealWorldTested())
          : false,
      kmsRealConfigured: Boolean(
        this._signingProvider?.signerType === 'PRODUCTION_KMS_SIGNER' &&
          typeof this._signingProvider?.isRealWorldTested === 'function' &&
          this._signingProvider.isRealWorldTested()
      ),
      trustScope: this._signingProvider.trustScope,
      providerReady,
      providerHealthy,
      clientAuthConfigured: Boolean(this._clientAuthVerifier),
      authHealthy,
      oidcRealConfigured: Boolean(this._clientAuthVerifier?.realOidcConfigured),
      mtlsRealConfigured: Boolean(this._clientAuthVerifier?.realMtlsConfigured),
      goTrustAnchorConfigured: Boolean(this._trustedGoPublicKeySpki),
      evidenceIntegrityLevel: this._evidenceEvaluator.level,
      rawSoapContentVerified: false,
      arcaOriginVerified: false,
      antiReplayHealthy,
      antiReplayStorageType: this._antiReplayGuard.storageType,
      antiReplayTier: this._antiReplayGuard.antiReplayTier,
      antiReplayGuarantee: this._antiReplayGuard.guaranteeLevel,
      distributedBackendKind:
        this._antiReplayGuard.distributedBackendKind ?? null,
      multiNodeAntiReplayGuaranteed:
        this._antiReplayGuard.multiNodeAtomicGuaranteed,
      distributedRealIntegrationTested: Boolean(
        this._antiReplayGuard.isRealInfrastructureTested
      ),
      productionValidated: false,
      productionApproved: false,
      readinessBoundary: 'CONTROLLED_SERVICE_READINESS_ONLY',
      reason,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Valida la frontera de autenticación del cliente (nunca reutiliza credenciales fiscales ARCA/WSAA/Supabase).
   * En modo protegido el verificador es obligatorio sin fallback silencioso.
   * @param {Record<string, unknown>} headers
   * @param {string | null} [requestedScope]
   * @param {{ transportSecurity?: Record<string, any> | null, now?: Date | string | number }} [authOptions]
   * @returns {Promise<ReturnType<typeof assertNormalizedAuthenticatedClient> | null>}
   */
  async _validateClientAuthBoundary(
    headers,
    requestedScope = null,
    authOptions = {}
  ) {
    if (!headers || typeof headers !== 'object') {
      if (this._protectedMode || this._clientAuthVerifier) {
        throw new Error(
          'CLIENT_AUTH_FAILED: Headers de autenticación ausentes'
        )
      }
      return null
    }

    const EVIDENCE_ELEVATION_HEADER_NAMES = new Set([
      'x-attestation-evidence-level',
      'x-evidence-level',
      'x-evidence-integrity-level',
      'x-raw-soap-verified',
      'x-arca-origin-verified',
      'x-provenance-class',
    ])

    for (const rawKey of Object.keys(headers)) {
      const lowerKey = rawKey.toLowerCase()
      if (EVIDENCE_ELEVATION_HEADER_NAMES.has(lowerKey)) {
        throw new Error(
          `EVIDENCE_LEVEL_ELEVATION_REJECTED: El cliente no puede declarar ni elevar '${lowerKey}' mediante headers HTTP`
        )
      }
      if (FORBIDDEN_FISCAL_HEADER_NAMES.includes(lowerKey)) {
        throw new Error(
          `PROHIBITED_FISCAL_CREDENTIALS_IN_HEADERS: Prohibido enviar credenciales ARCA/WSAA/Supabase ('${lowerKey}') a la autoridad de atestación`
        )
      }
      const val = headers[rawKey]
      if (typeof val === 'string') {
        const lowerVal = val.toLowerCase()
        if (
          lowerVal.includes('loginticket') ||
          lowerVal.includes('-----begin') ||
          lowerVal.includes('service_role')
        ) {
          throw new Error(
            'PROHIBITED_FISCAL_CREDENTIALS_IN_HEADERS: Header contiene material secreto o fiscal prohibido'
          )
        }
      }
    }

    const isProdOrStaging =
      this._serviceEnvironment === SERVICE_ENVIRONMENTS.PRODUCTION ||
      this._serviceEnvironment === SERVICE_ENVIRONMENTS.STAGING

    if (!this._clientAuthVerifier) {
      const requiresAuthBoundary =
        this._protectedMode ||
        isProdOrStaging ||
        this._serviceEnvironment !== SERVICE_ENVIRONMENTS.TEST
      if (
        requiresAuthBoundary &&
        ((typeof headers.authorization === 'string' &&
          headers.authorization.trim().length > 0) ||
          (typeof headers['x-api-key'] === 'string' &&
            headers['x-api-key'].trim().length > 0))
      ) {
        throw new Error(
          'UNMODELED_BEARER_TOKEN_REJECTED: No se aceptan credenciales Bearer/API-Key sin verificador configurado'
        )
      }
      if (requiresAuthBoundary) {
        throw new Error(
          `CLIENT_AUTH_VERIFIER_REQUIRED: No hay verificador de autenticación configurado para '${this._serviceEnvironment}'`
        )
      }
      return null
    }

    let rawResult
    try {
      rawResult = await this._clientAuthVerifier.verify(headers, {
        serviceEnvironment: this._serviceEnvironment,
        protectedMode: this._protectedMode,
        requestedScope,
        method: 'POST',
        path: '/attestations',
        transportSecurity: authOptions?.transportSecurity ?? null,
        now: authOptions?.now,
      })
    } catch (err) {
      const msg = err?.message || String(err)
      if (
        msg.includes('CLIENT_AUTH_') ||
        msg.includes('OIDC_') ||
        msg.includes('UNMODELED_BEARER_TOKEN_REJECTED') ||
        msg.includes('PROHIBITED_FISCAL_CREDENTIALS')
      ) {
        throw err
      }
      throw new Error(
        `CLIENT_AUTH_VERIFIER_ERROR: Fallo en verificador de autenticación del cliente: ${msg}`
      )
    }

    return assertNormalizedAuthenticatedClient(rawResult, {
      protectedMode: this._protectedMode,
      requestedScope,
      trustedGoAuthorityId: this._trustedGoAuthorityId,
      trustedGoKeyId: this._trustedGoKeyId,
      attestationAuthorityId: this._authorityId,
    })
  }

  /**
   * Endpoint POST /attestations
   * Valida autenticación S2S, esquema estricto, políticas, firma de GoAuthorizationGrant v1.1,
   * integridad de evidencia (Nivel 1), reserva anti-replay pre-firma y emite respuesta firmada.
   *
   * @param {string | Record<string, any>} rawBodyOrPkg
   * @param {Record<string, unknown>} [headers]
   * @param {{ now?: Date | string | number, responseVersion?: '1.0' | '1.1', transportSecurity?: Record<string, any> | null }} [requestOptions]
   * @returns {Promise<Record<string, any>>}
   */
  async handleRequest(rawBodyOrPkg, headers = {}, requestOptions = {}) {
    let requestIdForLog = null
    let envForLog = null
    let scopeForLog = null
    let goAuthIdForLog = null
    let goIssuerKeyIdForLog = null
    let clientIdForLog = null

    const effectiveNow =
      requestOptions && requestOptions.now !== undefined
        ? requestOptions.now
        : this._nowProvider
          ? this._nowProvider()
          : Date.now()

    try {
      // 0. Autenticación del cliente (fail-closed antes de procesar cuerpo o reservar/firmar)
      const authenticatedClient = await this._validateClientAuthBoundary(
        headers,
        null,
        {
          transportSecurity: requestOptions?.transportSecurity ?? null,
          now: effectiveNow,
        }
      )
      if (authenticatedClient) {
        clientIdForLog = authenticatedClient.clientId
      }

      let pkg = rawBodyOrPkg

      // 1. Análisis estricto y anti-pollution si llega como JSON string
      if (typeof pkg === 'string') {
        assertNoProhibitedSecretsInText(pkg.toLowerCase())
        pkg = safeParseStrictJson(pkg)
      } else {
        if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
          throw new Error(
            'ATTESTATION_REQUEST_INVALID_FORMAT: Se requiere objeto JSON estructurado'
          )
        }
        assertNoPrototypePollution(pkg)
      }

      if (typeof pkg.requestId === 'string') requestIdForLog = pkg.requestId
      if (typeof pkg.environment === 'string') envForLog = pkg.environment
      if (typeof pkg.executionScope === 'string') scopeForLog = pkg.executionScope
      if (typeof pkg.authorizationId === 'string') goAuthIdForLog = pkg.authorizationId

      // 2. Validación estricta del contrato (allowlist de propiedades, tipos, hashes, secretos)
      validateAttestationRequestStrict(pkg)

      // 3. Validación de política de atestación en el servidor (scope, entorno, proyecto, commit, ambigüedades)
      validateAttestationPolicy(pkg, {
        expectedProjectRef: this._expectedProjectRef,
        expectedCommitSha: this._expectedCommitSha,
      })

      // 4. Verificación explícita de alcance autorizado sobre la identidad autenticada del cliente
      if (authenticatedClient) {
        assertNormalizedAuthenticatedClient(authenticatedClient, {
          protectedMode: this._protectedMode,
          requestedScope: pkg.executionScope,
          trustedGoAuthorityId: this._trustedGoAuthorityId,
          trustedGoKeyId: this._trustedGoKeyId,
          attestationAuthorityId: this._authorityId,
        })
      }

      // 5. Validación de separación de poderes en el request
      if (
        this._authorityId &&
        pkg.authorizationId &&
        typeof pkg.authorizationId === 'string' &&
        pkg.authorizationId.trim().toLowerCase() ===
          this._authorityId.trim().toLowerCase()
      ) {
        throw new Error(
          'COLLAPSED_AUTHORITIES_REJECTED: authorizationId (GO) y authorityId (Attestation) no pueden ser idénticos'
        )
      }

      // 6. Verificación criptográfica obligatoria de GoAuthorizationGrant v1.1
      let verifiedGrant = null
      const shouldVerifyGrant =
        this._requireSignedGoGrant || pkg.goAuthorizationGrant !== undefined

      if (shouldVerifyGrant) {
        if (!pkg.goAuthorizationGrant) {
          throw new Error(
            'GO_AUTHORIZATION_GRANT_REQUIRED: Se requiere goAuthorizationGrant firmado por la Autoridad GO confiable'
          )
        }
        const effectiveNow =
          requestOptions && requestOptions.now !== undefined
            ? requestOptions.now
            : this._nowProvider
              ? this._nowProvider()
              : Date.now()

        verifiedGrant = verifyGoAuthorizationGrant(pkg.goAuthorizationGrant, {
          trustedGoPublicKeySpki: this._trustedGoPublicKeySpki,
          trustedGoKeyId: this._trustedGoKeyId,
          trustedGoAuthorityId: this._trustedGoAuthorityId,
          requestPkg: pkg,
          expectedProjectRef: this._expectedProjectRef,
          expectedCommitSha: this._expectedCommitSha,
          attestationAuthorityId: this._authorityId,
          attestationKeyId: this._keyId,
          attestationPublicKeySpki: this._signingProvider.publicKeySpki,
          now: effectiveNow,
        })

        goAuthIdForLog = verifiedGrant.authorizationId
        goIssuerKeyIdForLog = verifiedGrant.issuerKeyId
      }

      // 7. Evaluación honesta de integridad de evidencia (Nivel 1; rechaza elevación desde cliente)
      const evidenceInspection = await this._evidenceEvaluator.inspect(pkg)

      // 8. Revalidación de aislamiento de entorno y salud del backend anti-replay antes de reservar o firmar
      assertServiceEnvironmentIsolation({
        serviceEnvironment: this._serviceEnvironment,
        signingProvider: this._signingProvider,
        antiReplayGuard: this._antiReplayGuard,
        clientAuthVerifier: this._clientAuthVerifier || undefined,
      })

      if (this._antiReplayGuard.storageType === 'distributed') {
        let antiReplayHealthy = false
        try {
          antiReplayHealthy = Boolean(await this._antiReplayGuard.isHealthy())
        } catch {
          antiReplayHealthy = false
        }
        if (!antiReplayHealthy) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_UNAVAILABLE: El almacén anti-replay no está saludable; prohibido reservar o firmar'
          )
        }
      }

      if (
        this._signingProvider &&
        typeof this._signingProvider.isHealthy === 'function'
      ) {
        let signingHealthy = false
        try {
          signingHealthy = Boolean(await this._signingProvider.isHealthy())
        } catch {
          signingHealthy = false
        }
        if (!signingHealthy) {
          throw new Error(
            'PRODUCTION_KMS_UNAVAILABLE: El proveedor KMS/firma no está saludable; prohibido reservar o firmar'
          )
        }
      }

      // 9. Reserva atómica pre-firma en guardia anti-replay (cero firmas si hay duplicado o error DB)
      const responseId = `att-res-${randomUUID()}`
      const reservation = await this._antiReplayGuard.reserveBeforeSign(
        pkg,
        responseId,
        { now: effectiveNow }
      )

      const responseVersion =
        requestOptions &&
        (requestOptions.responseVersion === '1.0' ||
          requestOptions.responseVersion === '1.1')
          ? requestOptions.responseVersion
          : this._attestationResponseVersion

      const effectiveAuthorityType =
        this._signingProvider.signerType === 'PRODUCTION_KMS_SIGNER'
          ? 'PRODUCTION_AUTHORITY'
          : 'TEST_AUTHORITY'

      const effectiveSignerOrigin =
        this._signingProvider.signerOrigin ||
        (this._signingProvider.signerType === 'PRODUCTION_KMS_SIGNER'
          ? 'PRODUCTION_ATTESTATION_AUTHORITY'
          : 'TEST_SIGNER')

      const effectiveIssuedAt =
        requestOptions && requestOptions.now !== undefined
          ? new Date(requestOptions.now).toISOString()
          : this._nowProvider
            ? new Date(this._nowProvider()).toISOString()
            : new Date().toISOString()

      const responseDraft = {
        schemaVersion: responseVersion,
        responseId,
        attestationId: responseId,
        authorityType: effectiveAuthorityType,
        authorityId: this._authorityId,
        keyId: this._keyId || this._signingProvider.keyId,
        algorithm: 'Ed25519',
        requestId: pkg.requestId,
        requestSha256: pkg.requestSha256,
        manifestSha256: pkg.manifestSha256,
        processId: pkg.processId,
        executionScope: pkg.executionScope,
        commitSha: String(pkg.commitSha).toLowerCase(),
        environment: pkg.environment,
        ...(responseVersion === '1.1' &&
        (verifiedGrant?.projectRef || pkg.projectRef)
          ? { projectRef: verifiedGrant?.projectRef || pkg.projectRef }
          : {}),
        authorizationId: pkg.authorizationId,
        goAuthorizationDocumentSha256: pkg.goAuthorizationDocumentSha256,
        ...(responseVersion === '1.1'
          ? {
              ...(verifiedGrant
                ? {
                    goIssuerKeyId: verifiedGrant.issuerKeyId,
                    goGrantSha256: verifiedGrant.grantSha256,
                  }
                : {}),
              ...(authenticatedClient
                ? { authenticatedClientId: authenticatedClient.clientId }
                : {}),
              evidenceLevel: evidenceInspection.evidenceLevel,
              rawSoapVerified: evidenceInspection.rawSoapVerified,
              arcaOriginVerified: evidenceInspection.arcaOriginVerified,
            }
          : {}),
        rawSoapArtifacts: pkg.rawSoapArtifacts,
        normalizedArtifacts: pkg.normalizedArtifacts,
        consultadoEn: pkg.consultadoEn,
        issuedAt: effectiveIssuedAt,
        signerOrigin: effectiveSignerOrigin,
      }

      // 10. Serialización canónica, digest y firma Ed25519 después de reservar
      const canonicalPayload =
        serializeCanonicalAttestationResponsePayload(responseDraft)
      const attestationPayloadSha256 =
        computeAttestationResponsePayloadDigest(responseDraft)

      let signature
      try {
        await this._antiReplayGuard.markSigningAttemptStarted(reservation, {
          now: effectiveNow,
        })
        signature = await this._signingProvider.sign(canonicalPayload)
      } catch (signErr) {
        try {
          await this._antiReplayGuard.markReservationFailed(
            reservation,
            signErr?.message || String(signErr),
            { now: effectiveNow }
          )
        } catch {
          // No enmascarar el error primario de firma/KMS si el backend anti-replay también falló
        }
        throw signErr
      }

      const finalResponse = Object.freeze({
        ...responseDraft,
        attestationPayloadSha256,
        signature,
      })

      // 11. Confirmar reserva -> CONSUMED en anti-replay
      try {
        await this._antiReplayGuard.commitReservation(
          reservation,
          finalResponse,
          { now: effectiveNow }
        )
      } catch (commitErr) {
        try {
          await this._antiReplayGuard.markReservationFailed(
            reservation,
            commitErr?.message || String(commitErr),
            { now: effectiveNow }
          )
        } catch {
          // No enmascarar commitErr (ej. caída DB/timeout) ni devolver atestación no confirmada
        }
        throw commitErr
      }

      // 12. Logging estructurado seguro (allowlist estricta sin secretos ni headers)
      this._logSafeEvent('ATTESTATION_ISSUED', {
        requestId: finalResponse.requestId,
        attestationId: finalResponse.attestationId,
        keyId: finalResponse.keyId,
        goAuthorizationId: finalResponse.authorizationId,
        goIssuerKeyId: verifiedGrant?.issuerKeyId ?? null,
        clientId: authenticatedClient?.clientId ?? null,
        evidenceLevel: evidenceInspection.evidenceLevel,
        timestamp: finalResponse.issuedAt,
        environment: finalResponse.environment,
        executionScope: finalResponse.executionScope,
        resultado: 'SUCCESS',
        errorCode: null,
      })

      return finalResponse
    } catch (err) {
      const msg = err?.message || String(err)
      const errorCode = msg.includes(':')
        ? msg.split(':')[0].trim()
        : 'ATTESTATION_REJECTED'

      // Nunca registrar eventos ni fragmentos cuando se detecta material secreto prohibido
      if (!msg.includes('PROHIBITED_SECRET_DETECTED')) {
        this._logSafeEvent('ATTESTATION_REJECTED', {
          requestId: requestIdForLog,
          attestationId: null,
          keyId: this._keyId,
          goAuthorizationId: goAuthIdForLog,
          goIssuerKeyId: goIssuerKeyIdForLog,
          clientId: clientIdForLog,
          evidenceLevel: this._evidenceEvaluator.level,
          timestamp: new Date().toISOString(),
          environment: envForLog,
          executionScope: scopeForLog,
          resultado: 'REJECTED',
          errorCode,
        })
      }

      throw err
    }
  }

  /**
   * Registro seguro de eventos de auditoría con allowlist estricta de propiedades.
   * Garantiza que jamás se registren secretos, headers, tokens ni payloads completos.
   * @param {string} event
   * @param {{
   *   requestId: string | null,
   *   attestationId: string | null,
   *   keyId: string | null,
   *   goAuthorizationId?: string | null,
   *   goIssuerKeyId?: string | null,
   *   clientId?: string | null,
   *   evidenceLevel?: string | null,
   *   timestamp: string,
   *   environment: string | null,
   *   executionScope: string | null,
   *   resultado: string,
   *   errorCode: string | null
   * }} meta
   */
  _logSafeEvent(event, meta) {
    if (this._logger && typeof this._logger.info === 'function') {
      const safeMeta = Object.freeze({
        requestId: meta.requestId ?? null,
        attestationId: meta.attestationId ?? null,
        keyId: meta.keyId ?? null,
        goAuthorizationId: meta.goAuthorizationId ?? null,
        goIssuerKeyId: meta.goIssuerKeyId ?? null,
        clientId: meta.clientId ?? null,
        evidenceLevel: meta.evidenceLevel ?? this._evidenceEvaluator.level,
        timestamp: meta.timestamp,
        environment: meta.environment ?? null,
        executionScope: meta.executionScope ?? null,
        resultado: meta.resultado,
        errorCode: meta.errorCode ?? null,
      })
      this._logger.info(event, safeMeta)
    }
  }
}
