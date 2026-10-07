import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ManualCheckoutOutbox, procesarCheckoutManual } from './manualCheckoutOutbox'
import { leerEntradaCheckoutManual } from '../../supabase/functions/_shared/manualCheckoutRequest'
import type { TicketData } from '../components/pos/TicketReceiptModal'

const kid = '10000000-0000-0000-0000-000000000001'
const uid = '20000000-0000-0000-0000-000000000001'
const id = '40000000-0000-0000-0000-000000000001'
const producto = '50000000-0000-0000-0000-000000000001'
function entrada() {
  return leerEntradaCheckoutManual({ version: 1, checkoutId: id, kioscoId: kid, usuarioId: uid,
    sesionCajaId: '30000000-0000-0000-0000-000000000001', fechaHora: '2026-10-07T12:00:00Z',
    clienteId: null, notas: null, tipoAjuste: 'NINGUNO', valorAjuste: 0, totalEsperado: 100,
    subtotalesEsperados: [100], componentesEsperados: [],
    lineas: [{ tipo: 'PRODUCTO', id: '60000000-0000-0000-0000-000000000001', productoId: producto, cantidad: 1, sinEnvase: false }],
    pagos: [{ id: '70000000-0000-0000-0000-000000000001', medio: 'EFECTIVO', montoCentavos: 10000, referencia: null }] })
}
function resultado() {
  return { venta_id: id, kiosco_id: kid, fecha_hora: entrada().fechaHora, total: 100,
    stock: [{ producto_id: producto, stock_actual: 9 }], saldo_cliente: null }
}
let outbox: ManualCheckoutOutbox
beforeEach(() => { outbox = new ManualCheckoutOutbox(`Cobros-test-${crypto.randomUUID()}`) })
afterEach(async () => { vi.restoreAllMocks(); await outbox.delete() })

it('la actualización desde versión 1 conserva los cobros y los hace visibles', async () => {
  const nombre = outbox.name
  outbox.close()
  const anterior = new Dexie(nombre)
  anterior.version(1).stores({ cobros: 'id,&[kioscoId+usuarioId+ticketClave],[kioscoId+usuarioId],estado' })
  await anterior.table('cobros').add({ id, kioscoId: kid, usuarioId: uid, ticketClave: 'ticket-1',
    entrada: entrada(), estado: 'PENDIENTE', resultado: null, ultimoError: null })
  anterior.close()
  outbox = new ManualCheckoutOutbox(nombre)
  expect(await outbox.pendientes(kid, uid)).toHaveLength(1)
  expect((await outbox.recuperarTicket(kid, uid, 'ticket-1'))?.entrada).toEqual(entrada())
})

it('persiste antes de enviar y recupera la confirmación sin otra llamada', async () => {
  const enviar = vi.fn(async () => {
    expect(await outbox.pendientes(kid, uid)).toHaveLength(1)
    return resultado()
  })
  await procesarCheckoutManual(entrada(), 'ticket-1', { outbox, enviar })
  expect(await outbox.pendientes(kid, uid)).toHaveLength(0)
  expect(await procesarCheckoutManual(entrada(), 'ticket-1', { outbox, enviar })).toEqual(resultado())
  expect(enviar).toHaveBeenCalledOnce()
})

it('conserva la entrada original tras respuesta perdida y reapertura de la base', async () => {
  const enviar = vi.fn().mockRejectedValueOnce(new Error('Respuesta perdida')).mockResolvedValue(resultado())
  await expect(procesarCheckoutManual(entrada(), 'ticket-1', { outbox, enviar })).rejects.toThrow('Respuesta perdida')
  const nombre = outbox.name
  outbox.close()
  outbox = new ManualCheckoutOutbox(nombre)
  expect((await outbox.pendientes(kid, uid))[0].entrada).toEqual(entrada())
  await procesarCheckoutManual(entrada(), 'ticket-1', { outbox, enviar })
  expect(enviar.mock.calls[0][0]).toEqual(enviar.mock.calls[1][0])
})

it('un fallo de persistencia impide la llamada remota', async () => {
  vi.spyOn(outbox.cobros, 'add').mockRejectedValue(new Error('Disco lleno'))
  const enviar = vi.fn(async () => resultado())
  await expect(procesarCheckoutManual(entrada(), 'ticket-1', { outbox, enviar })).rejects.toThrow('Disco lleno')
  expect(enviar).not.toHaveBeenCalled()
  expect(await outbox.pendientes(kid, uid)).toHaveLength(0)
})

