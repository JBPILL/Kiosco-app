import { beforeEach, expect, it, vi } from 'vitest'
import { ejecutarCobroManual, recuperarFlujoCobroManual } from './manualCheckoutFlow'
import { crearEntradaCobroManual } from './manualCheckoutCart'
import { crearItem, crearProducto } from '../test/factories'
import type { DatosCobroManual } from './manualCheckoutCart'
import type { TicketData } from '../components/pos/TicketReceiptModal'

const mocks = vi.hoisted(() => ({ recuperar: vi.fn(), guardar: vi.fn(), cerrar: vi.fn(), reclamar: vi.fn(), bloquear: vi.fn(), auth: vi.fn() }))
vi.mock('./manualCheckoutClient', () => ({ recuperarCobroManualLocal: mocks.recuperar, guardarCobroManualLocal: mocks.guardar,
  cerrarCobroManualLocal: mocks.cerrar, reclamarComprobanteManual: mocks.reclamar }))
vi.mock('../stores/cartStore', () => ({ useCartStore: { getState: () => ({ bloquearTabPorCobro: mocks.bloquear }) } }))
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: mocks.auth } }))
const kid = '10000000-0000-0000-0000-000000000001'
const uid = '20000000-0000-0000-0000-000000000001'
const ventaId = '40000000-0000-0000-0000-000000000001'
const prod = '50000000-0000-0000-0000-000000000001'
function datos(): DatosCobroManual {
  return { checkoutId: ventaId, kioscoId: kid, usuarioId: uid, sesionCajaId: '30000000-0000-0000-0000-000000000001',
    fechaHora: '2026-10-07T12:00:00.000Z', clienteId: null, notas: null,
    items: [crearItem(crearProducto({ id: prod, kiosco_id: kid }), 1)], componentes: [], tipoAjuste: 'NINGUNO', valorAjuste: 0,
    total: 100, pagos: [{ id: '70000000-0000-0000-0000-000000000001', medio: 'EFECTIVO', montoCentavos: 10000, referencia: null }] }
}
const recibo: TicketData = { ventaId, fecha: datos().fechaHora, total: 100, subtotal: 100, medioPago: 'EFECTIVO',
  items: [{ descripcion: 'Producto', cantidad: 1, precioUnitario: 100, subtotal: 100 }] }
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  mocks.recuperar.mockResolvedValue(undefined)
  mocks.guardar.mockResolvedValue({})
  mocks.cerrar.mockResolvedValue({ venta_id: ventaId })
  mocks.reclamar.mockResolvedValue(recibo)
  mocks.auth.mockReturnValue({ usuario: { id: uid }, kiosco: { id: kid } })
})

it('proyecta el carrito sin costos y conserva receta por unidad', () => {
  const actual = datos()
  actual.items[0].producto.es_combo = true
  actual.componentes = [{ id: 'comp', kiosco_id: kid, combo_producto_id: prod,
    componente_producto_id: '50000000-0000-0000-0000-000000000002', cantidad: 24 }]
  const entrada = crearEntradaCobroManual(actual)
  expect(entrada.componentesEsperados[0].cantidad).toBe(24)
  expect(JSON.stringify(entrada)).not.toContain('precio_costo')
  expect(JSON.stringify(entrada)).not.toContain('stock_actual')
})

it('persiste y bloquea antes de enviar, y reclama el comprobante después de confirmar', async () => {
  const res = await ejecutarCobroManual(datos(), 'tab-1', recibo)
  expect(res).toMatchObject({ ventaId, pendiente: false, recuperado: false })
  expect(mocks.guardar.mock.invocationCallOrder[0]).toBeLessThan(mocks.cerrar.mock.invocationCallOrder[0])
  expect(mocks.bloquear.mock.invocationCallOrder[0]).toBeLessThan(mocks.cerrar.mock.invocationCallOrder[0])
  expect(mocks.cerrar.mock.invocationCallOrder[0]).toBeLessThan(mocks.reclamar.mock.invocationCallOrder[0])
})

it('recupera cuerpo y comprobante originales aunque cambien los datos del modal', async () => {
  const original = crearEntradaCobroManual(datos())
  mocks.recuperar.mockResolvedValue({ entrada: original, recibo, estado: 'PENDIENTE' })
  const nuevos = { ...datos(), checkoutId: uid, total: 1 }
  expect((await ejecutarCobroManual(nuevos, 'tab-1', { ...recibo, total: 1 })).recuperado).toBe(true)
  expect(mocks.guardar).toHaveBeenCalledWith(original, 'tab-1', recibo)
  expect(mocks.cerrar).toHaveBeenCalledWith(original, 'tab-1')
})

it('recupera directamente sin reconstruir pagos ni exigir datos de una caja nueva', async () => {
  const original = crearEntradaCobroManual(datos())
  mocks.recuperar.mockResolvedValue({ entrada: original, recibo, estado: 'PENDIENTE' })
  expect(await recuperarFlujoCobroManual(kid, uid, 'tab-1')).toMatchObject({ ventaId, recuperado: true, pendiente: false })
  expect(mocks.cerrar).toHaveBeenCalledWith(original, 'tab-1')
  expect(mocks.guardar).not.toHaveBeenCalled()
})

it('una recuperación sin comprobante original no envía ni libera el cobro', async () => {
  await expect(recuperarFlujoCobroManual(kid, uid, 'tab-1')).rejects.toThrow(/comprobante original/)
  expect(mocks.cerrar).not.toHaveBeenCalled()
  expect(mocks.reclamar).not.toHaveBeenCalled()
})

it('sin conexión persiste un comprobante provisional y no llama al servidor', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  expect((await ejecutarCobroManual(datos(), 'tab-1', recibo)).pendiente).toBe(true)
  expect(mocks.guardar).toHaveBeenCalledOnce()
  expect(mocks.cerrar).not.toHaveBeenCalled()
  expect(mocks.reclamar).toHaveBeenCalledWith(ventaId, true)
})

it('un fallo de almacenamiento no bloquea ni envía', async () => {
  mocks.guardar.mockRejectedValue(new Error('Disco lleno'))
  await expect(ejecutarCobroManual(datos(), 'tab-1', recibo)).rejects.toThrow('Disco lleno')
  expect(mocks.bloquear).not.toHaveBeenCalled()
  expect(mocks.cerrar).not.toHaveBeenCalled()
})

it('una respuesta perdida conserva el bloqueo y no presenta un comprobante confirmado', async () => {
  mocks.cerrar.mockRejectedValue(new Error('Sin respuesta'))
  await expect(ejecutarCobroManual(datos(), 'tab-1', recibo)).rejects.toThrow('Sin respuesta')
  expect(mocks.bloquear).toHaveBeenCalledWith('tab-1', ventaId)
  expect(mocks.reclamar).not.toHaveBeenCalled()
})

it('si cambia el operador durante la petición, no muestra datos al nuevo usuario', async () => {
  mocks.auth.mockReturnValue({ usuario: { id: kid }, kiosco: { id: kid } })
  await expect(ejecutarCobroManual(datos(), 'tab-1', recibo)).rejects.toThrow(/sesión cambió/)
  expect(mocks.reclamar).not.toHaveBeenCalled()
})
