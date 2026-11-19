// @ts-check
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  assertValidReservationTransition,
  computeDistributedIdempotencyKey,
  DEFAULT_RESERVATION_LEASE_TTL_MS,
  normalizeEffectiveNowMs,
  REQUIRED_DISTRIBUTED_STORE_METHODS,
} from './distributed-anti-replay.mjs'

export const ANTI_REPLAY_ENTRY_STATES = Object.freeze({
  RESERVED: 'RESERVED',
  CONSUMED: 'CONSUMED',
  FAILED_CONSUMED: 'FAILED_CONSUMED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
})

/**
 * Guardia anti-replay del lado de la Autoridad de Atestación Independiente.
 *
 * Previene la duplicación o reemisión de atestaciones para un mismo:
 * - requestId
 * - requestSha256
 * - authorizationId (GO Grant single-use)
 * - attestationId
 *
 * Política fail-closed pre-firma:
 * Toda solicitud debe reservar atómicamente sus identificadores ANTES de invocar
 * al proveedor de firma. Ante error de firma posterior a la reserva, el registro
 * pasa a FAILED_CONSUMED y NO se recicla.
 *
 * Distingue explícitamente el nivel de garantía real:
 * - memory -> HOST_LOCAL_SERVICE_IN_MEMORY_ONE_TIME_USE (sin garantía multi-nodo)
 * - file -> HOST_LOCAL_SERVICE_DURABLE_ONE_TIME_USE (host-local; sin garantía multi-nodo)
 * - distributed -> DISTRIBUTED_MULTI_NODE_ONE_TIME_USE (únicamente con backend externo validado)
 */
