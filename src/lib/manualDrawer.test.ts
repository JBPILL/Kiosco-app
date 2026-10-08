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
  mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { resolver = resolve }))
  const pendiente = solicitarAperturaManualCajon('Reponer cambio')
  expect((await solicitarAperturaManualCajon('Reponer cambio')).ok).toBe(false)
  resolver({ data: mocks.rpc.mock.calls[0][1].p_solicitud, error: null })
  await pendiente
  expect(mocks.abrir).toHaveBeenCalledTimes(1)
})

it('registra resultado declarado después del pulso', async () => {
  await solicitarAperturaManualCajon('Reponer cambio')
  expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'registrar_resultado_apertura_cajon', { p_solicitud: mocks.rpc.mock.calls[0][1].p_solicitud, p_resultado: 'PULSO_ENVIADO' })
  expect(mocks.abrir.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[1])
})
it('no repite el pulso si falla el registro posterior', async () => {
  mocks.rpc.mockImplementation((nombre, datos) => nombre === 'solicitar_apertura_manual_cajon'
    ? Promise.resolve({ data: datos.p_solicitud, error: null }) : Promise.reject(new Error('Conexión perdida')))
  const resultado = await solicitarAperturaManualCajon('Reponer cambio')
  expect(resultado.ok).toBe(true)
  expect(resultado.mensaje).toContain('no repitas')
  expect(mocks.abrir).toHaveBeenCalledTimes(1)
})
it('registra error de transporte sin presentarlo como apertura', async () => {
  mocks.abrir.mockResolvedValue({ ok: false })
  const resultado = await solicitarAperturaManualCajon('Reponer cambio')
  expect(resultado.ok).toBe(false)
  expect(mocks.rpc.mock.calls[1][1].p_resultado).toBe('ERROR_TRANSPORTE')
})
