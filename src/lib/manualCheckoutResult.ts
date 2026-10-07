import type { EntradaCheckoutManual, ResultadoCheckoutManual } from '../types/checkoutManual'
import { camposManual, fechaManual, numeroManual, objetoManual, uuidManual } from '../../supabase/functions/_shared/manualCheckoutRequest'

/** Validar antes de aceptar el cierre; nunca aplicar estos saldos como un decremento. */
export function validarResultadoCheckout(value: unknown, entrada: EntradaCheckoutManual): ResultadoCheckoutManual {
  const obj = objetoManual(value)
  camposManual(obj, ['venta_id', 'kiosco_id', 'fecha_hora', 'total', 'stock', 'saldo_cliente'])
  if (obj.venta_id !== entrada.checkoutId || obj.kiosco_id !== entrada.kioscoId || obj.total !== entrada.totalEsperado
    || fechaManual(obj.fecha_hora) !== entrada.fechaHora || !Array.isArray(obj.stock)) throw new Error('Confirmación de venta inconsistente')
  const esperados = new Set(entrada.lineas.flatMap(linea => {
    if (linea.tipo !== 'PRODUCTO') return []
    const componentes = entrada.componentesEsperados.filter(c => c.comboId === linea.productoId)
    return componentes.length ? componentes.map(c => c.productoId) : [linea.productoId]
  }))
  const stock = obj.stock.map(value => {
    const fila = objetoManual(value)
    camposManual(fila, ['producto_id', 'stock_actual'])
    const id = uuidManual(fila.producto_id)
    if (!esperados.delete(id)) throw new Error('Stock de confirmación inconsistente')
    return { producto_id: id, stock_actual: numeroManual(fila.stock_actual, 0, 999999999.999, 3) }
  })
  if (esperados.size) throw new Error('Confirmación de stock incompleta')
  const saldo = obj.saldo_cliente === null ? null : numeroManual(obj.saldo_cliente, -9999999999.99, 9999999999.99, 2)
  if (entrada.pagos.some(p => p.medio === 'CUENTA_CORRIENTE' && p.montoCentavos > 0) !== (saldo !== null)) throw new Error('Confirmación de deuda inconsistente')
  return { venta_id: entrada.checkoutId, kiosco_id: entrada.kioscoId, fecha_hora: entrada.fechaHora,
    total: entrada.totalEsperado, stock, saldo_cliente: saldo }
}
