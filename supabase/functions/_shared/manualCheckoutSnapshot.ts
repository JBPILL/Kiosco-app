import type { EntradaCheckoutManual, RegistroCheckoutManual, ResultadoCheckoutManual, SnapshotCheckoutManual } from '../../../src/types/checkoutManual.ts'
import type { CotizacionPoint } from './pointQuote.ts'
import { distribuirTotalVenta } from '../../../src/lib/distribuirTotalVenta.ts'
import { camposManual, fechaManual, firmaManual, leerEntradaCheckoutManual, numeroManual, objetoManual, uuidManual } from './manualCheckoutRequest.ts'

export async function idDetalleManual(checkoutId: string, lineaId: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`checkout-manual:${checkoutId}:${lineaId}`))
  const bytes = new Uint8Array(buffer).slice(0, 16)
  bytes[6] = (bytes[6] & 15) | 128
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function construirSnapshotManual(entrada: EntradaCheckoutManual, ticket: CotizacionPoint): Promise<SnapshotCheckoutManual> {
  const subtotales = distribuirTotalVenta(ticket.items.map(item => item.subtotal), ticket.total)
  const detalles = await Promise.all(ticket.items.map(async (item, indice) => ({
    id: await idDetalleManual(entrada.checkoutId, entrada.lineas[indice].id), producto_id: item.producto.id,
    cantidad: item.cantidad, precio_unitario: Math.max(0, Math.round(subtotales[indice] / item.cantidad * 100) / 100),
    subtotal: subtotales[indice], sin_envase: Boolean(item.sin_envase),
    precio_envase_unitario: item.sin_envase || item.es_devolucion_envase ? item.precio_envase_unitario || 0 : 0,
    es_devolucion_envase: Boolean(item.es_devolucion_envase),
    articulo_libre: entrada.lineas[indice].tipo === 'PRODUCTO' ? null
      : { descripcion: item.producto.descripcion, precio_venta: item.producto.precio_venta },
    componentes: entrada.componentesEsperados.filter(comp => comp.comboId === item.producto.id)
      .map(comp => ({ producto_id: comp.productoId, cantidad: comp.cantidad })),
  })))
  return { version: 1, id: entrada.checkoutId, kiosco_id: entrada.kioscoId, usuario_id: entrada.usuarioId,
    sesion_caja_id: entrada.sesionCajaId, fecha_hora: entrada.fechaHora, total: ticket.total,
    notas: entrada.notas, cliente_id: entrada.clienteId, detalles,
    pagos: entrada.pagos.map(p => ({ id: p.id, medio_pago: p.medio, monto: p.montoCentavos / 100, referencia: p.referencia })) }
}

function booleano(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Atributo del snapshot inválido')
  return value
}

