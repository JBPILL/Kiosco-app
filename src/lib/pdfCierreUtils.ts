/**
 * Módulo de generación de Comprobante PDF de Cierre de Caja (Arqueo Z y X)
 * Permite descargar un documento PDF vectorial y sobrio para archivo contable y auditoría.
 */

import jsPDF from 'jspdf'
import { formatPrecio, formatFecha } from './utils'
import { sanitizarNombreArchivo } from './exportUtils'
import type { DatosCierreCaja } from '../components/pos/TicketCierreCajaModal'

/**
 * Genera y descarga directamente un archivo PDF con el comprobante formal de cierre de caja.
 */
export function exportarComprobanteCierrePDF(datos: DatosCierreCaja): boolean {
  try {
    // Calculamos una altura dinámica proporcional al contenido
    let altoRequerido = 185
    if (datos.ventasPorMedio && datos.ventasPorMedio.length > 0) {
      altoRequerido += datos.ventasPorMedio.length * 4
    }
    if (datos.ingresosExtra > 0 || datos.egresosExtra > 0) {
      altoRequerido += 16
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, Math.max(200, altoRequerido)],
    })

    const colorOscuro = [15, 23, 42] // slate-900
    const colorGris = [100, 116, 139] // slate-500
    const colorLinea = [203, 213, 225] // slate-300

    let y = 8
    const margin = 6
    const pageWidth = 80

    // Encabezado institucional
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
    const nombreComercio = (datos.kioscoNombre || 'KIOSKOPOS').toUpperCase()
    doc.text(nombreComercio, pageWidth / 2, y, { align: 'center' })
    y += 4.5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(colorGris[0], colorGris[1], colorGris[2])
    if (datos.kioscoDireccion) {
      doc.text(datos.kioscoDireccion, pageWidth / 2, y, { align: 'center' })
      y += 3.5
    }
    if (datos.kioscoTelefono) {
      doc.text(`Tel: ${datos.kioscoTelefono}`, pageWidth / 2, y, { align: 'center' })
      y += 3.5
    }

    // Línea separadora punteada
    doc.setDrawColor(colorLinea[0], colorLinea[1], colorLinea[2])
    doc.setLineDashPattern([1, 1], 0)
    doc.line(margin, y, pageWidth - margin, y)
    y += 4

    // Título de Comprobante
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
    const titulo = datos.esParcial ? 'ARQUEO PARCIAL DE CAJA (X)' : 'COMPROBANTE DE CIERRE DE CAJA (Z)'
    doc.text(titulo, pageWidth / 2, y, { align: 'center' })
    y += 4.5

    // Metadatos de Turno
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(`Fecha emisión: ${formatFecha(datos.fechaCierre)}`, margin, y)
    y += 3.5
    doc.text(`Apertura: ${formatFecha(datos.fechaApertura)}`, margin, y)
    y += 3.5
    if (datos.cajeroNombre) {
      doc.text(`Cajero: ${datos.cajeroNombre}`, margin, y)
      y += 3.5
    }

    // Línea divisoria
    doc.line(margin, y, pageWidth - margin, y)
    y += 4

    // Fondo Inicial
    doc.setFont('helvetica', 'bold')
    doc.text('Fondo Inicial de Caja:', margin, y)
    doc.text(formatPrecio(datos.montoInicial), pageWidth - margin, y, { align: 'right' })
    y += 4.5

    // Ventas por Medio
    doc.setFont('helvetica', 'bold')
    doc.text('VENTAS POR MEDIO DE PAGO:', margin, y)
    y += 3.5

    doc.setFont('helvetica', 'normal')
    if (datos.ventasPorMedio && datos.ventasPorMedio.length > 0) {
      for (const m of datos.ventasPorMedio) {
        const desc = `${m.medio}${m.cantidad ? ` (${m.cantidad})` : ''}:`
        doc.text(desc, margin, y)
        doc.text(formatPrecio(m.total), pageWidth - margin, y, { align: 'right' })
        y += 3.5
      }
    } else {
      doc.text('Sin ventas registradas en el turno', margin, y)
      y += 3.5
    }

    // Total Facturado
    doc.setFont('helvetica', 'bold')
    const cantVentasTxt = datos.cantidadVentas ? ` (${datos.cantidadVentas} op.)` : ''
    doc.text(`TOTAL FACTURADO${cantVentasTxt}:`, margin, y)
    doc.text(formatPrecio(datos.totalVentas), pageWidth - margin, y, { align: 'right' })
    y += 4.5

    // Movimientos de Caja
    if (datos.ingresosExtra > 0 || datos.egresosExtra > 0) {
      doc.line(margin, y, pageWidth - margin, y)
      y += 4

      doc.setFont('helvetica', 'bold')
      doc.text('MOVIMIENTOS DE CAJA:', margin, y)
      y += 3.5

      doc.setFont('helvetica', 'normal')
      if (datos.ingresosExtra > 0) {
        doc.text('(+) Ingresos adicionales:', margin, y)
        doc.text(`+${formatPrecio(datos.ingresosExtra)}`, pageWidth - margin, y, { align: 'right' })
        y += 3.5
      }
      if (datos.egresosExtra > 0) {
        doc.text('(-) Egresos / Pagos:', margin, y)
        doc.text(`-${formatPrecio(datos.egresosExtra)}`, pageWidth - margin, y, { align: 'right' })
        y += 3.5
      }
    }

    // Control de Arqueo
    doc.line(margin, y, pageWidth - margin, y)
    y += 4

    doc.setFont('helvetica', 'bold')
    doc.text('CONTROL DE ARQUEO DE EFECTIVO:', margin, y)
    y += 3.5

    doc.setFont('helvetica', 'normal')
    doc.text('Efectivo esperado en caja:', margin, y)
    doc.text(formatPrecio(datos.efectivoEsperado), pageWidth - margin, y, { align: 'right' })
    y += 3.5

    doc.text('Efectivo contado físico:', margin, y)
    doc.text(formatPrecio(datos.efectivoContado), pageWidth - margin, y, { align: 'right' })
    y += 4

    // Diferencia
    doc.setFont('helvetica', 'bold')
    doc.text('Diferencia:', margin, y)
    const diff = datos.diferencia
    let diffTexto = '$ 0 (Caja cuadrada)'
    if (diff > 0) diffTexto = `+${formatPrecio(diff)} (Sobrante)`
    else if (diff < 0) diffTexto = `${formatPrecio(diff)} (Faltante)`
    doc.text(diffTexto, pageWidth - margin, y, { align: 'right' })
    y += 8

    // Cuadro de Firmas
    doc.setLineDashPattern([], 0)
    doc.setDrawColor(150, 150, 150)
    doc.line(margin + 5, y + 6, pageWidth - margin - 5, y + 6)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(colorGris[0], colorGris[1], colorGris[2])
    doc.text('Firma Cajero / Responsable de Turno', pageWidth / 2, y + 9.5, { align: 'center' })
    y += 15

    doc.line(margin + 5, y + 6, pageWidth - margin - 5, y + 6)
    doc.text('Firma Auditor / Encargado General', pageWidth / 2, y + 9.5, { align: 'center' })
    y += 14

    // Pie institucional
    doc.setFontSize(6)
    doc.text('KioskoApp - Comprobante de Auditoría Contable', pageWidth / 2, y, { align: 'center' })

    // Nombre de archivo sanitizado
    const fechaHora = new Date(datos.fechaCierre)
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 16)
    const comercioClean = sanitizarNombreArchivo(datos.kioscoNombre || 'kiosco')
    const fileName = `comprobante_cierre_${comercioClean}_${fechaHora}.pdf`

    doc.save(fileName)
    return true
  } catch (error) {
    console.error('Error al generar comprobante PDF de cierre:', error)
    return false
  }
}
