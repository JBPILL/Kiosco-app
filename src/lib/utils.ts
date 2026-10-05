// Utilidades generales del sistema

/**
 * Formatea un número como precio argentino
 * Ejemplo: 2500.50 → "$2.500,50"
 */
export function formatPrecio(monto?: number | null): string {
  const val = typeof monto === 'number' && !isNaN(monto) ? monto : 0
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(val)
}

/**
 * Formatea un monto numérico según la convención argentina sin el signo $
 * Ejemplo: 2500.50 → "2.500,50", 10000 → "10.000"
 */
export function formatNumero(monto?: number | null): string {
  const val = typeof monto === 'number' && !isNaN(monto) ? monto : 0
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(val)
}

/**
 * Reduce el texto de una promoción para mostrar una etiqueta concisa y legible en tickets y carritos.
 * Ejemplos:
 * - "Promo 2x1 BIC Cristal Azul (3 gratis)" → "2x1"
 * - "15% OFF Goma Eva (Llevando 5+) (15% OFF x5+)" → "15% OFF"
 * - "2da al 50% Cuaderno Gloria 48h (25% OFF x2+)" → "2da al 50%"
 * - "Promo 3 Cartulinas x $700 ($233,33 c/u)" → "3 x $700"
 * - "3x2 Cerveza Quilmes" → "3x2"
 */
/**
 * Extrae un patrón explícito y conciso de promoción desde un texto o nombre.
 * Retorna etiquetas estandarizadas como "2x1", "15% OFF", "2da al 50%", "3 x $700", "Combo".
 * Si el texto no contiene ningún patrón de promoción reconocible, retorna null.
 */
