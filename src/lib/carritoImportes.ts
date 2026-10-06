import type { ItemCarrito } from '../types/database.ts'

export type TipoAjuste =
  | 'NINGUNO'
  | 'DESCUENTO_PORCENTAJE'
  | 'DESCUENTO_FIJO'
  | 'RECARGO_PORCENTAJE'
  | 'RECARGO_FIJO'

export function subtotalCarrito(items: ItemCarrito[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.subtotal, 0))
}

export function ajusteCarrito(items: ItemCarrito[], tipoAjuste: TipoAjuste, valorAjuste: number): number {
  const subtotal = subtotalCarrito(items)
  // Base comercial para descuentos y recargos porcentuales: sólo mercadería real,
  // excluyendo los depósitos de envases retornables y devoluciones de envases.
  const baseMercaderia = Math.max(
    0,
    items.reduce((sum, item) => {
      if (item.es_devolucion_envase) return sum
      const extraEnvase = item.sin_envase
        ? Math.round(item.cantidad * (item.precio_envase_unitario || item.producto.precio_envase || 0))
        : 0
      return sum + Math.max(0, item.subtotal - extraEnvase)
    }, 0)
  )

  if (tipoAjuste === 'DESCUENTO_PORCENTAJE') {
    return Math.round((baseMercaderia * valorAjuste) / 100)
  }
  if (tipoAjuste === 'DESCUENTO_FIJO') {
    return Math.round(Math.max(0, Math.min(valorAjuste, subtotal)))
  }
  if (tipoAjuste === 'RECARGO_PORCENTAJE') {
    return Math.round((baseMercaderia * valorAjuste) / 100)
  }
  if (tipoAjuste === 'RECARGO_FIJO') {
    return Math.round(valorAjuste)
  }
  return 0
}

export function totalCarrito(items: ItemCarrito[], tipoAjuste: TipoAjuste, valorAjuste: number): number {
  const subtotal = subtotalCarrito(items)
  const ajuste = ajusteCarrito(items, tipoAjuste, valorAjuste)
  if (tipoAjuste.startsWith('DESCUENTO')) return Math.round(Math.max(0, subtotal - ajuste))
  if (tipoAjuste.startsWith('RECARGO')) return Math.round(subtotal + ajuste)
  return Math.round(subtotal)
}
