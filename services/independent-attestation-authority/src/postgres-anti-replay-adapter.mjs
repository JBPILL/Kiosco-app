// @ts-check
import {
  assertValidReservationTransition,
  DISTRIBUTED_RESERVATION_STATES,
  DistributedAntiReplayStore,
  normalizeEffectiveNowMs,
  normalizeReservationInput,
  throwReservationConflictError,
} from './distributed-anti-replay.mjs'

export const POSTGRESQL_PRODUCTION_READY = false
export const POSTGRESQL_REAL_INTEGRATION_TESTED = false

const DEFAULT_TABLE_NAME = 'attestation_distributed_anti_replay'
const DEFAULT_PG_QUERY_TIMEOUT_MS = 5000
export const ALLOWED_POSTGRES_ISOLATION_LEVELS = Object.freeze([
  'READ COMMITTED',
  'REPEATABLE READ',
  'SERIALIZABLE',
])

const PG_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  '57014', // query_canceled / statement_timeout
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '57P05', // idle_in_transaction_session_timeout
  '08000', // connection_exception
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '53300', // too_many_connections
])

const PG_LOCK_CONTENTION_CODES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '55P03', // lock_not_available
])

function isPgUnavailableError(err) {
  if (!err || typeof err !== 'object') return false
  const code = String(err.code || '').toUpperCase()
  if (PG_UNAVAILABLE_CODES.has(code)) return true
  const msg = String(err.message || '')
  return (
    msg.includes('SERVICE_ANTI_REPLAY_UNAVAILABLE') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ECONNRESET') ||
    msg.includes('Connection terminated unexpectedly') ||
    msg.includes('timeout exceeded when trying to connect')
  )
}

function classifyPgError(err, operationLabel) {
  const msg = err?.message || String(err)
  if (msg.includes('SERVICE_ANTI_REPLAY_')) return err
  const code = String(err?.code || '').toUpperCase()
  if (PG_LOCK_CONTENTION_CODES.has(code)) {
    return new Error(
      `SERVICE_ANTI_REPLAY_LOCK_CONTENTION: Contención o serialización PostgreSQL (${code}) en ${operationLabel}: ${msg}`
    )
  }
  if (isPgUnavailableError(err)) {
    return new Error(
      `SERVICE_ANTI_REPLAY_UNAVAILABLE: PostgreSQL no disponible o timeout en ${operationLabel}: ${msg}`
    )
  }
  return new Error(
    `SERVICE_ANTI_REPLAY_STORAGE_ERROR: Error PostgreSQL en ${operationLabel}: ${msg}`
  )
}

function assertSafeIdentifier(rawName) {
  const trimmed = String(rawName || '').trim()
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(trimmed)) {
    throw new Error(
      `POSTGRES_ANTI_REPLAY_INVALID_TABLE_NAME: Nombre de tabla inválido '${trimmed}'`
    )
  }
  return trimmed
}

/**
 * Genera DDL y sentencias SQL parametrizadas documentadas para PostgreSQL 16/17.
 * @param {string} [tableName=DEFAULT_TABLE_NAME]
 */
