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
function backup() {
  const productos = [1, 2].map(n => ({ id: `20000000-0000-0000-0000-00000000000${n}`, kiosco_id: kid,
    descripcion: 'Misma descripción', precio_venta: 200, precio_costo: 100, stock_actual: n, stock_minimo: 0, activo: true, es_favorito: n === 1 }))
  return validarBackupJSON(JSON.stringify({ version: '3.0', app: 'KioskoApp', exportDate: '2026-10-20T00:00:00Z',
    kiosco: { id: kid }, productos, categorias: [], proveedores: [], clientes: [], promociones: [], lotes_producto: [] }), target).datos!
}
beforeEach(() => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true'); vi.stubEnv('VITE_AUDITORIA_MOTIVO_PRECIO', 'false')
  vi.stubGlobal('crypto', webcrypto); localStorage.clear(); stored.clear(); mocks.rpc.mockReset(); mocks.from.mockReset()
  mocks.from.mockImplementation((table: string) => {
    let cursor = ''
    const chain = { select: () => chain, eq: () => chain, order: () => chain,
      gt: (_campo: string, valor: string) => { cursor = valor; return chain }, limit: () => chain,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: table === 'productos'
        ? [...stored.values()].filter(p => String(p.id) > cursor)
          .sort((a, b) => String(a.id).localeCompare(String(b.id))) : [], error: null }).then(resolve) }
    return chain
  })
  mocks.rpc.mockImplementation(async (name: string, args: { p_producto_id: string; p_datos: Record<string, unknown> }) => {
    if (name !== 'guardar_producto_transaccional') throw new Error('RPC inesperada')
    const producto = { ...args.p_datos, id: args.p_producto_id, kiosco_id: target }
    stored.set(producto.id, producto)
    return { data: { producto }, error: null }
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
