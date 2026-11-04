// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  PR02_P1_SCOPE,
  PR02_P2_SCOPE,
  PR02_PARAMETERS_ALLOWED_SCOPES,
  PR02_PARAMETERS_TARGET_PROJECT_REF,
  PR02_PARAMETERS_TARGET_REVISION,
  PR02_PARAMETERS_HISTORICAL_REVISION,
  PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
  PR02_PARAMETERS_EXPECTED_ISSUER_PV,
  PR02_CATALOG_REV3_HASH,
  PR02_PARAMETERS_REQUIRED_CALLS,
  PR02_PARAMETERS_PROHIBITED_CALLS,
  PR02_PARAMETERS_CALL_LIMITS_REUSABLE,
  PR02_PARAMETERS_CALL_LIMITS_NON_REUSABLE,
  FECAESOLICITAR_REACHABLE,
  FECOMPCONSULTAR_REACHABLE,
  PR02_P1_EMISSION_CAPABLE,
  PR02_P2_EMISSION_CAPABLE,
  EMITTER_ENABLE_DURING_PR02_PARAMETERS,
  REVISION_3_MUTATED,
  REVISION_4_INSERT_ONLY,
  isArcaOperationPermitted,
  assertNoProhibitedOperation,
  createPr02ParametersCallTracker,
  evaluateExistingTa,
  validateTiposIvaEvidence,
  validateCondicionIvaReceptorEvidence,
  buildPr02CanonicalRevision4,
  createPr02ParametersExecutionPackage,
  verifyPr02P1Preflight,
  verifyPr02P1Postcheck,
  verifyPr02P2Postcheck,
} from '../../scripts/fiscal/plan-pr02-parameters.mjs'
import {
  PR02_TARGET_CATALOG_REVISION_R4,
  PR02_SUPPORTED_CATALOG_REVISIONS,
  validatePr02CatalogContract,
} from '../../scripts/fiscal/plan-pr02-staging.mjs'

const SYNTHETIC_IVA_EVIDENCE = JSON.stringify({
  version: 1,
  entorno: 'HOMOLOGACION',
  operacion: 'FEParamGetTiposIva',
  origen: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  consultado_en: '2026-11-04T12:00:00.000Z',
  respuesta_sha256: 'a'.repeat(64),
  parametros: [
    { Id: 5, Description: '21%', VoucherClasses: '', ValidFrom: '20100917', ValidUntil: 'NULL' },
    { Id: 4, Description: '10.5%', VoucherClasses: '', ValidFrom: '20100917', ValidUntil: 'NULL' },
  ],
  importado_en_staging: false,
  emision_habilitada: false,
})

const SYNTHETIC_CONDITION_EVIDENCE = JSON.stringify({
  version: 1,
  entorno: 'HOMOLOGACION',
  operacion: 'FEParamGetCondicionIvaReceptor',
  origen: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  consultado_en: '2026-11-04T12:00:00.000Z',
  respuesta_sha256: 'b'.repeat(64),
  parametros: [
    { Id: 1, Description: 'IVA Responsable Inscripto', VoucherClasses: 'A/ALEY/C', ValidFrom: '', ValidUntil: '' },
    { Id: 5, Description: 'Consumidor Final', VoucherClasses: 'B/C', ValidFrom: '', ValidUntil: '' },
  ],
  importado_en_staging: false,
  emision_habilitada: false,
})

