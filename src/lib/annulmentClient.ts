import { supabase } from './supabase'

export interface AnnulmentResult {
  venta_id: string
  kiosco_id: string
  estado: 'ANULADA'
  stock: { producto_id: string; stock_actual: number }[]
}

export async function anularVentaAtomica(
  ventaId: string, kioscoId: string, motivo: string, sesionReintegro: string | null,
): Promise<AnnulmentResult> {
  const { data, error } = await supabase.rpc('anular_venta_atomica', {
    p_venta_id: ventaId,
    p_motivo: motivo.trim(),
    p_sesion_reintegro: sesionReintegro,
  })
  if (error) throw new Error(error.message)
  const result: unknown = data
  if (!result || typeof result !== 'object' || !('venta_id' in result)
    || result.venta_id !== ventaId || !('kiosco_id' in result) || result.kiosco_id !== kioscoId
    || !('estado' in result) || result.estado !== 'ANULADA'
    || !('stock' in result) || !Array.isArray(result.stock)) {
    throw new Error('No se confirmó la anulación. Reintentá con la misma venta.')
  }
  const stock = result.stock.map((row: unknown) => {
    if (!row || typeof row !== 'object' || !('producto_id' in row)
      || typeof row.producto_id !== 'string' || !('stock_actual' in row)
      || typeof row.stock_actual !== 'number' || !Number.isFinite(row.stock_actual)) {
      throw new Error('La respuesta de stock no quedó confirmada. Reintentá con la misma venta.')
    }
    return { producto_id: row.producto_id, stock_actual: row.stock_actual }
  })
  return { venta_id: ventaId, kiosco_id: kioscoId, estado: 'ANULADA', stock }
}
