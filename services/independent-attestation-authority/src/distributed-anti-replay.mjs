// @ts-check
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_RESERVATION_LEASE_TTL_MS = 30000

/**
 * Estados formales de la máquina de estados del almacén distribuido anti-replay.
 * - AVAILABLE: identificador aún no visto (estado lógico previo al INSERT atómico)
 * - RESERVED: reserva atómica adquirida pre-firma por un nodo específico bajo lease temporal
 * - CONSUMED: firma KMS/Ed25519 completada y confirmada (terminal inmutable)
 * - FAILED: fallo pre-firma, durante firma o en commit tras reserva (terminal fail-closed no reciclable)
 * - EXPIRED: lease expirado sin alcanzar CONSUMED (terminal fail-closed no reciclable)
 */
export const DISTRIBUTED_RESERVATION_STATES = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  CONSUMED: 'CONSUMED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
})

/**
 * Matriz explícita de transiciones permitidas en la máquina de estados.
 */
export const ALLOWED_RESERVATION_TRANSITIONS = Object.freeze({
  AVAILABLE: Object.freeze([DISTRIBUTED_RESERVATION_STATES.RESERVED]),
  RESERVED: Object.freeze([
    DISTRIBUTED_RESERVATION_STATES.CONSUMED,
    DISTRIBUTED_RESERVATION_STATES.FAILED,
    DISTRIBUTED_RESERVATION_STATES.EXPIRED,
  ]),
  CONSUMED: Object.freeze([]),
  FAILED: Object.freeze([]),
  EXPIRED: Object.freeze([]),
})

export const REQUIRED_DISTRIBUTED_STORE_METHODS = Object.freeze([
  'reserveOnce',
  'getReservation',
  'commitReservation',
  'markReservationFailed',
  'hasAuthorizationId',
  'expireReservation',
  'isHealthy',
])

/**
 * Convierte marcas de tiempo Date/number/ISO string a milisegundos epoch validados.
 * @param {Date | number | string | undefined} [nowInput]
 * @returns {number}
 */
export function normalizeEffectiveNowMs(nowInput) {
  if (nowInput === undefined || nowInput === null) {
    return Date.now()
  }
  if (typeof nowInput === 'number') {
    if (!Number.isFinite(nowInput)) {
      throw new Error(
        'SERVICE_ANTI_REPLAY_INVALID_TIMESTAMP: Timestamp numérico no finito'
      )
    }
    return nowInput
  }
  const ms =
    nowInput instanceof Date ? nowInput.getTime() : Date.parse(String(nowInput))
  if (!Number.isFinite(ms)) {
    throw new Error(
      'SERVICE_ANTI_REPLAY_INVALID_TIMESTAMP: Timestamp inválido para operación anti-replay'
    )
  }
  return ms
}

/**
 * Calcula la clave lógica de idempotencia sobre la tupla canónica:
 * (authorizationId, requestId, requestSha256).
 *
 * Dos nodos jamás pueden obtener permiso simultáneo sobre la misma combinación,
 * y cada componente individual mantiene unicidad estricta independiente para
 * prevenir reutilización parcial de `requestId`, `requestSha256` o `authorizationId`.
 *
 * @param {{
 *   authorizationId?: string | null,
 *   goAuthorizationId?: string | null,
 *   requestId: string,
 *   requestSha256?: string | null
 * }} input
 * @returns {string}
 */
export function computeDistributedIdempotencyKey(input) {
  const requestId =
    typeof input?.requestId === 'string' ? input.requestId.trim() : ''
  if (!requestId) {
    throw new Error(
      'SERVICE_ANTI_REPLAY_REQUEST_ID_REQUIRED: requestId requerido para calcular clave de idempotencia'
    )
  }
  const requestSha256 =
    typeof input?.requestSha256 === 'string'
      ? input.requestSha256.trim().toLowerCase()
      : ''
  const rawAuthId = input?.authorizationId ?? input?.goAuthorizationId ?? null
  const authorizationId =
    typeof rawAuthId === 'string' && rawAuthId.trim().length > 0
      ? rawAuthId.trim()
      : null

  const canonical = JSON.stringify({
    authorizationId,
    requestId,
    requestSha256,
  })
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/**
 * Valida y normaliza una solicitud de reserva atómica pre-firma.
 * @param {Record<string, any>} entry
 * @param {number} [defaultLeaseTtlMs=DEFAULT_RESERVATION_LEASE_TTL_MS]
 */
export function normalizeReservationInput(
  entry,
  defaultLeaseTtlMs = DEFAULT_RESERVATION_LEASE_TTL_MS
) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(
      'SERVICE_ANTI_REPLAY_INVALID_REQUEST: Entrada de reserva distribuida inválida'
    )
  }
  const requestId =
    typeof entry.requestId === 'string' ? entry.requestId.trim() : ''
  if (!requestId) {
    throw new Error(
      'SERVICE_ANTI_REPLAY_REQUEST_ID_REQUIRED: requestId requerido para reservar'
    )
  }
  const attestationId =
    typeof entry.attestationId === 'string' ? entry.attestationId.trim() : ''
  if (!attestationId) {
    throw new Error(
      'SERVICE_ANTI_REPLAY_ATTESTATION_ID_REQUIRED: attestationId requerido para reservar'
    )
  }
  const requestSha256 =
    typeof entry.requestSha256 === 'string'
      ? entry.requestSha256.trim().toLowerCase()
      : ''
  const rawAuthId = entry.authorizationId ?? entry.goAuthorizationId ?? null
  const authorizationId =
    typeof rawAuthId === 'string' && rawAuthId.trim().length > 0
      ? rawAuthId.trim()
      : null

  const ownerNodeId =
    typeof entry.ownerNodeId === 'string' && entry.ownerNodeId.trim().length > 0
      ? entry.ownerNodeId.trim()
      : `node-${process.pid}`
  const reservationToken =
    typeof entry.reservationToken === 'string' &&
    entry.reservationToken.trim().length > 0
      ? entry.reservationToken.trim()
      : `resv-${crypto.randomUUID()}`

  const nowMs = normalizeEffectiveNowMs(entry.now)
  const leaseTtlMs =
    typeof entry.leaseTtlMs === 'number' &&
    Number.isFinite(entry.leaseTtlMs) &&
    entry.leaseTtlMs > 0
      ? Math.floor(entry.leaseTtlMs)
      : defaultLeaseTtlMs
  const leaseExpiresAtMs = nowMs + leaseTtlMs

  const idempotencyKey = computeDistributedIdempotencyKey({
    authorizationId,
    requestId,
    requestSha256,
  })

  return Object.freeze({
    idempotencyKey,
    requestId,
    requestSha256,
    authorizationId,
    goAuthorizationId: authorizationId,
    attestationId,
    ownerNodeId,
    reservationToken,
    kmsAttempted: false,
    reservedAtMs: nowMs,
    reservedAt: new Date(nowMs).toISOString(),
    leaseTtlMs,
    leaseExpiresAtMs,
    leaseExpiresAt: new Date(leaseExpiresAtMs).toISOString(),
  })
}

