import { validateFiscalEmissionReceipt } from './fiscalEmissionReceipt.ts'
import type { FiscalEmissionReceipt } from './fiscalEmissionReceipt.ts'

export type FiscalDiagnosisCode = 'SOLICITUD_INVALIDA' | 'RESPUESTA_INVALIDA' | 'CONSULTA_DISTINTA' | 'DATOS_DISTINTOS' | 'SIN_CONFIRMACION'
export interface FiscalDiagnosis {
  version: 1
  entorno: 'HOMOLOGACION'
  operacion_id: string
  venta_id: string
  solicitud_sha256: string
  estado: 'RESERVADA' | 'ENVIO_INCIERTO' | 'AUTORIZADA'
  recepcion: Readonly<FiscalEmissionReceipt> | null
  ultima_consulta: Readonly<{ estado: 'CONCILIAR'; codigo: FiscalDiagnosisCode } | { estado: 'AUTORIZACION_COINCIDENTE'; codigo: null }> | null
  puedeReenviar: false
}
const fail = (): never => { throw new Error('FISCAL_DIAGNOSTICO_NO_CONFIRMADO') }
function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail()
  const value = input as Record<string, unknown>
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return fail()
  return value
}

/** Diagnóstico de registros existentes: nunca concede reenvío ni inventa CAE. */
export function validateFiscalDiagnosis(input: unknown, saleId: string, operationId: string): Readonly<FiscalDiagnosis> {
  const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  const value = object(input, ['version', 'entorno', 'operacion_id', 'venta_id', 'solicitud_sha256', 'estado', 'recepcion', 'ultima_consulta', 'puedeReenviar'])
  if (!uuid(saleId) || !uuid(operationId) || value.version !== 1 || value.entorno !== 'HOMOLOGACION'
    || value.operacion_id !== operationId || value.venta_id !== saleId || value.puedeReenviar !== false
    || typeof value.solicitud_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.solicitud_sha256)
    || typeof value.estado !== 'string' || !['RESERVADA', 'ENVIO_INCIERTO', 'AUTORIZADA'].includes(value.estado)) return fail()
  const reception = value.recepcion === null ? null : validateFiscalEmissionReceipt(value.recepcion)
  let consultation: FiscalDiagnosis['ultima_consulta'] = null
  if (value.ultima_consulta !== null) {
    const last = object(value.ultima_consulta, ['estado', 'codigo'])
    if (last.estado === 'AUTORIZACION_COINCIDENTE' && last.codigo === null && value.estado === 'AUTORIZADA') consultation = Object.freeze({ estado: 'AUTORIZACION_COINCIDENTE', codigo: null })
    else if (last.estado === 'CONCILIAR' && typeof last.codigo === 'string'
      && ['SOLICITUD_INVALIDA', 'RESPUESTA_INVALIDA', 'CONSULTA_DISTINTA', 'DATOS_DISTINTOS', 'SIN_CONFIRMACION'].includes(last.codigo)) consultation = Object.freeze({ estado: 'CONCILIAR', codigo: last.codigo as FiscalDiagnosisCode })
    else return fail()
  }
  if (value.estado === 'RESERVADA' && (reception !== null || consultation !== null)) return fail()
  return Object.freeze({ version: 1, entorno: 'HOMOLOGACION', operacion_id: operationId, venta_id: saleId,
    solicitud_sha256: value.solicitud_sha256, estado: value.estado as FiscalDiagnosis['estado'], recepcion: reception, ultima_consulta: consultation, puedeReenviar: false })
}
