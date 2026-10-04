import { beforeEach, describe, expect, it } from 'vitest'
import { evaluarItemPromociones, usePromocionStore } from './promocionStore'
import { crearItem, crearProducto, crearPromocion } from '../test/factories'
import { getFechaLocal } from '../lib/utils'

const producto = crearProducto({ id: 'prod-1', precio_venta: 100 })

function diaOffset(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return getFechaLocal(d)
}

describe('evaluarItemPromociones', () => {
  it('NxM 2x1: regala una unidad por cada pack completo', () => {
    const promo = crearPromocion({ tipo: 'NXM', cantidad_minima: 2, cantidad_paga: 1 })
    expect(evaluarItemPromociones(crearItem(producto, 1), [promo]).descuento).toBe(0)
    expect(evaluarItemPromociones(crearItem(producto, 2), [promo]).descuento).toBe(100)
    expect(evaluarItemPromociones(crearItem(producto, 5), [promo]).descuento).toBe(200)
  })

  it('NxM 3x2: 7 unidades = 2 packs = 2 gratis', () => {
    const promo = crearPromocion({ tipo: 'NXM', cantidad_minima: 3, cantidad_paga: 2 })
    expect(evaluarItemPromociones(crearItem(producto, 7), [promo]).descuento).toBe(200)
  })

  it('NxM mal configurada (paga >= mínimo) no regala nada', () => {
    const promo = crearPromocion({ tipo: 'NXM', cantidad_minima: 2, cantidad_paga: 2 })
    expect(evaluarItemPromociones(crearItem(producto, 4), [promo]).descuento).toBe(0)
  })

  it('VOLUMEN con precio unitario promocional', () => {
    const promo = crearPromocion({ tipo: 'VOLUMEN', cantidad_minima: 3, precio_unitario_promo: 80 })
    expect(evaluarItemPromociones(crearItem(producto, 2), [promo]).descuento).toBe(0)
    expect(evaluarItemPromociones(crearItem(producto, 3), [promo]).descuento).toBe(60)
  })

  it('VOLUMEN con precio promo mayor al normal no genera descuento negativo', () => {
    const promo = crearPromocion({ tipo: 'VOLUMEN', cantidad_minima: 2, precio_unitario_promo: 150 })
    expect(evaluarItemPromociones(crearItem(producto, 3), [promo]).descuento).toBe(0)
  })

  it('VOLUMEN con porcentaje', () => {
    const promo = crearPromocion({ tipo: 'VOLUMEN', cantidad_minima: 2, descuento_porcentaje: 10 })
    expect(evaluarItemPromociones(crearItem(producto, 4), [promo]).descuento).toBe(40)
  })

  it('PORCENTAJE respeta la cantidad mínima', () => {
    const promo = crearPromocion({ tipo: 'PORCENTAJE', cantidad_minima: 5, descuento_porcentaje: 20 })
    expect(evaluarItemPromociones(crearItem(producto, 4), [promo]).descuento).toBe(0)
    expect(evaluarItemPromociones(crearItem(producto, 5), [promo]).descuento).toBe(100)
  })

  it('el descuento nunca supera el subtotal (porcentaje > 100)', () => {
    const promo = crearPromocion({ tipo: 'PORCENTAJE', descuento_porcentaje: 150 })
    expect(evaluarItemPromociones(crearItem(producto, 2), [promo]).descuento).toBe(200)
  })

  it('elige la mejor promo cuando hay varias aplicables', () => {
    const chica = crearPromocion({ id: 'a', tipo: 'PORCENTAJE', descuento_porcentaje: 5, nombre: 'Chica' })
    const grande = crearPromocion({ id: 'b', tipo: 'PORCENTAJE', descuento_porcentaje: 25, nombre: 'Grande' })
    const r = evaluarItemPromociones(crearItem(producto, 2), [chica, grande])
    expect(r.descuento).toBe(50)
  })

  it('ignora promos inactivas', () => {
    const promo = crearPromocion({ tipo: 'PORCENTAJE', descuento_porcentaje: 50, activo: false })
    expect(evaluarItemPromociones(crearItem(producto, 2), [promo]).descuento).toBe(0)
  })

  it('respeta vigencia por fechas (inicio futuro / fin pasado / hoy inclusivo)', () => {
    const base = { tipo: 'PORCENTAJE' as const, descuento_porcentaje: 10 }
    const item = crearItem(producto, 1)
    expect(evaluarItemPromociones(item, [crearPromocion({ ...base, fecha_inicio: diaOffset(1) })]).descuento).toBe(0)
    expect(evaluarItemPromociones(item, [crearPromocion({ ...base, fecha_fin: diaOffset(-1) })]).descuento).toBe(0)
    expect(
      evaluarItemPromociones(item, [crearPromocion({ ...base, fecha_inicio: diaOffset(0), fecha_fin: diaOffset(0) })]).descuento
    ).toBe(10)
  })

  it('respeta días de la semana', () => {
    const hoy = new Date().getDay()
    const otro = (hoy + 1) % 7
    const base = { tipo: 'PORCENTAJE' as const, descuento_porcentaje: 10 }
    const item = crearItem(producto, 1)
    expect(evaluarItemPromociones(item, [crearPromocion({ ...base, dias_semana: [otro] })]).descuento).toBe(0)
    expect(evaluarItemPromociones(item, [crearPromocion({ ...base, dias_semana: [hoy] })]).descuento).toBe(10)
  })

  it('aplica por categoría cuando no hay producto específico', () => {
    const conCat = crearProducto({ id: 'x', categoria_id: 'cat-1', precio_venta: 100 })
    const promo = crearPromocion({
      tipo: 'PORCENTAJE',
      descuento_porcentaje: 10,
      producto_id: null,
      categoria_id: 'cat-1',
    })
    expect(evaluarItemPromociones(crearItem(conCat, 1), [promo]).descuento).toBe(10)
    expect(evaluarItemPromociones(crearItem(producto, 1), [promo]).descuento).toBe(0)
  })

  it('productos con subtotal cero no reciben descuento', () => {
    const gratis = crearProducto({ precio_venta: 0 })
    const promo = crearPromocion({ tipo: 'PORCENTAJE', descuento_porcentaje: 10 })
    expect(evaluarItemPromociones(crearItem(gratis, 3), [promo]).descuento).toBe(0)
  })
})

