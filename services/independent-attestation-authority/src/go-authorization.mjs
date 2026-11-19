// @ts-check
import crypto from 'node:crypto'
import {
  PR02_P0_SCOPE,
  assertNoProhibitedSecretsInText,
  assertNoPrototypePollution,
  safeParseStrictJson,
  sha256,
} from './contract.mjs'
import { FORBIDDEN_SCOPE_TOKENS } from './attestation-policy.mjs'

export const GO_GRANT_SCHEMA_VERSION = '1.1'
export const GO_SIGNATURE_DOMAIN_SEPARATOR =
  'KIOSKOPOS_GO_AUTHORIZATION_GRANT_V1_1'
export const DEFAULT_MAX_GO_GRANT_TTL_MS = 15 * 60 * 1000 // 15 minutos
export const ALLOWED_GO_ENVIRONMENTS = Object.freeze(['HOMOLOGACION'])
export const ALLOWED_GO_SCOPES = Object.freeze([PR02_P0_SCOPE])

export const GO_GRANT_ALLOWED_KEYS = new Set([
  'schemaVersion',
  'authorizationId',
  'requestId',
  'processId',
  'executionScope',
  'environment',
  'projectRef',
  'commitSha',
  'requestSha256',
  'issuedAt',
  'notBefore',
  'expiresAt',
  'singleUse',
  'issuerAuthorityId',
  'issuerKeyId',
  'signature',
])

const PROHIBITED_GRANT_CLIENT_FIELDS = new Set([
  'trustedGoPublicKey',
  'trustedGoPublicKeySpki',
  'publicKeySpki',
  'publicKey',
  'privateKey',
  'privateKeyPem',
  'GO_APPROVED',
  'forceApproved',
  'selfSigned',
])

/**
 * Calcula el keyId canónico Ed25519 SPKI (`ed25519-spki-<16-hex>`).
 * @param {string | crypto.KeyObject} publicKeyInput
 * @returns {string}
 */
export function computeEd25519SpkiKeyId(publicKeyInput) {
  let keyObj
  try {
    keyObj =
      typeof publicKeyInput === 'string'
        ? crypto.createPublicKey(publicKeyInput)
        : publicKeyInput
  } catch {
    throw new Error(
      'GO_PUBLIC_KEY_INVALID: Clave pública GO inválida o no es SPKI PEM legible'
    )
  }

  if (!keyObj || keyObj.type !== 'public' || keyObj.asymmetricKeyType !== 'ed25519') {
    throw new Error(
      'GO_PUBLIC_KEY_INVALID: La clave pública de autoridad GO debe ser asimétrica Ed25519'
    )
  }

  const der = keyObj.export({ format: 'der', type: 'spki' })
  return `ed25519-spki-${crypto.createHash('sha256').update(der).digest('hex').slice(0, 16)}`
}

/**
 * Valida estrictamente un identificador no vacío sin ambigüedad (sin espacios extremos, saltos ni caracteres de control).
 * @param {unknown} value
 * @param {string} fieldName
 * @param {string} errorCode
 * @returns {string}
 */
