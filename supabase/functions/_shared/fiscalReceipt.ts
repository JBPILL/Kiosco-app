import { reconcileFiscalVoucher, verifyFiscalRequest } from './fiscalReconciliation.ts'
import type { FrozenFiscalRequest } from './fiscalReconciliation.ts'

export interface FiscalReceiptScope {
  operationId: string
  saleId: string
}

export interface FiscalReceipt {
  version: 1
  entorno: 'HOMOLOGACION'
  estado: 'AUTORIZADA'
  operacion_id: string
  venta_id: string
  solicitud: FrozenFiscalRequest
  autorizacion: Readonly<{ cae: string; vencimiento: string; procesado_en: string | null }>
}

const fail = (): never => { throw new Error('FISCAL_CONSTANCIA_NO_CONFIRMADA') }
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail()
  const value = input as Record<string, unknown>
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return fail()
  return value
}

/** Valida un DTO del getter privado. No autentica ARCA ni convierte una revisión en CAE. */
export async function validateFiscalReceipt(input: unknown, scope: FiscalReceiptScope): Promise<Readonly<FiscalReceipt>> {
  const { operationId, saleId } = scope
  if (!uuid(operationId) || !uuid(saleId)) return fail()
  const value = object(input, ['version', 'entorno', 'estado', 'operacion_id', 'venta_id', 'solicitud', 'autorizacion'])
  if (value.version !== 1 || value.entorno !== 'HOMOLOGACION' || value.estado !== 'AUTORIZADA'
    || value.operacion_id !== operationId || value.venta_id !== saleId) return fail()
  const authorization = object(value.autorizacion, ['cae', 'vencimiento', 'procesado_en'])
  const { cae, vencimiento, procesado_en } = authorization
  const frozen = await verifyFiscalRequest(value.solicitud)
  const { entorno, cuitEmisor, puntoVenta, tipoComprobante, numero } = frozen.solicitud
  const decision = await reconcileFiscalVoucher({
    consulta: { entorno, cuitEmisor, puntoVenta, tipoComprobante, numero },
    comprobante: frozen.solicitud,
    autorizacion: { resultado: 'A', tipo: 'CAE', cae, vencimiento, procesadoEn: procesado_en },
    errores: [],
  }, frozen)
  if (decision.estado !== 'AUTORIZACION_COINCIDENTE') return fail()
  return Object.freeze({ version: 1, entorno: 'HOMOLOGACION', estado: 'AUTORIZADA',
    operacion_id: operationId, venta_id: saleId, solicitud: frozen,
    autorizacion: Object.freeze({ cae: decision.cae, vencimiento: decision.vencimiento, procesado_en: decision.procesadoEn }),
  })
}
