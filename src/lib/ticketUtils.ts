import type { TicketData } from '../components/pos/TicketReceiptModal'
import { labelMedioPago, formatearPromoTicket, extraerPatronPromo, obtenerEtiquetaPromocion } from './utils'
import { construirURLQRAFIP } from './afipQR'
import { useAFIPStore } from '../stores/afipStore'
import { usePromocionStore, cargarPromocionesLocal } from '../stores/promocionStore'

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

  // Extraer mapa de promociones persistidas en notas si existen
  let promosGuardadas: Record<string, string> = {}
  let notasLimpias: string | null = v.notas || null
  if (v.notas && typeof v.notas === 'string') {
    const match = v.notas.match(/\[PROMOS:(.*?)\]/)
    if (match) {
      try {
        promosGuardadas = JSON.parse(match[1])
        notasLimpias = v.notas.replace(/\[PROMOS:.*?\]/, '').trim() || null
      } catch (e) {
        console.warn('Error al parsear promociones de las notas:', e)
      }
    }
  }

  // Cargar catálogo de promociones desde store o almacenamiento local para correlacionar
  const promosStore = usePromocionStore.getState().promociones
  const promociones =
    promosStore && promosStore.length > 0
      ? promosStore
      : cargarPromocionesLocal(kiosco?.id || v.kiosco_id)

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

      const prodId = d.producto_id || d.producto?.id
      const cant = Number(d.cantidad) || 0
      const subtotalReal = Number(d.subtotal) || 0

      // Precio base unitario original (precio de venta catalogado o precio_unitario)
      const precioBase =
        Number(d.producto?.precio_venta) ||
        Number(d.precio_unitario) ||
        (cant > 0 ? Math.abs(subtotalReal / cant) : 0)
      const subtotalBase = cant * precioBase
      const diferenciaDescuento = subtotalBase - subtotalReal

      let promoNombre: string | undefined = undefined
      let descuentoPromo: number | undefined = d.descuento_promo

      // 1. Revisar si la promoción vino guardada en notas persistidas o en el renglón
      const candidata = (prodId && promosGuardadas[prodId]) || (d.promo_nombre ? formatearPromoTicket(d.promo_nombre) : undefined)
      if (candidata) {
        // Solo aceptar si ya contiene un patrón conciso explícito (ej: "15% OFF", "2x1", etc.)
        const patron = extraerPatronPromo(candidata)
        if (patron) {
          promoNombre = patron
        }
      }

      // 2. Si no tenemos una etiqueta concisa válida, buscar en el catálogo de promociones
      if (!promoNombre && promociones && promociones.length > 0) {
        const promoCoincidente = promociones.find(
          (p) =>
            (prodId && p.producto_id === prodId) ||
            (p.categoria_id && d.producto?.categoria_id && p.categoria_id === d.producto.categoria_id)
        )
        if (promoCoincidente) {
          promoNombre = obtenerEtiquetaPromocion(promoCoincidente)
        }
      }

      // 3. Si hay descuento detectable o promoción no encontrada aún
      if (diferenciaDescuento > 0.5 && cant > 0) {
        if (!descuentoPromo) {
          descuentoPromo = Math.round(diferenciaDescuento)
        }

        // Fallback matemático de inferencia infalible si la promo fue borrada o modificada
        if (!promoNombre && subtotalBase > 0) {
          const pct = Math.round((diferenciaDescuento / subtotalBase) * 100)
          const tolerancia = Math.max(2, subtotalBase * 0.03)

          if (cant >= 2 && Math.abs(subtotalReal - subtotalBase * 0.5) <= tolerancia) {
            promoNombre = '2x1'
          } else if (cant >= 3 && Math.abs(subtotalReal - subtotalBase * (2 / 3)) <= tolerancia) {
            promoNombre = '3x2'
          } else if (cant >= 4 && Math.abs(subtotalReal - subtotalBase * 0.75) <= tolerancia) {
            promoNombre = '4x3'
          } else if (cant >= 2 && (pct === 25 || Math.abs(diferenciaDescuento - precioBase * 0.5) <= tolerancia)) {
            promoNombre = '2da al 50%'
          } else if (cant >= 2 && (pct === 35 || Math.abs(diferenciaDescuento - precioBase * 0.7) <= tolerancia)) {
            promoNombre = '2da al 70%'
          } else if (pct > 0 && pct < 100) {
            promoNombre = `${pct}% OFF`
          }
        }
      }

      // El precio unitario mostrado debe reflejar el precio de lista/base cuando hubo promoción
      const precioUnitario =
        d.producto?.precio_venta && Number(d.producto.precio_venta) > 0
          ? Number(d.producto.precio_venta)
          : Number(d.precio_unitario) || precioBase

      return {
        descripcion: desc,
        cantidad: cant,
        precioUnitario,
        subtotal: subtotalReal,
        descuentoPromo,
        promoNombre,
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
    notas: notasLimpias,
    afip: afipData,
  }
}
