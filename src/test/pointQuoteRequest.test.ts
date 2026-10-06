import { describe, expect, it } from 'vitest'
import { leerSolicitudCotizacionPoint } from '../../supabase/functions/_shared/pointQuoteRequest'

const id = '01234567-1234-1234-1234-0123456789ab'
function solicitud() {
  return { intentoId: id, checkoutId: id, clienteId: null, tipoAjuste: 'NINGUNO', valorAjuste: 0,
    lineas: [{ tipo: 'PRODUCTO', id, productoId: id, cantidad: 1, sinEnvase: false }], pagos: [] }
}

describe('cuerpo de cotización Point', () => {
  it('normaliza UUID y admite una línea de catálogo', () => {
    expect(leerSolicitudCotizacionPoint({ ...solicitud(), intentoId: id.toUpperCase() }).intentoId).toBe(id)
  })

  it('rechaza precios, totales, comercio y permisos enviados por el cliente', () => {
    for (const campo of ['total', 'kioscoId', 'permiteAjustes', 'accessToken']) {
      expect(() => leerSolicitudCotizacionPoint({ ...solicitud(), [campo]: 1 })).toThrow('Campo')
    }
    expect(() => leerSolicitudCotizacionPoint({ ...solicitud(),
      lineas: [{ ...solicitud().lineas[0], precio: 1 }] })).toThrow('Campo')
  })

  it('rechaza coerciones, estructuras malformadas y datos numéricos inválidos', () => {
    expect(() => leerSolicitudCotizacionPoint(null)).toThrow()
    expect(() => leerSolicitudCotizacionPoint({ ...solicitud(), pagos: null })).toThrow()
    expect(() => leerSolicitudCotizacionPoint({ ...solicitud(), valorAjuste: '10' })).toThrow('Número')
    expect(() => leerSolicitudCotizacionPoint({ ...solicitud(), valorAjuste: NaN })).toThrow('Número')
    expect(() => leerSolicitudCotizacionPoint({ ...solicitud(), clienteId: 'otro' })).toThrow('Identificador')
  })
})
