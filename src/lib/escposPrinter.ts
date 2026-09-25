/**
 * Módulo de Impresión Térmica Directa ESC/POS para Kioscos y Puntos de Venta
 * Permite enviar comandos binarios ESC/POS directamente a impresoras térmicas USB/COM
 * (Epson, Hasar, Xprinter, 3nStar, etc.) mediante la API Web Serial sin pasar
 * por el diálogo nativo de impresión del navegador.
 */

import type { TicketData } from '../components/pos/TicketReceiptModal'
import type { DatosCierreCaja } from '../components/pos/TicketCierreCajaModal'
import { formatPrecio, formatFecha } from './utils'

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
  appendTexto(formatearLineaDosColumnas('CANT  PRODUCTO', 'SUBTOTAL', anchoCols))
  appendBytes(CMD_BOLD_OFF)
  appendTexto(separador)

  ticket.items.forEach((it) => {
    const cantStr = it.cantidad % 1 === 0 ? `${it.cantidad}x` : `${it.cantidad.toFixed(3)}kg`
    const subtotalStr = `$${Math.round(it.subtotal).toLocaleString('es-AR')}`
    
    // Si la descripción cabe en una sola línea con la cantidad y subtotal
    const descConCant = `${cantStr} ${it.descripcion}`
    if (descConCant.length + subtotalStr.length + 1 <= anchoCols) {
      appendTexto(formatearLineaDosColumnas(descConCant, subtotalStr, anchoCols))
    } else {
      // Línea 1: Descripción
      appendTexto(descConCant.slice(0, anchoCols))
      // Línea 2: Desglose y subtotal
      const detalle = `  $${Math.round(it.precioUnitario).toLocaleString('es-AR')} c/u`
      appendTexto(formatearLineaDosColumnas(detalle, subtotalStr, anchoCols))
    }

    if (it.promoNombre) {
      appendTexto(`  * ${it.promoNombre}`.slice(0, anchoCols))
    }
  })

  appendTexto(separador)

  // 4. Totales y Pagos
  appendBytes(CMD_ALIGN_RIGHT)
  if (ticket.ajuste) {
    appendTexto(formatearLineaDosColumnas('Subtotal:', `$${Math.round(ticket.subtotal).toLocaleString('es-AR')}`, anchoCols))
    const signo = ticket.ajuste.esDescuento ? '-' : '+'
    appendTexto(formatearLineaDosColumnas(`${ticket.ajuste.descripcion}:`, `${signo}$${Math.round(Math.abs(ticket.ajuste.monto)).toLocaleString('es-AR')}`, anchoCols))
  }

  appendBytes(CMD_BOLD_ON)
  appendBytes(CMD_DOUBLE_SIZE)
  appendTexto(formatearLineaDosColumnas('TOTAL:', `$${Math.round(ticket.total).toLocaleString('es-AR')}`, anchoCols))
  appendBytes(CMD_NORMAL_SIZE)
  appendBytes(CMD_BOLD_OFF)

  appendTexto(formatearLineaDosColumnas('Pago:', ticket.medioPago || 'Efectivo', anchoCols))

  if (ticket.pagaCon && ticket.pagaCon > 0) {
    appendTexto(formatearLineaDosColumnas('Abono:', `$${Math.round(ticket.pagaCon).toLocaleString('es-AR')}`, anchoCols))
    appendTexto(formatearLineaDosColumnas('Vuelto:', `$${Math.round(ticket.vuelto || 0).toLocaleString('es-AR')}`, anchoCols))
  }

  // 5. Datos fiscales AFIP / Puntos
  if (ticket.puntosFidelidad && ticket.puntosFidelidad.ganados > 0) {
    appendTexto(separador)
    appendBytes(CMD_ALIGN_CENTER)
    appendTexto(`Puntos ganados: +${ticket.puntosFidelidad.ganados} pts`)
    if (ticket.puntosFidelidad.saldoTotal !== undefined) {
      appendTexto(`Saldo acumulado: ${ticket.puntosFidelidad.saldoTotal} pts`)
    }
  }

  if (ticket.afip) {
    appendTexto(separador)
    appendBytes(CMD_ALIGN_CENTER)
    appendTexto(`CAE: ${ticket.afip.cae}`)
    appendTexto(`Vto. CAE: ${ticket.afip.vtoCae}`)
    appendTexto('Comprobante Autorizado por AFIP')
  }

  // 6. Pie de página
  appendTexto(separador)
  appendBytes(CMD_ALIGN_CENTER)
  if (ticket.notas) {
    appendTexto(ticket.notas)
  }
  appendTexto('¡Muchas gracias por su compra!')

  // 7. Corte de papel y fin
  appendBytes(CMD_FEED_AND_CUT)

  return new Uint8Array(bytes)
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
    const serial = (navigator as unknown as { serial: { requestPort: () => Promise<SerialPortLike> } }).serial
    const port = await serial.requestPort()
    await port.open({ baudRate })

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

  // 9. Corte de papel
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
    const serial = (navigator as unknown as { serial: { requestPort: () => Promise<SerialPortLike> } }).serial
    const port = await serial.requestPort()
    await port.open({ baudRate })

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
    const serial = (navigator as unknown as { serial: { requestPort: () => Promise<SerialPortLike> } }).serial
    const port = await serial.requestPort()
    await port.open({ baudRate })

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
  open: (options: { baudRate: number }) => Promise<void>
  close: () => Promise<void>
  writable: {
    getWriter: () => {
      write: (data: Uint8Array) => Promise<void>
      releaseLock: () => void
    }
  }
}
