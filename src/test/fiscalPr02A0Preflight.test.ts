// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  PR02_A0_SCOPE,
  PR02_A0_EXECUTION_TARGET,
  PR02_TARGET_KIOSK_ID,
  PR02_TARGET_CUIT,
  PR02_TARGET_PV,
  PR02_TARGET_RECEIPT_TYPE,
  PR02_TARGET_CERT_SHA256,
  PR02_EXPECTED_CATALOG_REVISION,
  PR02_CATALOG_REV3_HASH,
  assertNoForbiddenCredentials,
  validatePr02A0CliArgs,
  runPr02A0PreflightQueries,
  executePr02A0Staging,
} from '../../scripts/fiscal/execute-pr02-a0-staging.mjs'

const VALID_HEAD = '8e5be9ef8f74eca0cd639661d23645bb9637d2c0'
const PREVIOUS_HEAD = '0f1a29a5bfe112749e715e4bd2f340c493d08e0f'
const ARBITRARY_HEAD = '1111111111111111111111111111111111111111'

afterEach(() => {
  vi.restoreAllMocks()
})

function createMockClient(options: {
  roValue?: string
  emitterRow?: Record<string, unknown> | null
  enabledEmittersCount?: number
  catalogRow?: Record<string, unknown> | null
  reservations?: Record<string, unknown>[]
  consumedPermits?: Record<string, unknown>[]
  intent042Rows?: Record<string, unknown>[]
  candidateSales?: Record<string, unknown>[]
  rollbackFails?: boolean
  endFails?: boolean
} = {}) {
  const executedQueries: { sql: string; params?: unknown[] }[] = []

  const {
    roValue = 'on',
    emitterRow = {
      kiosco_id: PR02_TARGET_KIOSK_ID,
      cuit_emisor: PR02_TARGET_CUIT,
      punto_venta: PR02_TARGET_PV,
      credencial_id: '550e8400-e29b-41d4-a716-446655440000',
      certificado_sha256: PR02_TARGET_CERT_SHA256,
      revision: 1,
      habilitado: false,
    },
    enabledEmittersCount = 0,
    catalogRow = {
      revision: PR02_EXPECTED_CATALOG_REVISION,
      fuente_sha256: PR02_CATALOG_REV3_HASH,
      consultado_en: new Date(Date.now() - 3600000).toISOString(),
      vence_en: new Date(Date.now() + 86400000).toISOString(),
      habilitado: true,
      valid_now: true,
      is_expired: false,
      server_now: new Date().toISOString(),
    },
    reservations = [],
    consumedPermits = [],
    intent042Rows = [],
    candidateSales = [
      {
        id: '660e8400-e29b-41d4-a716-446655440001',
        total: '150.00',
        fecha_hora: '2026-11-03T10:00:00.000Z',
        detail_count: 2,
        detail_sum: '150.00',
        has_returns: false,
        has_fiscal_op: false,
        has_uncertain_intent: false,
        has_afip_cae: false,
      },
    ],
    rollbackFails = false,
    endFails = false,
  } = options

  const client = {
    connect: vi.fn(async () => {}),
    end: vi.fn(async () => {
      if (endFails) {
        throw new Error('CONNECTION_SOCKET_HANGUP: Falló client.end()')
      }
    }),
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      executedQueries.push({ sql, params })

      if (sql.includes('ROLLBACK')) {
        if (rollbackFails) {
          throw new Error('PG_ROLLBACK_SOCKET_CLOSED: Falló el comando ROLLBACK')
        }
        return { rows: [] }
      }
      if (sql.includes('transaction_read_only')) {
        return { rows: [{ ro: roValue }] }
      }
      if (sql.includes('public.fiscal_emisores_homologacion') && sql.includes('WHERE kiosco_id = $1')) {
        return { rows: emitterRow ? [emitterRow] : [] }
      }
      if (sql.includes('public.fiscal_emisores_homologacion') && sql.includes('WHERE habilitado = true')) {
        return { rows: [{ enabled_count: enabledEmittersCount }] }
      }
      if (sql.includes('public.fiscal_parametros_homologacion')) {
        return { rows: catalogRow ? [catalogRow] : [] }
      }
      if (sql.includes('LEFT JOIN public.fiscal_respuestas_emision_homologacion')) {
        return { rows: intent042Rows }
      }
      if (sql.includes('public.fiscal_reservas_homologacion') && sql.includes('WHERE cuit_emisor = $1')) {
        return { rows: reservations }
      }
      if (sql.includes('public.fiscal_permisos_emision_homologacion')) {
        return { rows: consumedPermits }
      }
      if (sql.includes('FROM public.ventas v')) {
        return { rows: candidateSales }
      }
      return { rows: [] }
    }),
    executedQueries,
  }

  return client
}

