// PR02: Contrato y Planificación para la Obtención y Provisión de Parámetros Fiscales (Revisión 4).
// Guarantees:
// 1. Exact allowlist de llamadas externas: LoginCms (máx 1), FEParamGetTiposIva (máx 1), FEParamGetCondicionIvaReceptor (máx 1) (TOTAL MÁXIMO 3, o 2 si TA es reutilizable).
// 2. Prohibición estricta de emisión: FECAESolicitar, FECompConsultar, FECompUltimoAutorizado, FEParamGetPtosVenta.
// 3. Emisor fiscal permanece INACTIVO (habilitado = false) durante PR02-P1 y PR02-P2.
// 4. Catálogo revisión 3 histórico conservado inmutable; revisión 4 insert-only en P1, activación atómica en P2.
// 5. Cero retry automático ante fallo de red o SOAP Fault (Fail-Closed).
// 6. Cero credenciales ni tokens expuestos en logs o paquetes.
// 7. Toda llamada remota futura exige GO específico de un solo uso.

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import crypto, { createHash, randomUUID } from 'node:crypto'
import { planFiscalParameters } from '../plan-fiscal-parameters.mjs'
import {
  parseWsfeTiposIvaResponse,
  parseWsfeCondicionIvaReceptorResponse,
} from './execute-pr03-c-staging.mjs'

export {
  parseWsfeTiposIvaResponse,
  parseWsfeCondicionIvaReceptorResponse,
}

export const PR02_P0_GO_PUBLIC_KEY_ENV = 'PR02_P0_GO_PUBLIC_KEY'
export const PR02_P0_ATTESTATION_PUBLIC_KEY_ENV = 'PR02_P0_ATTESTATION_PUBLIC_KEY'
export const PR02_P0_AUTHORITY_ENV = 'PR02_P0_ATTESTATION_PUBLIC_KEY'
export const PR02_P0_GO_AUTHORITY_ENV = 'PR02_P0_GO_PUBLIC_KEY'
export const PR02_P0_ATTESTATION_ENDPOINT_ENV = 'PR02_P0_ATTESTATION_ENDPOINT'
export const PR02_P0_ATTESTATION_AUTHORITY_ID_ENV = 'PR02_P0_ATTESTATION_AUTHORITY_ID'
export const PR02_P0_ATTESTATION_KEY_ID_ENV = 'PR02_P0_ATTESTATION_KEY_ID'

export const PR02_P0_COMPROMISED_SECRETS = Object.freeze([
  'kioskopos-pr02-p0-official-custody-secret-2026',
])
export const PR02_P0_COMPROMISED_KEYS = PR02_P0_COMPROMISED_SECRETS

/**
 * Detecta si una clave es un marcador o clave de prueba no confiable.
 */
export function isTestAuthorityKey(secret) {
  if (!secret) return false
  if (typeof secret !== 'string') return false
  const lower = secret.toLowerCase()
  return (
    lower.includes('test') ||
    lower.includes('mock') ||
    lower.includes('dummy') ||
    lower.includes('synthetic') ||
    lower.includes('sample') ||
    lower.includes('example')
  )
}

export const ANTI_REPLAY_GUARANTEE_LEVEL = 'HOST_LOCAL_DURABLE_ONE_TIME_USE'

export const AUTHORITY_ADAPTER_IMPLEMENTED = true
export const AUTHORITY_REAL_WORLD_AVAILABLE = false

/**
 * Parsea y normaliza una clave pública Ed25519 a un KeyObject nativo de Node.js.
 * Acepta PEM SPKI, KeyObject nativo público, o digest raw de 64 caracteres hex.
 * Rechaza fail-closed cualquier clave privada (KeyObject privado, PEM PKCS#8/OpenSSH/EC/RSA privado)
 * pasada como configuración de verificación en el runtime fiscal.
 */
export function parseEd25519PublicKey(raw, name = 'PUBLIC_KEY') {
  if (!raw) {
    throw new Error(`${name}_MISSING: Se requiere clave pública Ed25519 custodiada fuera del repositorio`)
  }
  if (typeof raw === 'object' && raw !== null) {
    if (
      raw.type === 'private' ||
      raw.privateKey !== undefined ||
      raw.secretKey !== undefined ||
      (raw.asymmetricKeyType && raw.type && raw.type !== 'public')
    ) {
      throw new Error(
        `RUNTIME_PRIVATE_KEY_DETECTED: ${name}_PRIVATE_KEY_FORBIDDEN: Prohibido aceptar o cargar una clave privada como configuración de verificación en el runtime fiscal`
      )
    }
    if (raw.asymmetricKeyType) {
      if (raw.asymmetricKeyType !== 'ed25519') {
        throw new Error(`${name}_ALGORITHM_INVALID: Se requiere clave Ed25519, recibido '${raw.asymmetricKeyType}'`)
      }
      return raw
    }
  }
  const str = String(raw).trim()
  if (str.length === 0) {
    throw new Error(`${name}_MISSING: Se requiere clave pública Ed25519 custodiada fuera del repositorio`)
  }
  if (
    /-----\s*BEGIN[A-Z0-9\s]*PRIVATE\s+KEY\s*-----/i.test(str) ||
    /-----\s*END[A-Z0-9\s]*PRIVATE\s+KEY\s*-----/i.test(str) ||
    /\bprivate[_\-\s]?key\b/i.test(str)
  ) {
    throw new Error(
      `RUNTIME_PRIVATE_KEY_DETECTED: ${name}_PRIVATE_KEY_FORBIDDEN: Prohibido aceptar o cargar una clave privada PEM como configuración de verificación en el runtime fiscal`
    )
  }
  for (const compromised of PR02_P0_COMPROMISED_SECRETS) {
    if (str === compromised || str.toLowerCase() === compromised.toLowerCase()) {
      throw new Error(`${name}_COMPROMISED: La clave provista fue declarada permanentemente no confiable por exposición previa`)
    }
  }
  if (str.startsWith('-----BEGIN')) {
    try {
      const k = crypto.createPublicKey(str)
      if (k.type !== 'public') {
        throw new Error(
          `RUNTIME_PRIVATE_KEY_DETECTED: ${name}_PRIVATE_KEY_FORBIDDEN: Se requiere clave estrictamente pública`
        )
      }
      if (k.asymmetricKeyType !== 'ed25519') {
        throw new Error(`${name}_ALGORITHM_INVALID: Se requiere clave Ed25519, recibido '${k.asymmetricKeyType}'`)
      }
      return k
    } catch (err) {
      if (err.message.includes('ALGORITHM_INVALID') || err.message.includes('RUNTIME_PRIVATE_KEY_DETECTED')) throw err
      throw new Error(`${name}_INVALID_FORMAT: Falló parsing de clave pública PEM: ${err.message}`)
    }
  }
  if (/^[0-9a-fA-F]{64}$/.test(str)) {
    try {
      const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(str, 'hex')])
      const k = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })
      if (k.asymmetricKeyType !== 'ed25519') {
        throw new Error(`${name}_ALGORITHM_INVALID: Se requiere clave Ed25519, recibido '${k.asymmetricKeyType}'`)
      }
      return k
    } catch (err) {
      if (err.message.includes('ALGORITHM_INVALID')) throw err
      throw new Error(`${name}_INVALID_FORMAT: Falló parsing de clave pública hex raw: ${err.message}`)
    }
  }
  if (fs.existsSync(str)) {
    try {
      const content = fs.readFileSync(str, 'utf8')
      return parseEd25519PublicKey(content, name)
    } catch (err) {
      if (err && err.message && err.message.includes('RUNTIME_PRIVATE_KEY_DETECTED')) {
        throw err
      }
      throw new Error(`${name}_FILE_READ_FAILED: No se pudo leer clave desde '${str}': ${err.message}`)
    }
  }
  throw new Error(`${name}_INVALID_FORMAT: Formato de clave pública no reconocido (se espera PEM SPKI o hex 64)`)
}

/**
 * Verifica fail-closed la separación estricta entre GO Authority e Independent Attestation Authority:
 * - GO_AUTHORITY_ID != ATTESTATION_AUTHORITY_ID
 * - goKeyId != attestationKeyId
 * - Claves públicas SPKI distintas
 */
export function assertAuthoritiesSeparated(params = {}) {
  if (!params || typeof params !== 'object') return true

  const goAuthIdRaw =
    params.goAuthorityId ??
    params.trustedGoAuthorityId ??
    params.goApproverId ??
    (params.goAuthorizationDoc &&
      params.goAuthorizationDoc.authorization &&
      params.goAuthorizationDoc.authorization.aprobador_identidad)
  const attAuthIdRaw =
    params.attestationAuthorityId ??
    params.authorityId ??
    params.expectedAuthorityId

  if (
    typeof goAuthIdRaw === 'string' &&
    goAuthIdRaw.trim().length > 0 &&
    typeof attAuthIdRaw === 'string' &&
    attAuthIdRaw.trim().length > 0 &&
    goAuthIdRaw.trim().toLowerCase() === attAuthIdRaw.trim().toLowerCase()
  ) {
    throw new Error(
      `COLLAPSED_AUTHORITIES_REJECTED: GO_AUTHORITY_ID ('${goAuthIdRaw.trim()}') y ATTESTATION_AUTHORITY_ID ('${attAuthIdRaw.trim()}') no pueden ser iguales`
    )
  }

  const goKeyIdRaw =
    params.goKeyId ??
    params.trustedGoKeyId ??
    (params.goAuthorizationDoc &&
      params.goAuthorizationDoc.signature &&
      params.goAuthorizationDoc.signature.key_id)
  const attKeyIdRaw =
    params.attestationKeyId ??
    params.keyId ??
    params.expectedKeyId

  if (
    typeof goKeyIdRaw === 'string' &&
    goKeyIdRaw.trim().length > 0 &&
    typeof attKeyIdRaw === 'string' &&
    attKeyIdRaw.trim().length > 0 &&
    goKeyIdRaw.trim().toLowerCase() === attKeyIdRaw.trim().toLowerCase()
  ) {
    throw new Error(
      `COLLAPSED_AUTHORITIES_REJECTED: GO Authority y Attestation Authority no pueden compartir el mismo keyId ('${attKeyIdRaw.trim()}')`
    )
  }

  const rawGoPub = params.trustedGoPublicKey ?? params.goPublicKey
  const rawAttPub =
    params.trustedAttestationPublicKey ??
    params.authorityPublicKey ??
    params.publicKeySpki

  let goKeyObj = null
  let attKeyObj = null
  if (rawGoPub) {
    goKeyObj = validateP0GoPublicKey(rawGoPub, Boolean(params.allowTestKeys))
  }
  if (rawAttPub) {
    attKeyObj = validateP0AttestationPublicKey(rawAttPub, Boolean(params.allowTestKeys))
  }

  if (goKeyObj && attKeyObj) {
    const goDer = goKeyObj.export({ format: 'der', type: 'spki' })
    const attDer = attKeyObj.export({ format: 'der', type: 'spki' })
    if (goDer.equals(attDer)) {
      throw new Error(
        'COLLAPSED_AUTHORITIES_REJECTED: La clave pública de GO Authority y la de Independent Attestation Authority no pueden colapsar en la misma identidad criptográfica'
      )
    }
  }

  if (goKeyObj && typeof attKeyIdRaw === 'string' && attKeyIdRaw.trim().length > 0) {
    const derivedGoKeyId = `ed25519-spki-${sha256(goKeyObj.export({ format: 'der', type: 'spki' })).slice(0, 16)}`
    if (derivedGoKeyId.toLowerCase() === attKeyIdRaw.trim().toLowerCase()) {
      throw new Error(
        `COLLAPSED_AUTHORITIES_REJECTED: El keyId de Attestation Authority ('${attKeyIdRaw.trim()}') colapsa con la clave pública de GO Authority`
      )
    }
  }

  if (attKeyObj && typeof goKeyIdRaw === 'string' && goKeyIdRaw.trim().length > 0) {
    const derivedAttKeyId = `ed25519-spki-${sha256(attKeyObj.export({ format: 'der', type: 'spki' })).slice(0, 16)}`
    if (derivedAttKeyId.toLowerCase() === goKeyIdRaw.trim().toLowerCase()) {
      throw new Error(
        `COLLAPSED_AUTHORITIES_REJECTED: El keyId de GO Authority ('${goKeyIdRaw.trim()}') colapsa con la clave pública de Attestation Authority`
      )
    }
  }

  return true
}

/**
 * Validador estricto de la clave pública de autoridad de aprobación GO (separada de atestación).
 */
export function validateP0GoPublicKey(keyInput, allowTestKeys = false) {
  if (!keyInput || (typeof keyInput === 'string' && keyInput.trim().length === 0)) {
    throw new Error('P0_GO_AUTHORITY_KEY_MISSING: Se requiere una clave de autoridad de aprobación GO custodiada fuera del repositorio')
  }
  if (typeof keyInput === 'string' && keyInput.trim().length < 32 && !fs.existsSync(keyInput.trim())) {
    throw new Error('P0_GO_AUTHORITY_KEY_INSUFFICIENT_ENTROPY: Clave de autoridad GO con baja entropía o longitud insuficiente')
  }
  for (const compromised of PR02_P0_COMPROMISED_SECRETS) {
    if (typeof keyInput === 'string' && (keyInput === compromised || keyInput.toLowerCase() === compromised.toLowerCase())) {
      throw new Error('P0_GO_AUTHORITY_KEY_COMPROMISED: La clave provista fue declarada permanentemente no confiable por exposición previa')
    }
  }
  if (!allowTestKeys && typeof keyInput === 'string' && isTestAuthorityKey(keyInput)) {
    throw new Error('P0_GO_AUTHORITY_TEST_KEY_PROHIBITED: No se permite utilizar una clave de prueba para la aprobación oficial de GO')
  }
  return parseEd25519PublicKey(keyInput, 'P0_GO_AUTHORITY_KEY')
}

/**
 * Validador estricto de la clave pública de autoridad de atestación oficial P0.
 */
export function validateP0AttestationPublicKey(keyInput, allowTestKeys = false) {
  if (!keyInput || (typeof keyInput === 'string' && keyInput.trim().length === 0)) {
    throw new Error('ATTESTATION_AUTHORITY_NOT_AVAILABLE: P0_ATTESTATION_KEY_MISSING: Se requiere una clave de atestación oficial custodiada fuera del repositorio')
  }
  if (typeof keyInput === 'string' && keyInput.trim().length < 32 && !fs.existsSync(keyInput.trim())) {
    throw new Error('ATTESTATION_CONFIGURATION_INVALID: P0_ATTESTATION_KEY_INSUFFICIENT_ENTROPY: Clave de atestación con baja entropía o longitud insuficiente')
  }
  for (const compromised of PR02_P0_COMPROMISED_SECRETS) {
    if (typeof keyInput === 'string' && (keyInput === compromised || keyInput.toLowerCase() === compromised.toLowerCase())) {
      throw new Error('UNTRUSTED_ATTESTATION_AUTHORITY: P0_ATTESTATION_KEY_COMPROMISED: La clave provista fue declarada permanentemente no confiable por exposición previa')
    }
  }
  if (!allowTestKeys && typeof keyInput === 'string' && isTestAuthorityKey(keyInput)) {
    throw new Error('UNTRUSTED_ATTESTATION_AUTHORITY: P0_ATTESTATION_TEST_KEY_PROHIBITED: No se permite utilizar una clave de prueba o simulación para atestación oficial')
  }
  return parseEd25519PublicKey(keyInput, 'P0_ATTESTATION_KEY')
}

// Aliases para compatibilidad con firmas previas
export function validateP0AuthoritySecret(secret, allowTestKeys = false) {
  return validateP0AttestationPublicKey(secret, allowTestKeys)
}
export function validateP0GoAuthoritySecret(secret, allowTestKeys = false) {
  return validateP0GoPublicKey(secret, allowTestKeys)
}

/**
 * Resuelve la ruta canónica y segura del registro durable de consumo de autorizaciones.
 */
export function getConsumedAuthorizationFilePath(authId, options = {}) {
  if (!authId || typeof authId !== 'string' || authId.trim().length === 0) {
    throw new Error('GO_AUTHORIZATION_ID_REQUIRED: Se requiere un identificador de autorización válido')
  }
  const cleanId = authId.trim()
  const baseDir = options.consumedAuthorizationsDir
    ? path.resolve(options.consumedAuthorizationsDir)
    : path.resolve(process.cwd(), '.fiscal-evidence-pr02', '.consumed-authorizations')

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true, mode: 0o700 })
  }

  const realBase = fs.realpathSync(baseDir)
  const idDigest = createHash('sha256').update(cleanId).digest('hex')
  const fileName = `consumed-${idDigest}.json`
  const targetPath = path.resolve(realBase, fileName)

  const rel = path.relative(realBase, targetPath)
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel !== fileName) {
    throw new Error('PATH_TRAVERSAL_DETECTED: Ruta de registro durable fuera del directorio autorizado')
  }

  return { targetPath, realBase, cleanId, idDigest }
}

/**
 * Consulta si una autorización GO ya fue registrada duraderamente como consumida.
 */
export function isGoAuthorizationConsumedDurable(authId, options = {}) {
  try {
    const { targetPath } = getConsumedAuthorizationFilePath(authId, options)
    if (fs.existsSync(targetPath)) {
      const lstat = fs.lstatSync(targetPath)
      if (lstat.isSymbolicLink()) {
        throw new Error('SYMLINK_NOT_ALLOWED: Se detectó enlace simbólico en registro de autorizaciones consumidas')
      }
      return true
    }
    return false
  } catch (err) {
    if (err.message.includes('SYMLINK_NOT_ALLOWED') || err.message.includes('PATH_TRAVERSAL_DETECTED')) {
      throw err
    }
    return false
  }
}

/**
 * Registra de forma durable y atómica (flag 'wx', O_CREAT | O_EXCL) el consumo de una autorización GO.
 */
export function consumeGoAuthorizationDurable(authId, options = {}) {
  const { targetPath, cleanId, idDigest } = getConsumedAuthorizationFilePath(authId, options)
  const record = {
    authorizationId: cleanId,
    idDigest,
    consumedAt: new Date(options.now ? (typeof options.now === 'string' || typeof options.now === 'number' ? new Date(options.now).getTime() : options.now.getTime()) : Date.now()).toISOString(),
    hostPid: process.pid,
    antiReplayGuarantee: ANTI_REPLAY_GUARANTEE_LEVEL,
  }

  try {
    fs.writeFileSync(targetPath, JSON.stringify(record, null, 2), { flag: 'wx', mode: 0o600 })
  } catch (err) {
    if (err.code === 'EEXIST') {
      throw new Error(`GO_AUTHORIZATION_ALREADY_CONSUMED: La autorización GO '${cleanId}' ya fue consumida previamente (single-use violado en registro durable)`)
    }
    throw new Error(`GO_AUTHORIZATION_REGISTRATION_FAILED: Fallo al registrar consumo durable: ${err.message}`)
  }
}

export function isGoAuthorizationConsumed(authId, options = {}) {
  return isGoAuthorizationConsumedDurable(authId, options)
}

export function markGoAuthorizationConsumed(authId, options = {}) {
  return consumeGoAuthorizationDurable(authId, options)
}

/**
 * Validador exhaustivo de autorización externa GO para PR02-P0.
 * Verifica identidad del aprobador, scope, project-ref, entorno, commit SHA exacto,
 * operaciones permitidas exactas, límites inmutables, vigencia (vence_en),
 * protección contra reutilización (single-use durable) y firma asimétrica Ed25519 de la autoridad externa.
 */
export function validatePr02P0GoAuthorization(signedGoDoc, options = {}) {
  if (!signedGoDoc) {
    throw new Error('GO_AUTHORIZATION_MISSING: Se requiere documento de autorización externa (GO)')
  }

  let raw = signedGoDoc
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      throw new Error('GO_AUTHORIZATION_INVALID_FORMAT: El documento de autorización GO no posee el formato estructurado requerido')
    }
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('GO_AUTHORIZATION_INVALID_FORMAT: El documento de autorización GO no posee el formato estructurado requerido')
  }

  const payload = raw.authorization || raw
  const signature = raw.signature || payload.signature

  if (!payload || typeof payload !== 'object' || !signature || typeof signature !== 'string' || !/^[0-9a-fA-F]{128}$/.test(signature)) {
    throw new Error('GO_AUTHORIZATION_INVALID_FORMAT: El documento de autorización GO carece de payload o firma criptográfica Ed25519 válida de 128 hex')
  }

  const id = payload.identificador || payload.authorizationId
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('GO_AUTHORIZATION_ID_REQUIRED: Se requiere identificador único no secreto en la autorización GO')
  }
  const cleanId = id.trim()

  const approver = payload.aprobador_identidad || payload.approverId
  if (!approver || typeof approver !== 'string' || approver.trim().length === 0) {
    throw new Error('GO_AUTHORIZATION_APPROVER_REQUIRED: Se requiere la identidad del aprobador oficial')
  }

  const scope = payload.scope
  if (scope !== PR02_P0_SCOPE) {
    throw new Error(`GO_AUTHORIZATION_SCOPE_MISMATCH: El scope del GO ('${scope}') no coincide con '${PR02_P0_SCOPE}'`)
  }

  const projectRef = payload.project_ref || payload.projectRef
  if (projectRef !== PR02_PARAMETERS_TARGET_PROJECT_REF) {
    throw new Error(`GO_AUTHORIZATION_PROJECT_MISMATCH: Target del GO ('${projectRef}') no coincide con '${PR02_PARAMETERS_TARGET_PROJECT_REF}'`)
  }

  const entorno = payload.entorno || payload.environment
  if (entorno !== 'HOMOLOGACION') {
    throw new Error(`GO_AUTHORIZATION_ENTORNO_MISMATCH: Entorno del GO ('${entorno}') debe ser 'HOMOLOGACION'`)
  }

  const commitSha = payload.commit_sha || payload.commitSha
  if (!commitSha || !/^[0-9a-fA-F]{40}$/.test(commitSha)) {
    throw new Error('GO_AUTHORIZATION_COMMIT_INVALID: El commit SHA del GO debe ser un hash hexadecimal de 40 caracteres')
  }
  if (options.expectedHead) {
    if (String(commitSha).toLowerCase() !== String(options.expectedHead).toLowerCase()) {
      throw new Error(`GO_AUTHORIZATION_COMMIT_MISMATCH: Commit SHA del GO ('${commitSha}') difiere del commit esperado ('${options.expectedHead}')`)
    }
  }

  const ops = payload.operaciones_permitidas || payload.allowedMethods
  if (!Array.isArray(ops) || ops.length !== 3 ||
      !ops.includes('LoginCms') || !ops.includes('FEParamGetTiposIva') || !ops.includes('FEParamGetCondicionIvaReceptor')) {
    throw new Error('GO_AUTHORIZATION_OPERATIONS_FORBIDDEN: El GO contiene operaciones no permitidas o prohíbe las requeridas')
  }

  const limits = payload.limites || payload.callLimits
  if (!limits || typeof limits !== 'object') {
    throw new Error('GO_AUTHORIZATION_LIMITS_REQUIRED: Se requieren límites estrictos de llamadas en el GO')
  }
  if (limits.loginCmsMax > 1 || limits.tiposIvaMax > 1 || limits.condicionIvaReceptorMax > 1 || limits.totalMax > 3) {
    throw new Error('GO_AUTHORIZATION_LIMITS_EXCEEDED: Los límites de llamadas del GO exceden el máximo estricto permitido (loginCms<=1, tiposIva<=1, condicion<=1, total<=3)')
  }

  const nowMs = options.now ? new Date(options.now).getTime() : Date.now()

  const emitidoEn = payload.emitido_en || payload.issuedAt
  if (!emitidoEn || !Number.isFinite(Date.parse(emitidoEn))) {
    throw new Error('GO_AUTHORIZATION_ISSUED_INVALID: Fecha emitido_en inválida')
  }
  if (Date.parse(emitidoEn) > nowMs + 60000) {
    throw new Error('GO_AUTHORIZATION_ISSUED_IN_FUTURE: La fecha de emisión del GO se encuentra en el futuro')
  }

  const venceEn = payload.vence_en || payload.expiresAt
  if (!venceEn || !Number.isFinite(Date.parse(venceEn))) {
    throw new Error('GO_AUTHORIZATION_EXPIRES_INVALID: Fecha vence_en inválida')
  }
  if (Date.parse(venceEn) <= nowMs) {
    throw new Error(`GO_AUTHORIZATION_EXPIRED: La autorización GO venció en ${venceEn} (evaluado contra ${new Date(nowMs).toISOString()})`)
  }

  const nonce = payload.single_use_nonce || payload.singleUseNonce
  if (!nonce || typeof nonce !== 'string' || nonce.trim().length < 16) {
    throw new Error('GO_AUTHORIZATION_NONCE_INVALID: Se requiere nonce de protección contra reutilización de al menos 16 caracteres')
  }

  // Verificación durable de reutilización (Single-use guard)
  if (isGoAuthorizationConsumedDurable(cleanId, options)) {
    throw new Error(`GO_AUTHORIZATION_ALREADY_CONSUMED: La autorización GO '${cleanId}' ya fue consumida previamente (single-use violado en registro durable)`)
  }

  // Verificación de firma criptográfica asimétrica Ed25519
  const rawKey = options.trustedGoPublicKey || options.trustedGoAuthoritySecret || process.env[PR02_P0_GO_PUBLIC_KEY_ENV] || process.env[PR02_P0_GO_AUTHORITY_ENV]
  const pubKey = validateP0GoPublicKey(rawKey, Boolean(options.allowTestKeys))

  const canonicalPayload = {
    version: payload.version || '1.0',
    identificador: cleanId,
    aprobador_identidad: approver.trim(),
    scope,
    project_ref: projectRef,
    entorno,
    commit_sha: String(commitSha).toLowerCase(),
    operaciones_permitidas: Object.freeze([...ops]),
    limites: Object.freeze({
      loginCmsMax: limits.loginCmsMax,
      tiposIvaMax: limits.tiposIvaMax,
      condicionIvaReceptorMax: limits.condicionIvaReceptorMax,
      totalMax: limits.totalMax,
    }),
    emitido_en: new Date(emitidoEn).toISOString(),
    vence_en: new Date(venceEn).toISOString(),
    single_use_nonce: nonce.trim(),
  }

  const canonicalJson = JSON.stringify(canonicalPayload)
  const isSigValid = crypto.verify(null, Buffer.from(canonicalJson, 'utf8'), pubKey, Buffer.from(signature, 'hex'))

  if (!isSigValid) {
    throw new Error('GO_AUTHORIZATION_SIGNATURE_INVALID: La firma criptográfica Ed25519 de la autorización GO es inválida o fue manipulada')
  }

  return Object.freeze({
    valid: true,
    authorizationId: cleanId,
    approverId: approver.trim(),
    scope,
    projectRef,
    commitSha: String(commitSha).toLowerCase(),
    documentSha256: sha256(canonicalJson),
    canonicalDocument: Object.freeze(canonicalPayload),
    expiresAt: new Date(venceEn).toISOString(),
    issuedAt: new Date(emitidoEn).toISOString(),
    singleUseNonce: nonce.trim(),
  })
}

/**
 * Entidad de Autoridad de Aprobación GO (frontera de control externo).
 * Exclusivamente funciones de verificación y registro durable (sin capacidad de firma en runtime).
 */
export const GoAuthority = Object.freeze({
  validateAuthorization: validatePr02P0GoAuthorization,
  validatePublicKey: validateP0GoPublicKey,
  validateSecret: validateP0GoPublicKey,
  consumeAuthorizationDurable: consumeGoAuthorizationDurable,
  isConsumed: isGoAuthorizationConsumedDurable,
  markConsumed: consumeGoAuthorizationDurable,
  ANTI_REPLAY_GUARANTEE_LEVEL,
})

export const PR02_P0_SCOPE = 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'
export const PR02_P1_SCOPE = 'PR02_P1_VERIFIED_CATALOG_IMPORT'
export const PR02_P1_LEGACY_SCOPE = 'PR02_P1_PARAMETER_REFRESH'
export const PR02_P2_SCOPE = 'PR02_P2_CATALOG_ENABLE'

export const PR02_PARAMETERS_ALLOWED_SCOPES = Object.freeze([
  PR02_P0_SCOPE,
  PR02_P1_SCOPE,
  PR02_P1_LEGACY_SCOPE,
  PR02_P2_SCOPE,
])

export const PR02_PARAMETERS_TARGET_PROJECT_REF = 'acoyfwwmhaeruciyedri'
export const PR02_PARAMETERS_TARGET_REVISION = 4
export const PR02_PARAMETERS_HISTORICAL_REVISION = 3
export const PR02_PARAMETERS_EXPECTED_ISSUER_CUIT = '20415005963'
export const PR02_PARAMETERS_EXPECTED_ISSUER_PV = 2
export const PR02_P0_COLECTOR_IDENTIDAD = 'scripts/fiscal/execute-pr02-p0-official-evidence.mjs'

/**
 * Hash acreditado oficial de la columna fuente_sha256 para la Revisión 3 en Staging.
 * Comprobado fácticamente en acoyfwwmhaeruciyedri por PR02-A0.
 */
export const REV3_SOURCE_SHA256 = '11e9d2244b4fd418df4ab9bc3798c303d66f181785ba678597fdeffa76d5e884'
export const PR02_CATALOG_REV3_HASH = REV3_SOURCE_SHA256

/**
 * Computa el digest canónico SHA-256 de una fila de catálogo fiscal.
 * Distingue el digest de fila completa (JSON canónico) del campo fuente_sha256 (procedencia WSFE).
 */
export function computeCatalogRowDigest(row) {
  if (!row || typeof row !== 'object') throw new Error('CATALOG_ROW_REQUIRED')
  const canonical = {
    revision: row.revision,
    condiciones: row.condiciones,
    alicuotas: row.alicuotas,
    fuente_sha256: row.fuente_sha256,
    consultado_en: new Date(row.consultado_en).toISOString(),
    vence_en: new Date(row.vence_en).toISOString(),
    habilitado: Boolean(row.habilitado),
  }
  return sha256(JSON.stringify(canonical))
}

export const PR02_EXECUTION_OUTCOMES = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  PREFLIGHT_FAILED_NO_WRITE: 'PREFLIGHT_FAILED_NO_WRITE',
  TRANSACTION_ROLLED_BACK_CONFIRMED: 'TRANSACTION_ROLLED_BACK_CONFIRMED',
  WRITE_COMMITTED: 'WRITE_COMMITTED',
  WRITE_COMMITTED_POSTCHECK_FAILED: 'WRITE_COMMITTED_POSTCHECK_FAILED',
  COMMIT_OUTCOME_UNKNOWN: 'COMMIT_OUTCOME_UNKNOWN',
  ROLLBACK_OUTCOME_UNKNOWN: 'ROLLBACK_OUTCOME_UNKNOWN',
  CONNECTION_CLOSE_FAILED_AFTER_COMMIT: 'CONNECTION_CLOSE_FAILED_AFTER_COMMIT',
})

export const UNCERTAIN_WRITE_RETRY_FORBIDDEN = true

export const PR02_PARAMETERS_REQUIRED_CALLS = Object.freeze([
  'LoginCms',
  'FEParamGetTiposIva',
  'FEParamGetCondicionIvaReceptor',
])

