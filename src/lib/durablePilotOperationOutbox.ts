import Dexie, { type Table } from 'dexie'

export interface OperacionPilotoLocal<S, R> {
  id: string
  kioscoId: string
  usuarioId: string
  solicitud: S
  estado: 'PENDIENTE' | 'CONFIRMADO' | 'RECHAZADO'
  visibilidad: 'RECUPERAR' | 'ARCHIVADO'
  resultado: R | null
  ultimoError: string | null
}
export type EnviarOperacionPiloto<S> = (solicitud: S) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>

/** Shared durability for returnable containers and cash returns; no network/storage fallback. */
export class DurablePilotOperationOutbox<S extends { id: string }, R> extends Dexie {
  operaciones!: Table<OperacionPilotoLocal<S, R>, string>
  readonly parsear: (valor: unknown) => S
  readonly validarConfirmacion: (valor: unknown, op: OperacionPilotoLocal<S, R>) => R
  readonly requiereEntrega: (solicitud: S) => boolean
  constructor(nombre: string, parsear: (valor: unknown) => S,
    validarConfirmacion: (valor: unknown, op: OperacionPilotoLocal<S, R>) => R,
    requiereEntrega: (solicitud: S) => boolean) {
    super(nombre)
    this.parsear = parsear
    this.validarConfirmacion = validarConfirmacion
    this.requiereEntrega = requiereEntrega
    this.version(1).stores({ operaciones: 'id,[kioscoId+usuarioId],[kioscoId+usuarioId+estado],[kioscoId+usuarioId+visibilidad]' })
  }
  async guardar(kioscoId: string, usuarioId: string, valor: unknown): Promise<OperacionPilotoLocal<S, R>> {
    const kid = validarUuid(kioscoId), uid = validarUuid(usuarioId), solicitud = this.parsear(valor)
    return this.transaction('rw', this.operaciones, async () => {
      const anterior = await this.operaciones.get(solicitud.id)
      if (anterior) {
        if (anterior.kioscoId !== kid || anterior.usuarioId !== uid || JSON.stringify(anterior.solicitud) !== JSON.stringify(solicitud)) throw new Error('Conservá la identidad y solicitud original')
        return anterior
      }
      const pendiente = await this.operaciones.where('[kioscoId+usuarioId+visibilidad]').equals([kid, uid, 'RECUPERAR']).first()
      if (pendiente) throw new Error('Hay una operación pendiente de recuperar o de confirmar entrega; resolvela antes de iniciar otra')
      const op: OperacionPilotoLocal<S, R> = { id: solicitud.id, kioscoId: kid, usuarioId: uid, solicitud, estado: 'PENDIENTE', visibilidad: 'RECUPERAR', resultado: null, ultimoError: null }
      await this.operaciones.add(op)
      return op
    })
  }
  async pendientes(kioscoId: string, usuarioId: string): Promise<OperacionPilotoLocal<S, R>[]> {
    return this.operaciones.where('[kioscoId+usuarioId+estado]').equals([validarUuid(kioscoId), validarUuid(usuarioId), 'PENDIENTE']).toArray()
  }
  async recuperables(kioscoId: string, usuarioId: string): Promise<OperacionPilotoLocal<S, R>[]> {
    return this.operaciones.where('[kioscoId+usuarioId+visibilidad]').equals([validarUuid(kioscoId), validarUuid(usuarioId), 'RECUPERAR']).toArray()
  }
  /** Human acknowledgement only; never interpreted as a second payment request. */
  async confirmarEntregaLocal(id: string, kioscoId: string, usuarioId: string): Promise<void> {
    await this.transaction('rw', this.operaciones, async () => {
      const op = await this.operaciones.get(validarUuid(id))
      if (!op || op.kioscoId !== validarUuid(kioscoId) || op.usuarioId !== validarUuid(usuarioId)
        || op.estado !== 'CONFIRMADO' || !op.resultado || !this.requiereEntrega(op.solicitud)) throw new Error('La operación no tiene un reintegro confirmado de esta sesión')
      this.validarConfirmacion(op.resultado, op)
      await this.operaciones.update(op.id, fila => { fila.visibilidad = 'ARCHIVADO' })
    })
  }
}

export function validarUuid(valor: unknown): string {
  if (typeof valor !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)) throw new Error('Identificador de operación inválido')
  return valor.toLowerCase()
}

export async function procesarOperacionPiloto<S extends { id: string }, R>(outbox: DurablePilotOperationOutbox<S, R>, kioscoId: string, usuarioId: string, valor: unknown, enviar: EnviarOperacionPiloto<S>): Promise<R> {
  const op = await outbox.guardar(kioscoId, usuarioId, valor)
  if (op.estado === 'CONFIRMADO' && op.resultado) return outbox.validarConfirmacion(op.resultado, op)
  if (op.estado === 'RECHAZADO') throw new Error('La operación fue rechazada; revisá el motivo antes de iniciar otra')
  try {
    const respuesta = await enviar(op.solicitud)
    if (respuesta.error) {
      const codigo = respuesta.error.code || ''
      if (['22023', '42501', 'P0001', '22P02', '23503', '23514', '22003'].includes(codigo)) {
        await outbox.operaciones.update(op.id, fila => {
          fila.estado = 'RECHAZADO'; fila.visibilidad = 'ARCHIVADO'; fila.ultimoError = `Rechazo confirmado (${codigo})`
        })
      }
      throw new Error('No se confirmó la operación. Revisá los pendientes antes de volver a entregar efectivo.')
    }
    const resultado = outbox.validarConfirmacion(respuesta.data, op)
    const guardadas = await outbox.operaciones.update(op.id, fila => {
      fila.estado = 'CONFIRMADO'; fila.resultado = resultado
      fila.visibilidad = outbox.requiereEntrega(op.solicitud) ? 'RECUPERAR' : 'ARCHIVADO'; fila.ultimoError = null
    })
    if (guardadas !== 1) throw new Error('No se pudo conservar la confirmación de la operación')
    return resultado
  } catch (error) {
    await outbox.operaciones.update(op.id, fila => { fila.ultimoError = error instanceof Error ? error.message : 'Respuesta incierta' })
    throw error
  }
}