export function buildPostgresAntiReplaySqlStatements(
  tableName = DEFAULT_TABLE_NAME
) {
  const tbl = assertSafeIdentifier(tableName)
  return Object.freeze({
    schemaDdl: `
CREATE TABLE IF NOT EXISTS ${tbl} (
  idempotency_key   TEXT        NOT NULL,
  request_id        TEXT        PRIMARY KEY,
  request_sha256    TEXT        NOT NULL,
  authorization_id  TEXT        NULL,
  attestation_id    TEXT        NOT NULL,
  state             TEXT        NOT NULL
    CHECK (state IN ('RESERVED', 'CONSUMED', 'FAILED', 'EXPIRED')),
  owner_node_id     TEXT        NOT NULL,
  reservation_token TEXT        NOT NULL,
  kms_attempted     BOOLEAN     NOT NULL DEFAULT FALSE,
  reserved_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at       TIMESTAMPTZ NULL,
  failed_at         TIMESTAMPTZ NULL,
  expired_at        TIMESTAMPTZ NULL,
  failure_reason    TEXT        NULL,
  response_digest   TEXT        NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_${tbl}_idempotency_key ON ${tbl} (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_${tbl}_request_sha256 ON ${tbl} (request_sha256);
CREATE UNIQUE INDEX IF NOT EXISTS uq_${tbl}_attestation_id ON ${tbl} (attestation_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_${tbl}_authorization_id ON ${tbl} (authorization_id) WHERE authorization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_${tbl}_state_lease ON ${tbl} (state, lease_expires_at);
`.trim(),
    reserveSql: `
INSERT INTO ${tbl} (
  idempotency_key,
  request_id,
  request_sha256,
  authorization_id,
  attestation_id,
  state,
  owner_node_id,
  reservation_token,
  kms_attempted,
  reserved_at,
  lease_expires_at,
  updated_at
) VALUES ($1, $2, $3, $4, $5, 'RESERVED', $6, $7, FALSE, $8, $9, $8)
ON CONFLICT DO NOTHING
RETURNING request_id, attestation_id, idempotency_key, state, owner_node_id, reservation_token, lease_expires_at;
`.trim(),
    findConflictSql: `
SELECT request_id, request_sha256, authorization_id, attestation_id, idempotency_key, state
FROM ${tbl}
WHERE request_id = $1
   OR ($2 <> '' AND request_sha256 = $2)
   OR ($3::text IS NOT NULL AND authorization_id = $3)
   OR attestation_id = $4
   OR idempotency_key = $5
LIMIT 1;
`.trim(),
    getByRequestIdSql: `
SELECT idempotency_key, request_id, request_sha256, authorization_id, attestation_id,
       state, owner_node_id, reservation_token, kms_attempted,
       reserved_at, lease_expires_at, consumed_at, failed_at, expired_at,
       failure_reason, response_digest, updated_at
FROM ${tbl}
WHERE request_id = $1
LIMIT 1;
`.trim(),
    markAttemptSql: `
UPDATE ${tbl}
SET kms_attempted = TRUE,
    updated_at = $4
WHERE request_id = $1
  AND state = 'RESERVED'
  AND owner_node_id = $2
  AND reservation_token = $3
  AND lease_expires_at > $4
RETURNING request_id, state, kms_attempted, updated_at;
`.trim(),
    commitSql: `
UPDATE ${tbl}
SET state = 'CONSUMED',
    kms_attempted = TRUE,
    consumed_at = $5,
    response_digest = $6,
    updated_at = $5
WHERE request_id = $1
  AND attestation_id = $2
  AND state = 'RESERVED'
  AND owner_node_id = $3
  AND reservation_token = $4
  AND lease_expires_at > $5
RETURNING request_id, state, consumed_at, attestation_id, owner_node_id, response_digest;
`.trim(),
    markFailedSql: `
UPDATE ${tbl}
SET state = 'FAILED',
    kms_attempted = TRUE,
    failed_at = $4,
    failure_reason = $5,
    updated_at = $4
WHERE request_id = $1
  AND state = 'RESERVED'
  AND owner_node_id = $2
  AND reservation_token = $3
RETURNING request_id, state, failed_at, failure_reason;
`.trim(),
    expireSql: `
UPDATE ${tbl}
SET state = 'EXPIRED',
    expired_at = $2,
    failure_reason = COALESCE(failure_reason, $3),
    updated_at = $2
WHERE request_id = $1
  AND state = 'RESERVED'
  AND lease_expires_at <= $2
RETURNING request_id, state, expired_at, lease_expires_at;
`.trim(),
    hasAuthorizationIdSql: `SELECT 1 FROM ${tbl} WHERE authorization_id = $1 LIMIT 1;`,
    hasRequestIdSql: `SELECT 1 FROM ${tbl} WHERE request_id = $1 LIMIT 1;`,
    hasRequestHashSql: `SELECT 1 FROM ${tbl} WHERE request_sha256 = $1 LIMIT 1;`,
    hasAttestationIdSql: `SELECT 1 FROM ${tbl} WHERE attestation_id = $1 LIMIT 1;`,
    healthCheckSql: `SELECT 1 AS ok FROM ${tbl} LIMIT 1;`,
  })
}

