// @vitest-environment node
import { createHmac } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { recibirWebhookPoint } from '../../supabase/functions/_shared/pointWebhookHandler'

const secret = 'simulado'
const ts = '1742505638683'
const firma = createHmac('sha256', secret).update(`id:ORD123;request-id:req-123;ts:${ts};`).digest('hex')
const request = (signature = `ts=${ts},v1=${firma}`) => new Request('https://example.test/point?data.id=ORD123', {
  method: 'POST', headers: { 'x-signature': signature, 'x-request-id': 'req-123' },
  body: JSON.stringify({ type: 'order', data: { id: 'ORD123', status: 'processed' } }),
})

it('guarda la recepción autenticada antes de responder éxito', async () => {
  const guardar = vi.fn().mockResolvedValue(undefined)
  const response = await recibirWebhookPoint(request(), { secret, applicationId: '123', guardar })
  expect(response.status).toBe(200)
  expect(guardar).toHaveBeenCalledWith({ applicationId: '123', orderId: 'ORD123', requestId: 'req-123', timestamp: ts })
})

it('no confirma recepción si falla la persistencia ni expone detalles del error', async () => {
  const guardar = vi.fn().mockRejectedValue(new Error('credencial privada'))
  const response = await recibirWebhookPoint(request(), { secret, applicationId: '123', guardar })
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('credencial')
})

it('rechaza firmas inválidas antes de escribir', async () => {
  const guardar = vi.fn()
  const response = await recibirWebhookPoint(request('inválida'), { secret, applicationId: '123', guardar })
  expect(response.status).toBe(401)
  expect(guardar).not.toHaveBeenCalled()
})

it('rechaza un endpoint sin configurar o un método distinto de POST', async () => {
  const guardar = vi.fn()
  expect((await recibirWebhookPoint(request(), { secret: '', applicationId: '123', guardar })).status).toBe(503)
  expect((await recibirWebhookPoint(new Request('https://example.test'), { secret, applicationId: '123', guardar })).status).toBe(405)
  expect(guardar).not.toHaveBeenCalled()
})