export const PR02_PARAMETERS_PROHIBITED_CALLS = Object.freeze([
  'FECAESolicitar',
  'FECompConsultar',
  'FECompUltimoAutorizado',
  'FEParamGetPtosVenta',
])

export const PR02_PARAMETERS_CALL_LIMITS_REUSABLE = Object.freeze({
  loginCmsMax: 0,
  tiposIvaMax: 1,
  condicionIvaReceptorMax: 1,
  totalMax: 2,
})

export const PR02_PARAMETERS_CALL_LIMITS_NON_REUSABLE = Object.freeze({
  loginCmsMax: 1,
  tiposIvaMax: 1,
  condicionIvaReceptorMax: 1,
  totalMax: 3,
})

export const FECAESOLICITAR_REACHABLE = false
export const FECOMPCONSULTAR_REACHABLE = false
export const PR02_P1_EMISSION_CAPABLE = false
export const PR02_P2_EMISSION_CAPABLE = false
export const EMITTER_ENABLE_DURING_PR02_PARAMETERS = false
export const REVISION_3_MUTATED = false
export const REVISION_4_INSERT_ONLY = true

const sha256 = text => createHash('sha256').update(text).digest('hex')

/**
 * Validador estricto de operaciones: rechaza cualquier operación fuera de la allowlist
 * y bloquea explícitamente operaciones de emisión o consulta de comprobantes.
 */
export function isArcaOperationPermitted(operation) {
  if (typeof operation !== 'string') return false
  if (PR02_PARAMETERS_PROHIBITED_CALLS.includes(operation)) return false
  return PR02_PARAMETERS_REQUIRED_CALLS.includes(operation)
}

export function assertNoProhibitedOperation(operation) {
  if (!isArcaOperationPermitted(operation)) {
    throw new Error(`PR02_PARAMETERS_PROHIBITED_OPERATION: Operación no permitida en refresco de parámetros PR02: ${operation}`)
  }
}

/**
 * Gestor y tracker determinístico de contadores de llamadas ARCA para PR02 parámetros.
 * Lanza error fatal si se excede el límite máximo de cualquier método o el total de llamadas.
 */
export function createPr02ParametersCallTracker(isTaReusable = false) {
  const limits = isTaReusable ? PR02_PARAMETERS_CALL_LIMITS_REUSABLE : PR02_PARAMETERS_CALL_LIMITS_NON_REUSABLE
  let loginCmsCount = 0
  let tiposIvaCount = 0
  let condicionIvaReceptorCount = 0
  let totalCalls = 0

  return {
    get loginCmsCount() { return loginCmsCount },
    get tiposIvaCount() { return tiposIvaCount },
    get condicionIvaReceptorCount() { return condicionIvaReceptorCount },
    get totalCalls() { return totalCalls },
    get isTaReusable() { return isTaReusable },
    recordCall(operation) {
      assertNoProhibitedOperation(operation)
      if (totalCalls >= limits.totalMax) {
        throw new Error(`PR02_PARAMETERS_CALL_LIMIT_EXCEEDED: Se intentó llamada ${totalCalls + 1} superando el máximo de ${limits.totalMax}`)
      }
      if (operation === 'LoginCms') {
        if (loginCmsCount >= limits.loginCmsMax) {
          throw new Error(`PR02_PARAMETERS_LOGINCMS_CALL_LIMIT_EXCEEDED: Límite LoginCms alcanzado (${limits.loginCmsMax})`)
        }
        loginCmsCount++
      } else if (operation === 'FEParamGetTiposIva') {
        if (tiposIvaCount >= limits.tiposIvaMax) {
          throw new Error(`PR02_PARAMETERS_TIPOS_IVA_CALL_LIMIT_EXCEEDED: Límite FEParamGetTiposIva alcanzado (${limits.tiposIvaMax})`)
        }
        tiposIvaCount++
      } else if (operation === 'FEParamGetCondicionIvaReceptor') {
        if (condicionIvaReceptorCount >= limits.condicionIvaReceptorMax) {
          throw new Error(`PR02_PARAMETERS_CONDICION_IVA_CALL_LIMIT_EXCEEDED: Límite FEParamGetCondicionIvaReceptor alcanzado (${limits.condicionIvaReceptorMax})`)
        }
        condicionIvaReceptorCount++
      }
      totalCalls++
    },
    verifyLimits() {
      if (loginCmsCount > limits.loginCmsMax) throw new Error('PR02_PARAMETERS_LIMIT_VERIFY_LOGINCMS_FAILED')
      if (tiposIvaCount > limits.tiposIvaMax) throw new Error('PR02_PARAMETERS_LIMIT_VERIFY_TIPOS_IVA_FAILED')
      if (condicionIvaReceptorCount > limits.condicionIvaReceptorMax) throw new Error('PR02_PARAMETERS_LIMIT_VERIFY_CONDICIONES_FAILED')
      if (totalCalls > limits.totalMax) throw new Error('PR02_PARAMETERS_LIMIT_VERIFY_TOTAL_FAILED')
    },
  }
}

/**
 * Evalúa si un registro existente de TA en base de datos o memoria es reutilizable.
 * Exige estado DISPONIBLE, no revocado, credenciales completas y vigencia > 10 min.
 */
export function evaluateExistingTa(taRecord, now = new Date()) {
  if (!taRecord || typeof taRecord !== 'object') {
    return Object.freeze({
      reusable: false,
      loginCmsRequired: true,
      expiration: null,
      reason: 'TA_RECORD_ABSENT',
    })
  }

  const rec = taRecord
  const nowMs = typeof now === 'string' || typeof now === 'number' ? new Date(now).getTime() : now.getTime()
  if (!Number.isFinite(nowMs)) {
    throw new Error('PR02_PARAMETERS_INVALID_CLOCK')
  }

  // 1. Verificación explícita de invalidez o revocación
  if (rec.valido === false) {
    return Object.freeze({
      reusable: false,
      loginCmsRequired: true,
      expiration: rec.vence_en ? String(rec.vence_en) : null,
      reason: 'TA_EXPLICITLY_INVALID',
    })
  }

  const estado = typeof rec.estado === 'string' ? rec.estado.toUpperCase().trim() : ''
  if (estado === 'REVOCADO' || estado === 'SUSPENDIDO' || estado === 'ANULADO') {
    return Object.freeze({
      reusable: false,
      loginCmsRequired: true,
      expiration: rec.vence_en ? String(rec.vence_en) : null,
      reason: 'TA_REVOKED',
    })
  }

  // Si el estado está definido pero no es DISPONIBLE, no es reutilizable
  if (estado && estado !== 'DISPONIBLE') {
    return Object.freeze({
      reusable: false,
      loginCmsRequired: true,
      expiration: rec.vence_en ? String(rec.vence_en) : null,
      reason: 'TA_NOT_AVAILABLE',
    })
  }

  const isAvailable = estado === 'DISPONIBLE'
  if (!isAvailable || !rec.vence_en) {
    return Object.freeze({
      reusable: false,
      loginCmsRequired: true,
      expiration: rec.vence_en ? String(rec.vence_en) : null,
      reason: 'TA_NOT_AVAILABLE',
    })
  }

  // 2. Verificación de servicio y contexto fiscal si están presentes
  if (rec.servicio !== undefined && rec.servicio !== null) {
    const srv = typeof rec.servicio === 'string' ? rec.servicio.toLowerCase().trim() : ''
    if (srv !== 'wsfe') {
      return Object.freeze({
        reusable: false,
        loginCmsRequired: true,
        expiration: rec.vence_en ? String(rec.vence_en) : null,
        reason: 'TA_SERVICE_MISMATCH',
      })
    }
  }

  if (rec.cuit !== undefined && rec.cuit !== null) {
    const cuitStr = typeof rec.cuit === 'string' || typeof rec.cuit === 'number' ? String(rec.cuit).trim() : ''
    if (cuitStr !== PR02_PARAMETERS_EXPECTED_ISSUER_CUIT) {
      return Object.freeze({
        reusable: false,
        loginCmsRequired: true,
        expiration: rec.vence_en ? String(rec.vence_en) : null,
        reason: 'TA_CUIT_MISMATCH',
      })
    }
  }

  // 3. Verificación de completitud de credenciales en memoria si están provistas
  if (rec.token !== undefined && (typeof rec.token !== 'string' || rec.token.trim().length === 0)) {
    return Object.freeze({
      reusable: false,
      loginCmsRequired: true,
      expiration: rec.vence_en ? String(rec.vence_en) : null,
      reason: 'TA_CREDENTIALS_INCOMPLETE',
    })
  }
  if (rec.sign !== undefined && (typeof rec.sign !== 'string' || rec.sign.trim().length === 0)) {
    return Object.freeze({
      reusable: false,
      loginCmsRequired: true,
      expiration: rec.vence_en ? String(rec.vence_en) : null,
      reason: 'TA_CREDENTIALS_INCOMPLETE',
    })
  }

  const expMs = Date.parse(String(rec.vence_en))
  if (!Number.isFinite(expMs)) {
    return Object.freeze({
      reusable: false,
      loginCmsRequired: true,
      expiration: String(rec.vence_en),
      reason: 'TA_EXPIRATION_INVALID',
    })
  }

  // Margen de seguridad: requiere al menos 10 minutos de vigencia restante
  const safetyMarginMs = 10 * 60 * 1000
  if (expMs <= nowMs + safetyMarginMs) {
    return Object.freeze({
      reusable: false,
      loginCmsRequired: true,
      expiration: new Date(expMs).toISOString(),
      reason: 'TA_EXPIRED_OR_EXPIRING_SOON',
    })
  }

  if (rec.hasCredentials === false) {
    return Object.freeze({
      reusable: false,
      loginCmsRequired: true,
      expiration: new Date(expMs).toISOString(),
      reason: 'TA_CREDENTIALS_INACCESSIBLE',
    })
  }

  return Object.freeze({
    reusable: true,
    loginCmsRequired: false,
    expiration: new Date(expMs).toISOString(),
    reason: 'TA_VALID_AND_REUSABLE',
  })
}

/**
 * Validador estricto de evidencia de FEParamGetTiposIva conforme al formato exportado.
 */
export function validateTiposIvaEvidence(text, expectedChecksum) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('TIPOS_IVA_EVIDENCE_EMPTY')
  }
  const calculatedHash = sha256(text)
  if (expectedChecksum && calculatedHash !== expectedChecksum) {
    throw new Error('TIPOS_IVA_CHECKSUM_MISMATCH')
  }

  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('TIPOS_IVA_JSON_INVALID')
  }

  if (
    data.version !== 1 ||
    data.entorno !== 'HOMOLOGACION' ||
    data.operacion !== 'FEParamGetTiposIva' ||
    data.emision_habilitada !== false ||
    data.importado_en_staging !== false ||
    !Array.isArray(data.parametros) ||
    data.parametros.length === 0
  ) {
    throw new Error('TIPOS_IVA_STRUCTURE_INVALID')
  }

  const ids = new Set()
  for (const row of data.parametros) {
    if (!Number.isSafeInteger(row.Id) || row.Id < 1 || row.Id > 99) {
      throw new Error(`TIPOS_IVA_INVALID_ROW_ID: ${row.Id}`)
    }
    if (ids.has(row.Id)) {
      throw new Error(`TIPOS_IVA_DUPLICATE_ID: ${row.Id}`)
    }
    ids.add(row.Id)
    if (typeof row.Description !== 'string' || row.Description.trim().length === 0) {
      throw new Error('TIPOS_IVA_INVALID_DESCRIPTION')
    }
  }

  return Object.freeze({
    count: data.parametros.length,
    hash: calculatedHash,
    rates: data.parametros,
  })
}

/**
 * Validador estricto de evidencia de FEParamGetCondicionIvaReceptor conforme al formato exportado.
 */
export function validateCondicionIvaReceptorEvidence(text, expectedChecksum) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('CONDICION_IVA_EVIDENCE_EMPTY')
  }
  const calculatedHash = sha256(text)
  if (expectedChecksum && calculatedHash !== expectedChecksum) {
    throw new Error('CONDICION_IVA_CHECKSUM_MISMATCH')
  }

  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('CONDICION_IVA_JSON_INVALID')
  }

  if (
    data.version !== 1 ||
    data.entorno !== 'HOMOLOGACION' ||
    data.operacion !== 'FEParamGetCondicionIvaReceptor' ||
    data.emision_habilitada !== false ||
    data.importado_en_staging !== false ||
    !Array.isArray(data.parametros) ||
    data.parametros.length === 0
  ) {
    throw new Error('CONDICION_IVA_STRUCTURE_INVALID')
  }

  const ids = new Set()
  const allowedClasses = new Set(['A', 'ALEY', 'B', 'C', '49'])
  for (const row of data.parametros) {
    if (!Number.isSafeInteger(row.Id) || row.Id < 1 || row.Id > 99) {
      throw new Error(`CONDICION_IVA_INVALID_ROW_ID: ${row.Id}`)
    }
    if (ids.has(row.Id)) {
      throw new Error(`CONDICION_IVA_DUPLICATE_ID: ${row.Id}`)
    }
    ids.add(row.Id)
    if (typeof row.Description !== 'string' || row.Description.trim().length === 0) {
      throw new Error('CONDICION_IVA_INVALID_DESCRIPTION')
    }
    if (typeof row.VoucherClasses !== 'string') {
      throw new Error('CONDICION_IVA_INVALID_VOUCHER_CLASSES')
    }
    const classes = row.VoucherClasses.split('/').map(c => c.trim()).filter(Boolean)
    for (const c of classes) {
      if (!allowedClasses.has(c)) {
        throw new Error(`CONDICION_IVA_UNKNOWN_CLASS: ${c}`)
      }
    }
  }

  return Object.freeze({
    count: data.parametros.length,
    hash: calculatedHash,
    conditions: data.parametros,
  })
}

/**
 * Crea una constancia criptográfica (atestación) de adquisición oficial de evidencia P0.
 * Vincula de forma no repudiable: identificador de proceso, ejecución autorizada,
 * commit ejecutado, hashes de respuestas SOAP y normalizadas, transporte oficial verificado,
 * autorización externa GO, identidad de ejecutor y operaciones WSFE.
 * Si el transporte es simulado, genera una atestación no acreditada (accredited = false).
 */
export const ATTESTATION_SIGNER_ORIGINS = Object.freeze({
  TEST_SIGNER: 'TEST_SIGNER',
  PRODUCTION_ATTESTATION_AUTHORITY: 'PRODUCTION_ATTESTATION_AUTHORITY',
})

export const ATTESTATION_AUTHORITY_TYPES = Object.freeze({
  PRODUCTION_AUTHORITY: 'PRODUCTION_AUTHORITY',
  TEST_AUTHORITY: 'TEST_AUTHORITY',
})

export const ATTESTATION_ALLOWED_ALGORITHMS = Object.freeze(['Ed25519'])

export const ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL = 'HOST_LOCAL_DURABLE_ONE_TIME_USE'

export const PR02_P0_ATTESTATION_REPLAY_DIR_ENV = 'PR02_P0_ATTESTATION_REPLAY_DIR'

/**
 * Serializa de forma canónica y determinista los campos criptográficamente vinculantes
 * de una respuesta de atestación para derivar su identificador canónico de replay (replayId).
 * Vincula explícitamente:
 * - attestationId (responseId / attestationId)
 * - requestSha256
 * - manifestSha256
 * - attestationPayloadSha256
 * - signature
 * - authorityId
 * - keyId
 */
export function serializeCanonicalAttestationResponseReplayIdentity(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('ATTESTATION_RESPONSE_REPLAY_IDENTITY_INVALID: Se requiere un objeto AttestationResponse estructurado')
  }
  const hasAttestationId = response.attestationId !== undefined && response.attestationId !== null
  const hasResponseId = response.responseId !== undefined && response.responseId !== null
  if (hasAttestationId && hasResponseId && String(response.attestationId) !== String(response.responseId)) {
    throw new Error('ATTESTATION_RESPONSE_REPLAY_IDENTITY_INVALID: Inconsistencia entre attestationId y responseId')
  }
  const rawId = hasAttestationId ? response.attestationId : response.responseId
  if (typeof rawId !== 'string' || rawId.trim().length === 0 || rawId !== rawId.trim()) {
    throw new Error('ATTESTATION_RESPONSE_REPLAY_IDENTITY_INVALID: attestationId/responseId inválido o vacío')
  }
  const attestationId = rawId
  const requestSha256 = typeof response.requestSha256 === 'string' ? response.requestSha256 : ''
  const manifestSha256 = typeof response.manifestSha256 === 'string' ? response.manifestSha256 : ''
  const attestationPayloadSha256 =
    typeof response.attestationPayloadSha256 === 'string' ? response.attestationPayloadSha256 : ''
  const signature = typeof response.signature === 'string' ? response.signature : ''
  const authorityId = typeof response.authorityId === 'string' ? response.authorityId : ''
  const keyId = typeof response.keyId === 'string' ? response.keyId : ''

  if (
    !/^[0-9a-f]{64}$/.test(requestSha256) ||
    !/^[0-9a-f]{64}$/.test(manifestSha256) ||
    !/^[0-9a-f]{64}$/.test(attestationPayloadSha256) ||
    !/^[0-9a-f]{128}$/.test(signature) ||
    (response.commitSha !== undefined &&
      (typeof response.commitSha !== 'string' || !/^[0-9a-f]{40}$/.test(response.commitSha))) ||
    authorityId.trim().length === 0 ||
    authorityId !== authorityId.trim() ||
    keyId.trim().length === 0 ||
    keyId !== keyId.trim()
  ) {
    throw new Error(
      'ATTESTATION_RESPONSE_REPLAY_IDENTITY_INVALID: Faltan campos vinculantes obligatorios o tienen formato inválido para el identificador canónico de replay'
    )
  }

  const canonical = {
    schemaVersion: '1.0',
    attestationId,
    requestSha256,
    manifestSha256,
    attestationPayloadSha256,
    signature,
    authorityId,
    keyId,
  }
  return JSON.stringify(canonical)
}

/**
 * Calcula el digest determinista SHA-256 (replayId) sobre la identidad canónica de replay
 * de una respuesta de atestación (AttestationResponse).
 */
export function computeAttestationResponseReplayId(response) {
  return sha256(serializeCanonicalAttestationResponseReplayIdentity(response))
}

function assertNotProtectedRepoReplayPath(candidatePath, baseRepoPath) {
  const normCandidate = path.normalize(candidatePath)
  const normRepo = path.normalize(baseRepoPath)
  const isWin = process.platform === 'win32'
  const cmpCandidate = isWin ? normCandidate.toLowerCase() : normCandidate
  const cmpRepo = isWin ? normRepo.toLowerCase() : normRepo

  if (cmpCandidate === cmpRepo) {
    throw new Error(
      'ATTESTATION_RESPONSE_CONSUMPTION_DENIED: UNAUTHORIZED_REPLAY_STORAGE_DIR: El directorio del registro durable no puede ser la raíz del repositorio'
    )
  }

  const protectedDirs = [
    'src',
    'scripts',
    'supabase',
    'docs',
    '.agent',
    '.agents',
    '.git',
    '.github',
    '.husky',
    'public',
    'legacy',
    'tools',
    'dist',
    'node_modules',
  ]

  for (const dirName of protectedDirs) {
    const protPath = path.normalize(path.join(normRepo, dirName))
    const cmpProt = isWin ? protPath.toLowerCase() : protPath
    if (cmpCandidate === cmpProt || cmpCandidate.startsWith(cmpProt + path.sep)) {
      throw new Error(
        `ATTESTATION_RESPONSE_CONSUMPTION_DENIED: UNAUTHORIZED_REPLAY_STORAGE_DIR: El directorio del registro durable no puede ubicarse dentro del directorio protegido del repositorio ('${dirName}')`
      )
    }
  }

  if (cmpCandidate.startsWith(cmpRepo + path.sep)) {
    const rel = path.relative(normRepo, normCandidate)
    const topSegment = rel.split(path.sep)[0] || ''
    const allowedPrivateTopSegments =
      topSegment === '.fiscal-evidence-pr02' ||
      topSegment === '.fiscal-evidence' ||
      topSegment === 'private' ||
      topSegment.startsWith('temp-test-') ||
      topSegment.startsWith('.tmp-test-')
    if (!allowedPrivateTopSegments) {
      throw new Error(
        `ATTESTATION_RESPONSE_CONSUMPTION_DENIED: UNAUTHORIZED_REPLAY_STORAGE_DIR: Ubicación dentro del repositorio ('${topSegment}') no autorizada por riesgo de versionado accidental`
      )
    }
  }
}

function lstatIfExists(targetPath) {
  try {
    return fs.lstatSync(targetPath)
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return null
    }
    throw err
  }
}

/**
 * Valida fail-closed el directorio del registro durable host-local de respuestas de atestación.
 * Audita y rechaza:
 * - configuración ausente o vacía;
 * - rutas UNC o de dispositivos Windows (\\?\, \\.\, \\server\share) y NTFS Alternate Data Streams (:);
 * - path traversal, segmentos '..' o '.' y segmentos con puntos o espacios finales;
 * - symlinks (incluyendo symlinks rotos/colgantes) en el destino o en cualquier ancestro;
 * - directorios de código fuente o del repositorio que puedan versionarse (.git, src, scripts, supabase, docs, .agent, etc.).
 * Aplica permisos privados 0o700 al directorio.
 */
export function validateAttestationReplayDirectory(dirPath, options = {}) {
  if (
    dirPath === undefined ||
    dirPath === null ||
    dirPath === false ||
    typeof dirPath !== 'string' ||
    dirPath.trim().length === 0
  ) {
    throw new Error(
      'ATTESTATION_RESPONSE_CONSUMPTION_DENIED: ATTESTATION_REPLAY_STORAGE_NOT_CONFIGURED: El directorio de registro durable de anti-replay no está configurado'
    )
  }

  if (dirPath.includes('\0')) {
    throw new Error(
      'ATTESTATION_RESPONSE_CONSUMPTION_DENIED: INVALID_REPLAY_STORAGE_DIR: La ruta del registro durable contiene bytes nulos prohibidos'
    )
  }

  const raw = dirPath.trim()

  // Rechazar rutas UNC o espacios de nombres de dispositivos Windows (\\?\, \\.\, \\server\share, //server/share)
  if (raw.startsWith('\\\\') || raw.startsWith('//')) {
    throw new Error(
      'ATTESTATION_RESPONSE_CONSUMPTION_DENIED: PATH_TRAVERSAL_FORBIDDEN: No se permiten rutas UNC ni espacios de nombres de dispositivos en el registro durable'
    )
  }

  // Rechazar NTFS Alternate Data Streams (:) o dos puntos fuera de la letra de unidad inicial en Windows
  const withoutDrivePrefix = raw.replace(/^[a-zA-Z]:/, '')
  if (withoutDrivePrefix.includes(':')) {
    throw new Error(
      'ATTESTATION_RESPONSE_CONSUMPTION_DENIED: INVALID_REPLAY_STORAGE_DIR: La ruta del registro durable contiene flujos alternativos NTFS (:) o caracteres de dispositivo prohibidos'
    )
  }

  const rawSegments = raw.split(/[\\/]+/).filter((seg) => seg.length > 0)
  const normalizedSegments = path.normalize(raw).split(path.sep).filter((seg) => seg.length > 0)
  if (
    rawSegments.includes('..') ||
    rawSegments.includes('.') ||
    normalizedSegments.includes('..') ||
    normalizedSegments.includes('.')
  ) {
    throw new Error(
      'ATTESTATION_RESPONSE_CONSUMPTION_DENIED: PATH_TRAVERSAL_FORBIDDEN: La ruta del registro durable no puede contener segmentos relativos de escape (.. o .)'
    )
  }

  // Rechazar segmentos con puntos o espacios finales (que Win32 normaliza silenciosamente)
  for (const seg of rawSegments) {
    if (/^[a-zA-Z]:$/.test(seg)) continue
    if (seg.endsWith('.') || seg.endsWith(' ')) {
      throw new Error(
        'ATTESTATION_RESPONSE_CONSUMPTION_DENIED: INVALID_REPLAY_STORAGE_DIR: Los segmentos de ruta del registro durable no pueden finalizar con puntos ni espacios'
      )
    }
  }

  const resolved = path.resolve(raw)
  const resolvedRepo = path.resolve(options.repoRoot || process.cwd())

  // 1. Verificar mediante lstatSync (sin seguir enlaces) que ningún ancestro ni el destino sea un symlink (incluso roto)
  const ancestorsToCheck = []
  let cursor = resolved
  while (true) {
    ancestorsToCheck.unshift(cursor)
    const parent = path.dirname(cursor)
    if (!parent || parent === cursor) break
    cursor = parent
  }

  for (const segmentPath of ancestorsToCheck) {
    const st = lstatIfExists(segmentPath)
    if (st) {
      if (st.isSymbolicLink()) {
        throw new Error(
          `ATTESTATION_RESPONSE_CONSUMPTION_DENIED: SYMLINK_FORBIDDEN: La ruta del registro durable o su ancestro '${segmentPath}' es un enlace simbólico`
        )
      }
      if (segmentPath === resolved && !st.isDirectory()) {
        throw new Error(
          `ATTESTATION_RESPONSE_CONSUMPTION_DENIED: INVALID_REPLAY_STORAGE_DIR: La ruta destino '${resolved}' existe pero no es un directorio`
        )
      }
    }
  }

  // 2. Verificar que la ruta lógica no apunte a código fuente o directorios versionables del repositorio
  assertNotProtectedRepoReplayPath(resolved, resolvedRepo)

  // 3. Crear el directorio con permisos 0o700 si no existe
  if (options.createIfMissing !== false) {
    try {
      const existingResolved = lstatIfExists(resolved)
      if (!existingResolved) {
        fs.mkdirSync(resolved, { recursive: true, mode: 0o700 })
      } else if (existingResolved.isSymbolicLink() || !existingResolved.isDirectory()) {
        throw new Error(
          `ATTESTATION_RESPONSE_CONSUMPTION_DENIED: SYMLINK_FORBIDDEN: La ruta destino '${resolved}' es un enlace simbólico o no es un directorio`
        )
      }
      try {
        fs.chmodSync(resolved, 0o700)
      } catch {
        // En plataformas que no aplican chmod POSIX (Windows), continuar
      }
    } catch (err) {
      if (err && err.message && err.message.includes('ATTESTATION_RESPONSE_CONSUMPTION_DENIED:')) {
        throw err
      }
      throw new Error(
        `ATTESTATION_RESPONSE_CONSUMPTION_DENIED: REPLAY_STORAGE_DIR_CREATE_FAILED: Fallo al preparar el directorio del registro durable: ${err.message}`
      )
    }

    const postStat = lstatIfExists(resolved)
    if (!postStat || postStat.isSymbolicLink() || !postStat.isDirectory()) {
      throw new Error(
        `ATTESTATION_RESPONSE_CONSUMPTION_DENIED: SYMLINK_FORBIDDEN: El directorio del registro durable '${resolved}' no es un directorio físico válido`
      )
    }

    const realBase = fs.realpathSync(resolved)
    const realRepo = fs.existsSync(resolvedRepo) ? fs.realpathSync(resolvedRepo) : resolvedRepo
    assertNotProtectedRepoReplayPath(realBase, realRepo)
    return realBase
  }

  const existingStat = lstatIfExists(resolved)
  if (existingStat) {
    if (existingStat.isSymbolicLink() || !existingStat.isDirectory()) {
      throw new Error(
        `ATTESTATION_RESPONSE_CONSUMPTION_DENIED: SYMLINK_FORBIDDEN: La ruta del registro durable '${resolved}' es un enlace simbólico o no es un directorio`
      )
    }
    const realBase = fs.realpathSync(resolved)
    const realRepo = fs.existsSync(resolvedRepo) ? fs.realpathSync(resolvedRepo) : resolvedRepo
    assertNotProtectedRepoReplayPath(realBase, realRepo)
    return realBase
  }

  return resolved
}

/**
 * Calcula el identificador determinístico de clave pública Ed25519 (keyId)
 * basado en los primeros 16 caracteres del SHA-256 sobre el DER SPKI.
 */
export function computePublicKeyId(pubKeyInput) {
  const pubKeyObj = validateP0AttestationPublicKey(pubKeyInput, true)
  const spkiDer = pubKeyObj.export({ format: 'der', type: 'spki' })
  const hashHex = crypto.createHash('sha256').update(spkiDer).digest('hex')
  return `ed25519-spki-${hashHex.slice(0, 16)}`
}

export const ATTESTATION_TRUST_MODELS = Object.freeze({
  SELF_ATTESTED: 'SELF_ATTESTED',
  INDEPENDENT_ATTESTED: 'INDEPENDENT_ATTESTED',
  TEST_ONLY: 'TEST_ONLY',
  UNVERIFIED: 'UNVERIFIED',
})

export const EVIDENCE_INTEGRITY_STATES = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  NOT_RUN: 'NOT_RUN',
})

export const TRUSTED_EXECUTION_BOUNDARY_STATES = Object.freeze({
  VERIFIED: 'VERIFIED',
  UNVERIFIED: 'UNVERIFIED',
})

let _cachedDefaultFiscalIsolationResult = null
let _cachedDefaultFiscalDirMtimeMs = 0

/**
 * Verifica que el runtime fiscal (scripts/fiscal/) no contenga claves privadas,
 * funciones de firma de producción ni importaciones de signers de prueba.
 */
