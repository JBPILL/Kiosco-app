/**
 * EXT-REAL-06 — Suite Adversarial Distribuida, PostgreSQL/DynamoDB & KMS External Providers
 *
 * Valida localmente:
 * - Contrato formal de DistributedAntiReplayStore y máquina de estados (AVAILABLE/RESERVED/CONSUMED/FAILED/EXPIRED)
 * - Simulación multi-nodo real sobre almacén compartido (2 nodos, 10 nodos, 100 requests concurrentes)
 * - Conflictos de idempotencyKey: mismo requestId + distinto digest (`EXT06-D-04`), mismo authorizationId + distinto request (`EXT06-D-05`)
 * - Recuperación fail-closed tras crash en RESERVED (`EXT06-D-06`), fallo en firma -> FAILED (`EXT06-D-07`) y timeout -> EXPIRED (`EXT06-D-08`)
 * - Contienda entre 2 procesos Node OS independientes sobre coordinador compartido (`EXT06-D-09`)
 * - Fallo cerrado y diferenciación /health (liveness) vs /readiness 503 ante store corrupto/no disponible (`EXT06-D-10`)
 * - Adaptador PostgreSQL (incluyendo validación SQL real en @electric-sql/pglite embebido) y adaptador DynamoDB (TransactWriteItems/ConditionExpression)
 * - Contrato de proveedores KMS externos (Local/Test, AWS KMS, GCP Cloud KMS) manteniendo flags honestas realWorldTested = false
 *
 * Restricciones absolutas:
 * - 100% LOCAL-ONLY: 0 llamadas AWS/GCP/Cloud, 0 ARCA, 0 Supabase staging/prod, 0 mutaciones remotas.
 */

import { describe, it, expect, afterEach } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

import {
  computeAttestationRequestDigest,
  PR02_P0_COLECTOR_IDENTIDAD,
} from '../../scripts/fiscal/plan-pr02-parameters.mjs'

import {
  AttestationSigningProvider,
  TestSigningProvider,
  ProductionKmsSigningProvider,
  AwsKmsSigningProvider,
  GcpKmsSigningProvider,
  EXTERNAL_SIGNING_PROVIDER_KINDS,
  PROVIDER_REAL_WORLD_TESTED,
  ServiceAntiReplayGuard,
  IndependentAttestationAuthorityService,
  IndependentAttestationHttpServer,
  createConfiguredAuthorityFromEnv,
  TestOnlyGoAuthorityIssuer,
  verifyServiceAttestationResponse,
  DISTRIBUTED_RESERVATION_STATES,
  ALLOWED_RESERVATION_TRANSITIONS,
  computeDistributedIdempotencyKey,
  assertValidReservationTransition,
  assertDistributedStoreContract,
  ReferenceInProcessDistributedStore,
  SharedFileCoordinatorDistributedStore,
  PostgresDistributedAntiReplayStore,
  POSTGRESQL_PRODUCTION_READY,
  POSTGRESQL_REAL_INTEGRATION_TESTED,
  DynamoDbDistributedAntiReplayStore,
  DYNAMODB_KEY_PREFIXES,
  AWS_DYNAMODB_REAL_TESTED,
  DYNAMODB_PRODUCTION_READY,
  type GenericKmsClient,
  type DistributedAntiReplayStoreContract,
  type DynamoDbClientAdapter,
  type PostgresPoolExecutor,
  type PostgresQueryExecutor,
} from '../../services/independent-attestation-authority/src/index.mjs'

const VALID_PROJECT_REF = 'acoyfwwmhaeruciyedri'
const VALID_COMMIT_SHA = '014ec379a46fc14703b2542ad8bbdd0c97ef8de0'
const VALID_COLLECTOR_ID = PR02_P0_COLECTOR_IDENTIDAD
const VALID_TOKEN = 'ext06-distributed-valid-oidc-token'
const VALID_FIXED_NOW = new Date(Date.now() - 5_000).toISOString()
const VALID_EXPIRES_AT = new Date(Date.now() + 600_000).toISOString()

const tempDirsToClean: string[] = []
const pgliteInstancesToClose: PGlite[] = []

function makeTempDir(prefix = 'ext06-dist-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirsToClean.push(dir)
  return dir
}

afterEach(async () => {
  while (pgliteInstancesToClose.length > 0) {
    const db = pgliteInstancesToClose.pop()!
    try {
      await db.close()
    } catch {
      // ignore cleanup
    }
  }
  while (tempDirsToClean.length > 0) {
    const dir = tempDirsToClean.pop()!
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      // ignore cleanup
    }
  }
})

function buildRequestBase(overrides: Record<string, unknown> = {}) {
  const id = crypto.randomUUID()
  const base = {
    schemaVersion: '1.0' as const,
    requestId: `att-req-${id}`,
    processId: `proc-${id}`,
    executionScope: 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION' as const,
    commitSha: VALID_COMMIT_SHA,
    environment: 'HOMOLOGACION' as const,
    projectRef: VALID_PROJECT_REF,
    authorizationId: `go-auth-${id}`,
    goAuthorizationDocumentSha256: 'a'.repeat(64),
    manifestSha256: 'b'.repeat(64),
    rawSoapArtifacts: [
      { name: 'FEParamGetTiposIva_response.xml', sha256: 'c'.repeat(64) },
      { name: 'FEParamGetCondicionIvaReceptor_response.xml', sha256: 'd'.repeat(64) },
    ],
    normalizedArtifacts: [
      { name: 'FEParamGetTiposIva_normalized.json', sha256: 'e'.repeat(64) },
      { name: 'FEParamGetCondicionIvaReceptor_normalized.json', sha256: 'f'.repeat(64) },
    ],
    consultadoEn: '2026-11-13T14:59:59.000Z',
    requestedAt: VALID_FIXED_NOW,
    collectorIdentity: VALID_COLLECTOR_ID,
    ...overrides,
  }
  const digest = computeAttestationRequestDigest(base)
  return {
    ...base,
    requestSha256:
      overrides.requestSha256 !== undefined ? (overrides.requestSha256 as string) : digest,
  }
}

interface SharedSignCounter {
  calls: Array<{ nodeId: string; payload: string }>
  failMessage: string | null
  delayMs: number
}

function createSharedKmsCounterSigner(
  nodeId: string,
  baseSigner: TestSigningProvider,
  counter: SharedSignCounter
): ProductionKmsSigningProvider {
  const kmsClient: GenericKmsClient = {
    async sign({ data }) {
      counter.calls.push({ nodeId, payload: data.toString('utf8') })
      if (counter.delayMs > 0) {
        await new Promise((r) => setTimeout(r, counter.delayMs))
      }
      if (counter.failMessage) {
        throw new Error(counter.failMessage)
      }
      return baseSigner.sign(data)
    },
  }
  return new ProductionKmsSigningProvider({
    authorityId: baseSigner.authorityId,
    keyId: baseSigner.keyId ?? undefined,
    publicKeySpki: baseSigner.publicKeySpki ?? undefined,
    keyVersionName: 'projects/local-sim/locations/global/keyRings/att/cryptoKeys/k1/cryptoKeyVersions/1',
    kmsClient,
  })
}

