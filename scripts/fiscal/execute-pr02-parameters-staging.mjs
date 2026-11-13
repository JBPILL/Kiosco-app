// PR02: Runner y Ejecutor para Refresco de Parámetros Fiscales (Gates PR02-P1 y PR02-P2).
// Requisitos de seguridad:
// 1. Scopes autorizados: PR02_P1_VERIFIED_CATALOG_IMPORT, PR02_P1_PARAMETER_REFRESH, PR02_P2_CATALOG_ENABLE.
// 2. Target fijo: acoyfwwmhaeruciyedri (Staging).
// 3. Prohibición estricta de emisión: FECAESolicitar, FECompConsultar inalcanzables.
// 4. Modo por defecto: DRY_RUN (sin conexiones remotas ni llamadas ARCA).
// 5. Ejecución real autorizada exclusivamente bajo --authorized, --scope, --project-ref, --head y --expected-head.
// 6. Cero reintentos automáticos (Fail-Closed).
// 7. Límite máximo estricto de 3 llamadas ARCA totales en P1 (0 en P2).
// 8. Cero secretos, tokens ni credenciales en logs o reportes.
// 9. Semántica Insert-Only en P1 (habilitado = false), activación atómica en P2 (habilitado: false -> true).
// 10. PostgreSQL con verificación estricta de TLS (rejectUnauthorized: true + CA).
// 11. Cierre verificado de conexión PostgreSQL.

import pg from 'pg'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { DOMParser } from '@xmldom/xmldom'
import {
  PR02_P0_SCOPE,
  PR02_P1_SCOPE,
  PR02_P1_LEGACY_SCOPE,
  PR02_P2_SCOPE,
  PR02_PARAMETERS_ALLOWED_SCOPES,
  PR02_PARAMETERS_TARGET_PROJECT_REF,
  PR02_PARAMETERS_TARGET_REVISION,
  PR02_PARAMETERS_HISTORICAL_REVISION,
  PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
  PR02_PARAMETERS_EXPECTED_ISSUER_PV,
  REV3_SOURCE_SHA256,
  PR02_CATALOG_REV3_HASH,
  PR02_EXECUTION_OUTCOMES,
  UNCERTAIN_WRITE_RETRY_FORBIDDEN,
  PR02_PARAMETERS_REQUIRED_CALLS,
  PR02_PARAMETERS_PROHIBITED_CALLS,
  PR02_PARAMETERS_CALL_LIMITS_NON_REUSABLE,
  PR02_PARAMETERS_CALL_LIMITS_REUSABLE,
  FECAESOLICITAR_REACHABLE,
  FECOMPCONSULTAR_REACHABLE,
  PR02_P1_EMISSION_CAPABLE,
  PR02_P2_EMISSION_CAPABLE,
  EMITTER_ENABLE_DURING_PR02_PARAMETERS,
  REVISION_3_MUTATED,
  REVISION_4_INSERT_ONLY,
  PR02_P1_PREFLIGHT_SELECT_SQL,
  PR02_P1_POSTCHECK_SELECT_SQL,
  PR02_P1_ATOMIC_GUARD_SQL,
  verifyPr02P1InTxGuard,
  PR02_P2_GUARD_SQL,
  PR02_P2_ENABLE_SQL,
  PR02_P2_ATOMIC_GUARD_SQL,
  verifyPr02P2InTxGuard,
  PR02_P2_POSTCHECK_SELECT_SQL,
  evaluateExistingTa,
  validateTiposIvaEvidence,
  validateCondicionIvaReceptorEvidence,
  validatePr02P0Manifest,
  validatePr02P1ImportEvidence,
  verifyPr02P1Preflight,
  verifyPr02P1Postcheck,
  verifyPr02P2Postcheck,
  buildPr02CanonicalRevision4,
  createPr02ParametersExecutionPackage,
  createPr02ParametersCallTracker,
  assertNoProhibitedOperation,
  isArcaOperationPermitted,
  resolveCurrentGitHead,
  resolveCurrentGitRemoteHead,
} from './plan-pr02-parameters.mjs'

export const PR02_PARAMETERS_EXECUTION_TARGET = PR02_PARAMETERS_TARGET_PROJECT_REF
export const PR02_PARAMETERS_DB_HOST = 'aws-1-sa-east-1.pooler.supabase.com'
export const PR02_PARAMETERS_DB_PORT = 5432
export const PR02_PARAMETERS_DB_USER = 'postgres.acoyfwwmhaeruciyedri'
export const PR02_PARAMETERS_DB_NAME = 'postgres'

const sha256 = text => createHash('sha256').update(text).digest('hex')

/**
 * Resuelve la configuración estricta de TLS para PostgreSQL.
 * Exige rejectUnauthorized: true con certificado CA raíz válido.
 */
