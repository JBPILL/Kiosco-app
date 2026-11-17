import { supabase } from './supabase'
import { leerColeccionPorId } from './backupPagination'
import { camposFiscalesReporteVenta } from './salesReportProjection'
import { adjuntarCostosProtegidos, cargarCostosProtegidos, type CostoProductoProtegido } from './productCostAccess'
import { exportarMasterExcel } from './exportUtils'
import { kioskoPilotStrictScopeActivo } from './kioskPilotScope'
import { devolucionesEfectivoActivas, envasesTransaccionalesActivos } from './pilotExpansion'

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
  movimientos_caja: () => supabase.from('movimientos_caja'),
  devoluciones_venta: () => supabase.from('devoluciones_venta'),
  envases_tipos_comercio: () => supabase.from('envases_tipos_comercio'),
  envases_saldos: () => supabase.from('envases_saldos'),
  envases_pendientes: () => supabase.from('envases_pendientes'),
  envases_movimientos: () => supabase.from('envases_movimientos'),
}

function esModuloOpcionalAusente(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; message?: unknown }
  const code = typeof e.code === 'string' ? e.code : ''
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : ''
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  )
}

async function leerFilas(
  kioscoId: string,
  tabla: keyof typeof fuentes,
  seleccion: string,
  opciones: { campoCursor?: string; opcional?: boolean } = {}
): Promise<FilaExcel[]> {
  const campoCursor = opciones.campoCursor ?? 'id'
  try {
    return await leerColeccionPorId<FilaExcel>(async (ultimoId) => {
      let consulta = fuentes[tabla]().select(seleccion)
        .eq('kiosco_id', kioscoId).order(campoCursor).limit(500)
      if (tabla === 'ventas') consulta = consulta.eq('estado', 'COMPLETADA')
      if (ultimoId) consulta = consulta.gt(campoCursor, ultimoId)
      const { data, error } = await consulta
      if (error) {
        if (opciones.opcional && esModuloOpcionalAusente(error)) {
          return { data: [], error: null }
        }
        return { data: null, error }
      }
      if (data === null) return { data: null, error }
      const recibidas: unknown = data
      if (!Array.isArray(recibidas) || !recibidas.every((fila: unknown): fila is FilaExcel =>
        typeof fila === 'object' && fila !== null && 'id' in fila && typeof fila.id === 'string')) {
        throw new Error(`El servidor devolvió filas inválidas de ${tabla}.`)
      }
      return { data: recibidas, error: null }
    }, tabla)
  } catch (err) {
    if (opciones.opcional && esModuloOpcionalAusente(err)) return []
    throw err
  }
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
  const modoEstricto = kioskoPilotStrictScopeActivo()
  const incluirDevoluciones = modoEstricto ? devolucionesEfectivoActivas() : true
  const incluirEnvases = modoEstricto ? envasesTransaccionalesActivos() : true

  const [
    productos,
    categorias,
    movimientos,
    clientes,
    proveedores,
    ventas,
    movimientosCaja,
    devoluciones,
    envasesTiposRaw,
    envasesSaldos,
    envasesPendientes,
    envasesMovimientosRaw,
  ] = await Promise.all([
    leerFilas(kioscoId, 'productos', '*, categoria:categorias(nombre)'),
    leerFilas(kioscoId, 'categorias', '*'),
    leerFilas(kioscoId, 'movimientos_stock', 'id, fecha, tipo, cantidad, delta_stock, motivo, notas, producto:productos(descripcion), usuario:usuarios(nombre)'),
    leerFilas(kioscoId, 'clientes', '*'),
    leerFilas(kioscoId, 'proveedores', '*'),
    leerFilas(kioscoId, 'ventas', `id, fecha_hora, total, estado, ${camposFiscalesReporteVenta()} usuario:usuarios!usuario_id(nombre), pagos:pagos_venta(medio_pago, monto)`),
    leerFilas(kioscoId, 'movimientos_caja', 'id, fecha_hora, tipo, motivo, monto, descripcion, sesion_caja_id, usuario:usuarios(nombre)'),
    incluirDevoluciones
      ? leerFilas(kioscoId, 'devoluciones_venta', 'id, venta_id, fecha_hora, monto_total, metodo_reintegro, motivo, notas, usuario:usuarios(nombre)', { opcional: !modoEstricto })
      : Promise.resolve([] as FilaExcel[]),
    incluirEnvases
      ? leerFilas(kioscoId, 'envases_tipos_comercio', 'id, nombre, precio, activo', { opcional: !modoEstricto })
      : Promise.resolve([] as FilaExcel[]),
    incluirEnvases
      ? leerFilas(kioscoId, 'envases_saldos', 'id:tipo_id, cantidad', { campoCursor: 'tipo_id', opcional: !modoEstricto })
      : Promise.resolve([] as FilaExcel[]),
    incluirEnvases
      ? leerFilas(kioscoId, 'envases_pendientes', 'id:tipo_id, cantidad', { campoCursor: 'tipo_id', opcional: !modoEstricto })
      : Promise.resolve([] as FilaExcel[]),
    incluirEnvases
      ? leerFilas(kioscoId, 'envases_movimientos', 'id, tipo_id, accion, cantidad, stock_resultante, importe, sesion_caja_id, distribuidor, notas, pendientes_delta, pendientes_resultantes, creado_en', { opcional: !modoEstricto })
      : Promise.resolve([] as FilaExcel[]),
  ])

  const saldosPorTipo = new Map(envasesSaldos.map((s) => [s.id, Number(s.cantidad ?? 0)]))
  const pendientesPorTipo = new Map(envasesPendientes.map((p) => [p.id, Number(p.cantidad ?? 0)]))
  const nombresPorTipo = new Map(envasesTiposRaw.map((t) => [t.id, String(t.nombre ?? t.id)]))
  const envasesTipos = ordenar(envasesTiposRaw, 'nombre').map((t) => ({
    id: t.id,
    nombre: String(t.nombre ?? t.id),
    precio: Number(t.precio ?? 0),
    activo: Boolean(t.activo),
    stockVacios: saldosPorTipo.get(t.id) ?? 0,
    pendientes: pendientesPorTipo.get(t.id) ?? 0,
  }))
  const envasesMovimientos = ordenar(envasesMovimientosRaw, 'creado_en', true).map((m) => ({
    ...m,
    tipo_nombre: nombresPorTipo.get(String(m.tipo_id ?? '')) || String(m.tipo_id ?? ''),
  }))

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
    movimientosCaja: ordenar(movimientosCaja, 'fecha_hora', true),
    devoluciones: ordenar(devoluciones, 'fecha_hora', true),
    incluirDevoluciones,
    envasesTipos,
    envasesMovimientos,
    incluirEnvases,
  })
}
