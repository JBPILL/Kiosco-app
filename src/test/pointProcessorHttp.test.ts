// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { recibirProcesoPoint } from '../../supabase/functions/_shared/pointProcessorHttp'

const secret = 'clave-simulada-de-servidor-de-32-caracteres'
const notificationId = '10000000-0000-0000-0000-000000000001'
const request = (token = secret, body: unknown = { notificationId }) => new Request('https://example.test/worker', {
  method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body),
})

it('procesa solo con clave correcta e identidad de recepción válida', async () => {
  const ejecutar = vi.fn().mockResolvedValue({ estadoPersistido: 'PENDIENTE', estadoEvaluado: 'PENDIENTE' })
  expect((await recibirProcesoPoint(request(), { secret, ejecutar })).status).toBe(200)
  expect(ejecutar).toHaveBeenCalledWith(notificationId)
})

it('rechaza clave inválida e IDs manipulados antes de ejecutar', async () => {
  const ejecutar = vi.fn()
  expect((await recibirProcesoPoint(request('otra'), { secret, ejecutar })).status).toBe(401)
  expect((await recibirProcesoPoint(request(secret, { notificationId: '../otro' }), { secret, ejecutar })).status).toBe(400)
  expect(ejecutar).not.toHaveBeenCalled()
})

it('mantiene errores internos privados y no confirma una escritura fallida', async () => {
  const ejecutar = vi.fn().mockRejectedValue(new Error('token-privado'))
  const response = await recibirProcesoPoint(request(), { secret, ejecutar })
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('token-privado')
})
