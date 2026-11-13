// @ts-check
import fs from 'node:fs'
import path from 'node:path'

/**
 * Guardia anti-replay del lado de la Autoridad de Atestación Independiente.
 * Previene la duplicación o reemisión de atestaciones para un mismo requestId,
 * un mismo hash de solicitud (requestSha256) o un mismo attestationId.
 *
 * Distingue explícitamente el nivel de garantía real:
 * - memory -> HOST_LOCAL_SERVICE_IN_MEMORY_ONE_TIME_USE
 * - file -> HOST_LOCAL_SERVICE_DURABLE_ONE_TIME_USE
 * - distributed -> DISTRIBUTED_MULTI_NODE_ONE_TIME_USE (únicamente con backend externo validado)
 */
export class ServiceAntiReplayGuard {
  /**
   * @param {object} [options]
   * @param {'memory' | 'file' | 'distributed'} [options.storageType='memory']
   * @param {string} [options.filePath]
   * @param {{
   *   hasRequestId: (id: string) => Promise<boolean> | boolean,
   *   hasRequestHash: (sha: string) => Promise<boolean> | boolean,
   *   hasAttestationId: (id: string) => Promise<boolean> | boolean,
   *   recordOnce: (entry: { requestId: string, requestSha256: string, attestationId: string }) => Promise<void> | void,
   *   isHealthy?: () => Promise<boolean> | boolean
   * }} [options.distributedStore]
   */
  constructor(options = {}) {
    this._storageType = options.storageType || 'memory'
    this._filePath = options.filePath || null
    this._distributedStore = options.distributedStore || null
    this._storageCorrupted = false

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

    if (this._storageType === 'file' && this._filePath) {
      this._loadFromFile()
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

  get size() {
    return this._processedRequestIds.size
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
        const dir = path.dirname(this._filePath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK)
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
        `SERVICE_ANTI_REPLAY_REQUEST_ID_DUPLICATED: requestId '${request.requestId}' ya fue atestado previamente`
      )
    }

    if (
      request.requestSha256 &&
      this._processedRequestHashes.has(request.requestSha256)
    ) {
      throw new Error(
        `SERVICE_ANTI_REPLAY_REQUEST_HASH_DUPLICATED: requestSha256 '${request.requestSha256}' ya fue atestado previamente`
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
    }

    return true
  }

  /**
   * Registra de forma síncrona la solicitud y respuesta consumidas (host-local).
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

    this._processedRequestIds.add(request.requestId)
    if (request.requestSha256) {
      this._processedRequestHashes.add(request.requestSha256)
    }
    this._processedAttestationIds.add(response.attestationId)

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
      })
    }

    this.record(request, response)
  }

  _loadFromFile() {
    try {
      if (fs.existsSync(this._filePath)) {
        const raw = fs.readFileSync(this._filePath, 'utf8')
        const data = JSON.parse(raw)
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
      const dir = path.dirname(this._filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const payload = JSON.stringify(
        {
          requestIds: Array.from(this._processedRequestIds),
          requestHashes: Array.from(this._processedRequestHashes),
          attestationIds: Array.from(this._processedAttestationIds),
          guaranteeLevel: this.guaranteeLevel,
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      )
      const tmpPath = `${this._filePath}.tmp-${process.pid}-${Date.now()}`
      fs.writeFileSync(tmpPath, payload, 'utf8')
      fs.renameSync(tmpPath, this._filePath)
    } catch (err) {
      throw new Error(
        `SERVICE_ANTI_REPLAY_STORAGE_ERROR: Fallo al persistir almacén de anti-replay: ${err?.message || String(err)}`
      )
    }
  }
}