function createProdStyleAuthVerifier() {
  return {
    verifierKind: 'SIMULATED_S2S_TEST_HARNESS',
    trustScope: 'PRODUCTION_TEST_HARNESS',
    simulated: false,
    isProductionAuthVerifier: () => true,
    verify(headers: Record<string, unknown>) {
      const auth = String(headers.authorization || '')
      if (auth !== `Bearer ${VALID_TOKEN}`) {
        return { authenticated: false, clientId: '', allowedScopes: [] }
      }
      return {
        authenticated: true,
        clientId: 'pr02-p0-distributed-collector',
        authMechanism: 'OIDC_TEST_HARNESS',
        allowedScopes: ['PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'],
        isGoAuthority: false,
        simulated: false,
      }
    },
  }
}

function createDistributedClusterFixture(options: {
  nodeCount: number
  sharedStore: DistributedAntiReplayStoreContract
  leaseTtlMs?: number
  now?: (() => number | string | Date) | number | string | Date
  signDelayMs?: number
}) {
  const baseAttSigner = new TestSigningProvider({ authorityId: 'ext06-shared-att-authority-v1' })
  const goIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'ext06-go-authority-v1' })
  const signCounter: SharedSignCounter = {
    calls: [],
    failMessage: null,
    delayMs: options.signDelayMs ?? 0,
  }
  const authVerifier = createProdStyleAuthVerifier()

  const nodes = Array.from({ length: options.nodeCount }, (_, idx) => {
    const nodeId = `node-${idx + 1}`
    const signingProvider = createSharedKmsCounterSigner(nodeId, baseAttSigner, signCounter)
    const guard = new ServiceAntiReplayGuard({
      storageType: 'distributed',
      nodeId,
      leaseTtlMs: options.leaseTtlMs ?? 30_000,
      now: options.now,
      distributedStore: options.sharedStore,
    })
    const service = new IndependentAttestationAuthorityService({
      signingProvider,
      antiReplayGuard: guard,
      serviceEnvironment: 'PRODUCTION',
      protectedMode: true,
      requireSignedGoGrant: true,
      authorityId: baseAttSigner.authorityId,
      trustedGoAuthorityId: goIssuer.authorityId,
      trustedGoKeyId: goIssuer.keyId,
      trustedGoPublicKeySpki: goIssuer.publicKeySpki,
      expectedProjectRef: VALID_PROJECT_REF,
      expectedCommitSha: VALID_COMMIT_SHA,
      attestationResponseVersion: '1.1',
      clientAuthVerifier: authVerifier,
      now: options.now,
      env: { NODE_ENV: 'production', ATTESTATION_ENVIRONMENT: 'PRODUCTION' },
    })
    return { nodeId, service, guard, signingProvider }
  })

  function buildSignedRequest(overrides: Record<string, unknown> = {}) {
    const base = buildRequestBase(overrides)
    const grant = goIssuer.issueGrant({
      authorizationId: base.authorizationId,
      requestId: base.requestId,
      processId: base.processId,
      executionScope: base.executionScope,
      environment: base.environment,
      projectRef: base.projectRef,
      commitSha: base.commitSha,
      requestSha256: base.requestSha256,
      issuedAt: VALID_FIXED_NOW,
      notBefore: VALID_FIXED_NOW,
      expiresAt: VALID_EXPIRES_AT,
    })
    return {
      ...base,
      goAuthorizationGrant: grant,
    }
  }

  return {
    baseAttSigner,
    goIssuer,
    signCounter,
    nodes,
    buildSignedRequest,
  }
}

/**
 * Simulador local en memoria que ejecuta la semántica transaccional real de
 * DynamoDB `TransactWriteItems` (todo o nada con ConditionExpression) y `UpdateItem` condicional.
 * Exclusivo para tests unitarios locales (`AWS_DYNAMODB_REAL_TESTED = false`).
 */
function createLocalDynamoDbSimulator(): {
  client: DynamoDbClientAdapter
  items: Map<string, Record<string, unknown>>
  setTableStatus: (status: string) => void
  setHealthy: (healthy: boolean) => void
} {
  const items = new Map<string, Record<string, unknown>>()
  let tableStatus = 'ACTIVE'
  let healthy = true

  function evalUpdateCondition(
    existing: Record<string, unknown> | undefined,
    conditionExpr: string,
    values: Record<string, unknown>
  ): boolean {
    if (conditionExpr.includes('attribute_exists(pk)') && !existing) {
      return false
    }
    if (!existing) return false
    if (conditionExpr.includes('#state = :reserved') && existing.state !== values[':reserved']) {
      return false
    }
    if (conditionExpr.includes('ownerNodeId = :owner') && existing.ownerNodeId !== values[':owner']) {
      return false
    }
    if (
      conditionExpr.includes('reservationToken = :token') &&
      existing.reservationToken !== values[':token']
    ) {
      return false
    }
    if (conditionExpr.includes('attestationId = :attId') && existing.attestationId !== values[':attId']) {
      return false
    }
    if (conditionExpr.includes('leaseExpiresAtEpochMs > :nowEpochMs')) {
      const exp = Number(existing.leaseExpiresAtEpochMs || 0)
      if (!(exp > Number(values[':nowEpochMs']))) return false
    }
    if (conditionExpr.includes('leaseExpiresAtEpochMs <= :nowEpochMs')) {
      const exp = Number(existing.leaseExpiresAtEpochMs || 0)
      if (!(exp <= Number(values[':nowEpochMs']))) return false
    }
    return true
  }

  const client: DynamoDbClientAdapter = {
    async describeTable() {
      if (!healthy) throw new Error('DYNAMODB_SIMULATED_OUTAGE')
      return { Table: { TableStatus: tableStatus } }
    },
    async getItem(input) {
      if (!healthy) throw new Error('DYNAMODB_SIMULATED_OUTAGE')
      const item = items.get(input.Key.pk)
      return { Item: item ? { ...item } : null }
    },
    async transactWriteItems(input) {
      if (!healthy) throw new Error('DYNAMODB_SIMULATED_OUTAGE')
      const writes = input.TransactItems as Array<{
        Put: { Item: Record<string, unknown> & { pk: string }; ConditionExpression: string }
      }>
      const reasons = writes.map((w) => {
        const pk = w.Put.Item.pk
        if (w.Put.ConditionExpression.includes('attribute_not_exists(pk)') && items.has(pk)) {
          return { Code: 'ConditionalCheckFailed' }
        }
        return { Code: 'None' }
      })
      if (reasons.some((r) => r.Code !== 'None')) {
        const err = new Error('TransactionCanceledException: Transaction cancelled') as Error & {
          name: string
          CancellationReasons: Array<{ Code: string }>
        }
        err.name = 'TransactionCanceledException'
        err.CancellationReasons = reasons
        throw err
      }
      for (const w of writes) {
        items.set(w.Put.Item.pk, { ...w.Put.Item })
      }
      return {}
    },
    async updateItem(input) {
      if (!healthy) throw new Error('DYNAMODB_SIMULATED_OUTAGE')
      const key = (input.Key as { pk: string }).pk
      const existing = items.get(key)
      const values = (input.ExpressionAttributeValues || {}) as Record<string, unknown>
      const cond = String(input.ConditionExpression || '')
      if (!evalUpdateCondition(existing, cond, values)) {
        const err = new Error('ConditionalCheckFailedException') as Error & { name: string }
        err.name = 'ConditionalCheckFailedException'
        throw err
      }
      const next = { ...existing! }
      const updateExpr = String(input.UpdateExpression || '')
      if (updateExpr.includes('#state = :consumed')) {
        next.state = values[':consumed']
        next.kmsAttempted = values[':trueVal']
        next.consumedAt = values[':nowIso']
        next.responseDigest = values[':digest']
      } else if (updateExpr.includes('#state = :failed')) {
        next.state = values[':failed']
        next.kmsAttempted = values[':trueVal']
        next.failedAt = values[':nowIso']
        next.failureReason = values[':reason']
      } else if (updateExpr.includes('#state = :expired')) {
        next.state = values[':expired']
        next.expiredAt = values[':nowIso']
        next.failureReason = values[':reason']
      } else if (updateExpr.includes('kmsAttempted = :trueVal')) {
        next.kmsAttempted = values[':trueVal']
      }
      next.updatedAt = values[':nowIso'] || new Date().toISOString()
      items.set(key, next)
      return { Attributes: { ...next } }
    },
  }

  return {
    client,
    items,
    setTableStatus: (s: string) => {
      tableStatus = s
    },
    setHealthy: (h: boolean) => {
      healthy = h
    },
  }
}