/**
 * Verifica que una transición de estado esté permitida por la máquina formal.
 * @param {string} fromState
 * @param {string} toState
 * @param {string} [contextLabel]
 */
export function assertValidReservationTransition(
  fromState,
  toState,
  contextLabel = 'transition'
) {
  const normalizedFrom =
    fromState === 'FAILED_CONSUMED'
      ? DISTRIBUTED_RESERVATION_STATES.FAILED
      : fromState
  const allowed = ALLOWED_RESERVATION_TRANSITIONS[normalizedFrom]
  if (!Array.isArray(allowed) || !allowed.includes(toState)) {
    throw new Error(
      `SERVICE_ANTI_REPLAY_INVALID_TRANSITION: Transición prohibida (${normalizedFrom} -> ${toState}) en '${contextLabel}'`
    )
  }
}

/**
 * Lanza error tipado fail-closed ante conflicto entre una reserva existente y una candidata.
 * Distingue explícitamente conflicto de digest bajo mismo requestId, reúso de authorizationId,
 * duplicado exacto de requestId/requestSha256/attestationId o reserva ya expirada/fallida.
 *
 * @param {Record<string, any>} existing
 * @param {ReturnType<typeof normalizeReservationInput>} candidate
 * @returns {never}
 */
export function throwReservationConflictError(existing, candidate) {
  const stateLabel = existing.state || 'RESERVED'
  if (existing.requestId === candidate.requestId) {
    if (
      existing.requestSha256 &&
      candidate.requestSha256 &&
      existing.requestSha256 !== candidate.requestSha256
    ) {
      throw new Error(
        `SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT: Conflicto de digest para mismo requestId '${candidate.requestId}' (estado actual: ${stateLabel})`
      )
    }
    if (
      existing.authorizationId !== candidate.authorizationId &&
      (existing.authorizationId || candidate.authorizationId)
    ) {
      throw new Error(
        `SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT: Conflicto de authorizationId para mismo requestId '${candidate.requestId}' (estado actual: ${stateLabel})`
      )
    }
    if (stateLabel === DISTRIBUTED_RESERVATION_STATES.EXPIRED) {
      throw new Error(
        `SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED: requestId '${candidate.requestId}' pertenece a una reserva expirada no reciclable`
      )
    }
    throw new Error(
      `SERVICE_ANTI_REPLAY_REQUEST_ID_DUPLICATED: requestId '${candidate.requestId}' ya reservado o consumido (estado: ${stateLabel})`
    )
  }

  if (
    candidate.authorizationId &&
    existing.authorizationId === candidate.authorizationId
  ) {
    throw new Error(
      `SERVICE_ANTI_REPLAY_GO_AUTHORIZATION_DUPLICATED: authorizationId '${candidate.authorizationId}' ya reservado o consumido previamente por otra solicitud (estado: ${stateLabel})`
    )
  }

  if (
    candidate.requestSha256 &&
    existing.requestSha256 === candidate.requestSha256
  ) {
    throw new Error(
      `SERVICE_ANTI_REPLAY_REQUEST_HASH_DUPLICATED: requestSha256 '${candidate.requestSha256}' ya fue utilizado previamente (estado: ${stateLabel})`
    )
  }

  if (existing.attestationId === candidate.attestationId) {
    throw new Error(
      `SERVICE_ANTI_REPLAY_ATTESTATION_ID_DUPLICATED: attestationId '${candidate.attestationId}' ya existe`
    )
  }

  throw new Error(
    `SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT: Tupla de idempotencia en conflicto (estado: ${stateLabel})`
  )
}

/**
 * Valida que un objeto cumpla el contrato formal completo de DistributedAntiReplayStore.
 * @param {unknown} store
 * @returns {DistributedAntiReplayStore}
 */
