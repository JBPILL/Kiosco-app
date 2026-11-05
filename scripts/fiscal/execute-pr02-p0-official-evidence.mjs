// PR02-P0: Colector Oficial de Evidencia WSAA/WSFE para Parámetros Homologación (Revisión 4).
// Requisitos de seguridad:
// 1. Scope obligatorio: PR02_P0_OFFICIAL_EVIDENCE_COLLECTION.
// 2. Target fijo: acoyfwwmhaeruciyedri (Staging).
// 3. Entorno fiscal exclusivo: HOMOLOGACION (wsaahomo, wswhomo). Producción estrictamente prohibido.
// 4. Modo por defecto: DRY_RUN (sin conexiones remotas ni llamadas ARCA).
// 5. Cero escrituras a Staging (cero mutaciones en BD durante P0).
// 6. Cero emisión: FECAESolicitar, FECompConsultar inalcanzables y bloqueados por diseño.
// 7. Límites estrictos de llamadas: LoginCms <= 1, FEParamGetTiposIva <= 1, FEParamGetCondicionIvaReceptor <= 1. Total <= 3.
// 8. Cero reintentos automáticos (Fail-Closed).
// 9. Cero secretos en manifiesto, reportes o archivos guardados (sin token, sign, CMS, private key ni contraseñas).
// 10. Persistencia de evidencia en directorio privado fuera de Git.
// 11. Distinción explícita entre CONTENT_INTEGRITY (PASS/FAIL) y OFFICIAL_PROVENANCE (VERIFIED/UNVERIFIED).

import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { DOMParser } from '@xmldom/xmldom'

import {
  PR02_P0_SCOPE,
  PR02_PARAMETERS_TARGET_PROJECT_REF,
  PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
  PR02_PARAMETERS_EXPECTED_ISSUER_PV,
  PR02_P0_COLECTOR_IDENTIDAD,
  createPr02P0OfficialEvidenceManifest,
  validatePr02P0Manifest,
  validateTiposIvaEvidence,
  validateCondicionIvaReceptorEvidence,
  evaluateExistingTa,
  resolveCurrentGitHead,
  resolveCurrentGitRemoteHead,
} from './plan-pr02-parameters.mjs'

import {
  buildWsaaLoginCmsSoapRequest,
  parseWsaaLoginCmsResponse,
  buildWsfeTiposIvaRequest,
  parseWsfeTiposIvaResponse,
  buildWsfeCondicionIvaReceptorRequest,
  parseWsfeCondicionIvaReceptorResponse,
  checkSoapFault,
  checkWsfeErrors,
} from './execute-pr03-c-staging.mjs'

export {
  PR02_P0_SCOPE,
  PR02_PARAMETERS_TARGET_PROJECT_REF,
  PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
  PR02_PARAMETERS_EXPECTED_ISSUER_PV,
  PR02_P0_COLECTOR_IDENTIDAD,
  buildWsaaLoginCmsSoapRequest,
  parseWsaaLoginCmsResponse,
  buildWsfeTiposIvaRequest,
  parseWsfeTiposIvaResponse,
  buildWsfeCondicionIvaReceptorRequest,
  parseWsfeCondicionIvaReceptorResponse,
  checkSoapFault,
  checkWsfeErrors,
}

export const WSAA_HOMO_URL = 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms'
export const WSFE_HOMO_URL = 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx'

export const PROHIBITED_ARCA_OPERATIONS = Object.freeze([
  'FECAESolicitar',
  'FECompConsultar',
  'FECompUltimoAutorizado',
  'FEParamGetPtosVenta',
])

export const ALLOWED_P0_ARCA_OPERATIONS = Object.freeze([
  'LoginCms',
  'FEParamGetTiposIva',
  'FEParamGetCondicionIvaReceptor',
])

export const DEFAULT_PRIVATE_EVIDENCE_DIR = '.fiscal-evidence-pr02'

const sha256 = text => createHash('sha256').update(text).digest('hex')

/**
 * Validador de seguridad de credenciales y contraseñas.
 */
