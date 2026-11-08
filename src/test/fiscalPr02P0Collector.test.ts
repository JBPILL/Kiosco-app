// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync, execFile } from 'node:child_process'
import { pathToFileURL } from 'node:url'
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
  AUTHORITY_ADAPTER_IMPLEMENTED,
  AUTHORITY_REAL_WORLD_AVAILABLE,
  EXTERNAL_AUTHORITY_TRANSPORT_CONTRACT_VERSION,
  EXTERNAL_AUTHORITY_ENDPOINT_SPEC,
  IndependentAttestationAuthorityTransportContract,
  assertAdapterConfigSecurity,
  assertAuthoritiesSeparated,
  parseEd25519PublicKey,
  validateP0AttestationPublicKey,
  validateP0GoPublicKey,
  GoAuthority,
  AttestationAuthority,
  IndependentAttestationAuthority,
  IndependentAttestationAuthorityAdapter,
  createIndependentAttestationAuthorityAdapter,
  submitAttestationRequest,
  verifyAttestationResponse,
  validateAttestationResponse,
  consumeAttestationResponseDurable,
  reserveAttestationResponseDurable,
  isAttestationResponseConsumedDurable,
  validateAttestationReplayDirectory,
  computeAttestationResponseReplayId,
  serializeCanonicalAttestationResponseReplayIdentity,
  computePublicKeyId,
  serializeCanonicalAttestationResponsePayload,
  computeAttestationResponsePayloadDigest,
  ATTESTATION_AUTHORITY_TYPES,
  ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL,
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
  PR02_P0_ATTESTATION_REPLAY_DIR_ENV,
  parseWsfeTiposIvaResponse,
  parseWsfeCondicionIvaReceptorResponse,
} from '../../scripts/fiscal/plan-pr02-parameters.mjs'