function mapPgRowToReservation(row) {
  if (!row) return null
  return Object.freeze({
    idempotencyKey: row.idempotency_key,
    requestId: row.request_id,
    requestSha256: row.request_sha256,
    authorizationId: row.authorization_id ?? null,
    goAuthorizationId: row.authorization_id ?? null,
    attestationId: row.attestation_id,
    state: row.state,
    ownerNodeId: row.owner_node_id,
    reservationToken: row.reservation_token,
    kmsAttempted: Boolean(row.kms_attempted),
    reservedAt:
      row.reserved_at instanceof Date
        ? row.reserved_at.toISOString()
        : String(row.reserved_at),
    leaseExpiresAt:
      row.lease_expires_at instanceof Date
        ? row.lease_expires_at.toISOString()
        : String(row.lease_expires_at),
    leaseExpiresAtMs:
      row.lease_expires_at instanceof Date
        ? row.lease_expires_at.getTime()
        : Date.parse(String(row.lease_expires_at)),
    consumedAt: row.consumed_at
      ? row.consumed_at instanceof Date
        ? row.consumed_at.toISOString()
        : String(row.consumed_at)
      : null,
    failedAt: row.failed_at
      ? row.failed_at instanceof Date
        ? row.failed_at.toISOString()
        : String(row.failed_at)
      : null,
    expiredAt: row.expired_at
      ? row.expired_at instanceof Date
        ? row.expired_at.toISOString()
        : String(row.expired_at)
      : null,
    failureReason: row.failure_reason ?? null,
    responseDigest: row.response_digest ?? null,
  })
}

/**
 * Adaptador preparado para PostgreSQL (Cloud SQL / RDS / Supabase DB independiente)
 * usando exclusión mutua transaccional (`BEGIN; INSERT ... ON CONFLICT DO NOTHING RETURNING ...; COMMIT;`).
 *
 * IMPORTANTE:
 * - No establece conexiones de red ni crea recursos por sí mismo.
 * - `POSTGRESQL_PRODUCTION_READY = false` y `POSTGRESQL_REAL_INTEGRATION_TESTED = false`
 *   hasta ejecutar pruebas reales de integración sobre una instancia PostgreSQL dedicada.
 */
