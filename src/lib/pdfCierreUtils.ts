/**
 * Módulo de generación y compartición del Comprobante PDF de Cierre de Caja (Arqueo Z y X)
 * Estructura idéntica al ticket de venta interno del sistema, en formato térmico para archivo y WhatsApp.
 */

import jsPDF from 'jspdf'
import { formatPrecio, formatFecha } from './utils'
import { sanitizarNombreArchivo } from './exportUtils'
import {
  generarEnlaceWhatsApp,
  abrirEnlaceExternoSeguro,
} from './whatsappReport'
import toast from 'react-hot-toast'
import type { DatosCierreCaja } from '../components/pos/TicketCierreCajaModal'

/**
 * Construye la instancia jsPDF y el nombre de archivo del comprobante de cierre de caja.
 * Emula la diagramación limpia y legible de un ticket térmico de 80mm.
 */
export function crearDocumentoPDFCierre(datos: DatosCierreCaja): { doc: jsPDF; fileName: string } {
  // Cálculo de altura dinámica según contenido
  let altoMm = 190
  const ventas = datos.ventasPorMedio || []
  if (ventas.length > 0) {
    altoMm += ventas.length * 4.5
  }
  if ((datos.ingresosExtra || 0) > 0 || (datos.egresosExtra || 0) > 0) {
    altoMm += 18
  }

  const pageWidth = 80
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pageWidth, Math.max(200, altoMm)],
  })

  const margin = 5.5
  let y = 8

  const colorOscuro = [20, 24, 33]
  const colorGris = [100, 116, 139]
  const colorBorde = [200, 205, 215]

  // Función interna para dibujar línea punteada divisoria
  const dibujarSeparador = (curY: number) => {
    doc.setDrawColor(colorBorde[0], colorBorde[1], colorBorde[2])
    doc.setLineDashPattern([1, 1], 0)
    doc.line(margin, curY, pageWidth - margin, curY)
  }

  // 1. Encabezado del Comercio
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
  const nombreKiosco = (datos.kioscoNombre || 'KIOSKOPOS').toUpperCase()
  doc.text(nombreKiosco, pageWidth / 2, y, { align: 'center' })
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

  dibujarSeparador(y)
  y += 4.5

  // 2. Título de Arqueo
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
  const tipoTitulo = datos.esParcial ? '*** ARQUEO PARCIAL (X) ***' : '*** CIERRE DE CAJA (ARQUEO Z) ***'
  doc.text(tipoTitulo, pageWidth / 2, y, { align: 'center' })
  y += 4.5

  // Metadatos de la Sesión
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.2)
  doc.setTextColor(colorGris[0], colorGris[1], colorGris[2])
  doc.text(`Fecha Emisión: ${formatFecha(datos.fechaCierre)}`, margin, y)
  y += 3.4
  doc.text(`Fecha Apertura: ${formatFecha(datos.fechaApertura)}`, margin, y)
  y += 3.4
  if (datos.cajeroNombre) {
    doc.text(`Cajero: ${datos.cajeroNombre}`, margin, y)
    y += 3.4
  }

  dibujarSeparador(y)
  y += 4.5

  // 3. Fondo Inicial de Caja
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.8)
  doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
  doc.text('Fondo Inicial de Caja:', margin, y)
  doc.text(formatPrecio(datos.montoInicial || 0), pageWidth - margin, y, { align: 'right' })
  y += 4.5

  dibujarSeparador(y)
  y += 4

  // 4. Detalle de Ventas por Medio de Pago
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text('VENTAS POR MEDIO DE PAGO:', margin, y)
  y += 3.8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.2)
  if (ventas.length > 0) {
    for (const m of ventas) {
      const desc = `${m.medio}${m.cantidad ? ` (${m.cantidad} op.)` : ''}:`
      doc.text(desc, margin, y)
      doc.text(formatPrecio(m.total || 0), pageWidth - margin, y, { align: 'right' })
      y += 3.6
    }
  } else {
    doc.text('Sin ventas registradas en el turno', margin, y)
    y += 3.6
  }

  // Total General Facturado
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  const cantVentasTxt = datos.cantidadVentas ? ` (${datos.cantidadVentas} op.)` : ''
  doc.text(`TOTAL FACTURADO${cantVentasTxt}:`, margin, y)
  doc.text(formatPrecio(datos.totalVentas || 0), pageWidth - margin, y, { align: 'right' })
  y += 4.5

  // 5. Movimientos de Caja (si hubo)
  const ingresosExtra = datos.ingresosExtra || 0
  const egresosExtra = datos.egresosExtra || 0
  if (ingresosExtra > 0 || egresosExtra > 0) {
    dibujarSeparador(y)
    y += 4

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text('MOVIMIENTOS DE CAJA:', margin, y)
    y += 3.8

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.2)
    if (ingresosExtra > 0) {
      doc.text('(+) Ingresos Extra:', margin, y)
      doc.text(`+${formatPrecio(ingresosExtra)}`, pageWidth - margin, y, { align: 'right' })
      y += 3.6
    }
    if (egresosExtra > 0) {
      doc.text('(-) Retiros / Gastos:', margin, y)
      doc.text(`-${formatPrecio(egresosExtra)}`, pageWidth - margin, y, { align: 'right' })
      y += 3.6
    }
  }

  dibujarSeparador(y)
  y += 4

  // 6. Balance y Control de Arqueo
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text('CONTROL DE ARQUEO DE EFECTIVO:', margin, y)
  y += 3.8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.2)
  doc.text('Efectivo esperado en caja:', margin, y)
  doc.text(formatPrecio(datos.efectivoEsperado || 0), pageWidth - margin, y, { align: 'right' })
  y += 3.6

  doc.text('Efectivo contado físico:', margin, y)
  doc.text(formatPrecio(datos.efectivoContado || 0), pageWidth - margin, y, { align: 'right' })
  y += 4.2

  // Diferencia destacada
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text('Diferencia de arqueo:', margin, y)
  const diff = datos.diferencia || 0
  let diffTexto = '$ 0 (Exacto)'
  if (diff > 0) diffTexto = `+${formatPrecio(diff)} (Sobrante)`
  else if (diff < 0) diffTexto = `${formatPrecio(diff)} (Faltante)`
  doc.text(diffTexto, pageWidth - margin, y, { align: 'right' })
  y += 5.5

  // 7. Cuadro de Firmas Oficiales
  doc.setLineDashPattern([], 0)
  doc.setDrawColor(160, 160, 160)

  // Firma cajero
  doc.line(margin + 5, y + 6, pageWidth - margin - 5, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(colorGris[0], colorGris[1], colorGris[2])
  doc.text('Firma Cajero / Responsable', pageWidth / 2, y + 9.5, { align: 'center' })
  y += 14

  // Firma encargado
  doc.line(margin + 5, y + 6, pageWidth - margin - 5, y + 6)
  doc.text('Firma Encargado / Auditor', pageWidth / 2, y + 9.5, { align: 'center' })
  y += 13

  // 8. Pie de Comprobante
  doc.setFontSize(6)
  doc.text('Comprobante Oficial de Auditoría y Cierre', pageWidth / 2, y, { align: 'center' })
  y += 3
  doc.text('Sistema AlPaso Kiosco POS', pageWidth / 2, y, { align: 'center' })

  // Sanitizar nombre de archivo
  let fechaHora = 'fecha'
  try {
    const d = new Date(datos.fechaCierre)
    if (!isNaN(d.getTime())) {
      fechaHora = d.toISOString().replace(/[:.]/g, '-').slice(0, 16)
    }
  } catch {
    fechaHora = String(Date.now())
  }
  const comercioClean = sanitizarNombreArchivo(datos.kioscoNombre || 'kiosco')
  const fileName = `cierre_caja_${comercioClean}_${fechaHora}.pdf`

  return { doc, fileName }
}

