// @ts-check
import crypto from 'node:crypto'

export const SUPPORTED_SIGNING_ALGORITHM = 'Ed25519'

const DEFAULT_KMS_SIGNING_TIMEOUT_MS = 5000
export const AWS_KMS_ED25519_KEY_SPEC = 'ECC_NIST_EDWARDS25519'
export const AWS_KMS_ED25519_KEY_USAGE = 'SIGN_VERIFY'
export const AWS_KMS_ED25519_SIGNING_ALGORITHM = 'ED25519_SHA_512'
export const AWS_KMS_ED25519_MESSAGE_TYPE = 'RAW'
export const AWS_KMS_ED25519_MAX_RAW_MESSAGE_BYTES = 4096
const ALLOWED_AWS_ED25519_ALGORITHMS = Object.freeze([
  AWS_KMS_ED25519_SIGNING_ALGORITHM,
])

async function awaitKmsWithTimeout(promise, timeoutMs, label) {
  let timer = null
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `PRODUCTION_KMS_TIMEOUT: Timeout (${timeoutMs}ms) operando con proveedor KMS en '${label}'`
            )
          )
        }, timeoutMs)
        if (typeof timer.unref === 'function') timer.unref()
      }),
    ])
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

export const EXTERNAL_SIGNING_PROVIDER_KINDS = Object.freeze({
  LOCAL_TEST: 'LOCAL_TEST',
  EXTERNAL_KMS: 'EXTERNAL_KMS',
  AWS_KMS: 'AWS_KMS',
  GCP_KMS: 'GCP_KMS',
})

export const PROVIDER_REAL_WORLD_TESTED = false

/**
 * Normaliza la salida de firma Ed25519 desde SDKs externos (hex 128 chars, Buffer/Uint8Array 64 bytes o base64)
 * a hexadecimal en minúsculas sin permitir claves privadas en runtime.
 * @param {unknown} rawSig
 * @returns {string}
 */
function normalizeEd25519SignatureToHex(rawSig) {
  if (typeof rawSig === 'string') {
    const trimmed = rawSig.trim()
    if (/^[0-9a-fA-F]{128}$/.test(trimmed)) {
      return trimmed.toLowerCase()
    }
    try {
      const buf = Buffer.from(trimmed, 'base64')
      if (buf.length === 64) {
        return buf.toString('hex')
      }
    } catch {
      // fall through to typed error
    }
  } else if (Buffer.isBuffer(rawSig) || rawSig instanceof Uint8Array) {
    const buf = Buffer.from(rawSig)
    if (buf.length === 64) {
      return buf.toString('hex')
    }
  } else if (rawSig && typeof rawSig === 'object') {
    const nested =
      /** @type {{ signature?: unknown, Signature?: unknown }} */ (rawSig)
        .signature ??
      /** @type {{ Signature?: unknown }} */ (rawSig).Signature
    if (nested !== undefined) {
      return normalizeEd25519SignatureToHex(nested)
    }
  }
  throw new Error(
    'PRODUCTION_KMS_SIGNATURE_INVALID: El proveedor KMS retornó una firma Ed25519 inválida'
  )
}

/**
 * Interfaz base abstracta para proveedores de firma de la Autoridad de Atestación.
 */
export class AttestationSigningProvider {
  get providerKind() {
    throw new Error('NOT_IMPLEMENTED: Debe implementarse en subclase')
  }

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

  async isHealthy() {
    return Boolean(this.keyId)
  }

  isRealWorldTested() {
    return false
  }