describe('PR02-A0 Staging READ ONLY Preflight Tests', () => {
  describe('1. Dry-run sin conexión ni PASS remotos ficticios', () => {
    it('ejecuta en dry-run sin abrir sockets y reporta NOT_RUN en comprobaciones remotas', async () => {
      expect(PR02_TARGET_RECEIPT_TYPE).toBe(11)
      const res = await executePr02A0Staging({ dryRun: true })

      expect(res.execution).toBe('DRY_RUN')
      expect(res.scope).toBe(PR02_A0_SCOPE)
      expect(res.projectRef).toBe(PR02_A0_EXECUTION_TARGET)
      expect(res.PR02_A0_LOCAL_PREPARATION).toBe('PASS')
      expect(res.PR02_A0_REMOTE_EXECUTION_READY).toBe(true)
      expect(res.PR02_A0_REMOTE_EXECUTED).toBe(false)

      // Comprobaciones hospedadas no ejecutadas reportan NOT_RUN
      expect(res.DRY_RUN_REMOTE_CHECKS).toBe('NOT_RUN')
      expect(res.SQL_READ_ONLY_VERIFICATION).toBe('NOT_RUN')
      expect(res.TLS_REMOTE_VERIFICATION).toBe('NOT_RUN')
      expect(res.CATALOG_REMOTE_VERIFICATION).toBe('NOT_RUN')
      expect(res.HISTORY_REMOTE_VERIFICATION).toBe('NOT_RUN')
      expect(res.PR02_A0_READ_ONLY_GUARD).toBe('NOT_RUN')
      expect(res.PR02_A0_TLS_GUARD).toBe('NOT_RUN')
      expect(res.PR02_A0_ROLLBACK_GUARD).toBe('NOT_RUN')
      expect(res.PR02_A0_CONNECTION_CLOSE).toBe('NOT_RUN')
      expect(res.PR02_A0_CATALOG_GUARD).toBe('NOT_RUN')
      expect(res.PR02_A0_REAL_PV2_GUARD).toBe('NOT_RUN')
      expect(res.PR02_A0_HISTORY_GUARD).toBe('NOT_RUN')
      expect(res.HISTORICAL_042_IDENTIFICATION).toBe('UNRESOLVED')

      expect(res.PR02_A0_CANDIDATE_AUTO_SELECTION).toBe(false)
      expect(res.PR02_A0_ARCA_REACHABLE).toBe(false)
      expect(res.TA_STATUS).toBe('NOT_CHECKED_IN_A0')
      expect(res.OFFICIAL_NUMBERING).toBe('NOT_OBSERVED_IN_A0')
      expect(res.EMISSION_PERMISSION).toBe('DISABLED')
      expect(res.ARCA_CALLS_NEW).toBe(0)
      expect(res.STAGING_WRITES_NEW).toBe(0)
      expect(res.PRODUCTION_MUTATIONS).toBe(0)
    })
  })

  describe('2. Argumentos CLI y programáticos: Fail-Closed y anti-contradicción', () => {
    it('rechaza contradictoriamente --authorized con --dry-run en CLI', () => {
      expect(() => {
        validatePr02A0CliArgs(['--authorized', '--dry-run'])
      }).toThrow('CLI_ARGUMENT_CONFLICT')
    })

    it('rechaza contradictoriamente authorized: true con dryRun: true en API programática', async () => {
      await expect(
        executePr02A0Staging({ authorized: true, dryRun: true })
      ).rejects.toThrow('CLI_ARGUMENT_CONFLICT')
    })

    it('rechaza argumentos CLI desconocidos o no permitidos', () => {
      expect(() => {
        validatePr02A0CliArgs(['--unknown-flag'])
      }).toThrow('INVALID_CLI_ARGUMENT')
    })

    it('rechaza argumentos CLI duplicados', () => {
      expect(() => {
        validatePr02A0CliArgs([
          '--authorized',
          '--scope', PR02_A0_SCOPE,
          '--scope', PR02_A0_SCOPE,
        ])
      }).toThrow('DUPLICATE_CLI_ARGUMENT')
    })

    it('rechaza scope incorrecto en CLI y programático', async () => {
      expect(() => {
        validatePr02A0CliArgs([
          '--authorized',
          '--scope', 'PR03_B_STAGING_ACCEPTANCE',
          '--project-ref', PR02_A0_EXECUTION_TARGET,
          '--head', VALID_HEAD,
          '--expected-head', VALID_HEAD,
        ])
      }).toThrow('INVALID_SCOPE')

      await expect(
        executePr02A0Staging({
          authorized: true,
          dryRun: false,
          scope: 'WRONG_SCOPE',
          projectRef: PR02_A0_EXECUTION_TARGET,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          password: 'Pass',
        })
      ).rejects.toThrow('INVALID_SCOPE')
    })

    it('rechaza project-ref incorrecto en CLI y programático', async () => {
      expect(() => {
        validatePr02A0CliArgs([
          '--authorized',
          '--scope', PR02_A0_SCOPE,
          '--project-ref', 'wrong-project-ref',
          '--head', VALID_HEAD,
          '--expected-head', VALID_HEAD,
        ])
      }).toThrow('INVALID_PROJECT_REF')

      await expect(
        executePr02A0Staging({
          authorized: true,
          dryRun: false,
          scope: PR02_A0_SCOPE,
          projectRef: 'wrong-ref',
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          password: 'Pass',
        })
      ).rejects.toThrow('INVALID_PROJECT_REF')
    })

    it('rechaza ejecución autorizada sin --head o sin --expected-head', async () => {
      expect(() => {
        validatePr02A0CliArgs([
          '--authorized',
          '--scope', PR02_A0_SCOPE,
          '--project-ref', PR02_A0_EXECUTION_TARGET,
        ])
      }).toThrow('MISSING_CLI_ARGUMENT')

      await expect(
        executePr02A0Staging({
          authorized: true,
          dryRun: false,
          scope: PR02_A0_SCOPE,
          projectRef: PR02_A0_EXECUTION_TARGET,
          password: 'Pass',
        })
      ).rejects.toThrow('MISSING_CLI_ARGUMENT')
    })

    it('rechaza discrepancia entre HEAD y expectedHead (incluyendo SHA anterior)', () => {
      expect(() => {
        validatePr02A0CliArgs([
          '--authorized',
          '--scope', PR02_A0_SCOPE,
          '--project-ref', PR02_A0_EXECUTION_TARGET,
          '--head', VALID_HEAD,
          '--expected-head', PREVIOUS_HEAD,
        ])
      }).toThrow('HEAD_MISMATCH')

      expect(() => {
        validatePr02A0CliArgs([
          '--authorized',
          '--scope', PR02_A0_SCOPE,
          '--project-ref', PR02_A0_EXECUTION_TARGET,
          '--head', ARBITRARY_HEAD,
          '--expected-head', VALID_HEAD,
        ])
      }).toThrow('HEAD_MISMATCH')
    })
  })

  describe('3. TLS inválido rechazado', () => {
    it('falla cerrado si la ruta del certificado CA no existe o es ilegible', async () => {
      await expect(
        executePr02A0Staging(
          {
            authorized: true,
            dryRun: false,
            scope: PR02_A0_SCOPE,
            projectRef: PR02_A0_EXECUTION_TARGET,
            head: VALID_HEAD,
            expectedHead: VALID_HEAD,
            caCertPath: 'C:\\inexistent\\path\\to\\ca.crt',
            password: 'ValidPassword123!',
          },
          {}
        )
      ).rejects.toThrow('TLS_CA_CERT_INVALID')
    })
  })

  describe('4. Transacción READ ONLY obligatoria', () => {
    it('inicia con BEGIN REPEATABLE READ READ ONLY y verifica transaction_read_only = on', async () => {
      const client = createMockClient({ roValue: 'on' })
      const res = await runPr02A0PreflightQueries(client)

      expect(res.PR02_A0_READ_ONLY_GUARD).toBe('PASS')
      expect(client.executedQueries[0].sql).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;')
      expect(client.executedQueries[1].sql).toContain("current_setting('transaction_read_only')")
    })

    it('falla cerrado si transaction_read_only no es on', async () => {
      const client = createMockClient({ roValue: 'off' })
      await expect(runPr02A0PreflightQueries(client)).rejects.toThrow('READ_ONLY_GUARD_FAILED')
    })
  })

  describe('5. ROLLBACK obligatorio y verificable', () => {
    it('ejecuta ROLLBACK tras éxito de las consultas preflight', async () => {
      const client = createMockClient()
      await runPr02A0PreflightQueries(client)

      const lastQuery = client.executedQueries[client.executedQueries.length - 1]
      expect(lastQuery.sql).toBe('ROLLBACK;')
    })

    it('falla y marca PR02_A0_ROLLBACK_GUARD = FAIL si el comando ROLLBACK falla tras consultas exitosas', async () => {
      const client = createMockClient({ rollbackFails: true })

      let caughtErr: any
      try {
        await runPr02A0PreflightQueries(client)
      } catch (err) {
        caughtErr = err
      }

      expect(caughtErr).toBeDefined()
      expect(caughtErr.message).toContain('ROLLBACK_GUARD_FAILED')
      expect(caughtErr.PR02_A0_ROLLBACK_GUARD).toBe('FAIL')
    })

    it('preserva ambas causas y marca PR02_A0_ROLLBACK_GUARD = FAIL si una consulta y el ROLLBACK fallan simultáneamente', async () => {
      const client = createMockClient({
        catalogRow: null, // Causará CATALOG_REV3_MISSING
        rollbackFails: true, // Causará fallo de ROLLBACK en finally
      })

      let caughtErr: any
      try {
        await runPr02A0PreflightQueries(client)
      } catch (err) {
        caughtErr = err
      }

      expect(caughtErr).toBeDefined()
      expect(caughtErr.message).toContain('PREFLIGHT_QUERY_AND_ROLLBACK_FAILED')
      expect(caughtErr.message).toContain('CATALOG_REV3_MISSING')
      expect(caughtErr.message).toContain('PG_ROLLBACK_SOCKET_CLOSED')
      expect(caughtErr.PR02_A0_ROLLBACK_GUARD).toBe('FAIL')
    })
  })

  describe('6. Cierre obligatorio de PostgreSQL (client.end)', () => {
    it('completa client.end() exitosamente y devuelve PASS únicamente después del cierre', async () => {
      const client = createMockClient()

      const report = await executePr02A0Staging(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_A0_SCOPE,
          projectRef: PR02_A0_EXECUTION_TARGET,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          password: 'ValidPostgresPassword123!',
        },
        { client, caCert: 'MOCK_CA_CERT' }
      )

      expect(client.connect).toHaveBeenCalledTimes(1)
      expect(client.end).toHaveBeenCalledTimes(1)
      expect(report.PR02_A0_CONNECTION_CLOSE).toBe('PASS')
      expect(report.PR02_A0_ROLLBACK_GUARD).toBe('PASS')
    })

    it('falla con PG_CLOSE_FAILED si client.end() falla tras consultas exitosas', async () => {
      const client = createMockClient({ endFails: true })

      let caughtErr: any
      try {
        await executePr02A0Staging(
          {
            authorized: true,
            dryRun: false,
            scope: PR02_A0_SCOPE,
            projectRef: PR02_A0_EXECUTION_TARGET,
            head: VALID_HEAD,
            expectedHead: VALID_HEAD,
            password: 'ValidPostgresPassword123!',
          },
          { client, caCert: 'MOCK_CA_CERT' }
        )
      } catch (err) {
        caughtErr = err
      }

      expect(caughtErr).toBeDefined()
      expect(caughtErr.message).toContain('PG_CLOSE_FAILED')
      expect(caughtErr.PR02_A0_CONNECTION_CLOSE).toBe('FAIL')
      expect(caughtErr.PR02_A0_EXECUTION).toBe('FAIL')
    })

    it('falla con PR02_A0_EXECUTION_AND_CLOSE_FAILED si las consultas y client.end() fallan conjuntamente', async () => {
      const client = createMockClient({
        catalogRow: null, // Fallo de preflight
        endFails: true,   // Fallo de cierre
      })

      let caughtErr: any
      try {
        await executePr02A0Staging(
          {
            authorized: true,
            dryRun: false,
            scope: PR02_A0_SCOPE,
            projectRef: PR02_A0_EXECUTION_TARGET,
            head: VALID_HEAD,
            expectedHead: VALID_HEAD,
            password: 'ValidPostgresPassword123!',
          },
          { client, caCert: 'MOCK_CA_CERT' }
        )
      } catch (err) {
        caughtErr = err
      }

      expect(caughtErr).toBeDefined()
      expect(caughtErr.message).toContain('PR02_A0_EXECUTION_AND_CLOSE_FAILED')
      expect(caughtErr.PR02_A0_CONNECTION_CLOSE).toBe('FAIL')
      expect(caughtErr.PR02_A0_EXECUTION).toBe('FAIL')
    })
  })

  describe('7. Vigencia de catálogo: distingue auditoría completada de preparación operativa bloqueada', () => {
    it('si el catálogo ha vencido, completa auditoría READ ONLY pero bloquea preparación operativa', async () => {
      const client = createMockClient({
        catalogRow: {
          revision: 3,
          fuente_sha256: PR02_CATALOG_REV3_HASH,
          habilitado: true,
          valid_now: false,
          is_expired: true,
          server_now: new Date().toISOString(),
        },
      })

      const report = await executePr02A0Staging(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_A0_SCOPE,
          projectRef: PR02_A0_EXECUTION_TARGET,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          password: 'ValidPostgresPassword123!',
        },
        { client, caCert: 'MOCK_CA_CERT' }
      )

      expect(report.PR02_A0_READ_ONLY_AUDIT).toBe('EXECUTED')
      expect(report.PR02_A0_OPERATIONAL_READINESS).toBe('BLOCKED_CATALOG_EXPIRED')
      expect(report.PR02_A0_REMOTE_EXECUTION_READY).toBe(false)
      expect(report.PR02_A0_CATALOG_GUARD).toBe('EXPIRED')
      expect(report.candidate_sales_count).toBe(1)
    })

    it('si el catálogo está vigente, completa auditoría y reporta READY', async () => {
      const client = createMockClient({
        catalogRow: {
          revision: 3,
          fuente_sha256: PR02_CATALOG_REV3_HASH,
          habilitado: true,
          valid_now: true,
          is_expired: false,
          server_now: new Date().toISOString(),
        },
      })

      const report = await executePr02A0Staging(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_A0_SCOPE,
          projectRef: PR02_A0_EXECUTION_TARGET,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          password: 'ValidPostgresPassword123!',
        },
        { client, caCert: 'MOCK_CA_CERT' }
      )

      expect(report.PR02_A0_READ_ONLY_AUDIT).toBe('EXECUTED')
      expect(report.PR02_A0_OPERATIONAL_READINESS).toBe('READY')
      expect(report.PR02_A0_REMOTE_EXECUTION_READY).toBe(true)
      expect(report.PR02_A0_CATALOG_GUARD).toBe('PASS')
    })

    it('falla cerrado si el catálogo R3 no está habilitado o hash no coincide', async () => {
      const clientNotEnabled = createMockClient({
        catalogRow: {
          revision: 3,
          fuente_sha256: PR02_CATALOG_REV3_HASH,
          habilitado: false,
          valid_now: true,
          is_expired: false,
        },
      })
      await expect(runPr02A0PreflightQueries(clientNotEnabled)).rejects.toThrow('CATALOG_REV3_NOT_ENABLED')

      const clientHashMismatch = createMockClient({
        catalogRow: {
          revision: 3,
          fuente_sha256: 'wrong-hash-0000000000000000000000000000000000000000000000000000000000',
          habilitado: true,
          valid_now: true,
          is_expired: false,
        },
      })
      await expect(runPr02A0PreflightQueries(clientHashMismatch)).rejects.toThrow('CATALOG_REV3_HASH_MISMATCH')
    })
  })

  describe('8. Auditoría documental de intención histórica 042', () => {
    it('reporta HISTORICAL_042_IDENTIFICATION = UNRESOLVED si no hay correspondencia documental demostrable', async () => {
      const client = createMockClient({
        intent042Rows: [],
      })

      const res = await runPr02A0PreflightQueries(client)
      expect(res.HISTORICAL_042_IDENTIFICATION).toBe('UNRESOLVED')
    })

    it('no infiere intención 042 sólo por numero = 42 sin enlaces documentales persistidos completos', async () => {
      const client = createMockClient({
        intent042Rows: [
          {
            operacion_id: null, // Vínculo incompleto
            intento_id: null,
            numero: 42,
            estado: 'CONFIRMADA',
            cae: null,
            respuesta_en: null,
          },
        ],
      })

      const res = await runPr02A0PreflightQueries(client)
      expect(res.HISTORICAL_042_IDENTIFICATION).toBe('UNRESOLVED')
    })

    it('reporta HISTORICAL_042_IDENTIFICATION = VERIFIED sólo si existen todos los vínculos documentales exactos', async () => {
      const client = createMockClient({
        intent042Rows: [
          {
            operacion_id: '550e8400-e29b-41d4-a716-446655440042',
            intento_id: '660e8400-e29b-41d4-a716-446655440042',
            cuit_emisor: PR02_TARGET_CUIT,
            punto_venta: PR02_TARGET_PV,
            tipo_comprobante: PR02_TARGET_RECEIPT_TYPE,
            numero: 42,
            estado: 'CONFIRMADA',
            cae: '74421234567890',
            resultado: 'A',
            respuesta_en: '2026-10-24T18:00:00.000Z',
          },
        ],
      })

      const res = await runPr02A0PreflightQueries(client)
      expect(res.HISTORICAL_042_IDENTIFICATION).toBe('VERIFIED')
    })

    it('falla con FISCAL_HISTORY_REQUIRES_RECONCILIATION si la intención histórica 042 está en ENVIO_INCIERTO', async () => {
      const client = createMockClient({
        intent042Rows: [
          {
            operacion_id: '550e8400-e29b-41d4-a716-446655440042',
            intento_id: '660e8400-e29b-41d4-a716-446655440042',
            cuit_emisor: PR02_TARGET_CUIT,
            punto_venta: PR02_TARGET_PV,
            tipo_comprobante: PR02_TARGET_RECEIPT_TYPE,
            numero: 42,
            estado: 'ENVIO_INCIERTO',
          },
        ],
      })

      await expect(runPr02A0PreflightQueries(client)).rejects.toThrow('FISCAL_HISTORY_REQUIRES_RECONCILIATION')
    })
  })

  describe('9. Emisor operativo PV 2 y guardias de serie', () => {
    it('falla si el emisor PV 2 está inesperadamente habilitado', async () => {
      const client = createMockClient({
        emitterRow: {
          kiosco_id: PR02_TARGET_KIOSK_ID,
          cuit_emisor: PR02_TARGET_CUIT,
          punto_venta: PR02_TARGET_PV,
          certificado_sha256: PR02_TARGET_CERT_SHA256,
          habilitado: true,
        },
      })

      await expect(runPr02A0PreflightQueries(client)).rejects.toThrow('EMITTER_UNEXPECTEDLY_ENABLED')
    })

    it('falla si existe cualquier otro emisor habilitado en la base de datos', async () => {
      const client = createMockClient({ enabledEmittersCount: 1 })
      await expect(runPr02A0PreflightQueries(client)).rejects.toThrow('EMITTERS_UNEXPECTEDLY_ENABLED')
    })

    it('falla si existen reservas en ENVIO_INCIERTO o RESERVADA en la serie PV 2', async () => {
      const clientIncierto = createMockClient({
        reservations: [
          {
            operacion_id: '550e8400-e29b-41d4-a716-446655440099',
            cuit_emisor: PR02_TARGET_CUIT,
            punto_venta: 2,
            tipo_comprobante: 11,
            numero: 1,
            estado: 'ENVIO_INCIERTO',
          },
        ],
      })
      await expect(runPr02A0PreflightQueries(clientIncierto)).rejects.toThrow('FISCAL_HISTORY_REQUIRES_RECONCILIATION')

      const clientReservada = createMockClient({
        reservations: [
          {
            operacion_id: '550e8400-e29b-41d4-a716-446655440098',
            cuit_emisor: PR02_TARGET_CUIT,
            punto_venta: 2,
            tipo_comprobante: 11,
            numero: 1,
            estado: 'RESERVADA',
          },
        ],
      })
      await expect(runPr02A0PreflightQueries(clientReservada)).rejects.toThrow('FISCAL_HISTORY_REQUIRES_RECONCILIATION')
    })
  })

  describe('10. Candidatos de venta sin auto-selección ni aprobación', () => {
    it('devuelve candidatos potenciales pero fija taxativamente SALE_AUTO_SELECTED = false', async () => {
      const client = createMockClient()
      const report = await executePr02A0Staging(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_A0_SCOPE,
          projectRef: PR02_A0_EXECUTION_TARGET,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          password: 'ValidPostgresPassword123!',
        },
        { client, caCert: 'MOCK_CA_CERT' }
      )

      expect(report.PR02_A0_CANDIDATE_AUTO_SELECTION).toBe(false)
      expect(report.candidate_sales_count).toBe(1)
      expect(report.candidate_sales_sample?.[0].id).toBe('660e8400-e29b-41d4-a716-446655440001')
    })
  })

  describe('11. Cero secretos en salida y validador de contraseñas', () => {
    it('assertNoForbiddenCredentials rechaza JWTs, service_role, anon keys y certificados PEM', () => {
      expect(() => assertNoForbiddenCredentials('eyJhbGciOi...')).toThrow('FORBIDDEN_CREDENTIAL_TYPE')
      expect(() => assertNoForbiddenCredentials('sbp_1234567890')).toThrow('FORBIDDEN_CREDENTIAL_TYPE')
      expect(() => assertNoForbiddenCredentials('-----BEGIN CERTIFICATE-----')).toThrow('FORBIDDEN_CREDENTIAL_TYPE')
      expect(() => assertNoForbiddenCredentials('Bearer eyJ...')).toThrow('FORBIDDEN_CREDENTIAL_TYPE')
      expect(() => assertNoForbiddenCredentials('service_role_secret')).toThrow('FORBIDDEN_CREDENTIAL_TYPE')
      expect(() => assertNoForbiddenCredentials('PlainPostgresPassword123!')).not.toThrow()
    })

    it('el reporte final no contiene campos de contraseñas ni secretos', async () => {
      const client = createMockClient()
      const report = await executePr02A0Staging(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_A0_SCOPE,
          projectRef: PR02_A0_EXECUTION_TARGET,
          head: VALID_HEAD,
          expectedHead: VALID_HEAD,
          password: 'ValidPostgresPassword123!',
        },
        { client, caCert: 'MOCK_CA_CERT' }
      )

      const reportStr = JSON.stringify(report)
      expect(reportStr).not.toContain('ValidPostgresPassword123!')
      expect(reportStr).not.toContain('password')
      expect(reportStr).not.toContain('PGPASSWORD')
    })
  })
})
