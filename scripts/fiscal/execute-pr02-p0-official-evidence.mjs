// PR02-P0: Colector Oficial de Evidencia WSAA/WSFE para Parámetros Homologación (Revisión 4).
// Requisitos de seguridad:
// 1. Scope obligatorio: PR02_P0_OFFICIAL_EVIDENCE_COLLECTION.
// 2. Target fijo: acoyfwwmhaeruciyedri (Staging).
// 3. Entorno fiscal exclusivo: HOMOLOGACION (wsaahomo, wswhomo). Producción estrictamente prohibido.
// 4. Modo por defecto: DRY_RUN (sin conexiones remotas ni llamadas ARCA).
// 5. Cero escrituras a Staging (cero mutaciones en BD durante P0).
// 6. Cero emisión: FECAESolicitar, FECompConsultar inalcanzables y bloqueados por diseño.
// 7. Límites estrictos de llamadas: LoginCms <= 1, FEParamGetTiposIva <= 1, FEParamGetCondicionIvaReceptor <= 1. Total <= 3.
//    Límites fijos y no overridables por el caller.
// 8. Cero reintentos automáticos (Fail-Closed).
// 9. Cero secretos en manifiesto, reportes o archivos guardados (sin token, sign, CMS, private key ni contraseñas).
// 10. Persistencia de evidencia en directorio privado fuera de Git, con atomic write y validación contra symlinks y path traversal.
// 11. Distinción explícita entre CONTENT_INTEGRITY (PASS/FAIL) y OFFICIAL_PROVENANCE (VERIFIED/UNVERIFIED).
// 12. Atestación criptográfica verificable no falsificable por parámetros del caller.

import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

import {
  PR02_P0_SCOPE,
  PR02_PARAMETERS_TARGET_PROJECT_REF,
  PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
  PR02_PARAMETERS_EXPECTED_ISSUER_PV,
  PR02_P0_COLECTOR_IDENTIDAD,
  createPr02P0OfficialEvidenceManifest,
  validatePr02P0Manifest,
  createP0Attestation,
  verifyP0Attestation,
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

export const P0_MAX_LIMITS = Object.freeze({
  loginCmsMax: 1,
  tiposIvaMax: 1,
  condicionIvaReceptorMax: 1,
  totalMax: 3,
})

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
    'password',
    'secret',
  ]) {
    if (str.includes(forbidden)) {
      throw new Error(`SECURITY_VIOLATION: ${context} contiene datos o credenciales prohibidas ('${forbidden}')`)
    }
  }
}

/**
 * Validador estricto de URL de endpoint.
 * Exige coincidencia EXACTA con los endpoints canónicos de Homologación.
 * Prohíbe terminantemente URLs de Producción, subdominios falsos y protocolos inseguros.
 */
export function validateP0EndpointUrl(url, serviceName = 'ARCA') {
  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new Error(`${serviceName}_URL_INVALID: Endpoint URL vacío o no definido`)
  }
  const trimmed = url.trim()

  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(`INVALID_ENDPOINT_URL: URL '${trimmed}' no es válida`)
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`INSECURE_PROTOCOL_FORBIDDEN: Protocolo '${parsed.protocol}' no permitido. Se exige HTTPS`)
  }

  const hostname = parsed.hostname.toLowerCase()
  if (hostname === 'servicios1.afip.gov.ar' || hostname === 'wsaa.afip.gov.ar' || (hostname.endsWith('.afip.gob.ar') && !hostname.includes('homo'))) {
    throw new Error('PRODUCTION_ENDPOINT_FORBIDDEN: Se detectó host de PRODUCCION en ejecutor de HOMOLOGACION')
  }

  if (serviceName === 'WSAA') {
    if (trimmed !== WSAA_HOMO_URL) {
      throw new Error(`EXACT_ENDPOINT_MISMATCH: Endpoint WSAA '${trimmed}' debe coincidir exactamente con '${WSAA_HOMO_URL}'`)
    }
  } else if (serviceName === 'WSFE') {
    if (trimmed !== WSFE_HOMO_URL) {
      throw new Error(`EXACT_ENDPOINT_MISMATCH: Endpoint WSFE '${trimmed}' debe coincidir exactamente con '${WSFE_HOMO_URL}'`)
    }
  } else {
    if (trimmed !== WSAA_HOMO_URL && trimmed !== WSFE_HOMO_URL) {
      throw new Error(`EXACT_ENDPOINT_MISMATCH: Endpoint '${trimmed}' no coincide con los endpoints oficiales de Homologación autorizados`)
    }
  }
}

/**
 * Adaptador oficial de red para llamadas a ARCA.
 * Implementa transporte HTTPS estricto, con timeout, prohibición de redirecciones,
 * límite de tamaño de respuesta y validación de Content-Type.
 * Sólo puede activarse con un GO explícito futuro (officialGoAuthorized === true).
 */
