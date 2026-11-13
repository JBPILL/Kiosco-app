/**
 * Plan de Preparación Segura y Arquitectura de Control para PR02 (Sin Emisión).
 * Define contratos, políticas de selección de venta, protección de historial,
 * pre-condiciones obligatorias y fases de ejecución.
 *
 * NOTA DE SEGURIDAD:
 * Este módulo contiene lógica de validación, contratos y un simulador local
 * para arneses de prueba (TEST-ONLY). No efectúa transporte remoto hacia ARCA.
 */

export const PR02_P0_SCOPE = 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'
export const PR02_P1_SCOPE = 'PR02_P1_VERIFIED_CATALOG_IMPORT'
export const PR02_P2_SCOPE = 'PR02_P2_CATALOG_ENABLE'

export const PR02_TARGET_KIOSK_ID = 'b7254826-c767-4098-94b8-71013c12021d'
export const PR02_TARGET_CUIT = '20415005963'
export const PR02_TARGET_PV = 2
export const PR02_TARGET_RECEIPT_TYPE = 11 // Factura C
export const PR02_TARGET_CERT_SHA256 = 'bbcaffebce0f62e1d626e9f6f425dfa70a2de22031df12536a3876d2193af9d0'
export const PR02_HISTORICAL_CATALOG_REVISION = 3
export const PR02_TARGET_CATALOG_REVISION_R4 = 4
export const PR02_EXPECTED_CATALOG_REVISION = 3
export const PR02_SUPPORTED_CATALOG_REVISIONS = Object.freeze([3, 4])
export const IS_PR02_SIMULATION_TEST_ONLY = true

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Fases estrictamente separadas de PR02.
 * Desacopla comprobación SQL, adquisición de evidencia P0, importación P1, activación P2, autenticación WSAA, lectura oficial y emisión.
 */
export const PR02_PHASES = Object.freeze({
  PR02_A0: Object.freeze({
    id: 'PR02_A0_STAGING_SQL_READ_ONLY',
    description: 'Comprobación previa en PostgreSQL de Staging en modo READ ONLY. Cero llamadas ARCA, cero escrituras.',
    arcaCallsMax: 0,
    emissionAllowed: false,
    readOnly: true,
    stagingWrites: 0,
  }),
  PR02_P0: Object.freeze({
    id: PR02_P0_SCOPE,
    description: 'Adquisición y manifestación de evidencia oficial WSAA/WSFE (TiposIva y CondicionIvaReceptor). Cero escrituras Staging, cero emisión.',
    arcaCallsMax: 3,
    emissionAllowed: false,
    readOnly: true,
    stagingWrites: 0,
  }),
  PR02_P1: Object.freeze({
    id: PR02_P1_SCOPE,
    description: 'Importación transaccional insert-only de parámetros fiscales verificados con evidencia oficial P0 (Revisión 4 deshabilitada). Cero llamadas ARCA, cero emisión.',
    arcaCallsMax: 0,
    emissionAllowed: false,
    stagingWrites: 1,
    targetRevision: 4,
  }),
  PR02_P2: Object.freeze({
    id: PR02_P2_SCOPE,
    description: 'Habilitación atómica y controlada de la Revisión 4 del catálogo fiscal. Cero llamadas ARCA, cero emisión.',
    arcaCallsMax: 0,
    emissionAllowed: false,
    stagingWrites: 1,
    targetRevision: 4,
  }),
  PR02_A1: Object.freeze({
    id: 'PR02_A1_WSAA_AUTH_IF_REQUIRED',
    description: 'Autorización independiente para un único LoginCms vía WSAA si no existe TA válido y reutilizable.',
    arcaCallsMax: 1,
    emissionAllowed: false,
    readOnly: true,
    service: 'WSAA',
  }),
  PR02_A2: Object.freeze({
    id: 'PR02_A2_LAST_AUTHORIZED_READ_ONLY',
    description: 'Máximo una llamada FECompUltimoAutorizado con el contexto fiscal exacto de PV 2 y TA válido.',
    arcaCallsMax: 1,
    emissionAllowed: false,
    readOnly: true,
    service: 'WSFE',
  }),
  PR02_B: Object.freeze({
    id: 'PR02_B_DURABLE_SINGLE_INTENT_PREPARATION',
    description: 'Congelar venta aprobada, preparar cuerpo de 5 claves, SHA256 inmutable y reserva atómica de número',
    arcaCallsMax: 0,
    emissionAllowed: false,
    readOnly: false,
  }),
  PR02_C: Object.freeze({
    id: 'PR02_C_FIRST_HOMOLOGATION_EMISSION',
    description: 'Registro durable de permiso antes de SOAP y máximo 1 FECAESolicitar. STOP ante respuesta incierta',
    arcaCallsMax: 1,
    emissionAllowed: true,
    readOnly: false,
    noAutoRetry: true,
  }),
  PR02_D: Object.freeze({
    id: 'PR02_D_RECONCILIATION_AND_CAE',
    description: 'FECompConsultar ante incertidumbre o comprobación, persistencia de CAE y efecto comercial único',
    arcaCallsMax: 1,
    emissionAllowed: false,
    readOnly: false,
  }),
})

