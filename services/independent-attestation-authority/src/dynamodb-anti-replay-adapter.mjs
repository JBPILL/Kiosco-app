// @ts-check
import {
  assertValidReservationTransition,
  DISTRIBUTED_RESERVATION_STATES,
  DistributedAntiReplayStore,
  normalizeEffectiveNowMs,
  normalizeReservationInput,
} from './distributed-anti-replay.mjs'

export const AWS_DYNAMODB_REAL_TESTED = false
export const DYNAMODB_PRODUCTION_READY = false

const DEFAULT_TABLE_NAME = 'kioskopos_attestation_anti_replay'
const DEFAULT_DDB_OPERATION_TIMEOUT_MS = 5000

const DYNAMO_UNAVAILABLE_ERROR_NAMES = new Set([
  'ProvisionedThroughputExceededException',
  'ThrottlingException',
  'RequestLimitExceeded',
  'InternalServerError',
  'ServiceUnavailable',
  'TimeoutError',
  'ResourceNotFoundException',
])

const DYNAMO_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
])

function classifyDynamoError(err, operationLabel) {
  const msg = err?.message || String(err)
  if (msg.includes('SERVICE_ANTI_REPLAY_')) return err
  const name = String(err?.name || err?.Code || '')
  const code = String(err?.code || '').toUpperCase()
  const reasons = Array.isArray(err?.CancellationReasons)
    ? err.CancellationReasons
    : []
  const hasConflictReason = reasons.some((r) => r?.Code === 'TransactionConflict')
  const hasThrottleReason = reasons.some(
    (r) =>
      r?.Code === 'ProvisionedThroughputExceeded' ||
      r?.Code === 'ThrottlingError'
  )
  if (
    name === 'IdempotentParameterMismatchException' ||
    msg.includes('IdempotentParameterMismatchException')
  ) {
    return new Error(
      `SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT: Conflicto idempotente DynamoDB en ${operationLabel}: ${msg}`
    )
  }
  if (
    name === 'TransactionConflictException' ||
    hasConflictReason ||
    msg.includes('TransactionConflictException')
  ) {
    return new Error(
      `SERVICE_ANTI_REPLAY_LOCK_CONTENTION: Conflicto transaccional concurrente DynamoDB en ${operationLabel}: ${msg}`
    )
  }
  if (
    DYNAMO_UNAVAILABLE_ERROR_NAMES.has(name) ||
    DYNAMO_UNAVAILABLE_CODES.has(code) ||
    hasThrottleReason ||
    msg.includes('ThrottlingException') ||
    msg.includes('ProvisionedThroughputExceeded')
  ) {
    return new Error(
      `SERVICE_ANTI_REPLAY_UNAVAILABLE: DynamoDB no disponible, throttled o timeout en ${operationLabel}: ${msg}`
    )
  }
  return new Error(
    `SERVICE_ANTI_REPLAY_STORAGE_ERROR: Error DynamoDB en ${operationLabel}: ${msg}`
  )
}

export const DYNAMODB_KEY_PREFIXES = Object.freeze({
  REQUEST: 'REQ#',
  HASH: 'HASH#',
  AUTHORIZATION: 'AUTH#',
  ATTESTATION: 'ATT#',
})

export const DYNAMODB_TABLE_DESIGN = Object.freeze({
  tableName: DEFAULT_TABLE_NAME,
  partitionKey: { name: 'pk', type: 'S' },
  billingMode: 'PAY_PER_REQUEST',
  pointInTimeRecovery: true,
  deletionProtection: true,
  itemTypes: Object.freeze({
    RESERVATION: 'pk = REQ#<requestId> (contiene state, leaseExpiresAtEpochMs, ownerNodeId, reservationToken, idempotencyKey)',
    HASH_LOCK: 'pk = HASH#<requestSha256> (bloqueo atómico de digest vía TransactWriteItems)',
    AUTH_LOCK: 'pk = AUTH#<authorizationId> (bloqueo atómico single-use GO grant vía TransactWriteItems)',
    ATT_LOCK: 'pk = ATT#<attestationId> (bloqueo atómico de respuesta asignada vía TransactWriteItems)',
  }),
  transactionGuarantee:
    'TransactWriteItems all-or-nothing con ConditionExpression="attribute_not_exists(pk)" en todos los ítems de unicidad; evita TOCTOU, doble reserva, doble consumo y doble firma.',
})

