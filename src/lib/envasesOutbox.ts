import { DurablePilotOperationOutbox, procesarOperacionPiloto, type OperacionPilotoLocal, type EnviarOperacionPiloto } from './durablePilotOperationOutbox'
import { parsearSolicitudEnvase, type SolicitudEnvase } from '../../supabase/functions/_shared/envasesRequest'

export interface ResultadoEnvase {
  id: string
  kiosco_id: string
  tipo_id: string
  stock_vacios: number
  importe?: number
  precio?: number
}
export type OperacionEnvaseLocal = OperacionPilotoLocal<SolicitudEnvase, ResultadoEnvase>
export class EnvasesOutbox extends DurablePilotOperationOutbox<SolicitudEnvase, ResultadoEnvase> {
  constructor(nombre = 'KioskoPOSEnvasesAtomicos') {
    super(nombre, parsearSolicitudEnvase, validarResultado, solicitud => solicitud.accion === 'RECIBIR_EFECTIVO')
  }
}
function validarResultado(valor: unknown, op: OperacionEnvaseLocal): ResultadoEnvase {
  if (!valor || typeof valor !== 'object') throw new Error('Confirmación de envases inválida')
  const r = valor as Record<string, unknown>
  if (r.id !== op.id || r.kiosco_id !== op.kioscoId || r.tipo_id !== op.solicitud.tipoId
    || typeof r.stock_vacios !== 'number' || !Number.isInteger(r.stock_vacios) || r.stock_vacios < 0 || r.stock_vacios > 999999999) throw new Error('Confirmación de envases inválida')
  const resultado: ResultadoEnvase = { id: op.id, kiosco_id: op.kioscoId, tipo_id: op.solicitud.tipoId, stock_vacios: r.stock_vacios }
  if (op.solicitud.accion === 'CONFIGURAR_TIPO') {
    if (!(typeof r.precio === 'number' || typeof r.precio === 'string' && /^\d+(\.\d{1,2})?$/.test(r.precio))
      || Number(r.precio) !== op.solicitud.datos.precio) throw new Error('Precio confirmado incompatible')
    resultado.precio = Number(r.precio)
  } else {
    const importe = typeof r.importe === 'string' ? /^\d+(\.\d{1,2})?$/.test(r.importe) ? Number(r.importe) : NaN : r.importe
    const esperado = op.solicitud.accion === 'RECIBIR_EFECTIVO'
      ? Math.round(op.solicitud.datos.cantidad * op.solicitud.datos.precioEsperado * 100) : 0
    if (typeof importe !== 'number' || !Number.isFinite(importe) || Math.round(importe * 100) !== esperado || Number(importe.toFixed(2)) !== importe) throw new Error('Importe confirmado incompatible')
    resultado.importe = importe
  }
  return resultado
}

export type EnviarOperacionEnvase = EnviarOperacionPiloto<SolicitudEnvase>
export async function procesarOperacionEnvase(outbox: EnvasesOutbox, kioscoId: string, usuarioId: string, valor: unknown, enviar: EnviarOperacionEnvase): Promise<ResultadoEnvase> {
  return procesarOperacionPiloto(outbox, kioscoId, usuarioId, valor, enviar)
}