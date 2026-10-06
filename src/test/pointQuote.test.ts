import { describe, expect, it } from 'vitest'
import { cotizarCobroPoint, cotizarPoint } from '../../supabase/functions/_shared/pointQuote'
import type { DatosCotizacionPoint, LineaCotizacionPoint } from '../../supabase/functions/_shared/pointQuote'
import { crearProducto, crearPromocion } from './factories'

function datos(): DatosCotizacionPoint {
  return { kioscoId: 'k1', fecha: new Date('2026-10-06T01:00:00Z'),
    permiteServicios: true, permiteAjustes: true,
    productos: [crearProducto({ es_retornable: true, precio_envase: 50 })],
    promociones: [crearPromocion({ descuento_porcentaje: 10,
      fecha_fin: '2026-10-05', dias_semana: [1] })],
    envases: [{ id: 'env-1', kioscoId: 'k1', nombre: 'Botella', precio: 50 }] }
}
const producto: LineaCotizacionPoint = { tipo: 'PRODUCTO', id: 'linea-1',
  productoId: 'prod-1', cantidad: 2, sinEnvase: true }

describe('cotización Point con datos del backend', () => {
  it('deriva el saldo Point desde el total cotizado en el servidor', () => {
    const resultado = cotizarCobroPoint([producto], 'NINGUNO', 0, datos(),
      [{ id: 'efectivo-1', medio: 'EFECTIVO', montoCentavos: 10000 }], null)
    expect(resultado.ticket.montoCentavos).toBe(28000)
    expect(resultado.cobro.montoPointCentavos).toBe(18000)
  })
  it('combina promociones, depósitos, servicios, devoluciones y ajuste del ticket', () => {
    const resultado = cotizarPoint([producto,
      { tipo: 'SERVICIO', id: 's1', descripcion: 'Fotocopia', precio: 100, cantidad: 1 },
      { tipo: 'DEVOLUCION_ENVASE', id: 'e1', envaseId: 'env-1', cantidad: 1 },
    ], 'DESCUENTO_PORCENTAJE', 10, datos())
    expect(resultado.subtotal).toBe(330)
    expect(resultado.ajuste).toBe(28)
    expect(resultado.total).toBe(302)
    expect(resultado.montoCentavos).toBe(30200)
  })

  it('rechaza un catálogo de otro comercio y precios no finitos', () => {
    const origen = datos()
    expect(() => cotizarPoint([producto], 'NINGUNO', 0,
      { ...origen, productos: [crearProducto({ kiosco_id: 'otro' })] })).toThrow('otro comercio')
    expect(() => cotizarPoint([producto], 'NINGUNO', 0,
      { ...origen, productos: [crearProducto({ precio_venta: NaN })] })).toThrow('Importe')
  })

  it('requiere permisos del servidor para servicios y ajustes', () => {
    expect(() => cotizarPoint([{ tipo: 'SERVICIO', id: 's1', descripcion: 'Servicio', precio: 100, cantidad: 1 }],
      'NINGUNO', 0, { ...datos(), permiteServicios: false })).toThrow('Servicio no autorizado')
    expect(() => cotizarPoint([producto], 'RECARGO_FIJO', 10,
      { ...datos(), permiteAjustes: false })).toThrow('Ajuste no autorizado')
  })

  it('rechaza identidades repetidas, cantidades inválidas y total no cobrable', () => {
    expect(() => cotizarPoint([producto, producto], 'NINGUNO', 0, datos())).toThrow('Identidad')
    expect(() => cotizarPoint([{ ...producto, cantidad: 0.5 }], 'NINGUNO', 0, datos())).toThrow('entera')
    expect(() => cotizarPoint([producto], 'DESCUENTO_FIJO', 1000, datos())).toThrow('Total Point')
  })

  it('evita fragmentar productos o usar su identidad para obtener promociones sobre servicios', () => {
    expect(() => cotizarPoint([producto, { ...producto, id: 'otra-linea' }], 'NINGUNO', 0, datos()))
      .toThrow('Producto repetido')
    expect(() => cotizarPoint([{ tipo: 'SERVICIO', id: 'prod-1', descripcion: 'Servicio', precio: 100, cantidad: 1 }],
      'NINGUNO', 0, datos())).toThrow('Identidad de servicio')
  })
})