/**
 * Valida la política de selección de venta candidata para PV 2.
 * Requiere evidencia documental y de base de datos completa.
 * Falla cerrado si la venta o su evidencia de auditoría no cumplen los requisitos taxativos.
 */
export function validatePr02CandidateSale(sale) {
  if (!sale || typeof sale !== 'object') {
    throw new Error('CANDIDATE_SALE_INVALID: Objeto de venta no suministrado')
  }

  // 1. Identidad del kiosco exacta
  if (sale.kiosco_id !== PR02_TARGET_KIOSK_ID) {
    throw new Error(
      `CANDIDATE_SALE_KIOSK_MISMATCH: El kiosco de la venta (${sale.kiosco_id}) no coincide con el emisor objetivo (${PR02_TARGET_KIOSK_ID})`
    )
  }

  // 2. Identificador de venta UUID válido
  if (typeof sale.id !== 'string' || !UUID_REGEX.test(sale.id)) {
    throw new Error('CANDIDATE_SALE_INVALID_ID: El identificador de la venta debe ser un UUID canónico válido')
  }

  // 3. Debe estar COMPLETADA
  if (sale.estado !== 'COMPLETADA') {
    throw new Error('CANDIDATE_SALE_NOT_COMPLETED: La venta no está en estado COMPLETADA')
  }

  // 4. Total positivo, finito y detalles válidos
  const total = Number(sale.total)
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error('CANDIDATE_SALE_TOTAL_NON_POSITIVE: El total de la venta debe ser un número positivo y finito')
  }
  if (!Array.isArray(sale.detalles) || sale.detalles.length === 0) {
    throw new Error('CANDIDATE_SALE_INVALID_DETAILS: La venta debe contener detalles de productos')
  }

  let sumDetalles = 0
  for (const det of sale.detalles) {
    if (!det || typeof det !== 'object') {
      throw new Error('CANDIDATE_SALE_INVALID_DETAILS: Detalle de producto inválido')
    }
    const cant = Number(det.cantidad)
    const precio = Number(det.precio_unitario)
    if (!Number.isFinite(cant) || cant <= 0 || !Number.isFinite(precio) || precio <= 0) {
      throw new Error('CANDIDATE_SALE_INVALID_DETAILS: Cantidad o precio inválido, no finito o no positivo')
    }
    sumDetalles += Math.round(cant * precio * 100) / 100
  }

  // Comprobar coincidencia aritmética con tolerancia de redondeo comercial
  if (Math.abs(sumDetalles - total) > 0.01) {
    throw new Error(
      `CANDIDATE_SALE_SUM_MISMATCH: La suma de detalles (${sumDetalles.toFixed(2)}) no coincide con el total (${total.toFixed(2)})`
    )
  }

  // 5. No debe tener CAE previo
  if (sale.cae !== null && sale.cae !== undefined && String(sale.cae).trim() !== '') {
    throw new Error('CANDIDATE_SALE_ALREADY_HAS_CAE: La venta ya posee un CAE emitido previamente')
  }

  // 6. Evidencia de auditoría persistida obligatoria (no se admiten booleanos libres)
  const audit = sale.auditEvidence
  if (!audit || typeof audit !== 'object') {
    throw new Error('CANDIDATE_SALE_AUDIT_EVIDENCE_MISSING: Evidencia de auditoría persistida no suministrada')
  }

  if (audit.returnsAudit !== 'CLEAN') {
    throw new Error('CANDIDATE_SALE_INCOMPATIBLE_RETURNS: La venta tiene devoluciones comerciales asociadas')
  }

  if (audit.pendingOperationsAudit !== 'CLEAN') {
    throw new Error('CANDIDATE_SALE_PENDING_OPERATION: La venta ya tiene una operación fiscal activa en preparación')
  }

  if (audit.uncertainIntentsAudit !== 'CLEAN') {
    throw new Error('CANDIDATE_SALE_UNCERTAIN_INTENT: La venta tiene un intento fiscal previo en estado ENVIO_INCIERTO')
  }

  // 7. Aprobación expresa y nominativa del Dueño vinculada a la venta
  const owner = audit.ownerApprovalAudit
  if (!owner || typeof owner !== 'object') {
    throw new Error('CANDIDATE_SALE_NOT_OWNER_APPROVED: La venta no cuenta con evidencia de aprobación del Dueño')
  }
  if (typeof owner.approvedByAuthId !== 'string' || !UUID_REGEX.test(owner.approvedByAuthId)) {
    throw new Error('CANDIDATE_SALE_NOT_OWNER_APPROVED: Identidad de autenticación del Dueño inválida o faltante')
  }
  if (owner.approvedVentaId !== sale.id) {
    throw new Error('CANDIDATE_SALE_NOT_OWNER_APPROVED: La aprobación del Dueño no corresponde al ID exacto de esta venta')
  }
  if (!owner.approvedAt || !Number.isFinite(Date.parse(String(owner.approvedAt)))) {
    throw new Error('CANDIDATE_SALE_NOT_OWNER_APPROVED: Marca temporal de aprobación del Dueño inválida')
  }

  return Object.freeze({
    valid: true,
    kioskId: PR02_TARGET_KIOSK_ID,
    puntoVenta: PR02_TARGET_PV,
    tipoComprobante: PR02_TARGET_RECEIPT_TYPE,
    saleId: sale.id,
    total: total.toFixed(2),
  })
}

