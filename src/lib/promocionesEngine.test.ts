import { describe, expect, it } from 'vitest'
import { contextoPromocionesArgentina, evaluarCarritoPromociones } from './promocionesEngine'
import { crearItem, crearProducto, crearPromocion } from '../test/factories'

describe('fecha comercial para órdenes Point', () => {
  it('conserva el día argentino cuando UTC ya pasó a mañana', () => {
    expect(contextoPromocionesArgentina(new Date('2026-10-06T01:30:00Z')))
      .toEqual({ fechaLocal: '2026-10-05', diaSemana: 1 })
    expect(contextoPromocionesArgentina(new Date('2026-10-06T03:00:00Z')))
      .toEqual({ fechaLocal: '2026-10-06', diaSemana: 2 })
  })

  it('rechaza fechas inválidas', () => {
    expect(() => contextoPromocionesArgentina(new Date('invalid'))).toThrow('Fecha comercial inválida')
  })

  it('usa el contexto suministrado para promociones individuales y combos', () => {
    const producto = crearProducto({ id: 'prod-1', precio_venta: 100 })
    const individual = crearPromocion({ tipo: 'PORCENTAJE', descuento_porcentaje: 10,
      fecha_inicio: '2026-10-05', fecha_fin: '2026-10-05', dias_semana: [1] })
    const combo = crearPromocion({ tipo: 'COMBO', precio_combo: 150,
      items_combo: [{ producto_id: 'prod-1', cantidad: 2 }],
      fecha_inicio: '2026-10-05', fecha_fin: '2026-10-05', dias_semana: [1] })
    const items = [crearItem(producto, 2)]
    const lunes = { fechaLocal: '2026-10-05', diaSemana: 1 }
    const martes = { fechaLocal: '2026-10-06', diaSemana: 2 }
    expect(evaluarCarritoPromociones(items, [individual], lunes)[0].subtotal).toBe(180)
    expect(evaluarCarritoPromociones(items, [combo], lunes)[0].subtotal).toBe(150)
    expect(evaluarCarritoPromociones(items, [individual, combo], martes)[0].subtotal).toBe(200)
    expect(items[0].subtotal).toBe(200)
    expect(items[0].descuento_promo || 0).toBe(0)
  })
})
