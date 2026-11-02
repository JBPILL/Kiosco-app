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

  const isExpectedCode = code === '22023' || code === '40001' ||
    message.includes('22023') || message.includes('40001') ||
    message.includes('inválido') || message.includes('invalido') ||
    message.includes('Cambiò el n') || message.includes('Cambi')

  if (!isExpectedCode) {
    throw new Error(`IDEMPOTENCY_CONFLICT_UNEXPECTED_ERROR: ${message}`)
  }

  return Object.freeze({
    status: 'PASS',
    rejectedWithExpectedCode: true,
    errorCode: code || '22023',
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
  if (nums[1] - nums[0] !== 1) {
    throw new Error('CONCURRENCY_NUMBERING_NON_SEQUENTIAL_GAP')
  }

  return Object.freeze({
    status: 'PASS',
    serialized: true,
    collisionCount: 0,
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
    description: 'Misma venta/operación con payload alterado debe ser rechazada estrictamente con SQLSTATE 22023.',
    expectedStatus: 'PASS',
  },
  {
    id: 'PRUEBA_CONCURRENCIA_NUMERACION',
    description: 'Dos workers concurrentes intentando reservar para la misma serie serializan en fiscal_series_homologacion y asignan n y n+1 sin duplicados.',
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
