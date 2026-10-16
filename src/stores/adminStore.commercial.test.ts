import { beforeEach, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { useAdminStore } from './adminStore'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(),
  user: { id: 'admin', auth_user_id: 'auth-admin', activo: true, es_superadmin: true, rol: 'VISOR' } }))
vi.mock('../lib/supabase', () => ({ supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } } }))
vi.mock('./authStore', () => ({ useAuthStore: { getState: () => ({ usuario: mocks.user }) } }))
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear()
  vi.stubEnv('VITE_ADMIN_COMERCIAL_HABILITADO', 'true')
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
  mocks.user.es_superadmin = true
  useAdminStore.setState({ kioscos: [], planes: [], todosLosPagos: [], cargando: false, cargandoAccion: false, error: null })
  mocks.rpc.mockImplementation(async name => name === 'leer_administracion_comercial'
    ? { data: { kioscos: [], planes: [], pagos: [] }, error: null }
    : { data: { success: true }, error: null })
})
it('renovación con ACK perdido reutiliza ID/cuerpo y no simula éxito', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'transport' } })
  expect(await useAdminStore.getState().renovarSuscripcion('k1', 1, 100, 'EFECTIVO')).toBe(false)
  expect(toast.success).not.toHaveBeenCalled()
  const first = mocks.rpc.mock.calls[0][1]
  expect(await useAdminStore.getState().renovarSuscripcion('k1', 1, 100, 'EFECTIVO')).toBe(true)
  expect(mocks.rpc.mock.calls[1][1]).toEqual(first)
})
it('no cambia monto mientras la solicitud original está pendiente', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'network' } })
  await useAdminStore.getState().renovarSuscripcion('k1', 1, 100, 'EFECTIVO')
  expect(await useAdminStore.getState().renovarSuscripcion('k1', 1, 200, 'EFECTIVO')).toBe(false)
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
})
it('un actor no SuperAdmin no envía mutaciones', async () => {
  mocks.user.es_superadmin = false
  expect(await useAdminStore.getState().cambiarEstadoKiosco('k1', 'ACTIVO')).toBe(false)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('flag comercial false no consulta ni muta, aunque strict sea false', async () => {
  vi.stubEnv('VITE_ADMIN_COMERCIAL_HABILITADO', 'false')
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'false')
  await useAdminStore.getState().cargarDatosAdmin()
  expect(await useAdminStore.getState().renovarSuscripcion('k1', 1, 100, 'EFECTIVO')).toBe(false)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('sin almacenamiento durable no envía solicitudes', async () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  try {
    expect(await useAdminStore.getState().renovarSuscripcion('k1', 1, 100, 'EFECTIVO')).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  } finally { spy.mockRestore() }
})
it('provisioning usa Edge y no persiste contraseña; retry conserva operation ID', async () => {
  const payload = { nombreKiosco: 'Local', nombreDueno: 'Dueño', emailDueno: 'owner@example.test',
    passwordDueno: 'synthetic-test-password', planId: 'plan', diasValidez: 30 }
  mocks.invoke.mockResolvedValueOnce({ data: null, error: { message: 'transport' } })
    .mockResolvedValueOnce({ data: { success: true }, error: null })
  expect(await useAdminStore.getState().crearKioscoCliente(payload)).toBe(false)
  expect(JSON.stringify(localStorage)).not.toContain(payload.passwordDueno)
  expect(await useAdminStore.getState().crearKioscoCliente(payload)).toBe(true)
  expect(mocks.invoke.mock.calls[1]).toEqual(mocks.invoke.mock.calls[0])
  expect(mocks.invoke.mock.calls[0][0]).toBe('provision-commerce')
})
it('un nuevo plan conserva product/operation identity tras respuesta perdida', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'transport' } })
  expect(await useAdminStore.getState().crearPlan('Plan', 0)).toBe(false)
  expect(await useAdminStore.getState().crearPlan('Plan', 0)).toBe(true)
  expect(mocks.rpc.mock.calls[0][1].p_plan_id).toBe(mocks.rpc.mock.calls[0][1].p_operacion_id)
  expect(mocks.rpc.mock.calls[1][1]).toEqual(mocks.rpc.mock.calls[0][1])
})
