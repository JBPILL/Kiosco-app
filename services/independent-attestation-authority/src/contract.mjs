// @ts-check
import crypto from 'node:crypto'

export const CONTRACT_VERSION = '1.0'
export const SCHEMA_VERSION = '1.0'
export const PR02_P0_SCOPE = 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'
export const PR02_P0_COLECTOR_IDENTIDAD =
  'scripts/fiscal/execute-pr02-p0-official-evidence.mjs'
export const ALLOWED_SIGNATURE_ALGORITHM = 'Ed25519'
export const MAX_JSON_NESTING_DEPTH = 8

export const PROHIBITED_PAYLOAD_FIELDS = Object.freeze([
  '"token":',
  '"sign":',
  'loginticket',
  'cmsbase64',
  'mock_cms',
  'privatekey',
  'private key',
  '-----begin',
  'password',
  'service_role',
  'anon_key',
  'secret',
])

export const PROHIBITED_JSON_PROPERTY_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype',
])

export const ATTESTATION_REQUEST_ALLOWED_KEYS = new Set([
  'schemaVersion',
  'requestId',
  'processId',
  'executionScope',
  'commitSha',
  'environment',
  'authorizationId',
  'goAuthorizationDocumentSha256',
  'manifestSha256',
  'rawSoapArtifacts',
  'normalizedArtifacts',
  'consultadoEn',
  'requestedAt',
  'collectorIdentity',
  'requestSha256',
  'canonicalPayloadSha256',
])

export const ARTIFACT_ALLOWED_KEYS = new Set(['name', 'sha256'])

/**
 * Calcula el digest SHA-256 en hexadecimal minúsculas.
 * @param {string | Buffer} input
 * @returns {string}
 */
export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

/**
 * Analiza y valida un string JSON de forma estricta y fail-closed:
 * - Rechaza cuerpo vacío
 * - Rechaza profundidad excesiva (> maxDepth)
 * - Rechaza claves duplicadas en un mismo objeto
 * - Rechaza claves de prototype pollution (__proto__, constructor, prototype)
 * @param {string} rawText
 * @param {{ maxDepth?: number }} [options]
 * @returns {Record<string, any>}
 */
