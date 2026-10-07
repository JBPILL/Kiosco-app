import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useOfflineSyncStore } from './offlineSyncStore'
const mocks = vi.hoisted(() => ({ sincronizar: vi.fn(), from: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from } }))
vi.mock('../lib/manualCheckoutClient', () => ({ sincronizarCobrosManualesLocales: mocks.sincronizar }))
vi.mock('./authStore', () => ({ useAuthStore: { getState: () => ({ usuario: { id: 'u1', kiosco_id: 'k1' } }) } }))
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear()
  vi.stubEnv('VITE_CHECKOUT_MANUAL_TRANSACCIONAL', 'true')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  mocks.sincronizar.mockResolvedValue({ exitosas: 1, fallidas: 0 })
  useOfflineSyncStore.setState({ cola: [], sincronizando: false })
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

it('el modo nuevo sólo llama al cierre transaccional y no escribe tablas por separado', async () => {
  expect(await useOfflineSyncStore.getState().sincronizarCola('k1')).toEqual({ exitosas: 1, fallidas: 0 })
  expect(mocks.sincronizar).toHaveBeenCalledWith('k1', 'u1')
  expect(mocks.from).not.toHaveBeenCalled()
  expect(useOfflineSyncStore.getState().sincronizando).toBe(false)
})

it('conserva la cola antigua para conciliación sin adoptar ni volver a descontar ventas', async () => {
  localStorage.setItem('kioskopos_cola_offline_k1', JSON.stringify([{ id: 'antigua' }]))
  expect(await useOfflineSyncStore.getState().sincronizarCola('k1')).toEqual({ exitosas: 1, fallidas: 1 })
  expect(JSON.parse(localStorage.getItem('kioskopos_cola_offline_k1') || '[]')).toEqual([{ id: 'antigua' }])
  expect(mocks.from).not.toHaveBeenCalled()
})
