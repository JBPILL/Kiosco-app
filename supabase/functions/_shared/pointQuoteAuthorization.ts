import type { Cliente, Kiosco, Usuario } from '../../../src/types/database.ts'

export interface PermisosCotizacionPoint {
  kioscoId: string
  usuarioId: string
  permiteServicios: boolean
  permiteAjustes: boolean
}

/** Perfil y comercio deben consultarse en el servidor después de verificar el JWT. */
export function autorizarCotizacionPoint(
  authUserId: string, usuario: Usuario, kiosco: Kiosco,
): PermisosCotizacionPoint {
  if (!authUserId || usuario.auth_user_id !== authUserId || !usuario.activo
    || usuario.kiosco_id !== kiosco.id || !kiosco.id
    || (usuario.rol !== 'DUEÑO' && usuario.rol !== 'CAJERO')) throw new Error('Cobro no autorizado')
  if (kiosco.estado_suscripcion !== 'ACTIVO') throw new Error('Comercio sin cobros habilitados')
  return { kioscoId: kiosco.id, usuarioId: usuario.id,
    permiteServicios: kiosco.capacidades_operativas?.serviciosRapidos === true,
    permiteAjustes: usuario.rol === 'DUEÑO' }
}

/** Revalidar bajo bloqueo al confirmar la venta; una cotización no reserva crédito. */
export function validarCreditoCotizacionPoint(
  kioscoId: string, clienteId: string | null, cliente: Cliente | null, montoCentavos: number,
): void {
  if (!Number.isSafeInteger(montoCentavos) || montoCentavos < 0) throw new Error('Crédito inválido')
  if (montoCentavos === 0) return
  if (!clienteId || !cliente?.activo || cliente.id !== clienteId || cliente.kiosco_id !== kioscoId) {
    throw new Error('Cliente no disponible para fiado')
  }
  const { saldo_deudor: saldo, limite_credito: limite } = cliente
  if (!Number.isFinite(saldo) || !Number.isFinite(limite) || limite < 0
    || !Number.isSafeInteger(Math.round(saldo * 100)) || !Number.isSafeInteger(Math.round(limite * 100))
    || !Number.isSafeInteger(Math.round(saldo * 100) + montoCentavos)) throw new Error('Crédito inválido')
  // El POS actual interpreta límite cero como crédito sin tope.
  if (limite > 0 && Math.round(saldo * 100) + montoCentavos > Math.round(limite * 100)) {
    throw new Error('Límite de crédito excedido')
  }
}
