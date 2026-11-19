// @vitest-environment node
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  computeAttestationRequestDigest,
  PR02_P0_COLECTOR_IDENTIDAD,
} from '../../scripts/fiscal/plan-pr02-parameters.mjs'

import {
  assertDedicatedPostgresUrl,
  createControlledPostgresStoreFromEnv,
  IndependentAttestationAuthorityService,
  PostgresDistributedAntiReplayStore,
  ServiceAntiReplayGuard,
  TestOnlyGoAuthorityIssuer,
  TestSigningProvider,
} from '../../services/independent-attestation-authority/src/index.mjs'

const CONTAINER_NAME = 'iaa-pg16-local-ext12b'
const POSTGRES_IMAGE = 'postgres:16.4-alpine'
const HOST_LOOPBACK = '127.0.0.1'
const HOST_PORT = 55432
const TEST_DB_NAME = 'iaa_antireplay_test'
const TEST_DB_USER = 'iaa_test_user'

interface PgQueryResult<TRow = Record<string, unknown>> {
  readonly rows: readonly TRow[]
  readonly rowCount?: number
}

interface PgPoolClientLike {
  readonly query: <TRow = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ) => Promise<PgQueryResult<TRow>>
  readonly release: (err?: Error | boolean) => void
}

interface PgPoolLike {
  readonly query: <TRow = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ) => Promise<PgQueryResult<TRow>>
  readonly connect: () => Promise<PgPoolClientLike>
  readonly end: () => Promise<void>
}

type PgModuleWithPool = {
  Pool: new (config: {
    connectionString: string
    max?: number
    connectionTimeoutMillis?: number
    idleTimeoutMillis?: number
  }) => PgPoolLike
}

const PgPool = (pg as unknown as PgModuleWithPool).Pool

function isDockerDaemonAvailable(): boolean {
  try {
    execFileSync('docker', ['info'], {
      stdio: 'ignore',
      timeout: 8000,
    })
    return true
  } catch {
    return false
  }
}

function removeTestContainerSilently(): void {
  try {
    execFileSync('docker', ['rm', '-f', CONTAINER_NAME], {
      stdio: 'ignore',
      timeout: 10000,
    })
  } catch {
    // ignore if container does not exist
  }
}

const dockerAvailable = isDockerDaemonAvailable()

