import { supabase } from './supabase'

export interface CostoProductoProtegido {
  producto_id: string
  precio_costo: number | string
}

export interface ProductoConCosto {
  id: string
  precio_costo: number
}

function claveCacheCostos(kioscoId: string): string {
  return `kiosko_cache_costos_privados_${kioscoId}`
}

export function leerCostosProtegidosLocales(kioscoId: string): CostoProductoProtegido[] {
  if (typeof localStorage === 'undefined' || !kioscoId) return []
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(claveCacheCostos(kioscoId)) || '[]')
    return Array.isArray(parsed) ? parsed as CostoProductoProtegido[] : []
  } catch {
    return []
  }
}

export function guardarCostosProtegidosLocales(
  kioscoId: string,
  costos: CostoProductoProtegido[]
): void {
  if (typeof localStorage === 'undefined' || !kioscoId) return
  try {
    const actuales = leerCostosProtegidosLocales(kioscoId)
    const porId = new Map(actuales.map((costo) => [costo.producto_id, costo]))
    costos.forEach((costo) => porId.set(costo.producto_id, costo))
    localStorage.setItem(claveCacheCostos(kioscoId), JSON.stringify([...porId.values()]))
  } catch (error) {
    console.warn('No se pudo guardar la caché privada de costos:', error)
  }
}

/**
 * Integra los costos consultados en la tabla con RLS de dueño.
 * Los productos sin costo asociado se muestran con costo 0.
 */
export function adjuntarCostosProtegidos<T extends ProductoConCosto>(
  productos: T[],
  costos: CostoProductoProtegido[]
): T[] {
  const costosPorProducto = new Map(
    costos.map(({ producto_id, precio_costo }) => [producto_id, Number(precio_costo) || 0])
  )

  return productos.map((producto) => ({
    ...producto,
    precio_costo: costosPorProducto.get(producto.id) ?? 0,
  }))
}

export async function cargarCostosProtegidos(productoIds: string[]): Promise<CostoProductoProtegido[]> {
  const idsUnicos = [...new Set(productoIds.filter(Boolean))]
  if (idsUnicos.length === 0) return []

  const { data, error } = await supabase
    .from('producto_costos')
    .select('producto_id, precio_costo')
    .in('producto_id', idsUnicos)

  if (error) throw new Error(error.message || 'No se pudieron cargar los costos protegidos')
  return (data || []) as CostoProductoProtegido[]
}
