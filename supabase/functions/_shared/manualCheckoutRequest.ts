import type { EntradaCheckoutManual } from '../../../src/types/checkoutManual.ts'
import type { MedioPago } from '../../../src/types/database.ts'
import { leerSolicitudCotizacionPoint } from './pointQuoteRequest.ts'

export function objetoManual(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Objeto de checkout inválido')
  return value as Record<string, unknown>
}
export function camposManual(value: Record<string, unknown>, campos: string[]): void {
  if (Object.keys(value).length !== campos.length || campos.some(key => !(key in value))) throw new Error('Campos de checkout inválidos')
}
export function uuidManual(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) throw new Error('Identificador inválido')
  return value.toLowerCase()
}
export function numeroManual(value: unknown, minimo: number, maximo: number, decimales = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimo || value > maximo
    || Math.abs(value * 10 ** decimales - Math.round(value * 10 ** decimales)) > 0.000001) throw new Error('Importe o cantidad inválida')
  return value
}
function textoNullable(value: unknown, maximo: number): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length > maximo) throw new Error('Texto de checkout inválido')
  return value
}
export function fechaManual(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) throw new Error('Fecha absoluta requerida')
  const [anio, mes, dia] = value.slice(0, 10).split('-').map(Number)
  const calendario = new Date(0)
  calendario.setUTCFullYear(anio, mes - 1, dia)
  if (calendario.getUTCFullYear() !== anio || calendario.getUTCMonth() !== mes - 1 || calendario.getUTCDate() !== dia
    || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) {
    throw new Error('Fecha absoluta requerida')
  }
  return new Date(value).toISOString()
}
export function firmaManual(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v
    const obj = v as Record<string, unknown>
    return Object.fromEntries(Object.keys(obj).sort().map(key => [key, obj[key]]))
  })
}

export function leerEntradaCheckoutManual(value: unknown): EntradaCheckoutManual {
  const obj = objetoManual(value)
  camposManual(obj, ['version', 'checkoutId', 'kioscoId', 'usuarioId', 'sesionCajaId', 'fechaHora', 'clienteId', 'notas',
    'tipoAjuste', 'valorAjuste', 'totalEsperado', 'subtotalesEsperados', 'componentesEsperados', 'lineas', 'pagos'])
  if (obj.version !== 1 || !Array.isArray(obj.pagos) || obj.pagos.length < 1 || obj.pagos.length > 20
    || !Array.isArray(obj.subtotalesEsperados) || !Array.isArray(obj.componentesEsperados) || obj.componentesEsperados.length > 10000) throw new Error('Checkout inválido')
  const id = uuidManual(obj.checkoutId)
  const cotizacion = leerSolicitudCotizacionPoint({ intentoId: id, checkoutId: id, clienteId: obj.clienteId,
    lineas: obj.lineas, pagos: [], tipoAjuste: obj.tipoAjuste, valorAjuste: obj.valorAjuste })
  const ids = cotizacion.lineas.map(l => l.id)
  if (new Set(ids).size !== ids.length || obj.subtotalesEsperados.length !== cotizacion.lineas.length) throw new Error('Detalle inválido')
  const totalEsperado = numeroManual(obj.totalEsperado, 0, 9999999999)
  const subtotalesEsperados = obj.subtotalesEsperados.map(v => numeroManual(v, -9999999999, 9999999999))
  if (subtotalesEsperados.reduce((a, b) => a + b, 0) !== totalEsperado) throw new Error('Detalle no coincide con el total')
  const medios: MedioPago[] = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'MERCADOPAGO', 'CUENTA_CORRIENTE']
  const pagos = obj.pagos.map((value): EntradaCheckoutManual['pagos'][number] => {
    const pago = objetoManual(value)
    camposManual(pago, ['id', 'medio', 'montoCentavos', 'referencia'])
    const medio = medios.find(m => m === pago.medio)
    const montoCentavos = numeroManual(pago.montoCentavos, totalEsperado > 0 ? 1 : 0, 999999999900)
    if (!medio || montoCentavos % 100 !== 0) throw new Error('Pago inválido')
    return { id: uuidManual(pago.id), medio, montoCentavos, referencia: textoNullable(pago.referencia, 500) }
  })
  if (new Set(pagos.map(p => p.id)).size !== pagos.length || pagos.reduce((a, b) => a + b.montoCentavos, 0) !== totalEsperado * 100) throw new Error('Pagos no coinciden con el total')
  const componentesEsperados = obj.componentesEsperados.map(value => {
    const comp = objetoManual(value)
    camposManual(comp, ['comboId', 'productoId', 'cantidad'])
    return { comboId: uuidManual(comp.comboId), productoId: uuidManual(comp.productoId), cantidad: numeroManual(comp.cantidad, 0.001, 999999, 3) }
  }).sort((a, b) => `${a.comboId}:${a.productoId}`.localeCompare(`${b.comboId}:${b.productoId}`))
  if (new Set(componentesEsperados.map(c => `${c.comboId}:${c.productoId}`)).size !== componentesEsperados.length) throw new Error('Receta repetida')
  return { version: 1, checkoutId: id, kioscoId: uuidManual(obj.kioscoId), usuarioId: uuidManual(obj.usuarioId),
    sesionCajaId: uuidManual(obj.sesionCajaId), fechaHora: fechaManual(obj.fechaHora), clienteId: cotizacion.clienteId,
    notas: textoNullable(obj.notas, 10000), tipoAjuste: cotizacion.tipoAjuste, valorAjuste: cotizacion.valorAjuste,
    totalEsperado, subtotalesEsperados, componentesEsperados, lineas: cotizacion.lineas, pagos }
}
