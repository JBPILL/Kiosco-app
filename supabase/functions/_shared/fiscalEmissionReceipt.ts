export interface FiscalEmissionReceipt {
  estado: 'APROBACION_RECIBIDA' | 'RECHAZO_RECIBIDO' | 'SIN_CONFIRMACION'
  codigos: readonly number[]
  puedeReenviar: false
}

/** Recepción candidata, nunca autorización fiscal ni permiso para reenviar. */
export function validateFiscalEmissionReceipt(input: unknown): Readonly<FiscalEmissionReceipt> {
  const fail = (): never => { throw new Error('FISCAL_RESPUESTA_NO_CONFIRMADA') }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail()
  const value = input as Record<string, unknown>
  if (Object.keys(value).length !== 3 || !Object.hasOwn(value, 'estado') || !Object.hasOwn(value, 'codigos') || !Object.hasOwn(value, 'puedeReenviar')
    || typeof value.estado !== 'string' || !['APROBACION_RECIBIDA', 'RECHAZO_RECIBIDO', 'SIN_CONFIRMACION'].includes(value.estado) || value.puedeReenviar !== false
    || !Array.isArray(value.codigos) || value.codigos.length > 200
    || Array.from(value.codigos).some(code => !Number.isSafeInteger(code) || code < 1 || code > 2147483647)) return fail()
  return Object.freeze({ estado: value.estado as FiscalEmissionReceipt['estado'], codigos: Object.freeze([...value.codigos]), puedeReenviar: false })
}
