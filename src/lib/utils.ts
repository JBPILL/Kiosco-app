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
export function formatearPromoTicket(nombre?: string | null): string {
  if (!nombre) return ''
  const str = nombre.trim()

  // 1. Patrón NxM (ej: 2x1, 3x2, 4x3) sin confundir con "3 x $700"
  const matchNxM = str.match(/\b(\d+\s*[xX]\s*\d+)\b/)
  if (matchNxM && !str.includes('$')) {
    return matchNxM[1].toLowerCase().replace(/\s+/g, '')
  }

  // 2. Patrón "2da al XX%" o "segunda al XX%"
  const match2da = str.match(/(?:2da|segunda)\s+al\s+\d+%/i)
  if (match2da) {
    return match2da[0]
  }

  // 3. Patrón Cantidad x $Precio (ej: "3 Cartulinas x $700", "3 x $700", "3x$700")
  const matchPack = str.match(/(\d+)\s*(?:[a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)?\s*[xX]\s*\$?\s*([\d\.,]+)/)
  if (matchPack) {
    const cant = matchPack[1]
    const precio = matchPack[2]
    return `${cant} x $${precio}`
  }

  // 4. Patrón Porcentaje OFF (ej: "15% OFF", "20% OFF")
  const matchOff = str.match(/\b(\d+%\s*OFF)\b/i)
  if (matchOff) {
    return matchOff[1].toUpperCase()
  }

  // 5. Patrón Porcentaje simple (ej: "15%", "25% de descuento")
  const matchPct = str.match(/\b(\d+%)\b/)
  if (matchPct && (str.toLowerCase().includes('off') || str.toLowerCase().includes('desc'))) {
    return `${matchPct[1]} OFF`
  }

  // 6. Patrón Combo
  if (str.toLowerCase().startsWith('combo')) {
    const sinParentesis = str.replace(/\(.*?\)/g, '').trim()
    return sinParentesis.length <= 18 ? sinParentesis : 'Combo'
  }

  // 7. Limpieza general: quitar paréntesis redundantes y acotar longitud
  let limpio = str.replace(/\(.*?\)/g, '').trim()
  if (limpio.length > 20) {
    limpio = limpio.slice(0, 18).trim() + '...'
  }
  return limpio || str
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

/**
 * Lee la lista de productos cacheados para el kiosco activo con fallback a clave genérica.
 */
export function getCachedProductos(kioscoId?: string | null): any[] {
  if (typeof window === 'undefined') return []
  try {
    const key = getProductosCacheKey(kioscoId)
    const raw = localStorage.getItem(key) || (kioscoId ? localStorage.getItem('kiosko_cache_productos') : null)
    return raw ? JSON.parse(raw) : []
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
    const json = JSON.stringify(productos)
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