export function verifyRuntimeSigningIsolation(options = {}) {
  const env = options.env || process.env
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith('PR02_P0_') && typeof v === 'string' && v.trim().length > 0) {
      const upperKey = k.toUpperCase()
      const upperVal = v.toUpperCase()
      if (upperKey.includes('PRIVATE_KEY') || upperVal.includes('-----BEGIN ' + 'PRIVATE KEY-----') || upperVal.includes('-----BEGIN EC ' + 'PRIVATE KEY-----') || upperVal.includes('-----BEGIN RSA ' + 'PRIVATE KEY-----') || upperVal.includes('-----BEGIN OPENSSH ' + 'PRIVATE KEY-----')) {
        return Object.freeze({
          valid: false,
          reason: 'RUNTIME_PRIVATE_KEY_DETECTED',
          detail: `Variable de entorno fiscal '${k}' contiene material de clave privada prohibido en runtime`,
          productionSigningInRuntime: true,
          privateKeysDetected: 1,
        })
      }
    }
  }

  const isCustomDir = Boolean(options.fiscalScriptsDir)
  const targetDir = isCustomDir
    ? path.resolve(options.fiscalScriptsDir)
    : path.resolve(process.cwd(), 'scripts', 'fiscal')

  if (!fs.existsSync(targetDir)) {
    return Object.freeze({
      valid: true,
      reason: 'RUNTIME_SIGNING_ISOLATED',
      productionSigningInRuntime: false,
      privateKeysDetected: 0,
    })
  }

  if (!isCustomDir && !options.forceRescan) {
    try {
      const stat = fs.statSync(targetDir)
      if (_cachedDefaultFiscalIsolationResult && stat.mtimeMs === _cachedDefaultFiscalDirMtimeMs) {
        return _cachedDefaultFiscalIsolationResult
      }
      _cachedDefaultFiscalDirMtimeMs = stat.mtimeMs
    } catch {
      // Continuar con escaneo completo
    }
  }

  const pemPrivRegex = new RegExp('-----BEGIN ' + '(?:RSA |EC |OPENSSH |ENCRYPTED )?' + 'PRIVATE KEY-----')
  const cryptoSignRegex = new RegExp('\\bcrypto\\.' + 'sign\\s*\\(')
  const createPrivKeyRegex = new RegExp('\\bcrypto\\.' + 'createPrivateKey\\s*\\(')
  const genKeyPairRegex = new RegExp('\\bcrypto\\.' + 'generate' + 'KeyPair(?:Sync)?\\s*\\(')
  const testSignerImportRegex = new RegExp('fiscalEd25519' + 'Signer')

  const entries = fs.readdirSync(targetDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const fileName = entry.name
    const lowerName = fileName.toLowerCase()
    if (lowerName.endsWith('.pem') || lowerName.endsWith('.key') || lowerName.endsWith('.p12') || lowerName.endsWith('.pfx')) {
      return Object.freeze({
        valid: false,
        reason: 'RUNTIME_PRIVATE_KEY_DETECTED',
        detail: `Archivo de clave criptográfica prohibido detectado en scripts/fiscal: '${fileName}'`,
        productionSigningInRuntime: true,
        privateKeysDetected: 1,
      })
    }

    if (
      lowerName.endsWith('.mjs') ||
      lowerName.endsWith('.js') ||
      lowerName.endsWith('.ts') ||
      lowerName.endsWith('.ps1') ||
      lowerName.endsWith('.json')
    ) {
      const fullPath = path.join(targetDir, fileName)
      const content = fs.readFileSync(fullPath, 'utf8')
      if (pemPrivRegex.test(content)) {
        return Object.freeze({
          valid: false,
          reason: 'RUNTIME_PRIVATE_KEY_DETECTED',
          detail: `Clave privada PEM detectada dentro de '${fileName}' en runtime fiscal`,
          productionSigningInRuntime: true,
          privateKeysDetected: 1,
        })
      }
      if (cryptoSignRegex.test(content) || createPrivKeyRegex.test(content) || genKeyPairRegex.test(content)) {
        return Object.freeze({
          valid: false,
          reason: 'RUNTIME_SIGNING_CAPABILITY_DETECTED',
          detail: `Primitiva de firma o clave privada detectada dentro de '${fileName}' en runtime fiscal`,
          productionSigningInRuntime: true,
          privateKeysDetected: 1,
        })
      }
      if (testSignerImportRegex.test(content)) {
        return Object.freeze({
          valid: false,
          reason: 'TEST_SIGNER_IMPORTED_IN_RUNTIME',
          detail: `Importación de helper de firma de test detectada en '${fileName}'`,
          productionSigningInRuntime: true,
          privateKeysDetected: 1,
        })
      }
    }
  }

  const cleanResult = Object.freeze({
    valid: true,
    reason: 'RUNTIME_SIGNING_ISOLATED',
    productionSigningInRuntime: false,
    privateKeysDetected: 0,
  })
  if (!isCustomDir) {
    _cachedDefaultFiscalIsolationResult = cleanResult
  }
  return cleanResult
}

export function assertRuntimeSigningIsolation(options = {}) {
  const check = verifyRuntimeSigningIsolation(options)
  if (!check.valid) {
    throw new Error(`P1_IMPORT_FORBIDDEN: RUNTIME_PRIVATE_KEY_DETECTED: ${check.detail || check.reason}`)
  }
  return check
}

/**
 * Serializa de forma canónica y determinista un paquete de solicitud de atestación (AttestationRequestPackage).
 */
export function serializeCanonicalAttestationRequest(pkg) {
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    throw new Error('ATTESTATION_REQUEST_INVALID: Se requiere objeto estructurado de solicitud de atestación')
  }
  const canonical = {
    schemaVersion: pkg.schemaVersion,
    requestId: pkg.requestId,
    processId: pkg.processId,
    executionScope: pkg.executionScope,
    commitSha: pkg.commitSha ? String(pkg.commitSha).toLowerCase() : '',
    environment: pkg.environment,
    authorizationId: pkg.authorizationId,
    goAuthorizationDocumentSha256: pkg.goAuthorizationDocumentSha256 ? String(pkg.goAuthorizationDocumentSha256).toLowerCase() : '',
    manifestSha256: pkg.manifestSha256 ? String(pkg.manifestSha256).toLowerCase() : '',
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
 * Calcula el digest SHA-256 canónico de un AttestationRequestPackage.
 */
export function computeAttestationRequestDigest(pkg) {
  return sha256(serializeCanonicalAttestationRequest(pkg))
}

/**
 * Validador estricto y fail-closed para AttestationRequestPackage.
 * Garantiza ausencia de secretos/TA/CMS/claves privadas y verifica integridad canónica.
 */
export function validateAttestationRequest(pkg) {
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    throw new Error('ATTESTATION_REQUEST_INVALID: Se requiere un paquete de solicitud de atestación válido')
  }

  const serialized = JSON.stringify(pkg).toLowerCase()
  for (const forbidden of [
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
  ]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`ATTESTATION_REQUEST_SECRETS_PROHIBITED: La solicitud de atestación contiene material sensible prohibido ('${forbidden}')`)
    }
  }

  if (pkg.schemaVersion !== '1.0') {
    throw new Error(`ATTESTATION_REQUEST_SCHEMA_INVALID: schemaVersion debe ser '1.0', recibido '${pkg.schemaVersion}'`)
  }
  if (!pkg.requestId || typeof pkg.requestId !== 'string' || pkg.requestId.trim().length === 0) {
    throw new Error('ATTESTATION_REQUEST_ID_REQUIRED: Se requiere requestId no vacío')
  }
  if (!pkg.processId || typeof pkg.processId !== 'string' || pkg.processId.trim().length === 0) {
    throw new Error('ATTESTATION_REQUEST_PROCESS_ID_REQUIRED: Se requiere processId no vacío')
  }
  if (pkg.executionScope !== PR02_P0_SCOPE) {
    throw new Error(`ATTESTATION_REQUEST_SCOPE_MISMATCH: executionScope debe ser '${PR02_P0_SCOPE}', recibido '${pkg.executionScope}'`)
  }
  if (!pkg.commitSha || typeof pkg.commitSha !== 'string' || !/^[0-9a-f]{40}$/.test(pkg.commitSha)) {
    throw new Error('ATTESTATION_REQUEST_COMMIT_INVALID: commitSha debe ser un hash hexadecimal de 40 caracteres en minúsculas')
  }
  if (pkg.environment !== 'HOMOLOGACION') {
    throw new Error(`ATTESTATION_REQUEST_ENVIRONMENT_MISMATCH: environment debe ser 'HOMOLOGACION', recibido '${pkg.environment}'`)
  }
  if (!pkg.authorizationId || typeof pkg.authorizationId !== 'string' || pkg.authorizationId.trim().length === 0) {
    throw new Error('ATTESTATION_REQUEST_AUTH_ID_REQUIRED: Se requiere authorizationId vinculado al GO')
  }
  if (!pkg.goAuthorizationDocumentSha256 || typeof pkg.goAuthorizationDocumentSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(pkg.goAuthorizationDocumentSha256)) {
    throw new Error('ATTESTATION_REQUEST_GO_SHA_INVALID: goAuthorizationDocumentSha256 debe ser un SHA-256 de 64 caracteres hexadecimales')
  }
  if (!pkg.manifestSha256 || typeof pkg.manifestSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(pkg.manifestSha256)) {
    throw new Error('ATTESTATION_REQUEST_MANIFEST_SHA_INVALID: manifestSha256 debe ser un SHA-256 de 64 caracteres hexadecimales')
  }

  if (
    !Array.isArray(pkg.rawSoapArtifacts) ||
    pkg.rawSoapArtifacts.length !== 2 ||
    pkg.rawSoapArtifacts[0].name !== 'FEParamGetTiposIva_response.xml' ||
    !/^[0-9a-f]{64}$/.test(pkg.rawSoapArtifacts[0].sha256 || '') ||
    pkg.rawSoapArtifacts[1].name !== 'FEParamGetCondicionIvaReceptor_response.xml' ||
    !/^[0-9a-f]{64}$/.test(pkg.rawSoapArtifacts[1].sha256 || '')
  ) {
    throw new Error('ATTESTATION_REQUEST_RAW_ARTIFACTS_INVALID: rawSoapArtifacts debe contener exactamente los dos XML SOAP originales con sus hashes SHA-256')
  }

  if (
    !Array.isArray(pkg.normalizedArtifacts) ||
    pkg.normalizedArtifacts.length !== 2 ||
    pkg.normalizedArtifacts[0].name !== 'FEParamGetTiposIva_normalized.json' ||
    !/^[0-9a-f]{64}$/.test(pkg.normalizedArtifacts[0].sha256 || '') ||
    pkg.normalizedArtifacts[1].name !== 'FEParamGetCondicionIvaReceptor_normalized.json' ||
    !/^[0-9a-f]{64}$/.test(pkg.normalizedArtifacts[1].sha256 || '')
  ) {
    throw new Error('ATTESTATION_REQUEST_NORMALIZED_ARTIFACTS_INVALID: normalizedArtifacts debe contener exactamente los dos JSON normalizados con sus hashes SHA-256')
  }

  if (!pkg.consultadoEn || typeof pkg.consultadoEn !== 'string' || !Number.isFinite(Date.parse(pkg.consultadoEn))) {
    throw new Error('ATTESTATION_REQUEST_CONSULTED_INVALID: consultadoEn debe ser una fecha ISO-8601 válida')
  }
  if (!pkg.requestedAt || typeof pkg.requestedAt !== 'string' || !Number.isFinite(Date.parse(pkg.requestedAt))) {
    throw new Error('ATTESTATION_REQUEST_TIMESTAMP_INVALID: requestedAt debe ser una fecha ISO-8601 válida')
  }
  if (pkg.collectorIdentity !== PR02_P0_COLECTOR_IDENTIDAD) {
    throw new Error(`ATTESTATION_REQUEST_COLLECTOR_MISMATCH: collectorIdentity debe ser '${PR02_P0_COLECTOR_IDENTIDAD}'`)
  }

  const expectedDigest = computeAttestationRequestDigest(pkg)
  if (!pkg.requestSha256 || pkg.requestSha256 !== expectedDigest) {
    throw new Error('ATTESTATION_REQUEST_DIGEST_MISMATCH: El hash canónico requestSha256 no coincide con el payload de la solicitud')
  }
  if (pkg.canonicalPayloadSha256 !== undefined && pkg.canonicalPayloadSha256 !== expectedDigest) {
    throw new Error('ATTESTATION_REQUEST_DIGEST_MISMATCH: El hash canonicalPayloadSha256 no coincide con el payload de la solicitud')
  }

  return Object.freeze({
    valid: true,
    requestSha256: expectedDigest,
  })
}

/**
 * Construye un paquete canónico de solicitud de atestación (AttestationRequestPackage)
 * desde el colector P0 para ser enviado a una Independent Attestation Authority externa.
 */
export function createAttestationRequest(params = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new Error('ATTESTATION_REQUEST_PARAMS_REQUIRED: Se requieren parámetros estructurados para crear la solicitud de atestación')
  }

  const serializedParams = JSON.stringify(params).toLowerCase()
  for (const forbidden of [
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
  ]) {
    if (serializedParams.includes(forbidden)) {
      throw new Error(`ATTESTATION_REQUEST_SECRETS_PROHIBITED: La solicitud de atestación contiene material sensible prohibido ('${forbidden}')`)
    }
  }

  const manifest = params.manifest && typeof params.manifest === 'object' ? params.manifest : null
  const schemaVersion = params.schemaVersion !== undefined ? params.schemaVersion : '1.0'
  const processId = params.processId !== undefined ? params.processId : (manifest ? manifest.identificador_proceso : '')
  const requestId = params.requestId !== undefined ? params.requestId : (processId ? `att-req-${processId}` : '')
  const executionScope = params.executionScope !== undefined ? params.executionScope : (manifest ? manifest.ejecucion_autorizada_scope : PR02_P0_SCOPE)
  const commitShaRaw =
    params.commitSha !== undefined
      ? params.commitSha
      : manifest
        ? manifest.commit_sha || (manifest.attestation && manifest.attestation.commitSha) || ''
        : ''
  const commitSha = typeof commitShaRaw === 'string' ? commitShaRaw.toLowerCase() : ''
  const environment =
    params.environment !== undefined
      ? params.environment
      : params.entorno !== undefined
        ? params.entorno
        : manifest
          ? manifest.entorno
          : 'HOMOLOGACION'
  const authorizationId =
    params.authorizationId !== undefined
      ? params.authorizationId
      : manifest
        ? manifest.go_authorization_id
        : ''
  const goAuthShaRaw =
    params.goAuthorizationDocumentSha256 !== undefined
      ? params.goAuthorizationDocumentSha256
      : manifest
        ? manifest.go_authorization_sha256
        : ''
  const goAuthorizationDocumentSha256 = typeof goAuthShaRaw === 'string' ? goAuthShaRaw.toLowerCase() : ''
  const manifestShaRaw =
    params.manifestSha256 !== undefined
      ? params.manifestSha256
      : manifest
        ? manifest.manifest_sha256
        : ''
  const manifestSha256 = typeof manifestShaRaw === 'string' ? manifestShaRaw.toLowerCase() : ''

  const rawSoapArtifacts =
    params.rawSoapArtifacts !== undefined
      ? params.rawSoapArtifacts
      : manifest
        ? [
            {
              name: 'FEParamGetTiposIva_response.xml',
              sha256: String(manifest.iva_respuesta_original_sha256 || '').toLowerCase(),
            },
            {
              name: 'FEParamGetCondicionIvaReceptor_response.xml',
              sha256: String(manifest.condition_respuesta_original_sha256 || '').toLowerCase(),
            },
          ]
        : []

  const normalizedArtifacts =
    params.normalizedArtifacts !== undefined
      ? params.normalizedArtifacts
      : manifest
        ? [
            {
              name: 'FEParamGetTiposIva_normalized.json',
              sha256: String(manifest.iva_archivo_normalizado_sha256 || '').toLowerCase(),
            },
            {
              name: 'FEParamGetCondicionIvaReceptor_normalized.json',
              sha256: String(manifest.condition_archivo_normalizado_sha256 || '').toLowerCase(),
            },
          ]
        : []

  const consultadoEn =
    params.consultadoEn !== undefined
      ? params.consultadoEn
      : manifest
        ? manifest.consultado_en
        : ''
  const requestedAt =
    params.requestedAt !== undefined
      ? params.requestedAt
      : params.now !== undefined
        ? typeof params.now === 'string' || typeof params.now === 'number'
          ? new Date(params.now).toISOString()
          : params.now.toISOString()
        : consultadoEn
  const collectorIdentity =
    params.collectorIdentity !== undefined
      ? params.collectorIdentity
      : manifest && manifest.colector_identidad !== undefined
        ? manifest.colector_identidad
        : PR02_P0_COLECTOR_IDENTIDAD

  const draft = {
    schemaVersion,
    requestId,
    processId,
    executionScope,
    commitSha,
    environment,
    authorizationId,
    goAuthorizationDocumentSha256,
    manifestSha256,
    rawSoapArtifacts: Array.isArray(rawSoapArtifacts)
      ? Object.freeze(rawSoapArtifacts.map((item) => Object.freeze({ name: item.name, sha256: String(item.sha256 || '').toLowerCase() })))
      : rawSoapArtifacts,
    normalizedArtifacts: Array.isArray(normalizedArtifacts)
      ? Object.freeze(normalizedArtifacts.map((item) => Object.freeze({ name: item.name, sha256: String(item.sha256 || '').toLowerCase() })))
      : normalizedArtifacts,
    consultadoEn,
    requestedAt,
    collectorIdentity,
  }

  const requestSha256 = computeAttestationRequestDigest(draft)
  const requestPkg = Object.freeze({
    ...draft,
    requestSha256,
    canonicalPayloadSha256: requestSha256,
  })

  validateAttestationRequest(requestPkg)
  return requestPkg
}

/**
 * Guarda explícita contra cualquier intento de autoelevar SELF_ATTESTED a INDEPENDENT_ATTESTED
 * mediante booleanos, opciones, variables de entorno o mutación directa de JSON sin firma válida.
 */
export function assertNoSelfAttestationElevation(attestation, options = {}) {
  const env = (options && options.env) || options || process.env
  if (
    (options &&
      (options.elevateToIndependent === true ||
        options.forceIndependentAttestation === true ||
        options.allowSelfAttestedAsIndependent === true ||
        options.independentAuthorityAvailable === true ||
        options.elevateTrustModel === true ||
        options.forceProductionAuthority === true ||
        options.ATTESTATION_TRUST_MODEL === 'INDEPENDENT_ATTESTED' ||
        options.trustModel === 'INDEPENDENT_ATTESTED' ||
        options.P1_IMPORT_ALLOWED === true)) ||
    Boolean(env.PR02_P0_FORCE_INDEPENDENT_ATTESTATION) ||
    env.ATTESTATION_TRUST_MODEL === 'INDEPENDENT_ATTESTED' ||
    env.P1_IMPORT_ALLOWED === 'true' ||
    env.INDEPENDENT_ATTESTATION_AVAILABLE === 'true'
  ) {
    throw new Error('SELF_ATTESTATION_AUTO_ELEVATION_REJECTED: Prohibido autoelevar SELF_ATTESTED a INDEPENDENT_ATTESTED mediante opciones, flags o variables de entorno')
  }

  if (!attestation || typeof attestation !== 'object') {
    throw new Error('SELF_ATTESTATION_AUTO_ELEVATION_REJECTED: Atestación ausente o inválida')
  }

  if (
    attestation.trustModel === 'SELF_ATTESTED' ||
    attestation.ATTESTATION_TRUST_MODEL === 'SELF_ATTESTED' ||
    attestation.independentAuthorityAvailable === true
  ) {
    throw new Error('SELF_ATTESTATION_AUTO_ELEVATION_REJECTED: Una atestación SELF_ATTESTED o booleano independentAuthorityAvailable no puede elevarse a INDEPENDENT_ATTESTED')
  }

  if (
    attestation.trustModel === 'INDEPENDENT_ATTESTED' ||
    attestation.ATTESTATION_TRUST_MODEL === 'INDEPENDENT_ATTESTED' ||
    attestation.P1_IMPORT_ALLOWED === true ||
    attestation.INDEPENDENT_ATTESTATION_AVAILABLE === true
  ) {
    if (!attestation.signature || typeof attestation.signature !== 'string' || !/^[0-9a-fA-F]{128}$/.test(attestation.signature)) {
      throw new Error('SELF_ATTESTATION_AUTO_ELEVATION_REJECTED: Intento de declarar INDEPENDENT_ATTESTED modificando JSON sin firma criptográfica Ed25519 válida')
    }
    if (
      attestation.EVIDENCE_CUSTODY_ATTESTED === false ||
      attestation.accredited !== true ||
      attestation.TRUSTED_EXECUTION_BOUNDARY !== 'VERIFIED' ||
      attestation.provenance === 'UNVERIFIED'
    ) {
      throw new Error('SELF_ATTESTATION_AUTO_ELEVATION_REJECTED: Evidencia SELF_ATTESTED con JSON parcialmente modificado detectada y rechazada')
    }
  }

  return true
}

/**
 * Crea una constancia local (auto-atestación) de adquisición de evidencia P0.
 * Toda atestación generada por el colector local es taxativamente SELF_ATTESTED y no acreditada.
 * Prohibido autoelevar a INDEPENDENT_ATTESTED desde el colector.
 */
export function createP0Attestation(params = {}) {
  if (!params || typeof params !== 'object') {
    throw new Error('P0_ATTESTATION_PARAMS_REQUIRED: Se requieren parámetros para atestación P0')
  }

  if (
    params.trustModel === 'INDEPENDENT_ATTESTED' ||
    params.ATTESTATION_TRUST_MODEL === 'INDEPENDENT_ATTESTED' ||
    params.elevateToIndependent === true ||
    params.forceIndependentAttestation === true
  ) {
    throw new Error('SELF_ATTESTATION_AUTO_ELEVATION_REJECTED: El colector P0 no puede emitir ni autoelevar atestaciones a INDEPENDENT_ATTESTED')
  }

  const {
    manifest,
    commitSha,
    transportType = 'SIMULATED',
    goAuthorizationId,
    goAuthorizationSha256,
    goAuthorization,
    executorIdentity,
    operacionesWsfe,
    now = new Date(),
  } = params

  if (!manifest || typeof manifest !== 'object') {
    throw new Error('P0_ATTESTATION_MANIFEST_REQUIRED: Se requiere objeto de manifiesto para atestación')
  }

  const isOfficialTransport = transportType === 'OFFICIAL'
  const issuedAt = typeof now === 'string' || typeof now === 'number' ? new Date(now).toISOString() : now.toISOString()

  // Extracción de identificador no secreto y digest de autorización GO
  let authId = goAuthorizationId ? String(goAuthorizationId).trim() : null
  let authSha = goAuthorizationSha256 ? String(goAuthorizationSha256).trim().toLowerCase() : null

  if (!authId || !authSha) {
    if (goAuthorization && typeof goAuthorization === 'object') {
      authId = goAuthorization.identificador || goAuthorization.authorizationId || null
      authSha = goAuthorization.documentSha256 || sha256(JSON.stringify(goAuthorization))
    } else if (goAuthorization && typeof goAuthorization === 'string') {
      authId = goAuthorization.trim()
      authSha = sha256(goAuthorization.trim())
    }
  }

  // Toda atestación generada por el colector local es SELF_ATTESTED y no acreditada
  return Object.freeze({
    version: '1.0',
    processId: manifest.identificador_proceso || 'SIMULATED',
    executionId: manifest.ejecucion_autorizada_id || 'SIMULATED',
    executionScope: manifest.ejecucion_autorizada_scope || PR02_P0_SCOPE,
    commitSha: commitSha ? String(commitSha).toLowerCase() : '0'.repeat(40),
    consultadoEn: manifest.consultado_en || issuedAt,
    entorno: manifest.entorno || 'HOMOLOGACION',
    transportType: isOfficialTransport ? 'OFFICIAL' : 'SIMULATED',
    executorIdentity: executorIdentity || manifest.colector_identidad || PR02_P0_COLECTOR_IDENTIDAD,
    operacionesWsfe: operacionesWsfe || Object.freeze(['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor']),
    ivaRawSha: manifest.iva_respuesta_original_sha256 || '0'.repeat(64),
    ivaNormSha: manifest.iva_archivo_normalizado_sha256 || '0'.repeat(64),
    condRawSha: manifest.condition_respuesta_original_sha256 || '0'.repeat(64),
    condNormSha: manifest.condition_archivo_normalizado_sha256 || '0'.repeat(64),
    goAuthorizationId: authId || null,
    goAuthorizationSha256: authSha || null,
    issuedAt,
    signature: null,
    accredited: false,
    provenance: 'UNVERIFIED',
    EVIDENCE_INTEGRITY: 'PASS',
    EVIDENCE_CUSTODY_ATTESTED: false,
    ATTESTATION_TRUST_MODEL: isOfficialTransport ? 'SELF_ATTESTED' : 'UNVERIFIED',
    TRUSTED_EXECUTION_BOUNDARY: 'UNVERIFIED',
    ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED: false,
    INDEPENDENT_ATTESTATION_AVAILABLE: false,
    P1_IMPORT_ALLOWED: false,
    trustModel: isOfficialTransport ? 'SELF_ATTESTED' : 'SIMULATED',
    antiReplayGuarantee: ANTI_REPLAY_GUARANTEE_LEVEL,
  })
}

/**
 * Verificador criptográfico exhaustivo de atestación independiente (P1 Verifier / IndependentAttestationAuthority).
 * Verifica las 15 condiciones obligatorias para otorgar ATTESTATION_TRUST_MODEL = INDEPENDENT_ATTESTED.
 */
