// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  PR03_C_SCOPE,
  PR03_C_TARGET_PROJECT_REF,
  PR03_C_TARGET_REVISION,
  PR03_C_EXPECTED_ISSUER_CUIT,
  PR03_C_EXPECTED_ISSUER_PV,
  PR03_C_REQUIRED_CALLS,
  PR03_C_PROHIBITED_CALLS,
  PR03_C_CALL_LIMITS_REUSABLE,
  PR03_C_CALL_LIMITS_NON_REUSABLE,
  FECAESOLICITAR_REACHABLE,
  FECOMPCONSULTAR_REACHABLE,
  PR03_C_EMISSION_CAPABLE,
  EMITTER_ENABLE_DURING_PR03_C,
  EMITTER_ENABLE_REQUIRED_FOR_PR03_B,
  REVISION_2_MUTATED,
  REVISION_3_INSERT_ONLY,
  PR03_C_PREFLIGHT_SELECT_SQL,
  isArcaOperationPermitted,
  assertNoProhibitedOperation,
  createPr03cCallTracker,
  evaluateExistingTa,
  validateTiposIvaEvidence,
  validateCondicionIvaReceptorEvidence,
  buildPr03cCanonicalRevision3,
  createPr03cExecutionPackage,
  verifyPr03cPreflight,
} from '../../scripts/fiscal/plan-pr03-c-parameters.mjs'
import {
  PR03_C_EXECUTION_TARGET,
  checkPr03cEnvironment,
  executePr03cStaging,
} from '../../scripts/fiscal/execute-pr03-c-staging.mjs'

