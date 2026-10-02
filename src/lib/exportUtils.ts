import writeXlsxFile, { type Row, type Cell } from 'write-excel-file/browser'
import type { Producto, Categoria, MovimientoStock } from '../types/database'
import { formatFecha, formatPrecio, labelMedioPago } from './utils'

export interface SheetOptionsColumn {
  width?: number
}

/**
 * Escapa un valor de texto para CSV seguro (mantenido para compatibilidad).
 */
export function escaparCSV(valor: any): string {
  if (valor === null || valor === undefined) return '""'
  const str = String(valor).replace(/"/g, '""')
  return `"${str}"`
}

/**
 * Descarga un archivo binario o de texto en el navegador.
 */
export function descargarArchivo(contenido: string, nombreArchivo: string, tipoMime: string = 'text/csv;charset=utf-8;') {
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
 * Sanitiza nombres de archivos para compatibilidad estricta con Windows, macOS y Linux.
 */
export function sanitizarNombreArchivo(nombre: string): string {
  return (
    nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'archivo'
  )
}

// ============================================================================
// CONSTRUCTORES DE CELDAS Y ESTILOS CORPORATIVOS (SLATE EXECUTIVE DESIGN)
// ============================================================================

/**
 * Retorna un arreglo de celdas que representa una celda expandida en varias columnas.
 * write-excel-file requiere 'null' en las celdas subsecuentes para consolidar el span.
 */
function cSpan(cell: Cell, span: number): (Cell | null)[] {
  if (!cell || typeof cell !== 'object') {
    return [cell, ...Array(Math.max(0, span - 1)).fill(null)]
  }
  const result: (Cell | null)[] = [{ ...cell, columnSpan: span }]
  for (let i = 1; i < span; i++) {
    result.push(null)
  }
  return result
}

function emptyRow(cols: number): (Cell | null)[] {
  return Array(cols).fill(null)
}

function cHeader(value: string, align: 'left' | 'center' | 'right' = 'left'): Cell {
  return {
    value,
    type: String,
    fontWeight: 'bold',
    fontSize: 10,
    textColor: '#FFFFFF',
    backgroundColor: '#1E293B',
    align,
    borderColor: '#334155',
    borderStyle: 'thin',
  }
}

function cText(value?: string | null, bg: string = '#FFFFFF', align: 'left' | 'center' | 'right' = 'left', isBold: boolean = false): Cell {
  return {
    value: value || '—',
    type: String,
    fontSize: 10,
    fontWeight: isBold ? 'bold' : undefined,
    textColor: '#1E293B',
    backgroundColor: bg,
    align,
    borderColor: '#E2E8F0',
    borderStyle: 'thin',
  }
}

function cMoney(value: number, bg: string = '#FFFFFF', isBold: boolean = false): Cell {
  return {
    value: Number(value || 0),
    type: Number,
    format: '$#,##0.00',
    fontSize: 10,
    fontWeight: isBold ? 'bold' : undefined,
    textColor: '#0F172A',
    backgroundColor: bg,
    align: 'right',
    borderColor: '#E2E8F0',
    borderStyle: 'thin',
  }
}

function cNum(value: number, bg: string = '#FFFFFF', format: string = '#,##0', isBold: boolean = false): Cell {
  return {
    value: Number(value || 0),
    type: Number,
    format,
    fontSize: 10,
    fontWeight: isBold ? 'bold' : undefined,
    textColor: '#0F172A',
    backgroundColor: bg,
    align: 'right',
    borderColor: '#E2E8F0',
    borderStyle: 'thin',
  }
}

function cPercent(value: number, bg: string = '#FFFFFF', isBold: boolean = false): Cell {
  return {
    value: Number(value || 0),
    type: Number,
    format: '0.0%',
    fontSize: 10,
    fontWeight: isBold ? 'bold' : undefined,
    textColor: '#0F172A',
    backgroundColor: bg,
    align: 'right',
    borderColor: '#E2E8F0',
    borderStyle: 'thin',
  }
}

function cCardLabel(label: string, span: number = 2): (Cell | null)[] {
  return cSpan({
    value: label.toUpperCase(),
    type: String,
    fontWeight: 'bold',
    fontSize: 9,
    textColor: '#475569',
    backgroundColor: '#F1F5F9',
    align: 'center',
    borderColor: '#CBD5E1',
    borderStyle: 'thin',
  }, span)
}

function cCardValue(
  val: number | string,
  esMoneda: boolean = true,
  span: number = 2,
  colorTexto: string = '#0F172A'
): (Cell | null)[] {
  if (typeof val === 'number') {
    return cSpan({
      value: val,
      type: Number,
      format: esMoneda ? '$#,##0.00' : '#,##0',
      fontWeight: 'bold',
      fontSize: 12,
      textColor: colorTexto,
      backgroundColor: '#FFFFFF',
      align: 'center',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, span)
  }
  return cSpan({
    value: String(val || '—'),
    type: String,
    fontWeight: 'bold',
    fontSize: 12,
    textColor: colorTexto,
    backgroundColor: '#FFFFFF',
    align: 'center',
    borderColor: '#CBD5E1',
    borderStyle: 'thin',
  }, span)
}

function cTotalLabel(value: string, colSpan: number = 1): (Cell | null)[] {
  return cSpan({
    value,
    type: String,
    fontWeight: 'bold',
    fontSize: 10,
    textColor: '#0F172A',
    backgroundColor: '#F1F5F9',
    align: 'right',
    topBorderStyle: 'thin',
    topBorderColor: '#94A3B8',
    bottomBorderStyle: 'double',
    bottomBorderColor: '#0F172A',
  }, colSpan)
}

function cTotalMoney(value: number): Cell {
  return {
    value: Number(value || 0),
    type: Number,
    format: '$#,##0.00',
    fontWeight: 'bold',
    fontSize: 10,
    textColor: '#0F172A',
    backgroundColor: '#F1F5F9',
    align: 'right',
    topBorderStyle: 'thin',
    topBorderColor: '#94A3B8',
    bottomBorderStyle: 'double',
    bottomBorderColor: '#0F172A',
  }
}

function cTotalNum(value: number, format: string = '#,##0'): Cell {
  return {
    value: Number(value || 0),
    type: Number,
    format,
    fontWeight: 'bold',
    fontSize: 10,
    textColor: '#0F172A',
    backgroundColor: '#F1F5F9',
    align: 'right',
    topBorderStyle: 'thin',
    topBorderColor: '#94A3B8',
    bottomBorderStyle: 'double',
    bottomBorderColor: '#0F172A',
  }
}

// ============================================================================
// VALUACIÓN DE INVENTARIO Y CATÁLOGO GENERAL
// ============================================================================
export async function exportarCatalogoExcel(
  productos: Producto[],
  categorias: Categoria[] = [],
  nombreKiosco: string = 'Kiosco'
) {
  const totalCols = 12
  const columns: SheetOptionsColumn[] = [
    { width: 16 }, // Código de Barras
    { width: 36 }, // Descripción
    { width: 20 }, // Categoría
    { width: 12 }, // Unidad
    { width: 16 }, // Precio Costo ($)
    { width: 16 }, // Precio Venta ($)
    { width: 16 }, // Margen Unitario ($)
    { width: 14 }, // Margen %
    { width: 14 }, // Stock Actual
    { width: 14 }, // Stock Mínimo
    { width: 18 }, // Valuación Costo ($)
    { width: 14 }, // Estado
  ]

  const catMap = new Map<string, string>()
  categorias.forEach((c) => catMap.set(c.id, c.nombre))

  // Filtrar exclusivamente productos comerciales físicos activos
  // (excluyendo devoluciones de envases y artículos virtuales ad-hoc con stock simulado > 90000)
  const productosValidos = productos.filter((p) => {
    if (p.activo === false) return false
    if (p.es_combo === true) return false
    const cod = (p.codigo_barras || '').toUpperCase().trim()
    if (cod.startsWith('COMBO-AUTO-')) return false
    const desc = (p.descripcion || '').toLowerCase().trim()
    if (desc.startsWith('devolución') || desc.startsWith('devolucion')) return false
    if (p.stock_actual > 90000 && !p.codigo_barras) return false
    return true
  })

  const totalArticulos = productosValidos.length
  const totalUnidades = productosValidos.reduce((s, p) => s + Math.max(0, p.stock_actual || 0), 0)
  const valuacionCosto = productosValidos.reduce((s, p) => s + (p.stock_actual > 0 ? p.stock_actual * (p.precio_costo || 0) : 0), 0)
  const valuacionVenta = productosValidos.reduce((s, p) => s + (p.stock_actual > 0 ? p.stock_actual * (p.precio_venta || 0) : 0), 0)
  const margenPotencial = valuacionVenta - valuacionCosto

  const fechaGeneracion = new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const rows: Row[] = [
    cSpan({
      value: `${nombreKiosco.toUpperCase()} - VALUACIÓN DE INVENTARIO Y CATÁLOGO GENERAL`,
      type: String,
      fontWeight: 'bold',
      fontSize: 14,
      textColor: '#FFFFFF',
      backgroundColor: '#1E293B',
      align: 'center',
    }, totalCols) as Row,
    cSpan({
      value: `FECHA DE INFORME: ${fechaGeneracion} | AUDITORÍA DE STOCK | SISTEMA ALPASO POS`,
      type: String,
      fontSize: 9,
      textColor: '#E2E8F0',
      backgroundColor: '#334155',
      align: 'center',
    }, totalCols) as Row,
    emptyRow(totalCols) as Row,

    // KPI Cards: 5 tarjetas ocupando 12 columnas
    cSpan({
      value: 'RESUMEN EJECUTIVO DE CAPITAL EN MERCADERÍA',
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,
    [
      ...cCardLabel('Artículos Registrados', 2),
      ...cCardLabel('Unidades en Inventario', 2),
      ...cCardLabel('Capital Invertido (Costo)', 2),
      ...cCardLabel('Valoración Comercial (Venta)', 3),
      ...cCardLabel('Ganancia Bruta Potencial', 3),
    ] as Row,
    [
      ...cCardValue(totalArticulos, false, 2, '#0F172A'),
      ...cCardValue(totalUnidades, false, 2, '#0F172A'),
      ...cCardValue(valuacionCosto, true, 2, '#0F172A'),
      ...cCardValue(valuacionVenta, true, 3, '#1E40AF'),
      ...cCardValue(margenPotencial, true, 3, '#15803D'),
    ] as Row,
    emptyRow(totalCols) as Row,

    // Tabla de Catálogo
    cSpan({
      value: 'PLANILLA MAESTRA DE ARTÍCULOS, COSTOS Y PRECIOS',
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,
    [
      cHeader('Código de Barras', 'center'),
      cHeader('Descripción del Producto', 'left'),
      cHeader('Categoría', 'left'),
      cHeader('Unidad', 'center'),
      cHeader('Precio Costo ($)', 'right'),
      cHeader('Precio Venta ($)', 'right'),
      cHeader('Margen ($)', 'right'),
      cHeader('Margen %', 'right'),
      cHeader('Stock Actual', 'right'),
      cHeader('Stock Mínimo', 'right'),
      cHeader('Valuación Costo ($)', 'right'),
      cHeader('Estado', 'center'),
    ] as Row,
  ]

  productosValidos.forEach((p, idx) => {
    const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
    const catNombre = p.categoria?.nombre || (p.categoria_id ? catMap.get(p.categoria_id) : 'General') || 'General'
    const unidadStr = p.es_pesable ? (p.unidad_medida || 'KG').toUpperCase() : 'UN'
    const margenMonto = p.precio_venta - (p.precio_costo || 0)
    const margenPorc = p.precio_venta > 0 ? margenMonto / p.precio_venta : 0
    const valCostoProd = (p.stock_actual > 0 ? p.stock_actual : 0) * (p.precio_costo || 0)

    rows.push([
      cText(p.codigo_barras || '—', bg, 'center'),
      cText(p.descripcion, bg, 'left', true),
      cText(catNombre, bg, 'left'),
      cText(unidadStr, bg, 'center'),
      cMoney(p.precio_costo || 0, bg),
      cMoney(p.precio_venta || 0, bg),
      cMoney(margenMonto, bg),
      cPercent(margenPorc, bg),
      cNum(p.stock_actual || 0, bg, p.es_pesable ? '#,##0.000' : '#,##0'),
      cNum(p.stock_minimo || 0, bg, p.es_pesable ? '#,##0.000' : '#,##0'),
      cMoney(valCostoProd, bg),
      cText(p.activo ? 'ACTIVO' : 'INACTIVO', bg, 'center'),
    ] as Row)
  })

  // Fila de Total
  rows.push([
    ...cTotalLabel('VALUACIÓN TOTAL DE INVENTARIO', 8),
    cTotalNum(totalUnidades, '#,##0'),
    cText('—', '#F1F5F9', 'center'),
    cTotalMoney(valuacionCosto),
    cSpan({
      value: `VENTA: ${formatPrecio(valuacionVenta)}`,
      type: String,
      fontWeight: 'bold',
      fontSize: 9,
      textColor: '#1E40AF',
      backgroundColor: '#F1F5F9',
      align: 'center',
      topBorderStyle: 'thin',
      topBorderColor: '#94A3B8',
      bottomBorderStyle: 'double',
      bottomBorderColor: '#0F172A',
    }, 1)[0] as Cell,
  ] as Row)

  const cleanName = sanitizarNombreArchivo(nombreKiosco)
  const fechaStr = new Date().toISOString().split('T')[0]
  const fileName = `catalogo_valuacion_${cleanName}_${fechaStr}.xlsx`

  await writeXlsxFile(rows, { columns }).toFile(fileName)
}

export const exportarCatalogoCSV = exportarCatalogoExcel

export interface VentaParaExportar {
  id: string
  fecha_hora: string
  total: number
  estado?: string | null
  notas?: string | null
  pagos?: { medio_pago: string; monto: number }[]
  afip_nro_comprobante?: number | null
  afip_cae?: string | null
  usuario?: any
}

// ============================================================================
// REPORTE EJECUTIVO DE VENTAS
// ============================================================================
export async function exportarVentasExcel(
  ventas: VentaParaExportar[],
  nombreKiosco: string = 'Kiosco',
  fechaOPeriodo?: string
) {
  const totalCols = 8
  const columns: SheetOptionsColumn[] = [
    { width: 18 }, // N° Comprobante
    { width: 20 }, // Fecha y Hora
    { width: 16 }, // Circuito Fiscal
    { width: 20 }, // CAE AFIP
    { width: 20 }, // Cajero / Operador
    { width: 26 }, // Medios de Pago
    { width: 14 }, // Estado
    { width: 18 }, // Total Venta ($)
  ]

  const ventasValidas = ventas.filter((v) => v.estado === 'COMPLETADA')
  const totalFacturado = ventasValidas.reduce((s, v) => s + (v.total || 0), 0)
  const ventasFiscales = ventasValidas.filter((v) => Boolean(v.afip_cae))
  const totalAFIP = ventasFiscales.reduce((s, v) => s + (v.total || 0), 0)
  const ticketPromedio = ventasValidas.length > 0 ? totalFacturado / ventasValidas.length : 0

  const periodoStr = fechaOPeriodo || new Date().toLocaleDateString('es-AR')
  const fechaGeneracion = new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const rows: Row[] = [
    cSpan({
      value: `${nombreKiosco.toUpperCase()} - REPORTE EJECUTIVO DE VENTAS`,
      type: String,
      fontWeight: 'bold',
      fontSize: 14,
      textColor: '#FFFFFF',
      backgroundColor: '#1E293B',
      align: 'center',
    }, totalCols) as Row,
    cSpan({
      value: `FECHA / PERÍODO: ${periodoStr} | GENERADO: ${fechaGeneracion} | SISTEMA ALPASO POS`,
      type: String,
      fontSize: 9,
      textColor: '#E2E8F0',
      backgroundColor: '#334155',
      align: 'center',
    }, totalCols) as Row,
    emptyRow(totalCols) as Row,

    // KPI Cards
    cSpan({
      value: 'INDICADORES CLAVE DE RENDIMIENTO COMERCIAL (KPIS)',
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,
    [
      ...cCardLabel('Ventas Totales Netas', 2),
      ...cCardLabel('Tickets Emitidos', 2),
      ...cCardLabel('Facturado Fiscal ARCA', 2),
      ...cCardLabel('Ticket Promedio', 2),
    ] as Row,
    [
      ...cCardValue(totalFacturado, true, 2, '#0F172A'),
      ...cCardValue(ventasValidas.length, false, 2, '#0F172A'),
      ...cCardValue(totalAFIP, true, 2, '#1E40AF'),
      ...cCardValue(ticketPromedio, true, 2, '#15803D'),
    ] as Row,
    emptyRow(totalCols) as Row,

    // Tabla de Ventas
    cSpan({
      value: 'REGISTRO DETALLADO DE COMPROBANTES Y TICKETS',
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,
    [
      cHeader('N° Comprobante', 'center'),
      cHeader('Fecha y Hora', 'center'),
      cHeader('Circuito Fiscal', 'center'),
      cHeader('CAE ARCA', 'center'),
      cHeader('Cajero / Operador', 'left'),
      cHeader('Medio de Pago', 'left'),
      cHeader('Estado', 'center'),
      cHeader('Total Venta ($)', 'right'),
    ] as Row,
  ]

  ventas.forEach((v, idx) => {
    const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
    const ticket = v.afip_nro_comprobante
      ? `FC-${String(v.afip_nro_comprobante).padStart(8, '0')}`
      : v.id
      ? `T-${v.id.slice(0, 8).toUpperCase()}`
      : 'T-S/N'

    const esFiscal = Boolean(v.afip_cae)
    const circuitoStr = esFiscal ? 'ARCA Oficial' : 'Mostrador Interno'
    const cajeroStr = Array.isArray(v.usuario)
      ? v.usuario[0]?.nombre || 'Cajero'
      : v.usuario?.nombre || 'Cajero'
    const fechaTexto = v.fecha_hora ? formatFecha(v.fecha_hora) : '—'
    const mediosStr =
      v.pagos && v.pagos.length > 0
        ? v.pagos.map((p: any) => `${labelMedioPago(p.medio_pago)}: ${formatPrecio(p.monto)}`).join(' | ')
        : 'Efectivo'

    rows.push([
      cText(ticket, bg, 'center', true),
      cText(fechaTexto, bg, 'center'),
      cText(circuitoStr, bg, 'center'),
      cText(v.afip_cae || '—', bg, 'center'),
      cText(cajeroStr, bg, 'left'),
      cText(mediosStr, bg, 'left'),
      cText(v.estado || 'COMPLETADA', bg, 'center', v.estado === 'ANULADA'),
      cMoney(v.total || 0, bg, true),
    ] as Row)
  })

  // Fila de Total
  rows.push([
    ...cTotalLabel('TOTAL FACTURADO', 7),
    cTotalMoney(totalFacturado),
  ] as Row)

  const cleanName = sanitizarNombreArchivo(nombreKiosco)
  const fechaStr = new Date().toISOString().split('T')[0]
  const fileName = `reporte_ventas_${cleanName}_${fechaStr}.xlsx`

  await writeXlsxFile(rows, { columns }).toFile(fileName)
}

export const exportarVentasCSV = exportarVentasExcel

// ============================================================================
// REMITO Y DETALLE DE COMPRA A PROVEEDOR
// ============================================================================
export async function exportarDetalleCompraExcel(
  compra: {
    nro_comprobante?: string | null
    fecha: string
    total: number
    medio_pago?: string
    pagado_en_caja?: boolean
    notas?: string | null
    proveedor?: { nombre: string; cuit?: string | null; telefono?: string | null } | null
  },
  detalles: {
    producto?: { descripcion: string; codigo_barras?: string | null } | null
    cantidad: number
    precio_costo_unitario: number
    subtotal: number
  }[],
  nombreKiosco: string = 'Kiosco'
) {
  const totalCols = 6
  const columns: SheetOptionsColumn[] = [
    { width: 18 }, // Código de Barras
    { width: 38 }, // Descripción Producto
    { width: 18 }, // Cantidad Recibida
    { width: 18 }, // Costo Unitario ($)
    { width: 18 }, // Subtotal Renglón ($)
    { width: 14 }, // Incidencia %
  ]

  const totalBultos = detalles.reduce((s, d) => s + (d.cantidad || 0), 0)
  const totalItems = detalles.length
  const totalCompra = compra.total || detalles.reduce((s, d) => s + (d.subtotal || 0), 0)

  const rows: Row[] = [
    cSpan({
      value: `${nombreKiosco.toUpperCase()} - REMITO DE RECEPCIÓN DE MERCADERÍA`,
      type: String,
      fontWeight: 'bold',
      fontSize: 14,
      textColor: '#FFFFFF',
      backgroundColor: '#1E293B',
      align: 'center',
    }, totalCols) as Row,
    cSpan({
      value: `COMPROBANTE N°: ${compra.nro_comprobante || 'S/N'} | FECHA: ${formatFecha(compra.fecha)} | SISTEMA ALPASO POS`,
      type: String,
      fontSize: 9,
      textColor: '#E2E8F0',
      backgroundColor: '#334155',
      align: 'center',
    }, totalCols) as Row,
    emptyRow(totalCols) as Row,

    // Datos del Proveedor y Operación
    cSpan({
      value: 'DATOS DE LA OPERACIÓN Y PROVEEDOR EMISOR',
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,
    [
      ...cSpan({ value: `PROVEEDOR: ${compra.proveedor?.nombre || 'General'}`, type: String, fontWeight: 'bold', fontSize: 10, backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', borderStyle: 'thin' }, 3),
      ...cSpan({ value: `CONDICIÓN: ${compra.medio_pago || 'EFECTIVO'}${compra.pagado_en_caja ? ' (Caja mostrador)' : ''}`, type: String, fontSize: 10, backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', borderStyle: 'thin' }, 3),
    ] as Row,
    [
      ...cSpan({ value: `CUIT PROVEEDOR: ${compra.proveedor?.cuit || 'No registrado'}`, type: String, fontSize: 9, backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', borderStyle: 'thin' }, 3),
      ...cSpan({ value: `OBSERVACIONES: ${compra.notas || 'Sin notas'}`, type: String, fontSize: 9, backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', borderStyle: 'thin' }, 3),
    ] as Row,
    emptyRow(totalCols) as Row,

    // KPI Cards: 3 tarjetas de 2 columnas cada una
    [
      ...cCardLabel('Importe Total Factura', 2),
      ...cCardLabel('Bultos / Unidades', 2),
      ...cCardLabel('Artículos Distintos', 2),
    ] as Row,
    [
      ...cCardValue(totalCompra, true, 2, '#0F172A'),
      ...cCardValue(totalBultos, false, 2, '#15803D'),
      ...cCardValue(totalItems, false, 2, '#1E40AF'),
    ] as Row,
    emptyRow(totalCols) as Row,

    // Tabla de Renglones
    cSpan({
      value: 'DETALLE ANALÍTICO DE RENGLONES INGRESADOS',
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,
    [
      cHeader('Código de Barras', 'center'),
      cHeader('Descripción del Producto', 'left'),
      cHeader('Cantidad Recibida', 'right'),
      cHeader('Costo Unitario ($)', 'right'),
      cHeader('Subtotal Renglón ($)', 'right'),
      cHeader('Incidencia %', 'right'),
    ] as Row,
  ]

  detalles.forEach((d, idx) => {
    const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
    const inc = totalCompra > 0 ? d.subtotal / totalCompra : 0

    rows.push([
      cText(d.producto?.codigo_barras || '—', bg, 'center'),
      cText(d.producto?.descripcion || 'Producto', bg, 'left', true),
      cNum(d.cantidad, bg, '#,##0.00'),
      cMoney(d.precio_costo_unitario, bg),
      cMoney(d.subtotal, bg, true),
      cPercent(inc, bg),
    ] as Row)
  })

  // Cierre Total
  rows.push([
    ...cTotalLabel('TOTAL COMPROBANTE', 2),
    cTotalNum(totalBultos, '#,##0.00'),
    cTotalLabel('', 1)[0] as Cell,
    cTotalMoney(totalCompra),
    cSpan({
      value: '100.0%',
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#0F172A',
      backgroundColor: '#F1F5F9',
      align: 'right',
      topBorderStyle: 'thin',
      topBorderColor: '#94A3B8',
      bottomBorderStyle: 'double',
      bottomBorderColor: '#0F172A',
    }, 1)[0] as Cell,
  ] as Row)

  const compRef = sanitizarNombreArchivo(compra.nro_comprobante || 'remito')
  const cleanName = sanitizarNombreArchivo(nombreKiosco)
  const fechaStr = new Date().toISOString().split('T')[0]
  const fileName = `remito_${cleanName}_${compRef}_${fechaStr}.xlsx`

  await writeXlsxFile(rows, { columns }).toFile(fileName)
}

export const exportarDetalleCompraCSV = exportarDetalleCompraExcel

export interface MetricasBalanceExport {
  totalIngresos?: number
  totalComprasMercaderia?: number
  resultadoOperativo?: number
  totalSalidasFinancieras?: number
  flujoCajaNeto?: number
  totalFacturadoAFIP?: number
  totalVentasInternas?: number
  deudaTotalProveedores?: number
}

export interface MovimientoContableCSV {
  fecha_hora: string
  tipo: 'VENTA' | 'COMPRA' | 'PAGO_PROVEEDOR' | 'EGRESO_CAJA' | 'INGRESO_CAJA' | 'DEVOLUCION'
  comprobante: string
  concepto: string
  medio_pago: string
  ingreso: number
  egreso: number
  observaciones?: string
}

// ============================================================================
// LIBRO DIARIO CONTABLE Y BALANCE GENERAL
// ============================================================================
export async function exportarLibroContableExcel(
  movimientos: MovimientoContableCSV[],
  periodoNombre: string = 'Periodo',
  nombreKiosco: string = 'Kiosco',
  metricas?: MetricasBalanceExport
) {
  const totalCols = 8
  const columns: SheetOptionsColumn[] = [
    { width: 20 }, // Fecha y Hora
    { width: 16 }, // Tipo Operación
    { width: 22 }, // Comprobante / Ref
    { width: 38 }, // Concepto / Detalle
    { width: 22 }, // Medio de Pago
    { width: 18 }, // Ingreso ($)
    { width: 18 }, // Egreso ($)
    { width: 28 }, // Observaciones
  ]

  const totalIngresos = movimientos.reduce((s, m) => s + (m.ingreso || 0), 0)
  const totalEgresos = movimientos.reduce((s, m) => s + (m.egreso || 0), 0)
  const balanceNeto = totalIngresos - totalEgresos

  const mIngresos = metricas?.totalIngresos ?? totalIngresos
  const mCompras = metricas?.totalComprasMercaderia ?? totalEgresos
  const mMargen = metricas?.resultadoOperativo ?? (mIngresos - mCompras)
  const mFlujo = metricas?.flujoCajaNeto ?? balanceNeto

  const fechaGeneracion = new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const rows: Row[] = [
    // Banner Ejecutivo
    cSpan({
      value: `${nombreKiosco.toUpperCase()} - LIBRO DIARIO CONTABLE Y BALANCE GENERAL`,
      type: String,
      fontWeight: 'bold',
      fontSize: 14,
      textColor: '#FFFFFF',
      backgroundColor: '#1E293B',
      align: 'center',
    }, totalCols) as Row,
    cSpan({
      value: `PERÍODO: ${periodoNombre.toUpperCase()} | EMISIÓN: ${fechaGeneracion} | SISTEMA ALPASO POS AUDITADO`,
      type: String,
      fontSize: 9,
      textColor: '#E2E8F0',
      backgroundColor: '#334155',
      align: 'center',
    }, totalCols) as Row,
    emptyRow(totalCols) as Row,

    // Sección KPI: Cuadros de Variables Contables
    cSpan({
      value: 'CUADRO RESUMEN DE VARIABLES CONTABLES Y RESULTADOS FINANCIEROS',
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,

    // Fila 1 de Tarjetas KPI
    [
      ...cCardLabel('Ventas Totales (Facturado)', 2),
      ...cCardLabel('Compras de Mercadería', 2),
      ...cCardLabel('Margen Operativo Bruto', 2),
      ...cCardLabel('Flujo Real de Caja Neto', 2),
    ] as Row,
    [
      ...cCardValue(mIngresos, true, 2, '#0F172A'),
      ...cCardValue(mCompras, true, 2, '#0F172A'),
      ...cCardValue(mMargen, true, 2, mMargen >= 0 ? '#15803D' : '#B91C1C'),
      ...cCardValue(mFlujo, true, 2, mFlujo >= 0 ? '#15803D' : '#B91C1C'),
    ] as Row,

    // Fila 2 de Tarjetas KPI (si hay métricas fiscales y de deuda)
    [
      ...cCardLabel('Facturado Fiscal ARCA (CAE)', 2),
      ...cCardLabel('Ventas Internas Mostrador', 2),
      ...cCardLabel('Salidas Totales de Dinero', 2),
      ...cCardLabel('Deuda Pendiente Proveedores', 2),
    ] as Row,
    [
      ...cCardValue(metricas?.totalFacturadoAFIP ?? 0, true, 2, '#1E40AF'),
      ...cCardValue(metricas?.totalVentasInternas ?? (mIngresos - (metricas?.totalFacturadoAFIP ?? 0)), true, 2, '#0F172A'),
      ...cCardValue(metricas?.totalSalidasFinancieras ?? totalEgresos, true, 2, '#B91C1C'),
      ...cCardValue(metricas?.deudaTotalProveedores ?? 0, true, 2, (metricas?.deudaTotalProveedores || 0) > 0 ? '#B45309' : '#0F172A'),
    ] as Row,

    emptyRow(totalCols) as Row,

    // Encabezado de Tabla Analítica
    cSpan({
      value: 'DETALLE ANALÍTICO DE ASIENTOS Y MOVIMIENTOS REGISTRADOS',
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,
    [
      cHeader('Fecha y Hora', 'center'),
      cHeader('Tipo Asiento', 'center'),
      cHeader('Comprobante / Ref', 'center'),
      cHeader('Concepto / Proveedor / Cliente', 'left'),
      cHeader('Medio de Pago', 'left'),
      cHeader('Ingreso ($)', 'right'),
      cHeader('Egreso ($)', 'right'),
      cHeader('Observaciones / Auditoría', 'left'),
    ] as Row,
  ]

  // Filas de datos con cebra
  movimientos.forEach((m, idx) => {
    const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
    rows.push([
      cText(formatFecha(m.fecha_hora), bg, 'center'),
      cText(m.tipo, bg, 'center', true),
      cText(m.comprobante, bg, 'center'),
      cText(m.concepto, bg, 'left'),
      cText(m.medio_pago, bg, 'left'),
      cMoney(m.ingreso, bg),
      cMoney(m.egreso, bg),
      cText(m.observaciones || '—', bg, 'left'),
    ] as Row)
  })

  // Fila de Cierre Contable con doble subrayado
  rows.push([
    ...cTotalLabel('TOTALES ACUMULADOS DEL PERÍODO', 5),
    cTotalMoney(totalIngresos),
    cTotalMoney(totalEgresos),
    {
      value: `BALANCE: ${formatPrecio(balanceNeto)}`,
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: balanceNeto >= 0 ? '#15803D' : '#B91C1C',
      backgroundColor: '#F1F5F9',
      align: 'center',
      topBorderStyle: 'thin',
      topBorderColor: '#94A3B8',
      bottomBorderStyle: 'double',
      bottomBorderColor: '#0F172A',
    },
  ] as Row)

  const cleanName = sanitizarNombreArchivo(nombreKiosco)
  const cleanPeriod = sanitizarNombreArchivo(periodoNombre)
  const fileName = `libro_contable_${cleanName}_${cleanPeriod}.xlsx`

  await writeXlsxFile(rows, { columns }).toFile(fileName)
}

export const exportarLibroContableCSV = exportarLibroContableExcel

// ============================================================================
// KARDEX Y AUDITORÍA DE MOVIMIENTOS DE STOCK
// ============================================================================
export async function exportarMovimientosStockExcel(
  movimientos: (MovimientoStock & { producto?: Producto })[],
  nombreKiosco: string = 'Kiosco'
) {
  const totalCols = 7
  const columns: SheetOptionsColumn[] = [
    { width: 20 }, // Fecha y Hora
    { width: 16 }, // Tipo Operación
    { width: 18 }, // Código de Barras
    { width: 36 }, // Descripción Producto
    { width: 18 }, // Variación
    { width: 24 }, // Motivo
    { width: 32 }, // Auditoría / Notas
  ]

  const totalMovs = movimientos.length
  const totalIngresadas = movimientos.filter((m) => m.tipo === 'INGRESO').reduce((s, m) => s + Math.abs(m.cantidad || 0), 0)
  const totalEgresadas = movimientos.filter((m) => m.tipo === 'EGRESO').reduce((s, m) => s + Math.abs(m.cantidad || 0), 0)
  const totalAjustes = movimientos.filter((m) => m.tipo === 'AJUSTE').length

  const fechaGeneracion = new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const rows: Row[] = [
    cSpan({
      value: `${nombreKiosco.toUpperCase()} - AUDITORÍA Y KARDEX DE MOVIMIENTOS DE STOCK`,
      type: String,
      fontWeight: 'bold',
      fontSize: 14,
      textColor: '#FFFFFF',
      backgroundColor: '#1E293B',
      align: 'center',
    }, totalCols) as Row,
    cSpan({
      value: `EMISIÓN: ${fechaGeneracion} | CONTROL DE INVENTARIO | SISTEMA ALPASO POS`,
      type: String,
      fontSize: 9,
      textColor: '#E2E8F0',
      backgroundColor: '#334155',
      align: 'center',
    }, totalCols) as Row,
    emptyRow(totalCols) as Row,

    // KPI Cards: 4 tarjetas
    cSpan({
      value: 'RESUMEN EJECUTIVO DE MOVIMIENTOS DE EXISTENCIAS',
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,
    [
      ...cCardLabel('Movimientos Auditados', 2),
      ...cCardLabel('Unidades Ingresadas (+)', 2),
      ...cCardLabel('Unidades Egresadas (-)', 2),
      ...cCardLabel('Ajustes Conteo Físico', 1),
    ] as Row,
    [
      ...cCardValue(totalMovs, false, 2, '#0F172A'),
      ...cCardValue(totalIngresadas, false, 2, '#15803D'),
      ...cCardValue(totalEgresadas, false, 2, '#B91C1C'),
      ...cCardValue(totalAjustes, false, 1, '#1E40AF'),
    ] as Row,
    emptyRow(totalCols) as Row,

    // Tabla de Movimientos
    cSpan({
      value: 'HISTORIAL CRONOLÓGICO DE OPERACIONES DE STOCK',
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,
    [
      cHeader('Fecha y Hora', 'center'),
      cHeader('Tipo Operación', 'center'),
      cHeader('Código de Barras', 'center'),
      cHeader('Descripción del Producto', 'left'),
      cHeader('Variación', 'right'),
      cHeader('Motivo Registrado', 'left'),
      cHeader('Auditoría / Notas del Operador', 'left'),
    ] as Row,
  ]

  movimientos.forEach((m, idx) => {
    const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
    rows.push([
      cText(formatFecha(m.fecha), bg, 'center'),
      cText(m.tipo, bg, 'center', true),
      cText(m.producto?.codigo_barras || '—', bg, 'center'),
      cText(m.producto?.descripcion || 'Producto eliminado', bg, 'left', true),
      cNum(m.cantidad, bg, m.cantidad > 0 ? '+#,##0.00;-#,##0.00;0' : '#,##0.00', true),
      cText(m.motivo, bg, 'left'),
      cText(m.notas || '—', bg, 'left'),
    ] as Row)
  })

  // Cierre
  rows.push([
    ...cTotalLabel('TOTAL REGISTROS AUDITADOS', 4),
    cTotalNum(totalIngresadas - totalEgresadas, '+#,##0.00;-#,##0.00;0'),
    ...cTotalLabel(`${totalMovs} OPERACIONES REGISTRADAS`, 2),
  ] as Row)

  const cleanName = sanitizarNombreArchivo(nombreKiosco)
  const fechaStr = new Date().toISOString().split('T')[0]
  const fileName = `movimientos_stock_${cleanName}_${fechaStr}.xlsx`

  await writeXlsxFile(rows, { columns }).toFile(fileName)
}

export const exportarMovimientosStockCSV = exportarMovimientosStockExcel

// ============================================================================
// LIBRO IVA VENTAS DIGITAL AFIP / CONTADOR
// ============================================================================
export async function exportarLibroIvaVentasExcel(
  ventasFiscales: any[],
  kiosco: any,
  periodoNombre: string = 'Periodo'
) {
  const totalCols = 9
  const columns: SheetOptionsColumn[] = [
    { width: 14 }, // Fecha
    { width: 12 }, // Hora
    { width: 18 }, // Tipo Comprobante
    { width: 14 }, // Punto Venta
    { width: 18 }, // N° Comprobante
    { width: 20 }, // CAE AFIP
    { width: 20 }, // Cajero
    { width: 22 }, // Medio Pago
    { width: 18 }, // Total Facturado ($)
  ]

  const totalFacturadoAFIP = ventasFiscales.reduce((s, v) => s + (v.total || 0), 0)
  const cantComprobantes = ventasFiscales.length
  const pvStr = String(kiosco?.afip_punto_venta || 2).padStart(4, '0')
  const cuitStr = kiosco?.cuit || kiosco?.afip_cuit || 'No registrado'

  const fechaGeneracion = new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const rows: Row[] = [
    cSpan({
      value: `${(kiosco?.nombre || 'KIOSKO').toUpperCase()} - LIBRO IVA VENTAS DIGITAL (ARCA / CONTADOR)`,
      type: String,
      fontWeight: 'bold',
      fontSize: 14,
      textColor: '#FFFFFF',
      backgroundColor: '#1E293B',
      align: 'center',
    }, totalCols) as Row,
    cSpan({
      value: `PERÍODO FISCAL: ${periodoNombre.toUpperCase()} | EMISIÓN: ${fechaGeneracion} | CONFORME RG ARCA`,
      type: String,
      fontSize: 9,
      textColor: '#E2E8F0',
      backgroundColor: '#334155',
      align: 'center',
    }, totalCols) as Row,
    emptyRow(totalCols) as Row,

    // KPI Cards
    cSpan({
      value: 'RESUMEN FISCAL DE FACTURACIÓN ELECTRÓNICA REGISTRADA',
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,
    [
      ...cCardLabel('Total Facturado ARCA', 3),
      ...cCardLabel('Comprobantes CAE', 2),
      ...cCardLabel('Punto de Venta', 2),
      ...cCardLabel('CUIT Comercio', 2),
    ] as Row,
    [
      ...cCardValue(totalFacturadoAFIP, true, 3, '#1E40AF'),
      ...cCardValue(cantComprobantes, false, 2, '#0F172A'),
      ...cCardValue(pvStr, false, 2, '#0F172A'),
      ...cCardValue(cuitStr, false, 2, '#0F172A'),
    ] as Row,
    emptyRow(totalCols) as Row,

    // Tabla
    cSpan({
      value: 'REGISTRO CRONOLÓGICO DE COMPROBANTES FISCALES CON CAE',
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,
    [
      cHeader('Fecha', 'center'),
      cHeader('Hora', 'center'),
      cHeader('Tipo Comprobante', 'center'),
      cHeader('Punto Venta', 'center'),
      cHeader('N° Comprobante', 'center'),
      cHeader('CAE ARCA', 'center'),
      cHeader('Cajero / Emisor', 'left'),
      cHeader('Medio de Pago', 'left'),
      cHeader('Total Facturado ($)', 'right'),
    ] as Row,
  ]

  ventasFiscales.forEach((v, idx) => {
    const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
    const d = new Date(v.fecha_hora)
    const fecha = d.toLocaleDateString('es-AR')
    const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    const tipoCompStr = v.afip_tipo_comprobante === 11 ? 'Factura C (Cod 011)' : v.afip_tipo_comprobante === 6 ? 'Factura B (Cod 006)' : 'Factura ARCA'
    const pv = String(kiosco?.afip_punto_venta || 2).padStart(4, '0')
    const nro = String(v.afip_nro_comprobante || 0).padStart(8, '0')
    const medioStr = v.pagos && v.pagos.length > 0 ? v.pagos.map((p: any) => labelMedioPago(p.medio_pago)).join(' + ') : 'Efectivo'
    const cajeroStr = v.usuario?.nombre || 'Cajero'

    rows.push([
      cText(fecha, bg, 'center'),
      cText(hora, bg, 'center'),
      cText(tipoCompStr, bg, 'center', true),
      cText(pv, bg, 'center'),
      cText(nro, bg, 'center', true),
      cText(v.afip_cae || '—', bg, 'center'),
      cText(cajeroStr, bg, 'left'),
      cText(medioStr, bg, 'left'),
      cMoney(v.total, bg, true),
    ] as Row)
  })

  // Cierre
  rows.push([
    ...cTotalLabel('TOTAL FACTURADO ARCA DEL PERÍODO', 8),
    cTotalMoney(totalFacturadoAFIP),
  ] as Row)

  const cleanKiosco = sanitizarNombreArchivo(kiosco?.nombre || 'kiosco')
  const cleanPeriod = sanitizarNombreArchivo(periodoNombre)
  const fileName = `libro_iva_ventas_arca_${cleanKiosco}_${cleanPeriod}.xlsx`

  await writeXlsxFile(rows, { columns }).toFile(fileName)
}

// ============================================================================
// EXPORTACIÓN DE STOCK INMOVILIZADO / STOCK MUERTO (.XLSX)
// ============================================================================

export interface ItemStockInmovilizado {
  id: string
  descripcion: string
  codigo_barras: string | null
  categoria_nombre: string
  proveedor_nombre?: string
  stock_actual: number
  precio_costo: number
  precio_venta: number
  capital_inmovilizado_costo: number
  capital_inmovilizado_venta: number
  dias_sin_ventas: number
  fecha_ultima_venta: string | null
}

export async function exportarStockInmovilizadoExcel(
  items: ItemStockInmovilizado[],
  kioscoNombre: string = 'AlPaso POS',
  diasFiltro: number = 30
) {
  const totalCols = 9
  const columns: SheetOptionsColumn[] = [
    { width: 34 }, // Producto
    { width: 16 }, // Código de barras
    { width: 18 }, // Categoría
    { width: 18 }, // Proveedor
    { width: 12 }, // Stock Actual
    { width: 14 }, // Días Sin Venta
    { width: 16 }, // Última Venta
    { width: 16 }, // Costo Unitario
    { width: 18 }, // Capital Parado ($)
  ]

  const totalCapitalCosto = items.reduce((sum, it) => sum + it.capital_inmovilizado_costo, 0)
  const totalUnidades = items.reduce((sum, it) => sum + it.stock_actual, 0)

  const fechaGen = new Date().toLocaleDateString('es-AR')
  const horaGen = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const rows: Row[] = [
    // Encabezado institucional
    cSpan({
      value: `INFORME DE STOCK INMOVILIZADO Y CAPITAL ESTANCADO - ${kioscoNombre.toUpperCase()}`,
      type: String,
      fontWeight: 'bold',
      fontSize: 13,
      textColor: '#FFFFFF',
      backgroundColor: '#0F172A',
      align: 'left',
    }, totalCols) as Row,
    cSpan({
      value: `Filtro de inactividad: Sin rotación en los últimos ${diasFiltro} días | Generado el ${fechaGen} a las ${horaGen}`,
      type: String,
      fontSize: 9,
      textColor: '#94A3B8',
      backgroundColor: '#0F172A',
      align: 'left',
    }, totalCols) as Row,
    emptyRow(totalCols) as Row,

    // Tarjetas ejecutivas KPI (4 cols + 1 col + 4 cols = 9 cols)
    [
      ...cCardLabel('CAPITAL TOTAL INMOVILIZADO', 4),
      cText('', '#F8FAFC', 'center'),
      ...cCardLabel('UNIDADES FÍSICAS PARADAS', 4),
    ] as Row,
    [
      ...cCardValue(totalCapitalCosto, true, 4, '#B91C1C'),
      cText('', '#F8FAFC', 'center'),
      ...cCardValue(totalUnidades, false, 4, '#334155'),
    ] as Row,
    emptyRow(totalCols) as Row,

    // Cabecera de la tabla
    cSpan({
      value: `DETALLE DE PRODUCTOS SIN VENTAS (TOTAL: ${items.length} ARTÍCULOS)`,
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,
    [
      cHeader('Descripción del Producto', 'left'),
      cHeader('Código Barras', 'center'),
      cHeader('Categoría', 'left'),
      cHeader('Proveedor', 'left'),
      cHeader('Stock Actual', 'center'),
      cHeader('Días Inactivo', 'center'),
      cHeader('Última Venta', 'center'),
      cHeader('Costo Unitario ($)', 'right'),
      cHeader('Capital Parado ($)', 'right'),
    ] as Row,
  ]

  items.forEach((it, idx) => {
    const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
    const ultVentaStr = it.fecha_ultima_venta
      ? new Date(it.fecha_ultima_venta).toLocaleDateString('es-AR')
      : 'Sin ventas'

    rows.push([
      cText(it.descripcion, bg, 'left', true),
      cText(it.codigo_barras || '—', bg, 'center'),
      cText(it.categoria_nombre, bg, 'left'),
      cText(it.proveedor_nombre || '—', bg, 'left'),
      cNum(it.stock_actual, bg, '#,##0', true),
      cNum(it.dias_sin_ventas, bg, '#,##0', true),
      cText(ultVentaStr, bg, 'center'),
      cMoney(it.precio_costo, bg),
      cMoney(it.capital_inmovilizado_costo, bg, true),
    ] as Row)
  })

  // Totales
  rows.push([
    ...cTotalLabel('TOTAL CAPITAL INMOVILIZADO EN DEPÓSITO', 8),
    cTotalMoney(totalCapitalCosto),
  ] as Row)

  const cleanKiosco = sanitizarNombreArchivo(kioscoNombre)
  const fechaStr = new Date().toISOString().split('T')[0]
  const fileName = `stock_inmovilizado_${diasFiltro}dias_${cleanKiosco}_${fechaStr}.xlsx`
  await writeXlsxFile(rows, { columns }).toFile(fileName)
}

// ============================================================================
// EXPORTACIÓN DE RENDIMIENTOS SAAS SUPERADMIN (.XLSX)
// ============================================================================
export interface RendimientoMesExport {
  numeroMes: number
  nombre: string
  nombreCorto: string
  totalMonto: number
  cantidadPagos: number
  cantidadKioscosUnicos: number
  ticketPromedio: number
  variacionPorcentaje: number | null
  medioMasUsado: string
}

export interface TransaccionSuperAdminExport {
  id?: string
  fecha_pago?: string | null
  nombre_kiosco?: string | null
  nombre_dueno?: string | null
  email_dueno?: string | null
  nombre_plan?: string | null
  medio_pago?: string | null
  monto: number
  notas?: string | null
  comprobante?: string | null
  rubro?: string | null
}

export async function exportarRendimientosSuperAdminExcel(params: {
  anio: number
  mesNombre: string
  mrrActual: number
  totalFacturado: number
  cantidadPagos: number
  kioscosUnicos: number
  ticketPromedio: number
  datosMeses: RendimientoMesExport[]
  transacciones: TransaccionSuperAdminExport[]
}) {
  const totalCols = 7
  const columns: SheetOptionsColumn[] = [
    { width: 16 }, // Fecha / Mes
    { width: 28 }, // Comercio / Facturado
    { width: 24 }, // Dueño / Cobros
    { width: 18 }, // Plan / Comercios
    { width: 18 }, // Medio de Pago
    { width: 18 }, // Monto / Variación
    { width: 26 }, // Notas / Detalle
  ]

  const fechaGeneracion = new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const rows: Row[] = [
    cSpan({
      value: 'SISTEMA ALPASO POS - SUPERADMIN: RENDIMIENTOS Y SUSCRIPCIONES SAAS',
      type: String,
      fontWeight: 'bold',
      fontSize: 14,
      textColor: '#FFFFFF',
      backgroundColor: '#1E293B',
      align: 'center',
    }, totalCols) as Row,
    cSpan({
      value: `AÑO: ${params.anio} | PERÍODO: ${params.mesNombre.toUpperCase()} | GENERADO: ${fechaGeneracion}`,
      type: String,
      fontSize: 9,
      textColor: '#E2E8F0',
      backgroundColor: '#334155',
      align: 'center',
    }, totalCols) as Row,
    emptyRow(totalCols) as Row,

    // KPI Cards
    cSpan({
      value: 'INDICADORES CLAVE DE RENDIMIENTO Y FACTURACIÓN SAAS',
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,
    [
      ...cCardLabel('MRR Estimado Actual', 2),
      ...cCardLabel(`Cobrado en ${params.mesNombre}`, 2),
      ...cCardLabel('Cobros Realizados', 1),
      ...cCardLabel('Ticket Promedio', 2),
    ] as Row,
    [
      ...cCardValue(params.mrrActual, true, 2, '#4338CA'),
      ...cCardValue(params.totalFacturado, true, 2, '#047857'),
      ...cCardValue(params.cantidadPagos, false, 1, '#0F172A'),
      ...cCardValue(params.ticketPromedio, true, 2, '#7C3AED'),
    ] as Row,
    emptyRow(totalCols) as Row,

    // Tabla 1: Rendimientos Mensuales del Año
    cSpan({
      value: `EVOLUCIÓN INTERMENSUAL DE FACTURACIÓN Y RENDIMIENTOS (${params.anio})`,
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,
    [
      cHeader('Mes', 'center'),
      cHeader('Facturado Total ($)', 'right'),
      cHeader('Cobros', 'center'),
      cHeader('Comercios', 'center'),
      cHeader('Ticket Promedio ($)', 'right'),
      cHeader('Variación Mes Previo', 'center'),
      cHeader('Medio Principal', 'center'),
    ] as Row,
  ]

  let totalAnualMonto = 0
  let totalAnualPagos = 0

  params.datosMeses.forEach((m, idx) => {
    const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
    totalAnualMonto += m.totalMonto
    totalAnualPagos += m.cantidadPagos

    const varTexto = m.variacionPorcentaje !== null
      ? `${m.variacionPorcentaje >= 0 ? '+' : ''}${m.variacionPorcentaje.toFixed(1)}%`
      : '—'

    rows.push([
      cText(m.nombre, bg, 'center', true),
      cMoney(m.totalMonto, bg, true),
      cNum(m.cantidadPagos, bg, '#,##0'),
      cNum(m.cantidadKioscosUnicos, bg, '#,##0'),
      cMoney(m.ticketPromedio, bg),
      cText(varTexto, bg, 'center', m.variacionPorcentaje !== null && m.variacionPorcentaje >= 0),
      cText(m.medioMasUsado || '—', bg, 'center'),
    ] as Row)
  })

  // Total anual de rendimientos
  rows.push([
    ...cTotalLabel('TOTAL ANUAL FACTURADO', 1),
    cTotalMoney(totalAnualMonto),
    cTotalNum(totalAnualPagos),
    ...cTotalLabel('', 4),
  ] as Row)

  rows.push(emptyRow(totalCols) as Row)

  // Tabla 2: Registro Detallado de Transacciones
  if (params.transacciones.length > 0) {
    rows.push(
      cSpan({
        value: `REGISTRO DETALLADO DE COBROS Y SUSCRIPCIONES (${params.transacciones.length} OPERACIONES)`,
        type: String,
        fontWeight: 'bold',
        fontSize: 10,
        textColor: '#1E293B',
        backgroundColor: '#E2E8F0',
        align: 'left',
        borderColor: '#CBD5E1',
        borderStyle: 'thin',
      }, totalCols) as Row,
      [
        cHeader('Fecha de Pago', 'center'),
        cHeader('Comercio Cliente', 'left'),
        cHeader('Titular / Contacto', 'left'),
        cHeader('Plan Contratado', 'center'),
        cHeader('Medio de Pago', 'center'),
        cHeader('Monto Cobrado ($)', 'right'),
        cHeader('Notas / Comprobante', 'left'),
      ] as Row
    )

    let totalDetalleCobrado = 0
    params.transacciones.forEach((t, idx) => {
      const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
      totalDetalleCobrado += Number(t.monto || 0)
      const fechaTxt = t.fecha_pago ? formatFecha(t.fecha_pago) : '—'
      const titularTxt = t.email_dueno ? `${t.nombre_dueno} (${t.email_dueno})` : t.nombre_dueno
      const notasTxt = t.notas || t.comprobante || '—'

      rows.push([
        cText(fechaTxt, bg, 'center'),
        cText(t.nombre_kiosco, bg, 'left', true),
        cText(titularTxt, bg, 'left'),
        cText(t.nombre_plan, bg, 'center'),
        cText(t.medio_pago, bg, 'center'),
        cMoney(t.monto, bg, true),
        cText(notasTxt, bg, 'left'),
      ] as Row)
    })

    rows.push([
      ...cTotalLabel('TOTAL COBRADO EN EL PERÍODO', 5),
      cTotalMoney(totalDetalleCobrado),
      ...cTotalLabel('', 1),
    ] as Row)
  }

  const cleanPeriod = sanitizarNombreArchivo(`${params.anio}_${params.mesNombre}`)
  const fechaStr = new Date().toISOString().split('T')[0]
  const fileName = `rendimientos_saas_${cleanPeriod}_${fechaStr}.xlsx`
  await writeXlsxFile(rows, { columns }).toFile(fileName)
}

// ============================================================================
// EXPORTACIÓN DE RENDIMIENTOS DEL COMERCIO / DUEÑO (.XLSX)
// ============================================================================
export interface RendimientoMesDuenoExport {
  numeroMes: number
  nombre: string
  nombreCorto: string
  totalVentas: number
  cantidadTickets: number
  ticketPromedio: number
  variacionPorcentaje: number | null
  medioPrincipal: string
}

export interface DetalleVentaRendimientoExport {
  id: string
  fecha_hora: string
  nro_comprobante?: string | number | null
  cajero?: string
  medio_pago: string
  total: number
}

export async function exportarRendimientosDuenoExcel(params: {
  nombreKiosco: string
  anio: number
  mesNombre: string
  totalFacturado: number
  cantidadTickets: number
  ticketPromedio: number
  totalArticulos: number
  datosMeses: RendimientoMesDuenoExport[]
  mediosPago: { medio: string; total: number; count: number; porcentaje: number }[]
  ventas: DetalleVentaRendimientoExport[]
}) {
  const totalCols = 6
  const columns: SheetOptionsColumn[] = [
    { width: 18 }, // Mes / Comprobante
    { width: 22 }, // Facturado / Fecha
    { width: 18 }, // Tickets / Cajero
    { width: 20 }, // Ticket Promedio / Medio Pago
    { width: 20 }, // Variación %
    { width: 22 }, // Medio Principal / Total ($)
  ]

  const fechaGeneracion = new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const rows: Row[] = [
    cSpan({
      value: `${params.nombreKiosco.toUpperCase()} - REPORTE EJECUTIVO DE RENDIMIENTOS Y VENTAS`,
      type: String,
      fontWeight: 'bold',
      fontSize: 14,
      textColor: '#FFFFFF',
      backgroundColor: '#1E293B',
      align: 'center',
    }, totalCols) as Row,
    cSpan({
      value: `AÑO: ${params.anio} | PERÍODO: ${params.mesNombre.toUpperCase()} | GENERADO: ${fechaGeneracion} | SISTEMA ALPASO POS`,
      type: String,
      fontSize: 9,
      textColor: '#E2E8F0',
      backgroundColor: '#334155',
      align: 'center',
    }, totalCols) as Row,
    emptyRow(totalCols) as Row,

    // KPI Cards
    cSpan({
      value: 'INDICADORES GENERALES DE RENDIMIENTO COMERCIAL',
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,
    [
      ...cCardLabel('Ventas Totales Netas', 2),
      ...cCardLabel('Tickets Emitidos', 1),
      ...cCardLabel('Ticket Promedio', 1),
      ...cCardLabel('Artículos Despachados', 2),
    ] as Row,
    [
      ...cCardValue(params.totalFacturado, true, 2, '#0F172A'),
      ...cCardValue(params.cantidadTickets, false, 1, '#0F172A'),
      ...cCardValue(params.ticketPromedio, true, 1, '#15803D'),
      ...cCardValue(params.totalArticulos, false, 2, '#4338CA'),
    ] as Row,
    emptyRow(totalCols) as Row,

    // Tabla 1: Rendimientos Mensuales
    cSpan({
      value: `EVOLUCIÓN INTERMENSUAL DE VENTAS (${params.anio})`,
      type: String,
      fontWeight: 'bold',
      fontSize: 10,
      textColor: '#1E293B',
      backgroundColor: '#E2E8F0',
      align: 'left',
      borderColor: '#CBD5E1',
      borderStyle: 'thin',
    }, totalCols) as Row,
    [
      cHeader('Mes', 'center'),
      cHeader('Facturado Total ($)', 'right'),
      cHeader('Tickets', 'center'),
      cHeader('Ticket Promedio ($)', 'right'),
      cHeader('Variación Mes Previo', 'center'),
      cHeader('Medio Principal', 'center'),
    ] as Row,
  ]

  let totalAnualVentas = 0
  let totalAnualTickets = 0

  params.datosMeses.forEach((m, idx) => {
    const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
    totalAnualVentas += m.totalVentas
    totalAnualTickets += m.cantidadTickets

    const varTexto = m.variacionPorcentaje !== null
      ? `${m.variacionPorcentaje >= 0 ? '+' : ''}${m.variacionPorcentaje.toFixed(1)}%`
      : '—'

    rows.push([
      cText(m.nombre, bg, 'center', true),
      cMoney(m.totalVentas, bg, true),
      cNum(m.cantidadTickets, bg, '#,##0'),
      cMoney(m.ticketPromedio, bg),
      cText(varTexto, bg, 'center', m.variacionPorcentaje !== null && m.variacionPorcentaje >= 0),
      cText(m.medioPrincipal || '—', bg, 'center'),
    ] as Row)
  })

  // Fila Total Anual
  rows.push([
    ...cTotalLabel('TOTAL ANUAL FACTURADO', 1),
    cTotalMoney(totalAnualVentas),
    cTotalNum(totalAnualTickets),
    ...cTotalLabel('', 3),
  ] as Row)

  rows.push(emptyRow(totalCols) as Row)

  // Tabla 2: Desglose por Medio de Pago
  if (params.mediosPago.length > 0) {
    rows.push(
      cSpan({
        value: 'DISTRIBUCIÓN DE INGRESOS POR MEDIO DE PAGO',
        type: String,
        fontWeight: 'bold',
        fontSize: 10,
        textColor: '#1E293B',
        backgroundColor: '#E2E8F0',
        align: 'left',
        borderColor: '#CBD5E1',
        borderStyle: 'thin',
      }, totalCols) as Row,
      [
        cHeader('Canal / Medio de Pago', 'left'),
        cHeader('Total Recaudado ($)', 'right'),
        cHeader('Cantidad Pagos', 'center'),
        cHeader('Participación (%)', 'right'),
        ...cSpan(cHeader('', 'center'), 2),
      ] as Row
    )

    params.mediosPago.forEach((item, idx) => {
      const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
      rows.push([
        cText(item.medio, bg, 'left', true),
        cMoney(item.total, bg, true),
        cNum(item.count, bg, '#,##0'),
        cPercent(item.porcentaje / 100, bg, true),
        ...emptyRow(2),
      ] as Row)
    })

    rows.push(emptyRow(totalCols) as Row)
  }

  // Tabla 3: Registro Detallado de Ventas del Período
  if (params.ventas.length > 0) {
    rows.push(
      cSpan({
        value: `REGISTRO DETALLADO DE COMPROBANTES (${params.ventas.length} TICKETS)`,
        type: String,
        fontWeight: 'bold',
        fontSize: 10,
        textColor: '#1E293B',
        backgroundColor: '#E2E8F0',
        align: 'left',
        borderColor: '#CBD5E1',
        borderStyle: 'thin',
      }, totalCols) as Row,
      [
        cHeader('N° Comprobante', 'center'),
        cHeader('Fecha y Hora', 'center'),
        cHeader('Cajero / Operador', 'left'),
        cHeader('Medio de Pago', 'center'),
        ...cSpan(cHeader('Total Venta ($)', 'right'), 2),
      ] as Row
    )

    params.ventas.forEach((v, idx) => {
      const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
      const ticketStr = v.nro_comprobante
        ? `FC-${String(v.nro_comprobante).padStart(8, '0')}`
        : v.id
        ? `T-${v.id.slice(0, 8).toUpperCase()}`
        : 'T-S/N'
      const fechaTexto = v.fecha_hora ? formatFecha(v.fecha_hora) : '—'

      rows.push([
        cText(ticketStr, bg, 'center', true),
        cText(fechaTexto, bg, 'center'),
        cText(v.cajero || 'Cajero', bg, 'left'),
        cText(v.medio_pago || 'Efectivo', bg, 'center'),
        ...cSpan(cMoney(v.total, bg, true), 2),
      ] as Row)
    })

    rows.push([
      ...cTotalLabel('TOTAL FACTURADO EN EL PERÍODO', 4),
      ...cSpan(cTotalMoney(params.totalFacturado), 2),
    ] as Row)
  }

  const cleanKiosco = sanitizarNombreArchivo(params.nombreKiosco)
  const cleanPeriod = sanitizarNombreArchivo(`${params.anio}_${params.mesNombre}`)
  const fechaStr = new Date().toISOString().split('T')[0]
  const fileName = `rendimientos_${cleanKiosco}_${cleanPeriod}_${fechaStr}.xlsx`
  await writeXlsxFile(rows, { columns }).toFile(fileName)
}