/**
 * Genera y descarga el archivo PDF directamente en el equipo.
 */
export function exportarComprobanteCierrePDF(datos: DatosCierreCaja): boolean {
  try {
    const { doc, fileName } = crearDocumentoPDFCierre(datos)
    doc.save(fileName)
    return true
  } catch (error) {
    console.error('Error al descargar comprobante PDF:', error)
    return false
  }
}

/**
 * Comparte el comprobante PDF de Cierre de Caja por WhatsApp.
 * - En celulares o navegadores compatibles: abre el menú nativo compartiendo el archivo PDF adjunto.
 * - En computadoras de escritorio (Windows PWA / Brave / Chrome):
 *   1. Descarga el archivo PDF localmente en la carpeta de Descargas.
 *   2. Abre el chat de WhatsApp del dueño con un resumen ejecutivo formal y aviso para adjuntar el PDF.
 */
export async function compartirComprobanteCierreWhatsApp(
  datos: DatosCierreCaja,
  telefonoDueno?: string
): Promise<{ ok: boolean; metodo: 'share' | 'whatsapp_web' | 'cancelado' }> {
  try {
    const { doc, fileName } = crearDocumentoPDFCierre(datos)
    const pdfBlob = doc.output('blob')
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' })

    // Intentar Web Share API con archivo adjunto (nativa en móviles y navegadores compatibles)
    if (
      typeof navigator !== 'undefined' &&
      navigator.canShare &&
      navigator.canShare({ files: [pdfFile] })
    ) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: `Cierre de Caja - ${datos.kioscoNombre || 'Kiosco'}`,
        })
        return { ok: true, metodo: 'share' }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return { ok: true, metodo: 'cancelado' }
        }
        console.warn('Fallback de Web Share API:', err)
      }
    }

    // Fallback para escritorio (Windows / PWA): Descargar el PDF y abrir el chat de WhatsApp sin texto preestablecido
    doc.save(fileName)

    const url = generarEnlaceWhatsApp(telefonoDueno || '', '')
    abrirEnlaceExternoSeguro(url)

    toast.success('Comprobante PDF descargado y WhatsApp abierto.', {
      duration: 4000,
    })

    return { ok: true, metodo: 'whatsapp_web' }
  } catch (error: any) {
    console.error('Error al compartir comprobante PDF por WhatsApp:', error)
    toast.error('Error al procesar el comprobante: ' + (error?.message || 'Error'))
    return { ok: false, metodo: 'whatsapp_web' }
  }
}
