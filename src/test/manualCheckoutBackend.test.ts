import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { crearProducto } from './factories'
import { cerrarCheckoutManual } from '../../supabase/functions/_shared/manualCheckout'
import type { ManualCheckoutDependencies } from '../../supabase/functions/_shared/manualCheckout'
import { fechaManual, leerEntradaCheckoutManual } from '../../supabase/functions/_shared/manualCheckoutRequest'
import { recibirCheckoutManual } from '../../supabase/functions/_shared/manualCheckoutHttp'
import { requiereRenovarPermisoManual } from '../../supabase/functions/_shared/manualCheckoutSupervisorError'

const kid = '10000000-0000-0000-0000-000000000001'
const uid = '20000000-0000-0000-0000-000000000001'
const box = '30000000-0000-0000-0000-000000000001'
const id = '40000000-0000-0000-0000-000000000001'
const product = '50000000-0000-0000-0000-000000000001'
const line = '60000000-0000-0000-0000-000000000001'
const pay = '70000000-0000-0000-0000-000000000001'
function entrada() {
  return leerEntradaCheckoutManual({ version: 1, checkoutId: id, kioscoId: kid, usuarioId: uid,
    sesionCajaId: box, fechaHora: '2026-10-07T12:00:00Z', clienteId: null, notas: null,
    tipoAjuste: 'NINGUNO', valorAjuste: 0, totalEsperado: 100, subtotalesEsperados: [100], componentesEsperados: [],
    lineas: [{ tipo: 'PRODUCTO', id: line, productoId: product, cantidad: 1, sinEnvase: false }],
    pagos: [{ id: pay, medio: 'EFECTIVO', montoCentavos: 10000, referencia: null }] })
}
function dependencias(): ManualCheckoutDependencies {
  return { ahora: () => new Date('2026-10-07T12:01:00Z'),
    buscar: vi.fn(async () => null),
    cargarDatos: vi.fn(async () => ({ productos: [crearProducto({ id: product, kiosco_id: kid, precio_venta: 100 })],
      componentes: [], promociones: [], envases: [], cliente: null })),
    preparar: vi.fn(async (_contexto, solicitud, snapshot, requiereSupervisor) => ({ entrada: solicitud, snapshot, requiere_supervisor: requiereSupervisor })),
    confirmar: vi.fn(async (_contexto, snapshot) => ({ venta_id: id, kiosco_id: kid, fecha_hora: snapshot.fecha_hora,
      total: snapshot.total, stock: [{ producto_id: product, stock_actual: 9 }], saldo_cliente: null })),
  }
}
function contexto(rol: 'DUEÑO' | 'CAJERO' = 'DUEÑO') {
  return { authUserId: uid, usuario: { id: uid, auth_user_id: uid, kiosco_id: kid, nombre: 'Operador', email: null,
    rol, activo: true, fecha_creacion: '' }, kiosco: { id: kid, nombre: 'Local', direccion: null, telefono: null,
    estado_suscripcion: 'ACTIVO' as const, fecha_creacion: '' } }
}
beforeEach(() => { vi.restoreAllMocks(); vi.stubGlobal('crypto', webcrypto) })
afterEach(() => { vi.unstubAllGlobals() })

it('rechaza fechas inexistentes sin normalizarlas a otro día', () => {
  for (const fecha of ['2026-02-29T12:00:00Z', '2026-04-31T12:00:00-03:00', '2026-10-07T24:00:00Z']) {
    expect(() => fechaManual(fecha)).toThrow(/Fecha/)
  }
  expect(fechaManual('2024-02-29T12:00:00-03:00')).toBe('2024-02-29T15:00:00.000Z')
})

it('cotiza con el catálogo del servidor y sólo después prepara y confirma', async () => {
  const deps = dependencias()
  const resultado = await cerrarCheckoutManual(contexto(), entrada(), deps)
  expect(resultado.venta_id).toBe(id)
  expect(deps.preparar).toHaveBeenCalledOnce()
  expect(deps.confirmar).toHaveBeenCalledOnce()
  const snapshot = vi.mocked(deps.preparar).mock.calls[0][2]
  expect(snapshot.detalles[0]).toMatchObject({ producto_id: product, subtotal: 100, precio_unitario: 100 })
  expect(snapshot.detalles[0].id).not.toBe(product)
  expect(JSON.stringify(snapshot)).not.toContain('precio_costo')
})

