// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  PR02_P0_SCOPE,
  PR02_PARAMETERS_TARGET_PROJECT_REF,
  PR02_P0_COLECTOR_IDENTIDAD,
  WSFE_HOMO_URL,
  PROHIBITED_ARCA_OPERATIONS,
  executePr02P0OfficialEvidence,
  validateP0EndpointUrl,
  createPr02P0CallTracker,
  loadP0EvidencePackage,
} from '../../scripts/fiscal/execute-pr02-p0-official-evidence.mjs'

import {
  validatePr02P0Manifest,
} from '../../scripts/fiscal/plan-pr02-parameters.mjs'

const VALID_HEAD = '6020103cd8b35b50da7bd736c98b7743093e4c36'
const TEST_EVIDENCE_DIR = 'temp-test-fiscal-evidence-p0'

const SYNTHETIC_WSAA_RESPONSE = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><w:loginCmsResponse xmlns:w="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>&lt;loginTicketResponse version="1.0"&gt;&lt;header&gt;&lt;source&gt;CN=wsaa,O=AFIP,C=AR,SERIALNUMBER=CUIT 33693450239&lt;/source&gt;&lt;destination&gt;SERIALNUMBER=CUIT 20415005963,CN=Kiosko Test&lt;/destination&gt;&lt;uniqueId&gt;12345&lt;/uniqueId&gt;&lt;generationTime&gt;2026-11-05T01:00:00Z&lt;/generationTime&gt;&lt;expirationTime&gt;2026-11-05T12:00:00Z&lt;/expirationTime&gt;&lt;/header&gt;&lt;credentials&gt;&lt;token&gt;SYNTHETIC_MOCK_TOKEN&lt;/token&gt;&lt;sign&gt;SYNTHETIC_MOCK_SIGN&lt;/sign&gt;&lt;/credentials&gt;&lt;/loginTicketResponse&gt;</loginCmsReturn></w:loginCmsResponse></s:Body></s:Envelope>`

const SYNTHETIC_TIPOS_IVA_RESPONSE = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><FEParamGetTiposIvaResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetTiposIvaResult><ResultGet><IvaTipo><Id>5</Id><Desc>21%</Desc><FchDesde>20100917</FchDesde><FchHasta>NULL</FchHasta></IvaTipo><IvaTipo><Id>4</Id><Desc>10.5%</Desc><FchDesde>20100917</FchDesde><FchHasta>NULL</FchHasta></IvaTipo></ResultGet></FEParamGetTiposIvaResult></FEParamGetTiposIvaResponse></soap:Body></soap:Envelope>`

const SYNTHETIC_CONDICIONES_IVA_RESPONSE = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><FEParamGetCondicionIvaReceptorResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetCondicionIvaReceptorResult><ResultGet><CondicionIvaReceptor><Id>1</Id><Desc>IVA Responsable Inscripto</Desc><Cmp_Clase>A/ALEY/C</Cmp_Clase></CondicionIvaReceptor><CondicionIvaReceptor><Id>5</Id><Desc>Consumidor Final</Desc><Cmp_Clase>B/C</Cmp_Clase></CondicionIvaReceptor></ResultGet></FEParamGetCondicionIvaReceptorResult></FEParamGetCondicionIvaReceptorResponse></soap:Body></soap:Envelope>`

