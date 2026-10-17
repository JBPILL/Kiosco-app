// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { CommerceFailure, provisionCommerceHttp } from '../../supabase/functions/_shared/provisionCommerceHttp'
import type { CommerceDependencies } from '../../supabase/functions/_shared/provisionCommerceHttp'
const body = { operacionId: 'bb000000-0000-4000-8000-000000000001', planId: 'bb000000-0000-4000-8000-000000000002',
  email: 'owner@example.test', password: 'synthetic-for-tests-only', nombreDueno: 'Dueño', nombreKiosco: 'Local', diasValidez: 30 }
let deps: CommerceDependencies
const request = (value: unknown = body, origin = 'https://allowed.example') => new Request('https://edge.example/provision-commerce', {
  method: 'POST', headers: { authorization: 'Bearer test-session', 'content-type': 'application/json', origin }, body: JSON.stringify(value),
})
beforeEach(() => {
  deps = { allowedOrigins: ['https://allowed.example'],
    authenticate: vi.fn().mockResolvedValue({ authId: 'actor', superadmin: true }),
    reserve: vi.fn().mockResolvedValue({ estado: 'IN_PROGRESS', claimed: true }),
    createAuth: vi.fn().mockResolvedValue('new-auth'), transition: vi.fn().mockImplementation(async (_op, _actor, estado) => ({ estado })),
    finalize: vi.fn().mockResolvedValue({ success: true, kiosco_id: 'server-kiosk' }), deleteAuth: vi.fn().mockResolvedValue(undefined) }
})
it('sólo SuperAdmin puede crear comercio', async () => {
  vi.mocked(deps.authenticate).mockResolvedValue({ authId: 'owner', superadmin: false })
  expect((await provisionCommerceHttp(request(), deps)).status).toBe(403)
  expect(deps.reserve).not.toHaveBeenCalled()
})
it.each([{ ...body, rol: 'SUPERADMIN' }, { ...body, kiosco_id: 'chosen' }, { ...body, extra: true }, { ...body, diasValidez: 0 }])('rechaza cuerpos no autorizados', async value => {
  expect((await provisionCommerceHttp(request(value), deps)).status).toBe(400)
  expect(deps.createAuth).not.toHaveBeenCalled()
})
it('rechaza origen y cuerpos excesivos antes de efectos', async () => {
  expect((await provisionCommerceHttp(request(body, 'https://denied.example'), deps)).status).toBe(403)
  expect((await provisionCommerceHttp(request({ ...body, nombreKiosco: 'x'.repeat(9000) }), deps)).status).toBe(400)
  expect(deps.reserve).not.toHaveBeenCalled()
})
it('ACK confirma; reserva/auditoría no reciben contraseña', async () => {
  const result = await provisionCommerceHttp(request(), deps)
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({ success: true, kiosco_id: 'server-kiosk' })
  expect(vi.mocked(deps.reserve).mock.calls[0][1]).not.toHaveProperty('password')
  expect(deps.deleteAuth).not.toHaveBeenCalled()
})
it('replay terminado no vuelve a crear Auth', async () => {
  vi.mocked(deps.reserve).mockResolvedValue({ estado: 'PASS', claimed: false, resultado: { success: true } })
  expect((await provisionCommerceHttp(request(), deps)).status).toBe(200)
  expect(deps.createAuth).not.toHaveBeenCalled()
  expect(deps.finalize).not.toHaveBeenCalled()
})
it('fallo Auth inequívoco marca FAILED y no crea datos ni borra identidades ajenas', async () => {
  vi.mocked(deps.createAuth).mockRejectedValue(new CommerceFailure(true))
  expect((await provisionCommerceHttp(request(), deps)).status).toBe(503)
  expect(deps.transition).toHaveBeenCalledWith(body.operacionId, 'actor', 'FAILED')
  expect(deps.finalize).not.toHaveBeenCalled()
  expect(deps.deleteAuth).not.toHaveBeenCalled()
})
it('fallo de perfil confirmado reclama compensación antes de borrar su propia identidad', async () => {
  vi.mocked(deps.finalize).mockRejectedValue(new CommerceFailure(true))
  expect((await provisionCommerceHttp(request(), deps)).status).toBe(409)
  expect(deps.transition).toHaveBeenCalledWith(body.operacionId, 'actor', 'COMPENSATING', 'new-auth')
  expect(deps.deleteAuth).toHaveBeenCalledWith('new-auth')
  expect(deps.transition).toHaveBeenCalledWith(body.operacionId, 'actor', 'FAILED', 'new-auth')
})
it('respuesta incierta nunca borra Auth automáticamente', async () => {
  vi.mocked(deps.finalize).mockRejectedValue(new CommerceFailure(false))
  expect((await provisionCommerceHttp(request(), deps)).status).toBe(503)
  expect(deps.deleteAuth).not.toHaveBeenCalled()
  expect(deps.transition).toHaveBeenCalledWith(body.operacionId, 'actor', 'UNCERTAIN')
})
it('si compensación falla queda TAINTED explícito', async () => {
  vi.mocked(deps.finalize).mockRejectedValue(new CommerceFailure(true))
  vi.mocked(deps.deleteAuth).mockRejectedValue(new Error('transport'))
  const result = await provisionCommerceHttp(request(), deps)
  expect(result.status).toBe(409)
  expect((await result.json()).error).toContain('TAINTED')
})
it('si ya hubo commit recupera ACK y no compensa', async () => {
  vi.mocked(deps.finalize).mockRejectedValue(new CommerceFailure(true))
  vi.mocked(deps.transition).mockImplementation(async (_op, _actor, action) => action === 'COMPENSATING'
    ? { estado: 'PASS', resultado: { success: true } } : { estado: action })
  expect((await provisionCommerceHttp(request(), deps)).status).toBe(200)
  expect(deps.deleteAuth).not.toHaveBeenCalled()
})