export function verifyIndependentAttestation(attestation, options = {}) {
  const deniedBase = {
    valid: false,
    P1_IMPORT_ALLOWED: false,
    INDEPENDENT_ATTESTATION_AVAILABLE: false,
    EVIDENCE_CUSTODY_ATTESTED: false,
    ATTESTATION_TRUST_MODEL: 'UNVERIFIED',
    TRUSTED_EXECUTION_BOUNDARY: 'UNVERIFIED',
    ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED: false,
  }

  // Condición 15: Ninguna clave privada ni capacidad de firma en el runtime fiscal
  const runtimeCheck = verifyRuntimeSigningIsolation({
    fiscalScriptsDir: options.fiscalScriptsDir,
    env: options.env,
  })
  if (!runtimeCheck.valid) {
    return Object.freeze({
      ...deniedBase,
      reason: 'RUNTIME_PRIVATE_KEY_DETECTED',
      errorCategory: 'COMPROMISED_RUNTIME_BOUNDARY',
      detail: runtimeCheck.detail,
    })
  }

  if (!attestation || typeof attestation !== 'object') {
    return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_MISSING' })
  }

  // Condición 14: Sin declaración fraudulenta de verificación criptográfica directa de ARCA
  if (attestation.ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED === true) {
    return Object.freeze({ ...deniedBase, reason: 'FRAUDULENT_ARCA_CRYPTOGRAPHIC_VERIFICATION_CLAIM' })
  }

  // Regla de no autoelevación por opciones o entorno
  const env = options.env || process.env
  if (
    options.elevateToIndependent === true ||
    options.forceIndependentAttestation === true ||
    options.allowSelfAttestedAsIndependent === true ||
    options.independentAuthorityAvailable === true ||
    options.elevateTrustModel === true ||
    options.forceProductionAuthority === true ||
    Boolean(env.PR02_P0_FORCE_INDEPENDENT_ATTESTATION)
  ) {
    return Object.freeze({
      ...deniedBase,
      reason: 'SELF_ATTESTATION_AUTO_ELEVATION_REJECTED',
      errorCategory: 'UNTRUSTED_SELF_ATTESTATION',
    })
  }

  if (attestation.trustModel === 'SELF_ATTESTED' || attestation.ATTESTATION_TRUST_MODEL === 'SELF_ATTESTED') {
    return Object.freeze({
      ...deniedBase,
      ATTESTATION_TRUST_MODEL: 'SELF_ATTESTED',
      reason: 'ATTESTATION_SELF_ATTESTED_REJECTED',
      errorCategory: 'UNTRUSTED_SELF_ATTESTATION',
    })
  }

  if (attestation.trustModel !== 'INDEPENDENT_ATTESTED') {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_UNTRUSTED_MODEL',
      errorCategory: 'UNTRUSTED_ATTESTATION',
    })
  }

  if (attestation.EVIDENCE_CUSTODY_ATTESTED === false || attestation.provenance === 'UNVERIFIED') {
    return Object.freeze({
      ...deniedBase,
      reason: 'SELF_ATTESTATION_AUTO_ELEVATION_REJECTED',
      errorCategory: 'UNTRUSTED_SELF_ATTESTATION',
    })
  }

  if (attestation.accredited !== true) {
    return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_NOT_ACCREDITED' })
  }
  if (attestation.TRUSTED_EXECUTION_BOUNDARY !== 'VERIFIED') {
    return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_BOUNDARY_UNVERIFIED' })
  }
  if (attestation.transportType !== 'OFFICIAL') {
    return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_SIMULATED_TRANSPORT' })
  }

  if (!attestation.signature || typeof attestation.signature !== 'string' || !/^[0-9a-fA-F]{128}$/.test(attestation.signature)) {
    return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_SIGNATURE_INVALID' })
  }
  if (attestation.executorIdentity !== PR02_P0_COLECTOR_IDENTIDAD) {
    return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_EXECUTOR_MISMATCH' })
  }
  if (!attestation.goAuthorizationId || typeof attestation.goAuthorizationId !== 'string' || attestation.goAuthorizationId.trim().length === 0) {
    return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_GO_ID_MISSING' })
  }
  if (!attestation.goAuthorizationSha256 || typeof attestation.goAuthorizationSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(attestation.goAuthorizationSha256)) {
    return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_GO_SHA_INVALID' })
  }

  // Condición 10: Scope correcto
  if (attestation.executionScope !== PR02_P0_SCOPE) {
    return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_SCOPE_MISMATCH' })
  }

  // Condición 12: Entorno correcto (exclusivamente HOMOLOGACION)
  const attEnv = attestation.environment !== undefined ? attestation.environment : attestation.entorno
  if (attEnv !== 'HOMOLOGACION' || (attestation.entorno !== undefined && attestation.entorno !== 'HOMOLOGACION')) {
    return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_ENVIRONMENT_MISMATCH' })
  }

  // Condición 13: Sin expiración
  if (!attestation.issuedAt || !Number.isFinite(Date.parse(attestation.issuedAt))) {
    return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_ISSUED_AT_INVALID' })
  }
  const expiresAtRaw = attestation.expiresAt || attestation.venceEn || attestation.vence_en
  if (expiresAtRaw !== undefined && expiresAtRaw !== null) {
    const expMs = Date.parse(expiresAtRaw)
    if (!Number.isFinite(expMs)) {
      return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_EXPIRATION_INVALID' })
    }
    const nowMs = options.now
      ? typeof options.now === 'string' || typeof options.now === 'number'
        ? new Date(options.now).getTime()
        : options.now.getTime()
      : Date.now()
    if (expMs <= nowMs) {
      return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_EXPIRED' })
    }
  }

  const { manifest, commitSha, expectedHead, trustedAttestationPublicKey, authoritySecret, trustedGoPublicKey, attestationRequest } = options

  // Condición 11: Commit SHA correcto
  const targetCommit = commitSha || expectedHead
  if (!attestation.commitSha || !/^[0-9a-fA-F]{40}$/.test(attestation.commitSha)) {
    return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_COMMIT_INVALID' })
  }
  if (targetCommit) {
    if (attestation.commitSha.toLowerCase() !== String(targetCommit).toLowerCase()) {
      return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_COMMIT_MISMATCH' })
    }
  }

  // Condición 2: Clave pública confiable configurada explícitamente
  const rawKey =
    trustedAttestationPublicKey ||
    options.publicKeySpki ||
    authoritySecret ||
    process.env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV] ||
    process.env[PR02_P0_AUTHORITY_ENV]
  if (!rawKey) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_KEY_MISSING',
      errorCategory: 'ATTESTATION_AUTHORITY_NOT_AVAILABLE',
    })
  }
  let pubKeyObj
  try {
    pubKeyObj = validateP0AttestationPublicKey(rawKey, Boolean(options.allowTestKeys))
  } catch (err) {
    if (err.message.includes('RUNTIME_PRIVATE_KEY_DETECTED')) {
      return Object.freeze({
        ...deniedBase,
        reason: 'RUNTIME_PRIVATE_KEY_DETECTED',
        errorCategory: 'COMPROMISED_RUNTIME_BOUNDARY',
        detail: err.message,
      })
    }
    if (err.message.includes('P0_ATTESTATION_KEY_MISSING') || err.message.includes('ATTESTATION_AUTHORITY_NOT_AVAILABLE')) {
      return Object.freeze({
        ...deniedBase,
        reason: 'ATTESTATION_KEY_MISSING',
        errorCategory: 'ATTESTATION_AUTHORITY_NOT_AVAILABLE',
      })
    }
    if (err.message.includes('COMPROMISED')) {
      return Object.freeze({
        ...deniedBase,
        reason: 'ATTESTATION_KEY_COMPROMISED',
        errorCategory: 'UNTRUSTED_ATTESTATION_AUTHORITY',
      })
    }
    if (err.message.includes('TEST_KEY_PROHIBITED')) {
      return Object.freeze({
        ...deniedBase,
        reason: 'ATTESTATION_TEST_KEY_PROHIBITED',
        errorCategory: 'UNTRUSTED_ATTESTATION_AUTHORITY',
      })
    }
    return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_KEY_INVALID' })
  }

  // Condición 3: Separación estricta entre GO Authority e Independent Attestation Authority
  try {
    assertAuthoritiesSeparated({
      goAuthorityId:
        options.goAuthorityId ??
        options.trustedGoAuthorityId ??
        options.goApproverId ??
        (options.goAuthorizationDoc &&
          options.goAuthorizationDoc.authorization &&
          options.goAuthorizationDoc.authorization.aprobador_identidad),
      attestationAuthorityId:
        attestation.authorityId ??
        options.authorityId ??
        options.expectedAuthorityId,
      goKeyId:
        options.goKeyId ??
        options.trustedGoKeyId ??
        (options.goAuthorizationDoc &&
          options.goAuthorizationDoc.signature &&
          options.goAuthorizationDoc.signature.key_id),
      attestationKeyId:
        attestation.keyId ??
        options.keyId ??
        options.expectedKeyId ??
        computePublicKeyId(pubKeyObj),
      trustedGoPublicKey,
      trustedAttestationPublicKey: pubKeyObj,
      allowTestKeys: Boolean(options.allowTestKeys),
    })
  } catch (sepErr) {
    if (sepErr && sepErr.message && sepErr.message.includes('RUNTIME_PRIVATE_KEY_DETECTED')) {
      return Object.freeze({
        ...deniedBase,
        reason: 'RUNTIME_PRIVATE_KEY_DETECTED',
        errorCategory: 'COMPROMISED_RUNTIME_BOUNDARY',
        detail: sepErr.message,
      })
    }
    if (sepErr && sepErr.message && sepErr.message.includes('COLLAPSED_AUTHORITIES_REJECTED')) {
      return Object.freeze({
        ...deniedBase,
        reason: 'COLLAPSED_AUTHORITIES_REJECTED',
        errorCategory: 'COLLAPSED_AUTHORITIES_REJECTED',
      })
    }
    return Object.freeze({ ...deniedBase, reason: 'GO_AUTHORITY_KEY_INVALID' })
  }

  // Prohibición estricta de aceptar signers de test como producción
  if (
    !options.allowTestKeys &&
    (attestation.signerOrigin === ATTESTATION_SIGNER_ORIGINS.TEST_SIGNER ||
      attestation.isTestSigner === true ||
      attestation.authorityRole === 'TEST_SIGNER')
  ) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_TEST_SIGNER_PROHIBITED',
      errorCategory: 'UNTRUSTED_ATTESTATION_AUTHORITY',
    })
  }

  // Condición 1 y 4: Firma criptográfica Ed25519 válida sobre payload canónico íntegro
  const { signature, accredited, provenance, ...payload } = attestation
  const canonicalPayload = JSON.stringify(payload)
  const isSigValid = crypto.verify(null, Buffer.from(canonicalPayload, 'utf8'), pubKeyObj, Buffer.from(signature, 'hex'))

  if (!isSigValid) {
    return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_SIGNATURE_VERIFICATION_FAILED' })
  }

  // Condición 5, 6, 7, 8, 9: Coincidencia con el manifiesto y artefactos
  if (manifest) {
    if (
      attestation.ivaRawSha !== manifest.iva_respuesta_original_sha256 ||
      attestation.ivaNormSha !== manifest.iva_archivo_normalizado_sha256 ||
      attestation.condRawSha !== manifest.condition_respuesta_original_sha256 ||
      attestation.condNormSha !== manifest.condition_archivo_normalizado_sha256 ||
      attestation.executionScope !== manifest.ejecucion_autorizada_scope ||
      attestation.processId !== manifest.identificador_proceso ||
      (manifest.ejecucion_autorizada_id !== undefined && attestation.executionId !== manifest.ejecucion_autorizada_id) ||
      (manifest.consultado_en !== undefined && attestation.consultadoEn !== manifest.consultado_en) ||
      (manifest.entorno !== undefined && attestation.entorno !== manifest.entorno) ||
      (manifest.go_authorization_id !== undefined && manifest.go_authorization_id !== null && attestation.goAuthorizationId !== manifest.go_authorization_id) ||
      (manifest.go_authorization_sha256 !== undefined && manifest.go_authorization_sha256 !== null && attestation.goAuthorizationSha256 !== manifest.go_authorization_sha256)
    ) {
      return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_MANIFEST_MISMATCH' })
    }
    if (attestation.manifestSha256 && manifest.manifest_sha256) {
      const matchesManifestSha = attestation.manifestSha256 === manifest.manifest_sha256
      const matchesRequestManifestSha =
        attestationRequest && attestation.manifestSha256 === attestationRequest.manifestSha256
      if (!matchesManifestSha && !matchesRequestManifestSha) {
        return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_MANIFEST_DIGEST_MISMATCH' })
      }
    }
  }

  if (attestationRequest) {
    try {
      validateAttestationRequest(attestationRequest)
    } catch (reqErr) {
      return Object.freeze({ ...deniedBase, reason: `ATTESTATION_REQUEST_INVALID: ${reqErr.message}` })
    }
    const reqIvaRaw = attestationRequest.rawSoapArtifacts.find((a) => /tiposiva/i.test(a.name))
    const reqCondRaw = attestationRequest.rawSoapArtifacts.find((a) => /condicionivareceptor/i.test(a.name))
    const reqIvaNorm = attestationRequest.normalizedArtifacts.find((a) => /tiposiva/i.test(a.name))
    const reqCondNorm = attestationRequest.normalizedArtifacts.find((a) => /condicionivareceptor/i.test(a.name))
    if (
      attestation.processId !== attestationRequest.processId ||
      attestation.executionScope !== attestationRequest.executionScope ||
      attestation.commitSha.toLowerCase() !== attestationRequest.commitSha.toLowerCase() ||
      attestation.entorno !== attestationRequest.environment ||
      attestation.goAuthorizationId !== attestationRequest.authorizationId ||
      attestation.goAuthorizationSha256 !== attestationRequest.goAuthorizationDocumentSha256 ||
      !reqIvaRaw ||
      !reqCondRaw ||
      !reqIvaNorm ||
      !reqCondNorm ||
      attestation.ivaRawSha !== reqIvaRaw.sha256 ||
      attestation.condRawSha !== reqCondRaw.sha256 ||
      attestation.ivaNormSha !== reqIvaNorm.sha256 ||
      attestation.condNormSha !== reqCondNorm.sha256 ||
      (attestation.requestId !== undefined && attestation.requestId !== attestationRequest.requestId) ||
      (attestation.requestSha256 !== undefined && attestation.requestSha256 !== attestationRequest.requestSha256)
    ) {
      return Object.freeze({ ...deniedBase, reason: 'ATTESTATION_REQUEST_MISMATCH' })
    }
  }

  return Object.freeze({
    valid: true,
    reason: 'VERIFIED',
    trustModel: 'INDEPENDENT_ATTESTED',
    ATTESTATION_TRUST_MODEL: 'INDEPENDENT_ATTESTED',
    EVIDENCE_CUSTODY_ATTESTED: true,
    TRUSTED_EXECUTION_BOUNDARY: 'VERIFIED',
    ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED: false,
    INDEPENDENT_ATTESTATION_AVAILABLE: true,
    P1_IMPORT_ALLOWED: true,
  })
}

/**
 * Validador estricto de la atestación de adquisición oficial P0.
 * Delega en verifyIndependentAttestation garantizando las 15 condiciones de seguridad.
 */
export function verifyP0Attestation(attestation, options = {}) {
  return verifyIndependentAttestation(attestation, options)
}

/**
 * Serializa de forma canónica y determinista el payload firmable de una respuesta
 * de autoridad de atestación independiente (AttestationResponse).
 */
export function serializeCanonicalAttestationResponsePayload(res) {
  if (!res || typeof res !== 'object' || Array.isArray(res)) {
    throw new Error('ATTESTATION_RESPONSE_INVALID: Se requiere objeto estructurado de respuesta de atestación')
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
    ...(res.expiresAt !== undefined && res.expiresAt !== null ? { expiresAt: res.expiresAt } : {}),
    signerOrigin: res.signerOrigin,
  }
  return JSON.stringify(canonical)
}

/**
 * Calcula el digest SHA-256 canónico del payload firmable de AttestationResponse.
 */
export function computeAttestationResponsePayloadDigest(res) {
  return sha256(serializeCanonicalAttestationResponsePayload(res))
}

const ATTESTATION_RESPONSE_ALLOWED_KEYS = new Set([
  'schemaVersion',
  'responseId',
  'attestationId',
  'authorityType',
  'authorityId',
  'keyId',
  'algorithm',
  'requestId',
  'requestSha256',
  'manifestSha256',
  'processId',
  'executionScope',
  'commitSha',
  'environment',
  'authorizationId',
  'goAuthorizationDocumentSha256',
  'rawSoapArtifacts',
  'normalizedArtifacts',
  'consultadoEn',
  'issuedAt',
  'expiresAt',
  'signerOrigin',
  'attestationPayloadSha256',
  'signature',
])

/**
 * Verificador fail-closed del contrato explícito de respuesta de atestación (AttestationResponse)
 * emitido por una Autoridad de Atestación Independiente externa.
 *
 * OPERACIÓN DE SOLO LECTURA (VERIFY ≠ CONSUME):
 * - Verifica exclusivamente mediante clave pública Ed25519 y vincula solicitud, manifiesto y evidencia.
 * - NO consume la respuesta ni escribe en el registro durable de anti-replay (`consumed: false`).
 * - Puede invocarse múltiples veces para inspección o diagnóstico sin quemar la respuesta.
 */
export function verifyAttestationResponse(response, options = {}) {
  const deniedBase = {
    valid: false,
    consumed: false,
    ATTESTATION_RESPONSE_CONSUMPTION: 'NOT_CONSUMED',
    P1_IMPORT_ALLOWED: false,
    INDEPENDENT_ATTESTATION_AVAILABLE: false,
    PRODUCTION_ATTESTED: false,
    OFFICIAL_PROVENANCE_VERIFIED: false,
    EVIDENCE_CUSTODY_ATTESTED: false,
    ATTESTATION_TRUST_MODEL: 'UNVERIFIED',
    TRUSTED_EXECUTION_BOUNDARY: 'UNVERIFIED',
    ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED: false,
    antiReplayGuarantee: ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL,
  }

  const runtimeCheck = verifyRuntimeSigningIsolation({
    fiscalScriptsDir: options.fiscalScriptsDir,
    env: options.env,
  })
  if (!runtimeCheck.valid) {
    return Object.freeze({
      ...deniedBase,
      reason: 'RUNTIME_PRIVATE_KEY_DETECTED',
      errorCategory: 'COMPROMISED_RUNTIME_BOUNDARY',
      detail: runtimeCheck.detail,
    })
  }

  const env = options.env || process.env
  if (
    options.independentAuthorityAvailable === true ||
    options.elevateToIndependent === true ||
    options.forceIndependentAttestation === true ||
    options.allowSelfAttestedAsIndependent === true ||
    options.elevateTrustModel === true ||
    options.forceProductionAuthority === true ||
    Boolean(env.PR02_P0_FORCE_INDEPENDENT_ATTESTATION) ||
    env.INDEPENDENT_ATTESTATION_AVAILABLE === 'true'
  ) {
    return Object.freeze({
      ...deniedBase,
      reason: 'SELF_ATTESTATION_AUTO_ELEVATION_REJECTED',
      errorCategory: 'UNTRUSTED_SELF_ATTESTATION',
      detail: 'Prohibido autoelevar el modelo de confianza mediante booleanos como independentAuthorityAvailable: true o flags de entorno',
    })
  }

  if (response === undefined || response === null) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_RESPONSE_MISSING',
      detail: 'Respuesta de autoridad de atestación ausente',
    })
  }

  if (typeof response !== 'object' || Array.isArray(response)) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_RESPONSE_INVALID',
      detail: 'La respuesta de atestación debe ser un objeto estructurado',
    })
  }

  if (
    response.trustModel === 'SELF_ATTESTED' ||
    response.ATTESTATION_TRUST_MODEL === 'SELF_ATTESTED' ||
    response.independentAuthorityAvailable === true
  ) {
    return Object.freeze({
      ...deniedBase,
      reason: 'SELF_ATTESTATION_AUTO_ELEVATION_REJECTED',
      errorCategory: 'UNTRUSTED_SELF_ATTESTATION',
      detail: 'Una atestación SELF_ATTESTED o flag independentAuthorityAvailable no puede ser devuelta o elevada como independiente',
    })
  }

  // Rechazar cualquier campo inesperado o intento de modificar directamente el modelo de confianza
  for (const key of Object.keys(response)) {
    if (!ATTESTATION_RESPONSE_ALLOWED_KEYS.has(key)) {
      return Object.freeze({
        ...deniedBase,
        reason: 'ATTESTATION_RESPONSE_INVALID',
        errorCategory: 'UNEXPECTED_RESPONSE_FIELD',
        detail: `Campo inesperado o no permitido en respuesta de atestación: '${key}'`,
      })
    }
  }

  if (
    response.attestationId !== undefined &&
    response.responseId !== undefined &&
    response.attestationId !== response.responseId
  ) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_RESPONSE_INVALID',
      detail: 'Inconsistencia entre responseId y attestationId en la respuesta de atestación',
    })
  }

  // Rechazar presencia de secretos o credenciales
  const serializedLower = JSON.stringify(response).toLowerCase()
  for (const forbidden of [
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
  ]) {
    if (serializedLower.includes(forbidden)) {
      return Object.freeze({
        ...deniedBase,
        reason: 'ATTESTATION_RESPONSE_INVALID',
        errorCategory: 'SECRETS_PROHIBITED_IN_RESPONSE',
        detail: `Material sensible prohibido en respuesta de atestación ('${forbidden}')`,
      })
    }
  }

  // Validar algoritmo permitido (exclusivamente Ed25519)
  if (!response.algorithm || !ATTESTATION_ALLOWED_ALGORITHMS.includes(response.algorithm)) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_ALGORITHM_FORBIDDEN',
      detail: `Algoritmo '${response.algorithm}' prohibido; únicamente se permite Ed25519`,
    })
  }

  // Validar issuedAt y expiración
  if (!response.issuedAt || typeof response.issuedAt !== 'string' || !Number.isFinite(Date.parse(response.issuedAt))) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_ISSUED_AT_INVALID',
      detail: 'issuedAt ausente o no es una fecha ISO-8601 válida',
    })
  }
  const issuedMs = Date.parse(response.issuedAt)
  const nowMs = options.now
    ? typeof options.now === 'string' || typeof options.now === 'number'
      ? new Date(options.now).getTime()
      : options.now.getTime()
    : null
  if (nowMs !== null && Number.isFinite(nowMs) && issuedMs > nowMs + 60000) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_ISSUED_AT_INVALID',
      detail: 'issuedAt se encuentra en el futuro respecto al reloj de verificación',
    })
  }
  if (response.expiresAt !== undefined && response.expiresAt !== null) {
    if (typeof response.expiresAt !== 'string' || !Number.isFinite(Date.parse(response.expiresAt))) {
      return Object.freeze({
        ...deniedBase,
        reason: 'ATTESTATION_ISSUED_AT_INVALID',
        detail: 'expiresAt no es una fecha ISO-8601 válida',
      })
    }
    const expMs = Date.parse(response.expiresAt)
    const checkNow = nowMs !== null && Number.isFinite(nowMs) ? nowMs : Date.now()
    if (expMs <= checkNow) {
      return Object.freeze({
        ...deniedBase,
        reason: 'ATTESTATION_ISSUED_AT_INVALID',
        detail: 'La respuesta de atestación se encuentra expirada',
      })
    }
  }

  const effectiveResponseId = response.responseId || response.attestationId

  // Validar campos estructurales críticos (incluyendo ausencia de espacios extremos y formato hexadecimal estricto en minúsculas)
  if (
    response.schemaVersion !== '1.0' ||
    !effectiveResponseId ||
    typeof effectiveResponseId !== 'string' ||
    effectiveResponseId.trim().length === 0 ||
    effectiveResponseId !== effectiveResponseId.trim() ||
    !response.requestId ||
    typeof response.requestId !== 'string' ||
    response.requestId.trim().length === 0 ||
    response.requestId !== response.requestId.trim() ||
    !response.requestSha256 ||
    typeof response.requestSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(response.requestSha256) ||
    !response.manifestSha256 ||
    typeof response.manifestSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(response.manifestSha256) ||
    !response.processId ||
    typeof response.processId !== 'string' ||
    response.processId.trim().length === 0 ||
    response.executionScope !== PR02_P0_SCOPE ||
    !response.commitSha ||
    typeof response.commitSha !== 'string' ||
    !/^[0-9a-f]{40}$/.test(response.commitSha) ||
    response.environment !== 'HOMOLOGACION' ||
    !response.authorizationId ||
    typeof response.authorizationId !== 'string' ||
    response.authorizationId.trim().length === 0 ||
    !response.goAuthorizationDocumentSha256 ||
    typeof response.goAuthorizationDocumentSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(response.goAuthorizationDocumentSha256) ||
    !Array.isArray(response.rawSoapArtifacts) ||
    response.rawSoapArtifacts.length !== 2 ||
    response.rawSoapArtifacts[0].name !== 'FEParamGetTiposIva_response.xml' ||
    !/^[0-9a-f]{64}$/.test(response.rawSoapArtifacts[0].sha256 || '') ||
    response.rawSoapArtifacts[1].name !== 'FEParamGetCondicionIvaReceptor_response.xml' ||
    !/^[0-9a-f]{64}$/.test(response.rawSoapArtifacts[1].sha256 || '') ||
    !Array.isArray(response.normalizedArtifacts) ||
    response.normalizedArtifacts.length !== 2 ||
    response.normalizedArtifacts[0].name !== 'FEParamGetTiposIva_normalized.json' ||
    !/^[0-9a-f]{64}$/.test(response.normalizedArtifacts[0].sha256 || '') ||
    response.normalizedArtifacts[1].name !== 'FEParamGetCondicionIvaReceptor_normalized.json' ||
    !/^[0-9a-f]{64}$/.test(response.normalizedArtifacts[1].sha256 || '') ||
    !response.consultadoEn ||
    typeof response.consultadoEn !== 'string' ||
    !Number.isFinite(Date.parse(response.consultadoEn)) ||
    !response.attestationPayloadSha256 ||
    typeof response.attestationPayloadSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(response.attestationPayloadSha256) ||
    response.signature === undefined ||
    response.signature === null ||
    typeof response.signature !== 'string' ||
    response.signature.trim().length === 0
  ) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_RESPONSE_INVALID',
      detail: 'Faltan campos críticos o el formato estructural de la respuesta de atestación es inválido',
    })
  }

  // Validar authorityType, signerOrigin y prohibición de firmante de test como producción
  if (
    response.authorityType !== ATTESTATION_AUTHORITY_TYPES.PRODUCTION_AUTHORITY &&
    response.authorityType !== ATTESTATION_AUTHORITY_TYPES.TEST_AUTHORITY
  ) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_AUTHORITY_MISMATCH',
      detail: `authorityType '${response.authorityType}' inválido`,
    })
  }
  if (
    response.signerOrigin !== ATTESTATION_SIGNER_ORIGINS.PRODUCTION_ATTESTATION_AUTHORITY &&
    response.signerOrigin !== ATTESTATION_SIGNER_ORIGINS.TEST_SIGNER
  ) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_AUTHORITY_MISMATCH',
      detail: `signerOrigin '${response.signerOrigin}' inválido`,
    })
  }
  if (
    (response.authorityType === ATTESTATION_AUTHORITY_TYPES.TEST_AUTHORITY &&
      response.signerOrigin === ATTESTATION_SIGNER_ORIGINS.PRODUCTION_ATTESTATION_AUTHORITY) ||
    (response.authorityType === ATTESTATION_AUTHORITY_TYPES.PRODUCTION_AUTHORITY &&
      response.signerOrigin === ATTESTATION_SIGNER_ORIGINS.TEST_SIGNER)
  ) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_TEST_SIGNER_PROHIBITED',
      errorCategory: 'UNTRUSTED_ATTESTATION_AUTHORITY',
      detail: 'Inconsistencia entre authorityType y signerOrigin: prohibido presentar un firmante de test como autoridad de producción',
    })
  }
  if (
    !options.allowTestKeys &&
    (response.authorityType === ATTESTATION_AUTHORITY_TYPES.TEST_AUTHORITY ||
      response.signerOrigin === ATTESTATION_SIGNER_ORIGINS.TEST_SIGNER)
  ) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_TEST_SIGNER_PROHIBITED',
      errorCategory: 'UNTRUSTED_ATTESTATION_AUTHORITY',
      detail: 'Firmante o autoridad de test (TEST_AUTHORITY / TEST_SIGNER) prohibido en modo producción',
    })
  }

  if (!response.authorityId || typeof response.authorityId !== 'string' || response.authorityId.trim().length === 0) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_AUTHORITY_MISMATCH',
      detail: 'authorityId ausente o vacío',
    })
  }

  if (options.allowedAuthorityIds !== undefined) {
    const allowedAuths = Array.isArray(options.allowedAuthorityIds)
      ? options.allowedAuthorityIds
      : options.allowedAuthorityIds instanceof Set
        ? Array.from(options.allowedAuthorityIds)
        : []
    if (allowedAuths.length === 0 || !allowedAuths.includes(response.authorityId)) {
      return Object.freeze({
        ...deniedBase,
        reason: 'ATTESTATION_AUTHORITY_MISMATCH',
        detail: `authorityId '${response.authorityId}' no figura en las autoridades permitidas`,
      })
    }
  }
  const expectedAuthId = options.expectedAuthorityId ?? options.authorityId
  if (expectedAuthId !== undefined && expectedAuthId !== null && response.authorityId !== expectedAuthId) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_AUTHORITY_MISMATCH',
      detail: `authorityId '${response.authorityId}' no coincide con expectedAuthorityId '${expectedAuthId}'`,
    })
  }

  // Clave pública autorizada y verificación de keyId
  const rawKey =
    options.trustedAttestationPublicKey ||
    options.authorityPublicKey ||
    options.publicKeySpki ||
    options.authoritySecret ||
    process.env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV] ||
    process.env[PR02_P0_AUTHORITY_ENV]
  if (!rawKey) {
    return Object.freeze({
      ...deniedBase,
      reason: 'INDEPENDENT_ATTESTATION_AUTHORITY_NOT_AVAILABLE',
      errorCategory: 'ATTESTATION_AUTHORITY_NOT_AVAILABLE',
      detail: 'No existe clave pública de autoridad de atestación independiente configurada',
    })
  }

  let pubKeyObj
  try {
    pubKeyObj = validateP0AttestationPublicKey(rawKey, Boolean(options.allowTestKeys))
  } catch (err) {
    if (err.message.includes('RUNTIME_PRIVATE_KEY_DETECTED')) {
      return Object.freeze({
        ...deniedBase,
        reason: 'RUNTIME_PRIVATE_KEY_DETECTED',
        errorCategory: 'COMPROMISED_RUNTIME_BOUNDARY',
        detail: err.message,
      })
    }
    if (err.message.includes('TEST_KEY_PROHIBITED')) {
      return Object.freeze({
        ...deniedBase,
        reason: 'ATTESTATION_TEST_SIGNER_PROHIBITED',
        errorCategory: 'UNTRUSTED_ATTESTATION_AUTHORITY',
        detail: err.message,
      })
    }
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_KEY_ID_MISMATCH',
      detail: err.message,
    })
  }

  // Protección contra sustitución de clave pública (cuando existe una clave pública anclada / esperada)
  const pinnedRawKey = options.pinnedPublicKeySpki || options.expectedPublicKeySpki
  if (pinnedRawKey) {
    try {
      const pinnedKeyObj = validateP0AttestationPublicKey(pinnedRawKey, Boolean(options.allowTestKeys))
      const pinnedDer = pinnedKeyObj.export({ format: 'der', type: 'spki' })
      const currentDer = pubKeyObj.export({ format: 'der', type: 'spki' })
      if (!pinnedDer.equals(currentDer)) {
        return Object.freeze({
          ...deniedBase,
          reason: 'PUBLIC_KEY_SUBSTITUTION_REJECTED',
          errorCategory: 'PUBLIC_KEY_SUBSTITUTION_REJECTED',
          detail: 'La clave pública suministrada no coincide con la clave pública anclada (publicKeySpki) de la autoridad',
        })
      }
    } catch (pinErr) {
      return Object.freeze({
        ...deniedBase,
        reason: 'PUBLIC_KEY_SUBSTITUTION_REJECTED',
        errorCategory: 'PUBLIC_KEY_SUBSTITUTION_REJECTED',
        detail: pinErr && pinErr.message ? pinErr.message : String(pinErr),
      })
    }
  }

  const derivedKeyId = computePublicKeyId(pubKeyObj)

  const pinnedDerivedKeyId = pinnedRawKey
    ? computePublicKeyId(validateP0AttestationPublicKey(pinnedRawKey, Boolean(options.allowTestKeys)))
    : null
  const effectivePinnedKeyId = options.pinnedKeyId || pinnedDerivedKeyId
  if (effectivePinnedKeyId && options.keyId !== undefined && options.keyId !== null && options.keyId !== effectivePinnedKeyId) {
    return Object.freeze({
      ...deniedBase,
      reason: 'PUBLIC_KEY_SUBSTITUTION_REJECTED',
      errorCategory: 'PUBLIC_KEY_SUBSTITUTION_REJECTED',
      detail: `El keyId suministrado ('${options.keyId}') no coincide con el keyId anclado ('${effectivePinnedKeyId}')`,
    })
  }
  if (options.pinnedKeyId && response && response.keyId !== undefined && response.keyId !== null && response.keyId !== options.pinnedKeyId) {
    return Object.freeze({
      ...deniedBase,
      reason: 'PUBLIC_KEY_SUBSTITUTION_REJECTED',
      errorCategory: 'PUBLIC_KEY_SUBSTITUTION_REJECTED',
      detail: `El keyId de la respuesta ('${response.keyId}') no coincide con el keyId anclado ('${options.pinnedKeyId}')`,
    })
  }

  // Separación estricta de autoridades: GO_AUTHORITY_ID != ATTESTATION_AUTHORITY_ID, goKeyId != attestationKeyId y claves públicas distintas
  try {
    assertAuthoritiesSeparated({
      goAuthorityId:
        options.goAuthorityId ??
        options.trustedGoAuthorityId ??
        options.goApproverId ??
        (options.goAuthorizationDoc &&
          options.goAuthorizationDoc.authorization &&
          options.goAuthorizationDoc.authorization.aprobador_identidad),
      attestationAuthorityId: response.authorityId,
      goKeyId:
        options.goKeyId ??
        options.trustedGoKeyId ??
        (options.goAuthorizationDoc &&
          options.goAuthorizationDoc.signature &&
          options.goAuthorizationDoc.signature.key_id),
      attestationKeyId: response.keyId || derivedKeyId,
      trustedGoPublicKey: options.trustedGoPublicKey,
      trustedAttestationPublicKey: pubKeyObj,
      allowTestKeys: Boolean(options.allowTestKeys),
    })
  } catch (sepErr) {
    if (sepErr && sepErr.message && sepErr.message.includes('RUNTIME_PRIVATE_KEY_DETECTED')) {
      return Object.freeze({
        ...deniedBase,
        reason: 'RUNTIME_PRIVATE_KEY_DETECTED',
        errorCategory: 'COMPROMISED_RUNTIME_BOUNDARY',
        detail: sepErr.message,
      })
    }
    if (sepErr && sepErr.message && sepErr.message.includes('COLLAPSED_AUTHORITIES_REJECTED')) {
      return Object.freeze({
        ...deniedBase,
        reason: 'COLLAPSED_AUTHORITIES_REJECTED',
        errorCategory: 'COLLAPSED_AUTHORITIES_REJECTED',
        detail: sepErr.message,
      })
    }
    return Object.freeze({
      ...deniedBase,
      reason: 'GO_AUTHORITY_KEY_INVALID',
    })
  }

  const isKnownTestKey =
    isTestAuthorityKey(rawKey) ||
    isTestAuthorityKey(response.authorityId) ||
    Boolean(options.isTestAuthority)

  if (
    isKnownTestKey &&
    (response.authorityType === ATTESTATION_AUTHORITY_TYPES.PRODUCTION_AUTHORITY ||
      response.signerOrigin === ATTESTATION_SIGNER_ORIGINS.PRODUCTION_ATTESTATION_AUTHORITY)
  ) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_TEST_SIGNER_PROHIBITED',
      errorCategory: 'UNTRUSTED_ATTESTATION_AUTHORITY',
      detail: 'Una clave o autoridad de test jamás puede emitir una respuesta declarando PRODUCTION_AUTHORITY o PRODUCTION_ATTESTATION_AUTHORITY',
    })
  }

  if (!response.keyId || typeof response.keyId !== 'string' || response.keyId.trim().length === 0) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_KEY_ID_MISMATCH',
      detail: 'keyId ausente o vacío',
    })
  }

  if (options.allowedKeyIds !== undefined) {
    const allowedKeys = Array.isArray(options.allowedKeyIds)
      ? options.allowedKeyIds
      : options.allowedKeyIds instanceof Set
        ? Array.from(options.allowedKeyIds)
        : []
    if (allowedKeys.length === 0 || !allowedKeys.includes(response.keyId)) {
      return Object.freeze({
        ...deniedBase,
        reason: 'ATTESTATION_KEY_ID_MISMATCH',
        detail: `keyId '${response.keyId}' no figura en allowedKeyIds`,
      })
    }
  }
  if (options.expectedKeyId !== undefined && response.keyId !== options.expectedKeyId) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_KEY_ID_MISMATCH',
      detail: `keyId '${response.keyId}' no coincide con expectedKeyId '${options.expectedKeyId}'`,
    })
  }
  if (response.keyId !== derivedKeyId) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_KEY_ID_MISMATCH',
      detail: `keyId '${response.keyId}' no corresponde a la huella SPKI de la clave pública autorizada ('${derivedKeyId}')`,
    })
  }

  // Verificar digest canónico del payload y firma Ed25519
  const canonicalPayload = serializeCanonicalAttestationResponsePayload(response)
  const expectedPayloadSha256 = sha256(canonicalPayload)
  if (response.attestationPayloadSha256 !== expectedPayloadSha256) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_PAYLOAD_MISMATCH',
      detail: 'attestationPayloadSha256 no coincide con la serialización canónica del payload de la respuesta',
    })
  }

  if (!/^[0-9a-f]{128}$/.test(response.signature)) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_SIGNATURE_INVALID',
      detail: 'Formato de firma Ed25519 inválido (se requieren 128 caracteres hexadecimales en minúsculas)',
    })
  }

  const sigValid = crypto.verify(
    null,
    Buffer.from(canonicalPayload, 'utf8'),
    pubKeyObj,
    Buffer.from(response.signature, 'hex')
  )
  if (!sigValid) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_SIGNATURE_INVALID',
      detail: 'La firma criptográfica Ed25519 de la respuesta de atestación no verifica con la clave pública autorizada',
    })
  }

  const targetCommit = options.commitSha || options.expectedHead
  if (targetCommit && (typeof targetCommit !== 'string' || !/^[0-9a-f]{40}$/.test(targetCommit) || response.commitSha !== targetCommit)) {
    return Object.freeze({
      ...deniedBase,
      reason: 'ATTESTATION_REQUEST_MISMATCH',
      detail: 'commitSha de la respuesta no coincide exactamente (40 hex en minúsculas) con el commit esperado',
    })
  }

  // Verificar vinculación con AttestationRequestPackage y manifiesto
  const { attestationRequest, manifest } = options
  if (attestationRequest) {
    try {
      validateAttestationRequest(attestationRequest)
    } catch (reqErr) {
      return Object.freeze({
        ...deniedBase,
        reason: 'ATTESTATION_REQUEST_MISMATCH',
        detail: `Solicitud de atestación inválida: ${reqErr.message}`,
      })
    }

    if (
      response.requestSha256 !== attestationRequest.requestSha256 ||
      response.requestId !== attestationRequest.requestId
    ) {
      return Object.freeze({
        ...deniedBase,
        reason: 'ATTESTATION_REQUEST_MISMATCH',
        detail: 'requestSha256 o requestId de la respuesta no coincide con el AttestationRequestPackage',
      })
    }

    if (response.manifestSha256 !== attestationRequest.manifestSha256) {
      return Object.freeze({
        ...deniedBase,
        reason: 'ATTESTATION_MANIFEST_MISMATCH',
        detail: 'manifestSha256 de la respuesta no coincide con el manifestSha256 de la solicitud',
      })
    }

    const reqIvaRaw = attestationRequest.rawSoapArtifacts.find((a) => /tiposiva/i.test(a.name))
    const reqCondRaw = attestationRequest.rawSoapArtifacts.find((a) => /condicionivareceptor/i.test(a.name))
    const reqIvaNorm = attestationRequest.normalizedArtifacts.find((a) => /tiposiva/i.test(a.name))
    const reqCondNorm = attestationRequest.normalizedArtifacts.find((a) => /condicionivareceptor/i.test(a.name))
    const resIvaRaw = response.rawSoapArtifacts.find((a) => /tiposiva/i.test(a.name))
    const resCondRaw = response.rawSoapArtifacts.find((a) => /condicionivareceptor/i.test(a.name))
    const resIvaNorm = response.normalizedArtifacts.find((a) => /tiposiva/i.test(a.name))
    const resCondNorm = response.normalizedArtifacts.find((a) => /condicionivareceptor/i.test(a.name))

    if (
      response.processId !== attestationRequest.processId ||
      response.executionScope !== attestationRequest.executionScope ||
      response.commitSha !== attestationRequest.commitSha ||
      response.environment !== attestationRequest.environment ||
      response.authorizationId !== attestationRequest.authorizationId ||
      response.goAuthorizationDocumentSha256 !== attestationRequest.goAuthorizationDocumentSha256 ||
      response.consultadoEn !== attestationRequest.consultadoEn ||
      !reqIvaRaw ||
      !reqCondRaw ||
      !reqIvaNorm ||
      !reqCondNorm ||
      !resIvaRaw ||
      !resCondRaw ||
      !resIvaNorm ||
      !resCondNorm ||
      resIvaRaw.sha256 !== reqIvaRaw.sha256 ||
      resCondRaw.sha256 !== reqCondRaw.sha256 ||
      resIvaNorm.sha256 !== reqIvaNorm.sha256 ||
      resCondNorm.sha256 !== reqCondNorm.sha256
    ) {
      return Object.freeze({
        ...deniedBase,
        reason: 'ATTESTATION_REQUEST_MISMATCH',
        detail: 'Los metadatos o hashes de artefactos de la respuesta no coinciden con la solicitud de atestación',
      })
    }
  }

  if (manifest) {
    const resIvaRaw = response.rawSoapArtifacts.find((a) => /tiposiva/i.test(a.name))
    const resCondRaw = response.rawSoapArtifacts.find((a) => /condicionivareceptor/i.test(a.name))
    const resIvaNorm = response.normalizedArtifacts.find((a) => /tiposiva/i.test(a.name))
    const resCondNorm = response.normalizedArtifacts.find((a) => /condicionivareceptor/i.test(a.name))

    const matchesCurrentManifestSha = response.manifestSha256 === manifest.manifest_sha256
    const matchesRequestPreAttestedManifestSha =
      Boolean(attestationRequest) && response.manifestSha256 === attestationRequest.manifestSha256

    if (
      (!matchesCurrentManifestSha && !matchesRequestPreAttestedManifestSha) ||
      !resIvaRaw ||
      !resCondRaw ||
      !resIvaNorm ||
      !resCondNorm ||
      resIvaRaw.sha256 !== manifest.iva_respuesta_original_sha256 ||
      resIvaNorm.sha256 !== manifest.iva_archivo_normalizado_sha256 ||
      resCondRaw.sha256 !== manifest.condition_respuesta_original_sha256 ||
      resCondNorm.sha256 !== manifest.condition_archivo_normalizado_sha256 ||
      response.processId !== manifest.identificador_proceso ||
      response.executionScope !== manifest.ejecucion_autorizada_scope ||
      (manifest.consultado_en !== undefined && response.consultadoEn !== manifest.consultado_en) ||
      (manifest.entorno !== undefined && response.environment !== manifest.entorno) ||
      (manifest.go_authorization_id !== undefined &&
        manifest.go_authorization_id !== null &&
        response.authorizationId !== manifest.go_authorization_id) ||
      (manifest.go_authorization_sha256 !== undefined &&
        manifest.go_authorization_sha256 !== null &&
        response.goAuthorizationDocumentSha256 !== manifest.go_authorization_sha256)
    ) {
      return Object.freeze({
        ...deniedBase,
        reason: 'ATTESTATION_MANIFEST_MISMATCH',
        detail: 'Los digests o metadatos de la respuesta de atestación no coinciden con el manifiesto de evidencia P0',
      })
    }
  }

  const replayId = computeAttestationResponseReplayId(response)

  // VERIFY ≠ CONSUME:
  // verifyAttestationResponse es una operación pura y sin efectos secundarios sobre el estado anti-replay.
  // Si el caller solicita explícitamente checkReplay: true, se realiza una consulta de solo lectura.
  if (options.checkReplay === true) {
    try {
      if (isAttestationResponseConsumedDurable(response, options)) {
        return Object.freeze({
          ...deniedBase,
          replayId,
          reason: 'ATTESTATION_RESPONSE_REPLAY_DETECTED',
          errorCategory: 'REPLAY_ATTACK_DETECTED',
          detail: 'Respuesta de atestación ya consumida en el registro durable del host (HOST_LOCAL_DURABLE_ONE_TIME_USE)',
        })
      }
    } catch (err) {
      return Object.freeze({
        ...deniedBase,
        replayId,
        reason: 'ATTESTATION_REPLAY_STORAGE_INVALID',
        detail: err && err.message ? err.message : String(err),
      })
    }
  }

  const isTestSigner =
    isKnownTestKey ||
    response.authorityType === ATTESTATION_AUTHORITY_TYPES.TEST_AUTHORITY ||
    response.signerOrigin === ATTESTATION_SIGNER_ORIGINS.TEST_SIGNER

  if (isTestSigner) {
    return Object.freeze({
      valid: true,
      consumed: false,
      ATTESTATION_RESPONSE_CONSUMPTION: 'NOT_CONSUMED',
      replayId,
      responseId: effectiveResponseId,
      attestationId: effectiveResponseId,
      reason: 'VERIFIED_TEST_ONLY',
      authorityType: ATTESTATION_AUTHORITY_TYPES.TEST_AUTHORITY,
      authorityId: response.authorityId,
      keyId: response.keyId,
      algorithm: response.algorithm,
      requestId: response.requestId,
      requestSha256: response.requestSha256,
      manifestSha256: response.manifestSha256,
      attestationPayloadSha256: response.attestationPayloadSha256,
      trustScope: 'TEST_ONLY',
      trustModel: 'TEST_ONLY',
      ATTESTATION_TRUST_MODEL: 'TEST_ONLY',
      PRODUCTION_ATTESTED: false,
      OFFICIAL_PROVENANCE_VERIFIED: false,
      ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED: false,
      EVIDENCE_CUSTODY_ATTESTED: true,
      TRUSTED_EXECUTION_BOUNDARY: 'VERIFIED',
      INDEPENDENT_ATTESTATION_AVAILABLE: false,
      P1_IMPORT_ALLOWED: false,
      antiReplayGuarantee: ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL,
    })
  }

  return Object.freeze({
    valid: true,
    consumed: false,
    ATTESTATION_RESPONSE_CONSUMPTION: 'NOT_CONSUMED',
    replayId,
    responseId: effectiveResponseId,
    attestationId: effectiveResponseId,
    reason: 'VERIFIED',
    authorityType: ATTESTATION_AUTHORITY_TYPES.PRODUCTION_AUTHORITY,
    authorityId: response.authorityId,
    keyId: response.keyId,
    algorithm: response.algorithm,
    requestId: response.requestId,
    requestSha256: response.requestSha256,
    manifestSha256: response.manifestSha256,
    attestationPayloadSha256: response.attestationPayloadSha256,
    trustScope: 'PRODUCTION_ATTESTED',
    trustModel: 'INDEPENDENT_ATTESTED',
    ATTESTATION_TRUST_MODEL: 'INDEPENDENT_ATTESTED',
    PRODUCTION_ATTESTED: true,
    OFFICIAL_PROVENANCE_VERIFIED: true,
    ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED: false,
    EVIDENCE_CUSTODY_ATTESTED: true,
    TRUSTED_EXECUTION_BOUNDARY: 'VERIFIED',
    INDEPENDENT_ATTESTATION_AVAILABLE: true,
    P1_IMPORT_ALLOWED: true,
    antiReplayGuarantee: ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL,
  })
}

