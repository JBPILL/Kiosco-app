import type { Producto, Categoria } from '../types/database'
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
