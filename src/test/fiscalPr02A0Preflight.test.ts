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
  intent042Row?: Record<string, unknown> | null
  candidateSales?: Record<string, unknown>[]
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
    intent042Row = null,
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
  } = options

  const client = {
    connect: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      executedQueries.push({ sql, params })

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
      if (sql.includes('public.fiscal_reservas_homologacion') && sql.includes('numero = 42')) {
        return { rows: intent042Row ? [intent042Row] : [] }
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
  describe('1. Dry-run sin conexión PostgreSQL', () => {
    it('ejecuta en dry-run por defecto sin abrir conexión remota y con invariantes fijas', async () => {
      expect(PR02_TARGET_RECEIPT_TYPE).toBe(11)
      const res = await executePr02A0Staging({ dryRun: true })

      expect(res.execution).toBe('DRY_RUN')
      expect(res.scope).toBe(PR02_A0_SCOPE)
      expect(res.projectRef).toBe(PR02_A0_EXECUTION_TARGET)
      expect(res.PR02_A0_LOCAL_PREPARATION).toBe('PASS')
      expect(res.PR02_A0_REMOTE_EXECUTION_READY).toBe(true)
      expect(res.PR02_A0_REMOTE_EXECUTED).toBe(false)
      expect(res.PR02_A0_READ_ONLY_GUARD).toBe('PASS')
      expect(res.PR02_A0_TLS_GUARD).toBe('PASS')
      expect(res.PR02_A0_ROLLBACK_GUARD).toBe('PASS')
      expect(res.PR02_A0_CATALOG_GUARD).toBe('PASS')
      expect(res.PR02_A0_REAL_PV2_GUARD).toBe('PASS')
      expect(res.PR02_A0_HISTORY_GUARD).toBe('PASS')
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

  describe('2. Scope incorrecto rechazado', () => {
    it('rechaza cualquier scope distinto a PR02_A0_STAGING_SQL_READ_ONLY en ejecución autorizada', () => {
      expect(() => {
        validatePr02A0CliArgs(['--authorized', '--scope', 'PR03_B_STAGING_ACCEPTANCE'])
      }).toThrow('INVALID_SCOPE')

      expect(() => {
        validatePr02A0CliArgs(['--authorized', '--scope', 'PR02_C_FIRST_HOMOLOGATION_EMISSION'])
      }).toThrow('INVALID_SCOPE')
    })
  })

  describe('3. Project-ref incorrecto rechazado', () => {
    it('rechaza cualquier project-ref distinto de acoyfwwmhaeruciyedri en ejecución autorizada', () => {
      expect(() => {
        validatePr02A0CliArgs(['--authorized', '--scope', PR02_A0_SCOPE, '--project-ref', 'wrong-project-ref'])
      }).toThrow('INVALID_PROJECT_REF')
    })
  })

  describe('4. HEAD incorrecto rechazado', () => {
    it('rechaza discrepancia entre HEAD actual y HEAD esperado en ejecución autorizada', () => {
      expect(() => {
        validatePr02A0CliArgs([
          '--authorized',
          '--scope',
          PR02_A0_SCOPE,
          '--project-ref',
          PR02_A0_EXECUTION_TARGET,
          '--head',
          '1111111111111111111111111111111111111111',
          '--expected-head',
          '0f1a29a5bfe112749e715e4bd2f340c493d08e0f',
        ])
      }).toThrow('HEAD_MISMATCH')
    })
  })

  describe('5. TLS inválido rechazado', () => {
    it('falla cerrado si la ruta del certificado CA no existe o es ilegible', async () => {
      await expect(
        executePr02A0Staging(
          {
            authorized: true,
            dryRun: false,
            scope: PR02_A0_SCOPE,
            projectRef: PR02_A0_EXECUTION_TARGET,
            caCertPath: 'C:\\inexistent\\path\\to\\ca.crt',
            password: 'ValidPassword123!',
          },
          {}
        )
      ).rejects.toThrow('TLS_CA_CERT_INVALID')
    })
  })

  describe('6. Transacción READ ONLY obligatoria', () => {
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

  describe('7. ROLLBACK incondicional incluso ante excepción', () => {
    it('ejecuta ROLLBACK tras éxito de las consultas preflight', async () => {
      const client = createMockClient()
      await runPr02A0PreflightQueries(client)

      const lastQuery = client.executedQueries[client.executedQueries.length - 1]
      expect(lastQuery.sql).toBe('ROLLBACK;')
    })

    it('ejecuta ROLLBACK cuando una consulta falla o lanza excepción', async () => {
      const client = createMockClient({
        catalogRow: null, // Causará CATALOG_REV3_MISSING
      })

      await expect(runPr02A0PreflightQueries(client)).rejects.toThrow('CATALOG_REV3_MISSING')

      const rollbackQuery = client.executedQueries.find((q) => q.sql === 'ROLLBACK;')
      expect(rollbackQuery).toBeDefined()
    })
  })

  describe('8. Catálogo vencido o alterado bloqueado', () => {
    it('falla cerrado si el catálogo R3 ha vencido según clock_timestamp()', async () => {
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

      await expect(runPr02A0PreflightQueries(client)).rejects.toThrow('CATALOG_EXPIRED')
    })

    it('falla cerrado si el catálogo R3 no está habilitado', async () => {
      const client = createMockClient({
        catalogRow: {
          revision: 3,
          fuente_sha256: PR02_CATALOG_REV3_HASH,
          habilitado: false,
          valid_now: true,
          is_expired: false,
        },
      })

      await expect(runPr02A0PreflightQueries(client)).rejects.toThrow('CATALOG_REV3_NOT_ENABLED')
    })

    it('falla cerrado si el hash del catálogo R3 no coincide', async () => {
      const client = createMockClient({
        catalogRow: {
          revision: 3,
          fuente_sha256: 'wrong-hash-0000000000000000000000000000000000000000000000000000000000',
          habilitado: true,
          valid_now: true,
          is_expired: false,
        },
      })

      await expect(runPr02A0PreflightQueries(client)).rejects.toThrow('CATALOG_REV3_HASH_MISMATCH')
    })
  })

  describe('9. PV2 habilitado inesperadamente bloqueado', () => {
    it('falla cerrado si el emisor operativo PV 2 está habilitado', async () => {
      const client = createMockClient({
        emitterRow: {
          kiosco_id: PR02_TARGET_KIOSK_ID,
          cuit_emisor: PR02_TARGET_CUIT,
          punto_venta: PR02_TARGET_PV,
          certificado_sha256: PR02_TARGET_CERT_SHA256,
          habilitado: true, // Inesperadamente habilitado
        },
      })

      await expect(runPr02A0PreflightQueries(client)).rejects.toThrow('EMITTER_UNEXPECTEDLY_ENABLED')
    })

    it('falla cerrado si existe cualquier otro emisor habilitado en la base de datos', async () => {
      const client = createMockClient({
        enabledEmittersCount: 1, // Algún emisor habilitado
      })

      await expect(runPr02A0PreflightQueries(client)).rejects.toThrow('EMITTERS_UNEXPECTEDLY_ENABLED')
    })
  })

  describe('10. Historial incierto bloqueado', () => {
    it('falla cerrado si existe una reserva en ENVIO_INCIERTO en la serie PV 2', async () => {
      const client = createMockClient({
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

      await expect(runPr02A0PreflightQueries(client)).rejects.toThrow('FISCAL_HISTORY_REQUIRES_RECONCILIATION')
    })

    it('falla cerrado si existe una reserva activa pendiente RESERVADA en la serie PV 2', async () => {
      const client = createMockClient({
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

      await expect(runPr02A0PreflightQueries(client)).rejects.toThrow('FISCAL_HISTORY_REQUIRES_RECONCILIATION')
    })

    it('falla cerrado si la intención 042 tiene estado incierto', async () => {
      const client = createMockClient({
        intent042Row: {
          operacion_id: '550e8400-e29b-41d4-a716-446655440042',
          numero: 42,
          estado: 'ENVIO_INCIERTO',
        },
      })

      await expect(runPr02A0PreflightQueries(client)).rejects.toThrow('FISCAL_HISTORY_REQUIRES_RECONCILIATION')
    })
  })

  describe('11. Ausencia de selección automática de venta', () => {
    it('devuelve candidatos potenciales pero SALE_AUTO_SELECTED y OWNER_APPROVAL_GRANTED son estrictamente false', async () => {
      const client = createMockClient({
        candidateSales: [
          {
            id: '660e8400-e29b-41d4-a716-446655440001',
            total: '100.00',
            fecha_hora: '2026-11-03T12:00:00.000Z',
            detail_count: 1,
            detail_sum: '100.00',
            has_returns: false,
            has_fiscal_op: false,
            has_uncertain_intent: false,
            has_afip_cae: false,
          },
        ],
      })

      const res = await runPr02A0PreflightQueries(client)
      expect(res.candidate_sales_count).toBe(1)
      expect(res.candidate_sales_sample[0].id).toBe('660e8400-e29b-41d4-a716-446655440001')

      // Verificar reporte general en ejecución con cliente inyectado
      const report = await executePr02A0Staging(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_A0_SCOPE,
          projectRef: PR02_A0_EXECUTION_TARGET,
          password: 'ValidPostgresPassword123!',
        },
        { client, caCert: 'MOCK_CA_CERT' }
      )

      expect(report.PR02_A0_CANDIDATE_AUTO_SELECTION).toBe(false)
      expect(report.TA_STATUS).toBe('NOT_CHECKED_IN_A0')
      expect(report.OFFICIAL_NUMBERING).toBe('NOT_OBSERVED_IN_A0')
      expect(report.EMISSION_PERMISSION).toBe('DISABLED')
      expect(report.candidate_sales_count).toBe(1)
    })
  })

  describe('12. Cero transporte ARCA', () => {
    it('demuestra que A0 no realiza llamadas hacia ARCA / WSFE / WSAA', async () => {
      const res = await executePr02A0Staging({ dryRun: true })
      expect(res.PR02_A0_ARCA_REACHABLE).toBe(false)
      expect(res.ARCA_CALLS_NEW).toBe(0)
      expect(res.STAGING_WRITES_NEW).toBe(0)
      expect(res.PRODUCTION_MUTATIONS).toBe(0)
    })
  })

  describe('13. Cierre verificable de conexión PostgreSQL', () => {
    it('invoca client.end() en el bloque finally', async () => {
      const client = createMockClient()

      await executePr02A0Staging(
        {
          authorized: true,
          dryRun: false,
          scope: PR02_A0_SCOPE,
          projectRef: PR02_A0_EXECUTION_TARGET,
          password: 'ValidPostgresPassword123!',
        },
        { client, caCert: 'MOCK_CA_CERT' }
      )

      expect(client.connect).toHaveBeenCalledTimes(1)
      expect(client.end).toHaveBeenCalledTimes(1)
    })
  })

  describe('14. Cero secretos en salida y validador de contraseñas', () => {
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
