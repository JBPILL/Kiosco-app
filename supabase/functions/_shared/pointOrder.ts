/** Construye una orden desde un intento validado y guardado por el servidor. */
export interface PointOrderInput {
  intentoId: string
  terminalId: string
  montoCentavos: number
}

export interface PointOrderRequest {
  idempotencyKey: string
  body: {
    type: 'point'
    external_reference: string
    transactions: { payments: Array<{ amount: string }> }
    config: { point: { terminal_id: string; print_on_terminal: 'no_ticket' } }
  }
}

export function construirOrdenPoint(input: PointOrderInput): PointOrderRequest {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.intentoId)) {
    throw new Error('Identificador de intento inválido')
  }
  if (!Number.isSafeInteger(input.montoCentavos) || input.montoCentavos <= 0) {
    throw new Error('El monto debe expresarse en centavos enteros positivos')
  }
  if (!input.terminalId.trim() || input.terminalId !== input.terminalId.trim() || input.terminalId.length > 200) {
    throw new Error('Identificador de terminal inválido')
  }
  const pesos = Math.floor(input.montoCentavos / 100)
  const centavos = String(input.montoCentavos % 100).padStart(2, '0')
  return {
    idempotencyKey: input.intentoId.toLowerCase(),
    body: {
      type: 'point' as const,
      external_reference: input.intentoId.toLowerCase(),
      transactions: { payments: [{ amount: `${pesos}.${centavos}` }] },
      config: { point: { terminal_id: input.terminalId, print_on_terminal: 'no_ticket' as const } },
    },
  }
}
