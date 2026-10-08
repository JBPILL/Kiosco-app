import { beforeEach, expect, it, vi } from 'vitest'
import { solicitarAperturaManualCajon } from './manualDrawer'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), abrir: vi.fn(), rol: 'DUEÑO', kiosco: 'k1' }))
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('./escposPrinter', () => ({ abrirCajonDineroDirecto: mocks.abrir }))
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: () => ({ usuario: { id: 'u1', auth_user_id: 'a1', activo: true, rol: mocks.rol, kiosco_id: mocks.kiosco } }) } }))
beforeEach(() => { mocks.rol = 'DUEÑO'; mocks.kiosco = 'k1'; mocks.rpc.mockReset().mockImplementation((_nombre, datos) => Promise.resolve({ data: datos.p_solicitud, error: null })); mocks.abrir.mockReset().mockResolvedValue({ ok: true }) })
it('autoriza con motivo antes del pulso y evita prometer apertura física', async () => {
  expect(await solicitarAperturaManualCajon(' Reponer cambio ')).toEqual({ ok: true, mensaje: 'Pulso enviado. Comprobá la apertura del cajón.' })
  expect(mocks.rpc.mock.calls[0][1].p_motivo).toBe('Reponer cambio')
  expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.abrir.mock.invocationCallOrder[0])
})
it('no abre ante rechazo remoto', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'SECRET' } })
  expect((await solicitarAperturaManualCajon('Reponer cambio')).ok).toBe(false)
  expect(mocks.abrir).not.toHaveBeenCalled()
})
it('no abre si cambia el comercio durante la autorización', async () => {
  mocks.rpc.mockImplementation((_nombre, datos) => { mocks.kiosco = 'k2'; return Promise.resolve({ data: datos.p_solicitud, error: null }) })
  expect((await solicitarAperturaManualCajon('Reponer cambio')).ok).toBe(false)
  expect(mocks.abrir).not.toHaveBeenCalled()
})
it('rechaza cajero y motivo corto sin RPC', async () => {
  await solicitarAperturaManualCajon('xx')
  mocks.rol = 'CAJERO'
  await solicitarAperturaManualCajon('Reponer cambio')
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(mocks.abrir).not.toHaveBeenCalled()
})
it('impide dos pulsos concurrentes', async () => {
  let resolver: (respuesta: { data: string; error: null }) => void = () => {}
  mocks.rpc.mockImplementation(() => new Promise(resolve => { resolver = resolve }))
  const pendiente = solicitarAperturaManualCajon('Reponer cambio')
  expect((await solicitarAperturaManualCajon('Reponer cambio')).ok).toBe(false)
  resolver({ data: mocks.rpc.mock.calls[0][1].p_solicitud, error: null })
  await pendiente
  expect(mocks.abrir).toHaveBeenCalledTimes(1)
})
