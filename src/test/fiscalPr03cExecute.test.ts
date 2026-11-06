// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  PR03_C_SCOPE,
  PR03_C1_SCOPE,
  PR03_C2_SCOPE,
  PR03_C_TARGET_PROJECT_REF,
  PR03_C_PROHIBITED_CALLS,
  PR03_C_REQUIRED_CALLS,
  createPr03cCallTracker,
  assertNoProhibitedOperation,
  verifyPr03cPreflight,
  verifyPr03cPostcheck,
  verifyPr03cPostcheckC2,
} from '../../scripts/fiscal/plan-pr03-c-parameters.mjs'
import {
  executePr03cStaging,
  validatePr03cCliArgs,
  resolvePostgresSslConfig,
  checkSoapFault,
  checkWsfeErrors,
  parseWsaaLoginCmsResponse,
  parseWsfeTiposIvaResponse,
  parseWsfeCondicionIvaReceptorResponse,
} from '../../scripts/fiscal/execute-pr03-c-staging.mjs'
import { DOMParser } from '@xmldom/xmldom'

const SYNTHETIC_WSAA_RESPONSE = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><w:loginCmsResponse xmlns:w="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>&lt;loginTicketResponse version="1.0"&gt;&lt;header&gt;&lt;source&gt;CN=wsaa,O=AFIP,C=AR,SERIALNUMBER=CUIT 33693450239&lt;/source&gt;&lt;destination&gt;SERIALNUMBER=CUIT 20415005963,CN=Kiosko Test&lt;/destination&gt;&lt;uniqueId&gt;12345&lt;/uniqueId&gt;&lt;generationTime&gt;2026-11-03T01:00:00Z&lt;/generationTime&gt;&lt;expirationTime&gt;2026-11-03T12:00:00Z&lt;/expirationTime&gt;&lt;/header&gt;&lt;credentials&gt;&lt;token&gt;SYNTHETIC_SECRET_TOKEN_XYZ&lt;/token&gt;&lt;sign&gt;SYNTHETIC_SECRET_SIGN_XYZ&lt;/sign&gt;&lt;/credentials&gt;&lt;/loginTicketResponse&gt;</loginCmsReturn></w:loginCmsResponse></s:Body></s:Envelope>`

const SYNTHETIC_TIPOS_IVA_RESPONSE = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><FEParamGetTiposIvaResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetTiposIvaResult><ResultGet><IvaTipo><Id>5</Id><Desc>21%</Desc><FchDesde>20100917</FchDesde><FchHasta>NULL</FchHasta></IvaTipo><IvaTipo><Id>4</Id><Desc>10.5%</Desc><FchDesde>20100917</FchDesde><FchHasta>NULL</FchHasta></IvaTipo></ResultGet></FEParamGetTiposIvaResult></FEParamGetTiposIvaResponse></soap:Body></soap:Envelope>`

const SYNTHETIC_CONDICIONES_IVA_RESPONSE = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><FEParamGetCondicionIvaReceptorResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetCondicionIvaReceptorResult><ResultGet><CondicionIvaReceptor><Id>1</Id><Desc>IVA Responsable Inscripto</Desc><Cmp_Clase>A/ALEY/C</Cmp_Clase></CondicionIvaReceptor><CondicionIvaReceptor><Id>5</Id><Desc>Consumidor Final</Desc><Cmp_Clase>B/C</Cmp_Clase></CondicionIvaReceptor><CondicionIvaReceptor><Id>10</Id><Desc>IVA Sujeto Exento</Desc><Cmp_Clase>C/49</Cmp_Clase></CondicionIvaReceptor></ResultGet></FEParamGetCondicionIvaReceptorResult></FEParamGetCondicionIvaReceptorResponse></soap:Body></soap:Envelope>`

