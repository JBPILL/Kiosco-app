import type { RegistroInicioPoint } from './pointCheckoutStart.ts'
import { leerSolicitudCotizacionPoint } from './pointQuoteRequest.ts'
import { dividirPagoPoint } from './pointPaymentSplit.ts'

function objeto(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Snapshot Point inválido')
  return value as Record<string, unknown>
}
function texto(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Identidad Point inválida')
  return value
}
function entero(value: unknown): number {
  const numero = typeof value === 'number' ? value
    : typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : NaN
  if (!Number.isSafeInteger(numero)) throw new Error('Importe Point inválido')
  return numero
}

export function leerRegistroInicioPoint(value: unknown): RegistroInicioPoint {
  const row = objeto(value)
  const snapshot = objeto(row.solicitud)
  if (snapshot.version !== 2) throw new Error('Versión de snapshot Point no soportada')
  if (typeof snapshot.sesionCajaId !== 'string'
    || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(snapshot.sesionCajaId)) throw new Error('Caja del snapshot Point inválida')
  const entrada = leerSolicitudCotizacionPoint(snapshot.entrada)
  const cotizacion = objeto(snapshot.cotizacion)
  const ticket = objeto(cotizacion.ticket)
  const cobro = objeto(cotizacion.cobro)
  const total = entero(ticket.total)
  const montoCentavos = entero(ticket.montoCentavos)
  const montoPoint = entero(row.monto_centavos)
  if (total <= 0 || total * 100 !== montoCentavos || montoPoint <= 0
    || row.id !== entrada.intentoId || row.checkout_id !== entrada.checkoutId
    || (row.modo !== 'sandbox' && row.modo !== 'production')
    || typeof row.application_id !== 'string' || !/^\d{1,100}$/.test(row.application_id)
    || typeof row.account_id !== 'string' || !/^\d{1,100}$/.test(row.account_id)
    || !Array.isArray(ticket.items) || ticket.items.length !== entrada.lineas.length) {
    throw new Error('Snapshot Point inconsistente')
  }
  const estados = ['PREPARADO','PENDIENTE','CONCILIAR','CANCELACION_SOLICITADA',
    'PAGO_CONFIRMADO','VENTA_CONFIRMADA','CANCELADO','RECHAZADO']
  if (typeof row.estado !== 'string' || !estados.includes(row.estado)) throw new Error('Estado Point inválido')
  if (row.order_id !== null && (typeof row.order_id !== 'string' || !/^ORD[A-Za-z0-9]{1,100}$/.test(row.order_id))) {
    throw new Error('Orden Point inválida')
  }
  ticket.items.forEach((value, index) => {
    const item = objeto(value)
    const producto = objeto(item.producto)
    const linea = entrada.lineas[index]
    if (producto.id !== (linea.tipo === 'PRODUCTO' ? linea.productoId : linea.id)
      || producto.kiosco_id !== row.kiosco_id || item.cantidad !== linea.cantidad
      || typeof producto.descripcion !== 'string' || typeof item.subtotal !== 'number' || !Number.isFinite(item.subtotal)) {
      throw new Error('Línea Point inconsistente')
    }
  })
  const division = dividirPagoPoint(montoCentavos, entrada.pagos, entrada.clienteId)
  if (!Array.isArray(ticket.consumoStock)) throw new Error('Plan de stock Point ausente')
  const productosFisicos = new Set<string>()
  const consumoStock = ticket.consumoStock.map((value) => {
    const consumo = objeto(value)
    const productoId = texto(consumo.productoId)
    const cantidad = consumo.cantidad
    if (productosFisicos.has(productoId) || typeof cantidad !== 'number' || !Number.isFinite(cantidad)
      || cantidad <= 0 || !Number.isSafeInteger(Math.round(cantidad * 1000))
      || Math.abs(cantidad * 1000 - Math.round(cantidad * 1000)) > 0.000001) {
      throw new Error('Plan de stock Point inválido')
    }
    productosFisicos.add(productoId)
    return { productoId, cantidad }
  })
  if (division.montoPointCentavos !== montoPoint || cobro.montoPointCentavos !== montoPoint
    || division.montoCuentaCorrienteCentavos !== cobro.montoCuentaCorrienteCentavos) {
    throw new Error('División de pagos Point inconsistente')
  }
  entero(ticket.subtotal)
  entero(ticket.ajuste)
  return { entrada, usuarioId: texto(snapshot.usuarioId), sesionCajaId: snapshot.sesionCajaId,
    cotizacion: { ticket: { ...ticket as unknown as RegistroInicioPoint['cotizacion']['ticket'], consumoStock }, cobro: division },
    intento: { id: texto(row.id), kioscoId: texto(row.kiosco_id), applicationId: row.application_id,
      accountId: row.account_id, modo: row.modo, terminalId: texto(row.terminal_id),
      montoCentavos: montoPoint, estado: row.estado, orderId: row.order_id as string | null } }
}
