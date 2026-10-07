import type { TicketData } from '../components/pos/TicketReceiptModal'
import { crearEntradaCobroManual } from './manualCheckoutCart'
import type { DatosCobroManual } from './manualCheckoutCart'
import { cerrarCobroManualLocal, guardarCobroManualLocal, reclamarComprobanteManual, recuperarCobroManualLocal } from './manualCheckoutClient'
import { useCartStore } from '../stores/cartStore'
import { useAuthStore } from '../stores/authStore'
import { solicitarPermisoDescuentoSupervisor } from './supervisorPinClient'
import { guardarAutorizacionCobroManual } from './manualCheckoutClient'
import { ajusteCarrito } from './carritoImportes'

export interface ResultadoFlujoManual {
  ventaId: string
  recibo: TicketData | null
  pendiente: boolean
  recuperado: boolean
}

export async function recuperarFlujoCobroManual(kioscoId: string, usuarioId: string,
  ticketClave: string): Promise<ResultadoFlujoManual> {
  const original = await recuperarCobroManualLocal(kioscoId, usuarioId, ticketClave)
  if (!original?.recibo) throw new Error('No se encontró el comprobante original del cobro')
  useCartStore.getState().bloquearTabPorCobro(ticketClave, original.entrada.checkoutId)
  const pendiente = !navigator.onLine && original.estado !== 'CONFIRMADO'
  if (!pendiente) await cerrarCobroManualLocal(original.entrada, ticketClave)
  const vigente = useAuthStore.getState()
  if (vigente.usuario?.id !== usuarioId || vigente.kiosco?.id !== kioscoId) {
    throw new Error('La sesión cambió. Recuperá el comprobante con el operador original')
  }
  return { ventaId: original.entrada.checkoutId, pendiente, recuperado: true,
    recibo: await reclamarComprobanteManual(original.entrada.checkoutId, pendiente) }
}

export async function ejecutarCobroManual(datos: DatosCobroManual, ticketClave: string,
  reciboNuevo: TicketData, pinSupervisor?: string): Promise<ResultadoFlujoManual> {
  const original = await recuperarCobroManualLocal(datos.kioscoId, datos.usuarioId, ticketClave)
  const entrada = original?.entrada ?? crearEntradaCobroManual(datos)
  if (original && !original.recibo) throw new Error('El cobro original requiere revisión de su comprobante')
  const recibo = original?.recibo ?? reciboNuevo
  if (!recibo) throw new Error('No se encontró el comprobante original')
  const requiereSupervisor = !original && useAuthStore.getState().usuario?.rol === 'CAJERO'
    && ((datos.tipoAjuste === 'DESCUENTO_PORCENTAJE' && datos.valorAjuste > 15)
      || (datos.tipoAjuste === 'DESCUENTO_FIJO' && ajusteCarrito(datos.items, datos.tipoAjuste, datos.valorAjuste)
        > ajusteCarrito(datos.items, 'DESCUENTO_PORCENTAJE', 100) * 0.15))
  // Autorizar antes de archivar una solicitud de cobro; un PIN fallido no bloquea el carrito.
  const permiso = requiereSupervisor ? await solicitarPermisoDescuentoSupervisor(entrada, pinSupervisor ?? '') : null
  await guardarCobroManualLocal(entrada, ticketClave, recibo)
  if (permiso) await guardarAutorizacionCobroManual(entrada, permiso)
  useCartStore.getState().bloquearTabPorCobro(ticketClave, entrada.checkoutId)
  // El cobro físico ya se hizo manualmente. Sin red queda como solicitud provisional.
  const pendiente = !navigator.onLine && original?.estado !== 'CONFIRMADO'
  if (!pendiente) await cerrarCobroManualLocal(entrada, ticketClave)
  const vigente = useAuthStore.getState()
  if (vigente.usuario?.id !== entrada.usuarioId || vigente.kiosco?.id !== entrada.kioscoId) {
    throw new Error('La sesión cambió. Recuperá el comprobante con el operador original')
  }
  return { ventaId: entrada.checkoutId, pendiente, recuperado: Boolean(original),
    recibo: await reclamarComprobanteManual(entrada.checkoutId, pendiente) }
}
