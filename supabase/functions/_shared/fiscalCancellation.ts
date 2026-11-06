export interface FiscalPreparationCancellation {
  operacion_id: string
  venta_id: string
  estado: 'CANCELADA'
  emision_habilitada: false
}
export function validateFiscalPreparationCancellation(input: unknown, saleId: string, operationId: string): Readonly<FiscalPreparationCancellation> {
  const fail = (): never => { throw new Error('FISCAL_CANCELACION_NO_CONFIRMADA') }
  const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  if (!uuid(saleId) || !uuid(operationId) || !input || typeof input !== 'object' || Array.isArray(input)) return fail()
  const value = input as Record<string, unknown>, keys = ['operacion_id', 'venta_id', 'estado', 'emision_habilitada']
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)) || value.operacion_id !== operationId
    || value.venta_id !== saleId || value.estado !== 'CANCELADA' || value.emision_habilitada !== false) return fail()
  return Object.freeze({ operacion_id: operationId, venta_id: saleId, estado: 'CANCELADA', emision_habilitada: false })
}