export function safeParseStrictJson(rawText, options = {}) {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new Error(
      'ATTESTATION_REQUEST_EMPTY_BODY: El cuerpo de la solicitud no puede estar vacío'
    )
  }

  const maxDepth =
    typeof options.maxDepth === 'number' && options.maxDepth > 0
      ? options.maxDepth
      : MAX_JSON_NESTING_DEPTH

  let pos = 0
  const len = rawText.length

  function skipWs() {
    while (pos < len) {
      const c = rawText.charCodeAt(pos)
      if (c === 32 || c === 9 || c === 10 || c === 13) pos++
      else break
    }
  }

  function parseStringLiteral() {
    if (rawText[pos] !== '"') {
      throw new Error('ATTESTATION_REQUEST_INVALID_JSON: Se esperaba string')
    }
    const start = pos
    pos++
    while (pos < len) {
      const ch = rawText[pos]
      if (ch === '\\') {
        pos += 2
        if (pos > len) {
          throw new Error('ATTESTATION_REQUEST_INVALID_JSON: Escape incompleto')
        }
        continue
      }
      if (ch === '"') {
        pos++
        return JSON.parse(rawText.slice(start, pos))
      }
      if (rawText.charCodeAt(pos) < 0x20) {
        throw new Error(
          'ATTESTATION_REQUEST_INVALID_JSON: Carácter de control no permitido en string'
        )
      }
      pos++
    }
    throw new Error('ATTESTATION_REQUEST_INVALID_JSON: String sin cerrar')
  }

  function parseValue(depth) {
    if (depth > maxDepth) {
      throw new Error(
        `JSON_MAX_DEPTH_EXCEEDED: Profundidad de JSON excede el máximo permitido (${maxDepth})`
      )
    }
    skipWs()
    if (pos >= len) {
      throw new Error('ATTESTATION_REQUEST_INVALID_JSON: Fin inesperado de entrada')
    }
    const ch = rawText[pos]
    if (ch === '{') return parseObject(depth)
    if (ch === '[') return parseArray(depth)
    if (ch === '"') return parseStringLiteral()
    if (ch === 't' && rawText.startsWith('true', pos)) {
      pos += 4
      return true
    }
    if (ch === 'f' && rawText.startsWith('false', pos)) {
      pos += 5
      return false
    }
    if (ch === 'n' && rawText.startsWith('null', pos)) {
      pos += 4
      return null
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      const numMatch = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
        rawText.slice(pos)
      )
      if (!numMatch) {
        throw new Error('ATTESTATION_REQUEST_INVALID_JSON: Número inválido')
      }
      pos += numMatch[0].length
      return Number(numMatch[0])
    }
    throw new Error(
      `ATTESTATION_REQUEST_INVALID_JSON: Token inesperado '${ch}' en posición ${pos}`
    )
  }

  function parseArray(depth) {
    pos++ // '['
    const arr = []
    skipWs()
    if (rawText[pos] === ']') {
      pos++
      return arr
    }
    while (true) {
      arr.push(parseValue(depth + 1))
      skipWs()
      if (rawText[pos] === ',') {
        pos++
        continue
      }
      if (rawText[pos] === ']') {
        pos++
        return arr
      }
      throw new Error('ATTESTATION_REQUEST_INVALID_JSON: Array malformado')
    }
  }

  function parseObject(depth) {
    pos++ // '{'
    const obj = {}
    const seenKeys = new Set()
    skipWs()
    if (rawText[pos] === '}') {
      pos++
      return obj
    }
    while (true) {
      skipWs()
      if (rawText[pos] !== '"') {
        throw new Error(
          'ATTESTATION_REQUEST_INVALID_JSON: Se esperaba clave string en objeto'
        )
      }
      const key = parseStringLiteral()
      if (PROHIBITED_JSON_PROPERTY_NAMES.has(key)) {
        throw new Error(
          `PROTOTYPE_POLLUTION_REJECTED: Propiedad prohibida '${key}' detectada en JSON`
        )
      }
      if (seenKeys.has(key)) {
        throw new Error(
          `DUPLICATE_JSON_KEY_REJECTED: Clave JSON duplicada '${key}' no permitida`
        )
      }
      seenKeys.add(key)

      skipWs()
      if (rawText[pos] !== ':') {
        throw new Error(
          "ATTESTATION_REQUEST_INVALID_JSON: Se esperaba ':' después de clave"
        )
      }
      pos++
      const val = parseValue(depth + 1)
      Object.defineProperty(obj, key, {
        value: val,
        writable: true,
        enumerable: true,
        configurable: true,
      })

      skipWs()
      if (rawText[pos] === ',') {
        pos++
        continue
      }
      if (rawText[pos] === '}') {
        pos++
        return obj
      }
      throw new Error('ATTESTATION_REQUEST_INVALID_JSON: Objeto malformado')
    }
  }

  const root = parseValue(0)
  skipWs()
  if (pos !== len) {
    throw new Error(
      'ATTESTATION_REQUEST_INVALID_JSON: Contenido inesperado tras el fin del JSON'
    )
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    throw new Error(
      'ATTESTATION_REQUEST_INVALID_FORMAT: El payload debe ser un objeto JSON estructurado'
    )
  }
  return root
}

/**
 * Verifica recursivamente objetos ya parseados contra prototype pollution y profundidad excesiva.
 * Nota: Si un objeto literal en JS contiene `{ ['__proto__']: ... }` o JSON parseado externamente
 * conserva propiedades peligrosas, falla cerrado inmediatamente.
 * @param {unknown} value
 * @param {number} [depth]
 * @param {number} [maxDepth]
 */
export function assertNoPrototypePollution(
  value,
  depth = 0,
  maxDepth = MAX_JSON_NESTING_DEPTH
) {
  if (depth > maxDepth) {
    throw new Error(
      `JSON_MAX_DEPTH_EXCEEDED: Profundidad de objeto excede el máximo permitido (${maxDepth})`
    )
  }
  if (value === null || typeof value !== 'object') {
    return
  }

  // Verificar que el prototipo no haya sido alterado
  const proto = Object.getPrototypeOf(value)
  if (Array.isArray(value)) {
    if (proto !== Array.prototype) {
      throw new Error(
        'PROTOTYPE_POLLUTION_REJECTED: Prototipo de Array alterado'
      )
    }
    for (let i = 0; i < value.length; i++) {
      assertNoPrototypePollution(value[i], depth + 1, maxDepth)
    }
    return
  }

  if (proto !== Object.prototype && proto !== null) {
    throw new Error(
      'PROTOTYPE_POLLUTION_REJECTED: Prototipo de objeto no estándar rechazado'
    )
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    if (PROHIBITED_JSON_PROPERTY_NAMES.has(key)) {
      throw new Error(
        `PROTOTYPE_POLLUTION_REJECTED: Propiedad prohibida '${key}' detectada en objeto`
      )
    }
    assertNoPrototypePollution(
      /** @type {Record<string, unknown>} */ (value)[key],
      depth + 1,
      maxDepth
    )
  }
}