/**
 * Protege de forma inviolable el historial fiscal.
 * Rechaza la reemisión de la intención histórica 042 o de cualquier intento previo incierto
 * sin autorización administrativa específica.
 * Evita la heurística ingenua de substring ("includes('042')") para no generar falsos positivos sobre UUIDs modernos.
 */
export function assertNotHistoricalIntent042(intent) {
  if (!intent || typeof intent !== 'object') return
  const id = String(intent.id ?? intent.intento_id ?? intent.operacion_id ?? '')
  const action = String(intent.accion ?? intent.action ?? '').toUpperCase()
  const isEmission = ['FECAESOLICITAR', 'EMITIR', 'SEND_EMISSION'].includes(action)

  // Identificación exacta de la intención histórica 042 (sin falsos positivos por substrings en UUIDs)
  const isHistorical042 =
    intent.isHistorical042 === true ||
    intent.tag === 'HISTORICAL_INTENT_042' ||
    id === '042' ||
    id === 'INTENT_042' ||
    id === 'operacion_042_historica'

  if (isHistorical042) {
    if (isEmission) {
      throw new Error(
        'FATAL: HISTORICAL_INTENT_042_REEMISSION_FORBIDDEN: La intención histórica 042 no puede recibir un segundo FECAESolicitar. Sólo conciliación READ ONLY.'
      )
    }
  }

  // Blindaje general: ningún intento previo incierto o sin autorización explícita de reemisión puede reenviarse
  if (intent.estado === 'ENVIO_INCIERTO' || intent.hasUncertainIntent === true) {
    if (isEmission && intent.allowReemission !== true) {
      throw new Error(
        'FATAL: EXISTING_UNCERTAIN_INTENT_REEMISSION_FORBIDDEN: Un intento en estado ENVIO_INCIERTO no puede reenviarse directamente sin conciliación previa'
      )
    }
  }
}

/**
 * Verifica las condiciones previas de seguridad antes de autorizar cualquier fase de PR02.
 * Falla cerrado si cualquier parámetro es omitido o default implícito favorable.
 */
