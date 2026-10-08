import { beforeEach, expect, it, vi } from 'vitest'
import { useDevolucionStore, type VentaConDetalles } from './devolucionStore'
const mock = vi.hoisted(() => ({ from: vi.fn(), resultado: vi.fn(), insert: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { from: mock.from } }))
vi.mock('./cajaStore', () => ({ useCajaStore: {} }))
vi.mock('./clienteStore', () => ({ useClienteStore: {} }))
vi.mock('./comboStore', () => ({ useComboStore: {} }))
vi.mock('./loteStore', () => ({ useLoteStore: {} }))
vi.mock('../lib/utils', () => ({ getCachedProductos: vi.fn(), saveCachedProductos: vi.fn() }))
const venta: VentaConDetalles = {
  id: 'venta', kiosco_id: 'comercio', usuario_id: null, sesion_caja_id: null,
  fecha_hora: '2026-10-08', total: 100, estado: 'COMPLETADA', notas: null, sincronizado: true,
  afip_cae: null, afip_tipo_comprobante: null, afip_nro_comprobante: null,
  detalles: [{ id: 'detalle', venta_id: 'venta', producto_id: 'producto', cantidad: 1, precio_unitario: 100, subtotal: 100 }],
}
const item = { productoId: 'producto', cantidad: 1, precioUnitario: 100, reingresaStock: true }
beforeEach(() => {
  vi.clearAllMocks()
  const cadena = { select: vi.fn(() => cadena), eq: mock.resultado, insert: mock.insert }
  mock.from.mockReturnValue(cadena)
})
const procesar = (items = [item], kioscoId = 'comercio') => useDevolucionStore.getState().procesarDevolucion({
  venta, itemsADevolver: items, kioscoId, metodoReintegro: 'EFECTIVO_CAJA', motivo: 'CAMBIO_PRODUCTO',
})
it.each([NaN, Infinity, -1, 0])('rechaza cantidad inválida %s antes de acceder a Supabase', async cantidad => {
  expect((await procesar([{ ...item, cantidad }])).success).toBe(false)
  expect(mock.from).not.toHaveBeenCalled()
})
it.each([{ items: [item, item] }, { items: [{ ...item, productoId: 'ajeno' }] }, { items: [{ ...item, precioUnitario: Infinity }] }])('rechaza producto/precio inválido %j', async ({ items }) => {
  expect((await procesar(items)).success).toBe(false)
  expect(mock.from).not.toHaveBeenCalled()
})
it('rechaza comercio diferente', async () => {
  expect((await procesar([item], 'otro')).success).toBe(false)
  expect(mock.from).not.toHaveBeenCalled()
})
it('rechaza desbordamiento del importe antes de consultar o escribir', async () => {
  expect((await procesar([{ ...item, cantidad: 2, precioUnitario: Number.MAX_VALUE }])).success).toBe(false)
  expect(mock.from).not.toHaveBeenCalled()
})
it.each(['error', 'nulo', 'excepcion'])('no escribe si falla comprobación previa: %s', async modo => {
  if (modo === 'excepcion') mock.resultado.mockRejectedValue(new Error('sin conexión'))
  else mock.resultado.mockResolvedValue({ data: modo === 'error' ? [] : null, error: modo === 'error' ? { message: 'denegado' } : null })
  const resultado = await procesar()
  expect(resultado.success).toBe(false)
  expect(resultado.error).toContain('comprobar las devoluciones anteriores')
  expect(mock.insert).not.toHaveBeenCalled()
  expect(mock.from).toHaveBeenCalledTimes(1)
})
