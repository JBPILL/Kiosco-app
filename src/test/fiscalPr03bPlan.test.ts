import { describe, it, expect, vi } from 'vitest'
import {
  ARCA_NETWORK_DISABLED,
  PR03_B_SCOPE,
  PR03_B_TEST_FIXTURE_TAG,
  PR03_B_APPROVED_KIOSK_ID,
  PR03_B_APPROVED_CUIT,
  PR03_B_APPROVED_PUNTO_VENTA,
  PR03_B_APPROVED_TIPO_COMPROBANTE,
  PR03_B_PREFLIGHT_SQL,
  PR03_B_CLEANUP_SQL,
  PR03_B_TEST_CASES,
  assertNoArcaNetwork,
  verifyNoExternalFiscalTransport,
  createAntiArcaFetch,
  createPr03bTestFixture,
  createPr03bScopedFixture,
  canonicalJson,
  computeSha256,
  validateCleanupTarget,
  validateCleanupRunId,
  verifyPr03bPreflight,
  buildScopedCleanupSql,
  verifyIdempotencyReplay,
  verifyIdempotencyConflict,
  verifyConcurrencyNumbering,
  verifyPr03bPlan,
} from '../../scripts/fiscal/plan-pr03-b-staging.mjs'
import {
  PR03_B_EXECUTION_TARGET,
  checkPr03bEnvironment,
  runPr03bPreparation,
  assertNoForbiddenCredentials,
  validatePr03bCliArgs,
  executePr03bStaging,
} from '../../scripts/fiscal/execute-pr03-b-staging.mjs'

