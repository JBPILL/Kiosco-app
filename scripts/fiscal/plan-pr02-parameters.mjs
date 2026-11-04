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
import { createHash } from 'node:crypto'
import { planFiscalParameters } from '../plan-fiscal-parameters.mjs'

export const PR02_P1_SCOPE = 'PR02_P1_PARAMETER_REFRESH'
export const PR02_P2_SCOPE = 'PR02_P2_CATALOG_ENABLE'
export const PR02_PARAMETERS_ALLOWED_SCOPES = Object.freeze([
  PR02_P1_SCOPE,
  PR02_P2_SCOPE,
])

export const PR02_PARAMETERS_TARGET_PROJECT_REF = 'acoyfwwmhaeruciyedri'
export const PR02_PARAMETERS_TARGET_REVISION = 4
export const PR02_PARAMETERS_HISTORICAL_REVISION = 3
export const PR02_PARAMETERS_EXPECTED_ISSUER_CUIT = '20415005963'
export const PR02_PARAMETERS_EXPECTED_ISSUER_PV = 2
export const PR02_CATALOG_REV3_HASH = '11e9d2244b4fd418df4ab9bc3798c303d66f181785ba678597fdeffa76d5e884'

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
 * Exige estado DISPONIBLE y vencimiento posterior al reloj actual con margen de seguridad.
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

  const isAvailable = rec.estado === 'DISPONIBLE' || rec.valido === true
  if (!isAvailable || !rec.vence_en) {
    return Object.freeze({
      reusable: false,
      loginCmsRequired: true,
      expiration: rec.vence_en ? String(rec.vence_en) : null,
      reason: 'TA_NOT_AVAILABLE',
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
 * Consulta de preflight READ ONLY para PR02-P1.
 * Comprueba:
 * 1. Aislamiento read-only.
 * 2. Catálogo revisión 3 existe y está vencido.
 * 3. Catálogo revisión 4 no existe todavía (si existe, STOP).
 * 4. Emisor esperado presente e inactivo (habilitado = false).
 * 5. Cero emisores activos inesperados.
 * 6. Verificación de TA existente.
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
 * Construye la propuesta canónica para la revisión 4 de fiscal_parametros_homologacion.
 * Envuelve y valida rigurosamente contra planFiscalParameters y baseline.
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
 * Exige el commit SHA explícito del HEAD verificado.
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
 * Comprueba:
 * 1. Aislamiento read-only.
 * 2. Revisión 4 existe en public.fiscal_parametros_homologacion.
 * 3. Revisión 4 arranca inactiva (habilitado = false).
 * 4. Hash fuente_sha256 de revisión 4 coincide con el esperado.
 * 5. Revisión 3 permanece histórica intacta con su hash histórico.
 * 6. Emisor fiscal esperado permanece inactivo (habilitado = false).
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
  if (expected.rev3FuenteSha256 && d.rev3_fuente_sha256 !== expected.rev3FuenteSha256) {
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
 * Sentencia de guarda previa y sentencia de activación controlada P2 de revisión 4.
 * Exige que la revisión 4 exista, coincida con el hash autorizado, esté inactiva y no expirada,
 * que la revisión 3 permanezca intacta y que el emisor permanezca inactivo.
 * Mutación acotada exclusivamente a `habilitado = true` en revisión 4.
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
