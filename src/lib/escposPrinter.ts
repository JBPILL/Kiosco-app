/**
 * Módulo de Impresión Térmica Directa ESC/POS para Kioscos y Puntos de Venta
 * Permite enviar comandos binarios ESC/POS directamente a impresoras térmicas USB/COM
 * (Epson, Hasar, Xprinter, 3nStar, etc.) mediante la API Web Serial sin pasar
 * por el diálogo nativo de impresión del navegador.
 */

import type { TicketData } from '../components/pos/TicketReceiptModal'
import type { DatosCierreCaja } from '../components/pos/TicketCierreCajaModal'
import { formatPrecio, formatFecha, formatearPromoTicket } from './utils'

// Comandos ESC/POS estándar
const ESC = 0x1b
const GS = 0x1d

const CMD_INIT = [ESC, 0x40] // ESC @
const CMD_ALIGN_LEFT = [ESC, 0x61, 0x00] // ESC a 0
const CMD_ALIGN_CENTER = [ESC, 0x61, 0x01] // ESC a 1
const CMD_ALIGN_RIGHT = [ESC, 0x61, 0x02] // ESC a 2
const CMD_BOLD_ON = [ESC, 0x45, 0x01] // ESC E 1
const CMD_BOLD_OFF = [ESC, 0x45, 0x00] // ESC E 0
const CMD_DOUBLE_SIZE = [GS, 0x21, 0x11] // Doble ancho y alto
const CMD_NORMAL_SIZE = [GS, 0x21, 0x00] // Tamaño normal
const CMD_FEED_AND_CUT = [ESC, 0x64, 0x03, GS, 0x56, 0x42, 0x00] // Avanza 3 líneas y corta papel
const CMD_KICK_DRAWER = [ESC, 0x70, 0x00, 0x19, 0xfa] // Pulso para abrir cajón de dinero

/**
 * Genera la secuencia de bytes ESC/POS para imprimir un código de barras Code 128 (Subset B)
 * con texto HRI centrado debajo. Compatible con Epson, Hasar, Xprinter, 3nStar, etc.
 */
function generarComandoBarcodeEscPos(texto: string): number[] {
  const limpio = texto.trim().replace(/[^\x20-\x7E]/g, '')
  if (!limpio) return []
  const textBytes = Array.from(new TextEncoder().encode(limpio))
  const data = [0x7B, 0x42, ...textBytes]
  return [
    GS, 0x68, 50,       // GS h 50: Altura de código de barras
    GS, 0x77, 2,        // GS w 2: Ancho de barras
    GS, 0x48, 2,        // GS H 2: Caracteres HRI legibles debajo
    GS, 0x66, 0,        // GS f 0: Fuente HRI
    GS, 0x6B, 73, data.length, ...data, // GS k 73: Code 128
  ]
}

/**
 * Normaliza strings para impresoras térmicas eliminando acentos
 * y caracteres que puedan corromperse según la página de códigos del firmware.
 */
function normalizarTexto(texto: string): string {
  if (!texto) return ''
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N')
    .replace(/°/g, 'o')
    .replace(/[$]/g, '$')
    .replace(/[^\x20-\x7E\n\r]/g, '')
}

/**
 * Genera una línea con dos columnas justificadas (izquierda y derecha)
 */
function formatearLineaDosColumnas(izq: string, der: string, anchoTotal: number): string {
  const derLimpio = normalizarTexto(der)
  const izqLimpio = normalizarTexto(izq)
  const espacioDisponible = anchoTotal - derLimpio.length
  if (espacioDisponible <= 0) {
    return (izqLimpio.slice(0, anchoTotal - derLimpio.length - 1) + ' ' + derLimpio).slice(0, anchoTotal)
  }
  const izqAjustado = izqLimpio.slice(0, espacioDisponible)
  const padding = ' '.repeat(Math.max(0, espacioDisponible - izqAjustado.length))
  return izqAjustado + padding + derLimpio
}

/**
 * Formatea un monto con posición fija del signo $ y el número alineado a la derecha
 */
function formatearMontoFijo(monto: number, ancho: number = 9): string {
  const signo = monto < 0 ? '-$' : '$'
  const numStr = Math.round(Math.abs(monto)).toLocaleString('es-AR')
  const espacio = Math.max(1, ancho - signo.length - numStr.length)
  return signo + ' '.repeat(espacio) + numStr
}

/**
 * Divide un texto en líneas respetando palabras para que no se corten
 */
