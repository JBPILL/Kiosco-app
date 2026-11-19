// @vitest-environment node
import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import {
  computeAttestationRequestDigest,
  PR02_P0_COLECTOR_IDENTIDAD,
} from '../../scripts/fiscal/plan-pr02-parameters.mjs'

import {
  assertDedicatedPostgresUrl,
  assertExternalConnectivityAuthorized,
  assertSafeEndpointUrl,
  AwsKmsSigningProvider,
  buildSafeConfigurationFingerprint,
  classifyDynamoDbConnectivityError,
  classifyNetworkHost,
  CONNECTIVITY_AUTHORIZATION_STATUSES,
  CONNECTIVITY_READINESS_STAGES,
  CONNECTIVITY_STAGE_ORDER,
  createConfiguredAuthorityFromEnv,
  createControlledDynamoDbStoreFromEnv,
  createControlledKmsProviderFromEnv,
  createControlledPostgresStoreFromEnv,
  createMtlsClientAuthVerifier,
  createOidcJwtClientAuthVerifier,
  DYNAMODB_ERROR_CATEGORIES,
  DynamoDbDistributedAntiReplayStore,
  evaluateExternalConnectivityAuthorization,
  evaluateIntegrationPhaseGate,
  evaluateMaturityState,
  GcpKmsSigningProvider,
  IndependentAttestationAuthorityService,
  INTEGRATION_PHASE_ORDER,
  INTEGRATION_PHASES,
  isRealIntegrationDryRun,
  MATURITY_STATES,
  MTLS_CONNECTIVITY_STATES,
  POSTGRES_CONNECTIVITY_STATES,
  PostgresDistributedAntiReplayStore,
  PREFLIGHT_STATUSES,
  redactSensitiveConfigText,
  runControlledDynamoDbConnectivityCheck,
  runControlledExternalConnectivitySuite,
  runControlledKmsConnectivityCheck,
  runControlledMtlsConnectivityCheck,
  runControlledOidcConnectivityCheck,
  runControlledPostgresConnectivityCheck,
  runControlledRealIntegrationDryRun,
  runInfrastructurePreflight,
  SERVICE_ENVIRONMENTS,
  ServiceAntiReplayGuard,
  TestOnlyGoAuthorityIssuer,
  TestSigningProvider,
  validateInfrastructureConfiguration,
  verifyServiceAttestationResponse,
  type DynamoDbClientAdapter,
  type OidcJwkKey,
  type PostgresQueryExecutor,
} from '../../services/independent-attestation-authority/src/index.mjs'

const VALID_PROJECT_REF = 'acoyfwwmhaeruciyedri'
const VALID_COMMIT_SHA = '014ec379a46fc14703b2542ad8bbdd0c97ef8de0'
const VALID_SCOPE = 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'

const httpServersToClose: http.Server[] = []
const serviceServersToClose: Array<{ close: () => Promise<void> }> = []
let sharedPglite: PGlite | null = null
let sharedPgliteSchemaReady = false

afterEach(async () => {
  vi.restoreAllMocks()
  while (serviceServersToClose.length > 0) {
    const srv = serviceServersToClose.pop()!
    try {
      await srv.close()
    } catch {
      // ignore test cleanup error
    }
  }
  while (httpServersToClose.length > 0) {
    const srv = httpServersToClose.pop()!
    srv.closeAllConnections?.()
    await new Promise<void>((resolve) => srv.close(() => resolve()))
  }
})

afterAll(async () => {
  if (sharedPglite) {
    const db = sharedPglite
    sharedPglite = null
    sharedPgliteSchemaReady = false
    try {
      await db.close()
    } catch {
      // ignore test cleanup error
    }
  }
})

function buildSpkiFixture() {
  const pair = crypto.generateKeyPairSync('ed25519')
  const publicKeySpki = pair.publicKey
    .export({ format: 'pem', type: 'spki' })
    .toString()
    .trim()
  const digest = crypto
    .createHash('sha256')
    .update(pair.publicKey.export({ format: 'der', type: 'spki' }))
    .digest('hex')
    .slice(0, 16)
  return {
    pair,
    publicKeySpki,
    keyId: `ed25519-spki-${digest}`,
  }
}

function buildValidStagingEnv() {
  const kms = buildSpkiFixture()
  const go = buildSpkiFixture()
  const pgSecret = 'PgExt09TopSecretPass!987'
  return {
    pgSecret,
    kms,
    go,
    env: {
      ATTESTATION_ENVIRONMENT: 'STAGING',
      ATTESTATION_SIGNING_PROVIDER: 'PRODUCTION_KMS_SIGNER',
      ATTESTATION_KMS_PROVIDER: 'AWS_KMS',
      ATTESTATION_AWS_REGION: 'sa-east-1',
      ATTESTATION_KMS_KEY_ID: kms.keyId,
      ATTESTATION_KMS_KEY_VERSION_NAME:
        'arn:aws:kms:sa-east-1:123456789012:key/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      ATTESTATION_PUBLIC_KEY_SPKI: kms.publicKeySpki,
      ATTESTATION_GO_AUTHORITY_ID: 'kioskopos-go-governance-staging-v1',
      ATTESTATION_GO_KEY_ID: go.keyId,
      ATTESTATION_GO_PUBLIC_KEY_SPKI: go.publicKeySpki,
      ATTESTATION_ALLOWED_PROJECT_REF: VALID_PROJECT_REF,
      ATTESTATION_ALLOWED_COMMIT_SHA: VALID_COMMIT_SHA,
      ATTESTATION_ANTI_REPLAY_MODE: 'distributed',
      ATTESTATION_ANTI_REPLAY_PROVIDER: 'POSTGRESQL',
      ATTESTATION_POSTGRES_URL: `postgres://att_user:${pgSecret}@att-pg-dedicated.internal:5432/att_anti_replay?sslmode=verify-full`,
      ATTESTATION_POSTGRES_TABLE: 'attestation_distributed_anti_replay',
      ATTESTATION_POSTGRES_ISOLATION_LEVEL: 'SERIALIZABLE',
      ATTESTATION_CLIENT_AUTH_MODE: 'OIDC_JWT',
      ATTESTATION_OIDC_ISSUER: 'https://auth.internal.kioskopos.invalid',
      ATTESTATION_OIDC_AUDIENCE: 'independent-attestation-authority',
      ATTESTATION_OIDC_JWKS_URI:
        'https://auth.internal.kioskopos.invalid/.well-known/jwks.json',
      ATTESTATION_OIDC_ALLOWED_JWKS_HOSTS: 'auth.internal.kioskopos.invalid',
      ATTESTATION_REQUIRE_HTTPS: 'true',
      ATTESTATION_REAL_INTEGRATION_ENABLED: 'false',
      ATTESTATION_REAL_INTEGRATION_DRY_RUN: 'false',
    } as Record<string, string>,
  }
}

function buildSignedRequest(
  goIssuer: TestOnlyGoAuthorityIssuer,
  nowMs = Date.now(),
  overrides: Record<string, unknown> = {}
) {
  const id = crypto.randomUUID()
  const issuedAt = new Date(nowMs - 5_000).toISOString()
  const expiresAt = new Date(nowMs + 600_000).toISOString()
  const base = {
    schemaVersion: '1.0' as const,
    requestId: `ext09-req-${id}`,
    processId: `ext09-proc-${id}`,
    executionScope: VALID_SCOPE,
    commitSha: VALID_COMMIT_SHA,
    environment: 'HOMOLOGACION' as const,
    projectRef: VALID_PROJECT_REF,
    authorizationId: `ext09-auth-${id}`,
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
    consultadoEn: '2026-11-13T16:00:00.000Z',
    requestedAt: issuedAt,
    collectorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
    ...overrides,
  }
  const digest = computeAttestationRequestDigest(base)
  const fullReq = {
    ...base,
    requestSha256:
      overrides.requestSha256 !== undefined ? String(overrides.requestSha256) : digest,
  }
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
  return {
    ...fullReq,
    goAuthorizationGrant: grant,
  }
}

function encodeJwtBase64Url(input: Buffer | string | Record<string, unknown>): string {
  const buf = Buffer.isBuffer(input)
    ? input
    : typeof input === 'string'
      ? Buffer.from(input, 'utf8')
      : Buffer.from(JSON.stringify(input), 'utf8')
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function signEdDsaJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: crypto.KeyObject
): string {
  const headerB64 = encodeJwtBase64Url(header)
  const payloadB64 = encodeJwtBase64Url(payload)
  const signingInput = `${headerB64}.${payloadB64}`
  const sig = crypto.sign(null, Buffer.from(signingInput, 'utf8'), privateKey)
  return `${signingInput}.${encodeJwtBase64Url(sig)}`
}

