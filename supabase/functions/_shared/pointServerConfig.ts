import type { PointProcessingContext } from './pointNotificationProcessor.ts'

export interface PointServerAccount {
  applicationId: string
  accountId: string
  accessToken: string
  modo: 'sandbox' | 'production'
}

export type PointServerAccounts = Readonly<Record<string, PointServerAccount>>
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function objeto(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/** Configuración privada del servidor; no usar en frontend. */
export function leerCuentasPoint(json: string): PointServerAccounts {
  const value: unknown = JSON.parse(json)
  const registro = objeto(value)
  if (!registro) throw new Error('Configuración Point inválida')
  const ids = Object.keys(registro).map((id) => id.toLowerCase())
  if (new Set(ids).size !== ids.length) throw new Error('Comercio duplicado en configuración Point')
  return Object.fromEntries(Object.entries(registro).map(([kioscoId, value]) => {
    const cuenta = objeto(value)
    if (!uuid.test(kioscoId) || !cuenta
      || typeof cuenta.applicationId !== 'string' || !/^\d{1,100}$/.test(cuenta.applicationId)
      || typeof cuenta.accountId !== 'string' || !/^\d{1,100}$/.test(cuenta.accountId)
      || typeof cuenta.accessToken !== 'string' || !cuenta.accessToken || /\s/.test(cuenta.accessToken)
      || (cuenta.modo !== 'sandbox' && cuenta.modo !== 'production')) throw new Error('Configuración Point inválida')
    return [kioscoId.toLowerCase(), { applicationId: cuenta.applicationId, accountId: cuenta.accountId,
      accessToken: cuenta.accessToken, modo: cuenta.modo }]
  }))
}

export function contextoPointDesdeRegistro(value: unknown, cuentas: PointServerAccounts): PointProcessingContext {
  const registro = objeto(value)
  if (!registro || typeof registro.id !== 'string' || !uuid.test(registro.id)
    || typeof registro.kiosco_id !== 'string' || !uuid.test(registro.kiosco_id)
    || typeof registro.order_id !== 'string' || !/^ORD[A-Za-z0-9]{1,100}$/.test(registro.order_id)
    || typeof registro.terminal_id !== 'string' || !registro.terminal_id) throw new Error('Intento Point inválido')
  const cuenta = cuentas[registro.kiosco_id.toLowerCase()]
  const monto = typeof registro.monto_centavos === 'number' ? registro.monto_centavos
    : typeof registro.monto_centavos === 'string' && /^\d+$/.test(registro.monto_centavos) ? Number(registro.monto_centavos) : NaN
  if (!cuenta || !Number.isSafeInteger(monto) || monto <= 0) throw new Error('Intento Point no configurado')
  return { kioscoId: registro.kiosco_id, applicationId: cuenta.applicationId, expected: {
    attemptId: registro.id, orderId: registro.order_id, terminalId: registro.terminal_id,
    accountId: cuenta.accountId, amountCentavos: monto,
  } }
}
