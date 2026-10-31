import { distribuirTotalVenta } from './distribuirTotalVenta.ts'

interface LineaReparto { subtotal: number; es_devolucion_envase?: boolean }

/** A commercial discount never reduces the value already recognized for empties. */
export function distribuirTotalConEnvases(items: readonly LineaReparto[], total: number): number[] {
  if (!items.some(item => item.es_devolucion_envase)) return distribuirTotalVenta(items.map(item => item.subtotal), total)
  if (!Number.isSafeInteger(total) || total < 0 || items.some(item => !Number.isSafeInteger(item.subtotal)
    || (item.es_devolucion_envase ? item.subtotal > 0 : item.subtotal < 0))) throw new Error('El descuento de envases en ticket requiere importes en pesos enteros')
  const base = items.reduce((suma, item) => suma + item.subtotal, 0)
  if (base < 0) throw new Error('Los envases superan el importe del ticket; usá la recepción en efectivo')
  const fijos = items.reduce((suma, item) => suma + (item.es_devolucion_envase ? item.subtotal : 0), 0)
  const mercaderia = items.filter(item => !item.es_devolucion_envase)
  if (!mercaderia.length) throw new Error('La recepción sin compra se registra por caja')
  const reparto = distribuirTotalVenta(mercaderia.map(item => item.subtotal), total - fijos)
  let indice = 0
  return items.map(item => item.es_devolucion_envase ? item.subtotal : reparto[indice++])
}
