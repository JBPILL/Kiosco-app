// @ts-check
import crypto from 'node:crypto'

export const SUPPORTED_SIGNING_ALGORITHM = 'Ed25519'

/**
 * Interfaz base abstracta para proveedores de firma de la Autoridad de Atestación.
 */
export class AttestationSigningProvider {
  get signerType() {
    throw new Error('NOT_IMPLEMENTED: Debe implementarse en subclase')
  }

  get trustScope() {
    throw new Error('NOT_IMPLEMENTED: Debe implementarse en subclase')
  }

  get signerOrigin() {
    throw new Error('NOT_IMPLEMENTED: Debe implementarse en subclase')
  }

  get algorithm() {
    return SUPPORTED_SIGNING_ALGORITHM
  }

  get authorityId() {
    throw new Error('NOT_IMPLEMENTED: Debe implementarse en subclase')
  }

  get keyId() {
    throw new Error('NOT_IMPLEMENTED: Debe implementarse en subclase')
  }

  get publicKeySpki() {
    throw new Error('NOT_IMPLEMENTED: Debe implementarse en subclase')
  }

  isProductionReady() {
    return false
  }

  fallbackToLocal() {
    throw new Error(
      'LOCAL_FALLBACK_SIGNING_FORBIDDEN: Prohibido realizar fallback a firma local cuando el proveedor configurado falla'
    )
  }

  /**
   * @param {string | Buffer} _canonicalPayload
   * @returns {string | Promise<string>}
   */
  sign(_canonicalPayload) {
    throw new Error('NOT_IMPLEMENTED: Debe implementarse en subclase')
  }
}

/**
 * Proveedor de pruebas efímero o aislado para testing unitario y de integración.
 * Tiene terminantemente prohibido declararse o ser utilizado como proveedor de producción.
 */
export class TestSigningProvider extends AttestationSigningProvider {
  /**
   * @param {object} [options]
   * @param {string} [options.authorityId]
   * @param {string} [options.keyId]
   * @param {crypto.KeyObject} [options.privateKey]
   * @param {crypto.KeyObject} [options.publicKey]
   * @param {boolean} [options.declareProduction]
   * @param {boolean} [options.isProduction]
   * @param {boolean} [options.isProductionReady]
   * @param {string} [options.algorithm]
   */
  constructor(options = {}) {
    super()
    if (
      options.declareProduction === true ||
      options.isProduction === true ||
      options.isProductionReady === true
    ) {
      throw new Error(
        'TEST_SIGNING_PROVIDER_CANNOT_BE_PRODUCTION: El proveedor de pruebas no puede ser declarado como producción'
      )
    }

    if (
      options.algorithm !== undefined &&
      options.algorithm !== SUPPORTED_SIGNING_ALGORITHM
    ) {
      throw new Error(
        `UNSUPPORTED_SIGNING_ALGORITHM: Solo se permite '${SUPPORTED_SIGNING_ALGORITHM}', recibido '${options.algorithm}'`
      )
    }

    this._signerType = 'TEST_SIGNER'
    this._trustScope = 'TEST_ONLY'
    this._signerOrigin = 'TEST_SIGNER'
    this._authorityId =
      options.authorityId || 'test-independent-attestation-authority-v1'

    if (options.privateKey) {
      this._privateKey = options.privateKey
      this._publicKey =
        options.publicKey || crypto.createPublicKey(options.privateKey)
    } else {
      const pair = crypto.generateKeyPairSync('ed25519')
      this._privateKey = pair.privateKey
      this._publicKey = pair.publicKey
    }

    this._publicKeySpki = this._publicKey
      .export({ format: 'pem', type: 'spki' })
      .toString()
      .trim()
    const der = this._publicKey.export({ format: 'der', type: 'spki' })
    this._keyId =
      options.keyId ||
      `ed25519-spki-${crypto.createHash('sha256').update(der).digest('hex').slice(0, 16)}`

    Object.freeze(this)
  }

  get signerType() {
    return this._signerType
  }

  get trustScope() {
    return this._trustScope
  }

  get signerOrigin() {
    return this._signerOrigin
  }

  get authorityId() {
    return this._authorityId
  }

  get keyId() {
    return this._keyId
  }

  get publicKeySpki() {
    return this._publicKeySpki
  }

  get publicKey() {
    return this._publicKey
  }

  isProductionReady() {
    return false
  }

  /**
   * @param {string | Buffer} canonicalPayload
   * @returns {string}
   */
  sign(canonicalPayload) {
    const data = Buffer.isBuffer(canonicalPayload)
      ? canonicalPayload
      : Buffer.from(String(canonicalPayload), 'utf8')
    const signature = crypto.sign(null, data, this._privateKey)
    return signature.toString('hex')
  }
}

/**
 * Proveedor de firma para entorno de producción basado en KMS/HSM externo.
 * Diseñado para operar contra Cloud KMS (GCP Cloud KMS, AWS KMS o Azure Managed HSM).
 * Falla cerrado si se invoca sin la infraestructura y credenciales KMS configuradas.
 * No almacena ni permite extraer claves privadas en texto plano ni permite fallback local.
 */
