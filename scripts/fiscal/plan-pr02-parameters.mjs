// PR02: Contrato y Planificación para la Obtención y Provisión de Parámetros Fiscales (Revisión 4).
// Guarantees:
// 1. Exact allowlist de llamadas externas: LoginCms (máx 1), FEParamGetTiposIva (máx 1), FEParamGetCondicionIvaReceptor (máx 1) (TOTAL MÁXIMO 3, o 2 si TA es reutilizable).
// 2. Prohibición estricta de emisión: FECAESolicitar, FECompConsultar, FECompUltimoAutorizado, FEParamGetPtosVenta.
// 3. Emisor fiscal permanece INACTIVO (habilitado = false) durante PR02-P1 y PR02-P2.
// 4. Catálogo revisión 3 histórico conservado inmutable; revisión 4 insert-only en P1, activación atómica en P2.
// 5. Cero retry automático ante fallo de red o SOAP Fault (Fail-Closed).
// 6. Cero credenciales ni tokens expuestos en logs o paquetes.
// 7. Toda llamada remota futura exige GO específico de un solo uso.

import { execSync } from 'node:child_process'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { planFiscalParameters } from '../plan-fiscal-parameters.mjs'

export const PR02_P0_AUTHORITY_ENV = 'PR02_P0_AUTHORITY_SECRET'
export const PR02_P0_COMPROMISED_SECRETS = Object.freeze([
  'kioskopos-pr02-p0-official-custody-secret-2026',
])

/**
 * Detecta si una clave es un marcador o clave de prueba no confiable.
 */
