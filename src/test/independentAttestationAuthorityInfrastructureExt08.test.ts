// @vitest-environment node
import crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  ALLOWED_ENVIRONMENTS,
  ALLOWED_EXECUTION_SCOPES,
  assertMaturityPromotionAllowed,
  assertSafeEndpointUrl,
  buildSafeConfigurationFingerprint,
  computeEd25519SpkiKeyId,
  createControlledDynamoDbStoreFromEnv,
  createControlledKmsProviderFromEnv,
  createControlledPostgresStoreFromEnv,
  DEFAULT_MATURITY_FLAGS,
  DynamoDbDistributedAntiReplayStore,
  evaluateIntegrationPhaseGate,
  evaluateMaturityState,
  IndependentAttestationAuthorityService,
  INTEGRATION_PHASE_ORDER,
  INTEGRATION_PHASES,
  isRealIntegrationDryRun,
  MATURITY_STATES,
  PostgresDistributedAntiReplayStore,
  PREFLIGHT_STATUSES,
  redactSensitiveConfigText,
  resolveKmsEnvConfig,
  runControlledRealIntegrationDryRun,
  runInfrastructurePreflight,
  SERVICE_ENVIRONMENTS,
  ServiceAntiReplayGuard,
  TestSigningProvider,
  validateInfrastructureConfiguration,
} from '../../services/independent-attestation-authority/src/index.mjs'

function createEphemeralSpkiFixture() {
  const pair = crypto.generateKeyPairSync('ed25519')
  const publicKeySpki = pair.publicKey
    .export({ format: 'pem', type: 'spki' })
    .toString()
    .trim()
  const keyId = computeEd25519SpkiKeyId(publicKeySpki)
  return { publicKeySpki, keyId }
}

function buildValidStagingEnv() {
  const kmsFixture = createEphemeralSpkiFixture()
  const goFixture = createEphemeralSpkiFixture()
  return {
    env: {
      ATTESTATION_ENVIRONMENT: 'STAGING',
      ATTESTATION_SIGNING_PROVIDER: 'PRODUCTION_KMS_SIGNER',
      ATTESTATION_KMS_PROVIDER: 'AWS_KMS',
      ATTESTATION_AWS_REGION: 'sa-east-1',
      ATTESTATION_KMS_KEY_ID: kmsFixture.keyId,
      ATTESTATION_KMS_KEY_VERSION_NAME:
        'arn:aws:kms:sa-east-1:123456789012:key/11112222-3333-4444-5555-666677778888',
      ATTESTATION_PUBLIC_KEY_SPKI: kmsFixture.publicKeySpki,
      ATTESTATION_GO_AUTHORITY_ID: 'kioskopos-go-governance-staging-v1',
      ATTESTATION_GO_KEY_ID: goFixture.keyId,
      ATTESTATION_GO_PUBLIC_KEY_SPKI: goFixture.publicKeySpki,
      ATTESTATION_ANTI_REPLAY_MODE: 'distributed',
      ATTESTATION_ANTI_REPLAY_PROVIDER: 'POSTGRESQL',
      ATTESTATION_POSTGRES_URL:
        'postgres://att_svc_user:SuperSecretPgPass123!@att-pg-dedicated.internal:5432/att_anti_replay?sslmode=verify-full',
      ATTESTATION_POSTGRES_TABLE: 'attestation_distributed_anti_replay',
      ATTESTATION_POSTGRES_ISOLATION_LEVEL: 'SERIALIZABLE',
      ATTESTATION_CLIENT_AUTH_MODE: 'OIDC_JWT',
      ATTESTATION_OIDC_ISSUER: 'https://auth.internal.kioskopos.invalid',
      ATTESTATION_OIDC_AUDIENCE: 'independent-attestation-authority',
      ATTESTATION_OIDC_JWKS_URI:
        'https://auth.internal.kioskopos.invalid/.well-known/jwks.json',
      ATTESTATION_REQUIRE_HTTPS: 'true',
      ATTESTATION_REAL_INTEGRATION_ENABLED: 'false',
      ATTESTATION_REAL_INTEGRATION_DRY_RUN: 'false',
    } as Record<string, string>,
    kmsFixture,
    goFixture,
  }
}