export function verifyPr02Preconditions(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('PRECONDITIONS_FAILED: Objeto de precondiciones no provisto (fail-closed)')
  }

  const {
    catalogRevision,
    catalogEnabled,
    catalogExpired,
    taValid,
    taExpiresAt,
    cuit,
    puntoVenta,
    kioskId,
    certSha,
    workerEmissionEnabled,
    officialNumberingObservation,
  } = opts

  // 1. Catálogo oficial soportado (R3 histórico o R4 activo explícito)
  const allowedRevisions = opts.allowedCatalogRevisions || PR02_SUPPORTED_CATALOG_REVISIONS
  if (catalogRevision === undefined || !allowedRevisions.includes(catalogRevision)) {
    throw new Error(`PRECONDITION_FAILED: Catálogo debe ser una revisión soportada [${allowedRevisions.join(', ')}] (suministrado: ${catalogRevision})`)
  }
  if (catalogEnabled !== true) {
    throw new Error(`PRECONDITION_FAILED: Catálogo Revisión ${catalogRevision} debe estar explícitamente habilitado`)
  }
  if (catalogExpired !== false) {
    throw new Error(`PRECONDITION_FAILED: Catálogo Revisión ${catalogRevision} vencido o fuera de vigencia`)
  }

  // 2. TA y Credenciales con marca temporal real
  const now = Date.now()
  if (taValid !== true) {
    throw new Error('PRECONDITION_FAILED: TA no disponible o inválido. Prohibido reusar TA expirado; requiere nuevo LoginCms')
  }
  if (typeof taExpiresAt !== 'number' || !Number.isFinite(taExpiresAt) || taExpiresAt <= now) {
    throw new Error('PRECONDITION_FAILED: TA vencido o sin marca temporal finita. Requiere nuevo LoginCms')
  }

  // 3. Emisor Operativo explícito
  if (kioskId !== PR02_TARGET_KIOSK_ID) {
    throw new Error(`PRECONDITION_FAILED: Kiosco debe ser ${PR02_TARGET_KIOSK_ID}`)
  }
  if (cuit !== PR02_TARGET_CUIT) {
    throw new Error(`PRECONDITION_FAILED: CUIT debe ser ${PR02_TARGET_CUIT}`)
  }
  if (puntoVenta !== PR02_TARGET_PV) {
    throw new Error(`PRECONDITION_FAILED: Punto de venta debe ser ${PR02_TARGET_PV}`)
  }
  if (certSha !== PR02_TARGET_CERT_SHA256) {
    throw new Error('PRECONDITION_FAILED: Certificado SHA-256 no coincide con el acreditado')
  }

  // 4. Worker de emisión inicialmente deshabilitado en preparación
  if (workerEmissionEnabled !== false) {
    throw new Error('PRECONDITION_FAILED: Worker de emisión no debe estar habilitado durante la fase de preparación')
  }

  // 5. Observación oficial de numeración si fue provista
  if (officialNumberingObservation) {
    if (
      officialNumberingObservation.cuit !== PR02_TARGET_CUIT ||
      officialNumberingObservation.puntoVenta !== PR02_TARGET_PV ||
      officialNumberingObservation.tipoComprobante !== PR02_TARGET_RECEIPT_TYPE ||
      typeof officialNumberingObservation.ultimoNumero !== 'number' ||
      officialNumberingObservation.ultimoNumero < 0 ||
      typeof officialNumberingObservation.observedAt !== 'number' ||
      now - officialNumberingObservation.observedAt > 300000 // 5 minutos de vigencia de observación
    ) {
      throw new Error('PRECONDITION_FAILED: Observación oficial de numeración ausente, inválida o expirada')
    }
  }

  return Object.freeze({
    status: 'PASS',
    STAGING_SQL_PREFLIGHT: 'PASS',
    WSAA_AUTHENTICATION_STATUS: taExpiresAt > now ? 'VALID' : 'EXPIRED',
    WSFE_NUMBERING_OBSERVATION: officialNumberingObservation ? 'VALID' : 'PENDING_PR02_A2',
    EMISSION_PERMISSION: 'DISABLED_FAIL_CLOSED',
    catalogReady: true,
    credentialsReady: true,
    emitterReady: true,
    workerReady: true,
  })
}

