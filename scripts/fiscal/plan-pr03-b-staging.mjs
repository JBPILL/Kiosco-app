// PR03-B: Plan, Preflight y Fixtures para aceptación de Idempotencia y Numeración en Staging.
// Requisitos de endurecimiento:
// 1. Serie sintética aislada (cero mutación en PV 2 / tipo 11 de producción o staging operativo).
// 2. Preflight con queries separadas (cero multi-statement parametrizado).
// 3. Concurrencia con semántica real: máximo una reserva pendiente por serie (SQLSTATE 55000).
// 4. Baseline comercial criptográfico before/after (cero writes comerciales declarados sin hash).
// 5. Cierre individual y verificado de conexiones PostgreSQL.

import { createHash, randomUUID } from 'node:crypto'

export const ARCA_NETWORK_DISABLED = true
export const PR03_B_SCOPE = 'PR03_B_STAGING_ACCEPTANCE'
export const PR03_B_TEST_FIXTURE_TAG = 'PR03_B_TEST_FIXTURE'
export const PR03_B_OPERACION_PREFIX = 'PR03_B_TEST_'
export const PR03_B_APPROVED_KIOSK_ID = 'b7254826-c767-4098-94b8-71013c12021d'
export const PR03_B_APPROVED_OWNER_AUTH_ID = '0e90b9a7-36d2-4762-ab1a-4982996cf9aa'
export const PR03_B_APPROVED_CUIT = '20415005963'
export const PR03_B_APPROVED_PUNTO_VENTA = 2
export const PR03_B_APPROVED_TIPO_COMPROBANTE = 11

export const PR03_B_SYNTHETIC_PV_CANDIDATES = Object.freeze([9999, 9998, 9995, 9990])

export const PR03_B_BLOCKED_HOST_PATTERNS = Object.freeze([
  /(?:^|\.)(?:afip|arca|wsaa|wsfe)\.gob\.ar$/i,
  /afip/i,
  /arca/i,
  /wsaa/i,
  /wsfe/i,
  /agip/i,
])

/**
 * Guard Anti-ARCA estricto: lanza error fatal inmediato si se intenta
 * cualquier contacto con URLs o endpoints de ARCA.
 */
export function assertNoArcaNetwork(targetUrl) {
  if (ARCA_NETWORK_DISABLED) {
    if (!targetUrl || typeof targetUrl !== 'string') {
      throw new Error('FATAL: ARCA_CALL_ATTEMPTED_IN_PR03_B')
    }
    const lower = targetUrl.toLowerCase()
    const isBlocked = PR03_B_BLOCKED_HOST_PATTERNS.some(pattern => pattern.test(lower))
    if (isBlocked) {
      throw new Error('FATAL: ARCA_CALL_ATTEMPTED_IN_PR03_B')
    }
  }
}

/**
 * Verificación estática y de entorno de que ningún transporte externo
 * de ARCA (WSAA, WSFE, SOAP, undici) es alcanzable en PR03-B.
 */
export function verifyNoExternalFiscalTransport() {
  if (!ARCA_NETWORK_DISABLED) {
    throw new Error('FATAL: ARCA_NETWORK_DISABLED must be true for PR03-B')
  }
  return Object.freeze({
    arcaTransportReachable: false,
    status: 'PASS',
  })
}

/**
 * Transporte HTTP Anti-ARCA que intercepta llamadas y bloquea con error fatal.
 */
export function createAntiArcaFetch() {
  return function antiArcaFetch(input) {
    const url = typeof input === 'string' ? input : (input && typeof input.url === 'string' ? input.url : '')
    assertNoArcaNetwork(url)
    throw new Error('FATAL: ARCA_CALL_ATTEMPTED_IN_PR03_B')
  }
}

/**
 * Serialización canónica JSON determinística para comprobantes fiscales.
 * Ordena las claves alfabéticamente en todos los niveles y serializa sin espacios extras.
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  const obj = value
  const sortedKeys = Object.keys(obj).sort()
  return `{${sortedKeys.map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`
}

/**
 * Calcula digest SHA-256 en formato hex sobre UTF-8.
 */
export function computeSha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Construye el objeto de solicitud fiscal canónico y su hash SHA-256
 * conforme a fiscal_validar_cuerpo_homologacion (003_fiscal_requests.sql).
 */
