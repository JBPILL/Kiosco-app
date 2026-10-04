/**
 * Módulo de generación y compartición del Comprobante de Venta en formato PDF
 * Emula la diagramación de un ticket térmico de 80mm con soporte fiscal AFIP y comercial estándar.
 */

import jsPDF from 'jspdf'
import { formatFecha, formatNumero } from './utils'
import { sanitizarNombreArchivo } from './exportUtils'
import { generarImagenQRAFIP } from './afipQR'
import { generateCode128Bars } from './barcodeSvg'
import { generarEnlaceWhatsApp, abrirEnlaceExternoSeguro } from './whatsappReport'
import { getAnchoTicketGuardado, type AnchoPapelTicket } from './ticketPreferences'
import toast from 'react-hot-toast'
import type { TicketData } from '../components/pos/TicketReceiptModal'

/**
 * Normaliza y limpia un número de teléfono celular argentino para WhatsApp (E.164)
 */
export function formatearTelefonoWhatsAppVenta(tel: string): string {
  let limpio = tel.replace(/\D/g, '')
  if (!limpio) return ''
  if (limpio.startsWith('0')) limpio = limpio.slice(1)
  if (limpio.length === 12 && (limpio.startsWith('1115') || limpio.slice(2, 4) === '15')) {
    limpio = limpio.slice(0, 2) + limpio.slice(4)
  }
  if (limpio.length === 10) {
    limpio = '549' + limpio
  } else if (limpio.length === 12 && limpio.startsWith('54') && !limpio.startsWith('549')) {
    limpio = '549' + limpio.slice(2)
  }
  return limpio
}

/**
 * Construye la instancia jsPDF y el nombre de archivo del ticket de venta.
 * Soporta dinámicamente rollos continuos de 58mm y 80mm.
 */
