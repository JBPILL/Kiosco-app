import { describe, expect, it } from 'vitest'
import { leerRegistroInicioPoint } from '../../supabase/functions/_shared/pointCheckoutRecord'
import { crearProducto, crearItem } from './factories'

const id = '01234567-1234-1234-1234-0123456789ab'
function registro() {
  return { id, kiosco_id: 'k1', checkout_id: id, terminal_id: 'terminal', monto_centavos: '10000',
    application_id: '123', account_id: '456', modo: 'sandbox', estado: 'PREPARADO', order_id: null,
    solicitud: { version: 2, usuarioId: 'u1', sesionCajaId: id, entrada: { intentoId: id, checkoutId: id,
      clienteId: null, tipoAjuste: 'NINGUNO', valorAjuste: 0, pagos: [],
      lineas: [{ tipo: 'PRODUCTO', id, productoId: id, cantidad: 1, sinEnvase: false }] },
      cotizacion: { ticket: { items: [crearItem(crearProducto({ id }), 1)],
        consumoStock: [{ productoId: id, cantidad: 1 }], subtotal: 100, ajuste: 0, total: 100, montoCentavos: 10000 },
        cobro: { montoPointCentavos: 10000, montoCuentaCorrienteCentavos: 0, pagosComplementarios: [] } } } }
}

describe('lectura del snapshot Point persistido', () => {
  it('recupera un bigint serializado sin perder el importe original', () => {
    const resultado = leerRegistroInicioPoint(registro())
    expect(resultado.intento.montoCentavos).toBe(10000)
    expect(resultado.cotizacion.ticket.total).toBe(100)
    expect(resultado.sesionCajaId).toBe(id)
  })

  it('rechaza versiones, identidades e importes incoherentes antes de crear', () => {
    expect(() => leerRegistroInicioPoint({ ...registro(), monto_centavos: '9999' })).toThrow('inconsistente')
    expect(() => leerRegistroInicioPoint({ ...registro(), checkout_id: 'otro' })).toThrow('inconsistente')
    const anterior = registro()
    anterior.solicitud.version = 0
    expect(() => leerRegistroInicioPoint(anterior)).toThrow('Versión')
    const linea = registro()
    linea.solicitud.cotizacion.ticket.items[0].cantidad = 2
    expect(() => leerRegistroInicioPoint(linea)).toThrow('Línea')
    const sinCaja = registro()
    sinCaja.solicitud.sesionCajaId = ''
    expect(() => leerRegistroInicioPoint(sinCaja)).toThrow('Caja')
  })
})