/**
 * Valida fail-closed una respuesta de atestación (AttestationResponse) SIN consumirla (`consumed: false`).
 * Lanza error tipado si la respuesta no supera cualquiera de las verificaciones.
 */
export function validateAttestationResponse(response, options = {}) {
  const result = verifyAttestationResponse(response, options)
  if (!result.valid) {
    throw new Error(`${result.reason}: ${result.detail || result.reason}`)
  }
  return result
}

function resolveAttestationReplayDirOption(options = {}) {
  const env = options.env || process.env
  return (
    options.consumedResponsesDir ??
    options.attestationReplayDir ??
    options.replayRegistryDir ??
    env?.[PR02_P0_ATTESTATION_REPLAY_DIR_ENV]
  )
}

function assertNoAntiReplayDowngradeFlags(optionsOrConfig = {}, includePrefix = false) {
  if (!optionsOrConfig || typeof optionsOrConfig !== 'object') return
  const prefix = includePrefix ? 'ATTESTATION_RESPONSE_CONSUMPTION_DENIED: ' : ''
  if (
    optionsOrConfig.allowProcessLocalFallback === true ||
    optionsOrConfig.degradeToProcessLocal === true ||
    optionsOrConfig.fallbackToMemory === true ||
    Boolean(optionsOrConfig.processLocal) ||
    Boolean(optionsOrConfig.fallback) ||
    Boolean(optionsOrConfig.allowMemoryReplay) ||
    Boolean(optionsOrConfig.disableDurableReplay) ||
    Boolean(optionsOrConfig.skipReplayStorage) ||
    Boolean(optionsOrConfig.inMemoryReplay) ||
    optionsOrConfig.enforceAntiReplay === false ||
    optionsOrConfig.consumeOnVerify === false ||
    (optionsOrConfig.antiReplayGuarantee !== undefined &&
      optionsOrConfig.antiReplayGuarantee !== ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL)
  ) {
    throw new Error(
      `${prefix}ANTI_REPLAY_DOWNGRADE_FORBIDDEN: Prohibido deshabilitar el anti-replay durable o degradar a PROCESS_LOCAL_ONE_TIME_USE`
    )
  }
}

function inspectExistingReplayLockFile(filePath, expectedTarget = null) {
  const st = lstatIfExists(filePath)
  if (!st) {
    throw new Error(
      `ATTESTATION_RESPONSE_CONSUMPTION_DENIED: REPLAY_STORAGE_STATE_INCONSISTENT: El archivo de bloqueo anti-replay esperado '${filePath}' no existe`
    )
  }
  if (st.isSymbolicLink() || !st.isFile()) {
    throw new Error(
      `ATTESTATION_RESPONSE_CONSUMPTION_DENIED: SYMLINK_FORBIDDEN: El archivo de bloqueo anti-replay existente '${filePath}' es un symlink o no es un archivo regular`
    )
  }
  if (st.size === 0) {
    throw new Error(
      'ATTESTATION_RESPONSE_CONSUMPTION_DENIED: REPLAY_STORAGE_STATE_INCONSISTENT: El archivo de bloqueo anti-replay existente se encuentra vacío (0 bytes)'
    )
  }
  let rawText
  try {
    rawText = fs.readFileSync(filePath, 'utf8')
  } catch (readErr) {
    throw new Error(
      `ATTESTATION_RESPONSE_CONSUMPTION_DENIED: REPLAY_STORAGE_STATE_INCONSISTENT: No se pudo leer el archivo de bloqueo existente: ${readErr.message}`
    )
  }
  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error(
      'ATTESTATION_RESPONSE_CONSUMPTION_DENIED: REPLAY_STORAGE_STATE_INCONSISTENT: El archivo de bloqueo anti-replay existente se encuentra corrupto o truncado'
    )
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    parsed.schemaVersion !== '1.0' ||
    !parsed.replayId ||
    typeof parsed.replayId !== 'string' ||
    !/^[0-9a-f]{64}$/.test(parsed.replayId) ||
    !parsed.attestationId ||
    typeof parsed.attestationId !== 'string' ||
    parsed.attestationId.trim().length === 0 ||
    parsed.attestationId !== parsed.attestationId.trim() ||
    !parsed.responseId ||
    parsed.responseId !== parsed.attestationId ||
    !parsed.requestId ||
    typeof parsed.requestId !== 'string' ||
    parsed.requestId.trim().length === 0 ||
    !parsed.requestSha256 ||
    typeof parsed.requestSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(parsed.requestSha256) ||
    !parsed.manifestSha256 ||
    typeof parsed.manifestSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(parsed.manifestSha256) ||
    !parsed.attestationPayloadSha256 ||
    typeof parsed.attestationPayloadSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(parsed.attestationPayloadSha256) ||
    !parsed.signatureSha256 ||
    typeof parsed.signatureSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(parsed.signatureSha256) ||
    !parsed.authorityId ||
    typeof parsed.authorityId !== 'string' ||
    parsed.authorityId.trim().length === 0 ||
    !parsed.keyId ||
    typeof parsed.keyId !== 'string' ||
    parsed.keyId.trim().length === 0 ||
    !parsed.commitSha ||
    typeof parsed.commitSha !== 'string' ||
    !/^[0-9a-f]{40}$/.test(parsed.commitSha) ||
    !parsed.consumedAt ||
    typeof parsed.consumedAt !== 'string' ||
    !Number.isFinite(Date.parse(parsed.consumedAt)) ||
    parsed.antiReplayGuarantee !== ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL
  ) {
    throw new Error(
      'ATTESTATION_RESPONSE_CONSUMPTION_DENIED: REPLAY_STORAGE_STATE_INCONSISTENT: Estructura o campos obligatorios inválidos en registro anti-replay existente'
    )
  }

  if (expectedTarget && expectedTarget.kind && expectedTarget.expectedDigest) {
    const actualDigest =
      expectedTarget.kind === 'RESPONSE_REPLAY_ID'
        ? parsed.replayId
        : expectedTarget.kind === 'ATTESTATION_ID'
          ? sha256(parsed.attestationId)
          : expectedTarget.kind === 'REQUEST_SHA256'
            ? sha256(parsed.requestSha256)
            : expectedTarget.kind === 'SIGNATURE'
              ? parsed.signatureSha256
              : null
    if (actualDigest && actualDigest !== expectedTarget.expectedDigest) {
      throw new Error(
        `ATTESTATION_RESPONSE_CONSUMPTION_DENIED: REPLAY_STORAGE_STATE_INCONSISTENT: El contenido del archivo de bloqueo (${expectedTarget.kind}) no coincide con su llave de índice en disco`
      )
    }
  }

  return parsed
}

/**
 * Consulta de solo lectura (sin mutar estado) si una AttestationResponse o cualquiera de sus
 * llaves semánticas (replayId, attestationId, requestSha256, signature) ya fue consumida
 * en el registro durable del host local.
 */
export function isAttestationResponseConsumedDurable(response, options = {}) {
  const rawDir = resolveAttestationReplayDirOption(options)
  const validatedDir = validateAttestationReplayDirectory(rawDir, {
    repoRoot: options.repoRoot,
    createIfMissing: false,
  })
  const dirStat = lstatIfExists(validatedDir)
  if (!dirStat) {
    return false
  }
  const replayId = computeAttestationResponseReplayId(response)
  const attestationId = String(response.responseId || response.attestationId)
  const idDigest = sha256(attestationId)
  const reqDigest = sha256(String(response.requestSha256))
  const sigDigest = sha256(String(response.signature))

  const candidateTargets = [
    { kind: 'RESPONSE_REPLAY_ID', expectedDigest: replayId, filePath: path.join(validatedDir, `consumed-response-${replayId}.json`) },
    { kind: 'ATTESTATION_ID', expectedDigest: idDigest, filePath: path.join(validatedDir, `consumed-id-${idDigest}.json`) },
    { kind: 'REQUEST_SHA256', expectedDigest: reqDigest, filePath: path.join(validatedDir, `consumed-req-${reqDigest}.json`) },
    { kind: 'SIGNATURE', expectedDigest: sigDigest, filePath: path.join(validatedDir, `consumed-sig-${sigDigest}.json`) },
  ]

  for (const target of candidateTargets) {
    if (lstatIfExists(target.filePath)) {
      inspectExistingReplayLockFile(target.filePath, target)
      return true
    }
  }
  return false
}

/**
 * FRONTERA EXPLÍCITA DE CONSUMO / RESERVA DURABLE (CONSUME / RESERVE):
 * Consume y reserva atómicamente una AttestationResponse en el registro durable host-local
 * (`HOST_LOCAL_DURABLE_ONE_TIME_USE`).
 *
 * Garantías:
 * 1. Reejecuta internamente la verificación criptográfica y contractual completa (`ADV-REPLAY-12`);
 *    jamás confía en un booleano externo ni permite omitir la verificación.
 * 2. Prohibe cualquier degradación o fallback a memoria (`PROCESS_LOCAL_ONE_TIME_USE`).
 * 3. Valida fail-closed el directorio del registro durable (rechaza rutas no configuradas,
 *    path traversal `..`, symlinks en destino/ancestros y directorios versionables del repositorio).
 * 4. Reserva de forma atómica y exclusiva (`flag: 'wx'` / `O_CREAT | O_EXCL`, modo `0o600`) el
 *    identificador canónico `replayId` y los bloqueos semánticos (`attestationId`, `requestSha256`, `signature`),
 *    cerrando cualquier ventana TOCTOU entre procesos o ejecuciones concurrentes.
 */
export function consumeAttestationResponseDurable(response, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('ATTESTATION_RESPONSE_CONSUMPTION_DENIED: CONSUME_OPTIONS_INVALID')
  }

  // Prohibir cualquier intento de saltear la verificación criptográfica o confiar en un verify previo (ADV-REPLAY-12)
  if (
    options.skipVerification === true ||
    options.preVerified === true ||
    options.trustPreviousVerify === true ||
    options.verified === true
  ) {
    throw new Error(
      'ATTESTATION_RESPONSE_CONSUMPTION_DENIED: VERIFICATION_BYPASS_FORBIDDEN: Prohibido consumir una AttestationResponse sin ejecutar la verificación criptográfica y contractual completa'
    )
  }

  // Prohibir degradación silenciosa o explícita a anti-replay en memoria (PROCESS_LOCAL_ONE_TIME_USE)
  assertNoAntiReplayDowngradeFlags(options, true)

  if (!options.attestationRequest) {
    throw new Error(
      'ATTESTATION_RESPONSE_CONSUMPTION_DENIED: ATTESTATION_REQUEST_MISMATCH: Se requiere AttestationRequestPackage explícito para consumir una AttestationResponse'
    )
  }

  // 1. Re-ejecución obligatoria de toda la verificación criptográfica y de vinculación
  const verification = verifyAttestationResponse(response, {
    ...options,
    checkReplay: false,
  })
  if (!verification.valid) {
    throw new Error(
      `ATTESTATION_RESPONSE_CONSUMPTION_DENIED: ${verification.reason}: ${verification.detail || verification.reason}`
    )
  }

  // 2. Validación fail-closed del almacenamiento durable host-local (sin fallback a memoria)
  const rawDir = resolveAttestationReplayDirOption(options)
  const realBase = validateAttestationReplayDirectory(rawDir, {
    repoRoot: options.repoRoot,
    createIfMissing: true,
  })

  // 3. Construcción determinista del identificador canónico de replay y bloqueos semánticos
  const replayId = computeAttestationResponseReplayId(response)
  const attestationId = String(response.responseId || response.attestationId)
  const idDigest = sha256(attestationId)
  const reqDigest = sha256(response.requestSha256)
  const sigDigest = sha256(response.signature)

  const lockTargets = [
    { kind: 'RESPONSE_REPLAY_ID', expectedDigest: replayId, filePath: path.join(realBase, `consumed-response-${replayId}.json`) },
    { kind: 'ATTESTATION_ID', expectedDigest: idDigest, filePath: path.join(realBase, `consumed-id-${idDigest}.json`) },
    { kind: 'REQUEST_SHA256', expectedDigest: reqDigest, filePath: path.join(realBase, `consumed-req-${reqDigest}.json`) },
    { kind: 'SIGNATURE', expectedDigest: sigDigest, filePath: path.join(realBase, `consumed-sig-${sigDigest}.json`) },
  ]

  // Comprobar que ninguna ruta destino dentro del directorio real escape ni preexista como symlink o directorio
  for (const target of lockTargets) {
    const resolvedTarget = path.resolve(target.filePath)
    const isWin = process.platform === 'win32'
    const cmpBase = isWin ? realBase.toLowerCase() : realBase
    const cmpTarget = isWin ? resolvedTarget.toLowerCase() : resolvedTarget
    if (!cmpTarget.startsWith(cmpBase + path.sep)) {
      throw new Error(
        'ATTESTATION_RESPONSE_CONSUMPTION_DENIED: PATH_TRAVERSAL_FORBIDDEN: La ruta del archivo de consumo escapa del directorio durable autorizado'
      )
    }
    const existingStat = lstatIfExists(resolvedTarget)
    if (existingStat) {
      if (existingStat.isSymbolicLink() || !existingStat.isFile()) {
        throw new Error(
          `ATTESTATION_RESPONSE_CONSUMPTION_DENIED: SYMLINK_FORBIDDEN: El archivo de bloqueo '${resolvedTarget}' es un enlace simbólico o no es un archivo regular`
        )
      }
    }
  }

  const consumedAt = options.now
    ? typeof options.now === 'string'
      ? options.now
      : new Date(options.now).toISOString()
    : new Date().toISOString()

  // Registro auditable mínimo: sin secretos, sin claves privadas, sin tokens WSAA
  const recordPayload = JSON.stringify(
    {
      schemaVersion: '1.0',
      replayId,
      attestationId,
      responseId: attestationId,
      requestId: response.requestId,
      requestSha256: response.requestSha256,
      manifestSha256: response.manifestSha256,
      attestationPayloadSha256: response.attestationPayloadSha256,
      signatureSha256: sigDigest,
      authorityId: response.authorityId,
      keyId: response.keyId,
      commitSha: response.commitSha,
      processId: response.processId,
      executionScope: response.executionScope,
      consumedAt,
      antiReplayGuarantee: ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL,
    },
    null,
    2
  )

  const writeExclusive =
    typeof options.fsWriteExclusive === 'function'
      ? options.fsWriteExclusive
      : (targetPath, content) => {
          fs.writeFileSync(targetPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
        }

  const createdFiles = []
  try {
    for (const target of lockTargets) {
      writeExclusive(target.filePath, recordPayload)
      createdFiles.push(target.filePath)
      try {
        fs.chmodSync(target.filePath, 0o600)
      } catch {
        // En plataformas sin chmod POSIX estricto (Windows), continuar
      }
    }
  } catch (err) {
    // Rollback atómico exclusivamente de los archivos creados en esta invocación (jamás elimina bloqueos preexistentes)
    for (const created of createdFiles) {
      try {
        if (lstatIfExists(created)) {
          fs.unlinkSync(created)
        }
      } catch {
        // Ignorar errores secundarios de limpieza en rollback
      }
    }

    // Verificar integridad de cualquier archivo existente que haya causado o acompañado la colisión
    let existingCollisionDetected = false
    for (const target of lockTargets) {
      if (lstatIfExists(target.filePath)) {
        inspectExistingReplayLockFile(target.filePath, target)
        existingCollisionDetected = true
      }
    }

    if ((err && err.code === 'EEXIST') || existingCollisionDetected) {
      throw new Error(
        `ATTESTATION_RESPONSE_CONSUMPTION_DENIED: ATTESTATION_RESPONSE_REPLAY_DETECTED: Reutilización o sustitución semántica de respuesta de atestación bloqueada por registro durable (${ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL})`
      )
    }

    throw new Error(
      `ATTESTATION_RESPONSE_CONSUMPTION_DENIED: EXCLUSIVE_REPLAY_WRITE_FAILED: No se pudo registrar atómicamente el consumo durable de la respuesta de atestación: ${err && err.message ? err.message : String(err)}`
    )
  }

  return Object.freeze({
    ...verification,
    consumed: true,
    ATTESTATION_RESPONSE_CONSUMPTION: 'CONSUMED',
    replayId,
    consumedAt,
    antiReplayGuarantee: ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL,
  })
}

/**
 * Alias explícito de reserva atómica durable de una AttestationResponse.
 */
export function reserveAttestationResponseDurable(response, options = {}) {
  return consumeAttestationResponseDurable(response, options)
}

/**
 * Valida fail-closed la URL del endpoint de la Autoridad de Atestación Independiente externa.
 * - Debe ser un string no vacío ni compuesto solo de espacios.
 * - Debe ser una URL sintácticamente válida (RFC 3986 / WHATWG URL).
 * - El protocolo debe ser estrictamente HTTPS (salvo que allowHttp sea true en entornos de test explícitos).
 * - El hostname no puede estar vacío.
 */
export function validateAttestationEndpointUrl(endpoint, options = {}) {
  if (typeof endpoint !== 'string' || endpoint.trim().length === 0) {
    throw new Error('ATTESTATION_ENDPOINT_INVALID: Endpoint debe ser una URL en formato string no vacía')
  }

  const trimmed = endpoint.trim()
  let parsed
  try {
    parsed = new URL(trimmed)
  } catch (err) {
    throw new Error(`ATTESTATION_ENDPOINT_INVALID: URL '${trimmed}' no es válida: ${err.message}`)
  }

  const allowHttp = Boolean(options && options.allowHttp)
  if (!allowHttp && parsed.protocol !== 'https:') {
    throw new Error(`ATTESTATION_ENDPOINT_INVALID: Protocolo '${parsed.protocol}' no permitido. Se exige HTTPS`)
  }

  if (allowHttp && parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`ATTESTATION_ENDPOINT_INVALID: Protocolo '${parsed.protocol}' no permitido. Se exige HTTPS`)
  }

  if (!parsed.hostname || parsed.hostname.trim().length === 0) {
    throw new Error(`ATTESTATION_ENDPOINT_INVALID: Hostname no válido en '${trimmed}'`)
  }

  return trimmed
}

export function assertAdapterConfigSecurity(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('INDEPENDENT_ATTESTATION_ADAPTER_CONFIG_INVALID')
  }

  assertRuntimeSigningIsolation({
    fiscalScriptsDir: config.fiscalScriptsDir,
    env: config.env,
  })

  const env = config.env || process.env
  if (
    config.independentAuthorityAvailable === true ||
    config.INDEPENDENT_ATTESTATION_AVAILABLE === true ||
    config.authorityRealWorldAvailable === true ||
    config.AUTHORITY_REAL_WORLD_AVAILABLE === true ||
    config.elevateToIndependent === true ||
    config.forceIndependentAttestation === true ||
    config.allowSelfAttestedAsIndependent === true ||
    config.elevateTrustModel === true ||
    config.forceProductionAuthority === true ||
    config.P1_IMPORT_ALLOWED === true ||
    config.ATTESTATION_TRUST_MODEL === 'INDEPENDENT_ATTESTED' ||
    Boolean(env.PR02_P0_FORCE_INDEPENDENT_ATTESTATION) ||
    env.INDEPENDENT_ATTESTATION_AVAILABLE === 'true' ||
    env.AUTHORITY_REAL_WORLD_AVAILABLE === 'true'
  ) {
    throw new Error('SELF_ATTESTATION_AUTO_ELEVATION_REJECTED: Un booleano como independentAuthorityAvailable: true o flags de configuración no pueden elevar el modelo de confianza')
  }

  if (
    config.localPrivateKey ||
    config.privateKey ||
    config.authorityPrivateKey ||
    config.secretKey
  ) {
    throw new Error(
      'RUNTIME_PRIVATE_KEY_DETECTED: LOCAL_FALLBACK_SIGNING_FORBIDDEN: Prohibido configurar o aceptar claves privadas en el adaptador de atestación independiente del runtime fiscal'
    )
  }

  if (
    config.fallbackToLocalSigner ||
    config.localFallbackSigner ||
    config.fallbackSigner ||
    config.signLocallyOnFailure ||
    config.useLocalSigner ||
    config.enableLocalSigningFallback
  ) {
    throw new Error('LOCAL_FALLBACK_SIGNING_FORBIDDEN: Prohibido configurar fallback a firma local o claves privadas en el adaptador de atestación independiente')
  }

  if (config.autoDiscoverRemoteAuthority === true || config.implicitNetworkAccess === true) {
    throw new Error('IMPLICIT_AUTHORITY_DISCOVERY_FORBIDDEN: Prohibido el descubrimiento automático de autoridad remota o acceso de red implícito')
  }

  assertNoAntiReplayDowngradeFlags(config, false)

  const rawReplayDir =
    config.consumedResponsesDir ??
    config.attestationReplayDir ??
    config.replayRegistryDir
  if (rawReplayDir !== undefined) {
    validateAttestationReplayDirectory(rawReplayDir, {
      repoRoot: config.repoRoot,
      createIfMissing: false,
    })
  }

  const endpoint =
    config.endpoint ??
    config.endpointUrl ??
    (env && env[PR02_P0_ATTESTATION_ENDPOINT_ENV]) ??
    null
  const rawKeyForEndpoint =
    config.trustedAttestationPublicKey ||
    config.authorityPublicKey ||
    config.publicKeySpki ||
    (env && env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV]) ||
    (env && env[PR02_P0_AUTHORITY_ENV])
  if (endpoint !== null && endpoint !== undefined && endpoint !== '') {
    validateAttestationEndpointUrl(endpoint, { allowHttp: Boolean(config.allowHttp) })
    if (!rawKeyForEndpoint) {
      throw new Error('INDEPENDENT_ATTESTATION_AUTHORITY_NOT_AVAILABLE: Endpoint configurado sin clave pública autorizada')
    }
  }
}

