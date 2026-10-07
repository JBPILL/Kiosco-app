// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { recibirSupervisorPin, type DependenciasHttpSupervisor } from '../../supabase/functions/_shared/supervisorPinHttp'
import { crearHashPinSupervisor, verificarPinSupervisor } from '../../supabase/functions/_shared/supervisorPinCrypto'
import { leerPepperSupervisor } from '../../supabase/functions/_shared/supervisorPinSecrets'
import type { ContextoCheckoutManual } from '../../supabase/functions/_shared/manualCheckout'
const actor = '10000000-0000-0000-0000-000000000001'
const kid = '20000000-0000-0000-0000-000000000001'
const id = '30000000-0000-0000-0000-000000000001'
const pepper = new Uint8Array(32).fill(11)
function contexto(rol: 'DUEÑO' | 'CAJERO' = 'DUEÑO'): ContextoCheckoutManual {
 return { authUserId: actor, usuario: { id: actor, auth_user_id: actor, kiosco_id: kid, nombre: 'Operador',
 email: null, rol, activo: true, fecha_creacion: '' }, kiosco: { id: kid, nombre: 'Local', direccion: null,
 telefono: null, estado_suscripcion: 'ACTIVO', fecha_creacion: '' } }
}
function entrada() {
 return { version: 1, checkoutId: id, kioscoId: kid, usuarioId: actor, sesionCajaId: kid,
 fechaHora: '2026-10-07T12:00:00.000Z', clienteId: null, notas: null, tipoAjuste: 'DESCUENTO_PORCENTAJE', valorAjuste: 20,
 totalEsperado: 80, subtotalesEsperados: [80], componentesEsperados: [],
 lineas: [{ tipo: 'PRODUCTO', id: actor, productoId: kid, cantidad: 1, sinEnvase: false }],
 pagos: [{ id: kid, medio: 'EFECTIVO', montoCentavos: 8000, referencia: null }] }
}
function deps(): DependenciasHttpSupervisor {
 return { origins: ['https://pos.example'], autenticar: vi.fn(async () => contexto()), consultarEstado: vi.fn(async () => true),
 versionPepperActual: () => '1', obtenerPepper: vi.fn(async () => pepper), configurar: vi.fn(async () => undefined),
 reservarOperacion: vi.fn(async () => ({ estado: 'NO_CONFIGURADO' })),
 finalizar: vi.fn(async (_actor, _id, valido) => ({ estado: 'FINALIZADO', valido })),
 emitir: vi.fn(async () => ({ autorizacion_id: id, vence_en: new Date(Date.now()+120000).toISOString() })) }
}
function request(cuerpo: unknown, token = 'jwt', origin = 'https://pos.example', method = 'POST') {
 return new Request('https://functions.example/supervisor-pin', { method, headers: { origin, authorization: `Bearer ${token}` },
 ...(method === 'POST' ? { body: JSON.stringify(cuerpo) } : {}) })
}
beforeEach(() => vi.restoreAllMocks())
it('valida origen, método y JWT antes de leer el PIN', async () => {
 const d = deps()
 expect((await recibirSupervisorPin(request({},'jwt','https://otro.example'),d)).status).toBe(403)
 expect((await recibirSupervisorPin(request({},'jwt','https://pos.example','GET'),d)).status).toBe(405)
 expect((await recibirSupervisorPin(request({},''),d)).status).toBe(401)
 expect(d.autenticar).not.toHaveBeenCalled()
 const preflight = await recibirSupervisorPin(request({},'','https://pos.example','OPTIONS'),d)
 expect(preflight.status).toBe(204); expect(d.autenticar).not.toHaveBeenCalled()
})
it('rechaza perfiles inactivos, otra identidad y comercio suspendido', async () => {
 for (const contextoInvalido of [ { ...contexto(), authUserId: kid },
 { ...contexto(), usuario: { ...contexto().usuario, activo: false } },
 { ...contexto(), kiosco: { ...contexto().kiosco, estado_suscripcion: 'SUSPENDIDO' as const } } ]) {
  const d = deps(); d.autenticar = async () => contextoInvalido
  expect((await recibirSupervisorPin(request({ accion: 'ESTADO' }),d)).status).toBe(403)
  expect(d.consultarEstado).not.toHaveBeenCalled()
 }
})
it('consulta sólo el comercio de la sesión y devuelve un booleano sin secretos', async () => {
 const d = deps(); const res = await recibirSupervisorPin(request({ accion: 'ESTADO' }),d)
 expect(await res.json()).toEqual({ configurado: true }); expect(res.headers.get('cache-control')).toBe('no-store')
 expect(d.consultarEstado).toHaveBeenCalledWith(kid)
 expect((await recibirSupervisorPin(request({ accion: 'ESTADO', kioscoId: id }),d)).status).toBe(400)
})
it('el cajero no configura PIN aunque envíe un rol de dueño', async () => {
 const d = deps(); d.autenticar = async () => contexto('CAJERO')
 expect((await recibirSupervisorPin(request({ accion: 'CONFIGURAR', pin: '0042', repetirPin: '0042', rol: 'DUEÑO' }),d)).status).toBe(403)
 expect(d.obtenerPepper).not.toHaveBeenCalled(); expect(d.configurar).not.toHaveBeenCalled()
})
it.each([42, '004', '0042000', ' 0042', '٠٠٤٢'])('rechaza PIN malformado %s antes de derivar', async pin => {
 const d = deps()
 expect((await recibirSupervisorPin(request({ accion: 'CONFIGURAR', pin, repetirPin: pin }),d)).status).toBe(400)
 expect(d.obtenerPepper).not.toHaveBeenCalled()
})
it('configura con criptografía real conservando ceros iniciales y devuelve sólo estado', async () => {
 const d = deps(); const res = await recibirSupervisorPin(request({ accion: 'CONFIGURAR', pin: '0042', repetirPin: '0042' }),d)
 expect(await res.json()).toEqual({ estado: 'CONFIGURADO' })
 expect(d.configurar).toHaveBeenCalledWith(actor, expect.objectContaining({ algoritmo: 'PBKDF2-SHA256', iteraciones: 600000 }))
 const hash = vi.mocked(d.configurar).mock.calls[0][1]
 expect(hash).not.toHaveProperty('pin')
 expect(await verificarPinSupervisor('0042',kid,pepper,'1',hash)).toBe(true)
 expect((await recibirSupervisorPin(request({ accion: 'CONFIGURAR', pin: '0042', repetirPin: '0043' }),d)).status).toBe(400)
})
it('no permite autorizar la entrada de otro comercio u operador ni identidad enviada', async () => {
 const d = deps()
 for (const datos of [{ ...entrada(), kioscoId: id }, { ...entrada(), usuarioId: id }]) {
  expect((await recibirSupervisorPin(request({ accion: 'AUTORIZAR_DESCUENTO', pin: '0042', entrada: datos }),d)).status).toBe(403)
 }
 expect((await recibirSupervisorPin(request({ accion: 'AUTORIZAR_DESCUENTO', pin: '0042', entrada: entrada(), authUserId: id }),d)).status).toBe(400)
 expect(d.reservarOperacion).not.toHaveBeenCalled()
})
it('verifica PIN con reserva ligada al cuerpo y entrega sólo permiso efímero', async () => {
 const d = deps(); d.autenticar = async () => contexto('CAJERO')
 d.reservarOperacion = vi.fn(async () => ({ estado: 'RESERVADO', id, actor_auth_id: actor, kiosco_id: kid, revision: 1,
 pin_hash: await crearHashPinSupervisor('0042',kid,pepper,'1') }))
 const res = await recibirSupervisorPin(request({ accion: 'AUTORIZAR_DESCUENTO', pin: '0042', entrada: entrada() }),d)
 expect(res.status).toBe(200); expect(await res.json()).toEqual({ estado: 'AUTORIZADO', autorizacionId: id, venceEn: expect.any(String) })
 expect(d.reservarOperacion).toHaveBeenCalledWith(actor,'DESCUENTO',entrada())
})
it('bloqueo devuelve 429 y no consulta pepper ni emite permiso', async () => {
 const d = deps(); const plazo = new Date(Date.now()+900000).toISOString()
 d.reservarOperacion = async () => ({ estado: 'BLOQUEADO', reintentar_en: plazo })
 const res = await recibirSupervisorPin(request({ accion: 'AUTORIZAR_DESCUENTO', pin: '0042', entrada: entrada() }),d)
 expect(res.status).toBe(429); expect(await res.json()).toEqual({ estado: 'BLOQUEADO', reintentarEn: plazo })
 expect(d.obtenerPepper).not.toHaveBeenCalled(); expect(d.emitir).not.toHaveBeenCalled()
})
it('errores de secretos y SQL no exponen datos ni confirman configuración', async () => {
 const d = deps(); d.configurar = async () => { throw new Error('SECRET_SQL_0042') }
 const res = await recibirSupervisorPin(request({ accion: 'CONFIGURAR', pin: '0042', repetirPin: '0042' }),d)
 expect(res.status).toBe(503); expect(await res.text()).not.toContain('SECRET')
 expect((await recibirSupervisorPin(request({ accion: 'ESTADO', extra: 'x'.repeat(200001) }),d)).status).toBe(400)
})
it('secretos versionados admiten rotación, devuelven copia y no usan valor predeterminado', async () => {
 const secretos = leerPepperSupervisor(JSON.stringify({ '1': 'ab'.repeat(32), '2': 'cd'.repeat(32) }), '2')
 expect(secretos.versionActual).toBe('2'); const p = await secretos.obtenerPepper('1'); p[0] = 0
 expect((await secretos.obtenerPepper('1'))[0]).toBe(171)
 await expect(secretos.obtenerPepper('3')).rejects.toThrow(/no disponible/)
 for (const [json, version] of [[undefined, '1'], ['{}','1'], ['[]','1'], ['{"1":"corto"}','1'], ['{"1":"'+'ab'.repeat(32)+'"}','2']]) {
  expect(() => leerPepperSupervisor(json,version)).toThrow('Secretos de supervisor no configurados')
 }
})