export function extraerPatronPromo(texto?: string | null): string | null {
  if (!texto) return null
  const str = texto.trim()

  // 1. Patrón NxM (ej: 2x1, 3x2, 4x3) sin confundir con precios "3 x $700"
  const matchNxM = str.match(/\b(\d+)\s*[xX]\s*(\d+)\b/)
  if (matchNxM && !str.includes('$')) {
    const n1 = parseInt(matchNxM[1], 10)
    const n2 = parseInt(matchNxM[2], 10)
    if (n1 > 0 && n2 > 0 && n1 > n2 && n1 <= 20) {
      return `${n1}x${n2}`
    }
  }

  // 2. Patrón "2da al XX%" o "segunda al XX%"
  const match2da = str.match(/(?:2da|segunda)\s+al\s+\d+%/i)
  if (match2da) {
    return match2da[0]
  }

  // 3. Patrón Cantidad x $Precio (ej: "3 Cartulinas x $700", "3 x $700", "3x$700")
  const matchPack = str.match(/(\d+)\s*(?:[a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)?\s*[xX]\s*\$\s*([\d\.,]+)/)
  if (matchPack) {
    const cant = matchPack[1]
    const precio = matchPack[2]
    return `${cant} x $${precio}`
  }

  // 4. Patrón Porcentaje (ej: "15% OFF", "15% desc", "15%", "Descuento 15%")
  const matchPct = str.match(/\b(\d+)\s*%/)
  if (matchPct) {
    return `${matchPct[1]}% OFF`
  }

  // 5. Patrón Combo
  if (str.toLowerCase().startsWith('combo')) {
    const sinParentesis = str.replace(/\(.*?\)/g, '').trim()
    return sinParentesis.length <= 18 ? sinParentesis : 'Combo'
  }

  return null
}

/**
 * Obtiene la etiqueta concisa óptima para una promoción.
 * Si el nombre ya contiene un patrón explícito (ej: "15% OFF", "2x1"), lo usa.
 * Si el nombre es un título genérico (ej: "Boligrafos Bic cristal"), deriva la etiqueta
 * a partir de la configuración técnica de la promoción (ej: "15% OFF", "2x1", "3 x $700").
 */
export function obtenerEtiquetaPromocion(promo: {
  tipo?: string
  nombre?: string
  descuento_porcentaje?: number | null
  cantidad_minima?: number | null
  cantidad_paga?: number | null
  precio_unitario_promo?: number | null
  precio_combo?: number | null
}): string {
  // 1. Si el nombre tiene un patrón explícito, tiene máxima prioridad
  const patronEnNombre = extraerPatronPromo(promo.nombre)
  if (patronEnNombre) {
    return patronEnNombre
  }

  // 2. Si el tipo es PORCENTAJE
  if (promo.tipo === 'PORCENTAJE') {
    const pct = Number(promo.descuento_porcentaje) || 0
    return pct > 0 ? `${pct}% OFF` : 'Descuento'
  }

  // 3. Si el tipo es NXM
  if (promo.tipo === 'NXM') {
    const min = Number(promo.cantidad_minima || 2)
    const paga = Math.max(1, Number(promo.cantidad_paga ?? 1))
    return `${min}x${paga}`
  }

  // 4. Si el tipo es VOLUMEN
  if (promo.tipo === 'VOLUMEN') {
    const min = Number(promo.cantidad_minima || 2)
    if (promo.precio_unitario_promo && promo.precio_unitario_promo > 0) {
      const totalPack = Math.round(promo.precio_unitario_promo * min)
      return `${min} x $${totalPack.toLocaleString('es-AR')}`
    }
    if (promo.descuento_porcentaje && promo.descuento_porcentaje > 0) {
      return `${promo.descuento_porcentaje}% OFF`
    }
    return `Pack x${min}`
  }

  // 5. Si el tipo es COMBO
  if (promo.tipo === 'COMBO') {
    return formatearPromoTicket(promo.nombre) || 'Combo'
  }

  // 6. Fallback a formatearPromoTicket
  return formatearPromoTicket(promo.nombre)
}

/**
 * Reduce el texto de una promoción para mostrar una etiqueta concisa y legible en tickets y carritos.
 * Si el texto contiene un patrón reconocible (ej: 2x1, 15% OFF, 2da al 50%), lo extrae directamente.
 * Descarta textos truncados que no contengan patrones para permitir la inferencia limpia.
 */
export function formatearPromoTicket(nombre?: string | null): string {
  if (!nombre) return ''
  const patron = extraerPatronPromo(nombre)
  if (patron) return patron

  const str = nombre.trim()
  // Si fue un texto truncado como "Boligrafos Bic cri...", descartar
  if (str.endsWith('...')) {
    return ''
  }

  const limpio = str.replace(/\(.*?\)/g, '').trim()
  return limpio.length <= 15 ? limpio : ''
}

/**
 * Formatea una fecha ISO a formato legible
 * Ejemplo: "2026-09-11T15:30:00" → "11/09/2026 15:30"
 */
export function formatFecha(fecha?: string | null): string {
  if (!fecha) return '—'
  try {
    const d = new Date(fecha)
    if (isNaN(d.getTime())) return '—'
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return '—'
  }
}

/**
 * Formatea solo la fecha sin hora
 * Ejemplo: "2026-09-11" → "11/09/2026"
 */
export function formatFechaCorta(fecha?: string | null): string {
  if (!fecha) return '—'
  try {
    const d = new Date(fecha)
    if (isNaN(d.getTime())) return '—'
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d)
  } catch {
    return '—'
  }
}

/**
 * Calcula el vuelto de un pago en efectivo
 */
export function calcularVuelto(total: number, pagaCon: number): number {
  return Math.max(0, pagaCon - total)
}

/**
 * Genera un resumen del medio de pago para mostrar
 */
export function labelMedioPago(medio: string): string {
  const labels: Record<string, string> = {
    EFECTIVO: 'Efectivo',
    MERCADOPAGO: 'Mercado Pago',
    TRANSFERENCIA: 'Transferencia',
    TARJETA: 'Tarjeta',
    CUENTA_CORRIENTE: 'Cuenta Corriente',
  }
  return labels[medio] || medio
}

/**
 * Trunca un texto largo con puntos suspensivos
 */
export function truncar(texto: string, maxLength: number = 30): string {
  if (texto.length <= maxLength) return texto
  return texto.slice(0, maxLength) + '...'
}