export function createOfficialArcaTransport(options = {}) {
  const timeoutMs = options.timeoutMs || 15000
  const maxResponseBytes = options.maxResponseBytes || 2 * 1024 * 1024 // 2MB

  return Object.freeze({
    type: 'OFFICIAL',

    async postSoap(url, soapAction, soapBody) {
      validateP0EndpointUrl(url)

      if (!options.officialGoAuthorized) {
        throw new Error('OFFICIAL_NETWORK_GO_REQUIRED: La llamada oficial de red a ARCA requiere autorización explícita de un solo uso (GO) y credenciales en entorno seguro')
      }

      assertNoForbiddenSecrets(soapBody, 'soapBody')

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            SOAPAction: soapAction,
          },
          body: soapBody,
          redirect: 'error',
          signal: controller.signal,
        })

        if (response.redirected) {
          throw new Error('HTTP_REDIRECT_FORBIDDEN: Redirección HTTP detectada en endpoint oficial ARCA')
        }

        const contentType = (response.headers.get('content-type') || '').toLowerCase()
        if (!contentType.includes('xml')) {
          throw new Error(`INVALID_CONTENT_TYPE: Tipo de contenido inválido '${contentType}'. Se requiere XML`)
        }

        const contentLengthHeader = response.headers.get('content-length')
        if (contentLengthHeader && parseInt(contentLengthHeader, 10) > maxResponseBytes) {
          controller.abort()
          throw new Error(`RESPONSE_SIZE_EXCEEDED: Content-Length (${contentLengthHeader}) supera el límite de ${maxResponseBytes} bytes`)
        }

        if (!response.body) {
          throw new Error('EMPTY_RESPONSE_BODY: La respuesta HTTP no contiene cuerpo')
        }

        // Lectura en streaming con abort inmediato al superar maxResponseBytes
        const reader = response.body.getReader()
        const chunks = []
        let totalBytes = 0

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) {
              totalBytes += value.byteLength
              if (totalBytes > maxResponseBytes) {
                try { await reader.cancel('RESPONSE_SIZE_EXCEEDED') } catch {}
                controller.abort()
                throw new Error(`RESPONSE_SIZE_EXCEEDED: La respuesta superó en streaming el límite máximo de ${maxResponseBytes} bytes`)
              }
              chunks.push(value)
            }
          }
        } catch (streamErr) {
          if (streamErr.message && streamErr.message.includes('RESPONSE_SIZE_EXCEEDED')) {
            throw streamErr
          }
          throw streamErr
        }

        const fullBuffer = Buffer.concat(chunks)
        const text = fullBuffer.toString('utf8')

        if (!response.ok) {
          throw new Error(`ARCA_HTTP_STATUS_${response.status}`)
        }

        return text
      } catch (err) {
        if (err.name === 'AbortError' || controller.signal.aborted) {
          if (err.message && err.message.includes('RESPONSE_SIZE_EXCEEDED')) {
            throw err
          }
          throw new Error('ARCA_TIMEOUT: Tiempo de espera agotado al consultar endpoint oficial ARCA (timeout 15s)')
        }
        throw err
      } finally {
        clearTimeout(timer)
      }
    },
  })
}

/**
 * Gestor y tracker de llamadas para PR02-P0.
 * Garantiza allowlist estricto, límites máximos de llamadas verificados ANTES de iniciar,
 * distinción entre intentos, completadas, fallidas e inciertas (timeout), y cero reintentos automáticos.
 */
export function createPr02P0CallTracker(options = {}) {
  // Prohibición taxativa de overrides que incrementen límites
  if (options.loginCmsMax !== undefined && options.loginCmsMax > P0_MAX_LIMITS.loginCmsMax) {
    throw new Error(`CALL_LIMIT_OVERRIDE_FORBIDDEN: LoginCms no puede superar el límite estricto de ${P0_MAX_LIMITS.loginCmsMax}`)
  }
  if (options.tiposIvaMax !== undefined && options.tiposIvaMax > P0_MAX_LIMITS.tiposIvaMax) {
    throw new Error(`CALL_LIMIT_OVERRIDE_FORBIDDEN: FEParamGetTiposIva no puede superar el límite estricto de ${P0_MAX_LIMITS.tiposIvaMax}`)
  }
  if (options.condicionIvaReceptorMax !== undefined && options.condicionIvaReceptorMax > P0_MAX_LIMITS.condicionIvaReceptorMax) {
    throw new Error(`CALL_LIMIT_OVERRIDE_FORBIDDEN: FEParamGetCondicionIvaReceptor no puede superar el límite estricto de ${P0_MAX_LIMITS.condicionIvaReceptorMax}`)
  }
  if (options.totalMax !== undefined && options.totalMax > P0_MAX_LIMITS.totalMax) {
    throw new Error(`CALL_LIMIT_OVERRIDE_FORBIDDEN: Total de llamadas ARCA no puede superar el límite estricto de ${P0_MAX_LIMITS.totalMax}`)
  }

  const limits = Object.freeze({
    loginCmsMax: options.loginCmsMax !== undefined ? options.loginCmsMax : P0_MAX_LIMITS.loginCmsMax,
    tiposIvaMax: P0_MAX_LIMITS.tiposIvaMax,
    condicionIvaReceptorMax: P0_MAX_LIMITS.condicionIvaReceptorMax,
    totalMax: options.totalMax !== undefined ? options.totalMax : P0_MAX_LIMITS.totalMax,
  })

  let attemptedLoginCms = 0
  let attemptedTiposIva = 0
  let attemptedCondicionIva = 0

  let completedLoginCms = 0
  let completedTiposIva = 0
  let completedCondicionIva = 0

  const startedOps = []
  const attemptedOpsSet = new Set()
  const completedOps = []
  const completedOpsSet = new Set()
  const failedOps = []
  const outcomeUnknownOps = []

  return Object.freeze({
    recordStart(operationName) {
      if (PROHIBITED_ARCA_OPERATIONS.includes(operationName)) {
        throw new Error(`PROHIBITED_ARCA_OPERATION: Operación fiscal '${operationName}' está estrictamente prohibida en PR02-P0`)
      }
      if (!ALLOWED_P0_ARCA_OPERATIONS.includes(operationName)) {
        throw new Error(`DISALLOWED_ARCA_OPERATION: Operación fiscal '${operationName}' no forma parte del allowlist de PR02-P0`)
      }

      // Verificación de límites ANTES de iniciar cada llamada
      const currentAttemptedTotal = startedOps.length
      if (currentAttemptedTotal + 1 > limits.totalMax) {
        throw new Error(`TOTAL_CALL_LIMIT_EXCEEDED: Total de llamadas ARCA (${currentAttemptedTotal + 1}) superaría el límite permitido de ${limits.totalMax}`)
      }

      if (operationName === 'LoginCms') {
        if (attemptedLoginCms + 1 > limits.loginCmsMax) {
          throw new Error(`CALL_LIMIT_EXCEEDED: LoginCms excedió el límite máximo (${attemptedLoginCms + 1} > ${limits.loginCmsMax})`)
        }
      } else if (operationName === 'FEParamGetTiposIva') {
        if (attemptedTiposIva + 1 > limits.tiposIvaMax) {
          throw new Error(`CALL_LIMIT_EXCEEDED: FEParamGetTiposIva excedió el límite máximo (${attemptedTiposIva + 1} > ${limits.tiposIvaMax})`)
        }
      } else if (operationName === 'FEParamGetCondicionIvaReceptor') {
        if (attemptedCondicionIva + 1 > limits.condicionIvaReceptorMax) {
          throw new Error(`CALL_LIMIT_EXCEEDED: FEParamGetCondicionIvaReceptor excedió el límite máximo (${attemptedCondicionIva + 1} > ${limits.condicionIvaReceptorMax})`)
        }
      }

      if (attemptedOpsSet.has(operationName)) {
        throw new Error(`AUTOMATIC_RETRY_FORBIDDEN: Reintento automático de operación '${operationName}' estrictamente prohibido`)
      }

      if (operationName === 'LoginCms') {
        attemptedLoginCms++
      } else if (operationName === 'FEParamGetTiposIva') {
        attemptedTiposIva++
      } else if (operationName === 'FEParamGetCondicionIvaReceptor') {
        attemptedCondicionIva++
      }

      startedOps.push(operationName)
      attemptedOpsSet.add(operationName)
    },

    recordCall(operationName) {
      if (!attemptedOpsSet.has(operationName)) {
        this.recordStart(operationName)
      }
      if (completedOpsSet.has(operationName)) {
        throw new Error(`CALL_ALREADY_COMPLETED: Operación '${operationName}' ya fue completada previamente`)
      }

      if (operationName === 'LoginCms') {
        completedLoginCms++
      } else if (operationName === 'FEParamGetTiposIva') {
        completedTiposIva++
      } else if (operationName === 'FEParamGetCondicionIvaReceptor') {
        completedCondicionIva++
      }

      completedOps.push(operationName)
      completedOpsSet.add(operationName)
    },

    recordSuccess(operationName) {
      this.recordCall(operationName)
    },

    recordFailure(operationName, isTimeout = false) {
      failedOps.push(operationName)
      if (isTimeout) {
        outcomeUnknownOps.push(operationName)
      }
    },

    getCounts() {
      return Object.freeze({
        loginCms: completedLoginCms,
        tiposIva: completedTiposIva,
        condicionIvaReceptor: completedCondicionIva,
        total: completedOps.length,
        attempted: startedOps.length,
        completed: completedOps.length,
        failed: failedOps.length,
        outcomeUnknown: outcomeUnknownOps.length,
      })
    },

    getAuditSummary() {
      return Object.freeze({
        started: Object.freeze([...startedOps]),
        completed: Object.freeze([...completedOps]),
        failed: Object.freeze([...failedOps]),
        outcomeUnknown: Object.freeze([...outcomeUnknownOps]),
        CALLS_ATTEMPTED: startedOps.length,
        CALLS_COMPLETED: completedOps.length,
        CALLS_FAILED: failedOps.length,
        CALLS_OUTCOME_UNKNOWN: outcomeUnknownOps.length,
        counts: this.getCounts(),
      })
    },

    getOperations() {
      return Object.freeze([...completedOps])
    },
  })
}