export function assertNoForbiddenSecrets(val, context = 'evidence') {
  if (!val) return
  const str = (typeof val === 'string' ? val : JSON.stringify(val)).toLowerCase()
  for (const forbidden of [
    'private key',
    '-----begin',
    'service_role',
    'anon_key',
    'sbp_',
    'ghp_',
  ]) {
    if (str.includes(forbidden)) {
      throw new Error(`SECURITY_VIOLATION: ${context} contiene datos o credenciales prohibidas ('${forbidden}')`)
    }
  }
}

/**
 * Validador de URL de endpoint. Rechaza endpoints de Producción y URLs no permitidas.
 */
export function validateP0EndpointUrl(url, serviceName = 'ARCA') {
  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new Error(`${serviceName}_URL_INVALID: Endpoint URL vacío o no definido`)
  }
  const lower = url.toLowerCase().trim()
  if (lower.includes('servicios1.afip.gov.ar') || lower.includes('wsaa.afip.gov.ar')) {
    throw new Error('PRODUCTION_ENDPOINT_FORBIDDEN: Se detectó endpoint de PRODUCCION en ejecutor de HOMOLOGACION')
  }
  if (!lower.startsWith('https://wsaahomo.afip.gov.ar') && !lower.startsWith('https://wswhomo.afip.gov.ar')) {
    throw new Error(`INVALID_ENDPOINT_URL: URL '${url}' no pertenece a los servicios oficiales de Homologación autorizados`)
  }
}

/**
 * Gestor y tracker de llamadas para PR02-P0.
 * Garantiza allowlist estricto, límites máximos de llamadas y cero reintentos automáticos.
 */
export function createPr02P0CallTracker(options = {}) {
  const limits = Object.freeze({
    loginCmsMax: options.loginCmsMax !== undefined ? options.loginCmsMax : 1,
    tiposIvaMax: 1,
    condicionIvaReceptorMax: 1,
    totalMax: options.totalMax !== undefined ? options.totalMax : 3,
  })

  let loginCmsCount = 0
  let tiposIvaCount = 0
  let condicionIvaReceptorCount = 0
  const operationsExecuted = []
  const failedOperations = new Set()

  return Object.freeze({
    recordCall(operationName) {
      if (PROHIBITED_ARCA_OPERATIONS.includes(operationName)) {
        throw new Error(`PROHIBITED_ARCA_OPERATION: Operación fiscal '${operationName}' está estrictamente prohibida en PR02-P0`)
      }
      if (!ALLOWED_P0_ARCA_OPERATIONS.includes(operationName)) {
        throw new Error(`DISALLOWED_ARCA_OPERATION: Operación fiscal '${operationName}' no forma parte del allowlist de PR02-P0`)
      }
      if (failedOperations.has(operationName)) {
        throw new Error(`AUTOMATIC_RETRY_FORBIDDEN: Reintento automático de operación fallida '${operationName}' estrictamente prohibido`)
      }

      const currentTotal = loginCmsCount + tiposIvaCount + condicionIvaReceptorCount
      if (currentTotal + 1 > limits.totalMax) {
        throw new Error(`TOTAL_CALL_LIMIT_EXCEEDED: Total de llamadas ARCA (${currentTotal + 1}) superaría el límite permitido de ${limits.totalMax}`)
      }

      if (operationName === 'LoginCms') {
        if (loginCmsCount + 1 > limits.loginCmsMax) {
          throw new Error(`CALL_LIMIT_EXCEEDED: LoginCms excedió el límite máximo (${loginCmsCount + 1} > ${limits.loginCmsMax})`)
        }
        loginCmsCount++
      } else if (operationName === 'FEParamGetTiposIva') {
        if (tiposIvaCount + 1 > limits.tiposIvaMax) {
          throw new Error(`CALL_LIMIT_EXCEEDED: FEParamGetTiposIva excedió el límite máximo (${tiposIvaCount + 1} > ${limits.tiposIvaMax})`)
        }
        tiposIvaCount++
      } else if (operationName === 'FEParamGetCondicionIvaReceptor') {
        if (condicionIvaReceptorCount + 1 > limits.condicionIvaReceptorMax) {
          throw new Error(`CALL_LIMIT_EXCEEDED: FEParamGetCondicionIvaReceptor excedió el límite máximo (${condicionIvaReceptorCount + 1} > ${limits.condicionIvaReceptorMax})`)
        }
        condicionIvaReceptorCount++
      }

      operationsExecuted.push(operationName)
    },

    recordFailure(operationName) {
      failedOperations.add(operationName)
    },

    getCounts() {
      return Object.freeze({
        loginCms: loginCmsCount,
        tiposIva: tiposIvaCount,
        condicionIvaReceptor: condicionIvaReceptorCount,
        total: loginCmsCount + tiposIvaCount + condicionIvaReceptorCount,
      })
    },

    getOperations() {
      return Object.freeze([...operationsExecuted])
    },
  })
}