export function assertDistributedStoreContract(store) {
  if (!store || typeof store !== 'object') {
    throw new Error(
      'SERVICE_ANTI_REPLAY_DISTRIBUTED_STORE_REQUIRED: Instancia de almacén distribuido requerida'
    )
  }
  const missing = REQUIRED_DISTRIBUTED_STORE_METHODS.filter(
    (name) => typeof store[name] !== 'function'
  )
  if (missing.length > 0) {
    throw new Error(
      `SERVICE_ANTI_REPLAY_DISTRIBUTED_CONTRACT_INCOMPLETE: Almacén distribuido omite métodos obligatorios: ${missing.join(', ')}`
    )
  }
  return /** @type {DistributedAntiReplayStore} */ (store)
}

function freezeReservationRecord(rec) {
  if (!rec) return null
  return Object.freeze({ ...rec })
}

/**
 * Contrato formal base para almacenes anti-replay distribuidos multi-nodo.
 * Implementa separación explícita entre garantías simuladas vs infraestructura real.
 */
export class DistributedAntiReplayStore {
  get backendKind() {
    return 'ABSTRACT_DISTRIBUTED_STORE'
  }

  get multiNodeAtomicGuaranteed() {
    return false
  }

  get isSimulatedReferenceStore() {
    return false
  }

  get isRealInfrastructureTested() {
    return false
  }

  get isProductionDistributedReady() {
    return false
  }

  /** @param {Record<string, any>} _entry */
  async reserveOnce(_entry) {
    throw new Error('NOT_IMPLEMENTED: reserveOnce')
  }

  /** @param {string} _requestId */
  async getReservation(_requestId) {
    throw new Error('NOT_IMPLEMENTED: getReservation')
  }

  /** @param {Record<string, any>} _params */
  async markSigningAttemptStarted(_params) {
    throw new Error('NOT_IMPLEMENTED: markSigningAttemptStarted')
  }

  /** @param {Record<string, any>} _params */
  async commitReservation(_params) {
    throw new Error('NOT_IMPLEMENTED: commitReservation')
  }

  /**
   * Compatibilidad retrospectiva con ServiceAntiReplayGuard v1.x.
   * @param {Record<string, any>} params
   */
  async recordOnce(params) {
    return this.commitReservation(params)
  }

  /** @param {Record<string, any>} _params */
  async markReservationFailed(_params) {
    throw new Error('NOT_IMPLEMENTED: markReservationFailed')
  }

  /**
   * Compatibilidad retrospectiva con ServiceAntiReplayGuard v1.x.
   * @param {Record<string, any>} params
   */
  async markFailed(params) {
    return this.markReservationFailed(params)
  }

  /** @param {string} _authorizationId */
  async hasAuthorizationId(_authorizationId) {
    throw new Error('NOT_IMPLEMENTED: hasAuthorizationId')
  }

  /** @param {string} authorizationId */
  async hasGoAuthorizationId(authorizationId) {
    return this.hasAuthorizationId(authorizationId)
  }

  /** @param {string} _requestId */
  async hasRequestId(_requestId) {
    throw new Error('NOT_IMPLEMENTED: hasRequestId')
  }

  /** @param {string} _requestSha256 */
  async hasRequestHash(_requestSha256) {
    throw new Error('NOT_IMPLEMENTED: hasRequestHash')
  }

  /** @param {string} _attestationId */
  async hasAttestationId(_attestationId) {
    throw new Error('NOT_IMPLEMENTED: hasAttestationId')
  }

  /** @param {Record<string, any>} _params */
  async expireReservation(_params) {
    throw new Error('NOT_IMPLEMENTED: expireReservation')
  }

  async isHealthy() {
    return false
  }
}

/**
 * Implementación local de referencia en memoria compartida entre múltiples instancias
 * del servicio en un mismo proceso Node (simulación multi-nodo con cola transaccional).
 *
 * NO ES APTO PARA PRODUCCIÓN MULTI-CONTENEDOR:
 * `isSimulatedReferenceStore = true`, `isRealInfrastructureTested = false`, `isProductionDistributedReady = false`.
 */
export class ReferenceInProcessDistributedStore extends DistributedAntiReplayStore {
  /**
   * @param {object} [options]
   * @param {number} [options.defaultLeaseTtlMs=30000]
   * @param {number} [options.simulatedLatencyMs=0]
   * @param {(() => number | string | Date) | number | string | Date} [options.now]
   */
  constructor(options = {}) {
    super()
    this._defaultLeaseTtlMs =
      typeof options.defaultLeaseTtlMs === 'number' &&
      options.defaultLeaseTtlMs > 0
        ? options.defaultLeaseTtlMs
        : DEFAULT_RESERVATION_LEASE_TTL_MS
    this._simulatedLatencyMs =
      typeof options.simulatedLatencyMs === 'number' &&
      options.simulatedLatencyMs > 0
        ? options.simulatedLatencyMs
        : 0
    this._nowProvider =
      typeof options.now === 'function'
        ? options.now
        : options.now !== undefined
          ? () => options.now
          : () => Date.now()

    this._healthy = true
    this._corrupted = false
    /** @type {Map<string, Error>} */
    this._injectedFailures = new Map()

    /** @type {Map<string, Record<string, any>>} */
    this._byRequestId = new Map()
    /** @type {Map<string, string>} */
    this._requestIdByHash = new Map()
    /** @type {Map<string, string>} */
    this._requestIdByAuthId = new Map()
    /** @type {Map<string, string>} */
    this._requestIdByAttestationId = new Map()
    /** @type {Map<string, string>} */
    this._requestIdByIdempotencyKey = new Map()

    this._txQueue = Promise.resolve()
    this._txSeq = 0
  }

  get backendKind() {
    return 'REFERENCE_IN_MEMORY_SIMULATED_MULTI_NODE'
  }

  get multiNodeAtomicGuaranteed() {
    return true
  }

