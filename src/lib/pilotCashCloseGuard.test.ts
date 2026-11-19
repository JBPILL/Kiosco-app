import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { EnvasesOutbox, procesarOperacionEnvase } from './envasesOutbox'
import { CashReturnOutbox } from './cashReturnOutbox'
import { hayOperacionesPilotoPorResolver } from './pilotCashCloseGuard'
const id = (n: number) => `ee000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const envases = new EnvasesOutbox(), devoluciones = new CashReturnOutbox()
const solicitud = { version: 1, id: id(4), accion: 'RECIBIR_EFECTIVO', tipoId: 'vidrio', datos: { cantidad: 1, sesionCajaId: id(3), precioEsperado: 100, notas: null } }
beforeEach(async () => { await envases.operaciones.clear(); await devoluciones.operaciones.clear() })
afterEach(async () => { await envases.operaciones.clear(); await devoluciones.operaciones.clear() })

it('bloquea caja por una respuesta incierta de otro usuario del mismo puesto', async () => {
  await envases.guardar(id(1), id(2), solicitud)
  expect(await hayOperacionesPilotoPorResolver(id(1), id(3))).toBe(true)
  expect(await hayOperacionesPilotoPorResolver(id(1), id(99))).toBe(false)
  expect(await hayOperacionesPilotoPorResolver(id(99), id(3))).toBe(false)
})
it('mantiene el bloqueo después del ACK hasta verificar entrega', async () => {
  await procesarOperacionEnvase(envases, id(1), id(2), solicitud, async () => ({ data: { id: id(4), kiosco_id: id(1), tipo_id: 'vidrio', stock_vacios: 1, importe: 100 }, error: null }))
  expect(await hayOperacionesPilotoPorResolver(id(1), id(3))).toBe(true)
  await envases.confirmarEntregaLocal(id(4), id(1), id(2))
  expect(await hayOperacionesPilotoPorResolver(id(1), id(3))).toBe(false)
})
it('incluye las devoluciones de venta pendientes', async () => {
  await devoluciones.guardar(id(1), id(2), { version: 1, id: id(5), ventaId: id(6), sesionReintegroId: id(3), metodo: 'EFECTIVO_CAJA', motivo: 'ERROR_COBRO', notas: null, items: [{ detalleId: id(7), cantidad: 1, reingresaStock: true }] })
  expect(await hayOperacionesPilotoPorResolver(id(1), id(3))).toBe(true)
})