/**
 * Serialización canónica determinística de AttestationRequestPackage (Contrato v1.0).
 * Debe coincidir byte a byte con el calculador del cliente POS.
 * @param {Record<string, any>} pkg
 * @returns {string}
 */
export function serializeCanonicalAttestationRequest(pkg) {
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    throw new Error(
      'ATTESTATION_REQUEST_INVALID: Se requiere objeto estructurado de solicitud de atestación'
    )
  }
  const canonical = {
    schemaVersion: pkg.schemaVersion,
    requestId: pkg.requestId,
    processId: pkg.processId,
    executionScope: pkg.executionScope,
    commitSha: pkg.commitSha ? String(pkg.commitSha).toLowerCase() : '',
    environment: pkg.environment,
    authorizationId: pkg.authorizationId,
    goAuthorizationDocumentSha256: pkg.goAuthorizationDocumentSha256
      ? String(pkg.goAuthorizationDocumentSha256).toLowerCase()
      : '',
    manifestSha256: pkg.manifestSha256
      ? String(pkg.manifestSha256).toLowerCase()
      : '',
    rawSoapArtifacts: Array.isArray(pkg.rawSoapArtifacts)
      ? pkg.rawSoapArtifacts.map((a) => ({
          name: a && a.name ? String(a.name) : '',
          sha256: a && a.sha256 ? String(a.sha256).toLowerCase() : '',
        }))
      : [],
    normalizedArtifacts: Array.isArray(pkg.normalizedArtifacts)
      ? pkg.normalizedArtifacts.map((a) => ({
          name: a && a.name ? String(a.name) : '',
          sha256: a && a.sha256 ? String(a.sha256).toLowerCase() : '',
        }))
      : [],
    consultadoEn: pkg.consultadoEn,
    requestedAt: pkg.requestedAt,
    collectorIdentity: pkg.collectorIdentity,
  }
  return JSON.stringify(canonical)
}

/**
 * Digest SHA-256 de AttestationRequestPackage.
 * @param {Record<string, any>} pkg
 * @returns {string}
 */
export function computeAttestationRequestDigest(pkg) {
  return sha256(serializeCanonicalAttestationRequest(pkg))
}

/**
 * Serialización canónica determinística de AttestationResponse (Contrato v1.0).
 * Debe coincidir byte a byte con el verificador del cliente POS.
 * @param {Record<string, any>} res
 * @returns {string}
 */
export function serializeCanonicalAttestationResponsePayload(res) {
  if (!res || typeof res !== 'object' || Array.isArray(res)) {
    throw new Error(
      'ATTESTATION_RESPONSE_INVALID: Se requiere objeto estructurado de respuesta de atestación'
    )
  }
  const canonical = {
    schemaVersion: res.schemaVersion,
    responseId: res.responseId || res.attestationId,
    authorityType: res.authorityType,
    authorityId: res.authorityId,
    keyId: res.keyId,
    algorithm: res.algorithm,
    requestId: res.requestId,
    requestSha256: res.requestSha256 ? String(res.requestSha256) : '',
    manifestSha256: res.manifestSha256 ? String(res.manifestSha256) : '',
    processId: res.processId,
    executionScope: res.executionScope,
    commitSha: res.commitSha ? String(res.commitSha) : '',
    environment: res.environment,
    authorizationId: res.authorizationId,
    goAuthorizationDocumentSha256: res.goAuthorizationDocumentSha256
      ? String(res.goAuthorizationDocumentSha256)
      : '',
    rawSoapArtifacts: Array.isArray(res.rawSoapArtifacts)
      ? res.rawSoapArtifacts.map((a) => ({
          name: a && a.name ? String(a.name) : '',
          sha256: a && a.sha256 ? String(a.sha256) : '',
        }))
      : [],
    normalizedArtifacts: Array.isArray(res.normalizedArtifacts)
      ? res.normalizedArtifacts.map((a) => ({
          name: a && a.name ? String(a.name) : '',
          sha256: a && a.sha256 ? String(a.sha256) : '',
        }))
      : [],
    consultadoEn: res.consultadoEn,
    issuedAt: res.issuedAt,
    ...(res.expiresAt !== undefined && res.expiresAt !== null
      ? { expiresAt: res.expiresAt }
      : {}),
    signerOrigin: res.signerOrigin,
  }
  return JSON.stringify(canonical)
}