it('si el precio cambió, rechaza el importe anterior sin registrar una venta diferente', async () => {
  const deps = dependencias()
  const datos = entrada()
  datos.totalEsperado = 1
  datos.subtotalesEsperados = [1]
  datos.pagos[0].montoCentavos = 100
  await expect(cerrarCheckoutManual(contexto(), datos, deps)).rejects.toThrow(/revisión/i)
  expect(deps.preparar).not.toHaveBeenCalled()
  expect(deps.confirmar).not.toHaveBeenCalled()
})

it('un reintento recupera el snapshot antes de consultar precios o promociones nuevos', async () => {
  const deps = dependencias()
  await cerrarCheckoutManual(contexto(), entrada(), deps)
  const snapshot = vi.mocked(deps.preparar).mock.calls[0][2]
  deps.buscar = vi.fn(async () => ({ entrada: entrada(), snapshot }))
  vi.mocked(deps.cargarDatos).mockClear()
  vi.mocked(deps.preparar).mockClear()
  await cerrarCheckoutManual(contexto(), entrada(), deps)
  expect(deps.cargarDatos).not.toHaveBeenCalled()
  expect(deps.preparar).not.toHaveBeenCalled()
  expect(deps.confirmar).toHaveBeenLastCalledWith(contexto(), snapshot)
})

it('no permite reutilizar el mismo ID con otros pagos ni aprobar respuestas vacías', async () => {
  const deps = dependencias()
  await cerrarCheckoutManual(contexto(), entrada(), deps)
  const snapshot = vi.mocked(deps.preparar).mock.calls[0][2]
  deps.buscar = async () => ({ entrada: entrada(), snapshot })
  const otra = entrada()
  otra.pagos[0].medio = 'TARJETA'
  await expect(cerrarCheckoutManual(contexto(), otra, deps)).rejects.toThrow(/coincide/i)
  deps.confirmar = async () => null
  await expect(cerrarCheckoutManual(contexto(), entrada(), deps)).rejects.toThrow(/resultado/i)
})

it('un cajero admite hasta 15% de descuento manual y requiere supervisor para más', async () => {
  const deps = dependencias()
  const datos = entrada()
  datos.tipoAjuste = 'DESCUENTO_PORCENTAJE'; datos.valorAjuste = 15
  datos.totalEsperado = 85; datos.subtotalesEsperados = [85]; datos.pagos[0].montoCentavos = 8500
  await cerrarCheckoutManual(contexto('CAJERO'), datos, deps)
  datos.valorAjuste = 16; datos.totalEsperado = 84; datos.subtotalesEsperados = [84]; datos.pagos[0].montoCentavos = 8400
  await expect(cerrarCheckoutManual(contexto('CAJERO'), datos, dependencias())).rejects.toThrow(/supervisor/i)
  await cerrarCheckoutManual(contexto(), datos, dependencias())
})

it('rechaza el comercio o usuario de otra sesión antes de leer el catálogo', async () => {
  const deps = dependencias()
  const datos = entrada()
  datos.kioscoId = box
  await expect(cerrarCheckoutManual(contexto(), datos, deps)).rejects.toThrow(/autorizado/i)
  expect(deps.buscar).not.toHaveBeenCalled()
  datos.kioscoId = kid; datos.usuarioId = box
  await expect(cerrarCheckoutManual(contexto('CAJERO'), datos, deps)).rejects.toThrow(/autorizado/i)
})