export function resolvePostgresSslConfig(options = {}) {
  if (options.ssl) {
    if (options.ssl.rejectUnauthorized === false) {
      throw new Error('PR02_PARAMETERS_TLS_INSECURE_REJECTED: rejectUnauthorized: false está estrictamente prohibido')
    }
    if (options.ssl.rejectUnauthorized === true && options.ssl.ca) {
      return Object.freeze({
        rejectUnauthorized: true,
        ca: options.ssl.ca,
      })
    }
  }

  const possiblePaths = [
    options.caCertPath,
    process.env.PGSSLROOTCERT,
    'C:/Users/jonat/Downloads/prod-ca-2021.crt',
    './prod-ca-2021.crt',
  ].filter(Boolean)

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const caContent = fs.readFileSync(p, 'utf8')
        if (caContent && caContent.includes('BEGIN CERTIFICATE')) {
          return Object.freeze({
            rejectUnauthorized: true,
            ca: caContent,
          })
        }
      }
    } catch {}
  }

  throw new Error('PR02_PARAMETERS_TLS_CA_REQUIRED: Certificado CA no encontrado o inválido para verificación estricta de TLS')
}

// --- XML / SOAP Helper Utilities ---

function findDescendants(node, localName) {
  const matches = []
  function walk(n) {
    if (n.nodeType === 1) {
      const name = n.localName || n.nodeName.split(':').pop()
      if (name === localName) matches.push(n)
    }
    for (let i = 0; i < (n.childNodes ? n.childNodes.length : 0); i++) {
      walk(n.childNodes.item(i))
    }
  }
  walk(node)
  return matches
}

function findOne(node, localName) {
  const all = findDescendants(node, localName)
  return all.length > 0 ? all[0] : null
}

function getChildText(element, localName) {
  const el = findOne(element, localName)
  return el ? (el.textContent || '').trim() : ''
}

export function checkSoapFault(doc, serviceName = 'ARCA') {
  const faults = findDescendants(doc, 'Fault')
  if (faults.length > 0) {
    const fault = faults[0]
    const code = getChildText(fault, 'faultcode') || 'UNKNOWN'
    const safeCode = /^[a-zA-Z0-9_.:-]{1,100}$/.test(code) ? code : 'UNKNOWN'
    throw new Error(`${serviceName}_FAULT:${safeCode}`)
  }
}

export function checkWsfeErrors(doc) {
  const errNodes = findDescendants(doc, 'Err')
  if (errNodes.length > 0) {
    const codes = errNodes
      .slice(0, 10)
      .map(err => getChildText(err, 'Code'))
      .filter(Boolean)
    const safeCodes =
      codes.length > 0 && codes.every(c => /^[0-9]{1,8}$/.test(c))
        ? codes.join(',')
        : 'UNKNOWN'
    throw new Error(`WSFE_BUSINESS:${safeCodes}`)
  }
}

// --- Request Builders & Response Parsers ---

export function buildWsaaLoginCmsSoapRequest(cmsBase64) {
  return `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><w:loginCms xmlns:w="http://wsaa.view.sua.dvadac.desein.afip.gov"><in0>${cmsBase64}</in0></w:loginCms></s:Body></s:Envelope>`
}

export function parseWsaaLoginCmsResponse(soapXml, now = new Date()) {
  const parser = new DOMParser({ onError: () => {} })
  const envelope = parser.parseFromString(soapXml, 'text/xml')
  checkSoapFault(envelope, 'WSAA')

  const returnNodes = findDescendants(envelope, 'loginCmsReturn')
  if (returnNodes.length !== 1) {
    throw new Error('WSAA_RETURN_MISSING')
  }
  const innerXml = returnNodes[0].textContent?.trim() || ''
  if (!innerXml) {
    throw new Error('WSAA_RETURN_EMPTY')
  }

  const ticketDoc = parser.parseFromString(innerXml, 'text/xml')
  const root = ticketDoc.documentElement
  if (!root || (root.localName || root.nodeName) !== 'loginTicketResponse') {
    throw new Error('TICKET_ROOT')
  }

  const token = getChildText(ticketDoc, 'token')
  const sign = getChildText(ticketDoc, 'sign')
  if (!token || !sign) {
    throw new Error('TICKET_CREDENTIALS')
  }

  const expirationText = getChildText(ticketDoc, 'expirationTime')
  const expirationMs = Date.parse(expirationText)
  const nowMs = typeof now === 'string' || typeof now === 'number' ? new Date(now).getTime() : now.getTime()
  if (!Number.isFinite(expirationMs) || expirationMs <= nowMs) {
    throw new Error('TICKET_EXPIRATION')
  }

  return {
    token,
    sign,
    expirationTime: new Date(expirationMs).toISOString(),
  }
}