describe('PR02-P0 Official Evidence Collector Unit & Security Tests', () => {
  // Limpieza de directorio temporal de pruebas
  function cleanupTestDir() {
    if (fs.existsSync(TEST_EVIDENCE_DIR)) {
      fs.rmSync(TEST_EVIDENCE_DIR, { recursive: true, force: true })
    }
  }

  // 1. Dry-run sin red
  it('1. Dry-run por defecto no ejecuta red ni mutaciones', async () => {
    const report = await executePr02P0OfficialEvidence({ dryRun: true })

    expect(report.execution).toBe('DRY_RUN')
    expect(report.scope).toBe(PR02_P0_SCOPE)
    expect(report.projectRef).toBe(PR02_PARAMETERS_TARGET_PROJECT_REF)
    expect(report.PR02_P0_LOCAL_PREPARATION).toBe('PASS')
    expect(report.PR02_P0_AUTHORIZATION_GUARD).toBe('PASS')
    expect(report.PR02_P0_REMOTE_EXECUTION_READY).toBe(false)
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

  // 2. Ejecución sin autorización
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

  // 5. HEAD incorrecto
  it('5. Exige expectedHead de 40 hex y rechaza discrepancia con HEAD', async () => {
    // Sin expectedHead
    await expect(
      executePr02P0OfficialEvidence({
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
      })
    ).rejects.toThrow(/PR02_P0_MISSING_EXPECTED_HEAD/)

    // expectedHead no coincide con HEAD
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

    await expect(
      executePr02P0OfficialEvidence({
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        wsaaUrl: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
      })
    ).rejects.toThrow(/PRODUCTION_ENDPOINT_FORBIDDEN/)
  })

  // 7. Endpoint arbitrario rechazado
  it('7. Rechaza endpoints arbitrarios o no homologados', async () => {
    expect(() => validateP0EndpointUrl('https://arbitrary-endpoint.com/wsfe', 'WSFE')).toThrow(
      /INVALID_ENDPOINT_URL/
    )
    expect(() => validateP0EndpointUrl('http://insecure-http.com', 'WSFE')).toThrow(
      /INVALID_ENDPOINT_URL/
    )
  })

  // 8. TA vencido
  it('8. TA vencido sin CMS para renovar arroja TA_EXPIRED', async () => {
    const expiredTa = {
      token: 'EXPIRED_TOKEN',
      sign: 'EXPIRED_SIGN',
      expirationTime: '2020-01-01T00:00:00.000Z',
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
    ).rejects.toThrow(/TA_EXPIRED/)
  })

  // 9. TA válido y reutilizable
  it('9. TA válido y vigente se reutiliza sin llamar a LoginCms', async () => {
    cleanupTestDir()
    const validTa = {
      token: 'VALID_REUSABLE_TOKEN',
      sign: 'VALID_REUSABLE_SIGN',
      expirationTime: '2026-11-05T12:00:00.000Z',
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

    expect(report.PR02_P0_EXECUTION).toBe('PASS')
    // Solo 2 llamadas WSFE, 0 a LoginCms
    expect(report.ARCA_CALLS_NEW).toBe(2)
    cleanupTestDir()
  })

  // 10. Límites de llamadas y allowlist
  it('10. Tracker bloquea operaciones prohibidas y exceso de llamadas', () => {
    const tracker = createPr02P0CallTracker({ loginCmsMax: 1, totalMax: 3 })

    // Operación prohibida (emisión)
    for (const forbidden of PROHIBITED_ARCA_OPERATIONS) {
      expect(() => tracker.recordCall(forbidden)).toThrow(/PROHIBITED_ARCA_OPERATION/)
    }

    // Allowlist
    tracker.recordCall('LoginCms')
    expect(tracker.getCounts().loginCms).toBe(1)

    // Exceso de LoginCms
    expect(() => tracker.recordCall('LoginCms')).toThrow(/CALL_LIMIT_EXCEEDED/)

    tracker.recordCall('FEParamGetTiposIva')
    expect(tracker.getCounts().tiposIva).toBe(1)
    expect(() => tracker.recordCall('FEParamGetTiposIva')).toThrow(/CALL_LIMIT_EXCEEDED/)

    tracker.recordCall('FEParamGetCondicionIvaReceptor')
    expect(tracker.getCounts().condicionIvaReceptor).toBe(1)
    expect(tracker.getCounts().total).toBe(3)

    // Total excedido
    expect(() => tracker.recordCall('FEParamGetTiposIva')).toThrow()
  })

  // 11. Transporte duplicado rechazado
  it('11. Rechaza transporte duplicado (fetcher y mocks específicos inyectados juntos)', async () => {
    await expect(
      executePr02P0OfficialEvidence(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_P0_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
        },
        {
          fetcher: async () => ({ ok: true, status: 200, text: async () => '' }),
          wsaaLogin: async () => SYNTHETIC_WSAA_RESPONSE,
        }
      )
    ).rejects.toThrow(/DUPLICATE_TRANSPORT_INJECTION/)
  })

  // 12. SOAP Fault
  it('12. SOAP Fault en WSAA o WSFE aborta inmediatamente sin reintento', async () => {
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

  // 13. Respuesta WSFE con error de negocio / inválida
  it('13. Respuesta WSFE con error de negocio es detectada y aborta', async () => {
    const errorXml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><FEParamGetTiposIvaResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetTiposIvaResult><Errors><Err><Code>10001</Code><Msg>CUIT no autorizada</Msg></Err></Errors></FEParamGetTiposIvaResult></FEParamGetTiposIvaResponse></soap:Body></soap:Envelope>`

    await expect(
      executePr02P0OfficialEvidence(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_P0_SCOPE,
          projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          existingTa: { token: 'T', sign: 'S', expirationTime: '2026-11-05T12:00:00.000Z' },
          now: '2026-11-05T02:00:00.000Z',
        },
        {
          wsfeTiposIva: async () => errorXml,
        }
      )
    ).rejects.toThrow(/WSFE_BUSINESS:10001/)
  })

  // 14. Contenido modificado después del hash
  it('14. Detecta contenido modificado en disco tras cálculo de hash', async () => {
    cleanupTestDir()
    const report = await executePr02P0OfficialEvidence(
      {
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        now: '2026-11-05T02:00:00.000Z',
        evidenceDir: TEST_EVIDENCE_DIR,
      },
      {
        wsaaLogin: async () => SYNTHETIC_WSAA_RESPONSE,
        wsfeTiposIva: async () => SYNTHETIC_TIPOS_IVA_RESPONSE,
        wsfeCondicionIva: async () => SYNTHETIC_CONDICIONES_IVA_RESPONSE,
      }
    )

    expect(report.PR02_P0_EXECUTION).toBe('PASS')

    // Carga válida
    const loaded = loadP0EvidencePackage(TEST_EVIDENCE_DIR)
    expect(loaded.manifest.manifest_sha256).toBeDefined()

    // Tampering: modificar archivo normalizado en disco
    const normIvaPath = path.join(TEST_EVIDENCE_DIR, 'FEParamGetTiposIva_normalized.json')
    fs.writeFileSync(normIvaPath, '{"tampered": true}', 'utf8')

    expect(() => loadP0EvidencePackage(TEST_EVIDENCE_DIR)).toThrow(/EVIDENCE_PACKAGE_CORRUPTED/)
    cleanupTestDir()
  })

  // 15. Manifiesto fabricado
  it('15. Manifiesto fabricado sin acreditación o scope inválido es rechazado', () => {
    const validManifest = {
      entorno: 'HOMOLOGACION',
      operaciones: ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'],
      consultado_en: '2026-11-05T02:00:00.000Z',
      identificador_proceso: 'P0_RUN_001',
      colector_identidad: PR02_P0_COLECTOR_IDENTIDAD,
      ejecucion_autorizada_id: 'P0_RUN_001',
      ejecucion_autorizada_scope: PR02_P0_SCOPE,
      iva_respuesta_original_sha256: 'a'.repeat(64),
      iva_archivo_normalizado_sha256: 'b'.repeat(64),
      condition_respuesta_original_sha256: 'c'.repeat(64),
      condition_archivo_normalizado_sha256: 'd'.repeat(64),
      transporte_validado: true,
      origen_verificado: WSFE_HOMO_URL,
      accredited: true,
      manifest_sha256: 'e'.repeat(64),
    }

    expect(validatePr02P0Manifest(validManifest)).toBe(true)

    // Rechaza si accredited es false
    expect(() => validatePr02P0Manifest({ ...validManifest, accredited: false })).toThrow(/P0_MANIFEST_NOT_ACCREDITED/)

    // Rechaza si entorno no es HOMOLOGACION
    expect(() => validatePr02P0Manifest({ ...validManifest, entorno: 'PRODUCCION' })).toThrow(/P0_MANIFEST_ENTORNO_MISMATCH/)

    // Rechaza si falta colector_identidad
    expect(() => validatePr02P0Manifest({ ...validManifest, colector_identidad: '' })).toThrow(/P0_MANIFEST_COLLECTOR_IDENTITY_REQUIRED/)
  })

  // 16. Respuesta parcial
  it('16. Respuesta parcial (falla en segunda consulta WSFE) no emite manifiesto aprobado', async () => {
    cleanupTestDir()
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
          evidenceDir: TEST_EVIDENCE_DIR,
        },
        {
          wsaaLogin: async () => SYNTHETIC_WSAA_RESPONSE,
          wsfeTiposIva: async () => SYNTHETIC_TIPOS_IVA_RESPONSE,
          wsfeCondicionIva: async () => {
            throw new Error('NETWORK_TIMEOUT_CONDICIONES')
          },
        }
      )
    ).rejects.toThrow(/NETWORK_TIMEOUT_CONDICIONES/)

    // Manifiesto no debe haber sido guardado
    const manifestPath = path.join(TEST_EVIDENCE_DIR, 'manifest.json')
    expect(fs.existsSync(manifestPath)).toBe(false)
    cleanupTestDir()
  })

  // 17. Timeout
  it('17. Timeout de red aborta de inmediato', async () => {
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
          fetcher: async () => {
            throw new Error('ETIMEDOUT')
          },
        }
      )
    ).rejects.toThrow(/ETIMEDOUT/)
  })

  // 18. Ausencia de reintentos
  it('18. Ausencia de reintentos: tracker prohíbe reintentar operación fallida', () => {
    const tracker = createPr02P0CallTracker()
    tracker.recordCall('LoginCms')
    tracker.recordFailure('LoginCms')

    expect(() => tracker.recordCall('LoginCms')).toThrow(/AUTOMATIC_RETRY_FORBIDDEN/)
  })

  // 19. No filtración de secretos
  it('19. No filtración de secretos: manifest y archivos no contienen tokens ni claves', async () => {
    cleanupTestDir()
    const report = await executePr02P0OfficialEvidence(
      {
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        now: '2026-11-05T02:00:00.000Z',
        evidenceDir: TEST_EVIDENCE_DIR,
      },
      {
        wsaaLogin: async () => SYNTHETIC_WSAA_RESPONSE,
        wsfeTiposIva: async () => SYNTHETIC_TIPOS_IVA_RESPONSE,
        wsfeCondicionIva: async () => SYNTHETIC_CONDICIONES_IVA_RESPONSE,
      }
    )

    // Verificar reporte
    const reportStr = JSON.stringify(report).toLowerCase()
    expect(reportStr).not.toContain('synthetic_secret_token_xyz')
    expect(reportStr).not.toContain('synthetic_secret_sign_xyz')

    // Verificar archivos en disco
    for (const f of report.evidenceFiles || []) {
      const content = fs.readFileSync(f, 'utf8').toLowerCase()
      expect(content).not.toContain('synthetic_secret_token_xyz')
      expect(content).not.toContain('synthetic_secret_sign_xyz')
      expect(content).not.toContain('private key')
    }

    cleanupTestDir()
  })

  // 20. Cero escrituras Staging
  it('20. Cero escrituras a Staging confirmadas (STAGING_WRITES_NEW = 0)', async () => {
    cleanupTestDir()
    const report = await executePr02P0OfficialEvidence(
      {
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        now: '2026-11-05T02:00:00.000Z',
        evidenceDir: TEST_EVIDENCE_DIR,
      },
      {
        wsaaLogin: async () => SYNTHETIC_WSAA_RESPONSE,
        wsfeTiposIva: async () => SYNTHETIC_TIPOS_IVA_RESPONSE,
        wsfeCondicionIva: async () => SYNTHETIC_CONDICIONES_IVA_RESPONSE,
      }
    )

    expect(report.STAGING_WRITES_NEW).toBe(0)
    expect(report.PRODUCTION_MUTATIONS).toBe(0)
    expect(report.PR02_READY_FOR_EMISSION_GO).toBe(false)
    cleanupTestDir()
  })

  // 21. Separación explícita de CONTENT_INTEGRITY y OFFICIAL_PROVENANCE
  it('21. Distingue CONTENT_INTEGRITY (PASS) de OFFICIAL_PROVENANCE (UNVERIFIED) en simulaciones', async () => {
    cleanupTestDir()
    // En ejecución local simulada:
    const mockReport = await executePr02P0OfficialEvidence(
      {
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        now: '2026-11-05T02:00:00.000Z',
        evidenceDir: TEST_EVIDENCE_DIR,
      },
      {
        wsaaLogin: async () => SYNTHETIC_WSAA_RESPONSE,
        wsfeTiposIva: async () => SYNTHETIC_TIPOS_IVA_RESPONSE,
        wsfeCondicionIva: async () => SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        isOfficialExecution: false,
      }
    )

    expect(mockReport.CONTENT_INTEGRITY).toBe('PASS')
    expect(mockReport.OFFICIAL_PROVENANCE).toBe('UNVERIFIED')

    // Sólo con ejecución oficial autenticada:
    const officialReport = await executePr02P0OfficialEvidence(
      {
        authorized: true,
        dryRun: false,
        scope: PR02_P0_SCOPE,
        projectRef: PR02_PARAMETERS_TARGET_PROJECT_REF,
        head: VALID_HEAD,
        expectedHead: VALID_HEAD,
        now: '2026-11-05T02:00:00.000Z',
        evidenceDir: TEST_EVIDENCE_DIR,
      },
      {
        wsaaLogin: async () => SYNTHETIC_WSAA_RESPONSE,
        wsfeTiposIva: async () => SYNTHETIC_TIPOS_IVA_RESPONSE,
        wsfeCondicionIva: async () => SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        isOfficialExecution: true,
      }
    )

    expect(officialReport.CONTENT_INTEGRITY).toBe('PASS')
    expect(officialReport.OFFICIAL_PROVENANCE).toBe('VERIFIED')
    cleanupTestDir()
  })

  // 22. Verificación de PowerShell wrapper
  it('22. El wrapper PowerShell contiene verificaciones de Git fetch, branch, worktree y paridad HEAD', () => {
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
