// Utilidades generales del sistema

/**
 * Formatea un número como precio argentino
 * Ejemplo: 2500.50 → "$2.500,50"
 */
export function formatPrecio(monto: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(monto)
}

/**
 * Formatea una fecha ISO a formato legible
 * Ejemplo: "2026-09-11T15:30:00" → "11/09/2026 15:30"
 */
export function formatFecha(fecha: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(fecha))
}

/**
 * Formatea solo la fecha sin hora
 * Ejemplo: "2026-09-11" → "11/09/2026"
 */
export function formatFechaCorta(fecha: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(fecha))
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
