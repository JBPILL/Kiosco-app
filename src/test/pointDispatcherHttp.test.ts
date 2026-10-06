// @vitest-environment node
import { expect,it,vi } from 'vitest'
import { recibirDespachoPoint } from '../../supabase/functions/_shared/pointDispatcherHttp'
const secret = 'clave-de-prueba-privada-de-mas-de-32-caracteres'
const vacio = { tomados: 0,finalizados: 0,pendientes: 0,conciliacion: 0,errores: 0,reservasPerdidas: 0 }
const request = (token=secret,body='{}') => new Request('https://example.test/dispatch', {
  method: 'POST',headers: { authorization: `Bearer ${token}` },body,
})
it('autoriza sólo al trabajador y devuelve un resumen sin datos financieros', async () => {
  const ejecutar = vi.fn().mockResolvedValue(vacio)
  const result = await recibirDespachoPoint(request(), { secret,ejecutar })
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual(vacio)
  expect((await recibirDespachoPoint(request('incorrecta'), { secret,ejecutar })).status).toBe(401)
  expect(ejecutar).toHaveBeenCalledTimes(1)
})
it('rechaza instrucciones de cuenta, importes, JSON inválido y cuerpo excesivo', async () => {
  const ejecutar = vi.fn()
  for (const body of ['{"url":"https://otro.test"}','{"monto":100}','[]','null','no-json']) {
    expect((await recibirDespachoPoint(request(secret,body), { secret,ejecutar })).status).toBe(400)
  }
  expect((await recibirDespachoPoint(request(secret,' '.repeat(1025)), { secret,ejecutar })).status).toBe(413)
  expect(ejecutar).not.toHaveBeenCalled()
})
it('oculta errores privados y no trabaja con secreto ausente ni método incorrecto', async () => {
  const ejecutar = vi.fn().mockRejectedValue(new Error('token privado de Point'))
  const result = await recibirDespachoPoint(request(), { secret,ejecutar })
  expect(result.status).toBe(503)
  expect(await result.text()).not.toContain('token privado')
  expect((await recibirDespachoPoint(request(), { secret: '',ejecutar })).status).toBe(503)
  expect((await recibirDespachoPoint(new Request('https://example.test/dispatch'), { secret,ejecutar })).status).toBe(405)
})