export async function crearDocumentoPDFVenta(
  ticket: TicketData,
  anchoPapel?: AnchoPapelTicket
): Promise<{ doc: jsPDF; fileName: string }> {
  const ancho = anchoPapel || getAnchoTicketGuardado()
  const es58 = ancho === '58mm'
  const pageWidth = es58 ? 58 : 80
  const margin = es58 ? 3.5 : 5.5

  // Cálculo de altura dinámica considerando saltos de línea en descripciones
  let altoMm = es58 ? 145 : 155
  const items = ticket.items || []
  for (const it of items) {
    const cantStr = it.cantidad % 1 === 0 ? `${it.cantidad}x ` : `${it.cantidad} kg x `
    const desc = `${cantStr}${it.descripcion}`
    const charPerLine = es58 ? 20 : 28
    const lineas = Math.ceil(desc.length / charPerLine) || 1
    altoMm += lineas * 3.4
    if (it.cantidad > 1) altoMm += 3.2
    if (it.promoNombre) altoMm += 3.2
  }

  if (ticket.ajuste) altoMm += 8
  if (ticket.pagos && ticket.pagos.length > 1) altoMm += ticket.pagos.length * 4
  if (ticket.pagaCon !== undefined && ticket.pagaCon > 0) altoMm += 8
  if (ticket.notas) altoMm += 8
  if (ticket.afip) altoMm += es58 ? 40 : 45 // Espacio para recuadro fiscal, CAE y QR
  altoMm += 18 // Espacio para código de barras y texto identificador

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pageWidth, Math.max(es58 ? 145 : 160, altoMm)],
  })

  let y = 7

  const colorOscuro = [20, 24, 33]
  const colorGris = [100, 116, 139]
  const colorBorde = [200, 205, 215]

  const dibujarSeparador = (curY: number) => {
    doc.setDrawColor(colorBorde[0], colorBorde[1], colorBorde[2])
    doc.setLineDashPattern([1, 1], 0)
    doc.line(margin, curY, pageWidth - margin, curY)
  }

  // 1. Encabezado institucional o fiscal AFIP
  if (ticket.afip) {
    // Recuadro de Letra Fiscal (C, B o A)
    doc.setDrawColor(0, 0, 0)
    doc.setLineDashPattern([], 0)
    doc.rect(pageWidth / 2 - 4.5, y, 9, 8)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
    doc.text(ticket.afip.letra, pageWidth / 2, y + 5.8, { align: 'center' })
    y += 10.5

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    const tituloComprobante = (ticket.afip.tipoComprobanteNombre || `Factura ${ticket.afip.letra}`).toUpperCase()
    doc.text(tituloComprobante, pageWidth / 2, y, { align: 'center' })
    y += 3.5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.8)
    doc.text(`P.V.: ${String(ticket.afip.puntoVenta).padStart(4, '0')} - N°: ${String(ticket.afip.nroComprobante).padStart(8, '0')}`, pageWidth / 2, y, { align: 'center' })
    y += 4

    // Datos del Comercio Emisor
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text((ticket.kioscoNombre || 'COMERCIO').toUpperCase(), pageWidth / 2, y, { align: 'center' })
    y += 4

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(colorGris[0], colorGris[1], colorGris[2])
    if (ticket.kioscoDireccion) {
      doc.text(ticket.kioscoDireccion, pageWidth / 2, y, { align: 'center' })
      y += 3.2
    }
    if (ticket.kioscoTelefono) {
      doc.text(`Tel: ${ticket.kioscoTelefono}`, pageWidth / 2, y, { align: 'center' })
      y += 3.2
    }

    doc.text(`CUIT: ${ticket.afip.cuitEmisor || '—'} | Cond. IVA: ${ticket.afip.condicionIva || 'Resp. Monotributo'}`, pageWidth / 2, y, { align: 'center' })
    y += 3.2
    if (ticket.afip.iibb) {
      doc.text(`Ing. Brutos: ${ticket.afip.iibb}`, pageWidth / 2, y, { align: 'center' })
      y += 3.2
    }

    dibujarSeparador(y)
    y += 3.8

    // Datos del Receptor
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
    doc.text('A CONSUMIDOR FINAL', margin, y)
    y += 3.2

    doc.setFont('helvetica', 'normal')
    if (ticket.afip.nroDocCliente && ticket.afip.nroDocCliente !== '0') {
      const tipoDoc = ticket.afip.tipoDocCliente === 80 ? 'CUIT' : ticket.afip.tipoDocCliente === 96 ? 'DNI' : 'Doc'
      doc.text(`${tipoDoc}: ${ticket.afip.nroDocCliente}`, margin, y)
      y += 3.2
    }
    if (ticket.clienteNombre) {
      doc.text(`Cliente: ${ticket.clienteNombre}`, margin, y)
      y += 3.2
    }
    doc.text(`Fecha: ${formatFecha(ticket.fecha)}`, margin, y)
    y += 3.5

  } else {
    // Ticket no fiscal tradicional
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
    doc.text((ticket.kioscoNombre || 'KIOSKO').toUpperCase(), pageWidth / 2, y, { align: 'center' })
    y += 4.5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.2)
    doc.setTextColor(colorGris[0], colorGris[1], colorGris[2])
    if (ticket.kioscoDireccion) {
      doc.text(ticket.kioscoDireccion, pageWidth / 2, y, { align: 'center' })
      y += 3.2
    }
    if (ticket.kioscoTelefono) {
      doc.text(`Tel: ${ticket.kioscoTelefono}`, pageWidth / 2, y, { align: 'center' })
      y += 3.2
    }

    doc.text(`Ticket #${ticket.ventaId.slice(0, 8).toUpperCase()}`, pageWidth / 2, y, { align: 'center' })
    y += 3.2
    doc.text(formatFecha(ticket.fecha), pageWidth / 2, y, { align: 'center' })
    y += 3.2

    if (ticket.cajeroNombre) {
      doc.text(`Cajero: ${ticket.cajeroNombre}`, pageWidth / 2, y, { align: 'center' })
      y += 3.2
    }
    if (ticket.clienteNombre) {
      doc.text(`Cliente: ${ticket.clienteNombre}`, pageWidth / 2, y, { align: 'center' })
      y += 3.2
    }
  }

  dibujarSeparador(y)
  y += 4

  // 2. Detalle de Ítems
  const colSubWidth = es58 ? 16 : 20
  const xRight = pageWidth - margin
  const xSubLeft = xRight - colSubWidth
  const colDescWidth = xSubLeft - margin - 1.5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(colorGris[0], colorGris[1], colorGris[2])
  doc.text('CANT / ARTÍCULO', margin, y)
  doc.text('SUBTOTAL', xRight, y, { align: 'right' })
  y += 3.8

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
  doc.setFontSize(7.2)

  for (const it of items) {
    const cantStr = it.cantidad % 1 === 0 ? `${it.cantidad}x ` : `${it.cantidad} kg x `
    const descCompleta = `${cantStr}${it.descripcion}`

    // División en múltiples líneas según el ancho disponible para evitar truncamiento
    const lineasDesc = doc.splitTextToSize(descCompleta, colDescWidth)
    doc.text(lineasDesc[0] || '', margin, y)

    const signo = it.subtotal < 0 ? '-$' : '$'
    const numSubStr = formatNumero(Math.abs(it.subtotal))
    doc.text(signo, xSubLeft, y)
    doc.text(numSubStr, xRight, y, { align: 'right' })

    for (let l = 1; l < lineasDesc.length; l++) {
      y += 3.1
      doc.text(lineasDesc[l], margin, y)
    }

    if (it.cantidad > 1) {
      y += 2.9
      doc.setFontSize(6.2)
      doc.setTextColor(colorGris[0], colorGris[1], colorGris[2])
      doc.text(`($ ${formatNumero(it.precioUnitario)} c/u)`, margin, y)
      doc.setFontSize(7.2)
      doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
    }

    if (it.promoNombre) {
      y += 2.9
      doc.setFontSize(6.2)
      doc.setTextColor(16, 120, 60) // Verde sutil
      doc.text(`  [${it.promoNombre}]`, margin, y)
      doc.setFontSize(7.2)
      doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
    }

    y += 3.4
  }

  dibujarSeparador(y)
  y += 4

  // 3. Subtotal, Ajustes y Total General
  if (ticket.ajuste) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.2)
    doc.text('Subtotal:', margin, y)
    doc.text(ticket.subtotal < 0 ? '-$' : '$', xSubLeft, y)
    doc.text(formatNumero(Math.abs(ticket.subtotal)), xRight, y, { align: 'right' })
    y += 3.6

    const signoAjuste = ticket.ajuste.esDescuento ? '-$' : '+$'
    doc.text(`${ticket.ajuste.descripcion}:`, margin, y)
    doc.text(signoAjuste, xSubLeft, y)
    doc.text(formatNumero(Math.abs(ticket.ajuste.monto)), xRight, y, { align: 'right' })
    y += 3.6
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('TOTAL:', margin, y)
  doc.text(ticket.total < 0 ? '-$' : '$', xSubLeft, y)
  doc.text(formatNumero(Math.abs(ticket.total)), xRight, y, { align: 'right' })
  y += 4.8

  dibujarSeparador(y)
  y += 4

  // 4. Medio de Pago, Abonó y Vuelto
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.2)
  doc.text(`Medio de pago: ${ticket.medioPago}`, margin, y)
  y += 3.4

  if (ticket.pagos && ticket.pagos.length > 1) {
    for (const p of ticket.pagos) {
      doc.text(`  • ${p.medioPago}:`, margin, y)
      doc.text('$', xSubLeft, y)
      doc.text(formatNumero(p.monto), xRight, y, { align: 'right' })
      y += 3.2
    }
  }

  if (ticket.pagaCon !== undefined && ticket.pagaCon > 0) {
    doc.text('Abonó con:', margin, y)
    doc.text('$', xSubLeft, y)
    doc.text(formatNumero(ticket.pagaCon), xRight, y, { align: 'right' })
    y += 3.6

    doc.text('Vuelto:', margin, y)
    doc.text('$', xSubLeft, y)
    doc.text(formatNumero(ticket.vuelto || 0), xRight, y, { align: 'right' })
    y += 3.6
  }

  if (ticket.notas) {
    doc.setFontSize(6.5)
    doc.setTextColor(colorGris[0], colorGris[1], colorGris[2])
    doc.text(`Nota: ${ticket.notas}`, margin, y)
    y += 3.4
    doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
    doc.setFontSize(7.2)
  }

  // 5. Bloque AFIP (QR y CAE) si corresponde
  if (ticket.afip) {
    dibujarSeparador(y)
    y += 3

    if (ticket.afip.qrUrl) {
      try {
        const qrDataUrl = await generarImagenQRAFIP(ticket.afip.qrUrl, 160)
        if (qrDataUrl) {
          const qrSize = es58 ? 18 : 22
          doc.addImage(qrDataUrl, 'PNG', pageWidth / 2 - qrSize / 2, y, qrSize, qrSize)
          y += qrSize + 2
        }
      } catch (err) {
        console.warn('No se pudo incrustar QR AFIP en el PDF:', err)
      }
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(es58 ? 6.5 : 7)
    doc.text(`CAE: ${ticket.afip.cae}  |  Vto. CAE: ${ticket.afip.vtoCae}`, pageWidth / 2, y, { align: 'center' })
    y += 3.2

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(es58 ? 5.5 : 6)
    doc.setTextColor(colorGris[0], colorGris[1], colorGris[2])
    doc.text('Comprobante Autorizado por AFIP/ARCA (RG 4892)', pageWidth / 2, y, { align: 'center' })
    y += 3.5
  }

  // 6. Código de barras del comprobante para auditoría y devoluciones
  const barcodeText = `T-${ticket.ventaId.slice(0, 8).toUpperCase()}`
  const bars = generateCode128Bars(barcodeText)
  if (bars.length > 0) {
    y += 2
    const quietModules = 10
    const totalModules = bars.length + quietModules * 2
    const targetWidth = es58 ? 40 : 50
    const moduleW = targetWidth / totalModules
    const barHeight = es58 ? 7 : 8.5
    const startX = (pageWidth - targetWidth) / 2

    doc.setFillColor(0, 0, 0)
    for (let i = 0; i < bars.length; i++) {
      if (bars[i]) {
        const bx = startX + (quietModules + i) * moduleW
        doc.rect(bx, y, moduleW, barHeight, 'F')
      }
    }
    y += barHeight + 2
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(es58 ? 6 : 6.5)
    doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
    doc.text(`* ${barcodeText} *`, pageWidth / 2, y, { align: 'center' })
    y += 3.5
  }

  // 7. Pie de Ticket
  y += 1
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(es58 ? 7 : 7.5)
  doc.setTextColor(colorOscuro[0], colorOscuro[1], colorOscuro[2])
  doc.text('¡Muchas gracias por su compra!', pageWidth / 2, y, { align: 'center' })
  y += 3.2

  if (!ticket.afip) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(es58 ? 5.5 : 6)
    doc.setTextColor(colorGris[0], colorGris[1], colorGris[2])
    doc.text('Comprobante no válido como factura', pageWidth / 2, y, { align: 'center' })
  }

  // Nombre de archivo sanitizado
  const comercioClean = sanitizarNombreArchivo(ticket.kioscoNombre || 'ticket')
  const fechaStr = new Date(ticket.fecha).toISOString().slice(0, 10)
  const idCorto = ticket.ventaId.slice(0, 6)
  const fileName = `ticket_${comercioClean}_${idCorto}_${ancho}_${fechaStr}.pdf`

  return { doc, fileName }
}

