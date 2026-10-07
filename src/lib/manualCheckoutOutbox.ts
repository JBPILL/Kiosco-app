import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { EntradaCheckoutManual, ResultadoCheckoutManual } from '../types/checkoutManual'
import { firmaManual, leerEntradaCheckoutManual } from '../../supabase/functions/_shared/manualCheckoutRequest'
import { validarResultadoCheckout } from './manualCheckoutResult'
import type { TicketData } from '../components/pos/TicketReceiptModal'

export interface SolicitudCancelacionManual {
  motivo: string
  resolucion: 'NO_COBRADO' | 'REINTEGRADO'
  referencia: string | null
}
export interface ConfirmacionCancelacionManual {
  estado: 'CANCELADO'
  checkout_id: string
  kiosco_id: string
  resolucion: 'NO_COBRADO' | 'REINTEGRADO'
  cancelado_en: string
}

export interface CobroManualLocal {
  id: string
  kioscoId: string
  usuarioId: string
  ticketClave: string
  entrada: EntradaCheckoutManual
  estado: 'PENDIENTE' | 'CONFIRMADO' | 'CANCELADO'
  cancelacion?: SolicitudCancelacionManual
  cancelacionConfirmada?: ConfirmacionCancelacionManual
  resultado: ResultadoCheckoutManual | null
  ultimoError: string | null
  recibo?: TicketData
  presentado?: boolean
  visibilidad?: 'PENDIENTE' | 'RECUPERAR' | 'ARCHIVADO'
}

export class ManualCheckoutOutbox extends Dexie {
  cobros!: Table<CobroManualLocal, string>
  constructor(nombre = 'KioskoPOSCobrosManuales') {
    super(nombre)
    this.version(1).stores({ cobros: 'id,&[kioscoId+usuarioId+ticketClave],[kioscoId+usuarioId],estado' })
    this.version(2).stores({ cobros: 'id,&[kioscoId+usuarioId+ticketClave],[kioscoId+usuarioId],estado,[kioscoId+usuarioId+visibilidad]' })
      .upgrade(tx => tx.table('cobros').toCollection().modify((c: CobroManualLocal) => {
        c.visibilidad = c.estado === 'PENDIENTE' ? 'PENDIENTE' : c.presentado ? 'ARCHIVADO' : 'RECUPERAR'
      }))
  }

  async guardar(entradaSinValidar: EntradaCheckoutManual, ticketClave: string, recibo?: TicketData): Promise<CobroManualLocal> {
    const entrada = leerEntradaCheckoutManual(entradaSinValidar)
    if (!ticketClave.trim() || ticketClave.length > 160) throw new Error('Identidad del ticket inválida')
    return this.transaction('rw', this.cobros, async () => {
      const anterior = await this.cobros.get(entrada.checkoutId)
      if (anterior) {
        if (anterior.estado === 'CANCELADO') throw new Error('El cobro original fue cancelado')
        if (anterior.ticketClave !== ticketClave || firmaManual(anterior.entrada) !== firmaManual(entrada)) {
          throw new Error('El cobro guardado no coincide; conservá la solicitud original')
        }
        return anterior
      }
      const porTicket = await this.cobros.where('[kioscoId+usuarioId+ticketClave]')
        .equals([entrada.kioscoId, entrada.usuarioId, ticketClave]).first()
      if (porTicket) throw new Error('Este ticket ya tiene un cobro guardado; recuperá su identificador original')
      const cobro: CobroManualLocal = { id: entrada.checkoutId, kioscoId: entrada.kioscoId, usuarioId: entrada.usuarioId,
        ticketClave, entrada, estado: 'PENDIENTE', visibilidad: 'PENDIENTE', resultado: null, ultimoError: null }
      if (recibo) {
        if (recibo.ventaId !== entrada.checkoutId || recibo.total !== entrada.totalEsperado || recibo.fecha !== entrada.fechaHora) {
          throw new Error('El comprobante no corresponde al cobro original')
        }
        cobro.recibo = proyectarRecibo(recibo)
        cobro.presentado = false
      }
      await this.cobros.add(cobro)
      return cobro
    })
  }

  async pendientes(kioscoId: string, usuarioId: string): Promise<CobroManualLocal[]> {
    return (await this.cobros.where('[kioscoId+usuarioId+visibilidad]').equals([kioscoId, usuarioId, 'PENDIENTE']).toArray())
      .filter(c => c.estado === 'PENDIENTE')
  }

