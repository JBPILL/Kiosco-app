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

function cText(value: string, bg: string = '#FFFFFF', align: 'left' | 'center' | 'right' = 'left', isBold: boolean = false): Cell {
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
  const totalCols = 11
  const columns: SheetOptionsColumn[] = [
    { width: 16 }, // Código de Barras
    { width: 36 }, // Descripción
    { width: 20 }, // Categoría
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
  // (excluyendo devoluciones de envases, combos promocionales virtuales y artículos ad-hoc que inflan la valuación)
  const productosValidos = productos.filter((p) => {
    if (p.activo === false) return false
    if (p.es_combo === true) return false
    const cod = (p.codigo_barras || '').toUpperCase().trim()
    if (cod.startsWith('COMBO-') || cod === 'COMBO') return false
    const desc = (p.descripcion || '').toLowerCase().trim()
    if (desc.startsWith('combo ') || desc === 'combo') return false
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
      value: `FECHA DE INFORME: ${fechaGeneracion} | AUDITORÍA DE STOCK | SISTEMA KIOSKOPOS`,
      type: String,
      fontSize: 9,
      textColor: '#E2E8F0',
      backgroundColor: '#334155',
      align: 'center',
    }, totalCols) as Row,
    emptyRow(totalCols) as Row,

    // KPI Cards: 5 tarjetas ocupando 11 columnas
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
      ...cCardLabel('Valoración Comercial (Venta)', 2),
      ...cCardLabel('Ganancia Bruta Potencial', 3),
    ] as Row,
    [
      ...cCardValue(totalArticulos, false, 2, '#0F172A'),
      ...cCardValue(totalUnidades, false, 2, '#0F172A'),
      ...cCardValue(valuacionCosto, true, 2, '#0F172A'),
      ...cCardValue(valuacionVenta, true, 2, '#1E40AF'),
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
    const margenMonto = Math.max(0, p.precio_venta - (p.precio_costo || 0))
    const margenPorc = p.precio_venta > 0 ? margenMonto / p.precio_venta : 0
    const valCostoProd = (p.stock_actual > 0 ? p.stock_actual : 0) * (p.precio_costo || 0)

    rows.push([
      cText(p.codigo_barras || '—', bg, 'center'),
      cText(p.descripcion, bg, 'left', true),
      cText(catNombre, bg, 'left'),
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
    ...cTotalLabel('VALUACIÓN TOTAL DE INVENTARIO', 7),
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

  const cleanName = nombreKiosco.toLowerCase().replace(/[^a-z0-9]/g, '_')
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
      value: `FECHA / PERÍODO: ${periodoStr} | GENERADO: ${fechaGeneracion} | SISTEMA KIOSKOPOS`,
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
      ...cCardLabel('Facturado Fiscal AFIP', 2),
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
      cHeader('CAE AFIP', 'center'),
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
    const circuitoStr = esFiscal ? 'AFIP Oficial' : 'Mostrador Interno'
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

  const cleanName = nombreKiosco.toLowerCase().replace(/[^a-z0-9]/g, '_')
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
      value: `COMPROBANTE N°: ${compra.nro_comprobante || 'S/N'} | FECHA: ${formatFecha(compra.fecha)} | SISTEMA KIOSKOPOS`,
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
      cSpan({ value: `PROVEEDOR: ${compra.proveedor?.nombre || 'General'}`, type: String, fontWeight: 'bold', fontSize: 10, backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', borderStyle: 'thin' }, 3)[0],
      null, null,
      cSpan({ value: `CONDICIÓN: ${compra.medio_pago || 'EFECTIVO'}${compra.pagado_en_caja ? ' (Caja mostrador)' : ''}`, type: String, fontSize: 10, backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', borderStyle: 'thin' }, 3)[0],
      null, null,
    ] as Row,
    [
      cSpan({ value: `CUIT PROVEEDOR: ${compra.proveedor?.cuit || 'No registrado'}`, type: String, fontSize: 9, backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', borderStyle: 'thin' }, 3)[0],
      null, null,
      cSpan({ value: `OBSERVACIONES: ${compra.notas || 'Sin notas'}`, type: String, fontSize: 9, backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', borderStyle: 'thin' }, 3)[0],
      null, null,
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

  const compRef = compra.nro_comprobante ? compra.nro_comprobante.replace(/[^a-zA-Z0-9]/g, '_') : 'remito'
  const fechaStr = new Date().toISOString().split('T')[0]
  const fileName = `remito_${compRef}_${fechaStr}.xlsx`

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
  tipo: 'VENTA' | 'COMPRA' | 'PAGO_PROVEEDOR' | 'EGRESO_CAJA' | 'INGRESO_CAJA'
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
      value: `PERÍODO: ${periodoNombre.toUpperCase()} | EMISIÓN: ${fechaGeneracion} | SISTEMA KIOSKOPOS AUDITADO`,
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
      ...cCardLabel('Facturado Fiscal AFIP (CAE)', 2),
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

  const cleanName = nombreKiosco.toLowerCase().replace(/[^a-z0-9]/g, '_')
  const cleanPeriod = periodoNombre.toLowerCase().replace(/[^a-z0-9]/g, '_')
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
      value: `EMISIÓN: ${fechaGeneracion} | CONTROL DE INVENTARIO | SISTEMA KIOSKOPOS`,
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

  const cleanName = nombreKiosco.toLowerCase().replace(/[^a-z0-9]/g, '_')
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
  const cuitStr = kiosco?.afip_cuit || 'No registrado'

  const fechaGeneracion = new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const rows: Row[] = [
    cSpan({
      value: `${(kiosco?.nombre || 'KIOSKO').toUpperCase()} - LIBRO IVA VENTAS DIGITAL (AFIP / CONTADOR)`,
      type: String,
      fontWeight: 'bold',
      fontSize: 14,
      textColor: '#FFFFFF',
      backgroundColor: '#1E293B',
      align: 'center',
    }, totalCols) as Row,
    cSpan({
      value: `PERÍODO FISCAL: ${periodoNombre.toUpperCase()} | EMISIÓN: ${fechaGeneracion} | CONFORME RG AFIP`,
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
      ...cCardLabel('Total Facturado AFIP', 3),
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
      cHeader('CAE AFIP', 'center'),
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
    const tipoCompStr = v.afip_tipo_comprobante === 11 ? 'Factura C (Cod 011)' : v.afip_tipo_comprobante === 6 ? 'Factura B (Cod 006)' : 'Factura AFIP'
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
    ...cTotalLabel('TOTAL FACTURADO AFIP DEL PERÍODO', 8),
    cTotalMoney(totalFacturadoAFIP),
  ] as Row)

  const cleanPeriod = periodoNombre.toLowerCase().replace(/[^a-z0-9]/g, '_')
  const fileName = `libro_iva_ventas_afip_${cleanPeriod}.xlsx`

  await writeXlsxFile(rows, { columns }).toFile(fileName)
}