export function buildWsfeTiposIvaRequest({ token, sign, cuit }) {
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><FEParamGetTiposIva xmlns="http://ar.gov.afip.dif.FEV1/"><Auth><Token>${token}</Token><Sign>${sign}</Sign><Cuit>${cuit}</Cuit></Auth></FEParamGetTiposIva></soap:Body></soap:Envelope>`
}

export function parseWsfeTiposIvaResponse(soapXml, consultedAt = new Date().toISOString()) {
  const parser = new DOMParser({ onError: () => {} })
  const envelope = parser.parseFromString(soapXml, 'text/xml')
  checkSoapFault(envelope, 'WSFE')
  checkWsfeErrors(envelope)

  const rows = findDescendants(envelope, 'IvaTipo')
  if (rows.length === 0 || rows.length > 100) {
    throw new Error('WSFE_PARAMETERS: IvaTipo vacio o excedido')
  }

  const parameters = []
  const seenIds = new Set()
  for (const row of rows) {
    const idText = getChildText(row, 'Id')
    const descText = getChildText(row, 'Desc')
    const fchDesde = getChildText(row, 'FchDesde')
    const fchHasta = getChildText(row, 'FchHasta')

    const id = Number(idText)
    if (!Number.isSafeInteger(id) || id < 1 || id > 99 || seenIds.has(id)) {
      throw new Error(`WSFE_PARAMETERS: Id invalido o duplicado: ${idText}`)
    }
    seenIds.add(id)

    if (!descText || descText.length > 120) {
      throw new Error(`WSFE_PARAMETERS: Descripcion invalida: ${descText}`)
    }

    for (const d of [fchDesde, fchHasta]) {
      if (d !== 'NULL' && d !== '' && !/^\d{8}$/.test(d)) {
        throw new Error(`WSFE_PARAMETERS: Fecha invalida: ${d}`)
      }
    }

    parameters.push({
      Id: id,
      Description: descText,
      VoucherClasses: '',
      ValidFrom: fchDesde,
      ValidUntil: fchHasta,
    })
  }

  const formatted = {
    version: 1,
    entorno: 'HOMOLOGACION',
    operacion: 'FEParamGetTiposIva',
    origen: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
    consultado_en: consultedAt,
    respuesta_sha256: sha256(soapXml),
    parametros: parameters,
    importado_en_staging: false,
    emision_habilitada: false,
  }

  return JSON.stringify(formatted, null, 2)
}

export function buildWsfeCondicionIvaReceptorRequest({ token, sign, cuit }) {
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><FEParamGetCondicionIvaReceptor xmlns="http://ar.gov.afip.dif.FEV1/"><Auth><Token>${token}</Token><Sign>${sign}</Sign><Cuit>${cuit}</Cuit></Auth></FEParamGetCondicionIvaReceptor></soap:Body></soap:Envelope>`
}

export function parseWsfeCondicionIvaReceptorResponse(soapXml, consultedAt = new Date().toISOString()) {
  const parser = new DOMParser({ onError: () => {} })
  const envelope = parser.parseFromString(soapXml, 'text/xml')
  checkSoapFault(envelope, 'WSFE')
  checkWsfeErrors(envelope)

  const rows = findDescendants(envelope, 'CondicionIvaReceptor')
  if (rows.length === 0 || rows.length > 100) {
    throw new Error('WSFE_PARAMETERS: CondicionIvaReceptor vacio o excedido')
  }

  const parameters = []
  const seenIds = new Set()
  for (const row of rows) {
    const idText = getChildText(row, 'Id')
    const descText = getChildText(row, 'Desc')
    const cmpClase = getChildText(row, 'Cmp_Clase')

    const id = Number(idText)
    if (!Number.isSafeInteger(id) || id < 1 || id > 99 || seenIds.has(id)) {
      throw new Error(`WSFE_PARAMETERS: Id invalido o duplicado: ${idText}`)
    }
    seenIds.add(id)

    if (!descText || descText.length > 120) {
      throw new Error(`WSFE_PARAMETERS: Descripcion invalida: ${descText}`)
    }

    if (!cmpClase || !/^[A-Z0-9/]{1,30}$/.test(cmpClase)) {
      throw new Error(`WSFE_PARAMETERS: Cmp_Clase invalida: ${cmpClase}`)
    }

    parameters.push({
      Id: id,
      Description: descText,
      VoucherClasses: cmpClase,
      ValidFrom: '',
      ValidUntil: '',
    })
  }

  const formatted = {
    version: 1,
    entorno: 'HOMOLOGACION',
    operacion: 'FEParamGetCondicionIvaReceptor',
    origen: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
    consultado_en: consultedAt,
    respuesta_sha256: sha256(soapXml),
    parametros: parameters,
    importado_en_staging: false,
    emision_habilitada: false,
  }

  return JSON.stringify(formatted, null, 2)
}

/**
 * Validador estricto de argumentos CLI para el ejecutor de parámetros PR02.
 */