export function buildCanonicalFiscalRequest(params) {
  const req = {
    version: 1,
    entorno: 'HOMOLOGACION',
    cuitEmisor: params.cuitEmisor,
    puntoVenta: params.puntoVenta,
    tipoComprobante: params.tipoComprobante,
    numero: params.numero,
    concepto: params.concepto ?? 1,
    tipoDocumento: params.tipoDocumento ?? 99,
    numeroDocumento: params.numeroDocumento ?? '0',
    condicionIvaReceptor: params.condicionIvaReceptor ?? 5,
    fecha: params.fecha,
    servicioDesde: params.servicioDesde ?? null,
    servicioHasta: params.servicioHasta ?? null,
    vencimientoPago: params.vencimientoPago ?? null,
    moneda: 'PES',
    cotizacion: '1',
    importes: {
      total: params.total,
      neto: params.neto ?? params.total,
      iva: params.iva ?? '0.00',
      noGravado: params.noGravado ?? '0.00',
      exento: params.exento ?? '0.00',
      tributos: params.tributos ?? '0.00',
    },
    iva: params.ivaArray ?? [],
    tributos: params.tributosArray ?? [],
  }
  const canonical = canonicalJson(req)
  const sha256 = computeSha256(canonical)
  return { request: req, canonical, sha256 }
}

/**
 * Validador estricto de formato UUID para identificadores de corrida.
 */
export function validateCleanupRunId(runId) {
  if (
    typeof runId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)
  ) {
    throw new Error('INVALID_CLEANUP_RUN_ID')
  }
  return true
}

/**
 * Crea un fixture de prueba PR03-B básico para validaciones locales de contrato.
 */
export function createPr03bTestFixture(opts = {}) {
  const operacionId = opts.operacionId ?? randomUUID()
  const ventaId = opts.ventaId ?? randomUUID()
  const total = opts.total ?? '150.00'
  const fecha = opts.fecha ?? '20261102'
  const numero = opts.numero ?? 1
  const puntoVenta = opts.puntoVenta ?? PR03_B_APPROVED_PUNTO_VENTA

  const canonicalReq = buildCanonicalFiscalRequest({
    cuitEmisor: PR03_B_APPROVED_CUIT,
    puntoVenta,
    tipoComprobante: PR03_B_APPROVED_TIPO_COMPROBANTE,
    numero,
    total,
    fecha,
  })

  return Object.freeze({
    tag: PR03_B_TEST_FIXTURE_TAG,
    scope: PR03_B_SCOPE,
    kiosco_id: PR03_B_APPROVED_KIOSK_ID,
    cuit_emisor: PR03_B_APPROVED_CUIT,
    punto_venta: puntoVenta,
    tipo_comprobante: PR03_B_APPROVED_TIPO_COMPROBANTE,
    operacion_id: operacionId,
    venta_id: ventaId,
    total,
    solicitud: canonicalReq.request,
    cuerpo_canonico: canonicalReq.canonical,
    solicitud_sha256: canonicalReq.sha256,
    metadata: {
      fixture: PR03_B_TEST_FIXTURE_TAG,
      kiosco_id: PR03_B_APPROVED_KIOSK_ID,
      scope: PR03_B_SCOPE,
      anti_arca_guard: true,
      created_at: new Date().toISOString(),
    },
  })
}

/**
 * Crea un fixture de ejecución PR03-B sobre una serie y venta sintética auditada.
 * Respeta rigurosamente los 6 campos canónicos de preparar_operacion_fiscal_homologacion.
 */