function dividirTextoEnLineas(texto: string, maxAncho: number): string[] {
  const palabras = texto.split(' ')
  const lineas: string[] = []
  let lineaActual = ''
  for (const p of palabras) {
    if (!lineaActual) {
      lineaActual = p
    } else if (lineaActual.length + 1 + p.length <= maxAncho) {
      lineaActual += ' ' + p
    } else {
      lineas.push(lineaActual)
      lineaActual = p
    }
  }
  if (lineaActual) lineas.push(lineaActual)
  return lineas.length > 0 ? lineas : [texto.slice(0, maxAncho)]
}

/**
 * Verifica si el navegador soporta Web Serial API
 */
export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

/**
 * Construye el buffer binario Uint8Array con las instrucciones ESC/POS del ticket
 */
export function construirBufferEscPos(ticket: TicketData, anchoPapel: '58mm' | '80mm' = '58mm'): Uint8Array {
  const anchoCols = anchoPapel === '80mm' ? 42 : 32
  const encoder = new TextEncoder()
  const bytes: number[] = []

  const appendBytes = (arr: number[]) => {
    bytes.push(...arr)
  }

  const appendTexto = (str: string, newline = true) => {
    const raw = encoder.encode(normalizarTexto(str) + (newline ? '\n' : ''))
    for (let i = 0; i < raw.length; i++) {
      bytes.push(raw[i])
    }
  }

  const separador = '-'.repeat(anchoCols)

  // 1. Inicializar impresora
  appendBytes(CMD_INIT)

  // 2. Encabezado de comercio (Centrado)
  appendBytes(CMD_ALIGN_CENTER)
  appendBytes(CMD_DOUBLE_SIZE)
  appendBytes(CMD_BOLD_ON)
  appendTexto(ticket.kioscoNombre || 'KIOSKO')
  appendBytes(CMD_NORMAL_SIZE)
  appendBytes(CMD_BOLD_OFF)

  if (ticket.kioscoDireccion) {
    appendTexto(ticket.kioscoDireccion)
  }
  if (ticket.kioscoTelefono) {
    appendTexto(`Tel: ${ticket.kioscoTelefono}`)
  }

  // Si tiene datos AFIP
  if (ticket.afip) {
    appendBytes(CMD_BOLD_ON)
    appendTexto(`FACTURA ${ticket.afip.letra} N ${String(ticket.afip.puntoVenta).padStart(4, '0')}-${String(ticket.afip.nroComprobante).padStart(8, '0')}`)
    appendBytes(CMD_BOLD_OFF)
    if (ticket.afip.cuitEmisor) {
      appendTexto(`CUIT: ${ticket.afip.cuitEmisor}`)
    }
  } else {
    appendTexto(`Ticket #${ticket.ventaId.slice(0, 8).toUpperCase()}`)
  }

  appendTexto(`Fecha: ${ticket.fecha ? new Date(ticket.fecha).toLocaleString('es-AR') : new Date().toLocaleString('es-AR')}`)

  if (ticket.cajeroNombre) {
    appendTexto(`Atendido por: ${ticket.cajeroNombre}`)
  }
  if (ticket.clienteNombre) {
    appendTexto(`Cliente: ${ticket.clienteNombre}`)
  }

  // 3. Detalle de Items
  appendBytes(CMD_ALIGN_LEFT)
  appendTexto(separador)
  appendBytes(CMD_BOLD_ON)
  appendTexto(formatearLineaDosColumnas('ARTICULO', 'IMPORTE', anchoCols))
  appendBytes(CMD_BOLD_OFF)
  appendTexto(separador)

  const colMontoAncho = anchoPapel === '58mm' ? 9 : 11

  ticket.items.forEach((it) => {
    const montoFijo = formatearMontoFijo(it.subtotal, colMontoAncho)
    dividirTextoEnLineas(it.descripcion.toUpperCase(), anchoCols).forEach((linea) => appendTexto(linea))
    appendTexto(formatearLineaDosColumnas(
      `${it.cantidad} x $ ${Math.round(it.precioUnitario).toLocaleString('es-AR')}`,
      montoFijo,
      anchoCols,
    ))

    if (it.promoNombre) {
      appendTexto(`PROMO: ${formatearPromoTicket(it.promoNombre)}`)
    }
  })

  appendTexto(separador)

  // 4. Totales y Pagos
  appendBytes(CMD_ALIGN_RIGHT)
  if (ticket.ajuste) {
    appendTexto(formatearLineaDosColumnas('Subtotal:', formatearMontoFijo(ticket.subtotal, colMontoAncho), anchoCols))
    const signo = ticket.ajuste.esDescuento ? '-' : '+'
    appendTexto(formatearLineaDosColumnas(`${ticket.ajuste.descripcion}:`, `${signo}${formatearMontoFijo(Math.abs(ticket.ajuste.monto), colMontoAncho - 1)}`, anchoCols))
  }

  appendBytes(CMD_BOLD_ON)
  appendBytes(CMD_DOUBLE_SIZE)
  appendTexto(formatearLineaDosColumnas('TOTAL:', `$${Math.round(ticket.total).toLocaleString('es-AR')}`, anchoCols))
  appendBytes(CMD_NORMAL_SIZE)
  appendBytes(CMD_BOLD_OFF)

  appendTexto(formatearLineaDosColumnas('Pago:', ticket.medioPago || 'Efectivo', anchoCols))

  if (ticket.pagaCon && ticket.pagaCon > 0) {
    appendTexto(formatearLineaDosColumnas('Abono:', formatearMontoFijo(ticket.pagaCon, colMontoAncho), anchoCols))
    appendTexto(formatearLineaDosColumnas('Vuelto:', formatearMontoFijo(ticket.vuelto || 0, colMontoAncho), anchoCols))
  }

  // 5. Datos fiscales AFIP
  if (ticket.afip) {
    appendTexto(separador)
    appendBytes(CMD_ALIGN_CENTER)
    appendTexto(`CAE: ${ticket.afip.cae}`)
    appendTexto(`Vto. CAE: ${ticket.afip.vtoCae}`)
    appendTexto('Comprobante Autorizado por AFIP')
  }

  // 6. Pie de página y código de barras
  appendTexto(separador)
  appendBytes(CMD_ALIGN_CENTER)

  const barcodeVenta = `T-${ticket.ventaId.slice(0, 8).toUpperCase()}`
  appendBytes(generarComandoBarcodeEscPos(barcodeVenta))
  appendTexto('')

  if (ticket.notas) {
    appendTexto(ticket.notas)
  }
  appendTexto('¡Muchas gracias por su compra!')

  // 7. Corte de papel y fin
  appendBytes(CMD_FEED_AND_CUT)

  return new Uint8Array(bytes)
}

