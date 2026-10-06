import type { ItemCarrito, ItemCombo, Producto } from '../../../src/types/database.ts'

export interface ConsumoStockPoint {
  productoId: string
  cantidad: number
}

function milesimas(cantidad: number): number {
  const unidades = Math.round(cantidad * 1000)
  if (!Number.isFinite(cantidad) || cantidad <= 0 || !Number.isSafeInteger(unidades)
    || Math.abs(cantidad * 1000 - unidades) > 0.000001) throw new Error('Consumo físico inválido')
  return unidades
}

/** Resuelve cantidades físicas; no descuenta ni reserva stock. */
export function planificarStockPoint(
  items: ItemCarrito[], productos: Producto[], componentes: ItemCombo[], kioscoId: string,
): ConsumoStockPoint[] {
  const catalogo = new Map(productos.map((producto) => [producto.id, producto]))
  if (componentes.some((item) => item.kiosco_id !== kioscoId)) throw new Error('Componente de otro comercio')
  const acumulado = new Map<string, number>()
  const agregar = (productoId: string, cantidadMili: number) => {
    const producto = catalogo.get(productoId)
    if (!producto?.activo || producto.kiosco_id !== kioscoId || producto.es_combo) {
      throw new Error('Componente físico no disponible')
    }
    const total = (acumulado.get(productoId) || 0) + cantidadMili
    if (!Number.isSafeInteger(total) || total <= 0) throw new Error('Consumo físico inválido')
    acumulado.set(productoId, total)
  }
  for (const item of items) {
    if (item.es_devolucion_envase || item.producto.activo === false) continue
    const cantidadMili = milesimas(item.cantidad)
    if (!item.producto.es_combo) {
      agregar(item.producto.id, cantidadMili)
      continue
    }
    const receta = componentes.filter((componente) => componente.combo_producto_id === item.producto.id)
    if (receta.length === 0) throw new Error('Combo sin componentes')
    for (const componente of receta) {
      const productoMili = cantidadMili * milesimas(componente.cantidad)
      if (!Number.isSafeInteger(productoMili) || productoMili % 1000 !== 0) {
        throw new Error('El componente requiere más de tres decimales')
      }
      agregar(componente.componente_producto_id, productoMili / 1000)
    }
  }
  return [...acumulado.entries()].map(([productoId, unidades]) => {
    const cantidad = unidades / 1000
    const producto = catalogo.get(productoId)
    if (!producto || !Number.isFinite(producto.stock_actual) || producto.stock_actual < cantidad) {
      throw new Error('Stock insuficiente para cotizar el ticket')
    }
    return { productoId, cantidad }
  }).sort((a, b) => a.productoId < b.productoId ? -1 : a.productoId > b.productoId ? 1 : 0)
}
