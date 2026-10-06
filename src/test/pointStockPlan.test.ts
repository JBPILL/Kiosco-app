import { describe, expect, it } from 'vitest'
import { planificarStockPoint } from '../../supabase/functions/_shared/pointStockPlan'
import { crearProducto, crearItem } from './factories'
import type { ItemCombo } from '../types/database'

const fisico = crearProducto({ id: 'fisico', stock_actual: 10 })
const combo = crearProducto({ id: 'combo', es_combo: true, stock_actual: 0 })
const receta: ItemCombo = { id: 'receta', kiosco_id: 'k1', combo_producto_id: 'combo',
  componente_producto_id: 'fisico', cantidad: 2 }

describe('plan físico de cotización Point', () => {
  it('suma venta directa y componentes sin consumir el producto virtual', () => {
    expect(planificarStockPoint([crearItem(fisico, 1), crearItem(combo, 2)], [fisico, combo], [receta], 'k1'))
      .toEqual([{ productoId: 'fisico', cantidad: 5 }])
    expect(fisico.stock_actual).toBe(10)
  })

  it('excluye servicios y devoluciones, y conserva fracciones físicas exactas', () => {
    const pesable = crearProducto({ ...fisico, es_pesable: true })
    const servicio = crearProducto({ id: 'servicio', activo: false })
    expect(planificarStockPoint([crearItem(pesable, 0.125), crearItem(servicio, 1),
      crearItem(servicio, 1, { es_devolucion_envase: true })], [pesable], [], 'k1'))
      .toEqual([{ productoId: 'fisico', cantidad: 0.125 }])
  })

  it('rechaza combos sin receta, componentes ajenos o virtuales y stock conjunto insuficiente', () => {
    expect(() => planificarStockPoint([crearItem(combo, 1)], [fisico, combo], [], 'k1')).toThrow('sin componentes')
    expect(() => planificarStockPoint([crearItem(combo, 1)], [fisico, combo], [{ ...receta, kiosco_id: 'otro' }], 'k1'))
      .toThrow('otro comercio')
    expect(() => planificarStockPoint([crearItem(combo, 1)], [fisico, combo], [{ ...receta, componente_producto_id: 'combo' }], 'k1'))
      .toThrow('físico')
    expect(() => planificarStockPoint([crearItem(fisico, 9), crearItem(combo, 1)], [fisico, combo], [receta], 'k1'))
      .toThrow('insuficiente')
  })

  it('no redondea silenciosamente componentes que requieren más de tres decimales', () => {
    expect(() => planificarStockPoint([crearItem(combo, 0.001)], [fisico, combo], [{ ...receta, cantidad: 0.001 }], 'k1'))
      .toThrow('tres decimales')
  })
})