export function validatePr02ParametersCliArgs(argv = process.argv.slice(2)) {
  const allowedFlags = new Set([
    '--authorized',
    '--dry-run',
    '--scope',
    '--project-ref',
    '--head',
    '--expected-head',
    '--expected-hash',
    '--iva-file',
    '--condition-file',
    '--manifest-file',
    '--ca-cert',
  ])
  const flagCounts = new Map()

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      if (!allowedFlags.has(arg)) {
        throw new Error(`INVALID_CLI_ARGUMENT: Argumento desconocido '${arg}'`)
      }
      flagCounts.set(arg, (flagCounts.get(arg) || 0) + 1)
      if (['--scope', '--project-ref', '--head', '--expected-head', '--expected-hash', '--iva-file', '--condition-file', '--manifest-file', '--ca-cert'].includes(arg)) {
        i++
        if (i >= argv.length || argv[i].startsWith('--')) {
          throw new Error(`MISSING_CLI_VALUE: El argumento '${arg}' requiere un valor`)
        }
      }
    } else {
      throw new Error(`UNEXPECTED_CLI_POSITIONAL: Argumento posicional inesperado '${arg}'`)
    }
  }

  for (const [flag, count] of flagCounts.entries()) {
    if (count > 1) {
      throw new Error(`DUPLICATE_CLI_ARGUMENT: Argumento duplicado '${flag}'`)
    }
  }

  const hasAuthorized = flagCounts.has('--authorized')
  const hasDryRun = flagCounts.has('--dry-run')

  if (hasAuthorized && hasDryRun) {
    throw new Error('CLI_ARGUMENT_CONFLICT: No se permite combinar --authorized con --dry-run')
  }

  const isAuthorized = hasAuthorized
  const isDryRun = hasDryRun || !isAuthorized

  const getArgValue = (flag) => {
    const idx = argv.indexOf(flag)
    return idx >= 0 ? argv[idx + 1] : null
  }

  const scope = getArgValue('--scope') || PR02_P1_SCOPE
  const projectRef = getArgValue('--project-ref') || PR02_PARAMETERS_TARGET_PROJECT_REF
  const head = getArgValue('--head')
  const expectedHead = getArgValue('--expected-head')
  const expectedHash = getArgValue('--expected-hash')
  const ivaFile = getArgValue('--iva-file')
  const conditionFile = getArgValue('--condition-file')
  const manifestFile = getArgValue('--manifest-file')
  const caCertPath = getArgValue('--ca-cert')

  if (!PR02_PARAMETERS_ALLOWED_SCOPES.includes(scope)) {
    throw new Error(`INVALID_SCOPE: Scope '${scope}' no permitido en refresco de parámetros PR02`)
  }

  if (isAuthorized) {
    if (projectRef !== PR02_PARAMETERS_TARGET_PROJECT_REF) {
      throw new Error(`INVALID_PROJECT_REF: Se requiere target ${PR02_PARAMETERS_TARGET_PROJECT_REF}, recibido '${projectRef}'`)
    }
    if (!head || !/^[0-9a-fA-F]{40}$/.test(head)) {
      throw new Error('MISSING_CLI_ARGUMENT: Se requiere --head <SHA>')
    }
    if (!expectedHead || !/^[0-9a-fA-F]{40}$/.test(expectedHead)) {
      throw new Error('MISSING_CLI_ARGUMENT: Se requiere --expected-head <SHA>')
    }
    if (head !== expectedHead) {
      throw new Error(`HEAD_MISMATCH: HEAD actual '${head}' difiere del esperado '${expectedHead}'`)
    }
    if (scope === PR02_P2_SCOPE && (!expectedHash || !/^[0-9a-f]{64}$/.test(expectedHash))) {
      throw new Error('MISSING_EXPECTED_HASH: Scope PR02_P2_CATALOG_ENABLE requiere --expected-hash <SHA256>')
    }
  }

  return Object.freeze({
    authorized: isAuthorized,
    dryRun: isDryRun,
    scope,
    projectRef,
    head,
    expectedHead,
    expectedHash,
    ivaFile,
    conditionFile,
    manifestFile,
    caCertPath,
  })
}

/**
 * Validador de seguridad de credenciales.
 */
export function assertNoForbiddenCredentials(password) {
  if (typeof password !== 'string') return
  const lower = password.toLowerCase().trim()
  if (
    lower.startsWith('eyj') ||
    lower.includes('service_role') ||
    lower.includes('sbp_') ||
    lower.startsWith('-----begin') ||
    lower.includes('bearer ') ||
    lower.includes('token')
  ) {
    throw new Error('FORBIDDEN_CREDENTIAL_TYPE: Se requiere únicamente contraseña directa de base de datos')
  }
}

/**
 * Ejecutor principal para PR02 parámetros (P1 y P2).
 */
