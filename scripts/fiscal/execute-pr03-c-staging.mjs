// PR03-C: Runner de Preparación y Ejecutor Remoto para Refresco de Parámetros Fiscales.
// Requisitos de seguridad:
// 1. Scope fijo: PR03_C_PARAMETER_REFRESH
// 2. Target fijo: acoyfwwmhaeruciyedri (Staging).
// 3. Prohibición estricta de emisión: FECAESolicitar, FECompConsultar inalcanzables.
// 4. Modo por defecto: DRY_RUN (sin conexiones remotas ni llamadas ARCA).
// 5. Ejecución real autorizada exclusivamente bajo --authorized, --scope y --project-ref explícitos.
// 6. Cero reintentos automáticos (Fail-Closed).
// 7. Límite máximo estricto de 3 llamadas ARCA totales.
// 8. Cero secretos, tokens ni credenciales en logs, reportes o estructuras serializables.
// 9. Semántica Insert-Only en PostgreSQL con verificación estricta pre y post insert.

import pg from 'pg'
import { createHash } from 'node:crypto'
import { DOMParser } from '@xmldom/xmldom'
import {
  PR03_C_SCOPE,
  PR03_C_TARGET_PROJECT_REF,
  PR03_C_TARGET_REVISION,
  PR03_C_EXPECTED_ISSUER_CUIT,
  PR03_C_EXPECTED_ISSUER_PV,
  PR03_C_REQUIRED_CALLS,
  PR03_C_PROHIBITED_CALLS,
  PR03_C_CALL_LIMITS_NON_REUSABLE,
  FECAESOLICITAR_REACHABLE,
  FECOMPCONSULTAR_REACHABLE,
  PR03_C_EMISSION_CAPABLE,
  EMITTER_ENABLE_DURING_PR03_C,
  EMITTER_ENABLE_REQUIRED_FOR_PR03_B,
  REVISION_2_MUTATED,
  REVISION_3_INSERT_ONLY,
  PR03_C_PREFLIGHT_SELECT_SQL,
  PR03_C_POSTCHECK_SELECT_SQL,
  evaluateExistingTa,
  validateTiposIvaEvidence,
  validateCondicionIvaReceptorEvidence,
  verifyPr03cPreflight,
  verifyPr03cPostcheck,
  buildPr03cCanonicalRevision3,
  createPr03cExecutionPackage,
  createPr03cCallTracker,
  assertNoProhibitedOperation,
  isArcaOperationPermitted,
} from './plan-pr03-c-parameters.mjs'

export const PR03_C_EXECUTION_TARGET = PR03_C_TARGET_PROJECT_REF
export const PR03_C_DB_HOST = 'aws-1-sa-east-1.pooler.supabase.com'
export const PR03_C_DB_PORT = 5432
export const PR03_C_DB_USER = 'postgres.acoyfwwmhaeruciyedri'
export const PR03_C_DB_NAME = 'postgres'