/**
 * Descarga directamente el ticket de venta en PDF en el equipo respetando el ancho de papel térmico.
 */
export async function exportarTicketVentaPDF(
  ticket: TicketData,
  anchoPapel?: AnchoPapelTicket
): Promise<boolean> {
  try {
    const { doc, fileName } = await crearDocumentoPDFVenta(ticket, anchoPapel)
    doc.save(fileName)
    return true
  } catch (error) {
    console.error('Error al descargar ticket de venta en PDF:', error)
    return false
  }
}

/**
 * Comparte el comprobante PDF de venta por WhatsApp en la medida térmica configurada (58mm u 80mm):
 * - En celulares o navegadores compatibles: abre el menú nativo compartiendo directamente el archivo PDF sin texto preestablecido.
 * - En computadoras de escritorio (Windows PWA / Brave / Chrome):
 *   1. Descarga el archivo PDF localmente en la máquina.
 *   2. Abre el chat de WhatsApp con el número del cliente limpio, sin mensajes preestablecidos.
 */
export async function compartirTicketVentaWhatsApp(
  ticket: TicketData,
  telefonoCliente?: string,
  anchoPapel?: AnchoPapelTicket
): Promise<{ ok: boolean; metodo: 'share' | 'whatsapp_web' | 'cancelado' }> {
  try {
    const { doc, fileName } = await crearDocumentoPDFVenta(ticket, anchoPapel)
    const pdfBlob = doc.output('blob')
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' })

    // Intentar Web Share API con archivo adjunto
    if (
      typeof navigator !== 'undefined' &&
      navigator.canShare &&
      navigator.canShare({ files: [pdfFile] })
    ) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: `Ticket de Compra - ${ticket.kioscoNombre || 'Kiosco'}`,
        })
        return { ok: true, metodo: 'share' }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return { ok: true, metodo: 'cancelado' }
        }
        console.warn('Fallback Web Share en ticket:', err)
      }
    }

    // Fallback para escritorio (Windows / PWA): Descargar el PDF y abrir el chat de WhatsApp sin texto preestablecido
    doc.save(fileName)

    const telLimpio = formatearTelefonoWhatsAppVenta(telefonoCliente || ticket.clienteTelefono || '')
    const url = generarEnlaceWhatsApp(telLimpio, '')
    abrirEnlaceExternoSeguro(url)

    toast.success('Ticket PDF descargado y WhatsApp abierto.', {
      duration: 4000,
    })

    return { ok: true, metodo: 'whatsapp_web' }
  } catch (error: any) {
    console.error('Error al compartir ticket de venta por WhatsApp:', error)
    toast.error('Error al generar el comprobante PDF: ' + (error?.message || 'Error'))
    return { ok: false, metodo: 'whatsapp_web' }
  }
}