  get isSimulatedReferenceStore() {
    return true
  }

  get isRealInfrastructureTested() {
    return false
  }

  get isProductionDistributedReady() {
    return false
  }

  /** @param {boolean} healthy */
  setHealthy(healthy) {
    this._healthy = Boolean(healthy)
  }

  /** @param {boolean} corrupted */
  setCorrupted(corrupted) {
    this._corrupted = Boolean(corrupted)
  }

  /**
   * @param {string} methodName
   * @param {Error | string} errorOrMessage
   */
  injectFailureOnce(methodName, errorOrMessage) {
    const err =
      errorOrMessage instanceof Error
        ? errorOrMessage
        : new Error(String(errorOrMessage))
    this._injectedFailures.set(methodName, err)
  }

  _consumeInjectedFailure(methodName) {
    const err = this._injectedFailures.get(methodName)
    if (err) {
      this._injectedFailures.delete(methodName)
      throw err
    }
  }

  _assertOperational(opName) {
    this._consumeInjectedFailure(opName)
    if (this._corrupted || !this._healthy) {
      throw new Error(
        `SERVICE_ANTI_REPLAY_UNAVAILABLE: Almacén distribuido de referencia no disponible o corrupto durante '${opName}'`
      )
    }
  }

  /**
   * @template T
   * @param {() => Promise<T> | T} fn
   * @returns {Promise<T>}
   */
  _runTransaction(fn) {
    const exec = async () => {
      if (this._simulatedLatencyMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, this._simulatedLatencyMs)
        )
      }
      return await fn()
    }
    const next = this._txQueue.then(exec, exec)
    this._txQueue = next.catch(() => {})
    return next
  }

  _findConflictingRecord(norm) {
    const byReq = this._byRequestId.get(norm.requestId)
    if (byReq) return byReq
    if (norm.requestSha256) {
      const reqId = this._requestIdByHash.get(norm.requestSha256)
      if (reqId) return this._byRequestId.get(reqId) || null
    }
    if (norm.authorizationId) {
      const reqId = this._requestIdByAuthId.get(norm.authorizationId)
      if (reqId) return this._byRequestId.get(reqId) || null
    }
    const byAtt = this._requestIdByAttestationId.get(norm.attestationId)
    if (byAtt) return this._byRequestId.get(byAtt) || null
    const byIdemp = this._requestIdByIdempotencyKey.get(norm.idempotencyKey)
    if (byIdemp) return this._byRequestId.get(byIdemp) || null
    return null
  }

  async isHealthy() {
    if (this._corrupted || !this._healthy) return false
    if (this._injectedFailures.has('isHealthy')) {
      this._injectedFailures.delete('isHealthy')
      return false
    }
    return true
  }

  async reserveOnce(entry) {
    const effectiveEntry =
      entry && entry.now !== undefined
        ? entry
        : { ...entry, now: this._nowProvider() }
    const norm = normalizeReservationInput(effectiveEntry, this._defaultLeaseTtlMs)

    return await this._runTransaction(() => {
      this._assertOperational('reserveOnce')
      const existing = this._findConflictingRecord(norm)
      if (existing) {
        throwReservationConflictError(existing, norm)
      }

      this._txSeq += 1
      const record = {
        ...norm,
        state: DISTRIBUTED_RESERVATION_STATES.RESERVED,
        consumedAt: null,
        failedAt: null,
        expiredAt: null,
        failureReason: null,
        responseDigest: null,
        updatedAt: norm.reservedAt,
        txVersion: 1,
        txSeq: this._txSeq,
      }

      this._byRequestId.set(record.requestId, record)
      this._requestIdByIdempotencyKey.set(record.idempotencyKey, record.requestId)
      this._requestIdByAttestationId.set(record.attestationId, record.requestId)
      if (record.requestSha256) {
        this._requestIdByHash.set(record.requestSha256, record.requestId)
      }
      if (record.authorizationId) {
        this._requestIdByAuthId.set(record.authorizationId, record.requestId)
      }

      return Object.freeze({
        reserved: true,
        state: record.state,
        idempotencyKey: record.idempotencyKey,
        requestId: record.requestId,
        requestSha256: record.requestSha256,
        authorizationId: record.authorizationId,
        attestationId: record.attestationId,
        ownerNodeId: record.ownerNodeId,
        reservationToken: record.reservationToken,
        leaseExpiresAt: record.leaseExpiresAt,
      })
    })
  }

  async getReservation(requestId) {
    return await this._runTransaction(() => {
      this._assertOperational('getReservation')
      const key = typeof requestId === 'string' ? requestId.trim() : ''
      return freezeReservationRecord(this._byRequestId.get(key) || null)
    })
  }

  async markSigningAttemptStarted(params) {
    return await this._runTransaction(() => {
      this._assertOperational('markSigningAttemptStarted')
      const requestId =
        typeof params?.requestId === 'string' ? params.requestId.trim() : ''
      const existing = this._byRequestId.get(requestId)
      if (!existing) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente al marcar inicio de firma'
        )
      }
      if (existing.state !== DISTRIBUTED_RESERVATION_STATES.RESERVED) {
        throw new Error(
          `SERVICE_ANTI_REPLAY_INVALID_TRANSITION: No se puede iniciar firma en estado '${existing.state}'`
        )
      }
      if (params.ownerNodeId && existing.ownerNodeId !== params.ownerNodeId) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_OWNER_MISMATCH: Otro nodo posee la reserva activa'
        )
      }
      if (
        params.reservationToken &&
        existing.reservationToken !== params.reservationToken
      ) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_TOKEN_MISMATCH: Token de reserva inconsistente'
        )
      }
      const nowMs = normalizeEffectiveNowMs(
        params?.now !== undefined ? params.now : this._nowProvider()
      )
      if (nowMs >= existing.leaseExpiresAtMs) {
        existing.state = DISTRIBUTED_RESERVATION_STATES.EXPIRED
        existing.expiredAt = new Date(nowMs).toISOString()
        existing.updatedAt = existing.expiredAt
        existing.txVersion += 1
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED: El lease expiró antes de iniciar firma'
        )
      }
      existing.kmsAttempted = true
      existing.updatedAt = new Date(nowMs).toISOString()
      existing.txVersion += 1
      return freezeReservationRecord(existing)
    })
  }

  async commitReservation(params) {
    return await this._runTransaction(() => {
      this._assertOperational('commitReservation')
      const requestId =
        typeof params?.requestId === 'string' ? params.requestId.trim() : ''
      const existing = this._byRequestId.get(requestId)
      if (!existing) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente al confirmar'
        )
      }
      if (existing.state === DISTRIBUTED_RESERVATION_STATES.EXPIRED) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED: No se puede confirmar una reserva ya expirada'
        )
      }
      assertValidReservationTransition(
        existing.state,
        DISTRIBUTED_RESERVATION_STATES.CONSUMED,
        'commitReservation'
      )
      if (
        params?.attestationId &&
        existing.attestationId !== params.attestationId
      ) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_ATTESTATION_ID_REQUIRED: Inconsistencia de attestationId al confirmar'
        )
      }
      if (params?.ownerNodeId && existing.ownerNodeId !== params.ownerNodeId) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_OWNER_MISMATCH: Nodo distinto al propietario de la reserva intenta confirmar'
        )
      }
      if (
        params?.reservationToken &&
        existing.reservationToken !== params.reservationToken
      ) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_TOKEN_MISMATCH: reservationToken inválido al confirmar'
        )
      }
      const nowMs = normalizeEffectiveNowMs(
        params?.now !== undefined ? params.now : this._nowProvider()
      )
      if (nowMs >= existing.leaseExpiresAtMs) {
        existing.state = DISTRIBUTED_RESERVATION_STATES.EXPIRED
        existing.expiredAt = new Date(nowMs).toISOString()
        existing.updatedAt = existing.expiredAt
        existing.txVersion += 1
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED: Lease vencido al confirmar reserva; transición fail-closed a EXPIRED'
        )
      }

      const nowIso = new Date(nowMs).toISOString()
      existing.state = DISTRIBUTED_RESERVATION_STATES.CONSUMED
      existing.kmsAttempted = true
      existing.consumedAt = nowIso
      existing.updatedAt = nowIso
      existing.responseDigest = params?.responseDigest || null
      existing.txVersion += 1
      return freezeReservationRecord(existing)
    })
  }

  async markReservationFailed(params) {
    return await this._runTransaction(() => {
      this._assertOperational('markReservationFailed')
      const requestId =
        typeof params?.requestId === 'string' ? params.requestId.trim() : ''
      const existing = this._byRequestId.get(requestId)
      if (!existing) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente al marcar fallo'
        )
      }
      if (existing.state === DISTRIBUTED_RESERVATION_STATES.FAILED) {
        return freezeReservationRecord(existing)
      }
      assertValidReservationTransition(
        existing.state,
        DISTRIBUTED_RESERVATION_STATES.FAILED,
        'markReservationFailed'
      )
      if (params?.ownerNodeId && existing.ownerNodeId !== params.ownerNodeId) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_OWNER_MISMATCH: Nodo distinto al propietario intenta marcar fallo'
        )
      }
      if (
        params?.reservationToken &&
        existing.reservationToken !== params.reservationToken
      ) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_TOKEN_MISMATCH: reservationToken inválido al marcar fallo'
        )
      }
      const nowMs = normalizeEffectiveNowMs(
        params?.now !== undefined ? params.now : this._nowProvider()
      )
      const nowIso = new Date(nowMs).toISOString()
      existing.state = DISTRIBUTED_RESERVATION_STATES.FAILED
      existing.kmsAttempted = true
      existing.failedAt = nowIso
      existing.updatedAt = nowIso
      existing.failureReason = String(
        params?.reason || 'SIGNING_OR_COMMIT_FAILED'
      ).slice(0, 160)
      existing.txVersion += 1
      return freezeReservationRecord(existing)
    })
  }

  async expireReservation(params) {
    return await this._runTransaction(() => {
      this._assertOperational('expireReservation')
      const requestId =
        typeof params === 'string'
          ? params.trim()
          : typeof params?.requestId === 'string'
            ? params.requestId.trim()
            : ''
      const existing = this._byRequestId.get(requestId)
      if (!existing) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente al expirar'
        )
      }
      if (existing.state === DISTRIBUTED_RESERVATION_STATES.EXPIRED) {
        return freezeReservationRecord(existing)
      }
      assertValidReservationTransition(
        existing.state,
        DISTRIBUTED_RESERVATION_STATES.EXPIRED,
        'expireReservation'
      )
      const nowMs = normalizeEffectiveNowMs(
        typeof params === 'object' && params?.now !== undefined
          ? params.now
          : this._nowProvider()
      )
      if (nowMs < existing.leaseExpiresAtMs) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_LEASE_ACTIVE: No se puede expirar una reserva cuyo lease sigue vigente'
        )
      }
      const nowIso = new Date(nowMs).toISOString()
      existing.state = DISTRIBUTED_RESERVATION_STATES.EXPIRED
      existing.expiredAt = nowIso
      existing.updatedAt = nowIso
      existing.failureReason = String(
        (typeof params === 'object' && params?.reason) || 'RESERVATION_LEASE_EXPIRED'
      ).slice(0, 160)
      existing.txVersion += 1
      return freezeReservationRecord(existing)
    })
  }

  async hasAuthorizationId(authorizationId) {
    return await this._runTransaction(() => {
      this._assertOperational('hasAuthorizationId')
      const key =
        typeof authorizationId === 'string' ? authorizationId.trim() : ''
      return Boolean(key && this._requestIdByAuthId.has(key))
    })
  }

  async hasRequestId(requestId) {
    return await this._runTransaction(() => {
      this._assertOperational('hasRequestId')
      const key = typeof requestId === 'string' ? requestId.trim() : ''
      return Boolean(key && this._byRequestId.has(key))
    })
  }

  async hasRequestHash(requestSha256) {
    return await this._runTransaction(() => {
      this._assertOperational('hasRequestHash')
      const key =
        typeof requestSha256 === 'string'
          ? requestSha256.trim().toLowerCase()
          : ''
      return Boolean(key && this._requestIdByHash.has(key))
    })
  }

  async hasAttestationId(attestationId) {
    return await this._runTransaction(() => {
      this._assertOperational('hasAttestationId')
      const key = typeof attestationId === 'string' ? attestationId.trim() : ''
      return Boolean(key && this._requestIdByAttestationId.has(key))
    })
  }

  getStats() {
    const counts = { RESERVED: 0, CONSUMED: 0, FAILED: 0, EXPIRED: 0 }
    for (const rec of this._byRequestId.values()) {
      counts[rec.state] = (counts[rec.state] || 0) + 1
    }
    return Object.freeze({
      totalReservations: this._byRequestId.size,
      ...counts,
    })
  }
}

