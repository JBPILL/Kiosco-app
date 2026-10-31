import { fiscalSha, fiscalUuid } from './fiscalReplacement.ts'

export interface FiscalCreditDraftScope { saleId: string; operationId: string; requestId: string; sha256: string }
export interface FiscalCreditDraftAck {
  version: 1; entorno: 'HOMOLOGACION'; solicitud_id: string; venta_id: string; operacion_origen_id: string
  propuesta_sha256: string; estado: 'SALDO_RESERVADO_NO_EMITIR' | 'CANCELADA'
  emision_habilitada: false; reintegro_habilitado: false; reposicion_habilitada: false
}
/** Un ACK de reserva no prueba CAE, saldo actual de una solicitud diferente ni devolución aplicada. */
export function validateFiscalCreditDraftAck(input: unknown, scope: FiscalCreditDraftScope): Readonly<FiscalCreditDraftAck> {
  const fail = (): never => { throw new Error('FISCAL_NC_NO_CONFIRMADA') }
  if (!fiscalUuid(scope.saleId) || !fiscalUuid(scope.operationId) || !fiscalUuid(scope.requestId) || !fiscalSha(scope.sha256)
    || !input || typeof input !== 'object' || Array.isArray(input)) return fail()
  const value = structuredClone(input) as Record<string, unknown>
  const keys = ['version', 'entorno', 'solicitud_id', 'venta_id', 'operacion_origen_id', 'propuesta_sha256', 'estado', 'emision_habilitada', 'reintegro_habilitado', 'reposicion_habilitada']
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))
    || value.version !== 1 || value.entorno !== 'HOMOLOGACION' || value.solicitud_id !== scope.requestId || value.venta_id !== scope.saleId
    || value.operacion_origen_id !== scope.operationId || value.propuesta_sha256 !== scope.sha256
    || value.estado !== 'SALDO_RESERVADO_NO_EMITIR' && value.estado !== 'CANCELADA'
    || value.emision_habilitada !== false || value.reintegro_habilitado !== false || value.reposicion_habilitada !== false) return fail()
  return Object.freeze({ version: 1, entorno: 'HOMOLOGACION', solicitud_id: scope.requestId, venta_id: scope.saleId, operacion_origen_id: scope.operationId,
    propuesta_sha256: scope.sha256, estado: value.estado as FiscalCreditDraftAck['estado'], emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false })
}
