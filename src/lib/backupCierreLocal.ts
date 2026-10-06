import Dexie from 'dexie'
import type { MovimientoCaja, ResumenCaja, SesionCaja } from '../types/database'

export interface RespaldoCierreLocal {
  version: 1
  tipo: 'ARQUEO_CAJA'
  kioscoId: string
  sesionId: string
  fecha: string
  cierreConfirmadoRemoto: boolean
  sesion: Omit<SesionCaja, 'usuario'>
  resumen: Record<string, number> | null
  movimientos: Array<Omit<MovimientoCaja, 'usuario'>>
}

let base: Dexie | undefined
function tablaRespaldos(): Dexie.Table<RespaldoCierreLocal, [string, string]> {
  if (!base) {
    base = new Dexie('KioskoPOSRespaldosLocales')
    base.version(1).stores({ backups_locales_kiosco: '[kioscoId+sesionId],kioscoId,fecha' })
  }
  return base.table('backups_locales_kiosco')
}

/** Lista explícita: nunca copia relaciones de usuario, credenciales ni costos. */
export function crearRespaldoCierreLocal(
  sesion: SesionCaja, resumen: ResumenCaja | null, movimientos: readonly MovimientoCaja[],
  cierreConfirmadoRemoto: boolean,
): RespaldoCierreLocal {
  if (sesion.estado !== 'CERRADA' || !sesion.fecha_cierre) throw new Error('El arqueo no está cerrado')
  return {
    version: 1, tipo: 'ARQUEO_CAJA', kioscoId: sesion.kiosco_id, sesionId: sesion.id,
    fecha: sesion.fecha_cierre, cierreConfirmadoRemoto,
    sesion: {
      id: sesion.id, kiosco_id: sesion.kiosco_id, usuario_id: sesion.usuario_id,
      fecha_apertura: sesion.fecha_apertura, fecha_cierre: sesion.fecha_cierre,
      monto_inicial: sesion.monto_inicial, monto_final_declarado: sesion.monto_final_declarado,
      monto_final_sistema: sesion.monto_final_sistema, diferencia: sesion.diferencia, estado: 'CERRADA',
    },
    resumen: resumen ? {
      total_ventas: resumen.total_ventas, total_facturado: resumen.total_facturado,
      total_efectivo: resumen.total_efectivo, total_mercadopago: resumen.total_mercadopago,
      total_transferencia: resumen.total_transferencia, total_tarjeta: resumen.total_tarjeta,
      total_cuenta_corriente: resumen.total_cuenta_corriente ?? 0,
      total_ingresos_extra: resumen.total_ingresos_extra ?? 0, total_egresos: resumen.total_egresos ?? 0,
      efectivo_esperado_en_caja: resumen.efectivo_esperado_en_caja,
    } : null,
    movimientos: movimientos.filter(m => m.kiosco_id === sesion.kiosco_id && m.sesion_caja_id === sesion.id)
      .map(m => ({ id: m.id, kiosco_id: m.kiosco_id, sesion_caja_id: m.sesion_caja_id,
        usuario_id: m.usuario_id, tipo: m.tipo, motivo: m.motivo, monto: m.monto,
        descripcion: m.descripcion, fecha_hora: m.fecha_hora })),
  }
}

export async function guardarRespaldoCierreLocal(respaldo: RespaldoCierreLocal): Promise<void> {
  await tablaRespaldos().put(respaldo)
}

export async function listarRespaldosCierreLocal(kioscoId: string): Promise<RespaldoCierreLocal[]> {
  const registros = await tablaRespaldos().where('kioscoId').equals(kioscoId).toArray()
  return registros.sort((a, b) => b.fecha.localeCompare(a.fecha))
}