/**
 * Coordinador transaccional host-local sobre archivo compartido entre múltiples procesos OS.
 * Diseñado exclusivamente para simulación multi-proceso local (`EXT06-D-09`) con lockfile exclusivo,
 * reintentos acotados ante contención transitoria entre procesos, escritura temporal O_EXCL y protección symlink.
 *
 * NO ES APTO PARA PRODUCCIÓN MULTI-HOST CLOUD (`isRealInfrastructureTested = false`).
 */
export class SharedFileCoordinatorDistributedStore extends DistributedAntiReplayStore {
  /**
   * @param {object} options
   * @param {string} options.filePath
   * @param {number} [options.defaultLeaseTtlMs=30000]
   * @param {number} [options.lockAcquireTimeoutMs=3000]
   * @param {number} [options.lockRetryIntervalMs=10]
   * @param {(() => number | string | Date) | number | string | Date} [options.now]
   */
  constructor(options) {
    super()
    if (!options || !options.filePath || typeof options.filePath !== 'string') {
      throw new Error(
        'SERVICE_ANTI_REPLAY_FILE_PATH_REQUIRED: filePath requerido para SharedFileCoordinatorDistributedStore'
      )
    }
    this._filePath = path.resolve(options.filePath)
    this._defaultLeaseTtlMs =
      typeof options.defaultLeaseTtlMs === 'number' &&
      options.defaultLeaseTtlMs > 0
        ? options.defaultLeaseTtlMs
        : DEFAULT_RESERVATION_LEASE_TTL_MS
    this._lockAcquireTimeoutMs =
      typeof options.lockAcquireTimeoutMs === 'number' &&
      options.lockAcquireTimeoutMs > 0
        ? options.lockAcquireTimeoutMs
        : 3000
    this._lockRetryIntervalMs =
      typeof options.lockRetryIntervalMs === 'number' &&
      options.lockRetryIntervalMs > 0
        ? options.lockRetryIntervalMs
        : 10
    this._nowProvider =
      typeof options.now === 'function'
        ? options.now
        : options.now !== undefined
          ? () => options.now
          : () => Date.now()
    this._tmpSeq = 0
    this._queue = Promise.resolve()
    this._assertNoSymlinks(this._filePath)
    if (fs.existsSync(this._filePath)) {
      this._readStateFromDisk()
    }
  }

