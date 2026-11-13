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
   * @param {string} [options.authorityId]
   * @param {string} [options.keyId]
   * @param {string} [options.trustedGoKeyId]
   * @param {string} [options.trustedGoPublicKeySpki]
   * @param {(headers: Record<string, unknown>, context: { serviceEnvironment: string }) => Promise<boolean> | boolean} [options.clientAuthVerifier]
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

    this._serviceEnvironment = assertServiceEnvironmentIsolation({
      serviceEnvironment: inferredEnv,
      signingProvider: this._signingProvider,
      antiReplayGuard: this._antiReplayGuard,
      env: options.env || process.env,
    })

    this._authorityId =
      options.authorityId ||
      provider.authorityId ||
      'independent-attestation-authority-v1'
    this._keyId = options.keyId || provider.keyId || null
    this._trustedGoKeyId = options.trustedGoKeyId || null
    this._trustedGoPublicKeySpki = options.trustedGoPublicKeySpki || null
    this._clientAuthVerifier =
      typeof options.clientAuthVerifier === 'function'
        ? options.clientAuthVerifier
        : null
    this._logger = options.logger || null

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

  get signingProvider() {
    return this._signingProvider
  }

  get antiReplayGuard() {
    return this._antiReplayGuard
  }

  get serviceVersion() {
    return '1.0'
  }

  /**
   * Garantiza que la autoridad de atestación no comparta identidad ni claves con la GO Authority.
   */
  _assertSeparationOfAuthorities() {
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
   * Distingue explícitamente proceso/servidor HTTP iniciado vs proveedor de firma operativo
   * y disponibilidad en el mundo real.
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
      service: 'independent-attestation-authority',
      serviceVersion: this.serviceVersion,
      serviceEnvironment: this._serviceEnvironment,
      processStarted: true,
      httpServerRunning: true,
      signingProviderConfigured,
      signingProviderOperational,
      productionSigningReady,
      authorityRealWorldAvailable: false,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Endpoint GET /readiness (readiness operativa sin ejecutar firmas ni revelar secretos).
   * @returns {Promise<{
   *   ready: boolean,
   *   service: string,
   *   serviceEnvironment: string,
   *   signerType: string,
   *   trustScope: string,
   *   providerReady: boolean,
   *   antiReplayHealthy: boolean,
   *   antiReplayGuarantee: string,
   *   reason: string,
   *   timestamp: string
   * }>}
   */
  async handleReadiness() {
    const antiReplayHealthy = await this._antiReplayGuard.isHealthy()
    const isProdOrStaging =
      this._serviceEnvironment === SERVICE_ENVIRONMENTS.PRODUCTION ||
      this._serviceEnvironment === SERVICE_ENVIRONMENTS.STAGING

    const providerReady = isProdOrStaging
      ? this._signingProvider.signerType === 'PRODUCTION_KMS_SIGNER' &&
        this._signingProvider.isProductionReady()
      : Boolean(this._signingProvider && this._signingProvider.keyId)

    const durableEnough = isProdOrStaging
      ? this._antiReplayGuard.storageType !== 'memory'
      : true

    const ready = Boolean(providerReady && antiReplayHealthy && durableEnough)

    let reason = 'READY'
    if (!antiReplayHealthy) {
      reason = 'ANTI_REPLAY_STORAGE_UNAVAILABLE'
    } else if (!durableEnough) {
      reason = 'DURABLE_ANTI_REPLAY_REQUIRED'
    } else if (!providerReady) {
      reason = 'SIGNING_PROVIDER_NOT_READY'
    }

    return Object.freeze({
      ready,
      service: 'independent-attestation-authority',
      serviceEnvironment: this._serviceEnvironment,
      signerType: this._signingProvider.signerType,
      trustScope: this._signingProvider.trustScope,
      providerReady,
      antiReplayHealthy,
      antiReplayGuarantee: this._antiReplayGuard.guaranteeLevel,
      reason,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Valida la frontera de autenticación del cliente (nunca reutiliza credenciales fiscales ARCA/WSAA/Supabase).
   * @param {Record<string, unknown>} headers
   */
  async _validateClientAuthBoundary(headers) {
    if (!headers || typeof headers !== 'object') return

    for (const rawKey of Object.keys(headers)) {
      const lowerKey = rawKey.toLowerCase()
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

    if (this._clientAuthVerifier) {
      const authorized = await this._clientAuthVerifier(headers, {
        serviceEnvironment: this._serviceEnvironment,
      })
      if (authorized !== true) {
        throw new Error(
          'CLIENT_AUTH_FAILED: Identidad del cliente rechazada por el verificador de autenticación'
        )
      }
      return
    }

    // Sin verificador de workload/mTLS configurado: rechazar Bearer estático en STAGING/PRODUCTION
    if (isProdOrStaging && headers.authorization) {
      throw new Error(
        'UNMODELED_BEARER_TOKEN_REJECTED: No se acepta Authorization Bearer estático sin modelo de custodia/workload identity configurado'
      )
    }
  }

  /**
   * Endpoint POST /attestations
   * Valida exhaustivamente, aplica política, verifica anti-replay y emite respuesta firmada.
   * @param {string | Record<string, any>} rawBodyOrPkg
   * @param {Record<string, unknown>} [headers]
   * @returns {Promise<Record<string, any>>}
   */
  async handleRequest(rawBodyOrPkg, headers = {}) {
    let requestIdForLog = null
    let envForLog = null
    let scopeForLog = null

    try {
      // 0. Validar fronteras de headers de autenticación (sin registrar valores sensibles)
      await this._validateClientAuthBoundary(headers)

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

      // 2. Validación estricta del contrato (allowlist de propiedades, tipos, hashes, secretos)
      validateAttestationRequestStrict(pkg)

      // 3. Validación de política de atestación en el servidor
      validateAttestationPolicy(pkg)

      // 4. Validación de separación de poderes en el request
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

      // 5. Revalidación de aislamiento de entorno antes de firmar
      assertServiceEnvironmentIsolation({
        serviceEnvironment: this._serviceEnvironment,
        signingProvider: this._signingProvider,
        antiReplayGuard: this._antiReplayGuard,
      })

      // 6. Verificación de guardia anti-replay
      await this._antiReplayGuard.checkAsync(pkg)

      // 7. Construcción del borrador canónico de respuesta
      const responseId = `att-res-${randomUUID()}`
      const effectiveAuthorityType =
        this._signingProvider.signerType === 'PRODUCTION_KMS_SIGNER'
          ? 'PRODUCTION_AUTHORITY'
          : 'TEST_AUTHORITY'

      const effectiveSignerOrigin =
        this._signingProvider.signerOrigin ||
        (this._signingProvider.signerType === 'PRODUCTION_KMS_SIGNER'
          ? 'PRODUCTION_ATTESTATION_AUTHORITY'
          : 'TEST_SIGNER')

      const responseDraft = {
        schemaVersion: '1.0',
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
        authorizationId: pkg.authorizationId,
        goAuthorizationDocumentSha256: pkg.goAuthorizationDocumentSha256,
        rawSoapArtifacts: pkg.rawSoapArtifacts,
        normalizedArtifacts: pkg.normalizedArtifacts,
        consultadoEn: pkg.consultadoEn,
        issuedAt: new Date().toISOString(),
        signerOrigin: effectiveSignerOrigin,
      }

      // 8. Serialización canónica y digest del payload de atestación
      const canonicalPayload =
        serializeCanonicalAttestationResponsePayload(responseDraft)
      const attestationPayloadSha256 =
        computeAttestationResponsePayloadDigest(responseDraft)

      // 9. Firma criptográfica Ed25519 a través del proveedor
      const signature = await this._signingProvider.sign(canonicalPayload)

      const finalResponse = Object.freeze({
        ...responseDraft,
        attestationPayloadSha256,
        signature,
      })

      // 10. Registro durable en anti-replay
      await this._antiReplayGuard.recordAsync(pkg, finalResponse)

      // 11. Logging estructurado seguro (exclusivamente campos auditables sin secretos)
      this._logSafeEvent('ATTESTATION_ISSUED', {
        requestId: finalResponse.requestId,
        attestationId: finalResponse.attestationId,
        keyId: finalResponse.keyId,
        timestamp: finalResponse.issuedAt,
        environment: finalResponse.environment,
        executionScope: finalResponse.executionScope,
        resultado: 'SUCCESS',
        errorCode: null,
      })

      return finalResponse
    } catch (err) {
      const msg = err?.message || String(err)
      const errorCode = msg.includes(':') ? msg.split(':')[0].trim() : 'ATTESTATION_REJECTED'

      // Nunca registrar eventos ni fragmentos cuando se detecta material secreto prohibido
      if (!msg.includes('PROHIBITED_SECRET_DETECTED')) {
        this._logSafeEvent('ATTESTATION_REJECTED', {
          requestId: requestIdForLog,
          attestationId: null,
          keyId: this._keyId,
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