/**
 * SIMULACIÓN LOCAL EXCLUSIVA PARA TESTS UNITARIOS Y DE INTEGRACIÓN.
 * NO es un orquestador remoto de emisión.
 * Exige verificación de estado durable previo para impedir cualquier doble SOAP.
 */
export async function executePr02Simulation(params, deps) {
  const { sale, frozenRequest, intentId } = params
  const {
    getExistingIntent,
    persistIntentDurable,
    persistIntentUncertain,
    sendSoapEmission,
    consultSoapVoucher,
    applyCommercialResolution,
  } = deps

  // 1. Validar venta candidata con evidencia
  validatePr02CandidateSale(sale)

  // 2. Proteger contra reemisión histórica o de intentos inciertos
  assertNotHistoricalIntent042({ id: intentId, accion: 'FECAESolicitar' })

  // 3. CONSULTA PREVIA DEL ESTADO DURABLE: si el intento ya existe en base de datos,
  // NUNCA llamar a sendSoapEmission de nuevo
  if (typeof getExistingIntent === 'function') {
    const existing = await getExistingIntent(intentId)
    if (existing) {
      if (existing.estado === 'CAE_CONFIRMADO_Y_APLICADO' || existing.estado === 'APROBACION_RECIBIDA') {
        return Object.freeze({
          estado: 'CAE_CONFIRMADO_Y_APLICADO',
          cae: existing.cae,
          vencimiento: existing.vencimiento,
          commercialApplied: 'IDEMPOTENT',
          puedeReenviar: false,
          REPLAY_SECOND_SOAP_CALL: 0,
        })
      }
      if (existing.estado === 'ENVIO_INCIERTO') {
        return Object.freeze({
          estado: 'ENVIO_INCIERTO',
          puedeReenviar: false,
          cae: null,
          blockedForReconciliation: true,
          REPLAY_SECOND_SOAP_CALL: 0,
        })
      }
      if (existing.estado === 'RECHAZO_RECIBIDO') {
        return Object.freeze({
          estado: 'RECHAZO_RECIBIDO',
          puedeReenviar: false,
          cae: null,
          codigos: existing.codigos ?? [],
          REPLAY_SECOND_SOAP_CALL: 0,
        })
      }
      return Object.freeze({
        estado: existing.estado,
        puedeReenviar: false,
        cae: existing.cae ?? null,
        blockedForReconciliation: true,
        REPLAY_SECOND_SOAP_CALL: 0,
      })
    }
  }

  // 4. Paso crítico: persistir intención durable ANTES de invocar SOAP y comprobar identidad exacta
  const persistedIntent = await persistIntentDurable({
    intentId,
    saleId: sale.id,
    sha256: frozenRequest.sha256,
    numero: frozenRequest.solicitud.numero,
    estado: 'INTENTO_REGISTRADO',
  })

  if (
    !persistedIntent ||
    persistedIntent.estado !== 'INTENTO_REGISTRADO' ||
    persistedIntent.intentId !== intentId ||
    persistedIntent.saleId !== sale.id ||
    persistedIntent.sha256 !== frozenRequest.sha256 ||
    persistedIntent.numero !== frozenRequest.solicitud.numero
  ) {
    throw new Error('FISCAL_WSFE_NO_CONFIRMADO: Falló la verificación de identidad del registro durable previo a SOAP')
  }

  // 5. Enviar SOAP exactamente una vez
  let soapResult
  try {
    soapResult = await sendSoapEmission(frozenRequest)
  } catch (err) {
    // Timeout o falla de red -> Persistencia obligatoria de ENVIO_INCIERTO
    if (typeof persistIntentUncertain !== 'function') {
      throw new Error(
        'FATAL_UNRECONCILED_STATE: Handler persistIntentUncertain no provisto; no se puede dejar incertidumbre en memoria'
      )
    }

    let uncertainPersistence
    try {
      uncertainPersistence = await persistIntentUncertain({
        intentId,
        saleId: sale.id,
        estado: 'ENVIO_INCIERTO',
        error: err.message,
      })
    } catch (persistErr) {
      throw new Error(`FATAL_UNRECONCILED_STATE: Error crítico no conciliado al persistir ENVIO_INCIERTO: ${persistErr.message}`)
    }

    if (!uncertainPersistence || uncertainPersistence.confirmed !== true) {
      throw new Error('FATAL_UNRECONCILED_STATE: La persistencia de ENVIO_INCIERTO no fue confirmada de forma durable')
    }

    return Object.freeze({
      estado: 'ENVIO_INCIERTO',
      puedeReenviar: false,
      cae: null,
      error: err.message,
      UNCERTAIN_STATE_DURABLY_CONFIRMED: true,
      REPLAY_SECOND_SOAP_CALL: 0,
    })
  }

  // 6. Si fue rechazo
  if (soapResult.estado === 'RECHAZO_RECIBIDO') {
    await deps.markIntentRejected?.(intentId, soapResult.codigos)
    return Object.freeze({
      estado: 'RECHAZO_RECIBIDO',
      puedeReenviar: false,
      cae: null,
      codigos: soapResult.codigos,
      REPLAY_SECOND_SOAP_CALL: 0,
    })
  }

  // 7. Si fue aprobación candidata -> Conciliación y resolución definitiva
  if (soapResult.estado === 'APROBACION_RECIBIDA') {
    const reconciliation = await consultSoapVoucher(frozenRequest)
    if (reconciliation.estado === 'AUTORIZACION_COINCIDENTE') {
      const applied = await applyCommercialResolution({
        saleId: sale.id,
        cae: reconciliation.cae,
        vencimiento: reconciliation.vencimiento,
      })

      const finalResult = Object.freeze({
        estado: 'CAE_CONFIRMADO_Y_APLICADO',
        cae: reconciliation.cae,
        vencimiento: reconciliation.vencimiento,
        commercialApplied: applied.alreadyApplied ? 'IDEMPOTENT' : 'APPLIED',
        puedeReenviar: false,
        REPLAY_SECOND_SOAP_CALL: 0,
      })

      // Guardar estado en memoria o almacén de test si el caller lo implementa
      await deps.saveIntentState?.(intentId, finalResult)

      return finalResult
    }
  }

  return Object.freeze({
    estado: 'SIN_CONFIRMACION',
    puedeReenviar: false,
    cae: null,
    REPLAY_SECOND_SOAP_CALL: 0,
  })
}

