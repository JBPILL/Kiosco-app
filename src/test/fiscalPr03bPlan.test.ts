import { describe, it, expect, vi } from 'vitest'
import {
  ARCA_NETWORK_DISABLED,
  PR03_B_SCOPE,
  PR03_B_TEST_FIXTURE_TAG,
  PR03_B_APPROVED_KIOSK_ID,
  PR03_B_APPROVED_CUIT,
  PR03_B_APPROVED_PUNTO_VENTA,
  PR03_B_APPROVED_TIPO_COMPROBANTE,
  PR03_B_REAL_KIOSK_ID,
  PR03_B_SYNTHETIC_KIOSK_ID,
  PR03_B_SYNTHETIC_OWNER_AUTH_ID,
  PR03_B_SYNTHETIC_PV,
  PR03_B_SYNTHETIC_CUIT,
  PR03_B_SYNTHETIC_RECEIPT_TYPE,
  PR03_B_SYNTHETIC_PV_CANDIDATES,
  PR03_B_PREFLIGHT_SELECT_SQL,
  PR03_B_COMMERCIAL_BASELINE_SQL,
  PR03_B_TEST_CASES,
  assertNoArcaNetwork,
  assertNoRealPv2Usage,
  SYNTHETIC_EMITTER_ROW_SUPPORTED,
  CANONICAL_PREPARATION_REQUIRES_CONFIGURED_SYNTHETIC_PV,
  PR03_B_BLOCKED_BY_SCHEMA,
  verifyNoExternalFiscalTransport,
  createAntiArcaFetch,
  createPr03bTestFixture,
  createPr03bScopedFixture,
  canonicalJson,
  computeSha256,
  validateCleanupTarget,
  validateCleanupRunId,
  verifyPr03bPreflight,
  computeCommercialBaselineHash,
  buildManifestCleanupSql,
  verifyIdempotencyReplay,
  verifyIdempotencyConflict,
  verifyConcurrencySinglePendingReservation,
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
      expect(fixture.kiosco_id).toBe(PR03_B_SYNTHETIC_KIOSK_ID)
      expect(PR03_B_REAL_KIOSK_ID).toBe('b7254826-c767-4098-94b8-71013c12021d')
      expect(PR03_B_APPROVED_KIOSK_ID).toBe('b7254826-c767-4098-94b8-71013c12021d')
      expect(PR03_B_SYNTHETIC_KIOSK_ID).toBe('f4a00000-2026-4011-a001-000000000001')
      expect(PR03_B_SYNTHETIC_OWNER_AUTH_ID).toBe('f6af0f21-07f2-4d22-9b3c-7eec3604d5af')
      expect(fixture.cuit_emisor).toBe('20415005963')
      expect(fixture.punto_venta).toBe(9999)
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

    it('creates scoped fixture respecting canonical 5 preparation keys and private preparation route', () => {
      const runId = 'a1b2c3d4-e5f6-4a1b-8c2d-123456789abc'
      const scoped = createPr03bScopedFixture(runId, { puntoVenta: 9999, total: '150.00', numero: 1, revisionParametros: 3 })

      expect(scoped.run_id).toBe(runId)
      expect(scoped.punto_venta).toBe(9999)
      expect(scoped.contexto).toEqual({
        version: 1,
        cuit_emisor: PR03_B_APPROVED_CUIT,
        punto_venta: 9999,
        tipo_comprobante: PR03_B_APPROVED_TIPO_COMPROBANTE,
        tipo_doc_receptor: 99,
        nro_doc_receptor: '0',
      })
      // 5 claves estrictas de guardar_datos_preparacion_homologacion
      expect(Object.keys(scoped.preparacion).sort()).toEqual([
        'condicionEmisor',
        'datos',
        'revision_parametros',
        'venta_id',
        'version',
      ])
      // El objeto datos de preparación no debe contener el campo 'numero'
      expect(scoped.preparacion.datos).not.toHaveProperty('numero')
      expect(scoped.preparacion_sha256).toMatch(/^[0-9a-f]{64}$/)
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

    it('verifies rejection of conflicting payload with error 40001 and rejects 22023 or other codes', () => {
      const error = new Error('No se confirmó el cuerpo fiscal o ya existe otro.')
      Object.assign(error, { code: '40001' })

      const result = verifyIdempotencyConflict(error)
      expect(result.status).toBe('PASS')
      expect(result.rejectedWithExpectedCode).toBe(true)
      expect(result.errorCode).toBe('40001')

      // Debe rechazar 22023
      const err22023 = Object.assign(new Error('Invalid'), { code: '22023' })
      expect(() => verifyIdempotencyConflict(err22023)).toThrow('IDEMPOTENCY_CONFLICT_UNEXPECTED_SQLSTATE')

      // Debe rechazar error sin código o con código distinto
      expect(() => verifyIdempotencyConflict(new Error('Generic'))).toThrow('IDEMPOTENCY_CONFLICT_UNEXPECTED_SQLSTATE')
    })

    it('enforces assertNoRealPv2Usage guard strictly forbidding PV 2 in operations', () => {
      expect(() => assertNoRealPv2Usage(2)).toThrow('FATAL: PR03_B_REAL_FISCAL_CONTEXT_FORBIDDEN')
      expect(() => assertNoRealPv2Usage('2')).toThrow('FATAL: PR03_B_REAL_FISCAL_CONTEXT_FORBIDDEN')
      expect(() => assertNoRealPv2Usage({ punto_venta: 2 })).toThrow('FATAL: PR03_B_REAL_FISCAL_CONTEXT_FORBIDDEN')
      expect(() => assertNoRealPv2Usage({ puntoVenta: 2 })).toThrow('FATAL: PR03_B_REAL_FISCAL_CONTEXT_FORBIDDEN')
      expect(() => assertNoRealPv2Usage(PR03_B_REAL_KIOSK_ID)).toThrow('FATAL: PR03_B_REAL_FISCAL_CONTEXT_FORBIDDEN')
      expect(() => assertNoRealPv2Usage({ kiosco_id: PR03_B_REAL_KIOSK_ID })).toThrow('FATAL: PR03_B_REAL_FISCAL_CONTEXT_FORBIDDEN')
      expect(() => assertNoRealPv2Usage(9999)).not.toThrow()
      expect(() => assertNoRealPv2Usage({ punto_venta: 9999 })).not.toThrow()
      expect(() => assertNoRealPv2Usage(PR03_B_SYNTHETIC_KIOSK_ID)).not.toThrow()
    })

    it('exports canonical schema audit conclusions', () => {
      expect(SYNTHETIC_EMITTER_ROW_SUPPORTED).toBe(true)
      expect(CANONICAL_PREPARATION_REQUIRES_CONFIGURED_SYNTHETIC_PV).toBe(true)
      expect(PR03_B_BLOCKED_BY_SCHEMA).toBe(false)
    })

    it('verifies single pending reservation contract and lock serialization', () => {
      const check = {
        lockObserved: true,
        simultaneousPendingReservations: false,
        numberCollision: false,
      }

      const result = verifyConcurrencySinglePendingReservation(check)
      expect(result.status).toBe('PASS')
      expect(result.concurrencyExpectation).toBe('SINGLE_PENDING_RESERVATION')
      expect(result.lockSerialization).toBe('PASS')
      expect(result.noSimultaneousPendingReservations).toBe(true)
      expect(result.numberCollision).toBe(false)
    })

    it('throws if lock was not observed during concurrency race', () => {
      expect(() =>
        verifyConcurrencySinglePendingReservation({
          lockObserved: false,
          simultaneousPendingReservations: false,
          numberCollision: false,
        })
      ).toThrow('CONCURRENCY_LOCK_NOT_OBSERVED')
    })

    it('throws if simultaneous pending reservations occurred', () => {
      expect(() =>
        verifyConcurrencySinglePendingReservation({
          lockObserved: true,
          simultaneousPendingReservations: true,
          numberCollision: false,
        })
      ).toThrow('CONCURRENCY_VIOLATION')
    })
  })

  describe('5. Preflight & Cryptographic Commercial Baseline', () => {
    it('preflight SQL is a pure SELECT with zero embedded BEGIN/COMMIT/ROLLBACK', () => {
      expect(PR03_B_PREFLIGHT_SELECT_SQL.trim().startsWith('SELECT')).toBe(true)
      expect(PR03_B_PREFLIGHT_SELECT_SQL).not.toMatch(/\b(?:BEGIN|COMMIT|ROLLBACK)\b/i)
      expect(PR03_B_PREFLIGHT_SELECT_SQL).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/i)
    })

    it('verifies compliant preflight state with synthetic sales and candidate PVs', () => {
      const raw = {
        transaction_read_only: 'on',
        observed_at: new Date().toISOString(),
        real_kiosk_present: true,
        real_pv2_present: true,
        real_pv2_enabled: false,
        real_pv2_series_count: 0,
        real_pv2_pending_reservations: 0,
        synthetic_kiosk_present: true,
        synthetic_kiosk_active: true,
        synthetic_owner_present: true,
        synthetic_owner_active: true,
        synthetic_owner_role: 'DUEÑO',
        synthetic_owner_superadmin: false,
        synthetic_emitter_count: 0,
        synthetic_pv9999_series_count: 0,
        synthetic_pv9999_reservations: 0,
        synthetic_fiscal_operations: 0,
        catalog_rev3_exists: true,
        catalog_rev3_enabled: true,
        catalog_rev3_usable: true,
        synthetic_sales: [
          { id: '11111111-1111-4111-8111-111111111111', kiosco_id: PR03_B_SYNTHETIC_KIOSK_ID, total: '150.00', estado: 'COMPLETADA' },
          { id: '22222222-2222-4222-8222-222222222222', kiosco_id: PR03_B_SYNTHETIC_KIOSK_ID, total: '200.00', estado: 'COMPLETADA' },
        ],
      }
      const verified = verifyPr03bPreflight(raw)
      expect(verified.status).toBe('PASS')
      expect(verified.syntheticSalesCount).toBe(2)
      expect(verified.chosenSyntheticPv).toBe(9999)
      expect(PR03_B_SYNTHETIC_PV_CANDIDATES).toContain(verified.chosenSyntheticPv)
    })

    it('blocks preflight if insufficient synthetic test sales exist', () => {
      expect(() =>
        verifyPr03bPreflight({
          transaction_read_only: 'on',
          real_kiosk_present: true,
          real_pv2_present: true,
          real_pv2_enabled: false,
          real_pv2_series_count: 0,
          real_pv2_pending_reservations: 0,
          synthetic_kiosk_present: true,
          synthetic_kiosk_active: true,
          synthetic_owner_present: true,
          synthetic_owner_active: true,
          synthetic_owner_role: 'DUEÑO',
          synthetic_owner_superadmin: false,
          synthetic_emitter_count: 0,
          synthetic_pv9999_series_count: 0,
          synthetic_pv9999_reservations: 0,
          synthetic_fiscal_operations: 0,
          catalog_rev3_exists: true,
          catalog_rev3_enabled: true,
          catalog_rev3_usable: true,
          synthetic_sales: [
            { id: '11111111-1111-4111-8111-111111111111', kiosco_id: PR03_B_SYNTHETIC_KIOSK_ID, total: '150.00', estado: 'COMPLETADA' },
          ],
        })
      ).toThrow('PR03_B_PREFLIGHT_INSUFFICIENT_SYNTHETIC_TEST_SALES')
    })

    it('computes deterministic SHA-256 over commercial baseline', () => {
      expect(PR03_B_COMMERCIAL_BASELINE_SQL).toContain('SELECT jsonb_build_object')
      expect(PR03_B_COMMERCIAL_BASELINE_SQL).toContain('ventas_count')
      expect(PR03_B_COMMERCIAL_BASELINE_SQL).toContain('ventas_digest')

      const b1 = { ventas_count: 10, ventas_digest: 'abc', productos_count: 5 }
      const b2 = { productos_count: 5, ventas_digest: 'abc', ventas_count: 10 }
      const h1 = computeCommercialBaselineHash(b1)
      const h2 = computeCommercialBaselineHash(b2)
      expect(h1).toBe(h2)
      expect(h1).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  describe('6. Manifest Cleanup Contract & Atomic Test Cases', () => {
    it('manifest cleanup SQL restricts deletion strictly to operation UUID list and synthetic PV', () => {
      const op1 = 'e2b3c4d5-1234-4bc3-95d1-123456789abc'
      const op2 = 'f3c4d5e6-2345-4cd4-a6e2-23456789abcd'
      const sql = buildManifestCleanupSql([op1, op2], { syntheticPv: 9999 })

      expect(sql).toContain(`'${op1}'::uuid`)
      expect(sql).toContain(`'${op2}'::uuid`)
      expect(sql).toContain("DELETE FROM public.fiscal_series_homologacion WHERE cuit_emisor = '20415005963' AND punto_venta = 9999 AND tipo_comprobante = 11;")
      expect(sql).not.toMatch(/\bDELETE FROM public\.fiscal_series_homologacion WHERE punto_venta = 2\b/i)
      expect(sql).not.toMatch(/\bDELETE FROM public\.ventas\b/i)
    })

    it('cleanup SQL never deletes operational PV 2 series', () => {
      const op1 = 'e2b3c4d5-1234-4bc3-95d1-123456789abc'
      expect(() => buildManifestCleanupSql([op1], { syntheticPv: 2 })).toThrow('FATAL: PR03_B_REAL_FISCAL_CONTEXT_FORBIDDEN')
    })

    it('validates cleanup target tag guard', () => {
      expect(validateCleanupTarget({ tag: PR03_B_TEST_FIXTURE_TAG })).toBe(true)
      expect(() => validateCleanupTarget({})).toThrow('CLEANUP_TARGET_NOT_TAGGED')
    })

    it('contains all 3 required atomic test cases', () => {
      expect(PR03_B_TEST_CASES).toHaveLength(3)
      const ids = PR03_B_TEST_CASES.map(tc => tc.id)
      expect(ids).toContain('PRUEBA_IDEMPOTENCIA_REPLAY')
      expect(ids).toContain('PRUEBA_IDEMPOTENCIA_CONFLICT')
      expect(ids).toContain('PRUEBA_CONCURRENCIA_BLOQUEO')
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

  describe('8. Controlled Mock PostgreSQL Execution', () => {
    it('blocks authorized execution if real kiosk or PV2 is passed with FATAL error', async () => {
      const clientFactoryMock = vi.fn()

      await expect(
        executePr03bStaging(
          {
            authorized: true,
            scope: PR03_B_SCOPE,
            projectRef: PR03_B_EXECUTION_TARGET,
            password: 'mockValidPassword123',
            runId: '11111111-2222-4333-8444-555555555555',
            kioskId: PR03_B_REAL_KIOSK_ID,
          },
          { clientFactory: clientFactoryMock }
        )
      ).rejects.toThrow('FATAL: PR03_B_REAL_FISCAL_CONTEXT_FORBIDDEN')

      await expect(
        executePr03bStaging(
          {
            authorized: true,
            scope: PR03_B_SCOPE,
            projectRef: PR03_B_EXECUTION_TARGET,
            password: 'mockValidPassword123',
            runId: '11111111-2222-4333-8444-555555555555',
            syntheticPv: 2,
          },
          { clientFactory: clientFactoryMock }
        )
      ).rejects.toThrow('FATAL: PR03_B_REAL_FISCAL_CONTEXT_FORBIDDEN')

      expect(clientFactoryMock).not.toHaveBeenCalled()
    })

    it('executes full authorized workflow in synthetic environment and reports structured results', async () => {
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
                      real_kiosk_present: true,
                      real_pv2_present: true,
                      real_pv2_enabled: false,
                      real_pv2_series_count: 0,
                      real_pv2_pending_reservations: 0,
                      synthetic_kiosk_present: true,
                      synthetic_kiosk_active: true,
                      synthetic_owner_present: true,
                      synthetic_owner_active: true,
                      synthetic_owner_role: 'DUEÑO',
                      synthetic_owner_superadmin: false,
                      synthetic_emitter_count: 0,
                      synthetic_pv9999_series_count: 0,
                      synthetic_pv9999_reservations: 0,
                      synthetic_fiscal_operations: 0,
                      catalog_rev3_exists: true,
                      catalog_rev3_enabled: true,
                      catalog_rev3_usable: true,
                      synthetic_sales: [
                        { id: '11111111-1111-4111-8111-111111111111', kiosco_id: PR03_B_SYNTHETIC_KIOSK_ID, total: '150.00', estado: 'COMPLETADA' },
                        { id: '22222222-2222-4222-8222-222222222222', kiosco_id: PR03_B_SYNTHETIC_KIOSK_ID, total: '200.00', estado: 'COMPLETADA' },
                      ],
                    },
                  },
                ],
                rowCount: 1,
              }
            }

            if (sql.includes('ventas_count')) {
              return {
                rows: [
                  {
                    baseline: {
                      ventas_count: 10,
                      detalles_count: 20,
                      pagos_count: 10,
                      sesiones_count: 2,
                      movimientos_caja_count: 5,
                      movimientos_stock_count: 15,
                      devoluciones_count: 0,
                      productos_count: 50,
                      ventas_digest: 'fixed-sales-digest',
                    },
                  },
                ],
                rowCount: 1,
              }
            }

            if (sql.includes('SELECT punto_venta, habilitado FROM public.fiscal_emisores_homologacion')) {
              return {
                rows: [
                  { punto_venta: 9999, habilitado: true },
                  { punto_venta: 2, habilitado: false },
                ],
                rowCount: 2,
              }
            }

            if (sql.includes('autorizar_consulta_fiscal_homologacion')) {
              return {
                rows: [
                  {
                    auth: {
                      version: 1,
                      cuit_emisor: PR03_B_SYNTHETIC_CUIT,
                      punto_venta: PR03_B_SYNTHETIC_PV,
                      tipo_comprobante: PR03_B_SYNTHETIC_RECEIPT_TYPE,
                    },
                  },
                ],
                rowCount: 1,
              }
            }

            if (sql.includes('guardar_datos_preparacion_homologacion')) {
              return {
                rows: [
                  {
                    ack: {
                      operacion_id: params ? params[2] : 'op-1',
                      venta_id: params ? params[1] : 'venta-1',
                      preparacion_sha256: params ? params[4] : 'sha-prep',
                      estado: 'DATOS_PREPARADOS',
                      emision_habilitada: false,
                    },
                  },
                ],
                rowCount: 1,
              }
            }

            if (sql.includes('persistir_solicitud_fiscal_homologacion')) {
              if (params && typeof params[1] === 'string' && params[1].includes('"fecha":"20261101"')) {
                const err = new Error('No se confirmó el cuerpo fiscal o ya existe otro.')
                Object.assign(err, { code: '40001' })
                throw err
              }
              return {
                rows: [
                  {
                    ack: {
                      operacion_id: params ? params[0] : 'op-1',
                      numero: 1,
                      solicitud_sha256: params ? params[2] : 'sha-1',
                      estado: 'RESERVADA',
                    },
                  },
                ],
                rowCount: 1,
              }
            }

            if (sql.includes('reservar_numero_fiscal_homologacion')) {
              if (id === 'client2') {
                await new Promise(resolve => setTimeout(resolve, 200))
                const err = new Error('La serie tiene una operación pendiente de conciliación.')
                Object.assign(err, { code: '55000' })
                throw err
              }
              return {
                rows: [
                  {
                    ack: {
                      operacion_id: params ? params[0] : 'op-a',
                      numero: 1,
                      estado: 'RESERVADA',
                    },
                  },
                ],
                rowCount: 1,
              }
            }

            if (sql.includes('SELECT count(*)::int as count FROM public.fiscal_reservas_homologacion')) {
              return { rows: [{ count: 1 }], rowCount: 1 }
            }

            if (sql.includes('waiting_count') || sql.includes('pg_locks')) {
              return { rows: [{ waiting_count: 1 }], rowCount: 1 }
            }

            if (sql.includes('synth_emitters')) {
              return {
                rows: [
                  {
                    synth_emitters: 0,
                    synth_series: 0,
                    synth_reservas: 0,
                    run_ops: 0,
                    real_series: 0,
                    real_reservas: 0,
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
        expect(report.SYNTHETIC_TENANT_WIRED).toBe('PASS')
        expect(report.SYNTHETIC_KIOSK_ID_MATCH).toBe('PASS')
        expect(report.SYNTHETIC_OWNER_MATCH).toBe('PASS')
        expect(report.SYNTHETIC_PV).toBe(9999)
        expect(report.REAL_PV2_GUARD).toBe('PASS')
        expect(report.REAL_PV2_ENABLED_DURING_PR03_B).toBe(false)
        expect(report.REAL_PV2_SERIES_TOUCHED).toBe(false)
        expect(report.CATALOG_REV3_USABLE).toBe('PASS')
        expect(report.SYNTHETIC_EMITTER_LIFECYCLE).toBe('PASS')
        expect(report.CANONICAL_PRIVATE_PREPARATION).toBe('PASS')
        expect(report.IDEMPOTENCY_REPLAY).toBe('PASS')
        expect(report.REPLAY_REAL_PG).toBe('PASS')
        expect(report.IDEMPOTENCY_CONFLICT).toBe('PASS')
        expect(report.CONFLICT_SQLSTATE).toBe('40001')
        expect(report.CONCURRENCY_SEMANTICS).toBe('SINGLE_PENDING_RESERVATION')
        expect(report.LOCK_OBSERVATION_DETERMINISTIC).toBe('PASS')
        expect(report.CONCURRENCY_LOCK_OBSERVED).toBe('PASS')
        expect(report.CONCURRENCY_REJECTION_SQLSTATE).toBe('55000')
        expect(report.NUMBERING_CONCURRENCY).toBe('PASS')
        expect(report.PREFLIGHT_READ_ONLY).toBe('PASS')
        expect(report.PREFLIGHT_ROLLBACK_CONFIRMED).toBe(true)
        expect(report.SYNTHETIC_PV_USED).toBe(9999)
        expect(report.REAL_COMMERCIAL_BASELINE_PRESERVED).toBe(true)
        expect(report.SYNTHETIC_COMMERCIAL_BASELINE_PRESERVED).toBe(true)
        expect(report.COMMERCIAL_BASELINE_PRESERVED).toBe(true)
        expect(report.SUCCESS_CLEANUP).toBe('PASS')
        expect(report.RESIDUAL_SYNTHETIC_FISCAL_STATE).toBe(0)
        expect(report.RUN_ID).toBe(runId)
        expect(report.ARCA_CALLS).toBe(0)
        expect(report.ARCA_CALLS_NEW).toBe(0)
        expect(report.COMMERCIAL_WRITES).toBe(0)
        expect(report.CLIENT1_CLOSED).toBe(true)
        expect(report.CLIENT2_CLOSED).toBe(true)
        expect(report.PG_CONNECTIONS_CLOSED).toBe('PASS')
      }
      expect(clientFactoryMock).toHaveBeenCalledTimes(2)
      expect(client1.end).toHaveBeenCalled()
      expect(client2.end).toHaveBeenCalled()
    })
  })
})