export const EXTERNAL_AUTHORITY_TRANSPORT_CONTRACT_VERSION = '1.0'
export const EXTERNAL_AUTHORITY_ENDPOINT_SPEC = Object.freeze({
  method: 'POST',
  defaultPath: '/attestations',
  contentType: 'application/json',
})

export const IndependentAttestationAuthorityTransportContract = Object.freeze({
  contractVersion: EXTERNAL_AUTHORITY_TRANSPORT_CONTRACT_VERSION,
  endpointSpec: EXTERNAL_AUTHORITY_ENDPOINT_SPEC,
  requestSchemaVersion: '1.0',
  responseSchemaVersion: '1.0',
  algorithm: 'Ed25519',
  executionScope: PR02_P0_SCOPE,
  environment: 'HOMOLOGACION',
  prohibitedPayloadFields: Object.freeze([
    'token',
    'sign',
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
  ]),
  requiredRequestFields: Object.freeze([
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
  ]),
  requiredResponseFields: Object.freeze([
    'schemaVersion',
    'attestationId',
    'requestId',
    'requestSha256',
    'manifestSha256',
    'processId',
    'executionScope',
    'commitSha',
    'environment',
    'authorizationId',
    'goAuthorizationDocumentSha256',
    'rawSoapArtifacts',
    'normalizedArtifacts',
    'consultadoEn',
    'attestationPayloadSha256',
    'authorityType',
    'authorityId',
    'keyId',
    'algorithm',
    'issuedAt',
    'signature',
  ]),
  invariants: Object.freeze({
    NO_PRIVATE_KEYS_IN_RUNTIME: true,
    NO_SECRET_TRANSMISSION: true,
    CANONICAL_SERIALIZATION_REQUIRED: true,
    GO_AND_ATTESTATION_AUTHORITIES_SEPARATED: true,
    VERIFY_BEFORE_CONSUME_REQUIRED: true,
    HOST_LOCAL_DURABLE_ONE_TIME_USE_REPLAY_PROTECTION: true,
    HONEST_AVAILABILITY_STATE: true,
  }),
})

/**
 * Envía un AttestationRequestPackage a través de una frontera de transporte explícita
 * hacia una Autoridad de Atestación Independiente externa, verifica criptográficamente
 * su respuesta fail-closed y la CONSUME atómicamente en el registro durable del host local.
 * Sin acceso de red implícito, sin descubrimiento automático, sin fallback a firma local
 * y sin degradación a anti-replay en memoria.
 */
export async function submitAttestationRequest(requestPkg, adapterOrConfig = {}) {
  assertAdapterConfigSecurity(adapterOrConfig)
  validateAttestationRequest(requestPkg)

  const transportCandidate =
    typeof adapterOrConfig.transport === 'function'
      ? adapterOrConfig.transport
      : adapterOrConfig.transport && typeof adapterOrConfig.transport.sendAttestationRequest === 'function'
        ? (req) => adapterOrConfig.transport.sendAttestationRequest(req)
        : null

  const env = adapterOrConfig.env || process.env
  const rawPubKey =
    adapterOrConfig.trustedAttestationPublicKey ||
    adapterOrConfig.authorityPublicKey ||
    adapterOrConfig.publicKeySpki ||
    (env && env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV]) ||
    (env && env[PR02_P0_AUTHORITY_ENV])

  const endpoint =
    adapterOrConfig.endpoint ??
    adapterOrConfig.endpointUrl ??
    (env && env[PR02_P0_ATTESTATION_ENDPOINT_ENV]) ??
    null
  if (endpoint && !rawPubKey) {
    throw new Error('INDEPENDENT_ATTESTATION_AUTHORITY_NOT_AVAILABLE: Endpoint configurado sin clave pública autorizada')
  }

  const authorityId =
    adapterOrConfig.authorityId ||
    adapterOrConfig.expectedAuthorityId ||
    (env && env[PR02_P0_ATTESTATION_AUTHORITY_ID_ENV]) ||
    null

  if (!transportCandidate || !rawPubKey || !authorityId || typeof authorityId !== 'string' || authorityId.trim().length > 0 === false) {
    throw new Error('INDEPENDENT_ATTESTATION_AUTHORITY_NOT_AVAILABLE: No existe una Autoridad de Atestación Independiente externa configurada (se requiere transporte explícito, authorityId y clave pública autorizada)')
  }

  const pubKeyObj = validateP0AttestationPublicKey(rawPubKey, Boolean(adapterOrConfig.allowTestKeys))
  const derivedKeyId = computePublicKeyId(pubKeyObj)

  const pinnedRawKey = adapterOrConfig.pinnedPublicKeySpki || adapterOrConfig.expectedPublicKeySpki
  if (pinnedRawKey) {
    const pinnedObj = validateP0AttestationPublicKey(pinnedRawKey, Boolean(adapterOrConfig.allowTestKeys))
    if (!pinnedObj.export({ format: 'der', type: 'spki' }).equals(pubKeyObj.export({ format: 'der', type: 'spki' }))) {
      throw new Error('PUBLIC_KEY_SUBSTITUTION_REJECTED: Prohibido sustituir la clave pública anclada del adaptador de autoridad independiente')
    }
  }

  const pinnedKeyId =
    adapterOrConfig.pinnedKeyId ||
    adapterOrConfig.expectedKeyId ||
    (pinnedRawKey ? computePublicKeyId(validateP0AttestationPublicKey(pinnedRawKey, Boolean(adapterOrConfig.allowTestKeys))) : null)
  if (pinnedKeyId && adapterOrConfig.keyId !== undefined && adapterOrConfig.keyId !== null && adapterOrConfig.keyId !== pinnedKeyId) {
    throw new Error(`PUBLIC_KEY_SUBSTITUTION_REJECTED: keyId suministrado ('${adapterOrConfig.keyId}') no coincide con el keyId anclado ('${pinnedKeyId}')`)
  }

  if (
    adapterOrConfig.keyId !== undefined &&
    adapterOrConfig.keyId !== null &&
    adapterOrConfig.keyId !== derivedKeyId
  ) {
    throw new Error(`ATTESTATION_KEY_ID_MISMATCH: keyId configurado ('${adapterOrConfig.keyId}') no coincide con la huella SPKI ('${derivedKeyId}')`)
  }

  assertAuthoritiesSeparated({
    goAuthorityId:
      adapterOrConfig.goAuthorityId ??
      adapterOrConfig.trustedGoAuthorityId ??
      adapterOrConfig.goApproverId ??
      (adapterOrConfig.goAuthorizationDoc &&
        adapterOrConfig.goAuthorizationDoc.authorization &&
        adapterOrConfig.goAuthorizationDoc.authorization.aprobador_identidad),
    attestationAuthorityId: authorityId,
    goKeyId:
      adapterOrConfig.goKeyId ??
      adapterOrConfig.trustedGoKeyId ??
      (adapterOrConfig.goAuthorizationDoc &&
        adapterOrConfig.goAuthorizationDoc.signature &&
        adapterOrConfig.goAuthorizationDoc.signature.key_id),
    attestationKeyId: derivedKeyId,
    trustedGoPublicKey: adapterOrConfig.trustedGoPublicKey,
    trustedAttestationPublicKey: pubKeyObj,
    allowTestKeys: Boolean(adapterOrConfig.allowTestKeys),
  })

  const allowedAuthorityIds = adapterOrConfig.allowedAuthorityIds || [authorityId]
  const allowedKeyIds = adapterOrConfig.allowedKeyIds || [derivedKeyId]

  // Validar fail-closed el directorio de consumo durable ANTES de invocar el transporte
  const rawReplayDir = resolveAttestationReplayDirOption(adapterOrConfig)
  validateAttestationReplayDirectory(rawReplayDir, {
    repoRoot: adapterOrConfig.repoRoot,
    createIfMissing: true,
  })

  let rawResponse
  try {
    rawResponse = await transportCandidate(Object.freeze({ ...requestPkg }))
  } catch (err) {
    throw new Error(`INDEPENDENT_ATTESTATION_AUTHORITY_NOT_AVAILABLE: Fallo en transporte externo de autoridad de atestación (prohibido fallback local): ${err && err.message ? err.message : String(err)}`)
  }

  const verification = consumeAttestationResponseDurable(rawResponse, {
    attestationRequest: requestPkg,
    manifest: adapterOrConfig.manifest,
    commitSha: adapterOrConfig.commitSha || requestPkg.commitSha,
    trustedAttestationPublicKey: rawPubKey,
    pinnedPublicKeySpki: pinnedRawKey || rawPubKey,
    pinnedKeyId: adapterOrConfig.pinnedKeyId || undefined,
    trustedGoPublicKey: adapterOrConfig.trustedGoPublicKey,
    goAuthorityId: adapterOrConfig.goAuthorityId ?? adapterOrConfig.trustedGoAuthorityId ?? adapterOrConfig.goApproverId,
    goKeyId: adapterOrConfig.goKeyId ?? adapterOrConfig.trustedGoKeyId,
    goAuthorizationDoc: adapterOrConfig.goAuthorizationDoc,
    allowedAuthorityIds,
    allowedKeyIds,
    allowTestKeys: Boolean(adapterOrConfig.allowTestKeys),
    fiscalScriptsDir: adapterOrConfig.fiscalScriptsDir,
    env: adapterOrConfig.env,
    now: adapterOrConfig.now,
    consumedResponsesDir: rawReplayDir,
    repoRoot: adapterOrConfig.repoRoot,
    fsWriteExclusive: adapterOrConfig.fsWriteExclusive,
  })

  return Object.freeze({
    valid: true,
    request: requestPkg,
    response: Object.freeze({ ...rawResponse }),
    verification,
  })
}

/**
 * Crea un adaptador explícito y fail-closed para la integración con una
 * Autoridad de Atestación Independiente externa (IndependentAttestationAuthorityAdapter).
 * Separa estrictamente:
 * REQUEST CREATION ≠ REQUEST TRANSPORT ≠ EXTERNAL SIGNING ≠ RESPONSE VERIFICATION ≠ RESPONSE CONSUMPTION.
 */
export function createIndependentAttestationAuthorityAdapter(config = {}) {
  assertAdapterConfigSecurity(config)

  const env = config.env || process.env
  const rawPubKey =
    config.trustedAttestationPublicKey ||
    config.authorityPublicKey ||
    config.publicKeySpki ||
    (env && env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV]) ||
    (env && env[PR02_P0_AUTHORITY_ENV])
  const authorityId =
    config.authorityId ||
    config.expectedAuthorityId ||
    (env && env[PR02_P0_ATTESTATION_AUTHORITY_ID_ENV]) ||
    null
  const configuredKeyId =
    config.keyId ||
    config.expectedKeyId ||
    (env && env[PR02_P0_ATTESTATION_KEY_ID_ENV]) ||
    null
  const hasTransport =
    typeof config.transport === 'function' ||
    Boolean(config.transport && typeof config.transport.sendAttestationRequest === 'function')

  let validatedKeyId = null
  let validatedPublicKeySpki = null
  let hasValidKey = false
  if (rawPubKey) {
    try {
      const pubObj = validateP0AttestationPublicKey(rawPubKey, Boolean(config.allowTestKeys))
      validatedKeyId = computePublicKeyId(pubObj)
      validatedPublicKeySpki = pubObj.export({ format: 'pem', type: 'spki' }).toString().trim()
      if (
        config.pinnedKeyId !== undefined &&
        config.pinnedKeyId !== null &&
        config.pinnedKeyId !== validatedKeyId
      ) {
        throw new Error(
          `PUBLIC_KEY_SUBSTITUTION_REJECTED: pinnedKeyId configurado ('${config.pinnedKeyId}') no coincide con la huella SPKI de publicKeySpki ('${validatedKeyId}')`
        )
      }
      if (
        configuredKeyId !== undefined &&
        configuredKeyId !== null &&
        configuredKeyId !== validatedKeyId
      ) {
        throw new Error(
          `ATTESTATION_KEY_ID_MISMATCH: keyId configurado ('${configuredKeyId}') no coincide con la huella SPKI de publicKeySpki ('${validatedKeyId}')`
        )
      }
      hasValidKey = true
    } catch (err) {
      if (
        config.requireAvailable === true ||
        (err &&
          err.message &&
          (err.message.includes('TEST_KEY_PROHIBITED') ||
            err.message.includes('RUNTIME_PRIVATE_KEY_DETECTED') ||
            err.message.includes('PUBLIC_KEY_SUBSTITUTION_REJECTED') ||
            err.message.includes('ATTESTATION_KEY_ID_MISMATCH')))
      ) {
        throw err
      }
      hasValidKey = false
    }
  }

  assertAuthoritiesSeparated({
    goAuthorityId:
      config.goAuthorityId ??
      config.trustedGoAuthorityId ??
      config.goApproverId ??
      (config.goAuthorizationDoc &&
        config.goAuthorizationDoc.authorization &&
        config.goAuthorizationDoc.authorization.aprobador_identidad),
    attestationAuthorityId: authorityId,
    goKeyId:
      config.goKeyId ??
      config.trustedGoKeyId ??
      (config.goAuthorizationDoc &&
        config.goAuthorizationDoc.signature &&
        config.goAuthorizationDoc.signature.key_id),
    attestationKeyId: config.keyId || config.expectedKeyId || validatedKeyId,
    trustedGoPublicKey: config.trustedGoPublicKey,
    trustedAttestationPublicKey: hasValidKey ? rawPubKey : undefined,
    allowTestKeys: Boolean(config.allowTestKeys),
  })

  const endpoint =
    config.endpoint ??
    config.endpointUrl ??
    (env && env[PR02_P0_ATTESTATION_ENDPOINT_ENV]) ??
    null
  if (endpoint && !hasValidKey) {
    throw new Error('INDEPENDENT_ATTESTATION_AUTHORITY_NOT_AVAILABLE: Endpoint configurado sin clave pública autorizada')
  }

  const isConfigured = Boolean(hasTransport && hasValidKey && authorityId && typeof authorityId === 'string' && authorityId.trim().length > 0)

  if (config.requireAvailable === true && !isConfigured) {
    throw new Error('INDEPENDENT_ATTESTATION_AUTHORITY_NOT_AVAILABLE: Configuración incompleta para adaptador de autoridad de atestación independiente')
  }

  const allowedAuthorityIds = config.allowedAuthorityIds
    ? Object.freeze(Array.from(config.allowedAuthorityIds))
    : authorityId
      ? Object.freeze([authorityId])
      : Object.freeze([])
  const allowedKeyIds = config.allowedKeyIds
    ? Object.freeze(Array.from(config.allowedKeyIds))
    : validatedKeyId
      ? Object.freeze([validatedKeyId])
      : Object.freeze([])

  return Object.freeze({
    adapterVersion: '1.0',
    authorityId,
    keyId: validatedKeyId,
    publicKeySpki: validatedPublicKeySpki,
    allowedAuthorityIds,
    allowedKeyIds,
    endpoint: endpoint ? validateAttestationEndpointUrl(endpoint, { allowHttp: Boolean(config.allowHttp) }) : null,
    algorithm: 'Ed25519',
    transportContract: IndependentAttestationAuthorityTransportContract,
    // Separación estricta entre adaptador técnico implementado y autoridad real externa
    AUTHORITY_ADAPTER_IMPLEMENTED: true,
    AUTHORITY_REAL_WORLD_AVAILABLE: false,
    ATTESTATION_TRUST_MODEL: 'SELF_ATTESTED',
    INDEPENDENT_ATTESTATION_AVAILABLE: false,
    P1_IMPORT_ALLOWED: false,
    antiReplayGuarantee: ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL,
    isConfigured: () => isConfigured,
    isAuthorityAvailable: () => false,
    createAttestationRequest: (params) => createAttestationRequest(params),
    validateAttestationRequest: (pkg) => validateAttestationRequest(pkg),
    submitAttestationRequest: async (requestPkg, submitOptions = {}) => {
      assertAdapterConfigSecurity(submitOptions)
      if (validatedKeyId && submitOptions.keyId && submitOptions.keyId !== validatedKeyId) {
        throw new Error(`PUBLIC_KEY_SUBSTITUTION_REJECTED: keyId suministrado ('${submitOptions.keyId}') no coincide con el keyId anclado del adaptador ('${validatedKeyId}')`)
      }
      return submitAttestationRequest(requestPkg, {
        ...config,
        ...submitOptions,
        transport: config.transport,
        endpoint,
        trustedAttestationPublicKey:
          submitOptions.trustedAttestationPublicKey ||
          submitOptions.authorityPublicKey ||
          submitOptions.publicKeySpki ||
          rawPubKey,
        pinnedPublicKeySpki: validatedPublicKeySpki || rawPubKey,
        pinnedKeyId: submitOptions.pinnedKeyId || config.pinnedKeyId || undefined,
        authorityId,
        allowedAuthorityIds,
        allowedKeyIds,
      })
    },
    verifyAttestationResponse: (response, verifyOptions = {}) => {
      const effectivePinned = verifyOptions.pinnedKeyId || config.pinnedKeyId
      if (
        (validatedKeyId && verifyOptions.keyId && verifyOptions.keyId !== validatedKeyId) ||
        (effectivePinned && response && response.keyId && response.keyId !== effectivePinned)
      ) {
        return Object.freeze({
          valid: false,
          P1_IMPORT_ALLOWED: false,
          INDEPENDENT_ATTESTATION_AVAILABLE: false,
          EVIDENCE_CUSTODY_ATTESTED: false,
          ATTESTATION_TRUST_MODEL: 'UNVERIFIED',
          TRUSTED_EXECUTION_BOUNDARY: 'UNVERIFIED',
          ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED: false,
          reason: 'PUBLIC_KEY_SUBSTITUTION_REJECTED',
          errorCategory: 'PUBLIC_KEY_SUBSTITUTION_REJECTED',
          detail: `keyId suministrado ('${verifyOptions.keyId || (response && response.keyId)}') no coincide con el keyId anclado ('${effectivePinned || validatedKeyId}')`,
        })
      }
      return verifyAttestationResponse(response, {
        ...config,
        ...verifyOptions,
        trustedAttestationPublicKey:
          verifyOptions.trustedAttestationPublicKey ||
          verifyOptions.authorityPublicKey ||
          verifyOptions.publicKeySpki ||
          rawPubKey,
        pinnedPublicKeySpki: verifyOptions.pinnedPublicKeySpki || validatedPublicKeySpki || rawPubKey,
        pinnedKeyId: effectivePinned || undefined,
        allowedAuthorityIds: verifyOptions.allowedAuthorityIds || (allowedAuthorityIds.length > 0 ? allowedAuthorityIds : undefined),
        allowedKeyIds: verifyOptions.allowedKeyIds || (allowedKeyIds.length > 0 ? allowedKeyIds : undefined),
      })
    },
    validateAttestationResponse: (response, verifyOptions = {}) =>
      validateAttestationResponse(response, {
        ...config,
        ...verifyOptions,
        trustedAttestationPublicKey:
          verifyOptions.trustedAttestationPublicKey ||
          verifyOptions.authorityPublicKey ||
          verifyOptions.publicKeySpki ||
          rawPubKey,
        pinnedPublicKeySpki: verifyOptions.pinnedPublicKeySpki || validatedPublicKeySpki || rawPubKey,
        pinnedKeyId: verifyOptions.pinnedKeyId || config.pinnedKeyId || undefined,
        allowedAuthorityIds: verifyOptions.allowedAuthorityIds || (allowedAuthorityIds.length > 0 ? allowedAuthorityIds : undefined),
        allowedKeyIds: verifyOptions.allowedKeyIds || (allowedKeyIds.length > 0 ? allowedKeyIds : undefined),
      }),
    consumeAttestationResponse: (response, consumeOptions = {}) =>
      consumeAttestationResponseDurable(response, {
        ...config,
        ...consumeOptions,
        trustedAttestationPublicKey:
          consumeOptions.trustedAttestationPublicKey ||
          consumeOptions.authorityPublicKey ||
          consumeOptions.publicKeySpki ||
          rawPubKey,
        pinnedPublicKeySpki: consumeOptions.pinnedPublicKeySpki || validatedPublicKeySpki || rawPubKey,
        pinnedKeyId: consumeOptions.pinnedKeyId || config.pinnedKeyId || undefined,
        allowedAuthorityIds: consumeOptions.allowedAuthorityIds || (allowedAuthorityIds.length > 0 ? allowedAuthorityIds : undefined),
        allowedKeyIds: consumeOptions.allowedKeyIds || (allowedKeyIds.length > 0 ? allowedKeyIds : undefined),
      }),
    reserveAttestationResponse: (response, consumeOptions = {}) =>
      reserveAttestationResponseDurable(response, {
        ...config,
        ...consumeOptions,
        trustedAttestationPublicKey:
          consumeOptions.trustedAttestationPublicKey ||
          consumeOptions.authorityPublicKey ||
          consumeOptions.publicKeySpki ||
          rawPubKey,
        pinnedPublicKeySpki: consumeOptions.pinnedPublicKeySpki || validatedPublicKeySpki || rawPubKey,
        allowedAuthorityIds: consumeOptions.allowedAuthorityIds || (allowedAuthorityIds.length > 0 ? allowedAuthorityIds : undefined),
        allowedKeyIds: consumeOptions.allowedKeyIds || (allowedKeyIds.length > 0 ? allowedKeyIds : undefined),
      }),
    isAttestationResponseConsumed: (response, checkOptions = {}) =>
      isAttestationResponseConsumedDurable(response, {
        ...config,
        ...checkOptions,
      }),
    signProductionAttestation: () => {
      throw new Error('PRODUCTION_SIGNING_FORBIDDEN_IN_RUNTIME: El adaptador en el runtime fiscal tiene prohibido firmar atestaciones de producción')
    },
    accessProductionPrivateKey: () => {
      throw new Error('PRODUCTION_PRIVATE_KEY_FORBIDDEN_IN_RUNTIME: El adaptador en el runtime fiscal tiene prohibido poseer o acceder a claves privadas de producción')
    },
    fallbackToLocalSigner: () => {
      throw new Error('LOCAL_FALLBACK_SIGNING_FORBIDDEN: Prohibido realizar fallback a firma local desde el adaptador de autoridad independiente')
    },
  })
}

export const IndependentAttestationAuthorityAdapter = Object.freeze({
  AUTHORITY_ADAPTER_IMPLEMENTED: true,
  AUTHORITY_REAL_WORLD_AVAILABLE: false,
  INDEPENDENT_ATTESTATION_AVAILABLE: false,
  transportContract: IndependentAttestationAuthorityTransportContract,
  TRANSPORT_CONTRACT_VERSION: EXTERNAL_AUTHORITY_TRANSPORT_CONTRACT_VERSION,
  ENDPOINT_SPEC: EXTERNAL_AUTHORITY_ENDPOINT_SPEC,
  ENDPOINT_ENV: PR02_P0_ATTESTATION_ENDPOINT_ENV,
  AUTHORITY_ID_ENV: PR02_P0_ATTESTATION_AUTHORITY_ID_ENV,
  KEY_ID_ENV: PR02_P0_ATTESTATION_KEY_ID_ENV,
  validateAttestationEndpointUrl,
  createAdapter: createIndependentAttestationAuthorityAdapter,
  createAttestationRequest,
  validateAttestationRequest,
  submitAttestationRequest,
  verifyAttestationResponse,
  validateAttestationResponse,
  consumeAttestationResponse: consumeAttestationResponseDurable,
  reserveAttestationResponse: reserveAttestationResponseDurable,
  isAttestationResponseConsumed: isAttestationResponseConsumedDurable,
  serializeCanonicalAttestationResponsePayload,
  computeAttestationResponsePayloadDigest,
  serializeCanonicalAttestationResponseReplayIdentity,
  computeAttestationResponseReplayId,
  validateAttestationReplayDirectory,
  computePublicKeyId,
  assertAuthoritiesSeparated,
  AUTHORITY_TYPES: ATTESTATION_AUTHORITY_TYPES,
  ALLOWED_ALGORITHMS: ATTESTATION_ALLOWED_ALGORITHMS,
  ANTI_REPLAY_GUARANTEE_LEVEL: ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL,
})

/**
 * Frontera externa de Autoridad de Atestación Independiente (IndependentAttestationAuthority).
 * El runtime fiscal puede crear solicitudes de atestación, verificar firmas con clave pública
 * y consumir respuestas en el registro durable del host local, pero tiene terminantemente
 * prohibido acceder a claves privadas o firmar atestaciones de producción.
 */
export const IndependentAttestationAuthority = Object.freeze({
  AUTHORITY_ADAPTER_IMPLEMENTED: true,
  AUTHORITY_REAL_WORLD_AVAILABLE: false,
  INDEPENDENT_ATTESTATION_AVAILABLE: false,
  P1_IMPORT_ALLOWED: false,
  transportContract: IndependentAttestationAuthorityTransportContract,
  TRANSPORT_CONTRACT_VERSION: EXTERNAL_AUTHORITY_TRANSPORT_CONTRACT_VERSION,
  ENDPOINT_SPEC: EXTERNAL_AUTHORITY_ENDPOINT_SPEC,
  ENDPOINT_ENV: PR02_P0_ATTESTATION_ENDPOINT_ENV,
  AUTHORITY_ID_ENV: PR02_P0_ATTESTATION_AUTHORITY_ID_ENV,
  KEY_ID_ENV: PR02_P0_ATTESTATION_KEY_ID_ENV,
  validateAttestationEndpointUrl,
  PUBLIC_KEY_ENV: PR02_P0_ATTESTATION_PUBLIC_KEY_ENV,
  REPLAY_DIR_ENV: PR02_P0_ATTESTATION_REPLAY_DIR_ENV,
  SIGNER_ORIGINS: ATTESTATION_SIGNER_ORIGINS,
  AUTHORITY_TYPES: ATTESTATION_AUTHORITY_TYPES,
  ALLOWED_ALGORITHMS: ATTESTATION_ALLOWED_ALGORITHMS,
  TRUST_MODELS: ATTESTATION_TRUST_MODELS,
  RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL: ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL,
  createAttestationRequest,
  validateAttestationRequest,
  computeAttestationRequestDigest,
  serializeCanonicalAttestationRequest,
  serializeCanonicalAttestationResponsePayload,
  computeAttestationResponsePayloadDigest,
  serializeCanonicalAttestationResponseReplayIdentity,
  computeAttestationResponseReplayId,
  validateAttestationReplayDirectory,
  computePublicKeyId,
  assertAuthoritiesSeparated,
  verifyAttestationResponse,
  validateAttestationResponse,
  consumeAttestationResponse: consumeAttestationResponseDurable,
  reserveAttestationResponse: reserveAttestationResponseDurable,
  isAttestationResponseConsumed: isAttestationResponseConsumedDurable,
  createAdapter: createIndependentAttestationAuthorityAdapter,
  submitAttestationRequest,
  verifyIndependentAttestation,
  verifyRuntimeSigningIsolation,
  assertRuntimeSigningIsolation,
  assertNoSelfAttestationElevation,
  validatePublicKey: validateP0AttestationPublicKey,
  isPublicKeyConfigured: (options = {}) => {
    if (options && options.independentAuthorityAvailable === true) {
      throw new Error('SELF_ATTESTATION_AUTO_ELEVATION_REJECTED: Prohibido declarar disponibilidad de autoridad independiente mediante un booleano')
    }
    const raw =
      options.trustedAttestationPublicKey ||
      options.publicKeySpki ||
      process.env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV] ||
      process.env[PR02_P0_AUTHORITY_ENV]
    if (!raw) return false
    try {
      validateP0AttestationPublicKey(raw, Boolean(options.allowTestKeys))
      const iso = verifyRuntimeSigningIsolation({ fiscalScriptsDir: options.fiscalScriptsDir, env: options.env })
      return iso.valid
    } catch {
      return false
    }
  },
  isRealWorldAuthorityAvailable: (options = {}) => {
    if (
      options &&
      (options.independentAuthorityAvailable === true ||
        options.INDEPENDENT_ATTESTATION_AVAILABLE === true ||
        options.authorityRealWorldAvailable === true ||
        options.AUTHORITY_REAL_WORLD_AVAILABLE === true)
    ) {
      throw new Error('SELF_ATTESTATION_AUTO_ELEVATION_REJECTED: Prohibido declarar disponibilidad de autoridad independiente mediante un booleano')
    }
    return false
  },
  isAuthorityAvailable: (options = {}) => {
    if (
      options &&
      (options.independentAuthorityAvailable === true ||
        options.INDEPENDENT_ATTESTATION_AVAILABLE === true ||
        options.authorityRealWorldAvailable === true ||
        options.AUTHORITY_REAL_WORLD_AVAILABLE === true)
    ) {
      throw new Error('SELF_ATTESTATION_AUTO_ELEVATION_REJECTED: Prohibido declarar disponibilidad de autoridad independiente mediante un booleano')
    }
    const raw =
      options.trustedAttestationPublicKey ||
      options.publicKeySpki ||
      process.env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV] ||
      process.env[PR02_P0_AUTHORITY_ENV]
    if (!raw) return false
    try {
      validateP0AttestationPublicKey(raw, Boolean(options.allowTestKeys))
      const iso = verifyRuntimeSigningIsolation({ fiscalScriptsDir: options.fiscalScriptsDir, env: options.env })
      return iso.valid
    } catch {
      return false
    }
  },
  signProductionAttestation: () => {
    throw new Error('PRODUCTION_SIGNING_FORBIDDEN_IN_RUNTIME: El runtime fiscal no posee claves privadas ni puede firmar atestaciones independientes de producción')
  },
  accessProductionPrivateKey: () => {
    throw new Error('PRODUCTION_PRIVATE_KEY_FORBIDDEN_IN_RUNTIME: El runtime fiscal tiene prohibido acceder o almacenar claves privadas de autoridad')
  },
  generateTrustedIndependentAttestation: () => {
    throw new Error('PRODUCTION_SIGNING_FORBIDDEN_IN_RUNTIME: Prohibido generar atestaciones independientes acreditadas dentro del runtime del colector')
  },
  fallbackToLocalSigner: () => {
    throw new Error('LOCAL_FALLBACK_SIGNING_FORBIDDEN: Prohibido realizar fallback a firma local cuando la autoridad independiente no está disponible')
  },
})

/**
 * Entidad de Autoridad de Custodia y Atestación de Evidencia P0.
 */