describe('EXT-REAL-08 — Production Infrastructure Preflight & Controlled Integration Readiness', () => {
  it('EXT08-CONFIG-01: configuración válida completa y coherente retorna CONFIGURATION_VALID sin abrir sockets', () => {
    const { env } = buildValidStagingEnv()
    const res = validateInfrastructureConfiguration(env)

    expect(res.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_VALID)
    expect(res.valid).toBe(true)
    expect(res.syntaxValid).toBe(true)
    expect(res.securityPostureValid).toBe(true)
    expect(res.complete).toBe(true)
    expect(res.issues).toHaveLength(0)
    expect(res.missingTargets).toHaveLength(0)
    expect(res.fingerprint.allowedScopes).toEqual(ALLOWED_EXECUTION_SCOPES)
    expect(res.fingerprint.allowedTargetEnvironments).toEqual(ALLOWED_ENVIRONMENTS)
  })

  it('EXT08-CONFIG-02: configuración incompleta retorna CONFIGURATION_INVALID', () => {
    const incompleteStaging = {
      ATTESTATION_ENVIRONMENT: 'STAGING',
      ATTESTATION_SIGNING_PROVIDER: 'PRODUCTION_KMS_SIGNER',
      ATTESTATION_ANTI_REPLAY_MODE: 'distributed',
    }
    const res = validateInfrastructureConfiguration(incompleteStaging)

    expect(res.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(res.valid).toBe(false)
    expect(res.complete).toBe(false)
    expect(res.missingTargets).toContain('ATTESTATION_KMS_KEY_VERSION_NAME')
    expect(res.missingTargets).toContain('ATTESTATION_PUBLIC_KEY_SPKI')
    expect(res.missingTargets).toContain('ATTESTATION_GO_PUBLIC_KEY_SPKI')
    expect(res.missingTargets).toContain('ATTESTATION_DISTRIBUTED_ANTI_REPLAY_BACKEND')
  })

  it('EXT08-CONFIG-03: Postgres apuntando a Supabase POS retorna CONFIGURATION_INVALID', () => {
    const { env } = buildValidStagingEnv()
    env.ATTESTATION_POSTGRES_URL =
      'postgres://postgres:SecretPass@db.abcdefghijklmno.supabase.co:5432/postgres?sslmode=require'

    const res = validateInfrastructureConfiguration(env)
    expect(res.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(res.valid).toBe(false)
    expect(
      res.issues.some((i) => i.code === 'POSTGRES_DEDICATED_DATABASE_REQUIRED')
    ).toBe(true)

    const preflight = runInfrastructurePreflight({
      ...env,
      ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
    })
    expect(preflight.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(preflight.readyForControlledTest).toBe(false)
  })

  it('EXT08-CONFIG-04: Postgres remoto sin TLS o con sslmode débil/metadata host retorna CONFIGURATION_INVALID', () => {
    const { env } = buildValidStagingEnv()
    env.ATTESTATION_POSTGRES_URL =
      'postgres://att_user:Secret@pg-remote.internal:5432/att_db?sslmode=disable'
    const disabledTls = validateInfrastructureConfiguration(env)
    expect(disabledTls.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(
      disabledTls.issues.some((i) => i.code === 'POSTGRES_TLS_REQUIRED')
    ).toBe(true)

    env.ATTESTATION_POSTGRES_URL =
      'postgres://att_user:Secret@pg-remote.internal:5432/att_db'
    const missingSslMode = validateInfrastructureConfiguration(env)
    expect(missingSslMode.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(
      missingSslMode.issues.some((i) => i.code === 'POSTGRES_TLS_REQUIRED')
    ).toBe(true)

    env.ATTESTATION_POSTGRES_URL =
      'postgres://att_user:Secret@169.254.169.254:5432/att_db?sslmode=verify-full'
    const metadataHost = validateInfrastructureConfiguration(env)
    expect(metadataHost.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(
      metadataHost.issues.some((i) => i.code === 'POSTGRES_FORBIDDEN_HOST')
    ).toBe(true)
  })

  it('EXT08-PREFLIGHT-01: con integración real deshabilitada retorna REAL_INTEGRATION_DISABLED sin efectos', () => {
    const { env } = buildValidStagingEnv()
    env.ATTESTATION_REAL_INTEGRATION_ENABLED = 'false'

    const preflight = runInfrastructurePreflight(env)
    expect(preflight.status).toBe(PREFLIGHT_STATUSES.REAL_INTEGRATION_DISABLED)
    expect(preflight.configurationStatus).toBe(
      PREFLIGHT_STATUSES.CONFIGURATION_VALID
    )
    expect(preflight.realIntegrationEnabled).toBe(false)
    expect(preflight.readyForControlledTest).toBe(false)
    expect(preflight.connectivityTested).toBe(false)
    expect(preflight.productionValidated).toBe(false)
    expect(preflight.productionApproved).toBe(false)
    expect(preflight.readyForProduction).toBe(false)
    expect(preflight.maturityFlags).toEqual(DEFAULT_MATURITY_FLAGS)
  })

  it('EXT08-PREFLIGHT-02: con integración real habilitada pero sin backend real configurado retorna REAL_INTEGRATION_NOT_CONFIGURED; completo retorna READY_FOR_CONTROLLED_TEST', () => {
    const withoutBackend = {
      ATTESTATION_ENVIRONMENT: 'TEST',
      ATTESTATION_SIGNING_PROVIDER: 'TEST_SIGNER',
      ATTESTATION_ANTI_REPLAY_MODE: 'distributed',
      ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
    }
    const missingRes = runInfrastructurePreflight(withoutBackend)
    expect(missingRes.status).toBe(
      PREFLIGHT_STATUSES.REAL_INTEGRATION_NOT_CONFIGURED
    )
    expect(missingRes.configurationStatus).toBe(
      PREFLIGHT_STATUSES.CONFIGURATION_VALID
    )
    expect(missingRes.readyForControlledTest).toBe(false)
    expect(missingRes.missingTargets).toContain(
      'ATTESTATION_DISTRIBUTED_ANTI_REPLAY_BACKEND'
    )

    const onlyMemoryTest = {
      ATTESTATION_ENVIRONMENT: 'TEST',
      ATTESTATION_SIGNING_PROVIDER: 'TEST_SIGNER',
      ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
    }
    expect(runInfrastructurePreflight(onlyMemoryTest).status).toBe(
      PREFLIGHT_STATUSES.REAL_INTEGRATION_NOT_CONFIGURED
    )

    const { env } = buildValidStagingEnv()
    env.ATTESTATION_REAL_INTEGRATION_ENABLED = 'true'
    const controlledReady = runInfrastructurePreflight(env)
    expect(controlledReady.status).toBe(
      PREFLIGHT_STATUSES.REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST
    )
    expect(controlledReady.readyForControlledTest).toBe(true)
    expect(controlledReady.connectivityTested).toBe(false)
    expect(controlledReady.healthVerified).toBe(false)
    expect(controlledReady.realIntegrationTested).toBe(false)
    expect(controlledReady.productionValidated).toBe(false)
    expect(controlledReady.productionApproved).toBe(false)
  })

  it('EXT08-DRYRUN-01: dry-run controlado reporta matriz WOULD_RUN / NOT_RUN / FORBIDDEN con contadores en 0 y sin tráfico de red', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    try {
      const { env } = buildValidStagingEnv()
      env.ATTESTATION_REAL_INTEGRATION_ENABLED = 'true'
      env.ATTESTATION_REAL_INTEGRATION_DRY_RUN = 'true'

      expect(isRealIntegrationDryRun(env)).toBe(true)
      const dryRun = runControlledRealIntegrationDryRun(env)

      expect(dryRun.dryRun).toBe(true)
      expect(dryRun.executedSideEffects).toBe(false)
      expect(dryRun.preflightStatus).toBe(
        PREFLIGHT_STATUSES.REAL_INTEGRATION_READY_FOR_CONTROLLED_TEST
      )
      expect(dryRun.actionMatrix).toEqual({
        POSTGRES_CONNECTION_CHECK: 'WOULD_RUN',
        POSTGRES_WRITE_TEST: 'NOT_RUN',
        DYNAMODB_CONNECTIVITY_CHECK: 'NOT_RUN_UNCONFIGURED_OR_SKIPPED',
        DYNAMODB_MUTATION: 'NOT_RUN',
        KMS_PUBLIC_KEY_CHECK: 'WOULD_RUN',
        KMS_SIGN_OPERATION: 'NOT_RUN',
        OIDC_DISCOVERY: 'WOULD_RUN',
        MTLS_HANDSHAKE_VALIDATION: 'NOT_RUN_UNCONFIGURED_OR_SKIPPED',
        ARCA: 'FORBIDDEN',
        SUPABASE_POS_MUTATION: 'FORBIDDEN',
      })
      expect(dryRun.counters).toEqual({
        networkCallsExecuted: 0,
        signaturesExecuted: 0,
        reservationsCreated: 0,
        mutationsExecuted: 0,
        arcaCallsExecuted: 0,
        supabasePosOperationsExecuted: 0,
      })
      expect(dryRun.productionValidated).toBe(false)
      expect(dryRun.productionApproved).toBe(false)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('EXT08-DRYRUN-02: dry-run nunca firma ni instancia clientes KMS', async () => {
    const { env } = buildValidStagingEnv()
    env.ATTESTATION_REAL_INTEGRATION_ENABLED = 'true'
    env.ATTESTATION_REAL_INTEGRATION_DRY_RUN = 'true'

    const dryRun = runControlledRealIntegrationDryRun(env)
    expect(dryRun.actionMatrix.KMS_SIGN_OPERATION).toBe('NOT_RUN')
    expect(dryRun.counters.signaturesExecuted).toBe(0)

    const kmsClientDouble = {
      sign: vi.fn(),
      getPublicKey: vi.fn(),
    }
    await expect(
      createControlledKmsProviderFromEnv(env, { kmsClient: kmsClientDouble })
    ).rejects.toThrow(/REAL_INTEGRATION_DRY_RUN_ACTIVE/)
    expect(kmsClientDouble.sign).not.toHaveBeenCalled()
    expect(kmsClientDouble.getPublicKey).not.toHaveBeenCalled()
  })

  it('EXT08-DRYRUN-03: dry-run no muta base de datos ni permite abrir pools PG o clientes DynamoDB', async () => {
    const { env } = buildValidStagingEnv()
    env.ATTESTATION_REAL_INTEGRATION_ENABLED = 'true'
    env.ATTESTATION_REAL_INTEGRATION_DRY_RUN = 'true'

    const dryRun = runControlledRealIntegrationDryRun(env)
    expect(dryRun.actionMatrix.POSTGRES_WRITE_TEST).toBe('NOT_RUN')
    expect(dryRun.actionMatrix.DYNAMODB_MUTATION).toBe('NOT_RUN')
    expect(dryRun.counters.reservationsCreated).toBe(0)
    expect(dryRun.counters.mutationsExecuted).toBe(0)

    const fakePoolCtor = vi.fn()
    await expect(
      createControlledPostgresStoreFromEnv(env, {
        pgModule: {
          Pool: fakePoolCtor as unknown as new (cfg: Record<string, unknown>) => never,
        },
      })
    ).rejects.toThrow(/REAL_INTEGRATION_DRY_RUN_ACTIVE/)
    expect(fakePoolCtor).not.toHaveBeenCalled()

    const fakeDynamoClient = {
      transactWriteItems: vi.fn(),
      updateItem: vi.fn(),
      getItem: vi.fn(),
    }
    await expect(
      createControlledDynamoDbStoreFromEnv(
        {
          ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
          ATTESTATION_REAL_INTEGRATION_DRY_RUN: 'true',
          ATTESTATION_DYNAMODB_TABLE: 'kioskopos_attestation_anti_replay',
          ATTESTATION_AWS_REGION: 'sa-east-1',
        },
        { client: fakeDynamoClient }
      )
    ).rejects.toThrow(/REAL_INTEGRATION_DRY_RUN_ACTIVE/)
    expect(fakeDynamoClient.transactWriteItems).not.toHaveBeenCalled()
  })

  it('EXT08-KMS-01: KMS key mismatch, algoritmo inválido, clave no-Ed25519 o conflicto env fallan cerrado', () => {
    const { env } = buildValidStagingEnv()

    const mismatchKeyId = { ...env, ATTESTATION_KMS_KEY_ID: 'ed25519-spki-0000000000000000' }
    const rMismatch = validateInfrastructureConfiguration(mismatchKeyId)
    expect(rMismatch.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(rMismatch.issues.some((i) => i.code === 'KMS_KEY_ID_SPKI_MISMATCH')).toBe(
      true
    )

    const badAlg = {
      ...env,
      ATTESTATION_AWS_KMS_SIGNING_ALGORITHM: 'RSASSA_PKCS1_V1_5_SHA_256',
    }
    const rAlg = validateInfrastructureConfiguration(badAlg)
    expect(rAlg.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(rAlg.issues.some((i) => i.code === 'UNSUPPORTED_SIGNING_ALGORITHM')).toBe(
      true
    )

    const rsaPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    const rsaSpki = rsaPair.publicKey
      .export({ format: 'pem', type: 'spki' })
      .toString()
      .trim()
    const rRsa = validateInfrastructureConfiguration({
      ...env,
      ATTESTATION_PUBLIC_KEY_SPKI: rsaSpki,
    })
    expect(rRsa.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(
      rRsa.issues.some((i) => i.code === 'KMS_PUBLIC_KEY_ALGORITHM_INVALID')
    ).toBe(true)

    expect(() =>
      resolveKmsEnvConfig({
        ATTESTATION_PUBLIC_KEY_SPKI: env.ATTESTATION_PUBLIC_KEY_SPKI,
        ATTESTATION_KMS_PUBLIC_KEY_SPKI: env.ATTESTATION_GO_PUBLIC_KEY_SPKI,
      })
    ).toThrow(/KMS_CONFIGURATION_CONFLICT/)

    expect(() =>
      assertSafeEndpointUrl('http://kms.remote.invalid', 'ATTESTATION_KMS_ENDPOINT')
    ).toThrow(/REAL_INTEGRATION_TLS_REQUIRED/)
  })

  it('EXT08-AUTH-01: OIDC y mTLS inválidos o inseguros fallan cerrado en preflight', () => {
    const { env } = buildValidStagingEnv()

    const insecureOidc = validateInfrastructureConfiguration({
      ...env,
      ATTESTATION_OIDC_JWKS_URI: 'http://auth.remote.example/jwks.json',
    })
    expect(insecureOidc.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(
      insecureOidc.issues.some((i) => i.code === 'OIDC_INSECURE_JWKS_URI_FORBIDDEN')
    ).toBe(true)

    const hs256Oidc = validateInfrastructureConfiguration({
      ...env,
      ATTESTATION_OIDC_ALLOWED_ALGORITHMS: 'HS256',
    })
    expect(hs256Oidc.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(
      hs256Oidc.issues.some((i) => i.code === 'OIDC_ALGORITHM_REJECTED')
    ).toBe(true)

    const metadataJwks = validateInfrastructureConfiguration({
      ...env,
      ATTESTATION_OIDC_JWKS_URI: 'https://169.254.169.254/latest/jwks.json',
    })
    expect(metadataJwks.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(
      metadataJwks.issues.some((i) => i.code === 'OIDC_FORBIDDEN_JWKS_HOST')
    ).toBe(true)

    const invalidMtls = validateInfrastructureConfiguration({
      ...env,
      ATTESTATION_CLIENT_AUTH_MODE: 'MTLS',
      ATTESTATION_MTLS_TRUSTED_CA_PEM: 'NOT_A_PEM_CERT',
      ATTESTATION_MTLS_TRUSTED_CLIENTS_JSON: '[{"clientId":"pos-only"}]',
    })
    expect(invalidMtls.status).toBe(PREFLIGHT_STATUSES.CONFIGURATION_INVALID)
    expect(
      invalidMtls.issues.some((i) => i.code === 'CERTIFICATE_PEM_INVALID')
    ).toBe(true)
    expect(
      invalidMtls.issues.some((i) => i.code === 'CLIENT_AUTH_MTLS_CONFIG_INVALID')
    ).toBe(true)
  })

  it('EXT08-READY-01: /health y /readiness separan disponibilidad operativa de producción aprobada/validada', async () => {
    const provider = new TestSigningProvider({
      authorityId: 'test-ext08-att-authority',
    })
    const guard = new ServiceAntiReplayGuard({ storageType: 'memory' })
    const service = new IndependentAttestationAuthorityService({
      signingProvider: provider,
      antiReplayGuard: guard,
      serviceEnvironment: SERVICE_ENVIRONMENTS.TEST,
      protectedMode: false,
    })

    const health = service.handleHealth()
    const readiness = await service.handleReadiness()

    expect(health.status).toBe('HEALTHY')
    expect(health.authorityRealWorldAvailable).toBe(false)
    expect(health.productionValidated).toBe(false)
    expect(health.productionApproved).toBe(false)

    expect(readiness.ready).toBe(true)
    expect(readiness.readyToSign).toBe(true)
    expect(readiness.readinessState).toBe('SERVICE_READY_TO_SIGN')
    expect(readiness.readinessBoundary).toBe('CONTROLLED_SERVICE_READINESS_ONLY')
    expect(readiness.productionValidated).toBe(false)
    expect(readiness.productionApproved).toBe(false)
    expect(readiness.distributedRealIntegrationTested).toBe(false)
  })

  it('EXT08-STATE-01: prohíbe autopromoción LOCAL_TESTED -> PRODUCTION_VALIDATED y saltos PHASE_0 -> PHASE_6', () => {
    const maturity = evaluateMaturityState({
      unitTestsPassed: true,
      localRuntimeTested: true,
      multiNodeSimulated: true,
    })
    expect(maturity.state).toBe(MATURITY_STATES.SIMULATION_TESTED)
    expect(maturity.productionValidated).toBe(false)
    expect(maturity.autoPromotionBlocked).toBe(true)

    expect(() =>
      assertMaturityPromotionAllowed({
        fromState: MATURITY_STATES.LOCAL_TESTED,
        toState: MATURITY_STATES.PRODUCTION_VALIDATED,
        realEvidenceCount: 1,
      })
    ).toThrow(/MATURITY_PROMOTION_FORBIDDEN/)

    expect(() =>
      assertMaturityPromotionAllowed({
        fromState: MATURITY_STATES.SIMULATION_TESTED,
        toState: MATURITY_STATES.REAL_CONNECTIVITY_TESTED,
        realEvidenceCount: 0,
      })
    ).toThrow(/MATURITY_PROMOTION_FORBIDDEN/)

    const { env } = buildValidStagingEnv()
    env.ATTESTATION_REAL_INTEGRATION_ENABLED = 'true'
    env.ATTESTATION_DEPLOYMENT_CANDIDATE_OPT_IN = 'true'

    expect(() =>
      evaluateIntegrationPhaseGate({
        targetPhase: INTEGRATION_PHASES.PHASE_6_DEPLOYMENT_CANDIDATE,
        completedPhases: [INTEGRATION_PHASES.PHASE_0_CONFIG_VALIDATION],
        env,
        governanceManualSignOff: true,
      })
    ).toThrow(/PHASE_ESCALATION_FORBIDDEN/)

    const priorPhases = INTEGRATION_PHASE_ORDER.slice(0, 6)
    expect(() =>
      evaluateIntegrationPhaseGate({
        targetPhase: INTEGRATION_PHASES.PHASE_6_DEPLOYMENT_CANDIDATE,
        completedPhases: priorPhases,
        env,
        governanceManualSignOff: false,
      })
    ).toThrow(/PHASE_GOVERNANCE_APPROVAL_REQUIRED/)

    const phase1Gate = evaluateIntegrationPhaseGate({
      targetPhase: INTEGRATION_PHASES.PHASE_1_READ_ONLY_CONNECTIVITY,
      completedPhases: [INTEGRATION_PHASES.PHASE_0_CONFIG_VALIDATION],
      env,
    })
    expect(phase1Gate.allowed).toBe(true)
    expect(phase1Gate.productionApproved).toBe(false)
    expect(phase1Gate.remoteGo).toBe('DENIED')
    expect(phase1Gate.p1ImportAllowed).toBe(false)
  })

  it('EXT08-SECRETS-01: Safe Configuration Fingerprint y redactSensitiveConfigText nunca filtran contraseñas ni tokens', () => {
    const { env } = buildValidStagingEnv()
    const pgSecret = 'SuperSecretPgPass123!'
    const privatePemMarker = '-----BEGIN PRIVATE KEY-----\nTOPSECRETKEYMATERIAL\n-----END PRIVATE KEY-----'

    const fingerprint = buildSafeConfigurationFingerprint(env)
    const serialized = JSON.stringify(fingerprint)

    expect(fingerprint.secretsIncluded).toBe(false)
    expect(fingerprint.postgresHost).toBe('att-pg-dedicated.internal')
    expect(fingerprint.postgresPort).toBe(5432)
    expect(fingerprint.postgresDatabase).toBe('att_anti_replay')
    expect(fingerprint.postgresSslMode).toBe('verify-full')
    expect(fingerprint.kmsProvider).toBe('AWS_KMS')
    expect(fingerprint.oidcJwksHost).toBe('auth.internal.kioskopos.invalid')
    expect(fingerprint.configFingerprintSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(serialized).not.toContain(pgSecret)
    expect(serialized).not.toContain('att_svc_user')

    const redacted = redactSensitiveConfigText(
      `postgres://user:${pgSecret}@db.internal:5432/db?token=SecretTok Bearer abc.def.ghi ${privatePemMarker}`
    )
    expect(redacted).not.toContain(pgSecret)
    expect(redacted).not.toContain('SecretTok')
    expect(redacted).not.toContain('abc.def.ghi')
    expect(redacted).not.toContain('TOPSECRETKEYMATERIAL')
    expect(redacted).toContain('[REDACTED]')
  })

  it('EXT08-AUDIT-01: endurecimiento Step 2 clasifica contención SQL 40001 y TransactionConflict DynamoDB fail-closed sin falsos conflictos', async () => {
    const pgStore = new PostgresDistributedAntiReplayStore({
      queryClient: {
        query: async () => {
          const err = Object.assign(new Error('could not serialize access'), {
            code: '40001',
          })
          throw err
        },
        transaction: async <T>(
          fn: (tx: {
            readonly query: () => Promise<{ readonly rows: readonly []; readonly rowCount: number }>
          }) => Promise<T>
        ): Promise<T> =>
          await fn({
            query: async () => {
              const err = Object.assign(new Error('could not serialize access'), {
                code: '40001',
              })
              throw err
            },
          }),
      },
    })

    await expect(
      pgStore.reserveOnce({
        requestId: 'req-ext08-pg-40001',
        attestationId: 'att-ext08-pg-40001',
        requestSha256: 'a'.repeat(64),
      })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_LOCK_CONTENTION/)

    const ddbStore = new DynamoDbDistributedAntiReplayStore({
      client: {
        transactWriteItems: async () => {
          const err = Object.assign(new Error('Transaction canceled'), {
            name: 'TransactionCanceledException',
            CancellationReasons: [
              { Code: 'TransactionConflict' },
              { Code: 'None' },
              { Code: 'None' },
            ],
          })
          throw err
        },
        updateItem: async () => ({}),
        getItem: async () => ({}),
      },
    })

    await expect(
      ddbStore.reserveOnce({
        requestId: 'req-ext08-ddb-conflict',
        attestationId: 'att-ext08-ddb-conflict',
        requestSha256: 'b'.repeat(64),
      })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_LOCK_CONTENTION/)
  })
})