export function isTestAuthorityKey(secret) {
  if (!secret || typeof secret !== 'string') return false
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

/**
 * Validador estricto de la clave de autoridad de atestación oficial P0.
 * Exige alta entropía (>= 32 caracteres), custodia externa, y rechaza claves comprometidas o de prueba.
 */
export function validateP0AuthoritySecret(secret) {
  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
    throw new Error('P0_ATTESTATION_KEY_MISSING: Se requiere una clave de atestación oficial custodiada fuera del repositorio')
  }
  const trimmed = secret.trim()
  for (const compromised of PR02_P0_COMPROMISED_SECRETS) {
    if (trimmed === compromised || trimmed.toLowerCase() === compromised.toLowerCase()) {
      throw new Error('P0_ATTESTATION_KEY_COMPROMISED: La clave provista fue declarada permanentemente no confiable por exposición previa')
    }
  }
  if (trimmed.length < 32) {
    throw new Error('P0_ATTESTATION_KEY_INSUFFICIENT_ENTROPY: La clave de atestación oficial debe tener al menos 32 caracteres de alta entropía')
  }
  if (isTestAuthorityKey(trimmed)) {
    throw new Error('P0_ATTESTATION_TEST_KEY_PROHIBITED: No se permite utilizar una clave de prueba o simulación para atestación oficial')
  }
  return trimmed
}

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

  const isAvailable = rec.estado === 'DISPONIBLE' || rec.valido === true
  if (!isAvailable || !rec.vence_en) {
    return Object.freeze({
      reusable: false,
      loginCmsRequired: true,
      expiration: rec.vence_en ? String(rec.vence_en) : null,
      reason: 'TA_NOT_AVAILABLE',
    })
  }

  // 2. Verificación de servicio y contexto fiscal si están presentes
  if (rec.servicio && typeof rec.servicio === 'string') {
    const srv = rec.servicio.toLowerCase().trim()
    if (srv !== 'wsfe') {
      return Object.freeze({
        reusable: false,
        loginCmsRequired: true,
        expiration: rec.vence_en ? String(rec.vence_en) : null,
        reason: 'TA_SERVICE_MISMATCH',
      })
    }
  }

  if (rec.cuit && String(rec.cuit).trim() !== PR02_PARAMETERS_EXPECTED_ISSUER_CUIT) {
    return Object.freeze({
      reusable: false,
      loginCmsRequired: true,
      expiration: rec.vence_en ? String(rec.vence_en) : null,
      reason: 'TA_CUIT_MISMATCH',
    })
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
export function createP0Attestation(params = {}) {
  if (!params || typeof params !== 'object') {
    throw new Error('P0_ATTESTATION_PARAMS_REQUIRED: Se requieren parámetros para atestación P0')
  }

  const {
    manifest,
    commitSha,
    transportType = 'SIMULATED',
    authoritySecret,
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

  // Si el transporte es simulado o mock, no se emite atestación oficial acreditada
  if (!isOfficialTransport) {
    return Object.freeze({
      version: '1.0',
      processId: manifest.identificador_proceso || 'SIMULATED',
      executionId: manifest.ejecucion_autorizada_id || 'SIMULATED',
      executionScope: manifest.ejecucion_autorizada_scope || PR02_P0_SCOPE,
      commitSha: commitSha ? String(commitSha).toLowerCase() : '0'.repeat(40),
      consultadoEn: manifest.consultado_en || issuedAt,
      entorno: manifest.entorno || 'HOMOLOGACION',
      transportType: 'SIMULATED',
      executorIdentity: executorIdentity || manifest.colector_identidad || PR02_P0_COLECTOR_IDENTIDAD,
      operacionesWsfe: operacionesWsfe || Object.freeze(['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor']),
      ivaRawSha: manifest.iva_respuesta_original_sha256 || '0'.repeat(64),
      ivaNormSha: manifest.iva_archivo_normalizado_sha256 || '0'.repeat(64),
      condRawSha: manifest.condition_respuesta_original_sha256 || '0'.repeat(64),
      condNormSha: manifest.condition_archivo_normalizado_sha256 || '0'.repeat(64),
      goAuthorization: null,
      issuedAt,
      signature: null,
      accredited: false,
      provenance: 'UNVERIFIED',
    })
  }

  // En transporte oficial se valida obligatoriamente commitSha
  if (!commitSha || !/^[0-9a-fA-F]{40}$/.test(commitSha)) {
    throw new Error('P0_ATTESTATION_COMMIT_SHA_REQUIRED: Se requiere commitSha hexadecimal de 40 caracteres para atestación oficial')
  }

  // Validación de GO externo autorizado
  if (!goAuthorization || typeof goAuthorization !== 'string' || goAuthorization.trim().length === 0) {
    throw new Error('P0_ATTESTATION_GO_REQUIRED: Se requiere evidencia de GO externo autorizado para emitir atestación oficial')
  }

  // Validación de identidad del ejecutor confiable
  const execId = executorIdentity || manifest.colector_identidad
  if (execId !== PR02_P0_COLECTOR_IDENTIDAD) {
    throw new Error(`P0_ATTESTATION_EXECUTOR_MISMATCH: Identidad de ejecutor '${execId}' no coincide con el colector confiable '${PR02_P0_COLECTOR_IDENTIDAD}'`)
  }

  // Validación estricta de clave de autoridad custodiada (sin fallbacks hardcodeados)
  const rawSecret = authoritySecret || process.env[PR02_P0_AUTHORITY_ENV]
  const validSecret = validateP0AuthoritySecret(rawSecret)

  const payload = {
    version: '1.0',
    processId: manifest.identificador_proceso,
    executionId: manifest.ejecucion_autorizada_id,
    executionScope: manifest.ejecucion_autorizada_scope,
    commitSha: String(commitSha).toLowerCase(),
    consultadoEn: manifest.consultado_en,
    entorno: manifest.entorno || 'HOMOLOGACION',
    transportType: 'OFFICIAL',
    executorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
    operacionesWsfe: operacionesWsfe || Object.freeze(['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor']),
    ivaRawSha: manifest.iva_respuesta_original_sha256,
    ivaNormSha: manifest.iva_archivo_normalizado_sha256,
    condRawSha: manifest.condition_respuesta_original_sha256,
    condNormSha: manifest.condition_archivo_normalizado_sha256,
    goAuthorization: goAuthorization.trim(),
    issuedAt,
  }

  const canonicalPayload = JSON.stringify(payload)
  const signature = createHmac('sha256', validSecret).update(canonicalPayload).digest('hex')

  return Object.freeze({
    ...payload,
    signature,
    accredited: true,
    provenance: 'VERIFIED',
  })
}

/**
 * Validador estricto de la atestación de adquisición oficial P0.
 * Comprueba que el transporte haya sido oficial, la firma HMAC coincida con la autoridad custodiada,
 * y los hashes y metadatos se correspondan unívocamente con el manifiesto y el commit.
 */
export function verifyP0Attestation(attestation, options = {}) {
  if (!attestation || typeof attestation !== 'object') {
    return Object.freeze({ valid: false, reason: 'ATTESTATION_MISSING' })
  }
  if (attestation.accredited !== true) {
    return Object.freeze({ valid: false, reason: 'ATTESTATION_NOT_ACCREDITED' })
  }
  if (attestation.transportType !== 'OFFICIAL') {
    return Object.freeze({ valid: false, reason: 'ATTESTATION_SIMULATED_TRANSPORT' })
  }
  if (!attestation.signature || typeof attestation.signature !== 'string' || !/^[0-9a-f]{64}$/.test(attestation.signature)) {
    return Object.freeze({ valid: false, reason: 'ATTESTATION_SIGNATURE_INVALID' })
  }
  if (attestation.executorIdentity !== PR02_P0_COLECTOR_IDENTIDAD) {
    return Object.freeze({ valid: false, reason: 'ATTESTATION_EXECUTOR_MISMATCH' })
  }
  if (!attestation.goAuthorization || typeof attestation.goAuthorization !== 'string' || attestation.goAuthorization.trim().length === 0) {
    return Object.freeze({ valid: false, reason: 'ATTESTATION_GO_MISSING' })
  }

  const { manifest, commitSha, authoritySecret } = options

  if (manifest) {
    if (
      attestation.ivaRawSha !== manifest.iva_respuesta_original_sha256 ||
      attestation.ivaNormSha !== manifest.iva_archivo_normalizado_sha256 ||
      attestation.condRawSha !== manifest.condition_respuesta_original_sha256 ||
      attestation.condNormSha !== manifest.condition_archivo_normalizado_sha256 ||
      attestation.executionScope !== manifest.ejecucion_autorizada_scope ||
      attestation.processId !== manifest.identificador_proceso ||
      (manifest.entorno && attestation.entorno !== manifest.entorno)
    ) {
      return Object.freeze({ valid: false, reason: 'ATTESTATION_MANIFEST_MISMATCH' })
    }
  }

  if (commitSha) {
    if (attestation.commitSha.toLowerCase() !== String(commitSha).toLowerCase()) {
      return Object.freeze({ valid: false, reason: 'ATTESTATION_COMMIT_MISMATCH' })
    }
  }

  const rawSecret = authoritySecret || process.env[PR02_P0_AUTHORITY_ENV]
  let validSecret
  try {
    validSecret = validateP0AuthoritySecret(rawSecret)
  } catch (err) {
    if (err.message.includes('P0_ATTESTATION_KEY_MISSING')) {
      return Object.freeze({ valid: false, reason: 'ATTESTATION_KEY_MISSING' })
    }
    if (err.message.includes('P0_ATTESTATION_KEY_COMPROMISED')) {
      return Object.freeze({ valid: false, reason: 'ATTESTATION_KEY_COMPROMISED' })
    }
    if (err.message.includes('P0_ATTESTATION_KEY_INSUFFICIENT_ENTROPY')) {
      return Object.freeze({ valid: false, reason: 'ATTESTATION_KEY_INSUFFICIENT_ENTROPY' })
    }
    if (err.message.includes('P0_ATTESTATION_TEST_KEY_PROHIBITED')) {
      return Object.freeze({ valid: false, reason: 'ATTESTATION_TEST_KEY_PROHIBITED' })
    }
    return Object.freeze({ valid: false, reason: 'ATTESTATION_KEY_INVALID' })
  }

  const { signature, accredited, provenance, ...payload } = attestation
  const canonicalPayload = JSON.stringify(payload)
  const expectedSig = createHmac('sha256', validSecret).update(canonicalPayload).digest('hex')

  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expectedSig, 'hex')

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return Object.freeze({ valid: false, reason: 'ATTESTATION_SIGNATURE_VERIFICATION_FAILED' })
  }

  return Object.freeze({ valid: true, reason: 'VERIFIED' })
}

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
  const str = JSON.stringify(params).toLowerCase()
  for (const forbidden of ['"token":', '"sign":', 'loginticket', 'privatekey', 'private key', '-----begin', 'password']) {
    if (str.includes(forbidden)) {
      throw new Error(`P0_MANIFEST_SECRETS_PROHIBITED: Manifiesto contiene referencias a credenciales o tokens ('${forbidden}')`)
    }
  }

  const isSimulated = params.transport_type === 'SIMULATED' || params.isSimulated === true
  let attestation = params.attestation || null

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
      goAuthorization: params.goAuthorization,
      executorIdentity: colectorIdentidad,
      now: params.now,
    })
  }

  // Comprobar si está acreditada: requiere transporte oficial y verificación válida de atestación
  let isAccredited = false
  if (attestation && attestation.transportType === 'OFFICIAL' && !isSimulated) {
    const verified = verifyP0Attestation(attestation, {
      manifest: {
        identificador_proceso: pid,
        ejecucion_autorizada_scope: ejecucionAutorizadaScope,
        iva_respuesta_original_sha256: params.iva_respuesta_original_sha256,
        iva_archivo_normalizado_sha256: params.iva_archivo_normalizado_sha256,
        condition_respuesta_original_sha256: params.condition_respuesta_original_sha256,
        condition_archivo_normalizado_sha256: params.condition_archivo_normalizado_sha256,
        entorno,
      },
      authoritySecret: params.authoritySecret,
      commitSha: params.commit_sha,
    })
    isAccredited = verified.valid === true
  }

  // No permitir que el caller declare accredited: true para evidencia simulada o no acreditada
  if ((isSimulated || !isAccredited) && params.accredited === true) {
    throw new Error('P0_SIMULATED_EVIDENCE_CANNOT_BE_ACCREDITED: No se puede declarar acreditada una evidencia simulada o no oficial')
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
    attestation,
  }

  const manifestSha256 = sha256(JSON.stringify(manifestBody))

  return Object.freeze({
    ...manifestBody,
    manifest_sha256: manifestSha256,
  })
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
 */
