import { describe, expect, it } from 'vitest'
import { dividirPagoPoint } from '../../supabase/functions/_shared/pointPaymentSplit'

describe('división de pagos Point', () => {
  it('cobra el ticket completo cuando no hay complementos', () => {
    expect(dividirPagoPoint(30200, [], null).montoPointCentavos).toBe(30200)
  })

  it('cobra sólo el saldo y conserva separados los aportes manuales y el fiado', () => {
    const pagos = [
      { id: 'p1', medio: 'EFECTIVO' as const, montoCentavos: 10000 },
      { id: 'p2', medio: 'CUENTA_CORRIENTE' as const, montoCentavos: 5000 },
    ]
    const resultado = dividirPagoPoint(30200, pagos, 'cliente-1')
    expect(resultado.montoPointCentavos).toBe(15200)
    expect(resultado.montoCuentaCorrienteCentavos).toBe(5000)
    expect(resultado.pagosComplementarios).toEqual(pagos)
    expect(resultado.pagosComplementarios[0]).not.toBe(pagos[0])
  })

  it('rechaza exceso, saldo cero, fracciones de centavo e identidades repetidas', () => {
    const pago = { id: 'p1', medio: 'EFECTIVO' as const, montoCentavos: 100 }
    expect(() => dividirPagoPoint(100, [pago], null)).toThrow('saldo')
    expect(() => dividirPagoPoint(90, [pago], null)).toThrow('saldo')
    expect(() => dividirPagoPoint(300, [pago, pago], null)).toThrow('inválido')
    expect(() => dividirPagoPoint(300, [{ ...pago, montoCentavos: 1.5 }], null)).toThrow('inválido')
  })

  it('requiere cliente para fiado y limita importes a enteros seguros', () => {
    expect(() => dividirPagoPoint(300, [{ id: 'p1', medio: 'CUENTA_CORRIENTE', montoCentavos: 100 }], null))
      .toThrow('cliente')
    expect(() => dividirPagoPoint(Infinity, [], null)).toThrow('inválidos')
  })
})