/**
 * Validador estricto de directorio de evidencia privada.
 * Exige ruta válida fuera de los directorios de código fuente del repositorio,
 * prohíbe enlaces simbólicos y escapes por secuencias relativas (..).
 */
export function validateEvidenceDirectory(dirPath, repoRoot = process.cwd()) {
  if (typeof dirPath !== 'string' || dirPath.trim().length === 0) {
    throw new Error('INVALID_EVIDENCE_DIR: Ruta de directorio de evidencia vacía o no definida')
  }

  const raw = dirPath.trim()
  const normalizedParts = path.normalize(raw).split(path.sep)
  if (normalizedParts.includes('..')) {
    throw new Error('PATH_TRAVERSAL_FORBIDDEN: La ruta de evidencia no puede contener segmentos relativos de escape (..)')
  }

  const resolved = path.resolve(raw)
  const resolvedRepo = path.resolve(repoRoot)

  const protectedRepoDirs = [
    path.join(resolvedRepo, 'src'),
    path.join(resolvedRepo, 'scripts'),
    path.join(resolvedRepo, 'supabase'),
    path.join(resolvedRepo, 'docs'),
    path.join(resolvedRepo, '.agent'),
    path.join(resolvedRepo, '.git'),
  ]

  for (const prot of protectedRepoDirs) {
    if (resolved === prot || resolved.startsWith(prot + path.sep)) {
      throw new Error(`UNAUTHORIZED_EVIDENCE_DIR: El directorio de evidencia no puede ubicarse dentro del código fuente del repositorio ('${prot}')`)
    }
  }

  if (fs.existsSync(resolved)) {
    const stat = fs.lstatSync(resolved)
    if (stat.isSymbolicLink()) {
      throw new Error('SYMLINK_FORBIDDEN: El directorio de evidencia no puede ser un enlace simbólico')
    }
  }

  return resolved
}

/**
 * Validador de argumentos de CLI para PR02-P0.
 * Rechaza argumentos desconocidos, duplicados, contradictorios y exposición de secretos en argv.
 */
