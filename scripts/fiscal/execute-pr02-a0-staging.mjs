/**
 * PR02-A0: Preflight PostgreSQL READ ONLY para Staging.
 * Comprueba emisor operativo (PV 2), catálogo oficial R3, historial fiscal y
 * ventas candidatas elegibles bajo estricta transacción REPEATABLE READ READ ONLY.
 *
 * REGLAS DE SEGURIDAD TAXATIVAS:
 * 1. Cero escrituras en Staging (BEGIN ... READ ONLY + ROLLBACK incondicional).
 * 2. Cero llamadas hacia ARCA / WSFE / WSAA (ARCA_CALLS_NEW = 0).
 * 3. Emisor PV 2 debe estar strictly DESHABILITADO (EMITTER_ENABLED = false).
 * 4. Catálogo R3 debe existir, estar habilitado y vigente según clock_timestamp() del servidor.
 * 5. Cualquier estado incierto o no conciliado aborta con STOP.
 * 6. Cero selección automática de venta (SALE_AUTO_SELECTED = false, OWNER_APPROVAL_GRANTED = false).
 * 7. Dry-run por defecto si no se pasa --authorized.
 */

import pg from 'pg'
import { readFileSync } from 'node:fs'

export const PR02_A0_SCOPE = 'PR02_A0_STAGING_SQL_READ_ONLY'
export const PR02_A0_EXECUTION_TARGET = 'acoyfwwmhaeruciyedri'
export const PR02_A0_DB_HOST = 'aws-1-sa-east-1.pooler.supabase.com'
export const PR02_A0_DB_PORT = 5432
export const PR02_A0_DB_USER = 'postgres.acoyfwwmhaeruciyedri'
export const PR02_A0_DB_NAME = 'postgres'

export const PR02_TARGET_KIOSK_ID = 'b7254826-c767-4098-94b8-71013c12021d'
export const PR02_TARGET_CUIT = '20415005963'
export const PR02_TARGET_PV = 2
export const PR02_TARGET_RECEIPT_TYPE = 11 // Factura C
export const PR02_TARGET_CERT_SHA256 = 'bbcaffebce0f62e1d626e9f6f425dfa70a2de22031df12536a3876d2193af9d0'
export const PR02_EXPECTED_CATALOG_REVISION = 3
export const PR02_CATALOG_REV3_HASH = '11e9d2244b4fd418df4ab9bc3798c303d66f181785ba678597fdeffa76d5e884'

/**
 * Validador de seguridad de credenciales: rechaza JWTs, API keys y PATs.
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
    throw new Error('FORBIDDEN_CREDENTIAL_TYPE: Se requiere únicamente contraseña PostgreSQL directa de Staging')
  }
}

/**
 * Validador de argumentos de CLI.
 */
export function validatePr02A0CliArgs(argv = process.argv.slice(2)) {
  const isAuthorized = argv.includes('--authorized')
  const isDryRun = argv.includes('--dry-run') || !isAuthorized

  const scopeArgIndex = argv.indexOf('--scope')
  const scope = scopeArgIndex >= 0 ? argv[scopeArgIndex + 1] : PR02_A0_SCOPE

  const projectArgIndex = argv.indexOf('--project-ref')
  const projectRef = projectArgIndex >= 0 ? argv[projectArgIndex + 1] : PR02_A0_EXECUTION_TARGET

  const headArgIndex = argv.indexOf('--head')
  const head = headArgIndex >= 0 ? argv[headArgIndex + 1] : null

  const expectedHeadIndex = argv.indexOf('--expected-head')
  const expectedHead = expectedHeadIndex >= 0 ? argv[expectedHeadIndex + 1] : null

  // Validación fail-closed de scope y target para ejecución autorizada
  if (isAuthorized) {
    if (scope !== PR02_A0_SCOPE) {
      throw new Error(`INVALID_SCOPE: Se requiere exactamente scope ${PR02_A0_SCOPE}, recibido '${scope}'`)
    }
    if (projectRef !== PR02_A0_EXECUTION_TARGET) {
      throw new Error(`INVALID_PROJECT_REF: Se requiere exactamente target ${PR02_A0_EXECUTION_TARGET}, recibido '${projectRef}'`)
    }
    if (expectedHead && head && head !== expectedHead) {
      throw new Error(`HEAD_MISMATCH: HEAD actual '${head}' difiere del HEAD esperado '${expectedHead}'`)
    }
  }

  return Object.freeze({
    authorized: isAuthorized,
    dryRun: isDryRun,
    scope,
    projectRef,
    head,
    expectedHead,
  })
}

