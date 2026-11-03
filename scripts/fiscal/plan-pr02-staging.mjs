/**
 * Plan de Preparación Segura y Arquitectura de Control para PR02 (Sin Emisión).
 * Define contratos, políticas de selección de venta, protección de historial,
 * pre-condiciones obligatorias y fases de ejecución.
 *
 * NOTA DE SEGURIDAD:
 * Este módulo contiene lógica de validación, contratos y un simulador local
 * para arneses de prueba (TEST-ONLY). No efectúa transporte remoto hacia ARCA.
 */

export const PR02_TARGET_KIOSK_ID = 'b7254826-c767-4098-94b8-71013c12021d'
export const PR02_TARGET_CUIT = '20415005963'
export const PR02_TARGET_PV = 2
export const PR02_TARGET_RECEIPT_TYPE = 11 // Factura C
export const PR02_TARGET_CERT_SHA256 = 'bbcaffebce0f62e1d626e9f6f425dfa70a2de22031df12536a3876d2193af9d0'
export const PR02_EXPECTED_CATALOG_REVISION = 3
export const IS_PR02_SIMULATION_TEST_ONLY = true

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Fases estrictamente separadas de PR02.
 * Desacopla comprobación SQL, autenticación WSAA, lectura oficial y emisión.
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

  // 1. Catálogo oficial R3 explícito
  if (catalogRevision === undefined || catalogRevision !== PR02_EXPECTED_CATALOG_REVISION) {
    throw new Error(`PRECONDITION_FAILED: Catálogo debe ser Revisión 3 (suministrado: ${catalogRevision})`)
  }
  if (catalogEnabled !== true) {
    throw new Error('PRECONDITION_FAILED: Catálogo Revisión 3 debe estar explícitamente habilitado')
  }
  if (catalogExpired !== false) {
    throw new Error('PRECONDITION_FAILED: Catálogo Revisión 3 vencido o fuera de vigencia')
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
