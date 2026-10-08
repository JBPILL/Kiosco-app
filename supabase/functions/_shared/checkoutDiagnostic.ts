/** Diagnóstico del servidor sin mensajes, solicitudes ni credenciales. */
export function registrarFalloCheckout(etapa: string, error: unknown): void {
  const valor = error && typeof error === 'object' ? (error as Record<string, unknown>).code : undefined
  const codigo = typeof valor === 'string' && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(valor) ? valor : 'SIN_CODIGO'
  console.error('CHECKOUT_DIAGNOSTICO', { etapa, codigo })
}
