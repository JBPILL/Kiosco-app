import { beforeEach, expect, it, vi } from 'vitest'
import { cerrarCobroManualLocal, enviarCheckoutManual } from './manualCheckoutClient'
import { leerEntradaCheckoutManual } from '../../supabase/functions/_shared/manualCheckoutRequest'

const mocks = vi.hoisted(() => ({ getState: vi.fn(), getSession: vi.fn(), invoke: vi.fn() }))
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: mocks.getState } }))
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: mocks.getSession }, functions: { invoke: mocks.invoke } } }))
const kid = '10000000-0000-0000-0000-000000000001'
const uid = '20000000-0000-0000-0000-000000000001'
const authId = '30000000-0000-0000-0000-000000000001'
function entrada() {
  return leerEntradaCheckoutManual({ version: 1, checkoutId: '40000000-0000-0000-0000-000000000001', kioscoId: kid, usuarioId: uid,
    sesionCajaId: authId, fechaHora: '2026-10-07T12:00:00Z', clienteId: null, notas: null,
    tipoAjuste: 'NINGUNO', valorAjuste: 0, totalEsperado: 100, subtotalesEsperados: [100], componentesEsperados: [],
    lineas: [{ tipo: 'PRODUCTO', id: '60000000-0000-0000-0000-000000000001', productoId: '50000000-0000-0000-0000-000000000001', cantidad: 1, sinEnvase: false }],
    pagos: [{ id: '70000000-0000-0000-0000-000000000001', medio: 'EFECTIVO', montoCentavos: 10000, referencia: null }] })
}
function estado() {
  return { usuario: { id: uid, auth_user_id: authId, kiosco_id: kid, activo: true, rol: 'CAJERO' }, kiosco: { id: kid, estado_suscripcion: 'ACTIVO' } }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getState.mockReturnValue(estado())
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'SESSION_TOKEN', user: { id: authId } } }, error: null })
  mocks.invoke.mockResolvedValue({ data: { venta_id: entrada().checkoutId }, error: null })
})

it('envía sólo el cuerpo comercial y el JWT de la sesión actual', async () => {
  await enviarCheckoutManual(entrada())
  expect(mocks.invoke).toHaveBeenCalledWith('checkout-manual', {
    body: entrada(), headers: { Authorization: 'Bearer SESSION_TOKEN' },
  })
})

it.each(['usuario', 'comercio', 'inactivo', 'visor'])('impide enviar con contexto %s incorrecto', async caso => {
  const actual = estado()
  if (caso === 'usuario') actual.usuario.id = kid
  if (caso === 'comercio') actual.kiosco.id = uid
  if (caso === 'inactivo') actual.usuario.activo = false
  if (caso === 'visor') actual.usuario.rol = 'VISOR'
  mocks.getState.mockReturnValue(actual)
  await expect(enviarCheckoutManual(entrada())).rejects.toThrow(/sesión original/)
  expect(mocks.invoke).not.toHaveBeenCalled()
})

it.each([null, { access_token: 'TOKEN', user: { id: kid } }])('impide enviar sin JWT del operador original %#', async session => {
  mocks.getSession.mockResolvedValue({ data: { session }, error: null })
  await expect(enviarCheckoutManual(entrada())).rejects.toThrow(/sesión original/)
  expect(mocks.invoke).not.toHaveBeenCalled()
})

it('no divulga errores internos ni reenvía por su cuenta', async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: new Error('SECRET_SQL') })
  await expect(enviarCheckoutManual(entrada())).rejects.toThrow(/no vuelvas a cobrar/)
  expect(mocks.invoke).toHaveBeenCalledOnce()
})

it('también exige el contexto original para recuperar un cobro local', async () => {
  mocks.getState.mockReturnValue({ usuario: null, kiosco: null })
  await expect(cerrarCobroManualLocal(entrada(), 'ticket-1')).rejects.toThrow(/sesión original/)
  expect(mocks.invoke).not.toHaveBeenCalled()
})