export class PostgresDistributedAntiReplayStore extends DistributedAntiReplayStore {
  /**
   * @param {object} [options]
   * @param {{ connect: () => Promise<{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[], rowCount?: number }>, release: () => void }> }} [options.pool]
   * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[], rowCount?: number }>, exec?: (sql: string) => Promise<any>, transaction?: <T>(fn: (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[], rowCount?: number }> }) => Promise<T>) => Promise<T> }} [options.queryClient]
   * @param {string} [options.tableName='attestation_distributed_anti_replay']
   * @param {number} [options.defaultLeaseTtlMs=30000]
   * @param {(() => number | string | Date) | number | string | Date} [options.now]
   */
  constructor(options = {}) {
    super()
    this._pool = options.pool || null
    this._queryClient = options.queryClient || null
    this._tableName = assertSafeIdentifier(
      options.tableName || DEFAULT_TABLE_NAME
    )
    this._defaultLeaseTtlMs =
      typeof options.defaultLeaseTtlMs === 'number' &&
      options.defaultLeaseTtlMs > 0
        ? options.defaultLeaseTtlMs
        : 30000
    this._queryTimeoutMs =
      typeof options.queryTimeoutMs === 'number' &&
      Number.isFinite(options.queryTimeoutMs) &&
      options.queryTimeoutMs > 0
        ? Math.floor(options.queryTimeoutMs)
        : DEFAULT_PG_QUERY_TIMEOUT_MS
    this._healthCheckTimeoutMs =
      typeof options.healthCheckTimeoutMs === 'number' &&
      Number.isFinite(options.healthCheckTimeoutMs) &&
      options.healthCheckTimeoutMs > 0
        ? Math.floor(options.healthCheckTimeoutMs)
        : Math.min(this._queryTimeoutMs, 3000)
    this._statementTimeoutMs =
      options.statementTimeoutMs !== undefined && options.statementTimeoutMs !== null
        ? (() => {
            const st = Number(options.statementTimeoutMs)
            if (!Number.isSafeInteger(st) || st <= 0) {
              throw new Error(
                `POSTGRES_ANTI_REPLAY_INVALID_TIMEOUT: statementTimeoutMs inválido '${options.statementTimeoutMs}'`
              )
            }
            return st
          })()
        : null
    const rawIsoLevel =
      options.isolationLevel !== undefined
        ? String(options.isolationLevel).trim().toUpperCase()
        : 'READ COMMITTED'
    if (!ALLOWED_POSTGRES_ISOLATION_LEVELS.includes(rawIsoLevel)) {
      throw new Error(
        `POSTGRES_ANTI_REPLAY_INVALID_ISOLATION_LEVEL: Nivel de aislamiento '${rawIsoLevel}' no permitido`
      )
    }
    this._isolationLevel = rawIsoLevel
    this._nowProvider =
      typeof options.now === 'function'
        ? options.now
        : options.now !== undefined
          ? () => options.now
          : () => Date.now()
    this._sql = buildPostgresAntiReplaySqlStatements(this._tableName)
    this._singleClientTxQueue = Promise.resolve()
  }

  get backendKind() {
    return 'POSTGRESQL_ADAPTER'
  }