/**
 * Obtiene un puerto serie disponible: reutiliza uno previamente autorizado
 * mediante getPorts() o solicita uno nuevo mediante requestPort() si no hay ninguno.
 * (BUG-23: Evita diálogos modales repetitivos al imprimir tickets sucesivos).
 */
async function obtenerPuertoSerial(): Promise<SerialPortLike> {
  const serial = (navigator as any).serial
  try {
    if (typeof serial.getPorts === 'function') {
      const authorizedPorts = await serial.getPorts()
      const configurado = leerPuertoImpresoraConfigurado()
      if (configurado) {
        const coincidencias = (authorizedPorts as SerialPortLike[]).filter((port) => {
          const info = port.getInfo?.()
          return info?.usbVendorId === configurado.usbVendorId && info?.usbProductId === configurado.usbProductId
        })
        if (coincidencias.length === 1) return coincidencias[0]
        if (coincidencias.length > 1) throw new Error('Hay varios dispositivos iguales autorizados; el navegador no permite distinguirlos. Desautorizá el otro dispositivo desde el navegador y volvé a configurar.')
        throw new Error('La impresora configurada no está conectada o perdió el permiso. Configurala nuevamente en Ajustes.')
      }
      if (authorizedPorts?.length === 1) return authorizedPorts[0] as SerialPortLike
      if (authorizedPorts?.length > 1) throw new Error('Hay varios puertos autorizados. Elegí la impresora en Ajustes para evitar enviar el ticket al dispositivo equivocado.')
    }
  } catch (error) {
    if (error instanceof Error && (error.message.includes('impresora') || error.message.includes('puertos autorizados') || error.message.includes('dispositivos iguales'))) throw error
  }
  throw new Error('No hay una impresora configurada. Seleccionala desde Ajustes antes de imprimir.')
}

const CLAVE_PUERTO_IMPRESORA = 'kioskopos_impresora_serial_v1'
const CLAVE_APERTURA_AUTOMATICA = 'kioskopos_abrir_cajon_efectivo_v1'

