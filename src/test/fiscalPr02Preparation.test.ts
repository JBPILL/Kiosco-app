// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  PR02_TARGET_KIOSK_ID,
  PR02_TARGET_CUIT,
  PR02_TARGET_PV,
  PR02_TARGET_RECEIPT_TYPE,
  PR02_TARGET_CERT_SHA256,
  PR02_EXPECTED_CATALOG_REVISION,
  IS_PR02_SIMULATION_TEST_ONLY,
  PR02_PHASES,
  validatePr02CandidateSale,
  assertNotHistoricalIntent042,
  verifyPr02Preconditions,
  executePr02Simulation,
} from '../../scripts/fiscal/plan-pr02-staging.mjs'
import type { SimulationExistingIntent } from '../../scripts/fiscal/plan-pr02-staging.d.mts'
import { freezeFiscalRequest, reconcileFiscalVoucher } from '../../supabase/functions/_shared/fiscalReconciliation'
import { sendFiscalEmission, decodeFiscalEmissionReceipt } from '../../supabase/functions/_shared/fiscalWsfeEmission'
import { wsfeSample, wsfeReceipt } from './fixtures/fiscalWsfe'

const validCandidateSale = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  kiosco_id: PR02_TARGET_KIOSK_ID,
  estado: 'COMPLETADA',
  total: '123.45',
  detalles: [
    { producto_id: 'prod-001', cantidad: 1, precio_unitario: '123.45' },
  ],
  cae: null,
  auditEvidence: {
    returnsAudit: 'CLEAN',
    pendingOperationsAudit: 'CLEAN',
    uncertainIntentsAudit: 'CLEAN',
    ownerApprovalAudit: {
      approvedByAuthId: 'f6af0f21-07f2-4d22-9b3c-7eec3604d5af',
      approvedVentaId: '550e8400-e29b-41d4-a716-446655440000',
      approvedAt: '2026-11-03T12:00:00.000Z',
    },
  },
}

const mockTicket = () => ({
  token: 'SYNTHETIC_TOKEN&',
  sign: 'SYNTHETIC_SIGN<',
  expiresAt: Date.now() + 120000,
})