/**
 * Digest SHA-256 del payload de respuesta canónico.
 * @param {Record<string, any>} res
 * @returns {string}
 */
export function computeAttestationResponsePayloadDigest(res) {
  return sha256(serializeCanonicalAttestationResponsePayload(res))
}

/**
 * Escanea string u objeto contra patrones de secretos prohibidos.
 * @param {string} serializedLower
 */
export function assertNoProhibitedSecretsInText(serializedLower) {
  for (const forbidden of PROHIBITED_PAYLOAD_FIELDS) {
    if (serializedLower.includes(forbidden)) {
      throw new Error(
        `PROHIBITED_SECRET_DETECTED: La solicitud de atestación contiene material sensible prohibido ('${forbidden}')`
      )
    }
  }
}

/**
 * Validación estricta, sin confianza en el cliente y fail-closed del AttestationRequestPackage.
 * @param {Record<string, any>} pkg
 * @returns {{ valid: true, requestSha256: string }}
 */
export function validateAttestationRequestStrict(pkg) {
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    throw new Error(
      'ATTESTATION_REQUEST_INVALID: Se requiere un paquete de solicitud de atestación válido'
    )
  }

  assertNoPrototypePollution(pkg)

  // Allowlist estricta de propiedades de nivel superior
  for (const key of Object.keys(pkg)) {
    if (!ATTESTATION_REQUEST_ALLOWED_KEYS.has(key)) {
      throw new Error(
        `UNEXPECTED_REQUEST_FIELD: Campo inesperado o no permitido en solicitud de atestación: '${key}'`
      )
    }
  }

  assertNoProhibitedSecretsInText(JSON.stringify(pkg).toLowerCase())

  if (pkg.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `ATTESTATION_REQUEST_SCHEMA_INVALID: schemaVersion debe ser '${SCHEMA_VERSION}', recibido '${pkg.schemaVersion}'`
    )
  }
  if (
    !pkg.requestId ||
    typeof pkg.requestId !== 'string' ||
    pkg.requestId.trim().length === 0
  ) {
    throw new Error(
      'ATTESTATION_REQUEST_ID_REQUIRED: Se requiere requestId no vacío'
    )
  }
  if (
    !pkg.processId ||
    typeof pkg.processId !== 'string' ||
    pkg.processId.trim().length === 0
  ) {
    throw new Error(
      'ATTESTATION_REQUEST_PROCESS_ID_REQUIRED: Se requiere processId no vacío'
    )
  }
  if (pkg.executionScope !== PR02_P0_SCOPE) {
    throw new Error(
      `ATTESTATION_REQUEST_SCOPE_MISMATCH: executionScope debe ser '${PR02_P0_SCOPE}', recibido '${pkg.executionScope}'`
    )
  }
  if (
    !pkg.commitSha ||
    typeof pkg.commitSha !== 'string' ||
    !/^[0-9a-f]{40}$/.test(pkg.commitSha)
  ) {
    throw new Error(
      'ATTESTATION_REQUEST_COMMIT_INVALID: commitSha debe ser un hash hexadecimal de 40 caracteres en minúsculas'
    )
  }
  if (pkg.environment !== 'HOMOLOGACION') {
    throw new Error(
      `ATTESTATION_REQUEST_ENVIRONMENT_MISMATCH: environment debe ser 'HOMOLOGACION', recibido '${pkg.environment}'`
    )
  }
  if (
    !pkg.authorizationId ||
    typeof pkg.authorizationId !== 'string' ||
    pkg.authorizationId.trim().length === 0
  ) {
    throw new Error(
      'ATTESTATION_REQUEST_AUTH_ID_REQUIRED: Se requiere authorizationId vinculado al GO'
    )
  }
  if (
    !pkg.goAuthorizationDocumentSha256 ||
    typeof pkg.goAuthorizationDocumentSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(pkg.goAuthorizationDocumentSha256)
  ) {
    throw new Error(
      'ATTESTATION_REQUEST_GO_SHA_INVALID: goAuthorizationDocumentSha256 debe ser un SHA-256 de 64 caracteres hexadecimales'
    )
  }
  if (
    !pkg.manifestSha256 ||
    typeof pkg.manifestSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(pkg.manifestSha256)
  ) {
    throw new Error(
      'ATTESTATION_REQUEST_MANIFEST_SHA_INVALID: manifestSha256 debe ser un SHA-256 de 64 caracteres hexadecimales'
    )
  }

  const validateArtifactsArray = (arr, expectedNames, errorCode) => {
    if (!Array.isArray(arr) || arr.length !== expectedNames.length) {
      throw new Error(
        `${errorCode}: Se esperaban exactamente ${expectedNames.length} artefactos`
      )
    }
    for (let i = 0; i < expectedNames.length; i++) {
      const item = arr[i]
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`${errorCode}: Artefacto en índice ${i} inválido`)
      }
      for (const k of Object.keys(item)) {
        if (!ARTIFACT_ALLOWED_KEYS.has(k)) {
          throw new Error(
            `UNEXPECTED_REQUEST_FIELD: Campo inesperado en artefacto[${i}]: '${k}'`
          )
        }
      }
      if (item.name !== expectedNames[i]) {
        throw new Error(
          `${errorCode}: Artefacto[${i}] debe llamarse '${expectedNames[i]}'`
        )
      }
      if (
        typeof item.sha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(item.sha256)
      ) {
        throw new Error(
          `${errorCode}: sha256 inválido en artefacto '${expectedNames[i]}'`
        )
      }
    }
  }

  validateArtifactsArray(
    pkg.rawSoapArtifacts,
    [
      'FEParamGetTiposIva_response.xml',
      'FEParamGetCondicionIvaReceptor_response.xml',
    ],
    'ATTESTATION_REQUEST_RAW_ARTIFACTS_INVALID'
  )

  validateArtifactsArray(
    pkg.normalizedArtifacts,
    [
      'FEParamGetTiposIva_normalized.json',
      'FEParamGetCondicionIvaReceptor_normalized.json',
    ],
    'ATTESTATION_REQUEST_NORMALIZED_ARTIFACTS_INVALID'
  )

  if (
    !pkg.consultadoEn ||
    typeof pkg.consultadoEn !== 'string' ||
    !Number.isFinite(Date.parse(pkg.consultadoEn))
  ) {
    throw new Error(
      'ATTESTATION_REQUEST_CONSULTED_INVALID: consultadoEn debe ser una fecha ISO-8601 válida'
    )
  }
  if (
    !pkg.requestedAt ||
    typeof pkg.requestedAt !== 'string' ||
    !Number.isFinite(Date.parse(pkg.requestedAt))
  ) {
    throw new Error(
      'ATTESTATION_REQUEST_TIMESTAMP_INVALID: requestedAt debe ser una fecha ISO-8601 válida'
    )
  }
  if (pkg.collectorIdentity !== PR02_P0_COLECTOR_IDENTIDAD) {
    throw new Error(
      `ATTESTATION_REQUEST_COLLECTOR_MISMATCH: collectorIdentity debe ser '${PR02_P0_COLECTOR_IDENTIDAD}'`
    )
  }

  const expectedDigest = computeAttestationRequestDigest(pkg)
  if (!pkg.requestSha256 || pkg.requestSha256 !== expectedDigest) {
    throw new Error(
      `ATTESTATION_REQUEST_HASH_MISMATCH: requestSha256 provisto ('${pkg.requestSha256}') no coincide con el digest canónico ('${expectedDigest}')`
    )
  }
  if (
    pkg.canonicalPayloadSha256 !== undefined &&
    pkg.canonicalPayloadSha256 !== expectedDigest
  ) {
    throw new Error(
      'ATTESTATION_REQUEST_HASH_MISMATCH: El hash canonicalPayloadSha256 no coincide con el payload canónico'
    )
  }

  return Object.freeze({
    valid: true,
    requestSha256: expectedDigest,
  })
}