const SYNTHETIC_BASELINE_ROWS = [
  {
    revision: 1,
    condiciones: [{ id: 1, descripcion: 'IVA Responsable Inscripto', comprobantes: [1, 11] }],
    alicuotas: [{ id: 5, descripcion: '21%' }],
    fuente_sha256: '1'.repeat(64),
    consultado_en: '2026-10-26T22:03:33.000Z',
    vence_en: '2026-10-27T02:59:00.000Z',
    habilitado: false,
  },
  {
    revision: 2,
    condiciones: [{ id: 1, descripcion: 'IVA Responsable Inscripto', comprobantes: [1, 11] }],
    alicuotas: [{ id: 5, descripcion: '21%' }],
    fuente_sha256: '2'.repeat(64),
    consultado_en: '2026-10-27T10:00:00.000Z',
    vence_en: '2026-10-28T02:59:00.000Z',
    habilitado: false,
  },
  {
    revision: 3,
    condiciones: [{ id: 5, descripcion: 'Consumidor Final', comprobantes: [1, 6, 11] }],
    alicuotas: [{ id: 5, descripcion: '21%' }],
    fuente_sha256: PR02_CATALOG_REV3_HASH,
    consultado_en: '2026-11-03T02:00:00.000Z',
    vence_en: '2026-11-04T02:59:59.000Z',
    habilitado: true,
  },
]

