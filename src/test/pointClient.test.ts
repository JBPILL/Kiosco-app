import { expect, it, vi } from 'vitest'
import { PointApiClient, PointApiError } from '../../supabase/functions/_shared/pointClient'

const input = { intentoId: '87d0a222-984e-40b8-a55c-309030d260ed', terminalId: 'terminal', montoCentavos: 15000 }
const orden = { id: 'ORD123', status: 'created', external_reference: input.intentoId,
  type: 'point', user_id: 123, country_code: 'AR', config: { point: { terminal_id: 'terminal' } },
  transactions: { payments: [{ id: 'PAY123', status: 'created', amount: '150.00', paid_amount: '150.00', status_detail: 'created' }] } }

it('envía la orden al endpoint fijo con clave estable y recupera sus identificadores', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(orden)))
  const cliente = new PointApiClient('credencial-simulada', fetchMock)
  expect(await cliente.crear(input)).toMatchObject({ id: 'ORD123', status: 'created', type: 'point',
    accountId: '123', terminalId: 'terminal', countryCode: 'AR',
    payments: [{ id: 'PAY123', amount: '150.00', paidAmount: '150.00', statusDetail: 'created' }] })
  expect(fetchMock).toHaveBeenCalledWith('https://api.mercadopago.com/v1/orders', expect.objectContaining({
    method: 'POST', redirect: 'error', headers: expect.objectContaining({ 'X-Idempotency-Key': input.intentoId }),
  }))
})

it('conserva cancelación en curso cuando el proveedor devuelve 202', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...orden, status: 'at_terminal' }), { status: 202 }))
  const resultado = await new PointApiClient('simulada', fetchMock).cancelar('ORD123', 'cancelar_123')
  expect(resultado.status).toBe('at_terminal')
  expect(fetchMock).toHaveBeenCalledWith('https://api.mercadopago.com/v1/orders/ORD123/cancel', expect.objectContaining({
    headers: expect.objectContaining({ 'x-allow-cancelable-status': 'at_terminal', 'X-Idempotency-Key': 'cancelar_123' }),
  }))
})

it('no expone cuerpos del proveedor ni mensajes de red que puedan contener secretos', async () => {
  for (const response of [new Response('secreto', { status: 503 }), new Response('no es JSON')]) {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response)
    await expect(new PointApiClient('secreto', fetchMock).consultar('ORD123')).rejects.toMatchObject({ resultadoIncierto: true })
  }
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('secreto del proveedor'))
  await expect(new PointApiClient('secreto', fetchMock).consultar('ORD123')).rejects.toThrow('No se pudo confirmar la respuesta de Point')
})

it('rechaza rutas manipuladas y respuestas sin identificadores', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ status: 'processed' })))
  const cliente = new PointApiClient('simulada', fetchMock)
  await expect(cliente.consultar('../secretos')).rejects.toThrow('Identificador')
  expect(fetchMock).not.toHaveBeenCalled()
  await expect(cliente.consultar('ORD123')).rejects.toBeInstanceOf(PointApiError)
})
