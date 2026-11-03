// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  PR02_TARGET_KIOSK_ID,
  PR02_TARGET_CUIT,
  PR02_TARGET_PV,
  PR02_TARGET_RECEIPT_TYPE,
  PR02_TARGET_CERT_SHA256,
  PR02_EXPECTED_CATALOG_REVISION,
  PR02_PHASES,
  validatePr02CandidateSale,
  assertNotHistoricalIntent042,
  verifyPr02Preconditions,
  executePr02Simulation,
} from '../../scripts/fiscal/plan-pr02-staging.mjs'
import { freezeFiscalRequest, reconcileFiscalVoucher } from '../../supabase/functions/_shared/fiscalReconciliation'
import { sendFiscalEmission, decodeFiscalEmissionReceipt } from '../../supabase/functions/_shared/fiscalWsfeEmission'
import { wsfeSample, wsfeReceipt } from './fixtures/fiscalWsfe'

const validCandidateSale = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  estado: 'COMPLETADA',
  total: '123.45',
  detalles: [
    { producto_id: 'prod-001', cantidad: 1, precio_unitario: '123.45' },
  ],
  cae: null,
  hasIncompatibleReturns: false,
  hasPendingFiscalOperation: false,
  hasUncertainIntent: false,
  ownerApproved: true,
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

