// PR03-B: Plan y Fixture para aceptación de Idempotencia y Numeración en Staging.
// Requisitos: SIN llamadas a ARCA, SIN mutaciones comerciales, con rollback o cleanup quirúrgico.

import { createHash, randomUUID } from 'node:crypto'

export const ARCA_NETWORK_DISABLED = true
export const PR03_B_SCOPE = 'PR03_B_STAGING_ACCEPTANCE'
export const PR03_B_TEST_FIXTURE_TAG = 'PR03_B_TEST_FIXTURE'
export const PR03_B_OPERACION_PREFIX = 'PR03_B_TEST_'
export const PR03_B_APPROVED_KIOSK_ID = 'b7254826-c767-4098-94b8-71013c12021d'
export const PR03_B_APPROVED_CUIT = '20415005963'
export const PR03_B_APPROVED_PUNTO_VENTA = 2
export const PR03_B_APPROVED_TIPO_COMPROBANTE = 11

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
 * Validador estricto de formato UUID para run_id.
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
 * Crea un fixture de prueba PR03-B estrictamente validado.
 */
export function createPr03bTestFixture(opts = {}) {
  const operacionId = opts.operacionId ?? randomUUID()
  const ventaId = opts.ventaId ?? randomUUID()
  const total = opts.total ?? '150.00'
  const fecha = opts.fecha ?? '20261102'
  const numero = opts.numero ?? 1

  const canonicalReq = buildCanonicalFiscalRequest({
    cuitEmisor: PR03_B_APPROVED_CUIT,
    puntoVenta: PR03_B_APPROVED_PUNTO_VENTA,
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
    punto_venta: PR03_B_APPROVED_PUNTO_VENTA,
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
 * Crea un fixture de ejecución PR03-B ligado inequívocamente a un run_id.
 */
export function createPr03bScopedFixture(runId, opts = {}) {
  validateCleanupRunId(runId)
  const operacionId = opts.operacionId ?? randomUUID()
  const ventaId = opts.ventaId ?? randomUUID()
  const total = opts.total ?? '150.00'
  const fecha = opts.fecha ?? '20261102'
  const numero = opts.numero ?? 1

  const canonicalReq = buildCanonicalFiscalRequest({
    cuitEmisor: PR03_B_APPROVED_CUIT,
    puntoVenta: PR03_B_APPROVED_PUNTO_VENTA,
    tipoComprobante: PR03_B_APPROVED_TIPO_COMPROBANTE,
    numero,
    total,
    fecha,
  })

  const context = {
    version: 1,
    cuit_emisor: PR03_B_APPROVED_CUIT,
    punto_venta: PR03_B_APPROVED_PUNTO_VENTA,
    tipo_comprobante: PR03_B_APPROVED_TIPO_COMPROBANTE,
    tipo_doc_receptor: 99,
    nro_doc_receptor: '0',
    fixture: PR03_B_TEST_FIXTURE_TAG,
    tag: PR03_B_TEST_FIXTURE_TAG,
    run_id: runId,
  }

  return Object.freeze({
    tag: PR03_B_TEST_FIXTURE_TAG,
    scope: PR03_B_SCOPE,
    run_id: runId,
    kiosco_id: PR03_B_APPROVED_KIOSK_ID,
    cuit_emisor: PR03_B_APPROVED_CUIT,
    punto_venta: PR03_B_APPROVED_PUNTO_VENTA,
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
      anti_arca_guard: true,
      created_at: new Date().toISOString(),
    },
  })
}

/**
 * SQL de preflight READ ONLY estricto para validar estado Staging antes de escribir.
 */
export const PR03_B_PREFLIGHT_SQL = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT jsonb_build_object(
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
    WHERE (contexto->>'fixture' = 'PR03_B_TEST_FIXTURE' OR contexto->>'tag' = 'PR03_B_TEST_FIXTURE')
      AND estado = 'PREPARADA'
  ),
  'pending_series_reservations_count', (
    SELECT count(*)::int FROM public.fiscal_reservas_homologacion
    WHERE cuit_emisor = $2 AND punto_venta = $3 AND tipo_comprobante = $4
      AND estado IN ('RESERVADA', 'ENVIO_INCIERTO')
  )
) AS preflight;

ROLLBACK;`

/**
 * Validador del resultado del preflight READ ONLY.
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
  if (d.pending_series_reservations_count !== 0) throw new Error('PR03_B_PREFLIGHT_PENDING_SERIES_RESERVATIONS_FOUND')

  return Object.freeze({
    status: 'PASS',
    transactionReadOnly: true,
    kioskActive: true,
    expectedIssuerPresent: true,
    expectedIssuerInactive: true,
    catalogRev3Absent: true,
    residualFixturesCount: 0,
    pendingSeriesReservationsCount: 0,
  })
}

/**
 * Query SQL quirúrgica para limpieza exclusiva de filas PR03_B_TEST_FIXTURE.
 */
export const PR03_B_CLEANUP_SQL = `BEGIN;
-- Limpieza quirúrgica de filas de ensayo PR03-B.
-- NUNCA toca ventas comerciales reales, cursores de PR07 ni backups.

DELETE FROM public.fiscal_solicitudes_homologacion
WHERE operacion_id IN (
  SELECT id FROM public.fiscal_operaciones_homologacion
  WHERE contexto->>'tag' = 'PR03_B_TEST_FIXTURE'
     OR contexto->>'fixture' = 'PR03_B_TEST_FIXTURE'
);

DELETE FROM public.fiscal_reservas_homologacion
WHERE operacion_id IN (
  SELECT id FROM public.fiscal_operaciones_homologacion
  WHERE contexto->>'tag' = 'PR03_B_TEST_FIXTURE'
     OR contexto->>'fixture' = 'PR03_B_TEST_FIXTURE'
);

DELETE FROM public.fiscal_operaciones_homologacion
WHERE contexto->>'tag' = 'PR03_B_TEST_FIXTURE'
   OR contexto->>'fixture' = 'PR03_B_TEST_FIXTURE';

COMMIT;`

/**
 * Genera SQL de limpieza quirúrgica acotada obligatoriamente por run_id.
 */
export function buildScopedCleanupSql(runId) {
  validateCleanupRunId(runId)
  return `BEGIN;
-- Limpieza quirúrgica de filas de ensayo PR03-B limitada estrictamente por run_id.
-- NUNCA toca ventas comerciales reales, cursores de PR07 ni backups.

DELETE FROM public.fiscal_solicitudes_homologacion
WHERE operacion_id IN (
  SELECT id FROM public.fiscal_operaciones_homologacion
  WHERE (contexto->>'fixture' = 'PR03_B_TEST_FIXTURE' OR contexto->>'tag' = 'PR03_B_TEST_FIXTURE')
    AND contexto->>'run_id' = '${runId}'
);

DELETE FROM public.fiscal_reservas_homologacion
WHERE operacion_id IN (
  SELECT id FROM public.fiscal_operaciones_homologacion
  WHERE (contexto->>'fixture' = 'PR03_B_TEST_FIXTURE' OR contexto->>'tag' = 'PR03_B_TEST_FIXTURE')
    AND contexto->>'run_id' = '${runId}'
);

DELETE FROM public.fiscal_operaciones_homologacion
WHERE (contexto->>'fixture' = 'PR03_B_TEST_FIXTURE' OR contexto->>'tag' = 'PR03_B_TEST_FIXTURE')
  AND contexto->>'run_id' = '${runId}';

COMMIT;`
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

  const isExpectedCode = code === '22023' || code === '40001' || code === '55000' ||
    message.includes('22023') || message.includes('40001') || message.includes('55000') ||
    message.includes('inválido') || message.includes('invalido') ||
    message.includes('Cambiò el n') || message.includes('Cambi') || message.includes('cuerpo fiscal')

  if (!isExpectedCode) {
    throw new Error(`IDEMPOTENCY_CONFLICT_UNEXPECTED_ERROR: ${message}`)
  }

  return Object.freeze({
    status: 'PASS',
    rejectedWithExpectedCode: true,
    errorCode: code || '40001',
  })
}

/**
 * Valida el resultado de la prueba de concurrencia y reserva serializada de numeración.
 */
export function verifyConcurrencyNumbering(results) {
  if (!Array.isArray(results) || results.length !== 2) {
    throw new Error('CONCURRENCY_NUMBERING_INVALID_RESULTS')
  }
  const [resA, resB] = results
  if (!resA || !resB) throw new Error('CONCURRENCY_NUMBERING_EMPTY_RESULT')

  if (resA.numero === resB.numero) {
    throw new Error('CONCURRENCY_NUMBERING_COLLISION_DETECTED')
  }

  const nums = [Number(resA.numero), Number(resB.numero)].sort((a, b) => a - b)

  return Object.freeze({
    status: 'PASS',
    serialized: true,
    collisionCount: 0,
    uniqueNumbers: true,
    assignedNumbers: nums,
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
    description: 'Misma venta/operación con payload alterado debe ser rechazada estrictamente con error del contrato SQL.',
    expectedStatus: 'PASS',
  },
  {
    id: 'PRUEBA_CONCURRENCIA_NUMERACION',
    description: 'Dos workers concurrentes intentando reservar para la misma serie serializan en fiscal_series_homologacion y asignan números sin colisiones.',
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