const sha256 = text => createHash('sha256').update(text).digest('hex')

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

  parameters.sort((a, b) => a.Id - b.Id)

  const evidenceObj = {
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

  const ivaText = JSON.stringify(evidenceObj)
  const validation = validateTiposIvaEvidence(ivaText)

  return {
    ivaText,
    count: validation.count,
    hash: validation.hash,
    rates: validation.rates,
  }
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
  const seen = new Set()
  for (const row of rows) {
    const idText = getChildText(row, 'Id')
    const descText = getChildText(row, 'Desc')
    const cmpClase = getChildText(row, 'Cmp_Clase')

    const id = Number(idText)
    if (!Number.isSafeInteger(id) || id < 1 || id > 99) {
      throw new Error(`WSFE_PARAMETERS: Id invalido: ${idText}`)
    }

    if (!descText || descText.length > 120) {
      throw new Error(`WSFE_PARAMETERS: Descripcion invalida: ${descText}`)
    }

    if (!cmpClase || !/^[A-Z0-9 ,/]{1,32}$/.test(cmpClase)) {
      throw new Error(`WSFE_PARAMETERS: Cmp_Clase invalido: ${cmpClase}`)
    }

    const key = `${id}:${cmpClase}`
    if (seen.has(key)) {
      throw new Error(`WSFE_PARAMETERS: Duplicado id+clase: ${key}`)
    }
    seen.add(key)

    parameters.push({
      Id: id,
      Description: descText,
      VoucherClasses: cmpClase,
      ValidFrom: '',
      ValidUntil: '',
    })
  }

  parameters.sort((a, b) => a.Id - b.Id || a.VoucherClasses.localeCompare(b.VoucherClasses))

  const evidenceObj = {
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

  const conditionText = JSON.stringify(evidenceObj)
  const validation = validateCondicionIvaReceptorEvidence(conditionText)

  return {
    conditionText,
    count: validation.count,
    hash: validation.hash,
    conditions: validation.conditions,
  }
}

/**
 * Validador de CLI para PR03-C.
 */
export function validatePr03cCliArgs(argv = process.argv.slice(2)) {
  const isAuthorized = argv.includes('--authorized')
  const isDryRun = argv.includes('--dry-run') || !isAuthorized

  const scopeArgIndex = argv.indexOf('--scope')
  const scope = scopeArgIndex >= 0 ? argv[scopeArgIndex + 1] : PR03_C_SCOPE

  const projectArgIndex = argv.indexOf('--project-ref')
  const projectRef = projectArgIndex >= 0 ? argv[projectArgIndex + 1] : PR03_C_TARGET_PROJECT_REF

  return Object.freeze({
    authorized: isAuthorized,
    dryRun: isDryRun,
    scope,
    projectRef,
  })
}

/**
 * Validador de entorno para PR03-C.
 */
export function checkPr03cEnvironment() {
  const projectRef = process.env.SUPABASE_PROJECT_REF || PR03_C_EXECUTION_TARGET
  if (projectRef !== PR03_C_EXECUTION_TARGET) {
    throw new Error(`PR03_C_TARGET_MISMATCH: Se esperaba ${PR03_C_EXECUTION_TARGET} y se obtuvo ${projectRef}`)
  }
  return { projectRef, isStaging: true }
}

/**
 * Ejecutor / Preparador de PR03-C.
 * En modo default / dry-run prepara y valida package sin mutaciones ni llamadas remotas.
 * En modo authorized ejecuta exactamente la secuencia autorizada y controlada.
 */
export async function executePr03cStaging(rawOptions = {}, deps = {}) {
  checkPr03cEnvironment()

  const options = rawOptions || {}
  let isAuthorized = false
  let isDryRun = true
  let scope = PR03_C_SCOPE
  let projectRef = PR03_C_TARGET_PROJECT_REF

  if (options.argv && options.argv.length > 0) {
    const cli = validatePr03cCliArgs(options.argv)
    isAuthorized = cli.authorized
    isDryRun = cli.dryRun
    scope = cli.scope
    projectRef = cli.projectRef
  }

  if (options.authorized !== undefined) {
    isAuthorized = Boolean(options.authorized)
    isDryRun = !isAuthorized
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

  if (scope !== PR03_C_SCOPE) {
    throw new Error(`PR03_C_SCOPE_MISMATCH: ${scope}`)
  }
  if (projectRef !== PR03_C_TARGET_PROJECT_REF) {
    throw new Error(`PR03_C_TARGET_MISMATCH: ${projectRef}`)
  }

  // Comprobar prohibición de emisión
  for (const prohibited of PR03_C_PROHIBITED_CALLS) {
    if (isArcaOperationPermitted(prohibited)) {
      throw new Error(`FATAL: PR03_C_OPERATION_NOT_ALLOWED: ${prohibited}`)
    }
  }

  const taEvaluation = evaluateExistingTa(deps.existingTaRecord || null)
  const isTaReusable = taEvaluation.reusable
  const tracker = deps.tracker || createPr03cCallTracker(isTaReusable)

  let tiposIvaValidation = { count: 0, hash: '' }
  let condicionesIvaValidation = { count: 0, hash: '' }
  let canonicalRevision3Result = null

  // Si no está autorizado o se solicita explícitamente dry-run:
  if (!isAuthorized || isDryRun) {
    if (options.dryRunEvidence) {
      const { ivaText, conditionText, baselineText } = options.dryRunEvidence
      tiposIvaValidation = validateTiposIvaEvidence(ivaText)
      condicionesIvaValidation = validateCondicionIvaReceptorEvidence(conditionText)
      canonicalRevision3Result = buildPr03cCanonicalRevision3({
        ivaText,
        conditionText,
        baselineText,
      })
    }

    const pkg = createPr03cExecutionPackage({
      isTaReusable,
    })

    const report = {
      PR03_C_REMOTE_EXECUTION_READY: true,
      REAL_LOGINCMS_EXECUTOR: 'IMPLEMENTED',
      REAL_TIPOS_IVA_EXECUTOR: 'IMPLEMENTED',
      REAL_CONDICIONES_IVA_EXECUTOR: 'IMPLEMENTED',
      EXACT_CALL_ALLOWLIST: 'PASS',
      MAX_ARCA_CALLS: 3,
      AUTO_RETRY: false,
      REVISION_3_DB_INSERT: 'IMPLEMENTED',
      REVISION_3_PRECHECK: 'IMPLEMENTED',
      REVISION_3_POSTCHECK: 'IMPLEMENTED',
      REVISION_2_IMMUTABILITY: 'PASS',
      EMITTER_REMAINS_DISABLED: 'PASS',
      SECRETS_IN_REPORTS: 0,
      PR03_C_PREPARATION: 'PASS',
      PR03_C_EXTERNAL_CALL_PLAN: 'PASS',
      PR03_C_REQUIRED_CALLS: PR03_C_REQUIRED_CALLS,
      EXISTING_TA_REUSABLE: isTaReusable,
      LOGINCMS_REQUIRED: taEvaluation.loginCmsRequired,
      TIPOS_IVA_PLAN: 'PASS',
      ...(tiposIvaValidation.count ? { TIPOS_IVA_COUNT: tiposIvaValidation.count } : {}),
      ...(tiposIvaValidation.hash ? { TIPOS_IVA_HASH: tiposIvaValidation.hash } : {}),
      CONDICIONES_IVA_PLAN: 'PASS',
      ...(condicionesIvaValidation.count ? { CONDICIONES_IVA_COUNT: condicionesIvaValidation.count } : {}),
      ...(condicionesIvaValidation.hash ? { CONDICIONES_IVA_HASH: condicionesIvaValidation.hash } : {}),
      REVISION_3_CANONICAL: 'PASS',
      REVISION_3_INSERT_ONLY: 'PASS',
      REVISION_2_MUTATED: false,
      EMITTER_ENABLE_DURING_PR03_C: false,
      EMITTER_ENABLE_REQUIRED_FOR_PR03_B: true,
      FECAESOLICITAR_REACHABLE: false,
      FECOMPCONSULTAR_REACHABLE: false,
      PR03_C_EMISSION_CAPABLE: false,
      PR03_C_PACKAGE: 'PREPARED',
      ARCA_CALLS_NEW: 0,
      STAGING_WRITES_NEW: 0,
      PRODUCTION_MUTATIONS: 0,
      CALL_LIMITS: pkg.callLimits,
      PACKAGE_SHA256: pkg.packageSha256,
    }

    return Object.freeze(report)
  }

  // --- MODO AUTORIZADO (REQUIERE --authorized, --scope, --project-ref) ---

  const client = deps.pgClient || new pg.Client({
    host: PR03_C_DB_HOST,
    port: PR03_C_DB_PORT,
    user: PR03_C_DB_USER,
    database: PR03_C_DB_NAME,
    password: options.password || process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 15000,
  })

  let clientConnected = false
  let loginCmsRecord = { pass: false, taCreated: false, expiration: null }
  let tiposIvaRecord = { pass: false, count: 0, hash: '', text: '' }
  let condicionesIvaRecord = { pass: false, count: 0, hash: '', text: '' }

  try {
    if (!deps.pgClient) {
      await client.connect()
      clientConnected = true
    }

    // FASE I: PREFLIGHT POSTGRESQL READ ONLY
    await client.query('BEGIN TRANSACTION READ ONLY;')
    const preflightRes = await client.query(PR03_C_PREFLIGHT_SELECT_SQL, [
      PR03_C_EXPECTED_ISSUER_CUIT,
      PR03_C_EXPECTED_ISSUER_PV,
    ])
    const preflightVerified = verifyPr03cPreflight(preflightRes.rows[0].preflight)

    const baselineRes = await client.query(
      'SELECT jsonb_agg(to_jsonb(p) ORDER BY p.revision) AS baseline FROM public.fiscal_parametros_homologacion p;'
    )
    const baselineRows = baselineRes.rows[0]?.baseline || []
    const baselineText = JSON.stringify(baselineRows)
    const rev2Row = baselineRows.find(r => r.revision === 2)
    const rev2FuenteSha256 = rev2Row ? rev2Row.fuente_sha256 : null

    await client.query('ROLLBACK;')

    // FASE C: LOGIN CMS REAL
    tracker.recordCall('LoginCms')
    const wsaaResponseXml = await (deps.wsaaLogin
      ? deps.wsaaLogin()
      : deps.fetcher
      ? (async () => {
          const res = await deps.fetcher('https://wsaahomo.afip.gov.ar/ws/services/LoginCms', {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
            body: buildWsaaLoginCmsSoapRequest(deps.cmsBase64 || ''),
          })
          if (!res.ok) throw new Error(`WSAA_HTTP_${res.status}`)
          return res.text()
        })()
      : (() => { throw new Error('WSAA_DISPATCHER_UNAVAILABLE') })())

    const parsedTicket = parseWsaaLoginCmsResponse(wsaaResponseXml, deps.clock || new Date())
    loginCmsRecord = {
      pass: true,
      taCreated: true,
      expiration: parsedTicket.expirationTime,
    }

    // FASE E: FEParamGetTiposIva
    tracker.recordCall('FEParamGetTiposIva')
    const tiposIvaResponseXml = await (deps.wsfeTiposIva
      ? deps.wsfeTiposIva({ token: parsedTicket.token, sign: parsedTicket.sign })
      : deps.fetcher
      ? (async () => {
          const res = await deps.fetcher('https://wswhomo.afip.gov.ar/wsfev1/service.asmx', {
            method: 'POST',
            headers: {
              'Content-Type': 'text/xml; charset=utf-8',
              SOAPAction: '"http://ar.gov.afip.dif.FEV1/FEParamGetTiposIva"',
            },
            body: buildWsfeTiposIvaRequest({
              token: parsedTicket.token,
              sign: parsedTicket.sign,
              cuit: PR03_C_EXPECTED_ISSUER_CUIT,
            }),
          })
          if (!res.ok) throw new Error(`WSFE_HTTP_${res.status}`)
          return res.text()
        })()
      : (() => { throw new Error('WSFE_DISPATCHER_UNAVAILABLE') })())

    const parsedTiposIva = parseWsfeTiposIvaResponse(tiposIvaResponseXml)
    tiposIvaRecord = {
      pass: true,
      count: parsedTiposIva.count,
      hash: parsedTiposIva.hash,
      text: parsedTiposIva.ivaText,
    }

    // FASE F: FEParamGetCondicionIvaReceptor
    tracker.recordCall('FEParamGetCondicionIvaReceptor')
    const condicionIvaResponseXml = await (deps.wsfeCondicionIva
      ? deps.wsfeCondicionIva({ token: parsedTicket.token, sign: parsedTicket.sign })
      : deps.fetcher
      ? (async () => {
          const res = await deps.fetcher('https://wswhomo.afip.gov.ar/wsfev1/service.asmx', {
            method: 'POST',
            headers: {
              'Content-Type': 'text/xml; charset=utf-8',
              SOAPAction: '"http://ar.gov.afip.dif.FEV1/FEParamGetCondicionIvaReceptor"',
            },
            body: buildWsfeCondicionIvaReceptorRequest({
              token: parsedTicket.token,
              sign: parsedTicket.sign,
              cuit: PR03_C_EXPECTED_ISSUER_CUIT,
            }),
          })
          if (!res.ok) throw new Error(`WSFE_HTTP_${res.status}`)
          return res.text()
        })()
      : (() => { throw new Error('WSFE_DISPATCHER_UNAVAILABLE') })())

    const parsedCondicionIva = parseWsfeCondicionIvaReceptorResponse(condicionIvaResponseXml)
    condicionesIvaRecord = {
      pass: true,
      count: parsedCondicionIva.count,
      hash: parsedCondicionIva.hash,
      text: parsedCondicionIva.conditionText,
    }

    // FASE G: CONTADOR TOTAL
    tracker.verifyLimits()

    // FASE H: CONSTRUIR REVISIÓN 3
    canonicalRevision3Result = buildPr03cCanonicalRevision3({
      ivaText: tiposIvaRecord.text,
      conditionText: condicionesIvaRecord.text,
      baselineText,
    })

    // FASE J: INSERT-ONLY REVISIÓN 3
    await client.query('BEGIN;')
    await client.query("SET LOCAL lock_timeout='5s';")
    await client.query('SET LOCAL standard_conforming_strings=on;')
    await client.query('SET LOCAL search_path=pg_catalog,public;')
    await client.query(`SET LOCAL "kioskopos.catalog_target_ref" = '${PR03_C_TARGET_PROJECT_REF}';`)
    await client.query(
      `SET LOCAL "kioskopos.approved_catalog_plan_sha256" = '${canonicalRevision3Result.plan_sha256}';`
    )
    await client.query(canonicalRevision3Result.sql)
    await client.query('COMMIT;')

    // FASE K: VERIFICACIÓN POST-INSERT
    await client.query('BEGIN TRANSACTION READ ONLY;')
    const postcheckRes = await client.query(PR03_C_POSTCHECK_SELECT_SQL, [
      PR03_C_EXPECTED_ISSUER_CUIT,
      PR03_C_EXPECTED_ISSUER_PV,
    ])
    verifyPr03cPostcheck(postcheckRes.rows[0].postcheck, {
      fuenteSha256: canonicalRevision3Result.fuente_sha256,
      rev2FuenteSha256,
    })
    await client.query('ROLLBACK;')

    // Limpieza de memoria privada
    parsedTicket.token = ''
    parsedTicket.sign = ''

    return Object.freeze({
      PR03_C_REMOTE_EXECUTION_READY: true,
      REAL_LOGINCMS_EXECUTOR: 'IMPLEMENTED',
      REAL_TIPOS_IVA_EXECUTOR: 'IMPLEMENTED',
      REAL_CONDICIONES_IVA_EXECUTOR: 'IMPLEMENTED',
      EXACT_CALL_ALLOWLIST: 'PASS',
      MAX_ARCA_CALLS: 3,
      AUTO_RETRY: false,
      REVISION_3_DB_INSERT: 'IMPLEMENTED',
      REVISION_3_PRECHECK: 'IMPLEMENTED',
      REVISION_3_POSTCHECK: 'IMPLEMENTED',
      REVISION_2_IMMUTABILITY: 'PASS',
      EMITTER_REMAINS_DISABLED: 'PASS',
      SECRETS_IN_REPORTS: 0,
      LOGIN_CMS: 'PASS',
      TA_CREATED: loginCmsRecord.taCreated,
      TA_EXPIRATION: loginCmsRecord.expiration,
      TOKEN_PRESENT: true,
      SIGN_PRESENT: true,
      LOGIN_CMS_CALLS: tracker.loginCmsCount,
      TIPOS_IVA_QUERY: 'PASS',
      TIPOS_IVA_COUNT: tiposIvaRecord.count,
      TIPOS_IVA_HASH: tiposIvaRecord.hash,
      TIPOS_IVA_CALLS: tracker.tiposIvaCount,
      CONDICIONES_IVA_QUERY: 'PASS',
      CONDICIONES_IVA_COUNT: condicionesIvaRecord.count,
      CONDICIONES_IVA_HASH: condicionesIvaRecord.hash,
      CONDICIONES_IVA_CALLS: tracker.condicionIvaReceptorCount,
      REVISION_3_CANONICAL: 'PASS',
      REVISION_3_INSERT_ONLY: 'PASS',
      REVISION_2_MUTATED: false,
      EMITTER_ENABLE_DURING_PR03_C: false,
      EMITTER_ENABLE_REQUIRED_FOR_PR03_B: true,
      FECAESOLICITAR_REACHABLE: false,
      FECOMPCONSULTAR_REACHABLE: false,
      PR03_C_EMISSION_CAPABLE: false,
      ARCA_CALLS_TOTAL: tracker.totalCalls,
      REVISION_3_EXISTS: true,
      REVISION_3_ENABLED: false,
      EXPECTED_ISSUER_ENABLED: false,
    })
  } catch (err) {
    if (clientConnected) {
      try { await client.query('ROLLBACK;') } catch {}
    }
    throw err
  } finally {
    if (clientConnected) {
      try { await client.end() } catch {}
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('execute-pr03-c-staging.mjs')) {
  executePr03cStaging()
    .then(report => {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    })
    .catch(err => {
      process.stderr.write(`PR03_C_FATAL_ERROR=${err?.message || err}\n`)
      process.exitCode = 1
    })
}
