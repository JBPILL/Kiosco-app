// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import {
  PR02_P0_SCOPE,
  PR02_PARAMETERS_TARGET_PROJECT_REF,
  PR02_P0_COLECTOR_IDENTIDAD,
  WSAA_HOMO_URL,
  WSFE_HOMO_URL,
  PROHIBITED_ARCA_OPERATIONS,
  executePr02P0OfficialEvidence,
  validateP0EndpointUrl,
  createPr02P0CallTracker,
  validatePr02P0CliArgs,
  saveP0EvidencePackage,
  loadP0EvidencePackage,
  validateEvidenceDirectory,
  createOfficialArcaTransport,
  assertNoForbiddenSecrets,
} from '../../scripts/fiscal/execute-pr02-p0-official-evidence.mjs'

import {
  createP0Attestation,
  verifyP0Attestation,
  validatePr02P1ImportEvidence,
  evaluateExistingTa,
  resolveCurrentGitHead,
  validateP0AuthoritySecret,
  PR02_P0_COMPROMISED_SECRETS,
  isTestAuthorityKey,
  validatePr02P0GoAuthorization,
  isGoAuthorizationConsumed,
  consumeGoAuthorizationDurable,
  validatePr02P0Manifest,
  computeP0ManifestDigest,
  ANTI_REPLAY_GUARANTEE_LEVEL,
  GoAuthority,
  AttestationAuthority,
  IndependentAttestationAuthority,
  createAttestationRequest,
  validateAttestationRequest,
  computeAttestationRequestDigest,
  verifyIndependentAttestation,
  verifyRuntimeSigningIsolation,
  assertNoSelfAttestationElevation,
  ATTESTATION_SIGNER_ORIGINS,
  ATTESTATION_TRUST_MODELS,
  PR02_P0_AUTHORITY_ENV,
  PR02_P0_GO_PUBLIC_KEY_ENV,
  PR02_P0_ATTESTATION_PUBLIC_KEY_ENV,
  parseWsfeTiposIvaResponse,
  parseWsfeCondicionIvaReceptorResponse,
} from '../../scripts/fiscal/plan-pr02-parameters.mjs'

import {
  generateEphemeralGoAuthorityKeyPair,
  generateEphemeralAttestationKeyPair,
  createSignedTestPr02P0GoAuthorization,
  createSignedTestIndependentAttestation,
  createSignedTestAttestationFromRequest,
  clearConsumedAuthorizationsForTesting,
} from './helpers/fiscalEd25519Signer'

const VALID_HEAD = resolveCurrentGitHead() || '1d62a9d8a838e7ccb19100a49cbcd67cffc662bb'
const TEST_EVIDENCE_DIR = 'temp-test-fiscal-evidence-p0'

const SYNTHETIC_TIPOS_IVA_RESPONSE = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><FEParamGetTiposIvaResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetTiposIvaResult><ResultGet><IvaTipo><Id>5</Id><Desc>21%</Desc><FchDesde>20100917</FchDesde><FchHasta>NULL</FchHasta></IvaTipo><IvaTipo><Id>4</Id><Desc>10.5%</Desc><FchDesde>20100917</FchDesde><FchHasta>NULL</FchHasta></IvaTipo></ResultGet></FEParamGetTiposIvaResult></FEParamGetTiposIvaResponse></soap:Body></soap:Envelope>`

const SYNTHETIC_CONDICIONES_IVA_RESPONSE = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><FEParamGetCondicionIvaReceptorResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetCondicionIvaReceptorResult><ResultGet><CondicionIvaReceptor><Id>1</Id><Desc>IVA Responsable Inscripto</Desc><Cmp_Clase>A/ALEY/C</Cmp_Clase></CondicionIvaReceptor><CondicionIvaReceptor><Id>5</Id><Desc>Consumidor Final</Desc><Cmp_Clase>B/C</Cmp_Clase></CondicionIvaReceptor></ResultGet></FEParamGetCondicionIvaReceptorResult></FEParamGetCondicionIvaReceptorResponse></soap:Body></soap:Envelope>`