it('una preparación creada por el dueño no concede al cajero un descuento porcentual extraordinario', async () => {
  const deps = dependencias()
  const datos = entrada()
  datos.tipoAjuste = 'DESCUENTO_PORCENTAJE'; datos.valorAjuste = 20
  datos.totalEsperado = 80; datos.subtotalesEsperados = [80]; datos.pagos[0].montoCentavos = 8000
  await cerrarCheckoutManual(contexto(), datos, deps)
  const snapshot = vi.mocked(deps.preparar).mock.calls[0][2]
  deps.buscar = vi.fn(async () => ({ entrada: datos, snapshot }))
  vi.mocked(deps.confirmar).mockClear()
  await expect(cerrarCheckoutManual(contexto('CAJERO'), datos, deps)).rejects.toThrow(/supervisor/i)
  expect(deps.confirmar).not.toHaveBeenCalled()
  expect(deps.buscar).toHaveBeenCalledOnce()
  await cerrarCheckoutManual(contexto(), datos, deps)
  expect(deps.confirmar).toHaveBeenCalledOnce()
})

it('acepta total cero en manual manteniendo los comprobantes de stock', async () => {
  const deps = dependencias()
  const datos = entrada()
  datos.tipoAjuste = 'DESCUENTO_PORCENTAJE'; datos.valorAjuste = 100
  datos.totalEsperado = 0; datos.subtotalesEsperados = [0]; datos.pagos[0].montoCentavos = 0
  expect((await cerrarCheckoutManual(contexto(), datos, deps)).total).toBe(0)
})

it('un descuento fijo mayor a 15% no evita el control del cajero', async () => {
  const datos = entrada()
  datos.tipoAjuste = 'DESCUENTO_FIJO'; datos.valorAjuste = 16
  datos.totalEsperado = 84; datos.subtotalesEsperados = [84]; datos.pagos[0].montoCentavos = 8400
  await expect(cerrarCheckoutManual(contexto('CAJERO'), datos, dependencias())).rejects.toThrow(/supervisor/i)
})

it.each(['DESCUENTO_PORCENTAJE', 'DESCUENTO_FIJO'] as const)('envía el permiso separado de la entrada original para %s', async tipo => {
  const d = dependencias(); const datos = entrada()
  datos.tipoAjuste = tipo; datos.valorAjuste = 20; datos.totalEsperado = 80
  datos.subtotalesEsperados = [80]; datos.pagos[0].montoCentavos = 8000
  d.confirmarAutorizado = vi.fn(async (_ctx, _entrada, snapshot) => ({ venta_id: id, kiosco_id: kid,
    fecha_hora: snapshot.fecha_hora, total: 80, stock: [{ producto_id: product, stock_actual: 9 }], saldo_cliente: null }))
  expect((await cerrarCheckoutManual(contexto('CAJERO'),datos,d,id)).total).toBe(80)
  expect(d.confirmar).not.toHaveBeenCalled()
  expect(d.confirmarAutorizado).toHaveBeenCalledWith(contexto('CAJERO'),datos,expect.objectContaining({ total: 80 }),id)
  expect(vi.mocked(d.preparar).mock.calls[0][3]).toBe(true)
  expect(datos).not.toHaveProperty('autorizacionId')
  const snapshot = vi.mocked(d.preparar).mock.calls[0][2]
  d.buscar = async () => ({ entrada: datos, snapshot, requiere_supervisor: true })
  vi.mocked(d.cargarDatos).mockClear()
  await cerrarCheckoutManual(contexto('CAJERO'),datos,d)
  expect(d.confirmarAutorizado).toHaveBeenLastCalledWith(contexto('CAJERO'),datos,snapshot,null)
  expect(d.cargarDatos).not.toHaveBeenCalled()
})

it('un fallo de permiso en cierre protegido no deriva al RPC ordinario', async () => {
  const d = dependencias(); const datos = entrada()
  datos.tipoAjuste = 'DESCUENTO_FIJO'; datos.valorAjuste = 20
  datos.totalEsperado = 80; datos.subtotalesEsperados = [80]; datos.pagos[0].montoCentavos = 8000
  d.confirmarAutorizado = async () => { throw new Error('Permiso vencido') }
  await expect(cerrarCheckoutManual(contexto('CAJERO'),datos,d,id)).rejects.toThrow(/vencido/)
  expect(d.confirmar).not.toHaveBeenCalled()
})