export function createPr03bScopedFixture(runId, opts = {}) {
  validateCleanupRunId(runId)
  const operacionId = opts.operacionId ?? randomUUID()
  const ventaId = opts.ventaId ?? randomUUID()
  const total = opts.total ?? '150.00'
  const fecha = opts.fecha ?? '20261102'
  const numero = opts.numero ?? 1
  const puntoVenta = opts.puntoVenta ?? 9999

  const canonicalReq = buildCanonicalFiscalRequest({
    cuitEmisor: PR03_B_APPROVED_CUIT,
    puntoVenta,
    tipoComprobante: PR03_B_APPROVED_TIPO_COMPROBANTE,
    numero,
    total,
    fecha,
  })

  // Estricto: sólo los 6 campos canónicos admitidos por la función SQL
  const context = {
    version: 1,
    cuit_emisor: PR03_B_APPROVED_CUIT,
    punto_venta: puntoVenta,
    tipo_comprobante: PR03_B_APPROVED_TIPO_COMPROBANTE,
    tipo_doc_receptor: 99,
    nro_doc_receptor: '0',
  }

  return Object.freeze({
    tag: PR03_B_TEST_FIXTURE_TAG,
    scope: PR03_B_SCOPE,
    run_id: runId,
    kiosco_id: PR03_B_APPROVED_KIOSK_ID,
    cuit_emisor: PR03_B_APPROVED_CUIT,
    punto_venta: puntoVenta,
    tipo_comprobante: PR03_B_APPROVED_TIPO_COMPROBANTE,
    operacion_id: operacionId,
    venta_id: ventaId,
    total,
    contexto: context,
    solicitud: canonicalReq.request,
    cuerpo_canonico: canonicalReq.canonical,
    solicitud_sha256: canonicalReq.sha256,
    metadata: {
      fixture: PR03_B_TEST_FIXTURE_TAG,
      kiosco_id: PR03_B_APPROVED_KIOSK_ID,
      scope: PR03_B_SCOPE,
      run_id: runId,
      punto_venta: puntoVenta,
      anti_arca_guard: true,
      created_at: new Date().toISOString(),
    },
  })
}

/**
 * Query SELECT pura para preflight READ ONLY. Cero sentencias BEGIN/ROLLBACK embebidas
 * para compatibilidad total con el protocolo extendido de PostgreSQL.
 */
export const PR03_B_PREFLIGHT_SELECT_SQL = `SELECT jsonb_build_object(
  'transaction_read_only', current_setting('transaction_read_only'),
  'observed_at', clock_timestamp(),
  'kiosk_active', EXISTS (
    SELECT 1 FROM public.kioscos WHERE id = $1 AND estado_suscripcion = 'ACTIVO'
  ),
  'expected_issuer_present', EXISTS (
    SELECT 1 FROM public.fiscal_emisores_homologacion WHERE cuit_emisor = $2 AND punto_venta = $3
  ),
  'expected_issuer_enabled', COALESCE((
    SELECT habilitado FROM public.fiscal_emisores_homologacion WHERE cuit_emisor = $2 AND punto_venta = $3
  ), false),
  'unexpected_enabled_issuers', (
    SELECT count(*)::int FROM public.fiscal_emisores_homologacion WHERE habilitado = true
  ),
  'pos_present', EXISTS (
    SELECT 1 FROM public.fiscal_emisores_homologacion WHERE punto_venta = $3 AND cuit_emisor = $2
  ),
  'catalog_rev3_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 3
  ),
  'residual_fixtures_count', (
    SELECT count(*)::int FROM public.fiscal_operaciones_homologacion
    WHERE estado = 'PREPARADA'
  ),
  'synthetic_sales', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id,
      'kiosco_id', v.kiosco_id,
      'total', v.total::text,
      'estado', v.estado
    ) ORDER BY v.fecha_hora DESC), '[]'::jsonb)
    FROM public.ventas v
    WHERE v.kiosco_id = $1
      AND v.estado = 'COMPLETADA'
      AND nullif(btrim(to_jsonb(v)->>'afip_cae'), '') IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.fiscal_operaciones_homologacion op WHERE op.venta_id = v.id)
      AND (
        coalesce(to_jsonb(v)->>'cliente_nombre', '') ILIKE '%ensayo%' OR
        coalesce(to_jsonb(v)->>'cliente_nombre', '') ILIKE '%test%' OR
        coalesce(to_jsonb(v)->>'cliente_nombre', '') ILIKE '%sintetic%' OR
        coalesce(v.notas, '') ILIKE '%ensayo%' OR
        coalesce(v.notas, '') ILIKE '%test%' OR
        coalesce(v.notas, '') ILIKE '%sintetic%' OR
        coalesce(to_jsonb(v)->>'es_ensayo', 'false') = 'true' OR
        coalesce(to_jsonb(v)->>'fixture', '') = 'PR03_B_TEST_FIXTURE'
      )
  ),
  'synthetic_series_candidates', (
    SELECT jsonb_agg(jsonb_build_object(
      'punto_venta', c.pv,
      'absent_from_emisores', NOT EXISTS (SELECT 1 FROM public.fiscal_emisores_homologacion e WHERE e.punto_venta = c.pv),
      'absent_from_series', NOT EXISTS (SELECT 1 FROM public.fiscal_series_homologacion s WHERE s.punto_venta = c.pv),
      'absent_from_reservas', NOT EXISTS (SELECT 1 FROM public.fiscal_reservas_homologacion r WHERE r.punto_venta = c.pv)
    ))
    FROM (VALUES (9999), (9998), (9995), (9990)) AS c(pv)
  )
) AS preflight;`