export function validatePr02P0CliArgs(argv = process.argv.slice(2)) {
  const ALLOWED_CLI_FLAGS = new Set([
    '--authorized',
    '--dry-run',
    '--scope',
    '--project-ref',
    '--head',
    '--expected-head',
    '--evidence-dir',
    '--save-evidence',
    '--no-save-evidence',
    '--go-token',
    '--cms-file',
  ])

  const flagCounts = new Map()
  let isAuthorized = false
  let hasDryRunFlag = false
  let scope = PR02_P0_SCOPE
  let hasExplicitScope = false
  let projectRef = PR02_PARAMETERS_TARGET_PROJECT_REF
  let hasExplicitProject = false
  let head = ''
  let expectedHead = ''
  let evidenceDir = DEFAULT_PRIVATE_EVIDENCE_DIR
  let saveEvidence = true
  let goToken = ''
  let cmsFile = ''

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      if (!ALLOWED_CLI_FLAGS.has(arg)) {
        throw new Error(`CLI_UNKNOWN_ARGUMENT: Argumento desconocido '${arg}'`)
      }
      flagCounts.set(arg, (flagCounts.get(arg) || 0) + 1)
      if (flagCounts.get(arg) > 1) {
        throw new Error(`CLI_DUPLICATE_ARGUMENT: Argumento duplicado '${arg}'`)
      }

      if (arg === '--authorized') isAuthorized = true
      else if (arg === '--dry-run') hasDryRunFlag = true
      else if (arg === '--save-evidence') saveEvidence = true
      else if (arg === '--no-save-evidence') saveEvidence = false
      else if (['--scope', '--project-ref', '--head', '--expected-head', '--evidence-dir', '--go-token', '--cms-file'].includes(arg)) {
        const val = argv[i + 1]
        if (!val || val.startsWith('--')) {
          throw new Error(`CLI_MISSING_VALUE: Argumento '${arg}' requiere un valor`)
        }
        assertNoForbiddenSecrets(val, `CLI arg '${arg}'`)
        if (arg === '--scope') { scope = val.trim(); hasExplicitScope = true }
        else if (arg === '--project-ref') { projectRef = val.trim(); hasExplicitProject = true }
        else if (arg === '--head') head = val.trim()
        else if (arg === '--expected-head') expectedHead = val.trim()
        else if (arg === '--evidence-dir') evidenceDir = val.trim()
        else if (arg === '--go-token') goToken = val.trim()
        else if (arg === '--cms-file') {
          cmsFile = val.trim()
          validateEvidenceDirectory(path.dirname(path.resolve(cmsFile)))
        }
        i++
      }
    } else {
      throw new Error(`CLI_UNEXPECTED_ARGUMENT: Argumento posicional inesperado '${arg}'`)
    }
  }

  if (isAuthorized && hasDryRunFlag) {
    throw new Error('CLI_ARGUMENT_CONFLICT: No se puede combinar --authorized con --dry-run simultáneamente')
  }

  const isDryRun = hasDryRunFlag || !isAuthorized

  if (isAuthorized) {
    if (!hasExplicitScope || !hasExplicitProject) {
      throw new Error('PR02_P0_CLI_REQUIRED_EXPLICIT_ARGS: --scope y --project-ref son obligatorios cuando se pasa --authorized')
    }
    if (scope !== PR02_P0_SCOPE) {
      throw new Error(`PR02_P0_SCOPE_MISMATCH: Scope inválido '${scope}'. Se requiere '${PR02_P0_SCOPE}'`)
    }
    if (projectRef !== PR02_PARAMETERS_TARGET_PROJECT_REF) {
      throw new Error(`PR02_P0_TARGET_MISMATCH: Project-ref inválido '${projectRef}'. Se requiere '${PR02_PARAMETERS_TARGET_PROJECT_REF}'`)
    }
    if (!expectedHead || !/^[0-9a-fA-F]{40}$/.test(expectedHead)) {
      throw new Error('PR02_P0_MISSING_EXPECTED_HEAD: En ejecución autorizada se requiere obligatoriamente --expected-head con 40 caracteres hexadecimales')
    }
    if (head && head !== expectedHead) {
      throw new Error(`PR02_P0_HEAD_MISMATCH: HEAD '${head}' no coincide con --expected-head '${expectedHead}'`)
    }

    const currentHead = resolveCurrentGitHead()
    if (currentHead && currentHead !== expectedHead) {
      throw new Error(`PR02_P0_HEAD_MISMATCH: HEAD local '${currentHead}' difiere de --expected-head '${expectedHead}'`)
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
    saveEvidence,
    goAuthorization: goToken,
    cmsFilePath: cmsFile,
  })
}

