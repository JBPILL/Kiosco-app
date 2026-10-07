import type { Producto } from '../types/database'

/** Un código exacto y único del comercio; el cierre sigue verificando stock/precio. */
export function buscarCodigoCamaraLocal(productos: readonly Producto[], kioscoId: string, codigo: string): Producto | null {
  const encontrados = productos.filter(p => p.kiosco_id === kioscoId && p.activo === true && p.codigo_barras === codigo)
  if (encontrados.length !== 1) return null
  return { ...encontrados[0], precio_costo: 0 }
}
