// @vitest-environment node
import { createHmac } from 'node:crypto'
import { expect, it } from 'vitest'
import { identificarNotificacionPoint, verificarFirmaPoint } from '../../supabase/functions/_shared/pointWebhook'

const secret = 'secreto-simulado'
const orderId = 'ORD123ABC'
const xRequestId = 'request-123'
const ts = '1742505638683'
const hash = createHmac('sha256', secret).update(`id:${orderId};request-id:${xRequestId};ts:${ts};`).digest('hex')
const xSignature = `ts=${ts},v1=${hash}`

it('valida HMAC compatible con el manifiesto oficial sin alterar el ID firmado', async () => {
  expect(await verificarFirmaPoint({ orderId, xRequestId, xSignature }, secret)).toBe(true)
  expect(await verificarFirmaPoint({ orderId: orderId.toLowerCase(), xRequestId, xSignature }, secret)).toBe(false)
})

it('rechaza cambios de orden, firma, request o secreto', async () => {
  for (const input of [
    { orderId: 'ORD999', xRequestId, xSignature },
    { orderId, xRequestId: 'otro', xSignature },
    { orderId, xRequestId, xSignature: `ts=${ts},v1=${'0'.repeat(64)}` },
  ]) expect(await verificarFirmaPoint(input, secret)).toBe(false)
  expect(await verificarFirmaPoint({ orderId, xRequestId, xSignature }, 'otro')).toBe(false)
})

it('rechaza firmas ausentes, duplicadas y multibyte sin excepciones', async () => {
  for (const firma of [null, '', `ts=${ts},ts=${ts},v1=${hash}`, `ts=${ts},v1=é${'a'.repeat(63)}`, `ts=no,v1=${hash}`]) {
    expect(await verificarFirmaPoint({ orderId, xRequestId, xSignature: firma }, secret)).toBe(false)
  }
})

it('solo devuelve el ID autenticado cuando el cuerpo corresponde a la misma orden', async () => {
  const request = (id: string) => new Request(`https://example.test/webhook?data.id=${orderId}`, {
    method: 'POST', headers: { 'x-signature': xSignature, 'x-request-id': xRequestId },
    body: JSON.stringify({ type: 'order', data: { id, status: 'processed' } }),
  })
  expect(await identificarNotificacionPoint(request(orderId), secret)).toBe(orderId)
  expect(await identificarNotificacionPoint(request('ORD999'), secret)).toBeNull()
})
