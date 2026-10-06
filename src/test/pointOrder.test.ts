import { expect, it } from 'vitest'
import { construirOrdenPoint } from '../../supabase/functions/_shared/pointOrder'

const intentoId = '87d0a222-984e-40b8-a55c-309030d260ed'

it('crea un monto decimal exacto y conserva la clave para reintentos', () => {
  const input = { intentoId, terminalId: 'terminal-verificada', montoCentavos: 15001 }
  const orden = construirOrdenPoint(input)
  expect(orden).toEqual(construirOrdenPoint(input))
  expect(orden.idempotencyKey).toBe(intentoId)
  expect(orden.body.transactions.payments).toEqual([{ amount: '150.01' }])
  expect(orden.body.external_reference).toBe(intentoId)
  expect(orden.body.config.point.terminal_id).toBe(input.terminalId)
})

it('rechaza montos inválidos sin redondearlos silenciosamente', () => {
  for (const montoCentavos of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => construirOrdenPoint({ intentoId, terminalId: 'terminal', montoCentavos })).toThrow()
  }
})

it('rechaza referencias personales o terminales vacías', () => {
  expect(() => construirOrdenPoint({ intentoId: 'cliente@example.com', terminalId: 'terminal', montoCentavos: 1 })).toThrow()
  for (const terminalId of ['', ' ', ' terminal ']) {
    expect(() => construirOrdenPoint({ intentoId, terminalId, montoCentavos: 1 })).toThrow()
  }
})
