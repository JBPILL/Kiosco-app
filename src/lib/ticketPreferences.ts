/**
 * Módulo de preferencias globales para impresión y comprobantes térmicos.
 * Garantiza sincronización síncrona en tiempo real entre el Punto de Venta (POS),
 * el Cierre de Caja (Arqueo Z y X) y el generador de comprobantes PDF.
 */

export type AnchoPapelTicket = '58mm' | '80mm'

export const STORAGE_KEY_ANCHO_TICKET = 'kioskopos_ancho_ticket'

/**
 * Obtiene de forma síncrona y segura la preferencia de ancho de ticket térmico guardada.
 * Por defecto retorna '58mm', que es el formato más común en comanderas de kioscos y minimercados.
 */
export function getAnchoTicketGuardado(): AnchoPapelTicket {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ANCHO_TICKET)
      if (saved === '58mm' || saved === '80mm') {
        return saved
      }
    } catch (e) {
      console.warn('Error al leer STORAGE_KEY_ANCHO_TICKET:', e)
    }
  }
  return '58mm'
}

/**
 * Persiste la preferencia de ancho de ticket en localStorage y emite un evento personalizado
 * para que todos los modales y componentes activos actualicen su estado sin saltos visuales ni desfases.
 */
export function guardarAnchoTicket(ancho: AnchoPapelTicket): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_ANCHO_TICKET, ancho)
      window.dispatchEvent(
        new CustomEvent('kioskopos_ancho_ticket_change', { detail: ancho })
      )
    } catch (e) {
      console.warn('Error al guardar preferencia de ancho de ticket:', e)
    }
  }
}