describe('PR02 Parameters Plan & Catalog Refresh Unit Tests', () => {
  // 1. Exact allowlist and emission prohibitions
  it('confirms exact allowlist of 3 operations and blocks prohibited emission calls', () => {
    expect(PR02_PARAMETERS_REQUIRED_CALLS).toHaveLength(3)
    expect(PR02_PARAMETERS_REQUIRED_CALLS).toEqual([
      'LoginCms',
      'FEParamGetTiposIva',
      'FEParamGetCondicionIvaReceptor',
    ])

    for (const op of PR02_PARAMETERS_REQUIRED_CALLS) {
      expect(isArcaOperationPermitted(op)).toBe(true)
      expect(() => assertNoProhibitedOperation(op)).not.toThrow()
    }

    expect(PR02_PARAMETERS_TARGET_REVISION).toBe(4)
    expect(PR02_PARAMETERS_HISTORICAL_REVISION).toBe(3)
    expect(PR02_PARAMETERS_CALL_LIMITS_REUSABLE.totalMax).toBe(2)
    expect(PR02_PARAMETERS_CALL_LIMITS_NON_REUSABLE.totalMax).toBe(3)
    expect(EMITTER_ENABLE_DURING_PR02_PARAMETERS).toBe(false)
    expect(FECAESOLICITAR_REACHABLE).toBe(false)
    expect(FECOMPCONSULTAR_REACHABLE).toBe(false)
    expect(PR02_P1_EMISSION_CAPABLE).toBe(false)
    expect(PR02_P2_EMISSION_CAPABLE).toBe(false)
    expect(REVISION_3_MUTATED).toBe(false)
    expect(REVISION_4_INSERT_ONLY).toBe(true)

    for (const blocked of PR02_PARAMETERS_PROHIBITED_CALLS) {
      expect(isArcaOperationPermitted(blocked)).toBe(false)
      expect(() => assertNoProhibitedOperation(blocked)).toThrow(/PR02_PARAMETERS_PROHIBITED_OPERATION/)
    }
  })

  // 2. Evaluation of existing TA
  it('evaluates existing TA: reuses valid ticket and demands LoginCms for expired or absent ticket', () => {
    const now = new Date('2026-11-04T12:00:00Z')

    const absent = evaluateExistingTa(null, now)
    expect(absent.reusable).toBe(false)
    expect(absent.loginCmsRequired).toBe(true)

    const expired = evaluateExistingTa(
      { estado: 'DISPONIBLE', vence_en: '2026-11-04T11:59:00Z' },
      now
    )
    expect(expired.reusable).toBe(false)
    expect(expired.loginCmsRequired).toBe(true)

    const valid = evaluateExistingTa(
      { estado: 'DISPONIBLE', vence_en: '2026-11-04T18:00:00Z' },
      now
    )
    expect(valid.reusable).toBe(true)
    expect(valid.loginCmsRequired).toBe(false)
  })

  // 3. Evidence validation
  it('validates TiposIva and CondicionIvaReceptor evidence structures', () => {
    const ivaRes = validateTiposIvaEvidence(SYNTHETIC_IVA_EVIDENCE)
    expect(ivaRes.count).toBe(2)
    expect(ivaRes.hash).toHaveLength(64)

    const condRes = validateCondicionIvaReceptorEvidence(SYNTHETIC_CONDITION_EVIDENCE)
    expect(condRes.count).toBe(2)
    expect(condRes.hash).toHaveLength(64)
  })

  // 4. Canonical proposal for Revision 4
  it('builds canonical proposal for Revision 4 with habilitado = false and validates baseline continuity', () => {
    const canonical = buildPr02CanonicalRevision4({
      ivaText: SYNTHETIC_IVA_EVIDENCE,
      conditionText: SYNTHETIC_CONDITION_EVIDENCE,
      baselineText: JSON.stringify(SYNTHETIC_BASELINE_ROWS),
      now: '2026-11-04T12:00:00.000Z',
    })

    expect(canonical.revision).toBe(4)
    expect(canonical.habilitado).toBe(false)
    expect(canonical.fuente_sha256).toHaveLength(64)
    expect(canonical.sql).toContain('VALUES(4,')
    expect(canonical.sql).toContain('false')
  })

  it('rejects proposal if baseline already contains revision 4', () => {
    const baselineWithRev4 = [
      ...SYNTHETIC_BASELINE_ROWS,
      {
        revision: 4,
        condiciones: [],
        alicuotas: [],
        fuente_sha256: '4'.repeat(64),
        consultado_en: '2026-11-04T12:00:00.000Z',
        vence_en: '2026-11-05T02:59:59.000Z',
        habilitado: false,
      },
    ]

    expect(() =>
      buildPr02CanonicalRevision4({
        ivaText: SYNTHETIC_IVA_EVIDENCE,
        conditionText: SYNTHETIC_CONDITION_EVIDENCE,
        baselineText: JSON.stringify(baselineWithRev4),
        now: '2026-11-04T12:00:00.000Z',
      })
    ).toThrow(/PR02_BASELINE_ALREADY_HAS_REV4/)
  })

  // 5. Verifiers for PR02-P1
  it('verifies P1 preflight: passes when R3 is expired and R4 does not exist; fails if R4 already exists', () => {
    const validRaw = {
      transaction_read_only: 'on',
      observed_at: new Date().toISOString(),
      expected_issuer_present: true,
      expected_issuer_enabled: false,
      unexpected_enabled_issuers: 0,
      catalog_rev1_exists: true,
      catalog_rev2_exists: true,
      catalog_rev3_exists: true,
      catalog_rev3_expired: true,
      catalog_rev4_exists: false,
      existing_reusable_ta: false,
      baseline_revisions: [1, 2, 3],
    }

    const verified = verifyPr02P1Preflight(validRaw)
    expect(verified.status).toBe('PASS')
    expect(verified.catalogRev3Expired).toBe(true)
    expect(verified.catalogRev4Exists).toBe(false)

    // Si R4 ya existe: STOP
    const invalidRaw = { ...validRaw, catalog_rev4_exists: true }
    expect(() => verifyPr02P1Preflight(invalidRaw)).toThrow(/PR02_P1_PREFLIGHT_CATALOG_REV4_ALREADY_EXISTS/)
  })

  it('verifies P1 postcheck: confirms R4 exists disabled and R3 remains intact', () => {
    const hash = 'a'.repeat(64)
    const raw = {
      transaction_read_only: 'on',
      observed_at: new Date().toISOString(),
      rev4_exists: true,
      rev4_enabled: false,
      rev4_fuente_sha256: hash,
      rev3_exists: true,
      rev3_fuente_sha256: PR02_CATALOG_REV3_HASH,
      expected_issuer_enabled: false,
    }

    const res = verifyPr02P1Postcheck(raw, {
      fuenteSha256: hash,
      rev3FuenteSha256: PR02_CATALOG_REV3_HASH,
    })
    expect(res.status).toBe('PASS')
    expect(res.rev4Exists).toBe(true)
    expect(res.rev4Enabled).toBe(false)
  })

  // 6. Verifiers for PR02-P2
  it('verifies P2 postcheck: confirms R4 enabled, unexpired and R3 intact', () => {
    const hash = 'a'.repeat(64)
    const raw = {
      transaction_read_only: 'on',
      observed_at: new Date().toISOString(),
      rev4_exists: true,
      rev4_enabled: true,
      rev4_fuente_sha256: hash,
      rev4_valid: true,
      rev3_exists: true,
      expected_issuer_enabled: false,
    }

    const res = verifyPr02P2Postcheck(raw, { fuenteSha256: hash })
    expect(res.status).toBe('PASS')
    expect(res.rev4Enabled).toBe(true)
    expect(res.rev4Valid).toBe(true)
  })

  // 7. Catalog contract validator from plan-pr02-staging
  it('confirms validatePr02CatalogContract validates supported catalog revisions', () => {
    expect(PR02_TARGET_CATALOG_REVISION_R4).toBe(4)
    expect(PR02_SUPPORTED_CATALOG_REVISIONS).toEqual([3, 4])

    const validR4Catalog = {
      revision: 4,
      fuente_sha256: 'a'.repeat(64),
      habilitado: true,
      consultado_en: '2026-11-04T12:00:00Z',
      vence_en: '2026-11-05T12:00:00Z',
      condiciones: [{ id: 5, descripcion: 'Consumidor Final', comprobantes: [1, 6, 11] }],
      alicuotas: [{ id: 5, descripcion: '21%' }],
    }

    expect(validatePr02CatalogContract(validR4Catalog, 4)).toBe(true)
    expect(() => validatePr02CatalogContract({ ...validR4Catalog, habilitado: false }, 4)).toThrow(/CATALOG_NOT_ENABLED/)
    expect(() => validatePr02CatalogContract({ ...validR4Catalog, revision: 3 }, 4)).toThrow(/CATALOG_REVISION_MISMATCH/)
  })

  // 8. Call tracker verification
  it('tracks operations and enforces exact call limits', () => {
    const tracker = createPr02ParametersCallTracker(false)
    expect(tracker.totalCalls).toBe(0)

    tracker.recordCall('LoginCms')
    tracker.recordCall('FEParamGetTiposIva')
    tracker.recordCall('FEParamGetCondicionIvaReceptor')

    expect(tracker.totalCalls).toBe(3)
    expect(() => tracker.recordCall('LoginCms')).toThrow(/CALL_LIMIT_EXCEEDED/)
    expect(() => tracker.recordCall('FECAESolicitar')).toThrow(/PROHIBITED_OPERATION/)
    expect(() => tracker.verifyLimits()).not.toThrow()
  })

  // 9. Execution package creation
  it('creates execution package for PR02-P1 and PR02-P2 with target constraints', () => {
    expect(PR02_PARAMETERS_ALLOWED_SCOPES).toEqual([PR02_P1_SCOPE, PR02_P2_SCOPE])
    expect(PR02_PARAMETERS_TARGET_PROJECT_REF).toBe('acoyfwwmhaeruciyedri')
    expect(PR02_PARAMETERS_EXPECTED_ISSUER_CUIT).toBe('20415005963')
    expect(PR02_PARAMETERS_EXPECTED_ISSUER_PV).toBe(2)

    const dummyHead = 'a'.repeat(40)
    const pkgP1 = createPr02ParametersExecutionPackage({
      scope: PR02_P1_SCOPE,
      headCommit: dummyHead,
    })

    expect(pkgP1.scope).toBe(PR02_P1_SCOPE)
    expect(pkgP1.projectRef).toBe(PR02_PARAMETERS_TARGET_PROJECT_REF)
    expect(pkgP1.expectedIssuerCuit).toBe(PR02_PARAMETERS_EXPECTED_ISSUER_CUIT)
    expect(pkgP1.expectedIssuerPuntoVenta).toBe(PR02_PARAMETERS_EXPECTED_ISSUER_PV)
    expect(pkgP1.packageSha256).toHaveLength(64)
  })
})