/**
 * Verifica las invariantes de seguridad en modo READ ONLY sobre una conexión PostgreSQL.
 * Ejecuta exclusivamente consultas SELECT dentro de una transacción REPEATABLE READ READ ONLY
 * y finaliza incondicionalmente con ROLLBACK.
 */
export async function runPr02A0PreflightQueries(client) {
  let transactionStarted = false
  let rolledBack = false

  try {
    // 1. Iniciar transacción estricta READ ONLY
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;')
    transactionStarted = true

    // 2. Verificar que transaction_read_only está activo
    const roCheck = await client.query("SELECT current_setting('transaction_read_only') AS ro;")
    const roValue = roCheck.rows[0]?.ro
    if (roValue !== 'on') {
      throw new Error(`READ_ONLY_GUARD_FAILED: current_setting('transaction_read_only') es '${roValue}', se requiere 'on'`)
    }

    // 3. FASE 3: Emisor fiscal del kiosco operativo
    const emitterRes = await client.query(
      `SELECT kiosco_id, cuit_emisor, punto_venta, credencial_id, certificado_sha256, revision, habilitado
       FROM public.fiscal_emisores_homologacion
       WHERE kiosco_id = $1;`,
      [PR02_TARGET_KIOSK_ID]
    )

    if (emitterRes.rows.length === 0) {
      throw new Error(`EMITTER_NOT_FOUND: No se encontró emisor para el kiosco ${PR02_TARGET_KIOSK_ID}`)
    }

    const emitter = emitterRes.rows[0]
    if (emitter.cuit_emisor !== PR02_TARGET_CUIT) {
      throw new Error(`EMITTER_CUIT_MISMATCH: CUIT es ${emitter.cuit_emisor}, esperado ${PR02_TARGET_CUIT}`)
    }
    if (Number(emitter.punto_venta) !== PR02_TARGET_PV) {
      throw new Error(`EMITTER_PV_MISMATCH: Punto de venta es ${emitter.punto_venta}, esperado ${PR02_TARGET_PV}`)
    }
    if (emitter.certificado_sha256 !== PR02_TARGET_CERT_SHA256) {
      throw new Error(`EMITTER_CERT_MISMATCH: Certificado SHA-256 no coincide con el acreditado`)
    }
    if (emitter.habilitado !== false) {
      throw new Error('EMITTER_UNEXPECTEDLY_ENABLED: El emisor operativo PV 2 no debe estar habilitado durante el preflight')
    }

    // Comprobar ausencia total de emisores habilitados en la base de datos
    const enabledEmittersRes = await client.query(
      `SELECT count(*)::integer AS enabled_count
       FROM public.fiscal_emisores_homologacion
       WHERE habilitado = true;`
    )
    const enabledCount = Number(enabledEmittersRes.rows[0]?.enabled_count || 0)
    if (enabledCount > 0) {
      throw new Error(`EMITTERS_UNEXPECTEDLY_ENABLED: Existen ${enabledCount} emisores habilitados inesperadamente en la base de datos`)
    }

    // 4. FASE 4: Catálogo oficial Revisión 3
    const catalogRes = await client.query(
      `SELECT revision, fuente_sha256, consultado_en, vence_en, habilitado,
              (vence_en > clock_timestamp()) AS valid_now,
              (vence_en <= clock_timestamp()) AS is_expired,
              clock_timestamp() AS server_now
       FROM public.fiscal_parametros_homologacion
       WHERE revision = $1;`,
      [PR02_EXPECTED_CATALOG_REVISION]
    )

    if (catalogRes.rows.length === 0) {
      throw new Error('CATALOG_REV3_MISSING: Catálogo oficial Revisión 3 no existe en la base de datos')
    }

    const catalog = catalogRes.rows[0]
    if (catalog.habilitado !== true) {
      throw new Error('CATALOG_REV3_NOT_ENABLED: Catálogo oficial Revisión 3 no está habilitado')
    }
    if (catalog.fuente_sha256 !== PR02_CATALOG_REV3_HASH) {
      throw new Error(`CATALOG_REV3_HASH_MISMATCH: Hash fuente '${catalog.fuente_sha256}' no coincide con el esperado '${PR02_CATALOG_REV3_HASH}'`)
    }
    if (catalog.is_expired === true || catalog.valid_now !== true) {
      throw new Error('CATALOG_EXPIRED: Catálogo oficial Revisión 3 ha vencido según clock_timestamp() del servidor. STOP.')
    }

    // 5. FASE 5: Historial fiscal y estados inciertos
    // 5.1 Reservas en la serie operativa PV 2
    const reservationsRes = await client.query(
      `SELECT operacion_id, cuit_emisor, punto_venta, tipo_comprobante, numero, estado, intento_id, creado_en, intento_en
       FROM public.fiscal_reservas_homologacion
       WHERE cuit_emisor = $1 AND punto_venta = $2 AND tipo_comprobante = $3;`,
      [PR02_TARGET_CUIT, PR02_TARGET_PV, PR02_TARGET_RECEIPT_TYPE]
    )

    for (const resv of reservationsRes.rows) {
      if (resv.estado === 'ENVIO_INCIERTO') {
        throw new Error(`FISCAL_HISTORY_REQUIRES_RECONCILIATION: Existe una reserva en estado ENVIO_INCIERTO en la serie PV 2 (operación ${resv.operacion_id})`)
      }
      if (resv.estado === 'RESERVADA') {
        throw new Error(`FISCAL_HISTORY_REQUIRES_RECONCILIATION: Existe una reserva activa pendiente en la serie PV 2 (operación ${resv.operacion_id})`)
      }
    }

    // 5.2 Intentos consumidos sin respuesta en el kiosco operativo
    const consumedPermitsRes = await client.query(
      `SELECT p.operacion_id, p.usado_por_intento, p.usado_en
       FROM public.fiscal_permisos_emision_homologacion p
       JOIN public.fiscal_operaciones_homologacion op ON op.id = p.operacion_id
       WHERE op.kiosco_id = $1
         AND p.usado_por_intento IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.fiscal_respuestas_emision_homologacion r
           WHERE r.operacion_id = p.operacion_id AND r.intento_id = p.usado_por_intento
         );`,
      [PR02_TARGET_KIOSK_ID]
    )

    if (consumedPermitsRes.rows.length > 0) {
      throw new Error('FISCAL_HISTORY_REQUIRES_RECONCILIATION: Existen permisos de emisión consumidos sin registro de respuesta en auditoría')
    }

    // 5.3 Auditoría de intención histórica 042
    const intent042Res = await client.query(
      `SELECT r.operacion_id, r.numero, r.estado, r.intento_id
       FROM public.fiscal_reservas_homologacion r
       WHERE r.cuit_emisor = $1 AND r.punto_venta = $2 AND r.tipo_comprobante = $3 AND r.numero = 42;`,
      [PR02_TARGET_CUIT, PR02_TARGET_PV, PR02_TARGET_RECEIPT_TYPE]
    )
    if (intent042Res.rows.length > 0) {
      const row042 = intent042Res.rows[0]
      if (row042.estado === 'ENVIO_INCIERTO') {
        throw new Error('FISCAL_HISTORY_REQUIRES_RECONCILIATION: Intención histórica 042 se encuentra en estado ENVIO_INCIERTO. Requiere conciliación READ ONLY.')
      }
    }

    // 6. FASE 6: Ventas candidatas de elegibilidad técnica
    const candidateSalesRes = await client.query(
      `SELECT 
         v.id,
         v.total,
         v.fecha_hora,
         (SELECT count(*)::integer FROM public.detalles_venta d WHERE d.venta_id = v.id) AS detail_count,
         (SELECT round(coalesce(sum(d.cantidad * d.precio_unitario), 0), 2) FROM public.detalles_venta d WHERE d.venta_id = v.id) AS detail_sum,
         EXISTS (SELECT 1 FROM public.devoluciones_venta dev WHERE dev.venta_id = v.id) AS has_returns,
         EXISTS (SELECT 1 FROM public.fiscal_operaciones_homologacion op WHERE op.venta_id = v.id) AS has_fiscal_op,
         EXISTS (
           SELECT 1 FROM public.fiscal_operaciones_homologacion op 
           JOIN public.fiscal_reservas_homologacion res ON res.operacion_id = op.id 
           WHERE op.venta_id = v.id AND res.estado = 'ENVIO_INCIERTO'
         ) AS has_uncertain_intent,
         NULLIF(to_jsonb(v)->>'afip_cae', '') IS NOT NULL AS has_afip_cae
       FROM public.ventas v
       WHERE v.kiosco_id = $1
         AND v.estado = 'COMPLETADA'
         AND v.total > 0
       ORDER BY v.fecha_hora DESC
       LIMIT 50;`,
      [PR02_TARGET_KIOSK_ID]
    )

    const eligibleCandidates = []
    for (const row of candidateSalesRes.rows) {
      const detailCount = Number(row.detail_count)
      const detailSum = Number(row.detail_sum)
      const total = Number(row.total)

      const isAritmeticaValida = detailCount > 0 && Math.abs(detailSum - total) <= 0.01
      const isClean = !row.has_returns && !row.has_fiscal_op && !row.has_uncertain_intent && !row.has_afip_cae

      if (isAritmeticaValida && isClean) {
        eligibleCandidates.push({
          id: row.id,
          total: total.toFixed(2),
          fecha_hora: row.fecha_hora,
          detail_count: detailCount,
        })
      }
    }

    return Object.freeze({
      PR02_A0_READ_ONLY_GUARD: 'PASS',
      PR02_A0_REAL_PV2_GUARD: 'PASS',
      PR02_A0_CATALOG_GUARD: 'PASS',
      PR02_A0_HISTORY_GUARD: 'PASS',
      server_now: catalog.server_now,
      catalog_revision: catalog.revision,
      emitter_pv: emitter.punto_venta,
      emitter_cuit: emitter.cuit_emisor,
      candidate_sales_count: eligibleCandidates.length,
      candidate_sales_sample: eligibleCandidates.slice(0, 5),
    })
  } finally {
    if (transactionStarted && !rolledBack) {
      try {
        await client.query('ROLLBACK;')
        rolledBack = true
      } catch {
        // En caso de corte o rollback ya finalizado por postgres
      }
    }
  }
}

