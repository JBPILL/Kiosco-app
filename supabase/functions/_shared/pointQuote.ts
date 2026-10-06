import type { ItemCarrito, Producto, Promocion } from '../../../src/types/database.ts'
import { ajusteCarrito, subtotalCarrito, totalCarrito } from '../../../src/lib/carritoImportes.ts'
import type { TipoAjuste } from '../../../src/lib/carritoImportes.ts'
import { contextoPromocionesArgentina, evaluarCarritoPromociones } from '../../../src/lib/promocionesEngine.ts'
import { dividirPagoPoint } from './pointPaymentSplit.ts'
import type { DivisionPagoPoint, PagoComplementarioPoint } from './pointPaymentSplit.ts'

export type LineaCotizacionPoint =
  | { tipo: 'PRODUCTO'; id: string; productoId: string; cantidad: number; sinEnvase: boolean }
  | { tipo: 'SERVICIO'; id: string; descripcion: string; precio: number; cantidad: number }
  | { tipo: 'DEVOLUCION_ENVASE'; id: string; envaseId: string; cantidad: number }

export interface EnvaseCotizacionPoint {
  id: string
  kioscoId: string
  nombre: string
  precio: number
}

/** Datos y permisos obtenidos por el backend, nunca copiados del cuerpo del cliente. */
export interface DatosCotizacionPoint {
  kioscoId: string
  productos: Producto[]
  promociones: Promocion[]
  envases: EnvaseCotizacionPoint[]
  permiteServicios: boolean
  permiteAjustes: boolean
  fecha: Date
}

export interface CotizacionPoint {
  items: ItemCarrito[]
  subtotal: number
  ajuste: number
  total: number
  montoCentavos: number
}

export function cotizarCobroPoint(
  lineas: LineaCotizacionPoint[], tipoAjuste: TipoAjuste, valorAjuste: number,
  datos: DatosCotizacionPoint, pagos: PagoComplementarioPoint[], clienteId: string | null,
): { ticket: CotizacionPoint; cobro: DivisionPagoPoint } {
  const ticket = cotizarPoint(lineas, tipoAjuste, valorAjuste, datos)
  return { ticket, cobro: dividirPagoPoint(ticket.montoCentavos, pagos, clienteId) }
}

function validarImporte(valor: number): void {
  if (!Number.isFinite(valor) || valor < 0 || !Number.isSafeInteger(Math.round(valor * 100))) {
    throw new Error('Importe comercial inválido')
  }
}

function productoVirtual(id: string, descripcion: string, precio: number, datos: DatosCotizacionPoint): Producto {
  return {
    id, kiosco_id: datos.kioscoId, descripcion, precio_venta: precio,
    precio_costo: 0, categoria_id: null, codigo_barras: null,
    stock_actual: 0, stock_minimo: 0, es_favorito: false, activo: false,
    fecha_creacion: datos.fecha.toISOString(), fecha_actualizacion: datos.fecha.toISOString(),
  }
}

export function cotizarPoint(
  lineas: LineaCotizacionPoint[], tipoAjuste: TipoAjuste, valorAjuste: number,
  datos: DatosCotizacionPoint,
): CotizacionPoint {
  if (!datos.kioscoId || lineas.length === 0 || lineas.length > 500) throw new Error('Ticket inválido')
  const tipos: TipoAjuste[] = ['NINGUNO', 'DESCUENTO_PORCENTAJE', 'DESCUENTO_FIJO', 'RECARGO_PORCENTAJE', 'RECARGO_FIJO']
  if (!tipos.includes(tipoAjuste)) throw new Error('Ajuste inválido')
  validarImporte(valorAjuste)
  if (tipoAjuste !== 'NINGUNO' && !datos.permiteAjustes) throw new Error('Ajuste no autorizado')
  if (tipoAjuste === 'DESCUENTO_PORCENTAJE' && valorAjuste > 100) throw new Error('Descuento inválido')
  if (datos.productos.some((p) => p.kiosco_id !== datos.kioscoId)
    || datos.promociones.some((p) => p.kiosco_id !== datos.kioscoId)
    || datos.envases.some((e) => e.kioscoId !== datos.kioscoId)) throw new Error('Datos de otro comercio')
  const ids = new Set<string>()
  const productosUsados = new Set<string>()
  const items = lineas.map((linea): ItemCarrito => {
    if (!linea.id || ids.has(linea.id)) throw new Error('Identidad de línea inválida')
    ids.add(linea.id)
    if (!Number.isFinite(linea.cantidad) || linea.cantidad <= 0 || linea.cantidad > 999999
      || Math.abs(linea.cantidad * 1000 - Math.round(linea.cantidad * 1000)) > 0.000001) {
      throw new Error('Cantidad inválida')
    }
    if (linea.tipo === 'PRODUCTO') {
      if (productosUsados.has(linea.productoId)) throw new Error('Producto repetido en el ticket')
      productosUsados.add(linea.productoId)
      const producto = datos.productos.find((p) => p.id === linea.productoId)
      if (!producto?.activo) throw new Error('Producto no disponible')
      validarImporte(producto.precio_venta)
      if (!producto.es_pesable && !Number.isInteger(linea.cantidad)) throw new Error('Cantidad debe ser entera')
      if (linea.sinEnvase && !producto.es_retornable) throw new Error('Producto sin envase retornable')
      validarImporte(producto.precio_envase || 0)
      return { producto: { ...producto }, cantidad: linea.cantidad, subtotal: 0,
        sin_envase: linea.sinEnvase, precio_envase_unitario: producto.precio_envase || 0 }
    }
    if (linea.tipo === 'SERVICIO') {
      if (!datos.permiteServicios) throw new Error('Servicio no autorizado')
      if (!Number.isInteger(linea.cantidad)) throw new Error('Cantidad debe ser entera')
      if (datos.productos.some((p) => p.id === linea.id)) throw new Error('Identidad de servicio inválida')
      const descripcion = linea.descripcion.trim()
      if (!descripcion || descripcion.length > 150) throw new Error('Descripción inválida')
      validarImporte(linea.precio)
      return { producto: productoVirtual(linea.id, descripcion, linea.precio, datos),
        cantidad: linea.cantidad, subtotal: 0 }
    }
    if (linea.tipo !== 'DEVOLUCION_ENVASE') throw new Error('Tipo de línea inválido')
    if (datos.productos.some((p) => p.id === linea.id)) throw new Error('Identidad de devolución inválida')
    const envase = datos.envases.find((e) => e.id === linea.envaseId)
    if (!envase || !Number.isInteger(linea.cantidad)) throw new Error('Devolución inválida')
    validarImporte(envase.precio)
    return { producto: productoVirtual(linea.id, `Devolución ${envase.nombre}`, -envase.precio, datos),
      cantidad: linea.cantidad, subtotal: 0, es_devolucion_envase: true,
      tipo_envase_id: envase.id, precio_envase_unitario: envase.precio }
  })
  const evaluados = evaluarCarritoPromociones(items, datos.promociones, contextoPromocionesArgentina(datos.fecha))
  const total = totalCarrito(evaluados, tipoAjuste, valorAjuste)
  const montoCentavos = total * 100
  if (!Number.isSafeInteger(montoCentavos) || montoCentavos <= 0) throw new Error('Total Point inválido')
  return { items: evaluados, subtotal: subtotalCarrito(evaluados),
    ajuste: ajusteCarrito(evaluados, tipoAjuste, valorAjuste), total, montoCentavos }
}
