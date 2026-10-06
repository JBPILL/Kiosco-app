import type { TipoAjuste } from '../../../src/lib/carritoImportes.ts'
import type { LineaCotizacionPoint } from './pointQuote.ts'
import type { MedioComplementarioPoint, PagoComplementarioPoint } from './pointPaymentSplit.ts'

export interface SolicitudCotizacionPoint {
  intentoId: string
  checkoutId: string
  clienteId: string | null
  lineas: LineaCotizacionPoint[]
  pagos: PagoComplementarioPoint[]
  tipoAjuste: TipoAjuste
  valorAjuste: number
}

function objeto(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Solicitud inválida')
  return value as Record<string, unknown>
}

function campos(value: Record<string, unknown>, permitidos: string[]): void {
  if (Object.keys(value).some((key) => !permitidos.includes(key))) throw new Error('Campo no permitido')
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Identificador inválido')
  }
  return value.toLowerCase()
}

function numero(value: unknown, maximo: number, permiteCero = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value > maximo
    || (permiteCero ? value < 0 : value <= 0)) throw new Error('Número inválido')
  return value
}

export function leerSolicitudCotizacionPoint(value: unknown): SolicitudCotizacionPoint {
  const body = objeto(value)
  campos(body, ['intentoId', 'checkoutId', 'clienteId', 'lineas', 'pagos', 'tipoAjuste', 'valorAjuste'])
  if (!Array.isArray(body.lineas) || body.lineas.length === 0 || body.lineas.length > 500
    || !Array.isArray(body.pagos) || body.pagos.length > 20) throw new Error('Ticket inválido')
  const ajustes: TipoAjuste[] = ['NINGUNO', 'DESCUENTO_PORCENTAJE', 'DESCUENTO_FIJO', 'RECARGO_PORCENTAJE', 'RECARGO_FIJO']
  const tipoAjuste = ajustes.find((tipo) => tipo === body.tipoAjuste)
  if (!tipoAjuste) throw new Error('Ajuste inválido')
  const lineas = body.lineas.map((value): LineaCotizacionPoint => {
    const linea = objeto(value)
    const id = uuid(linea.id)
    const cantidad = numero(linea.cantidad, 999999)
    if (linea.tipo === 'PRODUCTO') {
      campos(linea, ['tipo', 'id', 'productoId', 'cantidad', 'sinEnvase'])
      if (typeof linea.sinEnvase !== 'boolean') throw new Error('Envase inválido')
      return { tipo: 'PRODUCTO', id, cantidad, productoId: uuid(linea.productoId), sinEnvase: linea.sinEnvase }
    }
    if (linea.tipo === 'SERVICIO') {
      campos(linea, ['tipo', 'id', 'descripcion', 'precio', 'cantidad'])
      if (typeof linea.descripcion !== 'string' || !linea.descripcion.trim() || linea.descripcion.trim().length > 150) {
        throw new Error('Descripción inválida')
      }
      return { tipo: 'SERVICIO', id, cantidad, descripcion: linea.descripcion.trim(),
        precio: numero(linea.precio, Number.MAX_SAFE_INTEGER / 100, true) }
    }
    if (linea.tipo === 'DEVOLUCION_ENVASE') {
      campos(linea, ['tipo', 'id', 'envaseId', 'cantidad'])
      if (typeof linea.envaseId !== 'string' || !linea.envaseId.trim() || linea.envaseId.length > 150) {
        throw new Error('Envase inválido')
      }
      return { tipo: 'DEVOLUCION_ENVASE', id, cantidad, envaseId: linea.envaseId }
    }
    throw new Error('Tipo de línea inválido')
  })
  const medios: MedioComplementarioPoint[] = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'MERCADOPAGO', 'CUENTA_CORRIENTE']
  const pagos = body.pagos.map((value): PagoComplementarioPoint => {
    const pago = objeto(value)
    campos(pago, ['id', 'medio', 'montoCentavos'])
    const medio = medios.find((tipo) => tipo === pago.medio)
    const montoCentavos = numero(pago.montoCentavos, Number.MAX_SAFE_INTEGER)
    if (!medio || !Number.isSafeInteger(montoCentavos)) throw new Error('Pago inválido')
    return { id: uuid(pago.id), medio, montoCentavos }
  })
  return { intentoId: uuid(body.intentoId), checkoutId: uuid(body.checkoutId),
    clienteId: body.clienteId === null ? null : uuid(body.clienteId), lineas, pagos, tipoAjuste,
    valorAjuste: numero(body.valorAjuste, Number.MAX_SAFE_INTEGER / 100, true) }
}
