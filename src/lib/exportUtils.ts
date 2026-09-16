import type { Producto, Categoria, MovimientoStock } from '../types/database'
import { formatFecha, formatPrecio } from './utils'

/**
 * Escapa un valor de texto para CSV seguro.
 */
function escaparCSV(valor: any): string {
  if (valor === null || valor === undefined) return '""'
  const str = String(valor).replace(/"/g, '""')
  return `"${str}"`
}

/**
 * Descarga un archivo en el navegador.
 */
export function descargarArchivo(contenido: string, nombreArchivo: string, tipoMime: string = 'text/csv;charset=utf-8;') {
  // \uFEFF es el BOM (Byte Order Mark) UTF-8 para que Excel en Windows interprete tildes y caracteres en español correctamente
  const blob = new Blob(['\uFEFF' + contenido], { type: tipoMime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', nombreArchivo)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Exporta el catálogo completo de productos a un archivo CSV compatible con Excel.
 */
export function exportarCatalogoCSV(productos: Producto[], categorias: Categoria[] = [], nombreKiosco: string = 'Kiosco') {
  const catMap = new Map<string, string>()
  categorias.forEach((c) => catMap.set(c.id, c.nombre))

  const encabezados = [
    'Descripción',
    'Código de Barras',
    'Categoría',
    'Precio Costo',
    'Precio Venta',
    'Margen Estimado ($)',
    'Stock Actual',
    'Stock Mínimo',
    'Estado',
    'Es Favorito',
  ]

  const filas = productos.map((p) => {
    const categoriaNombre = p.categoria?.nombre || (p.categoria_id ? catMap.get(p.categoria_id) : 'Sin categoría') || 'Sin categoría'
    const margen = Math.max(0, p.precio_venta - (p.precio_costo || 0))

    return [
      escaparCSV(p.descripcion),
      escaparCSV(p.codigo_barras || '—'),
      escaparCSV(categoriaNombre),
      p.precio_costo ?? 0,
      p.precio_venta ?? 0,
      margen,
      p.stock_actual ?? 0,
      p.stock_minimo ?? 0,
      escaparCSV(p.activo ? 'Activo' : 'Inactivo'),
      escaparCSV(p.es_favorito ? 'Sí' : 'No'),
    ].join(';')
  })

  const csvContent = [encabezados.join(';'), ...filas].join('\r\n')
  const fechaStr = new Date().toISOString().split('T')[0]
  const cleanName = nombreKiosco.toLowerCase().replace(/[^a-z0-9]/g, '_')

  descargarArchivo(csvContent, `backup_catalogo_${cleanName}_${fechaStr}.csv`)
}

/**
 * Exporta las ventas del kiosco a un archivo CSV compatible con Excel.
 */
export function exportarVentasCSV(
  ventas: {
    id: string
    fecha_hora: string
    total: number
    estado: string
    notas?: string | null
    pagos?: { medio_pago: string; monto: number }[]
    afip_nro_comprobante?: number | null
  }[],
  nombreKiosco: string = 'Kiosco'
) {
  const encabezados = [
    'N° Ticket',
    'Fecha y Hora',
    'Total ($)',
    'Estado',
    'Medios de Pago',
    'Notas',
  ]

  const filas = ventas.map((v) => {
    const ticket = v.afip_nro_comprobante
      ? `T-${v.afip_nro_comprobante}`
      : `T-${v.id.slice(0, 8).toUpperCase()}`

    const medios =
      v.pagos && v.pagos.length > 0
        ? v.pagos.map((p) => `${p.medio_pago}: ${formatPrecio(p.monto)}`).join(' | ')
        : 'Efectivo'

    return [
      escaparCSV(ticket),
      escaparCSV(formatFecha(v.fecha_hora)),
      v.total ?? 0,
      escaparCSV(v.estado),
      escaparCSV(medios),
      escaparCSV(v.notas || ''),
    ].join(';')
  })

  const csvContent = [encabezados.join(';'), ...filas].join('\r\n')
  const fechaStr = new Date().toISOString().split('T')[0]
  const cleanName = nombreKiosco.toLowerCase().replace(/[^a-z0-9]/g, '_')

  descargarArchivo(csvContent, `backup_ventas_${cleanName}_${fechaStr}.csv`)
}

/**
 * Exporta los renglones de una compra/remito de proveedor a CSV para Excel.
 */
export function exportarDetalleCompraCSV(
  compra: { nro_comprobante?: string | null; fecha: string; total: number; proveedor?: { nombre: string } | null },
  detalles: { producto?: { descripcion: string; codigo_barras?: string | null } | null; cantidad: number; precio_costo_unitario: number; subtotal: number }[]
) {
  const encabezados = [
    'Producto',
    'Código de Barras',
    'Cantidad',
    'Precio Costo Unitario ($)',
    'Subtotal ($)',
  ]

  const filas = detalles.map((d) =>
    [
      escaparCSV(d.producto?.descripcion || 'Producto'),
      escaparCSV(d.producto?.codigo_barras || '—'),
      d.cantidad,
      d.precio_costo_unitario ?? 0,
      d.subtotal ?? 0,
    ].join(';')
  )

  const compRef = compra.nro_comprobante
    ? compra.nro_comprobante.replace(/[^a-zA-Z0-9]/g, '_')
    : 'remito'

  const lineas = [
    `"COMPROBANTE DE RECEPCIÓN / COMPRA"`,
    `"Proveedor: ${compra.proveedor?.nombre || 'Proveedor'}"`,
    `"N° Comprobante: ${compra.nro_comprobante || 'S/N'}"`,
    `"Fecha: ${formatFecha(compra.fecha)}"`,
    `"Total: ${compra.total}"`,
    '',
    encabezados.join(';'),
    ...filas,
  ]

  descargarArchivo(lineas.join('\r\n'), `remito_${compRef}_${new Date().toISOString().split('T')[0]}.csv`)
}

export interface MovimientoContableCSV {
  fecha_hora: string
  tipo: 'VENTA' | 'COMPRA' | 'PAGO_PROVEEDOR' | 'EGRESO_CAJA' | 'INGRESO_CAJA'
  comprobante: string
  concepto: string
  medio_pago: string
  ingreso: number
  egreso: number
  observaciones?: string
}

/**
 * Exporta el Libro Diario Contable unificado (ventas, compras, pagos a proveedores y movimientos de caja).
 */
export function exportarLibroContableCSV(
  movimientos: MovimientoContableCSV[],
  periodoNombre: string = 'Periodo',
  nombreKiosco: string = 'Kiosco'
) {
  const encabezados = [
    'Fecha y Hora',
    'Tipo de Operación',
    'Comprobante / Ref',
    'Concepto / Proveedor / Cliente',
    'Medio de Pago',
    'Ingreso ($)',
    'Egreso ($)',
    'Observaciones',
  ]

  const filas = movimientos.map((m) =>
    [
      escaparCSV(formatFecha(m.fecha_hora)),
      escaparCSV(m.tipo),
      escaparCSV(m.comprobante),
      escaparCSV(m.concepto),
      escaparCSV(m.medio_pago),
      m.ingreso ?? 0,
      m.egreso ?? 0,
      escaparCSV(m.observaciones || ''),
    ].join(';')
  )

  const totalIngresos = movimientos.reduce((sum, m) => sum + (m.ingreso || 0), 0)
  const totalEgresos = movimientos.reduce((sum, m) => sum + (m.egreso || 0), 0)
  const balanceNeto = totalIngresos - totalEgresos

  const resumenLineas = [
    `"LIBRO DIARIO CONTABLE"`,
    `"Comercio: ${nombreKiosco}"`,
    `"Período: ${periodoNombre}"`,
    `"Total Ingresos ($): ${totalIngresos}"`,
    `"Total Egresos ($): ${totalEgresos}"`,
    `"Balance Neto ($): ${balanceNeto}"`,
    '',
  ]

  const csvContent = [...resumenLineas, encabezados.join(';'), ...filas].join('\r\n')
  const cleanName = nombreKiosco.toLowerCase().replace(/[^a-z0-9]/g, '_')
  const cleanPeriod = periodoNombre.toLowerCase().replace(/[^a-z0-9]/g, '_')

  descargarArchivo(csvContent, `libro_contable_${cleanName}_${cleanPeriod}.csv`)
}

/**
  * Exporta el historial de movimientos de stock a CSV para auditoría y control de inventario.
  */
export function exportarMovimientosStockCSV(
  movimientos: (MovimientoStock & { producto?: Producto })[],
  nombreKiosco: string = 'Kiosco'
) {
  const encabezados = [
    'Fecha y Hora',
    'Tipo Operación',
    'Producto',
    'Código de Barras',
    'Cantidad Variación',
    'Motivo',
    'Detalle / Notas',
  ]

  const filas = movimientos.map((m) => [
    escaparCSV(formatFecha(m.fecha)),
    escaparCSV(m.tipo),
    escaparCSV(m.producto?.descripcion || 'Producto eliminado'),
    escaparCSV(m.producto?.codigo_barras || '—'),
    m.cantidad,
    escaparCSV(m.motivo),
    escaparCSV(m.notas || ''),
  ].join(';'))

  const resumenLineas = [
    `"HISTORIAL DE MOVIMIENTOS DE STOCK"`,
    `"Comercio: ${nombreKiosco}"`,
    `"Total Registros: ${movimientos.length}"`,
    `"Fecha de Exportación: ${new Date().toLocaleDateString('es-AR')}"`,
    '',
  ]

  const csvContent = [...resumenLineas, encabezados.join(';'), ...filas].join('\r\n')
  const cleanName = nombreKiosco.toLowerCase().replace(/[^a-z0-9]/g, '_')
  const fechaStr = new Date().toISOString().split('T')[0]

  descargarArchivo(csvContent, `movimientos_stock_${cleanName}_${fechaStr}.csv`)
}