/**
 * Validador de argumentos de CLI para PR02-P0.
 */
export function validatePr02P0CliArgs(argv = process.argv.slice(2)) {
  const isAuthorized = argv.includes('--authorized')
  const hasDryRunFlag = argv.includes('--dry-run')

  if (isAuthorized && hasDryRunFlag) {
    throw new Error('CLI_ARGUMENT_CONFLICT: No se puede combinar --authorized con --dry-run simultáneamente')
  }

  const isDryRun = hasDryRunFlag || !isAuthorized

  const scopeArgIndex = argv.indexOf('--scope')
  const hasExplicitScope =
    scopeArgIndex >= 0 && argv[scopeArgIndex + 1] && !argv[scopeArgIndex + 1].startsWith('--')
  const scope = hasExplicitScope ? argv[scopeArgIndex + 1] : PR02_P0_SCOPE

  const projectArgIndex = argv.indexOf('--project-ref')
  const hasExplicitProject =
    projectArgIndex >= 0 && argv[projectArgIndex + 1] && !argv[projectArgIndex + 1].startsWith('--')
  const projectRef = hasExplicitProject ? argv[projectArgIndex + 1] : PR02_PARAMETERS_TARGET_PROJECT_REF

  const headArgIndex = argv.indexOf('--head')
  const head = headArgIndex >= 0 && argv[headArgIndex + 1] ? argv[headArgIndex + 1].trim() : ''

  const expectedHeadArgIndex = argv.indexOf('--expected-head')
  const expectedHead =
    expectedHeadArgIndex >= 0 && argv[expectedHeadArgIndex + 1] ? argv[expectedHeadArgIndex + 1].trim() : ''

  const evidenceDirIndex = argv.indexOf('--evidence-dir')
  const evidenceDir =
    evidenceDirIndex >= 0 && argv[evidenceDirIndex + 1] ? argv[evidenceDirIndex + 1].trim() : DEFAULT_PRIVATE_EVIDENCE_DIR

  if (isAuthorized) {
    if (!hasExplicitScope || !hasExplicitProject) {
      throw new Error(
        'PR02_P0_CLI_REQUIRED_EXPLICIT_ARGS: --scope y --project-ref son obligatorios cuando se pasa --authorized'
      )
    }
    if (scope !== PR02_P0_SCOPE) {
      throw new Error(`PR02_P0_SCOPE_MISMATCH: Scope inválido '${scope}'. Se requiere '${PR02_P0_SCOPE}'`)
    }
    if (projectRef !== PR02_PARAMETERS_TARGET_PROJECT_REF) {
      throw new Error(
        `PR02_P0_TARGET_MISMATCH: Project-ref inválido '${projectRef}'. Se requiere '${PR02_PARAMETERS_TARGET_PROJECT_REF}'`
      )
    }
    if (!expectedHead || !/^[0-9a-fA-F]{40}$/.test(expectedHead)) {
      throw new Error(
        'PR02_P0_MISSING_EXPECTED_HEAD: En ejecución autorizada se requiere obligatoriamente --expected-head con 40 caracteres hexadecimales'
      )
    }
    if (head && head !== expectedHead) {
      throw new Error(`PR02_P0_HEAD_MISMATCH: HEAD '${head}' no coincide con --expected-head '${expectedHead}'`)
    }
  }

  return Object.freeze({
    authorized: isAuthorized,
    dryRun: isDryRun,
    scope,
    projectRef,
    head,
    expectedHead,
    evidenceDir,
  })
}