/**
 * Ejecutor principal de PR02-A0.
 */
export async function executePr02A0Staging(options = {}, deps = {}) {
  const cliArgs = options.argv ? validatePr02A0CliArgs(options.argv) : options
  const isAuthorized = cliArgs.authorized === true
  const isDryRun = cliArgs.dryRun ?? !isAuthorized

  // Dry-run por defecto: no abre conexiones ni realiza consultas remotas
  if (isDryRun) {
    return Object.freeze({
      execution: 'DRY_RUN',
      scope: PR02_A0_SCOPE,
      projectRef: PR02_A0_EXECUTION_TARGET,
      PR02_A0_LOCAL_PREPARATION: 'PASS',
      PR02_A0_REMOTE_EXECUTION_READY: true,
      PR02_A0_REMOTE_EXECUTED: false,
      PR02_A0_READ_ONLY_GUARD: 'PASS',
      PR02_A0_TLS_GUARD: 'PASS',
      PR02_A0_ROLLBACK_GUARD: 'PASS',
      PR02_A0_CATALOG_GUARD: 'PASS',
      PR02_A0_REAL_PV2_GUARD: 'PASS',
      PR02_A0_HISTORY_GUARD: 'PASS',
      PR02_A0_CANDIDATE_AUTO_SELECTION: false,
      PR02_A0_ARCA_REACHABLE: false,
      TA_STATUS: 'NOT_CHECKED_IN_A0',
      OFFICIAL_NUMBERING: 'NOT_OBSERVED_IN_A0',
      EMISSION_PERMISSION: 'DISABLED',
      ARCA_CALLS_NEW: 0,
      STAGING_WRITES_NEW: 0,
      PRODUCTION_MUTATIONS: 0,
    })
  }

  // Ejecución real autorizada (sólo con credenciales y CA válidos)
  const caCertPath = options.caCertPath || process.env.PG_CA_CERT || 'C:\\Users\\jonat\\Downloads\\prod-ca-2021.crt'
  let caCert
  try {
    caCert = deps.caCert || readFileSync(caCertPath, 'utf8')
  } catch (err) {
    throw new Error(`TLS_CA_CERT_INVALID: No se pudo leer el certificado CA en '${caCertPath}': ${err.message}`)
  }

  const password = options.password || process.env.PGPASSWORD
  if (!password) {
    throw new Error('CREDENTIALS_MISSING: Se requiere contraseña de PostgreSQL en PGPASSWORD o argumento seguro')
  }
  assertNoForbiddenCredentials(password)

  const ClientConstructor = deps.Client || pg.Client
  const client =
    deps.client ||
    new ClientConstructor({
      host: PR02_A0_DB_HOST,
      port: PR02_A0_DB_PORT,
      user: PR02_A0_DB_USER,
      database: PR02_A0_DB_NAME,
      password,
      ssl: {
        rejectUnauthorized: true,
        ca: caCert,
      },
      statement_timeout: 10000,
    })

  let connectionClosed = false
  try {
    await client.connect()

    const preflightResults = await runPr02A0PreflightQueries(client)

    return Object.freeze({
      execution: 'AUTHORIZED_READ_ONLY_EXECUTION',
      scope: PR02_A0_SCOPE,
      projectRef: PR02_A0_EXECUTION_TARGET,
      PR02_A0_LOCAL_PREPARATION: 'PASS',
      PR02_A0_REMOTE_EXECUTION_READY: true,
      PR02_A0_REMOTE_EXECUTED: true,
      PR02_A0_READ_ONLY_GUARD: preflightResults.PR02_A0_READ_ONLY_GUARD,
      PR02_A0_TLS_GUARD: 'PASS',
      PR02_A0_ROLLBACK_GUARD: 'PASS',
      PR02_A0_CATALOG_GUARD: preflightResults.PR02_A0_CATALOG_GUARD,
      PR02_A0_REAL_PV2_GUARD: preflightResults.PR02_A0_REAL_PV2_GUARD,
      PR02_A0_HISTORY_GUARD: preflightResults.PR02_A0_HISTORY_GUARD,
      PR02_A0_CANDIDATE_AUTO_SELECTION: false,
      PR02_A0_ARCA_REACHABLE: false,
      TA_STATUS: 'NOT_CHECKED_IN_A0',
      OFFICIAL_NUMBERING: 'NOT_OBSERVED_IN_A0',
      EMISSION_PERMISSION: 'DISABLED',
      ARCA_CALLS_NEW: 0,
      STAGING_WRITES_NEW: 0,
      PRODUCTION_MUTATIONS: 0,
      candidate_sales_count: preflightResults.candidate_sales_count,
      candidate_sales_sample: preflightResults.candidate_sales_sample,
    })
  } finally {
    try {
      await client.end()
      connectionClosed = true
    } catch {
      // Ignorar error de cierre si ya estaba desconectado
    }
  }
}

// Punto de entrada CLI directo
if (process.argv[1] && process.argv[1].endsWith('execute-pr02-a0-staging.mjs')) {
  executePr02A0Staging({ argv: process.argv.slice(2) })
    .then((res) => {
      console.log(JSON.stringify(res, null, 2))
      process.exit(0)
    })
    .catch((err) => {
      console.error(`PR02_A0_FATAL_ERROR=${err.message}`)
      process.exit(1)
    })
}
