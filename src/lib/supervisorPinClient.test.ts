import { beforeEach, expect, it, vi } from 'vitest'
import { autorizarDescuentoSupervisor, configurarPinSupervisor, consultarPinSupervisor } from './supervisorPinClient'
import { leerEntradaCheckoutManual } from '../../supabase/functions/_shared/manualCheckoutRequest'

const mocks = vi.hoisted(() => ({ estado: vi.fn(), sesion: vi.fn(), invoke: vi.fn(), guardar: vi.fn() }))
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: mocks.estado } }))
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: mocks.sesion }, functions: { invoke: mocks.invoke } } }))
vi.mock('./manualCheckoutClient', () => ({ guardarAutorizacionCobroManual: mocks.guardar }))
const kid = '10000000-0000-0000-0000-000000000001'
const uid = '20000000-0000-0000-0000-000000000001'
const aid = '30000000-0000-0000-0000-000000000001'
const estado = () => ({ usuario: { id: uid, auth_user_id: aid, kiosco_id: kid, activo: true, rol: 'DUEÑO' }, kiosco: { id: kid, estado_suscripcion: 'ACTIVO' } })
const entrada = () => leerEntradaCheckoutManual({ version: 1, checkoutId: '40000000-0000-0000-0000-000000000001', kioscoId: kid, usuarioId: uid,
  sesionCajaId: aid, fechaHora: '2026-10-07T12:00:00Z', clienteId: null, notas: null, tipoAjuste: 'DESCUENTO_FIJO', valorAjuste: 20,
  totalEsperado: 100, subtotalesEsperados: [100], componentesEsperados: [],
  lineas: [{ tipo: 'PRODUCTO', id: '60000000-0000-0000-0000-000000000001', productoId: '50000000-0000-0000-0000-000000000001', cantidad: 1, sinEnvase: false }],
  pagos: [{ id: '70000000-0000-0000-0000-000000000001', medio: 'EFECTIVO', montoCentavos: 10000, referencia: null }] })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.estado.mockReturnValue(estado())
  mocks.sesion.mockResolvedValue({ data: { session: { access_token: 'TOKEN', user: { id: aid } } }, error: null })
  mocks.invoke.mockResolvedValue({ data: { configurado: true }, error: null })
})

it('consulta sólo estado con JWT sin identidad suministrada en el cuerpo', async () => {
  expect(await consultarPinSupervisor()).toBe(true)
  expect(mocks.invoke).toHaveBeenCalledWith('supervisor-pin', { body: { accion: 'ESTADO' }, headers: { Authorization: 'Bearer TOKEN' } })
})
it('configura conservando ceros iniciales y no guarda el PIN en la cola', async () => {
  mocks.invoke.mockResolvedValue({ data: { estado: 'CONFIGURADO' }, error: null })
  await configurarPinSupervisor('0012', '0012')
  expect(mocks.invoke.mock.calls[0][1].body).toEqual({ accion: 'CONFIGURAR', pin: '0012', repetirPin: '0012' })
  expect(mocks.guardar).not.toHaveBeenCalled()
})
it('rechaza configurar como cajero antes de enviar', async () => {
  mocks.estado.mockReturnValue({ ...estado(), usuario: { ...estado().usuario, rol: 'CAJERO' } })
  await expect(configurarPinSupervisor('1234', '1234')).rejects.toThrow(/dueño/)
  expect(mocks.invoke).not.toHaveBeenCalled()
})
it.each(['12', 'abcd', ' 1234', '1234567'])('rechaza PIN malformado %s sin enviar', async pin => {
  await expect(configurarPinSupervisor(pin, pin)).rejects.toThrow(/4 a 6/)
  expect(mocks.invoke).not.toHaveBeenCalled()
})
it('rechaza cambio de sesión mientras obtiene JWT', async () => {
  mocks.sesion.mockImplementation(async () => {
    mocks.estado.mockReturnValue({ ...estado(), usuario: { ...estado().usuario, id: kid } })
    return { data: { session: { access_token: 'TOKEN', user: { id: aid } } }, error: null }
  })
  await expect(consultarPinSupervisor()).rejects.toThrow(/sesión cambió/)
  expect(mocks.invoke).not.toHaveBeenCalled()
})
it('descarta autorización si cambia la sesión durante la petición', async () => {
  mocks.invoke.mockImplementation(async () => {
    mocks.estado.mockReturnValue({ ...estado(), usuario: { ...estado().usuario, id: kid } })
    return { data: { estado: 'AUTORIZADO', autorizacionId: kid, venceEn: '2026-10-07T12:02:00Z' }, error: null }
  })
  await expect(autorizarDescuentoSupervisor(entrada(), '1234')).rejects.toThrow(/sesión cambió/)
  expect(mocks.guardar).not.toHaveBeenCalled()
})
it('guarda solamente permiso y entrada original después de autorizar', async () => {
  mocks.invoke.mockResolvedValue({ data: { estado: 'AUTORIZADO', autorizacionId: kid, venceEn: '2026-10-07T12:02:00Z' }, error: null })
  const original = entrada()
  await autorizarDescuentoSupervisor(original, '1234')
  expect(mocks.guardar).toHaveBeenCalledWith(original, { autorizacionId: kid, venceEn: '2026-10-07T12:02:00.000Z' })
})
it('rechaza respuesta con datos adicionales sin persistir', async () => {
  mocks.invoke.mockResolvedValue({ data: { estado: 'AUTORIZADO', autorizacionId: kid, venceEn: '2026-10-07T12:02:00Z', pin: '1234' }, error: null })
  await expect(autorizarDescuentoSupervisor(entrada(), '1234')).rejects.toThrow(/confirmar/)
  expect(mocks.guardar).not.toHaveBeenCalled()
})
it('no divulga mensajes internos del servidor', async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: new Error('SECRET_SQL') })
  await expect(consultarPinSupervisor()).rejects.toThrow('No se pudo confirmar la operación de supervisor')
})
it('rechaza confirmación diferente antes de pedir JWT', async () => {
  await expect(configurarPinSupervisor('1234', '1235')).rejects.toThrow(/coinciden/)
  expect(mocks.sesion).not.toHaveBeenCalled()
})
it('rechaza JWT perteneciente a otro usuario', async () => {
  mocks.sesion.mockResolvedValue({ data: { session: { access_token: 'TOKEN', user: { id: kid } } }, error: null })
  await expect(consultarPinSupervisor()).rejects.toThrow(/verificar/)
  expect(mocks.invoke).not.toHaveBeenCalled()
})
it('no persiste permisos malformados', async () => {
  mocks.invoke.mockResolvedValue({ data: { estado: 'AUTORIZADO', autorizacionId: 'incorrecto', venceEn: '2026-10-07T12:02:00Z' }, error: null })
  await expect(autorizarDescuentoSupervisor(entrada(), '1234')).rejects.toThrow(/inválido/)
  expect(mocks.guardar).not.toHaveBeenCalled()
})
it('transmite fecha pública de bloqueo sin persistir permiso', async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ estado: 'BLOQUEADO', reintentarEn: '2026-10-07T12:00:00Z' }), { status: 429 }) } })
  await expect(autorizarDescuentoSupervisor(entrada(), '1234')).rejects.toMatchObject({ name: 'SupervisorPinBloqueado', reintentarEn: '2026-10-07T12:00:00.000Z' })
  expect(mocks.guardar).not.toHaveBeenCalled()
})