async function createPgliteStore(nowFn?: () => number) {
  if (!sharedPglite) {
    sharedPglite = new PGlite()
    sharedPgliteSchemaReady = false
  }
  const db = sharedPglite
  const executor: PostgresQueryExecutor = {
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
  const store = new PostgresDistributedAntiReplayStore({
    queryClient: executor,
    now: nowFn,
  })
  if (!sharedPgliteSchemaReady) {
    await store.ensureSchema()
    sharedPgliteSchemaReady = true
  } else {
    await db.query('TRUNCATE TABLE attestation_distributed_anti_replay')
  }
  return { db, store }
}

describe('EXT-REAL-09 — Auditoría Adversarial Independiente de Seguridad, Compuertas y Aislamiento', () => {
  it('EXT09-GATE-01: bloquea manipulación combinada de env vars, PHASE_6 por env y TEST_SIGNER en preflight', () => {
    const { env } = buildValidStagingEnv()

    const adversarialEnv = {
      ...env,
      ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
      ATTESTATION_DEPLOYMENT_CANDIDATE_OPT_IN: 'true',
      ATTESTATION_OIDC_ALLOW_INSECURE_LOCALHOST: 'true',
      ATTESTATION_INTEGRATION_PHASE: INTEGRATION_PHASES.PHASE_6_DEPLOYMENT_CANDIDATE,
    }
    const preflight = runInfrastructurePreflight(adversarialEnv)
    expect(preflight.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(preflight.productionValidated).toBe(false)
    expect(preflight.productionApproved).toBe(false)
    expect(preflight.readyForControlledTest).toBe(false)
    expect(
      preflight.issues.some((i) => i.code === 'OIDC_INSECURE_OVERRIDE_FORBIDDEN')
    ).toBe(true)

    const phase6WithoutOptIn = validateInfrastructureConfiguration({
      ...env,
      ATTESTATION_INTEGRATION_PHASE: INTEGRATION_PHASES.PHASE_6_DEPLOYMENT_CANDIDATE,
    })
    expect(phase6WithoutOptIn.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(
      phase6WithoutOptIn.issues.some((i) => i.code === 'PHASE_ESCALATION_FORBIDDEN')
    ).toBe(true)

    const badPhaseName = validateInfrastructureConfiguration({
      ...env,
      ATTESTATION_INTEGRATION_PHASE: 'PHASE_99_SKIP_ALL',
    })
    expect(badPhaseName.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(
      badPhaseName.issues.some((i) => i.code === 'INVALID_INTEGRATION_PHASE')
    ).toBe(true)

    const { pair } = buildSpkiFixture()
    const jwk = { ...(pair.publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid: 'k1', use: 'sig', alg: 'EdDSA' }
    const fakeTestWithStaticJwks = runInfrastructurePreflight({
      ATTESTATION_ENVIRONMENT: 'TEST',
      ATTESTATION_SIGNING_PROVIDER: 'TEST_SIGNER',
      ATTESTATION_ANTI_REPLAY_MODE: 'memory',
      ATTESTATION_CLIENT_AUTH_MODE: 'OIDC_JWT',
      ATTESTATION_OIDC_ISSUER: 'https://issuer.pr02.local',
      ATTESTATION_OIDC_AUDIENCE: 'attestation-api',
      ATTESTATION_OIDC_JWKS_JSON: JSON.stringify({ keys: [jwk] }),
      ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
    })
    expect(fakeTestWithStaticJwks.status).not.toBe(
      PREFLIGHT_STATUSES.REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST
    )
    expect(fakeTestWithStaticJwks.status).toBe(
      PREFLIGHT_STATUSES.REAL_INTEGRATION_NOT_CONFIGURED
    )
  })

  it('EXT09-GATE-02: bloquea preflightResult forjado, boolean governanceManualSignOff sin Grant GO y autopromoción de madurez', () => {
    const { env } = buildValidStagingEnv()
    const invalidEnv = {
      ...env,
      ATTESTATION_POSTGRES_URL:
        'postgres://postgres:p@db.acoyfwwmhaeruciyedri.supabase.co:5432/postgres?sslmode=verify-full',
    }
    const spoofedPreflight = {
      status: PREFLIGHT_STATUSES.REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST,
      configurationStatus: PREFLIGHT_STATUSES.CONFIGURATION_VALID,
      fingerprint: { configFingerprintSha256: 'f'.repeat(64) },
    } as unknown as ReturnType<typeof runInfrastructurePreflight>

    expect(() =>
      evaluateIntegrationPhaseGate({
        targetPhase: INTEGRATION_PHASES.PHASE_1_READ_ONLY_CONNECTIVITY,
        completedPhases: [INTEGRATION_PHASES.PHASE_0_CONFIG_VALIDATION],
        env: invalidEnv,
        preflightResult: spoofedPreflight,
      })
    ).toThrow(/PHASE_PRECONDITION_FAILED/)

    const fullOptInEnv = {
      ...env,
      ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
      ATTESTATION_ALLOW_CONTROLLED_MUTATION_TEST: 'true',
      ATTESTATION_ALLOW_CONTROLLED_CONCURRENCY_TEST: 'true',
      ATTESTATION_ALLOW_CONTROLLED_KMS_TEST: 'true',
      ATTESTATION_ALLOW_CONTROLLED_AUTH_TEST: 'true',
      ATTESTATION_DEPLOYMENT_CANDIDATE_OPT_IN: 'true',
    }
    const priorPhases = INTEGRATION_PHASE_ORDER.slice(0, 6)

    expect(() =>
      evaluateIntegrationPhaseGate({
        targetPhase: INTEGRATION_PHASES.PHASE_1_READ_ONLY_CONNECTIVITY,
        completedPhases: [INTEGRATION_PHASES.PHASE_0_CONFIG_VALIDATION],
        env: {
          ...fullOptInEnv,
          ATTESTATION_INTEGRATION_PHASE: INTEGRATION_PHASES.PHASE_6_DEPLOYMENT_CANDIDATE,
        },
      })
    ).toThrow(/PHASE_ESCALATION_FORBIDDEN/)

    expect(() =>
      evaluateIntegrationPhaseGate({
        targetPhase: INTEGRATION_PHASES.PHASE_1_READ_ONLY_CONNECTIVITY,
        completedPhases: ['PHASE_0_CONFIG_VALIDATION', 'PHASE_FAKE_BOGUS' as never],
        env: fullOptInEnv,
      })
    ).toThrow(/INVALID_INTEGRATION_PHASE/)

    // Un simple boolean governanceManualSignOff: true SIN governanceGrant firmado falla cerrado
    expect(() =>
      evaluateIntegrationPhaseGate({
        targetPhase: INTEGRATION_PHASES.PHASE_6_DEPLOYMENT_CANDIDATE,
        completedPhases: priorPhases,
        env: fullOptInEnv,
        governanceManualSignOff: true,
      })
    ).toThrow(/PHASE_GOVERNANCE_CRYPTOGRAPHIC_APPROVAL_REQUIRED/)

    // Incluso con un GoAuthorizationGrant v1.1 firmado y válido, PHASE_6 nunca aprueba producción remota ni P1
    const attFixture = buildSpkiFixture()
    const goIssuer = new TestOnlyGoAuthorityIssuer({
      authorityId: 'ext09-go-gate-v1',
      forbiddenAttestationKeyId: attFixture.keyId,
      forbiddenAttestationPublicKeySpki: attFixture.publicKeySpki,
    })
    const nowMs = Date.now()
    const reqForGate = buildSignedRequest(goIssuer, nowMs)
    const phase6Env = {
      ...fullOptInEnv,
      ATTESTATION_GO_AUTHORITY_ID: goIssuer.authorityId,
      ATTESTATION_GO_KEY_ID: goIssuer.keyId,
      ATTESTATION_GO_PUBLIC_KEY_SPKI: goIssuer.publicKeySpki,
    }
    const gateRes = evaluateIntegrationPhaseGate({
      targetPhase: INTEGRATION_PHASES.PHASE_6_DEPLOYMENT_CANDIDATE,
      completedPhases: priorPhases,
      env: phase6Env,
      governanceManualSignOff: true,
      governanceGrant: reqForGate.goAuthorizationGrant,
      expectedProjectRef: VALID_PROJECT_REF,
      expectedCommitSha: VALID_COMMIT_SHA,
      now: nowMs,
    })
    expect(gateRes.allowed).toBe(true)
    expect(gateRes.productionApproved).toBe(false)
    expect(gateRes.productionValidated).toBe(false)
    expect(gateRes.p1ImportAllowed).toBe(false)
    expect(gateRes.remoteGo).toBe('DENIED')

    // Grant firmado con otro emisor debe rechazarse
    const rogueGoIssuer = new TestOnlyGoAuthorityIssuer({
      authorityId: 'rogue-go-issuer',
    })
    const rogueReq = buildSignedRequest(rogueGoIssuer, nowMs)
    expect(() =>
      evaluateIntegrationPhaseGate({
        targetPhase: INTEGRATION_PHASES.PHASE_6_DEPLOYMENT_CANDIDATE,
        completedPhases: priorPhases,
        env: phase6Env,
        governanceManualSignOff: true,
        governanceGrant: rogueReq.goAuthorizationGrant,
        now: nowMs,
      })
    ).toThrow()

    // evaluateMaturityState jamás retorna PRODUCTION_VALIDATED ni realInfrastructureValidated por booleanos de llamador
    const maturitySpoof = evaluateMaturityState({
      unitTestsPassed: true,
      localRuntimeTested: true,
      multiNodeSimulated: true,
      realConnectivityPassed: true,
      realIntegrationPassed: true,
      externalGovernanceAccredited: true,
    })
    expect(maturitySpoof.state).not.toBe(MATURITY_STATES.PRODUCTION_VALIDATED)
    expect(maturitySpoof.state).toBe(MATURITY_STATES.SIMULATION_TESTED)
    expect(maturitySpoof.realInfrastructureValidated).toBe(false)
    expect(maturitySpoof.productionValidated).toBe(false)
    expect(maturitySpoof.autoPromotionBlocked).toBe(true)
  })

  it('EXT09-DRYRUN-01: aislamiento estricto de DRY_RUN sobre PG, DynamoDB, KMS, OIDC y prohibición de ARCA/Supabase', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { env } = buildValidStagingEnv()
    const dryRunEnv = {
      ...env,
      ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
      ATTESTATION_REAL_INTEGRATION_DRY_RUN: 'true',
    }
    expect(isRealIntegrationDryRun(dryRunEnv)).toBe(true)

    const dryRun = runControlledRealIntegrationDryRun(dryRunEnv)
    expect(dryRun.dryRun).toBe(true)
    expect(dryRun.executedSideEffects).toBe(false)
    expect(dryRun.actionMatrix.ARCA).toBe('FORBIDDEN')
    expect(dryRun.actionMatrix.SUPABASE_POS_MUTATION).toBe('FORBIDDEN')
    expect(dryRun.counters).toEqual({
      networkCallsExecuted: 0,
      signaturesExecuted: 0,
      reservationsCreated: 0,
      mutationsExecuted: 0,
      arcaCallsExecuted: 0,
      supabasePosOperationsExecuted: 0,
    })

    const pgPoolSpy = vi.fn()
    await expect(
      createControlledPostgresStoreFromEnv(dryRunEnv, {
        pgModule: { Pool: pgPoolSpy as never },
      })
    ).rejects.toThrow(/REAL_INTEGRATION_DRY_RUN_ACTIVE/)
    expect(pgPoolSpy).not.toHaveBeenCalled()

    const ddbClientSpy: DynamoDbClientAdapter = {
      transactWriteItems: vi.fn(),
      updateItem: vi.fn(),
      getItem: vi.fn(),
      describeTable: vi.fn(),
    }
    await expect(
      createControlledDynamoDbStoreFromEnv(
        {
          ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
          ATTESTATION_REAL_INTEGRATION_DRY_RUN: 'true',
          ATTESTATION_DYNAMODB_TABLE: 'kioskopos_att_dryrun',
          ATTESTATION_AWS_REGION: 'sa-east-1',
        },
        { client: ddbClientSpy }
      )
    ).rejects.toThrow(/REAL_INTEGRATION_DRY_RUN_ACTIVE/)
    expect(ddbClientSpy.transactWriteItems).not.toHaveBeenCalled()
    expect(ddbClientSpy.describeTable).not.toHaveBeenCalled()

    const kmsClientSpy = {
      sign: vi.fn(),
      getPublicKey: vi.fn(),
    }
    await expect(
      createControlledKmsProviderFromEnv(dryRunEnv, { kmsClient: kmsClientSpy })
    ).rejects.toThrow(/REAL_INTEGRATION_DRY_RUN_ACTIVE/)
    expect(kmsClientSpy.sign).not.toHaveBeenCalled()
    expect(kmsClientSpy.getPublicKey).not.toHaveBeenCalled()

    // Aun cableando un runtime local con deps en memoria mientras ATTESTATION_REAL_INTEGRATION_DRY_RUN=true,
    // OIDC NO puede disparar fetch de red ni reportar oidcRealConfigured=true
    const kmsSigner = new AwsKmsSigningProvider({
      authorityId: 'ext09-dryrun-att',
      keyId: env.ATTESTATION_KMS_KEY_ID,
      publicKeySpki: env.ATTESTATION_PUBLIC_KEY_SPKI,
      kmsKeyArn: env.ATTESTATION_KMS_KEY_VERSION_NAME,
      region: 'sa-east-1',
      awsKmsClient: { sign: kmsClientSpy.sign },
    })
    const { store: pgStore } = await createPgliteStore()
    const runtimeBundle = createConfiguredAuthorityFromEnv(
      {
        ...dryRunEnv,
        ATTESTATION_OIDC_JWKS_URI: 'https://auth.internal.kioskopos.invalid/.well-known/jwks.json',
      },
      {
        awsKmsClient: {
          sign: async ({ Message }) => kmsSigner.sign(Message),
        },
        distributedStore: pgStore,
        oidcAllowNetworkFetch: true,
      }
    )
    const health = runtimeBundle.service.handleHealth()
    expect(health.oidcRealConfigured).toBe(false)
    const readiness = await runtimeBundle.service.handleReadiness()
    expect(readiness.ready).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('EXT09-SSRF-01: bloquea SSRF IPv4 privado/metadata/CGNAT, IPv6 ULA/link-local/IPv4-mapeado, redirects HTTP y HTTP issuer mayúsculo', async () => {
    const maliciousUris = [
      'http://remote-oidc.example.com/jwks.json',
      'http://169.254.169.254/latest/meta-data',
      'https://169.254.169.254/jwks.json',
      'https://169.254.170.2/v2/credentials',
      'https://metadata/jwks.json',
      'https://metadata.google.internal/computeMetadata/v1',
      'https://metadata.google.internal./computeMetadata/v1',
      'https://10.0.0.1/jwks.json',
      'https://172.16.0.5/jwks.json',
      'https://192.168.1.1/jwks.json',
      'https://100.64.0.1/jwks.json',
      'https://0.0.0.0/jwks.json',
      'https://127.0.0.1/jwks.json',
      'https://127.0.0.2/jwks.json',
      'https://evil.localhost/jwks.json',
      'https://[::]/jwks.json',
      'https://[::1]/jwks.json',
      'https://[fe80::1]/jwks.json',
      'https://[fc00::1]/jwks.json',
      'https://[fd00:ec2::254]/jwks.json',
      'https://[::ffff:169.254.169.254]/jwks.json',
      'https://[::ffff:127.0.0.1]/jwks.json',
      'https://[::ffff:10.0.0.1]/jwks.json',
      'https://[64:ff9b::169.254.169.254]/jwks.json',
      'https://user:secret@oidc.example.com/jwks.json',
    ]

    for (const uri of maliciousUris) {
      expect(() =>
        createOidcJwtClientAuthVerifier({
          issuer: 'https://issuer.pr02.local',
          audience: 'attestation-authority-api',
          jwksUri: uri,
        })
      ).toThrow(/OIDC_/)

      expect(() =>
        assertSafeEndpointUrl(uri, 'ATTESTATION_KMS_ENDPOINT')
      ).toThrow(/REAL_INTEGRATION_/)
    }

    // Incluso con allowInsecureLocalhostHttp: true no se permiten IPs privadas, 127.0.0.2 ni *.localhost
    for (const bypassCandidate of [
      'http://169.254.169.254/jwks.json',
      'http://10.0.0.1/jwks.json',
      'https://127.0.0.2/jwks.json',
      'https://sub.localhost/jwks.json',
      'https://[::ffff:169.254.169.254]/jwks.json',
    ]) {
      expect(() =>
        createOidcJwtClientAuthVerifier({
          issuer: 'https://issuer.pr02.local',
          audience: 'attestation-authority-api',
          jwksUri: bypassCandidate,
          allowInsecureLocalhostHttp: true,
        })
      ).toThrow(/OIDC_/)
    }

    expect(classifyNetworkHost('[::ffff:169.254.169.254]').reason).toBe(
      'IPV6_EMBEDDED_LINK_LOCAL_METADATA_IPV4'
    )

    // Allowlist de host JWKS contra DNS rebinding
    expect(() =>
      createOidcJwtClientAuthVerifier({
        issuer: 'https://issuer.pr02.local',
        audience: 'attestation-authority-api',
        jwksUri: 'https://unexpected-idp.example.invalid/jwks.json',
        allowedJwksHosts: ['auth.internal.kioskopos.invalid'],
      })
    ).toThrow(/allowedJwksHosts/)

    // Uppercase HTTP:// en ATTESTATION_OIDC_ISSUER es rechazado en preflight
    const { env } = buildValidStagingEnv()
    const upperHttpIssuer = validateInfrastructureConfiguration({
      ...env,
      ATTESTATION_OIDC_ISSUER: 'HTTP://auth.internal.kioskopos.invalid',
    })
    expect(upperHttpIssuer.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(
      upperHttpIssuer.issues.some((i) => i.code === 'OIDC_ISSUER_TLS_REQUIRED')
    ).toBe(true)

    // Redirección HTTP 302 real en servidor JWKS local debe fallar cerrado sin alcanzar el destino
    let targetHits = 0
    const targetServer = http.createServer((_req, res) => {
      targetHits += 1
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ keys: [] }))
    })
    httpServersToClose.push(targetServer)
    await new Promise<void>((resolve) => targetServer.listen(0, '127.0.0.1', resolve))
    const targetPort = (targetServer.address() as { port: number }).port

    const redirectServer = http.createServer((_req, res) => {
      res.writeHead(302, {
        Location: `http://127.0.0.1:${targetPort}/secret-meta`,
      })
      res.end()
    })
    httpServersToClose.push(redirectServer)
    await new Promise<void>((resolve) => redirectServer.listen(0, '127.0.0.1', resolve))
    const redirectPort = (redirectServer.address() as { port: number }).port

    const redirectVerifier = createOidcJwtClientAuthVerifier({
      issuer: 'https://issuer.pr02.local',
      audience: 'attestation-authority-api',
      jwksUri: `http://127.0.0.1:${redirectPort}/jwks.json`,
      allowInsecureLocalhostHttp: true,
      allowNetworkFetch: true,
    })
    await expect(redirectVerifier.refreshJwks()).rejects.toThrow()
    expect(targetHits).toBe(0)
  })

  it('EXT09-OIDC-JWT-01: rechaza headers crit/x5c/jwk/jku/x5u, alg=none, HS256, kty=oct y claims inválidos sin reservar ni firmar', async () => {
    const edKeys = crypto.generateKeyPairSync('ed25519')
    const exportedJwk = edKeys.publicKey.export({ format: 'jwk' }) as Record<string, unknown>
    const jwk: OidcJwkKey = {
      kty: String(exportedJwk.kty),
      crv: String(exportedJwk.crv),
      x: String(exportedJwk.x),
      kid: 'ext09-ed-1',
      use: 'sig',
      alg: 'EdDSA',
    }
    const fixedNow = Date.parse('2026-11-13T18:00:00.000Z')
    const nowSec = Math.floor(fixedNow / 1000)

    const oidcVerifier = createOidcJwtClientAuthVerifier({
      issuer: 'https://issuer.pr02.local',
      audience: 'attestation-authority-api',
      jwks: { keys: [jwk] },
      allowedAlgorithms: ['EdDSA'],
      allowedClientIds: ['svc-collector-pr02'],
      now: () => fixedNow,
    })

    const baseSigner = new TestSigningProvider({ authorityId: 'ext09-oidc-att' })
    const goIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'ext09-oidc-go' })
    const kmsSignMock = vi.fn(async ({ Message }) => ({
      Signature: Buffer.from(baseSigner.sign(Message), 'hex'),
      SigningAlgorithm: 'ED25519_SHA_512',
      KeyId: 'arn:aws:kms:sa-east-1:111122223333:key/ext09-oidc',
    }))
    const kmsProvider = new AwsKmsSigningProvider({
      authorityId: baseSigner.authorityId,
      keyId: baseSigner.keyId ?? undefined,
      publicKeySpki: baseSigner.publicKeySpki ?? undefined,
      kmsKeyArn: 'arn:aws:kms:sa-east-1:111122223333:key/ext09-oidc',
      region: 'sa-east-1',
      awsKmsClient: { sign: kmsSignMock },
    })

    const { store } = await createPgliteStore(() => fixedNow)
    const reserveSpy = vi.spyOn(store, 'reserveOnce')
    const guard = new ServiceAntiReplayGuard({
      storageType: 'distributed',
      distributedStore: store,
      now: () => fixedNow,
    })
    const service = new IndependentAttestationAuthorityService({
      signingProvider: kmsProvider,
      antiReplayGuard: guard,
      serviceEnvironment: SERVICE_ENVIRONMENTS.PRODUCTION,
      protectedMode: true,
      requireSignedGoGrant: true,
      authorityId: baseSigner.authorityId,
      trustedGoAuthorityId: goIssuer.authorityId,
      trustedGoKeyId: goIssuer.keyId,
      trustedGoPublicKeySpki: goIssuer.publicKeySpki,
      expectedProjectRef: VALID_PROJECT_REF,
      expectedCommitSha: VALID_COMMIT_SHA,
      attestationResponseVersion: '1.1',
      clientAuthVerifier: oidcVerifier,
      now: () => fixedNow,
    })

    const baseClaims = {
      iss: 'https://issuer.pr02.local',
      aud: 'attestation-authority-api',
      sub: 'svc-collector-pr02',
      client_id: 'svc-collector-pr02',
      scope: VALID_SCOPE,
      jti: 'jti-ext09',
      iat: nowSec - 10,
      nbf: nowSec - 10,
      exp: nowSec + 300,
    }

    const attackTokens = [
      signEdDsaJwt({ alg: 'EdDSA', typ: 'JWT', kid: 'ext09-ed-1', crit: ['b64'], b64: true }, baseClaims, edKeys.privateKey),
      signEdDsaJwt({ alg: 'EdDSA', typ: 'JWT', kid: 'ext09-ed-1', x5c: ['AAAA'] }, baseClaims, edKeys.privateKey),
      signEdDsaJwt({ alg: 'EdDSA', typ: 'JWT', kid: 'ext09-ed-1', jwk }, baseClaims, edKeys.privateKey),
      signEdDsaJwt({ alg: 'EdDSA', typ: 'JWT', kid: 'ext09-ed-1', jku: 'https://evil.invalid/jwks.json' }, baseClaims, edKeys.privateKey),
      signEdDsaJwt({ alg: 'EdDSA', typ: 'JWT', kid: 'ext09-ed-1', x5u: 'https://evil.invalid/cert.pem' }, baseClaims, edKeys.privateKey),
      `${encodeJwtBase64Url({ alg: 'none', typ: 'JWT' })}.${encodeJwtBase64Url(baseClaims)}.`,
      `${encodeJwtBase64Url({ alg: 'HS256', typ: 'JWT' })}.${encodeJwtBase64Url(baseClaims)}.sig`,
      signEdDsaJwt({ alg: 'EdDSA', typ: 'JWT', kid: 'ext09-ed-1' }, { ...baseClaims, iss: 'https://rogue.invalid' }, edKeys.privateKey),
      signEdDsaJwt({ alg: 'EdDSA', typ: 'JWT', kid: 'ext09-ed-1' }, { ...baseClaims, aud: 'other-api' }, edKeys.privateKey),
      signEdDsaJwt({ alg: 'EdDSA', typ: 'JWT', kid: 'ext09-ed-1' }, { ...baseClaims, exp: nowSec - 120 }, edKeys.privateKey),
      signEdDsaJwt({ alg: 'EdDSA', typ: 'JWT', kid: 'ext09-ed-1' }, { ...baseClaims, nbf: nowSec + 120 }, edKeys.privateKey),
      signEdDsaJwt({ alg: 'EdDSA', typ: 'JWT', kid: 'ext09-ed-1' }, { ...baseClaims, scope: 'read:only' }, edKeys.privateKey),
      signEdDsaJwt({ alg: 'EdDSA', typ: 'JWT', kid: 'ext09-ed-1' }, { ...baseClaims, client_id: 'unauthorized-client', sub: 'unauthorized-client' }, edKeys.privateKey),
    ]

    for (const badToken of attackTokens) {
      const req = buildSignedRequest(goIssuer, fixedNow)
      await expect(
        service.handleRequest(req, { authorization: `Bearer ${badToken}` })
      ).rejects.toThrow()
    }

    const octVerifier = createOidcJwtClientAuthVerifier({
      issuer: 'https://issuer.pr02.local',
      audience: 'attestation-authority-api',
      jwks: {
        keys: [
          {
            kty: 'oct',
            k: 'c2VjcmV0',
            kid: 'sym-1',
            alg: 'HS256',
          } as unknown as OidcJwkKey,
        ],
      },
      allowedAlgorithms: ['EdDSA'],
      now: () => fixedNow,
    })
    expect(await octVerifier.isHealthy()).toBe(false)
    await expect(
      octVerifier.verify(
        {
          authorization: `Bearer ${signEdDsaJwt(
            { alg: 'EdDSA', typ: 'JWT', kid: 'sym-1' },
            baseClaims,
            edKeys.privateKey
          )}`,
        },
        {
          serviceEnvironment: SERVICE_ENVIRONMENTS.PRODUCTION,
          protectedMode: true,
          requestedScope: VALID_SCOPE,
        }
      )
    ).rejects.toThrow(/OIDC_/)

    expect(reserveSpy).not.toHaveBeenCalled()
    expect(kmsSignMock).not.toHaveBeenCalled()
  })

  it('EXT09-MTLS-01: bloquea SAN substring bypass (unidad y HTTPS real), wildcards, requestCert=false y headers forjados sin TLS peer', async () => {
    const fixedNow = Date.now()
    const derLen = (len: number): Buffer => {
      if (len < 0x80) return Buffer.from([len])
      const bytes: number[] = []
      let tmp = len
      while (tmp > 0) {
        bytes.unshift(tmp & 0xff)
        tmp >>= 8
      }
      return Buffer.from([0x80 | bytes.length, ...bytes])
    }
    const derTag = (tag: number, content: Buffer): Buffer =>
      Buffer.concat([Buffer.from([tag]), derLen(content.length), content])
    const derSeq = (...items: Buffer[]): Buffer => derTag(0x30, Buffer.concat(items))
    const derSet = (...items: Buffer[]): Buffer => derTag(0x31, Buffer.concat(items))
    const derOid = (oidStr: string): Buffer => {
      const p = oidStr.split('.').map(Number)
      const out = [p[0] * 40 + p[1]]
      for (let i = 2; i < p.length; i++) {
        let v = p[i]
        const sub = [v & 0x7f]
        v >>= 7
        while (v > 0) {
          sub.unshift((v & 0x7f) | 0x80)
          v >>= 7
        }
        out.push(...sub)
      }
      return derTag(0x06, Buffer.from(out))
    }
    const derInt = (n: number): Buffer => derTag(0x02, Buffer.from([n]))
    const derGenTime = (d: Date): Buffer => {
      const pad = (x: number) => String(x).padStart(2, '0')
      return derTag(
        0x18,
        Buffer.from(
          `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`,
          'ascii'
        )
      )
    }
    const derExt = (oid: string, crit: boolean, val: Buffer): Buffer => {
      const parts = [derOid(oid)]
      if (crit) parts.push(derTag(0x01, Buffer.from([0xff])))
      parts.push(derTag(0x04, val))
      return derSeq(...parts)
    }
    const mkCert = (opts: {
      cn: string
      issuerCn: string
      pub: crypto.KeyObject
      priv: crypto.KeyObject
      serial: number
      isCa?: boolean
      sanDns?: string[]
      sanIps?: string[]
    }): string => {
      const sigAlg = derSeq(derOid('1.2.840.10045.4.3.2'))
      const exts: Buffer[] = [
        opts.isCa
          ? derExt('2.5.29.19', true, derSeq(derTag(0x01, Buffer.from([0xff]))))
          : derExt('2.5.29.19', true, derSeq()),
      ]
      if (opts.isCa) {
        exts.push(derExt('2.5.29.15', true, derTag(0x03, Buffer.from([0x00, 0x06]))))
      }
      if ((opts.sanDns && opts.sanDns.length > 0) || (opts.sanIps && opts.sanIps.length > 0)) {
        const sanItems: Buffer[] = []
        for (const d of opts.sanDns ?? []) sanItems.push(derTag(0x82, Buffer.from(d, 'ascii')))
        for (const ip of opts.sanIps ?? []) sanItems.push(derTag(0x87, Buffer.from(ip.split('.').map(Number))))
        exts.push(derExt('2.5.29.17', false, derSeq(...sanItems)))
      }
      const mkName = (cn: string) =>
        derSeq(derSet(derSeq(derOid('2.5.4.3'), derTag(0x0c, Buffer.from(cn, 'utf8')))))
      const tbs = derSeq(
        derTag(0xa0, derInt(2)),
        derInt(opts.serial),
        sigAlg,
        mkName(opts.issuerCn),
        derSeq(
          derGenTime(new Date(fixedNow - 3_600_000)),
          derGenTime(new Date(fixedNow + 86_400_000))
        ),
        mkName(opts.cn),
        opts.pub.export({ type: 'spki', format: 'der' }) as Buffer,
        derTag(0xa3, derSeq(...exts))
      )
      const sig = crypto.sign('sha256', tbs, opts.priv)
      const der = derSeq(tbs, sigAlg, derTag(0x03, Buffer.concat([Buffer.from([0x00]), sig])))
      const lines = der.toString('base64').match(/.{1,64}/g) ?? []
      return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`
    }

    const caKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const caPem = mkCert({
      cn: 'ext09-test-ca',
      issuerCn: 'ext09-test-ca',
      pub: caKeys.publicKey,
      priv: caKeys.privateKey,
      serial: 1,
      isCa: true,
    })
    const serverKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const serverCertPem = mkCert({
      cn: 'localhost',
      issuerCn: 'ext09-test-ca',
      pub: serverKeys.publicKey,
      priv: caKeys.privateKey,
      serial: 2,
      sanDns: ['localhost'],
      sanIps: ['127.0.0.1'],
    })
    const serverKeyPem = serverKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

    const evilSubdomainClientKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const evilSubdomainClientCert = mkCert({
      cn: 'collector-client',
      issuerCn: 'ext09-test-ca',
      pub: evilSubdomainClientKeys.publicKey,
      priv: caKeys.privateKey,
      serial: 3,
      sanDns: ['collector.pr02.internal.evil.com'],
    })
    const evilSubdomainClientKey = evilSubdomainClientKeys.privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }) as string

    // 1. SAN substring bypass bloqueado: DNS:collector.pr02.internal NO puede aceptar DNS:collector.pr02.internal.evil.com
    const mtlsVerifier = createMtlsClientAuthVerifier({
      trustedCaPem: caPem,
      trustedClients: [
        {
          clientId: 'pr02-collector',
          allowedScopes: [VALID_SCOPE],
          subjectCN: 'collector-client',
          sanDnsNames: ['collector.pr02.internal'],
          sanUris: ['spiffe://kioskopos/pr02/collector'],
        },
      ],
      now: () => fixedNow,
    })

    const baseCtx = {
      serviceEnvironment: 'PRODUCTION',
      protectedMode: true,
      requestedScope: VALID_SCOPE,
      now: fixedNow,
    }

    // Headers suplantados sin TLS verificado
    await expect(
      mtlsVerifier.verify(
        {
          'x-mtls-verified': 'true',
          'x-client-cert-cn': 'collector-client',
          'x-forwarded-client-cert': 'By=spiffe://kioskopos/pr02/collector',
        },
        { ...baseCtx, transportSecurity: { tlsEncrypted: false } }
      )
    ).rejects.toThrow(/CLIENT_AUTH_MTLS_REQUIRED/)

    // Substring attacks en subjectaltname
    for (const forgedSan of [
      'DNS:collector.pr02.internal.evil.com, URI:spiffe://kioskopos/pr02/collector',
      'DNS:evil-collector.pr02.internal, URI:spiffe://kioskopos/pr02/collector',
      'URI:https://evil.example/?q=DNS:collector.pr02.internal',
      'DNS:collector.pr02.internal DNS:other.evil',
      'DNS:collector.pr02.internal, URI:spiffe://kioskopos/pr02/collector/evil',
    ]) {
      await expect(
        mtlsVerifier.verify(
          {},
          {
            ...baseCtx,
            transportSecurity: {
              tlsEncrypted: true,
              tlsAuthorized: true,
              peerCertificate: {
                fingerprint256: 'AA'.repeat(32),
                valid_from: new Date(fixedNow - 60_000).toISOString(),
                valid_to: new Date(fixedNow + 60_000).toISOString(),
                subject: { CN: 'collector-client' },
                subjectaltname: forgedSan,
              },
            },
          }
        )
      ).rejects.toThrow(/CLIENT_AUTH_MTLS_CLIENT_NOT_ALLOWED/)
    }

    // Match exacto funciona correctamente y valida paridad de esquema subjectCN/sanDnsNames/sanUris
    const okAuth = await mtlsVerifier.verify(
      {},
      {
        ...baseCtx,
        transportSecurity: {
          tlsEncrypted: true,
          tlsAuthorized: true,
          peerCertificate: {
            fingerprint256: 'AA'.repeat(32),
            valid_from: new Date(fixedNow - 60_000).toISOString(),
            valid_to: new Date(fixedNow + 60_000).toISOString(),
            subject: { CN: 'collector-client' },
            subjectaltname:
              'DNS:other.internal, DNS:collector.pr02.internal, URI:spiffe://kioskopos/pr02/collector',
          },
        },
      }
    )
    expect(typeof okAuth).toBe('object')
    if (typeof okAuth !== 'object' || !okAuth) {
      throw new Error('Expected ClientAuthVerificationResult')
    }
    expect(okAuth.authenticated).toBe(true)
    expect(okAuth.clientId).toBe('pr02-collector')

    // Wildcards o comas en SAN config rechazados
    expect(() =>
      createMtlsClientAuthVerifier({
        trustedCaPem: caPem,
        trustedClients: [
          {
            clientId: 'wildcard-bad',
            allowedScopes: [VALID_SCOPE],
            sanDnsNames: ['*.pr02.internal'],
          },
        ],
      })
    ).toThrow(/CLIENT_AUTH_MTLS_CONFIG_INVALID/)

    // server.mjs rechaza requestCert: false en modo MTLS
    const { env } = buildValidStagingEnv()
    const { store: pgStore } = await createPgliteStore(() => fixedNow)
    expect(() =>
      createConfiguredAuthorityFromEnv(
        {
          ...env,
          ATTESTATION_CLIENT_AUTH_MODE: 'MTLS',
          ATTESTATION_MTLS_TRUSTED_CA_PEM: caPem,
          ATTESTATION_MTLS_TRUSTED_CLIENTS_JSON: JSON.stringify([
            {
              clientId: 'pr02-collector',
              allowedScopes: [VALID_SCOPE],
              sanDnsNames: ['collector.pr02.internal'],
            },
          ]),
        },
        {
          distributedStore: pgStore,
          awsKmsClient: { sign: vi.fn() },
          tlsOptions: { key: 'k', cert: 'c', requestCert: false },
        }
      )
    ).toThrow(/CLIENT_AUTH_MTLS_CONFIG_INVALID/)

    // Validación HTTPS mutuo real: certificado confiable por CA con SAN DNS:collector.pr02.internal.evil.com es rechazado (401)
    const httpsBaseSigner = new TestSigningProvider({ authorityId: 'ext09-mtls-https-att' })
    const httpsGoIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'ext09-mtls-https-go' })
    const httpsBundle = createConfiguredAuthorityFromEnv(
      {
        ...env,
        ATTESTATION_AUTHORITY_ID: httpsBaseSigner.authorityId,
        ATTESTATION_KMS_KEY_ID: httpsBaseSigner.keyId ?? '',
        ATTESTATION_PUBLIC_KEY_SPKI: httpsBaseSigner.publicKeySpki ?? '',
        ATTESTATION_GO_AUTHORITY_ID: httpsGoIssuer.authorityId,
        ATTESTATION_GO_KEY_ID: httpsGoIssuer.keyId,
        ATTESTATION_GO_PUBLIC_KEY_SPKI: httpsGoIssuer.publicKeySpki,
        ATTESTATION_CLIENT_AUTH_MODE: 'MTLS',
        ATTESTATION_MTLS_TRUSTED_CA_PEM: caPem,
        ATTESTATION_MTLS_TRUSTED_CLIENTS_JSON: JSON.stringify([
          {
            clientId: 'pr02-collector',
            allowedScopes: [VALID_SCOPE],
            subjectCN: 'collector-client',
            sanDnsNames: ['collector.pr02.internal'],
          },
        ]),
      },
      {
        distributedStore: pgStore,
        awsKmsClient: {
          async sign({ KeyId, Message }) {
            return {
              Signature: Buffer.from(httpsBaseSigner.sign(Message), 'hex'),
              SigningAlgorithm: 'ED25519_SHA_512',
              KeyId,
            }
          },
        },
        tlsOptions: {
          key: serverKeyPem,
          cert: serverCertPem,
          rejectUnauthorized: false,
        },
        now: () => fixedNow,
      }
    )
    serviceServersToClose.push(httpsBundle.server)
    const { url } = await httpsBundle.server.start(0)
    const parsedHttps = new URL(url)
    const signedPayload = JSON.stringify(buildSignedRequest(httpsGoIssuer, fixedNow))
    const sanAttackRes = await new Promise<{ statusCode: number; body: string }>(
      (resolve, reject) => {
        const req = https.request(
          {
            hostname: '127.0.0.1',
            port: Number(parsedHttps.port),
            path: '/attestations',
            method: 'POST',
            agent: false,
            ca: caPem,
            cert: evilSubdomainClientCert,
            key: evilSubdomainClientKey,
            headers: {
              Connection: 'close',
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(signedPayload),
            },
          },
          (res) => {
            const chunks: Buffer[] = []
            res.on('data', (c) => chunks.push(c))
            res.on('end', () => {
              res.socket?.destroy()
              resolve({
                statusCode: res.statusCode ?? 0,
                body: Buffer.concat(chunks).toString('utf8'),
              })
            })
          }
        )
        req.on('error', reject)
        req.write(signedPayload)
        req.end()
      }
    )
    expect(sanAttackRes.statusCode).toBe(403)
    expect(JSON.parse(sanAttackRes.body).error.code).toBe(
      'CLIENT_AUTH_MTLS_CLIENT_NOT_ALLOWED'
    )
  })

  it('EXT09-PG-LIFECYCLE-01: concurrencia PGlite 50x = max 1 firma, expiración irreversible, fallo en firma/commit y fallo PG pre-firma', async () => {
    let clockMs = Date.parse('2026-11-13T18:00:00.000Z')
    const baseSigner = new TestSigningProvider({ authorityId: 'ext09-pg-att' })
    const goIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'ext09-pg-go' })

    // 1. Concurrencia 50x sobre PGlite: exactamente 1 firma y 49 rechazos
    const { store: concStore } = await createPgliteStore(() => clockMs)
    let kmsCalls = 0
    const concSigner = new GcpKmsSigningProvider({
      authorityId: baseSigner.authorityId,
      keyId: baseSigner.keyId ?? undefined,
      publicKeySpki: baseSigner.publicKeySpki ?? undefined,
      keyVersionName: 'projects/p/locations/global/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',
      gcpKmsClient: {
        async asymmetricSign({ data }) {
          kmsCalls += 1
          return { signature: Buffer.from(baseSigner.sign(data), 'hex') }
        },
      },
    })
    const concService = new IndependentAttestationAuthorityService({
      signingProvider: concSigner,
      antiReplayGuard: new ServiceAntiReplayGuard({
        storageType: 'distributed',
        leaseTtlMs: 30_000,
        distributedStore: concStore,
        now: () => clockMs,
      }),
      serviceEnvironment: SERVICE_ENVIRONMENTS.PRODUCTION,
      protectedMode: true,
      requireSignedGoGrant: true,
      authorityId: baseSigner.authorityId,
      trustedGoAuthorityId: goIssuer.authorityId,
      trustedGoKeyId: goIssuer.keyId,
      trustedGoPublicKeySpki: goIssuer.publicKeySpki,
      expectedProjectRef: VALID_PROJECT_REF,
      expectedCommitSha: VALID_COMMIT_SHA,
      attestationResponseVersion: '1.1',
      clientAuthVerifier: async () => ({
        authenticated: true,
        clientId: 'pr02-collector',
        allowedScopes: [VALID_SCOPE],
      }),
      now: () => clockMs,
    })

    const dupReq = buildSignedRequest(goIssuer, clockMs)
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () =>
        concService.handleRequest(dupReq, { authorization: 'Bearer ok' })
      )
    )
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(49)
    expect(kmsCalls).toBe(1)

    // 2. Expiración de lease -> EXPIRED terminal no reciclable
    const expStore = concStore
    const rsv = await expStore.reserveOnce({
      requestId: 'ext09-exp-req-1',
      authorizationId: 'ext09-exp-auth-1',
      attestationId: 'ext09-exp-att-1',
      requestSha256: '1'.repeat(64),
      ownerNodeId: 'node-1',
      leaseTtlMs: 1000,
      now: clockMs,
    })
    clockMs += 5_000
    await expect(
      expStore.markSigningAttemptStarted({
        requestId: rsv.requestId,
        ownerNodeId: 'node-1',
        reservationToken: rsv.reservationToken,
        now: clockMs,
      })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED/)
    await expect(
      expStore.commitReservation({
        requestId: rsv.requestId,
        attestationId: rsv.attestationId,
        ownerNodeId: 'node-1',
        reservationToken: rsv.reservationToken,
        now: clockMs,
      })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED/)
    await expect(
      expStore.reserveOnce({
        requestId: 'ext09-exp-req-2',
        authorizationId: 'ext09-exp-auth-1',
        attestationId: 'ext09-exp-att-2',
        requestSha256: '2'.repeat(64),
        ownerNodeId: 'node-2',
        now: clockMs,
      })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_GO_AUTHORIZATION_DUPLICATED/)

    // 3. Fallo en firma KMS tras reserva -> terminal FAILED; reintento con mismo u otro requestId sobre mismo grant NO firma 2 veces
    const crashStore = concStore
    let failFirstSign = true
    let crashSignAttempts = 0
    const crashSigner = new AwsKmsSigningProvider({
      authorityId: baseSigner.authorityId,
      keyId: baseSigner.keyId ?? undefined,
      publicKeySpki: baseSigner.publicKeySpki ?? undefined,
      kmsKeyArn: 'arn:aws:kms:sa-east-1:111122223333:key/ext09-crash',
      region: 'sa-east-1',
      awsKmsClient: {
        async sign({ KeyId, Message }) {
          crashSignAttempts += 1
          if (failFirstSign) {
            failFirstSign = false
            throw new Error('socket hang up')
          }
          return {
            Signature: Buffer.from(baseSigner.sign(Message), 'hex'),
            SigningAlgorithm: 'ED25519_SHA_512',
            KeyId,
          }
        },
      },
    })
    const crashService = new IndependentAttestationAuthorityService({
      signingProvider: crashSigner,
      antiReplayGuard: new ServiceAntiReplayGuard({
        storageType: 'distributed',
        distributedStore: crashStore,
        now: () => clockMs,
      }),
      serviceEnvironment: SERVICE_ENVIRONMENTS.PRODUCTION,
      protectedMode: true,
      requireSignedGoGrant: true,
      authorityId: baseSigner.authorityId,
      trustedGoAuthorityId: goIssuer.authorityId,
      trustedGoKeyId: goIssuer.keyId,
      trustedGoPublicKeySpki: goIssuer.publicKeySpki,
      expectedProjectRef: VALID_PROJECT_REF,
      expectedCommitSha: VALID_COMMIT_SHA,
      attestationResponseVersion: '1.1',
      clientAuthVerifier: async () => ({
        authenticated: true,
        clientId: 'pr02-collector',
        allowedScopes: [VALID_SCOPE],
      }),
      now: () => clockMs,
    })

    const crashReq = buildSignedRequest(goIssuer, clockMs)
    await expect(crashService.handleRequest(crashReq)).rejects.toThrow(
      /PRODUCTION_KMS_UNAVAILABLE/
    )
    expect(crashSignAttempts).toBe(1)
    const persistedCrash = await crashStore.getReservation(crashReq.requestId)
    expect(persistedCrash?.state).toBe('FAILED')
    await expect(crashService.handleRequest(crashReq)).rejects.toThrow()
    expect(crashSignAttempts).toBe(1)

    // 3b. Reintento ambiguo tras fallo en commit posterior a firma -> máximo 1 firma real (reintento falla cerrado)
    const commitFailStore = concStore
    let commitFailSignCalls = 0
    const origCommit = commitFailStore.commitReservation.bind(commitFailStore)
    let failNextCommit = true
    vi.spyOn(commitFailStore, 'commitReservation').mockImplementation(async (args) => {
      if (failNextCommit) {
        failNextCommit = false
        throw new Error('SERVICE_ANTI_REPLAY_UNAVAILABLE: timeout ambiguo tras COMMIT')
      }
      return origCommit(args)
    })
    const commitFailService = new IndependentAttestationAuthorityService({
      signingProvider: new AwsKmsSigningProvider({
        authorityId: baseSigner.authorityId,
        keyId: baseSigner.keyId ?? undefined,
        publicKeySpki: baseSigner.publicKeySpki ?? undefined,
        kmsKeyArn: 'arn:aws:kms:sa-east-1:111122223333:key/ext09-commit-fail',
        region: 'sa-east-1',
        awsKmsClient: {
          async sign({ KeyId, Message }) {
            commitFailSignCalls += 1
            return {
              Signature: Buffer.from(baseSigner.sign(Message), 'hex'),
              SigningAlgorithm: 'ED25519_SHA_512',
              KeyId,
            }
          },
        },
      }),
      antiReplayGuard: new ServiceAntiReplayGuard({
        storageType: 'distributed',
        distributedStore: commitFailStore,
        now: () => clockMs,
      }),
      serviceEnvironment: SERVICE_ENVIRONMENTS.PRODUCTION,
      protectedMode: true,
      requireSignedGoGrant: true,
      authorityId: baseSigner.authorityId,
      trustedGoAuthorityId: goIssuer.authorityId,
      trustedGoKeyId: goIssuer.keyId,
      trustedGoPublicKeySpki: goIssuer.publicKeySpki,
      expectedProjectRef: VALID_PROJECT_REF,
      expectedCommitSha: VALID_COMMIT_SHA,
      attestationResponseVersion: '1.1',
      clientAuthVerifier: async () => ({
        authenticated: true,
        clientId: 'pr02-collector',
        allowedScopes: [VALID_SCOPE],
      }),
      now: () => clockMs,
    })
    const ambigReq = buildSignedRequest(goIssuer, clockMs)
    await expect(commitFailService.handleRequest(ambigReq)).rejects.toThrow()
    expect(commitFailSignCalls).toBe(1)
    await expect(commitFailService.handleRequest(ambigReq)).rejects.toThrow()
    expect(commitFailSignCalls).toBe(1)

    // 4. Error de persistencia previo a firma -> 0 llamadas KMS
    let downKmsCalls = 0
    const downStore = new PostgresDistributedAntiReplayStore({
      queryClient: {
        async query() {
          const err = new Error('connection refused') as Error & { code?: string }
          err.code = 'ECONNREFUSED'
          throw err
        },
      },
    })
    const downService = new IndependentAttestationAuthorityService({
      signingProvider: new AwsKmsSigningProvider({
        authorityId: baseSigner.authorityId,
        keyId: baseSigner.keyId ?? undefined,
        publicKeySpki: baseSigner.publicKeySpki ?? undefined,
        kmsKeyArn: 'arn:aws:kms:sa-east-1:111122223333:key/ext09-down',
        region: 'sa-east-1',
        awsKmsClient: {
          async sign({ Message }) {
            downKmsCalls += 1
            return Buffer.from(baseSigner.sign(Message), 'hex')
          },
        },
      }),
      antiReplayGuard: new ServiceAntiReplayGuard({
        storageType: 'distributed',
        distributedStore: downStore,
        now: () => clockMs,
      }),
      serviceEnvironment: SERVICE_ENVIRONMENTS.PRODUCTION,
      protectedMode: true,
      requireSignedGoGrant: true,
      authorityId: baseSigner.authorityId,
      trustedGoAuthorityId: goIssuer.authorityId,
      trustedGoKeyId: goIssuer.keyId,
      trustedGoPublicKeySpki: goIssuer.publicKeySpki,
      expectedProjectRef: VALID_PROJECT_REF,
      expectedCommitSha: VALID_COMMIT_SHA,
      attestationResponseVersion: '1.1',
      clientAuthVerifier: async () => ({
        authenticated: true,
        clientId: 'pr02-collector',
        allowedScopes: [VALID_SCOPE],
      }),
      now: () => clockMs,
    })
    await expect(
      downService.handleRequest(buildSignedRequest(goIssuer, clockMs))
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_UNAVAILABLE/)
    expect(downKmsCalls).toBe(0)

    // 5. Supabase trailing dot y IPv4 mapeado en PostgreSQL URL
    expect(() =>
      assertDedicatedPostgresUrl(
        'postgres://u:p@db.acoyfwwmhaeruciyedri.supabase.co.:5432/postgres?sslmode=verify-full'
      )
    ).toThrow(/POSTGRES_DEDICATED_DATABASE_REQUIRED/)
    expect(() =>
      assertDedicatedPostgresUrl(
        'postgres://u:p@[::ffff:169.254.169.254]:5432/att?sslmode=verify-full'
      )
    ).toThrow(/POSTGRES_FORBIDDEN_HOST/)
  })

  it('EXT09-DDB-KMS-ORDER-01: DynamoDB conflictos, AWS KMS DER GetPublicKey, orden pre-firma, elevación de evidencia y redacción', async () => {
    const fixedNow = Date.parse('2026-11-13T18:00:00.000Z')
    const baseSigner = new TestSigningProvider({ authorityId: 'ext09-kms-att' })
    const otherSigner = new TestSigningProvider({ authorityId: 'ext09-kms-other' })
    const goIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'ext09-kms-go' })

    // 1. DynamoDB ConditionalCheckFailed con distinto authorizationId -> CONFLICT + IdempotentParameterMismatchException
    const ddbStore = new DynamoDbDistributedAntiReplayStore({
      tableName: 'kioskopos_ext09_test',
      client: {
        async transactWriteItems() {
          const err = new Error('TransactionCanceledException') as Error & {
            CancellationReasons?: Array<{ Code: string }>
          }
          err.CancellationReasons = [{ Code: 'ConditionalCheckFailed' }]
          throw err
        },
        async updateItem() {
          return {}
        },
        async getItem() {
          return {
            Item: {
              pk: 'REQ#req-1',
              requestId: 'req-1',
              state: 'RESERVED',
              requestSha256: 'a'.repeat(64),
              authorizationId: 'auth-original',
              attestationId: 'att-1',
              ownerNodeId: 'n1',
              reservationToken: 'tok-1',
              idempotencyKey: 'k1',
              leaseExpiresAt: new Date(fixedNow + 30_000).toISOString(),
              leaseExpiresAtEpochMs: fixedNow + 30_000,
              createdAt: new Date(fixedNow).toISOString(),
              updatedAt: new Date(fixedNow).toISOString(),
            },
          }
        },
      },
      now: () => fixedNow,
    })

    await expect(
      ddbStore.reserveOnce({
        requestId: 'req-1',
        requestSha256: 'a'.repeat(64),
        authorizationId: 'auth-different',
        attestationId: 'att-2',
        ownerNodeId: 'n2',
        now: fixedNow,
      })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT/)

    const ddbMismatchStore = new DynamoDbDistributedAntiReplayStore({
      tableName: 'kioskopos_ext09_test',
      client: {
        async transactWriteItems() {
          const err = new Error('IdempotentParameterMismatchException')
          err.name = 'IdempotentParameterMismatchException'
          throw err
        },
        async updateItem() {
          return {}
        },
        async getItem() {
          return {}
        },
      },
    })
    await expect(
      ddbMismatchStore.reserveOnce({
        requestId: 'req-mismatch',
        requestSha256: 'a'.repeat(64),
        authorizationId: 'auth-mismatch',
        attestationId: 'att-mismatch',
        ownerNodeId: 'n1',
        now: fixedNow,
      })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_IDEMPOTENCY_CONFLICT/)

    // 2. AWS KMS isHealthy() soporta PublicKey DER Uint8Array y detecta KeyId/SPKI inesperados
    const expectedDerUint8 = new Uint8Array(
      baseSigner.publicKey.export({ format: 'der', type: 'spki' })
    )
    const wrongDerUint8 = new Uint8Array(
      otherSigner.publicKey.export({ format: 'der', type: 'spki' })
    )
    const kmsArn = 'arn:aws:kms:sa-east-1:111122223333:key/ext09-der'

    const healthyAwsKms = new AwsKmsSigningProvider({
      authorityId: baseSigner.authorityId,
      keyId: baseSigner.keyId ?? undefined,
      publicKeySpki: baseSigner.publicKeySpki ?? undefined,
      kmsKeyArn: kmsArn,
      region: 'sa-east-1',
      awsKmsClient: {
        sign: vi.fn(),
        getPublicKey: async ({ KeyId }) => ({ KeyId, PublicKey: expectedDerUint8 }),
      },
    })
    expect(await healthyAwsKms.isHealthy()).toBe(true)

    const wrongKeyIdAwsKms = new AwsKmsSigningProvider({
      authorityId: baseSigner.authorityId,
      keyId: baseSigner.keyId ?? undefined,
      publicKeySpki: baseSigner.publicKeySpki ?? undefined,
      kmsKeyArn: kmsArn,
      region: 'sa-east-1',
      awsKmsClient: {
        sign: vi.fn(),
        getPublicKey: async () => ({
          KeyId: 'arn:aws:kms:sa-east-1:111122223333:key/wrong',
          PublicKey: expectedDerUint8,
        }),
      },
    })
    expect(await wrongKeyIdAwsKms.isHealthy()).toBe(false)

    const wrongSpkiAwsKms = new AwsKmsSigningProvider({
      authorityId: baseSigner.authorityId,
      keyId: baseSigner.keyId ?? undefined,
      publicKeySpki: baseSigner.publicKeySpki ?? undefined,
      kmsKeyArn: kmsArn,
      region: 'sa-east-1',
      awsKmsClient: {
        sign: vi.fn(),
        getPublicKey: async ({ KeyId }) => ({ KeyId, PublicKey: wrongDerUint8 }),
      },
    })
    expect(await wrongSpkiAwsKms.isHealthy()).toBe(false)

    // 3. Orden estricto pre-reserva y pre-firma: Grant inválido o elevación de evidencia rechazan con 0 reservas y 0 firmas
    const { store } = await createPgliteStore(() => fixedNow)
    const reserveSpy = vi.spyOn(store, 'reserveOnce')
    const signSpy = vi.fn(async ({ Message, KeyId }) => ({
      Signature: Buffer.from(baseSigner.sign(Message), 'hex'),
      SigningAlgorithm: 'ED25519_SHA_512',
      KeyId,
    }))
    const validKms = new AwsKmsSigningProvider({
      authorityId: baseSigner.authorityId,
      keyId: baseSigner.keyId ?? undefined,
      publicKeySpki: baseSigner.publicKeySpki ?? undefined,
      kmsKeyArn: kmsArn,
      region: 'sa-east-1',
      awsKmsClient: { sign: signSpy },
    })
    const svc = new IndependentAttestationAuthorityService({
      signingProvider: validKms,
      antiReplayGuard: new ServiceAntiReplayGuard({
        storageType: 'distributed',
        distributedStore: store,
        now: () => fixedNow,
      }),
      serviceEnvironment: SERVICE_ENVIRONMENTS.PRODUCTION,
      protectedMode: true,
      requireSignedGoGrant: true,
      authorityId: baseSigner.authorityId,
      trustedGoAuthorityId: goIssuer.authorityId,
      trustedGoKeyId: goIssuer.keyId,
      trustedGoPublicKeySpki: goIssuer.publicKeySpki,
      expectedProjectRef: VALID_PROJECT_REF,
      expectedCommitSha: VALID_COMMIT_SHA,
      attestationResponseVersion: '1.1',
      clientAuthVerifier: async () => ({
        authenticated: true,
        clientId: 'pr02-collector',
        allowedScopes: [VALID_SCOPE],
      }),
      now: () => fixedNow,
    })

    const badProjectReq = buildSignedRequest(goIssuer, fixedNow, {
      projectRef: 'wrong-project-ref',
    })
    await expect(svc.handleRequest(badProjectReq)).rejects.toThrow(
      /ATTESTATION_POLICY_PROJECT_MISMATCH|GO_GRANT_/
    )

    const forgedGrantReq = buildSignedRequest(goIssuer, fixedNow)
    forgedGrantReq.goAuthorizationGrant = {
      ...forgedGrantReq.goAuthorizationGrant,
      signature: '00'.repeat(64),
    }
    await expect(svc.handleRequest(forgedGrantReq)).rejects.toThrow(
      /GO_AUTHORIZATION_SIGNATURE_INVALID|GO_GRANT_/
    )

    // TEST_SIGNER prohibido en PRODUCTION y fallbackToLocal() prohibido
    expect(() => validKms.fallbackToLocal()).toThrow(/LOCAL_FALLBACK_SIGNING_FORBIDDEN/)
    expect(
      () =>
        new IndependentAttestationAuthorityService({
          signingProvider: baseSigner,
          antiReplayGuard: new ServiceAntiReplayGuard({
            storageType: 'distributed',
            distributedStore: store,
            now: () => fixedNow,
          }),
          serviceEnvironment: SERVICE_ENVIRONMENTS.PRODUCTION,
          protectedMode: true,
          requireSignedGoGrant: true,
          trustedGoAuthorityId: goIssuer.authorityId,
          trustedGoKeyId: goIssuer.keyId,
          trustedGoPublicKeySpki: goIssuer.publicKeySpki,
          expectedProjectRef: VALID_PROJECT_REF,
          expectedCommitSha: VALID_COMMIT_SHA,
          clientAuthVerifier: async () => ({
            authenticated: true,
            clientId: 'pr02-collector',
            allowedScopes: [VALID_SCOPE],
          }),
        })
    ).toThrow(/TEST_SIGNER|PRODUCTION/)

    // Colapso autoridad GO vs Atestación prohibido
    expect(
      () =>
        new IndependentAttestationAuthorityService({
          signingProvider: validKms,
          antiReplayGuard: new ServiceAntiReplayGuard({
            storageType: 'distributed',
            distributedStore: store,
            now: () => fixedNow,
          }),
          serviceEnvironment: SERVICE_ENVIRONMENTS.PRODUCTION,
          protectedMode: true,
          requireSignedGoGrant: true,
          authorityId: goIssuer.authorityId,
          trustedGoAuthorityId: goIssuer.authorityId,
          trustedGoKeyId: baseSigner.keyId,
          trustedGoPublicKeySpki: baseSigner.publicKeySpki,
          expectedProjectRef: VALID_PROJECT_REF,
          expectedCommitSha: VALID_COMMIT_SHA,
          clientAuthVerifier: async () => ({
            authenticated: true,
            clientId: 'pr02-collector',
            allowedScopes: [VALID_SCOPE],
          }),
        })
    ).toThrow(/COLLAPSED_AUTHORITIES_REJECTED/)

    const elevatedReq = {
      ...buildSignedRequest(goIssuer, fixedNow),
      evidenceLevel: 'LEVEL_2B_INDEPENDENT_OBSERVED',
      arcaOriginVerified: true,
    }
    await expect(svc.handleRequest(elevatedReq)).rejects.toThrow(
      /EVIDENCE_LEVEL_ELEVATION_REJECTED|UNEXPECTED_REQUEST_FIELD/
    )

    expect(reserveSpy).not.toHaveBeenCalled()
    expect(signSpy).not.toHaveBeenCalled()

    // Happy path verifica respuesta Ed25519 Nivel 1 estricta
    const validReq = buildSignedRequest(goIssuer, fixedNow)
    const okResp = await svc.handleRequest(validReq)
    expect(okResp.evidenceLevel).toBe('LEVEL_1_DIGEST_ONLY')
    expect(okResp.rawSoapVerified).toBe(false)
    expect(okResp.arcaOriginVerified).toBe(false)
    const verified = verifyServiceAttestationResponse(okResp, {
      trustedAttestationPublicKey: baseSigner.publicKeySpki!,
      pinnedKeyId: baseSigner.keyId,
    })
    expect(verified.valid).toBe(true)

    // 4. Redacción de secretos y huella diagnóstica sin fugas
    const { env, pgSecret } = buildValidStagingEnv()
    const fp = buildSafeConfigurationFingerprint(env)
    expect(JSON.stringify(fp)).not.toContain(pgSecret)
    expect(fp.secretsIncluded).toBe(false)
    const redacted = redactSensitiveConfigText(
      `postgres://att_user:${pgSecret}@pg.internal:5432/att Authorization: Bearer super.secret.jwt`
    )
    expect(redacted).not.toContain(pgSecret)
    expect(redacted).not.toContain('super.secret.jwt')
  })

  it('EXT09-CONN-AUTH-01: matriz de autorización de conectividad externa controlada y modelo de 6 etapas', () => {
    const { env: baseEnv, pgSecret } = buildValidStagingEnv()

    expect(CONNECTIVITY_STAGE_ORDER).toEqual([
      CONNECTIVITY_READINESS_STAGES.CONFIGURATION_VALIDATION,
      CONNECTIVITY_READINESS_STAGES.LOCAL_PREFLIGHT,
      CONNECTIVITY_READINESS_STAGES.SAFE_CONNECTIVITY_PREFLIGHT,
      CONNECTIVITY_READINESS_STAGES.CONTROLLED_EXTERNAL_CONNECTIVITY,
      CONNECTIVITY_READINESS_STAGES.REAL_INTEGRATION_TEST,
      CONNECTIVITY_READINESS_STAGES.DEPLOYMENT_CANDIDATE,
    ])

    // 1. Configuración válida sin autorización de conectividad ni integración habilitada
    const evalDisabled = evaluateExternalConnectivityAuthorization({
      ...baseEnv,
      ATTESTATION_REAL_INTEGRATION_ENABLED: 'false',
    })
    expect(evalDisabled.configured).toBe(true)
    expect(evalDisabled.configurationValid).toBe(true)
    expect(evalDisabled.authorizationStatus).toBe(
      CONNECTIVITY_AUTHORIZATION_STATUSES.REAL_INTEGRATION_DISABLED
    )
    expect(evalDisabled.authorizedToConnect).toBe(false)
    expect(evalDisabled.connectivityTestStatus).toBe('NOT_RUN')
    expect(evalDisabled.stage).toBe(
      CONNECTIVITY_READINESS_STAGES.SAFE_CONNECTIVITY_PREFLIGHT
    )
    expect(JSON.stringify(evalDisabled)).not.toContain(pgSecret)

    // 2. ATTESTATION_REAL_INTEGRATION_ENABLED=true por sí solo NO autoriza conectividad externa
    const evalMissingOptIn = evaluateExternalConnectivityAuthorization({
      ...baseEnv,
      ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
      ATTESTATION_REAL_INTEGRATION_DRY_RUN: 'false',
    })
    expect(evalMissingOptIn.configured).toBe(true)
    expect(evalMissingOptIn.configurationValid).toBe(true)
    expect(evalMissingOptIn.authorizationStatus).toBe(
      CONNECTIVITY_AUTHORIZATION_STATUSES.NOT_AUTHORIZED
    )
    expect(evalMissingOptIn.authorizedToConnect).toBe(false)
    expect(evalMissingOptIn.connectivityTestStatus).toBe('NOT_RUN')
    expect(evalMissingOptIn.blockingReasons).toContain(
      'CONNECTIVITY_TEST_NOT_ENABLED'
    )
    expect(evalMissingOptIn.blockingReasons).toContain(
      'EXTERNAL_CONNECTIVITY_APPROVAL_MISSING'
    )
    expect(() =>
      assertExternalConnectivityAuthorized({
        ...baseEnv,
        ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
        ATTESTATION_REAL_INTEGRATION_DRY_RUN: 'false',
      })
    ).toThrow(/EXTERNAL_CONNECTIVITY_NOT_AUTHORIZED/)

    // 3. Dry-run activo bloquea conectividad real aunque exista aprobación explícita
    const evalDryRun = evaluateExternalConnectivityAuthorization({
      ...baseEnv,
      ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
      ATTESTATION_REAL_INTEGRATION_DRY_RUN: 'true',
      ATTESTATION_CONNECTIVITY_TEST_ENABLED: 'true',
      ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL: 'APPROVED',
    })
    expect(evalDryRun.authorizationStatus).toBe(
      CONNECTIVITY_AUTHORIZATION_STATUSES.DRY_RUN_ACTIVE
    )
    expect(evalDryRun.dryRunActive).toBe(true)
    expect(evalDryRun.authorizedToConnect).toBe(false)
    expect(evalDryRun.connectivityTestStatus).toBe('NOT_RUN')
    expect(() =>
      assertExternalConnectivityAuthorized({
        ...baseEnv,
        ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
        ATTESTATION_REAL_INTEGRATION_DRY_RUN: 'true',
        ATTESTATION_CONNECTIVITY_TEST_ENABLED: 'true',
        ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL: 'APPROVED',
      })
    ).toThrow(/DRY_RUN_ACTIVE/)

    // 4. Autorización completa y explícita
    const evalAuthorized = evaluateExternalConnectivityAuthorization({
      ...baseEnv,
      ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
      ATTESTATION_REAL_INTEGRATION_DRY_RUN: 'false',
      ATTESTATION_CONNECTIVITY_TEST_ENABLED: 'true',
      ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL: 'APPROVED',
    })
    expect(evalAuthorized.authorizationStatus).toBe(
      CONNECTIVITY_AUTHORIZATION_STATUSES.AUTHORIZED_TO_CONNECT
    )
    expect(evalAuthorized.authorizedToConnect).toBe(true)
    expect(evalAuthorized.connectivityTestStatus).toBe('READY_TO_RUN')
    expect(evalAuthorized.stage).toBe(
      CONNECTIVITY_READINESS_STAGES.CONTROLLED_EXTERNAL_CONNECTIVITY
    )
    expect(evalAuthorized.realConnectivityTested).toBe(false)
    expect(evalAuthorized.realIntegrationTested).toBe(false)
    expect(evalAuthorized.productionValidated).toBe(false)
    expect(evalAuthorized.productionApproved).toBe(false)

    // 5. Configuración contradictoria (ej. AWS KMS con GCP KMS key resource o backend incompatible)
    const evalContradictory = evaluateExternalConnectivityAuthorization({
      ...baseEnv,
      ATTESTATION_KMS_PROVIDER: 'aws-kms',
      ATTESTATION_GCP_KMS_KEY_VERSION_NAME:
        'projects/p/locations/l/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',
      ATTESTATION_CONNECTIVITY_TEST_ENABLED: 'true',
      ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL: 'APPROVED',
    })
    expect(evalContradictory.authorizationStatus).toBe(
      CONNECTIVITY_AUTHORIZATION_STATUSES.CONFIGURATION_INVALID
    )
    expect(evalContradictory.authorizedToConnect).toBe(false)
    expect(evalContradictory.stage).toBe(
      CONNECTIVITY_READINESS_STAGES.CONFIGURATION_VALIDATION
    )

    // 6. Variables faltantes
    const evalMissingVars = evaluateExternalConnectivityAuthorization({
      ...baseEnv,
      ATTESTATION_POSTGRES_URL: '',
      ATTESTATION_CONNECTIVITY_TEST_ENABLED: 'true',
      ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL: 'APPROVED',
    })
    expect(evalMissingVars.authorizationStatus).toBe(
      CONNECTIVITY_AUTHORIZATION_STATUSES.CONFIGURATION_INVALID
    )
    expect(evalMissingVars.authorizedToConnect).toBe(false)
  })

  it('EXT09-CONN-PG-01: conectividad controlada PostgreSQL read-only (6 estados, hosts prohibidos, timeout, auth, cierre de pool y 0 mutaciones)', async () => {
    const { env: baseEnv, pgSecret } = buildValidStagingEnv()
    const authorizedPgEnv = {
      ...baseEnv,
      ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
      ATTESTATION_REAL_INTEGRATION_DRY_RUN: 'false',
      ATTESTATION_CONNECTIVITY_TEST_ENABLED: 'true',
      ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL: 'APPROVED',
    }

    // 1. Sin autorización explícita -> NOT_RUN sin crear pool
    let poolCreatedCount = 0
    const noAuthRes = await runControlledPostgresConnectivityCheck(
      {
        ...baseEnv,
        ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
        ATTESTATION_REAL_INTEGRATION_DRY_RUN: 'false',
      },
      {
        createPool: () => {
          poolCreatedCount += 1
          throw new Error('NO_DEBE_INVOCARSE')
        },
      }
    )
    expect(noAuthRes.connectivityTest).toBe('NOT_RUN')
    expect(noAuthRes.connectivityAttempted).toBe(false)
    expect(poolCreatedCount).toBe(0)

    // 2. Host prohibido (Supabase / ARCA / metadata IPv4 e IPv6 mapeado) y DB no dedicada
    for (const badUrl of [
      'postgres://att_user:sec@db.acoyfwwmhaeruciyedri.supabase.co:5432/attestation_dedicated?sslmode=verify-full',
      'postgres://att_user:sec@wsaa.afip.gov.ar:5432/attestation_dedicated?sslmode=verify-full',
      'postgres://att_user:sec@169.254.169.254:5432/attestation_dedicated?sslmode=verify-full',
      'postgres://att_user:sec@[::ffff:169.254.169.254]:5432/attestation_dedicated?sslmode=verify-full',
      'postgres://att_user:sec@pg.attestation.internal:5432/kiosco_pos?sslmode=verify-full',
    ]) {
      const badRes = await runControlledPostgresConnectivityCheck(
        {
          ...authorizedPgEnv,
          ATTESTATION_POSTGRES_URL: badUrl,
        },
        {
          createPool: () => {
            poolCreatedCount += 1
            throw new Error('NO_DEBE_INVOCARSE')
          },
        }
      )
      expect(badRes.configurationValid).toBe(false)
      expect(badRes.connectivityAttempted).toBe(false)
      expect(poolCreatedCount).toBe(0)
    }

    // 3. Error de conectividad (ECONNREFUSED) + garantía de cierre de pool
    let closedOnConnError = false
    const connErrRes = await runControlledPostgresConnectivityCheck(
      authorizedPgEnv,
      {
        createPool: () => ({
          query: async () => {
            const err = new Error(
              `connect ECONNREFUSED postgres://att_user:${pgSecret}@pg.attestation.internal:5432`
            ) as Error & { code?: string }
            err.code = 'ECONNREFUSED'
            throw err
          },
          end: async () => {
            closedOnConnError = true
          },
        }),
      }
    )
    expect(connErrRes.connectivityTest).toBe('FAILED')
    expect(connErrRes.connectivityReachable).toBe(false)
    expect(closedOnConnError).toBe(true)
    expect(JSON.stringify(connErrRes)).not.toContain(pgSecret)
    expect(
      (connErrRes.details.postgresStates as Record<string, boolean>)[
        POSTGRES_CONNECTIVITY_STATES.CONNECTIVITY_REACHABLE
      ]
    ).toBe(false)

    // 4. Error de autenticación (28P01) + garantía de cierre de pool
    let closedOnAuthError = false
    const authErrRes = await runControlledPostgresConnectivityCheck(
      authorizedPgEnv,
      {
        createPool: () => ({
          query: async () => {
            const err = new Error(
              `password authentication failed for user "att_user" with secret ${pgSecret}`
            ) as Error & { code?: string }
            err.code = '28P01'
            throw err
          },
          end: async () => {
            closedOnAuthError = true
          },
        }),
      }
    )
    expect(authErrRes.connectivityTest).toBe('FAILED')
    expect(authErrRes.connectivityReachable).toBe(true)
    expect(authErrRes.authenticationVerified).toBe(false)
    expect(closedOnAuthError).toBe(true)
    expect(JSON.stringify(authErrRes)).not.toContain(pgSecret)
    expect(
      (authErrRes.details.postgresStates as Record<string, boolean>)[
        POSTGRES_CONNECTIVITY_STATES.AUTHENTICATION_VALID
      ]
    ).toBe(false)

    // 5. Timeout acotado + garantía de cierre de pool
    let closedOnTimeout = false
    const timeoutRes = await runControlledPostgresConnectivityCheck(
      authorizedPgEnv,
      {
        timeoutMs: 30,
        createPool: () => ({
          query: () =>
            new Promise((resolve) => {
              setTimeout(resolve, 250)
            }),
          end: async () => {
            closedOnTimeout = true
          },
        }),
      }
    )
    expect(timeoutRes.connectivityTest).toBe('FAILED')
    expect(timeoutRes.errors[0]?.code).toBe('POSTGRES_CONNECTIVITY_TIMEOUT')
    expect(closedOnTimeout).toBe(true)

    // 6. Verificación read-only completa contra PGlite con 6 estados y 0 mutaciones
    const { db: pglite } = await createPgliteStore()
    const executedSql: string[] = []
    let poolEnded = false

    const countBefore = await pglite.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM attestation_distributed_anti_replay'
    )
    expect(Number(countBefore.rows[0]?.count ?? 0)).toBe(0)

    const okRes = await runControlledPostgresConnectivityCheck(authorizedPgEnv, {
      createPool: () => ({
        query: async (sql: string, params?: unknown[]) => {
          executedSql.push(sql)
          return pglite.query(sql, params)
        },
        end: async () => {
          poolEnded = true
        },
      }),
    })

    expect(okRes.status).toBe('CONNECTIVITY_VERIFIED')
    expect(okRes.connectivityTest).toBe('PASSED')
    expect(okRes.realConnectivityTested).toBe(true)
    expect(okRes.realIntegrationTested).toBe(false)
    expect(okRes.productionValidated).toBe(false)
    expect(okRes.productionApproved).toBe(false)
    expect(poolEnded).toBe(true)
    expect(okRes.details.poolClosed).toBe(true)
    expect(okRes.details.mutationsExecuted).toBe(0)
    expect(okRes.details.postgresStates).toEqual({
      CONFIGURATION_VALID: true,
      CONNECTIVITY_REACHABLE: true,
      AUTHENTICATION_VALID: true,
      DATABASE_ACCESS_VALID: true,
      SCHEMA_READY: true,
      REAL_INTEGRATION_TESTED: false,
    })

    // Verificar que ninguna sentencia SQL ejecutada fue mutante
    for (const sql of executedSql) {
      expect(sql.toUpperCase()).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/
      )
    }
    const countAfter = await pglite.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM attestation_distributed_anti_replay'
    )
    expect(Number(countAfter.rows[0]?.count ?? 0)).toBe(0)
  })

  it('EXT09-CONN-DDB-KMS-01: conectividad controlada DynamoDB (6 categorías de error, 0 escrituras) y KMS (GetPublicKey read-only, conflicto AWS/GCP, 0 firmas)', async () => {
    const { env: baseEnv, kms } = buildValidStagingEnv()
    const authorizedDdbEnv = {
      ...baseEnv,
      ATTESTATION_POSTGRES_URL: '',
      ATTESTATION_POSTGRES_TABLE: '',
      ATTESTATION_POSTGRES_ISOLATION_LEVEL: '',
      ATTESTATION_ANTI_REPLAY_BACKEND: 'dynamodb',
      ATTESTATION_ANTI_REPLAY_PROVIDER: 'DYNAMODB',
      ATTESTATION_DYNAMODB_TABLE: 'attestation_anti_replay_staging',
      ATTESTATION_AWS_REGION: 'sa-east-1',
      ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
      ATTESTATION_REAL_INTEGRATION_DRY_RUN: 'false',
      ATTESTATION_CONNECTIVITY_TEST_ENABLED: 'true',
      ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL: 'APPROVED',
    }

    // 1. Clasificación determinista de las 6 categorías de error DynamoDB
    expect(
      classifyDynamoDbConnectivityError({
        name: 'UnrecognizedClientException',
        message: 'The security token included in the request is invalid',
      }).category
    ).toBe(DYNAMODB_ERROR_CATEGORIES.AUTHENTICATION)
    expect(
      classifyDynamoDbConnectivityError({
        name: 'AccessDeniedException',
        message: 'User is not authorized to perform: dynamodb:DescribeTable',
      }).category
    ).toBe(DYNAMODB_ERROR_CATEGORIES.AUTHORIZATION)
    expect(
      classifyDynamoDbConnectivityError({
        name: 'ProvisionedThroughputExceededException',
        message: 'Rate exceeded',
      }).category
    ).toBe(DYNAMODB_ERROR_CATEGORIES.THROTTLING)
    expect(
      classifyDynamoDbConnectivityError({
        code: 'ENOTFOUND',
        message: 'getaddrinfo ENOTFOUND dynamodb.us-east-1.amazonaws.com',
      }).category
    ).toBe(DYNAMODB_ERROR_CATEGORIES.CONNECTIVITY)
    expect(
      classifyDynamoDbConnectivityError({
        name: 'ValidationException',
        message: 'Invalid table name',
      }).category
    ).toBe(DYNAMODB_ERROR_CATEGORIES.CONFIGURATION)
    expect(
      classifyDynamoDbConnectivityError({
        name: 'ResourceNotFoundException',
        message: 'Requested resource not found',
      }).category
    ).toBe(DYNAMODB_ERROR_CATEGORIES.RESOURCE_NOT_FOUND)

    // 2. Chequeo read-only exitoso de DynamoDB (DescribeTable + DescribeTimeToLive, 0 escrituras)
    const putItemSpy = vi.fn()
    const ddbOk = await runControlledDynamoDbConnectivityCheck(
      authorizedDdbEnv,
      {
        client: {
          describeTable: async ({ TableName }: { TableName: string }) => ({
            Table: {
              TableName,
              TableStatus: 'ACTIVE',
              KeySchema: [{ AttributeName: 'replayKey', KeyType: 'HASH' }],
              BillingModeSummary: { BillingMode: 'PAY_PER_REQUEST' },
            },
          }),
          describeTimeToLive: async () => ({
            TimeToLiveDescription: {
              TimeToLiveStatus: 'ENABLED',
              AttributeName: 'expiresAtEpochSeconds',
            },
          }),
          putItem: putItemSpy,
        },
      }
    )
    expect(ddbOk.status).toBe('CONNECTIVITY_VERIFIED')
    expect(ddbOk.connectivityTest).toBe('PASSED')
    expect(ddbOk.details.writesExecuted).toBe(0)
    expect(ddbOk.details.ttlReady).toBe(true)
    expect(putItemSpy).not.toHaveBeenCalled()

    // 3. KMS: configuración válida sin autorización de conectividad -> NOT_RUN (0 llamadas)
    let kmsCalls = 0
    const kmsNoAuth = await runControlledKmsConnectivityCheck(
      {
        ...baseEnv,
        ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
        ATTESTATION_REAL_INTEGRATION_DRY_RUN: 'false',
      },
      {
        awsKmsClient: {
          getPublicKey: async () => {
            kmsCalls += 1
            throw new Error('NO_DEBE_EJECUTARSE')
          },
        },
      }
    )
    expect(kmsNoAuth.connectivityTest).toBe('NOT_RUN')
    expect(kmsCalls).toBe(0)

    // 4. KMS: conflicto entre AWS KMS y GCP KMS -> CONFIGURATION_INVALID
    const kmsConflict = await runControlledKmsConnectivityCheck({
      ...authorizedDdbEnv,
      ATTESTATION_KMS_PROVIDER: 'aws-kms',
      ATTESTATION_GCP_KMS_KEY_VERSION_NAME:
        'projects/p/locations/l/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',
    })
    expect(kmsConflict.status).toBe('CONFIGURATION_INVALID')
    expect(kmsConflict.configurationValid).toBe(false)

    // 5. KMS: redacción segura de errores cuando falla GetPublicKey
    const fakeSecretToken = 'AKIAIOSFODNN7EXAMPLE_SECRET_TOKEN_999'
    const kmsErr = await runControlledKmsConnectivityCheck(authorizedDdbEnv, {
      awsKmsClient: {
        getPublicKey: async () => {
          throw new Error(
            `AccessDeniedException: token=${fakeSecretToken} Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig`
          )
        },
      },
    })
    expect(kmsErr.connectivityTest).toBe('FAILED')
    expect(JSON.stringify(kmsErr)).not.toContain(fakeSecretToken)
    expect(JSON.stringify(kmsErr)).not.toContain('eyJhbGciOiJIUzI1NiJ9')

    // 6. KMS: GetPublicKey read-only exitoso con Ed25519 SPKI DER y 0 firmas
    const spkiDer = kms.pair.publicKey.export({ type: 'spki', format: 'der' })
    const signSpy = vi.fn()
    const kmsOk = await runControlledKmsConnectivityCheck(authorizedDdbEnv, {
      awsKmsClient: {
        getPublicKey: async ({ KeyId }: { KeyId: string }) => ({
          KeyId,
          KeySpec: 'ECC_NIST_EDWARDS25519',
          KeyUsage: 'SIGN_VERIFY',
          SigningAlgorithms: ['ED25519_SHA_512'],
          PublicKey: spkiDer,
        }),
        sign: signSpy,
      },
    })
    expect(kmsOk.status).toBe('CONNECTIVITY_VERIFIED')
    expect(kmsOk.connectivityTest).toBe('PASSED')
    expect(kmsOk.details.signaturesExecuted).toBe(0)
    expect(kmsOk.details.PRIVATE_KEYS_LOCAL).toBe('FORBIDDEN')
    expect(kmsOk.details.PRODUCTION_SIGNING_KEY_IN_RUNTIME).toBe('FORBIDDEN')
    expect(signSpy).not.toHaveBeenCalled()
  })

  it('EXT09-CONN-OIDC-MTLS-01: conectividad controlada OIDC/JWKS (SSRF, redirect, timeout, alg=none) y mTLS (5 estados + rechazo de spoofing) y suite unificada fail-closed', async () => {
    const { env: baseEnv, kms } = buildValidStagingEnv()
    const authorizedEnv = {
      ...baseEnv,
      ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
      ATTESTATION_REAL_INTEGRATION_DRY_RUN: 'false',
      ATTESTATION_CONNECTIVITY_TEST_ENABLED: 'true',
      ATTESTATION_EXTERNAL_CONNECTIVITY_APPROVAL: 'APPROVED',
    }

    // 1. OIDC SSRF / host no autorizado / credenciales embebidas -> bloqueado antes del fetch
    let fetchCount = 0
    for (const badJwksUri of [
      'https://169.254.169.254/.well-known/jwks.json',
      'https://[::ffff:169.254.169.254]/.well-known/jwks.json',
      'https://user:pass@idp.attestation.example.com/.well-known/jwks.json',
    ]) {
      const badOidc = await runControlledOidcConnectivityCheck(
        {
          ...authorizedEnv,
          ATTESTATION_OIDC_JWKS_URI: badJwksUri,
        },
        {
          fetchImpl: async () => {
            fetchCount += 1
            throw new Error('NO_DEBE_EJECUTARSE')
          },
        }
      )
      expect(badOidc.connectivityAttempted).toBe(false)
      expect(fetchCount).toBe(0)
    }

    // 2. OIDC redirect HTTP 302 -> rechazado (redirect: 'error' / status != 200)
    const redirectOidc = await runControlledOidcConnectivityCheck(
      authorizedEnv,
      {
        fetchImpl: async () => ({
          status: 302,
          headers: new Map([['content-type', 'application/json']]),
          text: async () => '{}',
        }),
      }
    )
    expect(redirectOidc.connectivityTest).toBe('FAILED')
    expect(redirectOidc.errors[0]?.code).toBe('OIDC_JWKS_HTTP_STATUS_INVALID')

    // 3. OIDC timeout acotado
    const timeoutOidc = await runControlledOidcConnectivityCheck(authorizedEnv, {
      timeoutMs: 25,
      fetchImpl: () =>
        new Promise((resolve) => {
          setTimeout(resolve, 250)
        }),
    })
    expect(timeoutOidc.connectivityTest).toBe('FAILED')
    expect(timeoutOidc.errors[0]?.code).toBe('OIDC_JWKS_FETCH_TIMEOUT')

    // 4. OIDC JWKS con alg=none -> rechazado
    const algNoneOidc = await runControlledOidcConnectivityCheck(
      authorizedEnv,
      {
        fetchImpl: async () => ({
          status: 200,
          headers: {
            get: (h: string) =>
              h.toLowerCase() === 'content-type' ? 'application/json' : null,
          },
          text: async () =>
            JSON.stringify({
              keys: [{ kty: 'RSA', kid: 'k1', alg: 'none', use: 'sig' }],
            }),
        }),
      }
    )
    expect(algNoneOidc.connectivityTest).toBe('FAILED')
    expect(algNoneOidc.errors[0]?.code).toBe('OIDC_JWKS_ALG_NONE_FORBIDDEN')

    // 5. OIDC JWKS válido con EdDSA / RS256 -> CONNECTIVITY_VERIFIED
    const { publicKey } = crypto.generateKeyPairSync('ed25519')
    const validJwk = {
      ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>),
      kid: 'oidc-ed25519-1',
      alg: 'EdDSA',
      use: 'sig',
    }
    const okOidc = await runControlledOidcConnectivityCheck(authorizedEnv, {
      fetchImpl: async () => ({
        status: 200,
        headers: {
          get: (h: string) =>
            h.toLowerCase() === 'content-type'
              ? 'application/jwk-set+json'
              : null,
        },
        text: async () => JSON.stringify({ keys: [validJwk] }),
      }),
    })
    expect(okOidc.status).toBe('CONNECTIVITY_VERIFIED')
    expect(okOidc.connectivityTest).toBe('PASSED')
    expect(okOidc.details.validKeysCount).toBe(1)

    // 6. mTLS: 5 estados explícitos + rechazo de spoofing por headers sin socket TLS
    const mtlsEnv = {
      ...authorizedEnv,
      ATTESTATION_CLIENT_AUTH_MODE: 'mtls',
      ATTESTATION_MTLS_TRUSTED_CA_FINGERPRINTS_SHA256: 'AA:BB:CC',
      ATTESTATION_MTLS_ALLOWED_CLIENT_SAN_URIS:
        'spiffe://kiosco.internal/pr02-collector',
      ATTESTATION_MTLS_ALLOWED_CLIENT_IDS: 'pr02-collector',
      ATTESTATION_MTLS_ALLOWED_SCOPES: VALID_SCOPE,
    }

    const spoofedMtls = await runControlledMtlsConnectivityCheck(mtlsEnv, {
      handshakeProbe: async () => ({
        headers: {
          'x-ssl-client-verify': 'SUCCESS',
          'x-ssl-client-s-dn': 'CN=pr02-collector',
        },
        transportSecurity: {
          tlsConnected: false,
        },
      }),
    })
    expect(spoofedMtls.connectivityTest).toBe('FAILED')
    expect(spoofedMtls.details.mtlsStates).toEqual({
      [MTLS_CONNECTIVITY_STATES.TLS_CONNECTED]: false,
      [MTLS_CONNECTIVITY_STATES.SERVER_CERT_VALID]: false,
      [MTLS_CONNECTIVITY_STATES.CLIENT_CERT_PRESENT]: false,
      [MTLS_CONNECTIVITY_STATES.CLIENT_CERT_TRUSTED]: false,
      [MTLS_CONNECTIVITY_STATES.CLIENT_IDENTITY_ALLOWED]: false,
    })

    const okMtls = await runControlledMtlsConnectivityCheck(mtlsEnv, {
      handshakeProbe: async () => ({
        headers: {},
        transportSecurity: {
          tlsConnected: true,
          serverAuthorized: true,
          authorized: true,
          issuerFingerprint256: 'AA:BB:CC',
          peerCertificate: {
            subject: { CN: 'pr02-collector' },
            subjectaltname: 'URI:spiffe://kiosco.internal/pr02-collector',
            valid_from: '2026-01-01T00:00:00Z',
            valid_to: '2027-01-01T00:00:00Z',
            fingerprint256: '11:22:33',
            issuerFingerprint256: 'AA:BB:CC',
          },
        },
      }),
      now: () => Date.parse('2026-06-01T00:00:00Z'),
    })
    expect(okMtls.status).toBe('CONNECTIVITY_VERIFIED')
    expect(okMtls.connectivityTest).toBe('PASSED')
    expect(okMtls.details.mtlsStates).toEqual({
      [MTLS_CONNECTIVITY_STATES.TLS_CONNECTED]: true,
      [MTLS_CONNECTIVITY_STATES.SERVER_CERT_VALID]: true,
      [MTLS_CONNECTIVITY_STATES.CLIENT_CERT_PRESENT]: true,
      [MTLS_CONNECTIVITY_STATES.CLIENT_CERT_TRUSTED]: true,
      [MTLS_CONNECTIVITY_STATES.CLIENT_IDENTITY_ALLOWED]: true,
    })

    // 7. Suite unificada mantiene invariantes de producción fail-closed aun cuando todos los checks pasan
    const { db: pglite } = await createPgliteStore()
    const spkiDer = kms.pair.publicKey.export({ type: 'spki', format: 'der' })
    const suiteRes = await runControlledExternalConnectivitySuite(
      authorizedEnv,
      {
        postgres: {
          createPool: () => ({
            query: (sql: string, params?: unknown[]) =>
              pglite.query(sql, params),
            end: async () => undefined,
          }),
        },
        kms: {
          awsKmsClient: {
            getPublicKey: async ({ KeyId }: { KeyId: string }) => ({
              KeyId,
              KeySpec: 'ECC_NIST_EDWARDS25519',
              KeyUsage: 'SIGN_VERIFY',
              SigningAlgorithms: ['ED25519_SHA_512'],
              PublicKey: spkiDer,
            }),
          },
        },
        oidc: {
          fetchImpl: async () => ({
            status: 200,
            headers: {
              get: (h: string) =>
                h.toLowerCase() === 'content-type'
                  ? 'application/jwk-set+json'
                  : null,
            },
            text: async () => JSON.stringify({ keys: [validJwk] }),
          }),
        },
      }
    )

    expect(suiteRes.status).toBe('CONTROLLED_CONNECTIVITY_VERIFIED')
    expect(suiteRes.connectivityTest).toBe('PASSED')
    expect(suiteRes.realConnectivityTested).toBe(true)
    expect(suiteRes.realIntegrationTested).toBe(false)
    expect(suiteRes.productionValidated).toBe(false)
    expect(suiteRes.productionApproved).toBe(false)
    expect(suiteRes.invariants).toEqual({
      PRIVATE_KEYS_LOCAL: 'FORBIDDEN',
      PRODUCTION_SIGNING_KEY_IN_RUNTIME: 'FORBIDDEN',
      PRODUCTION_VALIDATED: false,
      PRODUCTION_APPROVED: false,
      EXTERNAL_AUTHORITY_DEPLOYED: false,
      AUTHORITY_REAL_WORLD_AVAILABLE: false,
      P1_IMPORT_ALLOWED: false,
      PR02_READY_FOR_EMISSION_GO: false,
      REMOTE_GO: 'DENIED',
      HISTORICAL_042_REEMISSION_FORBIDDEN: true,
    })
  })
})
