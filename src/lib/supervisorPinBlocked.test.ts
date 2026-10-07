import { expect, it } from 'vitest'
import { leerBloqueoSupervisor, SupervisorPinBloqueado } from './supervisorPinBlocked'

it('recupera sólo fecha pública de respuesta 429', async () => {
  const resultado = await leerBloqueoSupervisor({ context: new Response(JSON.stringify({ estado: 'BLOQUEADO', reintentarEn: '2026-10-07T12:00:00Z' }), { status: 429 }) })
  expect(resultado).toBeInstanceOf(SupervisorPinBloqueado)
  expect(resultado?.reintentarEn).toBe('2026-10-07T12:00:00.000Z')
})
it.each([null, { estado: 'BLOQUEADO', reintentarEn: 'ayer' }, { estado: 'BLOQUEADO', reintentarEn: '2026-10-07T12:00:00Z', pin: '1234' }, { error: 'SECRET_SQL' }])('no acepta respuesta malformada %#', async datos => {
  expect(await leerBloqueoSupervisor({ context: new Response(JSON.stringify(datos), { status: 429 }) })).toBeNull()
})
it('no interpreta otros estados HTTP ni contextos arbitrarios', async () => {
  expect(await leerBloqueoSupervisor({ context: new Response('{}', { status: 500 }) })).toBeNull()
  expect(await leerBloqueoSupervisor({ context: { status: 429 } })).toBeNull()
})
it('ignora contenido no JSON sin exponerlo', async () => {
  expect(await leerBloqueoSupervisor({ context: new Response('SECRET_SQL', { status: 429 }) })).toBeNull()
})