export const AttestationAuthority = Object.freeze({
  validatePublicKey: validateP0AttestationPublicKey,
  validateSecret: validateP0AttestationPublicKey,
  createAttestation: createP0Attestation,
  createAttestationRequest,
  validateAttestationRequest,
  verifyAttestation: verifyP0Attestation,
  verifyIndependentAttestation,
  verifyAttestationResponse,
  validateAttestationResponse,
  consumeAttestationResponse: consumeAttestationResponseDurable,
  reserveAttestationResponse: reserveAttestationResponseDurable,
  isAttestationResponseConsumed: isAttestationResponseConsumedDurable,
  validateAttestationReplayDirectory,
  computeAttestationResponseReplayId,
  createAdapter: createIndependentAttestationAuthorityAdapter,
  submitAttestationRequest,
  isAuthorityAvailable: IndependentAttestationAuthority.isAuthorityAvailable,
  PUBLIC_KEY_ENV: PR02_P0_ATTESTATION_PUBLIC_KEY_ENV,
  REPLAY_DIR_ENV: PR02_P0_ATTESTATION_REPLAY_DIR_ENV,
  AUTHORITY_ENV: PR02_P0_ATTESTATION_PUBLIC_KEY_ENV,
  ENDPOINT_ENV: PR02_P0_ATTESTATION_ENDPOINT_ENV,
  AUTHORITY_ID_ENV: PR02_P0_ATTESTATION_AUTHORITY_ID_ENV,
  KEY_ID_ENV: PR02_P0_ATTESTATION_KEY_ID_ENV,
  validateAttestationEndpointUrl,
})

/**
 * Constructor del manifiesto oficial de evidencia P0 (sin secretos ni claves privadas).
 * Vincula de forma verificable la identidad del colector, la ejecución autorizada,
 * el entorno HOMOLOGACION y los hashes de respuestas SOAP y archivos normalizados.
 */
export function createPr02P0OfficialEvidenceManifest(params = {}) {
  if (!params || typeof params !== 'object') {
    throw new Error('P0_MANIFEST_PARAMS_REQUIRED')
  }
  const entorno = params.entorno || 'HOMOLOGACION'
  if (entorno !== 'HOMOLOGACION') {
    throw new Error(`P0_MANIFEST_INVALID_ENTORNO: ${entorno}`)
  }
  const origen = params.origen_verificado || 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx'
  if (origen !== 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx') {
    throw new Error(`P0_MANIFEST_INVALID_ORIGEN: ${origen}`)
  }
  if (!params.consultado_en || typeof params.consultado_en !== 'string') {
    throw new Error('P0_MANIFEST_CONSULTED_REQUIRED')
  }
  const consultedMs = Date.parse(params.consultado_en)
  if (!Number.isFinite(consultedMs)) {
    throw new Error('P0_MANIFEST_CONSULTED_INVALID')
  }
  if (params.now) {
    const nowMs = typeof params.now === 'string' || typeof params.now === 'number' ? new Date(params.now).getTime() : params.now.getTime()
    if (Number.isFinite(nowMs) && consultedMs > nowMs) {
      throw new Error('P0_MANIFEST_CONSULTED_IN_FUTURE')
    }
  }

  const pid = params.identificador_proceso
  if (!pid || typeof pid !== 'string' || pid.trim().length === 0) {
    throw new Error('P0_MANIFEST_PROCESS_ID_REQUIRED')
  }

  const colectorIdentidad = params.colector_identidad || PR02_P0_COLECTOR_IDENTIDAD
  if (typeof colectorIdentidad !== 'string' || colectorIdentidad.trim().length === 0) {
    throw new Error('P0_MANIFEST_COLLECTOR_IDENTITY_REQUIRED')
  }

  const ejecucionAutorizadaId = params.ejecucion_autorizada_id || pid
  if (typeof ejecucionAutorizadaId !== 'string' || ejecucionAutorizadaId.trim().length === 0) {
    throw new Error('P0_MANIFEST_EXECUTION_ID_REQUIRED')
  }

  const ejecucionAutorizadaScope = params.ejecucion_autorizada_scope || PR02_P0_SCOPE
  if (ejecucionAutorizadaScope !== PR02_P0_SCOPE) {
    throw new Error(`P0_MANIFEST_SCOPE_MISMATCH: Se requiere scope '${PR02_P0_SCOPE}', recibido '${ejecucionAutorizadaScope}'`)
  }

  const validateHex64 = (val, name) => {
    if (!val || typeof val !== 'string' || !/^[0-9a-f]{64}$/.test(val)) {
      throw new Error(`P0_MANIFEST_INVALID_HASH: ${name} debe ser un SHA-256 de 64 caracteres en minúsculas`)
    }
  }

  validateHex64(params.iva_respuesta_original_sha256, 'iva_respuesta_original_sha256')
  validateHex64(params.iva_archivo_normalizado_sha256, 'iva_archivo_normalizado_sha256')
  validateHex64(params.condition_respuesta_original_sha256, 'condition_respuesta_original_sha256')
  validateHex64(params.condition_archivo_normalizado_sha256, 'condition_archivo_normalizado_sha256')

  if (params.transporte_validado !== true) {
    throw new Error('P0_MANIFEST_TRANSPORT_NOT_VALIDATED')
  }

  // Comprobar estrictamente que no existen secretos en el manifiesto
  const checkParams = { ...params }
  delete checkParams.trustedAttestationPublicKey
  delete checkParams.trustedGoPublicKey
  delete checkParams.authoritySecret
  const str = JSON.stringify(checkParams).toLowerCase()
  for (const forbidden of ['"token":', '"sign":', 'loginticket', 'privatekey', 'private key', 'begin ' + 'private key', 'password']) {
    if (str.includes(forbidden)) {
      throw new Error(`P0_MANIFEST_SECRETS_PROHIBITED: Manifiesto contiene referencias a credenciales o tokens ('${forbidden}')`)
    }
  }

  const isSimulated = params.transport_type === 'SIMULATED' || params.isSimulated === true
  let attestation = params.attestation || null

  let goAuthId = params.go_authorization_id || (params.goAuthorization && typeof params.goAuthorization === 'object' ? (params.goAuthorization.identificador || params.goAuthorization.authorizationId) : null) || null
  let goAuthSha = params.go_authorization_sha256 || (params.goAuthorization && typeof params.goAuthorization === 'object' ? params.goAuthorization.documentSha256 : null) || null
  if (!goAuthId && params.goAuthorization && typeof params.goAuthorization === 'string') {
    goAuthId = params.goAuthorization.trim()
    goAuthSha = sha256(params.goAuthorization.trim())
  }

  // Si no se proporcionó atestación previa, se genera
  if (!attestation) {
    attestation = createP0Attestation({
      manifest: {
        identificador_proceso: pid,
        ejecucion_autorizada_id: ejecucionAutorizadaId,
        ejecucion_autorizada_scope: ejecucionAutorizadaScope,
        consultado_en: params.consultado_en,
        entorno,
        iva_respuesta_original_sha256: params.iva_respuesta_original_sha256,
        iva_archivo_normalizado_sha256: params.iva_archivo_normalizado_sha256,
        condition_respuesta_original_sha256: params.condition_respuesta_original_sha256,
        condition_archivo_normalizado_sha256: params.condition_archivo_normalizado_sha256,
      },
      commitSha: params.commit_sha || resolveCurrentGitHead() || '0'.repeat(40),
      transportType: isSimulated ? 'SIMULATED' : (params.transport_type || 'SIMULATED'),
      authoritySecret: params.authoritySecret,
      goAuthorizationId: goAuthId,
      goAuthorizationSha256: goAuthSha,
      executorIdentity: colectorIdentidad,
      now: params.now,
    })
  }

  if (attestation) {
    if (!goAuthId && attestation.goAuthorizationId) goAuthId = attestation.goAuthorizationId
    if (!goAuthSha && attestation.goAuthorizationSha256) goAuthSha = attestation.goAuthorizationSha256
  }

  // Comprobar si está acreditada: requiere transporte oficial y verificación válida de atestación
  let isAccredited = false
  if (attestation && attestation.transportType === 'OFFICIAL' && !isSimulated) {
    const verified = verifyP0Attestation(attestation, {
      manifest: {
        identificador_proceso: pid,
        ejecucion_autorizada_id: ejecucionAutorizadaId,
        consultado_en: params.consultado_en,
        ejecucion_autorizada_scope: ejecucionAutorizadaScope,
        iva_respuesta_original_sha256: params.iva_respuesta_original_sha256,
        iva_archivo_normalizado_sha256: params.iva_archivo_normalizado_sha256,
        condition_respuesta_original_sha256: params.condition_respuesta_original_sha256,
        condition_archivo_normalizado_sha256: params.condition_archivo_normalizado_sha256,
        entorno,
        go_authorization_id: goAuthId,
        go_authorization_sha256: goAuthSha,
      },
      authoritySecret: params.authoritySecret,
      trustedAttestationPublicKey: params.trustedAttestationPublicKey,
      allowTestKeys: Boolean(params.allowTestKeys),
      commitSha: params.commit_sha,
    })
    isAccredited = verified.valid === true
  }

  // No permitir que el caller declare accredited: true para evidencia simulada o no acreditada / autoatestada
  if (params.accredited === true && (!isAccredited || isSimulated || (attestation && attestation.trustModel === 'SELF_ATTESTED'))) {
    throw new Error('P0_SELF_ATTESTED_EVIDENCE_CANNOT_BE_ACCREDITED: No se puede declarar acreditada una evidencia con atestación local del colector (trustModel=SELF_ATTESTED)')
  }

  const manifestBody = {
    entorno,
    operaciones: Object.freeze(['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor']),
    consultado_en: params.consultado_en,
    identificador_proceso: pid,
    colector_identidad: colectorIdentidad,
    ejecucion_autorizada_id: ejecucionAutorizadaId,
    ejecucion_autorizada_scope: ejecucionAutorizadaScope,
    iva_respuesta_original_sha256: params.iva_respuesta_original_sha256,
    iva_archivo_normalizado_sha256: params.iva_archivo_normalizado_sha256,
    condition_respuesta_original_sha256: params.condition_respuesta_original_sha256,
    condition_archivo_normalizado_sha256: params.condition_archivo_normalizado_sha256,
    transporte_validado: true,
    transport_type: isSimulated || !isAccredited ? 'SIMULATED' : (params.transport_type || 'OFFICIAL'),
    origen_verificado: origen,
    accredited: isAccredited,
    go_authorization_id: goAuthId || null,
    go_authorization_sha256: goAuthSha || null,
    attestation,
  }

  const manifestSha256 = computeP0ManifestDigest(manifestBody)

  return Object.freeze({
    ...manifestBody,
    manifest_sha256: manifestSha256,
  })
}

/**
 * Calcula el digest canónico SHA-256 del cuerpo del manifiesto P0 (excluyendo manifest_sha256).
 */
export function computeP0ManifestDigest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('P0_MANIFEST_INVALID')
  }
  const canonicalBody = {
    entorno: manifest.entorno,
    operaciones: manifest.operaciones,
    consultado_en: manifest.consultado_en,
    identificador_proceso: manifest.identificador_proceso,
    colector_identidad: manifest.colector_identidad,
    ejecucion_autorizada_id: manifest.ejecucion_autorizada_id,
    ejecucion_autorizada_scope: manifest.ejecucion_autorizada_scope,
    iva_respuesta_original_sha256: manifest.iva_respuesta_original_sha256,
    iva_archivo_normalizado_sha256: manifest.iva_archivo_normalizado_sha256,
    condition_respuesta_original_sha256: manifest.condition_respuesta_original_sha256,
    condition_archivo_normalizado_sha256: manifest.condition_archivo_normalizado_sha256,
    transporte_validado: manifest.transporte_validado,
    transport_type: manifest.transport_type,
    origen_verificado: manifest.origen_verificado,
    accredited: manifest.accredited,
    go_authorization_id: manifest.go_authorization_id !== undefined ? manifest.go_authorization_id : null,
    go_authorization_sha256: manifest.go_authorization_sha256 !== undefined ? manifest.go_authorization_sha256 : null,
    attestation: manifest.attestation !== undefined ? manifest.attestation : null,
  }
  return sha256(JSON.stringify(canonicalBody))
}

/**
 * Validador estricto del manifiesto oficial de evidencia P0.
 * Exige procedencia demostrable: colector autorizado, ejecución autorizada, entorno HOMOLOGACION,
 * operaciones permitidas exactas, transporte validado, hashes SHA-256 de respuestas SOAP y normalizados.
 */
export function validatePr02P0Manifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('P0_MANIFEST_INVALID: Se requiere objeto de manifiesto P0')
  }
  if (
    manifest.ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED === true ||
    (manifest.attestation && manifest.attestation.ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED === true)
  ) {
    throw new Error('P0_MANIFEST_FRAUDULENT_ARCA_VERIFICATION: Declaración fraudulenta de verificación criptográfica directa de ARCA. ARCA WSFE no emite firmas digitales en respuestas SOAP.')
  }
  if (manifest.entorno !== 'HOMOLOGACION') {
    throw new Error('P0_MANIFEST_ENTORNO_MISMATCH: Se requiere entorno HOMOLOGACION')
  }
  if (manifest.origen_verificado !== 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx') {
    throw new Error('P0_MANIFEST_ORIGIN_MISMATCH: Origen verificado debe ser WSFE Homologación')
  }
  if (manifest.transporte_validado !== true) {
    throw new Error('P0_MANIFEST_TRANSPORT_INVALID: Transporte no validado')
  }
  if (manifest.accredited !== true) {
    throw new Error('P0_MANIFEST_NOT_ACCREDITED: Evidencia no acreditada')
  }
  if (!manifest.attestation || typeof manifest.attestation !== 'object') {
    throw new Error('P0_MANIFEST_ATTESTATION_MISSING: Manifiesto carece de atestación oficial verificable')
  }
  if (manifest.transport_type && manifest.transport_type !== 'OFFICIAL') {
    throw new Error('P0_MANIFEST_TRANSPORT_NOT_OFFICIAL: El manifiesto fue generado con transporte simulado')
  }
  if (!manifest.colector_identidad || typeof manifest.colector_identidad !== 'string' || manifest.colector_identidad.trim().length === 0) {
    throw new Error('P0_MANIFEST_COLLECTOR_IDENTITY_REQUIRED: Falta identidad del colector autorizado')
  }
  if (manifest.colector_identidad !== PR02_P0_COLECTOR_IDENTIDAD) {
    throw new Error(`P0_MANIFEST_COLLECTOR_IDENTITY_MISMATCH: Identidad del colector '${manifest.colector_identidad}' no coincide con '${PR02_P0_COLECTOR_IDENTIDAD}'`)
  }
  if (!manifest.ejecucion_autorizada_id || typeof manifest.ejecucion_autorizada_id !== 'string' || manifest.ejecucion_autorizada_id.trim().length === 0) {
    throw new Error('P0_MANIFEST_EXECUTION_ID_REQUIRED: Falta identificador de ejecución autorizada vinculada')
  }
  if (manifest.ejecucion_autorizada_scope !== PR02_P0_SCOPE) {
    throw new Error(`P0_MANIFEST_SCOPE_MISMATCH: Scope de ejecución debe ser ${PR02_P0_SCOPE}`)
  }
  if (!Array.isArray(manifest.operaciones) || manifest.operaciones.length !== 2 ||
      manifest.operaciones[0] !== 'FEParamGetTiposIva' || manifest.operaciones[1] !== 'FEParamGetCondicionIvaReceptor') {
    throw new Error('P0_MANIFEST_OPERATIONS_MISMATCH: Operaciones deben ser exactamente FEParamGetTiposIva y FEParamGetCondicionIvaReceptor')
  }
  if (!manifest.consultado_en || !Number.isFinite(Date.parse(manifest.consultado_en))) {
    throw new Error('P0_MANIFEST_CONSULTED_INVALID: Fecha de consulta inválida')
  }
  for (const f of [
    'iva_respuesta_original_sha256',
    'iva_archivo_normalizado_sha256',
    'condition_respuesta_original_sha256',
    'condition_archivo_normalizado_sha256',
  ]) {
    if (!manifest[f] || !/^[0-9a-f]{64}$/.test(manifest[f])) {
      throw new Error(`P0_MANIFEST_HASH_INVALID: Hash inválido en ${f}`)
    }
  }

  if (manifest.accredited === true) {
    if (!manifest.go_authorization_id || typeof manifest.go_authorization_id !== 'string' || manifest.go_authorization_id.trim().length === 0) {
      throw new Error('P0_MANIFEST_GO_ID_REQUIRED: Se requiere go_authorization_id en manifiesto acreditado')
    }
    if (!manifest.go_authorization_sha256 || typeof manifest.go_authorization_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.go_authorization_sha256)) {
      throw new Error('P0_MANIFEST_GO_SHA_REQUIRED: Se requiere go_authorization_sha256 de 64 caracteres en manifiesto acreditado')
    }
  }

  // Verificar integridad del propio manifiesto (manifest_sha256)
  const expectedManifestSha = computeP0ManifestDigest(manifest)
  if (!manifest.manifest_sha256 || !/^[0-9a-f]{64}$/.test(manifest.manifest_sha256) || manifest.manifest_sha256 !== expectedManifestSha) {
    throw new Error('P0_MANIFEST_DIGEST_MISMATCH: El hash manifest_sha256 es inválido o el manifiesto fue alterado post-creación')
  }

  // Comprobar estrictamente ausencia de secretos
  const str = JSON.stringify(manifest).toLowerCase()
  for (const forbidden of ['"token":', '"sign":', 'loginticket', 'privatekey', 'private key', '-----begin', 'password']) {
    if (str.includes(forbidden)) {
      throw new Error(`P0_MANIFEST_SECRETS_PROHIBITED: Manifiesto contiene referencias a credenciales o tokens ('${forbidden}')`)
    }
  }

  return true
}

/**
 * Validador de importación P1 con evidencia oficial verificada de P0.
 * Exige:
 * 1. Documento de autorización GO firmado y verificado cruzado con el manifiesto.
 * 2. Commit SHA esperado exacto (expectedHead).
 * 3. Respuestas SOAP originales en crudo con hashes coincidentes.
 * 4. Parseo independiente y reconstrucción exacta de parámetros a partir de los XMLs en crudo.
 * 5. Atestación independiente acreditada emitida por Attestation Authority (rechazo de SELF_ATTESTED).
 */
export function validatePr02P1ImportEvidence(options = {}) {
  if (!options || typeof options !== 'object') {
    throw new Error('P1_IMPORT_OPTIONS_REQUIRED')
  }

  // Condición 15: Ninguna clave privada ni capacidad de firma en el runtime fiscal
  assertRuntimeSigningIsolation({
    fiscalScriptsDir: options.fiscalScriptsDir,
    env: options.env,
  })

  // Regla de no autoelevación mediante flags, opciones o variables de entorno
  const env = options.env || process.env
  if (
    options.elevateToIndependent === true ||
    options.forceIndependentAttestation === true ||
    options.allowSelfAttestedAsIndependent === true ||
    options.independentAuthorityAvailable === true ||
    options.elevateTrustModel === true ||
    options.forceProductionAuthority === true ||
    Boolean(env.PR02_P0_FORCE_INDEPENDENT_ATTESTATION) ||
    env.INDEPENDENT_ATTESTATION_AVAILABLE === 'true'
  ) {
    throw new Error('P1_IMPORT_FORBIDDEN: SELF_ATTESTATION_AUTO_ELEVATION_REJECTED: Prohibido autoelevar SELF_ATTESTED a INDEPENDENT_ATTESTED mediante opciones, flags o variables de entorno')
  }

  const { manifest, ivaText, conditionText, rawIvaSoapText, rawConditionSoapText, now, expectedHashes } = options

  if (!manifest) {
    throw new Error('P1_IMPORT_MANIFEST_REQUIRED: Se requiere manifiesto oficial P0 para importar evidencia en P1')
  }

  // Rechazo taxativo de evidencia simulada (incluso si se acompaña de un firmante de test)
  if (
    options.isSimulated === true ||
    manifest.transport_type === 'SIMULATED' ||
    (manifest.transport_type && manifest.transport_type !== 'OFFICIAL') ||
    (manifest.attestation && manifest.attestation.transportType === 'SIMULATED') ||
    (options.independentAttestation && options.independentAttestation.transportType === 'SIMULATED')
  ) {
    throw new Error('P1_IMPORT_FORBIDDEN: SIMULATED_EVIDENCE_REJECTED: P0_MANIFEST_TRANSPORT_NOT_OFFICIAL: La evidencia simulada no puede importarse en P1 ni acreditarse mediante un firmante de test')
  }

  if (
    manifest.ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED === true ||
    (manifest.attestation && manifest.attestation.ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED === true)
  ) {
    throw new Error('P1_IMPORT_FORBIDDEN: Declaración fraudulenta de verificación criptográfica directa de ARCA. ARCA WSFE no emite firmas digitales en respuestas SOAP.')
  }

  if (manifest.authoritySecret || (manifest.attestation && manifest.attestation.authoritySecret)) {
    throw new Error('P1_IMPORT_FORBIDDEN: El manifiesto no puede proveer su propia clave de autoridad')
  }

  // 1. Exigencia obligatoria de documento de autorización GO firmado
  if (!options.goAuthorizationDoc) {
    throw new Error('P1_IMPORT_FORBIDDEN: GO_AUTHORIZATION_REQUIRED: Se requiere el documento de autorización GO firmado para validar importación P1')
  }

  // 2. Exigencia obligatoria de commit SHA esperado
  const expectedHead = options.expectedHead || options.head
  if (!expectedHead || !/^[0-9a-fA-F]{40}$/.test(expectedHead)) {
    throw new Error('P1_IMPORT_FORBIDDEN: EXPECTED_HEAD_REQUIRED: Se requiere commit SHA esperado de 40 caracteres hexadecimales para validar importación P1')
  }

  // 3. Exigencia obligatoria de respuestas SOAP originales en crudo
  if (!rawIvaSoapText || typeof rawIvaSoapText !== 'string' || rawIvaSoapText.trim().length === 0) {
    throw new Error('P1_IMPORT_FORBIDDEN: RAW_SOAP_RESPONSES_REQUIRED: Se requiere la respuesta SOAP original en crudo de FEParamGetTiposIva')
  }
  if (!rawConditionSoapText || typeof rawConditionSoapText !== 'string' || rawConditionSoapText.trim().length === 0) {
    throw new Error('P1_IMPORT_FORBIDDEN: RAW_SOAP_RESPONSES_REQUIRED: Se requiere la respuesta SOAP original en crudo de FEParamGetCondicionIvaReceptor')
  }

  if (typeof ivaText !== 'string' || typeof conditionText !== 'string') {
    throw new Error('P1_IMPORT_EVIDENCE_TEXTS_REQUIRED')
  }

  const ivaSha = sha256(ivaText)
  const conditionSha = sha256(conditionText)

  if (ivaSha !== manifest.iva_archivo_normalizado_sha256) {
    throw new Error('P1_IMPORT_IVA_HASH_MISMATCH: Archivo normalizado no coincide con manifiesto P0')
  }
  if (conditionSha !== manifest.condition_archivo_normalizado_sha256) {
    throw new Error('P1_IMPORT_CONDITION_HASH_MISMATCH: Archivo normalizado no coincide con manifiesto P0')
  }

  const rawIvaSha = sha256(rawIvaSoapText)
  if (rawIvaSha !== manifest.iva_respuesta_original_sha256) {
    throw new Error('P1_IMPORT_RAW_IVA_SOAP_HASH_MISMATCH: Respuesta SOAP de tipos de IVA no coincide con el manifiesto P0')
  }
  const rawCondSha = sha256(rawConditionSoapText)
  if (rawCondSha !== manifest.condition_respuesta_original_sha256) {
    throw new Error('P1_IMPORT_RAW_CONDITION_SOAP_HASH_MISMATCH: Respuesta SOAP de condición IVA no coincide con el manifiesto P0')
  }

  // 4. Parseo independiente de XMLs SOAP en crudo y reconstrucción estricta de parámetros
  const reconstructedIva = parseWsfeTiposIvaResponse(rawIvaSoapText, manifest.consultado_en)
  const reconstructedCond = parseWsfeCondicionIvaReceptorResponse(rawConditionSoapText, manifest.consultado_en)

  let parsedProvidedIva
  let parsedReconstructedIva
  try {
    parsedProvidedIva = JSON.parse(ivaText)
    parsedReconstructedIva = JSON.parse(reconstructedIva.ivaText)
  } catch {
    throw new Error('P1_IMPORT_FORBIDDEN: IVA_NORMALIZED_JSON_INVALID: Fallo de estructura JSON en archivos normalizados de IVA')
  }

  if (JSON.stringify(parsedProvidedIva.parametros) !== JSON.stringify(parsedReconstructedIva.parametros)) {
    throw new Error('P1_IMPORT_FORBIDDEN: IVA_NORMALIZED_DATA_DISCREPANCY: Los parámetros del archivo normalizado de IVA difieren de la reconstrucción independiente del XML SOAP original')
  }

  let parsedProvidedCond
  let parsedReconstructedCond
  try {
    parsedProvidedCond = JSON.parse(conditionText)
    parsedReconstructedCond = JSON.parse(reconstructedCond.conditionText)
  } catch {
    throw new Error('P1_IMPORT_FORBIDDEN: CONDITION_NORMALIZED_DATA_DISCREPANCY: Fallo de estructura JSON en archivos normalizados de condición IVA')
  }

  if (JSON.stringify(parsedProvidedCond.parametros) !== JSON.stringify(parsedReconstructedCond.parametros)) {
    throw new Error('P1_IMPORT_FORBIDDEN: CONDITION_NORMALIZED_DATA_DISCREPANCY: Los parámetros del archivo normalizado de condición IVA difieren de la reconstrucción independiente del XML SOAP original')
  }

  if (expectedHashes) {
    if (expectedHashes.iva && ivaSha !== expectedHashes.iva) {
      throw new Error('P1_IMPORT_EXPECTED_IVA_HASH_MISMATCH')
    }
    if (expectedHashes.condition && conditionSha !== expectedHashes.condition) {
      throw new Error('P1_IMPORT_EXPECTED_CONDITION_HASH_MISMATCH')
    }
  }

  // 5. Validación obligatoria del documento de autorización GO provisto
  const trustedGoPublicKeyInput =
    options.trustedGoPublicKey ||
    options.trustedGoAuthoritySecret ||
    process.env[PR02_P0_GO_PUBLIC_KEY_ENV] ||
    process.env[PR02_P0_GO_AUTHORITY_ENV]

  const goCheck = validatePr02P0GoAuthorization(options.goAuthorizationDoc, {
    expectedHead,
    trustedGoPublicKey: trustedGoPublicKeyInput,
    allowTestKeys: Boolean(options.allowTestKeys),
    consumedAuthorizationsDir: options.consumedAuthorizationsDir,
    now,
  })
  if (manifest.go_authorization_id !== goCheck.authorizationId) {
    throw new Error(`P1_IMPORT_FORBIDDEN: GO_ID_MISMATCH: Identificador del GO provisto ('${goCheck.authorizationId}') no coincide con el manifiesto ('${manifest.go_authorization_id}')`)
  }
  if (manifest.go_authorization_sha256 !== goCheck.documentSha256) {
    throw new Error(`P1_IMPORT_FORBIDDEN: GO_SHA_MISMATCH: Digest del GO provisto ('${goCheck.documentSha256}') no coincide con el manifiesto ('${manifest.go_authorization_sha256}')`)
  }

  // 6. Exigencia obligatoria de atestación independiente acreditada (rechazo taxativo de SELF_ATTESTED)
  const targetAttestation = options.independentAttestation || manifest.attestation
  if (!targetAttestation || targetAttestation.trustModel === 'SELF_ATTESTED') {
    throw new Error('P1_IMPORT_FORBIDDEN: INDEPENDENT_ATTESTATION_REQUIRED: Evidencia no cuenta con atestación independiente acreditada (atestación local SELF_ATTESTED rechazada para importación oficial)')
  }

  if (targetAttestation.trustModel !== 'INDEPENDENT_ATTESTED' || targetAttestation.accredited !== true) {
    throw new Error('P1_IMPORT_FORBIDDEN: INDEPENDENT_ATTESTATION_REQUIRED: Evidencia requiere atestación independiente acreditada emitida por Attestation Authority')
  }

  const trustedAttestationPublicKey =
    options.trustedAttestationPublicKey ||
    options.trustedAuthoritySecret ||
    options.authoritySecret ||
    process.env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV] ||
    process.env[PR02_P0_AUTHORITY_ENV]

  if (!trustedAttestationPublicKey) {
    throw new Error('P1_IMPORT_FORBIDDEN: ATTESTATION_AUTHORITY_NOT_AVAILABLE: Se requiere clave pública de autoridad de atestación custodiada para verificar procedencia')
  }

  // Separación criptográfica y de identidad estricta de autoridades: GO Authority vs Attestation Authority
  try {
    const goKeyObj = validateP0GoPublicKey(trustedGoPublicKeyInput, Boolean(options.allowTestKeys))
    const attestationKeyObj = validateP0AttestationPublicKey(trustedAttestationPublicKey, Boolean(options.allowTestKeys))
    assertAuthoritiesSeparated({
      goAuthorityId: options.goAuthorityId || goCheck.approverId,
      attestationAuthorityId:
        (options.attestationResponse && options.attestationResponse.authorityId) ||
        targetAttestation.authorityId ||
        options.authorityId,
      goKeyId: options.goKeyId,
      attestationKeyId:
        (options.attestationResponse && options.attestationResponse.keyId) ||
        targetAttestation.keyId ||
        computePublicKeyId(attestationKeyObj),
      trustedGoPublicKey: goKeyObj,
      trustedAttestationPublicKey: attestationKeyObj,
      goAuthorizationDoc: options.goAuthorizationDoc,
      allowTestKeys: Boolean(options.allowTestKeys),
    })
  } catch (sepErr) {
    throw new Error(`P1_IMPORT_FORBIDDEN: ${sepErr && sepErr.message ? sepErr.message : String(sepErr)}`)
  }

  // Verificación de cadena explícita: AttestationResponse -> AttestationRequestPackage -> requestSha256 -> manifestSha256 -> evidence digests
  if (options.attestationRequest) {
    try {
      validateAttestationRequest(options.attestationRequest)
    } catch (reqErr) {
      throw new Error(`P1_IMPORT_FORBIDDEN: ATTESTATION_REQUEST_MISMATCH: ${reqErr.message}`)
    }
    const reqIvaRaw = options.attestationRequest.rawSoapArtifacts.find((a) => /tiposiva/i.test(a.name))
    const reqCondRaw = options.attestationRequest.rawSoapArtifacts.find((a) => /condicionivareceptor/i.test(a.name))
    const reqIvaNorm = options.attestationRequest.normalizedArtifacts.find((a) => /tiposiva/i.test(a.name))
    const reqCondNorm = options.attestationRequest.normalizedArtifacts.find((a) => /condicionivareceptor/i.test(a.name))
    if (
      !reqIvaRaw ||
      !reqCondRaw ||
      !reqIvaNorm ||
      !reqCondNorm ||
      reqIvaRaw.sha256 !== rawIvaSha ||
      reqCondRaw.sha256 !== rawCondSha ||
      reqIvaNorm.sha256 !== ivaSha ||
      reqCondNorm.sha256 !== conditionSha ||
      options.attestationRequest.processId !== manifest.identificador_proceso ||
      options.attestationRequest.executionScope !== manifest.ejecucion_autorizada_scope ||
      options.attestationRequest.authorizationId !== manifest.go_authorization_id ||
      options.attestationRequest.goAuthorizationDocumentSha256 !== manifest.go_authorization_sha256 ||
      options.attestationRequest.commitSha !== String(expectedHead)
    ) {
      throw new Error('P1_IMPORT_FORBIDDEN: ATTESTATION_REQUEST_MISMATCH: El AttestationRequestPackage no coincide con los digests de evidencia o el manifiesto P0')
    }
  }

  let responseConsumption = null
  if (options.attestationResponse !== undefined) {
    if (!options.attestationRequest) {
      throw new Error('P1_IMPORT_FORBIDDEN: ATTESTATION_REQUEST_MISMATCH: Se requiere AttestationRequestPackage explícito para verificar la vinculación de AttestationResponse en P1')
    }
    try {
      responseConsumption = consumeAttestationResponseDurable(options.attestationResponse, {
        attestationRequest: options.attestationRequest,
        manifest,
        commitSha: expectedHead,
        trustedAttestationPublicKey,
        trustedGoPublicKey: trustedGoPublicKeyInput,
        goAuthorityId: options.goAuthorityId || goCheck.approverId,
        goKeyId: options.goKeyId,
        goAuthorizationDoc: options.goAuthorizationDoc,
        allowedAuthorityIds: options.allowedAuthorityIds,
        allowedKeyIds: options.allowedKeyIds,
        allowTestKeys: Boolean(options.allowTestKeys),
        fiscalScriptsDir: options.fiscalScriptsDir,
        env: options.env,
        now,
        consumedResponsesDir:
          options.consumedResponsesDir ??
          options.attestationReplayDir ??
          options.replayRegistryDir,
        repoRoot: options.repoRoot,
        fsWriteExclusive: options.fsWriteExclusive,
        enforceAntiReplay: options.enforceAntiReplay,
        allowProcessLocalFallback: options.allowProcessLocalFallback,
        degradeToProcessLocal: options.degradeToProcessLocal,
        fallbackToMemory: options.fallbackToMemory,
        processLocal: options.processLocal,
        fallback: options.fallback,
        allowMemoryReplay: options.allowMemoryReplay,
        disableDurableReplay: options.disableDurableReplay,
        skipReplayStorage: options.skipReplayStorage,
        inMemoryReplay: options.inMemoryReplay,
        consumeOnVerify: options.consumeOnVerify,
        antiReplayGuarantee: options.antiReplayGuarantee,
        skipVerification: options.skipVerification,
        preVerified: options.preVerified,
        trustPreviousVerify: options.trustPreviousVerify,
        verified: options.verified,
      })
    } catch (consumeErr) {
      const rawMsg = consumeErr && consumeErr.message ? consumeErr.message : String(consumeErr)
      const normalizedMsg = rawMsg.replace(/^ATTESTATION_RESPONSE_CONSUMPTION_DENIED:\s*/, '')
      throw new Error(`P1_IMPORT_FORBIDDEN: ${normalizedMsg} [ATTESTATION_RESPONSE_CONSUMPTION_DENIED]`)
    }
  }

  const attestationCheck = verifyP0Attestation(targetAttestation, {
    manifest,
    commitSha: expectedHead,
    trustedAttestationPublicKey,
    trustedGoPublicKey: trustedGoPublicKeyInput,
    goAuthorityId: options.goAuthorityId || goCheck.approverId,
    goKeyId: options.goKeyId,
    goAuthorizationDoc: options.goAuthorizationDoc,
    attestationRequest: options.attestationRequest,
    fiscalScriptsDir: options.fiscalScriptsDir,
    env: options.env,
    now,
    allowTestKeys: Boolean(options.allowTestKeys),
  })

  if (!attestationCheck.valid) {
    const detail = attestationCheck.errorCategory ? `${attestationCheck.errorCategory}: ${attestationCheck.reason}` : attestationCheck.reason
    throw new Error(`P1_IMPORT_FORBIDDEN: Procedencia oficial no verificada (${detail}). Importación denegada.`)
  }

  try {
    validatePr02P0Manifest(manifest)
  } catch (err) {
    if (
      err.message.includes('P0_MANIFEST_NOT_ACCREDITED') ||
      err.message.includes('P0_MANIFEST_TRANSPORT_NOT_OFFICIAL') ||
      err.message.includes('P0_MANIFEST_ATTESTATION_MISSING') ||
      err.message.includes('P0_MANIFEST_GO_ID_REQUIRED') ||
      err.message.includes('P0_MANIFEST_GO_SHA_REQUIRED') ||
      err.message.includes('P0_MANIFEST_DIGEST_MISMATCH') ||
      err.message.includes('P0_MANIFEST_COLLECTOR_IDENTITY_MISMATCH') ||
      err.message.includes('P0_MANIFEST_FRAUDULENT_ARCA_VERIFICATION')
    ) {
      throw new Error(`P1_IMPORT_FORBIDDEN: ${err.message}`)
    }
    throw err
  }

  // Estructura
  validateTiposIvaEvidence(ivaText, ivaSha)
  validateCondicionIvaReceptorEvidence(conditionText, conditionSha)

  // Frescura
  const consultedMs = Date.parse(manifest.consultado_en)
  const nowMs = now ? (typeof now === 'string' || typeof now === 'number' ? new Date(now).getTime() : now.getTime()) : Date.now()
  if (consultedMs > nowMs) {
    throw new Error('P1_IMPORT_CONSULTED_IN_FUTURE: consultado_en no puede ser posterior al reloj actual')
  }

  return Object.freeze({
    status: 'PASS',
    officialEvidenceVerified: true,
    P1_IMPORT_ALLOWED: true,
    INDEPENDENT_ATTESTATION_AVAILABLE: true,
    EVIDENCE_INTEGRITY: 'PASS',
    EVIDENCE_CUSTODY_ATTESTED: true,
    ATTESTATION_TRUST_MODEL: 'INDEPENDENT_ATTESTED',
    TRUSTED_EXECUTION_BOUNDARY: 'VERIFIED',
    ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED: false,
    trustModel: 'LIMITED',
    ANTI_REPLAY_GUARANTEE_LEVEL,
    ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL,
    attestationResponseConsumed: responseConsumption ? responseConsumption.consumed : false,
    attestationResponseReplayId: responseConsumption ? responseConsumption.replayId : null,
    consultado_en: manifest.consultado_en,
    ivaSha256: ivaSha,
    conditionSha256: conditionSha,
    manifestSha256: manifest.manifest_sha256,
  })
}