it('dos conexiones no pueden asignar distintos cobros al mismo ticket', async () => {
  const otraBase = new ManualCheckoutOutbox(outbox.name)
  const otraEntrada = { ...entrada(), checkoutId: '40000000-0000-0000-0000-000000000002' }
  try {
    const intentos = await Promise.allSettled([outbox.guardar(entrada(), 'ticket-1'), otraBase.guardar(otraEntrada, 'ticket-1')])
    expect(intentos.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(await outbox.pendientes(kid, uid)).toHaveLength(1)
  } finally { otraBase.close() }
})

it('rechaza cambiar el cuerpo o ticket con un ID ya reservado', async () => {
  await outbox.guardar(entrada(), 'ticket-1')
  await expect(outbox.guardar({ ...entrada(), notas: 'Otro cuerpo' }, 'ticket-1')).rejects.toThrow(/no coincide/)
  await expect(outbox.guardar(entrada(), 'ticket-2')).rejects.toThrow(/no coincide/)
})

it('filtra pendientes y recuperación por comercio y operador', async () => {
  await outbox.guardar(entrada(), 'ticket-1')
  expect(await outbox.pendientes(uid, uid)).toEqual([])
  expect(await outbox.pendientes(kid, kid)).toEqual([])
  expect(await outbox.recuperarTicket(kid, uid, 'ticket-1')).toMatchObject({ id })
  expect(await outbox.recuperarTicket(kid, kid, 'ticket-1')).toBeUndefined()
})

it.each([
  { ...resultado(), venta_id: uid },
  { ...resultado(), total: 99 },
  { ...resultado(), stock: [] },
  { ...resultado(), stock: [{ producto_id: producto, stock_actual: -1 }] },
  { ...resultado(), saldo_cliente: 10 },
  { ...resultado(), precio_costo: 90 },
])('no acepta una confirmación incompleta o incoherente %#', async respuesta => {
  await expect(procesarCheckoutManual(entrada(), 'ticket-1', { outbox, enviar: async () => respuesta })).rejects.toThrow()
  expect(await outbox.pendientes(kid, uid)).toHaveLength(1)
})

it('un fallo tardío de otra pestaña no borra la confirmación', async () => {
  await outbox.guardar(entrada(), 'ticket-1')
  await outbox.confirmar(id, resultado())
  await outbox.registrarFallo(id)
  expect(await outbox.recuperarTicket(kid, uid, 'ticket-1')).toMatchObject({ estado: 'CONFIRMADO', ultimoError: null })
  await expect(outbox.confirmar(id, { ...resultado(), stock: [{ producto_id: producto, stock_actual: 8 }] })).rejects.toThrow(/contradictoria/)
})

it('sólo una pestaña reclama la presentación automática y el pendiente conserva el marcador offline', async () => {
  const recibo: TicketData = { ventaId: id, fecha: entrada().fechaHora, total: 100, subtotal: 100,
    medioPago: 'EFECTIVO', items: [{ descripcion: 'Producto', cantidad: 1, precioUnitario: 100, subtotal: 100 }] }
  await outbox.guardar(entrada(), 'ticket-1', recibo)
  await expect(outbox.reclamarPresentacion(id)).rejects.toThrow(/pendiente/)
  const reclamados = await Promise.all([outbox.reclamarPresentacion(id, true), outbox.reclamarPresentacion(id, true)])
  expect(reclamados.filter(Boolean)).toHaveLength(1)
  expect(reclamados.find(Boolean)?.notas).toContain('[GUARDADO OFFLINE]')
  await outbox.confirmar(id, resultado())
  expect(await outbox.recuperarTicket(kid, uid, 'ticket-1')).toMatchObject({ visibilidad: 'ARCHIVADO' })
  expect(await outbox.reclamarPresentacion(id)).toBeNull()
})
it('conserva pendiente la cancelación durable hasta recibir acuse válido', async () => {
  await outbox.guardar(entrada(), 'ticket-cancelar')
  await outbox.solicitarCancelacion(id, { motivo: 'Cobro no realizado', resolucion: 'NO_COBRADO', referencia: null })
  expect(await outbox.pendientes(kid, uid)).toHaveLength(1)
  const enviar = vi.fn()
  await expect(procesarCheckoutManual(entrada(), 'ticket-cancelar', { outbox, enviar })).rejects.toThrow(/cancelación pendiente/)
  expect(enviar).not.toHaveBeenCalled()
  await expect(outbox.confirmarCancelacion(id, { estado: 'CANCELADO', checkout_id: id, kiosco_id: 'otro', resolucion: 'NO_COBRADO', cancelado_en: new Date().toISOString() })).rejects.toThrow(/inválida/)
  expect(await outbox.pendientes(kid, uid)).toHaveLength(1)
  const acuse = { estado: 'CANCELADO', checkout_id: id, kiosco_id: kid, resolucion: 'NO_COBRADO', cancelado_en: '2026-10-07T15:00:00Z' }
  await outbox.confirmarCancelacion(id, acuse)
  expect(await outbox.pendientes(kid, uid)).toHaveLength(0)
  expect((await outbox.recuperarTicket(kid, uid, 'ticket-cancelar'))?.cancelacionConfirmada).toEqual(acuse)
  await expect(outbox.confirmar(id, resultado())).rejects.toThrow(/cancelado/)
})
it('mantiene la solicitud original de cancelación y exige referencia para reintegro', async () => {
  await outbox.guardar(entrada(), 'ticket-cancelar')
  await expect(outbox.solicitarCancelacion(id, { motivo: 'Cobro reintegrado', resolucion: 'REINTEGRADO', referencia: null })).rejects.toThrow(/referencia/)
  await outbox.solicitarCancelacion(id, { motivo: 'Cobro no realizado', resolucion: 'NO_COBRADO', referencia: null })
  await expect(outbox.solicitarCancelacion(id, { motivo: 'Otro motivo posterior', resolucion: 'NO_COBRADO', referencia: null })).rejects.toThrow(/original/)
})
it('conserva la confirmación que ganó la carrera y rechaza un acuse posterior de cancelación', async () => {
  await outbox.guardar(entrada(), 'ticket-carrera')
  await outbox.solicitarCancelacion(id, { motivo: 'Cobro no realizado', resolucion: 'NO_COBRADO', referencia: null })
  await outbox.confirmar(id, resultado())
  await expect(outbox.confirmarCancelacion(id, { estado: 'CANCELADO', checkout_id: id, kiosco_id: kid, resolucion: 'NO_COBRADO', cancelado_en: '2026-10-07T15:00:00Z' })).rejects.toThrow(/Reportes/)
  expect((await outbox.recuperarTicket(kid, uid, 'ticket-carrera'))?.estado).toBe('CONFIRMADO')
})