it('HTTP valida y transmite el encabezado de autorización sin modificar el cuerpo', async () => {
  const d = httpDeps(); d.autenticar = vi.fn(async () => contexto('CAJERO'))
  const datos = entrada(); datos.tipoAjuste = 'DESCUENTO_PORCENTAJE'; datos.valorAjuste = 20
  datos.totalEsperado = 80; datos.subtotalesEsperados = [80]; datos.pagos[0].montoCentavos = 8000
  const autorizado = vi.fn(async (_ctx: unknown, _entrada: unknown, snapshot: { fecha_hora: string }) => ({ venta_id: id,
    kiosco_id: kid, fecha_hora: snapshot.fecha_hora, total: 80, stock: [{ producto_id: product, stock_actual: 9 }], saldo_cliente: null }))
  const depsConPermiso = { ...d, confirmarAutorizado: autorizado }
  const req = peticion(datos); req.headers.set('x-supervisor-autorizacion',id)
  expect((await recibirCheckoutManual(req,depsConPermiso)).status).toBe(200)
  expect(autorizado.mock.calls[0][1]).toEqual(datos)
  const malo = peticion(datos); malo.headers.set('x-supervisor-autorizacion','PIN-0042')
  expect((await recibirCheckoutManual(malo,depsConPermiso)).status).toBe(400)
  expect(autorizado).toHaveBeenCalledOnce()
})

it('traduce únicamente los errores SQL conocidos de permiso a renovación de supervisor', () => {
  for (const message of ['Permiso no corresponde a la operación', 'Permiso vencido o consumido', 'PIN modificado']) {
    expect(requiereRenovarPermisoManual({ code: 'P0001', message })).toBe(true)
  }
  expect(requiereRenovarPermisoManual(null)).toBe(false)
  expect(requiereRenovarPermisoManual({ code: '42501', message: 'Se requiere servidor autorizado' })).toBe(false)
  expect(requiereRenovarPermisoManual({ code: 'P0001', message: 'SECRET_SQL_SUPERVISOR' })).toBe(false)
})

it.each([false, true, null])('recupera la decisión original de descuento fijo: %s', async requiereSupervisor => {
  const datos = entrada()
  datos.tipoAjuste = 'DESCUENTO_FIJO'; datos.valorAjuste = 10
  datos.totalEsperado = 90; datos.subtotalesEsperados = [90]; datos.pagos[0].montoCentavos = 9000
  const deps = dependencias()
  await cerrarCheckoutManual(contexto(), datos, deps)
  const snapshot = vi.mocked(deps.preparar).mock.calls[0][2]
  expect(vi.mocked(deps.preparar).mock.calls[0][3]).toBe(false)
  deps.buscar = async () => ({ entrada: datos, snapshot, requiere_supervisor: requiereSupervisor })
  vi.mocked(deps.confirmar).mockClear(); vi.mocked(deps.cargarDatos).mockClear()
  if (requiereSupervisor === false) await cerrarCheckoutManual(contexto('CAJERO'), datos, deps)
  else await expect(cerrarCheckoutManual(contexto('CAJERO'), datos, deps)).rejects.toThrow(/supervisor/i)
  expect(deps.confirmar).toHaveBeenCalledTimes(requiereSupervisor === false ? 1 : 0)
  expect(deps.cargarDatos).not.toHaveBeenCalled()
})

it('persiste el control del descuento fijo excluyendo depósitos de envases de la base', async () => {
  const datos = entrada(); const deps = dependencias()
  datos.lineas[0] = { tipo: 'PRODUCTO', id: line, productoId: product, cantidad: 1, sinEnvase: true }
  datos.tipoAjuste = 'DESCUENTO_FIJO'; datos.valorAjuste = 20
  datos.totalEsperado = 180; datos.subtotalesEsperados = [180]; datos.pagos[0].montoCentavos = 18000
  deps.cargarDatos = async () => ({ productos: [crearProducto({ id: product, kiosco_id: kid, precio_venta: 100,
    es_retornable: true, precio_envase: 100 })], componentes: [], promociones: [], envases: [], cliente: null })
  await cerrarCheckoutManual(contexto(), datos, deps)
  expect(vi.mocked(deps.preparar).mock.calls[0][3]).toBe(true)
})