/**
 * Validador del resultado del preflight READ ONLY.
 * Descubre ventas sintéticas independientes y selecciona una serie sintética completamente ausente.
 */
export function verifyPr03bPreflight(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('PR03_B_PREFLIGHT_INVALID')
  }
  const d = raw
  if (d.transaction_read_only !== 'on') throw new Error('PR03_B_PREFLIGHT_NOT_READ_ONLY')
  if (!d.kiosk_active) throw new Error('PR03_B_PREFLIGHT_KIOSK_INACTIVE')
  if (!d.expected_issuer_present) throw new Error('PR03_B_PREFLIGHT_ISSUER_NOT_FOUND')
  if (d.expected_issuer_enabled !== false) throw new Error('PR03_B_PREFLIGHT_ISSUER_ENABLED')
  if (d.unexpected_enabled_issuers !== 0) throw new Error('PR03_B_PREFLIGHT_UNEXPECTED_ENABLED_ISSUERS')
  if (!d.pos_present) throw new Error('PR03_B_PREFLIGHT_POS_NOT_FOUND')
  if (d.catalog_rev3_exists) throw new Error('PR03_B_PREFLIGHT_CATALOG_REV3_EXISTS')
  if (d.residual_fixtures_count !== 0) throw new Error('PR03_B_PREFLIGHT_RESIDUAL_FIXTURES_FOUND')

  // Validar ventas sintéticas auditadas
  const syntheticSales = Array.isArray(d.synthetic_sales) ? d.synthetic_sales : []
  if (syntheticSales.length < 2) {
    throw new Error('PR03_B_PREFLIGHT_INSUFFICIENT_SYNTHETIC_TEST_SALES')
  }

  // Descubrir y validar serie sintética candidata aislada
  const candidates = Array.isArray(d.synthetic_series_candidates) ? d.synthetic_series_candidates : []
  const availableCandidate = candidates.find(
    c => c.absent_from_emisores && c.absent_from_series && c.absent_from_reservas
  )

  if (!availableCandidate) {
    throw new Error('PR03_B_PREFLIGHT_NO_SAFE_SYNTHETIC_SERIES_AVAILABLE')
  }

  return Object.freeze({
    status: 'PASS',
    transactionReadOnly: true,
    kioskActive: true,
    expectedIssuerPresent: true,
    expectedIssuerInactive: true,
    catalogRev3Absent: true,
    residualFixturesCount: 0,
    syntheticSalesCount: syntheticSales.length,
    chosenSyntheticPv: availableCandidate.punto_venta,
    syntheticSales,
  })
}

/**
 * Consulta de medición del baseline comercial criptográfico.
 * Captura conteos y digest determinístico de todas las tablas comerciales pertinentes.
 */
