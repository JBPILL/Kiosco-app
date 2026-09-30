/**
 * Módulo de generación y compartición del Comprobante PDF de Cierre de Caja (Arqueo Z y X)
 * Estructura idéntica al ticket de venta interno del sistema, en formato térmico para archivo y WhatsApp.
 * Soporta dinámicamente rollos térmicos continuos de 58mm y 80mm respetando la preferencia del usuario.
 */

import jsPDF from 'jspdf'
import { formatPrecio, formatFecha } from './utils'
import { sanitizarNombreArchivo } from './exportUtils'
import {
  generarEnlaceWhatsApp,
  abrirEnlaceExternoSeguro,
} from './whatsappReport'
import { getAnchoTicketGuardado, type AnchoPapelTicket } from './ticketPreferences'
import toast from 'react-hot-toast'
import type { DatosCierreCaja } from '../components/pos/TicketCierreCajaModal'

/**
 * Construye la instancia jsPDF y el nombre de archivo del comprobante de cierre de caja.
 * Emula la diagramación limpia y legible de un ticket térmico continuo de 58mm u 80mm.
 */
export function crearDocumentoPDFCierre(
  datos: DatosCierreCaja,
  anchoPapel?: AnchoPapelTicket
): { doc: jsPDF; fileName: string } {
  const ancho = anchoPapel || getAnchoTicketGuardado()
  const es58 = ancho === '58mm'
  const pageWidth = es58 ? 58 : 80
  const margin = es58 ? 3.5 : 5.5

  // Cálculo de altura dinámica según contenido
  let altoMm = es58 ? 180 : 190
  const ventas = datos.ventasPorMedio || []
  if (ventas.length > 0) {
    altoMm += ventas.length * (es58 ? 4 : 4.5)
  }
  if ((datos.ingresosExtra || 0) > 0 || (datos.egresosExtra || 0) > 0) {
    altoMm += es58 ? 16 : 18
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pageWidth, Math.max(es58 ? 185 : 200, altoMm)],
  })

  let y = es58 ? 7 : 8

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
  doc.setFontSize(es58 ? 9.5 : 11)
  doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
  const nombreKiosco = (datos.kioscoNombre || 'KIOSKOPOS').toUpperCase()
  doc.text(nombreKiosco, pageWidth / 2, y, { align: 'center' })
  y += es58 ? 4 : 4.5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(es58 ? 6.8 : 7.5)
  doc.setTextColor(colorGris[0], colorGris[1], colorGris[2])
  if (datos.kioscoDireccion) {
    doc.text(datos.kioscoDireccion, pageWidth / 2, y, { align: 'center' })
    y += es58 ? 3.2 : 3.5
  }
  if (datos.kioscoTelefono) {
    doc.text(`Tel: ${datos.kioscoTelefono}`, pageWidth / 2, y, { align: 'center' })
    y += es58 ? 3.2 : 3.5
  }

  dibujarSeparador(y)
  y += es58 ? 4 : 4.5

  // 2. Título de Arqueo
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(es58 ? 8.2 : 9)
  doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
  const tipoTitulo = datos.esParcial ? '*** ARQUEO PARCIAL (X) ***' : '*** CIERRE DE CAJA (ARQUEO Z) ***'
  doc.text(tipoTitulo, pageWidth / 2, y, { align: 'center' })
  y += es58 ? 4 : 4.5

  // Metadatos de la Sesión
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(es58 ? 6.5 : 7.2)
  doc.setTextColor(colorGris[0], colorGris[1], colorGris[2])
  doc.text(`Fecha Emisión: ${formatFecha(datos.fechaCierre)}`, margin, y)
  y += es58 ? 3.2 : 3.4
  doc.text(`Fecha Apertura: ${formatFecha(datos.fechaApertura)}`, margin, y)
  y += es58 ? 3.2 : 3.4
  if (datos.cajeroNombre) {
    doc.text(`Cajero: ${datos.cajeroNombre}`, margin, y)
    y += es58 ? 3.2 : 3.4
  }

  dibujarSeparador(y)
  y += es58 ? 4 : 4.5

  // 3. Fondo Inicial de Caja
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(es58 ? 7.2 : 7.8)
  doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
  doc.text('Fondo Inicial de Caja:', margin, y)
  doc.text(formatPrecio(datos.montoInicial || 0), pageWidth - margin, y, { align: 'right' })
  y += es58 ? 4 : 4.5

  dibujarSeparador(y)
  y += es58 ? 3.6 : 4

  // 4. Detalle de Ventas por Medio de Pago
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(es58 ? 7 : 7.5)
  doc.text('VENTAS POR MEDIO DE PAGO:', margin, y)
  y += es58 ? 3.4 : 3.8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(es58 ? 6.6 : 7.2)
  if (ventas.length > 0) {
    for (const m of ventas) {
      const desc = `${m.medio}${m.cantidad ? ` (${m.cantidad} op.)` : ''}:`
      doc.text(desc, margin, y)
      doc.text(formatPrecio(m.total || 0), pageWidth - margin, y, { align: 'right' })
      y += es58 ? 3.4 : 3.6
    }
  } else {
    doc.text('Sin ventas registradas en el turno', margin, y)
    y += es58 ? 3.4 : 3.6
  }

  // Total General Facturado
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(es58 ? 7 : 7.5)
  const cantVentasTxt = datos.cantidadVentas ? ` (${datos.cantidadVentas} op.)` : ''
  doc.text(`TOTAL FACTURADO${cantVentasTxt}:`, margin, y)
  doc.text(formatPrecio(datos.totalVentas || 0), pageWidth - margin, y, { align: 'right' })
  y += es58 ? 4 : 4.5

  // 5. Movimientos de Caja (si hubo)
  const ingresosExtra = datos.ingresosExtra || 0
  const egresosExtra = datos.egresosExtra || 0
  if (ingresosExtra > 0 || egresosExtra > 0) {
    dibujarSeparador(y)
    y += es58 ? 3.6 : 4

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(es58 ? 7 : 7.5)
    doc.text('MOVIMIENTOS DE CAJA:', margin, y)
    y += es58 ? 3.4 : 3.8

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(es58 ? 6.6 : 7.2)
    if (ingresosExtra > 0) {
      doc.text('(+) Ingresos Extra:', margin, y)
      doc.text(`+${formatPrecio(ingresosExtra)}`, pageWidth - margin, y, { align: 'right' })
      y += es58 ? 3.4 : 3.6
    }
    if (egresosExtra > 0) {
      doc.text('(-) Retiros / Gastos:', margin, y)
      doc.text(`-${formatPrecio(egresosExtra)}`, pageWidth - margin, y, { align: 'right' })
      y += es58 ? 3.4 : 3.6
    }
  }

  dibujarSeparador(y)
  y += es58 ? 3.6 : 4

  // 6. Balance y Control de Arqueo
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(es58 ? 7 : 7.5)
  doc.text('CONTROL DE ARQUEO DE EFECTIVO:', margin, y)
  y += es58 ? 3.4 : 3.8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(es58 ? 6.6 : 7.2)
  doc.text('Efectivo esperado en caja:', margin, y)
  doc.text(formatPrecio(datos.efectivoEsperado || 0), pageWidth - margin, y, { align: 'right' })
  y += es58 ? 3.4 : 3.6

  doc.text('Efectivo contado físico:', margin, y)
  doc.text(formatPrecio(datos.efectivoContado || 0), pageWidth - margin, y, { align: 'right' })
  y += es58 ? 3.8 : 4.2

  // Diferencia destacada
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(es58 ? 7 : 7.5)
  doc.text('Diferencia de arqueo:', margin, y)
  const diff = datos.diferencia || 0
  let diffTexto = '$ 0 (Exacto)'
  if (diff > 0) diffTexto = `+${formatPrecio(diff)} (Sobrante)`
  else if (diff < 0) diffTexto = `${formatPrecio(diff)} (Faltante)`
  doc.text(diffTexto, pageWidth - margin, y, { align: 'right' })
  y += es58 ? 5 : 5.5

  // 7. Cuadro de Firmas Oficiales
  doc.setLineDashPattern([], 0)
  doc.setDrawColor(160, 160, 160)

  // Firma cajero
  doc.line(margin + 2, y + (es58 ? 5 : 6), pageWidth - margin - 2, y + (es58 ? 5 : 6))
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(es58 ? 6 : 6.5)
  doc.setTextColor(colorGris[0], colorGris[1], colorGris[2])
  doc.text('Firma Cajero / Responsable', pageWidth / 2, y + (es58 ? 8.5 : 9.5), { align: 'center' })
  y += es58 ? 12 : 14

  // Firma encargado
  doc.line(margin + 2, y + (es58 ? 5 : 6), pageWidth - margin - 2, y + (es58 ? 5 : 6))
  doc.text('Firma Encargado / Auditor', pageWidth / 2, y + (es58 ? 8.5 : 9.5), { align: 'center' })
  y += es58 ? 11 : 13

  // 8. Pie de Comprobante
  doc.setFontSize(es58 ? 5.5 : 6)
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
  const fileName = `cierre_caja_${comercioClean}_${ancho}_${fechaHora}.pdf`

  return { doc, fileName }
}