export class ServiceAntiReplayGuard {
  /**
   * @param {object} [options]
   * @param {'memory' | 'file' | 'distributed'} [options.storageType='memory']
   * @param {string} [options.filePath]
   * @param {string} [options.nodeId]
   * @param {number} [options.leaseTtlMs=30000]
   * @param {(() => number | string | Date) | number | string | Date} [options.now]
   * @param {{
   *   hasRequestId: (id: string) => Promise<boolean> | boolean,
   *   hasRequestHash: (sha: string) => Promise<boolean> | boolean,
   *   hasAttestationId: (id: string) => Promise<boolean> | boolean,
   *   hasAuthorizationId?: (id: string) => Promise<boolean> | boolean,
   *   hasGoAuthorizationId?: (id: string) => Promise<boolean> | boolean,
   *   reserveOnce?: (entry: Record<string, any>) => Promise<any> | any,
   *   getReservation?: (requestId: string) => Promise<any> | any,
   *   markSigningAttemptStarted?: (entry: Record<string, any>) => Promise<any> | any,
   *   commitReservation?: (entry: Record<string, any>) => Promise<any> | any,
   *   markReservationFailed?: (entry: Record<string, any>) => Promise<any> | any,
   *   expireReservation?: (entry: Record<string, any>) => Promise<any> | any,
   *   recordOnce: (entry: Record<string, any>) => Promise<any> | any,
   *   markFailed?: (entry: Record<string, any>) => Promise<any> | any,
   *   isHealthy?: () => Promise<boolean> | boolean,
   *   backendKind?: string,
   *   multiNodeAtomicGuaranteed?: boolean,
   *   isRealInfrastructureTested?: boolean,
   *   isSimulatedReferenceStore?: boolean,
   *   isProductionDistributedReady?: boolean
   * }} [options.distributedStore]
   */
  constructor(options = {}) {
    this._storageType = options.storageType || 'memory'
    this._filePath = options.filePath || null
    this._distributedStore = options.distributedStore || null
    this._nodeId =
      typeof options.nodeId === 'string' && options.nodeId.trim().length > 0
        ? options.nodeId.trim()
        : `node-${process.pid}-${crypto.randomUUID().slice(0, 8)}`
    this._leaseTtlMs =
      typeof options.leaseTtlMs === 'number' &&
      Number.isFinite(options.leaseTtlMs) &&
      options.leaseTtlMs > 0
        ? Math.floor(options.leaseTtlMs)
        : DEFAULT_RESERVATION_LEASE_TTL_MS
    this._nowProvider =
      typeof options.now === 'function'
        ? options.now
        : options.now !== undefined
          ? () => options.now
          : () => Date.now()
    this._storageCorrupted = false
    this._fileOpQueue = Promise.resolve()

    if (!['memory', 'file', 'distributed'].includes(this._storageType)) {
      throw new Error(
        `SERVICE_ANTI_REPLAY_STORAGE_INVALID: storageType '${this._storageType}' no válido`
      )
    }

    if (this._storageType === 'file' && !this._filePath) {
      throw new Error(
        'SERVICE_ANTI_REPLAY_FILE_PATH_REQUIRED: storageType="file" requiere filePath explícito'
      )
    }

    if (this._storageType === 'distributed') {
      const store = this._distributedStore
      if (
        !store ||
        typeof store.hasRequestId !== 'function' ||
        typeof store.hasRequestHash !== 'function' ||
        typeof store.hasAttestationId !== 'function' ||
        typeof store.recordOnce !== 'function'
      ) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_DISTRIBUTED_STORE_REQUIRED: Se requiere backend distribuido válido (hasRequestId, hasRequestHash, hasAttestationId, recordOnce) para declarar nivel distribuido'
        )
      }
    }

    this._processedRequestIds = new Set()
    this._processedRequestHashes = new Set()
    this._processedAttestationIds = new Set()
    this._processedGoAuthorizationIds = new Set()
    /** @type {Map<string, Record<string, any>>} */
    this._records = new Map()
    this._tmpSeq = 0

    if (this._storageType === 'file' && this._filePath) {
      this._assertNoSymlinks(this._filePath)
      this._loadFromFile()
    }
  }

  /**
   * Verifica que ni la ruta destino ni sus directorios ancestros existentes sean symlinks o junctions.
   * @param {string} targetPath
   */
  _assertNoSymlinks(targetPath) {
    let cur = path.resolve(targetPath)
    while (true) {
      try {
        const st = fs.lstatSync(cur)
        if (st.isSymbolicLink()) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_SYMLINK_FORBIDDEN: Prohibido usar enlaces simbólicos o junctions en rutas anti-replay'
          )
        }
      } catch (err) {
        if (err?.message?.includes('SERVICE_ANTI_REPLAY_SYMLINK_FORBIDDEN')) {
          throw err
        }
        // ENOENT en segmento aún inexistente es normal; cualquier otro error no EEXIST se ignora hasta llegar al padre existente
      }
      const parent = path.dirname(cur)
      if (parent === cur) break
      cur = parent
    }
  }

  get storageType() {
    return this._storageType
  }

  get guaranteeLevel() {
    if (this._storageType === 'distributed') {
      return 'DISTRIBUTED_MULTI_NODE_ONE_TIME_USE'
    }
    if (this._storageType === 'file') {
      return 'HOST_LOCAL_SERVICE_DURABLE_ONE_TIME_USE'
    }
    return 'HOST_LOCAL_SERVICE_IN_MEMORY_ONE_TIME_USE'
  }

  get antiReplayTier() {
    if (this._storageType === 'distributed') {
      return 'DISTRIBUTED_MULTI_NODE'
    }
    if (this._storageType === 'file') {
      return 'LOCAL_DURABLE'
    }
    return 'IN_MEMORY'
  }

  get multiNodeAtomicGuaranteed() {
    if (this._storageType !== 'distributed' || !this._distributedStore) {
      return false
    }
    if (typeof this._distributedStore.multiNodeAtomicGuaranteed === 'boolean') {
      return this._distributedStore.multiNodeAtomicGuaranteed
    }
    return typeof this._distributedStore.reserveOnce === 'function'
  }

  get nodeId() {
    return this._nodeId
  }

  get leaseTtlMs() {
    return this._leaseTtlMs
  }

  get distributedBackendKind() {
    if (this._storageType !== 'distributed' || !this._distributedStore) {
      return null
    }
    return this._distributedStore.backendKind || 'CUSTOM_DISTRIBUTED_STORE'
  }

  get isFormalDistributedContract() {
    if (this._storageType !== 'distributed' || !this._distributedStore) {
      return false
    }
    return REQUIRED_DISTRIBUTED_STORE_METHODS.every(
      (name) => typeof this._distributedStore[name] === 'function'
    )
  }

  get isRealInfrastructureTested() {
    if (this._storageType === 'distributed' && this._distributedStore) {
      return Boolean(this._distributedStore.isRealInfrastructureTested)
    }
    return false
  }

  get size() {
    return this._processedRequestIds.size
  }

  /**
   * Fuerza sincronización segura en disco si el backend local durable está activo.
   */
  flush() {
    if (
      this._storageType === 'file' &&
      this._filePath &&
      !this._storageCorrupted
    ) {
      this._persistToFile()
    }
  }

  /**
   * Ejecuta una operación serializada en cola + lockfile exclusivo host-local para modo `file`.
   * Garantiza exclusión atómica local y falla cerrado si no puede adquirirse el lock.
   * @template T
   * @param {() => Promise<T> | T} fn
   * @returns {Promise<T>}
   */
  _withFileLock(fn) {
    const run = async () => {
      if (this._storageType !== 'file' || !this._filePath) {
        return await fn()
      }

      this._assertNoSymlinks(this._filePath)
      const dir = path.dirname(this._filePath)
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        this._assertNoSymlinks(this._filePath)
      } catch (err) {
        if (err?.message?.includes('SERVICE_ANTI_REPLAY_SYMLINK_FORBIDDEN')) {
          throw err
        }
        throw new Error(
          `SERVICE_ANTI_REPLAY_STORAGE_ERROR: No se pudo preparar directorio de anti-replay: ${err?.message || String(err)}`
        )
      }

      const lockPath = `${this._filePath}.lock`
      this._assertNoSymlinks(lockPath)
      let lockFd = null
      try {
        lockFd = fs.openSync(lockPath, 'wx')
      } catch (lockErr) {
        throw new Error(
          `SERVICE_ANTI_REPLAY_LOCK_CONTENTION: No se pudo adquirir lock exclusivo host-local de anti-replay: ${lockErr?.message || String(lockErr)}`
        )
      }

      try {
        // Re-sincronizar desde disco bajo lock exclusivo antes de validar/mutar
        this._loadFromFile()
        return await fn()
      } finally {
        try {
          if (lockFd !== null) fs.closeSync(lockFd)
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

    const next = this._fileOpQueue.then(run, run)
    this._fileOpQueue = next.catch(() => {})
    return next
  }

  /**
   * Indica si el almacén anti-replay está operativo sin exponer secretos.
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    if (this._storageCorrupted) return false
    if (this._storageType === 'distributed' && this._distributedStore) {
      if (typeof this._distributedStore.isHealthy === 'function') {
        try {
          return Boolean(await this._distributedStore.isHealthy())
        } catch {
          return false
        }
      }
      return true
    }
    if (this._storageType === 'file' && this._filePath) {
      try {
        this._assertNoSymlinks(this._filePath)
        const dir = path.dirname(this._filePath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK)
        if (fs.existsSync(this._filePath)) {
          const raw = fs.readFileSync(this._filePath, 'utf8')
          const parsed = JSON.parse(raw)
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return false
          }
        }
        return true
      } catch {
        return false
      }
    }
    return true
  }

  /**
   * Verificación síncrona para backends host-local (memory / file).
   * @param {object} request
   * @returns {boolean}
   */
  check(request) {
    if (this._storageCorrupted) {
      throw new Error(
        'SERVICE_ANTI_REPLAY_STORAGE_ERROR: El almacén anti-replay está corrupto o inoperativo'
      )
    }

    if (!request || typeof request !== 'object') {
      throw new Error('SERVICE_ANTI_REPLAY_INVALID_REQUEST: Solicitud inválida')
    }

    if (!request.requestId || typeof request.requestId !== 'string') {
      throw new Error(
        'SERVICE_ANTI_REPLAY_REQUEST_ID_REQUIRED: requestId requerido para verificación anti-replay'
      )
    }

    if (this._processedRequestIds.has(request.requestId)) {
      throw new Error(
        `SERVICE_ANTI_REPLAY_REQUEST_ID_DUPLICATED: requestId '${request.requestId}' ya fue utilizado previamente`
      )
    }

    if (
      request.requestSha256 &&
      this._processedRequestHashes.has(request.requestSha256)
    ) {
      throw new Error(
        `SERVICE_ANTI_REPLAY_REQUEST_HASH_DUPLICATED: requestSha256 '${request.requestSha256}' ya fue utilizado previamente`
      )
    }

    const goAuthId =
      (request.goAuthorizationGrant &&
        request.goAuthorizationGrant.authorizationId) ||
      request.authorizationId ||
      null
    if (goAuthId && this._processedGoAuthorizationIds.has(goAuthId)) {
      throw new Error(
        `SERVICE_ANTI_REPLAY_GO_AUTHORIZATION_DUPLICATED: authorizationId '${goAuthId}' ya fue consumido o reservado previamente`
      )
    }

    return true
  }

  /**
   * Verificación asíncrona unificada (soporta backend distribuido y host-local).
   * @param {object} request
   * @returns {Promise<boolean>}
   */
  async checkAsync(request) {
    this.check(request)

    if (this._storageType === 'distributed' && this._distributedStore) {
      const hasAuthCheck =
        typeof this._distributedStore.hasGoAuthorizationId === 'function' ||
        typeof this._distributedStore.hasAuthorizationId === 'function'
      if (typeof this._distributedStore.reserveOnce !== 'function' || !hasAuthCheck) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_STORAGE_ERROR: El almacén distribuido debe implementar reserveOnce y hasAuthorizationId/hasGoAuthorizationId atómicos pre-firma'
        )
      }
      try {
        if (await this._distributedStore.hasRequestId(request.requestId)) {
          throw new Error(
            `SERVICE_ANTI_REPLAY_REQUEST_ID_DUPLICATED: requestId '${request.requestId}' ya fue atestado previamente (distribuido)`
          )
        }
        if (
          request.requestSha256 &&
          (await this._distributedStore.hasRequestHash(request.requestSha256))
        ) {
          throw new Error(
            `SERVICE_ANTI_REPLAY_REQUEST_HASH_DUPLICATED: requestSha256 '${request.requestSha256}' ya fue atestado previamente (distribuido)`
          )
        }
        const goAuthId =
          (request.goAuthorizationGrant &&
            request.goAuthorizationGrant.authorizationId) ||
          request.authorizationId ||
          null
        if (goAuthId) {
          const authFn =
            typeof this._distributedStore.hasAuthorizationId === 'function'
              ? this._distributedStore.hasAuthorizationId.bind(this._distributedStore)
              : this._distributedStore.hasGoAuthorizationId.bind(
                  this._distributedStore
                )
          if (await authFn(goAuthId)) {
            throw new Error(
              `SERVICE_ANTI_REPLAY_GO_AUTHORIZATION_DUPLICATED: authorizationId '${goAuthId}' ya fue consumido previamente (distribuido)`
            )
          }
        }
      } catch (err) {
        if (err?.message?.includes('SERVICE_ANTI_REPLAY_')) throw err
        throw new Error(
          `SERVICE_ANTI_REPLAY_STORAGE_ERROR: Fallo al consultar almacenamiento anti-replay distribuido: ${err?.message || String(err)}`
        )
      }
    }

    return true
  }

  /**
   * Reserva atómicamente los identificadores ANTES de ejecutar la firma de atestación.
   * Garantiza exclusión mutua pre-firma en host local (`file`) o multi-nodo (`distributed`).
   *
   * @param {Record<string, any>} request
   * @param {string} reservedAttestationId
   * @param {{ now?: Date | number | string, leaseTtlMs?: number }} [options]
   */
  async reserveBeforeSign(request, reservedAttestationId, options = {}) {
    if (
      !reservedAttestationId ||
      typeof reservedAttestationId !== 'string' ||
      reservedAttestationId.trim().length === 0
    ) {
      throw new Error(
        'SERVICE_ANTI_REPLAY_ATTESTATION_ID_REQUIRED: attestationId preasignado requerido para reservar'
      )
    }

    const goAuthId =
      (request &&
        request.goAuthorizationGrant &&
        request.goAuthorizationGrant.authorizationId) ||
      (request && request.authorizationId) ||
      null

    const nowMs = normalizeEffectiveNowMs(
      options?.now !== undefined ? options.now : this._nowProvider()
    )
    const leaseTtlMs =
      typeof options?.leaseTtlMs === 'number' &&
      Number.isFinite(options.leaseTtlMs) &&
      options.leaseTtlMs > 0
        ? Math.floor(options.leaseTtlMs)
        : this._leaseTtlMs
    const leaseExpiresAtMs = nowMs + leaseTtlMs
    const reservedAtIso = new Date(nowMs).toISOString()
    const leaseExpiresAtIso = new Date(leaseExpiresAtMs).toISOString()
    const reservationToken = `resv-${crypto.randomUUID()}`

    const reserveInMemoryAtomically = () => {
      this.check(request)
      if (this._processedAttestationIds.has(reservedAttestationId)) {
        throw new Error(
          `SERVICE_ANTI_REPLAY_ATTESTATION_ID_DUPLICATED: attestationId '${reservedAttestationId}' ya reservado o consumido`
        )
      }

      const idempotencyKey = computeDistributedIdempotencyKey({
        authorizationId: goAuthId,
        requestId: request.requestId,
        requestSha256: request.requestSha256 || '',
      })

      const record = {
        idempotencyKey,
        requestId: request.requestId,
        requestSha256: request.requestSha256 || '',
        authorizationId: goAuthId,
        goAuthorizationId: goAuthId,
        attestationId: reservedAttestationId,
        state: ANTI_REPLAY_ENTRY_STATES.RESERVED,
        ownerNodeId: this._nodeId,
        reservationToken,
        kmsAttempted: false,
        reservedAt: reservedAtIso,
        reservedAtMs: nowMs,
        leaseExpiresAt: leaseExpiresAtIso,
        leaseExpiresAtMs,
        consumedAt: null,
        expiredAt: null,
        failureReason: null,
      }

      this._processedRequestIds.add(record.requestId)
      if (record.requestSha256) {
        this._processedRequestHashes.add(record.requestSha256)
      }
      if (goAuthId) {
        this._processedGoAuthorizationIds.add(goAuthId)
      }
      this._processedAttestationIds.add(reservedAttestationId)
      this._records.set(record.requestId, record)
      return record
    }

    if (this._storageType === 'file') {
      return await this._withFileLock(() => {
        const record = reserveInMemoryAtomically()
        try {
          this._persistToFile()
        } catch (persistErr) {
          // Si falló persistir en disco antes de firmar, deshacer solo la marca en RAM si nunca salió firma
          // y fallar cerrado con SERVICE_ANTI_REPLAY_STORAGE_ERROR
          this._removeUncommittedMemoryEntry(record)
          throw persistErr
        }
        return Object.freeze({
          idempotencyKey: record.idempotencyKey,
          requestId: record.requestId,
          requestSha256: record.requestSha256,
          authorizationId: record.authorizationId,
          goAuthorizationId: record.goAuthorizationId,
          attestationId: record.attestationId,
          ownerNodeId: record.ownerNodeId,
          reservationToken: record.reservationToken,
          leaseExpiresAt: record.leaseExpiresAt,
        })
      })
    }

    // Sección crítica sincrónica antes de cualquier await (para memory y distributed)
    const record = reserveInMemoryAtomically()

    if (this._storageType === 'distributed' && this._distributedStore) {
      const store = this._distributedStore
      const hasAuthCheck =
        typeof store.hasAuthorizationId === 'function' ||
        typeof store.hasGoAuthorizationId === 'function'
      const hasCommitFn =
        typeof store.commitReservation === 'function' ||
        typeof store.recordOnce === 'function'
      if (
        typeof store.reserveOnce !== 'function' ||
        !hasAuthCheck ||
        !hasCommitFn
      ) {
        this._removeUncommittedMemoryEntry(record)
        throw new Error(
          'SERVICE_ANTI_REPLAY_STORAGE_ERROR: El almacén distribuido debe implementar reserveOnce, commitReservation/recordOnce y hasAuthorizationId/hasGoAuthorizationId atómicos pre-firma'
        )
      }

      if (typeof store.isHealthy === 'function') {
        let storeHealthy = false
        try {
          storeHealthy = Boolean(await store.isHealthy())
        } catch {
          storeHealthy = false
        }
        if (!storeHealthy) {
          this._removeUncommittedMemoryEntry(record)
          throw new Error(
            'SERVICE_ANTI_REPLAY_UNAVAILABLE: El almacén anti-replay distribuido no está saludable; prohibido reservar o firmar'
          )
        }
      }

      try {
        const receipt = await store.reserveOnce({
          requestId: record.requestId,
          requestSha256: record.requestSha256,
          attestationId: record.attestationId,
          authorizationId: record.goAuthorizationId,
          goAuthorizationId: record.goAuthorizationId,
          ownerNodeId: record.ownerNodeId,
          reservationToken: record.reservationToken,
          leaseTtlMs,
          now: nowMs,
        })
        if (receipt && typeof receipt === 'object') {
          if (typeof receipt.reservationToken === 'string') {
            record.reservationToken = receipt.reservationToken
          }
          if (typeof receipt.ownerNodeId === 'string') {
            record.ownerNodeId = receipt.ownerNodeId
          }
          if (typeof receipt.leaseExpiresAt === 'string') {
            record.leaseExpiresAt = receipt.leaseExpiresAt
            const parsedExp = Date.parse(receipt.leaseExpiresAt)
            if (Number.isFinite(parsedExp)) record.leaseExpiresAtMs = parsedExp
          }
          if (typeof receipt.idempotencyKey === 'string') {
            record.idempotencyKey = receipt.idempotencyKey
          }
        }
      } catch (err) {
        // En fallo o conflicto distribuido limpiar entrada local no confirmada del nodo actual y fallar cerrado
        this._removeUncommittedMemoryEntry(record)
        if (err?.message?.includes('SERVICE_ANTI_REPLAY_')) {
          throw err
        }
        throw new Error(
          `SERVICE_ANTI_REPLAY_STORAGE_ERROR: Error al reservar en almacén anti-replay distribuido: ${err?.message || String(err)}`
        )
      }
    }

    return Object.freeze({
      idempotencyKey: record.idempotencyKey,
      requestId: record.requestId,
      requestSha256: record.requestSha256,
      authorizationId: record.authorizationId,
      goAuthorizationId: record.goAuthorizationId,
      attestationId: record.attestationId,
      ownerNodeId: record.ownerNodeId,
      reservationToken: record.reservationToken,
      leaseExpiresAt: record.leaseExpiresAt,
    })
  }

  /**
   * Marca inicio de firma KMS/Ed25519 para evitar reutilización ante resultado incierto.
   * @param {{ requestId: string, attestationId?: string, ownerNodeId?: string, reservationToken?: string }} reservation
   * @param {{ now?: Date | number | string }} [options]
   */
  async markSigningAttemptStarted(reservation, options = {}) {
    if (!reservation || !reservation.requestId) return

    const nowMs = normalizeEffectiveNowMs(
      options?.now !== undefined ? options.now : this._nowProvider()
    )
    const nowIso = new Date(nowMs).toISOString()

    if (
      this._storageType === 'distributed' &&
      this._distributedStore &&
      typeof this._distributedStore.markSigningAttemptStarted === 'function'
    ) {
      await this._distributedStore.markSigningAttemptStarted({
        requestId: reservation.requestId,
        attestationId: reservation.attestationId,
        ownerNodeId: reservation.ownerNodeId || this._nodeId,
        reservationToken: reservation.reservationToken,
        now: nowMs,
      })
    }

    const update = () => {
      const rec = this._records.get(reservation.requestId)
      if (rec) {
        rec.kmsAttempted = true
        rec.updatedAt = nowIso
      }
    }

    if (this._storageType === 'file') {
      await this._withFileLock(() => {
        update()
        this._persistToFile()
      })
      return
    }

    update()
  }

  /**
   * Confirma transición de RESERVED -> CONSUMED una vez completada la firma.
   * @param {{ requestId: string, requestSha256: string, attestationId: string, goAuthorizationId: string | null, ownerNodeId?: string, reservationToken?: string }} reservation
   * @param {Record<string, any>} response
   * @param {{ now?: Date | number | string }} [options]
   */
  async commitReservation(reservation, response, options = {}) {
    if (this._storageCorrupted) {
      throw new Error(
        'SERVICE_ANTI_REPLAY_STORAGE_ERROR: El almacén anti-replay está corrupto o inoperativo'
      )
    }

    if (
      !response ||
      !response.attestationId ||
      response.attestationId !== reservation.attestationId
    ) {
      throw new Error(
        'SERVICE_ANTI_REPLAY_ATTESTATION_ID_REQUIRED: Inconsistencia entre attestationId reservado y respuesta'
      )
    }

    const nowMs = normalizeEffectiveNowMs(
      options?.now !== undefined ? options.now : this._nowProvider()
    )
    const nowIso = new Date(nowMs).toISOString()

    const markConsumed = () => {
      const existing = this._records.get(reservation.requestId)
      if (!existing) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva anti-replay inexistente al confirmar consumo'
        )
      }
      if (existing.state === ANTI_REPLAY_ENTRY_STATES.EXPIRED) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED: No se puede confirmar una reserva ya expirada'
        )
      }
      assertValidReservationTransition(
        existing.state,
        ANTI_REPLAY_ENTRY_STATES.CONSUMED,
        'commitReservation'
      )
      if (
        typeof existing.leaseExpiresAtMs === 'number' &&
        nowMs >= existing.leaseExpiresAtMs
      ) {
        existing.state = ANTI_REPLAY_ENTRY_STATES.EXPIRED
        existing.expiredAt = nowIso
        existing.updatedAt = nowIso
        if (this._storageType === 'file') {
          this._persistToFile()
        }
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED: Lease de reserva vencido antes de confirmar'
        )
      }
      existing.state = ANTI_REPLAY_ENTRY_STATES.CONSUMED
      existing.kmsAttempted = true
      existing.consumedAt = nowIso
      existing.updatedAt = nowIso
    }

    if (this._storageType === 'file') {
      await this._withFileLock(() => {
        markConsumed()
        this._persistToFile()
      })
      return
    }

    if (this._storageType === 'distributed' && this._distributedStore) {
      const store = this._distributedStore
      const hasAuthCheck =
        typeof store.hasAuthorizationId === 'function' ||
        typeof store.hasGoAuthorizationId === 'function'
      const hasCommitFn =
        typeof store.commitReservation === 'function' ||
        typeof store.recordOnce === 'function'
      if (typeof store.reserveOnce !== 'function' || !hasAuthCheck || !hasCommitFn) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_STORAGE_ERROR: El almacén distribuido debe implementar reserveOnce, commitReservation/recordOnce y hasAuthorizationId/hasGoAuthorizationId atómicos pre-firma'
        )
      }
      try {
        if (typeof store.commitReservation === 'function') {
          await store.commitReservation({
            requestId: reservation.requestId,
            requestSha256: reservation.requestSha256 || '',
            attestationId: reservation.attestationId,
            authorizationId: reservation.goAuthorizationId,
            goAuthorizationId: reservation.goAuthorizationId,
            ownerNodeId: reservation.ownerNodeId || this._nodeId,
            reservationToken: reservation.reservationToken,
            responseDigest: response.attestationPayloadSha256 || null,
            now: nowMs,
          })
        } else {
          await store.recordOnce({
            requestId: reservation.requestId,
            requestSha256: reservation.requestSha256 || '',
            attestationId: reservation.attestationId,
            goAuthorizationId: reservation.goAuthorizationId,
          })
        }
      } catch (err) {
        if (err?.message?.includes('SERVICE_ANTI_REPLAY_')) throw err
        throw new Error(
          `SERVICE_ANTI_REPLAY_STORAGE_ERROR: Fallo al confirmar registro en almacén distribuido: ${err?.message || String(err)}`
        )
      }
    }

    markConsumed()
  }

  /**
   * Transiciona una reserva a FAILED / FAILED_CONSUMED tras fallo en firma KMS o post-firma.
   * Nunca libera el identificador para reintento fail-open ni sobrescribe un CONSUMED existente.
   * @param {{ requestId: string, attestationId: string, ownerNodeId?: string, reservationToken?: string }} reservation
   * @param {string} reason
   * @param {{ now?: Date | number | string }} [options]
   */
  async markReservationFailed(reservation, reason, options = {}) {
    if (!reservation || !reservation.requestId) return

    const nowMs = normalizeEffectiveNowMs(
      options?.now !== undefined ? options.now : this._nowProvider()
    )
    const nowIso = new Date(nowMs).toISOString()
    const terminalFailedState =
      this._storageType === 'distributed'
        ? ANTI_REPLAY_ENTRY_STATES.FAILED
        : ANTI_REPLAY_ENTRY_STATES.FAILED_CONSUMED

    const update = () => {
      const rec = this._records.get(reservation.requestId)
      if (rec && rec.state === ANTI_REPLAY_ENTRY_STATES.RESERVED) {
        rec.state = terminalFailedState
        rec.kmsAttempted = true
        rec.failureReason = String(reason || 'SIGNING_OR_PERSISTENCE_FAILED').slice(
          0,
          160
        )
        rec.updatedAt = nowIso
      }
    }

    if (this._storageType === 'file') {
      try {
        await this._withFileLock(() => {
          update()
          this._persistToFile()
        })
      } catch {
        // Ya quedó marcado fail-closed o corrupción registrada en almacenamiento
      }
      return
    }

    if (this._storageType === 'distributed' && this._distributedStore) {
      const failFn =
        typeof this._distributedStore.markReservationFailed === 'function'
          ? this._distributedStore.markReservationFailed.bind(
              this._distributedStore
            )
          : typeof this._distributedStore.markFailed === 'function'
            ? this._distributedStore.markFailed.bind(this._distributedStore)
            : null
      if (failFn) {
        try {
          await failFn({
            requestId: reservation.requestId,
            attestationId: reservation.attestationId,
            ownerNodeId: reservation.ownerNodeId || this._nodeId,
            reservationToken: reservation.reservationToken,
            reason,
            now: nowMs,
          })
        } catch {
          // Preservar falla original de forma cerrada
        }
      }
    }

    update()
  }

  /**
   * Expira una reserva abandonada cuyo lease venció (`RESERVED -> EXPIRED`).
   * Nunca recicla la autorización ni permite volver a `AVAILABLE`/`RESERVED`.
   *
   * @param {string | { requestId: string }} requestIdOrTarget
   * @param {{ now?: Date | number | string, reason?: string }} [options]
   */
  async expireReservation(requestIdOrTarget, options = {}) {
    const requestId =
      typeof requestIdOrTarget === 'string'
        ? requestIdOrTarget.trim()
        : typeof requestIdOrTarget?.requestId === 'string'
          ? requestIdOrTarget.requestId.trim()
          : ''
    if (!requestId) {
      throw new Error(
        'SERVICE_ANTI_REPLAY_REQUEST_ID_REQUIRED: requestId requerido para expirar reserva'
      )
    }

    const nowMs = normalizeEffectiveNowMs(
      options?.now !== undefined ? options.now : this._nowProvider()
    )
    const nowIso = new Date(nowMs).toISOString()

    if (
      this._storageType === 'distributed' &&
      this._distributedStore &&
      typeof this._distributedStore.expireReservation === 'function'
    ) {
      const expired = await this._distributedStore.expireReservation({
        requestId,
        now: nowMs,
        reason: options?.reason,
      })
      const localRec = this._records.get(requestId)
      if (localRec && localRec.state === ANTI_REPLAY_ENTRY_STATES.RESERVED) {
        localRec.state = ANTI_REPLAY_ENTRY_STATES.EXPIRED
        localRec.expiredAt = expired?.expiredAt || nowIso
        localRec.updatedAt = localRec.expiredAt
      }
      return expired
    }

    const expireLocal = () => {
      const existing = this._records.get(requestId)
      if (!existing) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente al expirar'
        )
      }
      if (existing.state === ANTI_REPLAY_ENTRY_STATES.EXPIRED) {
        return Object.freeze({ ...existing })
      }
      assertValidReservationTransition(
        existing.state,
        ANTI_REPLAY_ENTRY_STATES.EXPIRED,
        'expireReservation'
      )
      if (
        typeof existing.leaseExpiresAtMs === 'number' &&
        nowMs < existing.leaseExpiresAtMs
      ) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_LEASE_ACTIVE: No se puede expirar una reserva cuyo lease sigue vigente'
        )
      }
      existing.state = ANTI_REPLAY_ENTRY_STATES.EXPIRED
      existing.expiredAt = nowIso
      existing.updatedAt = nowIso
      existing.failureReason = String(
        options?.reason || 'RESERVATION_LEASE_EXPIRED'
      ).slice(0, 160)
      return Object.freeze({ ...existing })
    }

    if (this._storageType === 'file') {
      return await this._withFileLock(() => {
        const res = expireLocal()
        this._persistToFile()
        return res
      })
    }

    return expireLocal()
  }

  /**
   * Consulta el estado de una reserva en el backend configurado.
   * @param {string} requestId
   */
  async getReservation(requestId) {
    const key = typeof requestId === 'string' ? requestId.trim() : ''
    if (!key) return null
    if (
      this._storageType === 'distributed' &&
      this._distributedStore &&
      typeof this._distributedStore.getReservation === 'function'
    ) {
      return await this._distributedStore.getReservation(key)
    }
    if (this._storageType === 'file') {
      return await this._withFileLock(() => {
        const rec = this._records.get(key)
        return rec ? Object.freeze({ ...rec }) : null
      })
    }
    const rec = this._records.get(key)
    return rec ? Object.freeze({ ...rec }) : null
  }

  /**
   * Verifica si un authorizationId GO ya fue reservado, consumido, fallado o expirado.
   * @param {string} authorizationId
   * @returns {Promise<boolean>}
   */
  async hasAuthorizationId(authorizationId) {
    const key =
      typeof authorizationId === 'string' ? authorizationId.trim() : ''
    if (!key) return false
    if (this._storageType === 'distributed' && this._distributedStore) {
      if (typeof this._distributedStore.hasAuthorizationId === 'function') {
        return Boolean(await this._distributedStore.hasAuthorizationId(key))
      }
      if (typeof this._distributedStore.hasGoAuthorizationId === 'function') {
        return Boolean(await this._distributedStore.hasGoAuthorizationId(key))
      }
    }
    if (this._storageType === 'file') {
      return await this._withFileLock(
        () => this._processedGoAuthorizationIds.has(key)
      )
    }
    return this._processedGoAuthorizationIds.has(key)
  }

  /**
   * Registra de forma síncrona la solicitud y respuesta consumidas (compatibilidad directa host-local).
   * @param {object} request
   * @param {object} response
   */
  record(request, response) {
    this.check(request)

    if (
      !response ||
      !response.attestationId ||
      typeof response.attestationId !== 'string'
    ) {
      throw new Error(
        'SERVICE_ANTI_REPLAY_ATTESTATION_ID_REQUIRED: attestationId requerido en respuesta'
      )
    }

    if (this._processedAttestationIds.has(response.attestationId)) {
      throw new Error(
        `SERVICE_ANTI_REPLAY_ATTESTATION_ID_DUPLICATED: attestationId '${response.attestationId}' ya existe`
      )
    }

    const goAuthId =
      (request.goAuthorizationGrant &&
        request.goAuthorizationGrant.authorizationId) ||
      request.authorizationId ||
      null

    this._processedRequestIds.add(request.requestId)
    if (request.requestSha256) {
      this._processedRequestHashes.add(request.requestSha256)
    }
    if (goAuthId) {
      this._processedGoAuthorizationIds.add(goAuthId)
    }
    this._processedAttestationIds.add(response.attestationId)
    this._records.set(request.requestId, {
      requestId: request.requestId,
      requestSha256: request.requestSha256 || '',
      goAuthorizationId: goAuthId,
      attestationId: response.attestationId,
      state: ANTI_REPLAY_ENTRY_STATES.CONSUMED,
      kmsAttempted: true,
      consumedAt: new Date().toISOString(),
    })

    if (this._storageType === 'file' && this._filePath) {
      this._persistToFile()
    }
  }

  /**
   * Registra de forma asíncrona (soporta backend distribuido y host-local).
   * @param {object} request
   * @param {object} response
   */
  async recordAsync(request, response) {
    await this.checkAsync(request)

    if (
      !response ||
      !response.attestationId ||
      typeof response.attestationId !== 'string'
    ) {
      throw new Error(
        'SERVICE_ANTI_REPLAY_ATTESTATION_ID_REQUIRED: attestationId requerido en respuesta'
      )
    }

    const goAuthId =
      (request.goAuthorizationGrant &&
        request.goAuthorizationGrant.authorizationId) ||
      request.authorizationId ||
      null

    if (this._storageType === 'distributed' && this._distributedStore) {
      if (await this._distributedStore.hasAttestationId(response.attestationId)) {
        throw new Error(
          `SERVICE_ANTI_REPLAY_ATTESTATION_ID_DUPLICATED: attestationId '${response.attestationId}' ya existe (distribuido)`
        )
      }
      await this._distributedStore.recordOnce({
        requestId: request.requestId,
        requestSha256: request.requestSha256 || '',
        attestationId: response.attestationId,
        goAuthorizationId: goAuthId,
      })
    }

    this.record(request, response)
  }

  /**
   * Limpia únicamente de RAM cuando persistir una nueva reserva falló ANTES de invocar firma.
   * @param {Record<string, any>} record
   */
  _removeUncommittedMemoryEntry(record) {
    this._processedRequestIds.delete(record.requestId)
    if (record.requestSha256) {
      this._processedRequestHashes.delete(record.requestSha256)
    }
    if (record.goAuthorizationId) {
      this._processedGoAuthorizationIds.delete(record.goAuthorizationId)
    }
    this._processedAttestationIds.delete(record.attestationId)
    this._records.delete(record.requestId)
  }

  _loadFromFile() {
    try {
      this._assertNoSymlinks(this._filePath)
      if (fs.existsSync(this._filePath)) {
        const raw = fs.readFileSync(this._filePath, 'utf8')
        const data = JSON.parse(raw)
        this._processedRequestIds.clear()
        this._processedRequestHashes.clear()
        this._processedAttestationIds.clear()
        this._processedGoAuthorizationIds.clear()
        this._records.clear()

        if (Array.isArray(data.requestIds)) {
          data.requestIds.forEach((id) => this._processedRequestIds.add(id))
        }
        if (Array.isArray(data.requestHashes)) {
          data.requestHashes.forEach((h) => this._processedRequestHashes.add(h))
        }
        if (Array.isArray(data.attestationIds)) {
          data.attestationIds.forEach((id) =>
            this._processedAttestationIds.add(id)
          )
        }
        if (Array.isArray(data.goAuthorizationIds)) {
          data.goAuthorizationIds.forEach((id) =>
            this._processedGoAuthorizationIds.add(id)
          )
        }
        if (Array.isArray(data.records)) {
          data.records.forEach((rec) => {
            if (rec && typeof rec.requestId === 'string') {
              this._records.set(rec.requestId, rec)
            }
          })
        }
      }
    } catch (err) {
      this._storageCorrupted = true
      throw new Error(
        `SERVICE_ANTI_REPLAY_STORAGE_ERROR: Fallo al cargar almacén de anti-replay: ${err?.message || String(err)}`
      )
    }
  }

  _persistToFile() {
    try {
      this._assertNoSymlinks(this._filePath)
      const dir = path.dirname(this._filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      this._assertNoSymlinks(this._filePath)
      const payload = JSON.stringify(
        {
          requestIds: Array.from(this._processedRequestIds),
          requestHashes: Array.from(this._processedRequestHashes),
          attestationIds: Array.from(this._processedAttestationIds),
          goAuthorizationIds: Array.from(this._processedGoAuthorizationIds),
          records: Array.from(this._records.values()),
          guaranteeLevel: this.guaranteeLevel,
          multiNodeAtomicGuaranteed: false,
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      )
      this._tmpSeq += 1
      const tmpPath = `${this._filePath}.tmp-${process.pid}-${Date.now()}-${this._tmpSeq}`
      this._assertNoSymlinks(tmpPath)
      const tmpFd = fs.openSync(tmpPath, 'wx', 0o600)
      try {
        fs.writeFileSync(tmpFd, payload, 'utf8')
      } finally {
        fs.closeSync(tmpFd)
      }
      try {
        const sleepBuf = new Int32Array(new SharedArrayBuffer(4))
        const maxRenameAttempts = 8
        for (let attempt = 1; attempt <= maxRenameAttempts; attempt++) {
          try {
            fs.renameSync(tmpPath, this._filePath)
            break
          } catch (renameErr) {
            const code =
              renameErr && typeof renameErr === 'object' ? renameErr.code : ''
            if (
              attempt < maxRenameAttempts &&
              (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES')
            ) {
              Atomics.wait(sleepBuf, 0, 0, attempt * 3)
              continue
            }
            throw renameErr
          }
        }
      } catch (renameErr) {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
        } catch {
          // noop
        }
        throw renameErr
      }
    } catch (err) {
      if (err?.message?.includes('SERVICE_ANTI_REPLAY_SYMLINK_FORBIDDEN')) {
        throw err
      }
      throw new Error(
        `SERVICE_ANTI_REPLAY_STORAGE_ERROR: Fallo al persistir almacén de anti-replay: ${err?.message || String(err)}`
      )
    }
  }
}
