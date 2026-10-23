import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import { fiscalRepresentationWire, validateFiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
import type { FiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
import { buildFiscalRepresentationQr } from '../../supabase/functions/_shared/fiscalRepresentationQr'

export interface FiscalRepresentationPdf { doc: jsPDF; fileName: string; pages: number }
const fail = (): never => { throw new Error('FISCAL_PDF_NO_CONFIRMADO') }
const date = (value: string): string => `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`
const money = (value: string): string => `$ ${value.replace('.', ',')}`
const issuerConditions = { MONOTRIBUTO: 'Responsable Monotributo', EXENTO: 'IVA Exento', RESPONSABLE_INSCRIPTO: 'IVA Responsable Inscripto' }
const vouchers: Record<number, string> = { 1: 'Factura A', 6: 'Factura B', 11: 'Factura C' }

/** Sólo representación de homologación. No emite, descarga, imprime ni consulta stores/red. */
export async function createFiscalRepresentationPdf(input: Readonly<FiscalRepresentation>): Promise<FiscalRepresentationPdf> {
  const captured = structuredClone(input)
  const qr = await buildFiscalRepresentationQr(captured)
  const value = await validateFiscalRepresentation(fiscalRepresentationWire(captured), captured.venta_id, captured.operacion_id)
  // Helvetica incorporada usa Latin-1. Nunca reemplazar silenciosamente un nombre por glifos ilegibles.
  const facts = value.hechos.datos
  const texts = [facts.emisor.razon_social, facts.emisor.domicilio_comercial, facts.emisor.ingresos_brutos,
    facts.receptor.nombre, facts.receptor.domicilio, value.condicion_receptor, ...facts.lineas.map(line => line.descripcion),
    ...value.constancia.solicitud.solicitud.tributos.map(line => line.descripcion)]
  if (texts.some(text => [...text].some(char => char.codePointAt(0)! > 255))) {
    throw new Error('FISCAL_PDF_FUENTE_NO_COMPATIBLE')
  }
  const image = await QRCode.toDataURL(qr.url, { errorCorrectionLevel: 'M', margin: 4, width: 480 })
  if (!image.startsWith('data:image/png;base64,')) return fail()
  const body = value.constancia.solicitud.solicitud, auth = value.constancia.autorizacion
  const number = `${String(body.puntoVenta).padStart(5, '0')}-${String(body.numero).padStart(8, '0')}`
  const title = `${vouchers[body.tipoComprobante]} ${number}`
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({ title: `Homologación - ${title}`, subject: 'Comprobante de prueba sin validez fiscal', creator: 'KioskoPOS' })
  let y = 0
  const startPage = (): void => {
    doc.setFillColor(236, 240, 244); doc.rect(14, 12, 182, 17, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(25, 35, 45)
    doc.text('HOMOLOGACIÓN - SIN VALIDEZ FISCAL', 105, 19, { align: 'center' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    doc.text(title, 105, 25, { align: 'center' }); y = 37
  }
  const ensure = (height: number): void => { if (y + height > 276) { doc.addPage(); startPage() } }
  const text = (content: string, bold = false, size = 10): void => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size)
    const lines = doc.splitTextToSize(content, 180) as string[]
    for (const line of lines) { ensure(5); doc.text(line, 15, y); y += 5 }
  }
  const section = (label: string): void => { ensure(15); y += 3; text(label, true, 11); y += 2 }
  startPage()
  text(facts.emisor.razon_social, true, 14)
  text(`Domicilio comercial: ${facts.emisor.domicilio_comercial}`)
  text(`CUIT: ${body.cuitEmisor} - ${issuerConditions[value.condicion_emisor]}`)
  text(`Ingresos Brutos: ${facts.emisor.ingresos_brutos}`)
  text(`Inicio de actividades: ${date(facts.emisor.inicio_actividades)}`)
  text(`Fecha del comprobante: ${date(body.fecha)} - Concepto: ${body.concepto}`)
  if (body.servicioDesde) text(`Período de servicio: ${date(body.servicioDesde)} al ${date(body.servicioHasta!)}`)
  if (body.vencimientoPago) text(`Vencimiento de pago: ${date(body.vencimientoPago)}`)
  section('Receptor')
  text(facts.receptor.nombre, true)
  text(`Domicilio: ${facts.receptor.domicilio}`)
  text(`Documento (tipo ${body.tipoDocumento}): ${body.numeroDocumento}`)
  text(`Condición ante IVA: ${value.condicion_receptor} (código ${body.condicionIvaReceptor})`)
  section('Detalle comercial histórico de la venta')
  text('Los subtotales finales conservan los ajustes registrados en la venta.', false, 9)
  const descriptions = new Map(facts.lineas.map(line => [line.detalle_id, line.descripcion]))
  for (const line of value.contexto.lineas) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    const description = doc.splitTextToSize(descriptions.get(line.detalle_id)!, 175) as string[]
    ensure(description.length * 5 + 16)
    text(descriptions.get(line.detalle_id)!, true)
    text(`Cantidad: ${line.cantidad.replace('.', ',')} - Precio en venta: ${money(line.precio_unitario)}`, false, 9)
    text(`Subtotal final de venta: ${money(line.subtotal)}`, true)
    doc.setDrawColor(215, 218, 220); doc.line(15, y - 2, 195, y - 2); y += 2
  }
  section('Importes del cuerpo fiscal autorizado')
  for (const [label, amount] of [
    ['Neto', body.importes.neto], ['IVA', body.importes.iva], ['No gravado', body.importes.noGravado],
    ['Exento', body.importes.exento], ['Tributos', body.importes.tributos],
  ]) text(`${label}: ${money(amount)}`)
  for (const line of body.iva) text(`IVA código ${line.id} - Base ${money(line.base)} - Importe ${money(line.importe)}`, false, 9)
  for (const line of body.tributos) text(`${line.descripcion} (código ${line.id}) - Base ${money(line.base)} - Alícuota ${line.alicuota} - Importe ${money(line.importe)}`, false, 9)
  text(`TOTAL: ${money(body.importes.total)} - Moneda: ${body.moneda} - Cotización: ${body.cotizacion}`, true, 12)
  text(`Otros impuestos nacionales indirectos declarados: ${money(facts.otros_impuestos_nacionales_indirectos)}`, false, 9)
  ensure(82)
  section('Autorización de homologación')
  const top = y
  doc.addImage(image, 'PNG', 15, top, 42, 42)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text(`CAE: ${auth.cae}`, 63, top + 8)
  doc.text(`Vencimiento del CAE: ${date(auth.vencimiento)}`, 63, top + 15)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text('QR del cuerpo autorizado en homologación.', 63, top + 23)
  doc.text('No acredita una emisión en Producción.', 63, top + 29)
  y = top + 48
  text(`Operación: ${value.operacion_id}`, false, 8)
  text(`Venta: ${value.venta_id}`, false, 8)
  text(`SHA-256 del cuerpo: ${value.constancia.solicitud.sha256}`, false, 7)
  text(`SHA-256 de representación: ${value.hechos.presentacion_sha256}`, false, 7)
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text('Prueba de homologación - Sin validez fiscal', 15, 288)
    doc.text(`${page} / ${pages}`, 195, 288, { align: 'right' })
  }
  return { doc, fileName: `homologacion-${body.tipoComprobante}-${number}.pdf`, pages }
}