export async function executePr02ParametersStaging(options = {}, deps = {}) {
  let cliArgs
  if (options.argv) {
    cliArgs = validatePr02ParametersCliArgs(options.argv)
  } else {
    // 1. Validar contradicción authorized / dryRun
    if (options.authorized === true && options.dryRun === true) {
      throw new Error('CLI_ARGUMENT_CONFLICT: No se permite combinar authorized con dryRun')
    }

    // 2. Si no está explícitamente autorizado y no es dryRun (e.g. { authorized: false, dryRun: false })
    if (options.authorized === false && options.dryRun === false) {
      throw new Error('UNAUTHORIZED_EXECUTION: authorized === true y dryRun === false son estrictamente requeridos para ejecución remota')
    }

    const isAuthorized = options.authorized === true
    const isDryRun = options.dryRun === true || (!isAuthorized && options.dryRun !== false)

    if (!isAuthorized && !isDryRun) {
      throw new Error('UNAUTHORIZED_EXECUTION: authorized === true y dryRun === false son estrictamente requeridos para ejecución remota')
    }

    const scope = options.scope || (isAuthorized ? null : PR02_P1_SCOPE)
    if (!scope || !PR02_PARAMETERS_ALLOWED_SCOPES.includes(scope)) {
      throw new Error(`INVALID_SCOPE: Scope '${options.scope}' no permitido en refresco de parámetros PR02`)
    }

    const projectRef = options.projectRef || PR02_PARAMETERS_TARGET_PROJECT_REF

    if (isAuthorized) {
      if (projectRef !== PR02_PARAMETERS_TARGET_PROJECT_REF) {
        throw new Error(`INVALID_PROJECT_REF: Se requiere target ${PR02_PARAMETERS_TARGET_PROJECT_REF}, recibido '${projectRef}'`)
      }
      if (!options.head || typeof options.head !== 'string' || !/^[0-9a-fA-F]{40}$/.test(options.head)) {
        throw new Error('MISSING_CLI_ARGUMENT: head <SHA> requerido')
      }
      if (!options.expectedHead || typeof options.expectedHead !== 'string' || !/^[0-9a-fA-F]{40}$/.test(options.expectedHead)) {
        throw new Error('MISSING_CLI_ARGUMENT: expectedHead <SHA> requerido')
      }
      if (options.head !== options.expectedHead) {
        throw new Error(`HEAD_MISMATCH: '${options.head}' !== '${options.expectedHead}'`)
      }
      if (scope === PR02_P2_SCOPE && (!options.expectedHash || !/^[0-9a-f]{64}$/.test(options.expectedHash))) {
        throw new Error('MISSING_EXPECTED_HASH: expectedHash requerido para P2')
      }
    }

    cliArgs = {
      authorized: isAuthorized,
      dryRun: isDryRun,
      scope,
      projectRef,
      head: options.head || null,
      expectedHead: options.expectedHead || null,
      expectedHash: options.expectedHash || null,
      ivaFile: options.ivaFile || null,
      conditionFile: options.conditionFile || null,
      manifestFile: options.manifestFile || null,
      caCertPath: options.caCertPath || null,
    }
  }

  const isAuthorized = cliArgs.authorized === true
  const isDryRun = cliArgs.dryRun === true
  const scope = cliArgs.scope

  // Dry-run por defecto: retorna inmediatamente sin tocar deps.client ni credentials
  if (isDryRun) {
    return Object.freeze({
      execution: 'DRY_RUN',
      scope,
      projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
      PR02_PARAMETERS_LOCAL_PREPARATION: 'PASS',
      PR02_P0_REMOTE_EXECUTION_READY: false,
      PR02_P1_REMOTE_EXECUTION_READY: false,
      PR02_P2_REMOTE_EXECUTION_READY: false,
      PR02_P1_OFFICIAL_EVIDENCE_VERIFIED: 'NOT_AVAILABLE',
      PR02_PARAMETERS_REMOTE_EXECUTION_READY: false,
      PR02_PARAMETERS_REMOTE_EXECUTED: false,
      PR02_READY_FOR_EMISSION_GO: false,
      DRY_RUN_REMOTE_CHECKS: 'NOT_RUN',
      PREFLIGHT_REMOTE_VERIFICATION: 'NOT_RUN',
      CATALOG_INSERTION_VERIFICATION: 'NOT_RUN',
      CATALOG_ENABLE_VERIFICATION: 'NOT_RUN',
      POSTCHECK_REMOTE_VERIFICATION: 'NOT_RUN',
      PR02_P1_READ_ONLY_GUARD: 'NOT_RUN',
      PR02_P1_POSTCHECK_GUARD: 'NOT_RUN',
      PR02_P2_GUARD: 'NOT_RUN',
      PR02_P2_POSTCHECK_GUARD: 'NOT_RUN',
      REVISION_3_PRESERVED: true,
      REVISION_4_INSERT_ONLY: true,
      REVISION_4_HABILITADO: false,
      REAL_PV2_ENABLED: false,
      REAL_PV2_SERIES_TOUCHED: false,
      HISTORICAL_042_IDENTIFICATION: 'UNRESOLVED',
      HISTORICAL_042_REEMISSION_FORBIDDEN: true,
      ARCA_CALLS_NEW: 0,
      STAGING_WRITES_NEW: 0,
      PRODUCTION_MUTATIONS: 0,
      UNAUTHORIZED_CONNECTION_ATTEMPTS: 0,
    })
  }

  // Ejecución autorizada: resolver CA y contraseña
  const caCertPath = cliArgs.caCertPath || options.caCertPath || process.env.PG_CA_CERT || 'C:\\Users\\jonat\\Downloads\\prod-ca-2021.crt'
  let caCert
  try {
    caCert = deps.caCert || fs.readFileSync(caCertPath, 'utf8')
  } catch (err) {
    throw new Error(`TLS_CA_CERT_INVALID: No se pudo leer CA en '${caCertPath}': ${err.message}`)
  }

  const password = options.password || process.env.PGPASSWORD
  if (!password && !deps.client) {
    throw new Error('CREDENTIALS_MISSING: Se requiere contraseña de PostgreSQL')
  }
  if (password) assertNoForbiddenCredentials(password)

  const ClientConstructor = deps.Client || pg.Client
  const client =
    deps.client ||
    new ClientConstructor({
      host: PR02_PARAMETERS_DB_HOST,
      port: PR02_PARAMETERS_DB_PORT,
      user: PR02_PARAMETERS_DB_USER,
      database: PR02_PARAMETERS_DB_NAME,
      password,
      ssl: {
        rejectUnauthorized: true,
        ca: caCert,
      },
      statement_timeout: 10000,
    })

  let clientConnected = false
  let executionError = null
  let closeError = null
  let resultReport = null
  let executionOutcome = PR02_EXECUTION_OUTCOMES.NOT_STARTED

  try {
    await client.connect()
    clientConnected = true

    if (scope === PR02_P1_SCOPE || scope === PR02_P1_LEGACY_SCOPE) {
      // --- GATE PR02-P1: Importación Verificada de Catálogo (Insert-Only, Deshabilitado) ---
      // 1. Preflight READ ONLY
      let preflightVerified
      try {
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;')
        let preflightRaw
        try {
          const pfRes = await client.query(PR02_P1_PREFLIGHT_SELECT_SQL, [
            PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
            PR02_PARAMETERS_EXPECTED_ISSUER_PV,
          ])
          preflightRaw = pfRes.rows[0]?.preflight
        } finally {
          await client.query('ROLLBACK;')
        }
        preflightVerified = verifyPr02P1Preflight(preflightRaw)
      } catch (pfErr) {
        executionOutcome = PR02_EXECUTION_OUTCOMES.PREFLIGHT_FAILED_NO_WRITE
        throw pfErr
      }

      // 2. Resolver o validar evidencias de WSFE
      let ivaText = options.ivaText
      let conditionText = options.conditionText

      if (!ivaText && cliArgs.ivaFile) {
        ivaText = fs.readFileSync(cliArgs.ivaFile, 'utf8')
      }
      if (!conditionText && cliArgs.conditionFile) {
        conditionText = fs.readFileSync(cliArgs.conditionFile, 'utf8')
      }

      if (!ivaText || !conditionText) {
        executionOutcome = PR02_EXECUTION_OUTCOMES.PREFLIGHT_FAILED_NO_WRITE
        throw new Error('WSFE_EVIDENCE_REQUIRED: Se requieren archivos de evidencia oficial TiposIva y CondicionIvaReceptor para P1')
      }

      // Validación de evidencia con manifiesto P0
      let manifest = options.manifest
      if (!manifest && cliArgs.manifestFile) {
        try {
          manifest = JSON.parse(fs.readFileSync(cliArgs.manifestFile, 'utf8'))
        } catch {
          executionOutcome = PR02_EXECUTION_OUTCOMES.PREFLIGHT_FAILED_NO_WRITE
          throw new Error('P0_MANIFEST_FILE_INVALID: Archivo de manifiesto P0 no es un JSON válido')
        }
      }

      let officialEvidenceVerified = 'NOT_AVAILABLE'
      if (!manifest) {
        if (!options.allowUnaccreditedForTest || !deps.client) {
          executionOutcome = PR02_EXECUTION_OUTCOMES.PREFLIGHT_FAILED_NO_WRITE
          throw new Error('OFFICIAL_EVIDENCE_NOT_ACCREDITED: Se requiere manifiesto oficial P0 para importar evidencia en P1')
        }
      } else {
        validatePr02P1ImportEvidence({
          manifest,
          ivaText,
          conditionText,
          now: options.now,
          expectedHashes: options.expectedHashes,
          expectedHead: cliArgs?.expectedHead || options.expectedHead,
        })
        officialEvidenceVerified = 'PASS'
      }

      // Obtener baseline actual de la base de datos para garantizar continuidad exacta
      const baselineQueryRes = await client.query(
        `SELECT revision, condiciones, alicuotas, fuente_sha256, consultado_en, vence_en, habilitado
         FROM public.fiscal_parametros_homologacion
         ORDER BY revision;`
      )
      const baselineRows = baselineQueryRes.rows
      const baselineText = JSON.stringify(baselineRows)

      // 3. Construir propuesta canónica de Revisión 4
      const canonicalRev4 = buildPr02CanonicalRevision4({
        ivaText,
        conditionText,
        baselineText,
        now: options.now || (manifest ? manifest.consultado_en : new Date().toISOString()),
        expiresAt: options.expiresAt,
      })

      // 4. Inserción transaccional atómica con bloqueos (BLOQUEO 3)
      await client.query('BEGIN;')
      let insertedRow
      try {
        await client.query('LOCK TABLE public.fiscal_parametros_homologacion IN SHARE ROW EXCLUSIVE MODE;')
        await client.query('LOCK TABLE public.fiscal_emisores_homologacion IN SHARE ROW EXCLUSIVE MODE;')

        const guardRes = await client.query(PR02_P1_ATOMIC_GUARD_SQL, [
          PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
          PR02_PARAMETERS_EXPECTED_ISSUER_PV,
          PR02_CATALOG_REV3_HASH,
          canonicalRev4.fuente_sha256,
          canonicalRev4.consultado_en,
          canonicalRev4.vence_en,
        ])
        verifyPr02P1InTxGuard(guardRes.rows[0]?.in_tx_guard)

        const insertRes = await client.query(
          `INSERT INTO public.fiscal_parametros_homologacion(
             revision, condiciones, alicuotas, fuente_sha256, consultado_en, vence_en, habilitado
           ) VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, false)
           RETURNING revision, habilitado, fuente_sha256;`,
          [
            canonicalRev4.revision,
            JSON.stringify(canonicalRev4.condiciones),
            JSON.stringify(canonicalRev4.alicuotas),
            canonicalRev4.fuente_sha256,
            canonicalRev4.consultado_en,
            canonicalRev4.vence_en,
          ]
        )

        if (insertRes.rowCount !== 1) {
          throw new Error(`PR02_P1_INSERT_FAILED: Se esperaba insertar 1 fila, afectadas ${insertRes.rowCount}`)
        }
        insertedRow = insertRes.rows[0]
        if (insertedRow.revision !== 4 || insertedRow.habilitado !== false || insertedRow.fuente_sha256 !== canonicalRev4.fuente_sha256) {
          throw new Error('PR02_P1_INSERT_VERIFICATION_FAILED: Fila retornada de inserción no coincide con propuesta')
        }
      } catch (txErr) {
        try {
          await client.query('ROLLBACK;')
          executionOutcome = PR02_EXECUTION_OUTCOMES.TRANSACTION_ROLLED_BACK_CONFIRMED
        } catch {
          executionOutcome = PR02_EXECUTION_OUTCOMES.ROLLBACK_OUTCOME_UNKNOWN
        }
        throw txErr
      }

      // 5. Confirmar transacción (COMMIT)
      try {
        await client.query('COMMIT;')
        executionOutcome = PR02_EXECUTION_OUTCOMES.WRITE_COMMITTED
      } catch (commitErr) {
        executionOutcome = PR02_EXECUTION_OUTCOMES.COMMIT_OUTCOME_UNKNOWN
        throw new Error(`PR02_COMMIT_OUTCOME_UNKNOWN: Falló confirmación de COMMIT ('${commitErr.message}'). Reintento automático estrictamente prohibido.`)
      }

      // 6. Postcheck READ ONLY
      let postcheckVerified
      try {
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;')
        let postcheckRaw
        try {
          const postRes = await client.query(PR02_P1_POSTCHECK_SELECT_SQL, [
            PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
            PR02_PARAMETERS_EXPECTED_ISSUER_PV,
          ])
          postcheckRaw = postRes.rows[0]?.postcheck
        } finally {
          await client.query('ROLLBACK;')
        }

        postcheckVerified = verifyPr02P1Postcheck(postcheckRaw, {
          fuenteSha256: canonicalRev4.fuente_sha256,
          rev3FuenteSha256: PR02_CATALOG_REV3_HASH,
        })
      } catch (postcheckErr) {
        executionOutcome = PR02_EXECUTION_OUTCOMES.WRITE_COMMITTED_POSTCHECK_FAILED
        throw postcheckErr
      }

      resultReport = Object.freeze({
        execution: 'AUTHORIZED_EXECUTION',
        scope: PR02_P1_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        PR02_P1_EXECUTION: 'PASS',
        PR02_P1_IMPORT_ONLY: true,
        PR02_P1_OFFICIAL_EVIDENCE_VERIFIED: officialEvidenceVerified,
        PR02_P1_AUTHORIZATION_GUARD: 'PASS',
        PR02_P1_ATOMIC_GUARDS: 'PASS',
        PR02_P1_COMMIT_OUTCOME_GUARD: 'PASS',
        PR02_P1_REMOTE_EXECUTION_READY: false,
        PR02_P1_REMOTE_EXECUTED: true,
        PR02_READY_FOR_EMISSION_GO: false,
        PR02_P1_PREFLIGHT_GUARD: preflightVerified.status,
        PR02_P1_POSTCHECK_GUARD: postcheckVerified.status,
        REV3_BASELINE_MATCH_BEFORE_COMMIT: 'PASS',
        REV4_INSERT_ONLY: 'PASS',
        UNCERTAIN_WRITE_RETRY_FORBIDDEN: true,
        REVISION_3_PRESERVED: true,
        REVISION_4_INSERT_ONLY: true,
        REVISION_4_HABILITADO: false,
        REVISION_4_HASH: canonicalRev4.fuente_sha256,
        REVISION_4_VENCE_EN: canonicalRev4.vence_en,
        REAL_PV2_ENABLED: false,
        REAL_PV2_SERIES_TOUCHED: false,
        HISTORICAL_042_IDENTIFICATION: 'UNRESOLVED',
        HISTORICAL_042_REEMISSION_FORBIDDEN: true,
        ARCA_CALLS_NEW: 0,
        STAGING_WRITES_NEW: 1, // Sólo INSERT de revisión 4 deshabilitada
        PRODUCTION_MUTATIONS: 0,
        EXECUTION_OUTCOME: executionOutcome,
      })
    } else if (scope === PR02_P2_SCOPE) {
      // --- GATE PR02-P2: Habilitación Controlada y Atómica de Catálogo Revisión 4 (BLOQUEO 4) ---
      const expectedHash = cliArgs.expectedHash || options.expectedHash
      if (!expectedHash || !/^[0-9a-f]{64}$/.test(expectedHash)) {
        throw new Error('PR02_P2_HASH_REQUIRED: Se requiere expectedHash de 64 caracteres hexadecimales')
      }

      await client.query('BEGIN;')
      let updatedRow
      try {
        await client.query('LOCK TABLE public.fiscal_parametros_homologacion IN SHARE ROW EXCLUSIVE MODE;')
        await client.query('LOCK TABLE public.fiscal_emisores_homologacion IN SHARE ROW EXCLUSIVE MODE;')

        const guardRes = await client.query(PR02_P2_ATOMIC_GUARD_SQL, [
          expectedHash,
          PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
          PR02_PARAMETERS_EXPECTED_ISSUER_PV,
          PR02_CATALOG_REV3_HASH,
        ])
        verifyPr02P2InTxGuard(guardRes.rows[0]?.p2_in_tx_guard)

        const updateRes = await client.query(
          `UPDATE public.fiscal_parametros_homologacion
           SET habilitado = true
           WHERE revision = 4 AND habilitado = false AND fuente_sha256 = $1 AND vence_en > clock_timestamp()
           RETURNING revision, habilitado, fuente_sha256;`,
          [expectedHash]
        )
        if (updateRes.rowCount !== 1) {
          throw new Error(`PR02_P2_UPDATE_FAILED: Se esperaba actualizar 1 fila, afectadas ${updateRes.rowCount}`)
        }
        updatedRow = updateRes.rows[0]
        if (updatedRow.revision !== 4 || updatedRow.habilitado !== true || updatedRow.fuente_sha256 !== expectedHash) {
          throw new Error('PR02_P2_UPDATE_VERIFICATION_FAILED: Fila actualizada no coincide')
        }
      } catch (txErr) {
        try {
          await client.query('ROLLBACK;')
          executionOutcome = PR02_EXECUTION_OUTCOMES.TRANSACTION_ROLLED_BACK_CONFIRMED
        } catch {
          executionOutcome = PR02_EXECUTION_OUTCOMES.ROLLBACK_OUTCOME_UNKNOWN
        }
        throw txErr
      }

      // Confirmar COMMIT
      try {
        await client.query('COMMIT;')
        executionOutcome = PR02_EXECUTION_OUTCOMES.WRITE_COMMITTED
      } catch (commitErr) {
        executionOutcome = PR02_EXECUTION_OUTCOMES.COMMIT_OUTCOME_UNKNOWN
        throw new Error(`PR02_COMMIT_OUTCOME_UNKNOWN: Falló confirmación de COMMIT ('${commitErr.message}'). Reintento automático estrictamente prohibido.`)
      }

      // Postcheck READ ONLY
      let postcheckVerified
      try {
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;')
        let postcheckRaw
        try {
          const postRes = await client.query(PR02_P2_POSTCHECK_SELECT_SQL, [
            PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
            PR02_PARAMETERS_EXPECTED_ISSUER_PV,
          ])
          postcheckRaw = postRes.rows[0]?.postcheck_p2
        } finally {
          await client.query('ROLLBACK;')
        }

        postcheckVerified = verifyPr02P2Postcheck(postcheckRaw, {
          fuenteSha256: expectedHash,
          rev3FuenteSha256: PR02_CATALOG_REV3_HASH,
        })
      } catch (postcheckErr) {
        executionOutcome = PR02_EXECUTION_OUTCOMES.WRITE_COMMITTED_POSTCHECK_FAILED
        throw postcheckErr
      }

      resultReport = Object.freeze({
        execution: 'AUTHORIZED_EXECUTION',
        scope: PR02_P2_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        PR02_P2_EXECUTION: 'PASS',
        PR02_P2_ATOMIC_GUARDS: 'PASS',
        PR02_P2_REV3_BASELINE_GUARD: 'PASS',
        PR02_P2_REMOTE_EXECUTION_READY: false,
        PR02_P2_REMOTE_EXECUTED: true,
        PR02_READY_FOR_EMISSION_GO: false,
        PR02_P2_GUARD: 'PASS',
        PR02_P2_POSTCHECK_GUARD: postcheckVerified.status,
        UNCERTAIN_WRITE_RETRY_FORBIDDEN: true,
        REVISION_3_PRESERVED: true,
        REVISION_4_HABILITADO: true,
        REVISION_4_HASH: expectedHash,
        REAL_PV2_ENABLED: false,
        REAL_PV2_SERIES_TOUCHED: false,
        HISTORICAL_042_IDENTIFICATION: 'UNRESOLVED',
        HISTORICAL_042_REEMISSION_FORBIDDEN: true,
        ARCA_CALLS_NEW: 0,
        STAGING_WRITES_NEW: 1, // Sólo UPDATE habilitado: false -> true
        PRODUCTION_MUTATIONS: 0,
        EXECUTION_OUTCOME: executionOutcome,
      })
    }
  } catch (err) {
    executionError = err
    if (executionError && typeof executionError === 'object') {
      executionError.executionOutcome = executionOutcome
    }
  } finally {
    if (clientConnected || deps.client) {
      try {
        await client.end()
      } catch (err) {
        closeError = err
        if (executionOutcome === PR02_EXECUTION_OUTCOMES.WRITE_COMMITTED) {
          executionOutcome = PR02_EXECUTION_OUTCOMES.CONNECTION_CLOSE_FAILED_AFTER_COMMIT
        }
      }
    }
  }

  if (closeError) {
    if (executionError) {
      const combined = new Error(`PR02_PARAMETERS_FAILED: Ejecución falló ('${executionError.message}') y cierre PostgreSQL falló ('${closeError.message}') [outcome: ${executionOutcome}]`)
      combined.executionOutcome = executionOutcome
      throw combined
    }
    const err = new Error(`PR02_PARAMETERS_CLOSE_FAILED: ${closeError.message} [outcome: ${executionOutcome}]`)
    err.executionOutcome = executionOutcome
    throw err
  }

  if (executionError) {
    executionError.executionOutcome = executionOutcome
    throw executionError
  }

  return resultReport
}

if (process.argv[1] && process.argv[1].endsWith('execute-pr02-parameters-staging.mjs')) {
  executePr02ParametersStaging({ argv: process.argv.slice(2) })
    .then((res) => {
      console.log(JSON.stringify(res, null, 2))
      process.exit(0)
    })
    .catch((err) => {
      console.error(`PR02_PARAMETERS_FATAL_ERROR=${err.message}`)
      process.exit(1)
    })
}
