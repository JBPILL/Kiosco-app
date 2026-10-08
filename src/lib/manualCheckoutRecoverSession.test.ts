import { afterEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), estado: {
  usuario: { id: 'perfil', auth_user_id: 'identidad-original', activo: true, rol: 'DUEÑO', kiosco_id: 'comercio' },
  kiosco: { id: 'comercio' },
} }))
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: () => mocks.estado } }))
import { recuperarEntradaRemota } from './manualCheckoutRemote'

const cobro = { id: 'pendiente', kioscoId: 'comercio', usuarioId: 'operador', sesionCajaId: 'caja', fechaHora: '2026-10-08T12:00:00Z', total: 100 }
afterEach(() => {
  mocks.rpc.mockReset()
  mocks.estado.usuario = { id: 'perfil', auth_user_id: 'identidad-original', activo: true, rol: 'DUEÑO', kiosco_id: 'comercio' }
  mocks.estado.kiosco = { id: 'comercio' }
})

it('rechaza un dueño sin identidad de autenticación antes de consultar', async () => {
  mocks.estado.usuario = { ...mocks.estado.usuario, auth_user_id: '' }
  await expect(recuperarEntradaRemota(cobro)).rejects.toThrow('Se requiere sesión del dueño')
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it.each(['identidad', 'perfil', 'rol', 'activo', 'comercio'])('descarta una respuesta si cambia %s durante la recuperación', async cambio => {
  let responder!: (value: { data: null; error: null }) => void
  mocks.rpc.mockReturnValue(new Promise(resolve => { responder = resolve }))
  const pendiente = recuperarEntradaRemota(cobro)
  const rechazo = expect(pendiente).rejects.toThrow('Pendiente no disponible')
  if (cambio === 'identidad') mocks.estado.usuario = { ...mocks.estado.usuario, auth_user_id: 'otra-identidad' }
  if (cambio === 'perfil') mocks.estado.usuario = { ...mocks.estado.usuario, id: 'otro-perfil' }
  if (cambio === 'rol') mocks.estado.usuario = { ...mocks.estado.usuario, rol: 'CAJERO' }
  if (cambio === 'activo') mocks.estado.usuario = { ...mocks.estado.usuario, activo: false }
  if (cambio === 'comercio') mocks.estado.kiosco = { id: 'otro-comercio' }
  responder({ data: null, error: null })
  await rechazo
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
})