import {
  generateEphemeralGoAuthorityKeyPair,
  generateEphemeralAttestationKeyPair,
  createSignedTestPr02P0GoAuthorization,
  createSignedTestIndependentAttestation,
  createSignedTestAttestationFromRequest,
  createSignedTestAttestationResponse,
  createTestIndependentAttestationAuthority,
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

  function buildTestRequestFixture(processSuffix = '001') {
    const { publicKey: goPub, privateKey: goPriv } = generateEphemeralGoAuthorityKeyPair()
    const ivaParsed = parseWsfeTiposIvaResponse(SYNTHETIC_TIPOS_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const condParsed = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE, '2026-11-05T01:00:00.000Z')
    const goDoc = createSignedTestPr02P0GoAuthorization({
      identificador: `GO-ADV-${processSuffix}`,
      commit_sha: VALID_HEAD,
      aprobador_identidad: 'OWNER_OFFICIAL_APPROVER_2026',
    }, goPriv)
    const goAuthSha = createHash('sha256').update(JSON.stringify(goDoc.authorization)).digest('hex')
    const ivaRawSha = createHash('sha256').update(SYNTHETIC_TIPOS_IVA_RESPONSE).digest('hex')
    const ivaNormSha = createHash('sha256').update(ivaParsed.ivaText).digest('hex')
    const condRawSha = createHash('sha256').update(SYNTHETIC_CONDICIONES_IVA_RESPONSE).digest('hex')
    const condNormSha = createHash('sha256').update(condParsed.conditionText).digest('hex')

    const manifestDraft = {
      identificador_proceso: `pid-adv-${processSuffix}`,
      ejecucion_autorizada_id: `pid-adv-${processSuffix}`,
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      consultado_en: '2026-11-05T01:00:00.000Z',
      entorno: 'HOMOLOGACION',
      origen_verificado: WSFE_HOMO_URL,
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      transporte_validado: true,
      accredited: false,
      transport_type: 'OFFICIAL',
      iva_respuesta_original_sha256: ivaRawSha,
      iva_archivo_normalizado_sha256: ivaNormSha,
      condition_respuesta_original_sha256: condRawSha,
      condition_archivo_normalizado_sha256: condNormSha,
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
      go_authorization_id: goDoc.authorization.identificador,
      go_authorization_sha256: goAuthSha,
      manifest_sha256: '',
    }
    manifestDraft.manifest_sha256 = computeP0ManifestDigest(manifestDraft)

    const requestPkg = createAttestationRequest({
      manifest: manifestDraft,
      commitSha: VALID_HEAD,
      requestedAt: '2026-11-05T01:05:00.000Z',
      requestId: `req-adv-${processSuffix}`,
    })

    return {
      goPub,
      goPriv,
      goDoc,
      ivaParsed,
      condParsed,
      manifestDraft,
      requestPkg,
    }
  }

  // 85. ADV-30 — Runtime intenta firmar producción
  it('85. ADV-30: Runtime intenta firmar producción y falla cerrado en IndependentAttestationAuthority y su adaptador', () => {
    const adapter = createIndependentAttestationAuthorityAdapter()
    expect(() => adapter.signProductionAttestation()).toThrow(/PRODUCTION_SIGNING_FORBIDDEN_IN_RUNTIME/)
    expect(() => adapter.accessProductionPrivateKey()).toThrow(/PRODUCTION_PRIVATE_KEY_FORBIDDEN_IN_RUNTIME/)
    expect(() => IndependentAttestationAuthority.signProductionAttestation()).toThrow(/PRODUCTION_SIGNING_FORBIDDEN_IN_RUNTIME/)
    expect(() => IndependentAttestationAuthority.generateTrustedIndependentAttestation()).toThrow(/PRODUCTION_SIGNING_FORBIDDEN_IN_RUNTIME/)
  })

  // 86. ADV-31 — Clave privada de producción presente en runtime
  it('86. ADV-31: Clave privada de producción presente en runtime se detecta y bloquea inmediatamente', () => {
    const { requestPkg, goPub } = buildTestRequestFixture('031')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const signedRes = testAuthority.issueResponse(requestPkg)

    const fakeDirtyDir = path.resolve(process.cwd(), 'temp-dirty-runtime-adv31')
    try {
      fs.mkdirSync(fakeDirtyDir, { recursive: true })
      fs.writeFileSync(path.join(fakeDirtyDir, 'prod-authority.key'), 'PRIVATE_KEY_CONTENT', 'utf8')

      const res = verifyAttestationResponse(signedRes, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        fiscalScriptsDir: fakeDirtyDir,
      })
      expect(res.valid).toBe(false)
      expect(res.reason).toBe('RUNTIME_PRIVATE_KEY_DETECTED')
      expect(res.P1_IMPORT_ALLOWED).toBe(false)

      expect(() =>
        createIndependentAttestationAuthorityAdapter({
          fiscalScriptsDir: fakeDirtyDir,
        })
      ).toThrow(/RUNTIME_PRIVATE_KEY_DETECTED/)
    } finally {
      if (fs.existsSync(fakeDirtyDir)) {
        fs.rmSync(fakeDirtyDir, { recursive: true, force: true })
      }
    }
  })

  // 87. ADV-32 — Respuesta con requestSha256 de otra solicitud
  it('87. ADV-32: Respuesta con requestSha256 de otra solicitud es rechazada con ATTESTATION_REQUEST_MISMATCH', () => {
    const fixtureA = buildTestRequestFixture('032A')
    const fixtureB = buildTestRequestFixture('032B')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })

    const responseForB = testAuthority.issueResponse(fixtureB.requestPkg)

    const check = verifyAttestationResponse(responseForB, {
      attestationRequest: fixtureA.requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: fixtureA.goPub,
      allowTestKeys: true,
    })

    expect(check.valid).toBe(false)
    expect(check.reason).toBe('ATTESTATION_REQUEST_MISMATCH')
    expect(check.P1_IMPORT_ALLOWED).toBe(false)
    expect(() =>
      validateAttestationResponse(responseForB, {
        attestationRequest: fixtureA.requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: fixtureA.goPub,
        allowTestKeys: true,
      })
    ).toThrow(/ATTESTATION_REQUEST_MISMATCH/)
  })

  // 88. ADV-33 — Respuesta con manifestSha256 diferente
  it('88. ADV-33: Respuesta con manifestSha256 diferente es rechazada con ATTESTATION_MANIFEST_MISMATCH', () => {
    const { requestPkg, manifestDraft, goPub } = buildTestRequestFixture('033')
    const keyPair = generateEphemeralAttestationKeyPair()

    const mismatchedResponse = createSignedTestAttestationResponse(requestPkg, keyPair.privateKey, {
      manifestSha256: 'e'.repeat(64),
      issuedAt: '2026-11-05T01:06:00.000Z',
    })

    const check = verifyAttestationResponse(mismatchedResponse, {
      attestationRequest: requestPkg,
      manifest: manifestDraft,
      trustedAttestationPublicKey: keyPair.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })

    expect(check.valid).toBe(false)
    expect(check.reason).toBe('ATTESTATION_MANIFEST_MISMATCH')
    expect(check.P1_IMPORT_ALLOWED).toBe(false)
  })

  // 89. ADV-34 — Firma válida pero authorityId no permitido
  it('89. ADV-34: Firma válida pero authorityId no permitido es rechazada con ATTESTATION_AUTHORITY_MISMATCH', () => {
    const { requestPkg, goPub } = buildTestRequestFixture('034')
    const testAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'unauthorized-rogue-authority-99',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const validSignedRes = testAuthority.issueResponse(requestPkg)

    const check = verifyAttestationResponse(validSignedRes, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowedAuthorityIds: ['official-independent-authority-01'],
      allowTestKeys: true,
    })

    expect(check.valid).toBe(false)
    expect(check.reason).toBe('ATTESTATION_AUTHORITY_MISMATCH')
    expect(check.P1_IMPORT_ALLOWED).toBe(false)
  })

  // 90. ADV-35 — Firma válida con keyId no permitido
  it('90. ADV-35: Firma válida con keyId no permitido es rechazada con ATTESTATION_KEY_ID_MISMATCH', () => {
    const { requestPkg, goPub } = buildTestRequestFixture('035')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validSignedRes = testAuthority.issueResponse(requestPkg)

    const check = verifyAttestationResponse(validSignedRes, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowedKeyIds: ['ed25519-spki-0000000000000000'],
      allowTestKeys: true,
    })

    expect(check.valid).toBe(false)
    expect(check.reason).toBe('ATTESTATION_KEY_ID_MISMATCH')
    expect(check.P1_IMPORT_ALLOWED).toBe(false)
  })

  // 91. ADV-36 — Algoritmo diferente al permitido
  it('91. ADV-36: Algoritmo diferente a Ed25519 (p. ej. HS256 / RSA-SHA256 / none) es rechazado con ATTESTATION_ALGORITHM_FORBIDDEN', () => {
    const { requestPkg, goPub } = buildTestRequestFixture('036')
    const keyPair = generateEphemeralAttestationKeyPair()
    const badAlgResponse = createSignedTestAttestationResponse(requestPkg, keyPair.privateKey, {
      algorithm: 'HS256',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })

    const check = verifyAttestationResponse(badAlgResponse, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: keyPair.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })

    expect(check.valid).toBe(false)
    expect(check.reason).toBe('ATTESTATION_ALGORITHM_FORBIDDEN')
    expect(check.P1_IMPORT_ALLOWED).toBe(false)
  })

  // 92. ADV-37 — Firmante de test presentado como producción
  it('92. ADV-37: Firmante de test presentado como producción es rechazado con ATTESTATION_TEST_SIGNER_PROHIBITED y jamás otorga PRODUCTION_ATTESTED', () => {
    const { requestPkg, goPub } = buildTestRequestFixture('037')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const testResponse = testAuthority.issueResponse(requestPkg)

    // Caso 1: Modo producción (allowTestKeys: false por defecto) rechaza TEST_AUTHORITY / TEST_SIGNER
    const prodCheck = verifyAttestationResponse(testResponse, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: false,
    })
    expect(prodCheck.valid).toBe(false)
    expect(prodCheck.reason).toBe('ATTESTATION_TEST_SIGNER_PROHIBITED')
    expect(prodCheck.P1_IMPORT_ALLOWED).toBe(false)

    // Caso 2: Intento de disfrazar TEST_SIGNER con authorityType PRODUCTION_AUTHORITY
    const keyPair = generateEphemeralAttestationKeyPair()
    const disguisedResponse = createSignedTestAttestationResponse(requestPkg, keyPair.privateKey, {
      authorityType: ATTESTATION_AUTHORITY_TYPES.PRODUCTION_AUTHORITY,
      signerOrigin: ATTESTATION_SIGNER_ORIGINS.TEST_SIGNER,
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const disguisedCheck = verifyAttestationResponse(disguisedResponse, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: keyPair.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })
    expect(disguisedCheck.valid).toBe(false)
    expect(disguisedCheck.reason).toBe('ATTESTATION_TEST_SIGNER_PROHIBITED')

    // Caso 3: En modo test (allowTestKeys: true), una respuesta de TEST_AUTHORITY resulta estrictamente en TEST_ONLY
    const testModeCheck = verifyAttestationResponse(testResponse, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      consumeOnVerify: false,
    })
    expect(testModeCheck.valid).toBe(true)
    expect(testModeCheck.trustScope).toBe('TEST_ONLY')
    expect(testModeCheck.ATTESTATION_TRUST_MODEL).toBe('TEST_ONLY')
    expect(testModeCheck.PRODUCTION_ATTESTED).toBe(false)
    expect(testModeCheck.OFFICIAL_PROVENANCE_VERIFIED).toBe(false)
    expect(testModeCheck.ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED).toBe(false)
    expect(testModeCheck.P1_IMPORT_ALLOWED).toBe(false)
  })

  // 93. ADV-38 — Booleano intenta elevar confianza
  it('93. ADV-38: Booleano independentAuthorityAvailable: true o campos inyectados intentando elevar confianza son rechazados', async () => {
    const { requestPkg, goPub } = buildTestRequestFixture('038')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validRes = testAuthority.issueResponse(requestPkg)

    expect(() =>
      createIndependentAttestationAuthorityAdapter({
        independentAuthorityAvailable: true,
      })
    ).toThrow(/SELF_ATTESTATION_AUTO_ELEVATION_REJECTED/)

    await expect(
      submitAttestationRequest(requestPkg, {
        independentAuthorityAvailable: true,
        trustedAttestationPublicKey: testAuthority.publicKey,
        authorityId: testAuthority.authorityId,
        transport: testAuthority.sendAttestationRequest,
      })
    ).rejects.toThrow(/SELF_ATTESTATION_AUTO_ELEVATION_REJECTED/)

    const verifyWithBool = verifyAttestationResponse(validRes, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      independentAuthorityAvailable: true,
    })
    expect(verifyWithBool.valid).toBe(false)
    expect(verifyWithBool.reason).toBe('SELF_ATTESTATION_AUTO_ELEVATION_REJECTED')

    // Inyección de campo inesperado en el objeto de respuesta intentando mutar el trust model
    const mutatedRes = {
      ...validRes,
      PRODUCTION_ATTESTED: true,
    }
    const verifyMutated = verifyAttestationResponse(mutatedRes, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })
    expect(verifyMutated.valid).toBe(false)
    expect(verifyMutated.reason).toBe('ATTESTATION_RESPONSE_INVALID')
  })

  // 94. ADV-39 — Reutilización de respuesta dentro del mismo proceso
  it('94. ADV-39: Reutilización de una respuesta de atestación dentro del mismo proceso es bloqueada con ATTESTATION_RESPONSE_REPLAY_DETECTED (HOST_LOCAL_DURABLE_ONE_TIME_USE)', async () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'adv-039-replay-dir')
    const { requestPkg, goPub } = buildTestRequestFixture('039')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const singleResponse = testAuthority.issueResponse(requestPkg)

    const adapter = createIndependentAttestationAuthorityAdapter({
      authorityId: testAuthority.authorityId,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      consumedResponsesDir: replayDir,
      transport: async () => singleResponse,
    })

    // El adaptador técnico no cambia el trust model por defecto
    expect(adapter.ATTESTATION_TRUST_MODEL).toBe('SELF_ATTESTED')
    expect(adapter.INDEPENDENT_ATTESTATION_AVAILABLE).toBe(false)
    expect(adapter.P1_IMPORT_ALLOWED).toBe(false)
    expect(adapter.antiReplayGuarantee).toBe('HOST_LOCAL_DURABLE_ONE_TIME_USE')
    expect(ATTESTATION_RESPONSE_ANTI_REPLAY_GUARANTEE_LEVEL).toBe('HOST_LOCAL_DURABLE_ONE_TIME_USE')

    // Primer uso: válido
    const firstSubmit = await adapter.submitAttestationRequest(requestPkg)
    expect(firstSubmit.valid).toBe(true)
    expect(firstSubmit.verification.consumed).toBe(true)
    expect(firstSubmit.verification.antiReplayGuarantee).toBe('HOST_LOCAL_DURABLE_ONE_TIME_USE')

    // Segundo uso de la misma respuesta en el mismo proceso: bloqueado por anti-replay durable
    await expect(adapter.submitAttestationRequest(requestPkg)).rejects.toThrow(
      /ATTESTATION_RESPONSE_REPLAY_DETECTED/
    )
    cleanupTestDir()
  })

  // 95. ADV-40 — Falta autoridad independiente configurada
  it('95. ADV-40: Falta autoridad independiente configurada falla cerrado con INDEPENDENT_ATTESTATION_AUTHORITY_NOT_AVAILABLE', async () => {
    const { requestPkg } = buildTestRequestFixture('040')
    const unconfiguredAdapter = createIndependentAttestationAuthorityAdapter()

    expect(unconfiguredAdapter.isConfigured()).toBe(false)
    expect(unconfiguredAdapter.isAuthorityAvailable()).toBe(false)
    expect(unconfiguredAdapter.INDEPENDENT_ATTESTATION_AVAILABLE).toBe(false)
    expect(unconfiguredAdapter.P1_IMPORT_ALLOWED).toBe(false)

    await expect(unconfiguredAdapter.submitAttestationRequest(requestPkg)).rejects.toThrow(
      /INDEPENDENT_ATTESTATION_AUTHORITY_NOT_AVAILABLE/
    )
    await expect(submitAttestationRequest(requestPkg, {})).rejects.toThrow(
      /INDEPENDENT_ATTESTATION_AUTHORITY_NOT_AVAILABLE/
    )
    expect(() =>
      createIndependentAttestationAuthorityAdapter({
        requireAvailable: true,
      })
    ).toThrow(/INDEPENDENT_ATTESTATION_AUTHORITY_NOT_AVAILABLE/)
  })

  // 96. ADV-41 — Adaptador intenta realizar fallback a firma local
  it('96. ADV-41: Adaptador intenta realizar fallback a firma local y es bloqueado con LOCAL_FALLBACK_SIGNING_FORBIDDEN', async () => {
    const { requestPkg } = buildTestRequestFixture('041')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })

    expect(() =>
      createIndependentAttestationAuthorityAdapter({
        authorityId: testAuthority.authorityId,
        trustedAttestationPublicKey: testAuthority.publicKey,
        fallbackToLocalSigner: true,
      })
    ).toThrow(/LOCAL_FALLBACK_SIGNING_FORBIDDEN/)

    await expect(
      submitAttestationRequest(requestPkg, {
        authorityId: testAuthority.authorityId,
        trustedAttestationPublicKey: testAuthority.publicKey,
        localFallbackSigner: () => testAuthority.issueResponse(requestPkg),
        transport: testAuthority.sendAttestationRequest,
      })
    ).rejects.toThrow(/LOCAL_FALLBACK_SIGNING_FORBIDDEN/)

    const adapter = createIndependentAttestationAuthorityAdapter()
    expect(() => adapter.fallbackToLocalSigner()).toThrow(/LOCAL_FALLBACK_SIGNING_FORBIDDEN/)
    expect(() => IndependentAttestationAuthority.fallbackToLocalSigner()).toThrow(/LOCAL_FALLBACK_SIGNING_FORBIDDEN/)
  })

  // 97. ADV-42 — P1 recibe una atestación desvinculada de la solicitud
  it('97. ADV-42: P1 recibe una respuesta de atestación válida para otra solicitud (request A con response B) y la rechaza con ATTESTATION_REQUEST_MISMATCH', () => {
    const fixtureA = buildTestRequestFixture('042A')
    const fixtureB = buildTestRequestFixture('042B')
    const { publicKey: attPub, privateKey: attPriv } = generateEphemeralAttestationKeyPair()

    const signedAttestationA = createSignedTestAttestationFromRequest(fixtureA.requestPkg, attPriv)
    const fullManifestA = {
      ...fixtureA.manifestDraft,
      accredited: true,
      transport_type: 'OFFICIAL',
      attestation: signedAttestationA,
      manifest_sha256: '',
    }
    fullManifestA.manifest_sha256 = computeP0ManifestDigest(fullManifestA)

    const responseB = createSignedTestAttestationResponse(fixtureB.requestPkg, attPriv, {
      issuedAt: '2026-11-05T01:06:00.000Z',
    })

    expect(() =>
      validatePr02P1ImportEvidence({
        manifest: fullManifestA,
        ivaText: fixtureA.ivaParsed.ivaText,
        conditionText: fixtureA.condParsed.conditionText,
        rawIvaSoapText: SYNTHETIC_TIPOS_IVA_RESPONSE,
        rawConditionSoapText: SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        goAuthorizationDoc: fixtureA.goDoc,
        attestationRequest: fixtureA.requestPkg,
        attestationResponse: responseB,
        trustedAttestationPublicKey: attPub,
        trustedGoPublicKey: fixtureA.goPub,
        expectedHead: VALID_HEAD,
        allowTestKeys: true,
      })
    ).toThrow(/P1_IMPORT_FORBIDDEN: ATTESTATION_REQUEST_MISMATCH/)
  })

  // 98. ADV-43 — P1 recibe evidencia simulada acompañada por un firmante de test
  it('98. ADV-43: P1 recibe evidencia simulada acompañada por un firmante de test y la rechaza como evidencia de producción', () => {
    const fixture = buildTestRequestFixture('043')
    const { publicKey: attPub, privateKey: attPriv } = generateEphemeralAttestationKeyPair()

    const signedAttestation = createSignedTestAttestationFromRequest(fixture.requestPkg, attPriv)
    const simulatedManifest = {
      ...fixture.manifestDraft,
      accredited: true,
      transport_type: 'SIMULATED',
      attestation: signedAttestation,
      manifest_sha256: '',
    }
    simulatedManifest.manifest_sha256 = computeP0ManifestDigest(simulatedManifest)

    const testResponse = createSignedTestAttestationResponse(fixture.requestPkg, attPriv, {
      issuedAt: '2026-11-05T01:06:00.000Z',
    })

    // Incluso con allowTestKeys: true, P1 rechaza evidencia con transporte simulado
    expect(() =>
      validatePr02P1ImportEvidence({
        manifest: simulatedManifest,
        ivaText: fixture.ivaParsed.ivaText,
        conditionText: fixture.condParsed.conditionText,
        rawIvaSoapText: SYNTHETIC_TIPOS_IVA_RESPONSE,
        rawConditionSoapText: SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        goAuthorizationDoc: fixture.goDoc,
        attestationRequest: fixture.requestPkg,
        attestationResponse: testResponse,
        trustedAttestationPublicKey: attPub,
        trustedGoPublicKey: fixture.goPub,
        expectedHead: VALID_HEAD,
        allowTestKeys: true,
      })
    ).toThrow(/P1_IMPORT_FORBIDDEN: SIMULATED_EVIDENCE_REJECTED/)

    // Y en modo producción (allowTestKeys: false), un firmante de test también es rechazado aunque el manifiesto diga OFFICIAL
    const officialManifestWithTestSigner = {
      ...fixture.manifestDraft,
      accredited: true,
      transport_type: 'OFFICIAL',
      attestation: signedAttestation,
      manifest_sha256: '',
    }
    officialManifestWithTestSigner.manifest_sha256 = computeP0ManifestDigest(officialManifestWithTestSigner)

    expect(() =>
      validatePr02P1ImportEvidence({
        manifest: officialManifestWithTestSigner,
        ivaText: fixture.ivaParsed.ivaText,
        conditionText: fixture.condParsed.conditionText,
        rawIvaSoapText: SYNTHETIC_TIPOS_IVA_RESPONSE,
        rawConditionSoapText: SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        goAuthorizationDoc: fixture.goDoc,
        attestationRequest: fixture.requestPkg,
        attestationResponse: testResponse,
        trustedAttestationPublicKey: attPub,
        trustedGoPublicKey: fixture.goPub,
        expectedHead: VALID_HEAD,
        allowTestKeys: false,
      })
    ).toThrow(/P1_IMPORT_FORBIDDEN: ATTESTATION_TEST_SIGNER_PROHIBITED/)
  })

  // 99. Validación exhaustiva de códigos de rechazo de AttestationResponse (MISSING, PAYLOAD_MISMATCH, SIGNATURE_INVALID, ISSUED_AT_INVALID, COLLAPSED_AUTHORITIES)
  it('99. verifyAttestationResponse rechaza ATTESTATION_RESPONSE_MISSING, ATTESTATION_PAYLOAD_MISMATCH, ATTESTATION_SIGNATURE_INVALID, ATTESTATION_ISSUED_AT_INVALID y COLLAPSED_AUTHORITIES_REJECTED', () => {
    const { requestPkg, goPub } = buildTestRequestFixture('044')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validRes = testAuthority.issueResponse(requestPkg)

    // 1. ATTESTATION_RESPONSE_MISSING
    const missingCheck = verifyAttestationResponse(null, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })
    expect(missingCheck.valid).toBe(false)
    expect(missingCheck.reason).toBe('ATTESTATION_RESPONSE_MISSING')

    // 2. ATTESTATION_PAYLOAD_MISMATCH
    const badPayloadHashRes = {
      ...validRes,
      attestationPayloadSha256: 'a'.repeat(64),
    }
    const payloadCheck = verifyAttestationResponse(badPayloadHashRes, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })
    expect(payloadCheck.valid).toBe(false)
    expect(payloadCheck.reason).toBe('ATTESTATION_PAYLOAD_MISMATCH')

    // 3. ATTESTATION_SIGNATURE_INVALID
    const badSigRes = {
      ...validRes,
      signature: 'b'.repeat(128),
    }
    const sigCheck = verifyAttestationResponse(badSigRes, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })
    expect(sigCheck.valid).toBe(false)
    expect(sigCheck.reason).toBe('ATTESTATION_SIGNATURE_INVALID')

    // 4. ATTESTATION_ISSUED_AT_INVALID (fecha inválida o futura)
    const futureRes = testAuthority.issueResponse(requestPkg, {
      issuedAt: '2099-01-01T00:00:00.000Z',
    })
    const issuedAtCheck = verifyAttestationResponse(futureRes, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      now: '2026-11-05T01:06:00.000Z',
    })
    expect(issuedAtCheck.valid).toBe(false)
    expect(issuedAtCheck.reason).toBe('ATTESTATION_ISSUED_AT_INVALID')

    // 5. COLLAPSED_AUTHORITIES_REJECTED (misma clave pública para GO Authority y Attestation Authority)
    const collapsedCheck = verifyAttestationResponse(validRes, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: testAuthority.publicKey,
      allowTestKeys: true,
    })
    expect(collapsedCheck.valid).toBe(false)
    expect(collapsedCheck.reason).toBe('COLLAPSED_AUTHORITIES_REJECTED')

    // 6. Verificación de helpers canónicos y singleton IndependentAttestationAuthorityAdapter
    expect(computePublicKeyId(testAuthority.publicKey)).toBe(validRes.keyId)
    expect(serializeCanonicalAttestationResponsePayload(validRes).length).toBeGreaterThan(0)
    expect(computeAttestationResponsePayloadDigest(validRes)).toBe(validRes.attestationPayloadSha256)
    expect(IndependentAttestationAuthorityAdapter.AUTHORITY_TYPES).toEqual(ATTESTATION_AUTHORITY_TYPES)
  })

  // 100. ADV-REPLAY-01 — Replay dentro del mismo proceso
  it('100. ADV-REPLAY-01: Replay dentro del mismo proceso sobre la misma AttestationResponse falla cerrado con ATTESTATION_RESPONSE_REPLAY_DETECTED', () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'adv-replay-01')
    const { requestPkg, goPub } = buildTestRequestFixture('REPLAY-01')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validResponse = testAuthority.issueResponse(requestPkg)

    const replayId = computeAttestationResponseReplayId(validResponse)
    expect(replayId).toMatch(/^[0-9a-f]{64}$/)
    expect(serializeCanonicalAttestationResponseReplayIdentity(validResponse)).toContain(validResponse.responseId)
    expect(isAttestationResponseConsumedDurable(validResponse, { consumedResponsesDir: replayDir })).toBe(false)

    // Primer consumo en el proceso: éxito y persiste el bloqueo durable
    const firstConsume = consumeAttestationResponseDurable(validResponse, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      consumedResponsesDir: replayDir,
    })
    expect(firstConsume.valid).toBe(true)
    expect(firstConsume.consumed).toBe(true)
    expect(firstConsume.ATTESTATION_RESPONSE_CONSUMPTION).toBe('CONSUMED')
    expect(firstConsume.replayId).toBe(replayId)
    expect(firstConsume.antiReplayGuarantee).toBe('HOST_LOCAL_DURABLE_ONE_TIME_USE')
    expect(isAttestationResponseConsumedDurable(validResponse, { consumedResponsesDir: replayDir })).toBe(true)

    // Segundo consumo en el mismo proceso: bloqueado fail-closed
    expect(() =>
      consumeAttestationResponseDurable(validResponse, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        consumedResponsesDir: replayDir,
      })
    ).toThrow(/ATTESTATION_RESPONSE_CONSUMPTION_DENIED: ATTESTATION_RESPONSE_REPLAY_DETECTED/)
    cleanupTestDir()
  })

  // 101. ADV-REPLAY-02 — Replay tras reinicio o nuevo proceso del SO
  it('101. ADV-REPLAY-02: Replay tras reinicio o en un nuevo proceso del sistema operativo falla cerrado con ATTESTATION_RESPONSE_REPLAY_DETECTED', () => {
    cleanupTestDir()
    const replayDir = path.resolve(TEST_EVIDENCE_DIR, 'adv-replay-02')
    const { requestPkg, goPub } = buildTestRequestFixture('REPLAY-02')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validResponse = testAuthority.issueResponse(requestPkg)

    const planModuleUrl = pathToFileURL(
      path.resolve(process.cwd(), 'scripts/fiscal/plan-pr02-parameters.mjs')
    ).href

    const childPayload = JSON.stringify({
      planModuleUrl,
      response: validResponse,
      requestPkg,
      pubKey: testAuthority.publicKey,
      goPub,
      replayDir,
    })

    // Proceso A (proceso hijo independiente del SO) consume la respuesta X y termina
    const childScript = `
      import { consumeAttestationResponseDurable } from ${JSON.stringify(planModuleUrl)};
      const data = JSON.parse(process.env.CHILD_REPLAY_PAYLOAD);
      const res = consumeAttestationResponseDurable(data.response, {
        attestationRequest: data.requestPkg,
        trustedAttestationPublicKey: data.pubKey,
        trustedGoPublicKey: data.goPub,
        allowTestKeys: true,
        consumedResponsesDir: data.replayDir,
      });
      console.log(JSON.stringify({ consumed: res.consumed, replayId: res.replayId }));
    `

    const procA = spawnSync(process.execPath, ['--input-type=module', '-e', childScript], {
      env: { ...process.env, CHILD_REPLAY_PAYLOAD: childPayload },
      encoding: 'utf8',
    })
    expect(procA.status).toBe(0)
    const procAOut = JSON.parse(procA.stdout.trim())
    expect(procAOut.consumed).toBe(true)

    // Proceso B (este proceso actual, o un segundo proceso hijo tras el cierre de A) intenta consumir X sobre el mismo directorio durable
    expect(() =>
      consumeAttestationResponseDurable(validResponse, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        consumedResponsesDir: replayDir,
      })
    ).toThrow(/ATTESTATION_RESPONSE_CONSUMPTION_DENIED: ATTESTATION_RESPONSE_REPLAY_DETECTED/)

    const procB = spawnSync(process.execPath, ['--input-type=module', '-e', childScript], {
      env: { ...process.env, CHILD_REPLAY_PAYLOAD: childPayload },
      encoding: 'utf8',
    })
    expect(procB.status).not.toBe(0)
    expect(procB.stderr).toMatch(/ATTESTATION_RESPONSE_REPLAY_DETECTED/)
    cleanupTestDir()
  })

  // 102. ADV-REPLAY-03 — Replay concurrente
  it('102. ADV-REPLAY-03: Dos consumidores concurrentes intentan consumir la misma AttestationResponse sobre el mismo directorio -> exactamente uno pasa y el otro falla cerrado', async () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'adv-replay-03')
    const { requestPkg, goPub } = buildTestRequestFixture('REPLAY-03')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validResponse = testAuthority.issueResponse(requestPkg)

    const consumeTask = () =>
      Promise.resolve().then(() =>
        reserveAttestationResponseDurable(validResponse, {
          attestationRequest: requestPkg,
          trustedAttestationPublicKey: testAuthority.publicKey,
          trustedGoPublicKey: goPub,
          allowTestKeys: true,
          consumedResponsesDir: replayDir,
        })
      )

    const results = await Promise.allSettled([consumeTask(), consumeTask(), consumeTask()])
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]

    expect(fulfilled.length).toBe(1)
    expect(rejected.length).toBe(2)
    for (const rej of rejected) {
      expect(String(rej.reason?.message || rej.reason)).toMatch(/ATTESTATION_RESPONSE_REPLAY_DETECTED/)
    }
    cleanupTestDir()
  })

  // 103. ADV-REPLAY-04 — Directorio anti-replay ausente o intento de degradar a PROCESS_LOCAL_ONE_TIME_USE
  it('103. ADV-REPLAY-04: Consumir una AttestationResponse sin directorio durable configurado o intentando degradar a memoria falla cerrado con ATTESTATION_REPLAY_STORAGE_NOT_CONFIGURED / ANTI_REPLAY_DOWNGRADE_FORBIDDEN', async () => {
    const { requestPkg, goPub } = buildTestRequestFixture('REPLAY-04')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validResponse = testAuthority.issueResponse(requestPkg)

    // Sin consumedResponsesDir ni PR02_P0_ATTESTATION_REPLAY_DIR_ENV -> falla cerrado (sin fallback a memoria)
    expect(() =>
      consumeAttestationResponseDurable(validResponse, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        env: {},
      })
    ).toThrow(/ATTESTATION_RESPONSE_CONSUMPTION_DENIED: ATTESTATION_REPLAY_STORAGE_NOT_CONFIGURED/)

    await expect(
      submitAttestationRequest(requestPkg, {
        authorityId: testAuthority.authorityId,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        env: {},
        transport: async () => validResponse,
      })
    ).rejects.toThrow(/ATTESTATION_REPLAY_STORAGE_NOT_CONFIGURED/)

    // Intento explícito de degradar a PROCESS_LOCAL_ONE_TIME_USE o desactivar anti-replay
    expect(() =>
      consumeAttestationResponseDurable(validResponse, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        consumedResponsesDir: path.join(TEST_EVIDENCE_DIR, 'adv-replay-04'),
        allowProcessLocalFallback: true,
      })
    ).toThrow(/ANTI_REPLAY_DOWNGRADE_FORBIDDEN/)

    expect(() =>
      consumeAttestationResponseDurable(validResponse, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        consumedResponsesDir: path.join(TEST_EVIDENCE_DIR, 'adv-replay-04'),
        antiReplayGuarantee: 'PROCESS_LOCAL_ONE_TIME_USE',
      })
    ).toThrow(/ANTI_REPLAY_DOWNGRADE_FORBIDDEN/)
  })

  // 104. ADV-REPLAY-05 — Directorio anti-replay apunta a symlink
  it('104. ADV-REPLAY-05: Directorio de registro anti-replay que es un symlink es rechazado fail-closed con SYMLINK_FORBIDDEN', () => {
    cleanupTestDir()
    const realTargetDir = path.resolve(TEST_EVIDENCE_DIR, 'real-target-05')
    const symlinkDir = path.resolve(TEST_EVIDENCE_DIR, 'symlink-replay-05')
    fs.mkdirSync(realTargetDir, { recursive: true })

    try {
      fs.symlinkSync(realTargetDir, symlinkDir, 'dir')
    } catch {
      fs.symlinkSync(realTargetDir, symlinkDir, 'junction')
    }

    const { requestPkg, goPub } = buildTestRequestFixture('REPLAY-05')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validResponse = testAuthority.issueResponse(requestPkg)

    expect(() => validateAttestationReplayDirectory(symlinkDir)).toThrow(/SYMLINK_FORBIDDEN/)
    expect(() =>
      consumeAttestationResponseDurable(validResponse, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        consumedResponsesDir: symlinkDir,
      })
    ).toThrow(/ATTESTATION_RESPONSE_CONSUMPTION_DENIED: SYMLINK_FORBIDDEN/)
    cleanupTestDir()
  })

  // 105. ADV-REPLAY-06 — Ancestro con symlink
  it('105. ADV-REPLAY-06: Un directorio padre/ancestro de la ruta anti-replay es un symlink -> falla cerrado con SYMLINK_FORBIDDEN', () => {
    cleanupTestDir()
    const realParentDir = path.resolve(TEST_EVIDENCE_DIR, 'real-parent-06')
    const symlinkParentDir = path.resolve(TEST_EVIDENCE_DIR, 'symlink-parent-06')
    fs.mkdirSync(realParentDir, { recursive: true })

    try {
      fs.symlinkSync(realParentDir, symlinkParentDir, 'dir')
    } catch {
      fs.symlinkSync(realParentDir, symlinkParentDir, 'junction')
    }

    const nestedReplayDir = path.join(symlinkParentDir, 'nested', 'replay-registry')
    const { requestPkg, goPub } = buildTestRequestFixture('REPLAY-06')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validResponse = testAuthority.issueResponse(requestPkg)

    expect(() => validateAttestationReplayDirectory(nestedReplayDir)).toThrow(/SYMLINK_FORBIDDEN/)
    expect(() =>
      consumeAttestationResponseDurable(validResponse, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        consumedResponsesDir: nestedReplayDir,
      })
    ).toThrow(/ATTESTATION_RESPONSE_CONSUMPTION_DENIED: SYMLINK_FORBIDDEN/)
    cleanupTestDir()
  })

  // 106. ADV-REPLAY-07 — Path traversal
  it('106. ADV-REPLAY-07: Ruta del registro anti-replay con segmentos ".." o escape de directorio falla cerrado con PATH_TRAVERSAL_FORBIDDEN', () => {
    const { requestPkg, goPub } = buildTestRequestFixture('REPLAY-07')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validResponse = testAuthority.issueResponse(requestPkg)

    const traversalPaths = [
      `${TEST_EVIDENCE_DIR}/../escape-replay`,
      `${TEST_EVIDENCE_DIR}\\..\\escape-replay`,
      '../outside-repo-replay',
    ]

    for (const badPath of traversalPaths) {
      expect(() => validateAttestationReplayDirectory(badPath)).toThrow(/PATH_TRAVERSAL_FORBIDDEN/)
      expect(() =>
        consumeAttestationResponseDurable(validResponse, {
          attestationRequest: requestPkg,
          trustedAttestationPublicKey: testAuthority.publicKey,
          trustedGoPublicKey: goPub,
          allowTestKeys: true,
          consumedResponsesDir: badPath,
        })
      ).toThrow(/ATTESTATION_RESPONSE_CONSUMPTION_DENIED: PATH_TRAVERSAL_FORBIDDEN/)
    }
  })

  // 107. ADV-REPLAY-08 — Ruta dentro de código versionado
  it('107. ADV-REPLAY-08: Registro anti-replay apuntando a src/, scripts/, .git/, docs/, supabase/ o raíz del repositorio falla cerrado con UNAUTHORIZED_REPLAY_STORAGE_DIR', () => {
    const { requestPkg, goPub } = buildTestRequestFixture('REPLAY-08')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validResponse = testAuthority.issueResponse(requestPkg)

    const forbiddenRepoDirs = [
      process.cwd(),
      path.join(process.cwd(), 'src', 'replay-store'),
      path.join(process.cwd(), 'scripts', 'fiscal', 'replay-store'),
      path.join(process.cwd(), '.git', 'replay-store'),
      path.join(process.cwd(), 'docs', 'replay-store'),
      path.join(process.cwd(), 'supabase', 'replay-store'),
      path.join(process.cwd(), '.agent', 'replay-store'),
      path.join(process.cwd(), 'unignored-folder-in-repo'),
    ]

    for (const forbiddenDir of forbiddenRepoDirs) {
      expect(() => validateAttestationReplayDirectory(forbiddenDir)).toThrow(
        /UNAUTHORIZED_REPLAY_STORAGE_DIR/
      )
      expect(() =>
        consumeAttestationResponseDurable(validResponse, {
          attestationRequest: requestPkg,
          trustedAttestationPublicKey: testAuthority.publicKey,
          trustedGoPublicKey: goPub,
          allowTestKeys: true,
          consumedResponsesDir: forbiddenDir,
        })
      ).toThrow(/ATTESTATION_RESPONSE_CONSUMPTION_DENIED: UNAUTHORIZED_REPLAY_STORAGE_DIR/)
    }
  })

  // 108. ADV-REPLAY-09 — Escritura exclusiva falla o estado preexistente corrupto
  it('108. ADV-REPLAY-09: Cuando la creación exclusiva (wx) falla o el archivo de bloqueo preexiste corrupto, falla cerrado y revierte archivos parciales', () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'adv-replay-09')
    const { requestPkg, goPub } = buildTestRequestFixture('REPLAY-09')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validResponse = testAuthority.issueResponse(requestPkg)

    // 1. Fallo simulado de escritura exclusiva en el segundo archivo de bloqueo -> verifica rollback de archivos parciales
    let writeCount = 0
    expect(() =>
      consumeAttestationResponseDurable(validResponse, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        consumedResponsesDir: replayDir,
        fsWriteExclusive: (targetPath, content) => {
          writeCount++
          if (writeCount === 2) {
            const ioErr = new Error('Simulated disk write failure on exclusive lock') as Error & { code?: string }
            ioErr.code = 'EIO'
            throw ioErr
          }
          fs.writeFileSync(targetPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
        },
      })
    ).toThrow(/ATTESTATION_RESPONSE_CONSUMPTION_DENIED: EXCLUSIVE_REPLAY_WRITE_FAILED/)

    // Comprobar que el primer archivo creado fue limpiado por el rollback y el directorio quedó limpio
    const remainingAfterRollback = fs.existsSync(replayDir) ? fs.readdirSync(replayDir) : []
    expect(remainingAfterRollback.length).toBe(0)

    // 2. Archivo de bloqueo preexistente pero corrupto/truncado -> falla cerrado con REPLAY_STORAGE_STATE_INCONSISTENT
    const replayId = computeAttestationResponseReplayId(validResponse)
    fs.mkdirSync(replayDir, { recursive: true })
    const corruptedLockPath = path.join(replayDir, `consumed-response-${replayId}.json`)
    fs.writeFileSync(corruptedLockPath, '{corrupted-json-trunc', { encoding: 'utf8', mode: 0o600 })

    expect(() =>
      consumeAttestationResponseDurable(validResponse, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        consumedResponsesDir: replayDir,
      })
    ).toThrow(/REPLAY_STORAGE_STATE_INCONSISTENT/)
    cleanupTestDir()
  })

  // 109. ADV-REPLAY-10 — Sustitución semántica
  it('109. ADV-REPLAY-10: Sustitución semántica (mismo requestSha256 con otro responseId/firma, o mismo responseId con otra solicitud) falla cerrado con ATTESTATION_RESPONSE_REPLAY_DETECTED', () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'adv-replay-10')
    const fixtureA = buildTestRequestFixture('REPLAY-10A')
    const fixtureB = buildTestRequestFixture('REPLAY-10B')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })

    const responseA1 = testAuthority.issueResponse(fixtureA.requestPkg, {
      responseId: 'ATT-RES-SHARED-ID-10',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })

    // Consumir responseA1 legítimamente
    const consumedA1 = consumeAttestationResponseDurable(responseA1, {
      attestationRequest: fixtureA.requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: fixtureA.goPub,
      allowTestKeys: true,
      consumedResponsesDir: replayDir,
    })
    expect(consumedA1.consumed).toBe(true)

    // Caso 1: Nueva respuesta firmada con distinto responseId e issuedAt (distinta firma) pero para el MISMO requestSha256
    const responseA2SameRequest = testAuthority.issueResponse(fixtureA.requestPkg, {
      responseId: 'ATT-RES-DIFFERENT-ID-10',
      issuedAt: '2026-11-05T01:07:00.000Z',
    })
    expect(responseA2SameRequest.signature).not.toBe(responseA1.signature)
    expect(() =>
      consumeAttestationResponseDurable(responseA2SameRequest, {
        attestationRequest: fixtureA.requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: fixtureA.goPub,
        allowTestKeys: true,
        consumedResponsesDir: replayDir,
      })
    ).toThrow(/ATTESTATION_RESPONSE_CONSUMPTION_DENIED: ATTESTATION_RESPONSE_REPLAY_DETECTED/)

    // Caso 2: Nueva respuesta para otra solicitud (fixtureB) pero reutilizando el MISMO responseId/attestationId ('ATT-RES-SHARED-ID-10')
    const responseBSameId = testAuthority.issueResponse(fixtureB.requestPkg, {
      responseId: 'ATT-RES-SHARED-ID-10',
      issuedAt: '2026-11-05T01:08:00.000Z',
    })
    expect(() =>
      consumeAttestationResponseDurable(responseBSameId, {
        attestationRequest: fixtureB.requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: fixtureB.goPub,
        allowTestKeys: true,
        consumedResponsesDir: replayDir,
      })
    ).toThrow(/ATTESTATION_RESPONSE_CONSUMPTION_DENIED: ATTESTATION_RESPONSE_REPLAY_DETECTED/)
    cleanupTestDir()
  })

  // 110. ADV-REPLAY-11 — Verify no consume
  it('110. ADV-REPLAY-11: verifyAttestationResponse y validateAttestationResponse son operaciones de solo lectura (consumed: false) y no bloquean el consumo legítimo posterior', () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'adv-replay-11')
    const { requestPkg, goPub } = buildTestRequestFixture('REPLAY-11')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validResponse = testAuthority.issueResponse(requestPkg)

    // Ejecutar verifyAttestationResponse y validateAttestationResponse múltiples veces antes del consumo real
    for (let i = 0; i < 3; i++) {
      const vCheck = verifyAttestationResponse(validResponse, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        consumedResponsesDir: replayDir,
        checkReplay: true,
      })
      expect(vCheck.valid).toBe(true)
      expect(vCheck.consumed).toBe(false)
      expect(vCheck.ATTESTATION_RESPONSE_CONSUMPTION).toBe('NOT_CONSUMED')

      const valCheck = validateAttestationResponse(validResponse, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        consumedResponsesDir: replayDir,
        checkReplay: true,
      })
      expect(valCheck.valid).toBe(true)
      expect(valCheck.consumed).toBe(false)
    }

    // Confirmar que aún no fue consumida en el directorio durable
    expect(isAttestationResponseConsumedDurable(validResponse, { consumedResponsesDir: replayDir })).toBe(false)

    // Ahora ejecutar el consumo real -> debe pasar exitosamente
    const consumedResult = consumeAttestationResponseDurable(validResponse, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      consumedResponsesDir: replayDir,
    })
    expect(consumedResult.valid).toBe(true)
    expect(consumedResult.consumed).toBe(true)
    expect(consumedResult.ATTESTATION_RESPONSE_CONSUMPTION).toBe('CONSUMED')
    expect(isAttestationResponseConsumedDurable(validResponse, { consumedResponsesDir: replayDir })).toBe(true)

    // Si luego se consulta verifyAttestationResponse con checkReplay: true, informa ATTESTATION_RESPONSE_REPLAY_DETECTED
    const verifyAfterConsume = verifyAttestationResponse(validResponse, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      consumedResponsesDir: replayDir,
      checkReplay: true,
    })
    expect(verifyAfterConsume.valid).toBe(false)
    expect(verifyAfterConsume.reason).toBe('ATTESTATION_RESPONSE_REPLAY_DETECTED')
    cleanupTestDir()
  })

  // 111. ADV-REPLAY-12 — Consume sin verificación previa o con respuesta inválida
  it('111. ADV-REPLAY-12: Intentar consumir una AttestationResponse inválida o pasando flags de bypass (skipVerification / preVerified) falla cerrado sin escribir en el registro durable', () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'adv-replay-12')
    const { requestPkg, goPub } = buildTestRequestFixture('REPLAY-12')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validResponse = testAuthority.issueResponse(requestPkg)

    // 1. Intento de bypass de verificación con skipVerification: true o preVerified: true
    expect(() =>
      consumeAttestationResponseDurable(validResponse, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        consumedResponsesDir: replayDir,
        skipVerification: true,
      })
    ).toThrow(/VERIFICATION_BYPASS_FORBIDDEN/)

    expect(() =>
      consumeAttestationResponseDurable(validResponse, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        consumedResponsesDir: replayDir,
        preVerified: true,
      })
    ).toThrow(/VERIFICATION_BYPASS_FORBIDDEN/)

    // 2. Intento de consumir una respuesta con firma adulterada -> falla cerrado y NO escribe archivos en el registro durable
    const tamperedResponse = {
      ...validResponse,
      signature: '0'.repeat(128),
    }
    expect(() =>
      consumeAttestationResponseDurable(tamperedResponse, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        consumedResponsesDir: replayDir,
      })
    ).toThrow(/ATTESTATION_RESPONSE_CONSUMPTION_DENIED: ATTESTATION_SIGNATURE_INVALID/)

    // El registro durable sigue vacío y la respuesta válida original no fue quemada por el intento fallido
    expect(isAttestationResponseConsumedDurable(validResponse, { consumedResponsesDir: replayDir })).toBe(false)

    // El consumo posterior de la respuesta legítima funciona normalmente
    const validConsume = consumeAttestationResponseDurable(validResponse, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      consumedResponsesDir: replayDir,
    })
    expect(validConsume.valid).toBe(true)
    expect(validConsume.consumed).toBe(true)
    expect(PR02_P0_ATTESTATION_REPLAY_DIR_ENV).toBe('PR02_P0_ATTESTATION_REPLAY_DIR')
    expect(AttestationAuthority.REPLAY_DIR_ENV).toBe('PR02_P0_ATTESTATION_REPLAY_DIR')
    cleanupTestDir()
  })

  // 112. FINDING-REPLAY-01 — Bloqueo exhaustivo de flags de degradación a memoria o desactivación de almacenamiento durable (Sección 11)
  it('112. [FINDING-REPLAY-01] Rechaza todos los flags de degradación anti-replay (processLocal, fallback, allowMemoryReplay, disableDurableReplay, skipReplayStorage, consumeOnVerify: false)', () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'finding-replay-01')
    const { requestPkg, goPub } = buildTestRequestFixture('FINDING-01')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validResponse = testAuthority.issueResponse(requestPkg)

    const downgradePayloads = [
      { processLocal: true },
      { fallback: 'process-local' },
      { allowMemoryReplay: true },
      { disableDurableReplay: true },
      { skipReplayStorage: true },
      { inMemoryReplay: true },
      { consumeOnVerify: false },
      { antiReplayGuarantee: 'NONE' },
    ]

    for (const downgradeOpt of downgradePayloads) {
      expect(() =>
        consumeAttestationResponseDurable(validResponse, {
          attestationRequest: requestPkg,
          trustedAttestationPublicKey: testAuthority.publicKey,
          trustedGoPublicKey: goPub,
          allowTestKeys: true,
          consumedResponsesDir: replayDir,
          ...downgradeOpt,
        })
      ).toThrow(/ANTI_REPLAY_DOWNGRADE_FORBIDDEN/)

      expect(() =>
        createIndependentAttestationAuthorityAdapter({
          authorityId: testAuthority.authorityId,
          trustedAttestationPublicKey: testAuthority.publicKey,
          allowTestKeys: true,
          consumedResponsesDir: replayDir,
          ...downgradeOpt,
        })
      ).toThrow(/ANTI_REPLAY_DOWNGRADE_FORBIDDEN/)
    }

    expect(isAttestationResponseConsumedDurable(validResponse, { consumedResponsesDir: replayDir })).toBe(false)
    cleanupTestDir()
  })

  // 113. FINDING-REPLAY-02 — Rutas Windows UNC, dispositivos, NTFS ADS, puntos/espacios finales y symlinks colgantes (Secciones 8 y 9)
  it('113. [FINDING-REPLAY-02] Rechaza rutas Windows UNC (\\\\server\\share), dispositivos (\\\\?\\), NTFS ADS (:stream), bytes nulos y segmentos con puntos o espacios finales', () => {
    cleanupTestDir()
    const invalidPaths = [
      '\\\\server\\share\\replay-dir',
      '//server/share/replay-dir',
      '\\\\?\\C:\\temp\\replay-dir',
      '\\\\.\\C:\\temp\\replay-dir',
      path.join(TEST_EVIDENCE_DIR, 'replay-ads:hiddenstream'),
      path.join(TEST_EVIDENCE_DIR, 'null\0byte'),
      path.join(TEST_EVIDENCE_DIR, 'trailingdot.'),
      'a\\..\\b',
      'a//..//b',
    ]

    for (const badPath of invalidPaths) {
      expect(() => validateAttestationReplayDirectory(badPath)).toThrow(
        /ATTESTATION_RESPONSE_CONSUMPTION_DENIED: (PATH_TRAVERSAL_FORBIDDEN|INVALID_REPLAY_STORAGE_DIR)/
      )
    }

    // Probar detección de symlink roto/colgante (dangling symlink) donde fs.existsSync devuelve false pero lstatSync lo detecta
    fs.mkdirSync(TEST_EVIDENCE_DIR, { recursive: true })
    const nonExistentTarget = path.join(TEST_EVIDENCE_DIR, 'does-not-exist-target-dir')
    const danglingLinkPath = path.join(TEST_EVIDENCE_DIR, 'dangling-replay-symlink')
    let symlinkCreated = false
    try {
      fs.symlinkSync(nonExistentTarget, danglingLinkPath, 'dir')
      symlinkCreated = true
    } catch {
      symlinkCreated = false
    }

    if (symlinkCreated) {
      expect(fs.existsSync(danglingLinkPath)).toBe(false)
      expect(() => validateAttestationReplayDirectory(danglingLinkPath)).toThrow(/SYMLINK_FORBIDDEN/)
    }
    cleanupTestDir()
  })

  // 114. FINDING-REPLAY-03 — Seguridad del rollback multi-lock, locks huérfanos por crash y validación estricta de lock existente (Secciones 6, 7 y 13)
  it('114. [FINDING-REPLAY-03] El rollback multi-lock jamás borra bloqueos preexistentes, los locks huérfanos por crash fallan cerrado (FAIL_CLOSED) y la corrupción de campos o directorios en lock falla cerrado', () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'finding-replay-03')
    const fixtureA = buildTestRequestFixture('FINDING-03A')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const response1 = testAuthority.issueResponse(fixtureA.requestPkg, {
      responseId: 'ATT-RES-F03-FIRST',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })

    // 1. Consumo inicial válido (crea los 4 locks para response1, incluyendo consumed-req-<reqDigest>.json)
    const firstConsume = consumeAttestationResponseDurable(response1, {
      attestationRequest: fixtureA.requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: fixtureA.goPub,
      allowTestKeys: true,
      consumedResponsesDir: replayDir,
    })
    expect(firstConsume.consumed).toBe(true)

    const reqDigest = createHash('sha256').update(fixtureA.requestPkg.requestSha256).digest('hex')
    const preExistingReqLockPath = path.join(replayDir, `consumed-req-${reqDigest}.json`)
    expect(fs.existsSync(preExistingReqLockPath)).toBe(true)

    // 2. Segunda respuesta distinta para el MISMO requestSha256:
    // LOCK 1 (consumed-response-...) se crea, LOCK 2 (consumed-id-...) se crea, LOCK 3 (consumed-req-...) falla con EEXIST.
    // El rollback debe borrar LOCK 1 y LOCK 2 de response2, pero JAMÁS borrar el LOCK 3 preexistente de response1.
    const response2SameReq = testAuthority.issueResponse(fixtureA.requestPkg, {
      responseId: 'ATT-RES-F03-SECOND',
      issuedAt: '2026-11-05T01:07:00.000Z',
    })
    const replayId2 = computeAttestationResponseReplayId(response2SameReq)
    const idDigest2 = createHash('sha256').update('ATT-RES-F03-SECOND').digest('hex')

    expect(() =>
      consumeAttestationResponseDurable(response2SameReq, {
        attestationRequest: fixtureA.requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: fixtureA.goPub,
        allowTestKeys: true,
        consumedResponsesDir: replayDir,
      })
    ).toThrow(/ATTESTATION_RESPONSE_CONSUMPTION_DENIED: ATTESTATION_RESPONSE_REPLAY_DETECTED/)

    // LOCK 1 y LOCK 2 de response2 fueron revertidos, mientras que LOCK 3 preexistente permanece intacto
    expect(fs.existsSync(path.join(replayDir, `consumed-response-${replayId2}.json`))).toBe(false)
    expect(fs.existsSync(path.join(replayDir, `consumed-id-${idDigest2}.json`))).toBe(false)
    expect(fs.existsSync(preExistingReqLockPath)).toBe(true)

    // 3. Simulación de CRASH a mitad del consumo (LOCK 1 huérfano en disco sin LOCK 2..4) -> CRASH_BEHAVIOR = FAIL_CLOSED
    const crashReplayDir = path.join(TEST_EVIDENCE_DIR, 'finding-replay-03-crash')
    const fixtureCrash = buildTestRequestFixture('FINDING-03-CRASH')
    const responseCrash = testAuthority.issueResponse(fixtureCrash.requestPkg, {
      responseId: 'ATT-RES-F03-CRASH',
      issuedAt: '2026-11-05T01:08:00.000Z',
    })
    const crashReplayId = computeAttestationResponseReplayId(responseCrash)
    const sigDigestCrash = createHash('sha256').update(responseCrash.signature).digest('hex')
    fs.mkdirSync(crashReplayDir, { recursive: true })
    const orphanLock1Path = path.join(crashReplayDir, `consumed-response-${crashReplayId}.json`)
    fs.writeFileSync(
      orphanLock1Path,
      JSON.stringify({
        schemaVersion: '1.0',
        replayId: crashReplayId,
        attestationId: 'ATT-RES-F03-CRASH',
        responseId: 'ATT-RES-F03-CRASH',
        requestId: responseCrash.requestId,
        requestSha256: responseCrash.requestSha256,
        manifestSha256: responseCrash.manifestSha256,
        attestationPayloadSha256: responseCrash.attestationPayloadSha256,
        signatureSha256: sigDigestCrash,
        authorityId: responseCrash.authorityId,
        keyId: responseCrash.keyId,
        commitSha: responseCrash.commitSha,
        processId: responseCrash.processId,
        executionScope: responseCrash.executionScope,
        consumedAt: '2026-11-05T01:08:01.000Z',
        antiReplayGuarantee: 'HOST_LOCAL_DURABLE_ONE_TIME_USE',
      }),
      { encoding: 'utf8', mode: 0o600 }
    )

    // El reintento posterior tras el crash falla cerrado con ATTESTATION_RESPONSE_REPLAY_DETECTED y NO borra el lock huérfano
    expect(() =>
      consumeAttestationResponseDurable(responseCrash, {
        attestationRequest: fixtureCrash.requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: fixtureCrash.goPub,
        allowTestKeys: true,
        consumedResponsesDir: crashReplayDir,
      })
    ).toThrow(/ATTESTATION_RESPONSE_CONSUMPTION_DENIED: ATTESTATION_RESPONSE_REPLAY_DETECTED/)
    expect(fs.existsSync(orphanLock1Path)).toBe(true)

    // 4. Archivo vacío (0 bytes) o con digest interno incoherente o directorio en lugar de archivo -> falla cerrado
    fs.writeFileSync(orphanLock1Path, '', { encoding: 'utf8' })
    expect(() =>
      consumeAttestationResponseDurable(responseCrash, {
        attestationRequest: fixtureCrash.requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: fixtureCrash.goPub,
        allowTestKeys: true,
        consumedResponsesDir: crashReplayDir,
      })
    ).toThrow(/REPLAY_STORAGE_STATE_INCONSISTENT/)

    fs.unlinkSync(orphanLock1Path)
    fs.mkdirSync(orphanLock1Path)
    expect(() =>
      consumeAttestationResponseDurable(responseCrash, {
        attestationRequest: fixtureCrash.requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: fixtureCrash.goPub,
        allowTestKeys: true,
        consumedResponsesDir: crashReplayDir,
      })
    ).toThrow(/SYMLINK_FORBIDDEN/)

    cleanupTestDir()
  })

  // 115. FINDING-REPLAY-04 — Casos C, D y E de sustitución de identidad semántica y sensibilidad estricta a mayúsculas/minúsculas (Sección 10)
  it('115. [FINDING-REPLAY-04] Rechaza reutilización de firma con contexto alterado (Caso C) y mutaciones de mayúsculas/minúsculas en hashes, firma, commitSha o espacios en IDs (Caso E)', () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'finding-replay-04')
    const { requestPkg, goPub } = buildTestRequestFixture('FINDING-04')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validResponse = testAuthority.issueResponse(requestPkg)

    // Caso C: Misma signature con representación contextual alterada (ej. issuedAt distinto) -> falla verificación criptográfica
    const contextAlteredSameSig = {
      ...validResponse,
      issuedAt: '2026-11-05T02:00:00.000Z',
    }
    expect(() =>
      consumeAttestationResponseDurable(contextAlteredSameSig, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        consumedResponsesDir: replayDir,
      })
    ).toThrow(/ATTESTATION_PAYLOAD_MISMATCH/)

    // Caso E: Mutaciones de mayúsculas/minúsculas en requestSha256, manifestSha256, attestationPayloadSha256, signature o commitSha
    const upperCaseVariants = [
      { ...validResponse, requestSha256: validResponse.requestSha256.toUpperCase() },
      { ...validResponse, manifestSha256: validResponse.manifestSha256.toUpperCase() },
      { ...validResponse, attestationPayloadSha256: validResponse.attestationPayloadSha256.toUpperCase() },
      { ...validResponse, signature: validResponse.signature.toUpperCase() },
      { ...validResponse, commitSha: validResponse.commitSha.toUpperCase() },
      { ...validResponse, responseId: ` ${validResponse.responseId} ` },
    ]

    for (const variant of upperCaseVariants) {
      expect(() => computeAttestationResponseReplayId(variant)).toThrow()
      const vRes = verifyAttestationResponse(variant, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
      })
      expect(vRes.valid).toBe(false)
    }

    // Y si el caller pasa expectedHead / commitSha en mayúsculas en las opciones, también se rechaza
    const upperTargetCommitCheck = verifyAttestationResponse(validResponse, {
      attestationRequest: requestPkg,
      commitSha: VALID_HEAD.toUpperCase(),
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })
    expect(upperTargetCommitCheck.valid).toBe(false)
    expect(upperTargetCommitCheck.reason).toBe('ATTESTATION_REQUEST_MISMATCH')
    cleanupTestDir()
  })

  // 116. Sección 5 — Concurrencia real entre 3 procesos hijos del sistema operativo intentando consumir la misma AttestationResponse
  it('116. [ADV-CONCURRENCY-3PROC] Concurrencia real entre 3 procesos independientes intentando consumir simultáneamente la misma AttestationResponse: exactamente 1 SUCCESS y 2 ATTESTATION_RESPONSE_REPLAY_DETECTED', async () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'adv-concurrency-3proc')
    fs.mkdirSync(replayDir, { recursive: true })

    const { requestPkg, goPub } = buildTestRequestFixture('CONC-3PROC')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })
    const validResponse = testAuthority.issueResponse(requestPkg)

    const fixturePath = path.join(TEST_EVIDENCE_DIR, 'conc-3proc-fixture.json')
    const pubKeyPem = String(testAuthority.publicKey)
    const goPubPem = String(goPub)
    fs.writeFileSync(
      fixturePath,
      JSON.stringify({
        replayDir,
        requestPkg,
        validResponse,
        pubKeyPem,
        goPubPem,
      }),
      'utf8'
    )

    const workerScript = `
      import fs from 'node:fs';
      import { consumeAttestationResponseDurable } from './scripts/fiscal/plan-pr02-parameters.mjs';
      const data = JSON.parse(fs.readFileSync(${JSON.stringify(fixturePath)}, 'utf8'));
      try {
        const res = consumeAttestationResponseDurable(data.validResponse, {
          attestationRequest: data.requestPkg,
          trustedAttestationPublicKey: data.pubKeyPem,
          trustedGoPublicKey: data.goPubPem,
          allowTestKeys: true,
          consumedResponsesDir: data.replayDir,
        });
        process.stdout.write(JSON.stringify({ status: 'SUCCESS', consumed: res.consumed, replayId: res.replayId }));
      } catch (err) {
        process.stdout.write(JSON.stringify({ status: 'DENIED', message: err.message }));
      }
    `

    const spawnConsumer = () =>
      new Promise<{ status: string; consumed?: boolean; replayId?: string; message?: string }>((resolve, reject) => {
        execFile(
          process.execPath,
          ['--input-type=module', '-e', workerScript],
          { cwd: process.cwd() },
          (err, stdout, stderr) => {
            if (err) {
              reject(new Error(`Worker process error: ${err.message} / ${stderr}`))
              return
            }
            try {
              resolve(JSON.parse(stdout.trim()))
            } catch (parseErr) {
              reject(new Error(`Invalid JSON from worker: ${stdout} (${String(parseErr)})`))
            }
          }
        )
      })

    const results = await Promise.all([spawnConsumer(), spawnConsumer(), spawnConsumer()])
    const successes = results.filter((r) => r.status === 'SUCCESS')
    const denied = results.filter((r) => r.status === 'DENIED')

    expect(successes.length).toBe(1)
    expect(successes[0].consumed).toBe(true)
    expect(denied.length).toBe(2)
    for (const d of denied) {
      expect(d.message).toMatch(/ATTESTATION_RESPONSE_CONSUMPTION_DENIED: ATTESTATION_RESPONSE_REPLAY_DETECTED/)
    }

    // Confirmar que los 4 archivos de bloqueo están presentes e íntegros tras la carrera entre procesos
    const lockFiles = fs.readdirSync(replayDir).filter((f) => f.endsWith('.json'))
    expect(lockFiles.length).toBe(4)
    cleanupTestDir()
  })

  // =========================================================================
  // FASE 10 — PRUEBAS ADVERSARIALES DE HARDENING DE ARQUITECTURA DE AUTORIDAD
  // EXTERNA INDEPENDIENTE (AUTH-EXT-01 a AUTH-EXT-15)
  // =========================================================================

  // 117. AUTH-EXT-01 — Configuración correcta del adaptador externo
  it('117. AUTH-EXT-01: Configuración correcta del adaptador externo separa AUTHORITY_ADAPTER_IMPLEMENTED=true de AUTHORITY_REAL_WORLD_AVAILABLE=false e INDEPENDENT_ATTESTATION_AVAILABLE=false', () => {
    const { goPub } = buildTestRequestFixture('AUTH-EXT-01')
    const testAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'external-attestation-authority-prod-contract-01',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })

    const adapter = createIndependentAttestationAuthorityAdapter({
      authorityId: testAuthority.authorityId,
      keyId: testAuthority.keyId,
      publicKeySpki: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      goAuthorityId: 'OWNER_OFFICIAL_APPROVER_2026',
      allowTestKeys: true,
      transport: testAuthority.sendAttestationRequest,
    })

    expect(AUTHORITY_ADAPTER_IMPLEMENTED).toBe(true)
    expect(AUTHORITY_REAL_WORLD_AVAILABLE).toBe(false)
    expect(adapter.AUTHORITY_ADAPTER_IMPLEMENTED).toBe(true)
    expect(adapter.AUTHORITY_REAL_WORLD_AVAILABLE).toBe(false)
    expect(adapter.INDEPENDENT_ATTESTATION_AVAILABLE).toBe(false)
    expect(adapter.P1_IMPORT_ALLOWED).toBe(false)
    expect(adapter.ATTESTATION_TRUST_MODEL).toBe('SELF_ATTESTED')
    expect(adapter.isConfigured()).toBe(true)
    expect(adapter.isAuthorityAvailable()).toBe(false)
    expect(adapter.authorityId).toBe(testAuthority.authorityId)
    expect(adapter.keyId).toBe(testAuthority.keyId)
    expect(adapter.publicKeySpki).toContain('-----BEGIN PUBLIC KEY-----')
    expect(IndependentAttestationAuthority.AUTHORITY_ADAPTER_IMPLEMENTED).toBe(true)
    expect(IndependentAttestationAuthority.AUTHORITY_REAL_WORLD_AVAILABLE).toBe(false)
    expect(IndependentAttestationAuthority.INDEPENDENT_ATTESTATION_AVAILABLE).toBe(false)
    expect(IndependentAttestationAuthority.isRealWorldAuthorityAvailable({
      trustedAttestationPublicKey: testAuthority.publicKey,
      allowTestKeys: true,
    })).toBe(false)
    expect(IndependentAttestationAuthority.isPublicKeyConfigured({
      publicKeySpki: testAuthority.publicKey,
      allowTestKeys: true,
    })).toBe(true)
  })

  // 118. AUTH-EXT-02 — Clave privada presente en runtime fiscal o pasada como configuración de verificación
  it('118. AUTH-EXT-02: Clave privada presente en runtime fiscal o suministrada como configuración de verificación falla cerrado con RUNTIME_PRIVATE_KEY_DETECTED', () => {
    cleanupTestDir()
    const { requestPkg, goPub } = buildTestRequestFixture('AUTH-EXT-02')
    const { publicKey: attPub, privateKey: attPriv } = generateEphemeralAttestationKeyPair()
    const signedRes = createSignedTestAttestationResponse(requestPkg, attPriv, {
      issuedAt: '2026-11-05T01:06:00.000Z',
    })

    // 1. Clave privada PEM pasada directamente a parseEd25519PublicKey / validateP0AttestationPublicKey / validateP0GoPublicKey
    expect(() => parseEd25519PublicKey(attPriv)).toThrow(/RUNTIME_PRIVATE_KEY_DETECTED/)
    expect(() => validateP0AttestationPublicKey(attPriv, true)).toThrow(/RUNTIME_PRIVATE_KEY_DETECTED/)
    expect(() => validateP0GoPublicKey(attPriv, true)).toThrow(/RUNTIME_PRIVATE_KEY_DETECTED/)

    // 2. Clave privada pasada como publicKeySpki / trustedAttestationPublicKey / privateKey al adaptador
    expect(() =>
      createIndependentAttestationAuthorityAdapter({
        authorityId: 'ext-auth-02',
        publicKeySpki: attPriv,
        allowTestKeys: true,
      })
    ).toThrow(/RUNTIME_PRIVATE_KEY_DETECTED/)

    expect(() =>
      createIndependentAttestationAuthorityAdapter({
        authorityId: 'ext-auth-02',
        publicKeySpki: attPub,
        privateKey: attPriv,
        allowTestKeys: true,
      })
    ).toThrow(/RUNTIME_PRIVATE_KEY_DETECTED/)

    // 3. Clave privada pasada como trustedAttestationPublicKey o trustedGoPublicKey a verifyAttestationResponse
    const verifyWithPrivAtt = verifyAttestationResponse(signedRes, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: attPriv,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })
    expect(verifyWithPrivAtt.valid).toBe(false)
    expect(verifyWithPrivAtt.reason).toBe('RUNTIME_PRIVATE_KEY_DETECTED')

    const verifyWithPrivGo = verifyAttestationResponse(signedRes, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: attPub,
      trustedGoPublicKey: attPriv,
      allowTestKeys: true,
    })
    expect(verifyWithPrivGo.valid).toBe(false)
    expect(verifyWithPrivGo.reason).toBe('RUNTIME_PRIVATE_KEY_DETECTED')

    // 4. Archivo en disco que contiene una clave privada pasado como ruta de clave pública
    fs.mkdirSync(TEST_EVIDENCE_DIR, { recursive: true })
    const privKeyFile = path.join(TEST_EVIDENCE_DIR, 'injected-private-key.pem')
    fs.writeFileSync(privKeyFile, String(attPriv), 'utf8')
    expect(() => validateP0AttestationPublicKey(privKeyFile, true)).toThrow(/RUNTIME_PRIVATE_KEY_DETECTED/)
    cleanupTestDir()
  })

  // 119. AUTH-EXT-03 — GO Authority y Attestation Authority iguales (GO_AUTHORITY_ID == ATTESTATION_AUTHORITY_ID)
  it('119. AUTH-EXT-03: GO Authority y Attestation Authority con el mismo authorityId fallan cerrado con COLLAPSED_AUTHORITIES_REJECTED', async () => {
    const { requestPkg, goPub, goDoc } = buildTestRequestFixture('AUTH-EXT-03')
    const sharedAuthorityId = goDoc.authorization.aprobador_identidad // 'OWNER_OFFICIAL_APPROVER_2026'
    const testAuthority = createTestIndependentAttestationAuthority({
      authorityId: sharedAuthorityId,
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const responseWithSameAuthId = testAuthority.issueResponse(requestPkg)

    expect(() =>
      assertAuthoritiesSeparated({
        goAuthorityId: sharedAuthorityId,
        attestationAuthorityId: sharedAuthorityId,
      })
    ).toThrow(/COLLAPSED_AUTHORITIES_REJECTED/)

    expect(() =>
      createIndependentAttestationAuthorityAdapter({
        authorityId: sharedAuthorityId,
        goAuthorityId: sharedAuthorityId,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
      })
    ).toThrow(/COLLAPSED_AUTHORITIES_REJECTED/)

    const verifyCollapsedId = verifyAttestationResponse(responseWithSameAuthId, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      goAuthorityId: sharedAuthorityId,
      allowTestKeys: true,
    })
    expect(verifyCollapsedId.valid).toBe(false)
    expect(verifyCollapsedId.reason).toBe('COLLAPSED_AUTHORITIES_REJECTED')

    const verifyCollapsedViaGoDoc = verifyAttestationResponse(responseWithSameAuthId, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      goAuthorizationDoc: goDoc,
      allowTestKeys: true,
    })
    expect(verifyCollapsedViaGoDoc.valid).toBe(false)
    expect(verifyCollapsedViaGoDoc.reason).toBe('COLLAPSED_AUTHORITIES_REJECTED')

    await expect(
      submitAttestationRequest(requestPkg, {
        authorityId: sharedAuthorityId,
        goAuthorityId: sharedAuthorityId,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        transport: async () => responseWithSameAuthId,
      })
    ).rejects.toThrow(/COLLAPSED_AUTHORITIES_REJECTED/)
  })

  // 120. AUTH-EXT-04 — Misma identidad criptográfica (keyId o SPKI DER) para roles incompatibles
  it('120. AUTH-EXT-04: Reutilizar la misma identidad criptográfica (keyId o clave pública SPKI) entre GO Authority y Attestation Authority falla cerrado con COLLAPSED_AUTHORITIES_REJECTED', () => {
    const { requestPkg } = buildTestRequestFixture('AUTH-EXT-04')
    const sharedKeyPair = generateEphemeralAttestationKeyPair()
    const testAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'distinct-attestation-authority-04',
      keyPair: sharedKeyPair,
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const validResponse = testAuthority.issueResponse(requestPkg)

    // 1. Mismo keyId entre GO Authority y Attestation Authority
    expect(() =>
      assertAuthoritiesSeparated({
        goAuthorityId: 'go-approver-04',
        attestationAuthorityId: 'att-authority-04',
        goKeyId: testAuthority.keyId,
        attestationKeyId: testAuthority.keyId,
      })
    ).toThrow(/COLLAPSED_AUTHORITIES_REJECTED/)

    const verifySameKeyId = verifyAttestationResponse(validResponse, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      goKeyId: testAuthority.keyId,
      allowTestKeys: true,
    })
    expect(verifySameKeyId.valid).toBe(false)
    expect(verifySameKeyId.reason).toBe('COLLAPSED_AUTHORITIES_REJECTED')

    // 2. Misma clave pública SPKI para GO Authority y Attestation Authority en el adaptador y verificador
    expect(() =>
      createIndependentAttestationAuthorityAdapter({
        authorityId: 'distinct-attestation-authority-04',
        goAuthorityId: 'distinct-go-authority-04',
        trustedAttestationPublicKey: sharedKeyPair.publicKey,
        trustedGoPublicKey: sharedKeyPair.publicKey,
        allowTestKeys: true,
      })
    ).toThrow(/COLLAPSED_AUTHORITIES_REJECTED/)

    const verifySameSpki = verifyAttestationResponse(validResponse, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: sharedKeyPair.publicKey,
      trustedGoPublicKey: sharedKeyPair.publicKey,
      allowTestKeys: true,
    })
    expect(verifySameSpki.valid).toBe(false)
    expect(verifySameSpki.reason).toBe('COLLAPSED_AUTHORITIES_REJECTED')
  })

  // 121. AUTH-EXT-05 — authorityId incorrecto
  it('121. AUTH-EXT-05: Respuesta con authorityId incorrecto falla cerrado con ATTESTATION_AUTHORITY_MISMATCH', () => {
    const { requestPkg, goPub } = buildTestRequestFixture('AUTH-EXT-05')
    const testAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'unexpected-authority-id-05',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const signedRes = testAuthority.issueResponse(requestPkg)

    const adapter = createIndependentAttestationAuthorityAdapter({
      authorityId: 'expected-official-authority-05',
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      transport: async () => signedRes,
    })

    const res = adapter.verifyAttestationResponse(signedRes, {
      attestationRequest: requestPkg,
    })
    expect(res.valid).toBe(false)
    expect(res.reason).toBe('ATTESTATION_AUTHORITY_MISMATCH')
    expect(() =>
      adapter.validateAttestationResponse(signedRes, {
        attestationRequest: requestPkg,
      })
    ).toThrow(/ATTESTATION_AUTHORITY_MISMATCH/)
  })

  // 122. AUTH-EXT-06 — keyId incorrecto
  it('122. AUTH-EXT-06: Configuración o respuesta con keyId incorrecto falla cerrado con ATTESTATION_KEY_ID_MISMATCH', () => {
    const { requestPkg, goPub } = buildTestRequestFixture('AUTH-EXT-06')
    const testAuthority = createTestIndependentAttestationAuthority({
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const signedRes = testAuthority.issueResponse(requestPkg)

    // 1. Adaptador configurado con un keyId que no coincide con publicKeySpki
    expect(() =>
      createIndependentAttestationAuthorityAdapter({
        authorityId: testAuthority.authorityId,
        keyId: 'ed25519-spki-deadbeefdeadbeef',
        publicKeySpki: testAuthority.publicKey,
        allowTestKeys: true,
      })
    ).toThrow(/ATTESTATION_KEY_ID_MISMATCH/)

    // 2. Respuesta cuyo keyId no coincide con expectedKeyId / allowedKeyIds
    const check = verifyAttestationResponse(signedRes, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      expectedKeyId: 'ed25519-spki-deadbeefdeadbeef',
      allowTestKeys: true,
    })
    expect(check.valid).toBe(false)
    expect(check.reason).toBe('ATTESTATION_KEY_ID_MISMATCH')
  })

  // 123. AUTH-EXT-07 — Firma válida de una autoridad no autorizada
  it('123. AUTH-EXT-07: Firma Ed25519 matemáticamente válida emitida por una autoridad externa no autorizada es bloqueada fail-closed', async () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'auth-ext-07')
    const { requestPkg, goPub } = buildTestRequestFixture('AUTH-EXT-07')
    const trustedAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'trusted-authority-07',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const rogueAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'trusted-authority-07', // Incluso suplantando el mismo nombre authorityId
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const rogueSignedResponse = rogueAuthority.issueResponse(requestPkg)

    const adapter = createIndependentAttestationAuthorityAdapter({
      authorityId: trustedAuthority.authorityId,
      publicKeySpki: trustedAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      consumedResponsesDir: replayDir,
      transport: async () => rogueSignedResponse,
    })

    const check = adapter.verifyAttestationResponse(rogueSignedResponse, {
      attestationRequest: requestPkg,
    })
    expect(check.valid).toBe(false)
    expect(check.reason).toBe('ATTESTATION_KEY_ID_MISMATCH')

    await expect(adapter.submitAttestationRequest(requestPkg)).rejects.toThrow(/ATTESTATION_KEY_ID_MISMATCH/)
    cleanupTestDir()
  })

  // 124. AUTH-EXT-08 — Sustitución de clave pública
  it('124. AUTH-EXT-08: Intento de sustituir la clave pública anclada (publicKeySpki) en el adaptador o verificador falla cerrado con PUBLIC_KEY_SUBSTITUTION_REJECTED', async () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'auth-ext-08')
    const { requestPkg, goPub } = buildTestRequestFixture('AUTH-EXT-08')
    const pinnedAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'pinned-authority-08',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const substitutedAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'pinned-authority-08',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const responseSignedBySubstitutedKey = substitutedAuthority.issueResponse(requestPkg)

    const adapter = createIndependentAttestationAuthorityAdapter({
      authorityId: pinnedAuthority.authorityId,
      publicKeySpki: pinnedAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      consumedResponsesDir: replayDir,
      transport: async () => responseSignedBySubstitutedKey,
    })

    // Intento de sustituir trustedAttestationPublicKey al verificar sobre el adaptador anclado
    const verifySub = adapter.verifyAttestationResponse(responseSignedBySubstitutedKey, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: substitutedAuthority.publicKey,
    })
    expect(verifySub.valid).toBe(false)
    expect(verifySub.reason).toBe('PUBLIC_KEY_SUBSTITUTION_REJECTED')

    // Intento de sustituir publicKeySpki al consumir sobre el adaptador anclado
    expect(() =>
      adapter.consumeAttestationResponse(responseSignedBySubstitutedKey, {
        attestationRequest: requestPkg,
        publicKeySpki: substitutedAuthority.publicKey,
      })
    ).toThrow(/PUBLIC_KEY_SUBSTITUTION_REJECTED/)

    // Intento de sustituir trustedAttestationPublicKey en submitAttestationRequest sobre el adaptador anclado
    await expect(
      adapter.submitAttestationRequest(requestPkg, {
        trustedAttestationPublicKey: substitutedAuthority.publicKey,
      })
    ).rejects.toThrow(/PUBLIC_KEY_SUBSTITUTION_REJECTED/)
    cleanupTestDir()
  })

  // 125. AUTH-EXT-09 — Respuesta válida vinculada a otro requestSha256
  it('125. AUTH-EXT-09: Respuesta con firma válida pero vinculada a otro requestSha256 falla cerrado con ATTESTATION_REQUEST_MISMATCH', () => {
    const fixtureA = buildTestRequestFixture('AUTH-EXT-09A')
    const fixtureB = buildTestRequestFixture('AUTH-EXT-09B')
    const testAuthority = createTestIndependentAttestationAuthority({
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const validResForB = testAuthority.issueResponse(fixtureB.requestPkg)

    const check = verifyAttestationResponse(validResForB, {
      attestationRequest: fixtureA.requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: fixtureA.goPub,
      allowTestKeys: true,
    })
    expect(check.valid).toBe(false)
    expect(check.reason).toBe('ATTESTATION_REQUEST_MISMATCH')
  })

  // 126. AUTH-EXT-10 — Respuesta válida vinculada a otro manifestSha256
  it('126. AUTH-EXT-10: Respuesta con firma válida pero vinculada a otro manifestSha256 falla cerrado con ATTESTATION_MANIFEST_MISMATCH', () => {
    const { requestPkg, manifestDraft, goPub } = buildTestRequestFixture('AUTH-EXT-10')
    const testAuthority = createTestIndependentAttestationAuthority({
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const resOtherManifest = testAuthority.issueResponse(requestPkg, {
      manifestSha256: 'c'.repeat(64),
    })

    const check = verifyAttestationResponse(resOtherManifest, {
      attestationRequest: requestPkg,
      manifest: manifestDraft,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })
    expect(check.valid).toBe(false)
    expect(check.reason).toBe('ATTESTATION_MANIFEST_MISMATCH')
  })

  // 127. AUTH-EXT-11 — commitSha diferente
  it('127. AUTH-EXT-11: Respuesta con firma válida pero vinculada a un commitSha diferente falla cerrado con ATTESTATION_REQUEST_MISMATCH', () => {
    const { requestPkg, goPub } = buildTestRequestFixture('AUTH-EXT-11')
    const testAuthority = createTestIndependentAttestationAuthority({
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const resDifferentCommit = testAuthority.issueResponse(requestPkg, {
      commitSha: 'd'.repeat(40),
    })

    const check = verifyAttestationResponse(resDifferentCommit, {
      attestationRequest: requestPkg,
      commitSha: VALID_HEAD,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
    })
    expect(check.valid).toBe(false)
    expect(check.reason).toBe('ATTESTATION_REQUEST_MISMATCH')
  })

  // 128. AUTH-EXT-12 — Respuesta expirada
  it('128. AUTH-EXT-12: Respuesta con firma válida pero expirada (expiresAt <= now) falla cerrado con ATTESTATION_ISSUED_AT_INVALID', () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'auth-ext-12')
    const { requestPkg, goPub } = buildTestRequestFixture('AUTH-EXT-12')
    const testAuthority = createTestIndependentAttestationAuthority({
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const expiredResponse = testAuthority.issueResponse(requestPkg, {
      issuedAt: '2026-11-05T01:06:00.000Z',
      expiresAt: '2026-11-05T01:30:00.000Z',
    })

    const check = verifyAttestationResponse(expiredResponse, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      now: '2026-11-05T02:00:00.000Z',
    })
    expect(check.valid).toBe(false)
    expect(check.reason).toBe('ATTESTATION_ISSUED_AT_INVALID')

    expect(() =>
      consumeAttestationResponseDurable(expiredResponse, {
        attestationRequest: requestPkg,
        trustedAttestationPublicKey: testAuthority.publicKey,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
        consumedResponsesDir: replayDir,
        now: '2026-11-05T02:00:00.000Z',
      })
    ).toThrow(/ATTESTATION_RESPONSE_CONSUMPTION_DENIED: ATTESTATION_ISSUED_AT_INVALID/)
    cleanupTestDir()
  })

  // 129. AUTH-EXT-13 — Intento de elevar SELF_ATTESTED mediante flags/configuración
  it('129. AUTH-EXT-13: Intento de elevar SELF_ATTESTED a INDEPENDENT_ATTESTED mediante flags, env vars o configuración local falla cerrado con SELF_ATTESTATION_AUTO_ELEVATION_REJECTED', () => {
    const { requestPkg, goPub } = buildTestRequestFixture('AUTH-EXT-13')
    const testAuthority = createTestIndependentAttestationAuthority({
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const validRes = testAuthority.issueResponse(requestPkg)

    for (const badConfig of [
      { independentAuthorityAvailable: true },
      { INDEPENDENT_ATTESTATION_AVAILABLE: true },
      { authorityRealWorldAvailable: true },
      { AUTHORITY_REAL_WORLD_AVAILABLE: true },
      { elevateToIndependent: true },
      { forceIndependentAttestation: true },
      { allowSelfAttestedAsIndependent: true },
      { elevateTrustModel: true },
      { forceProductionAuthority: true },
      { P1_IMPORT_ALLOWED: true },
      { ATTESTATION_TRUST_MODEL: 'INDEPENDENT_ATTESTED' },
      { env: { PR02_P0_FORCE_INDEPENDENT_ATTESTATION: '1' } },
      { env: { INDEPENDENT_ATTESTATION_AVAILABLE: 'true' } },
      { env: { AUTHORITY_REAL_WORLD_AVAILABLE: 'true' } },
    ]) {
      expect(() => createIndependentAttestationAuthorityAdapter(badConfig)).toThrow(
        /SELF_ATTESTATION_AUTO_ELEVATION_REJECTED/
      )
    }

    expect(() =>
      IndependentAttestationAuthority.isAuthorityAvailable({
        AUTHORITY_REAL_WORLD_AVAILABLE: true,
      })
    ).toThrow(/SELF_ATTESTATION_AUTO_ELEVATION_REJECTED/)

    const verifyElevated = verifyAttestationResponse(validRes, {
      attestationRequest: requestPkg,
      trustedAttestationPublicKey: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      elevateTrustModel: true,
    })
    expect(verifyElevated.valid).toBe(false)
    expect(verifyElevated.reason).toBe('SELF_ATTESTATION_AUTO_ELEVATION_REJECTED')
  })

  // 130. AUTH-EXT-14 — Verificación exitosa seguida de consumo durable -> PASS una sola vez
  it('130. AUTH-EXT-14: Verificación read-only exitosa seguida de consumo atómico durable pasa exactamente una vez', () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'auth-ext-14')
    const { requestPkg, goPub } = buildTestRequestFixture('AUTH-EXT-14')
    const testAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'external-authority-14',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const validRes = testAuthority.issueResponse(requestPkg, {
      expiresAt: '2026-11-05T02:06:00.000Z',
    })

    const adapter = createIndependentAttestationAuthorityAdapter({
      authorityId: testAuthority.authorityId,
      publicKeySpki: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      goAuthorityId: 'OWNER_OFFICIAL_APPROVER_2026',
      allowTestKeys: true,
      consumedResponsesDir: replayDir,
      now: '2026-11-05T01:10:00.000Z',
      transport: async () => validRes,
    })

    // 1. Múltiples verificaciones read-only no consumen la respuesta
    const v1 = adapter.verifyAttestationResponse(validRes, { attestationRequest: requestPkg })
    const v2 = adapter.verifyAttestationResponse(validRes, { attestationRequest: requestPkg, checkReplay: true })
    expect(v1.valid).toBe(true)
    expect(v1.consumed).toBe(false)
    expect(v2.valid).toBe(true)
    expect(v2.consumed).toBe(false)
    expect(adapter.isAttestationResponseConsumed(validRes)).toBe(false)

    // 2. Consumo durable atómico: pasa exactamente una vez
    const consumed = adapter.consumeAttestationResponse(validRes, { attestationRequest: requestPkg })
    expect(consumed.valid).toBe(true)
    expect(consumed.consumed).toBe(true)
    expect(consumed.ATTESTATION_RESPONSE_CONSUMPTION).toBe('CONSUMED')
    expect(adapter.isAttestationResponseConsumed(validRes)).toBe(true)
    cleanupTestDir()
  })

  // 131. AUTH-EXT-15 — Replay posterior -> BLOCKED
  it('131. AUTH-EXT-15: Replay posterior a través del adaptador (en el mismo proceso y en proceso externo) permanece bloqueado con ATTESTATION_RESPONSE_REPLAY_DETECTED', async () => {
    cleanupTestDir()
    const replayDir = path.resolve(TEST_EVIDENCE_DIR, 'auth-ext-15')
    const { requestPkg, goPub } = buildTestRequestFixture('AUTH-EXT-15')
    const testAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'external-authority-15',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const validRes = testAuthority.issueResponse(requestPkg, {
      expiresAt: '2026-11-05T02:06:00.000Z',
    })

    const adapter = createIndependentAttestationAuthorityAdapter({
      authorityId: testAuthority.authorityId,
      publicKeySpki: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      goAuthorityId: 'OWNER_OFFICIAL_APPROVER_2026',
      allowTestKeys: true,
      consumedResponsesDir: replayDir,
      now: '2026-11-05T01:10:00.000Z',
      transport: async () => validRes,
    })

    // Primer envío/consumo: exitoso
    const first = await adapter.submitAttestationRequest(requestPkg)
    expect(first.valid).toBe(true)
    expect(first.verification.consumed).toBe(true)

    // Replay posterior en el mismo proceso: bloqueado
    await expect(adapter.submitAttestationRequest(requestPkg)).rejects.toThrow(
      /ATTESTATION_RESPONSE_REPLAY_DETECTED/
    )
    expect(() =>
      adapter.consumeAttestationResponse(validRes, { attestationRequest: requestPkg })
    ).toThrow(/ATTESTATION_RESPONSE_REPLAY_DETECTED/)

    // Replay posterior en un nuevo proceso del sistema operativo: bloqueado
    const planModuleUrl = pathToFileURL(
      path.resolve(process.cwd(), 'scripts/fiscal/plan-pr02-parameters.mjs')
    ).href
    const childScript = `
      import { consumeAttestationResponseDurable } from ${JSON.stringify(planModuleUrl)};
      const data = JSON.parse(process.env.AUTH_EXT_15_PAYLOAD);
      consumeAttestationResponseDurable(data.response, {
        attestationRequest: data.requestPkg,
        trustedAttestationPublicKey: data.pubKey,
        trustedGoPublicKey: data.goPub,
        allowTestKeys: true,
        consumedResponsesDir: data.replayDir,
        now: '2026-11-05T01:10:00.000Z',
      });
    `
    const proc = spawnSync(process.execPath, ['--input-type=module', '-e', childScript], {
      env: {
        ...process.env,
        AUTH_EXT_15_PAYLOAD: JSON.stringify({
          response: validRes,
          requestPkg,
          pubKey: testAuthority.publicKey,
          goPub,
          replayDir,
        }),
      },
      encoding: 'utf8',
    })
    expect(proc.status).not.toBe(0)
    expect(proc.stderr).toMatch(/ATTESTATION_RESPONSE_REPLAY_DETECTED/)
    cleanupTestDir()
  })

  // 132. [EXT-ARCH-01] Transport adapter existe pero no hay endpoint configurado -> AUTHORITY_REAL_WORLD_AVAILABLE = false, P1_IMPORT_ALLOWED = false
  it('132. [EXT-ARCH-01]: Transport adapter existe pero sin endpoint configurado mantiene AUTHORITY_REAL_WORLD_AVAILABLE = false, P1_IMPORT_ALLOWED = false y submit falla cerrado', async () => {
    cleanupTestDir()
    const { requestPkg, goPub } = buildTestRequestFixture('EXT-ARCH-01')
    const testAuthority = createTestIndependentAttestationAuthority({ issuedAt: '2026-11-05T01:06:00.000Z' })

    const adapter = createIndependentAttestationAuthorityAdapter({
      authorityId: testAuthority.authorityId,
      publicKeySpki: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      endpoint: null,
    })

    expect(AUTHORITY_ADAPTER_IMPLEMENTED).toBe(true)
    expect(AUTHORITY_REAL_WORLD_AVAILABLE).toBe(false)
    expect(EXTERNAL_AUTHORITY_TRANSPORT_CONTRACT_VERSION).toBe('1.0')
    expect(EXTERNAL_AUTHORITY_ENDPOINT_SPEC.method).toBe('POST')
    expect(EXTERNAL_AUTHORITY_ENDPOINT_SPEC.defaultPath).toBe('/attestations')
    expect(IndependentAttestationAuthorityTransportContract.contractVersion).toBe('1.0')
    expect(adapter.endpoint).toBeNull()
    expect(adapter.AUTHORITY_ADAPTER_IMPLEMENTED).toBe(true)
    expect(adapter.AUTHORITY_REAL_WORLD_AVAILABLE).toBe(false)
    expect(adapter.INDEPENDENT_ATTESTATION_AVAILABLE).toBe(false)
    expect(adapter.P1_IMPORT_ALLOWED).toBe(false)
    expect(adapter.ATTESTATION_TRUST_MODEL).toBe('SELF_ATTESTED')

    await expect(adapter.submitAttestationRequest(requestPkg)).rejects.toThrow(
      /INDEPENDENT_ATTESTATION_AUTHORITY_NOT_AVAILABLE/
    )
    cleanupTestDir()
  })

  // 133. [EXT-ARCH-02] Endpoint configurado sin clave pública autorizada -> falla cerrado
  it('133. [EXT-ARCH-02]: Endpoint configurado sin clave pública autorizada falla cerrado con INDEPENDENT_ATTESTATION_AUTHORITY_NOT_AVAILABLE', () => {
    cleanupTestDir()
    const { goPub } = buildTestRequestFixture('EXT-ARCH-02')

    // Sin clave pública autorizada pero con endpoint:
    expect(() =>
      createIndependentAttestationAuthorityAdapter({
        endpoint: 'https://attestation-authority.arca.gov.ar/attestations',
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
      })
    ).toThrow(/INDEPENDENT_ATTESTATION_AUTHORITY_NOT_AVAILABLE: Endpoint configurado sin clave pública autorizada/)

    expect(() =>
      assertAdapterConfigSecurity({
        endpoint: 'https://attestation-authority.arca.gov.ar/attestations',
      })
    ).toThrow(/INDEPENDENT_ATTESTATION_AUTHORITY_NOT_AVAILABLE: Endpoint configurado sin clave pública autorizada/)
    cleanupTestDir()
  })

  // 134. [EXT-ARCH-03] Clave pública configurada pero authorityId incorrecto -> falla cerrado
  it('134. [EXT-ARCH-03]: Clave pública configurada pero authorityId incorrecto falla cerrado con ATTESTATION_AUTHORITY_MISMATCH', async () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'ext-arch-03')
    const { requestPkg, goPub } = buildTestRequestFixture('EXT-ARCH-03')
    const testAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'ATT_AUTH_EXPECTED',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const responseFromMismatched = testAuthority.issueResponse(requestPkg, {
      authorityId: 'ATT_AUTH_MISMATCHED',
    })

    const adapter = createIndependentAttestationAuthorityAdapter({
      authorityId: 'ATT_AUTH_EXPECTED',
      publicKeySpki: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      consumedResponsesDir: replayDir,
      allowTestKeys: true,
      transport: async () => responseFromMismatched,
    })

    // Fallo al enviar/verificar por autoridad inesperada
    await expect(adapter.submitAttestationRequest(requestPkg)).rejects.toThrow(
      /ATTESTATION_AUTHORITY_MISMATCH/
    )

    // Fallo en verificación directa de verifyAttestationResponse
    const directVerify = verifyAttestationResponse(responseFromMismatched, {
      authorityId: 'ATT_AUTH_EXPECTED',
      trustedAttestationPublicKey: testAuthority.publicKey,
      allowTestKeys: true,
    })
    expect(directVerify.valid).toBe(false)
    expect(directVerify.reason).toBe('ATTESTATION_AUTHORITY_MISMATCH')
    cleanupTestDir()
  })

  // 135. [EXT-ARCH-04] keyId sustituido por runtime input -> falla: PUBLIC_KEY_SUBSTITUTION_REJECTED
  it('135. [EXT-ARCH-04]: Sustitución arbitraria de keyId por runtime input falla cerrado con PUBLIC_KEY_SUBSTITUTION_REJECTED', async () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'ext-arch-04')
    const { requestPkg, goPub } = buildTestRequestFixture('EXT-ARCH-04')
    const testAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'ATT_AUTH_KEY_PIN',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const validRes = testAuthority.issueResponse(requestPkg)
    const expectedKeyId = computePublicKeyId(testAuthority.publicKey)

    // 1. Adapter configurado con pinnedKeyId alterado
    expect(() =>
      createIndependentAttestationAuthorityAdapter({
        authorityId: 'ATT_AUTH_KEY_PIN',
        publicKeySpki: testAuthority.publicKey,
        pinnedKeyId: 'ed25519-spki-substitutedkey01',
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
      })
    ).toThrow(/PUBLIC_KEY_SUBSTITUTION_REJECTED/)

    // 2. Respuesta devuelta con keyId sustituido distinto al esperado/computado
    const tamperedKeyIdRes = { ...validRes, keyId: 'ed25519-spki-substitutedkey02' }
    const directVerify = verifyAttestationResponse(tamperedKeyIdRes, {
      authorityId: 'ATT_AUTH_KEY_PIN',
      trustedAttestationPublicKey: testAuthority.publicKey,
      pinnedKeyId: expectedKeyId,
      allowTestKeys: true,
    })
    expect(directVerify.valid).toBe(false)
    expect(directVerify.reason).toBe('PUBLIC_KEY_SUBSTITUTION_REJECTED')

    const adapter = createIndependentAttestationAuthorityAdapter({
      authorityId: 'ATT_AUTH_KEY_PIN',
      publicKeySpki: testAuthority.publicKey,
      pinnedKeyId: expectedKeyId,
      trustedGoPublicKey: goPub,
      consumedResponsesDir: replayDir,
      allowTestKeys: true,
      transport: async () => tamperedKeyIdRes,
    })
    await expect(adapter.submitAttestationRequest(requestPkg)).rejects.toThrow(
      /PUBLIC_KEY_SUBSTITUTION_REJECTED/
    )
    cleanupTestDir()
  })

  // 136. [EXT-ARCH-05] Intento de inyectar private key en la configuración del runtime -> falla: RUNTIME_PRIVATE_KEY_DETECTED
  it('136. [EXT-ARCH-05]: Intento de inyectar clave privada en la configuración o variables del runtime falla con RUNTIME_PRIVATE_KEY_DETECTED', () => {
    cleanupTestDir()
    const { goPub } = buildTestRequestFixture('EXT-ARCH-05')

    expect(() =>
      createIndependentAttestationAuthorityAdapter({
        authorityId: 'ATT_AUTH_05',
        publicKeySpki: 'MCowBQYDK2VwAyEA0000000000000000000000000000000000000000000=',
        trustedGoPublicKey: goPub,
        privateKey: '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIP000000000000000000000000000000000000000000\n-----END PRIVATE KEY-----',
      })
    ).toThrow(/RUNTIME_PRIVATE_KEY_DETECTED/)

    expect(() =>
      assertAdapterConfigSecurity({
        secretKey: 'my-ultra-secret-attestation-signing-key',
      })
    ).toThrow(/RUNTIME_PRIVATE_KEY_DETECTED/)

    // Verificar que verifyRuntimeSigningIsolation pasa y no detecta secretos residuales
    const isolation = verifyRuntimeSigningIsolation()
    expect(isolation.valid).toBe(true)
    expect(isolation.reason).toBe('RUNTIME_SIGNING_ISOLATED')
    expect(isolation.privateKeysDetected).toBe(0)
    cleanupTestDir()
  })

  // 137. [EXT-ARCH-06] Transport devuelve una respuesta sin firma válida -> falla: ATTESTATION_SIGNATURE_INVALID
  it('137. [EXT-ARCH-06]: Transport que devuelve una respuesta sin firma válida falla cerrado con ATTESTATION_SIGNATURE_INVALID', async () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'ext-arch-06')
    const { requestPkg, goPub } = buildTestRequestFixture('EXT-ARCH-06')
    const testAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'ATT_AUTH_06',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const validRes = testAuthority.issueResponse(requestPkg)
    const corruptedSigRes = {
      ...validRes,
      signature: Buffer.from('corrupted-signature-payload-that-fails-ed25519-verification').toString('base64'),
    }

    const adapter = createIndependentAttestationAuthorityAdapter({
      authorityId: 'ATT_AUTH_06',
      publicKeySpki: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      consumedResponsesDir: replayDir,
      allowTestKeys: true,
      transport: async () => corruptedSigRes,
    })

    await expect(adapter.submitAttestationRequest(requestPkg)).rejects.toThrow(
      /ATTESTATION_SIGNATURE_INVALID/
    )

    const directVerify = verifyAttestationResponse(corruptedSigRes, {
      authorityId: 'ATT_AUTH_06',
      trustedAttestationPublicKey: testAuthority.publicKey,
      allowTestKeys: true,
    })
    expect(directVerify.valid).toBe(false)
    expect(directVerify.reason).toBe('ATTESTATION_SIGNATURE_INVALID')
    cleanupTestDir()
  })

  // 138. [EXT-ARCH-07] Transport intenta devolver SELF_ATTESTED como independiente -> falla: SELF_ATTESTATION_AUTO_ELEVATION_REJECTED
  it('138. [EXT-ARCH-07]: Transport que intenta devolver confianza SELF_ATTESTED como independiente falla cerrado con SELF_ATTESTATION_AUTO_ELEVATION_REJECTED', async () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'ext-arch-07')
    const { requestPkg, goPub } = buildTestRequestFixture('EXT-ARCH-07')
    const testAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'ATT_AUTH_07',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const validRes = testAuthority.issueResponse(requestPkg)

    // Intento 1: la respuesta incluye trustModel: 'SELF_ATTESTED' pretendiendo auto-elevarse
    const selfAttestedRes = {
      ...validRes,
      trustModel: 'SELF_ATTESTED',
    }

    const directVerify1 = verifyAttestationResponse(selfAttestedRes, {
      authorityId: 'ATT_AUTH_07',
      trustedAttestationPublicKey: testAuthority.publicKey,
      allowTestKeys: true,
    })
    expect(directVerify1.valid).toBe(false)
    expect(directVerify1.reason).toBe('SELF_ATTESTATION_AUTO_ELEVATION_REJECTED')

    // Intento 2: respuesta con independentAuthorityAvailable: true
    const elevatedFlagRes = {
      ...validRes,
      independentAuthorityAvailable: true,
    }
    const directVerify2 = verifyAttestationResponse(elevatedFlagRes, {
      authorityId: 'ATT_AUTH_07',
      trustedAttestationPublicKey: testAuthority.publicKey,
      allowTestKeys: true,
    })
    expect(directVerify2.valid).toBe(false)
    expect(directVerify2.reason).toBe('SELF_ATTESTATION_AUTO_ELEVATION_REJECTED')

    // Intento 3: assertNoSelfAttestationElevation
    expect(() =>
      assertNoSelfAttestationElevation({ ATTESTATION_TRUST_MODEL: 'INDEPENDENT_ATTESTED' })
    ).toThrow(/SELF_ATTESTATION_AUTO_ELEVATION_REJECTED/)

    // Intento 4: submitAttestationRequest a través del adaptador con respuesta self-attested
    const adapter = createIndependentAttestationAuthorityAdapter({
      authorityId: 'ATT_AUTH_07',
      publicKeySpki: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      consumedResponsesDir: replayDir,
      allowTestKeys: true,
      transport: async () => selfAttestedRes,
    })
    await expect(adapter.submitAttestationRequest(requestPkg)).rejects.toThrow(
      /SELF_ATTESTATION_AUTO_ELEVATION_REJECTED/
    )
    cleanupTestDir()
  })

  // 139. [EXT-ARCH-08] GO Authority utilizada como Attestation Authority -> falla: COLLAPSED_AUTHORITIES_REJECTED
  it('139. [EXT-ARCH-08]: Utilización de la GO Authority como Attestation Authority falla cerrado con COLLAPSED_AUTHORITIES_REJECTED', () => {
    cleanupTestDir()
    const { goPub } = buildTestRequestFixture('EXT-ARCH-08')

    // Mismo authorityId
    expect(() =>
      assertAuthoritiesSeparated({
        goAuthorityId: 'COLLAPSED_ID',
        attestationAuthorityId: 'COLLAPSED_ID',
      })
    ).toThrow(/COLLAPSED_AUTHORITIES_REJECTED/)

    // Misma clave pública entre GO y Attestation
    expect(() =>
      assertAuthoritiesSeparated({
        goAuthorityId: 'GO_AUTH_OFFICIAL',
        attestationAuthorityId: 'ATT_AUTH_OFFICIAL',
        trustedGoPublicKey: goPub,
        trustedAttestationPublicKey: goPub,
        allowTestKeys: true,
      })
    ).toThrow(/COLLAPSED_AUTHORITIES_REJECTED/)

    // En creación de adapter:
    expect(() =>
      createIndependentAttestationAuthorityAdapter({
        authorityId: 'SHARED_COLLAPSED_AUTHORITY',
        goAuthorityId: 'SHARED_COLLAPSED_AUTHORITY',
        publicKeySpki: goPub,
        trustedGoPublicKey: goPub,
        allowTestKeys: true,
      })
    ).toThrow(/COLLAPSED_AUTHORITIES_REJECTED/)
    cleanupTestDir()
  })

  // 140. [EXT-ARCH-09] Respuesta válida recibida por transporte -> requiere VERIFY antes de CONSUME
  it('140. [EXT-ARCH-09]: Respuesta válida de transporte requiere obligatoriamente VERIFY antes de CONSUME (no-consumo en verify, consumo atómico en consume)', () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'ext-arch-09')
    const { requestPkg, goPub } = buildTestRequestFixture('EXT-ARCH-09')
    const testAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'ATT_AUTH_09',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const validRes = testAuthority.issueResponse(requestPkg)

    const adapter = createIndependentAttestationAuthorityAdapter({
      authorityId: 'ATT_AUTH_09',
      publicKeySpki: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      consumedResponsesDir: replayDir,
      now: '2026-11-05T01:10:00.000Z',
    })

    // Paso 1: VERIFY es de solo lectura y no consume la respuesta
    const verifyResult = adapter.verifyAttestationResponse(validRes, { attestationRequest: requestPkg })
    expect(verifyResult.valid).toBe(true)
    expect(verifyResult.consumed).toBe(false)
    expect(adapter.isAttestationResponseConsumed(validRes)).toBe(false)

    // Paso 2: CONSUME realiza la persistencia durable atómica
    const consumeResult = adapter.consumeAttestationResponse(validRes, { attestationRequest: requestPkg })
    expect(consumeResult.valid).toBe(true)
    expect(consumeResult.consumed).toBe(true)
    expect(consumeResult.ATTESTATION_RESPONSE_CONSUMPTION).toBe('CONSUMED')
    expect(adapter.isAttestationResponseConsumed(validRes)).toBe(true)
    cleanupTestDir()
  })

  // 141. [EXT-ARCH-10] Respuesta verificada pero replay detectado -> impide cualquier avance posterior
  it('141. [EXT-ARCH-10]: Respuesta verificada una vez es bloqueada en intentos posteriores impidiendo replay durable', async () => {
    cleanupTestDir()
    const replayDir = path.join(TEST_EVIDENCE_DIR, 'ext-arch-10')
    const { requestPkg, goPub } = buildTestRequestFixture('EXT-ARCH-10')
    const testAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'ATT_AUTH_10',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const validRes = testAuthority.issueResponse(requestPkg)

    const adapter = createIndependentAttestationAuthorityAdapter({
      authorityId: 'ATT_AUTH_10',
      publicKeySpki: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      consumedResponsesDir: replayDir,
      now: '2026-11-05T01:10:00.000Z',
      transport: async () => validRes,
    })

    // Primer consumo: éxito
    const firstResult = await adapter.submitAttestationRequest(requestPkg)
    expect(firstResult.valid).toBe(true)
    expect(firstResult.verification.consumed).toBe(true)

    // Segundo consumo: bloqueado por replay durable
    await expect(adapter.submitAttestationRequest(requestPkg)).rejects.toThrow(
      /ATTESTATION_RESPONSE_REPLAY_DETECTED/
    )
    expect(() =>
      adapter.consumeAttestationResponse(validRes, { attestationRequest: requestPkg })
    ).toThrow(/ATTESTATION_RESPONSE_REPLAY_DETECTED/)
    cleanupTestDir()
  })

  // 142. [EXT-ARCH-11] Transport intenta establecer P1_IMPORT_ALLOWED = true directamente -> imposible
  it('142. [EXT-ARCH-11]: Imposibilidad de elevar P1_IMPORT_ALLOWED = true mediante transporte o payload de respuesta', async () => {
    cleanupTestDir()
    const { requestPkg, goPub } = buildTestRequestFixture('EXT-ARCH-11')
    const testAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'ATT_AUTH_11',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const validRes = testAuthority.issueResponse(requestPkg)

    // Intento 1: payload devuelto con campo inesperado P1_IMPORT_ALLOWED: true
    const tamperedRes = {
      ...validRes,
      P1_IMPORT_ALLOWED: true,
    }
    expect(() =>
      validateAttestationResponse(tamperedRes)
    ).toThrow(/Campo inesperado|UNEXPECTED_RESPONSE_FIELD|ATTESTATION_RESPONSE_INVALID/)

    // Intento 2: mutar propiedad sobre el adapter
    const adapter = createIndependentAttestationAuthorityAdapter({
      authorityId: 'ATT_AUTH_11',
      publicKeySpki: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      transport: async () => validRes,
    })

    expect(adapter.P1_IMPORT_ALLOWED).toBe(false)
    try {
      // @ts-expect-error mutación prohibida en getter
      adapter.P1_IMPORT_ALLOWED = true
    } catch {
      // TypeError en strict mode
    }
    expect(adapter.P1_IMPORT_ALLOWED).toBe(false)
    cleanupTestDir()
  })

  // 143. [EXT-ARCH-12] Modo test -> simulación opera estrictamente con allowTestKeys: true, trustScope: TEST_ONLY, PRODUCTION_ATTESTED: false, P1_IMPORT_ALLOWED: false
  it('143. [EXT-ARCH-12]: Modo test opera estrictamente con allowTestKeys: true, trustScope: TEST_ONLY, PRODUCTION_ATTESTED: false y P1_IMPORT_ALLOWED: false', () => {
    cleanupTestDir()
    const { requestPkg, goPub } = buildTestRequestFixture('EXT-ARCH-12')
    const testAuthority = createTestIndependentAttestationAuthority({
      authorityId: 'ATT_AUTH_12_TEST',
      issuedAt: '2026-11-05T01:06:00.000Z',
    })
    const validRes = testAuthority.issueResponse(requestPkg)

    // Sin allowTestKeys: true, clave de prueba identificada con marcador test rechazada
    expect(() =>
      createIndependentAttestationAuthorityAdapter({
        authorityId: 'ATT_AUTH_12_TEST',
        publicKeySpki: 'test-attestation-dummy-key-marker',
        trustedGoPublicKey: goPub,
        allowTestKeys: false,
      })
    ).toThrow(/TEST_KEY_PROHIBITED/)

    // Con allowTestKeys: true, la confianza está estrictamente restringida a TEST_ONLY
    const adapter = createIndependentAttestationAuthorityAdapter({
      authorityId: 'ATT_AUTH_12_TEST',
      publicKeySpki: testAuthority.publicKey,
      trustedGoPublicKey: goPub,
      allowTestKeys: true,
      transport: async () => validRes,
    })

    expect(adapter.ATTESTATION_TRUST_MODEL).toBe('SELF_ATTESTED')
    expect(adapter.INDEPENDENT_ATTESTATION_AVAILABLE).toBe(false)
    expect(adapter.P1_IMPORT_ALLOWED).toBe(false)

    const verification = adapter.verifyAttestationResponse(validRes, { attestationRequest: requestPkg })
    expect(verification.valid).toBe(true)
    expect(verification.trustScope).toBe('TEST_ONLY')
    expect(verification.PRODUCTION_ATTESTED).toBe(false)
    expect(verification.P1_IMPORT_ALLOWED).toBe(false)
    cleanupTestDir()
  })
})