const SYNTHETIC_BASELINE_ROWS = [
  {
    revision: 1,
    condiciones: [{ id: 1, descripcion: 'IVA Responsable Inscripto', comprobantes: [1, 11] }],
    alicuotas: [{ id: 5, descripcion: '21%' }],
    fuente_sha256: '1111111111111111111111111111111111111111111111111111111111111111',
    consultado_en: '2026-10-26T22:03:33.000Z',
    vence_en: '2026-10-27T02:59:00.000Z',
    habilitado: false,
  },
  {
    revision: 2,
    condiciones: [{ id: 1, descripcion: 'IVA Responsable Inscripto', comprobantes: [1, 11] }],
    alicuotas: [{ id: 5, descripcion: '21%' }],
    fuente_sha256: '2222222222222222222222222222222222222222222222222222222222222222',
    consultado_en: '2026-10-27T10:00:00.000Z',
    vence_en: '2026-10-28T02:59:00.000Z',
    habilitado: false,
  },
]

interface MockPgOptions {
  preflight?: Record<string, unknown>
  postcheck?: Record<string, unknown>
  postcheckC2?: Record<string, unknown>
  rev3Preexisting?: boolean
  expectedFuenteSha256?: string
  issuerEnabled?: boolean
}

function createMockPgClient(opts: MockPgOptions = {}) {
  const executedSql: Array<{ sql: unknown; params?: unknown }> = []
  const preflightData = opts.preflight || {
    transaction_read_only: 'on',
    observed_at: new Date().toISOString(),
    expected_issuer_present: true,
    expected_issuer_enabled: false,
    unexpected_enabled_issuers: 0,
    catalog_rev1_exists: true,
    catalog_rev2_exists: true,
    catalog_rev2_expired: true,
    catalog_rev3_exists: opts.rev3Preexisting ?? false,
    existing_reusable_ta: false,
    baseline_revisions: opts.rev3Preexisting ? [1, 2, 3] : [1, 2],
  }

  const postcheckData = opts.postcheck || {
    transaction_read_only: 'on',
    rev3_exists: true,
    rev3_enabled: false,
    rev3_fuente_sha256: opts.expectedFuenteSha256 || '',
    rev2_exists: true,
    rev2_fuente_sha256: '2222222222222222222222222222222222222222222222222222222222222222',
    expected_issuer_enabled: opts.issuerEnabled ?? false,
  }

  const baselineRows = [...SYNTHETIC_BASELINE_ROWS]
  if (opts.rev3Preexisting) {
    baselineRows.push({
      revision: 3,
      condiciones: [{ id: 1, descripcion: 'IVA Responsable Inscripto', comprobantes: [1, 11] }],
      alicuotas: [{ id: 5, descripcion: '21%' }],
      fuente_sha256: opts.expectedFuenteSha256 || '3333333333333333333333333333333333333333333333333333333333333333',
      consultado_en: '2026-11-03T01:00:00.000Z',
      vence_en: '2026-11-04T01:00:00.000Z',
      habilitado: false,
    })
  }

  return {
    executedSql,
    query: vi.fn(async (sql: unknown, params?: unknown) => {
      executedSql.push({ sql, params })
      if (typeof sql === 'string' && sql.includes('INSERT INTO public.fiscal_parametros_homologacion')) {
        const match = /,'([0-9a-f]{64})',/.exec(sql)
        if (match) postcheckData.rev3_fuente_sha256 = match[1]
      }
      if (typeof sql === 'string' && sql.includes('guard_status')) {
        return { rows: [{ guard_status: 'OK' }] }
      }
      if (typeof sql === 'string' && sql.includes('UPDATE public.fiscal_parametros_homologacion')) {
        postcheckData.rev3_enabled = true
        return { rows: [], rowCount: 1, affectedRows: 1 }
      }
      if (typeof sql === 'string' && sql.includes('postcheck_c2')) {
        return {
          rows: [
            {
              postcheck_c2: opts.postcheckC2 || {
                transaction_read_only: 'on',
                observed_at: new Date().toISOString(),
                rev3_exists: true,
                rev3_enabled: true,
                rev3_fuente_sha256: postcheckData.rev3_fuente_sha256 || opts.expectedFuenteSha256 || '3333333333333333333333333333333333333333333333333333333333333333',
                rev3_valid: true,
                rev2_exists: true,
                rev2_unchanged: true,
                expected_issuer_enabled: opts.issuerEnabled ?? false,
              },
            },
          ],
        }
      }
      if (typeof sql === 'string' && sql.includes('preflight')) {
        return { rows: [{ preflight: preflightData }] }
      }
      if (typeof sql === 'string' && sql.includes('baseline')) {
        return { rows: [{ baseline: baselineRows }] }
      }
      if (typeof sql === 'string' && sql.includes('postcheck')) {
        return { rows: [{ postcheck: postcheckData }] }
      }
      return { rows: [] }
    }),
    end: vi.fn(async () => {}),
  }
}