/**
 * Validador estricto del contrato de catálogo fiscal para PR02.
 * Exige revisión explícita acreditada, hash SHA-256 íntegro (64 caracteres hex en minúsculas),
 * habilitación activa, timestamps finitos válidos, vigencia estricta (consultado_en <= now < vence_en),
 * coherencia estructural de condiciones (1..100) y alícuotas (0..100), unicidad de IDs,
 * comprobantes válidos sin duplicados, y acreditación oficial de procedencia cuando se evalúa readiness.
 */
export function validatePr02CatalogContract(catalog, expectedRevision = PR02_TARGET_CATALOG_REVISION_R4, options = {}) {
  if (!catalog || typeof catalog !== 'object') {
    throw new Error('CATALOG_CONTRACT_INVALID: Objeto de catálogo ausente o inválido')
  }
  if (catalog.revision !== expectedRevision) {
    throw new Error(`CATALOG_REVISION_MISMATCH: Se esperaba revisión ${expectedRevision}, recibida ${catalog.revision}`)
  }
  if (!catalog.fuente_sha256 || typeof catalog.fuente_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(catalog.fuente_sha256)) {
    throw new Error('CATALOG_HASH_INVALID: fuente_sha256 debe ser un SHA-256 hexadecimal válido de 64 caracteres en minúsculas')
  }
  if (catalog.habilitado !== true) {
    throw new Error(`CATALOG_NOT_ENABLED: Catálogo revisión ${expectedRevision} no está habilitado`)
  }
  const consultedMs = Date.parse(catalog.consultado_en)
  const expiresMs = Date.parse(catalog.vence_en)
  if (!Number.isFinite(consultedMs) || !Number.isFinite(expiresMs)) {
    throw new Error('CATALOG_TIMESTAMPS_INVALID: Fechas de consulta o vencimiento inválidas')
  }
  if (expiresMs <= consultedMs) {
    throw new Error('CATALOG_EXPIRY_INVALID: vence_en debe ser posterior a consultado_en')
  }

  const nowMs = options.now ? Date.parse(options.now) : Date.now()
  if (!Number.isFinite(nowMs)) {
    throw new Error('CATALOG_CLOCK_INVALID: Reloj de referencia inválido')
  }
  if (consultedMs > nowMs) {
    throw new Error('CATALOG_CONSULTED_IN_FUTURE: consultado_en no puede ser posterior a la fecha actual')
  }
  if (expiresMs <= nowMs) {
    throw new Error('CATALOG_EXPIRED: Catálogo vencido según el reloj de referencia')
  }

  // Validación estructural de condiciones
  if (!Array.isArray(catalog.condiciones) || catalog.condiciones.length === 0 || catalog.condiciones.length > 100) {
    throw new Error('CATALOG_CONDICIONES_INVALID: Array de condiciones vacío o fuera de rango (1-100)')
  }
  const conditionIds = new Set()
  for (const c of catalog.condiciones) {
    if (!c || typeof c !== 'object') {
      throw new Error('CATALOG_CONDICION_ROW_INVALID: Fila de condición no es un objeto válido')
    }
    if (!Number.isSafeInteger(c.id) || c.id < 1 || c.id > 99) {
      throw new Error(`CATALOG_CONDICION_ID_INVALID: ID de condición inválido: ${c.id}`)
    }
    if (conditionIds.has(c.id)) {
      throw new Error(`CATALOG_CONDICION_DUPLICATE_ID: ID de condición duplicado: ${c.id}`)
    }
    conditionIds.add(c.id)
    if (typeof c.descripcion !== 'string' || c.descripcion.trim().length === 0) {
      throw new Error('CATALOG_CONDICION_DESC_INVALID: Descripción de condición vacía')
    }
    if (!Array.isArray(c.comprobantes) || c.comprobantes.length === 0 || c.comprobantes.length > 100) {
      throw new Error('CATALOG_CONDICION_COMPROBANTES_INVALID: Comprobantes vacíos o fuera de rango en condición')
    }
    const cmpSet = new Set()
    for (const cmp of c.comprobantes) {
      if (!Number.isSafeInteger(cmp) || cmp < 1 || cmp > 999) {
        throw new Error(`CATALOG_COMPROBANTE_INVALID: Código de comprobante inválido: ${cmp}`)
      }
      if (cmpSet.has(cmp)) {
        throw new Error(`CATALOG_COMPROBANTE_DUPLICATE: Código de comprobante duplicado: ${cmp}`)
      }
      cmpSet.add(cmp)
    }
  }

  // Validación estructural de alícuotas
  if (!Array.isArray(catalog.alicuotas) || catalog.alicuotas.length > 100) {
    throw new Error('CATALOG_ALICUOTAS_INVALID: Array de alícuotas inválido o fuera de rango (0-100)')
  }
  const rateIds = new Set()
  for (const r of catalog.alicuotas) {
    if (!r || typeof r !== 'object') {
      throw new Error('CATALOG_ALICUOTA_ROW_INVALID: Fila de alícuota no es un objeto válido')
    }
    if (!Number.isSafeInteger(r.id) || r.id < 1 || r.id > 99) {
      throw new Error(`CATALOG_ALICUOTA_ID_INVALID: ID de alícuota inválido: ${r.id}`)
    }
    if (rateIds.has(r.id)) {
      throw new Error(`CATALOG_ALICUOTA_DUPLICATE_ID: ID de alícuota duplicado: ${r.id}`)
    }
    rateIds.add(r.id)
    if (typeof r.descripcion !== 'string' || r.descripcion.trim().length === 0) {
      throw new Error('CATALOG_ALICUOTA_DESC_INVALID: Descripción de alícuota vacía')
    }
  }

  // Acreditación de procedencia oficial cuando se evalúa para readiness operativa
  if (options.requireAccreditedProvenance === true) {
    if (!catalog.provenance || typeof catalog.provenance !== 'object' || catalog.provenance.accredited !== true) {
      throw new Error('CATALOG_PROVENANCE_NOT_ACCREDITED: Se requiere acreditación oficial de procedencia ARCA para readiness operativa')
    }
  }

  return true
}
