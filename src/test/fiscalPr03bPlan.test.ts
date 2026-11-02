import { describe, it, expect } from 'vitest'
import {
  ARCA_NETWORK_DISABLED,
  PR03_B_SCOPE,
  PR03_B_TEST_FIXTURE_TAG,
  PR03_B_APPROVED_KIOSK_ID,
  PR03_B_APPROVED_CUIT,
  PR03_B_APPROVED_PUNTO_VENTA,
  PR03_B_APPROVED_TIPO_COMPROBANTE,
  PR03_B_CLEANUP_SQL,
  PR03_B_TEST_CASES,
  assertNoArcaNetwork,
  createAntiArcaFetch,
  createPr03bTestFixture,
  canonicalJson,
  computeSha256,
  validateCleanupTarget,
  verifyIdempotencyReplay,
  verifyIdempotencyConflict,
  verifyConcurrencyNumbering,
  verifyPr03bPlan,
} from '../../scripts/fiscal/plan-pr03-b-staging.mjs'
import { checkPr03bEnvironment, runPr03bPreparation } from '../../scripts/fiscal/execute-pr03-b-staging.mjs'

describe('PR03-B Staging Acceptance Plan & Tests', () => {
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

      // Comprobación de canonicidad y hash SHA-256
      const expectedCanonical = canonicalJson(fixture.solicitud)
      expect(fixture.cuerpo_canonico).toBe(expectedCanonical)
      expect(fixture.solicitud_sha256).toBe(computeSha256(expectedCanonical))
      expect(fixture.solicitud_sha256).toMatch(/^[0-9a-f]{64}$/)
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

  describe('2. Anti-ARCA Guard', () => {
    it('enforces ARCA_NETWORK_DISABLED flag', () => {
      expect(ARCA_NETWORK_DISABLED).toBe(true)
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

  describe('3. Idempotency Logic', () => {
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

    it('verifies rejection of conflicting payload with error 22023', () => {
      const error = new Error('Observación fiscal inválida o vencida.')
      Object.assign(error, { code: '22023' })

      const result = verifyIdempotencyConflict(error)
      expect(result.status).toBe('PASS')
      expect(result.rejectedWithExpectedCode).toBe(true)
      expect(result.errorCode).toBe('22023')
    })
  })

  describe('4. Concurrency & Numbering Logic', () => {
    it('verifies serial ordering of sequential numbers without collisions', () => {
      const workerA = { operacion_id: 'op-1', numero: 101, estado: 'RESERVADA' }
      const workerB = { operacion_id: 'op-2', numero: 102, estado: 'RESERVADA' }

      const result = verifyConcurrencyNumbering([workerA, workerB])
      expect(result.status).toBe('PASS')
      expect(result.serialized).toBe(true)
      expect(result.collisionCount).toBe(0)
      expect(result.assignedNumbers).toEqual([101, 102])
    })

    it('detects and rejects number collision in concurrent reservations', () => {
      const workerA = { operacion_id: 'op-1', numero: 101, estado: 'RESERVADA' }
      const workerB = { operacion_id: 'op-2', numero: 101, estado: 'RESERVADA' }

      expect(() => verifyConcurrencyNumbering([workerA, workerB])).toThrow(
        'CONCURRENCY_NUMBERING_COLLISION_DETECTED'
      )
    })

    it('rejects non-sequential gaps in reservation assignment', () => {
      const workerA = { operacion_id: 'op-1', numero: 101, estado: 'RESERVADA' }
      const workerB = { operacion_id: 'op-2', numero: 103, estado: 'RESERVADA' }

      expect(() => verifyConcurrencyNumbering([workerA, workerB])).toThrow(
        'CONCURRENCY_NUMBERING_NON_SEQUENTIAL_GAP'
      )
    })
  })

  describe('5. Cleanup Contract & Atomic Test Cases', () => {
    it('cleanup SQL targets strictly tagged rows and never touches real commercial data', () => {
      expect(PR03_B_CLEANUP_SQL).toContain('contexto->>\'tag\' = \'PR03_B_TEST_FIXTURE\'')
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

  describe('6. Environment & Preparation Dry-Run', () => {
    it('passes environment check and dry-run with 0 staging writes and 0 arca calls', async () => {
      const check = checkPr03bEnvironment()
      expect(check.status).toBe('PASS')
      expect(check.antiArcaGuard).toBe('PASS')
      expect(check.planValidation).toBe('PASS')
      expect(check.fixtureValidation).toBe('PASS')

      const prep = await runPr03bPreparation()
      expect(prep.readyForAuthorizedExecution).toBe(true)
      expect(prep.stagingWritesAttempted).toBe(0)
      expect(prep.arcaCallsAttempted).toBe(0)
    })
  })
})