export function getAperturaAutomaticaCajon(): boolean {
  try { return localStorage.getItem(CLAVE_APERTURA_AUTOMATICA) === 'true' } catch { return false }
}

export function setAperturaAutomaticaCajon(habilitada: boolean): void {
  try { localStorage.setItem(CLAVE_APERTURA_AUTOMATICA, String(habilitada)) } catch {}
}

interface DatosPuertoImpresora {
  usbVendorId?: number
  usbProductId?: number
}

export function leerPuertoImpresoraConfigurado(): DatosPuertoImpresora | null {
  try {
    const raw = localStorage.getItem(CLAVE_PUERTO_IMPRESORA)
    return raw ? JSON.parse(raw) as DatosPuertoImpresora : null
  } catch {
    return null
  }
}

/** Solicita permiso desde Ajustes y persiste únicamente el identificador USB del dispositivo. */
export async function configurarImpresoraSerial(): Promise<{ ok: boolean; mensaje: string }> {
  if (!isWebSerialSupported()) return { ok: false, mensaje: 'Web Serial no es compatible con este navegador.' }
  try {
    const port = await (navigator as any).serial.requestPort() as SerialPortLike
    const info = port.getInfo?.() ?? {}
    if (info.usbVendorId === undefined || info.usbProductId === undefined) {
      return { ok: false, mensaje: 'El navegador no expone un identificador USB para este puerto; no se puede seleccionarlo de forma segura.' }
    }
    localStorage.setItem(CLAVE_PUERTO_IMPRESORA, JSON.stringify(info))
    window.dispatchEvent(new Event('kioskopos-impresora-configurada'))
    return { ok: true, mensaje: 'Impresora autorizada para este puesto.' }
  } catch (error) {
    const err = error as Error
    return { ok: false, mensaje: err.name === 'NotFoundError' ? 'Selección cancelada.' : err.message || 'No se pudo configurar la impresora.' }
  }
}

/** Envía una prueba inocua para comprobar conexión y papel, sin abrir el cajón. */
export async function probarImpresoraSerial(baudRate = 9600): Promise<{ ok: boolean; mensaje: string }> {
  if (!isWebSerialSupported()) return { ok: false, mensaje: 'Web Serial no es compatible con este navegador.' }
  try {
    const port = await obtenerPuertoSerial()
    await asegurarPuertoAbierto(port, baudRate)
    const writer = port.writable.getWriter()
    try { await writer.write(new TextEncoder().encode('\x1b@\nKioskoPOS - prueba de impresora\n\n')) }
    finally { try { writer.releaseLock() } catch {}; try { await port.close() } catch {} }
    return { ok: true, mensaje: 'Prueba enviada. Verificá que haya salido el papel.' }
  } catch (error) {
    return { ok: false, mensaje: (error as Error).message || 'No se pudo probar la impresora.' }
  }
}

async function asegurarPuertoAbierto(port: SerialPortLike, baudRate: number): Promise<void> {
  try {
    await port.open({ baudRate })
  } catch (err: any) {
    if (err.name === 'InvalidStateError' || (err.message && err.message.toLowerCase().includes('already open'))) {
      // El puerto ya se encuentra abierto por una operación previa
      return
    }
    throw err
  }
}

/**
 * Envía directamente un ticket a la impresora térmica vía Web Serial
 */
export async function imprimirTicketEscPosDirecto(
  ticket: TicketData,
  anchoPapel: '58mm' | '80mm' = '58mm',
  baudRate = 9600
): Promise<{ ok: boolean; mensaje: string }> {
  if (!isWebSerialSupported()) {
    return {
      ok: false,
      mensaje: 'Web Serial no es compatible con este navegador. Usá Chrome, Edge u Opera en PC.',
    }
  }

  try {
    const port = await obtenerPuertoSerial()
    await asegurarPuertoAbierto(port, baudRate)

    const writer = port.writable.getWriter()
    try {
      const buffer = construirBufferEscPos(ticket, anchoPapel)
      await writer.write(buffer)
    } finally {
      try { writer.releaseLock() } catch {}
      try { await port.close() } catch {}
    }

    return { ok: true, mensaje: 'Ticket impreso correctamente por conexión térmica directa.' }
  } catch (err: unknown) {
    const errObj = err as Error
    if (errObj.name === 'NotFoundError') {
      return { ok: false, mensaje: 'Selección de puerto cancelada por el usuario.' }
    }
    return {
      ok: false,
      mensaje: `Error al comunicar con la impresora: ${errObj.message || 'Desconocido'}`,
    }
  }
}

