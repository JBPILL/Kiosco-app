import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), in: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from: mocks.from } }))
import { verificarArticulosLibres } from './freeArticleIdentity'

const esperado = { id: 'p1', descripcion: 'Fotocopias', precio_venta: 150 }
const fila = { ...esperado, kiosco_id: 'k1', activo: false }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.from.mockReturnValue({ select: mocks.select })
  mocks.select.mockReturnValue({ eq: mocks.eq })
  mocks.eq.mockReturnValue({ in: mocks.in })
  mocks.in.mockResolvedValue({ data: [fila], error: null })
})
it('reutiliza identidad exacta, consultando sólo campos públicos del comercio', async () => {
  await verificarArticulosLibres('k1', [esperado, esperado])
  expect(mocks.eq).toHaveBeenCalledWith('kiosco_id', 'k1')
  expect(mocks.in).toHaveBeenCalledWith('id', ['p1'])
  expect(mocks.select).toHaveBeenCalledWith('id,kiosco_id,descripcion,precio_venta,activo')
})
it.each([
  [], [null], [{ ...fila, kiosco_id: 'otro' }], [{ ...fila, activo: true }],
  [{ ...fila, descripcion: 'Otro' }], [{ ...fila, precio_venta: 200 }],
  [{ ...fila, precio_venta: null }], [fila, fila],
].map(data => ({ data })))('rechaza identidad ausente o incompatible $data', async ({ data }) => {
  mocks.in.mockResolvedValue({ data, error: null })
  await expect(verificarArticulosLibres('k1', [esperado])).rejects.toThrow()
})
it('no acepta un fallo de lectura como confirmación', async () => {
  mocks.in.mockResolvedValue({ data: [fila], error: { message: 'Sin conexión' } })
  await expect(verificarArticulosLibres('k1', [esperado])).rejects.toThrow('No se confirmó')
})
it('rechaza el mismo ID con dos precios antes de consultar', async () => {
  await expect(verificarArticulosLibres('k1', [esperado, { ...esperado, precio_venta: 200 }])).rejects.toThrow('conflicto')
  expect(mocks.from).not.toHaveBeenCalled()
})