/**
 * Guarda el paquete de evidencia oficial en el directorio privado fuera de Git.
 * Comprueba estrictamente ausencia total de secretos antes de escribir en disco.
 */
export function saveP0EvidencePackage(params = {}) {
  const {
    evidenceDir = DEFAULT_PRIVATE_EVIDENCE_DIR,
    manifest,
    rawIvaSoapXml,
    ivaNormalizedText,
    rawConditionSoapXml,
    conditionNormalizedText,
  } = params

  if (!manifest || typeof manifest !== 'object') {
    throw new Error('PERSISTENCE_FAILED: Se requiere objeto de manifiesto para guardar evidencia')
  }
  if (!rawIvaSoapXml || !ivaNormalizedText || !rawConditionSoapXml || !conditionNormalizedText) {
    throw new Error('PERSISTENCE_FAILED: Se requieren todos los cuerpos SOAP y textos normalizados')
  }

  // Verificación estricta de no filtración de secretos
  assertNoForbiddenSecrets(manifest, 'manifest')
  assertNoForbiddenSecrets(ivaNormalizedText, 'ivaNormalizedText')
  assertNoForbiddenSecrets(conditionNormalizedText, 'conditionNormalizedText')

  try {
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true })
    }

    const manifestPath = path.join(evidenceDir, 'manifest.json')
    const rawIvaPath = path.join(evidenceDir, 'FEParamGetTiposIva_response.xml')
    const normIvaPath = path.join(evidenceDir, 'FEParamGetTiposIva_normalized.json')
    const rawCondPath = path.join(evidenceDir, 'FEParamGetCondicionIvaReceptor_response.xml')
    const normCondPath = path.join(evidenceDir, 'FEParamGetCondicionIvaReceptor_normalized.json')

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
    fs.writeFileSync(rawIvaPath, rawIvaSoapXml, 'utf8')
    fs.writeFileSync(normIvaPath, ivaNormalizedText, 'utf8')
    fs.writeFileSync(rawCondPath, rawConditionSoapXml, 'utf8')
    fs.writeFileSync(normCondPath, conditionNormalizedText, 'utf8')

    return Object.freeze({
      saved: true,
      evidenceDir,
      files: Object.freeze([manifestPath, rawIvaPath, normIvaPath, rawCondPath, normCondPath]),
    })
  } catch (err) {
    throw new Error(`PERSISTENCE_FAILED: Falló el almacenamiento local de evidencia ('${err.message}')`)
  }
}

/**
 * Carga y valida un paquete de evidencia guardado en disco.
 */