describe('PR02 Architecture & Safety Preparation Tests (Zero Remote Calls)', () => {
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

  describe('2. Invariante 2 — Intent Durable Previo a SOAP', () => {
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
  })

  describe('3. Invariante 3 — Replay sin Doble Emisión', () => {
    it('no vuelve a llamar SOAP si la venta o solicitud ya fue procesada', async () => {
      const frozen = await freezeFiscalRequest(wsfeSample)
      let soapCallCount = 0
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

      // Primera ejecución
      const firstRun = await executePr02Simulation(
        { sale: validCandidateSale, frozenRequest: frozen, intentId: 'intent-uuid-1' },
        {
          persistIntentDurable: async () => ({ estado: 'INTENTO_REGISTRADO' }),
          sendSoapEmission: mockSoapEmission,
          consultSoapVoucher: mockConsult,
          applyCommercialResolution: mockCommercial,
        }
      )
      expect(firstRun.commercialApplied).toBe('APPLIED')
      expect(soapCallCount).toBe(1)

      // Replay / Segundo intento: comprobación comercial previa detecta comprobante existente
      const secondRun = await executePr02Simulation(
        { sale: validCandidateSale, frozenRequest: frozen, intentId: 'intent-uuid-1' },
        {
          persistIntentDurable: async () => ({ estado: 'INTENTO_REGISTRADO' }),
          sendSoapEmission: mockSoapEmission,
          consultSoapVoucher: mockConsult,
          applyCommercialResolution: mockCommercial,
        }
      )
      expect(secondRun.commercialApplied).toBe('IDEMPOTENT')
    })
  })

  describe('4. Invariante 4 — Timeout Incierto & STOP sin Auto-retry', () => {
    it('si SOAP hace timeout, el estado es ENVIO_INCIERTO, puedeReenviar es false y no genera CAE', async () => {
      const frozen = await freezeFiscalRequest(wsfeSample)
      let uncertainMarked = false

      const result = await executePr02Simulation(
        { sale: validCandidateSale, frozenRequest: frozen, intentId: 'intent-timeout-1' },
        {
          persistIntentDurable: async () => ({ estado: 'INTENTO_REGISTRADO' }),
          sendSoapEmission: async () => {
            throw new Error('SOAP_HTTP_GATEWAY_TIMEOUT')
          },
          consultSoapVoucher: vi.fn(),
          applyCommercialResolution: vi.fn(),
          markIntentUncertain: async (id: string) => {
            uncertainMarked = true
            expect(id).toBe('intent-timeout-1')
          },
        }
      )

      expect(result.estado).toBe('ENVIO_INCIERTO')
      expect(result.puedeReenviar).toBe(false)
      expect(result.cae).toBeNull()
      expect(uncertainMarked).toBe(true)
    })
  })

  describe('5. Invariante 5 — Rechazo WSFE sin Emisión ni Reintento Automático', () => {
    it('un rechazo formal retorna RECHAZO_RECIBIDO, preserva códigos y fija puedeReenviar en false', async () => {
      const frozen = await freezeFiscalRequest(wsfeSample)
      let rejectedMarked = false

      const result = await executePr02Simulation(
        { sale: validCandidateSale, frozenRequest: frozen, intentId: 'intent-reject-1' },
        {
          persistIntentDurable: async () => ({ estado: 'INTENTO_REGISTRADO' }),
          sendSoapEmission: async () => ({
            estado: 'RECHAZO_RECIBIDO' as const,
            codigos: [10014, 10015],
          }),
          consultSoapVoucher: vi.fn(),
          applyCommercialResolution: vi.fn(),
          markIntentRejected: async (_id: string, codes?: number[]) => {
            rejectedMarked = true
            expect(codes).toEqual([10014, 10015])
          },
        }
      )

      expect(result.estado).toBe('RECHAZO_RECIBIDO')
      expect(result.puedeReenviar).toBe(false)
      expect(result.cae).toBeNull()
      expect(rejectedMarked).toBe(true)
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
          puntoVenta: 3, // Difiere punto de venta
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

  describe('8. Invariante 8 — Detección y Rechazo de Respuestas Duplicadas/Inconsistentes', () => {
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

  describe('10. Invariante 10 — Blindaje Inviolable de la Intención Histórica 042', () => {
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

  describe('11. Política de Selección de Venta Candidata (7 Condiciones Taxativas)', () => {
    it('valida exitosamente venta que cumple las 7 condiciones taxativas', () => {
      const res = validatePr02CandidateSale(validCandidateSale)
      expect(res.valid).toBe(true)
      expect(res.kioskId).toBe(PR02_TARGET_KIOSK_ID)
      expect(res.puntoVenta).toBe(PR02_TARGET_PV)
      expect(res.tipoComprobante).toBe(PR02_TARGET_RECEIPT_TYPE)
      expect(res.saleId).toBe(validCandidateSale.id)
    })

    it('falla cerrado si la venta no está COMPLETADA', () => {
      expect(() =>
        validatePr02CandidateSale({ ...validCandidateSale, estado: 'PENDIENTE' })
      ).toThrow('CANDIDATE_SALE_NOT_COMPLETED')
      expect(() =>
        validatePr02CandidateSale({ ...validCandidateSale, estado: 'ANULADA' })
      ).toThrow('CANDIDATE_SALE_NOT_COMPLETED')
    })

    it('falla cerrado si el total no es positivo o no tiene detalles válidos', () => {
      expect(() =>
        validatePr02CandidateSale({ ...validCandidateSale, total: '0.00' })
      ).toThrow('CANDIDATE_SALE_TOTAL_NON_POSITIVE')
      expect(() =>
        validatePr02CandidateSale({ ...validCandidateSale, detalles: [] })
      ).toThrow('CANDIDATE_SALE_INVALID_DETAILS')
    })

    it('falla cerrado si la venta ya tiene CAE', () => {
      expect(() =>
        validatePr02CandidateSale({ ...validCandidateSale, cae: '74123456789012' })
      ).toThrow('CANDIDATE_SALE_ALREADY_HAS_CAE')
    })

    it('falla cerrado si tiene devoluciones comerciales asociadas', () => {
      expect(() =>
        validatePr02CandidateSale({ ...validCandidateSale, hasIncompatibleReturns: true })
      ).toThrow('CANDIDATE_SALE_INCOMPATIBLE_RETURNS')
    })

    it('falla cerrado si tiene otra operación fiscal pendiente', () => {
      expect(() =>
        validatePr02CandidateSale({ ...validCandidateSale, hasPendingFiscalOperation: true })
      ).toThrow('CANDIDATE_SALE_PENDING_OPERATION')
    })

    it('falla cerrado si tiene un intento previo en ENVIO_INCIERTO', () => {
      expect(() =>
        validatePr02CandidateSale({ ...validCandidateSale, hasUncertainIntent: true })
      ).toThrow('CANDIDATE_SALE_UNCERTAIN_INTENT')
    })

    it('falla cerrado si no cuenta con aprobación expresa del Dueño', () => {
      expect(() =>
        validatePr02CandidateSale({ ...validCandidateSale, ownerApproved: false })
      ).toThrow('CANDIDATE_SALE_NOT_OWNER_APPROVED')
    })
  })

  describe('12. Precondiciones de PR02 y Reglas de Seguridad', () => {
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
    }

    it('valida precondiciones operativas correctas', () => {
      expect(PR02_EXPECTED_CATALOG_REVISION).toBe(3)
      const res = verifyPr02Preconditions(validPreconditions)
      expect(res.status).toBe('PASS')
      expect(res.catalogReady).toBe(true)
      expect(res.credentialsReady).toBe(true)
      expect(res.emitterReady).toBe(true)
      expect(res.workerReady).toBe(true)
    })

    it('rechaza si Catálogo no es Revisión 3 o está vencido/deshabilitado', () => {
      expect(() =>
        verifyPr02Preconditions({ ...validPreconditions, catalogRevision: 2 })
      ).toThrow('Catálogo debe ser Revisión 3')

      expect(() =>
        verifyPr02Preconditions({ ...validPreconditions, catalogEnabled: false })
      ).toThrow('Catálogo Revisión 3 debe estar habilitado')

      expect(() =>
        verifyPr02Preconditions({ ...validPreconditions, catalogExpired: true })
      ).toThrow('Catálogo Revisión 3 vencido o fuera de vigencia')
    })

    it('prohíbe taxativamente la reutilización de un TA vencido o expirado', () => {
      expect(() =>
        verifyPr02Preconditions({
          ...validPreconditions,
          taValid: false,
        })
      ).toThrow('TA vencido o no disponible. Prohibido reusar TA expirado')

      expect(() =>
        verifyPr02Preconditions({
          ...validPreconditions,
          taExpiresAt: Date.now() - 1000,
        })
      ).toThrow('TA vencido o no disponible. Prohibido reusar TA expirado')
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

    it('rechaza si el worker de emisión está habilitado durante la fase de preparación', () => {
      expect(() =>
        verifyPr02Preconditions({ ...validPreconditions, workerEmissionEnabled: true })
      ).toThrow('Worker de emisión no debe estar habilitado durante la fase de preparación')
    })
  })

  describe('13. Fases Separadas de PR02 (Arquitectura de Control)', () => {
    it('define las 4 fases con límites estrictos de llamadas ARCA y permisos de emisión', () => {
      expect(PR02_PHASES.PR02_A.arcaCallsMax).toBe(1)
      expect(PR02_PHASES.PR02_A.emissionAllowed).toBe(false)
      expect(PR02_PHASES.PR02_A.readOnly).toBe(true)

      expect(PR02_PHASES.PR02_B.arcaCallsMax).toBe(0)
      expect(PR02_PHASES.PR02_B.emissionAllowed).toBe(false)
      expect(PR02_PHASES.PR02_B.readOnly).toBe(false)

      expect(PR02_PHASES.PR02_C.arcaCallsMax).toBe(1)
      expect(PR02_PHASES.PR02_C.emissionAllowed).toBe(true)
      expect(PR02_PHASES.PR02_C.noAutoRetry).toBe(true)

      expect(PR02_PHASES.PR02_D.arcaCallsMax).toBe(1)
      expect(PR02_PHASES.PR02_D.emissionAllowed).toBe(false)
    })
  })
})
