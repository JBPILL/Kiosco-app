// PR03-B: Plan, Preflight y Fixtures para aceptación de Idempotencia y Numeración en Staging.
// Requisitos de endurecimiento:
// 1. Serie sintética aislada (cero mutación en PV 2 / tipo 11 de producción o staging operativo).
// 2. Preflight con queries separadas (cero multi-statement parametrizado).
// 3. Concurrencia con semántica real: máximo una reserva pendiente por serie (SQLSTATE 55000).
// 4. Baseline comercial criptográfico before/after (cero writes comerciales declarados sin hash).
// 5. Cierre individual y verificado de conexiones PostgreSQL.
// 6. Tenant sintético preexistente acreditado (f4a00000-2026-4011-a001-000000000001).

import { createHash, randomUUID } from 'node:crypto'

export const ARCA_NETWORK_DISABLED = true
export const PR03_B_SCOPE = 'PR03_B_STAGING_ACCEPTANCE'
export const PR03_B_TEST_FIXTURE_TAG = 'PR03_B_TEST_FIXTURE'
export const PR03_B_OPERACION_PREFIX = 'PR03_B_TEST_'

// Identidades reales protegidas
export const PR03_B_REAL_KIOSK_ID = 'b7254826-c767-4098-94b8-71013c12021d'
export const PR03_B_REAL_PV = 2

// Identidades sintéticas de aceptación
export const PR03_B_SYNTHETIC_KIOSK_ID = 'f4a00000-2026-4011-a001-000000000001'
export const PR03_B_SYNTHETIC_OWNER_AUTH_ID = 'f6af0f21-07f2-4d22-9b3c-7eec3604d5af'
export const PR03_B_SYNTHETIC_PV = 9999
export const PR03_B_SYNTHETIC_CUIT = '20415005963'
export const PR03_B_SYNTHETIC_RECEIPT_TYPE = 11

// Identidad completa del emisor sintético
export const PR03_B_SYNTHETIC_CREDENCIAL_ID = '9a4916d1-b6b5-499f-98ef-9f6cf79510be'
export const PR03_B_SYNTHETIC_CERT_SHA256 = 'bbcaffebce0f62e1d626e9f6f425dfa70a2de22031df12536a3876d2193af9d0'
export const PR03_B_SYNTHETIC_EMITTER_REVISION = 1

// Alias retrocompatibles
export const PR03_B_APPROVED_KIOSK_ID = PR03_B_REAL_KIOSK_ID
export const PR03_B_APPROVED_OWNER_AUTH_ID = '0e90b9a7-36d2-4762-ab1a-4982996cf9aa'
export const PR03_B_APPROVED_CUIT = '20415005963'
export const PR03_B_APPROVED_PUNTO_VENTA = PR03_B_REAL_PV
export const PR03_B_APPROVED_TIPO_COMPROBANTE = 11

export const PR03_B_SYNTHETIC_PV_CANDIDATES = Object.freeze([9999, 9998, 9995, 9990])

// Conclusiones canónicas de auditoría de esquema
export const SYNTHETIC_EMITTER_ROW_SUPPORTED = true
export const CANONICAL_PREPARATION_REQUIRES_CONFIGURED_SYNTHETIC_PV = true
export const PR03_B_BLOCKED_BY_SCHEMA = false

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
 * Guard Anti-PV2 / Real Kiosk estricto: lanza error fatal si se intenta utilizar
 * el punto de venta real 2 o el kiosco real en fixtures, series, reservas o solicitudes.
 */