/**
 * Clasifica el nivel de stock de un producto
 */
export function nivelStock(actual: number, minimo: number): 'ok' | 'bajo' | 'critico' | 'sin_stock' {
  if (actual <= 0) return 'sin_stock'
  if (actual <= minimo / 2) return 'critico'
  if (actual <= minimo) return 'bajo'
  return 'ok'
}

/**
 * Retorna la fecha local en formato YYYY-MM-DD sin desfasaje de zona horaria UTC.
 */
export function getFechaLocal(d: Date = new Date()): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Retorna los límites ISO en UTC para un día local (00:00:00.000 a 23:59:59.999).
 * Garantiza que las consultas a Supabase traigan exactamente todas las ventas del día local.
 */
export function getLimitesISODia(fechaYYYYMMDD: string): { inicioISO: string; finISO: string } {
  const [año, mes, dia] = fechaYYYYMMDD.split('-').map(Number)
  const inicio = new Date(año, mes - 1, dia, 0, 0, 0, 0)
  const fin = new Date(año, mes - 1, dia, 23, 59, 59, 999)
  return {
    inicioISO: inicio.toISOString(),
    finISO: fin.toISOString(),
  }
}

/**
 * Retorna los límites ISO en UTC para un rango de fechas locales (desde 00:00:00 hasta 23:59:59).
 */
export function getLimitesISORango(desdeYYYYMMDD: string, hastaYYYYMMDD: string): { inicioISO: string; finISO: string } {
  const [a1, m1, d1] = desdeYYYYMMDD.split('-').map(Number)
  const [a2, m2, d2] = hastaYYYYMMDD.split('-').map(Number)
  const inicio = new Date(a1, m1 - 1, d1, 0, 0, 0, 0)
  const fin = new Date(a2, m2 - 1, d2, 23, 59, 59, 999)
  return {
    inicioISO: inicio.toISOString(),
    finISO: fin.toISOString(),
  }
}

/**
 * Retorna la clave de almacenamiento local de productos para un kiosco determinado.
 */
export function getProductosCacheKey(kioscoId?: string | null): string {
  return kioscoId ? `kiosko_cache_productos_${kioscoId}` : 'kiosko_cache_productos'
}

function sinCostosEnCache(productos: any[]): any[] {
  return productos.map((producto) => ({ ...producto, precio_costo: 0 }))
}

/**
 * Lee la lista de productos cacheados para el kiosco activo con fallback a clave genérica.
 */
export function getCachedProductos(kioscoId?: string | null): any[] {
  if (typeof window === 'undefined') return []
  try {
    const key = getProductosCacheKey(kioscoId)
    const raw = localStorage.getItem(key) || (kioscoId ? localStorage.getItem('kiosko_cache_productos') : null)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const productosSeguros = sinCostosEnCache(parsed)
    const jsonSeguro = JSON.stringify(productosSeguros)
    if (jsonSeguro !== raw) {
      localStorage.setItem(key, jsonSeguro)
      localStorage.setItem('kiosko_cache_productos', jsonSeguro)
    }
    return productosSeguros
  } catch {
    return []
  }
}

/**
 * Guarda la lista de productos en la caché local asegurando coherencia multi-inquilino.
 */
export function saveCachedProductos(productos: any[], kioscoId?: string | null): void {
  if (typeof window === 'undefined') return
  try {
    const json = JSON.stringify(sinCostosEnCache(productos))
    const key = getProductosCacheKey(kioscoId)
    localStorage.setItem(key, json)
    // Sincronizar clave global como compatibilidad
    localStorage.setItem('kiosko_cache_productos', json)
  } catch (e) {
    console.warn('Error guardando productos en caché local:', e)
  }
}

/**
 * Limpia la caché local de productos tanto para el kiosco activo como la genérica.
 */
export function clearCachedProductos(kioscoId?: string | null): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem('kiosko_cache_productos')
    if (kioscoId) {
      localStorage.removeItem(getProductosCacheKey(kioscoId))
    }
  } catch {}
}

