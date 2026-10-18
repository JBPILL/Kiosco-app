import { supabase } from './supabase'
import { leerColeccionPorId } from './backupPagination'
import { validarUuid } from './durablePilotOperationOutbox'

export interface TipoEnvaseCompartido {
  id: string
  nombre: string
  precio: number
  activo: boolean
  stockVacios: number
}

export async function cargarEnvasesCompartidos(kioscoId: string): Promise<TipoEnvaseCompartido[]> {
  const kid = validarUuid(kioscoId)
  const [tipos, saldos] = await Promise.all([
    leerColeccionPorId<{ id: string; nombre: string; precio: number | string; activo: boolean }>(async ultimo => {
      let query = supabase.from('envases_tipos_comercio').select('id,nombre,precio,activo').eq('kiosco_id', kid).order('id').limit(500)
      if (ultimo) query = query.gt('id', ultimo)
      return await query
    }, 'tipos de envases'),
    leerColeccionPorId<{ id: string; cantidad: number }>(async ultimo => {
      let query = supabase.from('envases_saldos').select('id:tipo_id,cantidad').eq('kiosco_id', kid).order('tipo_id').limit(500)
      if (ultimo) query = query.gt('tipo_id', ultimo)
      return await query
    }, 'saldo de envases'),
  ])
  const porTipo = new Map(saldos.map(saldo => [saldo.id, saldo.cantidad]))
  if (saldos.some(saldo => !Number.isInteger(saldo.cantidad) || saldo.cantidad < 0 || saldo.cantidad > 999999999)) throw new Error('Saldo de envases inválido.')
  return tipos.map(tipo => {
    const precio = typeof tipo.precio === 'string' && /^\d+(\.\d{1,2})?$/.test(tipo.precio) ? Number(tipo.precio) : tipo.precio
    if (!tipo.nombre || typeof tipo.activo !== 'boolean' || typeof precio !== 'number' || !Number.isFinite(precio)
      || precio < 0 || precio > 9999999999.99 || Number(precio.toFixed(2)) !== precio) throw new Error('Catálogo de envases inválido.')
    // A newly configured type has zero stock until its first ledger entry.
    return { ...tipo, precio, stockVacios: porTipo.get(tipo.id) ?? 0 }
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
