import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EnvasesOutbox, procesarOperacionEnvase } from './envasesOutbox'
import { parsearSolicitudEnvase } from '../../supabase/functions/_shared/envasesRequest'

const id = (n: number) => `ef000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const kid = id(1), uid = id(2)
const solicitud = () => parsearSolicitudEnvase({ version: 1, id: id(3), accion: 'RECIBIR_EFECTIVO', tipoId: 'vidrio', datos: { cantidad: 2, sesionCajaId: id(4), precioEsperado: 1500.25, notas: null } })
const ack = () => ({ id: id(3), kiosco_id: kid, tipo_id: 'vidrio', stock_vacios: 2, importe: 3000.5 })
let outbox: EnvasesOutbox
beforeEach(() => { outbox = new EnvasesOutbox(`Envases-test-${crypto.randomUUID()}`) })
afterEach(async () => { vi.restoreAllMocks(); await outbox.delete() })

it('persiste antes de red, conserva cuerpo/ID tras respuesta perdida y recupera ACK', async () => {
  const enviar = vi.fn(async () => {
    expect((await outbox.operaciones.get(id(3)))?.solicitud).toEqual(solicitud())
    throw new Error('Respuesta perdida después del commit')
  })
  await expect(procesarOperacionEnvase(outbox, kid, uid, solicitud(), enviar)).rejects.toThrow('Respuesta perdida')
  const nombre = outbox.name
  outbox.close(); outbox = new EnvasesOutbox(nombre)
  expect(await outbox.pendientes(kid, uid)).toHaveLength(1)
  const reintentar = vi.fn(async () => ({ data: ack(), error: null }))
  expect(await procesarOperacionEnvase(outbox, kid, uid, solicitud(), reintentar)).toEqual(ack())
  expect(enviar.mock.calls[0]).toEqual(reintentar.mock.calls[0])
  expect(await outbox.pendientes(kid, uid)).toEqual([])
  await procesarOperacionEnvase(outbox, kid, uid, solicitud(), reintentar)
  expect(reintentar).toHaveBeenCalledTimes(1)
})
it('no envía nada si no se puede guardar de forma durable', async () => {
  vi.spyOn(outbox, 'guardar').mockRejectedValue(new Error('IndexedDB no disponible'))
  const enviar = vi.fn()
  await expect(procesarOperacionEnvase(outbox, kid, uid, solicitud(), enviar)).rejects.toThrow('IndexedDB')
  expect(enviar).not.toHaveBeenCalled()
})
it('impide cambiar cantidad/actor o iniciar otro pago mientras hay incertidumbre', async () => {
  await outbox.guardar(kid, uid, solicitud())
  const enviar = vi.fn()
  const distinta = { ...solicitud(), datos: { ...solicitud().datos, cantidad: 3 } }
  await expect(procesarOperacionEnvase(outbox, kid, uid, distinta, enviar)).rejects.toThrow('solicitud original')
  await expect(procesarOperacionEnvase(outbox, kid, id(5), solicitud(), enviar)).rejects.toThrow('identidad')
  await expect(procesarOperacionEnvase(outbox, kid, uid, { ...solicitud(), id: id(6) }, enviar)).rejects.toThrow('pendiente')
  expect(enviar).not.toHaveBeenCalled()
})
it('conserva entrega de efectivo pendiente después del ACK y exige confirmación humana antes de otra operación', async () => {
  await procesarOperacionEnvase(outbox, kid, uid, solicitud(), async () => ({ data: ack(), error: null }))
  expect(await outbox.recuperables(kid, uid)).toHaveLength(1)
  await expect(outbox.guardar(kid, uid, { ...solicitud(), id: id(6) })).rejects.toThrow('confirmar entrega')
  await expect(outbox.confirmarEntregaLocal(id(3), kid, id(7))).rejects.toThrow('esta sesión')
  await outbox.confirmarEntregaLocal(id(3), kid, uid)
  expect(await outbox.recuperables(kid, uid)).toEqual([])
  await outbox.guardar(kid, uid, { ...solicitud(), id: id(6) })
})
it.each([{ id: id(99) }, { kiosco_id: id(99) }, { importe: 3000 }, { stock_vacios: -1 }])('no marca éxito con ACK incompatible %j', async cambios => {
  await expect(procesarOperacionEnvase(outbox, kid, uid, solicitud(), async () => ({ data: { ...ack(), ...cambios }, error: null }))).rejects.toThrow()
  expect(await outbox.pendientes(kid, uid)).toHaveLength(1)
})
it('distingue rechazo SQL confirmado de error de transporte desconocido', async () => {
  await expect(procesarOperacionEnvase(outbox, kid, uid, solicitud(), async () => ({ data: null, error: { code: '22023' } }))).rejects.toThrow('No se confirmó')
  expect((await outbox.operaciones.get(id(3)))?.estado).toBe('RECHAZADO')
  await expect(procesarOperacionEnvase(outbox, kid, uid, solicitud(), vi.fn())).rejects.toThrow('fue rechazada')
  const nueva = { ...solicitud(), id: id(6) }
  await expect(procesarOperacionEnvase(outbox, kid, uid, nueva, async () => ({ data: null, error: { code: 'FETCH_ERROR' } }))).rejects.toThrow('No se confirmó')
  expect((await outbox.operaciones.get(id(6)))?.estado).toBe('PENDIENTE')
})
it.each([
  { cantidad: 1.5 }, { precioEsperado: -1 }, { cantidad: Infinity }, { precioEsperado: 1.001 }, { actorId: uid },
])('valida el contrato antes de guardar %j', async cambios => {
  const original = solicitud()
  await expect(outbox.guardar(kid, uid, { ...original, datos: { ...original.datos, ...cambios } })).rejects.toThrow()
  expect(await outbox.operaciones.count()).toBe(0)
})

it('recupera la misma recepción pendiente sin marcar entrega de dinero', async () => {
  const s = parsearSolicitudEnvase({ version: 1, id: id(8), accion: 'RECIBIR_PENDIENTES', tipoId: 'vidrio', datos: { cantidad: 1, notas: null } })
  const enviar = vi.fn().mockRejectedValueOnce(new Error('Timeout')).mockResolvedValue({ data: { id: id(8), kiosco_id: kid, tipo_id: 'vidrio', stock_vacios: 3, pendientes: 1, importe: 0 }, error: null })
  await expect(procesarOperacionEnvase(outbox, kid, uid, s, enviar)).rejects.toThrow()
  const r = await procesarOperacionEnvase(outbox, kid, uid, s, enviar)
  expect(enviar.mock.calls[0][0]).toEqual(enviar.mock.calls[1][0])
  expect(r.pendientes).toBe(1)
  expect(await outbox.recuperables(kid, uid)).toEqual([])
})
it('no acepta ACK de pendientes sin saldo ni pagos inesperados', async () => {
  const s = { version: 1, id: id(8), accion: 'RECIBIR_PENDIENTES', tipoId: 'vidrio', datos: { cantidad: 1, notas: null } }
  await expect(procesarOperacionEnvase(outbox, kid, uid, s, async () => ({ data: { id: id(8), kiosco_id: kid, tipo_id: 'vidrio', stock_vacios: 3, importe: 0 }, error: null }))).rejects.toThrow('Pendientes')
})