/**
 * Consulta de preflight READ ONLY para PR02-P1.
 */
export const PR02_P1_PREFLIGHT_SELECT_SQL = `SELECT jsonb_build_object(
  'transaction_read_only', current_setting('transaction_read_only'),
  'observed_at', clock_timestamp(),
  'expected_issuer_present', EXISTS (
    SELECT 1 FROM public.fiscal_emisores_homologacion WHERE cuit_emisor = $1 AND punto_venta = $2
  ),
  'expected_issuer_enabled', COALESCE((
    SELECT habilitado FROM public.fiscal_emisores_homologacion WHERE cuit_emisor = $1 AND punto_venta = $2
  ), false),
  'unexpected_enabled_issuers', (
    SELECT count(*)::int FROM public.fiscal_emisores_homologacion
    WHERE habilitado = true AND (cuit_emisor <> $1 OR punto_venta <> $2)
  ),
  'catalog_rev1_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 1
  ),
  'catalog_rev2_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 2
  ),
  'catalog_rev3_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 3
  ),
  'catalog_rev3_expired', (
    SELECT coalesce(vence_en < clock_timestamp(), true)
    FROM public.fiscal_parametros_homologacion WHERE revision = 3
  ),
  'catalog_rev4_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 4
  ),
  'existing_reusable_ta', EXISTS (
    SELECT 1 FROM public.fiscal_ta_homologacion
    WHERE estado = 'DISPONIBLE' AND vence_en > clock_timestamp() + interval '10 minutes'
  ),
  'baseline_revisions', (
    SELECT jsonb_agg(revision ORDER BY revision)
    FROM public.fiscal_parametros_homologacion
  )
) AS preflight;`

/**
 * Validador del resultado de preflight READ ONLY para PR02-P1.
 */
export function verifyPr02P1Preflight(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('PR02_P1_PREFLIGHT_INVALID')
  }
  const d = raw
  if (d.transaction_read_only !== 'on') throw new Error('PR02_P1_PREFLIGHT_NOT_READ_ONLY')
  if (!d.expected_issuer_present) throw new Error('PR02_P1_PREFLIGHT_ISSUER_NOT_FOUND')
  if (d.expected_issuer_enabled !== false) throw new Error('PR02_P1_PREFLIGHT_ISSUER_UNEXPECTEDLY_ENABLED')
  if (d.unexpected_enabled_issuers !== 0) throw new Error('PR02_P1_PREFLIGHT_UNEXPECTED_ENABLED_ISSUERS')
  if (!d.catalog_rev1_exists) throw new Error('PR02_P1_PREFLIGHT_CATALOG_REV1_MISSING')
  if (!d.catalog_rev2_exists) throw new Error('PR02_P1_PREFLIGHT_CATALOG_REV2_MISSING')
  if (!d.catalog_rev3_exists) throw new Error('PR02_P1_PREFLIGHT_CATALOG_REV3_MISSING')
  if (!d.catalog_rev3_expired) throw new Error('PR02_P1_PREFLIGHT_CATALOG_REV3_NOT_EXPIRED')
  if (d.catalog_rev4_exists) throw new Error('PR02_P1_PREFLIGHT_CATALOG_REV4_ALREADY_EXISTS')

  const baselineRevisions = Array.isArray(d.baseline_revisions) ? d.baseline_revisions : []
  const existingTaReusable = Boolean(d.existing_reusable_ta)

  return Object.freeze({
    status: 'PASS',
    transactionReadOnly: true,
    expectedIssuerPresent: true,
    expectedIssuerEnabled: false,
    unexpectedEnabledIssuers: 0,
    catalogRev3Expired: true,
    catalogRev4Exists: false,
    existingTaReusable,
    loginCmsRequired: !existingTaReusable,
    baselineRevisions,
  })
}

/**
 * Guarda transaccional atómica de P1 evaluada dentro de la misma transacción de escritura.
 */
export const PR02_P1_ATOMIC_GUARD_SQL = `SELECT jsonb_build_object(
  'catalog_total_count', (
    SELECT count(*)::int FROM public.fiscal_parametros_homologacion
  ),
  'rev1_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 1
  ),
  'rev2_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 2
  ),
  'rev3_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 3
  ),
  'rev3_hash_match', COALESCE((
    SELECT fuente_sha256 = $3::text FROM public.fiscal_parametros_homologacion WHERE revision = 3
  ), false),
  'rev3_expired', COALESCE((
    SELECT vence_en < clock_timestamp() FROM public.fiscal_parametros_homologacion WHERE revision = 3
  ), false),
  'rev4_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 4
  ),
  'expected_issuer_present', EXISTS (
    SELECT 1 FROM public.fiscal_emisores_homologacion WHERE cuit_emisor = $1::text AND punto_venta = $2::int
  ),
  'expected_issuer_enabled', COALESCE((
    SELECT habilitado FROM public.fiscal_emisores_homologacion WHERE cuit_emisor = $1::text AND punto_venta = $2::int
  ), false),
  'unexpected_enabled_issuers', (
    SELECT count(*)::int FROM public.fiscal_emisores_homologacion
    WHERE habilitado = true AND (cuit_emisor <> $1::text OR punto_venta <> $2::int)
  ),
  'candidate_rev4_hash_valid', ($4::text ~ '^[0-9a-f]{64}$'),
  'candidate_rev4_not_future', ($5::timestamptz <= clock_timestamp()),
  'candidate_rev4_unexpired', ($6::timestamptz > clock_timestamp())
) AS in_tx_guard;`

export function verifyPr02P1InTxGuard(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('PR02_P1_ATOMIC_GUARD_INVALID')
  if (raw.catalog_total_count !== undefined && raw.catalog_total_count !== 3) {
    throw new Error(`PR02_P1_BASELINE_COUNT_MISMATCH: Se esperaban 3 revisiones en baseline, encontradas ${raw.catalog_total_count}`)
  }
  if (raw.rev1_exists !== undefined && !raw.rev1_exists) throw new Error('PR02_P1_BASELINE_REV1_MISSING')
  if (raw.rev2_exists !== undefined && !raw.rev2_exists) throw new Error('PR02_P1_BASELINE_REV2_MISSING')
  if (!raw.rev3_exists) throw new Error('PR02_P1_REV3_MISSING')
  if (!raw.rev3_hash_match) throw new Error('PR02_P1_REV3_HASH_MISMATCH')
  if (!raw.rev3_expired) throw new Error('PR02_P1_REV3_NOT_EXPIRED')
  if (raw.rev4_exists) throw new Error('PR02_P1_REV4_ALREADY_EXISTS')
  if (!raw.expected_issuer_present) throw new Error('PR02_P1_ISSUER_NOT_FOUND')
  if (raw.expected_issuer_enabled !== false) throw new Error('PR02_P1_ISSUER_UNEXPECTEDLY_ENABLED')
  if (raw.unexpected_enabled_issuers !== 0) throw new Error('PR02_P1_UNEXPECTED_ENABLED_ISSUERS')
  if (!raw.candidate_rev4_hash_valid) throw new Error('PR02_P1_CANDIDATE_REV4_HASH_INVALID')
  if (!raw.candidate_rev4_not_future) throw new Error('PR02_P1_CANDIDATE_REV4_FUTURE_CONSULTED')
  if (!raw.candidate_rev4_unexpired) throw new Error('PR02_P1_CANDIDATE_REV4_EXPIRED')
  return true
}

/**
 * Construye la propuesta canónica para la revisión 4 de fiscal_parametros_homologacion.
 */
export function buildPr02CanonicalRevision4(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('PR02_CANONICAL_INPUT_REQUIRED')
  }

  const ivaText = input.ivaText
  const conditionText = input.conditionText
  const baselineText = input.baselineText

  if (typeof ivaText !== 'string' || typeof conditionText !== 'string' || typeof baselineText !== 'string') {
    throw new Error('PR02_INPUT_TEXTS_REQUIRED')
  }

  const ivaSha = input.ivaSha256 || sha256(ivaText)
  const conditionSha = input.conditionSha256 || sha256(conditionText)
  const baselineSha = input.baselineSha256 || sha256(baselineText)

  // Validar baseline
  let baselineRows
  try {
    baselineRows = JSON.parse(baselineText)
  } catch {
    throw new Error('PR02_BASELINE_JSON_INVALID')
  }
  if (!Array.isArray(baselineRows) || baselineRows.length < 3) {
    throw new Error('PR02_BASELINE_INCOMPLETE: Se requieren al menos revisiones 1, 2 y 3')
  }
  if (baselineRows.some(r => r.revision === 4)) {
    throw new Error('PR02_BASELINE_ALREADY_HAS_REV4')
  }

  // Validar evidencias individuales
  validateTiposIvaEvidence(ivaText, ivaSha)
  validateCondicionIvaReceptorEvidence(conditionText, conditionSha)

  // Determinar reloj canónico
  const now = input.now ? new Date(input.now).toISOString() : new Date().toISOString()
  const nowMs = new Date(now).getTime()
  const ivaConsulted = JSON.parse(ivaText).consultado_en
  const condConsulted = JSON.parse(conditionText).consultado_en
  const oldestConsulted = Math.min(new Date(ivaConsulted).getTime(), new Date(condConsulted).getTime())

  // Política canónica de vencimiento: <= 24 horas desde la consulta más antigua, dentro del mismo día comercial
  let expiresAt = input.expiresAt
  if (!expiresAt) {
    const localDate = new Date(nowMs - 3 * 3600000)
    const nextMidnightUtcMs = Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate() + 1, 2, 59, 59)
    const candidateExpiryMs = Math.min(oldestConsulted + 24 * 60 * 60 * 1000 - 1000, nextMidnightUtcMs)
    expiresAt = new Date(candidateExpiryMs).toISOString()
  }

  const planResult = planFiscalParameters({
    projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
    ivaText,
    conditionText,
    ivaSha256: ivaSha,
    conditionSha256: conditionSha,
    baselineText,
    baselineSha256: baselineSha,
    now,
    expiresAt,
    revision: PR02_PARAMETERS_TARGET_REVISION,
  })

  const manifest = planResult.manifest
  if (manifest.revision !== 4) {
    throw new Error(`PR02_UNEXPECTED_REVISION: ${manifest.revision}`)
  }
  if (manifest.habilitado !== false) {
    throw new Error('PR02_REVISION_4_MUST_BE_DISABLED_INITIALLY')
  }

  return Object.freeze({
    revision: 4,
    condiciones: manifest.condiciones,
    alicuotas: manifest.alicuotas,
    fuente_sha256: manifest.fuente_sha256,
    consultado_en: manifest.consultado_en,
    vence_en: manifest.vence_en,
    habilitado: false,
    sql: planResult.sql,
    plan_sha256: manifest.plan_sha256,
  })
}

export function resolveCurrentGitHead(opts = {}) {
  if (opts.headCommit && typeof opts.headCommit === 'string' && /^[0-9a-f]{40}$/.test(opts.headCommit)) {
    return opts.headCommit
  }
  if (process.env.GIT_HEAD_COMMIT && /^[0-9a-f]{40}$/.test(process.env.GIT_HEAD_COMMIT)) {
    return process.env.GIT_HEAD_COMMIT
  }
  try {
    const head = execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (/^[0-9a-f]{40}$/.test(head)) return head
  } catch {}
  return null
}

export function resolveCurrentGitRemoteHead(opts = {}) {
  if (opts.remoteHead && typeof opts.remoteHead === 'string' && /^[0-9a-f]{40}$/.test(opts.remoteHead)) {
    return opts.remoteHead
  }
  try {
    const remote = execSync('git rev-parse origin/feat/pilot-envases-returns', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (/^[0-9a-f]{40}$/.test(remote)) return remote
  } catch {}
  return null
}

/**
 * Crea el paquete cerrado de ejecución PR02 parámetros (sin secretos).
 */
export function createPr02ParametersExecutionPackage(opts = {}) {
  const headCommit = opts.headCommit || resolveCurrentGitHead(opts)
  if (!headCommit || typeof headCommit !== 'string' || !/^[0-9a-f]{40}$/.test(headCommit)) {
    throw new Error('PR02_PACKAGE_HEAD_REQUIRED: Se requiere SHA de 40 caracteres hexadecimales para el package')
  }
  const remoteHead = opts.remoteHead || (opts.headCommit ? undefined : resolveCurrentGitRemoteHead(opts))
  if (remoteHead && remoteHead !== headCommit) {
    throw new Error(`PR02_PACKAGE_HEAD_MISMATCH: HEAD (${headCommit}) difiere de REMOTE_HEAD (${remoteHead})`)
  }
  const scope = opts.scope || PR02_P1_SCOPE
  if (!PR02_PARAMETERS_ALLOWED_SCOPES.includes(scope)) {
    throw new Error(`PR02_PACKAGE_INVALID_SCOPE: '${scope}'`)
  }

  const isTaReusable = opts.isTaReusable ?? false
  const callLimits = isTaReusable ? PR02_PARAMETERS_CALL_LIMITS_REUSABLE : PR02_PARAMETERS_CALL_LIMITS_NON_REUSABLE
  const preparedAt = new Date().toISOString()

  const pkg = {
    scope,
    projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
    targetRevision: PR02_PARAMETERS_TARGET_REVISION,
    headCommit,
    expectedIssuerCuit: PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
    expectedIssuerPuntoVenta: PR02_PARAMETERS_EXPECTED_ISSUER_PV,
    requiredCalls: PR02_PARAMETERS_REQUIRED_CALLS,
    prohibitedCalls: PR02_PARAMETERS_PROHIBITED_CALLS,
    callLimits,
    emissionProhibited: {
      fecaesolicitarReachable: false,
      fecompconsultarReachable: false,
      emissionCapable: false,
    },
    emitterStatus: {
      enabledDuringPr02Parameters: false,
    },
    revisionIntegrity: {
      revision3Mutated: false,
      revision4InsertOnly: true,
    },
    preparedAt,
  }

  const packageSha256 = sha256(JSON.stringify(pkg))

  return Object.freeze({
    ...pkg,
    packageSha256,
  })
}

/**
 * Consulta de postcheck READ ONLY para PR02-P1.
 */
export const PR02_P1_POSTCHECK_SELECT_SQL = `SELECT jsonb_build_object(
  'transaction_read_only', current_setting('transaction_read_only'),
  'observed_at', clock_timestamp(),
  'rev4_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 4
  ),
  'rev4_enabled', COALESCE((
    SELECT habilitado FROM public.fiscal_parametros_homologacion WHERE revision = 4
  ), true),
  'rev4_fuente_sha256', (
    SELECT fuente_sha256 FROM public.fiscal_parametros_homologacion WHERE revision = 4
  ),
  'rev3_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 3
  ),
  'rev3_fuente_sha256', (
    SELECT fuente_sha256 FROM public.fiscal_parametros_homologacion WHERE revision = 3
  ),
  'expected_issuer_enabled', COALESCE((
    SELECT habilitado FROM public.fiscal_emisores_homologacion WHERE cuit_emisor = $1 AND punto_venta = $2
  ), true)
) AS postcheck;`

/**
 * Validador del resultado de postcheck READ ONLY para PR02-P1.
 */
export function verifyPr02P1Postcheck(raw, expected = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('PR02_P1_POSTCHECK_INVALID')
  }
  const d = raw
  if (d.transaction_read_only !== 'on') throw new Error('PR02_P1_POSTCHECK_NOT_READ_ONLY')
  if (!d.rev4_exists) throw new Error('PR02_P1_POSTCHECK_REV4_MISSING')
  if (d.rev4_enabled !== false) throw new Error('PR02_P1_POSTCHECK_REV4_ENABLED')
  if (expected.fuenteSha256 && d.rev4_fuente_sha256 !== expected.fuenteSha256) {
    throw new Error(`PR02_P1_POSTCHECK_REV4_HASH_MISMATCH: esperado ${expected.fuenteSha256}, actual ${d.rev4_fuente_sha256}`)
  }
  if (!d.rev3_exists) throw new Error('PR02_P1_POSTCHECK_REV3_MISSING')
  const expectedRev3Hash = expected.rev3FuenteSha256 || PR02_CATALOG_REV3_HASH
  if (d.rev3_fuente_sha256 !== expectedRev3Hash) {
    throw new Error('PR02_P1_POSTCHECK_REV3_CHANGED')
  }
  if (d.expected_issuer_enabled !== false) throw new Error('PR02_P1_POSTCHECK_ISSUER_ENABLED')

  return Object.freeze({
    status: 'PASS',
    rev4Exists: true,
    rev4Enabled: false,
    rev4HashMatch: true,
    rev3Unchanged: true,
    expectedIssuerEnabled: false,
  })
}

/**
 * Guarda transaccional atómica de P2 evaluada dentro de la misma transacción de actualización.
 */
export const PR02_P2_ATOMIC_GUARD_SQL = `SELECT jsonb_build_object(
  'catalog_total_count', (
    SELECT count(*)::int FROM public.fiscal_parametros_homologacion
  ),
  'rev1_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 1
  ),
  'rev2_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 2
  ),
  'rev3_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 3
  ),
  'rev3_hash_match', COALESCE((
    SELECT fuente_sha256 = $4::text FROM public.fiscal_parametros_homologacion WHERE revision = 3
  ), false),
  'rev3_expired', COALESCE((
    SELECT vence_en < clock_timestamp() FROM public.fiscal_parametros_homologacion WHERE revision = 3
  ), false),
  'rev4_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 4
  ),
  'rev4_enabled', COALESCE((
    SELECT habilitado FROM public.fiscal_parametros_homologacion WHERE revision = 4
  ), false),
  'rev4_hash_match', COALESCE((
    SELECT fuente_sha256 = $1::text FROM public.fiscal_parametros_homologacion WHERE revision = 4
  ), false),
  'rev4_unexpired', COALESCE((
    SELECT vence_en > clock_timestamp() FROM public.fiscal_parametros_homologacion WHERE revision = 4
  ), false),
  'rev4_not_future', COALESCE((
    SELECT consultado_en <= clock_timestamp() FROM public.fiscal_parametros_homologacion WHERE revision = 4
  ), false),
  'expected_issuer_present', EXISTS (
    SELECT 1 FROM public.fiscal_emisores_homologacion WHERE cuit_emisor = $2::text AND punto_venta = $3::int
  ),
  'expected_issuer_enabled', COALESCE((
    SELECT habilitado FROM public.fiscal_emisores_homologacion WHERE cuit_emisor = $2::text AND punto_venta = $3::int
  ), false),
  'unexpected_enabled_issuers', (
    SELECT count(*)::int FROM public.fiscal_emisores_homologacion
    WHERE habilitado = true AND (cuit_emisor <> $2::text OR punto_venta <> $3::int)
  )
) AS p2_in_tx_guard;`

export function verifyPr02P2InTxGuard(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('PR02_P2_ATOMIC_GUARD_INVALID')
  if (raw.catalog_total_count !== undefined && raw.catalog_total_count !== 4) {
    throw new Error(`PR02_P2_BASELINE_COUNT_MISMATCH: Se esperaban 4 revisiones en catálogo, encontradas ${raw.catalog_total_count}`)
  }
  if (raw.rev1_exists !== undefined && !raw.rev1_exists) throw new Error('PR02_P2_BASELINE_REV1_MISSING')
  if (raw.rev2_exists !== undefined && !raw.rev2_exists) throw new Error('PR02_P2_BASELINE_REV2_MISSING')
  if (!raw.rev4_exists) throw new Error('PR02_P2_REVISION_4_MISSING')
  if (raw.rev4_enabled) throw new Error('PR02_P2_REVISION_4_ALREADY_ENABLED')
  if (!raw.rev4_hash_match) throw new Error('PR02_P2_REVISION_4_HASH_MISMATCH')
  if (!raw.rev4_unexpired) throw new Error('PR02_P2_REVISION_4_EXPIRED')
  if (!raw.rev4_not_future) throw new Error('PR02_P2_REVISION_4_FUTURE_CONSULTED')
  if (!raw.rev3_exists) throw new Error('PR02_P2_REVISION_3_MISSING')
  if (!raw.rev3_hash_match) throw new Error('PR02_P2_REV3_BASELINE_MISMATCH')
  if (raw.rev3_expired !== undefined && !raw.rev3_expired) throw new Error('PR02_P2_REV3_NOT_EXPIRED')
  if (!raw.expected_issuer_present) throw new Error('PR02_P2_ISSUER_NOT_FOUND')
  if (raw.expected_issuer_enabled !== false) throw new Error('PR02_P2_ISSUER_PV2_NOT_DISABLED')
  if (raw.unexpected_enabled_issuers !== 0) throw new Error('PR02_P2_UNEXPECTED_ENABLED_ISSUERS')
  return true
}

/**
 * Sentencia de guarda previa y sentencia de activación controlada P2 de revisión 4.
 */
export const PR02_P2_GUARD_SQL = `SELECT CASE
  WHEN NOT EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion
    WHERE revision = 4
  ) THEN 'PR02_P2_REVISION_4_MISSING'
  WHEN EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion
    WHERE revision = 4 AND habilitado = true
  ) THEN 'PR02_P2_REVISION_4_ALREADY_ENABLED'
  WHEN EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion
    WHERE revision = 4 AND fuente_sha256 <> $1
  ) THEN 'PR02_P2_REVISION_4_HASH_MISMATCH'
  WHEN EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion
    WHERE revision = 4 AND vence_en <= clock_timestamp()
  ) THEN 'PR02_P2_REVISION_4_EXPIRED'
  WHEN NOT EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion
    WHERE revision = 3
  ) THEN 'PR02_P2_REVISION_3_MISSING'
  WHEN EXISTS (
    SELECT 1 FROM public.fiscal_emisores_homologacion
    WHERE cuit_emisor = $2 AND punto_venta = $3 AND habilitado = true
  ) THEN 'PR02_P2_ISSUER_PV2_NOT_DISABLED'
  ELSE 'OK'
END AS guard_status;`

export const PR02_P2_ENABLE_SQL = `UPDATE public.fiscal_parametros_homologacion
SET habilitado = true
WHERE revision = 4 AND habilitado = false AND fuente_sha256 = $1 AND vence_en > clock_timestamp();`

/**
 * Consulta de postcheck READ ONLY para P2 (activación del catálogo).
 */
export const PR02_P2_POSTCHECK_SELECT_SQL = `SELECT jsonb_build_object(
  'transaction_read_only', current_setting('transaction_read_only'),
  'observed_at', clock_timestamp(),
  'rev4_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 4
  ),
  'rev4_enabled', COALESCE((
    SELECT habilitado FROM public.fiscal_parametros_homologacion WHERE revision = 4
  ), false),
  'rev4_fuente_sha256', (
    SELECT fuente_sha256 FROM public.fiscal_parametros_homologacion WHERE revision = 4
  ),
  'rev4_valid', (
    SELECT vence_en > clock_timestamp() FROM public.fiscal_parametros_homologacion WHERE revision = 4
  ),
  'rev3_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 3
  ),
  'rev3_fuente_sha256', (
    SELECT fuente_sha256 FROM public.fiscal_parametros_homologacion WHERE revision = 3
  ),
  'expected_issuer_enabled', COALESCE((
    SELECT habilitado FROM public.fiscal_emisores_homologacion WHERE cuit_emisor = $1 AND punto_venta = $2
  ), true)
) AS postcheck_p2;`

/**
 * Validador del resultado de postcheck READ ONLY para P2.
 */
export function verifyPr02P2Postcheck(raw, expected = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('PR02_P2_POSTCHECK_INVALID')
  }
  const d = raw
  if (d.transaction_read_only !== 'on') throw new Error('PR02_P2_POSTCHECK_NOT_READ_ONLY')
  if (!d.rev4_exists) throw new Error('PR02_P2_POSTCHECK_REV4_MISSING')
  if (d.rev4_enabled !== true) throw new Error('PR02_P2_POSTCHECK_REV4_NOT_ENABLED')
  if (!d.rev4_valid) throw new Error('PR02_P2_POSTCHECK_REV4_EXPIRED')
  if (expected.fuenteSha256 && d.rev4_fuente_sha256 !== expected.fuenteSha256) {
    throw new Error(`PR02_P2_POSTCHECK_REV4_HASH_MISMATCH: esperado ${expected.fuenteSha256}, actual ${d.rev4_fuente_sha256}`)
  }
  if (!d.rev3_exists) throw new Error('PR02_P2_POSTCHECK_REV3_MISSING')
  const expectedRev3Hash = expected.rev3FuenteSha256 || PR02_CATALOG_REV3_HASH
  if (d.rev3_fuente_sha256 && d.rev3_fuente_sha256 !== expectedRev3Hash) {
    throw new Error(`PR02_P2_REV3_BASELINE_MISMATCH: Hash histórico de R3 difiere (esperado ${expectedRev3Hash}, actual ${d.rev3_fuente_sha256})`)
  }
  if (d.expected_issuer_enabled !== false) throw new Error('PR02_P2_POSTCHECK_ISSUER_ENABLED')

  return Object.freeze({
    status: 'PASS',
    rev4Exists: true,
    rev4Enabled: true,
    rev4Valid: true,
    rev4HashMatch: true,
    rev3Unchanged: true,
    expectedIssuerEnabled: false,
  })
}
