import type { PointOrderSnapshot } from './pointClient.ts'

export interface ExpectedPointOrder {
  attemptId: string
  orderId: string | null
  terminalId: string
  accountId: string
  amountCentavos: number
}

export type PointReconciliation =
  | { estado: 'PAGO_CONFIRMADO'; paymentId: string }
  | { estado: 'PENDIENTE' | 'CANCELADO' | 'RECHAZADO' }
  | { estado: 'CONCILIAR'; motivo: string }

function centavos(value: string | null): number | null {
  if (value === null || !/^\d{1,14}(?:\.\d{1,2})?$/.test(value)) return null
  const [pesos, fraccion = ''] = value.split('.')
  const monto = Number(pesos) * 100 + Number(fraccion.padEnd(2, '0'))
  return Number.isSafeInteger(monto) ? monto : null
}

/** Solo usar sobre una orden obtenida por el cliente servidor del proveedor. */
export function conciliarOrdenPoint(orden: PointOrderSnapshot, esperado: ExpectedPointOrder): PointReconciliation {
  const revision = (motivo: string): PointReconciliation => ({ estado: 'CONCILIAR', motivo })
  if (!Number.isSafeInteger(esperado.amountCentavos) || esperado.amountCentavos <= 0) return revision('Importe esperado inválido')
  if (orden.type !== 'point' || orden.countryCode !== 'AR') return revision('Origen de la orden no coincide')
  if (!esperado.attemptId || orden.externalReference !== esperado.attemptId
    || (esperado.orderId !== null && orden.id !== esperado.orderId)) return revision('Identidad de la orden no coincide')
  if (!esperado.terminalId || orden.terminalId !== esperado.terminalId
    || !esperado.accountId || orden.accountId !== esperado.accountId) return revision('Cuenta o terminal no coincide')
  if (orden.payments.length !== 1) return revision('Cantidad de pagos inesperada')
  const pago = orden.payments[0]
  if (!pago.id || centavos(pago.amount) !== esperado.amountCentavos) return revision('Importe o identidad del pago no coincide')
  if (orden.status === 'processed' && pago.status === 'processed' && pago.statusDetail === 'accredited') {
    return centavos(pago.paidAmount) === esperado.amountCentavos
      ? { estado: 'PAGO_CONFIRMADO', paymentId: pago.id }
      : revision('Importe pagado no coincide')
  }
  if (orden.status === 'canceled' && pago.status === 'canceled') return { estado: 'CANCELADO' }
  if ((orden.status === 'failed' && pago.status === 'failed')
    || (orden.status === 'expired' && pago.status === 'expired')) return { estado: 'RECHAZADO' }
  if (['created', 'at_terminal'].includes(orden.status) && ['created', 'at_terminal'].includes(pago.status)) return { estado: 'PENDIENTE' }
  return revision('Estado requiere revisión')
}