  get backendKind() {
    return 'REFERENCE_HOST_FILE_COORDINATOR'
  }

  get multiNodeAtomicGuaranteed() {
    return false
  }

  get isSimulatedReferenceStore() {
    return true
  }

  get isRealInfrastructureTested() {
    return false
  }

  get isProductionDistributedReady() {
    return false
  }

  _assertNoSymlinks(targetPath) {
    let cur = path.resolve(targetPath)
    while (true) {
      try {
        const st = fs.lstatSync(cur)
        if (st.isSymbolicLink()) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_SYMLINK_FORBIDDEN: Prohibido usar enlaces simbólicos en coordinador anti-replay'
          )
        }
      } catch (err) {
        if (err?.message?.includes('SERVICE_ANTI_REPLAY_SYMLINK_FORBIDDEN')) {
          throw err
        }
      }
      const parent = path.dirname(cur)
      if (parent === cur) break
      cur = parent
    }
  }

  _readStateFromDisk() {
    this._assertNoSymlinks(this._filePath)
    if (!fs.existsSync(this._filePath)) {
      return { schemaVersion: 'distributed-ref-v1', records: {} }
    }
    try {
      const raw = fs.readFileSync(this._filePath, 'utf8')
      const parsed = JSON.parse(raw)
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        !parsed.records ||
        typeof parsed.records !== 'object' ||
        Array.isArray(parsed.records)
      ) {
        throw new Error('Estructura corrupta')
      }
      return parsed
    } catch (err) {
      if (err?.message?.includes('SERVICE_ANTI_REPLAY_')) throw err
      throw new Error(
        `SERVICE_ANTI_REPLAY_STORAGE_ERROR: Coordinador anti-replay corrupto o ilegible: ${err?.message || String(err)}`
      )
    }
  }

  _writeStateToDisk(stateObj) {
    try {
      this._assertNoSymlinks(this._filePath)
      const dir = path.dirname(this._filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      this._tmpSeq += 1
      const tmpPath = `${this._filePath}.tmp-${process.pid}-${Date.now()}-${this._tmpSeq}`
      this._assertNoSymlinks(tmpPath)
      const fd = fs.openSync(tmpPath, 'wx', 0o600)
      try {
        fs.writeFileSync(fd, JSON.stringify(stateObj, null, 2), 'utf8')
      } finally {
        fs.closeSync(fd)
      }
      fs.renameSync(tmpPath, this._filePath)
    } catch (err) {
      if (err?.message?.includes('SERVICE_ANTI_REPLAY_')) throw err
      throw new Error(
        `SERVICE_ANTI_REPLAY_STORAGE_ERROR: Fallo al escribir coordinador anti-replay: ${err?.message || String(err)}`
      )
    }
  }

  /**
   * Ejecuta una transacción sobre disco serializada por cola intra-proceso + lockfile OS-level.
   * @template T
   * @param {(state: { records: Record<string, any> }, mutate: boolean) => T} fn
   * @param {boolean} mutate
   * @returns {Promise<T>}
   */
  _withSharedFileLock(fn, mutate = true) {
    const run = async () => {
      this._assertNoSymlinks(this._filePath)
      const dir = path.dirname(this._filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      const lockPath = `${this._filePath}.lock`
      this._assertNoSymlinks(lockPath)

      const deadline = Date.now() + this._lockAcquireTimeoutMs
      let lockFd = null
      while (lockFd === null) {
        try {
          lockFd = fs.openSync(lockPath, 'wx')
        } catch (lockErr) {
          if (lockErr?.code !== 'EEXIST' || Date.now() >= deadline) {
            throw new Error(
              `SERVICE_ANTI_REPLAY_LOCK_CONTENTION: No se pudo adquirir lock compartido del coordinador: ${lockErr?.message || String(lockErr)}`
            )
          }
          await new Promise((r) => setTimeout(r, this._lockRetryIntervalMs))
        }
      }

      try {
        const state = this._readStateFromDisk()
        const result = fn(state)
        if (mutate) {
          this._writeStateToDisk(state)
        }
        return result
      } finally {
        try {
          fs.closeSync(lockFd)
        } catch {
          // noop
        }
        try {
          if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath)
        } catch {
          // noop
        }
      }
    }

    const next = this._queue.then(run, run)
    this._queue = next.catch(() => {})
    return next
  }

  async isHealthy() {
    try {
      this._readStateFromDisk()
      return true
    } catch {
      return false
    }
  }

  async reserveOnce(entry) {
    const effectiveEntry =
      entry && entry.now !== undefined
        ? entry
        : { ...entry, now: this._nowProvider() }
    const norm = normalizeReservationInput(effectiveEntry, this._defaultLeaseTtlMs)

    return await this._withSharedFileLock((state) => {
      const records = Object.values(state.records)
      const conflict = records.find(
        (r) =>
          r.requestId === norm.requestId ||
          (norm.requestSha256 && r.requestSha256 === norm.requestSha256) ||
          (norm.authorizationId && r.authorizationId === norm.authorizationId) ||
          r.attestationId === norm.attestationId ||
          r.idempotencyKey === norm.idempotencyKey
      )
      if (conflict) {
        throwReservationConflictError(conflict, norm)
      }

      const rec = {
        ...norm,
        state: DISTRIBUTED_RESERVATION_STATES.RESERVED,
        consumedAt: null,
        failedAt: null,
        expiredAt: null,
        failureReason: null,
        responseDigest: null,
        updatedAt: norm.reservedAt,
      }
      state.records[rec.requestId] = rec
      return Object.freeze({
        reserved: true,
        state: rec.state,
        idempotencyKey: rec.idempotencyKey,
        requestId: rec.requestId,
        requestSha256: rec.requestSha256,
        authorizationId: rec.authorizationId,
        attestationId: rec.attestationId,
        ownerNodeId: rec.ownerNodeId,
        reservationToken: rec.reservationToken,
        leaseExpiresAt: rec.leaseExpiresAt,
      })
    }, true)
  }

  async getReservation(requestId) {
    const key = typeof requestId === 'string' ? requestId.trim() : ''
    return await this._withSharedFileLock(
      (state) => freezeReservationRecord(state.records[key] || null),
      false
    )
  }

  async markSigningAttemptStarted(params) {
    const requestId =
      typeof params?.requestId === 'string' ? params.requestId.trim() : ''
    return await this._withSharedFileLock((state) => {
      const existing = state.records[requestId]
      if (!existing) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente'
        )
      }
      if (existing.state !== DISTRIBUTED_RESERVATION_STATES.RESERVED) {
        throw new Error(
          `SERVICE_ANTI_REPLAY_INVALID_TRANSITION: Estado inválido '${existing.state}' al marcar inicio de firma`
        )
      }
      const nowMs = normalizeEffectiveNowMs(
        params?.now !== undefined ? params.now : this._nowProvider()
      )
      if (nowMs >= existing.leaseExpiresAtMs) {
        existing.state = DISTRIBUTED_RESERVATION_STATES.EXPIRED
        existing.expiredAt = new Date(nowMs).toISOString()
        existing.updatedAt = existing.expiredAt
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED: Reserva expirada antes de firmar'
        )
      }
      existing.kmsAttempted = true
      existing.updatedAt = new Date(nowMs).toISOString()
      return freezeReservationRecord(existing)
    }, true)
  }

  async commitReservation(params) {
    const requestId =
      typeof params?.requestId === 'string' ? params.requestId.trim() : ''
    return await this._withSharedFileLock((state) => {
      const existing = state.records[requestId]
      if (!existing) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente al confirmar'
        )
      }
      if (existing.state === DISTRIBUTED_RESERVATION_STATES.EXPIRED) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED: No se puede confirmar reserva expirada'
        )
      }
      assertValidReservationTransition(
        existing.state,
        DISTRIBUTED_RESERVATION_STATES.CONSUMED,
        'commitReservation'
      )
      if (params?.ownerNodeId && existing.ownerNodeId !== params.ownerNodeId) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_OWNER_MISMATCH: Otro nodo posee esta reserva'
        )
      }
      if (
        params?.reservationToken &&
        existing.reservationToken !== params.reservationToken
      ) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_TOKEN_MISMATCH: Token de reserva inválido'
        )
      }
      const nowMs = normalizeEffectiveNowMs(
        params?.now !== undefined ? params.now : this._nowProvider()
      )
      if (nowMs >= existing.leaseExpiresAtMs) {
        existing.state = DISTRIBUTED_RESERVATION_STATES.EXPIRED
        existing.expiredAt = new Date(nowMs).toISOString()
        existing.updatedAt = existing.expiredAt
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED: Lease vencido al confirmar'
        )
      }
      const nowIso = new Date(nowMs).toISOString()
      existing.state = DISTRIBUTED_RESERVATION_STATES.CONSUMED
      existing.kmsAttempted = true
      existing.consumedAt = nowIso
      existing.updatedAt = nowIso
      existing.responseDigest = params?.responseDigest || null
      return freezeReservationRecord(existing)
    }, true)
  }

  async markReservationFailed(params) {
    const requestId =
      typeof params?.requestId === 'string' ? params.requestId.trim() : ''
    return await this._withSharedFileLock((state) => {
      const existing = state.records[requestId]
      if (!existing) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente al marcar fallo'
        )
      }
      if (existing.state === DISTRIBUTED_RESERVATION_STATES.FAILED) {
        return freezeReservationRecord(existing)
      }
      assertValidReservationTransition(
        existing.state,
        DISTRIBUTED_RESERVATION_STATES.FAILED,
        'markReservationFailed'
      )
      const nowMs = normalizeEffectiveNowMs(
        params?.now !== undefined ? params.now : this._nowProvider()
      )
      const nowIso = new Date(nowMs).toISOString()
      existing.state = DISTRIBUTED_RESERVATION_STATES.FAILED
      existing.kmsAttempted = true
      existing.failedAt = nowIso
      existing.updatedAt = nowIso
      existing.failureReason = String(
        params?.reason || 'SIGNING_OR_COMMIT_FAILED'
      ).slice(0, 160)
      return freezeReservationRecord(existing)
    }, true)
  }

  async expireReservation(params) {
    const requestId =
      typeof params === 'string'
        ? params.trim()
        : typeof params?.requestId === 'string'
          ? params.requestId.trim()
          : ''
    return await this._withSharedFileLock((state) => {
      const existing = state.records[requestId]
      if (!existing) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente al expirar'
        )
      }
      if (existing.state === DISTRIBUTED_RESERVATION_STATES.EXPIRED) {
        return freezeReservationRecord(existing)
      }
      assertValidReservationTransition(
        existing.state,
        DISTRIBUTED_RESERVATION_STATES.EXPIRED,
        'expireReservation'
      )
      const nowMs = normalizeEffectiveNowMs(
        typeof params === 'object' && params?.now !== undefined
          ? params.now
          : this._nowProvider()
      )
      if (nowMs < existing.leaseExpiresAtMs) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_LEASE_ACTIVE: Lease aún vigente'
        )
      }
      const nowIso = new Date(nowMs).toISOString()
      existing.state = DISTRIBUTED_RESERVATION_STATES.EXPIRED
      existing.expiredAt = nowIso
      existing.updatedAt = nowIso
      existing.failureReason = 'RESERVATION_LEASE_EXPIRED'
      return freezeReservationRecord(existing)
    }, true)
  }

  async hasAuthorizationId(authorizationId) {
    const key =
      typeof authorizationId === 'string' ? authorizationId.trim() : ''
    if (!key) return false
    return await this._withSharedFileLock(
      (state) =>
        Object.values(state.records).some((r) => r.authorizationId === key),
      false
    )
  }

  async hasRequestId(requestId) {
    const key = typeof requestId === 'string' ? requestId.trim() : ''
    if (!key) return false
    return await this._withSharedFileLock(
      (state) => Boolean(state.records[key]),
      false
    )
  }

  async hasRequestHash(requestSha256) {
    const key =
      typeof requestSha256 === 'string' ? requestSha256.trim().toLowerCase() : ''
    if (!key) return false
    return await this._withSharedFileLock(
      (state) =>
        Object.values(state.records).some((r) => r.requestSha256 === key),
      false
    )
  }

  async hasAttestationId(attestationId) {
    const key = typeof attestationId === 'string' ? attestationId.trim() : ''
    if (!key) return false
    return await this._withSharedFileLock(
      (state) =>
        Object.values(state.records).some((r) => r.attestationId === key),
      false
    )
  }
}
