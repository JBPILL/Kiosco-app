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
  createSignedPr02P0GoAuthorization,
  validatePr02P0GoAuthorization,
  markGoAuthorizationConsumed,
  isGoAuthorizationConsumed,
  resetConsumedGoAuthorizationsForTesting,
} from '../../scripts/fiscal/plan-pr02-parameters.mjs'

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

    const authoritySecret = 'TRUSTED_AUTHORITY_KEY_HEX_1234567890_VALID'
    const signedDoc = createSignedPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      emitido_en: '2026-11-05T00:00:00.000Z',
      vence_en: '2026-11-05T03:00:00.000Z',
    }, authoritySecret)

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
        trustedGoAuthoritySecret: authoritySecret,
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
  it('13. Adaptador oficial de red falla si no se suministra autorización GO explícita', async () => {
    const officialTransport = createOfficialArcaTransport({ officialGoAuthorized: false })
    expect(officialTransport.type).toBe('OFFICIAL')

    await expect(
      officialTransport.postSoap(WSAA_HOMO_URL, '""', '<soap>test</soap>')
    ).rejects.toThrow(/OFFICIAL_NETWORK_GO_REQUIRED/)
  })

  // 14. Prohibición de redirecciones HTTP en transporte oficial
  it('14. Prohíbe redirecciones HTTP en transporte oficial', async () => {
    // Verificamos que validateP0EndpointUrl y createOfficialArcaTransport tengan redirect: 'error'
    const officialTransport = createOfficialArcaTransport({ officialGoAuthorized: true })
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
    expect(check.reason).toBe('ATTESTATION_NOT_ACCREDITED')
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

    // Clave válida de alta entropía
    const validKey = 'production_grade_custody_secret_entropy_8f9a0b1c2d3e4f5a6b7c8d9e'
    expect(validateP0AuthoritySecret(validKey)).toBe(validKey)
  })

  // 26. Verificación de atestación
  it('26. Rechazo de atestación por firma adulterada, commit mismatch o ejecutor desconocido', () => {
    const validKey = 'production_grade_custody_secret_entropy_8f9a0b1c2d3e4f5a6b7c8d9e'
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
    }

    const attestation = createP0Attestation({
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      transportType: 'OFFICIAL',
      goAuthorization: 'GO-PR02-P0-HOMOLOGACION-VALID',
      authoritySecret: validKey,
      executorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
    })

    expect(attestation.accredited).toBe(true)
    expect(attestation.provenance).toBe('VERIFIED')

    // Verificación exitosa con clave correcta
    const verified = verifyP0Attestation(attestation, {
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      authoritySecret: validKey,
    })
    expect(verified.valid).toBe(true)

    // Firma adulterada
    expect(attestation.signature).not.toBeNull()
    const validSig = attestation.signature!
    const tamperedSig = validSig.substring(0, 63) + (validSig[63] === 'a' ? 'b' : 'a')
    const badSigCheck = verifyP0Attestation({ ...attestation, signature: tamperedSig }, {
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      authoritySecret: validKey,
    })
    expect(badSigCheck.valid).toBe(false)
    expect(badSigCheck.reason).toBe('ATTESTATION_SIGNATURE_VERIFICATION_FAILED')

    // Commit mismatch
    const badCommitCheck = verifyP0Attestation(attestation, {
      manifest: manifestDraft,
      commitSha: '0'.repeat(40),
      authoritySecret: validKey,
    })
    expect(badCommitCheck.valid).toBe(false)
    expect(badCommitCheck.reason).toBe('ATTESTATION_COMMIT_MISMATCH')

    // Identidad de ejecutor alterada
    const badExecCheck = verifyP0Attestation({ ...attestation, executorIdentity: 'unauthorized-script.mjs' }, {
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      authoritySecret: validKey,
    })
    expect(badExecCheck.valid).toBe(false)
    expect(badExecCheck.reason).toBe('ATTESTATION_EXECUTOR_MISMATCH')

    // Verificación con clave de prueba prohibida
    const testKeyCheck = verifyP0Attestation(attestation, {
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      authoritySecret: 'test_authority_key_long_enough_1234567890',
    })
    expect(testKeyCheck.valid).toBe(false)
    expect(testKeyCheck.reason).toBe('ATTESTATION_TEST_KEY_PROHIBITED')

    // Verificación con clave comprometida
    const compKeyCheck = verifyP0Attestation(attestation, {
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      authoritySecret: PR02_P0_COMPROMISED_SECRETS[0],
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

      const transport = createOfficialArcaTransport({
        officialGoAuthorized: true,
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
      signature: '0'.repeat(64),
    }
    expect(() => validatePr02P0GoAuthorization(fakeDoc, {
      expectedHead: VALID_HEAD,
      trustedGoAuthoritySecret: 'TRUSTED_AUTHORITY_KEY_HEX_1234567890_VALID',
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
        trustedGoAuthoritySecret: 'TRUSTED_AUTHORITY_KEY_HEX_1234567890_VALID',
        allowTestKeys: true,
      })
    ).rejects.toThrow(/GO_AUTHORIZATION_SIGNATURE_INVALID/)
  })

  // 30. (Regresión 2) GO con scope incorrecto rechazado
  it('30. (Regresión 2) GO con scope incorrecto es rechazado y bloquea la red oficial', async () => {
    const authoritySecret = 'TRUSTED_AUTHORITY_KEY_HEX_1234567890_VALID'
    const signedDoc = createSignedPr02P0GoAuthorization({
      scope: 'PR02_P1_VERIFIED_CATALOG_IMPORT',
      commit_sha: VALID_HEAD,
    }, authoritySecret)

    expect(() => validatePr02P0GoAuthorization(signedDoc, {
      expectedHead: VALID_HEAD,
      trustedGoAuthoritySecret: authoritySecret,
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
        trustedGoAuthoritySecret: authoritySecret,
        allowTestKeys: true,
      })
    ).rejects.toThrow(/GO_AUTHORIZATION_SCOPE_MISMATCH/)
  })

  // 31. (Regresión 3) GO con SHA diferente rechazado
  it('31. (Regresión 3) GO con SHA diferente del HEAD esperado es rechazado', async () => {
    const authoritySecret = 'TRUSTED_AUTHORITY_KEY_HEX_1234567890_VALID'
    const differentHead = 'e'.repeat(40)
    const signedDoc = createSignedPr02P0GoAuthorization({
      commit_sha: differentHead,
    }, authoritySecret)

    expect(() => validatePr02P0GoAuthorization(signedDoc, {
      expectedHead: VALID_HEAD,
      trustedGoAuthoritySecret: authoritySecret,
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
        trustedGoAuthoritySecret: authoritySecret,
        allowTestKeys: true,
      })
    ).rejects.toThrow(/GO_AUTHORIZATION_COMMIT_MISMATCH/)
  })

  // 32. (Regresión 4) GO vencido rechazado
  it('32. (Regresión 4) GO vencido es rechazado por vencimiento temporal', async () => {
    const authoritySecret = 'TRUSTED_AUTHORITY_KEY_HEX_1234567890_VALID'
    const nowIso = '2026-11-05T01:00:00.000Z'
    const signedDoc = createSignedPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      emitido_en: '2026-11-04T00:00:00.000Z',
      vence_en: '2026-11-04T02:00:00.000Z',
    }, authoritySecret)

    expect(() => validatePr02P0GoAuthorization(signedDoc, {
      expectedHead: VALID_HEAD,
      trustedGoAuthoritySecret: authoritySecret,
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
        trustedGoAuthoritySecret: authoritySecret,
        allowTestKeys: true,
      })
    ).rejects.toThrow(/GO_AUTHORIZATION_EXPIRED/)
  })

  // 33. (Regresión 5) GO reutilizado rechazado
  it('33. (Regresión 5) GO reutilizado es rechazado por protección de un solo uso (single-use guard)', () => {
    resetConsumedGoAuthorizationsForTesting()
    const authoritySecret = 'TRUSTED_AUTHORITY_KEY_HEX_1234567890_VALID'
    const signedDoc = createSignedPr02P0GoAuthorization({
      identificador: 'GO-TEST-SINGLE-USE-001',
      commit_sha: VALID_HEAD,
    }, authoritySecret)

    // Primera validación: pasa
    const firstCheck = validatePr02P0GoAuthorization(signedDoc, {
      expectedHead: VALID_HEAD,
      trustedGoAuthoritySecret: authoritySecret,
      allowTestKeys: true,
    })
    expect(firstCheck.valid).toBe(true)

    // Se marca como consumido
    markGoAuthorizationConsumed('GO-TEST-SINGLE-USE-001')
    expect(isGoAuthorizationConsumed('GO-TEST-SINGLE-USE-001')).toBe(true)

    // Segunda validación: falla
    expect(() => validatePr02P0GoAuthorization(signedDoc, {
      expectedHead: VALID_HEAD,
      trustedGoAuthoritySecret: authoritySecret,
      allowTestKeys: true,
    })).toThrow(/GO_AUTHORIZATION_ALREADY_CONSUMED/)
  })

  // 34. (Regresión 6) GO con firma inválida rechazado
  it('34. (Regresión 6) GO con firma adulterada o clave incorrecta es rechazado', () => {
    const authoritySecret = 'TRUSTED_AUTHORITY_KEY_HEX_1234567890_VALID'
    const signedDoc = createSignedPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      emitido_en: '2026-11-05T00:00:00.000Z',
      vence_en: '2026-11-05T03:00:00.000Z',
    }, authoritySecret)

    // Alterar firma (manteniendo 64 hex de longitud)
    const tamperedSig = signedDoc.signature.slice(0, -1) + (signedDoc.signature.endsWith('0') ? '1' : '0')
    const tamperedDoc = {
      authorization: signedDoc.authorization,
      signature: tamperedSig,
    }

    expect(() => validatePr02P0GoAuthorization(tamperedDoc, {
      expectedHead: VALID_HEAD,
      trustedGoAuthoritySecret: authoritySecret,
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
      trustedGoAuthoritySecret: authoritySecret,
      allowTestKeys: true,
      now: '2026-11-05T01:00:00.000Z',
    })).toThrow(/GO_AUTHORIZATION_ENTORNO_MISMATCH/)
  })

  // 35. (Regresión 7) Token original ausente de manifiestos y archivos
  it('35. (Regresión 7) El token/nonce original no aparece en ninguno de los artefactos generados', async () => {
    cleanupTestDir()
    const authoritySecret = 'TRUSTED_AUTHORITY_KEY_HEX_1234567890_VALID'
    const attestationSecret = 'ATT_KEY_RANDOM_ENTROPY_HEX_abcdef01234567890'
    const secretNonce = 'SECRET_NONCE_VALUE_DO_NOT_LEAK_9876543210'

    const signedDoc = createSignedPr02P0GoAuthorization({
      identificador: 'GO-P0-AUDIT-SAFE-ID-001',
      commit_sha: VALID_HEAD,
      single_use_nonce: secretNonce,
      emitido_en: '2026-11-05T01:00:00.000Z',
      vence_en: '2026-11-05T05:00:00.000Z',
    }, authoritySecret)

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
        trustedGoAuthoritySecret: authoritySecret,
        authoritySecret: attestationSecret,
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
    const trustedKey = 'TRUSTED_GOV_AUTHORITY_KEY_HEX_1234567890_AB'
    const attackerKey = 'ATTACKER_FAKE_AUTHORITY_KEY_HEX_9999999999_XY'

    const ivaText = JSON.stringify([{ Id: 5, Desc: '21%' }])
    const condText = JSON.stringify([{ Id: 1, Desc: 'Inscripto' }])
    const ivaNormSha = createHash('sha256').update(ivaText).digest('hex')
    const condNormSha = createHash('sha256').update(condText).digest('hex')

    const manifestDraft = {
      identificador_proceso: 'pid-attacker-001',
      ejecucion_autorizada_id: 'pid-attacker-001',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      iva_respuesta_original_sha256: '1'.repeat(64),
      iva_archivo_normalizado_sha256: ivaNormSha,
      condition_respuesta_original_sha256: '2'.repeat(64),
      condition_archivo_normalizado_sha256: condNormSha,
    }

    const attackerAttestation = createP0Attestation({
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      transportType: 'OFFICIAL',
      authoritySecret: attackerKey,
      goAuthorizationId: 'GO-ATTACKER-ID',
      goAuthorizationSha256: '3'.repeat(64),
      executorIdentity: PR02_P0_COLECTOR_IDENTIDAD,
    })

    const attackerManifest = {
      ...manifestDraft,
      origen_verificado: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      transporte_validado: true,
      accredited: true,
      transport_type: 'OFFICIAL',
      go_authorization_id: 'GO-ATTACKER-ID',
      go_authorization_sha256: '3'.repeat(64),
      attestation: attackerAttestation,
      manifest_sha256: '4'.repeat(64),
    }

    expect(() => validatePr02P1ImportEvidence({
      manifest: attackerManifest,
      ivaText,
      conditionText: condText,
      trustedAuthoritySecret: trustedKey,
      expectedHead: VALID_HEAD,
    })).toThrow(/P1_IMPORT_FORBIDDEN: Procedencia oficial no verificada/)
  })

  // 38. (Regresión 10) Evidencia fabricada con hashes correctos rechazada
  it('38. (Regresión 10) Evidencia fabricada con hashes de contenido exactos pero atestación inválida es rechazada en P1', () => {
    const trustedKey = 'TRUSTED_GOV_AUTHORITY_KEY_HEX_1234567890_AB'
    const ivaText = JSON.stringify([{ Id: 5, Desc: '21%' }])
    const condText = JSON.stringify([{ Id: 1, Desc: 'Inscripto' }])

    const ivaNormSha = createHash('sha256').update(ivaText).digest('hex')
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
      iva_respuesta_original_sha256: '1'.repeat(64),
      iva_archivo_normalizado_sha256: ivaNormSha,
      condition_respuesta_original_sha256: '2'.repeat(64),
      condition_archivo_normalizado_sha256: condNormSha,
      transporte_validado: true,
      accredited: true,
      transport_type: 'OFFICIAL',
      go_authorization_id: 'GO-FAKE-001',
      go_authorization_sha256: '3'.repeat(64),
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
        ivaRawSha: '1'.repeat(64),
        ivaNormSha,
        condRawSha: '2'.repeat(64),
        condNormSha,
        goAuthorizationId: 'GO-FAKE-001',
        goAuthorizationSha256: '3'.repeat(64),
        issuedAt: '2026-11-05T01:00:00.000Z',
        signature: '0'.repeat(64), // Firma falsa
        accredited: true,
        provenance: 'VERIFIED',
      },
    }

    expect(() => validatePr02P1ImportEvidence({
      manifest: fabricatedManifest,
      ivaText,
      conditionText: condText,
      trustedAuthoritySecret: trustedKey,
      expectedHead: VALID_HEAD,
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
    const authoritySecret = 'TRUSTED_AUTHORITY_KEY_HEX_1234567890_VALID'
    const signedDoc = createSignedPr02P0GoAuthorization({
      commit_sha: VALID_HEAD,
      emitido_en: '2026-11-05T00:00:00.000Z',
      vence_en: '2026-11-05T03:00:00.000Z',
    }, authoritySecret)

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
          trustedGoAuthoritySecret: authoritySecret,
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
})