/**
 * Genera y descarga el archivo PDF directamente en el equipo respetando los mm del rollo.
 */
export function exportarComprobanteCierrePDF(
  datos: DatosCierreCaja,
  anchoPapel?: AnchoPapelTicket
): boolean {
  try {
    const { doc, fileName } = crearDocumentoPDFCierre(datos, anchoPapel)
    doc.save(fileName)
    return true
  } catch (error) {
    console.error('Error al descargar comprobante PDF:', error)
    return false
  }
}

/**
 * Comparte el comprobante PDF de Cierre de Caja por WhatsApp en la medida térmica configurada.
 * - En celulares o navegadores compatibles: abre el menú nativo compartiendo el archivo PDF adjunto.
 * - En computadoras de escritorio (Windows PWA / Brave / Chrome):
 *   1. Descarga el archivo PDF localmente en la carpeta de Descargas.
 *   2. Abre el chat de WhatsApp del dueño con el número limpio y listo para adjuntar el PDF.
 */
export async function compartirComprobanteCierreWhatsApp(
  datos: DatosCierreCaja,
  telefonoDueno?: string,
  anchoPapel?: AnchoPapelTicket
): Promise<{ ok: boolean; metodo: 'share' | 'whatsapp_web' | 'cancelado' }> {
  try {
    const { doc, fileName } = crearDocumentoPDFCierre(datos, anchoPapel)
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
