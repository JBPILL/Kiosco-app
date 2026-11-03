/**
 * Plan de Preparación Segura y Arquitectura de Control para PR02 (Sin Emisión).
 * Define contratos, políticas de selección de venta, protección de historial,
 * pre-condiciones obligatorias y fases de ejecución.
 */

export const PR02_TARGET_KIOSK_ID = 'b7254826-c767-4098-94b8-71013c12021d'
export const PR02_TARGET_CUIT = '20415005963'
export const PR02_TARGET_PV = 2
export const PR02_TARGET_RECEIPT_TYPE = 11 // Factura C
export const PR02_TARGET_CERT_SHA256 = 'bbcaffebce0f62e1d626e9f6f425dfa70a2de22031df12536a3876d2193af9d0'
export const PR02_EXPECTED_CATALOG_REVISION = 3

/**
 * Secuencia estricta de 4 fases para PR02.
 */
export const PR02_PHASES = Object.freeze({
  PR02_A: Object.freeze({
    id: 'PR02_A_READ_ONLY_PREFLIGHT_AND_RECONCILIATION',
    description: 'Comprobación de Staging y observación oficial de numeración READ ONLY (FECompUltimoAutorizado)',
    arcaCallsMax: 1,
    emissionAllowed: false,
    readOnly: true,
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
 * Falla cerrado si la venta no cumple los 7 requisitos taxativos.
 */
export function validatePr02CandidateSale(sale) {
  if (!sale || typeof sale !== 'object') {
    throw new Error('CANDIDATE_SALE_INVALID: Objeto de venta no suministrado')
  }

  // 1. Debe estar COMPLETADA
  if (sale.estado !== 'COMPLETADA') {
    throw new Error('CANDIDATE_SALE_NOT_COMPLETED: La venta no está en estado COMPLETADA')
  }

  // 2. Total positivo y detalles válidos
  const total = Number(sale.total)
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error('CANDIDATE_SALE_TOTAL_NON_POSITIVE: El total de la venta debe ser mayor a cero')
  }
  if (!Array.isArray(sale.detalles) || sale.detalles.length === 0) {
    throw new Error('CANDIDATE_SALE_INVALID_DETAILS: La venta debe contener detalles de productos')
  }
  for (const det of sale.detalles) {
    if (!det || Number(det.cantidad) <= 0 || Number(det.precio_unitario) <= 0) {
      throw new Error('CANDIDATE_SALE_INVALID_DETAILS: Cantidad o precio inválido en detalle')
    }
  }

  // 3. No debe tener CAE previo
  if (sale.cae !== null && sale.cae !== undefined && String(sale.cae).trim() !== '') {
    throw new Error('CANDIDATE_SALE_ALREADY_HAS_CAE: La venta ya posee un CAE emitido previamente')
  }

  // 4. No debe tener devoluciones incompatibles
  if (sale.hasIncompatibleReturns === true) {
    throw new Error('CANDIDATE_SALE_INCOMPATIBLE_RETURNS: La venta tiene devoluciones comerciales asociadas')
  }

  // 5. No debe tener otra operación fiscal pendiente
  if (sale.hasPendingFiscalOperation === true) {
    throw new Error('CANDIDATE_SALE_PENDING_OPERATION: La venta ya tiene una operación fiscal activa en preparación')
  }

  // 6. No debe estar asociada a un intento de emisión incierto
  if (sale.hasUncertainIntent === true) {
    throw new Error('CANDIDATE_SALE_UNCERTAIN_INTENT: La venta tiene un intento fiscal previo en estado ENVIO_INCIERTO')
  }

  // 7. Debe estar expresamente aprobada por el Dueño
  if (sale.ownerApproved !== true) {
    throw new Error('CANDIDATE_SALE_NOT_OWNER_APPROVED: La venta candidata no cuenta con aprobación expresa del Dueño')
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
 * Protege de forma inviolable el historial fiscal impidiendo que la intención histórica 042
 * reciba una segunda solicitud de emisión (FECAESolicitar).
 */
export function assertNotHistoricalIntent042(intent) {
  if (!intent) return
  const idStr = String(intent.id ?? intent.intento_id ?? intent.operacion_id ?? '')
  const action = String(intent.accion ?? intent.action ?? '').toUpperCase()

  if (idStr === '042' || idStr.includes('042') || intent.isHistorical042 === true) {
    if (action === 'FECAESOLICITAR' || action === 'EMITIR' || action === 'SEND_EMISSION') {
      throw new Error(
        'FATAL: HISTORICAL_INTENT_042_REEMISSION_FORBIDDEN: La intención histórica 042 no puede recibir un segundo FECAESolicitar. Sólo conciliación READ ONLY.'
      )
    }
  }
}

/**
 * Verifica las condiciones previas de seguridad antes de autorizar cualquier fase de PR02.
 */
export function verifyPr02Preconditions(opts = {}) {
  const {
    catalogRevision = PR02_EXPECTED_CATALOG_REVISION,
    catalogEnabled = true,
    catalogExpired = false,
    taValid = false,
    taExpiresAt = 0,
    cuit = PR02_TARGET_CUIT,
    puntoVenta = PR02_TARGET_PV,
    kioskId = PR02_TARGET_KIOSK_ID,
    certSha = PR02_TARGET_CERT_SHA256,
    workerEmissionEnabled = false,
  } = opts

  // 1. Catálogo oficial R3
  if (catalogRevision !== 3) {
    throw new Error(`PRECONDITION_FAILED: Catálogo debe ser Revisión 3 (actual: ${catalogRevision})`)
  }
  if (!catalogEnabled) {
    throw new Error('PRECONDITION_FAILED: Catálogo Revisión 3 debe estar habilitado')
  }
  if (catalogExpired) {
    throw new Error('PRECONDITION_FAILED: Catálogo Revisión 3 vencido o fuera de vigencia')
  }

  // 2. TA y Credenciales
  const now = Date.now()
  if (!taValid || taExpiresAt <= now) {
    // Prohibición taxativa de reutilizar TA vencido
    throw new Error('PRECONDITION_FAILED: TA vencido o no disponible. Prohibido reusar TA expirado; requiere nuevo LoginCms')
  }

  // 3. Emisor Operativo
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
  if (workerEmissionEnabled) {
    throw new Error('PRECONDITION_FAILED: Worker de emisión no debe estar habilitado durante la fase de preparación')
  }

  return Object.freeze({
    status: 'PASS',
    catalogReady: true,
    credentialsReady: true,
    emitterReady: true,
    workerReady: true,
  })
}

/**
 * Simula el ciclo de vida de emisión segura con registro durable antes de SOAP,
 * manejo de timeout incierto, conciliación y efecto comercial exactly-once.
 */
export async function executePr02Simulation(params, deps) {
  const { sale, frozenRequest, intentId } = params
  const { persistIntentDurable, sendSoapEmission, consultSoapVoucher, applyCommercialResolution } = deps

  // 1. Validar venta candidata
  validatePr02CandidateSale(sale)

  // 2. Proteger intención 042
  assertNotHistoricalIntent042({ id: intentId, accion: 'FECAESolicitar' })

  // 3. Paso crítico: persistir intención durable ANTES de invocar SOAP
  const persistedIntent = await persistIntentDurable({
    intentId,
    saleId: sale.id,
    sha256: frozenRequest.sha256,
    numero: frozenRequest.solicitud.numero,
    estado: 'INTENTO_REGISTRADO',
  })

  if (!persistedIntent || persistedIntent.estado !== 'INTENTO_REGISTRADO') {
    throw new Error('FISCAL_WSFE_NO_CONFIRMADO: Falló el registro durable previo a SOAP')
  }

  // 4. Enviar SOAP exactamente una vez
  let soapResult
  try {
    soapResult = await sendSoapEmission(frozenRequest)
  } catch (err) {
    // Timeout o falla de red -> STOP, marcar como ENVIO_INCIERTO, prohibir retry
    await deps.markIntentUncertain?.(intentId)
    return Object.freeze({
      estado: 'ENVIO_INCIERTO',
      puedeReenviar: false,
      cae: null,
      error: err.message,
    })
  }

  // 5. Si fue rechazo
  if (soapResult.estado === 'RECHAZO_RECIBIDO') {
    await deps.markIntentRejected?.(intentId, soapResult.codigos)
    return Object.freeze({
      estado: 'RECHAZO_RECIBIDO',
      puedeReenviar: false,
      cae: null,
      codigos: soapResult.codigos,
    })
  }

  // 6. Si fue aprobación candidata -> Conciliación / Resolución definitiva
  if (soapResult.estado === 'APROBACION_RECIBIDA') {
    // Comprobar con FECompConsultar
    const reconciliation = await consultSoapVoucher(frozenRequest)
    if (reconciliation.estado === 'AUTORIZACION_COINCIDENTE') {
      // 7. CAS: Aplicar efecto comercial exactamente una sola vez
      const applied = await applyCommercialResolution({
        saleId: sale.id,
        cae: reconciliation.cae,
        vencimiento: reconciliation.vencimiento,
      })

      return Object.freeze({
        estado: 'CAE_CONFIRMADO_Y_APLICADO',
        cae: reconciliation.cae,
        vencimiento: reconciliation.vencimiento,
        commercialApplied: applied.alreadyApplied ? 'IDEMPOTENT' : 'APPLIED',
        puedeReenviar: false,
      })
    }
  }

  return Object.freeze({
    estado: 'SIN_CONFIRMACION',
    puedeReenviar: false,
    cae: null,
  })
}
