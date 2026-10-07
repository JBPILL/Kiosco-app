import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { EntradaCheckoutManual, ResultadoCheckoutManual } from '../types/checkoutManual'
import { firmaManual, leerEntradaCheckoutManual } from '../../supabase/functions/_shared/manualCheckoutRequest'
import { validarResultadoCheckout } from './manualCheckoutResult'

export interface CobroManualLocal {
  id: string
  kioscoId: string
  usuarioId: string
  ticketClave: string
  entrada: EntradaCheckoutManual
  estado: 'PENDIENTE' | 'CONFIRMADO'
  resultado: ResultadoCheckoutManual | null
  ultimoError: string | null
}

export class ManualCheckoutOutbox extends Dexie {
  cobros!: Table<CobroManualLocal, string>
  constructor(nombre = 'KioskoPOSCobrosManuales') {
    super(nombre)
    this.version(1).stores({ cobros: 'id,&[kioscoId+usuarioId+ticketClave],[kioscoId+usuarioId],estado' })
  }

  async guardar(entradaSinValidar: EntradaCheckoutManual, ticketClave: string): Promise<CobroManualLocal> {
    const entrada = leerEntradaCheckoutManual(entradaSinValidar)
    if (!ticketClave.trim() || ticketClave.length > 160) throw new Error('Identidad del ticket inválida')
    return this.transaction('rw', this.cobros, async () => {
      const anterior = await this.cobros.get(entrada.checkoutId)
      if (anterior) {
        if (anterior.ticketClave !== ticketClave || firmaManual(anterior.entrada) !== firmaManual(entrada)) {
          throw new Error('El cobro guardado no coincide; conservá la solicitud original')
        }
        return anterior
      }
      const porTicket = await this.cobros.where('[kioscoId+usuarioId+ticketClave]')
        .equals([entrada.kioscoId, entrada.usuarioId, ticketClave]).first()
      if (porTicket) throw new Error('Este ticket ya tiene un cobro guardado; recuperá su identificador original')
      const cobro: CobroManualLocal = { id: entrada.checkoutId, kioscoId: entrada.kioscoId, usuarioId: entrada.usuarioId,
        ticketClave, entrada, estado: 'PENDIENTE', resultado: null, ultimoError: null }
      await this.cobros.add(cobro)
      return cobro
    })
  }

  async pendientes(kioscoId: string, usuarioId: string): Promise<CobroManualLocal[]> {
    return (await this.cobros.where('[kioscoId+usuarioId]').equals([kioscoId, usuarioId]).toArray())
      .filter(c => c.estado === 'PENDIENTE')
  }

  async recuperarTicket(kioscoId: string, usuarioId: string, ticketClave: string): Promise<CobroManualLocal | undefined> {
    return this.cobros.where('[kioscoId+usuarioId+ticketClave]').equals([kioscoId, usuarioId, ticketClave]).first()
  }

  async confirmar(id: string, respuesta: unknown): Promise<ResultadoCheckoutManual> {
    return this.transaction('rw', this.cobros, async () => {
      const actual = await this.cobros.get(id)
      if (!actual) throw new Error('No se encontró la solicitud original')
      const resultado = validarResultadoCheckout(respuesta, leerEntradaCheckoutManual(actual.entrada))
      if (actual.estado === 'CONFIRMADO') {
        if (!actual.resultado || firmaManual(actual.resultado) !== firmaManual(resultado)) throw new Error('Confirmación contradictoria')
        return actual.resultado
      }
      await this.cobros.put({ ...actual, estado: 'CONFIRMADO', resultado, ultimoError: null })
      return resultado
    })
  }

  async registrarFallo(id: string): Promise<void> {
    await this.transaction('rw', this.cobros, async () => {
      const actual = await this.cobros.get(id)
      if (actual?.estado === 'PENDIENTE') await this.cobros.put({ ...actual,
        ultimoError: 'Cierre pendiente de confirmación. Reintentá la solicitud original; no vuelvas a cobrar.' })
    })
  }
}

export interface EnvioCheckoutManual {
  outbox: ManualCheckoutOutbox
  enviar: (entrada: EntradaCheckoutManual) => Promise<unknown>
}

/** El guardado durable precede a toda llamada de red y a todo comprobante. */
export async function procesarCheckoutManual(entrada: EntradaCheckoutManual, ticketClave: string,
  deps: EnvioCheckoutManual): Promise<ResultadoCheckoutManual> {
  const cobro = await deps.outbox.guardar(entrada, ticketClave)
  if (cobro.estado === 'CONFIRMADO' && cobro.resultado) return validarResultadoCheckout(cobro.resultado, cobro.entrada)
  try {
    return await deps.outbox.confirmar(cobro.id, await deps.enviar(cobro.entrada))
  } catch (error) {
    await deps.outbox.registrarFallo(cobro.id)
    throw error
  }
}