const xmlResponse = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/xml; charset=utf-8' } })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PR02 Hardened Architecture & Safety Preparation Tests (Zero Remote Calls)', () => {
  describe('1. Invariante 1 — Request Inmutable & SHA-256 Determinista', () => {
    it('genera SHA-256 determinista, normaliza y congela el payload', async () => {
      const frozen = await freezeFiscalRequest(wsfeSample)
      expect(frozen.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(Object.isFrozen(frozen)).toBe(true)
      expect(Object.isFrozen(frozen.solicitud)).toBe(true)
      expect(Object.isFrozen(frozen.solicitud.importes)).toBe(true)

      // Inmutabilidad estricta
      expect(() => {
        Object.assign(frozen.solicitud.importes, { total: '9999.00' })
      }).toThrow()

      // Determinismo: dos llamadas con el mismo contenido generan exactamente el mismo hash
      const frozen2 = await freezeFiscalRequest({ ...wsfeSample })
      expect(frozen.sha256).toBe(frozen2.sha256)

      // Cualquier cambio de dato altera el SHA-256
      const altered = await freezeFiscalRequest({ ...wsfeSample, puntoVenta: 3 })
      expect(altered.sha256).not.toBe(frozen.sha256)
    })
  })

  describe('2. Invariante 2 — Intent Durable Previo a SOAP con Verificación de Identidad', () => {
    it('persiste permiso durable antes de red; si el guard falla, NUNCA llega a SOAP', async () => {
      const frozen = await freezeFiscalRequest(wsfeSample)
      const fetcher = vi.fn<typeof fetch>()
      const failingGuard = vi.fn(async () => {
        throw new Error('GUARD_PERSISTENCE_FAILED_DATABASE_ERROR')
      })

      await expect(
        sendFiscalEmission(frozen, mockTicket(), fetcher, failingGuard)
      ).rejects.toThrow('FISCAL_WSFE_NO_CONFIRMADO')

      expect(failingGuard).toHaveBeenCalledTimes(1)
      expect(fetcher).not.toHaveBeenCalled()
    })

    it('ejecuta primero el guard durable y sólo luego invoca SOAP exactamente una vez', async () => {
      const frozen = await freezeFiscalRequest(wsfeSample)
      const order: string[] = []
      const guard = vi.fn(async () => {
        order.push('GUARD_DURABLE_STEP')
      })
      const fetcher = vi.fn<typeof fetch>(async () => {
        order.push('SOAP_HTTP_FETCH')
        return xmlResponse(wsfeReceipt('A'))
      })

      const res = await sendFiscalEmission(frozen, mockTicket(), fetcher, guard)
      expect(order).toEqual(['GUARD_DURABLE_STEP', 'SOAP_HTTP_FETCH'])
      expect(guard).toHaveBeenCalledTimes(1)
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(res.estado).toBe('APROBACION_RECIBIDA')
    })

    it('en simulación rechaza si el registro durable devuelve identidad discordante', async () => {
      const frozen = await freezeFiscalRequest(wsfeSample)
      const mockSoapEmission = vi.fn()

      await expect(
        executePr02Simulation(
          { sale: validCandidateSale, frozenRequest: frozen, intentId: 'intent-uuid-1' },
          {
            persistIntentDurable: async () => ({
              estado: 'INTENTO_REGISTRADO',
              intentId: 'different-intent-id', // Discordante
              saleId: validCandidateSale.id,
              sha256: frozen.sha256,
              numero: frozen.solicitud.numero,
            }),
            sendSoapEmission: mockSoapEmission,
            consultSoapVoucher: vi.fn(),
            applyCommercialResolution: vi.fn(),
          }
        )
      ).rejects.toThrow('FISCAL_WSFE_NO_CONFIRMADO')

      expect(mockSoapEmission).not.toHaveBeenCalled()
    })
  })

  describe('3. Invariante 3 — Replay sin Doble SOAP (Strict Assertion)', () => {
    it('segundo acceso a la misma intención consulta estado durable y NUNCA repite SOAP', async () => {
      const frozen = await freezeFiscalRequest(wsfeSample)
      let soapCallCount = 0
      const intentStore = new Map<string, SimulationExistingIntent>()

      const mockSoapEmission = vi.fn(async () => {
        soapCallCount++
        return { estado: 'APROBACION_RECIBIDA' as const }
      })
      const mockConsult = vi.fn(async () => ({
        estado: 'AUTORIZACION_COINCIDENTE' as const,
        cae: '74123456789012',
        vencimiento: '20261031',
      }))
      const appliedSales = new Set<string>()
      const mockCommercial = vi.fn(async ({ saleId }: { saleId: string }) => {
        if (appliedSales.has(saleId)) {
          return { alreadyApplied: true }
        }
        appliedSales.add(saleId)
        return { alreadyApplied: false }
      })

      const intentId = 'intent-uuid-replay-1'

      // Primera ejecución
      const firstRun = await executePr02Simulation(
        { sale: validCandidateSale, frozenRequest: frozen, intentId },
        {
          getExistingIntent: async (id) => intentStore.get(id),
          saveIntentState: async (id, result) => {
            const res = result as SimulationExistingIntent
            intentStore.set(id, res)
          },
          persistIntentDurable: async (data) => ({
            estado: 'INTENTO_REGISTRADO',
            intentId: data.intentId,
            saleId: data.saleId,
            sha256: data.sha256,
            numero: data.numero,
          }),
          sendSoapEmission: mockSoapEmission,
          consultSoapVoucher: mockConsult,
          applyCommercialResolution: mockCommercial,
        }
      )
      expect(firstRun.commercialApplied).toBe('APPLIED')
      expect(soapCallCount).toBe(1)

      // Segunda ejecución sobre la misma intención
      const secondRun = await executePr02Simulation(
        { sale: validCandidateSale, frozenRequest: frozen, intentId },
        {
          getExistingIntent: async (id) => intentStore.get(id),
          saveIntentState: async (id, result) => {
            const res = result as SimulationExistingIntent
            intentStore.set(id, res)
          },
          persistIntentDurable: async (data) => ({
            estado: 'INTENTO_REGISTRADO',
            intentId: data.intentId,
            saleId: data.saleId,
            sha256: data.sha256,
            numero: data.numero,
          }),
          sendSoapEmission: mockSoapEmission,
          consultSoapVoucher: mockConsult,
          applyCommercialResolution: mockCommercial,
        }
      )

      // Exigencias taxativas del usuario:
      // REPLAY_SECOND_SOAP_CALL = 0
      // TOTAL_SOAP_CALLS_FOR_SAME_INTENT = 1
      expect(soapCallCount).toBe(1)
      expect(secondRun.REPLAY_SECOND_SOAP_CALL).toBe(0)
      expect(secondRun.commercialApplied).toBe('IDEMPOTENT')
      expect(mockSoapEmission).toHaveBeenCalledTimes(1)
    })

    it('bloquea intento preexistente en ENVIO_INCIERTO sin llamar a SOAP', async () => {
      const frozen = await freezeFiscalRequest(wsfeSample)
      const mockSoapEmission = vi.fn()

      const result = await executePr02Simulation(
        { sale: validCandidateSale, frozenRequest: frozen, intentId: 'intent-uncertain-existing' },
        {
          getExistingIntent: async () => ({
            estado: 'ENVIO_INCIERTO',
            cae: null,
          }),
          persistIntentDurable: vi.fn(),
          sendSoapEmission: mockSoapEmission,
          consultSoapVoucher: vi.fn(),
          applyCommercialResolution: vi.fn(),
        }
      )

      expect(result.estado).toBe('ENVIO_INCIERTO')
      expect(result.blockedForReconciliation).toBe(true)
      expect(result.puedeReenviar).toBe(false)
      expect(mockSoapEmission).not.toHaveBeenCalled()
    })
  })

  describe('4. Invariante 4 — Persistencia Obligatoria de Estados Inciertos', () => {
    it('ante timeout en SOAP, persiste ENVIO_INCIERTO y reporta UNCERTAIN_STATE_DURABLY_CONFIRMED = true', async () => {
      const frozen = await freezeFiscalRequest(wsfeSample)
      let persistedPayload: unknown = null

      const result = await executePr02Simulation(
        { sale: validCandidateSale, frozenRequest: frozen, intentId: 'intent-timeout-1' },
        {
          persistIntentDurable: async (data) => ({
            estado: 'INTENTO_REGISTRADO',
            intentId: data.intentId,
            saleId: data.saleId,
            sha256: data.sha256,
            numero: data.numero,
          }),
          sendSoapEmission: async () => {
            throw new Error('SOAP_HTTP_GATEWAY_TIMEOUT')
          },
          persistIntentUncertain: async (data) => {
            persistedPayload = data
            return { confirmed: true }
          },
          consultSoapVoucher: vi.fn(),
          applyCommercialResolution: vi.fn(),
        }
      )

      expect(result.estado).toBe('ENVIO_INCIERTO')
      expect(result.puedeReenviar).toBe(false)
      expect(result.cae).toBeNull()
      expect(result.UNCERTAIN_STATE_DURABLY_CONFIRMED).toBe(true)
      expect(persistedPayload).toMatchObject({
        intentId: 'intent-timeout-1',
        saleId: validCandidateSale.id,
        estado: 'ENVIO_INCIERTO',
      })
    })

    it('si falla la persistencia de ENVIO_INCIERTO lanza FATAL_UNRECONCILED_STATE y se detiene', async () => {
      const frozen = await freezeFiscalRequest(wsfeSample)

      await expect(
        executePr02Simulation(
          { sale: validCandidateSale, frozenRequest: frozen, intentId: 'intent-timeout-failing-persist' },
          {
            persistIntentDurable: async (data) => ({
              estado: 'INTENTO_REGISTRADO',
              intentId: data.intentId,
              saleId: data.saleId,
              sha256: data.sha256,
              numero: data.numero,
            }),
            sendSoapEmission: async () => {
              throw new Error('SOAP_SOCKET_CLOSED')
            },
            persistIntentUncertain: async () => {
              throw new Error('DB_DISK_FULL_CANNOT_WRITE_UNCERTAIN_LOG')
            },
            consultSoapVoucher: vi.fn(),
            applyCommercialResolution: vi.fn(),
          }
        )
      ).rejects.toThrow('FATAL_UNRECONCILED_STATE')
    })

    it('si el handler de persistencia no confirma durabilidad lanza FATAL_UNRECONCILED_STATE', async () => {
      const frozen = await freezeFiscalRequest(wsfeSample)

      await expect(
        executePr02Simulation(
          { sale: validCandidateSale, frozenRequest: frozen, intentId: 'intent-timeout-unconfirmed' },
          {
            persistIntentDurable: async (data) => ({
              estado: 'INTENTO_REGISTRADO',
              intentId: data.intentId,
              saleId: data.saleId,
              sha256: data.sha256,
              numero: data.numero,
            }),
            sendSoapEmission: async () => {
              throw new Error('SOAP_CONNECTION_RESET')
            },
            persistIntentUncertain: async () => ({ confirmed: false }),
            consultSoapVoucher: vi.fn(),
            applyCommercialResolution: vi.fn(),
          }
        )
      ).rejects.toThrow('FATAL_UNRECONCILED_STATE')
    })
  })

  describe('5. Invariante 5 — Rechazo WSFE sin Emisión ni Reintento Automático', () => {
    it('un rechazo formal retorna RECHAZO_RECIBIDO, preserva códigos y fija puedeReenviar en false', async () => {
      const frozen = await freezeFiscalRequest(wsfeSample)
      let rejectedCodes: number[] | undefined

      const result = await executePr02Simulation(
        { sale: validCandidateSale, frozenRequest: frozen, intentId: 'intent-reject-1' },
        {
          persistIntentDurable: async (data) => ({
            estado: 'INTENTO_REGISTRADO',
            intentId: data.intentId,
            saleId: data.saleId,
            sha256: data.sha256,
            numero: data.numero,
          }),
          sendSoapEmission: async () => ({
            estado: 'RECHAZO_RECIBIDO' as const,
            codigos: [10014, 10015],
          }),
          consultSoapVoucher: vi.fn(),
          applyCommercialResolution: vi.fn(),
          markIntentRejected: async (_id: string, codes?: number[]) => {
            rejectedCodes = codes
          },
        }
      )

      expect(result.estado).toBe('RECHAZO_RECIBIDO')
      expect(result.puedeReenviar).toBe(false)
      expect(result.cae).toBeNull()
      expect(rejectedCodes).toEqual([10014, 10015])
    })
  })

  describe('6. Invariante 6 — Conciliación READ ONLY (FECompConsultar)', () => {
    it('reconcilia comprobante autorizado sin emitir nuevamente', async () => {
      const frozen = await freezeFiscalRequest(wsfeSample)
      const observed = {
        consulta: {
          entorno: wsfeSample.entorno,
          cuitEmisor: wsfeSample.cuitEmisor,
          puntoVenta: wsfeSample.puntoVenta,
          tipoComprobante: wsfeSample.tipoComprobante,
          numero: wsfeSample.numero,
        },
        comprobante: structuredClone(wsfeSample),
        autorizacion: {
          resultado: 'A',
          tipo: 'CAE',
          cae: '74123456789012',
          vencimiento: '20261031',
          procesadoEn: '20261020120000',
        },
        errores: [],
      }

      const rec = await reconcileFiscalVoucher(observed, frozen)
      expect(rec.estado).toBe('AUTORIZACION_COINCIDENTE')
      if (rec.estado === 'AUTORIZACION_COINCIDENTE') {
        expect(rec.cae).toBe('74123456789012')
        expect(rec.puedeReenviar).toBe(false)
      }
    })

    it('si los datos observados difieren, resuelve a CONCILIAR y no aprueba', async () => {
      const frozen = await freezeFiscalRequest(wsfeSample)
      const observed = {
        consulta: {
          entorno: wsfeSample.entorno,
          cuitEmisor: wsfeSample.cuitEmisor,
          puntoVenta: 3,
          tipoComprobante: wsfeSample.tipoComprobante,
          numero: wsfeSample.numero,
        },
        comprobante: structuredClone(wsfeSample),
        autorizacion: {
          resultado: 'A',
          tipo: 'CAE',
          cae: '74123456789012',
          vencimiento: '20261031',
          procesadoEn: '20261020120000',
        },
        errores: [],
      }

      const rec = await reconcileFiscalVoucher(observed, frozen)
      expect(rec.estado).toBe('CONCILIAR')
    })
  })

  describe('7. Invariante 7 — CAS en Numeración y Reservas', () => {
    it('control de concurrencia atómico impide colisiones en reserva de número', () => {
      const activeReservations = new Map<number, string>()

      function reserveNumber(_pv: number, numero: number, opId: string) {
        if (activeReservations.has(numero)) {
          throw new Error(`CONCURRENCY_REJECTION: Número ${numero} ya reservado por ${activeReservations.get(numero)}`)
        }
        activeReservations.set(numero, opId)
        return { numero, opId, estado: 'RESERVADO' }
      }

      const res1 = reserveNumber(2, 42, 'op-1')
      expect(res1.estado).toBe('RESERVADO')

      expect(() => reserveNumber(2, 42, 'op-2')).toThrow('CONCURRENCY_REJECTION')
      expect(activeReservations.get(42)).toBe('op-1')
    })
  })

  describe('8. Invariante 8 — Detección y Rechazo de Respuestas Inconsistentes', () => {
    it('rechaza respuesta de emisión cuyos metadatos no coinciden con la solicitud frozen', async () => {
      const frozen = await freezeFiscalRequest(wsfeSample)
      const mismatchedXml = wsfeReceipt('A', { PtoVta: '99' })

      await expect(decodeFiscalEmissionReceipt(mismatchedXml, frozen)).rejects.toThrow()
    })
  })

  describe('9. Invariante 9 — Efecto Comercial Exactly-Once', () => {
    it('aplicación de CAE sobre venta comercial es idempotente y no repite efectos', async () => {
      const salesLedger = new Map<string, { cae: string | null; estado: string; resolvedCount: number }>()
      salesLedger.set(validCandidateSale.id, {
        cae: null,
        estado: 'COMPLETADA',
        resolvedCount: 0,
      })

      async function applyCaeCas(saleId: string, cae: string) {
        const record = salesLedger.get(saleId)
        if (!record) throw new Error('SALE_NOT_FOUND')
        if (record.cae !== null) {
          return { alreadyApplied: true, cae: record.cae }
        }
        record.cae = cae
        record.resolvedCount++
        return { alreadyApplied: false, cae }
      }

      const res1 = await applyCaeCas(validCandidateSale.id, '74123456789012')
      expect(res1.alreadyApplied).toBe(false)
      expect(salesLedger.get(validCandidateSale.id)?.resolvedCount).toBe(1)
      expect(salesLedger.get(validCandidateSale.id)?.cae).toBe('74123456789012')

      const res2 = await applyCaeCas(validCandidateSale.id, '74123456789012')
      expect(res2.alreadyApplied).toBe(true)
      expect(salesLedger.get(validCandidateSale.id)?.resolvedCount).toBe(1)
    })
  })

  describe('10. Invariante 10 — Blindaje Inviolable de Intención Histórica 042 & Previas Inciertas', () => {
    it('prohíbe fatalmente cualquier FECAESolicitar o reemisión sobre la intención histórica 042', () => {
      expect(() => {
        assertNotHistoricalIntent042({ id: '042', accion: 'FECAESolicitar' })
      }).toThrow('FATAL: HISTORICAL_INTENT_042_REEMISSION_FORBIDDEN')

      expect(() => {
        assertNotHistoricalIntent042({ operacion_id: 'operacion_042_historica', accion: 'EMITIR' })
      }).toThrow('FATAL: HISTORICAL_INTENT_042_REEMISSION_FORBIDDEN')

      expect(() => {
        assertNotHistoricalIntent042({ isHistorical042: true, action: 'SEND_EMISSION' })
      }).toThrow('FATAL: HISTORICAL_INTENT_042_REEMISSION_FORBIDDEN')

      expect(() => {
        assertNotHistoricalIntent042({ tag: 'HISTORICAL_INTENT_042', action: 'FECAESOLICITAR' })
      }).toThrow('FATAL: HISTORICAL_INTENT_042_REEMISSION_FORBIDDEN')
    })

    it('no genera falsos positivos sobre identificadores UUID modernos que contienen la subcadena 042', () => {
      // Un UUID legítimo moderno que contenga "042" no debe ser rechazado por heurística ingenua
      expect(() => {
        assertNotHistoricalIntent042({ id: 'a042bc11-e29b-41d4-a716-446655440000', accion: 'FECAESolicitar' })
      }).not.toThrow()
    })

    it('prohíbe reemisión de cualquier intento previo en estado ENVIO_INCIERTO sin conciliación previa', () => {
      expect(() => {
        assertNotHistoricalIntent042({ id: 'any-intent-id', estado: 'ENVIO_INCIERTO', accion: 'FECAESolicitar' })
      }).toThrow('FATAL: EXISTING_UNCERTAIN_INTENT_REEMISSION_FORBIDDEN')

      expect(() => {
        assertNotHistoricalIntent042({ id: 'any-intent-id', hasUncertainIntent: true, accion: 'EMITIR' })
      }).toThrow('FATAL: EXISTING_UNCERTAIN_INTENT_REEMISSION_FORBIDDEN')
    })

    it('permite consulta o conciliación READ ONLY sobre intención 042', () => {
      expect(() => {
        assertNotHistoricalIntent042({ id: '042', accion: 'FECompConsultar' })
      }).not.toThrow()

      expect(() => {
        assertNotHistoricalIntent042({ id: '042', accion: 'READ_ONLY_RECONCILIATION' })
      }).not.toThrow()
    })
  })

  describe('11. Política de Selección de Venta Candidata con Evidencia Persistida', () => {
    it('valida exitosamente venta que cumple la identidad, aritmética y evidencia de auditoría', () => {
      const res = validatePr02CandidateSale(validCandidateSale)
      expect(res.valid).toBe(true)
      expect(res.kioskId).toBe(PR02_TARGET_KIOSK_ID)
      expect(res.puntoVenta).toBe(PR02_TARGET_PV)
      expect(res.tipoComprobante).toBe(PR02_TARGET_RECEIPT_TYPE)
      expect(res.saleId).toBe(validCandidateSale.id)
      expect(res.total).toBe('123.45')
    })

    it('falla cerrado si el kiosco de la venta no es el kiosco operativo objetivo', () => {
      expect(() =>
        validatePr02CandidateSale({ ...validCandidateSale, kiosco_id: 'f4a00000-2026-4011-a001-000000000001' })
      ).toThrow('CANDIDATE_SALE_KIOSK_MISMATCH')
    })

    it('falla cerrado si el identificador de venta no es un UUID válido', () => {
      expect(() =>
        validatePr02CandidateSale({ ...validCandidateSale, id: 'invalid-id-not-uuid' })
      ).toThrow('CANDIDATE_SALE_INVALID_ID')
    })

    it('falla cerrado si la venta no está COMPLETADA', () => {
      expect(() =>
        validatePr02CandidateSale({ ...validCandidateSale, estado: 'PENDIENTE' })
      ).toThrow('CANDIDATE_SALE_NOT_COMPLETED')
      expect(() =>
        validatePr02CandidateSale({ ...validCandidateSale, estado: 'ANULADA' })
      ).toThrow('CANDIDATE_SALE_NOT_COMPLETED')
    })

    it('falla cerrado si total o detalles contienen NaN o Infinity', () => {
      expect(() =>
        validatePr02CandidateSale({ ...validCandidateSale, total: NaN })
      ).toThrow('CANDIDATE_SALE_TOTAL_NON_POSITIVE')
      expect(() =>
        validatePr02CandidateSale({
          ...validCandidateSale,
          detalles: [{ producto_id: 'prod-001', cantidad: NaN, precio_unitario: '123.45' }],
        })
      ).toThrow('CANDIDATE_SALE_INVALID_DETAILS')
      expect(() =>
        validatePr02CandidateSale({
          ...validCandidateSale,
          detalles: [{ producto_id: 'prod-001', cantidad: 1, precio_unitario: Infinity }],
        })
      ).toThrow('CANDIDATE_SALE_INVALID_DETAILS')
    })

    it('falla cerrado si la suma de los detalles no coincide con el total de la venta', () => {
      expect(() =>
        validatePr02CandidateSale({
          ...validCandidateSale,
          total: '200.00', // Difiere de los 123.45 del detalle
        })
      ).toThrow('CANDIDATE_SALE_SUM_MISMATCH')
    })

    it('falla cerrado si la venta ya tiene CAE', () => {
      expect(() =>
        validatePr02CandidateSale({ ...validCandidateSale, cae: '74123456789012' })
      ).toThrow('CANDIDATE_SALE_ALREADY_HAS_CAE')
    })

    it('falla cerrado si se omite la evidencia de auditoría persistida', () => {
      expect(() => {
        const withoutAudit = { ...validCandidateSale }
        delete (withoutAudit as { auditEvidence?: unknown }).auditEvidence
        validatePr02CandidateSale(withoutAudit)
      }).toThrow('CANDIDATE_SALE_AUDIT_EVIDENCE_MISSING')
    })

    it('falla cerrado si la auditoría detecta devoluciones, operaciones pendientes o intentos inciertos', () => {
      expect(() =>
        validatePr02CandidateSale({
          ...validCandidateSale,
          auditEvidence: { ...validCandidateSale.auditEvidence, returnsAudit: 'HAS_RETURNS' },
        })
      ).toThrow('CANDIDATE_SALE_INCOMPATIBLE_RETURNS')

      expect(() =>
        validatePr02CandidateSale({
          ...validCandidateSale,
          auditEvidence: { ...validCandidateSale.auditEvidence, pendingOperationsAudit: 'PENDING_EXISTS' },
        })
      ).toThrow('CANDIDATE_SALE_PENDING_OPERATION')

      expect(() =>
        validatePr02CandidateSale({
          ...validCandidateSale,
          auditEvidence: { ...validCandidateSale.auditEvidence, uncertainIntentsAudit: 'UNCERTAIN_EXISTS' },
        })
      ).toThrow('CANDIDATE_SALE_UNCERTAIN_INTENT')
    })

    it('falla cerrado si la aprobación del Dueño no está vinculada al ID de la venta exacta o carece de authId', () => {
      expect(() =>
        validatePr02CandidateSale({
          ...validCandidateSale,
          auditEvidence: {
            ...validCandidateSale.auditEvidence,
            ownerApprovalAudit: {
              approvedByAuthId: 'f6af0f21-07f2-4d22-9b3c-7eec3604d5af',
              approvedVentaId: 'other-sale-uuid-mismatch', // No coincide con sale.id
              approvedAt: '2026-11-03T12:00:00.000Z',
            },
          },
        })
      ).toThrow('CANDIDATE_SALE_NOT_OWNER_APPROVED')

      expect(() =>
        validatePr02CandidateSale({
          ...validCandidateSale,
          auditEvidence: {
            ...validCandidateSale.auditEvidence,
            ownerApprovalAudit: {
              approvedByAuthId: 'not-a-valid-uuid',
              approvedVentaId: validCandidateSale.id,
              approvedAt: '2026-11-03T12:00:00.000Z',
            },
          },
        })
      ).toThrow('CANDIDATE_SALE_NOT_OWNER_APPROVED')
    })
  })

  describe('12. Endurecimiento de Precondiciones (Fail-Closed Absoluto)', () => {
    const validPreconditions = {
      catalogRevision: PR02_EXPECTED_CATALOG_REVISION,
      catalogEnabled: true,
      catalogExpired: false,
      taValid: true,
      taExpiresAt: Date.now() + 60000,
      cuit: PR02_TARGET_CUIT,
      puntoVenta: PR02_TARGET_PV,
      kioskId: PR02_TARGET_KIOSK_ID,
      certSha: PR02_TARGET_CERT_SHA256,
      workerEmissionEnabled: false,
      officialNumberingObservation: {
        cuit: PR02_TARGET_CUIT,
        puntoVenta: PR02_TARGET_PV,
        tipoComprobante: PR02_TARGET_RECEIPT_TYPE,
        ultimoNumero: 42,
        observedAt: Date.now() - 30000, // 30 segundos atrás
      },
    }

    it('valida precondiciones operativas con datos explícitos y observación oficial', () => {
      const res = verifyPr02Preconditions(validPreconditions)
      expect(res.status).toBe('PASS')
      expect(res.STAGING_SQL_PREFLIGHT).toBe('PASS')
      expect(res.WSAA_AUTHENTICATION_STATUS).toBe('VALID')
      expect(res.WSFE_NUMBERING_OBSERVATION).toBe('VALID')
      expect(res.EMISSION_PERMISSION).toBe('DISABLED_FAIL_CLOSED')
      expect(res.catalogReady).toBe(true)
      expect(res.credentialsReady).toBe(true)
      expect(res.emitterReady).toBe(true)
      expect(res.workerReady).toBe(true)
    })

    it('falla cerrado si se pasa objeto vacío o se omiten parámetros (cero defaults favorables)', () => {
      expect(() => verifyPr02Preconditions({} as unknown as typeof validPreconditions)).toThrow('PRECONDITION_FAILED')
    })

    it('rechaza si Catálogo no es una revisión soportada (3 o 4) o está vencido/deshabilitado', () => {
      expect(() =>
        verifyPr02Preconditions({ ...validPreconditions, catalogRevision: 2 })
      ).toThrow(/Catálogo debe ser una revisión soportada/)

      expect(() =>
        verifyPr02Preconditions({ ...validPreconditions, catalogEnabled: false })
      ).toThrow(/Catálogo.*debe estar explícitamente habilitado/)

      expect(() =>
        verifyPr02Preconditions({ ...validPreconditions, catalogExpired: true })
      ).toThrow(/Catálogo.*vencido o fuera de vigencia/)

      // Acepta Revisión 4 cuando está habilitada y no vencida
      const rev4Result = verifyPr02Preconditions({ ...validPreconditions, catalogRevision: 4 })
      expect(rev4Result.status).toBe('PASS')
    })

    it('prohíbe taxativamente la reutilización de un TA vencido o sin marca temporal finita', () => {
      expect(() =>
        verifyPr02Preconditions({
          ...validPreconditions,
          taValid: false,
        })
      ).toThrow('TA no disponible o inválido')

      expect(() =>
        verifyPr02Preconditions({
          ...validPreconditions,
          taExpiresAt: Date.now() - 1000,
        })
      ).toThrow('TA vencido o sin marca temporal finita')
    })

    it('rechaza si CUIT, Punto de Venta, Kiosco o Certificado difieren', () => {
      expect(() =>
        verifyPr02Preconditions({ ...validPreconditions, cuit: '30700000001' })
      ).toThrow(`CUIT debe ser ${PR02_TARGET_CUIT}`)

      expect(() =>
        verifyPr02Preconditions({ ...validPreconditions, puntoVenta: 1 })
      ).toThrow(`Punto de venta debe ser ${PR02_TARGET_PV}`)

      expect(() =>
        verifyPr02Preconditions({ ...validPreconditions, kioskId: 'other-kiosk-id' })
      ).toThrow(`Kiosco debe ser ${PR02_TARGET_KIOSK_ID}`)

      expect(() =>
        verifyPr02Preconditions({ ...validPreconditions, certSha: 'wrong-sha256' })
      ).toThrow('Certificado SHA-256 no coincide')
    })

    it('rechaza observación oficial de numeración expirada (> 5 minutos)', () => {
      expect(() =>
        verifyPr02Preconditions({
          ...validPreconditions,
          officialNumberingObservation: {
            ...validPreconditions.officialNumberingObservation,
            observedAt: Date.now() - 360000, // 6 minutos atrás
          },
        })
      ).toThrow('Observación oficial de numeración ausente, inválida o expirada')
    })
  })

  describe('13. Fases Separadas y Desacoplamiento de Autenticación vs Lectura Oficial', () => {
    it('define contratos específicos para A0 (SQL), A1 (WSAA) y A2 (WSFE Último Autorizado)', () => {
      // PR02-A0: Staging SQL READ ONLY
      expect(PR02_PHASES.PR02_A0.arcaCallsMax).toBe(0)
      expect(PR02_PHASES.PR02_A0.readOnly).toBe(true)
      expect(PR02_PHASES.PR02_A0.stagingWrites).toBe(0)

      // PR02-A1: WSAA Authentication if required
      expect(PR02_PHASES.PR02_A1.arcaCallsMax).toBe(1)
      expect(PR02_PHASES.PR02_A1.service).toBe('WSAA')
      expect(PR02_PHASES.PR02_A1.emissionAllowed).toBe(false)
      expect(PR02_PHASES.PR02_A1.readOnly).toBe(true)

      // PR02-A2: WSFE FECompUltimoAutorizado
      expect(PR02_PHASES.PR02_A2.arcaCallsMax).toBe(1)
      expect(PR02_PHASES.PR02_A2.service).toBe('WSFE')
      expect(PR02_PHASES.PR02_A2.emissionAllowed).toBe(false)
      expect(PR02_PHASES.PR02_A2.readOnly).toBe(true)

      // PR02-B: Preparación Durable
      expect(PR02_PHASES.PR02_B.arcaCallsMax).toBe(0)
      expect(PR02_PHASES.PR02_B.emissionAllowed).toBe(false)

      // PR02-C: Primera Emisión Real
      expect(PR02_PHASES.PR02_C.arcaCallsMax).toBe(1)
      expect(PR02_PHASES.PR02_C.emissionAllowed).toBe(true)
      expect(PR02_PHASES.PR02_C.noAutoRetry).toBe(true)

      // PR02-D: Conciliación
      expect(PR02_PHASES.PR02_D.arcaCallsMax).toBe(1)
      expect(PR02_PHASES.PR02_D.emissionAllowed).toBe(false)
    })

    it('la simulación está marcada taxativamente como TEST-ONLY', () => {
      expect(IS_PR02_SIMULATION_TEST_ONLY).toBe(true)
    })
  })
})
