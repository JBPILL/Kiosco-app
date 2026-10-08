/** Activar sólo después de completar todas las rutas y aplicar la migración. */
export function auditoriaMotivoPrecioActiva(): boolean {
  return import.meta.env.VITE_AUDITORIA_MOTIVO_PRECIO === 'true'
}

export function validarMotivoCambioPrecio(valor: unknown): string {
  if (typeof valor !== 'string' || valor.trim().length < 5 || valor.trim().length > 300) {
    throw new Error('Indicá un motivo de cambio de precio de 5 a 300 caracteres.')
  }
  return valor.trim()
}
