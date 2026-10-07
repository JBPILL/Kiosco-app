import 'fake-indexeddb/auto'
import { beforeEach, expect, it, vi } from 'vitest'
import { cerrarCobroManualLocal, enviarCheckoutManual, enviarCancelacionCheckoutManual, consultarCancelacionManual, guardarCobroManualLocal, sincronizarCobrosManualesLocales } from './manualCheckoutClient'
import { ManualCheckoutOutbox } from './manualCheckoutOutbox'
import { leerEntradaCheckoutManual } from '../../supabase/functions/_shared/manualCheckoutRequest'

const mocks = vi.hoisted(() => ({ getState: vi.fn(), getSession: vi.fn(), invoke: vi.fn(), rpc: vi.fn(), completar: vi.fn(), cart: vi.fn() }))
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: mocks.getState } }))
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc, auth: { getSession: mocks.getSession }, functions: { invoke: mocks.invoke } } }))
vi.mock('../stores/cartStore', () => ({ useCartStore: { getState: mocks.cart } }))
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
beforeEach(async () => {
  const cola = new ManualCheckoutOutbox()
  await cola.cobros.clear(); cola.close()
  vi.clearAllMocks()
  mocks.getState.mockReturnValue(estado())
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'SESSION_TOKEN', user: { id: authId } } }, error: null })
  mocks.invoke.mockResolvedValue({ data: { venta_id: entrada().checkoutId }, error: null })
  mocks.cart.mockReturnValue({ cobrosBloqueados: { 'ticket-original': entrada().checkoutId }, completarCobroTab: mocks.completar })
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

it('solo el dueño del comercio puede enviar cancelación y nunca pasa un actor al RPC', async () => {
 const solicitud = { motivo: 'Cobro no realizado', resolucion: 'NO_COBRADO' as const, referencia: null }
 await expect(enviarCancelacionCheckoutManual(entrada(), solicitud)).rejects.toThrow(/dueño/)
 expect(mocks.rpc).not.toHaveBeenCalled()
 const actual = estado(); actual.usuario.rol = 'DUEÑO'; mocks.getState.mockReturnValue(actual)
 mocks.rpc.mockResolvedValue({ data: { estado: 'CANCELADO' }, error: null })
 await enviarCancelacionCheckoutManual(entrada(), solicitud)
 expect(mocks.rpc).toHaveBeenCalledWith('cancelar_checkout_manual', {
  p_entrada: entrada(), p_motivo: solicitud.motivo, p_resolucion: 'NO_COBRADO', p_referencia: null,
 })
 expect(mocks.invoke).not.toHaveBeenCalled()
})
it('conserva la solicitud ante error de cancelación sin divulgar detalles internos', async () => {
 const actual = estado(); actual.usuario.rol = 'DUEÑO'; mocks.getState.mockReturnValue(actual)
 mocks.rpc.mockResolvedValue({ data: null, error: new Error('SECRET_SQL') })
 await expect(enviarCancelacionCheckoutManual(entrada(), { motivo: 'Cobro no realizado', resolucion: 'NO_COBRADO', referencia: null })).rejects.toThrow(/Cancelación sin confirmar/)
 expect(mocks.rpc).toHaveBeenCalledOnce()
})
it('el operador original consulta con el cuerpo comercial sin actor forjado', async () => {
 mocks.rpc.mockResolvedValue({ data: null, error: null })
 expect(await consultarCancelacionManual(entrada())).toBeNull()
 expect(mocks.rpc).toHaveBeenCalledWith('consultar_cancelacion_checkout_manual', { p_entrada: entrada() })
 expect(mocks.invoke).not.toHaveBeenCalled()
})
it('rechaza consulta de otro cajero y descarta una respuesta tras cambiar sesión', async () => {
 const otro = estado(); otro.usuario.id = kid; mocks.getState.mockReturnValue(otro)
 await expect(consultarCancelacionManual(entrada())).rejects.toThrow(/no autorizada/)
 expect(mocks.rpc).not.toHaveBeenCalled()
 mocks.getState.mockReturnValue(estado())
 mocks.rpc.mockImplementationOnce(async () => { mocks.getState.mockReturnValue(otro); return { data: {}, error: null } })
 await expect(consultarCancelacionManual(entrada())).rejects.toThrow(/no autorizada/)
})
it('una falla de consulta no libera el cobro ni divulga el mensaje SQL', async () => {
 mocks.rpc.mockResolvedValue({ data: null, error: new Error('SECRET_SQL') })
 await expect(consultarCancelacionManual(entrada())).rejects.toThrow('Conciliación sin confirmar')
 expect(mocks.invoke).not.toHaveBeenCalled()
})
async function guardarOriginal() {
 const datos = entrada()
 await guardarCobroManualLocal(datos, 'ticket-original', { ventaId: datos.checkoutId, fecha: datos.fechaHora,
  total: 100, subtotal: 100, medioPago: 'EFECTIVO', items: [] })
 return datos
}
it('la sincronización concilia cancelación remota y libera sólo el ticket original sin enviar venta', async () => {
 const datos = await guardarOriginal()
 mocks.rpc.mockResolvedValue({ error: null, data: { entrada: datos,
  cancelacion: { motivo: 'No se cobró la venta', resolucion: 'NO_COBRADO', referencia: null },
  confirmacion: { estado: 'CANCELADO', checkout_id: datos.checkoutId, kiosco_id: kid, resolucion: 'NO_COBRADO', cancelado_en: datos.fechaHora } } })
 expect(await sincronizarCobrosManualesLocales(kid, uid)).toEqual({ exitosas: 1, fallidas: 0 })
 expect(mocks.completar).toHaveBeenCalledWith('ticket-original')
 expect(mocks.invoke).not.toHaveBeenCalled()
 const cola = new ManualCheckoutOutbox()
 expect((await cola.cobros.get(datos.checkoutId))?.estado).toBe('CANCELADO'); cola.close()
 mocks.completar.mockClear(); mocks.rpc.mockClear()
 expect(await sincronizarCobrosManualesLocales(kid, uid)).toEqual({ exitosas: 0, fallidas: 0 })
 expect(mocks.completar).toHaveBeenCalledWith('ticket-original')
 expect(mocks.rpc).not.toHaveBeenCalled()
})
it('acuse remoto inválido conserva cola y bloqueo del ticket original', async () => {
 const datos = await guardarOriginal()
 mocks.rpc.mockResolvedValue({ error: null, data: { entrada: datos,
  cancelacion: { motivo: 'No se cobró la venta', resolucion: 'NO_COBRADO', referencia: null },
  confirmacion: { estado: 'CANCELADO', checkout_id: datos.checkoutId, kiosco_id: uid, resolucion: 'NO_COBRADO', cancelado_en: datos.fechaHora } } })
 expect(await sincronizarCobrosManualesLocales(kid, uid)).toEqual({ exitosas: 0, fallidas: 1 })
 expect(mocks.completar).not.toHaveBeenCalled(); expect(mocks.invoke).not.toHaveBeenCalled()
 const cola = new ManualCheckoutOutbox()
 expect((await cola.cobros.get(datos.checkoutId))?.estado).toBe('PENDIENTE'); cola.close()
})