describe('EXT-REAL-06 — Preparación Distribuida Multi-Nodo, PostgreSQL/DynamoDB & KMS', () => {
  const authHeaders = { authorization: `Bearer ${VALID_TOKEN}` }

  it('EXT06-CONTRACT-01: Contrato formal DistributedAntiReplayStore, clave de idempotencia y máquina de estados fail-closed', () => {
    const refStore = new ReferenceInProcessDistributedStore()
    expect(assertDistributedStoreContract(refStore)).toBe(refStore)

    expect(() => assertDistributedStoreContract({ reserveOnce: async () => {} })).toThrow(
      /SERVICE_ANTI_REPLAY_DISTRIBUTED_CONTRACT_INCOMPLETE/
    )

    // Máquina de estados formal
    expect(ALLOWED_RESERVATION_TRANSITIONS.AVAILABLE).toEqual([
      DISTRIBUTED_RESERVATION_STATES.RESERVED,
    ])
    expect(ALLOWED_RESERVATION_TRANSITIONS.RESERVED).toEqual([
      DISTRIBUTED_RESERVATION_STATES.CONSUMED,
      DISTRIBUTED_RESERVATION_STATES.FAILED,
      DISTRIBUTED_RESERVATION_STATES.EXPIRED,
    ])
    expect(ALLOWED_RESERVATION_TRANSITIONS.CONSUMED).toEqual([])
    expect(ALLOWED_RESERVATION_TRANSITIONS.FAILED).toEqual([])
    expect(ALLOWED_RESERVATION_TRANSITIONS.EXPIRED).toEqual([])

    expect(() =>
      assertValidReservationTransition('RESERVED', 'CONSUMED', 'test')
    ).not.toThrow()
    expect(() =>
      assertValidReservationTransition('CONSUMED', 'RESERVED', 'test')
    ).toThrow(/SERVICE_ANTI_REPLAY_INVALID_TRANSITION/)
    expect(() =>
      assertValidReservationTransition('EXPIRED', 'RESERVED', 'test')
    ).toThrow(/SERVICE_ANTI_REPLAY_INVALID_TRANSITION/)
    expect(() =>
      assertValidReservationTransition('FAILED', 'CONSUMED', 'test')
    ).toThrow(/SERVICE_ANTI_REPLAY_INVALID_TRANSITION/)

    // Idempotency key determinista
    const k1 = computeDistributedIdempotencyKey({
      authorizationId: 'auth-1',
      requestId: 'req-1',
      requestSha256: 'a'.repeat(64),
    })
    const k2 = computeDistributedIdempotencyKey({
      authorizationId: 'auth-1',
      requestId: 'req-1',
      requestSha256: 'A'.repeat(64),
    })
    const k3 = computeDistributedIdempotencyKey({
      authorizationId: 'auth-1',
      requestId: 'req-1',
      requestSha256: 'b'.repeat(64),
    })
    expect(k1).toBe(k2)
    expect(k1).toHaveLength(64)
    expect(k1).not.toBe(k3)
  })

  it('EXT06-D-01: Dos nodos simultáneos (NODE_A vs NODE_B) garantizan MAX_SIGNATURES = 1', async () => {
    const sharedStore = new ReferenceInProcessDistributedStore({ simulatedLatencyMs: 8 })
    const cluster = createDistributedClusterFixture({
      nodeCount: 2,
      sharedStore,
      signDelayMs: 5,
    })

    const request = cluster.buildSignedRequest()
    const [resA, resB] = await Promise.allSettled([
      cluster.nodes[0].service.handleRequest(request, authHeaders),
      cluster.nodes[1].service.handleRequest(request, authHeaders),
    ])

    const settled = [resA, resB]
    const winners = settled.filter((r) => r.status === 'fulfilled')
    const rejected = settled.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]

    expect(winners.length).toBe(1)
    expect(rejected.length).toBe(1)
    expect(cluster.signCounter.calls.length).toBe(1)
    expect(String(rejected[0].reason)).toMatch(/SERVICE_ANTI_REPLAY_/)

    const verified = verifyServiceAttestationResponse(
      (winners[0] as PromiseFulfilledResult<Record<string, unknown>>).value,
      {
        trustedAttestationPublicKey: cluster.baseAttSigner.publicKeySpki ?? '',
        pinnedKeyId: cluster.baseAttSigner.keyId,
      }
    )
    expect(verified.valid).toBe(true)

    const saved = await sharedStore.getReservation(request.requestId)
    expect(saved?.state).toBe('CONSUMED')
    expect(saved?.kmsAttempted).toBe(true)
    expect(refStoreCheck(sharedStore)).toBe(true)
  })

  it('EXT06-D-02: Diez nodos simultáneos compitiendo sobre almacén compartido producen 1 firma y 9 rechazos', async () => {
    const sharedStore = new ReferenceInProcessDistributedStore({ simulatedLatencyMs: 4 })
    const cluster = createDistributedClusterFixture({
      nodeCount: 10,
      sharedStore,
      signDelayMs: 4,
    })

    const request = cluster.buildSignedRequest()
    const outcomes = await Promise.allSettled(
      cluster.nodes.map((n) => n.service.handleRequest(request, authHeaders))
    )

    const okCount = outcomes.filter((o) => o.status === 'fulfilled').length
    const failCount = outcomes.filter((o) => o.status === 'rejected').length

    expect(okCount).toBe(1)
    expect(failCount).toBe(9)
    expect(cluster.signCounter.calls.length).toBe(1)
    expect(sharedStore.getStats()).toEqual({
      totalReservations: 1,
      RESERVED: 0,
      CONSUMED: 1,
      FAILED: 0,
      EXPIRED: 0,
    })
  })

  it('EXT06-D-03: 100 solicitudes concurrentes con mismo authorizationId repartidas entre 5 nodos => 1 firma y 99 rechazos', async () => {
    const sharedStore = new ReferenceInProcessDistributedStore()
    const cluster = createDistributedClusterFixture({
      nodeCount: 5,
      sharedStore,
    })

    const sharedAuthId = `go-auth-shared-${crypto.randomUUID()}`
    const requests = Array.from({ length: 100 }, (_, i) =>
      cluster.buildSignedRequest({
        authorizationId: sharedAuthId,
        requestId: i === 0 ? `req-first-${sharedAuthId}` : `req-race-${i}-${sharedAuthId}`,
      })
    )

    const outcomes = await Promise.allSettled(
      requests.map((req, idx) =>
        cluster.nodes[idx % cluster.nodes.length].service.handleRequest(req, authHeaders)
      )
    )

    const okCount = outcomes.filter((o) => o.status === 'fulfilled').length
    const failCount = outcomes.filter((o) => o.status === 'rejected').length

    expect(okCount).toBe(1)
    expect(failCount).toBeGreaterThanOrEqual(99)
    expect(cluster.signCounter.calls.length).toBe(1)
    expect(await sharedStore.hasAuthorizationId(sharedAuthId)).toBe(true)
  })

  it('EXT06-D-04: Mismo requestId con distinto digest (requestSha256) es rechazado entre nodos sin firmar', async () => {
    const sharedStore = new ReferenceInProcessDistributedStore()
    const cluster = createDistributedClusterFixture({
      nodeCount: 2,
      sharedStore,
    })

    const sharedRequestId = `att-req-fixed-${crypto.randomUUID()}`
    const req1 = cluster.buildSignedRequest({
      requestId: sharedRequestId,
      manifestSha256: '1'.repeat(64),
    })
    const req2 = cluster.buildSignedRequest({
      requestId: sharedRequestId,
      manifestSha256: '2'.repeat(64),
    })

    expect(req1.requestSha256).not.toBe(req2.requestSha256)

    await cluster.nodes[0].service.handleRequest(req1, authHeaders)
    expect(cluster.signCounter.calls.length).toBe(1)

    await expect(
      cluster.nodes[1].service.handleRequest(req2, authHeaders)
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT|SERVICE_ANTI_REPLAY_REQUEST_ID_DUPLICATED/)

    expect(cluster.signCounter.calls.length).toBe(1)
    expect(await cluster.nodes[1].guard.hasAuthorizationId(req2.authorizationId)).toBe(false)
  })

  it('EXT06-D-05: Mismo authorizationId con distinta solicitud es rechazado entre nodos sin firmar', async () => {
    const sharedStore = new ReferenceInProcessDistributedStore()
    const cluster = createDistributedClusterFixture({
      nodeCount: 2,
      sharedStore,
    })

    const sharedAuthId = `go-auth-reuse-${crypto.randomUUID()}`
    const req1 = cluster.buildSignedRequest({
      authorizationId: sharedAuthId,
      manifestSha256: '3'.repeat(64),
    })
    const req2 = cluster.buildSignedRequest({
      authorizationId: sharedAuthId,
      manifestSha256: '4'.repeat(64),
    })

    await cluster.nodes[0].service.handleRequest(req1, authHeaders)
    expect(cluster.signCounter.calls.length).toBe(1)

    await expect(
      cluster.nodes[1].service.handleRequest(req2, authHeaders)
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_GO_AUTHORIZATION_DUPLICATED/)

    expect(cluster.signCounter.calls.length).toBe(1)
  })

  it('EXT06-D-06: Crash simulado después de RESERVE y antes de SIGN mantiene bloqueo fail-closed entre nodos', async () => {
    const sharedStore = new ReferenceInProcessDistributedStore()
    const cluster = createDistributedClusterFixture({
      nodeCount: 2,
      sharedStore,
    })
    const req = cluster.buildSignedRequest()

    // Nodo 1 reserva atómicamente antes de firmar y cae abruptamente (sin commit ni markFailed)
    const preReservation = await cluster.nodes[0].guard.reserveBeforeSign(
      req,
      `att-res-crashed-${crypto.randomUUID()}`
    )
    expect(preReservation.ownerNodeId).toBe('node-1')

    const storedAfterCrash = await sharedStore.getReservation(req.requestId)
    expect(storedAfterCrash?.state).toBe('RESERVED')
    expect(storedAfterCrash?.kmsAttempted).toBe(false)

    // Nodo 2 recibe reintento del cliente -> DEBE rechazar fail-closed con 0 firmas
    await expect(
      cluster.nodes[1].service.handleRequest(req, authHeaders)
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_REQUEST_ID_DUPLICATED/)
    expect(cluster.signCounter.calls.length).toBe(0)

    // Incluso si se intenta confirmar desde otro nodo suplantando identidad -> falla por owner/token mismatch
    await expect(
      sharedStore.commitReservation({
        requestId: req.requestId,
        attestationId: preReservation.attestationId,
        ownerNodeId: 'node-2',
        reservationToken: 'forged-token',
      })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_OWNER_MISMATCH/)
  })

  it('EXT06-D-07: Fallo durante firma transiciona estado final a FAILED e impide reintentos en cualquier nodo', async () => {
    const sharedStore = new ReferenceInProcessDistributedStore()
    const cluster = createDistributedClusterFixture({
      nodeCount: 2,
      sharedStore,
    })
    const req = cluster.buildSignedRequest()

    cluster.signCounter.failMessage = 'PRODUCTION_KMS_UNAVAILABLE: HSM timeout simulado'

    await expect(
      cluster.nodes[0].service.handleRequest(req, authHeaders)
    ).rejects.toThrow(/PRODUCTION_KMS_UNAVAILABLE/)

    const afterFail = await sharedStore.getReservation(req.requestId)
    expect(afterFail?.state).toBe('FAILED')
    expect(afterFail?.kmsAttempted).toBe(true)
    expect(afterFail?.failureReason).toContain('PRODUCTION_KMS_UNAVAILABLE')

    // Aunque KMS se recupere, ningún nodo puede re-firmar esa autorización fallida
    cluster.signCounter.failMessage = null
    await expect(
      cluster.nodes[1].service.handleRequest(req, authHeaders)
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_REQUEST_ID_DUPLICATED/)
    expect(cluster.signCounter.calls.length).toBe(1) // solo el intento fallido original
  })

  it('EXT06-D-08: Timeout de reserva transiciona RESERVED -> EXPIRED de forma no reciclable y rechaza commit tardío', async () => {
    let clockMs = Date.now()
    const sharedStore = new ReferenceInProcessDistributedStore({
      defaultLeaseTtlMs: 500,
      now: () => clockMs,
    })
    const cluster = createDistributedClusterFixture({
      nodeCount: 2,
      sharedStore,
      leaseTtlMs: 500,
      now: () => clockMs,
    })

    const req = cluster.buildSignedRequest()
    const reservation = await cluster.nodes[0].guard.reserveBeforeSign(
      req,
      `att-res-timeout-${crypto.randomUUID()}`,
      { now: clockMs, leaseTtlMs: 500 }
    )

    // Antes de vencer el lease no puede expirar
    await expect(
      cluster.nodes[0].guard.expireReservation(req.requestId, { now: clockMs + 250 })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_LEASE_ACTIVE/)

    // Avanza reloj más allá del lease -> transiciona a EXPIRED
    clockMs += 600
    const expired = await cluster.nodes[0].guard.expireReservation(req.requestId, {
      now: clockMs,
      reason: 'WORKER_HUNG_TIMEOUT',
    })
    expect(expired?.state).toBe('EXPIRED')
    expect(expired?.expiredAt).toBeTruthy()

    // Commit tardío después de EXPIRED DEBE fallar cerrado
    await expect(
      cluster.nodes[0].guard.commitReservation(
        reservation,
        { attestationId: reservation.attestationId, attestationPayloadSha256: 'f'.repeat(64) },
        { now: clockMs }
      )
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED/)

    // El mismo authorizationId / requestId jamás se recicla en otro nodo
    await expect(
      cluster.nodes[1].service.handleRequest(req, authHeaders, { now: clockMs })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED|SERVICE_ANTI_REPLAY_REQUEST_ID_DUPLICATED/)
    expect(cluster.signCounter.calls.length).toBe(0)

    // También bloquea transición prohibida CONSUMED -> EXPIRED
    const req2 = cluster.buildSignedRequest()
    await cluster.nodes[0].service.handleRequest(req2, authHeaders, { now: clockMs })
    clockMs += 5000
    await expect(
      sharedStore.expireReservation({ requestId: req2.requestId, now: clockMs })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_INVALID_TRANSITION/)
  })

  it('EXT06-D-09: Dos procesos Node OS independientes compitiendo sobre coordinador compartido producen máximo 1 firma', async () => {
    const dir = makeTempDir('ext06-os-2proc-')
    const coordFile = path.join(dir, 'shared-coordinator.json')
    const markerDir = path.join(dir, 'markers')
    fs.mkdirSync(markerDir, { recursive: true })

    const goIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'ext06-os-go-auth' })
    const attSigner = new TestSigningProvider({ authorityId: 'ext06-os-att-auth' })
    const reqBase = buildRequestBase()
    const grant = goIssuer.issueGrant({
      authorizationId: reqBase.authorizationId,
      requestId: reqBase.requestId,
      processId: reqBase.processId,
      executionScope: reqBase.executionScope,
      environment: reqBase.environment,
      projectRef: reqBase.projectRef,
      commitSha: reqBase.commitSha,
      requestSha256: reqBase.requestSha256,
      issuedAt: VALID_FIXED_NOW,
      notBefore: VALID_FIXED_NOW,
      expiresAt: VALID_EXPIRES_AT,
    })

    const cfgPath = path.join(dir, 'worker-cfg.json')
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({
        request: { ...reqBase, goAuthorizationGrant: grant },
        trustedGoPublicKeySpki: goIssuer.publicKeySpki,
        trustedGoAuthorityId: goIssuer.authorityId,
        trustedGoKeyId: goIssuer.keyId,
        attAuthorityId: attSigner.authorityId,
        attKeyId: attSigner.keyId,
        attPublicKeySpki: attSigner.publicKeySpki,
        coordFile,
        markerDir,
      }),
      'utf8'
    )

    // Guardar pareja de firma de prueba solo para este worker test aislado (en dir temporal)
    const workerPrivPem = crypto
      .generateKeyPairSync('ed25519')
    const workerPubSpki = workerPrivPem.publicKey
      .export({ format: 'pem', type: 'spki' })
      .toString()
      .trim()
    const workerPrivDerB64 = workerPrivPem.privateKey
      .export({ format: 'der', type: 'pkcs8' })
      .toString('base64')

    const serviceIndexUrl = pathToFileURL(
      path.resolve(process.cwd(), 'services/independent-attestation-authority/src/index.mjs')
    ).href

    const workerScript = `
      import crypto from 'node:crypto';
      import fs from 'node:fs';
      import path from 'node:path';
      import {
        ProductionKmsSigningProvider,
        ServiceAntiReplayGuard,
        SharedFileCoordinatorDistributedStore,
        IndependentAttestationAuthorityService,
      } from ${JSON.stringify(serviceIndexUrl)};

      const nodeId = process.argv[2];
      const startAt = Number(process.argv[3]);
      const privB64 = process.argv[4];
      const cfg = JSON.parse(fs.readFileSync(${JSON.stringify(cfgPath)}, 'utf8'));
      const privKeyObj = crypto.createPrivateKey({ key: Buffer.from(privB64, 'base64'), format: 'der', type: 'pkcs8' });
      const pubObj = crypto.createPublicKey(privKeyObj);
      const pubSpki = pubObj.export({ format: 'pem', type: 'spki' }).toString().trim();
      const spkiDer = pubObj.export({ format: 'der', type: 'spki' });
      const derivedKeyId = 'ed25519-spki-' + crypto.createHash('sha256').update(spkiDer).digest('hex').slice(0, 16);

      let signCount = 0;
      const signer = new ProductionKmsSigningProvider({
        authorityId: 'ext06-os-att-auth',
        keyId: derivedKeyId,
        publicKeySpki: pubSpki,
        keyVersionName: 'projects/os-sim/locations/global/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',
        kmsClient: {
          async sign({ data }) {
            signCount += 1;
            fs.writeFileSync(path.join(cfg.markerDir, 'sign-' + nodeId + '-' + signCount + '.txt'), nodeId);
            await new Promise((r) => setTimeout(r, 30));
            return crypto.sign(null, data, privKeyObj).toString('hex');
          },
        },
      });

      const store = new SharedFileCoordinatorDistributedStore({
        filePath: cfg.coordFile,
        lockAcquireTimeoutMs: 4000,
        lockRetryIntervalMs: 8,
      });
      const guard = new ServiceAntiReplayGuard({
        storageType: 'distributed',
        nodeId,
        distributedStore: store,
      });

      const service = new IndependentAttestationAuthorityService({
        signingProvider: signer,
        antiReplayGuard: guard,
        serviceEnvironment: 'DEVELOPMENT',
        protectedMode: true,
        trustedGoPublicKeySpki: cfg.trustedGoPublicKeySpki,
        trustedGoAuthorityId: cfg.trustedGoAuthorityId,
        trustedGoKeyId: cfg.trustedGoKeyId,
        expectedProjectRef: ${JSON.stringify(VALID_PROJECT_REF)},
        expectedCommitSha: ${JSON.stringify(VALID_COMMIT_SHA)},
        clientAuthVerifier: {
          isProductionAuthVerifier: () => true,
          verify(headers) {
            const ok = headers.authorization === 'Bearer ${VALID_TOKEN}';
            return {
              authenticated: ok,
              clientId: 'os-worker-client',
              allowedScopes: ['PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'],
            };
          },
        },
      });

      const wait = startAt - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));

      try {
        const res = await service.handleRequest(cfg.request, { authorization: 'Bearer ${VALID_TOKEN}' });
        console.log(JSON.stringify({ ok: true, nodeId, signCount, attestationId: res.attestationId }));
      } catch (err) {
        console.log(JSON.stringify({ ok: false, nodeId, signCount, error: err?.message || String(err) }));
      }
    `
    const workerFile = path.join(dir, 'os-node-worker.mjs')
    fs.writeFileSync(workerFile, workerScript, 'utf8')
    expect(workerPubSpki).toContain('BEGIN PUBLIC KEY')

    const spawnNode = (nodeId: string, syncMs: number) =>
      new Promise<{ ok: boolean; nodeId: string; signCount: number; error?: string }>(
        (resolve, reject) => {
          const child = spawn(
            process.execPath,
            [workerFile, nodeId, String(syncMs), workerPrivDerB64],
            { stdio: ['ignore', 'pipe', 'pipe'] }
          )
          let out = ''
          let errOut = ''
          child.stdout.on('data', (d) => {
            out += d.toString()
          })
          child.stderr.on('data', (d) => {
            errOut += d.toString()
          })
          child.on('exit', (code) => {
            if (code !== 0) {
              reject(new Error(`Worker ${nodeId} exit=${code}: ${errOut}`))
              return
            }
            const lines = out.trim().split(/\r?\n/)
            resolve(JSON.parse(lines[lines.length - 1]))
          })
        }
      )

    const barrier = Date.now() + 250
    const [w1, w2] = await Promise.all([
      spawnNode('os-node-1', barrier),
      spawnNode('os-node-2', barrier),
    ])

    const okWorkers = [w1, w2].filter((w) => w.ok)
    const errWorkers = [w1, w2].filter((w) => !w.ok)
    expect(okWorkers.length).toBe(1)
    expect(errWorkers.length).toBe(1)
    expect(errWorkers[0].error).toMatch(/SERVICE_ANTI_REPLAY_/)

    const signMarkers = fs.readdirSync(markerDir).filter((f) => f.startsWith('sign-'))
    expect(signMarkers.length).toBe(1)

    const verifierStore = new SharedFileCoordinatorDistributedStore({ filePath: coordFile })
    expect(verifierStore.isRealInfrastructureTested).toBe(false)
    expect(verifierStore.multiNodeAtomicGuaranteed).toBe(false)
    const finalRec = await verifierStore.getReservation(reqBase.requestId)
    expect(finalRec?.state).toBe('CONSUMED')
  }, 15000)

  it('EXT06-D-10: Store corrupto/no disponible mantiene /health 200 (alive), retorna /readiness 503 y bloquea firma sin ejecutar KMS', async () => {
    const sharedStore = new ReferenceInProcessDistributedStore()
    const cluster = createDistributedClusterFixture({
      nodeCount: 1,
      sharedStore,
    })
    const server = new IndependentAttestationHttpServer({
      service: cluster.nodes[0].service,
      requireHttps: false,
      trustProxyHttps: true,
    })
    const { url } = await server.start(0)

    try {
      // Estado inicial saludable
      const health1 = await fetch(`${url}/health`)
      expect(health1.status).toBe(200)
      const h1Json = await health1.json()
      expect(h1Json.livenessState).toBe('SERVICE_PROCESS_ALIVE')
      expect(h1Json.distributedRealIntegrationTested).toBe(false)

      const ready1 = await fetch(`${url}/readiness`)
      expect(ready1.status).toBe(200)
      const r1Json = await ready1.json()
      expect(r1Json.ready).toBe(true)
      expect(r1Json.readyToSign).toBe(true)
      expect(r1Json.livenessState).toBe('SERVICE_PROCESS_ALIVE')
      expect(r1Json.readinessState).toBe('SERVICE_READY_TO_SIGN')

      // Corromper / desconectar el almacén distribuido
      sharedStore.setHealthy(false)
      sharedStore.setCorrupted(true)

      // /health sigue 200 (proceso HTTP vivo, pero /readiness es 503!)
      const healthDown = await fetch(`${url}/health`)
      expect(healthDown.status).toBe(200)
      const healthDownJson = await healthDown.json()
      expect(healthDownJson.livenessState).toBe('SERVICE_PROCESS_ALIVE')

      const readinessDown = await fetch(`${url}/readiness`)
      expect(readinessDown.status).toBe(503)
      const rDownJson = await readinessDown.json()
      expect(rDownJson.ready).toBe(false)
      expect(rDownJson.readyToSign).toBe(false)
      expect(rDownJson.readinessState).toBe('SERVICE_NOT_READY_TO_SIGN')
      expect(rDownJson.antiReplayHealthy).toBe(false)
      expect(rDownJson.reason).toBe('ANTI_REPLAY_STORAGE_UNAVAILABLE')

      // Solicitud POST /attestations DEBE fallar cerrado antes de llamar KMS
      const req = cluster.buildSignedRequest()
      const postRes = await fetch(`${url}/attestations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-Proto': 'https',
          authorization: `Bearer ${VALID_TOKEN}`,
        },
        body: JSON.stringify(req),
      })
      expect(postRes.status).toBe(503)
      const postJson = await postRes.json()
      expect(postJson.error.code).toBe('SERVICE_ANTI_REPLAY_UNAVAILABLE')
      expect(cluster.signCounter.calls.length).toBe(0)
    } finally {
      await server.close()
    }
  })

  it('EXT06-PG-01: PostgresDistributedAntiReplayStore valida transacciones SQL reales (BEGIN/ON CONFLICT/COMMIT), concurrencia multi-nodo y declara NO listo para producción real', async () => {
    expect(POSTGRESQL_PRODUCTION_READY).toBe(false)
    expect(POSTGRESQL_REAL_INTEGRATION_TESTED).toBe(false)

    // 1. Adaptador sin conexión falla cerrado honestamente
    const unconfiguredPg = new PostgresDistributedAntiReplayStore()
    expect(unconfiguredPg.isRealInfrastructureTested).toBe(false)
    expect(unconfiguredPg.isProductionDistributedReady).toBe(false)
    expect(await unconfiguredPg.isHealthy()).toBe(false)
    await expect(
      unconfiguredPg.reserveOnce({
        requestId: 'req-unwired',
        requestSha256: 'a'.repeat(64),
        attestationId: 'att-unwired',
      })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_UNAVAILABLE/)

    // 2. Motor SQL PostgreSQL real embebido (PGlite local, NO red/cloud)
    const db = new PGlite()
    pgliteInstancesToClose.push(db)
    const pgQueryClient: PostgresQueryExecutor = {
      async query(sql: string, params?: readonly unknown[]) {
        const res = await db.query<Record<string, unknown>>(
          sql,
          params ? [...params] : undefined
        )
        return {
          rows: res.rows,
          rowCount: res.rows.length > 0 ? res.rows.length : (res.affectedRows ?? 0),
        }
      },
    }

    const pgStoreA = new PostgresDistributedAntiReplayStore({
      queryClient: pgQueryClient,
    })
    const pgStoreB = new PostgresDistributedAntiReplayStore({
      queryClient: pgQueryClient,
    })

    // Verifica que SQL contiene BEGIN/INSERT...ON CONFLICT DO NOTHING RETURNING / UNIQUE constraints
    expect(pgStoreA.sqlStatements.reserveSql).toContain('ON CONFLICT DO NOTHING')
    expect(pgStoreA.sqlStatements.reserveSql).toContain('RETURNING')
    expect(pgStoreA.sqlStatements.schemaDdl).toContain('uq_attestation_distributed_anti_replay_idempotency_key')
    expect(pgStoreA.sqlStatements.schemaDdl).toContain('uq_attestation_distributed_anti_replay_authorization_id')

    await pgStoreA.ensureSchema()
    expect(await pgStoreA.isHealthy()).toBe(true)

    const cluster = createDistributedClusterFixture({
      nodeCount: 2,
      sharedStore: pgStoreA,
    })

    // Inyectar segundo nodo usando pgStoreB apuntando al mismo motor SQL
    const node1 = cluster.nodes[0]
    const guardB = new ServiceAntiReplayGuard({
      storageType: 'distributed',
      nodeId: 'pg-node-2',
      distributedStore: pgStoreB,
    })
    const node2Service = new IndependentAttestationAuthorityService({
      signingProvider: cluster.nodes[1].signingProvider,
      antiReplayGuard: guardB,
      serviceEnvironment: 'PRODUCTION',
      protectedMode: true,
      requireSignedGoGrant: true,
      authorityId: cluster.baseAttSigner.authorityId,
      trustedGoAuthorityId: cluster.goIssuer.authorityId,
      trustedGoKeyId: cluster.goIssuer.keyId,
      trustedGoPublicKeySpki: cluster.goIssuer.publicKeySpki,
      expectedProjectRef: VALID_PROJECT_REF,
      expectedCommitSha: VALID_COMMIT_SHA,
      attestationResponseVersion: '1.1',
      clientAuthVerifier: createProdStyleAuthVerifier(),
      env: { NODE_ENV: 'production', ATTESTATION_ENVIRONMENT: 'PRODUCTION' },
    })

    const req = cluster.buildSignedRequest()
    const [r1, r2] = await Promise.allSettled([
      node1.service.handleRequest(req, authHeaders),
      node2Service.handleRequest(req, authHeaders),
    ])

    expect([r1, r2].filter((r) => r.status === 'fulfilled').length).toBe(1)
    expect([r1, r2].filter((r) => r.status === 'rejected').length).toBe(1)
    expect(cluster.signCounter.calls.length).toBe(1)

    const saved = await pgStoreB.getReservation(req.requestId)
    expect(saved?.state).toBe('CONSUMED')
    expect(await pgStoreA.hasAuthorizationId(req.authorizationId)).toBe(true)

    // Mismo requestId con distinto digest -> rechazado por conflicto idempotente SQL
    const altReq = cluster.buildSignedRequest({
      requestId: req.requestId,
      manifestSha256: '9'.repeat(64),
    })
    await expect(node2Service.handleRequest(altReq, authHeaders)).rejects.toThrow(
      /SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT|SERVICE_ANTI_REPLAY_REQUEST_ID_DUPLICATED/
    )

    // Verificar flujo explícito BEGIN/COMMIT/ROLLBACK con Pool interface estándar
    const txTrace: string[] = []
    const poolMock: PostgresPoolExecutor = {
      async connect() {
        return {
          async query(sql: string) {
            txTrace.push(sql.split(/\s+/)[0])
            if (sql.startsWith('INSERT')) {
              return { rows: [{ request_id: 'pool-req-1' }], rowCount: 1 }
            }
            return { rows: [{ ok: 1 }], rowCount: 1 }
          },
          release() {
            txTrace.push('RELEASE')
          },
        }
      },
    }
    const poolAdapter = new PostgresDistributedAntiReplayStore({ pool: poolMock })
    await poolAdapter.reserveOnce({
      requestId: 'pool-req-1',
      requestSha256: 'e'.repeat(64),
      authorizationId: 'pool-auth-1',
      attestationId: 'pool-att-1',
      ownerNodeId: 'pool-node-1',
    })
    expect(txTrace).toEqual(['BEGIN', 'INSERT', 'COMMIT', 'RELEASE'])
  })

  it('EXT06-DDB-01: DynamoDbDistributedAntiReplayStore verifica TransactWriteItems, ConditionExpression y bandera AWS_DYNAMODB_REAL_TESTED = false', async () => {
    expect(AWS_DYNAMODB_REAL_TESTED).toBe(false)
    expect(DYNAMODB_PRODUCTION_READY).toBe(false)

    // 1. Adaptador sin cliente falla cerrado
    const unwiredDdb = new DynamoDbDistributedAntiReplayStore()
    expect(unwiredDdb.awsDynamoDbRealTested).toBe(false)
    expect(unwiredDdb.isRealInfrastructureTested).toBe(false)
    expect(await unwiredDdb.isHealthy()).toBe(false)

    // 2. Simulación transaccional local de TransactWriteItems + ConditionExpression
    const ddbSim = createLocalDynamoDbSimulator()
    let clockMs = Date.now()
    const ddbStore = new DynamoDbDistributedAntiReplayStore({
      client: ddbSim.client,
      tableName: 'test_attestation_anti_replay',
      now: () => clockMs,
    })

    const cluster = createDistributedClusterFixture({
      nodeCount: 2,
      sharedStore: ddbStore,
      now: () => clockMs,
    })

    const req = cluster.buildSignedRequest()
    const [res1, res2] = await Promise.allSettled([
      cluster.nodes[0].service.handleRequest(req, authHeaders, { now: clockMs }),
      cluster.nodes[1].service.handleRequest(req, authHeaders, { now: clockMs }),
    ])

    expect([res1, res2].filter((r) => r.status === 'fulfilled').length).toBe(1)
    expect([res1, res2].filter((r) => r.status === 'rejected').length).toBe(1)
    expect(cluster.signCounter.calls.length).toBe(1)

    // Verificar los 4 ítems de unicidad en la tabla DynamoDB simulada
    expect(ddbSim.items.has(`${DYNAMODB_KEY_PREFIXES.REQUEST}${req.requestId}`)).toBe(true)
    expect(ddbSim.items.has(`${DYNAMODB_KEY_PREFIXES.HASH}${req.requestSha256}`)).toBe(true)
    expect(ddbSim.items.has(`${DYNAMODB_KEY_PREFIXES.AUTHORIZATION}${req.authorizationId}`)).toBe(
      true
    )

    // Mismo authorizationId con distinta solicitud bloqueado por AUTH# ConditionExpression
    const reqAlt = cluster.buildSignedRequest({
      authorizationId: req.authorizationId,
      manifestSha256: '7'.repeat(64),
    })
    await expect(
      cluster.nodes[1].service.handleRequest(reqAlt, authHeaders, { now: clockMs })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_GO_AUTHORIZATION_DUPLICATED/)

    // Simular expiración tras timeout en DynamoDB
    const reqTimeout = cluster.buildSignedRequest()
    await cluster.nodes[0].guard.reserveBeforeSign(
      reqTimeout,
      `att-ddb-exp-${crypto.randomUUID()}`,
      { now: clockMs, leaseTtlMs: 300 }
    )
    clockMs += 400
    const expired = await ddbStore.expireReservation({
      requestId: reqTimeout.requestId,
      now: clockMs,
    })
    expect(expired?.state).toBe('EXPIRED')

    // Health degradation reflejada cuando tabla no está ACTIVE o hay caída
    expect(await ddbStore.isHealthy()).toBe(true)
    ddbSim.setTableStatus('UPDATING')
    expect(await ddbStore.isHealthy()).toBe(false)
    ddbSim.setTableStatus('ACTIVE')
    ddbSim.setHealthy(false)
    expect(await ddbStore.isHealthy()).toBe(false)
  })

  it('EXT06-KMS-01: Contrato de proveedores externos AWS KMS / GCP KMS verifica firmas Ed25519 sin claves privadas y mantiene realWorldTested = false', async () => {
    expect(PROVIDER_REAL_WORLD_TESTED).toBe(false)

    // Simulador externo de par de llaves para verificar la integración del contrato KMS (solo en test)
    const testOrigin = new TestSigningProvider({ authorityId: 'ext06-kms-verifier-origin' })
    const goIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'ext06-kms-go' })
    const refStore = new ReferenceInProcessDistributedStore()

    // 1. AWS KMS Provider Adapter
    const awsKms = new AwsKmsSigningProvider({
      authorityId: 'aws-att-authority-v1',
      keyId: testOrigin.keyId ?? undefined,
      publicKeySpki: testOrigin.publicKeySpki ?? undefined,
      kmsKeyArn: 'arn:aws:kms:us-east-1:111122223333:key/ed25519-test-only',
      region: 'us-east-1',
      awsKmsClient: {
        async send(cmd) {
          expect(cmd.KeyId).toBe('arn:aws:kms:us-east-1:111122223333:key/ed25519-test-only')
          expect(cmd.MessageType).toBe('RAW')
          const sigHex = testOrigin.sign(cmd.Message)
          return { Signature: Buffer.from(sigHex, 'hex') }
        },
      },
    })

    expect(awsKms).toBeInstanceOf(AttestationSigningProvider)
    expect(awsKms.providerKind).toBe(EXTERNAL_SIGNING_PROVIDER_KINDS.AWS_KMS)
    expect(awsKms.signerType).toBe('PRODUCTION_KMS_SIGNER')
    expect(awsKms.isProductionReady()).toBe(true)
    expect(awsKms.isRealWorldTested()).toBe(false)
    expect(awsKms.getMetadata().realWorldTested).toBe(false)
    expect(() => awsKms.accessPrivateKey()).toThrow(/KMS_PRIVATE_KEY_NON_EXPORTABLE/)
    expect(() => awsKms.fallbackToLocal()).toThrow(/LOCAL_FALLBACK_SIGNING_FORBIDDEN/)

    // 2. GCP KMS Provider Adapter (vía createConfiguredAuthorityFromEnv con ATTESTATION_KMS_PROVIDER=GCP_KMS)
    const cfgGcp = createConfiguredAuthorityFromEnv(
      {
        ATTESTATION_ENVIRONMENT: 'STAGING',
        ATTESTATION_SIGNING_PROVIDER: 'PRODUCTION_KMS_SIGNER',
        ATTESTATION_KMS_PROVIDER: 'GCP_KMS',
        ATTESTATION_AUTHORITY_ID: 'gcp-att-authority-v1',
        ATTESTATION_KEY_ID: testOrigin.keyId ?? '',
        ATTESTATION_PUBLIC_KEY_SPKI: testOrigin.publicKeySpki ?? '',
        ATTESTATION_KMS_KEY_VERSION:
          'projects/kioskopos-test/locations/southamerica-east1/keyRings/att/cryptoKeys/att-sign/cryptoKeyVersions/1',
        ATTESTATION_ANTI_REPLAY_MODE: 'distributed',
        ATTESTATION_TRUST_PROXY_HTTPS: 'true',
        ATTESTATION_GO_AUTHORITY_ID: goIssuer.authorityId,
        ATTESTATION_GO_KEY_ID: goIssuer.keyId,
        ATTESTATION_GO_PUBLIC_KEY_SPKI: goIssuer.publicKeySpki,
        ATTESTATION_ALLOWED_PROJECT_REF: VALID_PROJECT_REF,
        ATTESTATION_ALLOWED_COMMIT_SHA: VALID_COMMIT_SHA,
        ATTESTATION_RESPONSE_VERSION: '1.1',
      },
      {
        distributedStore: refStore,
        clientAuthVerifier: createProdStyleAuthVerifier(),
        gcpKmsClient: {
          async asymmetricSign(req) {
            expect(req.name).toContain('cryptoKeyVersions/1')
            const sigHex = testOrigin.sign(req.data)
            return [{ signature: Buffer.from(sigHex, 'hex').toString('base64') }]
          },
        },
      }
    )

    expect(cfgGcp.service.signingProvider).toBeInstanceOf(GcpKmsSigningProvider)
    expect(cfgGcp.service.signingProvider.providerKind).toBe('GCP_KMS')
    expect(cfgGcp.service.signingProvider.isRealWorldTested()).toBe(false)

    const health = cfgGcp.service.handleHealth()
    expect(health.kmsProviderKind).toBe('GCP_KMS')
    expect(health.kmsRealWorldTested).toBe(false)
    expect(health.kmsRealConfigured).toBe(false)

    const bundleReq = buildRequestBase()
    const grant = goIssuer.issueGrant({
      authorizationId: bundleReq.authorizationId,
      requestId: bundleReq.requestId,
      processId: bundleReq.processId,
      executionScope: bundleReq.executionScope,
      environment: bundleReq.environment,
      projectRef: bundleReq.projectRef,
      commitSha: bundleReq.commitSha,
      requestSha256: bundleReq.requestSha256,
      issuedAt: VALID_FIXED_NOW,
      notBefore: VALID_FIXED_NOW,
      expiresAt: VALID_EXPIRES_AT,
    })

    const attested = await cfgGcp.service.handleRequest(
      { ...bundleReq, goAuthorizationGrant: grant },
      authHeaders
    )
    expect(attested.schemaVersion).toBe('1.1')
    expect(
      verifyServiceAttestationResponse(attested, {
        trustedAttestationPublicKey: testOrigin.publicKeySpki ?? '',
        pinnedKeyId: testOrigin.keyId,
      }).valid
    ).toBe(true)

    // 3. Firma corrupta retornada por KMS es rechazada criptográficamente
    const badKms = new AwsKmsSigningProvider({
      authorityId: 'aws-bad-sig',
      keyId: testOrigin.keyId ?? undefined,
      publicKeySpki: testOrigin.publicKeySpki ?? undefined,
      kmsKeyArn: 'arn:aws:kms:us-east-1:111122223333:key/bad',
      awsKmsClient: {
        async send() {
          return { Signature: Buffer.alloc(64, 0xaa) }
        },
      },
    })
    await expect(badKms.sign('payload')).rejects.toThrow(/KMS_PUBLIC_KEY_MISMATCH/)
  })
})

function refStoreCheck(store: ReferenceInProcessDistributedStore) {
  return store.getStats().CONSUMED === 1
}
