import { supabase } from './supabase'

export interface IdentidadArticuloLibre {
  id: string
  descripcion: string
  precio_venta: number
}

/** Un reintento puede reutilizar el artículo, pero no cambiar su identidad. */
export async function verificarArticulosLibres(kioscoId: string, articulos: IdentidadArticuloLibre[]): Promise<void> {
  const esperados = new Map<string, IdentidadArticuloLibre>()
  for (const articulo of articulos) {
    if (!articulo.id || !articulo.descripcion || !Number.isFinite(articulo.precio_venta) || articulo.precio_venta < 0) {
      throw new Error('El artículo libre tiene datos inválidos.')
    }
    const previo = esperados.get(articulo.id)
    if (previo && (previo.descripcion !== articulo.descripcion || previo.precio_venta !== articulo.precio_venta)) {
      throw new Error('El artículo libre tiene datos en conflicto.')
    }
    esperados.set(articulo.id, articulo)
  }
  if (esperados.size === 0) return
  const { data, error } = await supabase.from('productos')
    .select('id,kiosco_id,descripcion,precio_venta,activo')
    .eq('kiosco_id', kioscoId).in('id', [...esperados.keys()])
  if (error || !Array.isArray(data) || data.length !== esperados.size) throw new Error('No se confirmó la identidad de los artículos libres.')
  const vistos = new Set<string>()
  for (const fila of data) {
    if (!fila || typeof fila !== 'object' || typeof fila.id !== 'string'
      || (typeof fila.precio_venta !== 'number' && typeof fila.precio_venta !== 'string')
      || String(fila.precio_venta).trim() === '') throw new Error('El artículo libre tiene datos inválidos.')
    const esperado = esperados.get(fila.id)
    if (!esperado || vistos.has(fila.id) || fila.kiosco_id !== kioscoId || fila.activo !== false
      || fila.descripcion !== esperado.descripcion || Number(fila.precio_venta) !== esperado.precio_venta) {
      throw new Error('El artículo libre tiene datos en conflicto.')
    }
    vistos.add(fila.id)
  }
}
