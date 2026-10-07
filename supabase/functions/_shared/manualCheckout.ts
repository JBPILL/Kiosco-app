import type { Cliente, Kiosco, Usuario } from '../../../src/types/database.ts'
import type { EntradaCheckoutManual, ResultadoCheckoutManual, SnapshotCheckoutManual } from '../../../src/types/checkoutManual.ts'
import { ajusteCarrito } from '../../../src/lib/carritoImportes.ts'
import { distribuirTotalVenta } from '../../../src/lib/distribuirTotalVenta.ts'
import { cotizarVentaManual } from './pointQuote.ts'
import type { DatosCotizacionPoint } from './pointQuote.ts'
import { autorizarCotizacionPoint, validarCreditoCotizacionPoint } from './pointQuoteAuthorization.ts'
import { construirSnapshotManual, leerRegistroManual, leerResultadoManual } from './manualCheckoutSnapshot.ts'
import { firmaManual } from './manualCheckoutRequest.ts'

export interface ContextoCheckoutManual { authUserId: string; usuario: Usuario; kiosco: Kiosco }
export interface ManualCheckoutDependencies {
  ahora: () => Date
  buscar: (contexto: ContextoCheckoutManual, entrada: EntradaCheckoutManual) => Promise<unknown | null>
  cargarDatos: (contexto: ContextoCheckoutManual, entrada: EntradaCheckoutManual) => Promise<{
    productos: DatosCotizacionPoint['productos']; componentes: NonNullable<DatosCotizacionPoint['componentes']>;
    promociones: DatosCotizacionPoint['promociones']; envases: DatosCotizacionPoint['envases']; cliente: Cliente | null
  }>
  preparar: (contexto: ContextoCheckoutManual, entrada: EntradaCheckoutManual, snapshot: SnapshotCheckoutManual, requiereSupervisor: boolean) => Promise<unknown>
  confirmar: (contexto: ContextoCheckoutManual, snapshot: SnapshotCheckoutManual) => Promise<unknown>
  confirmarAutorizado?: (contexto: ContextoCheckoutManual, entrada: EntradaCheckoutManual, snapshot: SnapshotCheckoutManual, autorizacionId: string | null) => Promise<unknown>
}

export async function cerrarCheckoutManual(contexto: ContextoCheckoutManual, entrada: EntradaCheckoutManual,
  deps: ManualCheckoutDependencies, autorizacionId: string | null = null): Promise<ResultadoCheckoutManual> {
  const permisos = autorizarCotizacionPoint(contexto.authUserId, contexto.usuario, contexto.kiosco)
  if (permisos.kioscoId !== entrada.kioscoId || (contexto.usuario.rol === 'CAJERO' && permisos.usuarioId !== entrada.usuarioId)) throw new Error('Cobro no autorizado')
  if (Date.parse(entrada.fechaHora) > deps.ahora().getTime() + 300000) throw new Error('Fecha no autorizada')
  let registro = await deps.buscar(contexto, entrada)
  if (!registro) {
    const datos = await deps.cargarDatos(contexto, entrada)
    const ticket = cotizarVentaManual(entrada.lineas, entrada.tipoAjuste, entrada.valorAjuste,
      { ...datos, kioscoId: permisos.kioscoId, permiteServicios: true, permiteAjustes: true, fecha: new Date(entrada.fechaHora) })
    const base = ajusteCarrito(ticket.items, 'DESCUENTO_PORCENTAJE', 100)
    const requiereSupervisor = (entrada.tipoAjuste === 'DESCUENTO_PORCENTAJE' && entrada.valorAjuste > 15)
      || (entrada.tipoAjuste === 'DESCUENTO_FIJO' && ticket.ajuste > base * 0.15)
    if (contexto.usuario.rol === 'CAJERO' && requiereSupervisor && (!autorizacionId || !deps.confirmarAutorizado)) {
      throw new Error('Se requiere autorización de supervisor')
    }
    const reparto = distribuirTotalVenta(ticket.items.map(i => i.subtotal), ticket.total)
    const combos = new Set(ticket.items.filter(i => i.producto.es_combo).map(i => i.producto.id))
    const receta = datos.componentes.filter(c => combos.has(c.combo_producto_id)).map(c => ({
      comboId: c.combo_producto_id, productoId: c.componente_producto_id, cantidad: c.cantidad,
    })).sort((a, b) => `${a.comboId}:${a.productoId}`.localeCompare(`${b.comboId}:${b.productoId}`))
    if (ticket.subtotal < 0 || ticket.total !== entrada.totalEsperado || firmaManual(reparto) !== firmaManual(entrada.subtotalesEsperados)
      || firmaManual(receta) !== firmaManual(entrada.componentesEsperados)) throw new Error('El ticket requiere revisión: precio, promoción o receta cambiaron')
    const credito = entrada.pagos.filter(p => p.medio === 'CUENTA_CORRIENTE').reduce((a, b) => a + b.montoCentavos, 0)
    validarCreditoCotizacionPoint(permisos.kioscoId, entrada.clienteId, datos.cliente, credito)
    const snapshot = await construirSnapshotManual(entrada, ticket)
    registro = await deps.preparar(contexto, entrada, snapshot, requiereSupervisor)
  }
  const congelado = await leerRegistroManual(registro, entrada)
  if (contexto.usuario.rol === 'CAJERO' && (congelado.requiereSupervisor === true
    || (entrada.tipoAjuste === 'DESCUENTO_PORCENTAJE' && entrada.valorAjuste > 15)
    || (entrada.tipoAjuste === 'DESCUENTO_FIJO' && congelado.requiereSupervisor === null))) {
    if (!deps.confirmarAutorizado) throw new Error('Se requiere autorización de supervisor')
    // El SQL recupera confirmaciones existentes incluso sin permiso; si aún no hay
    // venta, exige y consume el permiso dentro de la transacción financiera.
    return leerResultadoManual(await deps.confirmarAutorizado(contexto, congelado.entrada, congelado.snapshot, autorizacionId), congelado.snapshot)
  }
  return leerResultadoManual(await deps.confirmar(contexto, congelado.snapshot), congelado.snapshot)
}