describe('PR03-C Remote Executor Suite', () => {
  it('1. Dry-run por defecto y sin --authorized no ejecuta llamadas ARCA ni escrituras en Staging', async () => {
    const report = await executePr03cStaging()

    expect(report.PR03_C_REMOTE_EXECUTION_READY).toBe(true)
    expect(report.REAL_LOGINCMS_EXECUTOR).toBe('IMPLEMENTED')
    expect(report.REAL_TIPOS_IVA_EXECUTOR).toBe('IMPLEMENTED')
    expect(report.REAL_CONDICIONES_IVA_EXECUTOR).toBe('IMPLEMENTED')
    expect(report.EXACT_CALL_ALLOWLIST).toBe('PASS')
    expect(report.MAX_ARCA_CALLS).toBe(3)
    expect(report.AUTO_RETRY).toBe(false)
    expect(report.ARCA_CALLS_NEW).toBe(0)
    expect(report.STAGING_WRITES_NEW).toBe(0)
    expect(report.PRODUCTION_MUTATIONS).toBe(0)
    expect(report.PR03_C_REQUIRED_CALLS).toEqual(PR03_C_REQUIRED_CALLS)
    expect(report.HEAD_COMMIT).toBeDefined()
    expect(report.PACKAGE_SHA256).toBeDefined()
  })

  it('2. Rechaza scope incorrecto aun con authorized=true', async () => {
    await expect(
      executePr03cStaging({ authorized: true, scope: 'INVALID_SCOPE', projectRef: PR03_C_TARGET_PROJECT_REF })
    ).rejects.toThrow('PR03_C_SCOPE_MISMATCH')
  })

  it('3. Rechaza project-ref incorrecto aun con authorized=true', async () => {
    await expect(
      executePr03cStaging({ authorized: true, scope: PR03_C_SCOPE, projectRef: 'other_project_ref' })
    ).rejects.toThrow('PR03_C_TARGET_MISMATCH')
  })

  it('4. Operaciones de emisión y comprobantes están bloqueadas e inalcanzables', () => {
    for (const prohibited of PR03_C_PROHIBITED_CALLS) {
      expect(() => assertNoProhibitedOperation(prohibited)).toThrow('PR03_C_PROHIBITED_OPERATION')
    }
  })

  it('5. Validador de CLI parsea y exige flags explícitas cuando se pasa --authorized', () => {
    const defaultArgs = validatePr03cCliArgs([])
    expect(defaultArgs.authorized).toBe(false)
    expect(defaultArgs.dryRun).toBe(true)
    expect(defaultArgs.scope).toBe(PR03_C_SCOPE)
    expect(defaultArgs.projectRef).toBe(PR03_C_TARGET_PROJECT_REF)

    // Sin scope ni project-ref explícitos bajo --authorized debe fallar fail-closed
    expect(() => validatePr03cCliArgs(['--authorized'])).toThrow('PR03_C_CLI_REQUIRED_EXPLICIT_ARGS')

    // Con flags explícitas pasa validación
    const authArgs = validatePr03cCliArgs([
      '--authorized',
      '--scope',
      PR03_C_SCOPE,
      '--project-ref',
      PR03_C_TARGET_PROJECT_REF,
    ])
    expect(authArgs.authorized).toBe(true)
    expect(authArgs.dryRun).toBe(false)
    expect(authArgs.scope).toBe(PR03_C_SCOPE)
    expect(authArgs.projectRef).toBe(PR03_C_TARGET_PROJECT_REF)
  })

  it('6. Ejecución autorizada realiza exactamente 3 llamadas en orden estricto (LoginCms -> IVA -> Condición) e inserta y activa rev 3', async () => {
    const callOrder: string[] = []
    const mockPg = createMockPgClient()

    const wsaaLogin = vi.fn(async () => {
      callOrder.push('LoginCms')
      return SYNTHETIC_WSAA_RESPONSE
    })

    const wsfeTiposIva = vi.fn(async () => {
      callOrder.push('FEParamGetTiposIva')
      return SYNTHETIC_TIPOS_IVA_RESPONSE
    })

    const wsfeCondicionIva = vi.fn(async () => {
      callOrder.push('FEParamGetCondicionIvaReceptor')
      return SYNTHETIC_CONDICIONES_IVA_RESPONSE
    })

    const report = await executePr03cStaging(
      { authorized: true, scope: PR03_C_SCOPE, projectRef: PR03_C_TARGET_PROJECT_REF },
      {
        pgClient: mockPg,
        wsaaLogin,
        wsfeTiposIva,
        wsfeCondicionIva,
        clock: new Date('2026-11-03T02:00:00Z'),
      }
    )

    expect(callOrder).toEqual(['LoginCms', 'FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor'])
    expect(wsaaLogin).toHaveBeenCalledTimes(1)
    expect(wsfeTiposIva).toHaveBeenCalledTimes(1)
    expect(wsfeCondicionIva).toHaveBeenCalledTimes(1)

    expect(report.LOGIN_CMS).toBe('PASS')
    expect(report.TA_CREATED).toBe(true)
    expect(report.TOKEN_PRESENT).toBe(true)
    expect(report.SIGN_PRESENT).toBe(true)
    expect(report.LOGIN_CMS_CALLS).toBe(1)

    expect(report.TIPOS_IVA_QUERY).toBe('PASS')
    expect(report.TIPOS_IVA_COUNT).toBe(2)
    expect(report.TIPOS_IVA_CALLS).toBe(1)

    expect(report.CONDICIONES_IVA_QUERY).toBe('PASS')
    expect(report.CONDICIONES_IVA_COUNT).toBe(3)
    expect(report.CONDICIONES_IVA_CALLS).toBe(1)

    expect(report.ARCA_CALLS_TOTAL).toBe(3)
    expect(report.REVISION_3_INSERT_ONLY).toBe('PASS')
    expect(report.REVISION_3_C2_ENABLE).toBe('PASS')
    expect(report.REVISION_3_ENABLED).toBe(true)
    expect(report.EXPECTED_ISSUER_ENABLED).toBe(false)
    expect(report.REVISION_2_MUTATED).toBe(false)
  })

  it('7. Cuarta llamada ARCA es bloqueada fatalmente por el tracker', () => {
    const tracker = createPr03cCallTracker(false)
    tracker.recordCall('LoginCms')
    tracker.recordCall('FEParamGetTiposIva')
    tracker.recordCall('FEParamGetCondicionIvaReceptor')

    expect(tracker.totalCalls).toBe(3)
    expect(() => tracker.recordCall('FEParamGetTiposIva')).toThrow('PR03_C_CALL_LIMIT_EXCEEDED')
  })

  it('8. Timeout en llamada externa detiene inmediatamente sin retry automático', async () => {
    const wsaaLogin = vi.fn(async () => {
      throw new Error('ETIMEDOUT')
    })
    const wsfeTiposIva = vi.fn()
    const mockPg = createMockPgClient()

    await expect(
      executePr03cStaging(
        { authorized: true, scope: PR03_C_SCOPE, projectRef: PR03_C_TARGET_PROJECT_REF },
        { pgClient: mockPg, wsaaLogin, wsfeTiposIva }
      )
    ).rejects.toThrow('ETIMEDOUT')

    expect(wsaaLogin).toHaveBeenCalledTimes(1)
    expect(wsfeTiposIva).not.toHaveBeenCalled()
  })

  it('9. SOAP Fault en respuesta detiene inmediatamente sin retry', () => {
    const faultXml = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>soap:Server</faultcode><faultstring>Error interno</faultstring></s:Fault></s:Body></s:Envelope>`
    expect(() => parseWsaaLoginCmsResponse(faultXml)).toThrow('WSAA_FAULT:soap:Server')

    const doc = new DOMParser({ onError: () => {} }).parseFromString(faultXml, 'text/xml')
    expect(() => checkSoapFault(doc, 'WSAA')).toThrow('WSAA_FAULT:soap:Server')
  })

  it('10. WSFE Business Error detiene inmediatamente sin retry', () => {
    const errorXml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><FEParamGetTiposIvaResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetTiposIvaResult><Errors><Err><Code>10001</Code><Msg>Error autenticacion</Msg></Err></Errors></FEParamGetTiposIvaResult></FEParamGetTiposIvaResponse></soap:Body></soap:Envelope>`
    expect(() => parseWsfeTiposIvaResponse(errorXml)).toThrow('WSFE_BUSINESS:10001')

    const doc = new DOMParser({ onError: () => {} }).parseFromString(errorXml, 'text/xml')
    expect(() => checkWsfeErrors(doc)).toThrow('WSFE_BUSINESS:10001')

    const parsedCond = parseWsfeCondicionIvaReceptorResponse(SYNTHETIC_CONDICIONES_IVA_RESPONSE)
    expect(parsedCond.count).toBe(3)
  })

  it('11. Token y Sign nunca aparecen en reportes ni cadenas serializadas', async () => {
    const mockPg = createMockPgClient()
    const report = await executePr03cStaging(
      { authorized: true, scope: PR03_C_SCOPE, projectRef: PR03_C_TARGET_PROJECT_REF },
      {
        pgClient: mockPg,
        wsaaLogin: async () => SYNTHETIC_WSAA_RESPONSE,
        wsfeTiposIva: async () => SYNTHETIC_TIPOS_IVA_RESPONSE,
        wsfeCondicionIva: async () => SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        clock: new Date('2026-11-03T02:00:00Z'),
      }
    )

    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain('SYNTHETIC_SECRET_TOKEN_XYZ')
    expect(serialized).not.toContain('SYNTHETIC_SECRET_SIGN_XYZ')
    expect(report.TOKEN_PRESENT).toBe(true)
    expect(report.SIGN_PRESENT).toBe(true)
  })

  it('12. Revisión 3 preexistente en preflight bloquea la ejecución de C1 antes de ARCA', async () => {
    const mockPg = createMockPgClient({ rev3Preexisting: true })
    const wsaaLogin = vi.fn()

    await expect(
      executePr03cStaging(
        { authorized: true, scope: PR03_C1_SCOPE, projectRef: PR03_C_TARGET_PROJECT_REF },
        { pgClient: mockPg, wsaaLogin }
      )
    ).rejects.toThrow('PR03_C_PREFLIGHT_CATALOG_REV3_ALREADY_EXISTS')

    expect(wsaaLogin).not.toHaveBeenCalled()

    expect(() =>
      verifyPr03cPreflight({
        transaction_read_only: 'on',
        expected_issuer_present: true,
        expected_issuer_enabled: false,
        unexpected_enabled_issuers: 0,
        catalog_rev1_exists: true,
        catalog_rev2_exists: true,
        catalog_rev2_expired: true,
        catalog_rev3_exists: true,
        existing_reusable_ta: false,
        baseline_revisions: [1, 2, 3],
      })
    ).toThrow('PR03_C_PREFLIGHT_CATALOG_REV3_ALREADY_EXISTS')
  })

  it('13. Postcheck verifica que emisor continúa inactivo y hash de revisión 3 coincide', () => {
    const postcheckOk = {
      transaction_read_only: 'on',
      rev3_exists: true,
      rev3_enabled: false,
      rev3_fuente_sha256: 'abc123',
      rev2_exists: true,
      rev2_fuente_sha256: '2222',
      expected_issuer_enabled: false,
    }
    expect(verifyPr03cPostcheck(postcheckOk, { fuenteSha256: 'abc123' }).status).toBe('PASS')

    const postcheckIssuerActive = { ...postcheckOk, expected_issuer_enabled: true }
    expect(() => verifyPr03cPostcheck(postcheckIssuerActive)).toThrow('PR03_C_POSTCHECK_ISSUER_ENABLED')

    const postcheckHashMismatch = { ...postcheckOk, rev3_fuente_sha256: 'wrong_hash' }
    expect(() => verifyPr03cPostcheck(postcheckHashMismatch, { fuenteSha256: 'abc123' })).toThrow('PR03_C_POSTCHECK_REV3_HASH_MISMATCH')

    const postcheckC2Ok = {
      transaction_read_only: 'on',
      rev3_exists: true,
      rev3_enabled: true,
      rev3_valid: true,
      rev3_fuente_sha256: 'abc123',
      rev2_exists: true,
      rev2_unchanged: true,
      expected_issuer_enabled: false,
    }
    expect(verifyPr03cPostcheckC2(postcheckC2Ok, { fuenteSha256: 'abc123' }).status).toBe('PASS')
  })

  it('14. Subproceso real: dry-run por defecto, rechazo si falta scope/project, y entrada autorizada interceptada', () => {
    // 1. Dry run
    const dryRunRes = spawnSync('node', ['scripts/fiscal/execute-pr03-c-staging.mjs'], { encoding: 'utf8' })
    expect(dryRunRes.status).toBe(0)
    const dryJson = JSON.parse(dryRunRes.stdout)
    expect(dryJson.PR03_C_REMOTE_EXECUTION_READY).toBe(true)
    expect(dryJson.ARCA_CALLS_NEW).toBe(0)
    expect(dryJson.STAGING_WRITES_NEW).toBe(0)

    // 2. --authorized sin flags explícitas
    const authMissingRes = spawnSync('node', ['scripts/fiscal/execute-pr03-c-staging.mjs', '--authorized'], {
      encoding: 'utf8',
    })
    expect(authMissingRes.status).toBe(1)
    expect(authMissingRes.stderr).toContain('PR03_C_CLI_REQUIRED_EXPLICIT_ARGS')

    // 3. --authorized con flags explícitas entra al camino autorizado y es interceptado antes de red real
    const authAttemptRes = spawnSync(
      'node',
      [
        'scripts/fiscal/execute-pr03-c-staging.mjs',
        '--authorized',
        '--scope',
        PR03_C_SCOPE,
        '--project-ref',
        PR03_C_TARGET_PROJECT_REF,
      ],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: '' } }
    )
    expect(authAttemptRes.status).toBe(1)
    expect(authAttemptRes.stderr).toContain('PR03_C_FATAL_ERROR=PR03_C_DB_PASSWORD_REQUIRED')
  })

  it('15. Verificación estricta de TLS: rechaza rejectUnauthorized: false y exige CA', () => {
    expect(() => resolvePostgresSslConfig({ ssl: { rejectUnauthorized: false } })).toThrow(
      'PR03_C_TLS_INSECURE_REJECTED'
    )
    const validSsl = resolvePostgresSslConfig()
    expect(validSsl.rejectUnauthorized).toBe(true)
    expect(validSsl.ca).toContain('BEGIN CERTIFICATE')
  })

  it('16. Separación PR03-C1: realiza llamadas ARCA pero NO activa catálogo (rev 3 inactiva)', async () => {
    const mockPg = createMockPgClient()
    const report = await executePr03cStaging(
      { authorized: true, scope: PR03_C1_SCOPE, projectRef: PR03_C_TARGET_PROJECT_REF },
      {
        pgClient: mockPg,
        wsaaLogin: async () => SYNTHETIC_WSAA_RESPONSE,
        wsfeTiposIva: async () => SYNTHETIC_TIPOS_IVA_RESPONSE,
        wsfeCondicionIva: async () => SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        clock: new Date('2026-11-03T02:00:00Z'),
      }
    )

    expect(report.SCOPE).toBe(PR03_C1_SCOPE)
    expect(report.ARCA_CALLS_TOTAL).toBe(3)
    expect(report.REVISION_3_INSERT_ONLY).toBe('PASS')
    expect(report.REVISION_3_C2_ENABLE).toBe('NOT_RUN')
    expect(report.REVISION_3_ENABLED).toBe(false)
    expect(report.EXPECTED_ISSUER_ENABLED).toBe(false)
  })

  it('17. Separación PR03-C2: realiza ZERO llamadas ARCA y activa catálogo preexistente', async () => {
    const mockPg = createMockPgClient({ rev3Preexisting: true })
    const report = await executePr03cStaging(
      { authorized: true, scope: PR03_C2_SCOPE, projectRef: PR03_C_TARGET_PROJECT_REF },
      {
        pgClient: mockPg,
        clock: new Date('2026-11-03T02:00:00Z'),
      }
    )

    expect(report.SCOPE).toBe(PR03_C2_SCOPE)
    expect(report.ARCA_CALLS_TOTAL).toBe(0)
    expect(report.LOGIN_CMS).toBe('NOT_RUN')
    expect(report.TIPOS_IVA_QUERY).toBe('NOT_RUN')
    expect(report.CONDICIONES_IVA_QUERY).toBe('NOT_RUN')
    expect(report.REVISION_3_C2_ENABLE).toBe('PASS')
    expect(report.REVISION_3_ENABLED).toBe(true)
    expect(report.EXPECTED_ISSUER_ENABLED).toBe(false)
  })

  it('18. Modo resume (--resume-existing-revision3) omite llamadas ARCA y pasa directamente a C2', async () => {
    const mockPg = createMockPgClient({ rev3Preexisting: true })
    const report = await executePr03cStaging(
      {
        authorized: true,
        scope: PR03_C_SCOPE,
        projectRef: PR03_C_TARGET_PROJECT_REF,
        resumeExistingRevision3: true,
      },
      {
        pgClient: mockPg,
        clock: new Date('2026-11-03T02:00:00Z'),
      }
    )

    expect(report.ARCA_CALLS_TOTAL).toBe(0)
    expect(report.REVISION_3_DB_INSERT).toBe('SKIPPED_RESUME')
    expect(report.REVISION_3_C2_ENABLE).toBe('PASS')
    expect(report.REVISION_3_ENABLED).toBe(true)
  })

  it('19. Reutilización de TA: si TA es reutilizable con credenciales en memoria, LOGIN_CMS_CALLS es 0', async () => {
    const mockPg = createMockPgClient()
    const wsaaLogin = vi.fn()
    const wsfeTiposIva = vi.fn(async () => SYNTHETIC_TIPOS_IVA_RESPONSE)
    const wsfeCondicionIva = vi.fn(async () => SYNTHETIC_CONDICIONES_IVA_RESPONSE)

    const existingTaRecord = {
      estado: 'DISPONIBLE',
      servicio: 'wsfe',
      valido: true,
      vence_en: '2026-11-03T16:00:00Z',
      token: 'EXISTING_VALID_TOKEN',
      sign: 'EXISTING_VALID_SIGN',
      hasCredentials: true,
    }

    const report = await executePr03cStaging(
      { authorized: true, scope: PR03_C_SCOPE, projectRef: PR03_C_TARGET_PROJECT_REF },
      {
        pgClient: mockPg,
        existingTaRecord,
        wsaaLogin,
        wsfeTiposIva,
        wsfeCondicionIva,
        clock: new Date('2026-11-03T02:00:00Z'),
      }
    )

    expect(wsaaLogin).not.toHaveBeenCalled()
    expect(report.LOGIN_CMS_CALLS).toBe(0)
    expect(report.LOGIN_CMS).toBe('REUSED')
    expect(report.ARCA_CALLS_TOTAL).toBe(2)
  })

  it('20. Registro de evidencia BEFORE y AFTER con cierre de conexión PostgreSQL', async () => {
    const mockPg = createMockPgClient()
    const report = await executePr03cStaging(
      { authorized: true, scope: PR03_C_SCOPE, projectRef: PR03_C_TARGET_PROJECT_REF },
      {
        pgClient: mockPg,
        wsaaLogin: async () => SYNTHETIC_WSAA_RESPONSE,
        wsfeTiposIva: async () => SYNTHETIC_TIPOS_IVA_RESPONSE,
        wsfeCondicionIva: async () => SYNTHETIC_CONDICIONES_IVA_RESPONSE,
        clock: new Date('2026-11-03T02:00:00Z'),
      }
    )

    expect(report.REV2_HASH_BEFORE).toBe('2222222222222222222222222222222222222222222222222222222222222222')
    expect(report.CATALOG_REVISIONS_BEFORE).toEqual([1, 2])
    expect(report.ISSUER_ENABLED_BEFORE).toBe(false)

    expect(report.CATALOG_REVISIONS_AFTER_C1).toEqual([1, 2, 3])
    expect(report.REV3_ENABLED_AFTER_C1).toBe(false)

    expect(report.CATALOG_REVISIONS_AFTER_C2).toEqual([1, 2, 3])
    expect(report.REV3_ENABLED_AFTER_C2).toBe(true)

    expect(report.PG_CONNECTION_CLOSED).toBe('NOT_APPLICABLE') // en deps.pgClient mock
  })

  it('21. Anclaje de timestamp al reloj del servidor: propaga preflight observed_at a la propuesta canónica para prevenir CATALOG_PROPOSAL_EXPIRED bajo clock skew', async () => {
    const serverTimestamp = '2026-11-03T02:30:00.000Z'
    const mockPg = createMockPgClient({
      preflight: {
        transaction_read_only: 'on',
        observed_at: serverTimestamp,
        expected_issuer_present: true,
        expected_issuer_enabled: false,
        unexpected_enabled_issuers: 0,
        catalog_rev1_exists: true,
        catalog_rev2_exists: true,
        catalog_rev2_expired: true,
        catalog_rev3_exists: false,
        existing_reusable_ta: false,
        baseline_revisions: [1, 2],
      },
    })

    const report = await executePr03cStaging(
      { authorized: true, scope: PR03_C1_SCOPE, projectRef: PR03_C_TARGET_PROJECT_REF },
      {
        pgClient: mockPg,
        wsaaLogin: async () => SYNTHETIC_WSAA_RESPONSE,
        wsfeTiposIva: async () => SYNTHETIC_TIPOS_IVA_RESPONSE,
        wsfeCondicionIva: async () => SYNTHETIC_CONDICIONES_IVA_RESPONSE,
      }
    )

    expect(report.SCOPE).toBe(PR03_C1_SCOPE)
    expect(report.REVISION_3_INSERT_ONLY).toBe('PASS')

    // Verificar que el SQL generado contiene consultado_en anclado al servidor
    const insertQueryObj = mockPg.executedSql.find(
      (entry: { sql: unknown }) =>
        typeof entry.sql === 'string' && entry.sql.includes('INSERT INTO public.fiscal_parametros_homologacion')
    )
    expect(insertQueryObj).toBeDefined()
    const sql = String(insertQueryObj?.sql)
    expect(sql).toContain(`'${serverTimestamp}'::timestamptz`)
    expect(sql).toContain("DO $catalog_guard$")
    expect(sql).toContain(`IF clock_timestamp()<'${serverTimestamp}'::timestamptz`)
  })

  it('22. Ejecución C2 reporta CATALOG_ENABLE_ROWS_AFFECTED = 1 y ejecuta guard previo sin error de prepared statement múltiple', async () => {
    const mockPg = createMockPgClient({ rev3Preexisting: true })
    const report = await executePr03cStaging(
      { authorized: true, scope: PR03_C2_SCOPE, projectRef: PR03_C_TARGET_PROJECT_REF },
      {
        pgClient: mockPg,
        clock: new Date('2026-11-03T02:00:00Z'),
      }
    )

    expect(report.SCOPE).toBe(PR03_C2_SCOPE)
    expect(report.REVISION_3_C2_ENABLE).toBe('PASS')
    expect(report.REVISION_3_ENABLED).toBe(true)
    expect(report.CATALOG_ENABLE_ROWS_AFFECTED).toBe(1)

    // Verificar que se invocó guard_status y luego UPDATE
    const guardCall = mockPg.executedSql.find(
      (entry: { sql: unknown }) => typeof entry.sql === 'string' && entry.sql.includes('guard_status')
    )
    expect(guardCall).toBeDefined()

    const updateCall = mockPg.executedSql.find(
      (entry: { sql: unknown }) => typeof entry.sql === 'string' && entry.sql.includes('UPDATE public.fiscal_parametros_homologacion')
    )
    expect(updateCall).toBeDefined()
  })
})