  get multiNodeAtomicGuaranteed() {
    return true
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

  get tableName() {
    return this._tableName
  }

  get sqlStatements() {
    return this._sql
  }

  _requireExecutor() {
    if (!this._pool && !this._queryClient) {
      throw new Error(
        'SERVICE_ANTI_REPLAY_UNAVAILABLE: PostgresDistributedAntiReplayStore sin pool ni queryClient conectado (POSTGRESQL_REAL_INTEGRATION_TESTED=false)'
      )
    }
  }

  /**
   * Inicializa esquema SQL si el cliente conectado tiene DDL habilitado (uso controlado/test local).
   */
  async ensureSchema() {
    this._requireExecutor()
    try {
      if (this._queryClient && typeof this._queryClient.exec === 'function') {
        await this._queryClient.exec(this._sql.schemaDdl)
        return
      }
      await this._withTx(async (tx) => {
        for (const stmt of this._sql.schemaDdl.split(';')) {
          const trimmed = stmt.trim()
          if (trimmed) await tx.query(trimmed)
        }
      })
    } catch (err) {
      throw new Error(
        `SERVICE_ANTI_REPLAY_STORAGE_ERROR: Fallo al inicializar esquema PostgreSQL: ${err?.message || String(err)}`
      )
    }
  }

  /**
   * Ejecuta una promesa con límite estricto de tiempo (fail-closed como timeout).
   * @template T
   * @param {Promise<T>} promise
   * @param {number} timeoutMs
   * @param {string} operationLabel
   * @returns {Promise<T>}
   */
  async _awaitBounded(promise, timeoutMs, operationLabel) {
    let timer = null
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new Error(
                `SERVICE_ANTI_REPLAY_UNAVAILABLE: Timeout (${timeoutMs}ms) ejecutando '${operationLabel}' en PostgreSQL`
              )
            )
          }, timeoutMs)
          if (typeof timer.unref === 'function') timer.unref()
        }),
      ])
    } finally {
      if (timer !== null) clearTimeout(timer)
    }
  }

  /**
   * Ejecuta una transacción SQL (`BEGIN` ... `COMMIT` / `ROLLBACK`).
   * @template T
   * @param {(tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[], rowCount?: number }> }) => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async _withTx(fn) {
    this._requireExecutor()
    const beginSql =
      this._isolationLevel === 'READ COMMITTED'
        ? 'BEGIN'
        : `BEGIN ISOLATION LEVEL ${this._isolationLevel}`

    const runOnTx = async (txClient) => {
      await txClient.query(beginSql)
      if (this._statementTimeoutMs !== null) {
        await txClient.query(`SET LOCAL statement_timeout = ${this._statementTimeoutMs}`)
      }
      const result = await fn(txClient)
      await txClient.query('COMMIT')
      return result
    }

    if (this._pool && typeof this._pool.connect === 'function') {
      const client = await this._awaitBounded(
        this._pool.connect(),
        this._queryTimeoutMs,
        'pool.connect'
      )
      let txErr = null
      let rollbackFailed = false
      try {
        return await this._awaitBounded(
          (async () => {
            await client.query(beginSql)
            if (this._statementTimeoutMs !== null) {
              await client.query(
                `SET LOCAL statement_timeout = ${this._statementTimeoutMs}`
              )
            }
            const result = await fn(client)
            await client.query('COMMIT')
            return result
          })(),
          this._queryTimeoutMs,
          'tx'
        )
      } catch (err) {
        txErr = err
        try {
          await this._awaitBounded(
            client.query('ROLLBACK'),
            Math.min(this._queryTimeoutMs, 2000),
            'ROLLBACK'
          )
        } catch {
          rollbackFailed = true
        }
        throw err
      } finally {
        if (txErr && (rollbackFailed || isPgUnavailableError(txErr))) {
          client.release(txErr)
        } else {
          client.release()
        }
      }
    }

    const runSingleClientTx = async () => {
      if (typeof this._queryClient.transaction === 'function') {
        return await this._awaitBounded(
          this._queryClient.transaction((tx) => fn(tx)),
          this._queryTimeoutMs,
          'queryClient.transaction'
        )
      }
      return await this._awaitBounded(
        runOnTx(this._queryClient).catch(async (err) => {
          try {
            await this._queryClient.query('ROLLBACK')
          } catch {
            // noop
          }
          throw err
        }),
        this._queryTimeoutMs,
        'queryClient.tx'
      )
    }

    const next = this._singleClientTxQueue.then(
      runSingleClientTx,
      runSingleClientTx
    )
    this._singleClientTxQueue = next.catch(() => {})
    return next
  }

  async _queryRead(sql, params = [], timeoutMs = this._queryTimeoutMs) {
    this._requireExecutor()
    try {
      if (this._pool && typeof this._pool.query === 'function') {
        return await this._awaitBounded(
          this._pool.query(sql, params),
          timeoutMs,
          'pool.query'
        )
      }
      if (this._pool && typeof this._pool.connect === 'function') {
        const client = await this._awaitBounded(
          this._pool.connect(),
          timeoutMs,
          'pool.connect.read'
        )
        let readErr = null
        try {
          return await this._awaitBounded(
            client.query(sql, params),
            timeoutMs,
            'client.query.read'
          )
        } catch (err) {
          readErr = err
          throw err
        } finally {
          if (readErr && isPgUnavailableError(readErr)) {
            client.release(readErr)
          } else {
            client.release()
          }
        }
      }
      return await this._awaitBounded(
        this._queryClient.query(sql, params),
        timeoutMs,
        'queryClient.read'
      )
    } catch (err) {
      throw classifyPgError(err, 'read')
    }
  }

  async isHealthy() {
    if (!this._pool && !this._queryClient) {
      return false
    }
    try {
      await this._queryRead(
        this._sql.healthCheckSql,
        [],
        this._healthCheckTimeoutMs
      )
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
    const norm = normalizeReservationInput(
      effectiveEntry,
      this._defaultLeaseTtlMs
    )

    try {
      const txOutcome = await this._withTx(async (tx) => {
        const res = await tx.query(this._sql.reserveSql, [
          norm.idempotencyKey,
          norm.requestId,
          norm.requestSha256,
          norm.authorizationId,
          norm.attestationId,
          norm.ownerNodeId,
          norm.reservationToken,
          norm.reservedAt,
          norm.leaseExpiresAt,
        ])

        if (Array.isArray(res?.rows) && res.rows.length === 1) {
          return {
            reserved: true,
            record: Object.freeze({
              reserved: true,
              state: DISTRIBUTED_RESERVATION_STATES.RESERVED,
              idempotencyKey: norm.idempotencyKey,
              requestId: norm.requestId,
              requestSha256: norm.requestSha256,
              authorizationId: norm.authorizationId,
              attestationId: norm.attestationId,
              ownerNodeId: norm.ownerNodeId,
              reservationToken: norm.reservationToken,
              leaseExpiresAt: norm.leaseExpiresAt,
            }),
            conflictRow: null,
          }
        }

        const conflictRes = await tx.query(this._sql.findConflictSql, [
          norm.requestId,
          norm.requestSha256,
          norm.authorizationId,
          norm.attestationId,
          norm.idempotencyKey,
        ])
        return {
          reserved: false,
          record: null,
          conflictRow: conflictRes?.rows?.[0] || null,
        }
      })

      if (txOutcome.reserved && txOutcome.record) {
        return txOutcome.record
      }

      let row = txOutcome.conflictRow
      if (!row) {
        const freshConflictRes = await this._queryRead(
          this._sql.findConflictSql,
          [
            norm.requestId,
            norm.requestSha256,
            norm.authorizationId,
            norm.attestationId,
            norm.idempotencyKey,
          ]
        )
        row = freshConflictRes?.rows?.[0] || null
      }

      if (row) {
        throwReservationConflictError(
          {
            requestId: row.request_id,
            requestSha256: row.request_sha256,
            authorizationId: row.authorization_id ?? null,
            attestationId: row.attestation_id,
            idempotencyKey: row.idempotency_key,
            state: row.state,
          },
          norm
        )
      }

      throw new Error(
        'SERVICE_ANTI_REPLAY_REQUEST_ID_DUPLICATED: Conflicto transaccional en reserva PostgreSQL'
      )
    } catch (err) {
      if (err?.message?.includes('SERVICE_ANTI_REPLAY_')) {
        throw err
      }
      if (err?.code === '23505') {
        throw new Error(
          `SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT: Violación de unicidad PostgreSQL (23505): ${err?.message || String(err)}`
        )
      }
      throw classifyPgError(err, 'reserveOnce')
    }
  }

  async getReservation(requestId) {
    try {
      const key = typeof requestId === 'string' ? requestId.trim() : ''
      if (!key) return null
      const res = await this._queryRead(this._sql.getByRequestIdSql, [key])
      return mapPgRowToReservation(res?.rows?.[0] || null)
    } catch (err) {
      if (err?.message?.includes('SERVICE_ANTI_REPLAY_')) throw err
      throw new Error(
        `SERVICE_ANTI_REPLAY_STORAGE_ERROR: Error leyendo reserva PostgreSQL: ${err?.message || String(err)}`
      )
    }
  }

  async markSigningAttemptStarted(params) {
    const nowIso = new Date(
      normalizeEffectiveNowMs(
        params?.now !== undefined ? params.now : this._nowProvider()
      )
    ).toISOString()
    try {
      const outcome = await this._withTx(async (tx) => {
        const res = await tx.query(this._sql.markAttemptSql, [
          params.requestId,
          params.ownerNodeId,
          params.reservationToken,
          nowIso,
        ])
        if (res?.rows?.length === 1) {
          const full = await tx.query(this._sql.getByRequestIdSql, [
            params.requestId,
          ])
          return {
            expiredCommitted: false,
            reservation: mapPgRowToReservation(full?.rows?.[0] || null),
          }
        }
        const cur = await tx.query(this._sql.getByRequestIdSql, [
          params.requestId,
        ])
        const row = cur?.rows?.[0]
        if (!row) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente en PostgreSQL'
          )
        }
        if (row.state === DISTRIBUTED_RESERVATION_STATES.EXPIRED) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED: Reserva ya expirada antes de firmar en PostgreSQL'
          )
        }
        if (row.state !== DISTRIBUTED_RESERVATION_STATES.RESERVED) {
          throw new Error(
            `SERVICE_ANTI_REPLAY_INVALID_TRANSITION: Estado '${row.state}' no admite inicio de firma`
          )
        }
        if (row.owner_node_id !== params.ownerNodeId) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_OWNER_MISMATCH: Otro nodo posee la reserva PostgreSQL'
          )
        }
        if (row.reservation_token !== params.reservationToken) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_TOKEN_MISMATCH: reservationToken inválido al iniciar firma PostgreSQL'
          )
        }
        // Persistir y CONFIRMAR (COMMIT) transición RESERVED -> EXPIRED antes de lanzar error
        await tx.query(this._sql.expireSql, [
          params.requestId,
          nowIso,
          'LEASE_EXPIRED_BEFORE_SIGN',
        ])
        return { expiredCommitted: true, reservation: null }
      })
      if (outcome.expiredCommitted) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED: Lease expirado antes de firmar en PostgreSQL'
        )
      }
      return outcome.reservation
    } catch (err) {
      throw classifyPgError(err, 'markSigningAttemptStarted')
    }
  }

  async commitReservation(params) {
    const nowIso = new Date(
      normalizeEffectiveNowMs(
        params?.now !== undefined ? params.now : this._nowProvider()
      )
    ).toISOString()
    try {
      const outcome = await this._withTx(async (tx) => {
        const res = await tx.query(this._sql.commitSql, [
          params.requestId,
          params.attestationId,
          params.ownerNodeId,
          params.reservationToken,
          nowIso,
          params.responseDigest || null,
        ])
        if (res?.rows?.length === 1) {
          const full = await tx.query(this._sql.getByRequestIdSql, [
            params.requestId,
          ])
          return {
            expiredCommitted: false,
            reservation: mapPgRowToReservation(full?.rows?.[0] || null),
          }
        }
        const cur = await tx.query(this._sql.getByRequestIdSql, [
          params.requestId,
        ])
        const row = cur?.rows?.[0]
        if (!row) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente en commit PostgreSQL'
          )
        }
        if (row.state === DISTRIBUTED_RESERVATION_STATES.EXPIRED) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED: Reserva ya expirada en PostgreSQL'
          )
        }
        assertValidReservationTransition(
          row.state,
          DISTRIBUTED_RESERVATION_STATES.CONSUMED,
          'commitReservation'
        )
        if (row.attestation_id !== params.attestationId) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_ATTESTATION_ID_REQUIRED: Inconsistencia de attestationId al confirmar'
          )
        }
        if (row.owner_node_id !== params.ownerNodeId) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_OWNER_MISMATCH: Nodo inválido al confirmar reserva PostgreSQL'
          )
        }
        if (row.reservation_token !== params.reservationToken) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_TOKEN_MISMATCH: reservationToken inválido al confirmar'
          )
        }
        // Persistir y CONFIRMAR (COMMIT) transición RESERVED -> EXPIRED antes de rechazar commit tardío
        await tx.query(this._sql.expireSql, [
          params.requestId,
          nowIso,
          'LEASE_EXPIRED_BEFORE_COMMIT',
        ])
        return { expiredCommitted: true, reservation: null }
      })
      if (outcome.expiredCommitted) {
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED: Lease vencido al confirmar reserva PostgreSQL'
        )
      }
      return outcome.reservation
    } catch (err) {
      throw classifyPgError(err, 'commitReservation')
    }
  }

  async markReservationFailed(params) {
    const nowIso = new Date(
      normalizeEffectiveNowMs(
        params?.now !== undefined ? params.now : this._nowProvider()
      )
    ).toISOString()
    const reason = String(params?.reason || 'SIGNING_OR_COMMIT_FAILED').slice(
      0,
      160
    )
    try {
      return await this._withTx(async (tx) => {
        const res = await tx.query(this._sql.markFailedSql, [
          params.requestId,
          params.ownerNodeId,
          params.reservationToken,
          nowIso,
          reason,
        ])
        if (res?.rows?.length === 1) {
          const full = await tx.query(this._sql.getByRequestIdSql, [
            params.requestId,
          ])
          return mapPgRowToReservation(full?.rows?.[0] || null)
        }
        const cur = await tx.query(this._sql.getByRequestIdSql, [
          params.requestId,
        ])
        const row = cur?.rows?.[0]
        if (!row) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente al marcar FAILED en PostgreSQL'
          )
        }
        if (row.state === DISTRIBUTED_RESERVATION_STATES.FAILED) {
          return mapPgRowToReservation(row)
        }
        assertValidReservationTransition(
          row.state,
          DISTRIBUTED_RESERVATION_STATES.FAILED,
          'markReservationFailed'
        )
        throw new Error(
          'SERVICE_ANTI_REPLAY_OWNER_MISMATCH: Propiedad o token inválido al marcar FAILED'
        )
      })
    } catch (err) {
      throw classifyPgError(err, 'markReservationFailed')
    }
  }

  async expireReservation(params) {
    const requestId =
      typeof params === 'string'
        ? params.trim()
        : typeof params?.requestId === 'string'
          ? params.requestId.trim()
          : ''
    const nowIso = new Date(
      normalizeEffectiveNowMs(
        typeof params === 'object' && params?.now !== undefined
          ? params.now
          : this._nowProvider()
      )
    ).toISOString()
    const reason = String(
      (typeof params === 'object' && params?.reason) ||
        'RESERVATION_LEASE_EXPIRED'
    ).slice(0, 160)

    try {
      return await this._withTx(async (tx) => {
        const res = await tx.query(this._sql.expireSql, [
          requestId,
          nowIso,
          reason,
        ])
        if (res?.rows?.length === 1) {
          const full = await tx.query(this._sql.getByRequestIdSql, [requestId])
          return mapPgRowToReservation(full?.rows?.[0] || null)
        }
        const cur = await tx.query(this._sql.getByRequestIdSql, [requestId])
        const row = cur?.rows?.[0]
        if (!row) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente al expirar en PostgreSQL'
          )
        }
        if (row.state === DISTRIBUTED_RESERVATION_STATES.EXPIRED) {
          return mapPgRowToReservation(row)
        }
        assertValidReservationTransition(
          row.state,
          DISTRIBUTED_RESERVATION_STATES.EXPIRED,
          'expireReservation'
        )
        throw new Error(
          'SERVICE_ANTI_REPLAY_LEASE_ACTIVE: Lease aún vigente en PostgreSQL'
        )
      })
    } catch (err) {
      throw classifyPgError(err, 'expireReservation')
    }
  }

  async hasAuthorizationId(authorizationId) {
    const key =
      typeof authorizationId === 'string' ? authorizationId.trim() : ''
    if (!key) return false
    const res = await this._queryRead(this._sql.hasAuthorizationIdSql, [key])
    return Boolean(res?.rows?.length)
  }

  async hasRequestId(requestId) {
    const key = typeof requestId === 'string' ? requestId.trim() : ''
    if (!key) return false
    const res = await this._queryRead(this._sql.hasRequestIdSql, [key])
    return Boolean(res?.rows?.length)
  }

  async hasRequestHash(requestSha256) {
    const key =
      typeof requestSha256 === 'string'
        ? requestSha256.trim().toLowerCase()
        : ''
    if (!key) return false
    const res = await this._queryRead(this._sql.hasRequestHashSql, [key])
    return Boolean(res?.rows?.length)
  }

  async hasAttestationId(attestationId) {
    const key = typeof attestationId === 'string' ? attestationId.trim() : ''
    if (!key) return false
    const res = await this._queryRead(this._sql.hasAttestationIdSql, [key])
    return Boolean(res?.rows?.length)
  }
}
