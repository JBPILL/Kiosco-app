import type { Producto } from '../types/database'

export type SegmentoRotacion = 'ACTIVA' | 'ALERTA' | 'ESTANCADO' | 'MUERTO'

export interface ItemRotacion {
  producto: Producto
  stock: number
  precioCosto: number
  precioVenta: number
  capitalInmovilizado: number // stock * costo
  ultimaVentaFecha: string | null
  diasSinMovimiento: number
  nuncaVendido: boolean
  segmento: SegmentoRotacion
  unidadesVendidasPeriodo: number
}

export interface LineaVentaHistorial {
  producto_id: string
  cantidad: number
  precio_costo?: number
  fecha_hora: string
  es_devolucion_envase?: boolean
}

export interface MetricasRotacion {
  items: ItemRotacion[]
  capitalInmovilizadoTotal: number // Suma costo de stock con días > 30 (Alerta + Estancado + Muerto)
  capitalTotalInventario: number // Suma costo de todo el stock analizado
  totalProductosAnalizados: number
  totalProductosInmovilizados: number
  porcentajeInmovilizado: number
  cmvPeriodo: number // Costo de mercadería vendida en el período
  indiceRotacion: number | null // CMV / Capital Inventario
  conteoPorSegmento: Record<SegmentoRotacion, number>
}

/**
 * Clasifica un producto en un segmento de rotación según sus días sin movimiento y si tuvo ventas.
 * - ACTIVA: 0 a 30 días
 * - ALERTA: 31 a 60 días
 * - ESTANCADO: 61 a 90 días
 * - MUERTO: > 90 días o nunca vendido
 */
export function clasificarSegmentoRotacion(
  diasSinMovimiento: number,
  nuncaVendido = false
): SegmentoRotacion {
  if (diasSinMovimiento > 90 || nuncaVendido) {
    return 'MUERTO'
  }
  if (diasSinMovimiento <= 30) {
    return 'ACTIVA'
  }
  if (diasSinMovimiento <= 60) {
    return 'ALERTA'
  }
  return 'ESTANCADO'
}

/**
 * Calcula las métricas completas de rotación y capital inmovilizado.
 * Lógica pura desacoplada de la base de datos y de la interfaz de usuario.
 *
 * @param productos Catálogo de productos
 * @param lineasVentas Líneas de ventas completadas (excluye anuladas)
 * @param fechaReferencia Fecha actual o de corte (default ahora)
 * @param diasPeriodo Ventana de días para el cálculo de CMV y rotación (default 90)
 */
export function calcularRotacionInventario(
  productos: Producto[],
  lineasVentas: LineaVentaHistorial[] = [],
  fechaReferencia: Date = new Date(),
  diasPeriodo: number = 90
): MetricasRotacion {
  const ahoraMs = fechaReferencia.getTime()
  const ventanaInicioMs = ahoraMs - diasPeriodo * 24 * 60 * 60 * 1000

  // 1. Mapear ventas por producto: última fecha de venta y CMV del período
  const ultimaVentaPorProducto = new Map<string, Date>()
  const unidadesVendidasPeriodo = new Map<string, number>()
  let cmvTotalPeriodo = 0

  for (const lv of lineasVentas) {
    if (lv.es_devolucion_envase) continue

    const pId = lv.producto_id
    if (!pId) continue

    const fechaVenta = new Date(lv.fecha_hora)
    const fechaMs = fechaVenta.getTime()

    // Registrar última fecha de venta
    const anterior = ultimaVentaPorProducto.get(pId)
    if (!anterior || fechaMs > anterior.getTime()) {
      ultimaVentaPorProducto.set(pId, fechaVenta)
    }

    // Calcular CMV y unidades del período si está dentro de la ventana
    if (fechaMs >= ventanaInicioMs && fechaMs <= ahoraMs) {
      const cant = Number(lv.cantidad) || 0
      const costo = Number(lv.precio_costo) || 0
      cmvTotalPeriodo += cant * costo

      const cantActual = unidadesVendidasPeriodo.get(pId) || 0
      unidadesVendidasPeriodo.set(pId, cantActual + cant)
    }
  }

  // 2. Analizar solo productos activos con stock_actual > 0
  const conteoPorSegmento: Record<SegmentoRotacion, number> = {
    ACTIVA: 0,
    ALERTA: 0,
    ESTANCADO: 0,
    MUERTO: 0,
  }

  let capitalTotalInventario = 0
  let capitalInmovilizadoTotal = 0

  const items: ItemRotacion[] = []

  for (const prod of productos) {
    // Excluir productos inactivos o sin stock físico (> 0)
    if (prod.activo === false || prod.stock_actual <= 0) {
      continue
    }

    const stock = Number(prod.stock_actual) || 0
    const costo = Number(prod.precio_costo) || 0
    const precioVenta = Number(prod.precio_venta) || 0
    const capitalItem = Math.round(stock * costo)

    capitalTotalInventario += capitalItem

    const ultimaVenta = ultimaVentaPorProducto.get(prod.id)
    const nuncaVendido = !ultimaVenta

    let diasSinMovimiento = 0
    if (ultimaVenta) {
      const diffMs = Math.max(0, ahoraMs - ultimaVenta.getTime())
      diasSinMovimiento = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    } else {
      const fechaCreacion = prod.fecha_creacion ? new Date(prod.fecha_creacion) : fechaReferencia
      const diffMs = Math.max(0, ahoraMs - fechaCreacion.getTime())
      diasSinMovimiento = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    }

    const segmento = clasificarSegmentoRotacion(diasSinMovimiento, nuncaVendido)
    conteoPorSegmento[segmento]++

    // Capital inmovilizado: productos no activos (> 30 días o nunca vendidos)
    if (diasSinMovimiento > 30 || nuncaVendido) {
      capitalInmovilizadoTotal += capitalItem
    }

    items.push({
      producto: prod,
      stock,
      precioCosto: costo,
      precioVenta,
      capitalInmovilizado: capitalItem,
      ultimaVentaFecha: ultimaVenta ? ultimaVenta.toISOString() : null,
      diasSinMovimiento,
      nuncaVendido,
      segmento,
      unidadesVendidasPeriodo: unidadesVendidasPeriodo.get(prod.id) || 0,
    })
  }

  // Ordenar por capital inmovilizado descendente por defecto
  items.sort((a, b) => b.capitalInmovilizado - a.capitalInmovilizado)

  const totalProductosAnalizados = items.length
  const totalProductosInmovilizados =
    conteoPorSegmento.ALERTA + conteoPorSegmento.ESTANCADO + conteoPorSegmento.MUERTO

  const porcentajeInmovilizado =
    capitalTotalInventario > 0
      ? Number(((capitalInmovilizadoTotal / capitalTotalInventario) * 100).toFixed(1))
      : 0

  // Índice de rotación: CMV / Capital total inventario a costo
  const indiceRotacion =
    capitalTotalInventario > 0 && cmvTotalPeriodo > 0
      ? Number((cmvTotalPeriodo / capitalTotalInventario).toFixed(2))
      : null

  return {
    items,
    capitalInmovilizadoTotal,
    capitalTotalInventario,
    totalProductosAnalizados,
    totalProductosInmovilizados,
    porcentajeInmovilizado,
    cmvPeriodo: Math.round(cmvTotalPeriodo),
    indiceRotacion,
    conteoPorSegmento,
  }
}
