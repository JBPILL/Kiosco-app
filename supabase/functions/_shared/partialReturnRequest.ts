export interface SolicitudDevolucionParcial {
  version: 1
  id: string
  ventaId: string
  sesionReintegroId: string | null
  metodo: 'EFECTIVO_CAJA' | 'CUENTA_CORRIENTE' | 'OTRO'
  motivo: 'CAMBIO_PRODUCTO' | 'FALLA_ROTURA' | 'VENCIDO' | 'ERROR_COBRO' | 'OTRO'
  notas: string | null
  items: { detalleId: string; cantidad: number; reingresaStock: boolean }[]
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function objeto(valor: unknown, claves: readonly string[]): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Solicitud de devolución inválida')
  const registro = valor as Record<string, unknown>
  if (Object.keys(registro).length !== claves.length || claves.some(clave => !Object.hasOwn(registro, clave))) {
    throw new Error('Campos de devolución inválidos')
  }
  return registro
}
function identificador(valor: unknown): string {
  if (typeof valor !== 'string' || !uuid.test(valor)) throw new Error('Identificador de devolución inválido')
  return valor.toLowerCase()
}

/** Sólo valida entrada. Autoridad, importes y relaciones se obtienen del servidor. */
export function parsearSolicitudDevolucionParcial(valor: unknown): SolicitudDevolucionParcial {
  const entrada = objeto(valor, ['version','id','ventaId','sesionReintegroId','metodo','motivo','notas','items'])
  if (entrada.version !== 1 || typeof entrada.metodo !== 'string' || typeof entrada.motivo !== 'string'
    || !['EFECTIVO_CAJA','CUENTA_CORRIENTE','OTRO'].includes(entrada.metodo)
    || !['CAMBIO_PRODUCTO','FALLA_ROTURA','VENCIDO','ERROR_COBRO','OTRO'].includes(entrada.motivo)) throw new Error('Tipo de devolución inválido')
  if (entrada.notas !== null && (typeof entrada.notas !== 'string' || entrada.notas.length > 1000)) throw new Error('Notas de devolución inválidas')
  const sesion = entrada.sesionReintegroId === null ? null : identificador(entrada.sesionReintegroId)
  if (entrada.metodo === 'EFECTIVO_CAJA' && !sesion) throw new Error('Se requiere caja para reintegro en efectivo')
  if (entrada.metodo !== 'EFECTIVO_CAJA' && sesion) throw new Error('Caja de reintegro no corresponde al medio')
  if (!Array.isArray(entrada.items) || entrada.items.length === 0 || entrada.items.length > 500) throw new Error('Detalles de devolución inválidos')
  const ids = new Set<string>()
  const items = entrada.items.map(valorItem => {
    const item = objeto(valorItem, ['detalleId','cantidad','reingresaStock'])
    const detalleId = identificador(item.detalleId)
    if (ids.has(detalleId) || typeof item.cantidad !== 'number' || !Number.isFinite(item.cantidad)
      || item.cantidad < 0.001 || item.cantidad > 999999 || Number(item.cantidad.toFixed(3)) !== item.cantidad
      || typeof item.reingresaStock !== 'boolean') throw new Error('Cantidad o detalle de devolución inválido')
    ids.add(detalleId)
    return { detalleId, cantidad: item.cantidad, reingresaStock: item.reingresaStock }
  }).sort((a,b) => a.detalleId < b.detalleId ? -1 : a.detalleId > b.detalleId ? 1 : 0)
  return {
    version: 1, id: identificador(entrada.id), ventaId: identificador(entrada.ventaId), sesionReintegroId: sesion,
    metodo: entrada.metodo as SolicitudDevolucionParcial['metodo'], motivo: entrada.motivo as SolicitudDevolucionParcial['motivo'],
    notas: entrada.notas as string | null, items,
  }
}
