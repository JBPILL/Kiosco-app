export interface ProductoEsperadoBackup {
  id: string
  campos: Record<string, string | number | boolean | null>
}

export interface PromocionEsperadaBackup {
  id: string
  campos: Record<string, unknown>
}

function valoresIguales(esperado: unknown, recibido: unknown): boolean {
  if (esperado === recibido) return true
  if (Array.isArray(esperado)) return Array.isArray(recibido) && esperado.length === recibido.length
    && esperado.every((valor, i) => valoresIguales(valor, recibido[i]))
  if (esperado && recibido && typeof esperado === 'object' && typeof recibido === 'object'
    && !Array.isArray(recibido)) {
    const a = esperado as Record<string, unknown>
    const b = recibido as Record<string, unknown>
    return Object.keys(a).length === Object.keys(b).length
      && Object.entries(a).every(([campo, valor]) => Object.hasOwn(b, campo) && valoresIguales(valor, b[campo]))
  }
  return false
}

export function verificarPromocionesBackup(esperados: readonly PromocionEsperadaBackup[], recibidos: unknown): number {
  if (!Array.isArray(recibidos)) throw new Error('No se recibieron promociones para verificar.')
  const promociones = new Map<string, Record<string, unknown>>()
  for (const valor of recibidos) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Promoción persistida inválida.')
    const fila = valor as Record<string, unknown>
    if (typeof fila.id !== 'string' || !fila.id || promociones.has(fila.id)) throw new Error('Identificadores de promociones inválidos.')
    promociones.set(fila.id, fila)
  }
  const ids = new Set<string>()
  for (const esperado of esperados) {
    if (!esperado.id || ids.has(esperado.id)) throw new Error('Identificadores esperados de promociones inválidos.')
    ids.add(esperado.id)
    const fila = promociones.get(esperado.id)
    if (!fila) throw new Error('No se encontró una promoción restaurada en el servidor.')
    for (const [campo, valor] of Object.entries(esperado.campos)) {
      if (!valoresIguales(valor, fila[campo])) throw new Error(`La restauración no conservó el campo ${campo} de una promoción.`)
    }
  }
  return esperados.length
}

/** Verifica también la relación al producto destino y las cantidades FEFO. */
export function verificarLotesBackup(esperados: readonly ProductoEsperadoBackup[], recibidos: unknown): number {
  if (!Array.isArray(recibidos)) throw new Error('No se recibieron los lotes para verificar la restauración.')
  const lotes = new Map<string, Record<string, unknown>>()
  for (const valor of recibidos) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Lotes de verificación inválidos.')
    const lote = valor as Record<string, unknown>
    if (typeof lote.id !== 'string' || !lote.id || lotes.has(lote.id)) throw new Error('Identificadores de lotes inválidos.')
    lotes.set(lote.id, lote)
  }
  const idsEsperados = new Set<string>()
  for (const esperado of esperados) {
    if (!esperado.id || idsEsperados.has(esperado.id)) throw new Error('Identificadores esperados de lotes inválidos.')
    idsEsperados.add(esperado.id)
    const lote = lotes.get(esperado.id)
    if (!lote) throw new Error('No se encontró un lote restaurado en el servidor.')
    for (const [campo, valor] of Object.entries(esperado.campos)) {
      if (typeof valor === 'number' && !Number.isFinite(valor)) throw new Error('Valor esperado de lote inválido.')
      if (lote[campo] !== valor) throw new Error(`La restauración no conservó el campo ${campo} de un lote.`)
    }
  }
  return esperados.length
}

/** Compara valores persistidos, sin exponer precios ni stock en mensajes de error. */
export function verificarProductosBackup(
  esperados: readonly ProductoEsperadoBackup[], recibidos: unknown
): number {
  if (!Array.isArray(recibidos)) throw new Error('No se recibió el catálogo para verificar la restauración.')
  const catalogo = new Map<string, Record<string, unknown>>()
  for (const valor of recibidos) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Catálogo de verificación inválido.')
    const producto = valor as Record<string, unknown>
    if (typeof producto.id !== 'string' || catalogo.has(producto.id)) throw new Error('Identificadores de verificación inválidos.')
    catalogo.set(producto.id,producto)
  }
  for (const esperado of esperados) {
    const producto = catalogo.get(esperado.id)
    if (!producto) throw new Error('No se encontró un producto restaurado en el servidor.')
    for (const [campo, valor] of Object.entries(esperado.campos)) {
      if (typeof valor === 'number' && !Number.isFinite(valor)) throw new Error('Valor esperado de restauración inválido.')
      if (producto[campo] !== valor) throw new Error(`La restauración no conservó el campo ${campo} de un producto.`)
    }
  }
  return esperados.length
}
