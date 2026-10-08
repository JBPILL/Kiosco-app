// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { verificarCostosCajero } from '../../scripts/verificar-costos-cajero.mjs'

const id = '10000000-0000-0000-0000-000000000001'
const token = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.firma-sintetica`
const config = { url: 'https://proyecto.supabase.co', key: token('anon'), jwt: token('authenticated'), kioscoId: id }
const identidad = { id, role: 'authenticated' }
const perfil = [{ id, auth_user_id: id, kiosco_id: id, rol: 'CAJERO', activo: true }]
function respuestas(datos: unknown[]) {
  return vi.fn<typeof fetch>().mockImplementation(async () => {
    const dato = datos.shift()
    return new Response(JSON.stringify(dato), { status: 200,
      headers: Array.isArray(dato) ? { 'Content-Range': `*/${dato.length}` } : {} })
  })
}

it('verifica identidad por HTTP y sólo ejecuta GET sin publicar costos', async () => {
  const fetch = respuestas([identidad, perfil, [], [], [{ id, precio_costo: 0 }], []])
  const resultado = await verificarCostosCajero(config, fetch)
  expect(resultado.productosRevisados).toBe(1)
  expect(resultado.controles).toHaveLength(2)
  for (const [, opciones] of fetch.mock.calls) expect(opciones?.method).toBe('GET')
  expect(JSON.stringify(resultado)).not.toContain(config.jwt)
})

it.each(['https://otro.example.com', 'http://proyecto.supabase.co', 'https://proyecto.supabase.co/?token=secreto'])('rechaza origen incorrecto %s', async url => {
  const fetch = respuestas([])
  await expect(verificarCostosCajero({ ...config, url }, fetch)).rejects.toThrow('CONFIGURACION_INVALIDA')
  expect(fetch).not.toHaveBeenCalled()
})

it('rechaza service_role antes de enviar credenciales', async () => {
  const fetch = respuestas([])
  await expect(verificarCostosCajero({ ...config, key: token('service_role') }, fetch)).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
})

it('no considera un perfil dueño como comprobación de cajero', async () => {
  await expect(verificarCostosCajero(config, respuestas([identidad, [{ ...perfil[0], rol: 'DUEÑO' }]]))).rejects.toThrow('CONTEXTO_NO_CAJERO')
})

it('detecta exposición privada sin incluir el costo en el error', async () => {
  await expect(verificarCostosCajero(config, respuestas([identidad, perfil, [{ precio_costo: 987654 }]]))).rejects.toThrow('COSTOS_PRIVADOS_VISIBLES')
})

it('revisa todas las páginas de costos públicos', async () => {
  const primera = Array.from({ length: 1000 }, () => ({ id, precio_costo: 0 }))
  await expect(verificarCostosCajero(config, respuestas([identidad, perfil, [], [], primera, [{ id, precio_costo: 50 }]]))).rejects.toThrow('COSTO_PUBLICO_NO_NEUTRALIZADO')
})

it('no confunde sesión vencida ni tabla ausente con acceso denegado', async () => {
  const fetch = respuestas([identidad, perfil])
  fetch.mockResolvedValueOnce(new Response(JSON.stringify(identidad))).mockResolvedValueOnce(new Response(JSON.stringify(perfil), { headers: { 'Content-Range': '*/1' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'PGRST205' }), { status: 404 }))
  await expect(verificarCostosCajero(config, fetch)).rejects.toThrow('CONSULTA_NO_CONFIRMADA')
})

it('continúa después de una página menor al límite solicitado', async () => {
  const fetch = respuestas([identidad, perfil, [], [], [{ id, precio_costo: 0 }], [{ id, precio_costo: 50 }]])
  await expect(verificarCostosCajero(config, fetch)).rejects.toThrow('COSTO_PUBLICO_NO_NEUTRALIZADO')
  expect(String(fetch.mock.calls[5][0])).toContain('offset=1')
})

it('rechaza conteo ausente aunque la respuesta privada esté vacía', async () => {
  const fetch = respuestas([identidad, perfil])
  fetch.mockResolvedValueOnce(new Response(JSON.stringify(identidad)))
    .mockResolvedValueOnce(new Response(JSON.stringify(perfil), { headers: { 'Content-Range': '*/1' } }))
    .mockResolvedValueOnce(new Response('[]'))
  await expect(verificarCostosCajero(config, fetch)).rejects.toThrow('CONTEO_NO_CONFIRMADO')
})

it('acepta únicamente denegación 403 con código de permisos PostgreSQL', async () => {
  const fetch = respuestas([identidad, perfil])
  fetch.mockResolvedValueOnce(new Response(JSON.stringify(identidad)))
    .mockResolvedValueOnce(new Response(JSON.stringify(perfil), { headers: { 'Content-Range': '*/1' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: '42501' }), { status: 403 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: '42501' }), { status: 403 }))
    .mockResolvedValueOnce(new Response('[]'))
  expect((await verificarCostosCajero(config, fetch)).controles.every(c => c.resultado === 'DENEGADO')).toBe(true)
})

it('una sesión vencida en lectura de costos no produce un resultado verde', async () => {
  const fetch = respuestas([])
  fetch.mockResolvedValueOnce(new Response(JSON.stringify(identidad)))
    .mockResolvedValueOnce(new Response(JSON.stringify(perfil), { headers: { 'Content-Range': '*/1' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: '42501' }), { status: 401 }))
  await expect(verificarCostosCajero(config, fetch)).rejects.toThrow('CONSULTA_NO_CONFIRMADA')
})
