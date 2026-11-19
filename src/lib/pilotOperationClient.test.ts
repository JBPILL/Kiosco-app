import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getState: vi.fn(), getSession: vi.fn(), rpc: vi.fn() }))
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: mocks.getState } }))
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: mocks.getSession }, rpc: mocks.rpc } }))
import { cashReturnOutbox, contextoOperacionPiloto, envasesOutbox, ejecutarOperacionEnvase, ejecutarDevolucionEfectivo } from './pilotOperationClient'

const id = (n: number) => `ea000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const usuario = { id: id(1), kiosco_id: id(2), auth_user_id: id(3), activo: true, rol: 'DUEÑO' }
const solicitud = () => ({ version: 1, id: id(4), accion: 'RECIBIR_EFECTIVO', tipoId: 'vidrio', datos: { cantidad: 2, sesionCajaId: id(5), precioEsperado: 100, notas: null } })
const ack = () => ({ id: id(4), kiosco_id: id(2), tipo_id: 'vidrio', stock_vacios: 2, importe: 200 })

beforeEach(async () => {
  vi.clearAllMocks()
  await envasesOutbox.operaciones.clear()
  await cashReturnOutbox.operaciones.clear()
  mocks.getState.mockReturnValue({ usuario })
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: id(3) }, access_token: 'synthetic-session' } }, error: null })
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
  vi.stubEnv('VITE_CHECKOUT_MANUAL_TRANSACCIONAL', 'true')
  vi.stubEnv('VITE_KIOSKO_ENVASES_TRANSACCIONAL', 'true')
  vi.stubEnv('VITE_KIOSKO_DEVOLUCIONES_EFECTIVO', 'true')
})
afterEach(() => vi.unstubAllEnvs())

it('persiste antes del RPC y vincula el JWT al actor original sin conservarlo en la cola', async () => {
  const setHeader = vi.fn(async () => {
    expect(await envasesOutbox.operaciones.get(id(4))).toMatchObject({ estado: 'PENDIENTE' })
    return { data: ack(), error: null }
  })
  mocks.rpc.mockReturnValue({ setHeader })
  await expect(ejecutarOperacionEnvase(contextoOperacionPiloto(), solicitud())).resolves.toEqual(ack())
  expect(mocks.rpc).toHaveBeenCalledWith('operar_envases_atomico', { p_solicitud: solicitud() })
  expect(setHeader).toHaveBeenCalledWith('Authorization', 'Bearer synthetic-session')
  expect(JSON.stringify(await envasesOutbox.operaciones.toArray())).not.toContain('synthetic-session')
})

it('no envía con una identidad Auth diferente y mantiene la operación recuperable', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: id(90) }, access_token: 'other-session' } }, error: null })
  await expect(ejecutarOperacionEnvase(contextoOperacionPiloto(), solicitud())).rejects.toThrow('no corresponde')
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(await envasesOutbox.pendientes(id(2), id(1))).toHaveLength(1)
})

it('no presenta el ACK al usuario que ingresó durante la solicitud y permite recuperarlo al original', async () => {
  mocks.rpc.mockReturnValue({ setHeader: vi.fn(async () => {
    mocks.getState.mockReturnValue({ usuario: { ...usuario, id: id(99) } })
    return { data: ack(), error: null }
  }) })
  const contexto = contextoOperacionPiloto()
  await expect(ejecutarOperacionEnvase(contexto, solicitud())).rejects.toThrow('Cambió la sesión')
  expect(await envasesOutbox.recuperables(id(2), id(1))).toMatchObject([{ estado: 'CONFIRMADO' }])
  mocks.getState.mockReturnValue({ usuario })
  await expect(ejecutarOperacionEnvase(contexto, solicitud())).resolves.toEqual(ack())
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
})

it('recupera la misma solicitud aunque se desactive la pantalla, pero impide nuevas operaciones', async () => {
  const contexto = contextoOperacionPiloto()
  await envasesOutbox.guardar(id(2), id(1), solicitud())
  vi.stubEnv('VITE_KIOSKO_ENVASES_TRANSACCIONAL', 'false')
  mocks.rpc.mockReturnValue({ setHeader: vi.fn(async () => ({ data: ack(), error: null })) })
  await expect(ejecutarOperacionEnvase(contexto, solicitud())).resolves.toEqual(ack())
  await expect(ejecutarOperacionEnvase(contexto, { ...solicitud(), id: id(6) })).rejects.toThrow('no está habilitado')
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
})

it('conecta el reintegro a su RPC y conserva su entrega física pendiente', async () => {
  const retorno = { version: 1, id: id(7), ventaId: id(8), sesionReintegroId: id(5), metodo: 'EFECTIVO_CAJA', motivo: 'CAMBIO_PRODUCTO', notas: null, items: [{ detalleId: id(9), cantidad: 1, reingresaStock: false }] }
  const resultado = { id: id(7), venta_id: id(8), kiosco_id: id(2), sesion_caja_id: id(5), monto_total: 10, detalles: [{ detalle_id: id(9), cantidad: 1, importe: 10 }], stock: [] }
  mocks.rpc.mockReturnValue({ setHeader: vi.fn(async () => ({ data: resultado, error: null })) })
  await expect(ejecutarDevolucionEfectivo(contextoOperacionPiloto(), retorno)).resolves.toEqual(resultado)
  expect(mocks.rpc).toHaveBeenCalledWith('confirmar_devolucion_efectivo_piloto', { p_solicitud: retorno })
  expect(await cashReturnOutbox.recuperables(id(2), id(1))).toMatchObject([{ estado: 'CONFIRMADO' }])
})

it.each(['VISOR', 'CAJERO_INACTIVO'])('impide operar al perfil %s', rol => {
  mocks.getState.mockReturnValue({ usuario: { ...usuario, rol: rol === 'VISOR' ? rol : 'CAJERO', activo: rol !== 'CAJERO_INACTIVO' } })
  expect(contextoOperacionPiloto).toThrow('usuario activo')
})

it('rechaza nuevas solicitudes de conservar envases, pero recupera el cuerpo histórico sin modificarlo', async () => {
  const retorno = { version: 2, id: id(7), ventaId: id(8), sesionReintegroId: id(5), metodo: 'EFECTIVO_CAJA', motivo: 'CAMBIO_PRODUCTO', notas: null, modalidadEnvases: 'CONSERVAR_ENVASES', items: [{ detalleId: id(9), cantidad: 1, reingresaStock: false }] }
  const contexto = contextoOperacionPiloto()
  await expect(ejecutarDevolucionEfectivo(contexto, retorno)).rejects.toThrow('entregar los envases al cliente')
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(await cashReturnOutbox.operaciones.get(retorno.id)).toBeUndefined()
  // An uncertain operation persisted by the previous release must still recover its original ACK.
  await cashReturnOutbox.guardar(id(2), id(1), retorno)
  vi.stubEnv('VITE_KIOSKO_DEVOLUCIONES_EFECTIVO', 'false')
  const resultado = { id: id(7), venta_id: id(8), kiosco_id: id(2), sesion_caja_id: id(5), monto_total: 20, detalles: [{ detalle_id: id(9), cantidad: 1, importe: 20 }], stock: [], envases: { modalidad: 'CONSERVAR_ENVASES', credito: 10, entregas: [] } }
  mocks.rpc.mockReturnValue({ setHeader: vi.fn(async () => ({ data: resultado, error: null })) })
  await expect(ejecutarDevolucionEfectivo(contexto, retorno)).resolves.toEqual(resultado)
  expect(mocks.rpc).toHaveBeenCalledWith('confirmar_devolucion_efectivo_piloto', { p_solicitud: retorno })
})