function assertSafeDynamoTableName(rawName) {
  const trimmed = String(rawName || '').trim()
  if (!/^[a-zA-Z0-9_.-]{3,255}$/.test(trimmed)) {
    throw new Error(
      `DYNAMODB_INVALID_TABLE_NAME: Nombre de tabla DynamoDB inválido '${trimmed}'`
    )
  }
  return trimmed
}

/**
 * Construye el payload exacto para `TransactWriteItems` en DynamoDB.
 * Garantiza exclusión mutua atómica en una única transacción Serializable sin TOCTOU.
 *
 * @param {string} tableName
 * @param {ReturnType<typeof normalizeReservationInput>} norm
 */
export function buildDynamoDbReserveTransactItems(tableName, norm, options = {}) {
  const baseReservedMs =
    typeof norm.reservedAtMs === 'number' && Number.isFinite(norm.reservedAtMs)
      ? norm.reservedAtMs
      : Date.parse(String(norm.reservedAt || ''))
  const resolvedReservedMs = Number.isFinite(baseReservedMs)
    ? baseReservedMs
    : Date.now()
  const retentionTtlSeconds =
    typeof options.retentionTtlSeconds === 'number' &&
    Number.isFinite(options.retentionTtlSeconds) &&
    options.retentionTtlSeconds > 0
      ? Math.floor(resolvedReservedMs / 1000 + options.retentionTtlSeconds)
      : undefined
  const ttlFields =
    retentionTtlSeconds !== undefined
      ? { ttlEpochSeconds: retentionTtlSeconds }
      : {}

  const transactItems = [
    {
      Put: {
        TableName: tableName,
        Item: {
          pk: `${DYNAMODB_KEY_PREFIXES.REQUEST}${norm.requestId}`,
          itemType: 'RESERVATION',
          idempotencyKey: norm.idempotencyKey,
          requestId: norm.requestId,
          requestSha256: norm.requestSha256,
          authorizationId: norm.authorizationId,
          attestationId: norm.attestationId,
          state: DISTRIBUTED_RESERVATION_STATES.RESERVED,
          ownerNodeId: norm.ownerNodeId,
          reservationToken: norm.reservationToken,
          kmsAttempted: false,
          reservedAt: norm.reservedAt,
          leaseExpiresAt: norm.leaseExpiresAt,
          leaseExpiresAtEpochMs: norm.leaseExpiresAtMs,
          consumedAt: null,
          failedAt: null,
          expiredAt: null,
          failureReason: null,
          responseDigest: null,
          updatedAt: norm.reservedAt,
          ...ttlFields,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    },
    {
      Put: {
        TableName: tableName,
        Item: {
          pk: `${DYNAMODB_KEY_PREFIXES.ATTESTATION}${norm.attestationId}`,
          itemType: 'ATT_LOCK',
          requestId: norm.requestId,
          attestationId: norm.attestationId,
          idempotencyKey: norm.idempotencyKey,
          reservedAt: norm.reservedAt,
          ...ttlFields,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    },
  ]

  if (norm.requestSha256) {
    transactItems.push({
      Put: {
        TableName: tableName,
        Item: {
          pk: `${DYNAMODB_KEY_PREFIXES.HASH}${norm.requestSha256}`,
          itemType: 'HASH_LOCK',
          requestId: norm.requestId,
          requestSha256: norm.requestSha256,
          idempotencyKey: norm.idempotencyKey,
          reservedAt: norm.reservedAt,
          ...ttlFields,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    })
  }

  if (norm.authorizationId) {
    transactItems.push({
      Put: {
        TableName: tableName,
        Item: {
          pk: `${DYNAMODB_KEY_PREFIXES.AUTHORIZATION}${norm.authorizationId}`,
          itemType: 'AUTH_LOCK',
          requestId: norm.requestId,
          authorizationId: norm.authorizationId,
          requestSha256: norm.requestSha256,
          idempotencyKey: norm.idempotencyKey,
          reservedAt: norm.reservedAt,
          ...ttlFields,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    })
  }

  return Object.freeze({
    ClientRequestToken: norm.idempotencyKey.slice(0, 36),
    TransactItems: transactItems,
  })
}

function isConditionalCancelError(err) {
  const name = err?.name || err?.Code || ''
  const msg = err?.message || ''
  if (Array.isArray(err?.CancellationReasons)) {
    return err.CancellationReasons.some(
      (r) => r?.Code === 'ConditionalCheckFailed'
    )
  }
  return (
    name === 'ConditionalCheckFailedException' ||
    name === 'TransactionCanceledException' ||
    msg.includes('TransactionCanceledException') ||
    msg.includes('ConditionalCheckFailed')
  )
}

/**
 * Adaptador preparado para AWS DynamoDB utilizando `TransactWriteItems` + `ConditionExpression`.
 *
 * IMPORTANTE:
 * - No realiza llamadas AWS reales ni crea tablas.
 * - Mantiene honestamente `AWS_DYNAMODB_REAL_TESTED = false` y `DYNAMODB_PRODUCTION_READY = false`
 *   hasta validar integración real contra DynamoDB en nube/entorno autorizado.
 */
export class DynamoDbDistributedAntiReplayStore extends DistributedAntiReplayStore {
  /**
   * @param {object} [options]
   * @param {{
   *   transactWriteItems: (input: { TransactItems: any[] }) => Promise<any>,
   *   updateItem: (input: Record<string, any>) => Promise<any>,
   *   getItem: (input: { TableName: string, Key: { pk: string }, ConsistentRead?: boolean }) => Promise<{ Item?: Record<string, any> | null }>,
   *   describeTable?: (input: { TableName: string }) => Promise<any>
   * }} [options.client]
   * @param {string} [options.tableName='kioskopos_attestation_anti_replay']
   * @param {number} [options.defaultLeaseTtlMs=30000]
   * @param {(() => number | string | Date) | number | string | Date} [options.now]
   */
  constructor(options = {}) {
    super()
    this._client = options.client || null
    this._tableName = assertSafeDynamoTableName(
      options.tableName || DEFAULT_TABLE_NAME
    )
    this._defaultLeaseTtlMs =
      typeof options.defaultLeaseTtlMs === 'number' &&
      options.defaultLeaseTtlMs > 0
        ? options.defaultLeaseTtlMs
        : 30000
    this._operationTimeoutMs =
      typeof options.operationTimeoutMs === 'number' &&
      Number.isFinite(options.operationTimeoutMs) &&
      options.operationTimeoutMs > 0
        ? Math.floor(options.operationTimeoutMs)
        : DEFAULT_DDB_OPERATION_TIMEOUT_MS
    this._healthCheckTimeoutMs =
      typeof options.healthCheckTimeoutMs === 'number' &&
      Number.isFinite(options.healthCheckTimeoutMs) &&
      options.healthCheckTimeoutMs > 0
        ? Math.floor(options.healthCheckTimeoutMs)
        : Math.min(this._operationTimeoutMs, 3000)
    this._retentionTtlSeconds =
      options.retentionTtlSeconds !== undefined &&
      options.retentionTtlSeconds !== null
        ? (() => {
            const ttlSec = Number(options.retentionTtlSeconds)
            if (!Number.isSafeInteger(ttlSec) || ttlSec <= 0) {
              throw new Error(
                `DYNAMODB_INVALID_TTL: retentionTtlSeconds inválido '${options.retentionTtlSeconds}'`
              )
            }
            return ttlSec
          })()
        : null
    this._nowProvider =
      typeof options.now === 'function'
        ? options.now
        : options.now !== undefined
          ? () => options.now
          : () => Date.now()
  }

  get backendKind() {
    return 'DYNAMODB_ADAPTER'
  }

  get multiNodeAtomicGuaranteed() {
    return true
  }

  get isSimulatedReferenceStore() {
    return false
  }

  get isRealInfrastructureTested() {
    return AWS_DYNAMODB_REAL_TESTED
  }

  get isProductionDistributedReady() {
    return DYNAMODB_PRODUCTION_READY
  }

  get awsDynamoDbRealTested() {
    return AWS_DYNAMODB_REAL_TESTED
  }

  get tableName() {
    return this._tableName
  }

  get tableDesign() {
    return DYNAMODB_TABLE_DESIGN
  }

  _requireClient() {
    if (
      !this._client ||
      typeof this._client.transactWriteItems !== 'function' ||
      typeof this._client.updateItem !== 'function' ||
      typeof this._client.getItem !== 'function'
    ) {
      throw new Error(
        'SERVICE_ANTI_REPLAY_UNAVAILABLE: DynamoDbDistributedAntiReplayStore sin cliente AWS configurado (AWS_DYNAMODB_REAL_TESTED=false)'
      )
    }
  }

  async _awaitBounded(promise, timeoutMs, operationLabel) {
    let timer = null
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new Error(
                `SERVICE_ANTI_REPLAY_UNAVAILABLE: Timeout (${timeoutMs}ms) en operación DynamoDB '${operationLabel}'`
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

  async isHealthy() {
    if (
      !this._client ||
      typeof this._client.transactWriteItems !== 'function' ||
      typeof this._client.updateItem !== 'function' ||
      typeof this._client.getItem !== 'function'
    ) {
      return false
    }
    try {
      if (typeof this._client.describeTable === 'function') {
        const res = await this._awaitBounded(
          this._client.describeTable({
            TableName: this._tableName,
          }),
          this._healthCheckTimeoutMs,
          'describeTable'
        )
        const status = res?.Table?.TableStatus
        if (status && status !== 'ACTIVE') return false
      } else {
        await this._awaitBounded(
          this._client.getItem({
            TableName: this._tableName,
            Key: { pk: '__HEALTHCHECK__' },
            ConsistentRead: true,
          }),
          this._healthCheckTimeoutMs,
          'healthGetItem'
        )
      }
      return true
    } catch {
      return false
    }
  }

  async reserveOnce(entry) {
    this._requireClient()
    const effectiveEntry =
      entry && entry.now !== undefined
        ? entry
        : { ...entry, now: this._nowProvider() }
    const norm = normalizeReservationInput(
      effectiveEntry,
      this._defaultLeaseTtlMs
    )
    const cmd = buildDynamoDbReserveTransactItems(this._tableName, norm, {
      retentionTtlSeconds: this._retentionTtlSeconds,
    })

    try {
      await this._awaitBounded(
        this._client.transactWriteItems(cmd),
        this._operationTimeoutMs,
        'transactWriteItems'
      )
      return Object.freeze({
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
      })
    } catch (err) {
      if (isConditionalCancelError(err)) {
        const reasons = Array.isArray(err?.CancellationReasons)
          ? err.CancellationReasons
          : []
        // Índice 0: REQ#, Índice 1: ATT#, Índice 2: HASH#, Índice 3: AUTH# (si aplican)
        if (reasons[0]?.Code === 'ConditionalCheckFailed') {
          const existing = await this.getReservation(norm.requestId).catch(
            () => null
          )
          if (
            existing &&
            ((existing.requestSha256 &&
              norm.requestSha256 &&
              existing.requestSha256 !== norm.requestSha256) ||
              (existing.authorizationId &&
                norm.authorizationId &&
                existing.authorizationId !== norm.authorizationId))
          ) {
            throw new Error(
              `SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT: Conflicto de digest o authorizationId para mismo requestId '${norm.requestId}' en DynamoDB`
            )
          }
          throw new Error(
            `SERVICE_ANTI_REPLAY_REQUEST_ID_DUPLICATED: requestId '${norm.requestId}' rechazado por TransactWriteItems`
          )
        }
        const authReasonIdx = cmd.TransactItems.findIndex((t) =>
          t.Put.Item.pk.startsWith(DYNAMODB_KEY_PREFIXES.AUTHORIZATION)
        )
        if (
          authReasonIdx >= 0 &&
          reasons[authReasonIdx]?.Code === 'ConditionalCheckFailed'
        ) {
          throw new Error(
            `SERVICE_ANTI_REPLAY_GO_AUTHORIZATION_DUPLICATED: authorizationId '${norm.authorizationId}' rechazado por TransactWriteItems`
          )
        }
        const hashReasonIdx = cmd.TransactItems.findIndex((t) =>
          t.Put.Item.pk.startsWith(DYNAMODB_KEY_PREFIXES.HASH)
        )
        if (
          hashReasonIdx >= 0 &&
          reasons[hashReasonIdx]?.Code === 'ConditionalCheckFailed'
        ) {
          throw new Error(
            `SERVICE_ANTI_REPLAY_REQUEST_HASH_DUPLICATED: requestSha256 '${norm.requestSha256}' rechazado por TransactWriteItems`
          )
        }
        const attReasonIdx = cmd.TransactItems.findIndex((t) =>
          t.Put.Item.pk.startsWith(DYNAMODB_KEY_PREFIXES.ATTESTATION)
        )
        if (
          attReasonIdx >= 0 &&
          reasons[attReasonIdx]?.Code === 'ConditionalCheckFailed'
        ) {
          throw new Error(
            `SERVICE_ANTI_REPLAY_ATTESTATION_ID_DUPLICATED: attestationId '${norm.attestationId}' rechazado por TransactWriteItems`
          )
        }
        throw new Error(
          'SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT: TransactWriteItems cancelado por ConditionExpression'
        )
      }
      throw classifyDynamoError(err, 'reserveOnce')
    }
  }

  async getReservation(requestId) {
    this._requireClient()
    const key = typeof requestId === 'string' ? requestId.trim() : ''
    if (!key) return null
    try {
      const res = await this._awaitBounded(
        this._client.getItem({
          TableName: this._tableName,
          Key: { pk: `${DYNAMODB_KEY_PREFIXES.REQUEST}${key}` },
          ConsistentRead: true,
        }),
        this._operationTimeoutMs,
        'getReservation'
      )
      return res?.Item ? Object.freeze({ ...res.Item }) : null
    } catch (err) {
      throw classifyDynamoError(err, 'getReservation')
    }
  }

  async markSigningAttemptStarted(params) {
    this._requireClient()
    const nowMs = normalizeEffectiveNowMs(
      params?.now !== undefined ? params.now : this._nowProvider()
    )
    const nowIso = new Date(nowMs).toISOString()
    try {
      const res = await this._awaitBounded(
        this._client.updateItem({
          TableName: this._tableName,
          Key: { pk: `${DYNAMODB_KEY_PREFIXES.REQUEST}${params.requestId}` },
          UpdateExpression: 'SET kmsAttempted = :trueVal, updatedAt = :nowIso',
          ConditionExpression:
            'attribute_exists(pk) AND #state = :reserved AND ownerNodeId = :owner AND reservationToken = :token AND leaseExpiresAtEpochMs > :nowEpochMs',
          ExpressionAttributeNames: { '#state': 'state' },
          ExpressionAttributeValues: {
            ':trueVal': true,
            ':nowIso': nowIso,
            ':reserved': DISTRIBUTED_RESERVATION_STATES.RESERVED,
            ':owner': params.ownerNodeId,
            ':token': params.reservationToken,
            ':nowEpochMs': nowMs,
          },
          ReturnValues: 'ALL_NEW',
        }),
        this._operationTimeoutMs,
        'markSigningAttemptStarted'
      )
      return res?.Attributes ? Object.freeze({ ...res.Attributes }) : null
    } catch (err) {
      if (isConditionalCancelError(err)) {
        const cur = await this.getReservation(params.requestId).catch(() => null)
        if (!cur) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente en DynamoDB'
          )
        }
        if (cur.state !== DISTRIBUTED_RESERVATION_STATES.RESERVED) {
          throw new Error(
            `SERVICE_ANTI_REPLAY_INVALID_TRANSITION: Estado '${cur.state}' no permite iniciar firma`
          )
        }
        if (cur.ownerNodeId !== params.ownerNodeId) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_OWNER_MISMATCH: Otro nodo posee la reserva en DynamoDB'
          )
        }
        if (cur.reservationToken !== params.reservationToken) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_TOKEN_MISMATCH: reservationToken inválido antes de firmar en DynamoDB'
          )
        }
        await this.expireReservation({
          requestId: params.requestId,
          now: nowMs,
          reason: 'LEASE_EXPIRED_BEFORE_SIGN',
        }).catch(() => null)
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED: Reserva expirada antes de firmar en DynamoDB'
        )
      }
      throw classifyDynamoError(err, 'markSigningAttemptStarted')
    }
  }

  async commitReservation(params) {
    this._requireClient()
    const nowMs = normalizeEffectiveNowMs(
      params?.now !== undefined ? params.now : this._nowProvider()
    )
    const nowIso = new Date(nowMs).toISOString()
    try {
      const res = await this._awaitBounded(
        this._client.updateItem({
          TableName: this._tableName,
          Key: { pk: `${DYNAMODB_KEY_PREFIXES.REQUEST}${params.requestId}` },
          UpdateExpression:
            'SET #state = :consumed, kmsAttempted = :trueVal, consumedAt = :nowIso, responseDigest = :digest, updatedAt = :nowIso',
          ConditionExpression:
            'attribute_exists(pk) AND #state = :reserved AND attestationId = :attId AND ownerNodeId = :owner AND reservationToken = :token AND leaseExpiresAtEpochMs > :nowEpochMs',
          ExpressionAttributeNames: { '#state': 'state' },
          ExpressionAttributeValues: {
            ':consumed': DISTRIBUTED_RESERVATION_STATES.CONSUMED,
            ':trueVal': true,
            ':nowIso': nowIso,
            ':digest': params.responseDigest || null,
            ':reserved': DISTRIBUTED_RESERVATION_STATES.RESERVED,
            ':attId': params.attestationId,
            ':owner': params.ownerNodeId,
            ':token': params.reservationToken,
            ':nowEpochMs': nowMs,
          },
          ReturnValues: 'ALL_NEW',
        }),
        this._operationTimeoutMs,
        'commitReservation'
      )
      return res?.Attributes ? Object.freeze({ ...res.Attributes }) : null
    } catch (err) {
      if (isConditionalCancelError(err)) {
        const cur = await this.getReservation(params.requestId).catch(() => null)
        if (!cur) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente al confirmar en DynamoDB'
          )
        }
        if (cur.state === DISTRIBUTED_RESERVATION_STATES.EXPIRED) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED: Reserva ya expirada en DynamoDB'
          )
        }
        assertValidReservationTransition(
          cur.state,
          DISTRIBUTED_RESERVATION_STATES.CONSUMED,
          'commitReservation'
        )
        if (cur.attestationId !== params.attestationId) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_ATTESTATION_ID_REQUIRED: Inconsistencia de attestationId al confirmar en DynamoDB'
          )
        }
        if (cur.ownerNodeId !== params.ownerNodeId) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_OWNER_MISMATCH: Nodo inválido al confirmar en DynamoDB'
          )
        }
        if (cur.reservationToken !== params.reservationToken) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_TOKEN_MISMATCH: reservationToken inválido al confirmar en DynamoDB'
          )
        }
        await this.expireReservation({
          requestId: params.requestId,
          now: nowMs,
          reason: 'LEASE_EXPIRED_BEFORE_COMMIT',
        }).catch(() => null)
        throw new Error(
          'SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED: Lease vencido al confirmar en DynamoDB'
        )
      }
      throw classifyDynamoError(err, 'commitReservation')
    }
  }

  async markReservationFailed(params) {
    this._requireClient()
    const nowMs = normalizeEffectiveNowMs(
      params?.now !== undefined ? params.now : this._nowProvider()
    )
    const nowIso = new Date(nowMs).toISOString()
    const reason = String(params?.reason || 'SIGNING_OR_COMMIT_FAILED').slice(
      0,
      160
    )
    try {
      const res = await this._awaitBounded(
        this._client.updateItem({
          TableName: this._tableName,
          Key: { pk: `${DYNAMODB_KEY_PREFIXES.REQUEST}${params.requestId}` },
          UpdateExpression:
            'SET #state = :failed, kmsAttempted = :trueVal, failedAt = :nowIso, failureReason = :reason, updatedAt = :nowIso',
          ConditionExpression:
            'attribute_exists(pk) AND #state = :reserved AND ownerNodeId = :owner AND reservationToken = :token',
          ExpressionAttributeNames: { '#state': 'state' },
          ExpressionAttributeValues: {
            ':failed': DISTRIBUTED_RESERVATION_STATES.FAILED,
            ':trueVal': true,
            ':nowIso': nowIso,
            ':reason': reason,
            ':reserved': DISTRIBUTED_RESERVATION_STATES.RESERVED,
            ':owner': params.ownerNodeId,
            ':token': params.reservationToken,
          },
          ReturnValues: 'ALL_NEW',
        }),
        this._operationTimeoutMs,
        'markReservationFailed'
      )
      return res?.Attributes ? Object.freeze({ ...res.Attributes }) : null
    } catch (err) {
      if (isConditionalCancelError(err)) {
        const cur = await this.getReservation(params.requestId).catch(() => null)
        if (!cur) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente al marcar FAILED en DynamoDB'
          )
        }
        if (cur.state === DISTRIBUTED_RESERVATION_STATES.FAILED) {
          return cur
        }
        assertValidReservationTransition(
          cur.state,
          DISTRIBUTED_RESERVATION_STATES.FAILED,
          'markReservationFailed'
        )
        throw new Error(
          'SERVICE_ANTI_REPLAY_OWNER_MISMATCH: Propiedad inválida al marcar FAILED en DynamoDB'
        )
      }
      throw classifyDynamoError(err, 'markReservationFailed')
    }
  }

  async expireReservation(params) {
    this._requireClient()
    const requestId =
      typeof params === 'string'
        ? params.trim()
        : typeof params?.requestId === 'string'
          ? params.requestId.trim()
          : ''
    const nowMs = normalizeEffectiveNowMs(
      typeof params === 'object' && params?.now !== undefined
        ? params.now
        : this._nowProvider()
    )
    const nowIso = new Date(nowMs).toISOString()
    const reason = String(
      (typeof params === 'object' && params?.reason) ||
        'RESERVATION_LEASE_EXPIRED'
    ).slice(0, 160)

    try {
      const res = await this._awaitBounded(
        this._client.updateItem({
          TableName: this._tableName,
          Key: { pk: `${DYNAMODB_KEY_PREFIXES.REQUEST}${requestId}` },
          UpdateExpression:
            'SET #state = :expired, expiredAt = :nowIso, failureReason = :reason, updatedAt = :nowIso',
          ConditionExpression:
            'attribute_exists(pk) AND #state = :reserved AND leaseExpiresAtEpochMs <= :nowEpochMs',
          ExpressionAttributeNames: { '#state': 'state' },
          ExpressionAttributeValues: {
            ':expired': DISTRIBUTED_RESERVATION_STATES.EXPIRED,
            ':nowIso': nowIso,
            ':reason': reason,
            ':reserved': DISTRIBUTED_RESERVATION_STATES.RESERVED,
            ':nowEpochMs': nowMs,
          },
          ReturnValues: 'ALL_NEW',
        }),
        this._operationTimeoutMs,
        'expireReservation'
      )
      return res?.Attributes ? Object.freeze({ ...res.Attributes }) : null
    } catch (err) {
      if (isConditionalCancelError(err)) {
        const cur = await this.getReservation(requestId).catch(() => null)
        if (!cur) {
          throw new Error(
            'SERVICE_ANTI_REPLAY_RESERVATION_MISSING: Reserva inexistente al expirar en DynamoDB'
          )
        }
        if (cur.state === DISTRIBUTED_RESERVATION_STATES.EXPIRED) {
          return cur
        }
        assertValidReservationTransition(
          cur.state,
          DISTRIBUTED_RESERVATION_STATES.EXPIRED,
          'expireReservation'
        )
        throw new Error(
          'SERVICE_ANTI_REPLAY_LEASE_ACTIVE: Lease aún vigente en DynamoDB'
        )
      }
      throw classifyDynamoError(err, 'expireReservation')
    }
  }

  async _hasPrefixedKey(prefix, rawKey, opName) {
    this._requireClient()
    const key = typeof rawKey === 'string' ? rawKey.trim() : ''
    if (!key) return false
    try {
      const res = await this._awaitBounded(
        this._client.getItem({
          TableName: this._tableName,
          Key: { pk: `${prefix}${key}` },
          ConsistentRead: true,
        }),
        this._operationTimeoutMs,
        opName
      )
      return Boolean(res?.Item)
    } catch (err) {
      throw classifyDynamoError(err, opName)
    }
  }

  async hasAuthorizationId(authorizationId) {
    return await this._hasPrefixedKey(
      DYNAMODB_KEY_PREFIXES.AUTHORIZATION,
      authorizationId,
      'hasAuthorizationId'
    )
  }

  async hasRequestId(requestId) {
    return await this._hasPrefixedKey(
      DYNAMODB_KEY_PREFIXES.REQUEST,
      requestId,
      'hasRequestId'
    )
  }

  async hasRequestHash(requestSha256) {
    const normalized =
      typeof requestSha256 === 'string' ? requestSha256.trim().toLowerCase() : ''
    return await this._hasPrefixedKey(
      DYNAMODB_KEY_PREFIXES.HASH,
      normalized,
      'hasRequestHash'
    )
  }

  async hasAttestationId(attestationId) {
    return await this._hasPrefixedKey(
      DYNAMODB_KEY_PREFIXES.ATTESTATION,
      attestationId,
      'hasAttestationId'
    )
  }
}
