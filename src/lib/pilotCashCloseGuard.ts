import Dexie from 'dexie'
import { EnvasesOutbox } from './envasesOutbox'
import { CashReturnOutbox } from './cashReturnOutbox'
import { devolucionesEfectivoActivas, envasesTransaccionalesActivos } from './pilotExpansion'

/** Local-device guard only. Hosted cash-session locking remains authoritative. */
export async function hayOperacionesPilotoPorResolver(kioscoId: string, sesionId: string): Promise<boolean> {
  if (typeof indexedDB === 'undefined') {
    if (devolucionesEfectivoActivas() || envasesTransaccionalesActivos()) throw new Error('No se pueden verificar los reintegros pendientes de este dispositivo.')
    return false
  }
  const [existeEnvases, existeDevoluciones] = await Promise.all([
    Dexie.exists('KioskoPOSEnvasesAtomicos'), Dexie.exists('KioskoPOSDevolucionesEfectivo'),
  ])
  if (existeEnvases) {
    const envases = new EnvasesOutbox()
    try {
      if (await envases.operaciones.filter(op => op.kioscoId === kioscoId && op.visibilidad === 'RECUPERAR'
        && op.solicitud.accion === 'RECIBIR_EFECTIVO' && op.solicitud.datos.sesionCajaId === sesionId).count()) return true
    } finally { envases.close() }
  }
  if (existeDevoluciones) {
    const devoluciones = new CashReturnOutbox()
    try {
      if (await devoluciones.operaciones.filter(op => op.kioscoId === kioscoId && op.visibilidad === 'RECUPERAR'
        && op.solicitud.sesionReintegroId === sesionId).count()) return true
    } finally { devoluciones.close() }
  }
  return false
}