function assertStrictIdentifier(value, fieldName, errorCode) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${errorCode}: ${fieldName} es obligatorio`)
  }
  if (value !== value.trim() || /[\r\n\t\x00-\x1f\x7f]/.test(value)) {
    throw new Error(
      `${errorCode}: ${fieldName} contiene espacios extremos o caracteres de control no permitidos`
    )
  }
  if (value.normalize('NFC') !== value) {
    throw new Error(
      `${errorCode}: ${fieldName} no está normalizado en forma canónica NFC`
    )
  }
  if (value.trim().length < 4) {
    throw new Error(
      `${errorCode}: ${fieldName} es demasiado corto (mínimo 4 caracteres)`
    )
  }
  return value
}

/**
 * Parsea de forma estricta un GoAuthorizationGrant v1.1 (JSON string u objeto):
 * - Rechaza claves duplicadas en JSON
 * - Rechaza prototype pollution
 * - Rechaza claves fuera de allowlist o intentos de inyectar claves públicas/autoaprobaciones
 * @param {string | Record<string, any>} rawGrantOrObj
 * @returns {Record<string, any>}
 */
export function parseStrictGoAuthorizationGrant(rawGrantOrObj) {
  let grant = rawGrantOrObj
  if (typeof grant === 'string') {
    assertNoProhibitedSecretsInText(grant.toLowerCase())
    grant = safeParseStrictJson(grant)
  } else {
    if (!grant || typeof grant !== 'object' || Array.isArray(grant)) {
      throw new Error(
        'GO_GRANT_INVALID_FORMAT: El GoAuthorizationGrant debe ser un objeto estructurado'
      )
    }
    assertNoPrototypePollution(grant)
    assertNoProhibitedSecretsInText(JSON.stringify(grant).toLowerCase())
  }

  for (const key of Object.keys(grant)) {
    if (PROHIBITED_GRANT_CLIENT_FIELDS.has(key)) {
      throw new Error(
        `UNEXPECTED_GO_GRANT_FIELD: Campo de confianza o autoaprobación prohibido en grant: '${key}'`
      )
    }
    if (!GO_GRANT_ALLOWED_KEYS.has(key)) {
      throw new Error(
        `UNEXPECTED_GO_GRANT_FIELD: Campo inesperado o no permitido en GoAuthorizationGrant: '${key}'`
      )
    }
  }

  return grant
}

/**
 * Serializa de forma determinística el payload firmable de GoAuthorizationGrant v1.1 (sin `signature`).
 * @param {Record<string, any>} grant
 * @returns {string}
 */
export function serializeCanonicalGoGrantPayload(grant) {
  if (!grant || typeof grant !== 'object' || Array.isArray(grant)) {
    throw new Error(
      'GO_GRANT_INVALID_FORMAT: Se requiere objeto estructurado para serialización canónica'
    )
  }

  const canonical = {
    schemaVersion: grant.schemaVersion,
    authorizationId: grant.authorizationId,
    ...(grant.issuerAuthorityId !== undefined
      ? { issuerAuthorityId: grant.issuerAuthorityId }
      : {}),
    issuerKeyId: grant.issuerKeyId,
    requestId: grant.requestId,
    processId: grant.processId,
    executionScope: grant.executionScope,
    environment: grant.environment,
    projectRef: grant.projectRef,
    commitSha:
      typeof grant.commitSha === 'string' ? grant.commitSha.toLowerCase() : '',
    requestSha256:
      typeof grant.requestSha256 === 'string'
        ? grant.requestSha256.toLowerCase()
        : '',
    issuedAt: grant.issuedAt,
    ...(grant.notBefore !== undefined ? { notBefore: grant.notBefore } : {}),
    expiresAt: grant.expiresAt,
    singleUse: grant.singleUse,
  }

  return JSON.stringify(canonical)
}

/**
 * Construye el mensaje exacto con separación de dominio para firma/verificación Ed25519 del grant GO.
 * Impide que una firma de AttestationResponse sustituya a una firma de GoAuthorizationGrant o viceversa.
 * @param {Record<string, any>} grant
 * @returns {Buffer}
 */
export function buildDomainSeparatedGoGrantSigningBytes(grant) {
  const canonicalJson = serializeCanonicalGoGrantPayload(grant)
  return Buffer.from(`${GO_SIGNATURE_DOMAIN_SEPARATOR}\n${canonicalJson}`, 'utf8')
}

/**
 * Calcula el SHA-256 canónico del payload del grant GO (sin signature).
 * @param {Record<string, any>} grant
 * @returns {string}
 */
export function computeGoGrantDigest(grant) {
  return sha256(serializeCanonicalGoGrantPayload(grant))
}

/**
 * Valida estructura, fechas, alcance, vinculación, separación de autoridades y firma Ed25519
 * de un GoAuthorizationGrant v1.1 contra una clave pública GO confiable de servidor.
 *
 * Nunca acepta claves públicas enviadas por el solicitante como raíz de confianza.
 *
 * @param {string | Record<string, any>} rawGrantOrObj
 * @param {{
 *   trustedGoPublicKeySpki: string | crypto.KeyObject,
 *   trustedGoKeyId?: string | null,
 *   trustedGoAuthorityId?: string | null,
 *   requestPkg?: Record<string, any>,
 *   expectedProjectRef?: string | null,
 *   expectedCommitSha?: string | null,
 *   attestationAuthorityId?: string | null,
 *   attestationKeyId?: string | null,
 *   attestationPublicKeySpki?: string | null,
 *   now?: Date | string | number,
 *   maxTtlMs?: number,
 *   clockSkewMs?: number
 * }} options
 */
export function verifyGoAuthorizationGrant(rawGrantOrObj, options) {
  if (!options || !options.trustedGoPublicKeySpki) {
    throw new Error(
      'GO_TRUST_ANCHOR_REQUIRED: Se requiere trustedGoPublicKeySpki configurada en servidor para verificar GoAuthorizationGrant'
    )
  }

  const grant = parseStrictGoAuthorizationGrant(rawGrantOrObj)

  if (grant.schemaVersion !== GO_GRANT_SCHEMA_VERSION) {
    throw new Error(
      `GO_AUTHORIZATION_SCHEMA_INVALID: schemaVersion de GoAuthorizationGrant debe ser '${GO_GRANT_SCHEMA_VERSION}', recibido '${grant.schemaVersion}'`
    )
  }

  if (grant.singleUse !== true) {
    throw new Error(
      'GO_AUTHORIZATION_SINGLE_USE_REQUIRED: singleUse debe ser estrictamente true'
    )
  }

  const authorizationId = assertStrictIdentifier(
    grant.authorizationId,
    'authorizationId',
    'GO_AUTHORIZATION_ID_INVALID'
  )
  const requestId = assertStrictIdentifier(
    grant.requestId,
    'requestId',
    'GO_AUTHORIZATION_REQUEST_INVALID'
  )
  const processId = assertStrictIdentifier(
    grant.processId,
    'processId',
    'GO_AUTHORIZATION_PROCESS_INVALID'
  )
  const projectRef = assertStrictIdentifier(
    grant.projectRef,
    'projectRef',
    'GO_AUTHORIZATION_PROJECT_INVALID'
  )
  const issuerKeyId = assertStrictIdentifier(
    grant.issuerKeyId,
    'issuerKeyId',
    'GO_AUTHORIZATION_KEY_ID_INVALID'
  )

  if (!/^ed25519-spki-[0-9a-f]{16}$/.test(issuerKeyId)) {
    throw new Error(
      `GO_AUTHORIZATION_KEY_ID_INVALID: issuerKeyId '${issuerKeyId}' debe tener formato canónico 'ed25519-spki-<16-hex>'`
    )
  }

  const issuerAuthorityId = assertStrictIdentifier(
    grant.issuerAuthorityId,
    'issuerAuthorityId',
    'GO_AUTHORIZATION_ISSUER_INVALID'
  )

  // Validar scope contra allowlist y tokens prohibidos
  const scope = grant.executionScope
  if (typeof scope !== 'string' || !ALLOWED_GO_SCOPES.includes(scope)) {
    throw new Error(
      `GO_AUTHORIZATION_SCOPE_MISMATCH: executionScope '${scope}' no autorizado en GoAuthorizationGrant`
    )
  }
  for (const forbidden of FORBIDDEN_SCOPE_TOKENS) {
    if (
      scope.toUpperCase().includes(forbidden) &&
      scope !== PR02_P0_SCOPE
    ) {
      throw new Error(
        `GO_AUTHORIZATION_SCOPE_FORBIDDEN: executionScope contiene token prohibido '${forbidden}'`
      )
    }
  }

  // Validar environment
  if (
    typeof grant.environment !== 'string' ||
    !ALLOWED_GO_ENVIRONMENTS.includes(grant.environment)
  ) {
    throw new Error(
      `GO_AUTHORIZATION_ENVIRONMENT_MISMATCH: environment '${grant.environment}' no permitido en GoAuthorizationGrant`
    )
  }

  // Validar commitSha y requestSha256 (hex estricto minúsculas)
  if (
    typeof grant.commitSha !== 'string' ||
    !/^[0-9a-f]{40}$/.test(grant.commitSha)
  ) {
    throw new Error(
      'GO_AUTHORIZATION_COMMIT_INVALID: commitSha debe ser hexadecimal de 40 caracteres en minúsculas'
    )
  }
  if (
    typeof grant.requestSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(grant.requestSha256)
  ) {
    throw new Error(
      'GO_AUTHORIZATION_DIGEST_INVALID: requestSha256 debe ser hexadecimal de 64 caracteres en minúsculas'
    )
  }

  // Validar fechas y coherencia temporal
  if (
    typeof grant.issuedAt !== 'string' ||
    !Number.isFinite(Date.parse(grant.issuedAt))
  ) {
    throw new Error(
      'GO_AUTHORIZATION_INVALID_DATES: issuedAt inválido en GoAuthorizationGrant'
    )
  }
  if (
    typeof grant.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(grant.expiresAt))
  ) {
    throw new Error(
      'GO_AUTHORIZATION_INVALID_DATES: expiresAt inválido en GoAuthorizationGrant'
    )
  }

  const issuedAtMs = Date.parse(grant.issuedAt)
  const expiresAtMs = Date.parse(grant.expiresAt)
  let notBeforeMs = issuedAtMs

  if (grant.notBefore !== undefined) {
    if (
      typeof grant.notBefore !== 'string' ||
      !Number.isFinite(Date.parse(grant.notBefore))
    ) {
      throw new Error(
        'GO_AUTHORIZATION_INVALID_DATES: notBefore inválido en GoAuthorizationGrant'
      )
    }
    notBeforeMs = Date.parse(grant.notBefore)
    if (notBeforeMs < issuedAtMs) {
      throw new Error(
        'GO_AUTHORIZATION_INVALID_DATES: notBefore no puede ser anterior a issuedAt'
      )
    }
  }

  if (expiresAtMs <= issuedAtMs || expiresAtMs <= notBeforeMs) {
    throw new Error(
      'GO_AUTHORIZATION_INVALID_DATES: expiresAt debe ser estrictamente posterior a issuedAt y notBefore'
    )
  }

  const maxTtlMs =
    typeof options.maxTtlMs === 'number' && options.maxTtlMs > 0
      ? options.maxTtlMs
      : DEFAULT_MAX_GO_GRANT_TTL_MS
  if (expiresAtMs - issuedAtMs > maxTtlMs) {
    throw new Error(
      `GO_AUTHORIZATION_TTL_EXCEEDED: La vigencia del grant (${expiresAtMs - issuedAtMs}ms) supera el máximo permitido (${maxTtlMs}ms)`
    )
  }

  const nowMs =
    options.now !== undefined
      ? typeof options.now === 'number'
        ? options.now
        : Date.parse(String(options.now))
      : Date.now()
  if (!Number.isFinite(nowMs)) {
    throw new Error(
      'GO_AUTHORIZATION_CLOCK_INVALID: Reloj de referencia inválido al verificar vigencia'
    )
  }

  const clockSkewMs =
    typeof options.clockSkewMs === 'number' && options.clockSkewMs >= 0
      ? options.clockSkewMs
      : 0

  if (nowMs + clockSkewMs < notBeforeMs) {
    throw new Error(
      `GO_AUTHORIZATION_NOT_YET_VALID: El grant aún no es válido (vigente desde ${new Date(notBeforeMs).toISOString()})`
    )
  }

  if (nowMs - clockSkewMs >= expiresAtMs) {
    throw new Error(
      `GO_AUTHORIZATION_EXPIRED: El GoAuthorizationGrant expiró en ${grant.expiresAt}`
    )
  }

  // Validar separación de dominio y confianza de clave pública GO
  const trustedKeyIdDerived = computeEd25519SpkiKeyId(
    options.trustedGoPublicKeySpki
  )
  const trustedPubObj =
    typeof options.trustedGoPublicKeySpki === 'string'
      ? crypto.createPublicKey(options.trustedGoPublicKeySpki)
      : options.trustedGoPublicKeySpki

  if (
    options.trustedGoKeyId &&
    options.trustedGoKeyId !== trustedKeyIdDerived
  ) {
    throw new Error(
      `GO_AUTHORIZATION_KEY_ID_MISMATCH: El trustedGoKeyId configurado ('${options.trustedGoKeyId}') no coincide con la clave pública GO (${trustedKeyIdDerived})`
    )
  }

  if (issuerKeyId !== trustedKeyIdDerived) {
    throw new Error(
      `GO_AUTHORIZATION_KEY_ID_MISMATCH: issuerKeyId del grant ('${issuerKeyId}') no coincide con la clave pública GO confiable (${trustedKeyIdDerived})`
    )
  }

  if (
    options.trustedGoAuthorityId &&
    issuerAuthorityId &&
    issuerAuthorityId !== options.trustedGoAuthorityId
  ) {
    throw new Error(
      `GO_AUTHORIZATION_ISSUER_MISMATCH: issuerAuthorityId '${issuerAuthorityId}' no coincide con '${options.trustedGoAuthorityId}'`
    )
  }

  // Separación estricta entre Autoridad GO y Autoridad de Atestación
  if (
    options.attestationKeyId &&
    (issuerKeyId === options.attestationKeyId ||
      trustedKeyIdDerived === options.attestationKeyId)
  ) {
    throw new Error(
      'COLLAPSED_AUTHORITIES_REJECTED: La clave del GoAuthorizationGrant coincide con la clave de la Autoridad de Atestación'
    )
  }

  if (options.attestationPublicKeySpki) {
    const attDer = crypto
      .createPublicKey(options.attestationPublicKeySpki)
      .export({ format: 'der', type: 'spki' })
    const goDer = trustedPubObj.export({ format: 'der', type: 'spki' })
    if (attDer.equals(goDer)) {
      throw new Error(
        'COLLAPSED_AUTHORITIES_REJECTED: La clave pública de GO Authority es idéntica a la clave de Attestation Authority'
      )
    }
  }

  if (
    options.attestationAuthorityId &&
    (authorizationId.toLowerCase() ===
      options.attestationAuthorityId.toLowerCase() ||
      (issuerAuthorityId &&
        issuerAuthorityId.toLowerCase() ===
          options.attestationAuthorityId.toLowerCase()))
  ) {
    throw new Error(
      'COLLAPSED_AUTHORITIES_REJECTED: La identidad de autorización GO colapsa con la Autoridad de Atestación'
    )
  }

  // Validar vinculación con configuración esperada del servidor (proyecto / commit)
  if (options.expectedProjectRef && projectRef !== options.expectedProjectRef) {
    throw new Error(
      `GO_AUTHORIZATION_PROJECT_MISMATCH: projectRef '${projectRef}' no coincide con proyecto esperado '${options.expectedProjectRef}'`
    )
  }

  if (
    options.expectedCommitSha &&
    grant.commitSha !== String(options.expectedCommitSha).toLowerCase()
  ) {
    throw new Error(
      `GO_AUTHORIZATION_COMMIT_MISMATCH: commitSha '${grant.commitSha}' no coincide con commit esperado '${options.expectedCommitSha}'`
    )
  }

  // Validar vinculación exacta con el AttestationRequestPackage
  if (options.requestPkg) {
    const req = options.requestPkg
    if (req.authorizationId !== authorizationId) {
      throw new Error(
        `GO_AUTHORIZATION_REQUEST_MISMATCH: authorizationId del request ('${req.authorizationId}') no coincide con el grant ('${authorizationId}')`
      )
    }
    if (req.requestId !== requestId) {
      throw new Error(
        `GO_AUTHORIZATION_REQUEST_MISMATCH: requestId del request ('${req.requestId}') no coincide con el grant ('${requestId}')`
      )
    }
    if (req.processId !== processId) {
      throw new Error(
        `GO_AUTHORIZATION_REQUEST_MISMATCH: processId del request ('${req.processId}') no coincide con el grant ('${processId}')`
      )
    }
    if (req.executionScope !== scope) {
      throw new Error(
        `GO_AUTHORIZATION_SCOPE_MISMATCH: executionScope del request ('${req.executionScope}') no coincide con el grant ('${scope}')`
      )
    }
    if (req.environment !== grant.environment) {
      throw new Error(
        `GO_AUTHORIZATION_ENVIRONMENT_MISMATCH: environment del request ('${req.environment}') no coincide con el grant ('${grant.environment}')`
      )
    }
    if (req.commitSha !== grant.commitSha) {
      throw new Error(
        `GO_AUTHORIZATION_COMMIT_MISMATCH: commitSha del request ('${req.commitSha}') no coincide con el grant ('${grant.commitSha}')`
      )
    }
    if (req.requestSha256 !== grant.requestSha256) {
      throw new Error(
        `GO_AUTHORIZATION_DIGEST_MISMATCH: requestSha256 del request ('${req.requestSha256}') no coincide con el grant ('${grant.requestSha256}')`
      )
    }
    if (req.projectRef !== undefined && req.projectRef !== projectRef) {
      throw new Error(
        `GO_AUTHORIZATION_PROJECT_MISMATCH: projectRef del request ('${req.projectRef}') no coincide con el grant ('${projectRef}')`
      )
    }
  }

  // Validar formato y verificación criptográfica Ed25519 con separación de dominio
  if (
    typeof grant.signature !== 'string' ||
    !/^[0-9a-f]{128}$/.test(grant.signature)
  ) {
    throw new Error(
      'GO_AUTHORIZATION_SIGNATURE_INVALID: La firma del GoAuthorizationGrant debe ser hexadecimal Ed25519 de 128 caracteres en minúsculas'
    )
  }

  const signingBytes = buildDomainSeparatedGoGrantSigningBytes(grant)
  const verified = crypto.verify(
    null,
    signingBytes,
    trustedPubObj,
    Buffer.from(grant.signature, 'hex')
  )

  if (!verified) {
    throw new Error(
      'GO_AUTHORIZATION_SIGNATURE_INVALID: La firma criptográfica Ed25519 del GoAuthorizationGrant es inválida o el grant fue alterado'
    )
  }

  return Object.freeze({
    valid: true,
    schemaVersion: GO_GRANT_SCHEMA_VERSION,
    authorizationId,
    issuerAuthorityId,
    issuerKeyId,
    requestId,
    processId,
    executionScope: scope,
    environment: grant.environment,
    projectRef,
    commitSha: grant.commitSha,
    requestSha256: grant.requestSha256,
    issuedAt: grant.issuedAt,
    notBefore: grant.notBefore || grant.issuedAt,
    expiresAt: grant.expiresAt,
    grantSha256: computeGoGrantDigest(grant),
  })
}

/**
 * Emisor GO aislado exclusivamente para pruebas locales (con claves efímeras).
 * Separado explícitamente de AttestationSigningProvider y prohibido en runtime POS de producción.
 * NOTA: La separación entre clases/procesos de prueba NO demuestra independencia operativa real en nube.
 */
export class TestOnlyGoAuthorityIssuer {
  /**
   * @param {{
   *   authorityId?: string,
   *   privateKey?: crypto.KeyObject,
   *   publicKey?: crypto.KeyObject,
   *   forbiddenAttestationKeyId?: string | null,
   *   forbiddenAttestationPublicKeySpki?: string | null
   * }} [options]
   */
  constructor(options = {}) {
    this._issuerScope = 'TEST_ONLY'
    this._isProductionGoAuthority = false
    this._authorityId =
      options.authorityId || 'test-go-governance-authority-v1'

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
    this._keyId = computeEd25519SpkiKeyId(this._publicKey)

    if (
      options.forbiddenAttestationKeyId &&
      options.forbiddenAttestationKeyId === this._keyId
    ) {
      throw new Error(
        'COLLAPSED_AUTHORITIES_REJECTED: El emisor GO no puede reutilizar el keyId de la Autoridad de Atestación'
      )
    }

    if (options.forbiddenAttestationPublicKeySpki) {
      const attDer = crypto
        .createPublicKey(options.forbiddenAttestationPublicKeySpki)
        .export({ format: 'der', type: 'spki' })
      const goDer = this._publicKey.export({ format: 'der', type: 'spki' })
      if (attDer.equals(goDer)) {
        throw new Error(
          'COLLAPSED_AUTHORITIES_REJECTED: El emisor GO no puede compartir clave pública con la Autoridad de Atestación'
        )
      }
    }

    Object.freeze(this)
  }

  get issuerScope() {
    return this._issuerScope
  }

  get isProductionGoAuthority() {
    return this._isProductionGoAuthority
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

  /**
   * Emite un GoAuthorizationGrant v1.1 firmado para pruebas locales.
   * @param {{
   *   authorizationId?: string,
   *   requestId: string,
   *   processId: string,
   *   executionScope?: string,
   *   environment?: string,
   *   projectRef: string,
   *   commitSha: string,
   *   requestSha256: string,
   *   issuedAt?: string,
   *   notBefore?: string,
   *   expiresAt?: string,
   *   ttlMs?: number,
   *   now?: Date | string | number
   * }} params
   */
  issueGrant(params) {
    if (!params || typeof params !== 'object') {
      throw new Error(
        'GO_GRANT_ISSUE_PARAMS_REQUIRED: Se requieren parámetros estructurados para emitir un GoAuthorizationGrant'
      )
    }

    const baseNowMs =
      params.now !== undefined
        ? typeof params.now === 'number'
          ? params.now
          : Date.parse(String(params.now))
        : params.issuedAt
          ? Date.parse(params.issuedAt)
          : Date.now()

    const issuedAt = params.issuedAt || new Date(baseNowMs).toISOString()
    const ttlMs =
      typeof params.ttlMs === 'number' ? params.ttlMs : 5 * 60 * 1000
    const expiresAt =
      params.expiresAt || new Date(Date.parse(issuedAt) + ttlMs).toISOString()

    const draft = {
      schemaVersion: GO_GRANT_SCHEMA_VERSION,
      authorizationId:
        params.authorizationId || `go-grant-${crypto.randomUUID()}`,
      issuerAuthorityId: this._authorityId,
      issuerKeyId: this._keyId,
      requestId: params.requestId,
      processId: params.processId,
      executionScope: params.executionScope ?? PR02_P0_SCOPE,
      environment: params.environment ?? 'HOMOLOGACION',
      projectRef: params.projectRef,
      commitSha:
        typeof params.commitSha === 'string'
          ? params.commitSha.toLowerCase()
          : params.commitSha,
      requestSha256:
        typeof params.requestSha256 === 'string'
          ? params.requestSha256.toLowerCase()
          : params.requestSha256,
      issuedAt,
      ...(params.notBefore !== undefined
        ? { notBefore: params.notBefore }
        : {}),
      expiresAt,
      singleUse: true,
    }

    const signingBytes = buildDomainSeparatedGoGrantSigningBytes(draft)
    const signature = crypto
      .sign(null, signingBytes, this._privateKey)
      .toString('hex')

    return Object.freeze({
      ...draft,
      signature,
    })
  }
}