it('no confirma una receta cambiada ni respuestas con stock ajeno o incompleto', async () => {
  const deps = dependencias()
  const datos = entrada()
  datos.componentesEsperados = [{ comboId: product, productoId: line, cantidad: 1 }]
  await expect(cerrarCheckoutManual(contexto(), datos, deps)).rejects.toThrow(/revisión/i)
  deps.confirmar = async () => ({ venta_id: id, kiosco_id: kid, fecha_hora: entrada().fechaHora, total: 100, stock: [], saldo_cliente: null })
  await expect(cerrarCheckoutManual(contexto(), entrada(), deps)).rejects.toThrow(/incompleto/i)
})

it('los snapshots recuperados no admiten costos ni un artículo virtual diferente', async () => {
  const deps = dependencias()
  await cerrarCheckoutManual(contexto(), entrada(), deps)
  const snapshot = vi.mocked(deps.preparar).mock.calls[0][2]
  deps.buscar = async () => ({ entrada: entrada(), snapshot: { ...snapshot, precio_costo: 999 } })
  await expect(cerrarCheckoutManual(contexto(), entrada(), deps)).rejects.toThrow(/campos/i)
})

it.each([
  { cambio: { totalEsperado: 99 } }, { cambio: { usuarioId: 'malo' } }, { cambio: { fechaHora: 'now' } },
  { cambio: { precio_costo: 99 } }, { cambio: { subtotalesEsperados: [] } }, { cambio: { pagos: [] } },
])('el parser rechaza datos manipulados $cambio', ({ cambio }) => {
  expect(() => leerEntradaCheckoutManual({ ...entrada(), ...cambio })).toThrow()
})

function peticion(payload: unknown = entrada(), token = 'jwt-validado', origin = 'https://pos.example') {
  return new Request('https://functions.example/checkout-manual', { method: 'POST', headers: {
    authorization: `Bearer ${token}`, origin }, body: JSON.stringify(payload) })
}
function httpDeps() { return { ...dependencias(), origins: ['https://pos.example'], autenticar: vi.fn(async () => contexto()) } }

it('HTTP requiere sesión, origen autorizado y un cuerpo limitado antes de consultar datos', async () => {
  const deps = httpDeps()
  expect((await recibirCheckoutManual(peticion(entrada(), '', 'https://pos.example'), deps)).status).toBe(401)
  expect((await recibirCheckoutManual(peticion(entrada(), 'jwt', 'https://otro.example'), deps)).status).toBe(403)
  expect(deps.autenticar).not.toHaveBeenCalled()
  expect((await recibirCheckoutManual(peticion({ ...entrada(), notas: 'x'.repeat(200001) }), deps)).status).toBe(400)
  expect(deps.cargarDatos).not.toHaveBeenCalled()
})

it('HTTP devuelve un cierre verificado y nunca expone costos o detalles de errores SQL', async () => {
  const deps = httpDeps()
  const ok = await recibirCheckoutManual(peticion(), deps)
  expect(ok.status).toBe(200)
  expect(await ok.json()).toMatchObject({ venta_id: id, total: 100 })
  deps.confirmar = async () => { throw new Error('SECRET_SQL_TOKEN') }
  const fallo = await recibirCheckoutManual(peticion(), deps)
  expect(fallo.status).toBe(409)
  const texto = await fallo.text()
  expect(texto).toContain('mismo identificador')
  expect(texto).not.toContain('SECRET')
})

it('HTTP distingue revisión comercial, permiso del cajero y error de autenticación', async () => {
  const deps = httpDeps()
  const datos = entrada()
  datos.totalEsperado = 99; datos.subtotalesEsperados = [99]; datos.pagos[0].montoCentavos = 9900
  expect((await recibirCheckoutManual(peticion(datos), deps)).status).toBe(422)
  deps.autenticar = vi.fn(async () => contexto('CAJERO'))
  datos.tipoAjuste = 'DESCUENTO_PORCENTAJE'; datos.valorAjuste = 99
  expect((await recibirCheckoutManual(peticion(datos), deps)).status).toBe(403)
  deps.autenticar.mockRejectedValue(new Error('SECRET_AUTH'))
  expect((await recibirCheckoutManual(peticion(), deps)).status).toBe(503)
})
