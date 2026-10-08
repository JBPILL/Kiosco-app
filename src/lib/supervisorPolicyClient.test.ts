import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { consultarPoliticaSupervisor, configurarPoliticaSupervisor } from './supervisorPolicyClient'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn(), auth: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc, auth: { getSession: mocks.session } } }))
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: mocks.auth } }))
const contexto = { usuario: { id: 'u1', auth_user_id: 'a1', kiosco_id: 'k1', activo: true, rol: 'DUEÑO' }, kiosco: { id: 'k1', estado_suscripcion: 'ACTIVO' } }
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockReturnValue(contexto)
  mocks.session.mockResolvedValue({ data: { session: { access_token: 'jwt', user: { id: 'a1' } } }, error: null })
  mocks.rpc.mockResolvedValue({ data: { umbralPorcentaje: 15, revision: 0 }, error: null })
})
afterEach(() => vi.restoreAllMocks())
it('consulta con sesión verificada sin enviar actor ni comercio', async () => {
  expect(await consultarPoliticaSupervisor()).toEqual({ umbralPorcentaje: 15, revision: 0 })
  expect(mocks.rpc).toHaveBeenCalledWith('consultar_politica_descuento_supervisor', {})
  expect(mocks.session).toHaveBeenCalledTimes(2)
})
it('rechaza sesión de otra identidad antes de llamar al servidor', async () => {
  mocks.session.mockResolvedValue({ data: { session: { access_token: 'jwt', user: { id: 'otra' } } } })
  await expect(consultarPoliticaSupervisor()).rejects.toThrow(/sesión/)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('cajero consulta pero no configura y valores inválidos no se envían', async () => {
  mocks.auth.mockReturnValue({ ...contexto, usuario: { ...contexto.usuario, rol: 'CAJERO' } })
  await consultarPoliticaSupervisor()
  await expect(configurarPoliticaSupervisor(25)).rejects.toThrow(/dueño/)
  mocks.auth.mockReturnValue(contexto); mocks.rpc.mockClear()
  await expect(configurarPoliticaSupervisor(100.1)).rejects.toThrow(/inválida/)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('descarta respuesta si el comercio cambia durante el guardado', async () => {
  mocks.rpc.mockImplementation(async () => {
    mocks.auth.mockReturnValue({ ...contexto, usuario: { ...contexto.usuario, kiosco_id: 'k2' }, kiosco: { ...contexto.kiosco, id: 'k2' } })
    return { data: { umbralPorcentaje: 25, revision: 1 }, error: null }
  })
  await expect(configurarPoliticaSupervisor(25)).rejects.toThrow(/sesión cambió/)
})
it('no comunica éxito si el valor confirmado difiere o contiene campos inesperados', async () => {
  mocks.rpc.mockResolvedValue({ data: { umbralPorcentaje: 20, revision: 1 }, error: null })
  await expect(configurarPoliticaSupervisor(25)).rejects.toThrow(/confirmar/)
  mocks.rpc.mockResolvedValue({ data: { umbralPorcentaje: 15, revision: 0, secreto: 'no' }, error: null })
  await expect(consultarPoliticaSupervisor()).rejects.toThrow(/inválida/)
})
