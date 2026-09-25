import type { TicketData } from '../components/pos/TicketReceiptModal'
import { labelMedioPago } from './utils'
import { construirURLQRAFIP } from './afipQR'
import { useAFIPStore } from '../stores/afipStore'

/**
 * Mapea una venta obtenida de Supabase con sus relaciones (detalles, pagos, usuario, cliente)
 * a la estructura requerida por TicketReceiptModal para visualización e impresión.
 */
export function ventaToTicketData(v: any, kiosco?: any): TicketData {
  const pagosArr: { medio_pago: string; monto: number }[] = v.pagos || []
  const medio =
    pagosArr.length > 1
      ? 'Pago Mixto'
      : pagosArr.length === 1 && pagosArr[0]?.medio_pago
      ? labelMedioPago(pagosArr[0].medio_pago)
      : 'Efectivo'

  const detalles = v.detalles || []
  const subtotalCalculado = detalles.reduce((acc: number, d: any) => acc + (d.subtotal || 0), 0)
  const ajusteMonto = (v.total || 0) - subtotalCalculado

  const afipStoreConfig = useAFIPStore.getState().config
  const cuitEmisor = kiosco?.cuit || afipStoreConfig?.cuit || undefined
  const afipPtoVta = kiosco?.afip_punto_venta || afipStoreConfig?.punto_venta || 2
  const afipTipoCmp = v.afip_tipo_comprobante || 11
  const fechaStr = (v.fecha_hora || new Date().toISOString()).split('T')[0]

  let qrUrl = v.afip_qr_url
  if (!qrUrl && v.afip_cae) {
    try {
      qrUrl = construirURLQRAFIP({
        fecha: fechaStr,
        cuit: cuitEmisor || '20123456789',
        puntoVenta: afipPtoVta,
        tipoComprobante: afipTipoCmp,
        numeroComprobante: v.afip_nro_comprobante || 1,
        importe: v.total || 0,
        codigoAutorizacion: v.afip_cae,
      })
    } catch {
      // Ignorar fallback
    }
  }

  const afipData = v.afip_cae
    ? {
        cae: v.afip_cae,
        vtoCae: v.afip_vto_cae || '',
        tipoComprobante: afipTipoCmp,
        letra: (afipTipoCmp === 11 ? 'C' : 'B') as 'C' | 'B' | 'A',
        puntoVenta: afipPtoVta,
        nroComprobante: v.afip_nro_comprobante || 0,
        cuitEmisor: cuitEmisor,
        iibb: kiosco?.iibb || afipStoreConfig?.iibb || undefined,
        condicionIva: kiosco?.condicion_iva || afipStoreConfig?.condicion_iva || undefined,
        inicioActividades: kiosco?.inicio_actividades || afipStoreConfig?.inicio_actividades || undefined,
        qrUrl: qrUrl || undefined,
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
    pagos: pagosArr.map((p: any) => ({ medioPago: labelMedioPago(p.medio_pago), monto: p.monto })),
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