describe.runIf(dockerAvailable)(
  'AWS-REAL-12B — Integración Local Real, Concurrencia 30x y Transacciones contra PostgreSQL 16 en Docker',
  () => {
    let ephemeralPassword = ''
    let connectionString = ''
    let sharedPool: PgPoolLike | null = null
    let containerStartedBySuite = false

    beforeAll(async () => {
      if (process.env.ATTESTATION_EXTERNAL_DOCKER_PG_URL) {
        connectionString = process.env.ATTESTATION_EXTERNAL_DOCKER_PG_URL
      } else {
        removeTestContainerSilently()
        ephemeralPassword = `iaa_ephem_${crypto.randomUUID().replace(/-/g, '')}`
        execFileSync(
          'docker',
          [
            'run',
            '-d',
            '--name',
            CONTAINER_NAME,
            '-p',
            `${HOST_LOOPBACK}:${HOST_PORT}:5432`,
            '--tmpfs',
            '/var/lib/postgresql/data',
            '-e',
            `POSTGRES_DB=${TEST_DB_NAME}`,
            '-e',
            `POSTGRES_USER=${TEST_DB_USER}`,
            '-e',
            `POSTGRES_PASSWORD=${ephemeralPassword}`,
            POSTGRES_IMAGE,
          ],
          { stdio: 'pipe', timeout: 30000 }
        )
        containerStartedBySuite = true

        const deadline = Date.now() + 25000
        let ready = false
        while (Date.now() < deadline) {
          try {
            execFileSync(
              'docker',
              [
                'exec',
                CONTAINER_NAME,
                'pg_isready',
                '-U',
                TEST_DB_USER,
                '-d',
                TEST_DB_NAME,
              ],
              { stdio: 'ignore', timeout: 3000 }
            )
            ready = true
            break
          } catch {
            await new Promise((r) => setTimeout(r, 300))
          }
        }
        if (!ready) {
          removeTestContainerSilently()
          throw new Error(
            'POSTGRES_DOCKER_NOT_READY: El contenedor PostgreSQL 16 no estuvo listo dentro de 25s'
          )
        }

        connectionString = `postgres://${TEST_DB_USER}:${ephemeralPassword}@${HOST_LOOPBACK}:${HOST_PORT}/${TEST_DB_NAME}?sslmode=disable`
      }

      sharedPool = new PgPool({
        connectionString,
        max: 10,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 10000,
      })

      // Esperar hasta que una consulta SQL real por TCP responda
      const sqlDeadline = Date.now() + 10000
      let sqlReady = false
      while (Date.now() < sqlDeadline) {
        try {
          const res = await sharedPool.query('SELECT version() AS ver')
          if (res.rows.length === 1) {
            sqlReady = true
            break
          }
        } catch {
          await new Promise((r) => setTimeout(r, 250))
        }
      }
      if (!sqlReady) {
        throw new Error(
          'POSTGRES_TCP_QUERY_NOT_READY: El servidor PostgreSQL 16 no aceptó consultas TCP'
        )
      }
    }, 45000)

    afterAll(async () => {
      try {
        if (sharedPool) {
          await sharedPool.end()
          sharedPool = null
        }
      } finally {
        if (containerStartedBySuite) {
          removeTestContainerSilently()
        }
      }
    }, 20000)

    it('EXT12B-SKIPPED-HARNESS-01: ejecuta el arnés opt-in EXT07-REAL-PG-01 contra PostgreSQL 16 real en Docker', async () => {
      const handle = await createControlledPostgresStoreFromEnv({
        ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
        ATTESTATION_POSTGRES_ALLOW_INSECURE_LOCALHOST: 'true',
        ATTESTATION_POSTGRES_URL: connectionString,
        ATTESTATION_POSTGRES_POOL_MAX: '10',
      })
      try {
        await handle.store.ensureSchema()
        expect(await handle.store.isHealthy()).toBe(true)

        const reqId = `ext07-real-pg-${crypto.randomUUID()}`
        const res1 = await handle.store.reserveOnce({
          requestId: reqId,
          requestSha256: crypto.createHash('sha256').update(reqId).digest('hex'),
          authorizationId: `auth-${reqId}`,
          attestationId: `att-${reqId}`,
          ownerNodeId: 'ext07-real-harness',
        })
        expect(res1.state).toBe('RESERVED')
        await expect(
          handle.store.reserveOnce({
            requestId: reqId,
            requestSha256: crypto
              .createHash('sha256')
              .update(`${reqId}-diff`)
              .digest('hex'),
            authorizationId: `auth-${reqId}`,
            attestationId: `att-${reqId}-2`,
            ownerNodeId: 'ext07-real-harness',
          })
        ).rejects.toThrow(/SERVICE_ANTI_REPLAY_/)
      } finally {
        await handle.close()
      }
    })

    it('Vector 1 — DDL e Idempotencia Real: inicializa esquema dos veces y verifica information_schema.columns y pg_indexes en PostgreSQL 16', async () => {
      const store = new PostgresDistributedAntiReplayStore({
        pool: sharedPool!,
      })

      // Ejecutar ensureSchema() dos veces consecutivas sin error (idempotencia DDL)
      await store.ensureSchema()
      await store.ensureSchema()
      expect(await store.isHealthy()).toBe(true)

      const verRes = await sharedPool!.query<{ server_version: string }>(
        'SHOW server_version'
      )
      expect(verRes.rows[0]?.server_version).toMatch(/^16\./)

      const colsRes = await sharedPool!.query<{
        column_name: string
        data_type: string
        is_nullable: string
      }>(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'attestation_distributed_anti_replay'
         ORDER BY ordinal_position`
      )
      const colMap = new Map(
        colsRes.rows.map((r) => [r.column_name, r.data_type])
      )
      expect(colMap.get('request_id')).toBe('text')
      expect(colMap.get('idempotency_key')).toBe('text')
      expect(colMap.get('request_sha256')).toBe('text')
      expect(colMap.get('authorization_id')).toBe('text')
      expect(colMap.get('attestation_id')).toBe('text')
      expect(colMap.get('state')).toBe('text')
      expect(colMap.get('kms_attempted')).toBe('boolean')
      expect(colMap.get('reserved_at')).toBe('timestamp with time zone')
      expect(colMap.get('lease_expires_at')).toBe('timestamp with time zone')
      expect(colMap.get('consumed_at')).toBe('timestamp with time zone')
      expect(colMap.get('failed_at')).toBe('timestamp with time zone')
      expect(colMap.get('expired_at')).toBe('timestamp with time zone')
      expect(colMap.get('updated_at')).toBe('timestamp with time zone')

      const idxRes = await sharedPool!.query<{
        indexname: string
        indexdef: string
      }>(
        `SELECT indexname, indexdef
         FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = 'attestation_distributed_anti_replay'
         ORDER BY indexname`
      )
      const indexNames = idxRes.rows.map((r) => r.indexname)
      expect(indexNames).toEqual(
        expect.arrayContaining([
          'attestation_distributed_anti_replay_pkey',
          'uq_attestation_distributed_anti_replay_idempotency_key',
          'uq_attestation_distributed_anti_replay_request_sha256',
          'uq_attestation_distributed_anti_replay_attestation_id',
          'uq_attestation_distributed_anti_replay_authorization_id',
          'idx_attestation_distributed_anti_replay_state_lease',
        ])
      )
    })

    it('Vector 2 — Carrera de Concurrencia Real 30x (Thundering Herd): 30 solicitudes simultáneas sobre pg.Pool (max: 10) producen exactamente 1 éxito y 29 rechazos + SQLSTATE 23505', async () => {
      const store = new PostgresDistributedAntiReplayStore({
        pool: sharedPool!,
        isolationLevel: 'SERIALIZABLE',
      })
      await store.ensureSchema()

      const sharedAuthId = `auth-thundering-herd-30x-${crypto.randomUUID()}`
      const sharedDigest = crypto
        .createHash('sha256')
        .update(sharedAuthId)
        .digest('hex')
      const sharedReqId = `req-thundering-herd-30x-${crypto.randomUUID()}`

      const totalConcurrent = 30
      const startBarrier = new Promise<void>((resolve) =>
        setTimeout(resolve, 15)
      )

      const settlements = await Promise.allSettled(
        Array.from({ length: totalConcurrent }, async (_, idx) => {
          await startBarrier
          return await store.reserveOnce({
            requestId: sharedReqId,
            requestSha256: sharedDigest,
            authorizationId: sharedAuthId,
            attestationId: `att-herd-${idx}-${crypto.randomUUID()}`,
            ownerNodeId: `node-${(idx % 5) + 1}`,
          })
        })
      )

      const succeeded = settlements.filter((s) => s.status === 'fulfilled')
      const rejected = settlements.filter(
        (s): s is PromiseRejectedResult => s.status === 'rejected'
      )
      const unexpectedErrors = rejected.filter(
        (r) =>
          !String(r.reason?.message || '').match(
            /SERVICE_ANTI_REPLAY_(IDEMPOTENCY_CONFLICT|REQUEST_ID_DUPLICATED|AUTHORIZATION_ALREADY_USED|LOCK_CONTENTION)/
          )
      )

      expect(settlements.length).toBe(30)
      expect(succeeded.length).toBe(1)
      expect(rejected.length).toBe(29)
      expect(unexpectedErrors.length).toBe(0)

      // Verificar también el SQLSTATE nativo 23505 (unique_violation) devuelto por PostgreSQL 16 ante colisión directa sobre el índice único
      let observedSqlState = ''
      try {
        await sharedPool!.query(
          `INSERT INTO attestation_distributed_anti_replay (
             idempotency_key, request_id, request_sha256, authorization_id,
             attestation_id, state, owner_node_id, reservation_token,
             kms_attempted, reserved_at, lease_expires_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, 'RESERVED', 'node-dup', 'tok-dup', FALSE, NOW(), NOW() + INTERVAL '30 seconds', NOW())`,
          [
            `idem-dup-${crypto.randomUUID()}`,
            `req-dup-${crypto.randomUUID()}`,
            crypto.createHash('sha256').update('other-hash').digest('hex'),
            sharedAuthId, // Mismo authorization_id -> dispara uq_..._authorization_id (23505)
            `att-dup-${crypto.randomUUID()}`,
          ]
        )
      } catch (pgErr: unknown) {
        observedSqlState = String((pgErr as { code?: string })?.code || '')
      }
      expect(observedSqlState).toBe('23505')
    })

    it('Vector 3 — Ciclo de Vida Completo (Reserva -> Consumo -> Replay): transición atómica y bloqueo perpetuo post-consumo', async () => {
      const store = new PostgresDistributedAntiReplayStore({
        pool: sharedPool!,
      })

      const id = crypto.randomUUID()
      const requestId = `req-lifecycle-${id}`
      const authorizationId = `auth-lifecycle-${id}`
      const attestationId = `att-lifecycle-${id}`
      const requestSha256 = crypto
        .createHash('sha256')
        .update(requestId)
        .digest('hex')

      // 1. Reserva inicial
      const reserved = await store.reserveOnce({
        requestId,
        requestSha256,
        authorizationId,
        attestationId,
        ownerNodeId: 'node-lc-1',
      })
      expect(reserved.state).toBe('RESERVED')
      expect(reserved.reserved).toBe(true)

      // 2. Segundo intento de reserva mientras está RESERVED es rechazado
      await expect(
        store.reserveOnce({
          requestId,
          requestSha256,
          authorizationId,
          attestationId: `att-lifecycle-second-${id}`,
          ownerNodeId: 'node-lc-2',
        })
      ).rejects.toThrow(/SERVICE_ANTI_REPLAY_/)

      // 3. Inicio de intento de firma KMS
      const attemptStarted = await store.markSigningAttemptStarted({
        requestId,
        ownerNodeId: 'node-lc-1',
        reservationToken: reserved.reservationToken,
      })
      expect(attemptStarted?.kmsAttempted).toBe(true)
      expect(attemptStarted?.state).toBe('RESERVED')

      // 4. Confirmación de consumo (CONSUMED)
      const responseDigest = crypto
        .createHash('sha256')
        .update(`resp-${id}`)
        .digest('hex')
      const committed = await store.commitReservation({
        requestId,
        attestationId,
        ownerNodeId: 'node-lc-1',
        reservationToken: reserved.reservationToken,
        responseDigest,
      })
      expect(committed?.state).toBe('CONSUMED')
      expect(committed?.responseDigest).toBe(responseDigest)
      expect(committed?.consumedAt).toBeTruthy()

      // 5. Rechazo perpetuo de re-reserva o re-consumo posterior
      await expect(
        store.reserveOnce({
          requestId,
          requestSha256,
          authorizationId,
          attestationId: `att-lifecycle-replay-${id}`,
          ownerNodeId: 'node-lc-1',
        })
      ).rejects.toThrow(/SERVICE_ANTI_REPLAY_/)

      await expect(
        store.commitReservation({
          requestId,
          attestationId,
          ownerNodeId: 'node-lc-1',
          reservationToken: reserved.reservationToken,
          responseDigest,
        })
      ).rejects.toThrow(/SERVICE_ANTI_REPLAY_INVALID_TRANSITION/)
    })

    it('Vector 4 — Inmutabilidad de Contexto / Digest: rechaza alteración de request_digest, scope o environment y preserva intacta la fila original en PostgreSQL 16', async () => {
      const store = new PostgresDistributedAntiReplayStore({
        pool: sharedPool!,
      })
      const guard = new ServiceAntiReplayGuard({
        storageType: 'distributed',
        distributedStore: store,
        nodeId: 'node-vec4-1',
      })
      const baseSigner = new TestSigningProvider({
        authorityId: 'ext12b-pg-att',
      })
      const goIssuer = new TestOnlyGoAuthorityIssuer({
        authorityId: 'ext12b-pg-go',
      })
      const svc = new IndependentAttestationAuthorityService({
        signingProvider: baseSigner,
        antiReplayGuard: guard,
        attestationResponseVersion: '1.1',
        trustedGoPublicKeySpki: goIssuer.publicKeySpki,
        trustedGoAuthorityId: goIssuer.authorityId,
        trustedGoKeyId: goIssuer.keyId,
        expectedProjectRef: 'acoyfwwmhaeruciyedri',
        expectedCommitSha: 'd03523e84744c4bdfaf629a86148424f67fa09aa',
        clientAuthVerifier: async () => ({
          authenticated: true,
          clientId: 'pr02-collector',
          allowedScopes: ['PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'],
        }),
      })

      const nowMs = Date.now()
      const issuedAt = new Date(nowMs - 2000).toISOString()
      const expiresAt = new Date(nowMs + 300000).toISOString()
      const id = crypto.randomUUID()
      const baseReq = {
        schemaVersion: '1.0' as const,
        requestId: `ext12b-ctx-req-${id}`,
        processId: `ext12b-ctx-proc-${id}`,
        executionScope: 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION',
        commitSha: 'd03523e84744c4bdfaf629a86148424f67fa09aa',
        environment: 'HOMOLOGACION' as const,
        projectRef: 'acoyfwwmhaeruciyedri',
        authorizationId: `ext12b-ctx-auth-${id}`,
        goAuthorizationDocumentSha256: 'a'.repeat(64),
        manifestSha256: 'b'.repeat(64),
        rawSoapArtifacts: [
          { name: 'FEParamGetTiposIva_response.xml', sha256: 'c'.repeat(64) },
          {
            name: 'FEParamGetCondicionIvaReceptor_response.xml',
            sha256: 'd'.repeat(64),
          },
        ],
        normalizedArtifacts: [
          {
            name: 'FEParamGetTiposIva_normalized.json',
            sha256: 'e'.repeat(64),
          },
          {
            name: 'FEParamGetCondicionIvaReceptor_normalized.json',
            sha256: 'f'.repeat(64),
          },
        ],
        consultadoEn: '2026-11-16T12:00:00.000Z',
        requestedAt: issuedAt,
        collectorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
      }
      const origDigest = computeAttestationRequestDigest(baseReq)
      const fullReq = { ...baseReq, requestSha256: origDigest }
      const grant = goIssuer.issueGrant({
        authorizationId: fullReq.authorizationId,
        requestId: fullReq.requestId,
        processId: fullReq.processId,
        executionScope: fullReq.executionScope,
        environment: fullReq.environment,
        projectRef: fullReq.projectRef,
        commitSha: fullReq.commitSha,
        requestSha256: fullReq.requestSha256,
        issuedAt,
        notBefore: issuedAt,
        expiresAt,
      })

      const okResp = await svc.handleRequest({
        ...fullReq,
        goAuthorizationGrant: grant,
      })
      expect(okResp.evidenceLevel).toBe('LEVEL_1_DIGEST_ONLY')
      expect(okResp.requestId).toBe(fullReq.requestId)

      // Intentar reutilizar authorizationId cambiando request_sha256
      const mutatedDigest = crypto
        .createHash('sha256')
        .update(`mutated-${id}`)
        .digest('hex')
      await expect(
        store.reserveOnce({
          requestId: `ext12b-ctx-req-mut-${id}`,
          requestSha256: mutatedDigest,
          authorizationId: fullReq.authorizationId,
          attestationId: `att-mut-${id}`,
          ownerNodeId: 'node-mut',
        })
      ).rejects.toThrow(/SERVICE_ANTI_REPLAY_GO_AUTHORIZATION_DUPLICATED/)

      // Intentar reutilizar requestId cambiando request_sha256 y authorizationId
      await expect(
        store.reserveOnce({
          requestId: fullReq.requestId,
          requestSha256: mutatedDigest,
          authorizationId: `ext12b-ctx-auth-mut-${id}`,
          attestationId: `att-mut2-${id}`,
          ownerNodeId: 'node-mut',
        })
      ).rejects.toThrow(/SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT/)

      // Intentar reutilizar requestId cambiando scope/environment en el servicio
      await expect(
        svc.handleRequest({
          ...fullReq,
          executionScope: 'UNAUTHORIZED_SCOPE_MUTATION',
          goAuthorizationGrant: grant,
        })
      ).rejects.toThrow()

      await expect(
        svc.handleRequest({
          ...fullReq,
          environment: 'PRODUCTION' as 'HOMOLOGACION',
          goAuthorizationGrant: grant,
        })
      ).rejects.toThrow()

      // Consultar directamente la fila en PostgreSQL 16 y verificar que permanece intacta
      const dbRow = await sharedPool!.query<{
        request_id: string
        request_sha256: string
        authorization_id: string
        attestation_id: string
        state: string
      }>(
        `SELECT request_id, request_sha256, authorization_id, attestation_id, state
         FROM attestation_distributed_anti_replay
         WHERE request_id = $1`,
        [fullReq.requestId]
      )
      expect(dbRow.rows.length).toBe(1)
      expect(dbRow.rows[0]).toEqual({
        request_id: fullReq.requestId,
        request_sha256: origDigest,
        authorization_id: fullReq.authorizationId,
        attestation_id: okResp.attestationId,
        state: 'CONSUMED',
      })
    })

    it('Vector 5 — Expiración (TTL) con Reloj SQL (NOW()): reserva vencida no puede consumirse y registro CONSUMED jamás se rehabilita tras vencer su lease', async () => {
      // Obtener el reloj UTC real de PostgreSQL 16
      const clockRes = await sharedPool!.query<{ db_now: Date }>(
        'SELECT NOW() AS db_now'
      )
      const pgNowMs = clockRes.rows[0]!.db_now.getTime()

      const store = new PostgresDistributedAntiReplayStore({
        pool: sharedPool!,
        defaultLeaseTtlMs: 120,
      })

      const id = crypto.randomUUID()
      const expReqId = `req-ttl-exp-${id}`
      const expRes = await store.reserveOnce({
        requestId: expReqId,
        requestSha256: crypto
          .createHash('sha256')
          .update(expReqId)
          .digest('hex'),
        authorizationId: `auth-ttl-exp-${id}`,
        attestationId: `att-ttl-exp-${id}`,
        ownerNodeId: 'node-ttl',
        now: pgNowMs,
        leaseTtlMs: 100,
      })
      expect(expRes.state).toBe('RESERVED')

      // Esperar 200ms reales y volver a consultar NOW() de PostgreSQL 16
      await new Promise((r) => setTimeout(r, 200))
      const afterClock = await sharedPool!.query<{ db_now: Date }>(
        'SELECT NOW() AS db_now'
      )
      const pgAfterMs = afterClock.rows[0]!.db_now.getTime()
      expect(pgAfterMs).toBeGreaterThan(Date.parse(expRes.leaseExpiresAt))

      // Intentar consumir la reserva vencida usando el reloj SQL real -> falla cerrado y persiste EXPIRED
      await expect(
        store.commitReservation({
          requestId: expReqId,
          attestationId: `att-ttl-exp-${id}`,
          ownerNodeId: 'node-ttl',
          reservationToken: expRes.reservationToken,
          now: pgAfterMs,
        })
      ).rejects.toThrow(/SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED/)

      const expiredRecord = await store.getReservation(expReqId)
      expect(expiredRecord?.state).toBe('EXPIRED')

      // Ahora verificar que una reserva CONSUMED jamás vuelve a habilitarse aunque su lease_expires_at quede en el pasado
      const consumedReqId = `req-ttl-consumed-${id}`
      const consRes = await store.reserveOnce({
        requestId: consumedReqId,
        requestSha256: crypto
          .createHash('sha256')
          .update(consumedReqId)
          .digest('hex'),
        authorizationId: `auth-ttl-consumed-${id}`,
        attestationId: `att-ttl-consumed-${id}`,
        ownerNodeId: 'node-ttl',
        now: pgAfterMs,
        leaseTtlMs: 100,
      })
      await store.commitReservation({
        requestId: consumedReqId,
        attestationId: `att-ttl-consumed-${id}`,
        ownerNodeId: 'node-ttl',
        reservationToken: consRes.reservationToken,
        now: pgAfterMs + 10,
      })

      // Esperar a que su lease_expires_at quede en el pasado según NOW() de PostgreSQL
      await new Promise((r) => setTimeout(r, 180))
      const lateClock = await sharedPool!.query<{ db_now: Date }>(
        'SELECT NOW() AS db_now'
      )
      const pgLateMs = lateClock.rows[0]!.db_now.getTime()

      await expect(
        store.reserveOnce({
          requestId: consumedReqId,
          requestSha256: crypto
            .createHash('sha256')
            .update(consumedReqId)
            .digest('hex'),
          authorizationId: `auth-ttl-consumed-${id}`,
          attestationId: `att-ttl-consumed-replay-${id}`,
          ownerNodeId: 'node-ttl-2',
          now: pgLateMs,
        })
      ).rejects.toThrow(/SERVICE_ANTI_REPLAY_/)

      await expect(
        store.expireReservation({
          requestId: consumedReqId,
          now: pgLateMs,
        })
      ).rejects.toThrow(/SERVICE_ANTI_REPLAY_INVALID_TRANSITION/)
    })

    it('Vector 6 — Contención de Locks (SELECT ... FOR UPDATE), Timeout, Rollback e Higiene del Pool (0 sesiones idle in transaction en pg_stat_activity)', async () => {
      const storeWithShortTimeout = new PostgresDistributedAntiReplayStore({
        pool: sharedPool!,
        statementTimeoutMs: 250,
        queryTimeoutMs: 1500,
      })

      const id = crypto.randomUUID()
      const lockReqId = `req-lock-${id}`
      const reserved = await storeWithShortTimeout.reserveOnce({
        requestId: lockReqId,
        requestSha256: crypto
          .createHash('sha256')
          .update(lockReqId)
          .digest('hex'),
        authorizationId: `auth-lock-${id}`,
        attestationId: `att-lock-${id}`,
        ownerNodeId: 'node-lock-1',
      })
      expect(reserved.state).toBe('RESERVED')

      // Abrir conexión secundaria y tomar lock exclusivo de fila con SELECT ... FOR UPDATE
      const blockerClient = await sharedPool!.connect()
      try {
        await blockerClient.query('BEGIN')
        await blockerClient.query(
          'SELECT request_id, state FROM attestation_distributed_anti_replay WHERE request_id = $1 FOR UPDATE',
          [lockReqId]
        )

        // Mientras la fila está bloqueada por blockerClient, commitReservation desde el store debe abortar por statement_timeout (SQLSTATE 57014) y hacer ROLLBACK limpio
        await expect(
          storeWithShortTimeout.commitReservation({
            requestId: lockReqId,
            attestationId: `att-lock-${id}`,
            ownerNodeId: 'node-lock-1',
            reservationToken: reserved.reservationToken,
          })
        ).rejects.toThrow(/SERVICE_ANTI_REPLAY_UNAVAILABLE/)
      } finally {
        await blockerClient.query('ROLLBACK')
        blockerClient.release()
      }

      // Verificar que tras liberar el lock la fila sigue en RESERVED (el intento abortado hizo ROLLBACK completo)
      const rowAfterLock = await storeWithShortTimeout.getReservation(lockReqId)
      expect(rowAfterLock?.state).toBe('RESERVED')

      // Consultar pg_stat_activity en PostgreSQL 16 para verificar que hay 0 sesiones en estado 'idle in transaction'
      const activityRes = await sharedPool!.query<{ count: number }>(
        `SELECT count(*)::int AS count
         FROM pg_stat_activity
         WHERE datname = $1
           AND state = 'idle in transaction'`,
        [TEST_DB_NAME]
      )
      expect(activityRes.rows[0]?.count).toBe(0)
    })

    it('Vector 7 — Guardas de Aislamiento POS / Supabase / TLS: bloquea cadenas de conexión de Supabase, POS y conexiones remotas sin TLS', async () => {
      for (const forbiddenUrl of [
        'postgres://postgres:sec@db.acoyfwwmhaeruciyedri.supabase.co:5432/attestation_anti_replay?sslmode=verify-full',
        'postgres://postgres:sec@aws-0-sa-east-1.pooler.supabase.com:6543/attestation_anti_replay?sslmode=verify-full',
        'postgres://att_user:sec@pg.attestation.internal:5432/kiosco_pos?sslmode=verify-full',
        'postgres://att_user:sec@pg.attestation.internal:5432/postgres?sslmode=verify-full',
        'postgres://att_user:sec@pg.attestation.internal:5432/supabase?sslmode=verify-full',
        'postgres://att_user:sec@wsaa.afip.gov.ar:5432/attestation_anti_replay?sslmode=verify-full',
        'postgres://att_user:sec@169.254.169.254:5432/attestation_anti_replay?sslmode=verify-full',
        'postgres://att_user:sec@[::ffff:169.254.169.254]:5432/attestation_anti_replay?sslmode=verify-full',
        'postgres://att_user:sec@pg.attestation.internal:5432/attestation_anti_replay',
        'postgres://att_user:sec@pg.attestation.internal:5432/attestation_anti_replay?sslmode=disable',
        'postgres://att_user:sec@pg.attestation.internal:5432/attestation_anti_replay?sslmode=prefer',
      ]) {
        expect(() => assertDedicatedPostgresUrl(forbiddenUrl)).toThrow(
          /POSTGRES_(DEDICATED_DATABASE_REQUIRED|FORBIDDEN_HOST|TLS_REQUIRED)/
        )
        await expect(
          createControlledPostgresStoreFromEnv({
            ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
            ATTESTATION_POSTGRES_URL: forbiddenUrl,
          })
        ).rejects.toThrow(
          /POSTGRES_(DEDICATED_DATABASE_REQUIRED|FORBIDDEN_HOST|TLS_REQUIRED)/
        )
      }
    })
  }
)
