import { supabase } from './supabase'
import { leerColeccionPorId } from './backupPagination'
import { camposFiscalesReporteVenta } from './salesReportProjection'
import { adjuntarCostosProtegidos, cargarCostosProtegidos, type CostoProductoProtegido } from './productCostAccess'
import { exportarMasterExcel } from './exportUtils'

interface FilaExcel {
  id: string
  [campo: string]: unknown
}

const fuentes = {
  productos: () => supabase.from('productos'),
  categorias: () => supabase.from('categorias'),
  movimientos_stock: () => supabase.from('movimientos_stock'),
  clientes: () => supabase.from('clientes'),
  proveedores: () => supabase.from('proveedores'),
  ventas: () => supabase.from('ventas'),
}

async function leerFilas(kioscoId: string, tabla: keyof typeof fuentes, seleccion: string): Promise<FilaExcel[]> {
  return leerColeccionPorId<FilaExcel>(async (ultimoId) => {
    let consulta = fuentes[tabla]().select(seleccion)
      .eq('kiosco_id', kioscoId).order('id').limit(500)
    if (tabla === 'ventas') consulta = consulta.eq('estado', 'COMPLETADA')
    if (ultimoId) consulta = consulta.gt('id', ultimoId)
    const { data, error } = await consulta
    if (error || data === null) return { data: null, error }
    const recibidas: unknown = data
    if (!Array.isArray(recibidas) || !recibidas.every((fila: unknown): fila is FilaExcel =>
      typeof fila === 'object' && fila !== null && 'id' in fila && typeof fila.id === 'string')) {
      throw new Error(`El servidor devolvió filas inválidas de ${tabla}.`)
    }
    return { data: recibidas, error: null }
  }, tabla)
}

function ordenar(filas: FilaExcel[], campo: string, descendente = false): FilaExcel[] {
  return [...filas].sort((a, b) => {
    const comparacion = String(a[campo] ?? '').localeCompare(String(b[campo] ?? ''), 'es')
    return descendente ? -comparacion : comparacion
  })
}

/** Exportación de consulta; el snapshot JSON sigue siendo el respaldo consistente. */
export async function exportarExcelMaestroComercio(kioscoId: string, nombreKiosco: string): Promise<void> {
  if (!kioscoId) throw new Error('Falta identificar el comercio para exportar.')
  const [productos, categorias, movimientos, clientes, proveedores, ventas] = await Promise.all([
    leerFilas(kioscoId, 'productos', '*, categoria:categorias(nombre)'),
    leerFilas(kioscoId, 'categorias', '*'),
    leerFilas(kioscoId, 'movimientos_stock', 'id, fecha, tipo, cantidad, motivo, notas, producto:productos(descripcion), usuario:usuarios(nombre)'),
    leerFilas(kioscoId, 'clientes', '*'),
    leerFilas(kioscoId, 'proveedores', '*'),
    leerFilas(kioscoId, 'ventas', `id, fecha_hora, total, estado, ${camposFiscalesReporteVenta()} usuario:usuarios!usuario_id(nombre), pagos:pagos_venta(medio_pago, monto)`),
  ])

  const costos: CostoProductoProtegido[] = []
  for (let i = 0; i < productos.length; i += 200) {
    costos.push(...await cargarCostosProtegidos(productos.slice(i, i + 200).map(producto => producto.id)))
  }
  const productosConCosto = adjuntarCostosProtegidos(
    productos.map(producto => ({ ...producto, precio_costo: 0 })), costos,
  )
  await exportarMasterExcel({
    kioscoId, nombreKiosco,
    productos: ordenar(productosConCosto, 'descripcion'), categorias,
    movimientosStock: ordenar(movimientos, 'fecha', true),
    clientes: ordenar(clientes, 'nombre'), proveedores: ordenar(proveedores, 'nombre'),
    ventas: ordenar(ventas, 'fecha_hora', true),
  })
}