/**
 * Construye el buffer binario Uint8Array con las instrucciones ESC/POS del cierre de caja (Arqueo Z / X)
 */
export function construirBufferCierreCajaEscPos(
  datos: DatosCierreCaja,
  anchoPapel: '58mm' | '80mm' = '58mm'
): Uint8Array {
  const anchoCols = anchoPapel === '80mm' ? 42 : 32
  const encoder = new TextEncoder()
  const bytes: number[] = []

  const appendBytes = (arr: number[]) => {
    bytes.push(...arr)
  }

  const appendTexto = (str: string, newline = true) => {
    const raw = encoder.encode(normalizarTexto(str) + (newline ? '\n' : ''))
    for (let i = 0; i < raw.length; i++) {
      bytes.push(raw[i])
    }
  }

  const separador = '-'.repeat(anchoCols)

  // 1. Inicializar impresora
  appendBytes(CMD_INIT)

  // 2. Encabezado de comercio (Centrado)
  appendBytes(CMD_ALIGN_CENTER)
  appendBytes(CMD_DOUBLE_SIZE)
  appendBytes(CMD_BOLD_ON)
  appendTexto(datos.kioscoNombre || 'KIOSKO')
  appendBytes(CMD_NORMAL_SIZE)
  appendBytes(CMD_BOLD_OFF)

  if (datos.kioscoDireccion) {
    appendTexto(datos.kioscoDireccion)
  }
  if (datos.kioscoTelefono) {
    appendTexto(`Tel: ${datos.kioscoTelefono}`)
  }

  appendBytes(CMD_BOLD_ON)
  appendTexto(datos.esParcial ? '*** ARQUEO PARCIAL (X) ***' : '*** CIERRE DE CAJA (ARQUEO Z) ***')
  appendBytes(CMD_BOLD_OFF)

  // 3. Fechas y cajero
  appendBytes(CMD_ALIGN_LEFT)
  appendTexto(`Apertura: ${formatFecha(datos.fechaApertura)}`)
  appendTexto(`Cierre:   ${formatFecha(datos.fechaCierre)}`)
  if (datos.cajeroNombre) {
    appendTexto(`Cajero:   ${datos.cajeroNombre}`)
  }

  appendTexto(separador)

  // 4. Fondo inicial
  appendBytes(CMD_BOLD_ON)
  appendTexto(formatearLineaDosColumnas('Fondo Inicial:', formatPrecio(datos.montoInicial), anchoCols))
  appendBytes(CMD_BOLD_OFF)
  appendTexto(separador)

  // 5. Ventas por medio
  appendBytes(CMD_BOLD_ON)
  appendTexto('VENTAS POR MEDIO:')
  appendBytes(CMD_BOLD_OFF)
  if (!datos.ventasPorMedio || datos.ventasPorMedio.length === 0) {
    appendTexto('Sin ventas registradas')
  } else {
    for (const m of datos.ventasPorMedio) {
      const cant = m.cantidad ? ` (${m.cantidad})` : ''
      appendTexto(formatearLineaDosColumnas(`${m.medio}${cant}:`, formatPrecio(m.total), anchoCols))
    }
  }

  appendBytes(CMD_BOLD_ON)
  const cantVentas = datos.cantidadVentas ? ` (${datos.cantidadVentas})` : ''
  appendTexto(formatearLineaDosColumnas(`TOTAL VENTAS${cantVentas}:`, formatPrecio(datos.totalVentas), anchoCols))
  appendBytes(CMD_BOLD_OFF)

  // 6. Movimientos de caja (ingresos/egresos extra)
  if (datos.ingresosExtra > 0 || datos.egresosExtra > 0) {
    appendTexto(separador)
    appendBytes(CMD_BOLD_ON)
    appendTexto('MOVIMIENTOS DE CAJA:')
    appendBytes(CMD_BOLD_OFF)
    if (datos.ingresosExtra > 0) {
      appendTexto(formatearLineaDosColumnas('(+) Ingresos Extra:', `+${formatPrecio(datos.ingresosExtra)}`, anchoCols))
    }
    if (datos.egresosExtra > 0) {
      appendTexto(formatearLineaDosColumnas('(-) Retiros/Gastos:', `-${formatPrecio(datos.egresosExtra)}`, anchoCols))
    }
  }

  appendTexto(separador)

  // 7. Balance de arqueo
  appendBytes(CMD_BOLD_ON)
  appendTexto('ARQUEO DE EFECTIVO:')
  appendBytes(CMD_BOLD_OFF)
  appendTexto(formatearLineaDosColumnas('Esperado en caja:', formatPrecio(datos.efectivoEsperado), anchoCols))
  appendTexto(formatearLineaDosColumnas('Contado en mano:', formatPrecio(datos.efectivoContado), anchoCols))

  appendBytes(CMD_BOLD_ON)
  const dif = datos.diferencia
  const difLabel = dif === 0 ? '$0 (Exacto)' : dif > 0 ? `+${formatPrecio(dif)} (Sobrante)` : `${formatPrecio(dif)} (Faltante)`
  appendTexto(formatearLineaDosColumnas('Diferencia:', difLabel, anchoCols))
  appendBytes(CMD_BOLD_OFF)

  // 8. Espacio para firmas
  appendTexto('')
  appendTexto('')
  appendBytes(CMD_ALIGN_CENTER)
  const firmaLinea = '-'.repeat(Math.min(24, anchoCols - 4))
  appendTexto(firmaLinea)
  appendTexto('Firma Cajero / Turno')
  appendTexto('')
  appendTexto(firmaLinea)
  appendTexto('Firma Encargado / Dueño')
  appendTexto('')

  // 9. Código de barras de arqueo
  if (datos.sesionId) {
    const barcodeCierre = `${datos.esParcial ? 'X' : 'Z'}-${datos.sesionId.slice(0, 8).toUpperCase()}`
    appendBytes(generarComandoBarcodeEscPos(barcodeCierre))
    appendTexto('')
  }

  // 10. Corte de papel
  appendBytes(CMD_FEED_AND_CUT)

  return new Uint8Array(bytes)
}