export class ProductionKmsSigningProvider extends AttestationSigningProvider {
  /**
   * @param {object} [options]
   * @param {string} [options.authorityId]
   * @param {string} [options.keyId]
   * @param {string} [options.publicKeySpki]
   * @param {string} [options.keyVersionName]
   * @param {string} [options.algorithm]
   * @param {string} [options.kmsEndpoint]
   * @param {object} [options.kmsClient]
   */
  constructor(options = {}) {
    super()
    if (
      options.algorithm !== undefined &&
      options.algorithm !== SUPPORTED_SIGNING_ALGORITHM
    ) {
      throw new Error(
        `UNSUPPORTED_SIGNING_ALGORITHM: Solo se permite '${SUPPORTED_SIGNING_ALGORITHM}', recibido '${options.algorithm}'`
      )
    }

    if (
      options.privateKey ||
      options.privateKeyPem ||
      options.localFallback === true ||
      options.allowLocalFallback === true
    ) {
      throw new Error(
        'LOCAL_FALLBACK_SIGNING_FORBIDDEN: ProductionKmsSigningProvider prohíbe claves privadas locales o fallback local'
      )
    }

    this._signerType = 'PRODUCTION_KMS_SIGNER'
    this._trustScope = 'PRODUCTION'
    this._signerOrigin = 'PRODUCTION_ATTESTATION_AUTHORITY'
    this._authorityId =
      options.authorityId || 'kioskopos-independent-attestation-authority-prod'
    this._kmsClient = options.kmsClient || null
    this._kmsEndpoint = options.kmsEndpoint || null
    this._keyVersionName =
      typeof options.keyVersionName === 'string' &&
      options.keyVersionName.trim().length > 0
        ? options.keyVersionName.trim()
        : null
    this._publicKeySpki =
      typeof options.publicKeySpki === 'string' &&
      options.publicKeySpki.trim().length > 0
        ? options.publicKeySpki.trim()
        : null
    this._keyId =
      typeof options.keyId === 'string' && options.keyId.trim().length > 0
        ? options.keyId.trim()
        : null

    Object.freeze(this)
  }

  get signerType() {
    return this._signerType
  }

  get trustScope() {
    return this._trustScope
  }

  get signerOrigin() {
    return this._signerOrigin
  }

  get authorityId() {
    return this._authorityId
  }

  get keyId() {
    return this._keyId
  }

  get publicKeySpki() {
    return this._publicKeySpki
  }

  get keyVersionName() {
    return this._keyVersionName
  }

  get kmsEndpoint() {
    return this._kmsEndpoint
  }

  /**
   * Valida que toda la cadena KMS esté configurada, que el SPKI sea Ed25519 válido
   * y que el keyId coincida con la huella SPKI si usa el prefijo canónico.
   */
  _hasValidSpkiAndKeyId() {
    if (!this._publicKeySpki || !this._keyId) return false
    try {
      const pubObj = crypto.createPublicKey(this._publicKeySpki)
      if (pubObj.asymmetricKeyType !== 'ed25519') return false
      if (this._keyId.startsWith('ed25519-spki-')) {
        const der = pubObj.export({ format: 'der', type: 'spki' })
        const expected = `ed25519-spki-${crypto.createHash('sha256').update(der).digest('hex').slice(0, 16)}`
        if (this._keyId !== expected) return false
      }
      return true
    } catch {
      return false
    }
  }

  isProductionReady() {
    return Boolean(
      this._kmsClient &&
        typeof this._kmsClient.sign === 'function' &&
        this._keyVersionName &&
        this._keyId &&
        this._hasValidSpkiAndKeyId()
    )
  }

  accessPrivateKey() {
    throw new Error(
      'KMS_PRIVATE_KEY_NON_EXPORTABLE: La clave privada reside exclusivamente en el KMS/HSM externo y no es exportable'
    )
  }

  /**
   * @param {string | Buffer} canonicalPayload
   * @returns {Promise<string>}
   */
  async sign(canonicalPayload) {
    if (!this._kmsClient || typeof this._kmsClient.sign !== 'function') {
      throw new Error(
        'PRODUCTION_KMS_NOT_CONFIGURED: Proveedor KMS de producción no configurado o inalcanzable'
      )
    }

    if (!this._keyVersionName) {
      throw new Error(
        'PRODUCTION_KMS_KEY_VERSION_MISSING: Se requiere keyVersionName explícito para firmar con KMS'
      )
    }

    if (!this._keyId) {
      throw new Error(
        'PRODUCTION_KMS_KEY_ID_MISSING: Se requiere keyId explícito para el proveedor KMS'
      )
    }

    if (!this._hasValidSpkiAndKeyId()) {
      throw new Error(
        'PRODUCTION_KMS_PUBLIC_KEY_INVALID: Clave pública SPKI Ed25519 ausente, inválida o inconsistente con keyId'
      )
    }

    const data = Buffer.isBuffer(canonicalPayload)
      ? canonicalPayload
      : Buffer.from(String(canonicalPayload), 'utf8')

    const sigHex = await this._kmsClient.sign({
      keyVersionName: this._keyVersionName,
      data,
      algorithm: SUPPORTED_SIGNING_ALGORITHM,
    })

    if (typeof sigHex !== 'string' || !/^[0-9a-fA-F]{128}$/.test(sigHex)) {
      throw new Error(
        'PRODUCTION_KMS_SIGNATURE_INVALID: El proveedor KMS retornó una firma Ed25519 inválida'
      )
    }

    const pubObj = crypto.createPublicKey(this._publicKeySpki)
    const verified = crypto.verify(null, data, pubObj, Buffer.from(sigHex, 'hex'))
    if (!verified) {
      throw new Error(
        'KMS_PUBLIC_KEY_MISMATCH: La firma retornada por KMS no verifica contra el SPKI Ed25519 configurado'
      )
    }

    return sigHex.toLowerCase()
  }
}
