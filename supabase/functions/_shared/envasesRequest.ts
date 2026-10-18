type DatosEnvase =
  | { accion: 'CONFIGURAR_TIPO'; datos: { nombre: string; precio: number; activo: boolean } }
  | { accion: 'AJUSTAR_SALDO'; datos: { stockEsperado: number; nuevoStock: number; notas: string | null } }
  | { accion: 'ENTREGAR_DISTRIBUIDOR'; datos: { cantidad: number; distribuidor: string; notas: string | null } }
  | { accion: 'RECIBIR_EFECTIVO'; datos: { cantidad: number; sesionCajaId: string; precioEsperado: number; notas: string | null } }
export type SolicitudEnvase = { version: 1; id: string; tipoId: string } & DatosEnvase
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function uuidEnvase(valor: unknown): string {
  if (typeof valor !== 'string' || !UUID.test(valor)) throw new Error('Identificador de envases inválido')
  return valor.toLowerCase()
}
function objeto(valor: unknown, claves: string[]): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Solicitud de envases inválida')
  const fila = valor as Record<string, unknown>
  if (Object.keys(fila).length !== claves.length || claves.some(clave => !Object.hasOwn(fila, clave))) throw new Error('Campos de envases inválidos')
  return fila
}
function texto(valor: unknown, limite: number): string {
  if (typeof valor !== 'string' || !valor.trim() || valor !== valor.trim() || valor.length > limite) throw new Error('Texto de envases inválido')
  return valor
}
function entero(valor: unknown, minimo: number, maximo: number): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < minimo || valor > maximo) throw new Error('Cantidad de envases inválida')
  return valor
}
function precio(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 9999999999.99 || Number(valor.toFixed(2)) !== valor) throw new Error('Precio de envases inválido')
  return valor
}
function notas(valor: unknown): string | null {
  if (valor === null) return null
  if (typeof valor !== 'string' || valor.length > 1000) throw new Error('Notas de envases inválidas')
  return valor
}
/** No acepta actor, comercio ni importe: los resuelve el servidor autenticado. */
export function parsearSolicitudEnvase(valor: unknown): SolicitudEnvase {
  const s = objeto(valor, ['version', 'id', 'accion', 'tipoId', 'datos'])
  if (s.version !== 1) throw new Error('Versión de envases inválida')
  const base = { version: 1 as const, id: uuidEnvase(s.id), tipoId: texto(s.tipoId, 150) }
  switch (s.accion) {
    case 'CONFIGURAR_TIPO': {
      const d = objeto(s.datos, ['nombre', 'precio', 'activo'])
      if (typeof d.activo !== 'boolean') throw new Error('Estado de envase inválido')
      return { ...base, accion: s.accion, datos: { nombre: texto(d.nombre, 150), precio: precio(d.precio), activo: d.activo } }
    }
    case 'AJUSTAR_SALDO': {
      const d = objeto(s.datos, ['stockEsperado', 'nuevoStock', 'notas'])
      return { ...base, accion: s.accion, datos: { stockEsperado: entero(d.stockEsperado, 0, 999999999), nuevoStock: entero(d.nuevoStock, 0, 999999999), notas: notas(d.notas) } }
    }
    case 'ENTREGAR_DISTRIBUIDOR': {
      const d = objeto(s.datos, ['cantidad', 'distribuidor', 'notas'])
      return { ...base, accion: s.accion, datos: { cantidad: entero(d.cantidad, 1, 999999), distribuidor: texto(d.distribuidor, 150), notas: notas(d.notas) } }
    }
    case 'RECIBIR_EFECTIVO': {
      const d = objeto(s.datos, ['cantidad', 'sesionCajaId', 'precioEsperado', 'notas'])
      const cantidad = entero(d.cantidad, 1, 999999), esperado = precio(d.precioEsperado)
      if (esperado <= 0 || cantidad * esperado > 9999999999.99) throw new Error('Importe de envases inválido')
      return { ...base, accion: s.accion, datos: { cantidad, sesionCajaId: uuidEnvase(d.sesionCajaId), precioEsperado: esperado, notas: notas(d.notas) } }
    }
    default: throw new Error('Operación de envases inválida')
  }
}