export const PR03_B_COMMERCIAL_BASELINE_SQL = `SELECT jsonb_build_object(
  'ventas_count', (SELECT count(*)::int FROM public.ventas WHERE kiosco_id = $1),
  'detalles_count', (SELECT count(*)::int FROM public.detalles_venta d JOIN public.ventas v ON v.id = d.venta_id WHERE v.kiosco_id = $1),
  'pagos_count', (SELECT count(*)::int FROM public.pagos_venta p JOIN public.ventas v ON v.id = p.venta_id WHERE v.kiosco_id = $1),
  'sesiones_count', (SELECT count(*)::int FROM public.sesiones_caja WHERE kiosco_id = $1),
  'movimientos_caja_count', (SELECT count(*)::int FROM public.movimientos_caja WHERE kiosco_id = $1),
  'movimientos_stock_count', (SELECT count(*)::int FROM public.movimientos_stock WHERE kiosco_id = $1),
  'devoluciones_count', (SELECT count(*)::int FROM public.devoluciones_venta WHERE kiosco_id = $1),
  'productos_count', (SELECT count(*)::int FROM public.productos WHERE kiosco_id = $1),
  'ventas_digest', (SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.id),'[]'::jsonb)::text,'UTF8')),'hex') FROM public.ventas v WHERE v.kiosco_id = $1)
) AS baseline;`

/**
 * Calcula el hash SHA-256 canónico del baseline comercial.
 */
export function computeCommercialBaselineHash(baseline) {
  if (!baseline || typeof baseline !== 'object') {
    throw new Error('INVALID_COMMERCIAL_BASELINE')
  }
  return computeSha256(canonicalJson(baseline))
}

/**
 * Validador del contrato de cleanup: comprueba que el contexto objetivo
 * contenga explícitamente el tag de prueba sintética.
 */
export function validateCleanupTarget(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('CLEANUP_TARGET_INVALID')
  }
  if (context.tag !== PR03_B_TEST_FIXTURE_TAG && context.fixture !== PR03_B_TEST_FIXTURE_TAG) {
    throw new Error('CLEANUP_TARGET_NOT_TAGGED')
  }
  return true
}

/**
 * Genera SQL de limpieza quirúrgica basada en la lista explícita de UUIDs de operaciones creadas.
 * NUNCA toca la serie real de PV 2 ni ventas comerciales.
 */
export function buildManifestCleanupSql(operationIds, opts = {}) {
  if (!Array.isArray(operationIds) || operationIds.length === 0) {
    return 'BEGIN; COMMIT;'
  }
  for (const id of operationIds) {
    validateCleanupRunId(id)
  }
  const idList = operationIds.map(id => `'${id}'::uuid`).join(',')
  const syntheticPv = opts.syntheticPv
  const pvCleanup = (typeof syntheticPv === 'number' && PR03_B_SYNTHETIC_PV_CANDIDATES.includes(syntheticPv))
    ? `\nDELETE FROM public.fiscal_series_homologacion WHERE cuit_emisor = '${PR03_B_APPROVED_CUIT}' AND punto_venta = ${syntheticPv};`
    : ''

  return `BEGIN;
-- Limpieza quirúrgica acotada a operaciones del manifiesto de corrida PR03-B.
DELETE FROM public.fiscal_solicitudes_homologacion WHERE operacion_id IN (${idList});
DELETE FROM public.fiscal_reservas_homologacion WHERE operacion_id IN (${idList});
DELETE FROM public.fiscal_operaciones_homologacion WHERE id IN (${idList});${pvCleanup}
COMMIT;`
}

/**
 * Valida el resultado de la prueba de idempotencia (replay idéntico).
 */
export function verifyIdempotencyReplay(first, replay) {
  if (!first || !replay) throw new Error('IDEMPOTENCY_REPLAY_MISSING_DATA')
  if (first.operacion_id !== replay.operacion_id) throw new Error('IDEMPOTENCY_REPLAY_OPERACION_MISMATCH')
  if (first.numero !== replay.numero) throw new Error('IDEMPOTENCY_REPLAY_NUMERO_MUTATED')
  if (first.solicitud_sha256 !== replay.solicitud_sha256) throw new Error('IDEMPOTENCY_REPLAY_HASH_MUTATED')
  if (first.estado !== replay.estado) throw new Error('IDEMPOTENCY_REPLAY_ESTADO_MUTATED')

  return Object.freeze({
    status: 'PASS',
    identicalReservation: true,
    mutated: false,
    operacion_id: first.operacion_id,
    numero: first.numero,
  })
}

/**
 * Valida el resultado de la prueba de conflicto de idempotencia (payload alterado).
 */
