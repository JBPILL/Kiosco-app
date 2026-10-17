import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { CONFIG_ADMIN_VACIA, useConfigAdminStore } from './configAdminStore'
import { ERROR_RECURSOS_COMERCIALES_FUERA_DE_ALCANCE } from '../lib/kioskPilotScope'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(),
  user: { id: 'admin', auth_user_id: 'auth-admin', activo: true, es_superadmin: true, rol: 'VISOR' } }))
vi.mock('../lib/supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }))
vi.mock('./authStore', () => ({ useAuthStore: { getState: () => ({ usuario: mocks.user }) } }))
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear()
  mocks.user.es_superadmin = true
  useConfigAdminStore.setState({ config: CONFIG_ADMIN_VACIA, cargando: false, guardando: false, error: null })
  vi.stubEnv('VITE_ADMIN_COMERCIAL_HABILITADO', 'false')
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
})
afterEach(() => vi.unstubAllEnvs())
it.each(['true','false'])('flag comercial false bloquea consultas/escrituras con strict=%s', async strict => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', strict)
  await useConfigAdminStore.getState().cargarConfig()
  expect(await useConfigAdminStore.getState().guardarConfig({ alias_mp: 'alias' })).toBe(false)
  expect(useConfigAdminStore.getState().error).toBe(ERROR_RECURSOS_COMERCIALES_FUERA_DE_ALCANCE)
  expect(mocks.from).not.toHaveBeenCalled()
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(localStorage.getItem('kiosko_config_admin')).toBeNull()
})
it('habilitado usa RPC y ACK, sin DML ni réplica oculta en planes', async () => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
  vi.stubEnv('VITE_ADMIN_COMERCIAL_HABILITADO', 'true')
  mocks.rpc.mockResolvedValueOnce({ data: CONFIG_ADMIN_VACIA, error: null })
    .mockResolvedValueOnce({ data: { success: true, config: { ...CONFIG_ADMIN_VACIA, alias_mp: 'alias' } }, error: null })
  await useConfigAdminStore.getState().cargarConfig()
  expect(await useConfigAdminStore.getState().guardarConfig({ alias_mp: 'alias' })).toBe(true)
  expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(['leer_configuracion_comercial','guardar_configuracion_comercial'])
  expect(mocks.from).not.toHaveBeenCalled()
  expect(useConfigAdminStore.getState().config.alias_mp).toBe('alias')
})
it('un rechazo no altera configuración ni informa éxito', async () => {
  vi.stubEnv('VITE_ADMIN_COMERCIAL_HABILITADO', 'true')
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'denied' } })
  expect(await useConfigAdminStore.getState().guardarConfig({ alias_mp: 'alias' })).toBe(false)
  expect(useConfigAdminStore.getState().config).toEqual(CONFIG_ADMIN_VACIA)
  expect(toast.success).not.toHaveBeenCalled()
})
it('Dueño no registra ni modifica instrucciones de pago', async () => {
  vi.stubEnv('VITE_ADMIN_COMERCIAL_HABILITADO', 'true')
  mocks.user.es_superadmin = false
  expect(await useConfigAdminStore.getState().guardarConfig({ alias_mp: 'alias' })).toBe(false)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
