/** Activar sólo después de completar todas las rutas y aplicar la migración. */
export function auditoriaMotivoPrecioActiva(): boolean {
  return import.meta.env.VITE_AUDITORIA_MOTIVO_PRECIO === 'true'
}
