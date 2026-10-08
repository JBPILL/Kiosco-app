/** Diagnóstico del servidor sin mensajes, solicitudes ni credenciales. */
export function registrarFalloCheckout(etapa: string, error: unknown): void {
  const valor = error && typeof error === 'object' ? (error as Record<string, unknown>).code : undefined
  const codigo = typeof valor === 'string' && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(valor) ? valor : 'SIN_CODIGO'
  const motivos: Record<string, string> = {
    'Snapshot de checkout inválido': 'SNAPSHOT_INVALIDO',
    'Identidad del snapshot inconsistente': 'IDENTIDAD_SNAPSHOT',
    'Comercio no habilitado': 'COMERCIO_NO_HABILITADO',
    'Usuario original no disponible': 'USUARIO_ORIGINAL_NO_DISPONIBLE',
    'Caja original no disponible para preparar': 'CAJA_ORIGINAL_NO_DISPONIBLE',
    'El identificador corresponde a otra entrada': 'IDENTIFICADOR_CONFLICTIVO',
    'La política cambió; repetí la cotización': 'POLITICA_CAMBIO',
    'Decisión de supervisor requerida': 'DECISION_SUPERVISOR_REQUERIDA',
    'Decisión de supervisor inconsistente': 'DECISION_SUPERVISOR_INCONSISTENTE',
  }
  const mensaje = error && typeof error === 'object' ? (error as Record<string, unknown>).message : undefined
  const motivo = typeof mensaje === 'string' && Object.hasOwn(motivos, mensaje) ? motivos[mensaje] : undefined
  console.error('CHECKOUT_DIAGNOSTICO', { etapa, codigo, ...(motivo ? { motivo } : {}) })
}
