// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  PR02_P0_SCOPE,
  PR02_P1_SCOPE,
  PR02_P1_LEGACY_SCOPE,
  PR02_P2_SCOPE,
  PR02_PARAMETERS_ALLOWED_SCOPES,
  PR02_PARAMETERS_TARGET_PROJECT_REF,
  PR02_PARAMETERS_TARGET_REVISION,
  PR02_PARAMETERS_HISTORICAL_REVISION,
  PR02_PARAMETERS_EXPECTED_ISSUER_CUIT,
  PR02_PARAMETERS_EXPECTED_ISSUER_PV,
  REV3_SOURCE_SHA256,
  PR02_CATALOG_REV3_HASH,
  computeCatalogRowDigest,
  PR02_EXECUTION_OUTCOMES,
  UNCERTAIN_WRITE_RETRY_FORBIDDEN,
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
  createPr02P0OfficialEvidenceManifest,
  validatePr02P0Manifest,
  validatePr02P1ImportEvidence,
  buildPr02CanonicalRevision4,
  createPr02ParametersExecutionPackage,
  verifyPr02P1Preflight,
  verifyPr02P1InTxGuard,
  verifyPr02P1Postcheck,
  verifyPr02P2InTxGuard,
  verifyPr02P2Postcheck,
} from '../../scripts/fiscal/plan-pr02-parameters.mjs'
import {
  PR02_TARGET_CATALOG_REVISION_R4,
  PR02_SUPPORTED_CATALOG_REVISIONS,
  validatePr02CatalogContract,
} from '../../scripts/fiscal/plan-pr02-staging.mjs'
import {
  validatePr02ParametersCliArgs,
} from '../../scripts/fiscal/execute-pr02-parameters-staging.mjs'

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

  // 5. Verifiers for PR02-P1 preflight and postcheck
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

  it('verifies P1 in-tx guard: passes when R3 is expired, R4 is absent, issuer is disabled', () => {
    const validGuard = {
      catalog_total_count: 3,
      rev1_exists: true,
      rev2_exists: true,
      rev3_exists: true,
      rev3_hash_match: true,
      rev3_expired: true,
      rev4_exists: false,
      expected_issuer_present: true,
      expected_issuer_enabled: false,
      unexpected_enabled_issuers: 0,
      candidate_rev4_hash_valid: true,
      candidate_rev4_unexpired: true,
      candidate_rev4_not_future: true,
    }

    expect(verifyPr02P1InTxGuard(validGuard)).toBe(true)

    // Falla si el conteo del baseline no es exactamente 3 (baseline modificado)
    expect(() => verifyPr02P1InTxGuard({ ...validGuard, catalog_total_count: 2 })).toThrow(/PR02_P1_BASELINE_COUNT_MISMATCH/)
    expect(() => verifyPr02P1InTxGuard({ ...validGuard, catalog_total_count: 4 })).toThrow(/PR02_P1_BASELINE_COUNT_MISMATCH/)
    // Falla si R1 o R2 no existen
    expect(() => verifyPr02P1InTxGuard({ ...validGuard, rev1_exists: false })).toThrow(/PR02_P1_BASELINE_REV1_MISSING/)
    expect(() => verifyPr02P1InTxGuard({ ...validGuard, rev2_exists: false })).toThrow(/PR02_P1_BASELINE_REV2_MISSING/)
    // Falla si R3 no existe
    expect(() => verifyPr02P1InTxGuard({ ...validGuard, rev3_exists: false })).toThrow(/PR02_P1_REV3_MISSING/)
    // Falla si R3 hash no coincide
    expect(() => verifyPr02P1InTxGuard({ ...validGuard, rev3_hash_match: false })).toThrow(/PR02_P1_REV3_HASH_MISMATCH/)
    // Falla si R3 no ha expirado
    expect(() => verifyPr02P1InTxGuard({ ...validGuard, rev3_expired: false })).toThrow(/PR02_P1_REV3_NOT_EXPIRED/)
    // Falla si R4 ya existe
    expect(() => verifyPr02P1InTxGuard({ ...validGuard, rev4_exists: true })).toThrow(/PR02_P1_REV4_ALREADY_EXISTS/)
    // Falla si el emisor no está presente
    expect(() => verifyPr02P1InTxGuard({ ...validGuard, expected_issuer_present: false })).toThrow(/PR02_P1_ISSUER_NOT_FOUND/)
    // Falla si el emisor está habilitado
    expect(() => verifyPr02P1InTxGuard({ ...validGuard, expected_issuer_enabled: true })).toThrow(/PR02_P1_ISSUER_UNEXPECTEDLY_ENABLED/)
    // Falla si hay emisores inesperados habilitados
    expect(() => verifyPr02P1InTxGuard({ ...validGuard, unexpected_enabled_issuers: 1 })).toThrow(/PR02_P1_UNEXPECTED_ENABLED_ISSUERS/)
    // Falla si la propuesta de R4 está expirada
    expect(() => verifyPr02P1InTxGuard({ ...validGuard, candidate_rev4_unexpired: false })).toThrow(/PR02_P1_CANDIDATE_REV4_EXPIRED/)
    // Falla si la propuesta de R4 tiene consulta futura
    expect(() => verifyPr02P1InTxGuard({ ...validGuard, candidate_rev4_not_future: false })).toThrow(/PR02_P1_CANDIDATE_REV4_FUTURE_CONSULTED/)
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

  // 6. Verifiers for PR02-P2 in-tx guard and postcheck
  it('verifies P2 in-tx guard: passes when R4 is present disabled and unexpired, R3 hash matches, PV2 disabled', () => {
    const validP2Guard = {
      catalog_total_count: 4,
      rev1_exists: true,
      rev2_exists: true,
      rev3_exists: true,
      rev3_hash_match: true,
      rev3_expired: true,
      rev4_exists: true,
      rev4_enabled: false,
      rev4_hash_match: true,
      rev4_unexpired: true,
      rev4_not_future: true,
      expected_issuer_present: true,
      expected_issuer_enabled: false,
      unexpected_enabled_issuers: 0,
    }

    expect(verifyPr02P2InTxGuard(validP2Guard)).toBe(true)

    // Falla si el conteo del catálogo no es exactamente 4 (baseline modificado)
    expect(() => verifyPr02P2InTxGuard({ ...validP2Guard, catalog_total_count: 3 })).toThrow(/PR02_P2_BASELINE_COUNT_MISMATCH/)
    expect(() => verifyPr02P2InTxGuard({ ...validP2Guard, catalog_total_count: 5 })).toThrow(/PR02_P2_BASELINE_COUNT_MISMATCH/)
    // Falla si R1 o R2 no existen
    expect(() => verifyPr02P2InTxGuard({ ...validP2Guard, rev1_exists: false })).toThrow(/PR02_P2_BASELINE_REV1_MISSING/)
    expect(() => verifyPr02P2InTxGuard({ ...validP2Guard, rev2_exists: false })).toThrow(/PR02_P2_BASELINE_REV2_MISSING/)
    // Falla si R4 no existe
    expect(() => verifyPr02P2InTxGuard({ ...validP2Guard, rev4_exists: false })).toThrow(/PR02_P2_REVISION_4_MISSING/)
    // Falla si R4 ya está habilitada
    expect(() => verifyPr02P2InTxGuard({ ...validP2Guard, rev4_enabled: true })).toThrow(/PR02_P2_REVISION_4_ALREADY_ENABLED/)
    // Falla si R4 hash no coincide
    expect(() => verifyPr02P2InTxGuard({ ...validP2Guard, rev4_hash_match: false })).toThrow(/PR02_P2_REVISION_4_HASH_MISMATCH/)
    // Falla si R4 está expirada
    expect(() => verifyPr02P2InTxGuard({ ...validP2Guard, rev4_unexpired: false })).toThrow(/PR02_P2_REVISION_4_EXPIRED/)
    // Falla si R3 no existe
    expect(() => verifyPr02P2InTxGuard({ ...validP2Guard, rev3_exists: false })).toThrow(/PR02_P2_REVISION_3_MISSING/)
    // Falla si R3 baseline hash difiere
    expect(() => verifyPr02P2InTxGuard({ ...validP2Guard, rev3_hash_match: false })).toThrow(/PR02_P2_REV3_BASELINE_MISMATCH/)
    // Falla si R3 no está expirado
    expect(() => verifyPr02P2InTxGuard({ ...validP2Guard, rev3_expired: false })).toThrow(/PR02_P2_REV3_NOT_EXPIRED/)
    // Falla si emisor PV2 está habilitado
    expect(() => verifyPr02P2InTxGuard({ ...validP2Guard, expected_issuer_enabled: true })).toThrow(/PR02_P2_ISSUER_PV2_NOT_DISABLED/)
  })

  it('verifies P2 postcheck: confirms R4 enabled, unexpired and R3 intact with real hash check', () => {
    const hash = 'a'.repeat(64)
    const raw = {
      transaction_read_only: 'on',
      observed_at: new Date().toISOString(),
      rev4_exists: true,
      rev4_enabled: true,
      rev4_fuente_sha256: hash,
      rev4_valid: true,
      rev3_exists: true,
      rev3_fuente_sha256: PR02_CATALOG_REV3_HASH,
      expected_issuer_enabled: false,
    }

    const res = verifyPr02P2Postcheck(raw, { fuenteSha256: hash })
    expect(res.status).toBe('PASS')
    expect(res.rev4Enabled).toBe(true)
    expect(res.rev4Valid).toBe(true)

    // Falla si R3 hash difiere en postcheck
    expect(() =>
      verifyPr02P2Postcheck(
        { ...raw, rev3_fuente_sha256: 'f'.repeat(64) },
        { fuenteSha256: hash }
      )
    ).toThrow(/PR02_P2_REV3_BASELINE_MISMATCH/)
  })

  // 7. P0 Manifest creation and validation
  it('creates and validates P0 official evidence manifest (zero secrets allowed)', () => {
    const ivaHash = 'a'.repeat(64)
    const condHash = 'b'.repeat(64)
    const manifest = createPr02P0OfficialEvidenceManifest({
      consultado_en: '2026-11-04T12:00:00.000Z',
      identificador_proceso: 'P0_TEST_PROC_001',
      colector_identidad: 'scripts/fiscal/collect-pr02-p0-evidence.mjs',
      ejecucion_autorizada_id: 'e1000000-2026-4011-a001-000000000001',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      iva_respuesta_original_sha256: ivaHash,
      iva_archivo_normalizado_sha256: ivaHash,
      condition_respuesta_original_sha256: condHash,
      condition_archivo_normalizado_sha256: condHash,
      transporte_validado: true,
    })

    expect(manifest.entorno).toBe('HOMOLOGACION')
    expect(manifest.accredited).toBe(true)
    expect(manifest.manifest_sha256).toHaveLength(64)
    expect(validatePr02P0Manifest(manifest)).toBe(true)

    // Rechaza si falta colector_identidad
    expect(() => validatePr02P0Manifest({ ...manifest, colector_identidad: '' })).toThrow(/P0_MANIFEST_COLLECTOR_IDENTITY_REQUIRED/)
    // Rechaza si falta ejecucion_autorizada_id
    expect(() => validatePr02P0Manifest({ ...manifest, ejecucion_autorizada_id: '' })).toThrow(/P0_MANIFEST_EXECUTION_ID_REQUIRED/)
    // Rechaza si el scope no es P0
    expect(() => validatePr02P0Manifest({ ...manifest, ejecucion_autorizada_scope: 'PR02_P1_SCOPE' })).toThrow(/P0_MANIFEST_SCOPE_MISMATCH/)
    // Rechaza si accredited es false
    expect(() => validatePr02P0Manifest({ ...manifest, accredited: false })).toThrow(/P0_MANIFEST_NOT_ACCREDITED/)

    // Rechaza secretos en el manifiesto
    expect(() =>
      createPr02P0OfficialEvidenceManifest({
        consultado_en: '2026-11-04T12:00:00.000Z',
        identificador_proceso: 'P0_TEST',
        iva_respuesta_original_sha256: ivaHash,
        iva_archivo_normalizado_sha256: ivaHash,
        condition_respuesta_original_sha256: condHash,
        condition_archivo_normalizado_sha256: condHash,
        transporte_validado: true,
        token: 'SECRET_TOKEN_XYZ',
      } as any)
    ).toThrow(/P0_MANIFEST_SECRETS_PROHIBITED/)

    // Rechaza fecha en el futuro
    expect(() =>
      createPr02P0OfficialEvidenceManifest({
        consultado_en: '2026-11-04T15:00:00.000Z',
        now: '2026-11-04T12:00:00.000Z',
        identificador_proceso: 'P0_TEST',
        iva_respuesta_original_sha256: ivaHash,
        iva_archivo_normalizado_sha256: ivaHash,
        condition_respuesta_original_sha256: condHash,
        condition_archivo_normalizado_sha256: condHash,
        transporte_validado: true,
      })
    ).toThrow(/P0_MANIFEST_CONSULTED_IN_FUTURE/)
  })

  // 7.b Catalog row digest verification
  it('computes catalog row digest and detects any column discrepancy in row', () => {
    const row = {
      revision: 3,
      condiciones: [{ id: 5, descripcion: 'Consumidor Final', comprobantes: [1, 6, 11] }],
      alicuotas: [{ id: 5, descripcion: '21%' }],
      fuente_sha256: REV3_SOURCE_SHA256,
      consultado_en: '2026-11-03T02:00:00.000Z',
      vence_en: '2026-11-04T02:59:59.000Z',
      habilitado: true,
    }
    const digest1 = computeCatalogRowDigest(row)
    expect(digest1).toMatch(/^[0-9a-f]{64}$/)
    expect(computeCatalogRowDigest(row)).toBe(digest1)

    // Alterar alícuota cambia el digest de fila
    const alteredRow = { ...row, alicuotas: [{ id: 4, descripcion: '10.5%' }] }
    expect(computeCatalogRowDigest(alteredRow)).not.toBe(digest1)

    // Alterar fecha cambia el digest de fila
    const alteredDate = { ...row, vence_en: '2026-11-05T02:59:59.000Z' }
    expect(computeCatalogRowDigest(alteredDate)).not.toBe(digest1)
  })

  // 8. P1 Import evidence validation
  it('validates P1 import evidence against P0 manifest', () => {
    const ivaSha = 'a'.repeat(64)
    const condSha = 'b'.repeat(64)
    const expectedIvaSha = createHash('sha256').update(SYNTHETIC_IVA_EVIDENCE).digest('hex')
    const expectedCondSha = createHash('sha256').update(SYNTHETIC_CONDITION_EVIDENCE).digest('hex')

    // Crear evidencias con hashes predecibles
    const manifest = createPr02P0OfficialEvidenceManifest({
      consultado_en: '2026-11-04T12:00:00.000Z',
      identificador_proceso: 'P0_TEST_PROC_002',
      iva_respuesta_original_sha256: ivaSha,
      iva_archivo_normalizado_sha256: expectedIvaSha,
      condition_respuesta_original_sha256: condSha,
      condition_archivo_normalizado_sha256: expectedCondSha,
      transporte_validado: true,
    })

    // Importación con hashes coincidentes
    const importRes = validatePr02P1ImportEvidence({
      manifest,
      ivaText: SYNTHETIC_IVA_EVIDENCE,
      conditionText: SYNTHETIC_CONDITION_EVIDENCE,
      now: '2026-11-04T14:00:00.000Z',
    })
    expect(importRes.status).toBe('PASS')
    expect(importRes.officialEvidenceVerified).toBe(true)

    // Rechaza si el manifiesto está ausente
    expect(() =>
      validatePr02P1ImportEvidence({
        manifest: null,
        ivaText: SYNTHETIC_IVA_EVIDENCE,
        conditionText: SYNTHETIC_CONDITION_EVIDENCE,
      })
    ).toThrow(/P1_IMPORT_MANIFEST_REQUIRED/)

    // Rechaza si el hash de ivaText difiere del manifiesto
    const alteredManifest = {
      ...manifest,
      iva_archivo_normalizado_sha256: '0'.repeat(64),
    }
    expect(() =>
      validatePr02P1ImportEvidence({
        manifest: alteredManifest,
        ivaText: SYNTHETIC_IVA_EVIDENCE,
        conditionText: SYNTHETIC_CONDITION_EVIDENCE,
      })
    ).toThrow(/P1_IMPORT_IVA_HASH_MISMATCH/)
  })

  // 9. Catalog contract validator from plan-pr02-staging
  it('confirms validatePr02CatalogContract validates supported catalog revisions and fail-closed rules', () => {
    expect(PR02_TARGET_CATALOG_REVISION_R4).toBe(4)
    expect(PR02_SUPPORTED_CATALOG_REVISIONS).toEqual([3, 4])

    const now = '2026-11-04T12:00:00.000Z'
    const validR4Catalog = {
      revision: 4,
      fuente_sha256: 'a'.repeat(64),
      habilitado: true,
      consultado_en: '2026-11-04T10:00:00.000Z',
      vence_en: '2026-11-05T12:00:00.000Z',
      condiciones: [{ id: 5, descripcion: 'Consumidor Final', comprobantes: [1, 6, 11] }],
      alicuotas: [{ id: 5, descripcion: '21%' }],
    }

    expect(validatePr02CatalogContract(validR4Catalog, 4, { now })).toBe(true)
    expect(() => validatePr02CatalogContract({ ...validR4Catalog, habilitado: false }, 4, { now })).toThrow(/CATALOG_NOT_ENABLED/)
    expect(() => validatePr02CatalogContract({ ...validR4Catalog, revision: 3 }, 4, { now })).toThrow(/CATALOG_REVISION_MISMATCH/)

    // Rechaza catálogo expirado según el reloj
    expect(() =>
      validatePr02CatalogContract(
        { ...validR4Catalog, vence_en: '2026-11-04T11:59:59.000Z' },
        4,
        { now }
      )
    ).toThrow(/CATALOG_EXPIRED/)

    // Rechaza consultado_en en el futuro
    expect(() =>
      validatePr02CatalogContract(
        { ...validR4Catalog, consultado_en: '2026-11-04T13:00:00.000Z' },
        4,
        { now }
      )
    ).toThrow(/CATALOG_CONSULTED_IN_FUTURE/)

    // Rechaza ID de condición duplicado
    expect(() =>
      validatePr02CatalogContract(
        {
          ...validR4Catalog,
          condiciones: [
            { id: 1, descripcion: 'Cond A', comprobantes: [1] },
            { id: 1, descripcion: 'Cond B', comprobantes: [2] },
          ],
        },
        4,
        { now }
      )
    ).toThrow(/CATALOG_CONDICION_DUPLICATE_ID/)

    // Rechaza código de comprobante duplicado
    expect(() =>
      validatePr02CatalogContract(
        {
          ...validR4Catalog,
          condiciones: [
            { id: 1, descripcion: 'Cond A', comprobantes: [1, 1] },
          ],
        },
        4,
        { now }
      )
    ).toThrow(/CATALOG_COMPROBANTE_DUPLICATE/)

    // Exige procedencia acreditada si requireAccreditedProvenance está activo
    expect(() =>
      validatePr02CatalogContract(validR4Catalog, 4, { now, requireAccreditedProvenance: true })
    ).toThrow(/CATALOG_PROVENANCE_NOT_ACCREDITED/)

    expect(
      validatePr02CatalogContract(
        { ...validR4Catalog, provenance: { accredited: true } },
        4,
        { now, requireAccreditedProvenance: true }
      )
    ).toBe(true)
  })

  // 10. Call tracker verification
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

  // 11. Execution package creation & outcomes
  it('creates execution package and verifies outcomes constants', () => {
    expect(PR02_PARAMETERS_ALLOWED_SCOPES).toContain(PR02_P0_SCOPE)
    expect(PR02_PARAMETERS_ALLOWED_SCOPES).toContain(PR02_P1_SCOPE)
    expect(PR02_PARAMETERS_ALLOWED_SCOPES).toContain(PR02_P1_LEGACY_SCOPE)
    expect(PR02_PARAMETERS_ALLOWED_SCOPES).toContain(PR02_P2_SCOPE)
    expect(PR02_PARAMETERS_TARGET_PROJECT_REF).toBe('acoyfwwmhaeruciyedri')
    expect(PR02_PARAMETERS_EXPECTED_ISSUER_CUIT).toBe('20415005963')
    expect(PR02_PARAMETERS_EXPECTED_ISSUER_PV).toBe(2)
    expect(UNCERTAIN_WRITE_RETRY_FORBIDDEN).toBe(true)

    expect(PR02_EXECUTION_OUTCOMES.NOT_STARTED).toBe('NOT_STARTED')
    expect(PR02_EXECUTION_OUTCOMES.PREFLIGHT_FAILED_NO_WRITE).toBe('PREFLIGHT_FAILED_NO_WRITE')
    expect(PR02_EXECUTION_OUTCOMES.TRANSACTION_ROLLED_BACK_CONFIRMED).toBe('TRANSACTION_ROLLED_BACK_CONFIRMED')
    expect(PR02_EXECUTION_OUTCOMES.WRITE_COMMITTED).toBe('WRITE_COMMITTED')
    expect(PR02_EXECUTION_OUTCOMES.WRITE_COMMITTED_POSTCHECK_FAILED).toBe('WRITE_COMMITTED_POSTCHECK_FAILED')
    expect(PR02_EXECUTION_OUTCOMES.COMMIT_OUTCOME_UNKNOWN).toBe('COMMIT_OUTCOME_UNKNOWN')
    expect(PR02_EXECUTION_OUTCOMES.ROLLBACK_OUTCOME_UNKNOWN).toBe('ROLLBACK_OUTCOME_UNKNOWN')
    expect(PR02_EXECUTION_OUTCOMES.CONNECTION_CLOSE_FAILED_AFTER_COMMIT).toBe('CONNECTION_CLOSE_FAILED_AFTER_COMMIT')

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

  // 12. CLI arguments validation
  it('validates CLI arguments strictly fail-closed', () => {
    // Conflicto --authorized con --dry-run
    expect(() =>
      validatePr02ParametersCliArgs(['--authorized', '--dry-run'])
    ).toThrow(/CLI_ARGUMENT_CONFLICT/)

    // Argumento desconocido
    expect(() =>
      validatePr02ParametersCliArgs(['--unknown-flag'])
    ).toThrow(/INVALID_CLI_ARGUMENT/)

    // Argumento duplicado
    expect(() =>
      validatePr02ParametersCliArgs(['--dry-run', '--dry-run'])
    ).toThrow(/DUPLICATE_CLI_ARGUMENT/)

    // Argumento sin valor
    expect(() =>
      validatePr02ParametersCliArgs(['--scope'])
    ).toThrow(/MISSING_CLI_VALUE/)

    // Scope no permitido
    expect(() =>
      validatePr02ParametersCliArgs(['--dry-run', '--scope', 'INVALID_SCOPE'])
    ).toThrow(/INVALID_SCOPE/)

    // Ejecución autorizada válida
    const validArgs = validatePr02ParametersCliArgs([
      '--authorized',
      '--scope', PR02_P1_SCOPE,
      '--project-ref', PR02_PARAMETERS_TARGET_PROJECT_REF,
      '--head', 'a'.repeat(40),
      '--expected-head', 'a'.repeat(40),
    ])
    expect(validArgs.authorized).toBe(true)
    expect(validArgs.dryRun).toBe(false)
    expect(validArgs.scope).toBe(PR02_P1_SCOPE)

    // Ejecución autorizada P2 sin expected-hash falla
    expect(() =>
      validatePr02ParametersCliArgs([
        '--authorized',
        '--scope', PR02_P2_SCOPE,
        '--project-ref', PR02_PARAMETERS_TARGET_PROJECT_REF,
        '--head', 'a'.repeat(40),
        '--expected-head', 'a'.repeat(40),
      ])
    ).toThrow(/MISSING_EXPECTED_HASH/)
  })
})