describe('PR03-C Planning & Parameter Refresh Unit Tests', () => {
  // 1. Exact allowlist and emission prohibitions
  it('confirms exact allowlist of 3 operations and blocks prohibited emission calls', () => {
    expect(PR03_C_REQUIRED_CALLS).toHaveLength(3)
    expect(PR03_C_REQUIRED_CALLS).toEqual([
      'LoginCms',
      'FEParamGetTiposIva',
      'FEParamGetCondicionIvaReceptor',
    ])

    for (const op of PR03_C_REQUIRED_CALLS) {
      expect(isArcaOperationPermitted(op)).toBe(true)
      expect(() => assertNoProhibitedOperation(op)).not.toThrow()
    }

    expect(PR03_C_TARGET_REVISION).toBe(3)
    expect(PR03_C_CALL_LIMITS_REUSABLE.totalMax).toBe(2)
    expect(EMITTER_ENABLE_DURING_PR03_C).toBe(false)
    expect(EMITTER_ENABLE_REQUIRED_FOR_PR03_B).toBe(true)
    expect(PR03_C_EXECUTION_TARGET).toBe('acoyfwwmhaeruciyedri')
    expect(checkPr03cEnvironment().projectRef).toBe('acoyfwwmhaeruciyedri')

    for (const blocked of PR03_C_PROHIBITED_CALLS) {
      expect(isArcaOperationPermitted(blocked)).toBe(false)
      expect(() => assertNoProhibitedOperation(blocked)).toThrow(/PR03_C_PROHIBITED_OPERATION/)
    }

    expect(isArcaOperationPermitted('FEParamGetTiposCbte')).toBe(false)
    expect(isArcaOperationPermitted('UnknownOp')).toBe(false)
    expect(FECAESOLICITAR_REACHABLE).toBe(false)
    expect(FECOMPCONSULTAR_REACHABLE).toBe(false)
    expect(PR03_C_EMISSION_CAPABLE).toBe(false)
  })

  // 2. Evaluation of existing TA
  it('evaluates existing TA: reuses valid unexpired ticket and requires LoginCms for expired/absent ticket', () => {
    const now = new Date('2026-11-03T10:00:00Z')

    // Absent TA record
    const absent = evaluateExistingTa(null, now)
    expect(absent.reusable).toBe(false)
    expect(absent.loginCmsRequired).toBe(true)

    // Not available / no expiration
    const notAvailable = evaluateExistingTa({ estado: 'VACIO', vence_en: null }, now)
    expect(notAvailable.reusable).toBe(false)
    expect(notAvailable.loginCmsRequired).toBe(true)

    // Expired TA
    const expired = evaluateExistingTa({
      estado: 'DISPONIBLE',
      vence_en: '2026-11-03T09:59:00Z',
    }, now)
    expect(expired.reusable).toBe(false)
    expect(expired.loginCmsRequired).toBe(true)

    // Expiring within safety margin (under 10 minutes)
    const expiringSoon = evaluateExistingTa({
      estado: 'DISPONIBLE',
      vence_en: '2026-11-03T10:05:00Z',
    }, now)
    expect(expiringSoon.reusable).toBe(false)
    expect(expiringSoon.loginCmsRequired).toBe(true)

    // Valid reusable TA (more than 10 min remaining)
    const valid = evaluateExistingTa({
      estado: 'DISPONIBLE',
      vence_en: '2026-11-03T16:00:00Z',
    }, now)
    expect(valid.reusable).toBe(true)
    expect(valid.loginCmsRequired).toBe(false)
    expect(valid.expiration).toBe('2026-11-03T16:00:00.000Z')
  })

  // 3. Strict call counter limits
  it('enforces call counter limits and rejects 4th call as fatal', () => {
    // Non-reusable TA case (max 3 calls)
    const tracker1 = createPr03cCallTracker(false)
    expect(tracker1.isTaReusable).toBe(false)
    tracker1.recordCall('LoginCms')
    tracker1.recordCall('FEParamGetTiposIva')
    tracker1.recordCall('FEParamGetCondicionIvaReceptor')
    expect(tracker1.totalCalls).toBe(3)
    expect(tracker1.loginCmsCount).toBe(1)
    expect(tracker1.tiposIvaCount).toBe(1)
    expect(tracker1.condicionIvaReceptorCount).toBe(1)
    expect(() => tracker1.verifyLimits()).not.toThrow()

    // 4th call must throw
    expect(() => tracker1.recordCall('FEParamGetTiposIva')).toThrow(/PR03_C_CALL_LIMIT_EXCEEDED/)

    // Reusable TA case (max 2 calls, 0 LoginCms allowed)
    const tracker2 = createPr03cCallTracker(true)
    expect(tracker2.isTaReusable).toBe(true)
    expect(() => tracker2.recordCall('LoginCms')).toThrow(/PR03_C_LOGINCMS_CALL_LIMIT_EXCEEDED/)
    tracker2.recordCall('FEParamGetTiposIva')
    tracker2.recordCall('FEParamGetCondicionIvaReceptor')
    expect(tracker2.totalCalls).toBe(2)
    expect(() => tracker2.recordCall('FEParamGetTiposIva')).toThrow(/PR03_C_CALL_LIMIT_EXCEEDED/)
  })

  // 4. Evidence parsing: FEParamGetTiposIva
  it('parses and validates FEParamGetTiposIva evidence correctly', () => {
    const validIva = JSON.stringify({
      version: 1,
      entorno: 'HOMOLOGACION',
      operacion: 'FEParamGetTiposIva',
      origen: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
      consultado_en: '2026-11-03T01:00:00.000Z',
      respuesta_sha256: 'a'.repeat(64),
      parametros: [
        { Id: 3, Description: '0%', VoucherClasses: '', ValidFrom: '20100917', ValidUntil: 'NULL' },
        { Id: 4, Description: '10.5%', VoucherClasses: '', ValidFrom: '20100917', ValidUntil: 'NULL' },
        { Id: 5, Description: '21%', VoucherClasses: '', ValidFrom: '20100917', ValidUntil: 'NULL' },
      ],
      importado_en_staging: false,
      emision_habilitada: false,
    })

    const validated = validateTiposIvaEvidence(validIva)
    expect(validated.count).toBe(3)
    expect(validated.hash).toMatch(/^[0-9a-f]{64}$/)

    // Rejects empty / corrupt
    expect(() => validateTiposIvaEvidence('')).toThrow('TIPOS_IVA_EVIDENCE_EMPTY')
    expect(() => validateTiposIvaEvidence('bad-json')).toThrow('TIPOS_IVA_JSON_INVALID')

    // Rejects duplicate ID
    const duplicateIdIva = JSON.stringify({
      version: 1,
      entorno: 'HOMOLOGACION',
      operacion: 'FEParamGetTiposIva',
      origen: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
      consultado_en: '2026-11-03T01:00:00.000Z',
      respuesta_sha256: 'a'.repeat(64),
      parametros: [
        { Id: 5, Description: '21%', VoucherClasses: '', ValidFrom: '20100917', ValidUntil: 'NULL' },
        { Id: 5, Description: '21% duplicate', VoucherClasses: '', ValidFrom: '20100917', ValidUntil: 'NULL' },
      ],
      importado_en_staging: false,
      emision_habilitada: false,
    })
    expect(() => validateTiposIvaEvidence(duplicateIdIva)).toThrow(/TIPOS_IVA_DUPLICATE_ID/)
  })

  // 5. Evidence parsing: FEParamGetCondicionIvaReceptor
  it('parses and validates FEParamGetCondicionIvaReceptor evidence correctly', () => {
    const validCond = JSON.stringify({
      version: 1,
      entorno: 'HOMOLOGACION',
      operacion: 'FEParamGetCondicionIvaReceptor',
      origen: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
      consultado_en: '2026-11-03T01:00:00.000Z',
      respuesta_sha256: 'b'.repeat(64),
      parametros: [
        { Id: 1, Description: 'IVA Responsable Inscripto', VoucherClasses: 'A/ALEY/B/C/49', ValidFrom: '', ValidUntil: '' },
        { Id: 4, Description: 'IVA Sujeto Exento', VoucherClasses: 'B/C', ValidFrom: '', ValidUntil: '' },
        { Id: 5, Description: 'Consumidor Final', VoucherClasses: 'B/C', ValidFrom: '', ValidUntil: '' },
        { Id: 6, Description: 'Responsable Monotributo', VoucherClasses: 'A/ALEY/B/C/49', ValidFrom: '', ValidUntil: '' },
      ],
      importado_en_staging: false,
      emision_habilitada: false,
    })

    const validated = validateCondicionIvaReceptorEvidence(validCond)
    expect(validated.count).toBe(4)
    expect(validated.hash).toMatch(/^[0-9a-f]{64}$/)

    // Rejects empty / corrupt
    expect(() => validateCondicionIvaReceptorEvidence('')).toThrow('CONDICION_IVA_EVIDENCE_EMPTY')
    expect(() => validateCondicionIvaReceptorEvidence('bad-json')).toThrow('CONDICION_IVA_JSON_INVALID')

    // Rejects unknown voucher class
    const unknownClassCond = JSON.stringify({
      version: 1,
      entorno: 'HOMOLOGACION',
      operacion: 'FEParamGetCondicionIvaReceptor',
      origen: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
      consultado_en: '2026-11-03T01:00:00.000Z',
      respuesta_sha256: 'b'.repeat(64),
      parametros: [
        { Id: 1, Description: 'Test', VoucherClasses: 'A/UNKNOWN', ValidFrom: '', ValidUntil: '' },
      ],
      importado_en_staging: false,
      emision_habilitada: false,
    })
    expect(() => validateCondicionIvaReceptorEvidence(unknownClassCond)).toThrow(/CONDICION_IVA_UNKNOWN_CLASS/)
  })

  // 6. Canonical Revision 3 construction
  it('constructs canonical revision 3 object, derives expiration, and preserves revision 2', () => {
    const validIva = JSON.stringify({
      version: 1,
      entorno: 'HOMOLOGACION',
      operacion: 'FEParamGetTiposIva',
      origen: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
      consultado_en: '2026-11-03T13:55:00.000Z',
      respuesta_sha256: 'a'.repeat(64),
      parametros: [
        { Id: 3, Description: '0%', VoucherClasses: '', ValidFrom: '20100917', ValidUntil: 'NULL' },
        { Id: 4, Description: '10.5%', VoucherClasses: '', ValidFrom: '20100917', ValidUntil: 'NULL' },
        { Id: 5, Description: '21%', VoucherClasses: '', ValidFrom: '20100917', ValidUntil: 'NULL' },
      ],
      importado_en_staging: false,
      emision_habilitada: false,
    })

    const validCond = JSON.stringify({
      version: 1,
      entorno: 'HOMOLOGACION',
      operacion: 'FEParamGetCondicionIvaReceptor',
      origen: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
      consultado_en: '2026-11-03T13:55:00.000Z',
      respuesta_sha256: 'b'.repeat(64),
      parametros: [
        { Id: 1, Description: 'IVA Responsable Inscripto', VoucherClasses: 'A/ALEY/B/C/49', ValidFrom: '', ValidUntil: '' },
        { Id: 4, Description: 'IVA Sujeto Exento', VoucherClasses: 'B/C', ValidFrom: '', ValidUntil: '' },
        { Id: 5, Description: 'Consumidor Final', VoucherClasses: 'B/C', ValidFrom: '', ValidUntil: '' },
        { Id: 6, Description: 'Responsable Monotributo', VoucherClasses: 'A/ALEY/B/C/49', ValidFrom: '', ValidUntil: '' },
      ],
      importado_en_staging: false,
      emision_habilitada: false,
    })

    const baseline = JSON.stringify([
      {
        revision: 1,
        condiciones: [{ id: 5, descripcion: 'Consumidor Final', comprobantes: [11] }],
        alicuotas: [{ id: 5, descripcion: '21%' }],
        fuente_sha256: '1'.repeat(64),
        consultado_en: '2026-10-20T00:00:00.000Z',
        vence_en: '2026-10-21T00:00:00.000Z',
        habilitado: false,
      },
      {
        revision: 2,
        condiciones: [{ id: 5, descripcion: 'Consumidor Final', comprobantes: [11] }],
        alicuotas: [{ id: 5, descripcion: '21%' }],
        fuente_sha256: '2'.repeat(64),
        consultado_en: '2026-10-27T00:00:00.000Z',
        vence_en: '2026-10-28T00:00:00.000Z',
        habilitado: false,
      },
    ])

    const now = '2026-11-03T14:00:00.000Z'
    const expiresAt = '2026-11-04T02:59:00.000Z'

    const rev3 = buildPr03cCanonicalRevision3({
      ivaText: validIva,
      conditionText: validCond,
      baselineText: baseline,
      now,
      expiresAt,
    })

    expect(rev3.revision).toBe(3)
    expect(rev3.habilitado).toBe(false)
    expect(rev3.alicuotas.length).toBeGreaterThanOrEqual(1)
    expect(rev3.condiciones.length).toBeGreaterThanOrEqual(1)
    expect(rev3.fuente_sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(rev3.plan_sha256).toMatch(/^[0-9a-f]{64}$/)

    // SQL must be insert-only and not contain updates or deletions
    expect(rev3.sql).toContain('INSERT INTO public.fiscal_parametros_homologacion')
    expect(rev3.sql).toContain('VALUES(3,')
    expect(rev3.sql).not.toMatch(/\b(?:UPDATE|DELETE)\s+public\.fiscal_parametros_homologacion/i)
    expect(rev3.sql).not.toMatch(/ON\s+CONFLICT\s+DO\s+UPDATE/i)

    // Revisions invariants
    expect(REVISION_2_MUTATED).toBe(false)
    expect(REVISION_3_INSERT_ONLY).toBe(true)
  })

  // 7. Preflight validation
  it('validates preflight requirements for PR03-C', () => {
    expect(PR03_C_PREFLIGHT_SELECT_SQL).toContain("SELECT jsonb_build_object")
    expect(PR03_C_PREFLIGHT_SELECT_SQL).toContain("expected_issuer_present")
    expect(PR03_C_PREFLIGHT_SELECT_SQL).toContain("catalog_rev2_expired")
    expect(PR03_C_PREFLIGHT_SELECT_SQL).toContain("catalog_rev3_exists")

    const compliantPreflight = {
      transaction_read_only: 'on',
      observed_at: new Date().toISOString(),
      expected_issuer_present: true,
      expected_issuer_enabled: false,
      unexpected_enabled_issuers: 0,
      catalog_rev1_exists: true,
      catalog_rev2_exists: true,
      catalog_rev2_expired: true,
      catalog_rev3_exists: false,
      existing_reusable_ta: false,
      baseline_revisions: [1, 2],
    }

    const res = verifyPr03cPreflight(compliantPreflight)
    expect(res.status).toBe('PASS')
    expect(res.expectedIssuerEnabled).toBe(false)
    expect(res.catalogRev3Exists).toBe(false)
    expect(res.existingTaReusable).toBe(false)
    expect(res.loginCmsRequired).toBe(true)

    // Fails if revision 3 already exists
    expect(() => verifyPr03cPreflight({
      ...compliantPreflight,
      catalog_rev3_exists: true,
    })).toThrow(/PR03_C_PREFLIGHT_CATALOG_REV3_ALREADY_EXISTS/)

    // Fails if issuer is unexpectedly enabled
    expect(() => verifyPr03cPreflight({
      ...compliantPreflight,
      expected_issuer_enabled: true,
    })).toThrow(/PR03_C_PREFLIGHT_ISSUER_UNEXPECTEDLY_ENABLED/)
  })

  // 8. Execution package generation
  it('creates closed PR03-C execution package with zero secrets', () => {
    const pkg = createPr03cExecutionPackage({
      headCommit: 'bc687ce8158c91ccc3eb17b3e0015ddebe5d1770',
      isTaReusable: false,
    })

    expect(pkg.scope).toBe(PR03_C_SCOPE)
    expect(pkg.projectRef).toBe(PR03_C_TARGET_PROJECT_REF)
    expect(pkg.targetRevision).toBe(3)
    expect(pkg.expectedIssuerCuit).toBe(PR03_C_EXPECTED_ISSUER_CUIT)
    expect(pkg.expectedIssuerPuntoVenta).toBe(PR03_C_EXPECTED_ISSUER_PV)
    expect(pkg.requiredCalls).toEqual(PR03_C_REQUIRED_CALLS)
    expect(pkg.prohibitedCalls).toEqual(PR03_C_PROHIBITED_CALLS)
    expect(pkg.callLimits).toEqual(PR03_C_CALL_LIMITS_NON_REUSABLE)
    expect(pkg.emissionProhibited.fecaesolicitarReachable).toBe(false)
    expect(pkg.emissionProhibited.emissionCapable).toBe(false)
    expect(pkg.emitterStatus.enabledDuringPr03c).toBe(false)
    expect(pkg.emitterStatus.requiredForPr03b).toBe(true)
    expect(pkg.packageSha256).toMatch(/^[0-9a-f]{64}$/)

    // Zero secrets
    const str = JSON.stringify(pkg)
    expect(str).not.toContain('password')
    expect(str).not.toContain('Token')
    expect(str).not.toContain('Sign')
    expect(str).not.toContain('PRIVATE KEY')
  })

  // 9. Full dry-run execution report verification
  it('runs executePr03cStaging in dry-run mode and delivers exact expected report', async () => {
    const report = await executePr03cStaging()

    expect(report.PR03_C_PREPARATION).toBe('PASS')
    expect(report.PR03_C_EXTERNAL_CALL_PLAN).toBe('PASS')
    expect(report.PR03_C_REQUIRED_CALLS).toEqual([
      'LoginCms',
      'FEParamGetTiposIva',
      'FEParamGetCondicionIvaReceptor',
    ])
    expect(report.EXISTING_TA_REUSABLE).toBe(false)
    expect(report.LOGINCMS_REQUIRED).toBe(true)
    expect(report.TIPOS_IVA_PLAN).toBe('PASS')
    expect(report.CONDICIONES_IVA_PLAN).toBe('PASS')
    expect(report.REVISION_3_CANONICAL).toBe('PASS')
    expect(report.REVISION_3_INSERT_ONLY).toBe('PASS')
    expect(report.REVISION_2_MUTATED).toBe(false)
    expect(report.EMITTER_ENABLE_DURING_PR03_C).toBe(false)
    expect(report.EMITTER_ENABLE_REQUIRED_FOR_PR03_B).toBe(true)
    expect(report.FECAESOLICITAR_REACHABLE).toBe(false)
    expect(report.FECOMPCONSULTAR_REACHABLE).toBe(false)
    expect(report.PR03_C_EMISSION_CAPABLE).toBe(false)
    expect(report.PR03_C_PACKAGE).toBe('PREPARED')
    expect(report.ARCA_CALLS_NEW).toBe(0)
    expect(report.STAGING_WRITES_NEW).toBe(0)
    expect(report.PRODUCTION_MUTATIONS).toBe(0)
    expect(report.PACKAGE_SHA256).toMatch(/^[0-9a-f]{64}$/)
  })
})