export async function leerRegistroManual(value: unknown, esperado: EntradaCheckoutManual): Promise<RegistroCheckoutManual> {
  const registro = objetoManual(value)
  camposManual(registro, ['entrada', 'snapshot'])
  const entrada = leerEntradaCheckoutManual(registro.entrada)
  if (firmaManual(entrada) !== firmaManual(esperado)) throw new Error('El checkout no coincide con la solicitud original')
  const snap = objetoManual(registro.snapshot)
  camposManual(snap, ['version', 'id', 'kiosco_id', 'usuario_id', 'sesion_caja_id', 'fecha_hora', 'total', 'notas', 'cliente_id', 'detalles', 'pagos'])
  if (snap.version !== 1 || snap.id !== entrada.checkoutId || snap.kiosco_id !== entrada.kioscoId || snap.usuario_id !== entrada.usuarioId
    || snap.sesion_caja_id !== entrada.sesionCajaId || snap.fecha_hora !== entrada.fechaHora || snap.total !== entrada.totalEsperado
    || snap.notas !== entrada.notas || snap.cliente_id !== entrada.clienteId || !Array.isArray(snap.detalles)
    || snap.detalles.length !== entrada.lineas.length || !Array.isArray(snap.pagos)) throw new Error('Identidad del snapshot inválida')
  const detalles = await Promise.all(snap.detalles.map(async (value, i): Promise<SnapshotCheckoutManual['detalles'][number]> => {
    const d = objetoManual(value)
    camposManual(d, ['id', 'producto_id', 'cantidad', 'precio_unitario', 'subtotal', 'sin_envase', 'precio_envase_unitario',
      'es_devolucion_envase', 'articulo_libre', 'componentes'])
    const linea = entrada.lineas[i]
    const productoId = linea.tipo === 'PRODUCTO' ? linea.productoId : linea.id
    const receta = entrada.componentesEsperados.filter(c => c.comboId === productoId).map(c => ({ producto_id: c.productoId, cantidad: c.cantidad }))
    const sinEnvase = booleano(d.sin_envase)
    const devolucion = booleano(d.es_devolucion_envase)
    if (d.id !== await idDetalleManual(entrada.checkoutId, linea.id) || d.producto_id !== productoId
      || d.cantidad !== linea.cantidad || d.subtotal !== entrada.subtotalesEsperados[i]
      || sinEnvase !== (linea.tipo === 'PRODUCTO' && linea.sinEnvase) || devolucion !== (linea.tipo === 'DEVOLUCION_ENVASE')
      || firmaManual(d.componentes) !== firmaManual(receta)) throw new Error('Detalle del snapshot inconsistente')
    let articulo: SnapshotCheckoutManual['detalles'][number]['articulo_libre'] = null
    if (linea.tipo === 'PRODUCTO') {
      if (d.articulo_libre !== null) throw new Error('Artículo del snapshot inconsistente')
    } else {
      const a = objetoManual(d.articulo_libre)
      camposManual(a, ['descripcion', 'precio_venta'])
      if (typeof a.descripcion !== 'string' || !a.descripcion.trim() || a.descripcion.length > 200) throw new Error('Concepto virtual inválido')
      const precio = numeroManual(a.precio_venta, -9999999999.99, 9999999999.99, 2)
      if (linea.tipo === 'SERVICIO' && (a.descripcion !== linea.descripcion || precio !== linea.precio)) throw new Error('Servicio del snapshot inconsistente')
      if (linea.tipo === 'DEVOLUCION_ENVASE' && precio > 0) throw new Error('Reintegro del snapshot inconsistente')
      articulo = { descripcion: a.descripcion, precio_venta: precio }
    }
    return { id: uuidManual(d.id), producto_id: productoId, cantidad: linea.cantidad,
      precio_unitario: numeroManual(d.precio_unitario, 0, 9999999999.99, 2), subtotal: entrada.subtotalesEsperados[i],
      sin_envase: sinEnvase, precio_envase_unitario: numeroManual(d.precio_envase_unitario, 0, 9999999999.99, 2),
      es_devolucion_envase: devolucion, articulo_libre: articulo, componentes: receta }
  }))
  const pagos = entrada.pagos.map(p => ({ id: p.id, medio_pago: p.medio, monto: p.montoCentavos / 100, referencia: p.referencia }))
  if (firmaManual(snap.pagos) !== firmaManual(pagos)) throw new Error('Pagos del snapshot inconsistentes')
  return { entrada, snapshot: { version: 1, id: entrada.checkoutId, kiosco_id: entrada.kioscoId, usuario_id: entrada.usuarioId,
    sesion_caja_id: entrada.sesionCajaId, fecha_hora: entrada.fechaHora, total: entrada.totalEsperado,
    notas: entrada.notas, cliente_id: entrada.clienteId, detalles, pagos } }
}

export function leerResultadoManual(value: unknown, snapshot: SnapshotCheckoutManual): ResultadoCheckoutManual {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resultado del cierre inválido')
  const res = objetoManual(value)
  camposManual(res, ['venta_id', 'kiosco_id', 'fecha_hora', 'total', 'stock', 'saldo_cliente'])
  if (res.venta_id !== snapshot.id || res.kiosco_id !== snapshot.kiosco_id || res.total !== snapshot.total
    || fechaManual(res.fecha_hora) !== snapshot.fecha_hora || !Array.isArray(res.stock)) throw new Error('Resultado del cierre inconsistente')
  const fisicos = new Set(snapshot.detalles.filter(d => !d.articulo_libre).flatMap(d =>
    d.componentes.length ? d.componentes.map(c => c.producto_id) : [d.producto_id]))
  const stock = res.stock.map(value => {
    const s = objetoManual(value)
    camposManual(s, ['producto_id', 'stock_actual'])
    const productoId = uuidManual(s.producto_id)
    if (!fisicos.delete(productoId)) throw new Error('Stock del resultado inconsistente')
    return { producto_id: productoId, stock_actual: numeroManual(s.stock_actual, 0, 999999999.999, 3) }
  })
  if (fisicos.size) throw new Error('Stock del resultado incompleto')
  const saldo = res.saldo_cliente === null ? null : numeroManual(res.saldo_cliente, -9999999999.99, 9999999999.99, 2)
  if (snapshot.pagos.some(p => p.medio_pago === 'CUENTA_CORRIENTE' && p.monto > 0) !== (saldo !== null)) throw new Error('Saldo del resultado inconsistente')
  return { venta_id: snapshot.id, kiosco_id: snapshot.kiosco_id, fecha_hora: snapshot.fecha_hora, total: snapshot.total, stock, saldo_cliente: saldo }
}
