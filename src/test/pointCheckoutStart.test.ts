import { describe, expect, it, vi } from 'vitest'
import { iniciarCheckoutPoint } from '../../supabase/functions/_shared/pointCheckoutStart'
import type { InicioPointDependencies, RegistroInicioPoint } from '../../supabase/functions/_shared/pointCheckoutStart'
import type { SolicitudCotizacionPoint } from '../../supabase/functions/_shared/pointQuoteRequest'

const id = '01234567-1234-1234-1234-0123456789ab'
const permisos = { kioscoId: 'k1', usuarioId: 'u1', permiteServicios: true, permiteAjustes: true }
const entrada: SolicitudCotizacionPoint = { intentoId: id, checkoutId: id, clienteId: null,
  lineas: [{ tipo: 'PRODUCTO', id, productoId: id, cantidad: 1, sinEnvase: false }],
  pagos: [], tipoAjuste: 'NINGUNO', valorAjuste: 0 }
const cotizacion = { ticket: { items: [], consumoStock: [], subtotal: 100, ajuste: 0, total: 100, montoCentavos: 10000 },
  cobro: { montoPointCentavos: 10000, pagosComplementarios: [], montoCuentaCorrienteCentavos: 0 } }
function dependencias(): InicioPointDependencies {
  return { cuenta: { applicationId: '123', accountId: '456', modo: 'sandbox', terminalId: 'terminal' },
    permitirProduccion: false, buscar: vi.fn(async () => null), cotizar: vi.fn(async () => cotizacion),
    reservar: vi.fn(async (registro) => registro), vincular: vi.fn(async () => 'PENDIENTE'),
    crear: vi.fn(async () => ({ id: 'ORD123', status: 'created', externalReference: id,
      type: 'point', countryCode: 'AR', accountId: '456', terminalId: 'terminal',
      payments: [{ id: 'PAY123', status: 'created', amount: '100.00', paidAmount: null, statusDetail: null }] })) }
}

describe('inicio del checkout Point', () => {
  it('reserva la cotización antes de crear la orden', async () => {
    const deps = dependencias()
    const reserva = vi.fn(async (registro: RegistroInicioPoint) => {
      expect(deps.crear).not.toHaveBeenCalled()
      return registro
    })
    deps.reservar = reserva
    expect(await iniciarCheckoutPoint(permisos, entrada, deps)).toMatchObject({ orderId: 'ORD123', total: 100 })
    expect(reserva).toHaveBeenCalledOnce()
  })

  it('recupera la cotización original sin consultar precios ni crear otra orden', async () => {
    const deps = dependencias()
    const intento = { id, kioscoId: 'k1', applicationId: '123', accountId: '456', modo: 'sandbox' as const,
      terminalId: 'terminal', montoCentavos: 10000, estado: 'PENDIENTE', orderId: 'ORD123' }
    const recuperada: SolicitudCotizacionPoint = { valorAjuste: entrada.valorAjuste,
      tipoAjuste: entrada.tipoAjuste, pagos: entrada.pagos, lineas: entrada.lineas,
      clienteId: entrada.clienteId, checkoutId: entrada.checkoutId, intentoId: entrada.intentoId }
    deps.buscar = async () => ({ intento, entrada: recuperada, usuarioId: 'u1', cotizacion })
    expect((await iniciarCheckoutPoint(permisos, entrada, deps)).total).toBe(100)
    expect(deps.cotizar).not.toHaveBeenCalled()
    expect(deps.crear).not.toHaveBeenCalled()
    await expect(iniciarCheckoutPoint(permisos, { ...entrada, valorAjuste: 10 }, deps)).rejects.toThrow('no coincide')
    expect(deps.crear).not.toHaveBeenCalled()
  })

  it('no llama al proveedor si falla la reserva', async () => {
    const deps = dependencias()
    deps.reservar = async () => { throw new Error('checkout ocupado') }
    await expect(iniciarCheckoutPoint(permisos, entrada, deps)).rejects.toThrow('ocupado')
    expect(deps.crear).not.toHaveBeenCalled()
  })
})