describe('usePromocionStore.evaluarCarrito', () => {
  beforeEach(() => usePromocionStore.setState({ promociones: [] }))

  it('sin promociones deja los subtotales intactos', () => {
    const r = usePromocionStore.getState().evaluarCarrito([crearItem(producto, 3)])
    expect(r[0].subtotal).toBe(300)
    expect(r[0].descuento_promo).toBe(0)
  })

  it('aplica el descuento individual al subtotal', () => {
    usePromocionStore.setState({
      promociones: [crearPromocion({ tipo: 'NXM', cantidad_minima: 2, cantidad_paga: 1 })],
    })
    const r = usePromocionStore.getState().evaluarCarrito([crearItem(producto, 4)])
    expect(r[0].descuento_promo).toBe(200)
    expect(r[0].subtotal).toBe(200)
  })

  it('suma el depósito de envase al subtotal base antes de promociones', () => {
    const retornable = crearProducto({ id: 'r', precio_venta: 100, es_retornable: true, precio_envase: 50 })
    const item = crearItem(retornable, 2, { sin_envase: true, precio_envase_unitario: 50 })
    const r = usePromocionStore.getState().evaluarCarrito([item])
    expect(r[0].subtotal).toBe(300)
  })

  it('combo: descuenta la diferencia contra el precio regular y reparte exacto', () => {
    const a = crearProducto({ id: 'a', precio_venta: 100 })
    const b = crearProducto({ id: 'b', precio_venta: 200 })
    usePromocionStore.setState({
      promociones: [
        crearPromocion({
          tipo: 'COMBO',
          producto_id: null,
          precio_combo: 250,
          items_combo: [
            { producto_id: 'a', cantidad: 1 },
            { producto_id: 'b', cantidad: 1 },
          ],
        }),
      ],
    })
    const r = usePromocionStore.getState().evaluarCarrito([crearItem(a, 1), crearItem(b, 1)])
    const total = r.reduce((s, it) => s + it.subtotal, 0)
    expect(total).toBe(250)
    expect(r.reduce((s, it) => s + (it.descuento_promo || 0), 0)).toBe(50)
  })

  it('combo: 2 combos completos duplican el ahorro y las unidades sobrantes no participan', () => {
    const a = crearProducto({ id: 'a', precio_venta: 100 })
    const b = crearProducto({ id: 'b', precio_venta: 200 })
    usePromocionStore.setState({
      promociones: [
        crearPromocion({
          tipo: 'COMBO',
          producto_id: null,
          precio_combo: 250,
          items_combo: [
            { producto_id: 'a', cantidad: 1 },
            { producto_id: 'b', cantidad: 1 },
          ],
        }),
      ],
    })
    const r = usePromocionStore.getState().evaluarCarrito([crearItem(a, 3), crearItem(b, 2)])
    expect(r.reduce((s, it) => s + (it.descuento_promo || 0), 0)).toBe(100)
  })

  it('combo incompleto no aplica descuento', () => {
    const a = crearProducto({ id: 'a', precio_venta: 100 })
    usePromocionStore.setState({
      promociones: [
        crearPromocion({
          tipo: 'COMBO',
          producto_id: null,
          precio_combo: 250,
          items_combo: [
            { producto_id: 'a', cantidad: 1 },
            { producto_id: 'b', cantidad: 1 },
          ],
        }),
      ],
    })
    const r = usePromocionStore.getState().evaluarCarrito([crearItem(a, 1)])
    expect(r[0].descuento_promo).toBe(0)
  })

  it('devolución de envase conserva el importe negativo', () => {
    const dev = crearProducto({ id: 'dev', precio_venta: -500 })
    const r = usePromocionStore
      .getState()
      .evaluarCarrito([crearItem(dev, 2, { es_devolucion_envase: true, subtotal: -1000 })])
    expect(r[0].subtotal).toBe(-1000)
  })
})
