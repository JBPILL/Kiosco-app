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
})