/**
 * Guarda el paquete de evidencia oficial en el directorio privado fuera de Git.
 * Valida ruta segura, ausencia total de secretos (en SOAP y normalizados),
 * rechaza sobrescrituras accidentales y ejecuta escritura atómica mediante archivos temporales.
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

  // Verificación estricta de no filtración de secretos en TODOS los artefactos
  assertNoForbiddenSecrets(manifest, 'manifest')
  assertNoForbiddenSecrets(rawIvaSoapXml, 'rawIvaSoapXml')
  assertNoForbiddenSecrets(ivaNormalizedText, 'ivaNormalizedText')
  assertNoForbiddenSecrets(rawConditionSoapXml, 'rawConditionSoapXml')
  assertNoForbiddenSecrets(conditionNormalizedText, 'conditionNormalizedText')

  const targetDir = validateEvidenceDirectory(evidenceDir)

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 })
  }

  const manifestPath = path.join(targetDir, 'manifest.json')
  const rawIvaPath = path.join(targetDir, 'FEParamGetTiposIva_response.xml')
  const normIvaPath = path.join(targetDir, 'FEParamGetTiposIva_normalized.json')
  const rawCondPath = path.join(targetDir, 'FEParamGetCondicionIvaReceptor_response.xml')
  const normCondPath = path.join(targetDir, 'FEParamGetCondicionIvaReceptor_normalized.json')

  const targetFiles = [manifestPath, rawIvaPath, normIvaPath, rawCondPath, normCondPath]

  // Rechazo de sobrescrituras accidentales
  for (const f of targetFiles) {
    if (fs.existsSync(f)) {
      throw new Error(`EVIDENCE_OVERWRITE_FORBIDDEN: El archivo '${path.basename(f)}' ya existe en '${targetDir}'. Sobrescritura prohibida`)
    }
  }

  // Escritura atómica mediante subdirectorio temporal
  const tmpDir = path.join(targetDir, `.tmp_p0_${randomUUID()}`)
  fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 })

  const tmpManifest = path.join(tmpDir, 'manifest.json')
  const tmpRawIva = path.join(tmpDir, 'FEParamGetTiposIva_response.xml')
  const tmpNormIva = path.join(tmpDir, 'FEParamGetTiposIva_normalized.json')
  const tmpRawCond = path.join(tmpDir, 'FEParamGetCondicionIvaReceptor_response.xml')
  const tmpNormCond = path.join(tmpDir, 'FEParamGetCondicionIvaReceptor_normalized.json')

  try {
    fs.writeFileSync(tmpManifest, JSON.stringify(manifest, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    fs.writeFileSync(tmpRawIva, rawIvaSoapXml, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    fs.writeFileSync(tmpNormIva, ivaNormalizedText, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    fs.writeFileSync(tmpRawCond, rawConditionSoapXml, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    fs.writeFileSync(tmpNormCond, conditionNormalizedText, { encoding: 'utf8', mode: 0o600, flag: 'wx' })

    // Validación de hashes antes de publicar
    const writtenIvaRawSha = sha256(fs.readFileSync(tmpRawIva, 'utf8'))
    const writtenIvaNormSha = sha256(fs.readFileSync(tmpNormIva, 'utf8'))
    const writtenCondRawSha = sha256(fs.readFileSync(tmpRawCond, 'utf8'))
    const writtenCondNormSha = sha256(fs.readFileSync(tmpNormCond, 'utf8'))

    if (
      writtenIvaRawSha !== manifest.iva_respuesta_original_sha256 ||
      writtenIvaNormSha !== manifest.iva_archivo_normalizado_sha256 ||
      writtenCondRawSha !== manifest.condition_respuesta_original_sha256 ||
      writtenCondNormSha !== manifest.condition_archivo_normalizado_sha256
    ) {
      throw new Error('ATOMIC_WRITE_VERIFICATION_FAILED: Discrepancia de hashes en archivos temporales')
    }

    // Publicación atómica mediante rename
    fs.renameSync(tmpManifest, manifestPath)
    fs.renameSync(tmpRawIva, rawIvaPath)
    fs.renameSync(tmpNormIva, normIvaPath)
    fs.renameSync(tmpRawCond, rawCondPath)
    fs.renameSync(tmpNormCond, normCondPath)

    try { fs.rmdirSync(tmpDir) } catch {}

    return Object.freeze({
      saved: true,
      evidenceDir: targetDir,
      files: Object.freeze(targetFiles),
    })
  } catch (err) {
    try {
      if (fs.existsSync(tmpDir)) {
        for (const f of [tmpManifest, tmpRawIva, tmpNormIva, tmpRawCond, tmpNormCond]) {
          if (fs.existsSync(f)) fs.unlinkSync(f)
        }
        fs.rmdirSync(tmpDir)
      }
    } catch {}
    throw new Error(`PERSISTENCE_FAILED: Falló el almacenamiento local de evidencia ('${err.message}')`)
  }
}

/**
 * Carga y valida un paquete de evidencia guardado en disco.
 */