/**
 * Envía directamente un ticket de cierre de caja (Arqueo) a la impresora térmica vía Web Serial
 */
export async function imprimirCierreCajaEscPosDirecto(
  datos: DatosCierreCaja,
  anchoPapel: '58mm' | '80mm' = '58mm',
  baudRate = 9600
): Promise<{ ok: boolean; mensaje: string }> {
  if (!isWebSerialSupported()) {
    return {
      ok: false,
      mensaje: 'Web Serial no es compatible con este navegador. Usá Chrome, Edge u Opera en PC.',
    }
  }

  try {
    const port = await obtenerPuertoSerial()
    await asegurarPuertoAbierto(port, baudRate)

    const writer = port.writable.getWriter()
    try {
      const buffer = construirBufferCierreCajaEscPos(datos, anchoPapel)
      await writer.write(buffer)
    } finally {
      try { writer.releaseLock() } catch {}
      try { await port.close() } catch {}
    }

    return { ok: true, mensaje: 'Ticket de cierre impreso correctamente por conexión térmica directa.' }
  } catch (err: unknown) {
    const errObj = err as Error
    if (errObj.name === 'NotFoundError') {
      return { ok: false, mensaje: 'Selección de puerto cancelada por el usuario.' }
    }
    return {
      ok: false,
      mensaje: `Error al comunicar con la impresora: ${errObj.message || 'Desconocido'}`,
    }
  }
}

/**
 * Envía pulso para abrir el cajón de dinero conectado a la impresora
 */
export async function abrirCajonDineroDirecto(baudRate = 9600): Promise<{ ok: boolean; mensaje: string }> {
  if (!isWebSerialSupported()) {
    return {
      ok: false,
      mensaje: 'Web Serial no está disponible.',
    }
  }

  try {
    const port = await obtenerPuertoSerial()
    await asegurarPuertoAbierto(port, baudRate)

    const writer = port.writable.getWriter()
    try {
      await writer.write(new Uint8Array(CMD_KICK_DRAWER))
    } finally {
      try { writer.releaseLock() } catch {}
      try { await port.close() } catch {}
    }

    return { ok: true, mensaje: 'Cajón de dinero abierto.' }
  } catch (err: unknown) {
    return { ok: false, mensaje: `No se pudo abrir el cajón: ${(err as Error).message}` }
  }
}

// Interfaz mínima para Web Serial API
interface SerialPortLike {
  getInfo?: () => { usbVendorId?: number; usbProductId?: number }
  open: (options: { baudRate: number }) => Promise<void>
  close: () => Promise<void>
  writable: {
    getWriter: () => {
      write: (data: Uint8Array) => Promise<void>
      releaseLock: () => void
    }
  }
}
