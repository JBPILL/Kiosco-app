import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: mocks }))
vi.mock('./utils', () => ({ clearCachedProductos: vi.fn() }))
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: () => ({ usuario: { id: 'owner', auth_user_id: 'auth', activo: true, rol: 'DUEÑO', kiosco_id: '10000000-0000-0000-0000-000000000002' }, kiosco: { id: '10000000-0000-0000-0000-000000000002' } }) } }))
import { restaurarBackupIntegral, validarBackupJSON } from './backupUtils'
const kid = '10000000-0000-0000-0000-000000000001'
const target = '10000000-0000-0000-0000-000000000002'
const stored = new Map<string, Record<string, unknown>>()
const categories = new Map<string, Record<string, unknown>>()
const promotions = new Map<string, Record<string, unknown>>()
function backup() {
  const productos = [1, 2].map(n => ({ id: `20000000-0000-0000-0000-00000000000${n}`, kiosco_id: kid,
    descripcion: 'Misma descripción', precio_venta: 200, precio_costo: 100, stock_actual: n, stock_minimo: 0, activo: true, es_favorito: n === 1 }))
  return validarBackupJSON(JSON.stringify({ version: '3.0', app: 'KioskoApp', exportDate: '2026-10-20T00:00:00Z',
    kiosco: { id: kid }, productos, categorias: [], proveedores: [], clientes: [], promociones: [], lotes_producto: [] }), target).datos!
}
beforeEach(() => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true'); vi.stubEnv('VITE_AUDITORIA_MOTIVO_PRECIO', 'false')
  vi.stubGlobal('crypto', webcrypto); localStorage.clear(); stored.clear(); categories.clear(); promotions.clear(); mocks.rpc.mockReset(); mocks.from.mockReset()
  mocks.from.mockImplementation((table: string) => {
    let cursor = ''
    const chain = { select: () => chain, eq: () => chain, order: () => chain,
      gt: (_campo: string, valor: string) => { cursor = valor; return chain }, limit: () => chain,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data:
        [...(table === 'productos' ? stored : table === 'categorias' ? categories : table === 'promociones' ? promotions : new Map<string, Record<string, unknown>>()).values()]
          .filter(p => String(p.id) > cursor).sort((a, b) => String(a.id).localeCompare(String(b.id))), error: null }).then(resolve) }
    return chain
  })
  mocks.rpc.mockImplementation(async (name: string, args: { p_producto_id?: string; p_categoria_id?: string; p_promocion_id?: string; p_datos: Record<string, unknown> }) => {
    const id = args.p_producto_id || args.p_categoria_id || args.p_promocion_id
    if (!id) throw new Error('RPC inesperada')
    const fila = { ...args.p_datos, id, kiosco_id: target }
    if (name === 'guardar_producto_transaccional') { stored.set(id, fila); return { data: { producto: fila }, error: null } }
    if (name === 'guardar_categoria_transaccional') { categories.set(id, fila); return { data: fila, error: null } }
    if (name === 'guardar_promocion_transaccional') { promotions.set(id, fila); return { data: fila, error: null } }
    throw new Error('RPC inesperada')
  })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
it('restaura dos identidades con igual descripción sin INSERT directo ni duplicarlas al reintentar', async () => {
  const datos = backup()
  expect((await restaurarBackupIntegral(datos, 'FUSION', target)).ok).toBe(true)
  const ids = [...stored.keys()]
  expect(ids).toHaveLength(2)
  expect(ids[0]).not.toBe(ids[1])
  expect((await restaurarBackupIntegral(datos, 'FUSION', target)).ok).toBe(true)
  expect([...stored.keys()]).toEqual(ids)
  expect([...stored.values()].map(p => p.stock_actual).sort()).toEqual([1, 2])
  expect([...stored.values()].find(p => p.stock_actual === 1)?.es_favorito).toBe(true)
})
it('rechaza una copia sin contrato strict antes de escribir el catálogo', async () => {
  const datos = backup(); datos.proveedores = [{ id: kid, nombre: 'Proveedor' }]
  const result = await restaurarBackupIntegral(datos, 'FUSION', target)
  expect(result.ok).toBe(false)
  expect(mocks.from).not.toHaveBeenCalled()
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('remapea categoría, producto y composición de promociones sin duplicarlas al repetir', async () => {
  const datos = backup()
  const categoriaId = '30000000-0000-0000-0000-000000000001'
  datos.categorias = [{ id: categoriaId, kiosco_id: kid, nombre: 'Bebidas', color: '#123456', orden: 1 }]
  datos.productos[0].categoria_id = categoriaId
  datos.promociones = [{ id: '40000000-0000-0000-0000-000000000001', kiosco_id: kid, nombre: 'Oferta', tipo: 'COMBO',
    producto_id: datos.productos[0].id, categoria_id: categoriaId, precio_combo: 300,
    items_combo: datos.productos.map(p => ({ producto_id: p.id, cantidad: 1 })), dias_semana: [1, 5], activo: false }]
  const result = await restaurarBackupIntegral(datos, 'FUSION', target)
  expect(result.ok).toBe(true)
  const promo = [...promotions.values()][0]
  expect(promo.producto_id).not.toBe(datos.productos[0].id)
  expect(stored.has(String(promo.producto_id))).toBe(true)
  expect(categories.has(String(promo.categoria_id))).toBe(true)
  expect(promo.items_combo).toEqual([...stored.keys()].map(id => ({ producto_id: id, cantidad: 1 })))
  expect(promo.dias_semana).toEqual([1, 5]); expect(promo.activo).toBe(false)
  const original = JSON.parse(JSON.stringify(promo))
  expect((await restaurarBackupIntegral(datos, 'FUSION', target)).ok).toBe(true)
  expect(promotions.size).toBe(1)
  expect([...promotions.values()][0]).toEqual(original)
})
it('no escribe una promoción que referencia productos ausentes de la copia', async () => {
  const datos = backup()
  datos.promociones = [{ id: '40000000-0000-0000-0000-000000000001', nombre: 'Inválida', tipo: 'PORCENTAJE', producto_id: kid }]
  expect((await restaurarBackupIntegral(datos, 'FUSION', target)).ok).toBe(false)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
