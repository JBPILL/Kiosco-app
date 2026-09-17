import type { TicketData } from '../components/pos/TicketReceiptModal'
import { labelMedioPago } from './utils'

/**
 * Mapea una venta obtenida de Supabase con sus relaciones (detalles, pagos, usuario, cliente)
 * a la estructura requerida por TicketReceiptModal para visualización e impresión.
 */
export function ventaToTicketData(v: any, kiosco?: any): TicketData {
  const medio =
    v.pagos && v.pagos.length > 0 && v.pagos[0]?.medio_pago
      ? labelMedioPago(v.pagos[0].medio_pago)
      : 'Efectivo'

  const detalles = v.detalles || []
  const subtotalCalculado = detalles.reduce((acc: number, d: any) => acc + (d.subtotal || 0), 0)
  const ajusteMonto = (v.total || 0) - subtotalCalculado

  const afipData = v.afip_cae
    ? {
        cae: v.afip_cae,
        vtoCae: v.afip_vto_cae || '',
        tipoComprobante: v.afip_tipo_comprobante || 11,
        letra: (v.afip_tipo_comprobante === 11 ? 'C' : 'B') as 'C' | 'B' | 'A',
        puntoVenta: 1,
        nroComprobante: v.afip_nro_comprobante || 0,
        cuitEmisor: kiosco?.cuit || undefined,
        iibb: kiosco?.iibb || undefined,
        condicionIva: kiosco?.condicion_iva || undefined,
        inicioActividades: kiosco?.inicio_actividades || undefined,
        qrUrl: v.afip_qr_url || undefined,
      }
    : null

  return {
    ventaId: v.id,
    fecha: v.fecha_hora,
    items: detalles.map((d: any) => {
      let desc = d.producto?.descripcion || 'Artículo'
      if (d.sin_envase) {
        desc = `${desc} (Sin envase)`
      } else if (d.es_devolucion_envase) {
        desc = `${desc} (Devolución)`
      }
      return {
        descripcion: desc,
        cantidad: d.cantidad,
        precioUnitario: d.precio_unitario || (d.cantidad > 0 ? Math.abs(d.subtotal / d.cantidad) : 0),
        subtotal: d.subtotal,
      }
    }),
    subtotal: subtotalCalculado,
    ajuste:
      Math.abs(ajusteMonto) > 0.01
        ? {
            descripcion: ajusteMonto < 0 ? 'Descuento' : 'Recargo',
            monto: Math.abs(ajusteMonto),
            esDescuento: ajusteMonto < 0,
          }
        : null,
    total: v.total,
    medioPago: medio,
    kioscoNombre: kiosco?.nombre,
    kioscoDireccion: kiosco?.direccion,
    kioscoTelefono: kiosco?.telefono,
    cajeroNombre: v.usuario?.nombre,
    clienteNombre: v.cliente?.nombre || null,
    clienteTelefono: v.cliente?.telefono || null,
    notas: v.notas,
    afip: afipData,
  }
}