  async visibles(kioscoId: string, usuarioId: string, revisarComercio = false): Promise<CobroManualLocal[]> {
    const propios = await this.cobros.where('[kioscoId+usuarioId+visibilidad]')
      .anyOf([[kioscoId, usuarioId, 'PENDIENTE'], [kioscoId, usuarioId, 'RECUPERAR']]).toArray()
    if (!revisarComercio) return propios
    const ajenos = (await this.cobros.where('estado').equals('PENDIENTE').toArray())
      .filter(c => c.kioscoId === kioscoId && c.usuarioId !== usuarioId)
    return [...propios, ...ajenos]
  }

  async recuperarTicket(kioscoId: string, usuarioId: string, ticketClave: string): Promise<CobroManualLocal | undefined> {
    return this.cobros.where('[kioscoId+usuarioId+ticketClave]').equals([kioscoId, usuarioId, ticketClave]).first()
  }

  async confirmar(id: string, respuesta: unknown): Promise<ResultadoCheckoutManual> {
    return this.transaction('rw', this.cobros, async () => {
      const actual = await this.cobros.get(id)
      if (!actual) throw new Error('No se encontró la solicitud original')
      if (actual.estado === 'CANCELADO') throw new Error('El cobro original fue cancelado')
      const resultado = validarResultadoCheckout(respuesta, leerEntradaCheckoutManual(actual.entrada))
      if (actual.estado === 'CONFIRMADO') {
        if (!actual.resultado || firmaManual(actual.resultado) !== firmaManual(resultado)) throw new Error('Confirmación contradictoria')
        return actual.resultado
      }
      await this.cobros.put({ ...actual, estado: 'CONFIRMADO', resultado, ultimoError: null,
        visibilidad: actual.presentado ? 'ARCHIVADO' : 'RECUPERAR' })
      return resultado
    })
  }

  async solicitarCancelacion(id: string, solicitud: SolicitudCancelacionManual): Promise<CobroManualLocal> {
    const cancelacion: SolicitudCancelacionManual = { motivo: solicitud.motivo.trim(), resolucion: solicitud.resolucion,
      referencia: solicitud.referencia?.trim() || null }
    if (cancelacion.motivo.length < 5 || cancelacion.motivo.length > 1000
      || !['NO_COBRADO', 'REINTEGRADO'].includes(cancelacion.resolucion)
      || (cancelacion.referencia?.length || 0) > 500
      || (cancelacion.resolucion === 'REINTEGRADO' && (cancelacion.referencia?.length || 0) < 5)) {
      throw new Error('Indicar motivo y referencia del reintegro cuando corresponda')
    }
    return this.transaction('rw', this.cobros, async () => {
      const actual = await this.cobros.get(id)
      if (!actual) throw new Error('No se encontró la solicitud original')
      if (actual.estado === 'CONFIRMADO') throw new Error('Revisá la venta confirmada en Reportes')
      if (actual.cancelacion && firmaManual(actual.cancelacion) !== firmaManual(cancelacion)) {
        throw new Error('Conservá la solicitud original de cancelación')
      }
      const siguiente = { ...actual, cancelacion }
      await this.cobros.put(siguiente)
      return siguiente
    })
  }

  async confirmarCancelacion(id: string, respuesta: unknown): Promise<ConfirmacionCancelacionManual> {
    return this.transaction('rw', this.cobros, async () => {
      const actual = await this.cobros.get(id)
      if (!actual?.cancelacion) throw new Error('No se encontró la solicitud original de cancelación')
      if (actual.estado === 'CONFIRMADO') throw new Error('Revisá la venta confirmada en Reportes')
      if (!respuesta || typeof respuesta !== 'object' || Array.isArray(respuesta)) throw new Error('Cancelación no confirmada')
      const datos = respuesta as Record<string, unknown>
      if (datos.estado !== 'CANCELADO' || datos.checkout_id !== id || datos.kiosco_id !== actual.kioscoId
        || datos.resolucion !== actual.cancelacion.resolucion || typeof datos.cancelado_en !== 'string'
        || !Number.isFinite(Date.parse(datos.cancelado_en))) throw new Error('Confirmación de cancelación inválida')
      const confirmacion: ConfirmacionCancelacionManual = { estado: 'CANCELADO', checkout_id: id,
        kiosco_id: actual.kioscoId, resolucion: actual.cancelacion.resolucion, cancelado_en: datos.cancelado_en }
      if (actual.cancelacionConfirmada && firmaManual(actual.cancelacionConfirmada) !== firmaManual(confirmacion)) {
        throw new Error('Confirmación de cancelación contradictoria')
      }
      await this.cobros.put({ ...actual, estado: 'CANCELADO', visibilidad: 'ARCHIVADO',
        cancelacionConfirmada: confirmacion, ultimoError: null })
      return confirmacion
    })
  }