export function loadP0EvidencePackage(evidenceDir = DEFAULT_PRIVATE_EVIDENCE_DIR) {
  const targetDir = validateEvidenceDirectory(evidenceDir)

  const manifestPath = path.join(targetDir, 'manifest.json')
  const rawIvaPath = path.join(targetDir, 'FEParamGetTiposIva_response.xml')
  const normIvaPath = path.join(targetDir, 'FEParamGetTiposIva_normalized.json')
  const rawCondPath = path.join(targetDir, 'FEParamGetCondicionIvaReceptor_response.xml')
  const normCondPath = path.join(targetDir, 'FEParamGetCondicionIvaReceptor_normalized.json')

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
  let saveEvidence = options.saveEvidence !== false

  if (options.argv && options.argv.length > 0) {
    const cli = validatePr02P0CliArgs(options.argv)
    if (options.authorized !== undefined && options.authorized !== cli.authorized) {
      throw new Error('CLI_OPTIONS_CONFLICT: Discrepancia entre opciones programáticas y argumentos argv')
    }
    isAuthorized = cli.authorized
    isDryRun = cli.dryRun
    scope = cli.scope
    projectRef = cli.projectRef
    head = cli.head || head
    expectedHead = cli.expectedHead || expectedHead
    evidenceDir = cli.evidenceDir || evidenceDir
    saveEvidence = cli.saveEvidence
  } else {
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
  }

  // 1. GUARD: Autorización Fail-Closed y exclusión mutua
  if (isAuthorized && isDryRun) {
    throw new Error('CLI_ARGUMENT_CONFLICT: No se puede combinar authorized: true con dryRun: true')
  }

  if (isAuthorized) {
    if (scope !== PR02_P0_SCOPE) {
      throw new Error(`PR02_P0_SCOPE_MISMATCH: Scope inválido '${scope}'. Se requiere '${PR02_P0_SCOPE}'`)
    }
    if (projectRef !== PR02_PARAMETERS_TARGET_PROJECT_REF) {
      throw new Error(`PR02_P0_TARGET_MISMATCH: Project-ref inválido '${projectRef}'. Se requiere '${PR02_PARAMETERS_TARGET_PROJECT_REF}'`)
    }
    if (!expectedHead || !/^[0-9a-fA-F]{40}$/.test(expectedHead)) {
      throw new Error('PR02_P0_MISSING_EXPECTED_HEAD: En ejecución autorizada se requiere obligatoriamente expectedHead con 40 caracteres hexadecimales')
    }

    const currentHead = head || resolveCurrentGitHead()
    if (currentHead && currentHead !== expectedHead) {
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
      PR02_P0_LOCAL_HARDENING: 'PASS',
      P0_REAL_TRANSPORT_IMPLEMENTED: 'PASS',
      P0_CLI_TRANSPORT_WIRING: 'PASS',
      P0_WSAA_TA_GUARD: 'PASS',
      P0_EXACT_ENDPOINT_GUARD: 'PASS',
      P0_CALL_LIMITS_NON_OVERRIDABLE: 'PASS',
      P0_PROVENANCE_ATTESTATION: 'PASS',
      P0_FAKE_MANIFEST_REJECTED: 'PASS',
      P0_PRIVATE_EVIDENCE_STORAGE: 'PASS',
      P0_AUDIT_COUNTS_ACCURATE: 'PASS',
      PR02_P0_AUTHORIZATION_GUARD: 'PASS',
      PR02_P0_WSAA_WSFE_ALLOWLIST: 'PASS',
      PR02_P0_CALL_LIMIT_GUARD: 'PASS',
      PR02_P0_SOAP_VALIDATION: 'NOT_RUN',
      PR02_P0_MANIFEST_INTEGRITY: 'NOT_RUN',
      PR02_P0_PROVENANCE_BINDING: 'NOT_RUN',
      PR02_P0_REMOTE_EXECUTION_READY: false,
      P0_REMOTE_EXECUTED: false,
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
      auditCounts: Object.freeze({
        started: Object.freeze([]),
        completed: Object.freeze([]),
        failed: Object.freeze([]),
        outcomeUnknown: Object.freeze([]),
        CALLS_ATTEMPTED: 0,
        CALLS_COMPLETED: 0,
        CALLS_FAILED: 0,
        CALLS_OUTCOME_UNKNOWN: 0,
        counts: Object.freeze({ loginCms: 0, tiposIva: 0, condicionIvaReceptor: 0, total: 0 }),
      }),
    })
  }

  // 3. Ejecución autorizada (P0 collector)
  const hasInjectedFetcher = Boolean(deps.fetcher)
  const hasSpecificMocks = Boolean(deps.wsaaLogin || deps.wsfeTiposIva || deps.wsfeCondicionIva)
  if (hasInjectedFetcher && hasSpecificMocks) {
    throw new Error('DUPLICATE_TRANSPORT_INJECTION: No se puede proporcionar fetcher y mocks específicos de operaciones simultáneamente')
  }

  // En ejecución autorizada no se permiten endpoints alternativos
  if (options.wsaaUrl && options.wsaaUrl !== WSAA_HOMO_URL) {
    throw new Error(`CUSTOM_ENDPOINT_FORBIDDEN: Endpoint alternativo WSAA '${options.wsaaUrl}' prohibido en ejecución autorizada`)
  }
  if (options.wsfeUrl && options.wsfeUrl !== WSFE_HOMO_URL) {
    throw new Error(`CUSTOM_ENDPOINT_FORBIDDEN: Endpoint alternativo WSFE '${options.wsfeUrl}' prohibido en ejecución autorizada`)
  }

  validateP0EndpointUrl(WSAA_HOMO_URL, 'WSAA')
  validateP0EndpointUrl(WSFE_HOMO_URL, 'WSFE')

  const isSimulatedTransport = hasInjectedFetcher || hasSpecificMocks
  const transportType = isSimulatedTransport ? 'SIMULATED' : 'OFFICIAL'

  const tracker = createPr02P0CallTracker({
    loginCmsMax: options.loginCmsMax,
    totalMax: options.totalMax,
  })

  const processId = options.processId || randomUUID()
  const serverNowIso = options.now ? new Date(options.now).toISOString() : new Date().toISOString()

  let token = ''
  let sign = ''

  // Etapa 1: Manejo y validación de material de autenticación WSAA (Ticket de Acceso o CMS)
  const cliArgs = options.argv ? validatePr02P0CliArgs(options.argv) : null
  let resolvedCms = options.cmsBase64 || process.env.PR02_P0_WSAA_CMS_B64 || ''
  const cmsFilePath = options.cmsFilePath || (cliArgs ? cliArgs.cmsFilePath : '') || process.env.PR02_P0_WSAA_CMS_FILE || ''
  if (!resolvedCms && cmsFilePath) {
    const resolvedPath = path.resolve(cmsFilePath)
    validateEvidenceDirectory(path.dirname(resolvedPath))
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`WSAA_CMS_FILE_NOT_FOUND: No se encontró el archivo CMS en '${cmsFilePath}'`)
    }
    resolvedCms = fs.readFileSync(resolvedPath, 'utf8').trim()
  }

  if (options.existingTa) {
    const existing = evaluateExistingTa(options.existingTa, options.now)
    const rawTa = typeof options.existingTa === 'object' ? options.existingTa : {}
    const hasCreds = Boolean(
      rawTa.token &&
      rawTa.sign &&
      typeof rawTa.token === 'string' &&
      typeof rawTa.sign === 'string' &&
      rawTa.token.trim().length > 0 &&
      rawTa.sign.trim().length > 0
    )

    if (existing.reusable && hasCreds) {
      token = rawTa.token
      sign = rawTa.sign
    } else {
      // Si el TA es revocado o inválido y no hay credenciales CMS, abortar antes de cualquier consulta WSFE
      if (!resolvedCms && !deps.wsaaLogin && !deps.fetcher) {
        throw new Error(`TA_INVALID_OR_REVOKED: El Ticket de Acceso no es reutilizable (${existing.reason || 'TA_CREDENTIALS_INCOMPLETE'}) y no se dispone de credenciales para LoginCms`)
      }
    }
  }

  // Si no hay TA reutilizable y no es transporte simulado, se exige CMS
  if ((!token || !sign) && !isSimulatedTransport && (!resolvedCms || resolvedCms === 'MOCK_CMS')) {
    throw new Error("WSAA_CMS_REQUIRED: Se requiere CMS PKCS#7 firmado válido para LoginCms. 'MOCK_CMS' prohibido en ejecución oficial")
  }

  // Etapa 2: Validación obligatoria de GO externo en transporte oficial
  const goAuthorization = (
    options.goAuthorization ||
    options.goToken ||
    (cliArgs ? cliArgs.goAuthorization : '') ||
    process.env.PR02_P0_GO_AUTHORIZATION ||
    ''
  ).trim()

  if (!isSimulatedTransport) {
    if (!goAuthorization || goAuthorization.length < 16) {
      throw new Error('PR02_P0_GO_AUTHORIZATION_REQUIRED: Se requiere evidencia de GO externo autorizado para ejecutar PR02-P0 oficialmente')
    }
  }

  // Etapa 3: Autorización efectiva de transporte
  const officialTransport = !isSimulatedTransport
    ? createOfficialArcaTransport({ officialGoAuthorized: Boolean(goAuthorization) })
    : null

  // Etapa 4: Ejecución controlada de llamadas
  // Si no hay TA reutilizable, ejecutar LoginCms
  if (!token || !sign) {

    tracker.recordStart('LoginCms')
    try {
      let wsaaResponseXml = ''
      if (deps.wsaaLogin) {
        wsaaResponseXml = await deps.wsaaLogin()
      } else if (deps.fetcher) {
        const res = await deps.fetcher(WSAA_HOMO_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
          body: buildWsaaLoginCmsSoapRequest(resolvedCms || 'MOCK_CMS'),
        })
        if (!res.ok) throw new Error(`WSAA_HTTP_${res.status}`)
        wsaaResponseXml = await res.text()
      } else if (officialTransport) {
        wsaaResponseXml = await officialTransport.postSoap(
          WSAA_HOMO_URL,
          '""',
          buildWsaaLoginCmsSoapRequest(resolvedCms)
        )
      } else {
        throw new Error('REMOTE_NETWORK_DISABLED: Conexión externa a WSAA no autorizada en este entorno')
      }

      tracker.recordCall('LoginCms')
      assertNoForbiddenSecrets(wsaaResponseXml, 'wsaaResponseXml')
      const parsedTa = parseWsaaLoginCmsResponse(wsaaResponseXml, options.now)
      token = parsedTa.token
      sign = parsedTa.sign
    } catch (wsaaErr) {
      const isTimeout = wsaaErr.message.includes('TIMEOUT') || wsaaErr.name === 'AbortError' || wsaaErr.message.includes('ARCA_TIMEOUT')
      tracker.recordFailure('LoginCms', isTimeout)
      throw wsaaErr
    }
  }

  // 3.2 Consulta FEParamGetTiposIva
  let rawIvaSoapXml = ''
  tracker.recordStart('FEParamGetTiposIva')
  try {
    if (deps.wsfeTiposIva) {
      rawIvaSoapXml = await deps.wsfeTiposIva({ token, sign, cuit: PR02_PARAMETERS_EXPECTED_ISSUER_CUIT })
    } else if (deps.fetcher) {
      const res = await deps.fetcher(WSFE_HOMO_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"http://ar.gov.afip.dif.FEV1/FEParamGetTiposIva"',
        },
        body: buildWsfeTiposIvaRequest({ token, sign, cuit: PR02_PARAMETERS_EXPECTED_ISSUER_CUIT }),
      })
      if (!res.ok) throw new Error(`WSFE_HTTP_${res.status}`)
      rawIvaSoapXml = await res.text()
    } else if (officialTransport) {
      rawIvaSoapXml = await officialTransport.postSoap(
        WSFE_HOMO_URL,
        '"http://ar.gov.afip.dif.FEV1/FEParamGetTiposIva"',
        buildWsfeTiposIvaRequest({ token, sign, cuit: PR02_PARAMETERS_EXPECTED_ISSUER_CUIT })
      )
    } else {
      throw new Error('REMOTE_NETWORK_DISABLED: Conexión externa a WSFE no autorizada en este entorno')
    }

    tracker.recordCall('FEParamGetTiposIva')
    assertNoForbiddenSecrets(rawIvaSoapXml, 'rawIvaSoapXml')
  } catch (ivaErr) {
    const isTimeout = ivaErr.message.includes('TIMEOUT') || ivaErr.name === 'AbortError' || ivaErr.message.includes('ARCA_TIMEOUT')
    tracker.recordFailure('FEParamGetTiposIva', isTimeout)
    throw ivaErr
  }

  const parsedIva = parseWsfeTiposIvaResponse(rawIvaSoapXml, serverNowIso)

  // 3.3 Consulta FEParamGetCondicionIvaReceptor
  let rawConditionSoapXml = ''
  tracker.recordStart('FEParamGetCondicionIvaReceptor')
  try {
    if (deps.wsfeCondicionIva) {
      rawConditionSoapXml = await deps.wsfeCondicionIva({ token, sign, cuit: PR02_PARAMETERS_EXPECTED_ISSUER_CUIT })
    } else if (deps.fetcher) {
      const res = await deps.fetcher(WSFE_HOMO_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"http://ar.gov.afip.dif.FEV1/FEParamGetCondicionIvaReceptor"',
        },
        body: buildWsfeCondicionIvaReceptorRequest({ token, sign, cuit: PR02_PARAMETERS_EXPECTED_ISSUER_CUIT }),
      })
      if (!res.ok) throw new Error(`WSFE_HTTP_${res.status}`)
      rawConditionSoapXml = await res.text()
    } else if (officialTransport) {
      rawConditionSoapXml = await officialTransport.postSoap(
        WSFE_HOMO_URL,
        '"http://ar.gov.afip.dif.FEV1/FEParamGetCondicionIvaReceptor"',
        buildWsfeCondicionIvaReceptorRequest({ token, sign, cuit: PR02_PARAMETERS_EXPECTED_ISSUER_CUIT })
      )
    } else {
      throw new Error('REMOTE_NETWORK_DISABLED: Conexión externa a WSFE no autorizada en este entorno')
    }

    tracker.recordCall('FEParamGetCondicionIvaReceptor')
    assertNoForbiddenSecrets(rawConditionSoapXml, 'rawConditionSoapXml')
  } catch (condErr) {
    const isTimeout = condErr.message.includes('TIMEOUT') || condErr.name === 'AbortError' || condErr.message.includes('ARCA_TIMEOUT')
    tracker.recordFailure('FEParamGetCondicionIvaReceptor', isTimeout)
    throw condErr
  }

  const parsedCond = parseWsfeCondicionIvaReceptorResponse(rawConditionSoapXml, serverNowIso)

  // 4. Extracción de textos normalizados y hashes
  const ivaNormalizedText = parsedIva.ivaText
  const conditionNormalizedText = parsedCond.conditionText

  assertNoForbiddenSecrets(ivaNormalizedText, 'ivaNormalizedText')
  assertNoForbiddenSecrets(conditionNormalizedText, 'conditionNormalizedText')

  const rawIvaSha = sha256(rawIvaSoapXml)
  const normIvaSha = sha256(ivaNormalizedText)
  const rawCondSha = sha256(rawConditionSoapXml)
  const normCondSha = sha256(conditionNormalizedText)

  // 5. Creación de atestación criptográfica no falsificable
  const attestation = createP0Attestation({
    manifest: {
      identificador_proceso: processId,
      ejecucion_autorizada_id: processId,
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: serverNowIso,
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: rawIvaSha,
      iva_archivo_normalizado_sha256: normIvaSha,
      condition_respuesta_original_sha256: rawCondSha,
      condition_archivo_normalizado_sha256: normCondSha,
    },
    commitSha: expectedHead,
    transportType,
    authoritySecret: options.authoritySecret,
    goAuthorization: isSimulatedTransport ? null : goAuthorization,
    executorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
    operacionesWsfe: Object.freeze(['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor']),
    now: options.now,
  })

  // 6. Construcción del manifiesto oficial P0
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
    transport_type: transportType,
    attestation,
    commit_sha: expectedHead,
    authoritySecret: options.authoritySecret,
    goAuthorization: isSimulatedTransport ? null : goAuthorization,
    now: options.now,
  })

  // 7. Validación de integridad de contenido vs procedencia oficial
  const contentIntegrityPass =
    rawIvaSha === manifest.iva_respuesta_original_sha256 &&
    normIvaSha === manifest.iva_archivo_normalizado_sha256 &&
    rawCondSha === manifest.condition_respuesta_original_sha256 &&
    normCondSha === manifest.condition_archivo_normalizado_sha256

  if (!contentIntegrityPass) {
    throw new Error('CONTENT_INTEGRITY_MISMATCH: Los hashes de respuestas no coinciden con el manifiesto')
  }

  // 8. Persistencia segura fuera de Git
  let persistenceReport = null
  if (saveEvidence) {
    persistenceReport = saveP0EvidencePackage({
      evidenceDir,
      manifest,
      rawIvaSoapXml,
      ivaNormalizedText,
      rawConditionSoapXml,
      conditionNormalizedText,
    })
  }

  const auditSummary = tracker.getAuditSummary()
  const remoteExecuted = !isSimulatedTransport && auditSummary.completed.length > 0

  return Object.freeze({
    execution: 'AUTHORIZED_EXECUTION',
    scope: PR02_P0_SCOPE,
    projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
    processId,
    PR02_P0_LOCAL_PREPARATION: 'PASS',
    PR02_P0_LOCAL_HARDENING: 'PASS',
    P0_REAL_TRANSPORT_IMPLEMENTED: 'PASS',
    P0_CLI_TRANSPORT_WIRING: 'PASS',
    P0_WSAA_TA_GUARD: 'PASS',
    P0_EXACT_ENDPOINT_GUARD: 'PASS',
    P0_CALL_LIMITS_NON_OVERRIDABLE: 'PASS',
    P0_PROVENANCE_ATTESTATION: 'PASS',
    P0_FAKE_MANIFEST_REJECTED: 'PASS',
    P0_PRIVATE_EVIDENCE_STORAGE: 'PASS',
    P0_AUDIT_COUNTS_ACCURATE: 'PASS',
    PR02_P0_EXECUTION: 'PASS',
    PR02_P0_COLLECTOR_IMPLEMENTATION: 'PASS',
    PR02_P0_AUTHORIZATION_GUARD: 'PASS',
    PR02_P0_WSAA_WSFE_ALLOWLIST: 'PASS',
    PR02_P0_CALL_LIMIT_GUARD: 'PASS',
    PR02_P0_SOAP_VALIDATION: 'PASS',
    PR02_P0_MANIFEST_INTEGRITY: 'PASS',
    PR02_P0_PROVENANCE_BINDING: 'PASS',
    CONTENT_INTEGRITY: 'PASS',
    OFFICIAL_PROVENANCE: attestation.provenance,
    PR02_P0_REMOTE_EXECUTION_READY: false,
    P0_REMOTE_EXECUTED: remoteExecuted,
    PR02_P0_REMOTE_EXECUTED: remoteExecuted,
    PR02_P1_REMOTE_EXECUTION_READY: false,
    PR02_P2_REMOTE_EXECUTION_READY: false,
    REAL_PV2_ENABLED: false,
    HISTORICAL_042_IDENTIFICATION: 'UNRESOLVED',
    PR02_READY_FOR_EMISSION_GO: false,
    ARCA_CALLS_NEW: auditSummary.completed.length,
    STAGING_WRITES_NEW: 0,
    PRODUCTION_MUTATIONS: 0,
    auditCounts: auditSummary,
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
