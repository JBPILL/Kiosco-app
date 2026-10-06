import { expect, it } from 'vitest'
import { conciliarOrdenPoint } from '../../supabase/functions/_shared/pointReconciliation'
import type { PointOrderSnapshot } from '../../supabase/functions/_shared/pointClient'

const esperado = { attemptId: 'intento', orderId: 'ORD123', terminalId: 'terminal', accountId: '123', amountCentavos: 15001 }
const orden: PointOrderSnapshot = {
  id: 'ORD123', externalReference: 'intento', type: 'point', countryCode: 'AR',
  terminalId: 'terminal', accountId: '123', status: 'processed',
  payments: [{ id: 'PAY123', status: 'processed', statusDetail: 'accredited', amount: '150.01', paidAmount: '150.01' }],
}

it('confirma únicamente un pago acreditado con identidad e importe coincidentes', () => {
  expect(conciliarOrdenPoint(orden, esperado)).toEqual({ estado: 'PAGO_CONFIRMADO', paymentId: 'PAY123' })
})

it('mantiene discrepancias de comercio, referencia, terminal e importe en conciliación', () => {
  for (const diferencia of [{ accountId: 'otro' }, { terminalId: 'otra' }, { externalReference: 'otro' },
    { id: 'ORD999' }, { type: 'online' }, { countryCode: 'BR' }]) {
    expect(conciliarOrdenPoint({ ...orden, ...diferencia }, esperado).estado).toBe('CONCILIAR')
  }
  for (const amount of ['150.02', '150.001', '1e2', '-150.01', null]) {
    expect(conciliarOrdenPoint({ ...orden, payments: [{ ...orden.payments[0], amount }] }, esperado).estado).toBe('CONCILIAR')
  }
})

it('no confirma pagos incompletos, reembolsados ni estados contradictorios', () => {
  for (const status of ['created', 'refunded', 'desconocido', 'canceled']) {
    expect(conciliarOrdenPoint({ ...orden, status }, esperado).estado).toBe('CONCILIAR')
  }
  expect(conciliarOrdenPoint({ ...orden, payments: [{ ...orden.payments[0], paidAmount: null }] }, esperado).estado).toBe('CONCILIAR')
  expect(conciliarOrdenPoint({ ...orden, payments: [] }, esperado).estado).toBe('CONCILIAR')
})

it('distingue espera, cancelación y rechazo sin confirmar la venta', () => {
  for (const [status, estado] of [['created', 'PENDIENTE'], ['canceled', 'CANCELADO'], ['failed', 'RECHAZADO']] as const) {
    expect(conciliarOrdenPoint({ ...orden, status, payments: [{ ...orden.payments[0], status }] }, esperado)).toEqual({ estado })
  }
})