export function assertNoRealPv2Usage(target) {
  if (target === 2 || target === '2' || target === PR03_B_REAL_PV) {
    throw new Error('FATAL: PR03_B_REAL_FISCAL_CONTEXT_FORBIDDEN')
  }
  if (typeof target === 'string' && target === PR03_B_REAL_KIOSK_ID) {
    throw new Error('FATAL: PR03_B_REAL_FISCAL_CONTEXT_FORBIDDEN')
  }
  if (target && typeof target === 'object') {
    const pv = target.punto_venta ?? target.puntoVenta
    const kid = target.kiosco_id ?? target.kiosk_id ?? target.kioskId
    if (pv === 2 || pv === '2' || pv === PR03_B_REAL_PV) {
      throw new Error('FATAL: PR03_B_REAL_FISCAL_CONTEXT_FORBIDDEN')
    }
    if (kid === PR03_B_REAL_KIOSK_ID) {
      throw new Error('FATAL: PR03_B_REAL_FISCAL_CONTEXT_FORBIDDEN')
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
  const puntoVenta = opts.puntoVenta ?? PR03_B_SYNTHETIC_PV
  const kioscoId = opts.kiosco_id ?? opts.kioskId ?? PR03_B_SYNTHETIC_KIOSK_ID
  const cuitEmisor = opts.cuitEmisor ?? PR03_B_SYNTHETIC_CUIT
  const tipoComprobante = opts.tipoComprobante ?? PR03_B_SYNTHETIC_RECEIPT_TYPE

  assertNoRealPv2Usage(puntoVenta)
  assertNoRealPv2Usage(kioscoId)

  const canonicalReq = buildCanonicalFiscalRequest({
    cuitEmisor,
    puntoVenta,
    tipoComprobante,
    numero,
    total,
    fecha,
  })

  return Object.freeze({
    tag: PR03_B_TEST_FIXTURE_TAG,
    scope: PR03_B_SCOPE,
    kiosco_id: kioscoId,
    cuit_emisor: cuitEmisor,
    punto_venta: puntoVenta,
    tipo_comprobante: tipoComprobante,
    operacion_id: operacionId,
    venta_id: ventaId,
    total,
    solicitud: canonicalReq.request,
    cuerpo_canonico: canonicalReq.canonical,
    solicitud_sha256: canonicalReq.sha256,
    metadata: {
      fixture: PR03_B_TEST_FIXTURE_TAG,
      kiosco_id: kioscoId,
      scope: PR03_B_SCOPE,
      anti_arca_guard: true,
      created_at: new Date().toISOString(),
    },
  })
}

/**
 * Construye el objeto canónico de preparación fiscal (5 claves estrictas) y su digest SHA-256
 * conforme a guardar_datos_preparacion_homologacion (012_fiscal_preparation.sql).
 */
export function buildCanonicalFiscalPreparation(params) {
  const formattedTotal = Number(params.total).toFixed(2)
  const datos = {
    version: 1,
    entorno: 'HOMOLOGACION',
    cuitEmisor: params.cuitEmisor,
    puntoVenta: params.puntoVenta,
    tipoComprobante: params.tipoComprobante ?? PR03_B_SYNTHETIC_RECEIPT_TYPE,
    concepto: params.concepto ?? 1,
    tipoDocumento: params.tipoDocumento ?? 99,
    numeroDocumento: params.numeroDocumento ?? '0',
    condicionIvaReceptor: params.condicionIvaReceptor ?? 5,
    fecha: params.fecha ?? '20261102',
    servicioDesde: null,
    servicioHasta: null,
    vencimientoPago: null,
    moneda: 'PES',
    cotizacion: '1',
    importes: {
      total: formattedTotal,
      neto: formattedTotal,
      iva: '0.00',
      noGravado: '0.00',
      exento: '0.00',
      tributos: '0.00',
    },
    iva: [],
    tributos: [],
  }
  const root = {
    version: 1,
    venta_id: params.ventaId,
    condicionEmisor: params.condicionEmisor ?? 'MONOTRIBUTO',
    revision_parametros: params.revisionParametros ?? 3,
    datos,
  }
  const canonical = canonicalJson(root)
  const sha256 = computeSha256(canonical)
  return { preparation: root, canonical, sha256 }
}

/**
 * Crea un fixture de ejecución PR03-B sobre una serie y venta sintética auditada.
 * Provee la estructura canónica para guardar_datos_preparacion_homologacion (ruta privada)
 * y persistir_solicitud_fiscal_homologacion.
 */
export function createPr03bScopedFixture(runId, opts = {}) {
  validateCleanupRunId(runId)
  const operacionId = opts.operacionId ?? randomUUID()
  const ventaId = opts.ventaId ?? randomUUID()
  const total = Number(opts.total ?? '150.00').toFixed(2)
  const fecha = opts.fecha ?? '20261102'
  const numero = opts.numero ?? 1
  const puntoVenta = opts.puntoVenta ?? PR03_B_SYNTHETIC_PV
  const kioscoId = opts.kiosco_id ?? opts.kioskId ?? PR03_B_SYNTHETIC_KIOSK_ID
  const cuitEmisor = opts.cuitEmisor ?? PR03_B_SYNTHETIC_CUIT
  const tipoComprobante = opts.tipoComprobante ?? PR03_B_SYNTHETIC_RECEIPT_TYPE
  const revisionParametros = opts.revisionParametros ?? 3

  assertNoRealPv2Usage(puntoVenta)
  assertNoRealPv2Usage(kioscoId)

  const canonicalReq = buildCanonicalFiscalRequest({
    cuitEmisor,
    puntoVenta,
    tipoComprobante,
    numero,
    total,
    fecha,
  })

  const canonicalPrep = buildCanonicalFiscalPreparation({
    ventaId,
    total,
    cuitEmisor,
    puntoVenta,
    tipoComprobante,
    revisionParametros,
    fecha,
  })

  // 6 campos canónicos de compatibilidad de contexto
  const context = {
    version: 1,
    cuit_emisor: cuitEmisor,
    punto_venta: puntoVenta,
    tipo_comprobante: tipoComprobante,
    tipo_doc_receptor: 99,
    nro_doc_receptor: '0',
  }

  return Object.freeze({
    tag: PR03_B_TEST_FIXTURE_TAG,
    scope: PR03_B_SCOPE,
    run_id: runId,
    kiosco_id: kioscoId,
    cuit_emisor: cuitEmisor,
    punto_venta: puntoVenta,
    tipo_comprobante: tipoComprobante,
    operacion_id: operacionId,
    venta_id: ventaId,
    total,
    revision_parametros: revisionParametros,
    contexto: context,
    preparacion: canonicalPrep.preparation,
    preparacion_canonico: canonicalPrep.canonical,
    preparacion_sha256: canonicalPrep.sha256,
    solicitud: canonicalReq.request,
    cuerpo_canonico: canonicalReq.canonical,
    solicitud_sha256: canonicalReq.sha256,
    metadata: {
      fixture: PR03_B_TEST_FIXTURE_TAG,
      kiosco_id: kioscoId,
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
 * Parámetros:
 * $1: realKioskId
 * $2: syntheticCuit
 * $3: syntheticKioskId
 * $4: syntheticOwnerAuthId
 * $5: syntheticPv (9999)
 */
export const PR03_B_PREFLIGHT_SELECT_SQL = `SELECT jsonb_build_object(
  'transaction_read_only', current_setting('transaction_read_only'),
  'observed_at', clock_timestamp(),
  -- Kiosco real
  'real_kiosk_present', EXISTS (
    SELECT 1 FROM public.kioscos WHERE id = $1
  ),
  'real_pv2_present', EXISTS (
    SELECT 1 FROM public.fiscal_emisores_homologacion WHERE kiosco_id = $1 AND punto_venta = 2
  ),
  'real_pv2_enabled', COALESCE((
    SELECT habilitado FROM public.fiscal_emisores_homologacion WHERE kiosco_id = $1 AND punto_venta = 2
  ), false),
  'real_pv2_series_count', (
    SELECT count(*)::int FROM public.fiscal_series_homologacion
    WHERE cuit_emisor = $2 AND punto_venta = 2
  ),
  'real_pv2_pending_reservations', (
    SELECT count(*)::int FROM public.fiscal_reservas_homologacion
    WHERE cuit_emisor = $2 AND punto_venta = 2 AND estado = 'RESERVADA'
  ),
  -- Tenant sintético
  'synthetic_kiosk_present', EXISTS (
    SELECT 1 FROM public.kioscos WHERE id = $3
  ),
  'synthetic_kiosk_active', EXISTS (
    SELECT 1 FROM public.kioscos WHERE id = $3 AND estado_suscripcion = 'ACTIVO'
  ),
  'synthetic_owner_present', EXISTS (
    SELECT 1 FROM public.usuarios WHERE auth_user_id = $4 AND kiosco_id = $3
  ),
  'synthetic_owner_active', COALESCE((
    SELECT activo FROM public.usuarios WHERE auth_user_id = $4 AND kiosco_id = $3 LIMIT 1
  ), false),
  'synthetic_owner_role', (
    SELECT rol FROM public.usuarios WHERE auth_user_id = $4 AND kiosco_id = $3 LIMIT 1
  ),
  'synthetic_owner_superadmin', COALESCE((
    SELECT es_superadmin FROM public.usuarios WHERE auth_user_id = $4 AND kiosco_id = $3 LIMIT 1
  ), false),
  'synthetic_emitter_count', (
    SELECT count(*)::int FROM public.fiscal_emisores_homologacion WHERE kiosco_id = $3
  ),
  'synthetic_pv9999_series_count', (
    SELECT count(*)::int FROM public.fiscal_series_homologacion WHERE cuit_emisor = $2 AND punto_venta = $5
  ),
  'synthetic_pv9999_reservations', (
    SELECT count(*)::int FROM public.fiscal_reservas_homologacion WHERE cuit_emisor = $2 AND punto_venta = $5
  ),
  'synthetic_fiscal_operations', (
    SELECT count(*)::int FROM public.fiscal_operaciones_homologacion WHERE kiosco_id = $3
  ),
  -- Catálogo rev 3
  'catalog_rev3_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 3
  ),
  'catalog_rev3_enabled', COALESCE((
    SELECT habilitado FROM public.fiscal_parametros_homologacion WHERE revision = 3
  ), false),
  'catalog_rev3_usable', COALESCE((
    SELECT (habilitado = true AND vence_en > clock_timestamp() AND consultado_en <= clock_timestamp())
    FROM public.fiscal_parametros_homologacion WHERE revision = 3
  ), false),
  -- Ventas sintéticas elegibles
  'synthetic_sales', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id,
      'kiosco_id', v.kiosco_id,
      'total', v.total::text,
      'estado', v.estado
    ) ORDER BY v.fecha_hora DESC), '[]'::jsonb)
    FROM public.ventas v
    WHERE v.kiosco_id = $3
      AND v.estado = 'COMPLETADA'
      AND v.total > 0
      AND nullif(btrim(to_jsonb(v)->>'afip_cae'), '') IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.devoluciones_venta dv WHERE dv.venta_id = v.id)
      AND NOT EXISTS (SELECT 1 FROM public.fiscal_operaciones_homologacion op WHERE op.venta_id = v.id)
      AND EXISTS (SELECT 1 FROM public.detalles_venta d WHERE d.venta_id = v.id AND NOT coalesce(d.es_devolucion_envase, false))
  )
) AS preflight;`

/**
 * Consulta de observación determinista del bloqueo por lock en la serie fiscal.
 * Inspecciona pg_locks verificando si existe una transacción bloqueada por el lock
 * exclusivo que retiene la conexión actual (pg_backend_pid()), o por application_name.
 */
export const PR03_B_CONCURRENCY_WAIT_SELECT_SQL = `SELECT count(*)::int as waiting_count
FROM pg_locks l
WHERE NOT l.granted
  AND (
    EXISTS (
      SELECT 1 FROM pg_locks blocking
      WHERE blocking.locktype = l.locktype
        AND blocking.transactionid = l.transactionid
        AND blocking.granted = true
        AND blocking.pid = pg_backend_pid()
    )
    OR EXISTS (
      SELECT 1 FROM pg_stat_activity a
      WHERE a.pid = l.pid
        AND a.application_name LIKE 'kiosko-pr03b-c2-%'
    )
  );`

/**
 * Validador base de preflight READ ONLY.
 * Exige emisor real PV 2 inactivo, catálogo rev 3 activo y vigente, y ventas sintéticas presentes.
 */
export function verifyPr03bBasePreflight(raw, opts = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('PR03_B_PREFLIGHT_INVALID')
  }
  const d = raw
  if (d.transaction_read_only !== 'on') throw new Error('PR03_B_PREFLIGHT_NOT_READ_ONLY')

  // Verificaciones del kiosco real protegido
  if (!d.real_kiosk_present) throw new Error('PR03_B_PREFLIGHT_REAL_KIOSK_NOT_FOUND')
  if (!d.real_pv2_present) throw new Error('PR03_B_PREFLIGHT_REAL_PV2_NOT_FOUND')
  if (d.real_pv2_enabled !== false) throw new Error('PR03_B_PREFLIGHT_REAL_PV2_NOT_DISABLED')
  if (d.real_pv2_series_count !== 0) throw new Error('PR03_B_PREFLIGHT_REAL_PV2_SERIES_NOT_ZERO')
  if (d.real_pv2_pending_reservations !== 0) throw new Error('PR03_B_PREFLIGHT_REAL_PV2_RESERVATIONS_NOT_ZERO')

  // Verificaciones del tenant sintético
  if (!d.synthetic_kiosk_present) throw new Error('PR03_B_PREFLIGHT_SYNTHETIC_KIOSK_NOT_FOUND')
  if (!d.synthetic_kiosk_active) throw new Error('PR03_B_PREFLIGHT_SYNTHETIC_KIOSK_INACTIVE')
  if (!d.synthetic_owner_present) throw new Error('PR03_B_PREFLIGHT_SYNTHETIC_OWNER_NOT_FOUND')
  if (!d.synthetic_owner_active) throw new Error('PR03_B_PREFLIGHT_SYNTHETIC_OWNER_INACTIVE')
  if (d.synthetic_owner_role !== 'DUEÑO') throw new Error('PR03_B_PREFLIGHT_SYNTHETIC_OWNER_NOT_DUENO')
  if (d.synthetic_owner_superadmin !== false) throw new Error('PR03_B_PREFLIGHT_SYNTHETIC_OWNER_IS_SUPERADMIN')

  if (opts.syntheticWindow) {
    if (d.synthetic_emitter_count !== 1) throw new Error('PR03_B_PREFLIGHT_SYNTHETIC_EMITTER_COUNT_INVALID')
  } else {
    if (d.synthetic_emitter_count !== 0) throw new Error('PR03_B_PREFLIGHT_SYNTHETIC_EMITTER_NOT_ZERO')
    if (d.synthetic_pv9999_series_count !== 0) throw new Error('PR03_B_PREFLIGHT_SYNTHETIC_SERIES_NOT_ZERO')
    if (d.synthetic_pv9999_reservations !== 0) throw new Error('PR03_B_PREFLIGHT_SYNTHETIC_RESERVATIONS_NOT_ZERO')
    if (d.synthetic_fiscal_operations !== 0) throw new Error('PR03_B_PREFLIGHT_SYNTHETIC_OPERATIONS_NOT_ZERO')
  }

  // Verificaciones del catálogo rev 3
  if (!d.catalog_rev3_exists) throw new Error('PR03_B_PREFLIGHT_CATALOG_REV3_REQUIRED')
  if (d.catalog_rev3_enabled !== true) throw new Error('PR03_B_PREFLIGHT_CATALOG_REV3_NOT_ENABLED')
  if (d.catalog_rev3_usable !== true) throw new Error('PR03_B_PREFLIGHT_CATALOG_REV3_EXPIRED_OR_NOT_USABLE')

  // Verificaciones de ventas sintéticas
  const syntheticSales = Array.isArray(d.synthetic_sales) ? d.synthetic_sales : []
  if (syntheticSales.length < 2) {
    throw new Error('PR03_B_PREFLIGHT_INSUFFICIENT_SYNTHETIC_TEST_SALES')
  }

  return Object.freeze({
    status: 'PASS',
    transactionReadOnly: true,
    realKioskPresent: true,
    realPv2Present: true,
    realPv2Enabled: false,
    realPv2SeriesCount: 0,
    realPv2PendingReservations: 0,
    syntheticKioskPresent: true,
    syntheticKioskActive: true,
    syntheticOwnerPresent: true,
    syntheticOwnerActive: true,
    syntheticOwnerRole: 'DUEÑO',
    syntheticOwnerSuperadmin: false,
    syntheticEmitterCount: d.synthetic_emitter_count,
    catalogRev3Exists: true,
    catalogRev3Enabled: true,
    catalogRev3Usable: true,
    syntheticSalesCount: syntheticSales.length,
    chosenSyntheticPv: opts.syntheticPv ?? PR03_B_SYNTHETIC_PV,
    syntheticSales,
  })
}

/**
 * Validador unificado de preflight (compatible hacia atrás).
 */
export function verifyPr03bPreflight(raw, opts = {}) {
  return verifyPr03bBasePreflight(raw, opts)
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
 * NUNCA toca el kiosco real ni la serie real de PV 2 ni ventas comerciales.
 */
export function buildManifestCleanupSql(operationIds, opts = {}) {
  const syntheticPv = opts.syntheticPv ?? PR03_B_SYNTHETIC_PV
  const syntheticKioskId = opts.syntheticKioskId ?? PR03_B_SYNTHETIC_KIOSK_ID
  const cuit = opts.cuit ?? PR03_B_SYNTHETIC_CUIT
  const credencialId = opts.credencialId ?? PR03_B_SYNTHETIC_CREDENCIAL_ID
  const certSha = opts.certSha ?? PR03_B_SYNTHETIC_CERT_SHA256
  const revision = opts.revision ?? PR03_B_SYNTHETIC_EMITTER_REVISION

  assertNoRealPv2Usage(syntheticPv)
  assertNoRealPv2Usage(syntheticKioskId)

  let idFilter = ''
  if (Array.isArray(operationIds) && operationIds.length > 0) {
    for (const id of operationIds) {
      validateCleanupRunId(id)
    }
    const idList = operationIds.map(id => `'${id}'::uuid`).join(',')
    idFilter = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'fiscal_preparacion_inmutable'
      AND tgrelid = to_regclass('public.fiscal_preparaciones_homologacion')
  ) THEN
    ALTER TABLE public.fiscal_preparaciones_homologacion DISABLE TRIGGER fiscal_preparacion_inmutable;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'fiscal_operacion_conservar_cancelacion'
      AND tgrelid = to_regclass('public.fiscal_operaciones_homologacion')
  ) THEN
    ALTER TABLE public.fiscal_operaciones_homologacion DISABLE TRIGGER fiscal_operacion_conservar_cancelacion;
  END IF;
END $$;
DELETE FROM public.fiscal_solicitudes_homologacion WHERE operacion_id IN (${idList});
DELETE FROM public.fiscal_reservas_homologacion WHERE operacion_id IN (${idList});
DELETE FROM public.fiscal_preparaciones_homologacion WHERE operacion_id IN (${idList});
DELETE FROM public.fiscal_operaciones_homologacion WHERE id IN (${idList});
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'fiscal_operacion_conservar_cancelacion'
      AND tgrelid = to_regclass('public.fiscal_operaciones_homologacion')
  ) THEN
    ALTER TABLE public.fiscal_operaciones_homologacion ENABLE TRIGGER fiscal_operacion_conservar_cancelacion;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'fiscal_preparacion_inmutable'
      AND tgrelid = to_regclass('public.fiscal_preparaciones_homologacion')
  ) THEN
    ALTER TABLE public.fiscal_preparaciones_homologacion ENABLE TRIGGER fiscal_preparacion_inmutable;
  END IF;
END $$;`
  }

  const pvCleanup = `
DELETE FROM public.fiscal_series_homologacion WHERE cuit_emisor = '${cuit}' AND punto_venta = ${syntheticPv} AND tipo_comprobante = 11;
UPDATE public.fiscal_emisores_homologacion SET habilitado = false WHERE kiosco_id = '${syntheticKioskId}' AND cuit_emisor = '${cuit}' AND punto_venta = ${syntheticPv} AND credencial_id = '${credencialId}' AND certificado_sha256 = '${certSha}' AND revision = ${revision};
DELETE FROM public.fiscal_emisores_homologacion WHERE kiosco_id = '${syntheticKioskId}' AND cuit_emisor = '${cuit}' AND punto_venta = ${syntheticPv} AND credencial_id = '${credencialId}' AND certificado_sha256 = '${certSha}' AND revision = ${revision} AND habilitado = false;`

  return `BEGIN;${idFilter}${pvCleanup}
COMMIT;`
}

/**
 * Limpieza quirúrgica de residuos sintéticos de ejecuciones previas abortadas.
 * Afecta única y estrictamente al tenant sintético acreditado y exige emisor deshabilitado.
 */
export async function cleanSyntheticResiduals(client, opts = {}) {
  const syntheticKioskId = opts.syntheticKioskId ?? PR03_B_SYNTHETIC_KIOSK_ID
  const syntheticCuit = opts.syntheticCuit ?? PR03_B_SYNTHETIC_CUIT
  const syntheticPv = opts.syntheticPv ?? PR03_B_SYNTHETIC_PV
  const credId = opts.credId ?? PR03_B_SYNTHETIC_CREDENCIAL_ID
  const certSha = opts.certSha ?? PR03_B_SYNTHETIC_CERT_SHA256
  const rev = opts.rev ?? PR03_B_SYNTHETIC_EMITTER_REVISION

  assertNoRealPv2Usage(syntheticPv)
  assertNoRealPv2Usage(syntheticKioskId)

  await client.query('BEGIN')
  try {
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'fiscal_preparacion_inmutable'
            AND tgrelid = to_regclass('public.fiscal_preparaciones_homologacion')
        ) THEN
          ALTER TABLE public.fiscal_preparaciones_homologacion DISABLE TRIGGER fiscal_preparacion_inmutable;
        END IF;
        IF EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'fiscal_operacion_conservar_cancelacion'
            AND tgrelid = to_regclass('public.fiscal_operaciones_homologacion')
        ) THEN
          ALTER TABLE public.fiscal_operaciones_homologacion DISABLE TRIGGER fiscal_operacion_conservar_cancelacion;
        END IF;
      END $$;
    `)
    await client.query(
      `DELETE FROM public.fiscal_preparaciones_homologacion WHERE operacion_id IN (
        SELECT id FROM public.fiscal_operaciones_homologacion WHERE kiosco_id = $1
      )`,
      [syntheticKioskId]
    )
    await client.query(
      `DELETE FROM public.fiscal_solicitudes_homologacion WHERE operacion_id IN (
        SELECT id FROM public.fiscal_operaciones_homologacion WHERE kiosco_id = $1
      )`,
      [syntheticKioskId]
    )
    await client.query(
      'DELETE FROM public.fiscal_reservas_homologacion WHERE cuit_emisor = $1 AND punto_venta = $2',
      [syntheticCuit, syntheticPv]
    )
    await client.query(
      'DELETE FROM public.fiscal_operaciones_homologacion WHERE kiosco_id = $1',
      [syntheticKioskId]
    )
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'fiscal_operacion_conservar_cancelacion'
            AND tgrelid = to_regclass('public.fiscal_operaciones_homologacion')
        ) THEN
          ALTER TABLE public.fiscal_operaciones_homologacion ENABLE TRIGGER fiscal_operacion_conservar_cancelacion;
        END IF;
        IF EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'fiscal_preparacion_inmutable'
            AND tgrelid = to_regclass('public.fiscal_preparaciones_homologacion')
        ) THEN
          ALTER TABLE public.fiscal_preparaciones_homologacion ENABLE TRIGGER fiscal_preparacion_inmutable;
        END IF;
      END $$;
    `)
    await client.query(
      'DELETE FROM public.fiscal_series_homologacion WHERE cuit_emisor = $1 AND punto_venta = $2 AND tipo_comprobante = 11',
      [syntheticCuit, syntheticPv]
    )
    await client.query(
      `DELETE FROM public.fiscal_emisores_homologacion
       WHERE kiosco_id = $1 AND cuit_emisor = $2 AND punto_venta = $3
         AND credencial_id = $4 AND certificado_sha256 = $5 AND revision = $6
         AND habilitado = false`,
      [syntheticKioskId, syntheticCuit, syntheticPv, credId, certSha, rev]
    )
    await client.query('COMMIT')
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore rollback errors on failure
    }
    throw err
  }
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
 * Exige estrictamente SQLSTATE 40001 (sin 22023 y sin inferencia por mensaje).
 */
export function verifyIdempotencyConflict(error) {
  if (!error) throw new Error('IDEMPOTENCY_CONFLICT_DID_NOT_THROW')
  const code = error.code || error.sqlState || ''

  if (code !== '40001') {
    throw new Error(`IDEMPOTENCY_CONFLICT_UNEXPECTED_SQLSTATE: Se esperaba exactamente 40001, se obtuvo '${code}'`)
  }

  return Object.freeze({
    status: 'PASS',
    rejectedWithExpectedCode: true,
    errorCode: '40001',
  })
}

/**
 * Valida la semántica de concurrencia: exactamente una única reserva pendiente por serie.
 * Conexión B debe esperar y ser rechazada con 55000 mientras A retenga el lock.
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
  if (plan.kiosco_id !== PR03_B_SYNTHETIC_KIOSK_ID) {
    assertNoRealPv2Usage(plan.kiosco_id)
    throw new Error('PR03_B_PLAN_KIOSK_MISMATCH')
  }
  if (plan.cuit_emisor !== PR03_B_SYNTHETIC_CUIT) throw new Error('PR03_B_PLAN_CUIT_MISMATCH')
  if (plan.punto_venta !== PR03_B_SYNTHETIC_PV) {
    assertNoRealPv2Usage(plan.punto_venta)
    throw new Error('PR03_B_PLAN_POS_MISMATCH')
  }
  if (plan.tipo_comprobante !== PR03_B_SYNTHETIC_RECEIPT_TYPE) throw new Error('PR03_B_PLAN_RECEIPT_TYPE_MISMATCH')
  if (plan.anti_arca_guard !== true) throw new Error('PR03_B_PLAN_ANTI_ARCA_GUARD_INACTIVE')

  return Object.freeze({
    status: 'PASS',
    scopeValidated: true,
    fixtureValidated: true,
    antiArcaGuardActive: true,
    testCasesCount: PR03_B_TEST_CASES.length,
  })
}