  getMetadata() {
    return Object.freeze({
      providerKind: this.providerKind,
      signerType: this.signerType,
      trustScope: this.trustScope,
      signerOrigin: this.signerOrigin,
      algorithm: this.algorithm,
      authorityId: this.authorityId,
      keyId: this.keyId,
      productionReady: this.isProductionReady(),
      realWorldTested: this.isRealWorldTested(),
    })
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

    this._providerKind = EXTERNAL_SIGNING_PROVIDER_KINDS.LOCAL_TEST
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

  get providerKind() {
    return this._providerKind
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

    this._providerKind = EXTERNAL_SIGNING_PROVIDER_KINDS.EXTERNAL_KMS
    this._cloudProvider = options.cloudProvider || 'EXTERNAL_KMS'
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
    this._kmsTimeoutMs =
      typeof options.kmsTimeoutMs === 'number' &&
      Number.isFinite(options.kmsTimeoutMs) &&
      options.kmsTimeoutMs > 0
        ? Math.floor(options.kmsTimeoutMs)
        : DEFAULT_KMS_SIGNING_TIMEOUT_MS
    this._healthCheckFn =
      typeof options.healthCheck === 'function' ? options.healthCheck : null

    if (new.target === ProductionKmsSigningProvider) {
      Object.freeze(this)
    }
  }

  get providerKind() {
    return this._providerKind
  }

  get cloudProvider() {
    return this._cloudProvider
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

  get kmsTimeoutMs() {
    return this._kmsTimeoutMs
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

  async isHealthy() {
    if (!this.isProductionReady()) {
      return false
    }
    const timeoutMs = Math.min(this._kmsTimeoutMs, 3000)
    try {
      if (this._healthCheckFn) {
        const ok = await awaitKmsWithTimeout(
          this._healthCheckFn({
            keyVersionName: this._keyVersionName,
            keyId: this._keyId,
            cloudProvider: this._cloudProvider,
          }),
          timeoutMs,
          'healthCheck'
        )
        return Boolean(ok)
      }
      if (typeof this._kmsClient?.healthCheck === 'function') {
        const ok = await awaitKmsWithTimeout(
          this._kmsClient.healthCheck({
            keyVersionName: this._keyVersionName,
          }),
          timeoutMs,
          'kmsClient.healthCheck'
        )
        return Boolean(ok)
      }
      if (typeof this._kmsClient?.getPublicKey === 'function') {
        const remotePub = await awaitKmsWithTimeout(
          this._kmsClient.getPublicKey({
            keyVersionName: this._keyVersionName,
          }),
          timeoutMs,
          'kmsClient.getPublicKey'
        )
        if (
          remotePub &&
          typeof remotePub === 'object' &&
          !Buffer.isBuffer(remotePub) &&
          !(remotePub instanceof Uint8Array)
        ) {
          const returnedKey =
            remotePub.KeyId ?? remotePub.keyVersionName ?? remotePub.name
          if (
            returnedKey !== undefined &&
            String(returnedKey) !== this._keyVersionName
          ) {
            return false
          }
          const returnedKeySpec =
            remotePub.KeySpec ?? remotePub.CustomerMasterKeySpec
          if (
            returnedKeySpec !== undefined &&
            String(returnedKeySpec) !== AWS_KMS_ED25519_KEY_SPEC
          ) {
            return false
          }
          if (
            remotePub.KeyUsage !== undefined &&
            String(remotePub.KeyUsage) !== AWS_KMS_ED25519_KEY_USAGE
          ) {
            return false
          }
          if (
            Array.isArray(remotePub.SigningAlgorithms) &&
            !remotePub.SigningAlgorithms.includes(
              AWS_KMS_ED25519_SIGNING_ALGORITHM
            )
          ) {
            return false
          }
        }
        const remotePemOrDer =
          typeof remotePub === 'string' ||
          Buffer.isBuffer(remotePub) ||
          remotePub instanceof Uint8Array
            ? remotePub
            : remotePub?.pem || remotePub?.publicKeySpki || remotePub?.PublicKey
        if (!remotePemOrDer) return false
        const remotePubObj =
          typeof remotePemOrDer === 'string'
            ? crypto.createPublicKey(remotePemOrDer)
            : crypto.createPublicKey({
                key: Buffer.from(remotePemOrDer),
                format: 'der',
                type: 'spki',
              })
        if (remotePubObj.asymmetricKeyType !== 'ed25519') {
          return false
        }
        const remoteDer = remotePubObj.export({ format: 'der', type: 'spki' })
        const localDer = crypto
          .createPublicKey(this._publicKeySpki)
          .export({ format: 'der', type: 'spki' })
        return remoteDer.equals(localDer)
      }
      return true
    } catch {
      return false
    }
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

    let rawResult
    try {
      rawResult = await awaitKmsWithTimeout(
        this._kmsClient.sign({
          keyVersionName: this._keyVersionName,
          data,
          algorithm: SUPPORTED_SIGNING_ALGORITHM,
        }),
        this._kmsTimeoutMs,
        'sign'
      )
    } catch (kmsErr) {
      const msg = kmsErr?.message || String(kmsErr)
      if (
        msg.includes('PRODUCTION_KMS_') ||
        msg.includes('KMS_') ||
        msg.includes('UNSUPPORTED_SIGNING_ALGORITHM') ||
        msg.includes('LOCAL_FALLBACK_')
      ) {
        throw kmsErr
      }
      throw new Error(
        `PRODUCTION_KMS_UNAVAILABLE: Fallo del proveedor KMS externo al firmar: ${msg}`
      )
    }

    if (rawResult && typeof rawResult === 'object' && !Buffer.isBuffer(rawResult) && !(rawResult instanceof Uint8Array)) {
      const returnedAlg = rawResult.SigningAlgorithm ?? rawResult.algorithm
      if (returnedAlg !== undefined) {
        const expectedAlgs =
          this._providerKind === EXTERNAL_SIGNING_PROVIDER_KINDS.AWS_KMS
            ? ALLOWED_AWS_ED25519_ALGORITHMS
            : [SUPPORTED_SIGNING_ALGORITHM, 'PURE_ED25519']
        if (!expectedAlgs.includes(String(returnedAlg))) {
          throw new Error(
            `UNSUPPORTED_SIGNING_ALGORITHM: KMS retornó algoritmo inesperado '${returnedAlg}'`
          )
        }
      }
      const returnedKey = rawResult.KeyId ?? rawResult.keyVersionName ?? rawResult.name
      if (returnedKey !== undefined && String(returnedKey) !== this._keyVersionName) {
        throw new Error(
          `PRODUCTION_KMS_KEY_ID_MISMATCH: KMS retornó clave '${returnedKey}' distinta a '${this._keyVersionName}'`
        )
      }
    }

    const sigHex = normalizeEd25519SignatureToHex(rawResult)

    const pubObj = crypto.createPublicKey(this._publicKeySpki)
    const verified = crypto.verify(null, data, pubObj, Buffer.from(sigHex, 'hex'))
    if (!verified) {
      throw new Error(
        'KMS_PUBLIC_KEY_MISMATCH: La firma retornada por KMS no verifica contra el SPKI Ed25519 configurado'
      )
    }

    return sigHex
  }
}

/**
 * Adaptador preparado para AWS KMS (`AWS_KMS`) sin claves locales ni llamadas AWS reales en esta fase.
 * `providerRealWorldTested` permanece en `false` hasta validación contra AWS KMS real.
 */
export class AwsKmsSigningProvider extends ProductionKmsSigningProvider {
  /**
   * @param {object} [options]
   * @param {string} [options.authorityId]
   * @param {string} [options.keyId]
   * @param {string} [options.publicKeySpki]
   * @param {string} [options.kmsKeyArn]
   * @param {string} [options.keyVersionName]
   * @param {string} [options.region]
   * @param {string} [options.awsSigningAlgorithm='ED25519_SHA_512']
   * @param {string} [options.kmsEndpoint]
   * @param {{ sign?: Function, send?: Function }} [options.awsKmsClient]
   * @param {{ sign: Function }} [options.kmsClient]
   */
  constructor(options = {}) {
    const keyArn =
      (typeof options.kmsKeyArn === 'string' && options.kmsKeyArn.trim()) ||
      (typeof options.keyVersionName === 'string' &&
        options.keyVersionName.trim()) ||
      undefined
    const awsSigningAlgorithm =
      options.awsSigningAlgorithm || AWS_KMS_ED25519_SIGNING_ALGORITHM
    if (!ALLOWED_AWS_ED25519_ALGORITHMS.includes(awsSigningAlgorithm)) {
      throw new Error(
        `UNSUPPORTED_SIGNING_ALGORITHM: Algoritmo AWS KMS '${awsSigningAlgorithm}' no permitido; se requiere '${ALLOWED_AWS_ED25519_ALGORITHMS.join(', ')}'`
      )
    }
    const messageType =
      options.messageType !== undefined
        ? String(options.messageType).trim().toUpperCase()
        : AWS_KMS_ED25519_MESSAGE_TYPE
    if (messageType !== AWS_KMS_ED25519_MESSAGE_TYPE) {
      throw new Error(
        `UNSUPPORTED_KMS_MESSAGE_TYPE: AWS KMS Ed25519 (${AWS_KMS_ED25519_KEY_SPEC} / ${AWS_KMS_ED25519_SIGNING_ALGORITHM}) exige MessageType='RAW'; prohibido usar '${options.messageType}'`
      )
    }
    const awsClient = options.awsKmsClient || null
    const wrappedClient =
      options.kmsClient ||
      (awsClient &&
      (typeof awsClient.sign === 'function' ||
        typeof awsClient.send === 'function')
        ? {
            sign: async ({ keyVersionName, data }) => {
              const rawBytes = Buffer.isBuffer(data)
                ? data
                : Buffer.from(String(data), 'utf8')
              if (rawBytes.byteLength === 0) {
                throw new Error(
                  'AWS_KMS_EMPTY_PAYLOAD: El payload canónico para AWS KMS Ed25519 no puede ser vacío'
                )
              }
              if (rawBytes.byteLength > AWS_KMS_ED25519_MAX_RAW_MESSAGE_BYTES) {
                throw new Error(
                  `AWS_KMS_PAYLOAD_TOO_LARGE: AWS KMS Ed25519 con MessageType='RAW' admite hasta ${AWS_KMS_ED25519_MAX_RAW_MESSAGE_BYTES} bytes (recibido ${rawBytes.byteLength} bytes)`
                )
              }
              const payload = {
                KeyId: keyVersionName,
                Message: rawBytes,
                MessageType: AWS_KMS_ED25519_MESSAGE_TYPE,
                SigningAlgorithm: awsSigningAlgorithm,
              }
              const res =
                typeof awsClient.sign === 'function'
                  ? await awsClient.sign(payload)
                  : await awsClient.send(payload)
              if (res && typeof res === 'object' && !Buffer.isBuffer(res) && !(res instanceof Uint8Array)) {
                return res
              }
              return res?.Signature ?? res?.signature ?? res
            },
            ...(typeof awsClient.getPublicKey === 'function'
              ? {
                  getPublicKey: async ({ keyVersionName }) =>
                    await awsClient.getPublicKey({ KeyId: keyVersionName }),
                }
              : {}),
            ...(typeof awsClient.healthCheck === 'function'
              ? {
                  healthCheck: async ({ keyVersionName }) =>
                    await awsClient.healthCheck({ KeyId: keyVersionName }),
                }
              : {}),
          }
        : undefined)

    super({
      ...options,
      cloudProvider: 'AWS_KMS',
      keyVersionName: keyArn,
      kmsClient: wrappedClient,
    })

    this._providerKind = EXTERNAL_SIGNING_PROVIDER_KINDS.AWS_KMS
    this._awsRegion =
      typeof options.region === 'string' && options.region.trim().length > 0
        ? options.region.trim()
        : null
    this._awsSigningAlgorithm = awsSigningAlgorithm
    Object.freeze(this)
  }

  get region() {
    return this._awsRegion
  }

  get awsSigningAlgorithm() {
    return this._awsSigningAlgorithm
  }

  /**
   * Construye el descriptor de comando seguro para AWS KMS Sign API sin ejecutar llamadas de red.
   * @param {string | Buffer} canonicalPayload
   */
  buildAwsSignCommandInput(canonicalPayload) {
    if (!this._keyVersionName) {
      throw new Error(
        'PRODUCTION_KMS_KEY_VERSION_MISSING: Se requiere kmsKeyArn / keyVersionName para AWS KMS'
      )
    }
    const data = Buffer.isBuffer(canonicalPayload)
      ? canonicalPayload
      : Buffer.from(String(canonicalPayload), 'utf8')
    if (data.byteLength === 0) {
      throw new Error(
        'AWS_KMS_EMPTY_PAYLOAD: El payload canónico para AWS KMS Ed25519 no puede ser vacío'
      )
    }
    if (data.byteLength > AWS_KMS_ED25519_MAX_RAW_MESSAGE_BYTES) {
      throw new Error(
        `AWS_KMS_PAYLOAD_TOO_LARGE: AWS KMS Ed25519 con MessageType='RAW' admite hasta ${AWS_KMS_ED25519_MAX_RAW_MESSAGE_BYTES} bytes (recibido ${data.byteLength} bytes)`
      )
    }
    return Object.freeze({
      KeyId: this._keyVersionName,
      Message: data,
      MessageType: AWS_KMS_ED25519_MESSAGE_TYPE,
      SigningAlgorithm: this._awsSigningAlgorithm,
    })
  }

  isRealWorldTested() {
    return PROVIDER_REAL_WORLD_TESTED
  }
}

/**
 * Adaptador preparado para Google Cloud KMS (`GCP_KMS`) sin claves locales ni llamadas GCP reales en esta fase.
 * `providerRealWorldTested` permanece en `false` hasta validación contra GCP Cloud KMS real.
 */
export class GcpKmsSigningProvider extends ProductionKmsSigningProvider {
  /**
   * @param {object} [options]
   * @param {string} [options.authorityId]
   * @param {string} [options.keyId]
   * @param {string} [options.publicKeySpki]
   * @param {string} [options.keyVersionName]
   * @param {string} [options.kmsEndpoint]
   * @param {{ asymmetricSign?: Function, sign?: Function }} [options.gcpKmsClient]
   * @param {{ sign: Function }} [options.kmsClient]
   */
  constructor(options = {}) {
    const gcpClient = options.gcpKmsClient || null
    const wrappedClient =
      options.kmsClient ||
      (gcpClient &&
      (typeof gcpClient.asymmetricSign === 'function' ||
        typeof gcpClient.sign === 'function')
        ? {
            sign: async ({ keyVersionName, data }) => {
              if (typeof gcpClient.asymmetricSign === 'function') {
                const res = await gcpClient.asymmetricSign({
                  name: keyVersionName,
                  data,
                })
                const tuple = Array.isArray(res) ? res[0] : res
                if (tuple && typeof tuple === 'object' && !Buffer.isBuffer(tuple) && !(tuple instanceof Uint8Array)) {
                  return tuple
                }
                return tuple?.signature ?? tuple
              }
              return await gcpClient.sign({
                keyVersionName,
                data,
                algorithm: SUPPORTED_SIGNING_ALGORITHM,
              })
            },
            ...(typeof gcpClient.getPublicKey === 'function'
              ? {
                  getPublicKey: async ({ keyVersionName }) => {
                    const res = await gcpClient.getPublicKey({ name: keyVersionName })
                    const tuple = Array.isArray(res) ? res[0] : res
                    return tuple?.pem ?? tuple
                  },
                }
              : {}),
            ...(typeof gcpClient.healthCheck === 'function'
              ? {
                  healthCheck: async ({ keyVersionName }) =>
                    await gcpClient.healthCheck({ name: keyVersionName }),
                }
              : {}),
          }
        : undefined)

    super({
      ...options,
      cloudProvider: 'GCP_KMS',
      kmsClient: wrappedClient,
    })

    this._providerKind = EXTERNAL_SIGNING_PROVIDER_KINDS.GCP_KMS
    Object.freeze(this)
  }

  /**
   * Construye el descriptor de solicitud `asymmetricSign` para GCP Cloud KMS sin ejecutar llamadas de red.
   * @param {string | Buffer} canonicalPayload
   */
  buildGcpAsymmetricSignRequest(canonicalPayload) {
    if (!this._keyVersionName) {
      throw new Error(
        'PRODUCTION_KMS_KEY_VERSION_MISSING: Se requiere keyVersionName para GCP Cloud KMS'
      )
    }
    const data = Buffer.isBuffer(canonicalPayload)
      ? canonicalPayload
      : Buffer.from(String(canonicalPayload), 'utf8')
    return Object.freeze({
      name: this._keyVersionName,
      data,
    })
  }

  isRealWorldTested() {
    return PROVIDER_REAL_WORLD_TESTED
  }
}
