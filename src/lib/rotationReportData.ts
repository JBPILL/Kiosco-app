import { supabase } from './supabase'
import { leerColeccionPorId } from './backupPagination'
import { adjuntarCostosProtegidos, cargarCostosProtegidos, type CostoProductoProtegido } from './productCostAccess'
import type { Producto } from '../types/database'
import type { LineaVentaHistorial } from './rotacionInventario'

interface VentaRotacion {
  id: string
  fecha_hora: string
  detalles: { producto_id: string; cantidad: number; es_devolucion_envase: boolean }[]
}

export interface DatosRotacion {
  productos: Producto[]
  lineasVentas: LineaVentaHistorial[]
}

export async function cargarDatosRotacion(kioscoId: string, fechaDesde: string): Promise<DatosRotacion> {
  if (!kioscoId) throw new Error('Falta identificar el comercio para consultar rotación.')
  const [productos, ventas] = await Promise.all([
    leerColeccionPorId<Producto>(async ultimoId => {
      let consulta = supabase.from('productos').select('*, categoria:categorias(nombre, color)')
        .eq('kiosco_id', kioscoId).eq('activo', true).order('id').limit(500)
      if (ultimoId) consulta = consulta.gt('id', ultimoId)
      return await consulta
    }, 'productos de rotación'),
    leerColeccionPorId<VentaRotacion>(async ultimoId => {
      let consulta = supabase.from('ventas')
        .select('id, fecha_hora, detalles:detalles_venta(producto_id, cantidad, es_devolucion_envase)')
        .eq('kiosco_id', kioscoId).eq('estado', 'COMPLETADA')
        .gte('fecha_hora', fechaDesde).order('id').limit(500)
      if (ultimoId) consulta = consulta.gt('id', ultimoId)
      return await consulta
    }, 'ventas de rotación'),
  ])
  if (ventas.some(venta => !Array.isArray(venta.detalles))) {
    throw new Error('No se confirmó el detalle de las ventas para calcular rotación.')
  }
  const ids = [...new Set([
    ...productos.map(producto => producto.id),
    ...ventas.flatMap(venta => venta.detalles.map(detalle => detalle.producto_id)),
  ])]
  const costos: CostoProductoProtegido[] = []
  for (let inicio = 0; inicio < ids.length; inicio += 200) {
    costos.push(...await cargarCostosProtegidos(ids.slice(inicio, inicio + 200)))
  }
  const porId = new Map(costos.map(costo => [costo.producto_id, Number(costo.precio_costo) || 0]))
  return {
    productos: adjuntarCostosProtegidos(productos, costos)
      .sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es')),
    lineasVentas: ventas.flatMap(venta => venta.detalles.map(detalle => ({
      producto_id: detalle.producto_id,
      cantidad: Number(detalle.cantidad) || 0,
      precio_costo: porId.get(detalle.producto_id) || 0,
      fecha_hora: venta.fecha_hora,
      es_devolucion_envase: Boolean(detalle.es_devolucion_envase),
    }))),
  }
}