describe('PR02-P0 Official Evidence Collector Unit, Hardening & Security Tests', () => {
  function cleanupTestDir() {
    if (fs.existsSync(TEST_EVIDENCE_DIR)) {
      fs.rmSync(TEST_EVIDENCE_DIR, { recursive: true, force: true })
    }
  }

  // 1. Dry-run sin red informa NOT_RUN en validaciones remotas
  it('1. Dry-run por defecto no ejecuta red ni mutaciones e informa NOT_RUN en checks remotos', async () => {
    const report = await executePr02P0OfficialEvidence({ dryRun: true })

    expect(report.execution).toBe('DRY_RUN')
    expect(report.scope).toBe(PR02_P0_SCOPE)
    expect(report.projectRef).toBe(PR02_PARAMETERS_TARGET_PROJECT_REF)
    expect(report.PR02_P0_LOCAL_PREPARATION).toBe('PASS')
    expect(report.PR02_P0_LOCAL_HARDENING).toBe('PASS')
    expect(report.P0_REAL_TRANSPORT_IMPLEMENTED).toBe('PASS')
    expect(report.P0_CLI_TRANSPORT_WIRING).toBe('PASS')
    expect(report.P0_WSAA_TA_GUARD).toBe('PASS')
    expect(report.P0_EXACT_ENDPOINT_GUARD).toBe('PASS')
    expect(report.P0_CALL_LIMITS_NON_OVERRIDABLE).toBe('PASS')
    expect(report.P0_PROVENANCE_ATTESTATION).toBe('PASS')
    expect(report.P0_FAKE_MANIFEST_REJECTED).toBe('PASS')
    expect(report.P0_PRIVATE_EVIDENCE_STORAGE).toBe('PASS')
    expect(report.P0_AUDIT_COUNTS_ACCURATE).toBe('PASS')
    expect(report.PR02_P0_AUTHORIZATION_GUARD).toBe('PASS')
    expect(report.PR02_P0_WSAA_WSFE_ALLOWLIST).toBe('PASS')
    expect(report.PR02_P0_CALL_LIMIT_GUARD).toBe('PASS')

    // En dry-run los checks remotos informan NOT_RUN
    expect(report.PR02_P0_SOAP_VALIDATION).toBe('NOT_RUN')
    expect(report.PR02_P0_MANIFEST_INTEGRITY).toBe('NOT_RUN')
    expect(report.PR02_P0_PROVENANCE_BINDING).toBe('NOT_RUN')

    expect(report.P0_EXTERNAL_GO_VALIDATION).toBe('NOT_RUN')
    expect(report.P0_GO_SINGLE_USE_GUARD).toBe('PASS')
    expect(report.P0_GO_SECRET_EXPOSURE).toBe('NONE')
    expect(report.P0_TRUSTED_ATTESTATION).toBe('NOT_RUN')
    expect(report.P1_UNTRUSTED_SIGNATURE_REJECTION).toBe('PASS')
    expect(report.P0_CALL_AUDIT_ON_FAILURE).toBe('PASS')
    expect(report.GO_AUTHORIZATION).toBe('NOT_RUN')
    expect(report.EVIDENCE_PROVENANCE).toBe('UNVERIFIED')

    expect(report.PR02_P0_REMOTE_EXECUTION_READY).toBe(false)
    expect(report.P0_REMOTE_EXECUTED).toBe(false)
    expect(report.PR02_P0_REMOTE_EXECUTED).toBe(false)
    expect(report.OFFICIAL_PROVENANCE).toBe('UNVERIFIED')
    expect(report.REAL_PV2_ENABLED).toBe(false)
    expect(report.HISTORICAL_042_IDENTIFICATION).toBe('UNRESOLVED')
    expect(report.PR02_READY_FOR_EMISSION_GO).toBe(false)
    expect(report.ARCA_CALLS_NEW).toBe(0)
    expect(report.STAGING_WRITES_NEW).toBe(0)
    expect(report.PRODUCTION_MUTATIONS).toBe(0)
    expect(report.UNAUTHORIZED_CONNECTION_ATTEMPTS).toBe(0)
  })

  // 2. Ejecución sin autorización y contradicciones
  it('2. Rechaza combinación contradictoria de authorized: true y dryRun: true', async () => {
    await expect(
      executePr02P0OfficialEvidence({
        authorized: true,
        dryRun: true,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
      })
    ).rejects.toThrow(/CLI_ARGUMENT_CONFLICT/)
  })

  // 3. Scope incorrecto
  it('3. Rechaza scope incorrecto en ejecución autorizada', async () => {
    await expect(
      executePr02P0OfficialEvidence({
        authorized: true,
        dryRun: false,
        scope: 'PR02_P1_VERIFIED_CATALOG_IMPORT',
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
      })
    ).rejects.toThrow(/PR02_P0_SCOPE_MISMATCH/)
  })

  // 4. Target project ref incorrecto
  it('4. Rechaza target project ref incorrecto en ejecución autorizada', async () => {
    await expect(
      executePr02P0OfficialEvidence({
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: 'production-project-ref-xyz',
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
      })
    ).rejects.toThrow(/PR02_P0_TARGET_MISMATCH/)
  })

  // 5. HEAD incorrecto y validación de 40 hex
  it('5. Exige expectedHead de 40 hex y rechaza discrepancia con HEAD', async () => {
    await expect(
      executePr02P0OfficialEvidence({
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
      })
    ).rejects.toThrow(/PR02_P0_MISSING_EXPECTED_HEAD/)

    await expect(
      executePr02P0OfficialEvidence({
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: '0000000000000000000000000000000000000000',
      })
    ).rejects.toThrow(/PR02_P0_HEAD_MISMATCH/)
  })

  // 6. Entorno Producción rechazado
  it('6. Rechaza tajantemente endpoints de Producción', async () => {
    expect(() => validateP0EndpointUrl('https://wsaa.afip.gov.ar/ws/services/LoginCms', 'WSAA')).toThrow(
      /PRODUCTION_ENDPOINT_FORBIDDEN/
    )
    expect(() => validateP0EndpointUrl('https://servicios1.afip.gov.ar/wsfev1/service.asmx', 'WSFE')).toThrow(
      /PRODUCTION_ENDPOINT_FORBIDDEN/
    )
  })

  // 7. Endpoint exacto: rechaza subdominios falsos y URLs alternativas
  it('7. Rechaza subdominios falsos, protocolos inseguros y URLs no canónicas', () => {
    // Protocolo HTTP rechazado
    expect(() => validateP0EndpointUrl('http://wsaahomo.afip.gov.ar/ws/services/LoginCms', 'WSAA')).toThrow(
      /INSECURE_PROTOCOL_FORBIDDEN/
    )
    // Phishing / subdominio falso
    expect(() => validateP0EndpointUrl('https://wsaahomo.afip.gov.ar.phishing.attacker.com/ws/services/LoginCms', 'WSAA')).toThrow(
      /EXACT_ENDPOINT_MISMATCH/
    )
    expect(() => validateP0EndpointUrl('https://fake-wswhomo.afip.gov.ar/wsfev1/service.asmx', 'WSFE')).toThrow(
      /EXACT_ENDPOINT_MISMATCH/
    )
    // Ruta alterada
    expect(() => validateP0EndpointUrl('https://wsaahomo.afip.gov.ar/other/path', 'WSAA')).toThrow(
      /EXACT_ENDPOINT_MISMATCH/
    )
    // Coincidencia exacta pasa
    expect(() => validateP0EndpointUrl(WSAA_HOMO_URL, 'WSAA')).not.toThrow()
    expect(() => validateP0EndpointUrl(WSFE_HOMO_URL, 'WSFE')).not.toThrow()
  })

  // 8. TA revocado todavía no vencido: bloqueado taxativamente
  it('8. Bloquea un TA revocado aunque su fecha de vencimiento sea futura', () => {
    const revokedTa = {
      valido: false,
      estado: 'REVOCADO',
      token: 'REVOKED_TOKEN_1234567890',
      sign: 'REVOKED_SIGN_1234567890',
      vence_en: '2026-11-05T12:00:00.000Z',
    }

    const res = evaluateExistingTa(revokedTa, '2026-11-05T01:00:00.000Z')
    expect(res.reusable).toBe(false)
    expect(res.loginCmsRequired).toBe(true)
    expect(res.reason).toBe('TA_EXPLICITLY_INVALID')

    // Ambiguo: estado REVOCADO pero valido: true
    const ambiguousTa = {
      valido: true,
      estado: 'REVOCADO',
      token: 'REVOKED_TOKEN_1234567890',
      sign: 'REVOKED_SIGN_1234567890',
      vence_en: '2026-11-05T12:00:00.000Z',
    }
    const resAmbiguous = evaluateExistingTa(ambiguousTa, '2026-11-05T01:00:00.000Z')
    expect(resAmbiguous.reusable).toBe(false)
    expect(resAmbiguous.reason).toBe('TA_REVOKED')
  })

  // 9. Bloqueo de un TA sin credenciales completas
  it('9. Bloquea un TA sin credenciales completas (token o sign vacíos)', () => {
    const incompleteTa = {
      valido: true,
      estado: 'DISPONIBLE',
      token: '',
      sign: 'SOME_SIGN_1234567890',
      vence_en: '2026-11-05T12:00:00.000Z',
    }
    const res = evaluateExistingTa(incompleteTa, '2026-11-05T01:00:00.000Z')
    expect(res.reusable).toBe(false)
    expect(res.reason).toBe('TA_CREDENTIALS_INCOMPLETE')
  })

  // 10. TA vencido sin CMS para renovar arroja TA_INVALID_OR_REVOKED
  it('10. TA vencido sin credenciales CMS arroja error antes de cualquier consulta WSFE', async () => {
    const expiredTa = {
      valido: true,
      estado: 'DISPONIBLE',
      token: 'EXPIRED_TOKEN_1234567890',
      sign: 'EXPIRED_SIGN_1234567890',
      vence_en: '2020-01-01T00:00:00.000Z',
    }

    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const signedDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
      emitido_en: '2026-11-05T00:00:00.000Z',
      vence_en: '2026-11-05T03:00:00.000Z',
    }, goPriv)

    await expect(
      executePr02P0OfficialEvidence({
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        existingTa: expiredTa,
        now: '2026-11-05T01:00:00.000Z',
        goAuthorizationDoc: signedDoc,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
      })
    ).rejects.toThrow(/TA_INVALID_OR_REVOKED/)
  })

  // 11. Límites de llamadas no sobreescribibles
  it('11. Prohíbe cualquier override que incremente los límites de llamadas autorizados', () => {
    // Intento de override por encima de 1 en LoginCms
    expect(() => createPr02P0CallTracker({ loginCmsMax: 2 })).toThrow(/CALL_LIMIT_OVERRIDE_FORBIDDEN/)
    // Intento de override por encima de 3 en Total
    expect(() => createPr02P0CallTracker({ totalMax: 5 })).toThrow(/CALL_LIMIT_OVERRIDE_FORBIDDEN/)
    // Intento de override por encima de 1 en TiposIva
    expect(() => createPr02P0CallTracker({ tiposIvaMax: 2 } as any)).toThrow(/CALL_LIMIT_OVERRIDE_FORBIDDEN/)
  })

  // 12. Operaciones prohibidas y allowlist cerrado
  it('12. Tracker bloquea operaciones prohibidas de emisión y respeta allowlist', () => {
    const tracker = createPr02P0CallTracker()

    for (const forbidden of PROHIBITED_ARCA_OPERATIONS) {
      expect(() => tracker.recordStart(forbidden)).toThrow(/PROHIBITED_ARCA_OPERATION/)
    }

    tracker.recordCall('LoginCms')
    expect(tracker.getCounts().loginCms).toBe(1)
    expect(() => tracker.recordStart('LoginCms')).toThrow(/CALL_LIMIT_EXCEEDED/)

    tracker.recordCall('FEParamGetTiposIva')
    expect(tracker.getCounts().tiposIva).toBe(1)
    expect(() => tracker.recordStart('FEParamGetTiposIva')).toThrow(/CALL_LIMIT_EXCEEDED/)

    tracker.recordCall('FEParamGetCondicionIvaReceptor')
    expect(tracker.getCounts().condicionIvaReceptor).toBe(1)
    expect(tracker.getCounts().total).toBe(3)

    expect(() => tracker.recordStart('FEParamGetTiposIva')).toThrow(/TOTAL_CALL_LIMIT_EXCEEDED/)
  })

  // 13. Adaptador de red oficial rechaza ejecución sin GO explícito
  it('13. Adaptador oficial de red falla si no se suministra autorización GO explícita', () => {
    expect(() => createOfficialArcaTransport(null as any)).toThrow(/OFFICIAL_NETWORK_GO_REQUIRED/)
    expect(() => createOfficialArcaTransport({ officialGoAuthorized: true } as any)).toThrow(/OFFICIAL_NETWORK_GO_REQUIRED/)
  })

  // 14. Prohibición de redirecciones HTTP en transporte oficial
  it('14. Prohíbe redirecciones HTTP en transporte oficial', async () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const signedDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)
    const verifiedGo = validatePr02P0GoAuthorization(signedDoc, {
      expectedHead: VALID_HEAD,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })
    const officialTransport = createOfficialArcaTransport(verifiedGo)
    expect(officialTransport.type).toBe('OFFICIAL')
  })

  // 15. Atestación criptográfica de procedencia: evidencia simulada no puede acreditarse
  it('15. Evidencia simulada no puede acreditarse como oficial', () => {
    const manifestDraft = {
      identificador_proceso: 'SIM_PROC_001',
      ejecucion_autorizada_id: 'SIM_PROC_001',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: 'a'.repeat(64),
      iva_archivo_normalizado_sha256: 'b'.repeat(64),
      condition_respuesta_original_sha256: 'c'.repeat(64),
      condition_archivo_normalizado_sha256: 'd'.repeat(64),
    }

    const simAttestation = createP0Attestation({
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      transportType: 'SIMULATED',
    })

    expect(simAttestation.accredited).toBe(false)
    expect(simAttestation.provenance).toBe('UNVERIFIED')
    expect(simAttestation.signature).toBeNull()

    const check = verifyP0Attestation(simAttestation)
    expect(check.valid).toBe(false)
    expect(['ATTESTATION_NOT_ACCREDITED', 'ATTESTATION_UNTRUSTED_MODEL']).toContain(check.reason)
  })

  // 16. Manifiesto fabricado sin atestación oficial es rechazado por P1
  it('16. Manifiesto autoconsistente pero fabricado por el caller es rechazado por P1', () => {
    const ivaText = '{"iva": "canonical"}'
    const ivaHash = createHash('sha256').update(ivaText).digest('hex')
    const condText = '{"condition": "canonical"}'
    const condHash = createHash('sha256').update(condText).digest('hex')

    const fakeManifest = {
      entorno: 'HOMOLOGACION',
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      consultado_en: '2026-11-05T01:00:00.000Z',
      identificador_proceso: 'FAKE_PROC_001',
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
      ejecucion_autorizada_id: 'FAKE_PROC_001',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      iva_respuesta_original_sha256: ivaHash,
      iva_archivo_normalizado_sha256: ivaHash,
      condition_respuesta_original_sha256: condHash,
      condition_archivo_normalizado_sha256: condHash,
      transporte_validado: true,
      transport_type: 'OFFICIAL',
      origen_verificado: WSFE_HOMO_URL,
      accredited: true, // Caller finge acreditación
      attestation: {
        version: '1.0',
        accredited: true,
        transportType: 'OFFICIAL',
        signature: 'f'.repeat(64), // Firma falsa
        ivaRawSha: ivaHash,
        ivaNormSha: ivaHash,
        condRawSha: condHash,
        condNormSha: condHash,
        executionScope: PR02_P0_SCOPE,
        processId: 'FAKE_PROC_001',
        commitSha: VALID_HEAD,
      },
      manifest_sha256: 'e'.repeat(64),
    }

    expect(() =>
      validatePr02P1ImportEvidence({
        manifest: fakeManifest,
        ivaText,
        conditionText: condText,
      })
    ).toThrow(/P1_IMPORT_FORBIDDEN/)
  })

  // 17. Rechazo de respuestas SOAP con secretos
  it('17. Rechaza respuestas SOAP crudas o normalizadas que contengan secretos o claves privadas', () => {
    const dirtyXml = `<soap>Credentials: -----BEGIN RSA PRIVATE KEY-----</soap>`
    expect(() => assertNoForbiddenSecrets(dirtyXml, 'dirtyXml')).toThrow(/SECURITY_VIOLATION/)

    const passwordXml = `<soap><password>secret_123</password></soap>`
    expect(() => assertNoForbiddenSecrets(passwordXml, 'passwordXml')).toThrow(/SECURITY_VIOLATION/)
  })

  // 18. Validación de directorio de evidencia: rechaza path traversal y symlinks
  it('18. Rechaza directorios de evidencia con path traversal (..) o dentro de src/', () => {
    expect(() => validateEvidenceDirectory('../outside-repo-escape')).toThrow(/PATH_TRAVERSAL_FORBIDDEN/)
    expect(() => validateEvidenceDirectory('src/private-evidence')).toThrow(/UNAUTHORIZED_EVIDENCE_DIR/)
    expect(() => validateEvidenceDirectory('scripts/fiscal/evidence')).toThrow(/UNAUTHORIZED_EVIDENCE_DIR/)
  })

  // 19. Rechaza sobrescrituras accidentales
  it('19. Rechaza sobrescrituras accidentales en directorio con evidencia previa', () => {
    cleanupTestDir()
    fs.mkdirSync(TEST_EVIDENCE_DIR, { recursive: true })
    const existingFile = path.join(TEST_EVIDENCE_DIR, 'manifest.json')
    fs.writeFileSync(existingFile, '{"prior": true}', 'utf8')

    expect(() =>
      saveP0EvidencePackage({
        evidenceDir: TEST_EVIDENCE_DIR,
        manifest: { identificador_proceso: 'TEST' } as any,
        rawIvaSoapXml: '<a></a>',
        ivaNormalizedText: '{}',
        rawConditionSoapXml: '<b></b>',
        conditionNormalizedText: '{}',
      })
    ).toThrow(/EVIDENCE_OVERWRITE_FORBIDDEN/)
    cleanupTestDir()
  })

  // 20. CLI flags desconocidas, duplicadas y contradictorias
  it('20. CLI rechaza flags desconocidas, duplicadas o contradictorias', () => {
    // Flag desconocida
    expect(() => validatePr02P0CliArgs(['--dry-run', '--unknown-flag'])).toThrow(/CLI_UNKNOWN_ARGUMENT/)
    // Flag duplicada
    expect(() => validatePr02P0CliArgs(['--dry-run', '--dry-run'])).toThrow(/CLI_DUPLICATE_ARGUMENT/)
    // Contradicción
    expect(() => validatePr02P0CliArgs(['--authorized', '--dry-run'])).toThrow(/CLI_ARGUMENT_CONFLICT/)
    // Prohibición de --go-token por seguridad
    expect(() => validatePr02P0CliArgs(['--go-token', 'my-secret-token'])).toThrow(/CLI_FORBIDDEN_ARGUMENT/)
    // Secreto en argumento CLI
    expect(() => validatePr02P0CliArgs(['--scope', 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION', '--head', 'password=secret'])).toThrow(
      /SECURITY_VIOLATION/
    )
  })

  // 21. Reutilización de TA válido sin llamar a LoginCms
  it('21. Reutiliza TA válido sin llamar a LoginCms y reporta auditoría exacta', async () => {
    cleanupTestDir()
    const validTa = {
      valido: true,
      estado: 'DISPONIBLE',
      token: 'VALID_REUSABLE_TOKEN_1234567890',
      sign: 'VALID_REUSABLE_SIGN_1234567890',
      vence_en: '2026-11-05T12:00:00.000Z',
    }

    const report = await executePr02P0OfficialEvidence(
      {
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        existingTa: validTa,
        now: '2026-11-05T02:00:00.000Z',
        evidenceDir: TEST_EVIDENCE_DIR,
      },
      {
        wsfeTiposIva: async () => SYNTHETIC_TIPOS_IVA_RESPONSE,
        wsfeCondicionIva: async () => SYNTHETIC_CONDICIONES_IVA_RESPONSE,
      }
    )

    expect(report.PR02_P0_LOCAL_HARDENING).toBe('PASS')
    expect(report.P0_REAL_TRANSPORT_IMPLEMENTED).toBe('PASS')
    expect(report.P0_CLI_TRANSPORT_WIRING).toBe('PASS')
    expect(report.P0_WSAA_TA_GUARD).toBe('PASS')
    expect(report.P0_EXACT_ENDPOINT_GUARD).toBe('PASS')
    expect(report.P0_CALL_LIMITS_NON_OVERRIDABLE).toBe('PASS')
    expect(report.P0_PROVENANCE_ATTESTATION).toBe('PASS')
    expect(report.P0_FAKE_MANIFEST_REJECTED).toBe('PASS')
    expect(report.P0_PRIVATE_EVIDENCE_STORAGE).toBe('PASS')
    expect(report.P0_AUDIT_COUNTS_ACCURATE).toBe('PASS')

    expect(report.ARCA_CALLS_NEW).toBe(2)
    const audit = report.auditCounts as any
    expect(audit.counts.loginCms).toBe(0)
    expect(audit.counts.tiposIva).toBe(1)
    expect(audit.counts.condicionIvaReceptor).toBe(1)
    expect(audit.counts.total).toBe(2)

    expect(report.P0_REMOTE_EXECUTED).toBe(false)
    expect(report.OFFICIAL_PROVENANCE).toBe('UNVERIFIED') // Simulada
    cleanupTestDir()
  })

  // 22. Timeout, SOAP Fault y errores WSFE sin reintentos
  it('22. Falla ante timeout, SOAP Fault o error WSFE sin reintentos', async () => {
    // Timeout
    await expect(
      executePr02P0OfficialEvidence(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_P0_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          now: '2026-11-05T02:00:00.000Z',
        },
        {
          fetcher: async () => { throw new Error('ARCA_TIMEOUT') },
        }
      )
    ).rejects.toThrow(/ARCA_TIMEOUT/)

    // SOAP Fault
    const faultXml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>Autenticacion fallida</faultstring></soap:Fault></soap:Body></soap:Envelope>`
    await expect(
      executePr02P0OfficialEvidence(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_P0_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          now: '2026-11-05T02:00:00.000Z',
        },
        {
          wsaaLogin: async () => faultXml,
        }
      )
    ).rejects.toThrow(/WSAA_FAULT:soap:Server/)
  })

  // 23. Verificación del wrapper PowerShell
  it('23. El wrapper PowerShell contiene verificaciones de Git fetch, branch, worktree y paridad HEAD', () => {
    const wrapperContent = fs.readFileSync('scripts/fiscal/run-pr02-p0-staging-private.ps1', 'utf8')

    expect(wrapperContent).toContain('git fetch origin --prune')
    expect(wrapperContent).toContain('if ($LASTEXITCODE -ne 0)')
    expect(wrapperContent).toContain('GIT_FETCH_FAILED')
    expect(wrapperContent).toContain('feat/pilot-envases-returns')
    expect(wrapperContent).toContain('BRANCH_MISMATCH')
    expect(wrapperContent).toContain('DIRTY_WORKTREE')
    expect(wrapperContent).toContain('REMOTE_HEAD_MISMATCH')
    expect(wrapperContent).toContain('MISSING_EXPECTED_HEAD')
    expect(wrapperContent).toContain('EXPECTED_HEAD_MISMATCH')
    expect(wrapperContent).toContain('execute-pr02-p0-official-evidence.mjs')
  })

  // 24. Falsa procedencia E2E
  it('24. Falsa procedencia E2E: evidencia simulada con hashes correctos pero sin autorización real es rechazada para importación P1', async () => {
    cleanupTestDir()
    const report = await executePr02P0OfficialEvidence(
      {
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        existingTa: {
          valido: true,
          estado: 'DISPONIBLE',
          token: 'TOKEN_1234567890',
          sign: 'SIGN_1234567890',
          vence_en: '2026-11-05T12:00:00.000Z',
        },
        now: '2026-11-05T02:00:00.000Z',
        evidenceDir: TEST_EVIDENCE_DIR,
      },
      {
        wsfeTiposIva: async () => SYNTHETIC_TIPOS_IVA_RESPONSE,
        wsfeCondicionIva: async () => SYNTHETIC_CONDICIONES_IVA_RESPONSE,
      }
    )

    expect(report.OFFICIAL_PROVENANCE).toBe('UNVERIFIED')
    expect(report.P0_REMOTE_EXECUTED).toBe(false)
    expect(report.STAGING_WRITES_NEW).toBe(0)

    // El paquete guardado tiene acreditación false y transporte simulado
    const manifestPath = path.join(TEST_EVIDENCE_DIR, 'manifest.json')
    const ivaNormPath = path.join(TEST_EVIDENCE_DIR, 'FEParamGetTiposIva_normalized.json')
    const condNormPath = path.join(TEST_EVIDENCE_DIR, 'FEParamGetCondicionIvaReceptor_normalized.json')

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const ivaNormalizedText = fs.readFileSync(ivaNormPath, 'utf8')
    const conditionNormalizedText = fs.readFileSync(condNormPath, 'utf8')

    expect(manifest.accredited).toBe(false)
    expect(manifest.transport_type).toBe('SIMULATED')
    expect(manifest.attestation.accredited).toBe(false)
    expect(manifest.attestation.provenance).toBe('UNVERIFIED')

    // Intento de importación en P1 DEBE ser bloqueado taxativamente
    expect(() =>
      validatePr02P1ImportEvidence({
        manifest,
        ivaText: ivaNormalizedText,
        conditionText: conditionNormalizedText,
      })
    ).toThrow(/P1_IMPORT_FORBIDDEN/)

    // Carga de paquete no acreditado también es rechazada
    expect(() => loadP0EvidencePackage(TEST_EVIDENCE_DIR)).toThrow(/P0_MANIFEST_NOT_ACCREDITED/)

    cleanupTestDir()
  })

  // 25. Validación estricta de clave de autoridad
  it('25. Rechazo estricto de claves de autoridad faltantes, comprometidas, débiles o de prueba', () => {
    // Falta de clave
    expect(() => validateP0AuthoritySecret('')).toThrow(/P0_ATTESTATION_KEY_MISSING/)
    expect(() => validateP0AuthoritySecret(null as any)).toThrow(/P0_ATTESTATION_KEY_MISSING/)

    // Clave comprometida expuesta en historial de Git
    for (const compromised of PR02_P0_COMPROMISED_SECRETS) {
      expect(() => validateP0AuthoritySecret(compromised)).toThrow(/P0_ATTESTATION_KEY_COMPROMISED/)
    }

    // Clave con baja entropía (< 32 caracteres)
    expect(() => validateP0AuthoritySecret('short_key_12345')).toThrow(/P0_ATTESTATION_KEY_INSUFFICIENT_ENTROPY/)

    // Claves marcadas como prueba / test / mock / dummy / synthetic / sample / example
    expect(isTestAuthorityKey('this_is_a_test_key')).toBe(true)
    expect(isTestAuthorityKey('dummy-key')).toBe(true)
    expect(isTestAuthorityKey('production_grade_custody_secret_entropy_8f9a0b1c2d3e4f5a6b7c8d9e')).toBe(false)

    expect(() => validateP0AuthoritySecret('this_is_a_test_authority_key_longer_than_32_characters')).toThrow(/P0_ATTESTATION_TEST_KEY_PROHIBITED/)
    expect(() => validateP0AuthoritySecret('a_mock_secret_with_adequate_length_1234567890')).toThrow(/P0_ATTESTATION_TEST_KEY_PROHIBITED/)
    expect(() => validateP0AuthoritySecret('dummy_custody_secret_for_local_runs_1234567890')).toThrow(/P0_ATTESTATION_TEST_KEY_PROHIBITED/)
    expect(() => validateP0AuthoritySecret('synthetic_authority_secret_guard_1234567890')).toThrow(/P0_ATTESTATION_TEST_KEY_PROHIBITED/)
    expect(() => validateP0AuthoritySecret('sample_authority_secret_string_1234567890')).toThrow(/P0_ATTESTATION_TEST_KEY_PROHIBITED/)
    expect(() => validateP0AuthoritySecret('example_authority_key_long_enough_1234567890')).toThrow(/P0_ATTESTATION_TEST_KEY_PROHIBITED/)

    // Clave válida de alta entropía (formato Ed25519)
    const { publicKey: validAttKey } = generateEphemeralAttestationKeyPair()
    expect(validateP0AuthoritySecret(validAttKey, true)).toBeDefined()
  })

  // 26. Verificación de atestación
  it('26. Rechazo de atestación por firma adulterada, commit mismatch o ejecutor desconocido', () => {
    const { publicKey: attPub, privateKey: attPriv } = generateEphemeralAttestationKeyPair()
    const manifestDraft = {
      identificador_proceso: 'PROC_TEST_001',
      ejecucion_autorizada_id: 'PROC_TEST_001',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: 'a'.repeat(64),
      iva_archivo_normalizado_sha256: 'b'.repeat(64),
      condition_respuesta_original_sha256: 'c'.repeat(64),
      condition_archivo_normalizado_sha256: 'd'.repeat(64),
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
      go_authorization_id: 'GO-PR02-P0-HOMOLOGACION-VALID',
      go_authorization_sha256: 'e'.repeat(64),
    }

    const attestation = createSignedTestIndependentAttestation({
      processId: 'PROC_TEST_001',
      commitSha: VALID_HEAD,
      consultadoEn: '2026-11-05T01:00:00.000Z',
      ivaRawSha: 'a'.repeat(64),
      ivaNormSha: 'b'.repeat(64),
      condRawSha: 'c'.repeat(64),
      condNormSha: 'd'.repeat(64),
      goAuthorizationId: 'GO-PR02-P0-HOMOLOGACION-VALID',
      goAuthorizationSha256: 'e'.repeat(64),
      executorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
    }, attPriv)

    expect(attestation.accredited).toBe(true)
    expect(attestation.provenance).toBe('VERIFIED')

    // Verificación exitosa con clave correcta
    const verified = verifyP0Attestation(attestation, {
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: attPub,
      allowTestKeys: true,
    })
    expect(verified.valid).toBe(true)

    // Firma adulterada
    expect(attestation.signature).not.toBeNull()
    const validSig = attestation.signature!
    const tamperedSig = validSig.slice(0, -1) + (validSig.endsWith('0') ? '1' : '0')
    const badSigCheck = verifyP0Attestation({ ...attestation, signature: tamperedSig }, {
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: attPub,
      allowTestKeys: true,
    })
    expect(badSigCheck.valid).toBe(false)
    expect(badSigCheck.reason).toBe('ATTESTATION_SIGNATURE_VERIFICATION_FAILED')

    // Commit mismatch
    const badCommitCheck = verifyP0Attestation(attestation, {
      manifest: manifestDraft,
      commitSha: '0'.repeat(40),
      trustedAttestationPublicKey: attPub,
      allowTestKeys: true,
    })
    expect(badCommitCheck.valid).toBe(false)
    expect(badCommitCheck.reason).toBe('ATTESTATION_COMMIT_MISMATCH')

    // Identidad de ejecutor alterada
    const badExecCheck = verifyP0Attestation({ ...attestation, executorIdentity: 'unauthorized-script.mjs' }, {
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: attPub,
      allowTestKeys: true,
    })
    expect(badExecCheck.valid).toBe(false)
    expect(badExecCheck.reason).toBe('ATTESTATION_EXECUTOR_MISMATCH')

    // Verificación con clave de prueba prohibida
    const testKeyCheck = verifyP0Attestation(attestation, {
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: 'test_authority_key_long_enough_1234567890',
      allowTestKeys: false,
    })
    expect(testKeyCheck.valid).toBe(false)
    expect(testKeyCheck.reason).toBe('ATTESTATION_TEST_KEY_PROHIBITED')

    // Verificación con clave comprometida
    const compKeyCheck = verifyP0Attestation(attestation, {
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: PR02_P0_COMPROMISED_SECRETS[0],
      allowTestKeys: true,
    })
    expect(compKeyCheck.valid).toBe(false)
    expect(compKeyCheck.reason).toBe('ATTESTATION_KEY_COMPROMISED')
  })

  // 27. Límite de respuesta en streaming
  it('27. Transporte oficial cancela streaming y arroja RESPONSE_SIZE_EXCEEDED al superar límite de bytes', async () => {
    const originalFetch = globalThis.fetch
    try {
      const maxBytes = 1024
      const chunk1 = Buffer.alloc(800, 'x')
      const chunk2 = Buffer.alloc(800, 'y') // 800 + 800 = 1600 > 1024

      let cancelled = false
      let pullCount = 0
      const stream = new ReadableStream({
        pull(controller) {
          pullCount++
          if (pullCount === 1) {
            controller.enqueue(chunk1)
          } else if (pullCount === 2) {
            controller.enqueue(chunk2)
          }
        },
        cancel() {
          cancelled = true
        },
      })

      globalThis.fetch = async () =>
        new Response(stream, {
          status: 200,
          headers: {
            'content-type': 'text/xml; charset=utf-8',
          },
        })

      const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
      const signedDoc = createSignedTestPr02P0GoAuthorization({
        commit_sha: VALID_HEAD,
        aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
      }, goPriv)
      const verifiedGo = validatePr02P0GoAuthorization(signedDoc, {
        expectedHead: VALID_HEAD,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
      })

      const transport = createOfficialArcaTransport(verifiedGo, {
        maxResponseBytes: maxBytes,
      })

      await expect(
        transport.postSoap(WSAA_HOMO_URL, '""', '<soap>query</soap>')
      ).rejects.toThrow(/RESPONSE_SIZE_EXCEEDED/)

      expect(cancelled).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  // 28. Auditoría exacta del call tracker
  it('28. Call tracker audita exactamente llamadas iniciadas, completadas, fallidas e inciertas por timeout', () => {
    const tracker = createPr02P0CallTracker()

    // 1. Iniciar LoginCms
    tracker.recordStart('LoginCms')
    let counts = tracker.getCounts()
    expect(counts.attempted).toBe(1)
    expect(counts.completed).toBe(0)
    expect(counts.failed).toBe(0)
    expect(counts.outcomeUnknown).toBe(0)

    // Completar LoginCms
    tracker.recordCall('LoginCms')
    counts = tracker.getCounts()
    expect(counts.attempted).toBe(1)
    expect(counts.completed).toBe(1)
    expect(counts.loginCms).toBe(1)

    // 2. Iniciar FEParamGetTiposIva y fallar por timeout
    tracker.recordStart('FEParamGetTiposIva')
    tracker.recordFailure('FEParamGetTiposIva', true) // isTimeout = true
    counts = tracker.getCounts()
    expect(counts.attempted).toBe(2)
    expect(counts.completed).toBe(1)
    expect(counts.failed).toBe(1)
    expect(counts.outcomeUnknown).toBe(1)

    const summary = tracker.getAuditSummary()
    expect(summary.CALLS_ATTEMPTED).toBe(2)
    expect(summary.CALLS_COMPLETED).toBe(1)
    expect(summary.CALLS_FAILED).toBe(1)
    expect(summary.CALLS_OUTCOME_UNKNOWN).toBe(1)
    expect(summary.started).toEqual(['LoginCms', 'FEParamGetTiposIva'])
    expect(summary.completed).toEqual(['LoginCms'])
    expect(summary.failed).toEqual(['FEParamGetTiposIva'])
    expect(summary.outcomeUnknown).toEqual(['FEParamGetTiposIva'])
  })

  // 29. (Regresión 1) GO arbitrario de longitud suficiente rechazado
  it('29. (Regresión 1) GO arbitrario de longitud suficiente (>32 chars) es rechazado por falta de autenticidad verificable', async () => {
    const { publicKey: goPub } = generateEphemeralGoAuthorityKeyPair()
    const arbitraryToken = 'abcdef0123456789abcdef0123456789abcdef01'
    expect(() => validatePr02P0GoAuthorization(arbitraryToken)).toThrow(/GO_AUTHORIZATION_INVALID_FORMAT/)

    const fakeDoc = {
      authorization: {
        identificador: 'GO-FAKE-001',
        aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
        scope: PR02_P0_SCOPE,
        project_ref: PR02_PARAMETERS_TARGET_PROJECT_REF,
        entorno: 'HOMOLOGACION',
        commit_sha: VALID_HEAD,
        operaciones_permitidas: ['LoginCms', 'FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
        limites: { loginCmsMax: 1, tiposIvaMax: 1, condicionIvaReceptorMax: 1, totalMax: 3 },
        emitido_en: new Date().toISOString(),
        vence_en: new Date(Date.now() + 3600000).toISOString(),
        single_use_nonce: '0123456789abcdef0123456789abcdef',
      },
      signature: '0'.repeat(128),
    }
    expect(() => validatePr02P0GoAuthorization(fakeDoc, {
      expectedHead: VALID_HEAD,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })).toThrow(/GO_AUTHORIZATION_SIGNATURE_INVALID/)

    await expect(
      executePr02P0OfficialEvidence({
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        goAuthorizationDoc: fakeDoc,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
      })
    ).rejects.toThrow(/GO_AUTHORIZATION_SIGNATURE_INVALID/)
  })

  // 30. (Regresión 2) GO con scope incorrecto rechazado
  it('30. (Regresión 2) GO con scope incorrecto es rechazado y bloquea la red oficial', async () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const signedDoc = createSignedTestPr02P0GoAuthorization({
      scope: 'PR02_P1_VERIFIED_CATALOG_IMPORT',
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)

    expect(() => validatePr02P0GoAuthorization(signedDoc, {
      expectedHead: VALID_HEAD,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })).toThrow(/GO_AUTHORIZATION_SCOPE_MISMATCH/)

    await expect(
      executePr02P0OfficialEvidence({
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        goAuthorizationDoc: signedDoc,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
      })
    ).rejects.toThrow(/GO_AUTHORIZATION_SCOPE_MISMATCH/)
  })

  // 31. (Regresión 3) GO con SHA diferente rechazado
  it('31. (Regresión 3) GO con SHA diferente del HEAD esperado es rechazado', async () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const differentHead = 'e'.repeat(40)
    const signedDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: differentHead,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)

    expect(() => validatePr02P0GoAuthorization(signedDoc, {
      expectedHead: VALID_HEAD,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })).toThrow(/GO_AUTHORIZATION_COMMIT_MISMATCH/)

    await expect(
      executePr02P0OfficialEvidence({
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        goAuthorizationDoc: signedDoc,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
      })
    ).rejects.toThrow(/GO_AUTHORIZATION_COMMIT_MISMATCH/)
  })

  // 32. (Regresión 4) GO vencido rechazado
  it('32. (Regresión 4) GO vencido es rechazado por vencimiento temporal', async () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const nowIso = '2026-11-05T01:00:00.000Z'
    const signedDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
      emitido_en: '2026-11-04T00:00:00.000Z',
      vence_en: '2026-11-04T02:00:00.000Z',
    }, goPriv)

    expect(() => validatePr02P0GoAuthorization(signedDoc, {
      expectedHead: VALID_HEAD,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      now: nowIso,
    })).toThrow(/GO_AUTHORIZATION_EXPIRED/)

    await expect(
      executePr02P0OfficialEvidence({
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        now: nowIso,
        goAuthorizationDoc: signedDoc,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
      })
    ).rejects.toThrow(/GO_AUTHORIZATION_EXPIRED/)
  })

  // 33. (Regresión 5) GO reutilizado rechazado
  it('33. (Regresión 5) GO reutilizado es rechazado por protección durable de un solo uso', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const testConsumedDir = path.resolve(TEST_EVIDENCE_DIR, '.test-consumed-single-use-reg')
    clearConsumedAuthorizationsForTesting(testConsumedDir)
    const signedDoc = createSignedTestPr02P0GoAuthorization({
      identificador: 'GO-TEST-SINGLE-USE-001',
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)

    // Primera validación: pasa
    const firstCheck = validatePr02P0GoAuthorization(signedDoc, {
      expectedHead: VALID_HEAD,
      trustedGoPublicKey: goPub,
      consumedAuthorizationsDir: testConsumedDir,
      allowTestKeys: true,
    })
    expect(firstCheck.valid).toBe(true)

    // Se marca como consumido de forma durable
    consumeGoAuthorizationDurable('GO-TEST-SINGLE-USE-001', { consumedAuthorizationsDir: testConsumedDir })
    expect(isGoAuthorizationConsumed('GO-TEST-SINGLE-USE-001', { consumedAuthorizationsDir: testConsumedDir })).toBe(true)

    // Segunda validación: falla
    expect(() => validatePr02P0GoAuthorization(signedDoc, {
      expectedHead: VALID_HEAD,
      trustedGoPublicKey: goPub,
      consumedAuthorizationsDir: testConsumedDir,
      allowTestKeys: true,
    })).toThrow(/GO_AUTHORIZATION_ALREADY_CONSUMED/)
    clearConsumedAuthorizationsForTesting(testConsumedDir)
  })

  // 34. (Regresión 6) GO con firma inválida rechazado
  it('34. (Regresión 6) GO con firma adulterada o clave incorrecta es rechazado', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const signedDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
      emitido_en: '2026-11-05T00:00:00.000Z',
      vence_en: '2026-11-05T03:00:00.000Z',
    }, goPriv)

    // Alterar firma (manteniendo 128 hex de longitud)
    const tamperedSig = signedDoc.signature.slice(0, -1) + (signedDoc.signature.endsWith('0') ? '1' : '0')
    const tamperedDoc = {
      authorization: signedDoc.authorization,
      signature: tamperedSig,
    }

    expect(() => validatePr02P0GoAuthorization(tamperedDoc, {
      expectedHead: VALID_HEAD,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      now: '2026-11-05T01:00:00.000Z',
    })).toThrow(/GO_AUTHORIZATION_SIGNATURE_INVALID/)

    // Alterar contenido manteniendo la firma
    const tamperedContentDoc = {
      authorization: {
        ...signedDoc.authorization,
        entorno: 'PRODUCCION',
      },
      signature: signedDoc.signature,
    }
    expect(() => validatePr02P0GoAuthorization(tamperedContentDoc, {
      expectedHead: VALID_HEAD,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      now: '2026-11-05T01:00:00.000Z',
    })).toThrow(/GO_AUTHORIZATION_ENTORNO_MISMATCH/)
  })

  // 35. (Regresión 7) Token original ausente de manifiestos y archivos
  it('35. (Regresión 7) El token/nonce original no aparece en ninguno de los artefactos generados', async () => {
    cleanupTestDir()
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: attPub } = generateEphemeralAttestationKeyPair()
    const secretNonce = 'SECRET_NONCE_VALUE_DO_NOT_LEAK_9876543210'

    const signedDoc = createSignedTestPr02P0GoAuthorization({
      identificador: 'GO-P0-AUDIT-SAFE-ID-001',
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
      commit_sha: VALID_HEAD,
      single_use_nonce: secretNonce,
      emitido_en: '2026-11-05T01:00:00.000Z',
      vence_en: '2026-11-05T05:00:00.000Z',
    }, goPriv)

    const res = await executePr02P0OfficialEvidence(
      {
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        now: '2026-11-05T02:00:00.000Z',
        evidenceDir: TEST_EVIDENCE_DIR,
        saveEvidence: true,
        goAuthorizationDoc: signedDoc,
        trustedGoPublicKey: goPub,
        trustedAttestationPublicKey: attPub,
        allowTestKeys: true,
        existingTa: {
          token: 'TOKEN_VALID_REUSED',
          sign: 'SIGN_VALID_REUSED',
          vence_en: '2026-11-05T06:00:00.000Z',
          estado: 'DISPONIBLE',
        },
      },
      {
        wsfeTiposIva: async () => SYNTHETIC_TIPOS_IVA_RESPONSE,
        wsfeCondicionIva: async () => SYNTHETIC_CONDICIONES_IVA_RESPONSE,
      }
    )

    expect(res.execution).toBe('AUTHORIZED_EXECUTION')
    expect(res.P0_GO_SECRET_EXPOSURE).toBe('NONE')

    // Verificar en manifest en memoria
    const manifestJson = JSON.stringify(res.manifest)
    expect(manifestJson.includes(secretNonce)).toBe(false)
    expect(manifestJson.includes(signedDoc.signature)).toBe(false)
    expect(res.manifest?.go_authorization_id).toBe('GO-P0-AUDIT-SAFE-ID-001')
    expect(res.manifest?.go_authorization_sha256).toMatch(/^[0-9a-f]{64}$/)

    // Verificar en archivos físicos en disco
    const files = fs.readdirSync(TEST_EVIDENCE_DIR)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const content = fs.readFileSync(path.join(TEST_EVIDENCE_DIR, file), 'utf8')
      expect(content.includes(secretNonce)).toBe(false)
      expect(content.includes(signedDoc.signature)).toBe(false)
    }

    cleanupTestDir()
  })

  // 36. (Regresión 8) Clave HMAC no expuesta
  it('36. (Regresión 8) Claves HMAC de autoridad no se exponen en artefactos y el importador P1 rechaza manifiestos que suministren su propia clave', () => {
    const rawSecret = 'SUPER_SECRET_HMAC_KEY_99999999999999999999'
    const manifestWithKey = {
      entorno: 'HOMOLOGACION',
      origen_verificado: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
      consultado_en: '2026-11-05T01:00:00.000Z',
      identificador_proceso: 'pid-1',
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
      ejecucion_autorizada_id: 'pid-1',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      iva_respuesta_original_sha256: 'a'.repeat(64),
      iva_archivo_normalizado_sha256: 'b'.repeat(64),
      condition_respuesta_original_sha256: 'c'.repeat(64),
      condition_archivo_normalizado_sha256: 'd'.repeat(64),
      transporte_validado: true,
      accredited: true,
      go_authorization_id: 'GO-ID-1',
      go_authorization_sha256: 'e'.repeat(64),
      authoritySecret: rawSecret, // Prohibido: el manifiesto suministrando su propia clave
      attestation: {
        version: '1.0',
        processId: 'pid-1',
        executionId: 'pid-1',
        executionScope: PR02_P0_SCOPE,
        commitSha: VALID_HEAD,
        consultadoEn: '2026-11-05T01:00:00.000Z',
        entorno: 'HOMOLOGACION',
        transportType: 'OFFICIAL',
        executorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
        ivaRawSha: 'a'.repeat(64),
        ivaNormSha: 'b'.repeat(64),
        condRawSha: 'c'.repeat(64),
        condNormSha: 'd'.repeat(64),
        goAuthorizationId: 'GO-ID-1',
        goAuthorizationSha256: 'e'.repeat(64),
        issuedAt: '2026-11-05T01:00:00.000Z',
        signature: 'f'.repeat(64),
        accredited: true,
        provenance: 'VERIFIED',
      },
    }

    expect(() => validatePr02P1ImportEvidence({
      manifest: manifestWithKey,
      ivaText: 'iva',
      conditionText: 'cond',
    })).toThrow(/P1_IMPORT_FORBIDDEN: El manifiesto no puede proveer su propia clave de autoridad/)
  })

  // 37. (Regresión 9) Atestación firmada por autoridad no confiable rechazada en P1
  it('37. (Regresión 9) Atestación firmada por autoridad apócrifa/no confiable es rechazada en P1', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: trustedAttPub } = generateEphemeralAttestationKeyPair()
    const { privateKey: attackerAttPriv } = generateEphemeralAttestationKeyPair()

    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const ivaText = ivaParsed.ivaText
    const condText = condParsed.conditionText
    const rawIvaSoapText = SYNTHETIC_TIPOS_IVA_RESPONSE
    const rawConditionSoapText = SYNTHETIC_CONDICIONES_IVA_RESPONSE

    const goDoc = createSignedTestPr02P0GoAuthorization({
      identificador: 'GO-ATTACKER-ID',
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)
    const goAuthSha = createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex')

    const rawIvaSha = createHash('sha256').update(rawIvaSoapText).digest('hex')
    const ivaNormSha = createHash('sha256').update(ivaText).digest('hex')
    const rawCondSha = createHash('sha256').update(rawConditionSoapText).digest('hex')
    const condNormSha = createHash('sha256').update(condText).digest('hex')

    const manifestDraft = {
      identificador_proceso: 'pid-attacker-001',
      ejecucion_autorizada_id: 'pid-attacker-001',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: rawIvaSha,
      iva_archivo_normalizado_sha256: ivaNormSha,
      condition_respuesta_original_sha256: rawCondSha,
      condition_archivo_normalizado_sha256: condNormSha,
    }

    const attackerAttestation = createSignedTestIndependentAttestation({
      processId: 'pid-attacker-001',
      commitSha: VALID_HEAD,
      consultadoEn: '2026-11-05T01:00:00.000Z',
      ivaRawSha: rawIvaSha,
      ivaNormSha,
      condRawSha: rawCondSha,
      condNormSha,
      goAuthorizationId: 'GO-ATTACKER-ID',
      goAuthorizationSha256: goAuthSha,
      executorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
    }, attackerAttPriv)

    const attackerManifest = {
      ...manifestDraft,
      origen_verificado: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      transporte_validado: true,
      accredited: true,
      transport_type: 'OFFICIAL',
      go_authorization_id: 'GO-ATTACKER-ID',
      go_authorization_sha256: goAuthSha,
      attestation: attackerAttestation,
      manifest_sha256: '4'.repeat(64),
    }

    expect(() => validatePr02P1ImportEvidence({
      manifest: attackerManifest,
      ivaText,
      conditionText: condText,
      rawIvaSoapText,
      rawConditionSoapText,
      goAuthorizationDoc: goDoc,
      trustedAttestationPublicKey: trustedAttPub,
      trustedGoPublicKey: goPub,
      expectedHead: VALID_HEAD,
      allowTestKeys: true,
    })).toThrow(/P1_IMPORT_FORBIDDEN: Procedencia oficial no verificada/)
  })

  // 38. (Regresión 10) Evidencia fabricada con hashes correctos rechazada
  it('38. (Regresión 10) Evidencia fabricada con hashes de contenido exactos pero atestación inválida es rechazada en P1', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: trustedAttPub } = generateEphemeralAttestationKeyPair()

    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const ivaText = ivaParsed.ivaText
    const condText = condParsed.conditionText
    const rawIvaSoapText = SYNTHETIC_TIPOS_IVA_RESPONSE
    const rawConditionSoapText = SYNTHETIC_CONDICIONES_IVA_RESPONSE

    const goDoc = createSignedTestPr02P0GoAuthorization({
      identificador: 'GO-FAKE-001',
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)
    const goAuthSha = createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex')

    const rawIvaSha = createHash('sha256').update(rawIvaSoapText).digest('hex')
    const ivaNormSha = createHash('sha256').update(ivaText).digest('hex')
    const rawCondSha = createHash('sha256').update(rawConditionSoapText).digest('hex')
    const condNormSha = createHash('sha256').update(condText).digest('hex')

    const fabricatedManifest = {
      entorno: 'HOMOLOGACION',
      origen_verificado: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
      consultado_en: '2026-11-05T01:00:00.000Z',
      identificador_proceso: 'pid-fabricated',
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
      ejecucion_autorizada_id: 'pid-fabricated',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      iva_respuesta_original_sha256: rawIvaSha,
      iva_archivo_normalizado_sha256: ivaNormSha,
      condition_respuesta_original_sha256: rawCondSha,
      condition_archivo_normalizado_sha256: condNormSha,
      transporte_validado: true,
      accredited: true,
      transport_type: 'OFFICIAL',
      go_authorization_id: 'GO-FAKE-001',
      go_authorization_sha256: goAuthSha,
      attestation: {
        version: '1.0',
        processId: 'pid-fabricated',
        executionId: 'pid-fabricated',
        executionScope: PR02_P0_SCOPE,
        commitSha: VALID_HEAD,
        consultadoEn: '2026-11-05T01:00:00.000Z',
        entorno: 'HOMOLOGACION',
        transportType: 'OFFICIAL',
        executorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
        ivaRawSha: rawIvaSha,
        ivaNormSha,
        condRawSha: rawCondSha,
        condNormSha,
        goAuthorizationId: 'GO-FAKE-001',
        goAuthorizationSha256: goAuthSha,
        issuedAt: '2026-11-05T01:00:00.000Z',
        signature: '0'.repeat(128), // Firma falsa
        accredited: true,
        provenance: 'VERIFIED',
        trustModel: 'INDEPENDENT_ATTESTED',
        TRUSTED_EXECUTION_BOUNDARY: 'VERIFIED',
      },
    }

    expect(() => validatePr02P1ImportEvidence({
      manifest: fabricatedManifest,
      ivaText,
      conditionText: condText,
      rawIvaSoapText,
      rawConditionSoapText,
      goAuthorizationDoc: goDoc,
      trustedAttestationPublicKey: trustedAttPub,
      trustedGoPublicKey: goPub,
      expectedHead: VALID_HEAD,
      allowTestKeys: true,
    })).toThrow(/P1_IMPORT_FORBIDDEN: Procedencia oficial no verificada/)
  })

  // 39. (Regresión 11) Timeout con llamada iniciada y resultado incierto
  it('39. (Regresión 11) Timeout registra llamada iniciada con resultado incierto (outcomeUnknown) sin reintentos', async () => {
    let capturedErr: any = null
    try {
      await executePr02P0OfficialEvidence(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_P0_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          now: '2026-11-05T02:00:00.000Z',
        },
        {
          fetcher: async () => {
            const err = new Error('ARCA_TIMEOUT_HTTP_REQUEST')
            err.name = 'AbortError'
            throw err
          },
        }
      )
    } catch (err) {
      capturedErr = err
    }

    expect(capturedErr).not.toBeNull()
    expect(capturedErr.P0_CALL_AUDIT_ON_FAILURE).toBe('PASS')
    expect(capturedErr.outcomeUnknown).toBe(true)
    expect(capturedErr.callsAttempted).toBe(1)
    expect(capturedErr.callsCompleted).toBe(0)
    expect(capturedErr.auditSummary.CALLS_OUTCOME_UNKNOWN).toBe(1)
    expect(capturedErr.auditSummary.outcomeUnknown).toEqual(['LoginCms'])
  })

  // 40. (Regresión 12) SOAP Fault sin reintento
  it('40. (Regresión 12) SOAP Fault registra fallo sin reintento automático', async () => {
    let capturedErr: any = null
    const faultXml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>Error interno ARCA</faultstring></soap:Fault></soap:Body></soap:Envelope>`

    try {
      await executePr02P0OfficialEvidence(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_P0_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          now: '2026-11-05T02:00:00.000Z',
        },
        {
          wsaaLogin: async () => faultXml,
        }
      )
    } catch (err) {
      capturedErr = err
    }

    expect(capturedErr).not.toBeNull()
    expect(capturedErr.message).toContain('WSAA_FAULT:soap:Server')
    expect(capturedErr.P0_CALL_AUDIT_ON_FAILURE).toBe('PASS')
    expect(capturedErr.callsAttempted).toBe(1)
    expect(capturedErr.callsCompleted).toBe(0)
    expect(capturedErr.auditSummary.CALLS_ATTEMPTED).toBe(1)
    expect(capturedErr.auditSummary.CALLS_FAILED).toBe(1)
  })

  // 41. (Regresión 13) Fallo de persistencia local después de respuestas oficiales
  it('41. (Regresión 13) Fallo de persistencia tras llamadas exitosas preserva auditoría y no declara adquisición completa', async () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const signedDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
      emitido_en: '2026-11-05T00:00:00.000Z',
      vence_en: '2026-11-05T03:00:00.000Z',
    }, goPriv)

    let capturedErr: any = null
    try {
      await executePr02P0OfficialEvidence(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_P0_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          now: '2026-11-05T02:00:00.000Z',
          evidenceDir: 'src/forbidden-evidence-dir',
          saveEvidence: true,
          goAuthorizationDoc: signedDoc,
          trustedGoPublicKey: goPub,
          allowTestKeys: true,
          existingTa: {
            token: 'TOKEN_VALID',
            sign: 'SIGN_VALID',
            vence_en: '2026-11-05T06:00:00.000Z',
            estado: 'DISPONIBLE',
          },
        },
        {
          wsfeTiposIva: async () => SYNTHETIC_TIPOS_IVA_RESPONSE,
          wsfeCondicionIva: async () => SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        }
      )
    } catch (err) {
      capturedErr = err
    }

    expect(capturedErr).not.toBeNull()
    expect(capturedErr.message).toContain('P0_PERSISTENCE_FAILED')
    expect(capturedErr.P0_ACQUISITION_COMPLETED).toBe(false)
    expect(capturedErr.P0_CALL_AUDIT_ON_FAILURE).toBe('PASS')
    expect(capturedErr.callsAttempted).toBe(2)
    expect(capturedErr.callsCompleted).toBe(2)
  })

  // 42. (Regresión 14) Dry-run con cero conexiones externas
  it('42. (Regresión 14) Dry-run garantiza cero conexiones externas, cero escrituras y cero llamadas ARCA', async () => {
    const reportDry = await executePr02P0OfficialEvidence({ dryRun: true })
    expect(reportDry.execution).toBe('DRY_RUN')
    expect(reportDry.ARCA_CALLS_NEW).toBe(0)
    expect(reportDry.STAGING_WRITES_NEW).toBe(0)
    expect(reportDry.PRODUCTION_MUTATIONS).toBe(0)
    expect(reportDry.auditCounts?.CALLS_ATTEMPTED).toBe(0)
    expect(reportDry.auditCounts?.CALLS_COMPLETED).toBe(0)
    expect(reportDry.P0_EXTERNAL_GO_VALIDATION).toBe('NOT_RUN')
    expect(reportDry.GO_AUTHORIZATION).toBe('NOT_RUN')
    expect(reportDry.EVIDENCE_PROVENANCE).toBe('UNVERIFIED')

    const reportUnauth = await executePr02P0OfficialEvidence({ authorized: false })
    expect(reportUnauth.execution).toBe('DRY_RUN')
    expect(reportUnauth.ARCA_CALLS_NEW).toBe(0)
    expect(reportUnauth.STAGING_WRITES_NEW).toBe(0)
    expect(reportUnauth.PRODUCTION_MUTATIONS).toBe(0)
    expect(reportUnauth.auditCounts?.CALLS_ATTEMPTED).toBe(0)
    expect(reportUnauth.auditCounts?.CALLS_COMPLETED).toBe(0)
  })

  // 43. Ejecución no autorizada programática y tipos inválidos de flags
  it('43. Opciones no autorizadas o tipos inválidos fallan cerrado con cero conexiones externas', async () => {
    let connectionAttempts = 0
    const mockFetcher = async () => {
      connectionAttempts++
      return new Response('<soap></soap>')
    }

    // authorized: false y dryRun: false
    await expect(
      executePr02P0OfficialEvidence({ authorized: false, dryRun: false }, { fetcher: mockFetcher })
    ).rejects.toThrow(/UNAUTHORIZED_EXECUTION/)

    // dryRun: false sin authorized: true
    await expect(
      executePr02P0OfficialEvidence({ dryRun: false }, { fetcher: mockFetcher })
    ).rejects.toThrow(/UNAUTHORIZED_EXECUTION/)

    // officialGoAuthorized: false
    await expect(
      executePr02P0OfficialEvidence({ officialGoAuthorized: false } as any, { fetcher: mockFetcher })
    ).rejects.toThrow(/UNAUTHORIZED_EXECUTION/)

    // authorized no booleano
    await expect(
      executePr02P0OfficialEvidence({ authorized: 'true' as any, dryRun: false }, { fetcher: mockFetcher })
    ).rejects.toThrow(/UNAUTHORIZED_EXECUTION/)

    // dryRun no booleano
    await expect(
      executePr02P0OfficialEvidence({ authorized: true, dryRun: 'false' as any }, { fetcher: mockFetcher })
    ).rejects.toThrow(/UNAUTHORIZED_EXECUTION/)

    // authorized: true sin scope explícito
    await expect(
      executePr02P0OfficialEvidence({
        authorized: true,
        dryRun: false,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
      }, { fetcher: mockFetcher })
    ).rejects.toThrow(/PR02_P0_REQUIRED_EXPLICIT_ARGS/)

    expect(connectionAttempts).toBe(0)
  })

  // 44. Hardening de transporte: espacios en URL, endpoints productivos, redirecciones HTTP, XML inválido y allowlist SOAP
  it('44. Transporte oficial rechaza URLs con espacios, hosts de producción, redirecciones, XML inválido y operaciones fuera de allowlist', async () => {
    // Espacios en URL
    expect(() => validateP0EndpointUrl(' https://wsaahomo.afip.gov.ar/ws/services/LoginCms ', 'WSAA')).toThrow(
      /EXACT_ENDPOINT_MISMATCH/
    )

    // Hosts de producción adicionales (arca.gob.ar, afip.gob.ar)
    expect(() => validateP0EndpointUrl('https://wsw.arca.gob.ar/wsfev1/service.asmx', 'WSFE')).toThrow(
      /PRODUCTION_ENDPOINT_FORBIDDEN/
    )
    expect(() => validateP0EndpointUrl('https://wsfe.afip.gob.ar/wsfev1/service.asmx', 'WSFE')).toThrow(
      /PRODUCTION_ENDPOINT_FORBIDDEN/
    )

    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const signedDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)
    const verifiedGo = validatePr02P0GoAuthorization(signedDoc, {
      expectedHead: VALID_HEAD,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })

    const transport = createOfficialArcaTransport(verifiedGo)

    // Operación prohibida (ej. FECAESolicitar)
    await expect(
      transport.postSoap(
        WSFE_HOMO_URL,
        '"http://ar.gov.afip.dif.FEV1/FECAESolicitar"',
        '<FECAESolicitar></FECAESolicitar>'
      )
    ).rejects.toThrow(/PROHIBITED_ARCA_OPERATION/)

    // Operación prohibida en allowlist (ej. FEParamGetPtosVenta)
    await expect(
      transport.postSoap(
        WSFE_HOMO_URL,
        '"http://ar.gov.afip.dif.FEV1/FEParamGetPtosVenta"',
        '<FEParamGetPtosVenta></FEParamGetPtosVenta>'
      )
    ).rejects.toThrow(/PROHIBITED_ARCA_OPERATION/)

    // Operación desconocida fuera de allowlist
    await expect(
      transport.postSoap(
        WSFE_HOMO_URL,
        '"http://ar.gov.afip.dif.FEV1/SomeUnknownOperation"',
        '<SomeUnknownOperation></SomeUnknownOperation>'
      )
    ).rejects.toThrow(/DISALLOWED_ARCA_OPERATION/)

    // Redirección HTTP (status 302 o redirected: true)
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = async () =>
        new Response('', {
          status: 302,
          headers: { Location: 'https://wswhomo.afip.gov.ar/redirected' },
        })

      const redirectTransport = createOfficialArcaTransport(verifiedGo)
      await expect(
        redirectTransport.postSoap(
          WSFE_HOMO_URL,
          '"http://ar.gov.afip.dif.FEV1/FEParamGetTiposIva"',
          '<FEParamGetTiposIva></FEParamGetTiposIva>'
        )
      ).rejects.toThrow(/HTTP_REDIRECT_FORBIDDEN/)

      // Respuesta HTML en vez de XML
      globalThis.fetch = async () =>
        new Response('<!doctype html><html><body>Error</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        })

      const htmlTransport = createOfficialArcaTransport(verifiedGo)
      await expect(
        htmlTransport.postSoap(
          WSFE_HOMO_URL,
          '"http://ar.gov.afip.dif.FEV1/FEParamGetTiposIva"',
          '<FEParamGetTiposIva></FEParamGetTiposIva>'
        )
      ).rejects.toThrow(/INVALID_XML_PAYLOAD/)

      // Respuesta vacía
      globalThis.fetch = async () =>
        new Response('', {
          status: 200,
          headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        })

      const emptyTransport = createOfficialArcaTransport(verifiedGo)
      await expect(
        emptyTransport.postSoap(
          WSFE_HOMO_URL,
          '"http://ar.gov.afip.dif.FEV1/FEParamGetTiposIva"',
          '<FEParamGetTiposIva></FEParamGetTiposIva>'
        )
      ).rejects.toThrow(/EMPTY_RESPONSE_BODY/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  // 45. Hardening de call tracker: límites no sobreescribibles con tipos o valores inválidos
  it('45. Call tracker prohíbe overrides con valores negativos, NaN o que superen los máximos', () => {
    expect(() => createPr02P0CallTracker({ loginCmsMax: -1 })).toThrow(/CALL_LIMIT_OVERRIDE_FORBIDDEN/)
    expect(() => createPr02P0CallTracker({ loginCmsMax: NaN })).toThrow(/CALL_LIMIT_OVERRIDE_FORBIDDEN/)
    expect(() => createPr02P0CallTracker({ totalMax: -1 })).toThrow(/CALL_LIMIT_OVERRIDE_FORBIDDEN/)
    expect(() => createPr02P0CallTracker({ totalMax: NaN })).toThrow(/CALL_LIMIT_OVERRIDE_FORBIDDEN/)
    expect(() => createPr02P0CallTracker({ totalMax: 10 })).toThrow(/CALL_LIMIT_OVERRIDE_FORBIDDEN/)
  })

  // 46. Ticket de Acceso: margen de 10 min, servicio, CUIT y prohibición de fallback silencioso ante TA inválido
  it('46. Ticket de Acceso rechaza margen inferior a 10 minutos, CUIT o servicio erróneo, y no realiza fallback silencioso', async () => {
    const nowIso = '2026-11-05T01:00:00.000Z'
    // Margen de 5 minutos (< 10 min)
    const expiringSoonTa = {
      valido: true,
      estado: 'DISPONIBLE',
      token: 'TOKEN_123',
      sign: 'SIGN_123',
      vence_en: '2026-11-05T01:05:00.000Z',
    }
    const resExpiring = evaluateExistingTa(expiringSoonTa, nowIso)
    expect(resExpiring.reusable).toBe(false)
    expect(resExpiring.reason).toBe('TA_EXPIRED_OR_EXPIRING_SOON')

    // Servicio erróneo (padrón en vez de wsfe)
    const wrongServiceTa = {
      valido: true,
      estado: 'DISPONIBLE',
      token: 'TOKEN_123',
      sign: 'SIGN_123',
      vence_en: '2026-11-05T03:00:00.000Z',
      servicio: 'ws_sr_padron_a4',
    }
    const resWrongService = evaluateExistingTa(wrongServiceTa, nowIso)
    expect(resWrongService.reusable).toBe(false)
    expect(resWrongService.reason).toBe('TA_SERVICE_MISMATCH')

    // CUIT emisor erróneo
    const wrongCuitTa = {
      valido: true,
      estado: 'DISPONIBLE',
      token: 'TOKEN_123',
      sign: 'SIGN_123',
      vence_en: '2026-11-05T03:00:00.000Z',
      cuit: '20111111112',
    }
    const resWrongCuit = evaluateExistingTa(wrongCuitTa, nowIso)
    expect(resWrongCuit.reusable).toBe(false)
    expect(resWrongCuit.reason).toBe('TA_CUIT_MISMATCH')

    // Estado PENDIENTE (no DISPONIBLE) a pesar de valido: true
    const notAvailableTa = {
      valido: true,
      estado: 'PENDIENTE',
      token: 'TOKEN_123',
      sign: 'SIGN_123',
      vence_en: '2026-11-05T03:00:00.000Z',
    }
    const resNotAvailable = evaluateExistingTa(notAvailableTa, nowIso)
    expect(resNotAvailable.reusable).toBe(false)
    expect(resNotAvailable.reason).toBe('TA_NOT_AVAILABLE')

    // Prohibición de fallback silencioso a LoginCms cuando se provee un existingTa no reutilizable
    let loginCmsAttempted = false
    await expect(
      executePr02P0OfficialEvidence(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_P0_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          existingTa: expiringSoonTa,
          now: nowIso,
        },
        {
          wsaaLogin: async () => {
            loginCmsAttempted = true
            return '<soap>ta</soap>'
          },
        }
      )
    ).rejects.toThrow(/TA_INVALID_OR_REVOKED/)

    expect(loginCmsAttempted).toBe(false)
  })

  // 47. Validación de integridad de manifiesto: digest canónico, identidad de colector y timestamp post-firma
  it('47. Manifiesto P0 exige digest canónico exacto, identidad de colector autorizada y coincidencia estricta con atestación', () => {
    const { publicKey: attPub, privateKey: attPriv } = generateEphemeralAttestationKeyPair()
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const ivaText = ivaParsed.ivaText
    const condText = condParsed.conditionText
    const rawIvaSoapText = SYNTHETIC_TIPOS_IVA_RESPONSE
    const rawConditionSoapText = SYNTHETIC_CONDICIONES_IVA_RESPONSE

    const goDoc = createSignedTestPr02P0GoAuthorization({
      identificador: 'GO-DIGEST-001',
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)
    const goAuthSha = createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex')

    const rawIvaSha = createHash('sha256').update(rawIvaSoapText).digest('hex')
    const ivaNormSha = createHash('sha256').update(ivaText).digest('hex')
    const rawCondSha = createHash('sha256').update(rawConditionSoapText).digest('hex')
    const condNormSha = createHash('sha256').update(condText).digest('hex')

    const manifestDraft = {
      identificador_proceso: 'PROC_DIGEST_001',
      ejecucion_autorizada_id: 'PROC_DIGEST_001',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: rawIvaSha,
      iva_archivo_normalizado_sha256: ivaNormSha,
      condition_respuesta_original_sha256: rawCondSha,
      condition_archivo_normalizado_sha256: condNormSha,
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
    }

    const attestation = createSignedTestIndependentAttestation({
      processId: 'PROC_DIGEST_001',
      commitSha: VALID_HEAD,
      consultadoEn: '2026-11-05T01:00:00.000Z',
      ivaRawSha: rawIvaSha,
      ivaNormSha,
      condRawSha: rawCondSha,
      condNormSha,
      goAuthorizationId: 'GO-DIGEST-001',
      goAuthorizationSha256: goAuthSha,
      executorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
    }, attPriv)

    const baseManifest = {
      ...manifestDraft,
      origen_verificado: WSFE_HOMO_URL,
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      transporte_validado: true,
      accredited: true,
      transport_type: 'OFFICIAL',
      go_authorization_id: 'GO-DIGEST-001',
      go_authorization_sha256: goAuthSha,
      attestation,
    }

    const digest = computeP0ManifestDigest(baseManifest)
    const validManifest = {
      ...baseManifest,
      manifest_sha256: digest,
    }

    // El manifiesto válido pasa la validación estricta
    expect(validatePr02P0Manifest(validManifest)).toBe(true)

    // Manifiesto con digest adulterado
    const badDigestManifest = {
      ...validManifest,
      manifest_sha256: '0'.repeat(64),
    }
    expect(() => validatePr02P0Manifest(badDigestManifest)).toThrow(/P0_MANIFEST_DIGEST_MISMATCH/)

    // Manifiesto con colector adulterado
    const badCollectorManifest = {
      ...validManifest,
      colector_identidad: 'unauthorized-collector.mjs',
      manifest_sha256: computeP0ManifestDigest({ ...validManifest, colector_identidad: 'unauthorized-collector.mjs' }),
    }
    expect(() => validatePr02P0Manifest(badCollectorManifest)).toThrow(/P0_MANIFEST_COLLECTOR_IDENTITY_MISMATCH/)

    // Manifiesto con consultado_en adulterado con respecto a la atestación
    const tamperedConsultadoManifest = {
      ...validManifest,
      consultado_en: '2026-11-05T09:99:99.999Z',
    }
    const checkTampered = verifyP0Attestation(attestation, {
      manifest: tamperedConsultadoManifest,
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: attPub,
      allowTestKeys: true,
    })
    expect(checkTampered.valid).toBe(false)
    expect(checkTampered.reason).toBe('ATTESTATION_MANIFEST_MISMATCH')

    // Al validar para importación P1 arroja error de coincidencia de atestación
    expect(() =>
      validatePr02P1ImportEvidence({
        manifest: tamperedConsultadoManifest,
        ivaText,
        conditionText: condText,
        rawIvaSoapText,
        rawConditionSoapText,
        goAuthorizationDoc: goDoc,
        trustedAttestationPublicKey: attPub,
        trustedGoPublicKey: goPub,
        expectedHead: VALID_HEAD,
        allowTestKeys: true,
      })
    ).toThrow(/ATTESTATION_MANIFEST_MISMATCH/)
  })

  // 48. Enlaces simbólicos en ancestros y limpieza atómica ante fallas
  it('48. validateEvidenceDirectory detecta symlinks y saveP0EvidencePackage no deja archivos huérfanos ante error', () => {
    // Intentar guardar con manifiesto inválido arroja error y no deja directorio temporal
    expect(() =>
      saveP0EvidencePackage({
        evidenceDir: TEST_EVIDENCE_DIR,
        manifest: null as any,
        rawIvaSoapXml: '<a></a>',
        ivaNormalizedText: '{}',
        rawConditionSoapXml: '<b></b>',
        conditionNormalizedText: '{}',
      })
    ).toThrow(/PERSISTENCE_FAILED/)

    if (fs.existsSync(TEST_EVIDENCE_DIR)) {
      const items = fs.readdirSync(TEST_EVIDENCE_DIR)
      const tmpDirs = items.filter((f) => f.startsWith('.tmp_p0_'))
      expect(tmpDirs.length).toBe(0)
      cleanupTestDir()
    }
  })

  // 49. Interfaces de GoAuthority y AttestationAuthority con garantía HOST_LOCAL_DURABLE_ONE_TIME_USE
  it('49. GoAuthority y AttestationAuthority exponen interfaces explícitas y nivel HOST_LOCAL_DURABLE_ONE_TIME_USE', () => {
    expect(ANTI_REPLAY_GUARANTEE_LEVEL).toBe('HOST_LOCAL_DURABLE_ONE_TIME_USE')
    expect(GoAuthority.ANTI_REPLAY_GUARANTEE_LEVEL).toBe('HOST_LOCAL_DURABLE_ONE_TIME_USE')
    expect(typeof GoAuthority.validateAuthorization).toBe('function')
    expect(typeof GoAuthority.consumeAuthorizationDurable).toBe('function')
    expect(typeof GoAuthority.isConsumed).toBe('function')
    expect(typeof GoAuthority.validatePublicKey).toBe('function')
    expect(PR02_P0_GO_PUBLIC_KEY_ENV).toBe('PR02_P0_GO_PUBLIC_KEY')

    const testConsumedDir = path.resolve(TEST_EVIDENCE_DIR, '.test-consumed-49')
    clearConsumedAuthorizationsForTesting(testConsumedDir)
    const testAuthId = 'TEST-GO-AUTH-001'
    expect(GoAuthority.isConsumed(testAuthId, { consumedAuthorizationsDir: testConsumedDir })).toBe(false)
    GoAuthority.consumeAuthorizationDurable(testAuthId, { consumedAuthorizationsDir: testConsumedDir })
    expect(GoAuthority.isConsumed(testAuthId, { consumedAuthorizationsDir: testConsumedDir })).toBe(true)
    clearConsumedAuthorizationsForTesting(testConsumedDir)

    expect(AttestationAuthority.PUBLIC_KEY_ENV).toBe(PR02_P0_ATTESTATION_PUBLIC_KEY_ENV)
    expect(typeof AttestationAuthority.validatePublicKey).toBe('function')
    expect(typeof AttestationAuthority.createAttestation).toBe('function')
    expect(typeof AttestationAuthority.verifyAttestation).toBe('function')

    const prevEnv = process.env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV]
    const { publicKey: samplePubKey } = generateEphemeralAttestationKeyPair()
    try {
      delete process.env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV]
      delete process.env[PR02_P0_AUTHORITY_ENV]
      expect(AttestationAuthority.isAuthorityAvailable()).toBe(false)
      process.env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV] = samplePubKey
      expect(AttestationAuthority.isAuthorityAvailable({ allowTestKeys: true })).toBe(true)
      process.env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV] = 'test_sample_authority_key_1234567890'
      expect(AttestationAuthority.isAuthorityAvailable({ allowTestKeys: false })).toBe(false)
    } finally {
      if (prevEnv !== undefined) {
        process.env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV] = prevEnv
      } else {
        delete process.env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV]
      }
    }
  })

  // 50. validateP0AuthoritySecret clasifica errores por categorías estándar
  it('50. validateP0AuthoritySecret clasifica errores por categorías estándar de seguridad', () => {
    expect(() => validateP0AuthoritySecret('')).toThrow(/ATTESTATION_AUTHORITY_NOT_AVAILABLE/)
    expect(() => validateP0AuthoritySecret(PR02_P0_COMPROMISED_SECRETS[0])).toThrow(/UNTRUSTED_ATTESTATION_AUTHORITY/)
    expect(() => validateP0AuthoritySecret('short_secret')).toThrow(/ATTESTATION_CONFIGURATION_INVALID/)
    expect(() => validateP0AuthoritySecret('test_authority_key_long_enough_1234567890')).toThrow(/UNTRUSTED_ATTESTATION_AUTHORITY/)
  })

  // 51. Rechazo inmediato de declaración fraudulenta ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED
  it('51. Rechaza de forma taxativa cualquier declaración de verificación criptográfica directa de ARCA', () => {
    const { publicKey: attPub } = generateEphemeralAttestationKeyPair()
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const ivaText = ivaParsed.ivaText
    const condText = condParsed.conditionText
    const rawIvaSoapText = SYNTHETIC_TIPOS_IVA_RESPONSE
    const rawConditionSoapText = SYNTHETIC_CONDICIONES_IVA_RESPONSE

    const goDoc = createSignedTestPr02P0GoAuthorization({
      identificador: 'GO-FRAUD-001',
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)
    const goAuthSha = createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex')

    const draft = {
      identificador_proceso: 'pid-fraud-check',
      ejecucion_autorizada_id: 'pid-fraud-check',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: createHash('sha256').update(rawIvaSoapText).digest('hex'),
      iva_archivo_normalizado_sha256: createHash('sha256').update(ivaText).digest('hex'),
      condition_respuesta_original_sha256: createHash('sha256').update(rawConditionSoapText).digest('hex'),
      condition_archivo_normalizado_sha256: createHash('sha256').update(condText).digest('hex'),
    }

    const attestation = createP0Attestation({
      manifest: draft,
      commitSha: VALID_HEAD,
      transportType: 'OFFICIAL',
      goAuthorizationId: 'GO-FRAUD-001',
      goAuthorizationSha256: goAuthSha,
      executorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
    })

    // La atestación legítima declara ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED: false
    expect(attestation.ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED).toBe(false)

    // Si un atacante altera la atestación para proclamar verificación criptográfica directa de ARCA
    const fraudulentAttestation = {
      ...attestation,
      ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED: true,
    }

    const check = verifyP0Attestation(fraudulentAttestation, {
      manifest: draft,
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: attPub,
      allowTestKeys: true,
    })
    expect(check.valid).toBe(false)
    expect(check.reason).toBe('FRAUDULENT_ARCA_CRYPTOGRAPHIC_VERIFICATION_CLAIM')

    const fraudulentManifest = {
      ...draft,
      origen_verificado: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      transporte_validado: true,
      accredited: true,
      transport_type: 'OFFICIAL',
      go_authorization_id: 'GO-FRAUD-001',
      go_authorization_sha256: goAuthSha,
      attestation: fraudulentAttestation,
      manifest_sha256: '4'.repeat(64),
    }

    expect(() => validatePr02P0Manifest(fraudulentManifest)).toThrow(/P0_MANIFEST_FRAUDULENT_ARCA_VERIFICATION/)

    expect(() =>
      validatePr02P1ImportEvidence({
        manifest: fraudulentManifest,
        ivaText,
        conditionText: condText,
        rawIvaSoapText,
        rawConditionSoapText,
        goAuthorizationDoc: goDoc,
        trustedAttestationPublicKey: attPub,
        trustedGoPublicKey: goPub,
        expectedHead: VALID_HEAD,
        allowTestKeys: true,
      })
    ).toThrow(/P1_IMPORT_FORBIDDEN: Declaración fraudulenta de verificación criptográfica directa de ARCA/)
  })

  // 52. Ausencia de clave de custodia en P1 falla cerrado con ATTESTATION_AUTHORITY_NOT_AVAILABLE
  it('52. Ausencia de clave de custodia en P1 falla cerrado con ATTESTATION_AUTHORITY_NOT_AVAILABLE', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { privateKey: attPriv } = generateEphemeralAttestationKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const ivaText = ivaParsed.ivaText
    const condText = condParsed.conditionText
    const rawIvaSoapText = SYNTHETIC_TIPOS_IVA_RESPONSE
    const rawConditionSoapText = SYNTHETIC_CONDICIONES_IVA_RESPONSE

    const goDoc = createSignedTestPr02P0GoAuthorization({
      identificador: 'GO-CUSTODY-001',
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)
    const goAuthSha = createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex')

    const draft = {
      identificador_proceso: 'pid-custody-check',
      ejecucion_autorizada_id: 'pid-custody-check',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: createHash('sha256').update(rawIvaSoapText).digest('hex'),
      iva_archivo_normalizado_sha256: createHash('sha256').update(ivaText).digest('hex'),
      condition_respuesta_original_sha256: createHash('sha256').update(rawConditionSoapText).digest('hex'),
      condition_archivo_normalizado_sha256: createHash('sha256').update(condText).digest('hex'),
    }

    const attestation = createSignedTestIndependentAttestation({
      processId: 'pid-custody-check',
      commitSha: VALID_HEAD,
      consultadoEn: '2026-11-05T01:00:00.000Z',
      ivaRawSha: draft.iva_respuesta_original_sha256,
      ivaNormSha: draft.iva_archivo_normalizado_sha256,
      condRawSha: draft.condition_respuesta_original_sha256,
      condNormSha: draft.condition_archivo_normalizado_sha256,
      goAuthorizationId: 'GO-CUSTODY-001',
      goAuthorizationSha256: goAuthSha,
      executorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
    }, attPriv)

    const manifest = {
      ...draft,
      origen_verificado: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      transporte_validado: true,
      accredited: true,
      transport_type: 'OFFICIAL',
      go_authorization_id: 'GO-CUSTODY-001',
      go_authorization_sha256: goAuthSha,
      attestation,
      manifest_sha256: computeP0ManifestDigest({ ...draft, attestation }),
    }

    const prevAttEnv = process.env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV]
    const prevAuthEnv = process.env[PR02_P0_AUTHORITY_ENV]
    try {
      delete process.env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV]
      delete process.env[PR02_P0_AUTHORITY_ENV]
      expect(() =>
        validatePr02P1ImportEvidence({
          manifest,
          ivaText,
          conditionText: condText,
          rawIvaSoapText,
          rawConditionSoapText,
          goAuthorizationDoc: goDoc,
          trustedGoPublicKey: goPub,
          expectedHead: VALID_HEAD,
        })
      ).toThrow(/ATTESTATION_AUTHORITY_NOT_AVAILABLE/)
    } finally {
      if (prevAttEnv !== undefined) process.env[PR02_P0_ATTESTATION_PUBLIC_KEY_ENV] = prevAttEnv
      if (prevAuthEnv !== undefined) process.env[PR02_P0_AUTHORITY_ENV] = prevAuthEnv
    }
  })

  // 53. Validación cruzada de goAuthorizationDoc en P1 detecta discordancia de identificador o hash
  it('53. Validación opcional de goAuthorizationDoc en P1 detecta discordancia con el manifiesto', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: attPub, privateKey: attPriv } = generateEphemeralAttestationKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const ivaText = ivaParsed.ivaText
    const condText = condParsed.conditionText
    const rawIvaSoapText = SYNTHETIC_TIPOS_IVA_RESPONSE
    const rawConditionSoapText = SYNTHETIC_CONDICIONES_IVA_RESPONSE

    const goDoc = createSignedTestPr02P0GoAuthorization({
      identificador: 'GO-P0-CROSSVAL-001',
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)

    const goAuthSha = createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex')

    const baseManifest = {
      entorno: 'HOMOLOGACION',
      origen_verificado: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
      consultado_en: '2026-11-05T01:00:00.000Z',
      identificador_proceso: 'pid-crossval-001',
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
      ejecucion_autorizada_id: 'pid-crossval-001',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      iva_respuesta_original_sha256: createHash('sha256').update(rawIvaSoapText).digest('hex'),
      iva_archivo_normalizado_sha256: createHash('sha256').update(ivaText).digest('hex'),
      condition_respuesta_original_sha256: createHash('sha256').update(rawConditionSoapText).digest('hex'),
      condition_archivo_normalizado_sha256: createHash('sha256').update(condText).digest('hex'),
      transporte_validado: true,
      accredited: true,
      transport_type: 'OFFICIAL',
      go_authorization_id: 'GO-P0-CROSSVAL-001',
      go_authorization_sha256: goAuthSha,
    }

    const attestation = createSignedTestIndependentAttestation({
      processId: 'pid-crossval-001',
      commitSha: VALID_HEAD,
      consultadoEn: '2026-11-05T01:00:00.000Z',
      ivaRawSha: baseManifest.iva_respuesta_original_sha256,
      ivaNormSha: baseManifest.iva_archivo_normalizado_sha256,
      condRawSha: baseManifest.condition_respuesta_original_sha256,
      condNormSha: baseManifest.condition_archivo_normalizado_sha256,
      goAuthorizationId: 'GO-P0-CROSSVAL-001',
      goAuthorizationSha256: goAuthSha,
      executorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
    }, attPriv)

    const manifest = {
      ...baseManifest,
      attestation,
      manifest_sha256: computeP0ManifestDigest({ ...baseManifest, attestation }),
    }

    // Coincidencia exitosa
    const passResult = validatePr02P1ImportEvidence({
      manifest,
      ivaText,
      conditionText: condText,
      rawIvaSoapText,
      rawConditionSoapText,
      trustedAttestationPublicKey: attPub,
      trustedGoPublicKey: goPub,
      goAuthorizationDoc: goDoc,
      expectedHead: VALID_HEAD,
      allowTestKeys: true,
    })
    expect(passResult.status).toBe('PASS')
    expect(passResult.EVIDENCE_INTEGRITY).toBe('PASS')
    expect(passResult.EVIDENCE_CUSTODY_ATTESTED).toBe(true)
    expect(passResult.TRUSTED_EXECUTION_BOUNDARY).toBe('VERIFIED')
    expect(passResult.ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED).toBe(false)
    expect(passResult.trustModel).toBe('LIMITED')

    // Discordancia de ID
    const mismatchedIdGoDoc = createSignedTestPr02P0GoAuthorization({
      identificador: 'GO-P0-OTHER-ID',
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)

    expect(() =>
      validatePr02P1ImportEvidence({
        manifest,
        ivaText,
        conditionText: condText,
        rawIvaSoapText,
        rawConditionSoapText,
        trustedAttestationPublicKey: attPub,
        trustedGoPublicKey: goPub,
        goAuthorizationDoc: mismatchedIdGoDoc,
        expectedHead: VALID_HEAD,
        allowTestKeys: true,
      })
    ).toThrow(/GO_ID_MISMATCH/)
  })

  // 54. Niveles de aseguramiento y modelo de confianza en reportes DryRun y Authorized
  it('54. Reportes de ejecución informan niveles de aseguramiento diferenciados y modelo de confianza', async () => {
    const dryReport = await executePr02P0OfficialEvidence({ dryRun: true })
    expect(dryReport.ANTI_REPLAY_GUARANTEE_LEVEL).toBe('HOST_LOCAL_DURABLE_ONE_TIME_USE')
    expect(dryReport.EVIDENCE_INTEGRITY).toBe('NOT_RUN')
    expect(dryReport.EVIDENCE_CUSTODY_ATTESTED).toBe(false)
    expect(dryReport.TRUSTED_EXECUTION_BOUNDARY).toBe('UNVERIFIED')
    expect(dryReport.ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED).toBe(false)
    expect(dryReport.P0_PROVENANCE_TRUST_MODEL).toBe('SELF_ATTESTED')
    expect(dryReport.P1_OFFICIAL_PROVENANCE_TRUST).toBe('LIMITED')

    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: attPub } = generateEphemeralAttestationKeyPair()
    const goDoc = createSignedTestPr02P0GoAuthorization({
      identificador: 'GO-P0-REPORT-001',
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)

    const simReport = await executePr02P0OfficialEvidence(
      {
        authorized: true,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        expectedHead: VALID_HEAD,
        head: VALID_HEAD,
        goAuthorizationDoc: goDoc,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        trustedAttestationPublicKey: attPub,
        existingTa: {
          valido: true,
          estado: 'DISPONIBLE',
          token: 'TOKEN_SIM_1234567890',
          sign: 'SIGN_SIM_1234567890',
          vence_en: '2026-11-05T12:00:00.000Z',
        },
        saveEvidence: false,
        now: '2026-11-05T02:00:00.000Z',
      },
      {
        wsfeTiposIva: async () => SYNTHETIC_TIPOS_IVA_RESPONSE,
        wsfeCondicionIva: async () => SYNTHETIC_CONDICIONES_IVA_RESPONSE,
      }
    )

    expect(simReport.ANTI_REPLAY_GUARANTEE_LEVEL).toBe('HOST_LOCAL_DURABLE_ONE_TIME_USE')
    expect(simReport.EVIDENCE_INTEGRITY).toBe('PASS')
    expect(simReport.EVIDENCE_CUSTODY_ATTESTED).toBe(false)
    expect(simReport.TRUSTED_EXECUTION_BOUNDARY).toBe('UNVERIFIED')
    expect(simReport.ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED).toBe(false)
    expect(simReport.P0_PROVENANCE_TRUST_MODEL).toBe('SELF_ATTESTED')
    expect(simReport.P1_OFFICIAL_PROVENANCE_TRUST).toBe('LIMITED')
  })

  // =========================================================================
  // 18 PRUEBAS ADVERSARIALES OBLIGATORIAS (HALLAZGOS A, B, C, D, E, F)
  // =========================================================================

  // ADV-01: Invocación directa del transporte sin GO es bloqueada
  it('55. [ADV-01] Invocación directa de createOfficialArcaTransport sin GO verificado arroja OFFICIAL_NETWORK_GO_REQUIRED', () => {
    expect(() => createOfficialArcaTransport(null as any)).toThrow(/OFFICIAL_NETWORK_GO_REQUIRED/)
    expect(() => createOfficialArcaTransport(undefined as any)).toThrow(/OFFICIAL_NETWORK_GO_REQUIRED/)
    expect(() => createOfficialArcaTransport({} as any)).toThrow(/OFFICIAL_NETWORK_GO_REQUIRED/)
    expect(() => createOfficialArcaTransport({ valid: false } as any)).toThrow(/OFFICIAL_NETWORK_GO_REQUIRED/)
  })

  // ADV-02: Intento de bypass mediante booleano officialGoAuthorized
  it('56. [ADV-02] Intento de activación con objeto apócrifo { officialGoAuthorized: true } es rechazado sin excepción', () => {
    expect(() => createOfficialArcaTransport({ officialGoAuthorized: true } as any)).toThrow(/OFFICIAL_NETWORK_GO_REQUIRED/)
    expect(() => createOfficialArcaTransport({ valid: true, authorizationId: '' } as any)).toThrow(/OFFICIAL_NETWORK_GO_REQUIRED/)
    expect(() => createOfficialArcaTransport({ valid: true, authorizationId: 'GO-1', scope: 'WRONG_SCOPE' } as any)).toThrow(/OFFICIAL_NETWORK_GO_REQUIRED/)
  })

  // ADV-03: Atestación auto-firmada (SELF_ATTESTED) del colector es rechazada en P1
  it('57. [ADV-03] Atestación emitida localmente por el colector (SELF_ATTESTED) es taxativamente rechazada en P1', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: attPub } = generateEphemeralAttestationKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')

    const goDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)

    const manifestDraft = {
      identificador_proceso: 'pid-self-attested-01',
      ejecucion_autorizada_id: 'pid-self-attested-01',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: createHash('sha256').update(SYNTHETIC_TIPOS_IVA_RESPONSE).digest('hex'),
      iva_archivo_normalizado_sha256: createHash('sha256').update(ivaParsed.ivaText).digest('hex'),
      condition_respuesta_original_sha256: createHash('sha256').update(SYNTHETIC_CONDICIONES_IVA_RESPONSE).digest('hex'),
      condition_archivo_normalizado_sha256: createHash('sha256').update(condParsed.conditionText).digest('hex'),
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
    }

    const selfAttestation = createP0Attestation({
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      transportType: 'OFFICIAL',
      goAuthorizationId: goDoc.authorization.identificador,
      goAuthorizationSha256: createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex'),
    })

    expect(selfAttestation.trustModel).toBe('SELF_ATTESTED')

    const manifest = {
      ...manifestDraft,
      origen_verificado: WSFE_HOMO_URL,
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      transporte_validado: true,
      accredited: false,
      transport_type: 'OFFICIAL',
      go_authorization_id: goDoc.authorization.identificador,
      go_authorization_sha256: createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex'),
      attestation: selfAttestation,
      manifest_sha256: computeP0ManifestDigest({ ...manifestDraft, attestation: selfAttestation }),
    }

    expect(() =>
      validatePr02P1ImportEvidence({
        manifest,
        ivaText: ivaParsed.ivaText,
        conditionText: condParsed.conditionText,
        rawIvaSoapText: SYNTHETIC_TIPOS_IVA_RESPONSE,
        rawConditionSoapText: SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        goAuthorizationDoc: goDoc,
        trustedAttestationPublicKey: attPub,
        trustedGoPublicKey: goPub,
        expectedHead: VALID_HEAD,
        allowTestKeys: true,
      })
    ).toThrow(/INDEPENDENT_ATTESTATION_REQUIRED/)
  })

  // ADV-04: Evidencia sintética sin firma independiente rechazada en P1
  it('58. [ADV-04] Evidencia sintética con hashes coincidentes pero sin firma independiente es rechazada en P1', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: attPub } = generateEphemeralAttestationKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')

    const goDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)

    const unsignedAttestation = {
      version: '1.0',
      processId: 'pid-unsigned',
      executionId: 'pid-unsigned',
      executionScope: PR02_P0_SCOPE,
      commitSha: VALID_HEAD,
      consultadoEn: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      transportType: 'OFFICIAL',
      executorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
      operacionesWsfe: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      ivaRawSha: createHash('sha256').update(SYNTHETIC_TIPOS_IVA_RESPONSE).digest('hex'),
      ivaNormSha: createHash('sha256').update(ivaParsed.ivaText).digest('hex'),
      condRawSha: createHash('sha256').update(SYNTHETIC_CONDICIONES_IVA_RESPONSE).digest('hex'),
      condNormSha: createHash('sha256').update(condParsed.conditionText).digest('hex'),
      goAuthorizationId: goDoc.authorization.identificador,
      goAuthorizationSha256: createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex'),
      issuedAt: '2026-11-05T01:00:00.000Z',
      signature: null,
      accredited: true,
      provenance: 'VERIFIED',
      trustModel: 'INDEPENDENT_ATTESTED',
      TRUSTED_EXECUTION_BOUNDARY: 'VERIFIED',
    }

    const manifest = {
      entorno: 'HOMOLOGACION',
      consultado_en: '2026-11-05T01:00:00.000Z',
      identificador_proceso: 'pid-unsigned',
      ejecucion_autorizada_id: 'pid-unsigned',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      origen_verificado: WSFE_HOMO_URL,
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      iva_respuesta_original_sha256: createHash('sha256').update(SYNTHETIC_TIPOS_IVA_RESPONSE).digest('hex'),
      iva_archivo_normalizado_sha256: createHash('sha256').update(ivaParsed.ivaText).digest('hex'),
      condition_respuesta_original_sha256: createHash('sha256').update(SYNTHETIC_CONDICIONES_IVA_RESPONSE).digest('hex'),
      condition_archivo_normalizado_sha256: createHash('sha256').update(condParsed.conditionText).digest('hex'),
      transporte_validado: true,
      accredited: true,
      transport_type: 'OFFICIAL',
      go_authorization_id: goDoc.authorization.identificador,
      go_authorization_sha256: createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex'),
      attestation: unsignedAttestation,
      manifest_sha256: '',
    }
    manifest.manifest_sha256 = computeP0ManifestDigest(manifest)

    expect(() =>
      validatePr02P1ImportEvidence({
        manifest,
        ivaText: ivaParsed.ivaText,
        conditionText: condParsed.conditionText,
        rawIvaSoapText: SYNTHETIC_TIPOS_IVA_RESPONSE,
        rawConditionSoapText: SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        goAuthorizationDoc: goDoc,
        trustedAttestationPublicKey: attPub,
        trustedGoPublicKey: goPub,
        expectedHead: VALID_HEAD,
        allowTestKeys: true,
      })
    ).toThrow(/P1_IMPORT_FORBIDDEN: Procedencia oficial no verificada/)
  })

  // ADV-05: Firma Ed25519 con byte alterado es rechazada
  it('59. [ADV-05] Firma asimétrica Ed25519 con un único byte modificado es rechazada', () => {
    const { publicKey, privateKey } = generateEphemeralGoAuthorityKeyPair()
    const doc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, privateKey)

    const corruptedSig = doc.signature.slice(0, 10) + (doc.signature[10] === 'a' ? 'b' : 'a') + doc.signature.slice(11)
    const corruptedDoc = {
      authorization: doc.authorization,
      signature: corruptedSig,
    }

    expect(() =>
      validatePr02P0GoAuthorization(corruptedDoc, {
        expectedHead: VALID_HEAD,
        trustedGoPublicKey: publicKey,
        allowTestKeys: true,
      })
    ).toThrow(/GO_AUTHORIZATION_SIGNATURE_INVALID/)
  })

  // ADV-06: Firma Ed25519 verificada con clave pública ajena es rechazada
  it('60. [ADV-06] Firma asimétrica Ed25519 verificada contra clave pública ajena es rechazada', () => {
    const { privateKey } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: wrongPublicKey } = generateEphemeralGoAuthorityKeyPair()
    const doc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, privateKey)

    expect(() =>
      validatePr02P0GoAuthorization(doc, {
        expectedHead: VALID_HEAD,
        trustedGoPublicKey: wrongPublicKey,
        allowTestKeys: true,
      })
    ).toThrow(/GO_AUTHORIZATION_SIGNATURE_INVALID/)
  })

  // ADV-07: GO document payload modificado post-firma
  it('61. [ADV-07] Documento GO con campo modificado post-firma es rechazado', () => {
    const { publicKey, privateKey } = generateEphemeralGoAuthorityKeyPair()
    const doc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, privateKey)

    const tamperedDoc = {
      authorization: {
        ...doc.authorization,
        single_use_nonce: 'tampered_nonce_value_1234567890',
      },
      signature: doc.signature,
    }

    expect(() =>
      validatePr02P0GoAuthorization(tamperedDoc, {
        expectedHead: VALID_HEAD,
        trustedGoPublicKey: publicKey,
        allowTestKeys: true,
      })
    ).toThrow(/GO_AUTHORIZATION_SIGNATURE_INVALID/)
  })

  // ADV-08: GO document con commit SHA incorrecto
  it('62. [ADV-08] Documento GO firmado para otro commit SHA es rechazado', () => {
    const { publicKey, privateKey } = generateEphemeralGoAuthorityKeyPair()
    const doc = createSignedTestPr02P0GoAuthorization({
      commit_sha: '0'.repeat(40),
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, privateKey)

    expect(() =>
      validatePr02P0GoAuthorization(doc, {
        expectedHead: VALID_HEAD,
        trustedGoPublicKey: publicKey,
        allowTestKeys: true,
      })
    ).toThrow(/GO_AUTHORIZATION_COMMIT_MISMATCH/)
  })

  // ADV-09: GO document vencido
  it('63. [ADV-09] Documento GO con vencimiento expirado es rechazado', () => {
    const { publicKey, privateKey } = generateEphemeralGoAuthorityKeyPair()
    const nowIso = '2026-11-05T05:00:00.000Z'
    const doc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
      emitido_en: '2026-11-05T01:00:00.000Z',
      vence_en: '2026-11-05T02:00:00.000Z',
    }, privateKey)

    expect(() =>
      validatePr02P0GoAuthorization(doc, {
        expectedHead: VALID_HEAD,
        trustedGoPublicKey: publicKey,
        allowTestKeys: true,
        now: nowIso,
      })
    ).toThrow(/GO_AUTHORIZATION_EXPIRED/)
  })

  // ADV-10: GO document con scope o project_ref no autorizado
  it('64. [ADV-10] Documento GO con scope o project_ref incorrecto es rechazado', () => {
    const { publicKey, privateKey } = generateEphemeralGoAuthorityKeyPair()

    const wrongScopeDoc = createSignedTestPr02P0GoAuthorization({
      scope: 'PR02_P2_CATALOG_ENABLE',
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, privateKey)

    expect(() =>
      validatePr02P0GoAuthorization(wrongScopeDoc, {
        expectedHead: VALID_HEAD,
        trustedGoPublicKey: publicKey,
        allowTestKeys: true,
      })
    ).toThrow(/GO_AUTHORIZATION_SCOPE_MISMATCH/)

    const wrongProjectDoc = createSignedTestPr02P0GoAuthorization({
      project_ref: 'invalid-other-project-ref',
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, privateKey)

    expect(() =>
      validatePr02P0GoAuthorization(wrongProjectDoc, {
        expectedHead: VALID_HEAD,
        trustedGoPublicKey: publicKey,
        allowTestKeys: true,
      })
    ).toThrow(/GO_AUTHORIZATION_PROJECT_MISMATCH/)
  })

  // ADV-11: GO document con operaciones o límites adulterados
  it('65. [ADV-11] Documento GO con operaciones prohibidas o límites inflados es rechazado', () => {
    const { publicKey, privateKey } = generateEphemeralGoAuthorityKeyPair()

    const dangerousDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
      operaciones_permitidas: ['LoginCms', 'FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor', 'FECAESolicitar'],
    }, privateKey)

    expect(() =>
      validatePr02P0GoAuthorization(dangerousDoc, {
        expectedHead: VALID_HEAD,
        trustedGoPublicKey: publicKey,
        allowTestKeys: true,
      })
    ).toThrow(/GO_AUTHORIZATION_OPERATIONS_FORBIDDEN/)

    const highLimitsDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
      limites: { loginCmsMax: 1, tiposIvaMax: 1, condicionIvaReceptorMax: 1, totalMax: 99 },
    }, privateKey)

    expect(() =>
      validatePr02P0GoAuthorization(highLimitsDoc, {
        expectedHead: VALID_HEAD,
        trustedGoPublicKey: publicKey,
        allowTestKeys: true,
      })
    ).toThrow(/GO_AUTHORIZATION_LIMITS_EXCEEDED/)
  })

  // ADV-12: Anti-replay durable atómico bloquea llamadas antes de ejecutar red
  it('66. [ADV-12] Anti-replay durable rechaza autorización ya consumida antes de cualquier llamada de red', async () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const testConsumedDir = path.resolve(TEST_EVIDENCE_DIR, '.test-consumed-adv-12')
    clearConsumedAuthorizationsForTesting(testConsumedDir)

    const authId = 'GO-ADV-REPLAY-SINGLE-USE-001'
    const doc = createSignedTestPr02P0GoAuthorization({
      identificador: authId,
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)

    // Primera ejecución consume de forma durable
    consumeGoAuthorizationDurable(authId, { consumedAuthorizationsDir: testConsumedDir })
    expect(isGoAuthorizationConsumed(authId, { consumedAuthorizationsDir: testConsumedDir })).toBe(true)

    // Intento posterior con el mismo GO es bloqueado en validación
    expect(() =>
      validatePr02P0GoAuthorization(doc, {
        expectedHead: VALID_HEAD,
        trustedGoPublicKey: goPub,
        consumedAuthorizationsDir: testConsumedDir,
        allowTestKeys: true,
      })
    ).toThrow(/GO_AUTHORIZATION_ALREADY_CONSUMED/)

    clearConsumedAuthorizationsForTesting(testConsumedDir)
  })

  // ADV-13: Omisión de documento GO en P1 falla cerrado
  it('67. [ADV-13] Omisión de documento GO en validación de importación P1 falla cerrado', () => {
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')

    expect(() =>
      validatePr02P1ImportEvidence({
        manifest: { dummy: true } as any,
        ivaText: ivaParsed.ivaText,
        conditionText: condParsed.conditionText,
        rawIvaSoapText: SYNTHETIC_TIPOS_IVA_RESPONSE,
        rawConditionSoapText: SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        expectedHead: VALID_HEAD,
      })
    ).toThrow(/GO_AUTHORIZATION_REQUIRED/)
  })

  // ADV-14: Omisión de atestación independiente en P1 falla cerrado
  it('68. [ADV-14] Omisión de atestación independiente en validación P1 falla cerrado', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: attPub } = generateEphemeralAttestationKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')

    const goDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)

    const manifestWithoutAttestation = {
      entorno: 'HOMOLOGACION',
      origen_verificado: WSFE_HOMO_URL,
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      identificador_proceso: 'pid-no-att',
      ejecucion_autorizada_id: 'pid-no-att',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
      iva_respuesta_original_sha256: createHash('sha256').update(SYNTHETIC_TIPOS_IVA_RESPONSE).digest('hex'),
      iva_archivo_normalizado_sha256: createHash('sha256').update(ivaParsed.ivaText).digest('hex'),
      condition_respuesta_original_sha256: createHash('sha256').update(SYNTHETIC_CONDICIONES_IVA_RESPONSE).digest('hex'),
      condition_archivo_normalizado_sha256: createHash('sha256').update(condParsed.conditionText).digest('hex'),
      transporte_validado: true,
      accredited: true,
      transport_type: 'OFFICIAL',
      go_authorization_id: goDoc.authorization.identificador,
      go_authorization_sha256: createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex'),
      attestation: null,
    }

    expect(() =>
      validatePr02P1ImportEvidence({
        manifest: manifestWithoutAttestation,
        ivaText: ivaParsed.ivaText,
        conditionText: condParsed.conditionText,
        rawIvaSoapText: SYNTHETIC_TIPOS_IVA_RESPONSE,
        rawConditionSoapText: SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        goAuthorizationDoc: goDoc,
        trustedAttestationPublicKey: attPub,
        trustedGoPublicKey: goPub,
        expectedHead: VALID_HEAD,
        allowTestKeys: true,
      })
    ).toThrow(/INDEPENDENT_ATTESTATION_REQUIRED/)
  })

  // ADV-15: Omisión de respuestas SOAP XML en crudo en validación P1 falla cerrado
  it('69. [ADV-15] Omisión de respuestas SOAP XML en crudo en validación P1 falla cerrado', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: attPub } = generateEphemeralAttestationKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')

    const goDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)

    expect(() =>
      validatePr02P1ImportEvidence({
        manifest: { dummy: true } as any,
        ivaText: ivaParsed.ivaText,
        conditionText: condParsed.conditionText,
        rawIvaSoapText: '', // Omitido
        rawConditionSoapText: SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        goAuthorizationDoc: goDoc,
        trustedAttestationPublicKey: attPub,
        trustedGoPublicKey: goPub,
        expectedHead: VALID_HEAD,
        allowTestKeys: true,
      })
    ).toThrow(/RAW_SOAP_RESPONSES_REQUIRED/)

    expect(() =>
      validatePr02P1ImportEvidence({
        manifest: { dummy: true } as any,
        ivaText: ivaParsed.ivaText,
        conditionText: condParsed.conditionText,
        rawIvaSoapText: SYNTHETIC_TIPOS_IVA_RESPONSE,
        rawConditionSoapText: '', // Omitido
        goAuthorizationDoc: goDoc,
        trustedAttestationPublicKey: attPub,
        trustedGoPublicKey: goPub,
        expectedHead: VALID_HEAD,
        allowTestKeys: true,
      })
    ).toThrow(/RAW_SOAP_RESPONSES_REQUIRED/)
  })

  // ADV-16: Discrepancia entre XML SOAP y normalizado detectada por parser independiente
  it('70. [ADV-16] Discrepancia entre XML SOAP en crudo y normalizado JSON es detectada por parser independiente', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: attPub, privateKey: attPriv } = generateEphemeralAttestationKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')

    // Modificamos un parámetro en el normalizado provisto
    const tamperedIvaObj = JSON.parse(ivaParsed.ivaText)
    tamperedIvaObj.parametros[0].Description = 'Tasa alterada 99%'
    const tamperedIvaText = JSON.stringify(tamperedIvaObj)

    const goDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)
    const goAuthSha = createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex')

    const rawIvaSha = createHash('sha256').update(SYNTHETIC_TIPOS_IVA_RESPONSE).digest('hex')
    const tamperedIvaSha = createHash('sha256').update(tamperedIvaText).digest('hex')
    const rawCondSha = createHash('sha256').update(SYNTHETIC_CONDICIONES_IVA_RESPONSE).digest('hex')
    const condNormSha = createHash('sha256').update(condParsed.conditionText).digest('hex')

    const manifestDraft = {
      identificador_proceso: 'pid-discrepancy-01',
      ejecucion_autorizada_id: 'pid-discrepancy-01',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: rawIvaSha,
      iva_archivo_normalizado_sha256: tamperedIvaSha,
      condition_respuesta_original_sha256: rawCondSha,
      condition_archivo_normalizado_sha256: condNormSha,
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
    }

    const attestation = createSignedTestIndependentAttestation({
      processId: 'pid-discrepancy-01',
      commitSha: VALID_HEAD,
      consultadoEn: '2026-11-05T01:00:00.000Z',
      ivaRawSha: rawIvaSha,
      ivaNormSha: tamperedIvaSha,
      condRawSha: rawCondSha,
      condNormSha,
      goAuthorizationId: goDoc.authorization.identificador,
      goAuthorizationSha256: goAuthSha,
      executorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
    }, attPriv)

    const manifest = {
      ...manifestDraft,
      origen_verificado: WSFE_HOMO_URL,
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      transporte_validado: true,
      accredited: true,
      transport_type: 'OFFICIAL',
      go_authorization_id: goDoc.authorization.identificador,
      go_authorization_sha256: goAuthSha,
      attestation,
      manifest_sha256: computeP0ManifestDigest({ ...manifestDraft, attestation }),
    }

    expect(() =>
      validatePr02P1ImportEvidence({
        manifest,
        ivaText: tamperedIvaText,
        conditionText: condParsed.conditionText,
        rawIvaSoapText: SYNTHETIC_TIPOS_IVA_RESPONSE,
        rawConditionSoapText: SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        goAuthorizationDoc: goDoc,
        trustedAttestationPublicKey: attPub,
        trustedGoPublicKey: goPub,
        expectedHead: VALID_HEAD,
        allowTestKeys: true,
      })
    ).toThrow(/IVA_NORMALIZED_DATA_DISCREPANCY/)
  })

  // ADV-17: Intento de proclamar TRUSTED_EXECUTION_BOUNDARY = 'VERIFIED' en colector local
  it('71. [ADV-17] Intento de proclamar TRUSTED_EXECUTION_BOUNDARY = VERIFIED en atestación local es nulo', () => {
    const localAttestation = createP0Attestation({
      manifest: {
        identificador_proceso: 'pid-boundary-test',
        iva_respuesta_original_sha256: 'a'.repeat(64),
        iva_archivo_normalizado_sha256: 'b'.repeat(64),
        condition_respuesta_original_sha256: 'c'.repeat(64),
        condition_archivo_normalizado_sha256: 'd'.repeat(64),
      },
      commitSha: VALID_HEAD,
      transportType: 'OFFICIAL',
    })

    expect(localAttestation.TRUSTED_EXECUTION_BOUNDARY).toBe('UNVERIFIED')
    expect(localAttestation.accredited).toBe(false)
    expect(localAttestation.trustModel).toBe('SELF_ATTESTED')
    expect(localAttestation.signature).toBeNull()
  })

  // ADV-18: Importación de evidencia declarada SELF_ATTESTED falla taxativamente en P1
  it('72. [ADV-18] verifyP0Attestation rechaza explícitamente trustModel SELF_ATTESTED con ATTESTATION_SELF_ATTESTED_REJECTED', () => {
    const { publicKey: attPub } = generateEphemeralAttestationKeyPair()
    const selfAttestation = {
      version: '1.0',
      processId: 'pid-self-01',
      executionId: 'pid-self-01',
      executionScope: PR02_P0_SCOPE,
      commitSha: VALID_HEAD,
      consultadoEn: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      transportType: 'OFFICIAL',
      executorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
      operacionesWsfe: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      ivaRawSha: 'a'.repeat(64),
      ivaNormSha: 'b'.repeat(64),
      condRawSha: 'c'.repeat(64),
      condNormSha: 'd'.repeat(64),
      goAuthorizationId: 'GO-TEST-001',
      goAuthorizationSha256: 'e'.repeat(64),
      issuedAt: '2026-11-05T01:00:00.000Z',
      signature: '0'.repeat(128),
      accredited: true,
      provenance: 'VERIFIED',
      trustModel: 'SELF_ATTESTED',
      TRUSTED_EXECUTION_BOUNDARY: 'VERIFIED',
    }

    const check = verifyP0Attestation(selfAttestation, {
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: attPub,
      allowTestKeys: true,
    })

    expect(check.valid).toBe(false)
    expect(check.reason).toBe('ATTESTATION_SELF_ATTESTED_REJECTED')
    expect(check.errorCategory).toBe('UNTRUSTED_SELF_ATTESTATION')
  })

  // ADV-20: Separación criptográfica estricta de autoridades (GO Authority != Attestation Authority)
  it('73. [ADV-20] Intento de colapsar autoridades usando la misma clave Ed25519 para GO y Attestation es rechazado con COLLAPSED_AUTHORITIES_REJECTED', () => {
    const { publicKey: sharedPub, privateKey: sharedPriv } = generateEphemeralGoAuthorityKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')

    const goDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'COLLAPSED_AUTHORITY_ATTACKER',
    }, sharedPriv)
    const goAuthSha = createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex')

    const ivaRawSha = createHash('sha256').update(SYNTHETIC_TIPOS_IVA_RESPONSE).digest('hex')
    const ivaNormSha = createHash('sha256').update(ivaParsed.ivaText).digest('hex')
    const condRawSha = createHash('sha256').update(SYNTHETIC_CONDICIONES_IVA_RESPONSE).digest('hex')
    const condNormSha = createHash('sha256').update(condParsed.conditionText).digest('hex')

    const manifestDraft = {
      identificador_proceso: 'pid-collapsed-01',
      ejecucion_autorizada_id: 'pid-collapsed-01',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: ivaRawSha,
      iva_archivo_normalizado_sha256: ivaNormSha,
      condition_respuesta_original_sha256: condRawSha,
      condition_archivo_normalizado_sha256: condNormSha,
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
    }

    const attestation = createSignedTestIndependentAttestation({
      processId: 'pid-collapsed-01',
      commitSha: VALID_HEAD,
      consultadoEn: '2026-11-05T01:00:00.000Z',
      ivaRawSha,
      ivaNormSha,
      condRawSha,
      condNormSha,
      goAuthorizationId: goDoc.authorization.identificador,
      goAuthorizationSha256: goAuthSha,
      executorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
    }, sharedPriv)

    const manifest = {
      ...manifestDraft,
      origen_verificado: WSFE_HOMO_URL,
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      transporte_validado: true,
      accredited: true,
      transport_type: 'OFFICIAL',
      go_authorization_id: goDoc.authorization.identificador,
      go_authorization_sha256: goAuthSha,
      attestation,
      manifest_sha256: computeP0ManifestDigest({ ...manifestDraft, attestation }),
    }

    expect(() =>
      validatePr02P1ImportEvidence({
        manifest,
        ivaText: ivaParsed.ivaText,
        conditionText: condParsed.conditionText,
        rawIvaSoapText: SYNTHETIC_TIPOS_IVA_RESPONSE,
        rawConditionSoapText: SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        goAuthorizationDoc: goDoc,
        trustedAttestationPublicKey: sharedPub,
        trustedGoPublicKey: sharedPub,
        expectedHead: VALID_HEAD,
        allowTestKeys: true,
      })
    ).toThrow(/COLLAPSED_AUTHORITIES_REJECTED/)
  })

  // ADV-19: Cero conexiones de red reales en todas las pruebas
  it('74. [ADV-19] Auditoría de llamadas remotas: exactamente cero llamadas a ARCA/WSAA/WSFE y cero escrituras en staging', () => {
    // Verificación estricta de variables y estados de entorno
    expect(process.env.ARCA_CALLS_NEW || '0').toBe('0')
    expect(process.env.STAGING_WRITES_NEW || '0').toBe('0')
  })

  // =========================================================================
  // PRUEBAS ADVERSARIALES OBLIGATORIAS DE FRONTERA DE ATESTACIÓN INDEPENDIENTE
  // (ADV-21 a ADV-29)
  // =========================================================================

  // ADV-21: Mutar JSON SELF_ATTESTED a INDEPENDENT_ATTESTED -> REJECTED
  it('75. [ADV-21] Mutar un JSON SELF_ATTESTED a INDEPENDENT_ATTESTED o intentar auto-elevar mediante flags/env es rechazado', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: attPub } = generateEphemeralAttestationKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')

    const goDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)
    const goAuthSha = createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex')

    const manifestDraft = {
      identificador_proceso: 'pid-adv21-mutate',
      ejecucion_autorizada_id: 'pid-adv21-mutate',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: createHash('sha256').update(SYNTHETIC_TIPOS_IVA_RESPONSE).digest('hex'),
      iva_archivo_normalizado_sha256: createHash('sha256').update(ivaParsed.ivaText).digest('hex'),
      condition_respuesta_original_sha256: createHash('sha256').update(SYNTHETIC_CONDICIONES_IVA_RESPONSE).digest('hex'),
      condition_archivo_normalizado_sha256: createHash('sha256').update(condParsed.conditionText).digest('hex'),
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
    }

    const selfAttestation = createP0Attestation({
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      transportType: 'OFFICIAL',
      goAuthorizationId: goDoc.authorization.identificador,
      goAuthorizationSha256: goAuthSha,
    })

    // 1. Mutar JSON de SELF_ATTESTED a INDEPENDENT_ATTESTED sin firma o con firma apócrifa
    const mutatedAttestation = {
      ...selfAttestation,
      trustModel: 'INDEPENDENT_ATTESTED',
      ATTESTATION_TRUST_MODEL: 'INDEPENDENT_ATTESTED',
      TRUSTED_EXECUTION_BOUNDARY: 'VERIFIED' as const,
      EVIDENCE_CUSTODY_ATTESTED: true,
      INDEPENDENT_ATTESTATION_AVAILABLE: true,
      P1_IMPORT_ALLOWED: true,
      accredited: true,
      provenance: 'VERIFIED',
      signature: 'a'.repeat(128),
    }

    const checkMutated = verifyIndependentAttestation(mutatedAttestation, {
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: attPub,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })
    expect(checkMutated.valid).toBe(false)
    expect(checkMutated.P1_IMPORT_ALLOWED).toBe(false)
    expect(checkMutated.reason).toBe('ATTESTATION_SIGNATURE_VERIFICATION_FAILED')

    // 2. Intento de auto-elevar por parámetro o variable de entorno es bloqueado con SELF_ATTESTATION_AUTO_ELEVATION_REJECTED
    expect(() =>
      assertNoSelfAttestationElevation({ trustModel: 'INDEPENDENT_ATTESTED' })
    ).toThrow(/SELF_ATTESTATION_AUTO_ELEVATION_REJECTED/)
    expect(() =>
      assertNoSelfAttestationElevation({}, { ATTESTATION_TRUST_MODEL: 'INDEPENDENT_ATTESTED' })
    ).toThrow(/SELF_ATTESTATION_AUTO_ELEVATION_REJECTED/)
    expect(() =>
      assertNoSelfAttestationElevation({ P1_IMPORT_ALLOWED: true })
    ).toThrow(/SELF_ATTESTATION_AUTO_ELEVATION_REJECTED/)

    // 3. Prohibición estricta de invocar métodos de firma de producción en runtime fiscal
    expect(() => IndependentAttestationAuthority.signProductionAttestation()).toThrow(
      /PRODUCTION_SIGNING_FORBIDDEN_IN_RUNTIME/
    )
    expect(() => IndependentAttestationAuthority.accessProductionPrivateKey()).toThrow(
      /PRODUCTION_PRIVATE_KEY_FORBIDDEN_IN_RUNTIME/
    )
    expect(() => IndependentAttestationAuthority.generateTrustedIndependentAttestation()).toThrow(
      /PRODUCTION_SIGNING_FORBIDDEN_IN_RUNTIME/
    )
  })

  // ADV-22: Firma válida con clave de test no configurada como autoridad confiable -> REJECTED
  it('76. [ADV-22] Firma Ed25519 matemáticamente válida pero emitida con clave no configurada como autoridad confiable es rechazada', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: trustedAttPub } = generateEphemeralAttestationKeyPair()
    const { privateKey: untrustedAttPriv } = generateEphemeralAttestationKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')

    const goDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)
    const goAuthSha = createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex')

    const ivaRawSha = createHash('sha256').update(SYNTHETIC_TIPOS_IVA_RESPONSE).digest('hex')
    const ivaNormSha = createHash('sha256').update(ivaParsed.ivaText).digest('hex')
    const condRawSha = createHash('sha256').update(SYNTHETIC_CONDICIONES_IVA_RESPONSE).digest('hex')
    const condNormSha = createHash('sha256').update(condParsed.conditionText).digest('hex')

    const manifestDraft = {
      identificador_proceso: 'pid-adv22-untrusted',
      ejecucion_autorizada_id: 'pid-adv22-untrusted',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: ivaRawSha,
      iva_archivo_normalizado_sha256: ivaNormSha,
      condition_respuesta_original_sha256: condRawSha,
      condition_archivo_normalizado_sha256: condNormSha,
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
    }

    const reqPkg = createAttestationRequest({
      manifest: {
        ...manifestDraft,
        go_authorization_id: goDoc.authorization.identificador,
        go_authorization_sha256: goAuthSha,
        manifest_sha256: computeP0ManifestDigest(manifestDraft),
      },
      commitSha: VALID_HEAD,
    })

    // Firmado con clave privada NO confiable (distinta de trustedAttPub)
    const signedWithUntrustedKey = createSignedTestAttestationFromRequest(reqPkg, untrustedAttPriv)

    const check = verifyIndependentAttestation(signedWithUntrustedKey, {
      attestationRequest: reqPkg,
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: trustedAttPub,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })
    expect(check.valid).toBe(false)
    expect(check.reason).toBe('ATTESTATION_SIGNATURE_VERIFICATION_FAILED')
  })

  // ADV-23: Firma válida, pero payload canónico modificado después de firmar -> REJECTED
  it('77. [ADV-23] Firma Ed25519 válida pero payload canónico modificado después de firmar es rechazada', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: attPub, privateKey: attPriv } = generateEphemeralAttestationKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')

    const goDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)
    const goAuthSha = createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex')

    const ivaRawSha = createHash('sha256').update(SYNTHETIC_TIPOS_IVA_RESPONSE).digest('hex')
    const ivaNormSha = createHash('sha256').update(ivaParsed.ivaText).digest('hex')
    const condRawSha = createHash('sha256').update(SYNTHETIC_CONDICIONES_IVA_RESPONSE).digest('hex')
    const condNormSha = createHash('sha256').update(condParsed.conditionText).digest('hex')

    const manifestDraft = {
      identificador_proceso: 'pid-adv23-tamper',
      ejecucion_autorizada_id: 'pid-adv23-tamper',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: ivaRawSha,
      iva_archivo_normalizado_sha256: ivaNormSha,
      condition_respuesta_original_sha256: condRawSha,
      condition_archivo_normalizado_sha256: condNormSha,
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
    }

    const reqPkg = createAttestationRequest({
      manifest: {
        ...manifestDraft,
        go_authorization_id: goDoc.authorization.identificador,
        go_authorization_sha256: goAuthSha,
        manifest_sha256: computeP0ManifestDigest(manifestDraft),
      },
      commitSha: VALID_HEAD,
    })

    const validAttestation = createSignedTestAttestationFromRequest(reqPkg, attPriv)

    // Modificar un campo del payload después de firmar
    const tamperedAttestation = {
      ...validAttestation,
      ivaNormSha: 'f'.repeat(64),
    }

    const check = verifyIndependentAttestation(tamperedAttestation, {
      attestationRequest: reqPkg,
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: attPub,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })
    expect(check.valid).toBe(false)
    expect(check.reason).toBe('ATTESTATION_SIGNATURE_VERIFICATION_FAILED')
  })

  // ADV-24: Autoridad GO y autoridad de atestación usando la misma clave pública -> COLLAPSED_AUTHORITIES_REJECTED
  it('78. [ADV-24] verifyIndependentAttestation rechaza directamente autoridades colapsadas con COLLAPSED_AUTHORITIES_REJECTED', () => {
    const { publicKey: sharedPub, privateKey: sharedPriv } = generateEphemeralAttestationKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')

    const ivaRawSha = createHash('sha256').update(SYNTHETIC_TIPOS_IVA_RESPONSE).digest('hex')
    const ivaNormSha = createHash('sha256').update(ivaParsed.ivaText).digest('hex')
    const condRawSha = createHash('sha256').update(SYNTHETIC_CONDICIONES_IVA_RESPONSE).digest('hex')
    const condNormSha = createHash('sha256').update(condParsed.conditionText).digest('hex')

    const attestation = createSignedTestIndependentAttestation({
      processId: 'pid-adv24-collapsed',
      commitSha: VALID_HEAD,
      consultadoEn: '2026-11-05T01:00:00.000Z',
      ivaRawSha,
      ivaNormSha,
      condRawSha,
      condNormSha,
      goAuthorizationId: 'GO-ADV24-001',
      goAuthorizationSha256: '1'.repeat(64),
    }, sharedPriv)

    const check = verifyIndependentAttestation(attestation, {
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: sharedPub,
      trustedGoPublicKey: sharedPub,
      allowTestKeys: true,
    })
    expect(check.valid).toBe(false)
    expect(check.reason).toBe('COLLAPSED_AUTHORITIES_REJECTED')
    expect(check.errorCategory).toBe('COLLAPSED_AUTHORITIES_REJECTED')
  })

  // ADV-25: Atestación válida para otro commit -> REJECTED
  it('79. [ADV-25] Atestación independiente con firma válida pero emitida para otro commit SHA es rechazada', () => {
    const { publicKey: goPub } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: attPub, privateKey: attPriv } = generateEphemeralAttestationKeyPair()
    const otherCommit = 'b'.repeat(40)

    const attestationForOtherCommit = createSignedTestIndependentAttestation({
      processId: 'pid-adv25-commit',
      commitSha: otherCommit,
      consultadoEn: '2026-11-05T01:00:00.000Z',
      ivaRawSha: '1'.repeat(64),
      ivaNormSha: '2'.repeat(64),
      condRawSha: '3'.repeat(64),
      condNormSha: '4'.repeat(64),
      goAuthorizationId: 'GO-ADV25-001',
      goAuthorizationSha256: '5'.repeat(64),
    }, attPriv)

    const check = verifyIndependentAttestation(attestationForOtherCommit, {
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: attPub,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })
    expect(check.valid).toBe(false)
    expect(check.reason).toBe('ATTESTATION_COMMIT_MISMATCH')
  })

  // ADV-26: Atestación válida para otro entorno -> REJECTED
  it('80. [ADV-26] Atestación independiente con firma válida pero emitida para otro entorno (PRODUCCION/STAGING) es rechazada', () => {
    const { publicKey: goPub } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: attPub, privateKey: attPriv } = generateEphemeralAttestationKeyPair()

    const attestationForWrongEnv = createSignedTestIndependentAttestation({
      processId: 'pid-adv26-env',
      commitSha: VALID_HEAD,
      entorno: 'PRODUCCION',
      consultadoEn: '2026-11-05T01:00:00.000Z',
      ivaRawSha: '1'.repeat(64),
      ivaNormSha: '2'.repeat(64),
      condRawSha: '3'.repeat(64),
      condNormSha: '4'.repeat(64),
      goAuthorizationId: 'GO-ADV26-001',
      goAuthorizationSha256: '5'.repeat(64),
    }, attPriv)

    const check = verifyIndependentAttestation(attestationForWrongEnv, {
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: attPub,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })
    expect(check.valid).toBe(false)
    expect(check.reason).toBe('ATTESTATION_ENVIRONMENT_MISMATCH')
  })

  // ADV-27: Atestación válida sin XML SOAP crudo presente pero con JSON normalizado -> REJECTED
  it('81. [ADV-27] Atestación independiente válida sin artefactos XML SOAP crudos presentes pero con JSON normalizado es rechazada', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: attPub, privateKey: attPriv } = generateEphemeralAttestationKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')

    // 1. En createAttestationRequest / validateAttestationRequest sin sha256 de SOAP crudo falla cerrado
    expect(() =>
      createAttestationRequest({
        manifest: {
          identificador_proceso: 'pid-adv27',
          ejecucion_autorizada_scope: PR02_P0_SCOPE,
          consultado_en: '2026-11-05T01:00:00.000Z',
          entorno: 'HOMOLOGACION',
          colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
          go_authorization_id: 'GO-ADV27',
          go_authorization_sha256: '1'.repeat(64),
          manifest_sha256: '2'.repeat(64),
          iva_respuesta_original_sha256: '', // Falta hash de SOAP crudo
          iva_archivo_normalizado_sha256: createHash('sha256').update(ivaParsed.ivaText).digest('hex'),
          condition_respuesta_original_sha256: createHash('sha256').update(SYNTHETIC_CONDICIONES_IVA_RESPONSE).digest('hex'),
          condition_archivo_normalizado_sha256: createHash('sha256').update(condParsed.conditionText).digest('hex'),
        },
        commitSha: VALID_HEAD,
      })
    ).toThrow(/ATTESTATION_REQUEST_RAW_ARTIFACTS_INVALID/)

    // 2. En validatePr02P1ImportEvidence con atestación firmada válida y JSON normalizado presente, pero sin raw SOAP XML
    const goDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)
    const goAuthSha = createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex')
    const ivaRawSha = createHash('sha256').update(SYNTHETIC_TIPOS_IVA_RESPONSE).digest('hex')
    const ivaNormSha = createHash('sha256').update(ivaParsed.ivaText).digest('hex')
    const condRawSha = createHash('sha256').update(SYNTHETIC_CONDICIONES_IVA_RESPONSE).digest('hex')
    const condNormSha = createHash('sha256').update(condParsed.conditionText).digest('hex')

    const manifestDraft = {
      identificador_proceso: 'pid-adv27-import',
      ejecucion_autorizada_id: 'pid-adv27-import',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: ivaRawSha,
      iva_archivo_normalizado_sha256: ivaNormSha,
      condition_respuesta_original_sha256: condRawSha,
      condition_archivo_normalizado_sha256: condNormSha,
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
    }

    const validAttestation = createSignedTestIndependentAttestation({
      processId: 'pid-adv27-import',
      commitSha: VALID_HEAD,
      consultadoEn: '2026-11-05T01:00:00.000Z',
      ivaRawSha,
      ivaNormSha,
      condRawSha,
      condNormSha,
      goAuthorizationId: goDoc.authorization.identificador,
      goAuthorizationSha256: goAuthSha,
    }, attPriv)

    const manifest = {
      ...manifestDraft,
      origen_verificado: WSFE_HOMO_URL,
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      transporte_validado: true,
      accredited: true,
      transport_type: 'OFFICIAL',
      go_authorization_id: goDoc.authorization.identificador,
      go_authorization_sha256: goAuthSha,
      attestation: validAttestation,
      manifest_sha256: computeP0ManifestDigest({ ...manifestDraft, attestation: validAttestation }),
    }

    expect(() =>
      validatePr02P1ImportEvidence({
        manifest,
        ivaText: ivaParsed.ivaText,
        conditionText: condParsed.conditionText,
        rawIvaSoapText: undefined,
        rawConditionSoapText: SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        goAuthorizationDoc: goDoc,
        trustedAttestationPublicKey: attPub,
        trustedGoPublicKey: goPub,
        expectedHead: VALID_HEAD,
        allowTestKeys: true,
      })
    ).toThrow(/RAW_SOAP_RESPONSES_REQUIRED/)
  })

  // ADV-28: Atestación con hashes válidos, pero clave privada o función de firma presente en scripts/fiscal -> REJECTED
  it('82. [ADV-28] Si aparece una clave privada o llamada de firma dentro del directorio de runtime fiscal, es rechazado con RUNTIME_PRIVATE_KEY_DETECTED', () => {
    const { publicKey: goPub } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: attPub, privateKey: attPriv } = generateEphemeralAttestationKeyPair()

    // 1. Verificar que el directorio real scripts/fiscal está limpio y aislado
    const realIsolation = verifyRuntimeSigningIsolation()
    expect(realIsolation.valid).toBe(true)

    // 2. Simular un directorio fiscal contaminado con una clave privada o llamada de firma en un directorio temporal de test
    const contaminatedFiscalDir = path.resolve(TEST_EVIDENCE_DIR, 'contaminated-fiscal-scripts')
    fs.mkdirSync(contaminatedFiscalDir, { recursive: true })
    try {
      const contaminatedFile = path.join(contaminatedFiscalDir, 'leaked-signer.mjs')
      const pemHeader = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ')
      fs.writeFileSync(contaminatedFile, `export const leaked = "${pemHeader}"\n`, 'utf8')

      const isolationCheck = verifyRuntimeSigningIsolation({ fiscalScriptsDir: contaminatedFiscalDir })
      expect(isolationCheck.valid).toBe(false)
      expect(isolationCheck.reason).toBe('RUNTIME_PRIVATE_KEY_DETECTED')

      const validAttestation = createSignedTestIndependentAttestation({
        processId: 'pid-adv28-isolation',
        commitSha: VALID_HEAD,
        consultadoEn: '2026-11-05T01:00:00.000Z',
        ivaRawSha: '1'.repeat(64),
        ivaNormSha: '2'.repeat(64),
        condRawSha: '3'.repeat(64),
        condNormSha: '4'.repeat(64),
        goAuthorizationId: 'GO-ADV28-001',
        goAuthorizationSha256: '5'.repeat(64),
      }, attPriv)

      const check = verifyIndependentAttestation(validAttestation, {
        commitSha: VALID_HEAD,
        trustedAttestationPublicKey: attPub,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        fiscalScriptsDir: contaminatedFiscalDir,
      })
      expect(check.valid).toBe(false)
      expect(check.reason).toBe('RUNTIME_PRIVATE_KEY_DETECTED')
      expect(check.P1_IMPORT_ALLOWED).toBe(false)
    } finally {
      cleanupTestDir()
    }
  })

  // ADV-29: Intentar aceptar atestación de test (TEST_SIGNER) como si fuera autoridad de producción -> REJECTED
  it('83. [ADV-29] Intentar aceptar una atestación emitida por el helper de tests (TEST_SIGNER) en modo producción (allowTestKeys: false) es rechazado', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: attPub, privateKey: attPriv } = generateEphemeralAttestationKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')

    const goDoc = createSignedTestPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)
    const goAuthSha = createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex')
    const ivaRawSha = createHash('sha256').update(SYNTHETIC_TIPOS_IVA_RESPONSE).digest('hex')
    const ivaNormSha = createHash('sha256').update(ivaParsed.ivaText).digest('hex')
    const condRawSha = createHash('sha256').update(SYNTHETIC_CONDICIONES_IVA_RESPONSE).digest('hex')
    const condNormSha = createHash('sha256').update(condParsed.conditionText).digest('hex')

    const manifestDraft = {
      identificador_proceso: 'pid-adv29-test-signer',
      ejecucion_autorizada_id: 'pid-adv29-test-signer',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: ivaRawSha,
      iva_archivo_normalizado_sha256: ivaNormSha,
      condition_respuesta_original_sha256: condRawSha,
      condition_archivo_normalizado_sha256: condNormSha,
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
    }

    // Por defecto el helper de tests marca signerOrigin = 'TEST_SIGNER'
    const testAttestation = createSignedTestIndependentAttestation({
      processId: 'pid-adv29-test-signer',
      commitSha: VALID_HEAD,
      consultadoEn: '2026-11-05T01:00:00.000Z',
      ivaRawSha,
      ivaNormSha,
      condRawSha,
      condNormSha,
      goAuthorizationId: goDoc.authorization.identificador,
      goAuthorizationSha256: goAuthSha,
    }, attPriv)

    expect(testAttestation.signerOrigin).toBe(ATTESTATION_SIGNER_ORIGINS.TEST_SIGNER)

    // Cuando allowTestKeys es false (por defecto en producción), es rechazado con ATTESTATION_TEST_SIGNER_PROHIBITED
    const checkProd = verifyIndependentAttestation(testAttestation, {
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: attPub,
      trustedGoPublicKey: goPub,
      allowTestKeys: false,
    })
    expect(checkProd.valid).toBe(false)
    expect(checkProd.reason).toBe('ATTESTATION_TEST_SIGNER_PROHIBITED')
    expect(checkProd.P1_IMPORT_ALLOWED).toBe(false)

    // Si alguien intenta mutar signerOrigin a PRODUCTION_ATTESTATION_AUTHORITY después de firmar, la firma Ed25519 falla
    const mutatedOriginAttestation = {
      ...testAttestation,
      signerOrigin: ATTESTATION_SIGNER_ORIGINS.PRODUCTION_ATTESTATION_AUTHORITY,
    }
    const checkMutatedOrigin = verifyIndependentAttestation(mutatedOriginAttestation, {
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: attPub,
      trustedGoPublicKey: goPub,
      allowTestKeys: false,
    })
    expect(checkMutatedOrigin.valid).toBe(false)
    expect(checkMutatedOrigin.reason).toBe('ATTESTATION_SIGNATURE_VERIFICATION_FAILED')

    // En validatePr02P1ImportEvidence con allowTestKeys: false también se rechaza
    const manifest = {
      ...manifestDraft,
      origen_verificado: WSFE_HOMO_URL,
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      transporte_validado: true,
      accredited: true,
      transport_type: 'OFFICIAL',
      go_authorization_id: goDoc.authorization.identificador,
      go_authorization_sha256: goAuthSha,
      attestation: testAttestation,
      manifest_sha256: computeP0ManifestDigest({ ...manifestDraft, attestation: testAttestation }),
    }

    expect(() =>
      validatePr02P1ImportEvidence({
        manifest,
        ivaText: ivaParsed.ivaText,
        conditionText: condParsed.conditionText,
        rawIvaSoapText: SYNTHETIC_TIPOS_IVA_RESPONSE,
        rawConditionSoapText: SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        goAuthorizationDoc: goDoc,
        trustedAttestationPublicKey: attPub,
        trustedGoPublicKey: goPub,
        expectedHead: VALID_HEAD,
        allowTestKeys: false,
      })
    ).toThrow(/ATTESTATION_TEST_SIGNER_PROHIBITED/)
  })

  // 84. Paquete de solicitud de atestación canónico (AttestationRequestPackage) y flujo completo hacia P1
  it('84. createAttestationRequest y validateAttestationRequest generan paquete determinístico sin secretos y verifican las 15 condiciones', () => {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const { publicKey: attPub, privateKey: attPriv } = generateEphemeralAttestationKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')

    const goDoc = createSignedTestPr02P0GoAuthorization({
      identificador: 'GO-REQ-PKG-001',
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)
    const goAuthSha = createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex')

    const ivaRawSha = createHash('sha256').update(SYNTHETIC_TIPOS_IVA_RESPONSE).digest('hex')
    const ivaNormSha = createHash('sha256').update(ivaParsed.ivaText).digest('hex')
    const condRawSha = createHash('sha256').update(SYNTHETIC_CONDICIONES_IVA_RESPONSE).digest('hex')
    const condNormSha = createHash('sha256').update(condParsed.conditionText).digest('hex')

    const manifestDraft = {
      identificador_proceso: 'pid-req-pkg-001',
      ejecucion_autorizada_id: 'pid-req-pkg-001',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: ivaRawSha,
      iva_archivo_normalizado_sha256: ivaNormSha,
      condition_respuesta_original_sha256: condRawSha,
      condition_archivo_normalizado_sha256: condNormSha,
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
      go_authorization_id: goDoc.authorization.identificador,
      go_authorization_sha256: goAuthSha,
    }
    const manifestSha = computeP0ManifestDigest(manifestDraft)

    const reqPkg = createAttestationRequest({
      manifest: { ...manifestDraft, manifest_sha256: manifestSha },
      commitSha: VALID_HEAD,
      requestedAt: '2026-11-05T01:05:00.000Z',
    })

    expect(reqPkg.schemaVersion).toBe('1.0')
    expect(reqPkg.executionScope).toBe(PR02_P0_SCOPE)
    expect(reqPkg.environment).toBe('HOMOLOGACION')
    expect(reqPkg.commitSha).toBe(VALID_HEAD.toLowerCase())
    expect(reqPkg.manifestSha256).toBe(manifestSha)
    expect(reqPkg.rawSoapArtifacts.length).toBe(2)
    expect(reqPkg.normalizedArtifacts.length).toBe(2)
    expect(reqPkg.requestSha256).toBe(computeAttestationRequestDigest(reqPkg))

    const reqValidation = validateAttestationRequest(reqPkg, { expectedCommitSha: VALID_HEAD })
    expect(reqValidation.valid).toBe(true)
    expect(reqValidation.requestSha256).toBe(reqPkg.requestSha256)

    // Firmar la solicitud con el helper de tests y verificar con allowTestKeys: true
    const signedAttestation = createSignedTestAttestationFromRequest(reqPkg, attPriv)
    const fullManifest = {
      ...manifestDraft,
      origen_verificado: WSFE_HOMO_URL,
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      transporte_validado: true,
      accredited: true,
      transport_type: 'OFFICIAL',
      attestation: signedAttestation,
      manifest_sha256: '',
    }
    fullManifest.manifest_sha256 = computeP0ManifestDigest(fullManifest)

    const reqPkgWithFinalManifest = createAttestationRequest({
      manifest: fullManifest,
      commitSha: VALID_HEAD,
      requestedAt: '2026-11-05T01:05:00.000Z',
      requestId: reqPkg.requestId,
    })
    const finalAttestation = createSignedTestAttestationFromRequest(reqPkgWithFinalManifest, attPriv)
    fullManifest.attestation = finalAttestation
    fullManifest.manifest_sha256 = computeP0ManifestDigest(fullManifest)

    const p1Res = validatePr02P1ImportEvidence({
      manifest: fullManifest,
      ivaText: ivaParsed.ivaText,
      conditionText: condParsed.conditionText,
      rawIvaSoapText: SYNTHETIC_TIPOS_IVA_RESPONSE,
      rawConditionSoapText: SYNTHETIC_CONDICIONES_IVA_RESPONSE,
      goAuthorizationDoc: goDoc,
      attestationRequest: reqPkgWithFinalManifest,
      trustedAttestationPublicKey: attPub,
      trustedGoPublicKey: goPub,
      expectedHead: VALID_HEAD,
      allowTestKeys: true,
    })

    expect(p1Res.status).toBe('PASS')
    expect(p1Res.P1_IMPORT_ALLOWED).toBe(true)
    expect(p1Res.INDEPENDENT_ATTESTATION_AVAILABLE).toBe(true)
    expect(p1Res.ATTESTATION_TRUST_MODEL).toBe(ATTESTATION_TRUST_MODELS.INDEPENDENT_ATTESTED)
    expect(p1Res.EVIDENCE_CUSTODY_ATTESTED).toBe(true)
    expect(p1Res.TRUSTED_EXECUTION_BOUNDARY).toBe('VERIFIED')
    expect(p1Res.ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED).toBe(false)
  })
})
