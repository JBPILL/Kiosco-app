import type { EntradaCheckoutManual } from '../types/checkoutManual'
import type { ItemCarrito, ItemCombo } from '../types/database'
import type { TipoAjuste } from './carritoImportes'
import { distribuirTotalVenta } from './distribuirTotalVenta'
import { leerEntradaCheckoutManual } from '../../supabase/functions/_shared/manualCheckoutRequest'

export interface DatosCobroManual {
  checkoutId: string
  kioscoId: string
  usuarioId: string
  sesionCajaId: string
  fechaHora: string
  clienteId: string | null
  notas: string | null
  items: ItemCarrito[]
  componentes: ItemCombo[]
  tipoAjuste: TipoAjuste
  valorAjuste: number
  total: number
  pagos: EntradaCheckoutManual['pagos']
}

/** Proyección explícita: los costos y el stock del navegador no autorizan el cierre. */
export function crearEntradaCobroManual(datos: DatosCobroManual): EntradaCheckoutManual {
  const combos = new Set(datos.items.filter(i => i.producto.es_combo).map(i => i.producto.id))
  return leerEntradaCheckoutManual({ version: 1, checkoutId: datos.checkoutId, kioscoId: datos.kioscoId,
    usuarioId: datos.usuarioId, sesionCajaId: datos.sesionCajaId, fechaHora: datos.fechaHora,
    clienteId: datos.clienteId, notas: datos.notas, tipoAjuste: datos.tipoAjuste, valorAjuste: datos.valorAjuste,
    totalEsperado: datos.total, subtotalesEsperados: distribuirTotalVenta(datos.items.map(i => i.subtotal), datos.total),
    componentesEsperados: datos.componentes.filter(c => combos.has(c.combo_producto_id)).map(c => ({
      comboId: c.combo_producto_id, productoId: c.componente_producto_id, cantidad: c.cantidad,
    })),
    lineas: datos.items.map(item => {
      if (item.es_devolucion_envase) {
        if (!item.tipo_envase_id) throw new Error('El envase necesita un identificador del comercio antes de cobrar')
        return { tipo: 'DEVOLUCION_ENVASE', id: item.producto.id, envaseId: item.tipo_envase_id, cantidad: item.cantidad }
      }
      if (item.producto.activo === false) return { tipo: 'SERVICIO', id: item.producto.id,
        descripcion: item.producto.descripcion, precio: item.producto.precio_venta, cantidad: item.cantidad }
      return { tipo: 'PRODUCTO', id: item.producto.id, productoId: item.producto.id,
        cantidad: item.cantidad, sinEnvase: Boolean(item.sin_envase) }
    }), pagos: datos.pagos })
}

export function checkoutManualTransaccionalActivo(): boolean {
  return import.meta.env.VITE_CHECKOUT_MANUAL_TRANSACCIONAL === 'true'
}