  async registrarFallo(id: string): Promise<void> {
    await this.transaction('rw', this.cobros, async () => {
      const actual = await this.cobros.get(id)
      if (actual?.estado === 'PENDIENTE') await this.cobros.put({ ...actual,
        ultimoError: 'Cierre pendiente de confirmación. Reintentá la solicitud original; no vuelvas a cobrar.' })
    })
  }

  async reclamarPresentacion(id: string, permitirPendiente = false): Promise<TicketData | null> {
    return this.transaction('rw', this.cobros, async () => {
      const actual = await this.cobros.get(id)
      if (!actual?.recibo) throw new Error('No se encontró el comprobante original')
      if (actual.estado === 'CANCELADO' || (actual.cancelacion && actual.estado !== 'CONFIRMADO')) throw new Error('El cobro tiene una cancelación; no emitir comprobante')
      if (actual.estado !== 'CONFIRMADO' && !permitirPendiente) throw new Error('El cierre sigue pendiente')
      if (actual.presentado) return null
      await this.cobros.put({ ...actual, presentado: true,
        visibilidad: actual.estado === 'CONFIRMADO' ? 'ARCHIVADO' : 'PENDIENTE' })
      return actual.estado === 'CONFIRMADO' ? actual.recibo : { ...actual.recibo,
        notas: `${actual.recibo.notas || ''} [GUARDADO OFFLINE] [PENDIENTE DE CONFIRMACIÓN]`.trim() }
    })
  }
}

function proyectarRecibo(recibo: TicketData): TicketData {
  return { ventaId: recibo.ventaId, fecha: recibo.fecha, total: recibo.total, subtotal: recibo.subtotal,
    medioPago: recibo.medioPago, pagos: recibo.pagos?.map(p => ({ medioPago: p.medioPago, monto: p.monto })),
    items: recibo.items.map(i => ({ descripcion: i.descripcion, cantidad: i.cantidad, precioUnitario: i.precioUnitario,
      subtotal: i.subtotal, descuentoPromo: i.descuentoPromo, promoNombre: i.promoNombre })),
    ajuste: recibo.ajuste ? { descripcion: recibo.ajuste.descripcion, monto: recibo.ajuste.monto, esDescuento: recibo.ajuste.esDescuento } : null,
    pagaCon: recibo.pagaCon, vuelto: recibo.vuelto, kioscoNombre: recibo.kioscoNombre,
    kioscoDireccion: recibo.kioscoDireccion, kioscoTelefono: recibo.kioscoTelefono, cajeroNombre: recibo.cajeroNombre,
    clienteNombre: recibo.clienteNombre, clienteTelefono: recibo.clienteTelefono, notas: recibo.notas }
}

export interface EnvioCheckoutManual {
  outbox: ManualCheckoutOutbox
  enviar: (entrada: EntradaCheckoutManual) => Promise<unknown>
}

/** El guardado durable precede a toda llamada de red y a todo comprobante. */
export async function procesarCheckoutManual(entrada: EntradaCheckoutManual, ticketClave: string,
  deps: EnvioCheckoutManual): Promise<ResultadoCheckoutManual> {
  const cobro = await deps.outbox.guardar(entrada, ticketClave)
  if (cobro.cancelacion && cobro.estado !== 'CONFIRMADO') throw new Error('El cobro tiene una cancelación pendiente; no reintentar la venta')
  if (cobro.estado === 'CONFIRMADO' && cobro.resultado) return validarResultadoCheckout(cobro.resultado, cobro.entrada)
  try {
    return await deps.outbox.confirmar(cobro.id, await deps.enviar(cobro.entrada))
  } catch (error) {
    await deps.outbox.registrarFallo(cobro.id)
    throw error
  }
}