describe('PR03-B Staging Acceptance Plan & Real PG Executor Tests', () => {
  describe('1. Fixture Contract', () => {
    it('creates fixture with approved parameters, tag, and canonical hash', () => {
      const fixture = createPr03bTestFixture()

      expect(fixture.tag).toBe(PR03_B_TEST_FIXTURE_TAG)
      expect(fixture.scope).toBe(PR03_B_SCOPE)
      expect(fixture.kiosco_id).toBe(PR03_B_APPROVED_KIOSK_ID)
      expect(PR03_B_APPROVED_KIOSK_ID).toBe('b7254826-c767-4098-94b8-71013c12021d')
      expect(fixture.cuit_emisor).toBe('20415005963')
      expect(fixture.punto_venta).toBe(2)
      expect(fixture.tipo_comprobante).toBe(11)
      expect(fixture.operacion_id).toBeDefined()
      expect(fixture.venta_id).toBeDefined()
      expect(fixture.metadata.fixture).toBe(PR03_B_TEST_FIXTURE_TAG)
      expect(fixture.metadata.anti_arca_guard).toBe(true)

      const expectedCanonical = canonicalJson(fixture.solicitud)
      expect(fixture.cuerpo_canonico).toBe(expectedCanonical)
      expect(fixture.solicitud_sha256).toBe(computeSha256(expectedCanonical))
      expect(fixture.solicitud_sha256).toMatch(/^[0-9a-f]{64}$/)
    })

    it('creates scoped fixture bound to run_id with unique UUIDs', () => {
      const runId = 'a1b2c3d4-e5f6-4a1b-8c2d-123456789abc'
      const scoped = createPr03bScopedFixture(runId, { total: '150.00', numero: 1 })

      expect(scoped.run_id).toBe(runId)
      expect(scoped.contexto.run_id).toBe(runId)
      expect(scoped.contexto.fixture).toBe(PR03_B_TEST_FIXTURE_TAG)
      expect(scoped.metadata.run_id).toBe(runId)
      expect(scoped.total).toBe('150.00')
    })

    it('validates run_id UUID format and rejects malformed values', () => {
      expect(validateCleanupRunId('a1b2c3d4-e5f6-4a1b-8c2d-123456789abc')).toBe(true)
      expect(() => validateCleanupRunId('not-a-uuid')).toThrow('INVALID_CLEANUP_RUN_ID')
      expect(() => validateCleanupRunId('')).toThrow('INVALID_CLEANUP_RUN_ID')
    })

    it('rejects plan configuration with wrong kiosk or unapproved parameters', () => {
      expect(() =>
        verifyPr03bPlan({
          scope: PR03_B_SCOPE,
          kiosco_id: 'unapproved-kiosk-id',
          cuit_emisor: PR03_B_APPROVED_CUIT,
          punto_venta: PR03_B_APPROVED_PUNTO_VENTA,
          tipo_comprobante: PR03_B_APPROVED_TIPO_COMPROBANTE,
          anti_arca_guard: true,
          catalog_revision_3_excluded: true,
        })
      ).toThrow('PR03_B_PLAN_KIOSK_MISMATCH')
    })
  })

  describe('2. Anti-ARCA Guard & Transport Reachability', () => {
    it('enforces ARCA_NETWORK_DISABLED flag and static transport check', () => {
      expect(ARCA_NETWORK_DISABLED).toBe(true)
      const check = verifyNoExternalFiscalTransport()
      expect(check.arcaTransportReachable).toBe(false)
      expect(check.status).toBe('PASS')
    })

    it('blocks AFIP, ARCA, WSAA, and WSFE endpoints with fatal error', () => {
      expect(() => assertNoArcaNetwork('https://wsaa.afip.gob.ar/ws/services/LoginCms')).toThrow(
        'FATAL: ARCA_CALL_ATTEMPTED_IN_PR03_B'
      )
      expect(() => assertNoArcaNetwork('https://servicios1.afip.gov.ar/wsfev1/service.asmx')).toThrow(
        'FATAL: ARCA_CALL_ATTEMPTED_IN_PR03_B'
      )
      expect(() => assertNoArcaNetwork('https://arca.gob.ar/api')).toThrow(
        'FATAL: ARCA_CALL_ATTEMPTED_IN_PR03_B'
      )
      expect(() => assertNoArcaNetwork('')).toThrow(
        'FATAL: ARCA_CALL_ATTEMPTED_IN_PR03_B'
      )
    })

    it('allows non-ARCA internal test endpoints without throwing', () => {
      expect(() => assertNoArcaNetwork('https://supabase-internal.local/test')).not.toThrow()
    })

    it('anti-ARCA fetch interceptor aborts immediately on dispatch', () => {
      const antiFetch = createAntiArcaFetch()
      expect(() => antiFetch('https://wsaa.afip.gob.ar/ws/services/LoginCms')).toThrow(
        'FATAL: ARCA_CALL_ATTEMPTED_IN_PR03_B'
      )
    })
  })

  describe('3. Credential Safety & CLI Argument Validation', () => {
    it('accepts safe direct PostgreSQL password and rejects tokens/keys', () => {
      expect(() => assertNoForbiddenCredentials('SafePgPassw0rd!#')).not.toThrow()
      expect(() => assertNoForbiddenCredentials('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')).toThrow(
        'FORBIDDEN_CREDENTIAL_TYPE'
      )
      expect(() => assertNoForbiddenCredentials('service_role_secret_key_123')).toThrow(
        'FORBIDDEN_CREDENTIAL_TYPE'
      )
      expect(() => assertNoForbiddenCredentials('sbp_test_personal_access_token')).toThrow(
        'FORBIDDEN_CREDENTIAL_TYPE'
      )
      expect(() => assertNoForbiddenCredentials('-----BEGIN CERTIFICATE-----...')).toThrow(
        'FORBIDDEN_CREDENTIAL_TYPE'
      )
    })

    it('parses CLI arguments accurately', () => {
      const dryArgs = validatePr03bCliArgs([])
      expect(dryArgs.authorized).toBe(false)
      expect(dryArgs.dryRun).toBe(true)

      const authArgs = validatePr03bCliArgs([
        '--authorized',
        '--scope',
        PR03_B_SCOPE,
        '--run-id',
        '12345678-1234-1234-1234-123456789abc',
      ])
      expect(authArgs.authorized).toBe(true)
      expect(authArgs.dryRun).toBe(false)
      expect(authArgs.scope).toBe(PR03_B_SCOPE)
      expect(authArgs.runId).toBe('12345678-1234-1234-1234-123456789abc')
    })
  })

  describe('4. Idempotency & Concurrency Verification Logic', () => {
    it('verifies idempotent replay with identical parameters', () => {
      const opId = 'f1a9a832-7234-4bc3-95d1-123456789abc'
      const hash = 'a'.repeat(64)
      const first = {
        operacion_id: opId,
        numero: 42,
        solicitud_sha256: hash,
        estado: 'RESERVADA',
      }
      const replay = {
        operacion_id: opId,
        numero: 42,
        solicitud_sha256: hash,
        estado: 'RESERVADA',
      }

      const result = verifyIdempotencyReplay(first, replay)
      expect(result.status).toBe('PASS')
      expect(result.identicalReservation).toBe(true)
      expect(result.mutated).toBe(false)
      expect(result.numero).toBe(42)
    })

    it('rejects replay if number mutated unexpectedly', () => {
      const opId = 'f1a9a832-7234-4bc3-95d1-123456789abc'
      const first = { operacion_id: opId, numero: 42, solicitud_sha256: 'a'.repeat(64), estado: 'RESERVADA' }
      const replay = { operacion_id: opId, numero: 43, solicitud_sha256: 'a'.repeat(64), estado: 'RESERVADA' }

      expect(() => verifyIdempotencyReplay(first, replay)).toThrow('IDEMPOTENCY_REPLAY_NUMERO_MUTATED')
    })

    it('verifies rejection of conflicting payload with error 40001 or 22023', () => {
      const error = new Error('No se confirmó el cuerpo fiscal o ya existe otro.')
      Object.assign(error, { code: '40001' })

      const result = verifyIdempotencyConflict(error)
      expect(result.status).toBe('PASS')
      expect(result.rejectedWithExpectedCode).toBe(true)
      expect(result.errorCode).toBe('40001')
    })

    it('verifies serial ordering of sequential numbers without collisions', () => {
      const workerA = { operacion_id: 'op-1', numero: 101, estado: 'RESERVADA' }
      const workerB = { operacion_id: 'op-2', numero: 102, estado: 'RESERVADA' }

      const result = verifyConcurrencyNumbering([workerA, workerB])
      expect(result.status).toBe('PASS')
      expect(result.serialized).toBe(true)
      expect(result.collisionCount).toBe(0)
      expect(result.uniqueNumbers).toBe(true)
      expect(result.assignedNumbers).toEqual([101, 102])
    })

    it('detects and rejects number collision in concurrent reservations', () => {
      const workerA = { operacion_id: 'op-1', numero: 101, estado: 'RESERVADA' }
      const workerB = { operacion_id: 'op-2', numero: 101, estado: 'RESERVADA' }

      expect(() => verifyConcurrencyNumbering([workerA, workerB])).toThrow(
        'CONCURRENCY_NUMBERING_COLLISION_DETECTED'
      )
    })
  })

  describe('5. Preflight READ ONLY & Postcheck Logic', () => {
    it('preflight SQL enforces read only transaction and rollback', () => {
      expect(PR03_B_PREFLIGHT_SQL).toContain('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
      expect(PR03_B_PREFLIGHT_SQL).toContain('ROLLBACK')
      expect(PR03_B_PREFLIGHT_SQL).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s+public\./)
    })

    it('verifies compliant preflight state', () => {
      const raw = {
        transaction_read_only: 'on',
        observed_at: new Date().toISOString(),
        kiosk_active: true,
        expected_issuer_present: true,
        expected_issuer_enabled: false,
        unexpected_enabled_issuers: 0,
        pos_present: true,
        catalog_rev3_exists: false,
        residual_fixtures_count: 0,
        pending_series_reservations_count: 0,
      }
      const verified = verifyPr03bPreflight(raw)
      expect(verified.status).toBe('PASS')
      expect(verified.residualFixturesCount).toBe(0)
      expect(verified.pendingSeriesReservationsCount).toBe(0)
    })

    it('blocks preflight if residual fixtures or pending reservations are present', () => {
      expect(() =>
        verifyPr03bPreflight({
          transaction_read_only: 'on',
          kiosk_active: true,
          expected_issuer_present: true,
          expected_issuer_enabled: false,
          unexpected_enabled_issuers: 0,
          pos_present: true,
          catalog_rev3_exists: false,
          residual_fixtures_count: 1,
          pending_series_reservations_count: 0,
        })
      ).toThrow('PR03_B_PREFLIGHT_RESIDUAL_FIXTURES_FOUND')

      expect(() =>
        verifyPr03bPreflight({
          transaction_read_only: 'on',
          kiosk_active: true,
          expected_issuer_present: true,
          expected_issuer_enabled: false,
          unexpected_enabled_issuers: 0,
          pos_present: true,
          catalog_rev3_exists: false,
          residual_fixtures_count: 0,
          pending_series_reservations_count: 1,
        })
      ).toThrow('PR03_B_PREFLIGHT_PENDING_SERIES_RESERVATIONS_FOUND')
    })
  })

  describe('6. Scoped Cleanup Contract & Atomic Test Cases', () => {
    it('scoped cleanup SQL restricts deletion strictly to run_id', () => {
      const runId = 'e2b3c4d5-1234-4bc3-95d1-123456789abc'
      const sql = buildScopedCleanupSql(runId)

      expect(sql).toContain(`contexto->>'run_id' = '${runId}'`)
      expect(sql).toContain("contexto->>'fixture' = 'PR03_B_TEST_FIXTURE'")
      expect(sql).not.toMatch(/\bDELETE FROM public\.fiscal_series_homologacion\b/i)
      expect(sql).not.toMatch(/\bDELETE FROM public\.ventas\b/i)
    })

    it('cleanup SQL targets strictly tagged rows and never touches real commercial data', () => {
      expect(PR03_B_CLEANUP_SQL).toContain("contexto->>'tag' = 'PR03_B_TEST_FIXTURE'")
      expect(PR03_B_CLEANUP_SQL).not.toMatch(/\bDELETE FROM public\.ventas\b/i)
      expect(PR03_B_CLEANUP_SQL).not.toMatch(/\bDELETE FROM public\.kioscos\b/i)
      expect(PR03_B_CLEANUP_SQL).not.toMatch(/\bDELETE FROM public\.usuarios\b/i)
    })

    it('validates cleanup target tag guard', () => {
      expect(validateCleanupTarget({ tag: 'PR03_B_TEST_FIXTURE' })).toBe(true)
      expect(() => validateCleanupTarget({ tag: 'REAL_SALE' })).toThrow('CLEANUP_TARGET_NOT_TAGGED')
      expect(() => validateCleanupTarget({})).toThrow('CLEANUP_TARGET_NOT_TAGGED')
    })

    it('contains all 3 required atomic test cases', () => {
      expect(PR03_B_TEST_CASES).toHaveLength(3)
      const ids = PR03_B_TEST_CASES.map(tc => tc.id)
      expect(ids).toContain('PRUEBA_IDEMPOTENCIA_REPLAY')
      expect(ids).toContain('PRUEBA_IDEMPOTENCIA_CONFLICT')
      expect(ids).toContain('PRUEBA_CONCURRENCIA_NUMERACION')
    })
  })

  describe('7. Environment & Dry-Run Guarding', () => {
    it('passes environment check and dry-run with 0 staging writes and 0 arca calls', async () => {
      const check = checkPr03bEnvironment()
      expect(check.status).toBe('PASS')
      expect(check.antiArcaGuard).toBe('PASS')
      expect(check.arcaTransportReachable).toBe(false)
      expect(check.planValidation).toBe('PASS')
      expect(check.fixtureValidation).toBe('PASS')

      const prep = await runPr03bPreparation()
      expect(prep.readyForAuthorizedExecution).toBe(true)
      expect(prep.stagingWritesAttempted).toBe(0)
      expect(prep.arcaCallsAttempted).toBe(0)
    })

    it('dry-run mode does not connect or write and reports readyForRemoteExecution = false', async () => {
      const clientFactoryMock = vi.fn()
      const result = await executePr03bStaging({ authorized: false }, { clientFactory: clientFactoryMock })

      expect(result.execution).toBe('DRY_RUN')
      if (result.execution === 'DRY_RUN') {
        expect(result.readyForRemoteExecution).toBe(false)
        expect(result.stagingWrites).toBe(0)
        expect(result.arcaCalls).toBe(0)
      }
      expect(clientFactoryMock).not.toHaveBeenCalled()
    })

    it('rejects authorized execution with invalid projectRef or scope', async () => {
      await expect(
        executePr03bStaging({ authorized: true, projectRef: 'wrong-project', password: 'test' })
      ).rejects.toThrow('PROJECT_REF_MISMATCH')

      await expect(
        executePr03bStaging({ authorized: true, scope: 'WRONG_SCOPE', password: 'test' })
      ).rejects.toThrow('SCOPE_MISMATCH')
    })

    it('rejects authorized execution if password is missing', async () => {
      await expect(
        executePr03bStaging({ authorized: true, password: '' })
      ).rejects.toThrow('PG_PASSWORD_REQUIRED')
    })
  })

  describe('8. Controlled Mock PostgreSQL Execution (Replay, Conflict, Concurrency, Postcheck, Cleanup)', () => {
    it('executes full authorized workflow and reports structured results', async () => {
      const runId = 'bbbbbbbb-1111-4222-8333-cccccccccccc'

      const makeFakeClient = (id: string) => {
        const executedQueries: string[] = []
        return {
          id,
          executedQueries,
          connect: vi.fn().mockResolvedValue(undefined),
          query: vi.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
            executedQueries.push(sql)

            if (sql.includes('SELECT jsonb_build_object') && sql.includes('transaction_read_only')) {
              return {
                rows: [
                  {
                    preflight: {
                      transaction_read_only: 'on',
                      observed_at: new Date().toISOString(),
                      kiosk_active: true,
                      expected_issuer_present: true,
                      expected_issuer_enabled: false,
                      unexpected_enabled_issuers: 0,
                      pos_present: true,
                      catalog_rev3_exists: false,
                      residual_fixtures_count: 0,
                      pending_series_reservations_count: 0,
                    },
                  },
                ],
                rowCount: 1,
              }
            }

            if (sql.includes('SELECT count(*)::int as count FROM public.fiscal_operaciones_homologacion WHERE id = $1')) {
              return { rows: [{ count: 0 }], rowCount: 1 }
            }

            if (sql.includes('persistir_solicitud_fiscal_homologacion')) {
              if (params && typeof params[1] === 'string' && params[1].includes('"total":"200.00"')) {
                const err = new Error('No se confirmó el cuerpo fiscal o ya existe otro.')
                Object.assign(err, { code: '40001' })
                throw err
              }
              return {
                rows: [
                  {
                    ack: {
                      operacion_id: params ? params[0] : 'op-1',
                      numero: 101,
                      solicitud_sha256: params ? params[2] : 'sha-1',
                      estado: 'RESERVADA',
                    },
                  },
                ],
                rowCount: 1,
              }
            }

            if (sql.includes('reservar_numero_fiscal_homologacion')) {
              const num = id === 'client1' ? 101 : 102
              return {
                rows: [
                  {
                    ack: {
                      operacion_id: params ? params[0] : 'op-x',
                      numero: num,
                      estado: 'RESERVADA',
                    },
                  },
                ],
                rowCount: 1,
              }
            }

            if (sql.includes('commercial_sales_mutated')) {
              return {
                rows: [
                  {
                    postcheck: {
                      commercial_sales_mutated: 0,
                      commercial_payments_mutated: 0,
                      commercial_stock_mutated: 0,
                      arca_calls: 0,
                      residual_run_rows: 0,
                    },
                  },
                ],
                rowCount: 1,
              }
            }

            return { rows: [], rowCount: 1 }
          }),
          end: vi.fn().mockResolvedValue(undefined),
        }
      }

      let clientCount = 0
      const client1 = makeFakeClient('client1')
      const client2 = makeFakeClient('client2')

      const clientFactoryMock = vi.fn().mockImplementation(async () => {
        clientCount++
        return clientCount === 1 ? client1 : client2
      })

      const report = await executePr03bStaging(
        {
          authorized: true,
          scope: PR03_B_SCOPE,
          projectRef: PR03_B_EXECUTION_TARGET,
          password: 'mockValidPassword123',
          runId,
        },
        { clientFactory: clientFactoryMock }
      )

      expect(report.execution).toBe('AUTHORIZED_EXECUTION')
      if (report.execution === 'AUTHORIZED_EXECUTION') {
        expect(report.PR03_B_EXECUTION).toBe('PASS')
        expect(report.IDEMPOTENCY_REPLAY).toBe('PASS')
        expect(report.IDEMPOTENCY_CONFLICT).toBe('PASS')
        expect(report.CONFLICT_SQLSTATE).toBe('40001')
        expect(report.NUMBERING_CONCURRENCY).toBe('PASS')
        expect(report.PREFLIGHT_READ_ONLY).toBe('PASS')
        expect(report.RUN_ID).toBe(runId)
        expect(report.ARCA_CALLS).toBe(0)
        expect(report.COMMERCIAL_WRITES).toBe(0)
        expect(report.PG_CONNECTIONS_CLOSED).toBe('PASS')
      }
      expect(clientFactoryMock).toHaveBeenCalledTimes(2)
      expect(client1.end).toHaveBeenCalled()
      expect(client2.end).toHaveBeenCalled()
    })

    it('rolls back and cleans up gracefully if an unexpected mid-run error occurs without retry loop', async () => {
      const runId = 'cccccccc-2222-4333-8444-dddddddddddd'
      const client = {
        connect: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('transaction_read_only')) {
            return {
              rows: [
                {
                  preflight: {
                    transaction_read_only: 'on',
                    observed_at: new Date().toISOString(),
                    kiosk_active: true,
                    expected_issuer_present: true,
                    expected_issuer_enabled: false,
                    unexpected_enabled_issuers: 0,
                    pos_present: true,
                    catalog_rev3_exists: false,
                    residual_fixtures_count: 0,
                    pending_series_reservations_count: 0,
                  },
                },
              ],
            }
          }
          if (sql.includes('INSERT INTO public.fiscal_operaciones_homologacion')) {
            throw new Error('SIMULATED_MID_RUN_DATABASE_ERROR')
          }
          return { rows: [] }
        }),
        end: vi.fn().mockResolvedValue(undefined),
      }

      await expect(
        executePr03bStaging(
          {
            authorized: true,
            scope: PR03_B_SCOPE,
            projectRef: PR03_B_EXECUTION_TARGET,
            password: 'mockValidPassword123',
            runId,
          },
          { clientFactory: vi.fn().mockResolvedValue(client) }
        )
      ).rejects.toThrow('SIMULATED_MID_RUN_DATABASE_ERROR')

      expect(client.query).toHaveBeenCalledWith('ROLLBACK')
      expect(client.end).toHaveBeenCalled()
    })
  })
})