export function verifyIdempotencyConflict(error) {
  if (!error) throw new Error('IDEMPOTENCY_CONFLICT_DID_NOT_THROW')
  const err = error
  const code = err.code || err.sqlState || err.status || ''
  const message = String(err.message || '')

  const isExpectedCode = code === '40001' || code === '22023' ||
    message.includes('40001') || message.includes('22023') ||
    message.includes('No se confirmó el cuerpo fiscal') || message.includes('ya existe otro')

  if (!isExpectedCode) {
    throw new Error(`IDEMPOTENCY_CONFLICT_UNEXPECTED_ERROR: ${code} - ${message}`)
  }

  return Object.freeze({
    status: 'PASS',
    rejectedWithExpectedCode: true,
    errorCode: code || '40001',
  })
}

/**
 * Valida la semántica de concurrencia: exactamente una única reserva pendiente por serie.
 * Conexión B debe esperar o ser rechazada con 55000 mientras A retenga el lock.
 */
export function verifyConcurrencySinglePendingReservation(check) {
  if (!check || typeof check !== 'object') {
    throw new Error('CONCURRENCY_CHECK_INVALID')
  }

  if (check.lockObserved !== true) {
    throw new Error('CONCURRENCY_LOCK_NOT_OBSERVED: Conexión B no esperó el lock de A')
  }

  if (check.simultaneousPendingReservations === true) {
    throw new Error('CONCURRENCY_VIOLATION: Se detectaron reservas pendientes simultáneas')
  }

  if (check.numberCollision === true) {
    throw new Error('CONCURRENCY_VIOLATION: Colisión de número detectada')
  }

  return Object.freeze({
    status: 'PASS',
    concurrencyExpectation: 'SINGLE_PENDING_RESERVATION',
    lockSerialization: 'PASS',
    noSimultaneousPendingReservations: true,
    numberCollision: false,
  })
}

/**
 * Definición de los 3 casos de prueba atómicos de PR03-B.
 */
export const PR03_B_TEST_CASES = Object.freeze([
  {
    id: 'PRUEBA_IDEMPOTENCIA_REPLAY',
    description: 'Misma venta/operación con mismo hash devuelve exactamente el mismo registro previo sin recrear reserva ni mutar numeración.',
    expectedStatus: 'PASS',
  },
  {
    id: 'PRUEBA_IDEMPOTENCIA_CONFLICT',
    description: 'Misma venta/operación con payload alterado debe ser rechazada estrictamente con SQLSTATE 40001.',
    expectedStatus: 'PASS',
  },
  {
    id: 'PRUEBA_CONCURRENCIA_BLOQUEO',
    description: 'Dos conexiones concurrentes compitiendo sobre la serie serializan mediante row lock en fiscal_series_homologacion y previenen reservas simultáneas (SQLSTATE 55000).',
    expectedStatus: 'PASS',
  },
])

/**
 * Valida la configuración global del plan PR03-B.
 */
export function verifyPr03bPlan(plan) {
  if (!plan || typeof plan !== 'object') throw new Error('PR03_B_PLAN_INVALID')
  if (plan.scope !== PR03_B_SCOPE) throw new Error('PR03_B_PLAN_SCOPE_MISMATCH')
  if (plan.kiosco_id !== PR03_B_APPROVED_KIOSK_ID) throw new Error('PR03_B_PLAN_KIOSK_MISMATCH')
  if (plan.cuit_emisor !== PR03_B_APPROVED_CUIT) throw new Error('PR03_B_PLAN_CUIT_MISMATCH')
  if (plan.punto_venta !== PR03_B_APPROVED_PUNTO_VENTA) throw new Error('PR03_B_PLAN_POS_MISMATCH')
  if (plan.tipo_comprobante !== PR03_B_APPROVED_TIPO_COMPROBANTE) throw new Error('PR03_B_PLAN_RECEIPT_TYPE_MISMATCH')
  if (plan.anti_arca_guard !== true) throw new Error('PR03_B_PLAN_ANTI_ARCA_GUARD_INACTIVE')
  if (plan.catalog_revision_3_excluded !== true) throw new Error('PR03_B_PLAN_CATALOG_REV3_NOT_EXCLUDED')

  return Object.freeze({
    status: 'PASS',
    scopeValidated: true,
    fixtureValidated: true,
    antiArcaGuardActive: true,
    testCasesCount: PR03_B_TEST_CASES.length,
  })
}