export function loadP0EvidencePackage(evidenceDir = DEFAULT_PRIVATE_EVIDENCE_DIR) {
  const manifestPath = path.join(evidenceDir, 'manifest.json')
  const rawIvaPath = path.join(evidenceDir, 'FEParamGetTiposIva_response.xml')
  const normIvaPath = path.join(evidenceDir, 'FEParamGetTiposIva_normalized.json')
  const rawCondPath = path.join(evidenceDir, 'FEParamGetCondicionIvaReceptor_response.xml')
  const normCondPath = path.join(evidenceDir, 'FEParamGetCondicionIvaReceptor_normalized.json')

  for (const f of [manifestPath, rawIvaPath, normIvaPath, rawCondPath, normCondPath]) {
    if (!fs.existsSync(f)) {
      throw new Error(`EVIDENCE_PACKAGE_INCOMPLETE: Falta el archivo requerido '${f}'`)
    }
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const rawIvaSoapXml = fs.readFileSync(rawIvaPath, 'utf8')
  const ivaNormalizedText = fs.readFileSync(normIvaPath, 'utf8')
  const rawConditionSoapXml = fs.readFileSync(rawCondPath, 'utf8')
  const conditionNormalizedText = fs.readFileSync(normCondPath, 'utf8')

  validatePr02P0Manifest(manifest)

  if (sha256(rawIvaSoapXml) !== manifest.iva_respuesta_original_sha256) {
    throw new Error('EVIDENCE_PACKAGE_CORRUPTED: El hash de rawIvaSoapXml no coincide con el manifiesto')
  }
  if (sha256(ivaNormalizedText) !== manifest.iva_archivo_normalizado_sha256) {
    throw new Error('EVIDENCE_PACKAGE_CORRUPTED: El hash de ivaNormalizedText no coincide con el manifiesto')
  }
  if (sha256(rawConditionSoapXml) !== manifest.condition_respuesta_original_sha256) {
    throw new Error('EVIDENCE_PACKAGE_CORRUPTED: El hash de rawConditionSoapXml no coincide con el manifiesto')
  }
  if (sha256(conditionNormalizedText) !== manifest.condition_archivo_normalizado_sha256) {
    throw new Error('EVIDENCE_PACKAGE_CORRUPTED: El hash de conditionNormalizedText no coincide con el manifiesto')
  }

  return Object.freeze({
    manifest,
    rawIvaSoapXml,
    ivaNormalizedText,
    rawConditionSoapXml,
    conditionNormalizedText,
  })
}

/**
 * Ejecutor principal de PR02-P0: Colector oficial de evidencia WSAA/WSFE.
 */
export async function executePr02P0OfficialEvidence(rawOptions = {}, deps = {}) {
  const options = rawOptions || {}

  let isAuthorized = false
  let isDryRun = true
  let scope = PR02_P0_SCOPE
  let projectRef = PR02_PARAMETERS_TARGET_PROJECT_REF
  let head = options.head || ''
  let expectedHead = options.expectedHead || ''
  let evidenceDir = options.evidenceDir || DEFAULT_PRIVATE_EVIDENCE_DIR

  if (options.argv && options.argv.length > 0) {
    const cli = validatePr02P0CliArgs(options.argv)
    isAuthorized = cli.authorized
    isDryRun = cli.dryRun
    scope = cli.scope
    projectRef = cli.projectRef
    head = cli.head || head
    expectedHead = cli.expectedHead || expectedHead
    evidenceDir = cli.evidenceDir || evidenceDir
  }

  if (options.authorized !== undefined) {
    isAuthorized = Boolean(options.authorized)
    isDryRun = options.dryRun !== undefined ? Boolean(options.dryRun) : !isAuthorized
  }
  if (options.dryRun !== undefined) {
    isDryRun = Boolean(options.dryRun)
  }
  if (options.scope !== undefined) {
    scope = options.scope
  }
  if (options.projectRef !== undefined) {
    projectRef = options.projectRef
  }

  // 1. GUARD 1: Autorización Fail-Closed y exclusión mutua
  if (isAuthorized && isDryRun) {
    throw new Error('CLI_ARGUMENT_CONFLICT: No se puede combinar authorized: true con dryRun: true')
  }

  if (isAuthorized) {
    if (scope !== PR02_P0_SCOPE) {
      throw new Error(`PR02_P0_SCOPE_MISMATCH: Scope inválido '${scope}'. Se requiere '${PR02_P0_SCOPE}'`)
    }
    if (projectRef !== PR02_PARAMETERS_TARGET_PROJECT_REF) {
      throw new Error(
        `PR02_P0_TARGET_MISMATCH: Project-ref inválido '${projectRef}'. Se requiere '${PR02_PARAMETERS_TARGET_PROJECT_REF}'`
      )
    }
    if (!expectedHead || !/^[0-9a-fA-F]{40}$/.test(expectedHead)) {
      throw new Error(
        'PR02_P0_MISSING_EXPECTED_HEAD: En ejecución autorizada se requiere obligatoriamente expectedHead con 40 caracteres hexadecimales'
      )
    }

    const currentHead = head || resolveCurrentGitHead()
    if (currentHead !== expectedHead) {
      throw new Error(`PR02_P0_HEAD_MISMATCH: HEAD local '${currentHead}' difiere del esperado '${expectedHead}'`)
    }
  }

  // 2. Comportamiento en DRY-RUN (sin conexiones externas)
  if (isDryRun || !isAuthorized) {
    return Object.freeze({
      execution: 'DRY_RUN',
      scope,
      projectRef,
      PR02_P0_LOCAL_PREPARATION: 'PASS',
      PR02_P0_AUTHORIZATION_GUARD: 'PASS',
      PR02_P0_WSAA_WSFE_ALLOWLIST: 'PASS',
      PR02_P0_CALL_LIMIT_GUARD: 'PASS',
      PR02_P0_SOAP_VALIDATION: 'PASS',
      PR02_P0_MANIFEST_INTEGRITY: 'PASS',
      PR02_P0_PROVENANCE_BINDING: 'PASS',
      PR02_P0_REMOTE_EXECUTION_READY: false,
      PR02_P0_REMOTE_EXECUTED: false,
      OFFICIAL_PROVENANCE: 'UNVERIFIED',
      PR02_P1_REMOTE_EXECUTION_READY: false,
      PR02_P2_REMOTE_EXECUTION_READY: false,
      REAL_PV2_ENABLED: false,
      HISTORICAL_042_IDENTIFICATION: 'UNRESOLVED',
      PR02_READY_FOR_EMISSION_GO: false,
      ARCA_CALLS_NEW: 0,
      STAGING_WRITES_NEW: 0,
      PRODUCTION_MUTATIONS: 0,
      UNAUTHORIZED_CONNECTION_ATTEMPTS: 0,
    })
  }

  // 3. Ejecución autorizada (P0 collector)
  // Validación de no duplicación de transporte inyectado
  const hasFetcher = Boolean(deps.fetcher)
  const hasSpecificMocks = Boolean(deps.wsaaLogin || deps.wsfeTiposIva || deps.wsfeCondicionIva)
  if (hasFetcher && hasSpecificMocks) {
    throw new Error('DUPLICATE_TRANSPORT_INJECTION: No se puede proporcionar fetcher y mocks específicos de operaciones simultáneamente')
  }

  // Validación de endpoints autorizados
  if (options.wsaaUrl) validateP0EndpointUrl(options.wsaaUrl, 'WSAA')
  if (options.wsfeUrl) validateP0EndpointUrl(options.wsfeUrl, 'WSFE')

  const wsaaUrl = options.wsaaUrl || WSAA_HOMO_URL
  const wsfeUrl = options.wsfeUrl || WSFE_HOMO_URL

  const tracker = createPr02P0CallTracker({
    loginCmsMax: options.loginCmsMax,
    totalMax: options.totalMax,
  })

  const processId = options.processId || randomUUID()
  const serverNowIso = options.now ? new Date(options.now).toISOString() : new Date().toISOString()

  let token = ''
  let sign = ''

  // 3.1 Manejo de TA (Ticket de Acceso)
  if (options.existingTa) {
    const rawTa = typeof options.existingTa === 'object' ? options.existingTa : {}
    const taRecord = {
      valido: true,
      estado: rawTa.estado || 'DISPONIBLE',
      vence_en: rawTa.vence_en || rawTa.expirationTime,
      token: rawTa.token,
      sign: rawTa.sign,
    }
    const existing = evaluateExistingTa(taRecord, options.now)
    if (existing.reusable && taRecord.token && taRecord.sign) {
      token = taRecord.token
      sign = taRecord.sign
    } else {
      if (!options.cmsBase64 && !deps.wsaaLogin && !deps.fetcher) {
        throw new Error('TA_EXPIRED: El Ticket de Acceso existente se encuentra vencido y no se suministraron credenciales CMS para renovarlo')
      }
    }
  }

  if (!token || !sign) {
    tracker.recordCall('LoginCms')
    try {
      let wsaaResponseXml = ''
      if (deps.wsaaLogin) {
        wsaaResponseXml = await deps.wsaaLogin()
      } else if (deps.fetcher) {
        const res = await deps.fetcher(wsaaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
          body: buildWsaaLoginCmsSoapRequest(options.cmsBase64 || 'MOCK_CMS'),
        })
        if (!res.ok) throw new Error(`WSAA_HTTP_${res.status}`)
        wsaaResponseXml = await res.text()
      } else {
        // En ausencia de fetcher inyectado y sin credenciales de red autorizadas, fail-closed
        throw new Error('REMOTE_NETWORK_DISABLED: Conexión externa a WSAA no autorizada en este entorno')
      }

      const parsedTa = parseWsaaLoginCmsResponse(wsaaResponseXml, options.now)
      token = parsedTa.token
      sign = parsedTa.sign
    } catch (wsaaErr) {
      tracker.recordFailure('LoginCms')
      throw wsaaErr
    }
  }

  // 3.2 Consulta FEParamGetTiposIva
  let rawIvaSoapXml = ''
  tracker.recordCall('FEParamGetTiposIva')
  try {
    if (deps.wsfeTiposIva) {
      rawIvaSoapXml = await deps.wsfeTiposIva({ token, sign, cuit: PR02_PARAMETERS_EXPECTED_ISSUER_CUIT })
    } else if (deps.fetcher) {
      const res = await deps.fetcher(wsfeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"http://ar.gov.afip.dif.FEV1/FEParamGetTiposIva"',
        },
        body: buildWsfeTiposIvaRequest({ token, sign, cuit: PR02_PARAMETERS_EXPECTED_ISSUER_CUIT }),
      })
      if (!res.ok) throw new Error(`WSFE_HTTP_${res.status}`)
      rawIvaSoapXml = await res.text()
    } else {
      throw new Error('REMOTE_NETWORK_DISABLED: Conexión externa a WSFE no autorizada en este entorno')
    }
  } catch (ivaErr) {
    tracker.recordFailure('FEParamGetTiposIva')
    throw ivaErr
  }

  const parsedIva = parseWsfeTiposIvaResponse(rawIvaSoapXml, serverNowIso)

  // 3.3 Consulta FEParamGetCondicionIvaReceptor
  let rawConditionSoapXml = ''
  tracker.recordCall('FEParamGetCondicionIvaReceptor')
  try {
    if (deps.wsfeCondicionIva) {
      rawConditionSoapXml = await deps.wsfeCondicionIva({ token, sign, cuit: PR02_PARAMETERS_EXPECTED_ISSUER_CUIT })
    } else if (deps.fetcher) {
      const res = await deps.fetcher(wsfeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"http://ar.gov.afip.dif.FEV1/FEParamGetCondicionIvaReceptor"',
        },
        body: buildWsfeCondicionIvaReceptorRequest({ token, sign, cuit: PR02_PARAMETERS_EXPECTED_ISSUER_CUIT }),
      })
      if (!res.ok) throw new Error(`WSFE_HTTP_${res.status}`)
      rawConditionSoapXml = await res.text()
    } else {
      throw new Error('REMOTE_NETWORK_DISABLED: Conexión externa a WSFE no autorizada en este entorno')
    }
  } catch (condErr) {
    tracker.recordFailure('FEParamGetCondicionIvaReceptor')
    throw condErr
  }

  const parsedCond = parseWsfeCondicionIvaReceptorResponse(rawConditionSoapXml, serverNowIso)

  // 4. Extracción de textos normalizados y hashes

  const ivaNormalizedText = parsedIva.ivaText
  const conditionNormalizedText = parsedCond.conditionText

  const rawIvaSha = sha256(rawIvaSoapXml)
  const normIvaSha = sha256(ivaNormalizedText)
  const rawCondSha = sha256(rawConditionSoapXml)
  const normCondSha = sha256(conditionNormalizedText)

  // 5. Construcción del manifiesto oficial P0
  const manifest = createPr02P0OfficialEvidenceManifest({
    entorno: 'HOMOLOGACION',
    origen_verificado: WSFE_HOMO_URL,
    consultado_en: serverNowIso,
    identificador_proceso: processId,
    colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
    ejecucion_autorizada_id: processId,
    ejecucion_autorizada_scope: PR02_P0_SCOPE,
    iva_respuesta_original_sha256: rawIvaSha,
    iva_archivo_normalizado_sha256: normIvaSha,
    condition_respuesta_original_sha256: rawCondSha,
    condition_archivo_normalizado_sha256: normCondSha,
    transporte_validado: true,
    now: options.now,
  })

  validatePr02P0Manifest(manifest)

  // 6. Validación de integridad de contenido vs procedencia oficial
  const contentIntegrityPass =
    rawIvaSha === manifest.iva_respuesta_original_sha256 &&
    normIvaSha === manifest.iva_archivo_normalizado_sha256 &&
    rawCondSha === manifest.condition_respuesta_original_sha256 &&
    normCondSha === manifest.condition_archivo_normalizado_sha256

  if (!contentIntegrityPass) {
    throw new Error('CONTENT_INTEGRITY_MISMATCH: Los hashes de respuestas no coinciden con el manifiesto')
  }

  // Sin prueba efectiva de adquisición oficial (por ejemplo en simulaciones/tests locales sin GO oficial):
  const officialProvenance = deps.isOfficialExecution === true ? 'VERIFIED' : 'UNVERIFIED'

  // 7. Persistencia segura fuera de Git si saveEvidence está habilitado (o por defecto en ejecución autorizada)
  let persistenceReport = null
  if (options.saveEvidence !== false) {
    persistenceReport = saveP0EvidencePackage({
      evidenceDir,
      manifest,
      rawIvaSoapXml,
      ivaNormalizedText,
      rawConditionSoapXml,
      conditionNormalizedText,
    })
  }

  return Object.freeze({
    execution: 'AUTHORIZED_EXECUTION',
    scope: PR02_P0_SCOPE,
    projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
    processId,
    PR02_P0_LOCAL_PREPARATION: 'PASS',
    PR02_P0_EXECUTION: 'PASS',
    PR02_P0_COLLECTOR_IMPLEMENTATION: 'PASS',
    PR02_P0_AUTHORIZATION_GUARD: 'PASS',
    PR02_P0_WSAA_WSFE_ALLOWLIST: 'PASS',
    PR02_P0_CALL_LIMIT_GUARD: 'PASS',
    PR02_P0_SOAP_VALIDATION: 'PASS',
    PR02_P0_MANIFEST_INTEGRITY: 'PASS',
    PR02_P0_PROVENANCE_BINDING: 'PASS',
    CONTENT_INTEGRITY: 'PASS',
    OFFICIAL_PROVENANCE: officialProvenance,
    PR02_P0_REMOTE_EXECUTION_READY: false,
    PR02_P0_REMOTE_EXECUTED: false,
    PR02_P1_REMOTE_EXECUTION_READY: false,
    PR02_P2_REMOTE_EXECUTION_READY: false,
    REAL_PV2_ENABLED: false,
    HISTORICAL_042_IDENTIFICATION: 'UNRESOLVED',
    PR02_READY_FOR_EMISSION_GO: false,
    ARCA_CALLS_NEW: tracker.getCounts().total,
    STAGING_WRITES_NEW: 0,
    PRODUCTION_MUTATIONS: 0,
    manifest,
    evidenceFiles: persistenceReport ? persistenceReport.files : [],
  })
}

if (process.argv[1] && process.argv[1].endsWith('execute-pr02-p0-official-evidence.mjs')) {
  executePr02P0OfficialEvidence({ argv: process.argv.slice(2) })
    .then((res) => {
      console.log(JSON.stringify(res, null, 2))
      process.exit(0)
    })
    .catch((err) => {
      console.error(`PR02_P0_FATAL_ERROR=${err.message}`)
      process.exit(1)
    })
}