export function validatePr02P1ImportEvidence(options = {}) {
  if (!options || typeof options !== 'object') {
    throw new Error('P1_IMPORT_OPTIONS_REQUIRED')
  }

  const { manifest, ivaText, conditionText, rawIvaSoapText, rawConditionSoapText, now, expectedHashes } = options

  if (!manifest) {
    throw new Error('P1_IMPORT_MANIFEST_REQUIRED: Se requiere manifiesto oficial P0 para importar evidencia en P1')
  }

  try {
    validatePr02P0Manifest(manifest)
  } catch (err) {
    if (
      err.message.includes('P0_MANIFEST_NOT_ACCREDITED') ||
      err.message.includes('P0_MANIFEST_TRANSPORT_NOT_OFFICIAL') ||
      err.message.includes('P0_MANIFEST_ATTESTATION_MISSING')
    ) {
      throw new Error(`P1_IMPORT_FORBIDDEN: ${err.message}`)
    }
    throw err
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

  if (rawIvaSoapText) {
    const rawIvaSha = sha256(rawIvaSoapText)
    if (rawIvaSha !== manifest.iva_respuesta_original_sha256) {
      throw new Error('P1_IMPORT_RAW_IVA_SOAP_HASH_MISMATCH: Respuesta SOAP de tipos de IVA no coincide con el manifiesto P0')
    }
  }
  if (rawConditionSoapText) {
    const rawCondSha = sha256(rawConditionSoapText)
    if (rawCondSha !== manifest.condition_respuesta_original_sha256) {
      throw new Error('P1_IMPORT_RAW_CONDITION_SOAP_HASH_MISMATCH: Respuesta SOAP de condición IVA no coincide con el manifiesto P0')
    }
  }

  if (expectedHashes) {
    if (expectedHashes.iva && ivaSha !== expectedHashes.iva) {
      throw new Error('P1_IMPORT_EXPECTED_IVA_HASH_MISMATCH')
    }
    if (expectedHashes.condition && conditionSha !== expectedHashes.condition) {
      throw new Error('P1_IMPORT_EXPECTED_CONDITION_HASH_MISMATCH')
    }
  }

  // Verificación estricta de la atestación de procedencia oficial
  const attestationCheck = verifyP0Attestation(manifest.attestation, {
    manifest,
    commitSha: options.expectedHead || options.head,
    authoritySecret: options.authoritySecret,
  })
  if (!attestationCheck.valid) {
    throw new Error(`P1_IMPORT_FORBIDDEN: Procedencia oficial no verificada (${attestationCheck.reason}). Importación denegada.`)
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
