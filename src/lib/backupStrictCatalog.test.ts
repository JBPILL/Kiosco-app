import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), state: { usuario: { id: 'owner', auth_user_id: 'auth', activo: true, rol: 'DUEÑO', kiosco_id: '10000000-0000-0000-0000-000000000001' }, kiosco: { id: '10000000-0000-0000-0000-000000000001' } } }))
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: () => mocks.state } }))
import { guardarCatalogoBackupStrict } from './backupStrictCatalog'
const kid = '10000000-0000-0000-0000-000000000001'
const id = '20000000-0000-0000-0000-000000000001'
beforeEach(() => { localStorage.clear(); mocks.rpc.mockReset(); mocks.state.usuario.id = 'owner'; vi.stubGlobal('crypto', webcrypto) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('recupera una respuesta incierta con operación, producto y datos originales', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Respuesta perdida' } })
    .mockResolvedValueOnce({ data: { producto: { id, kiosco_id: kid } }, error: null })
  const datos = { descripcion: 'Artículo', precio_venta: 200, stock_actual: 1 }
  await expect(guardarCatalogoBackupStrict('productos', kid, id, datos)).rejects.toThrow('Respuesta perdida')
  await guardarCatalogoBackupStrict('productos', kid, id, datos)
  expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[0])
  expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_producto_id: id, p_datos: datos })
  expect(localStorage.length).toBe(0)
})
it('no reemplaza los datos de una restauración aún incierta', async () => {
  mocks.rpc.mockResolvedValue({ error: { message: 'Sin confirmación' }, data: null })
  await expect(guardarCatalogoBackupStrict('productos', kid, id, { precio_venta: 200 })).rejects.toThrow()
  await expect(guardarCatalogoBackupStrict('productos', kid, id, { precio_venta: 300 })).rejects.toThrow(/original/)
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
})
it('no envía escrituras si falla el almacenamiento durable', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Cuota agotada') })
  await expect(guardarCatalogoBackupStrict('productos', kid, id, {})).rejects.toThrow('Cuota agotada')
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it.each([{ id: kid, kiosco_id: kid }, { id, kiosco_id: id }, null])('conserva el pendiente frente a un ACK ajeno o ausente %#', async producto => {
  mocks.rpc.mockResolvedValue({ data: { producto }, error: null })
  await expect(guardarCatalogoBackupStrict('productos', kid, id, {})).rejects.toThrow(/no confirmó/)
  expect(localStorage.length).toBe(1)
})
it('categorías usan su RPC y exigen confirmación del comercio', async () => {
  mocks.rpc.mockResolvedValue({ data: { id, kiosco_id: kid }, error: null })
  await guardarCatalogoBackupStrict('categorias', kid, id, { nombre: 'Bebidas' })
  expect(mocks.rpc).toHaveBeenCalledWith('guardar_categoria_transaccional', expect.objectContaining({ p_categoria_id: id }))
})
it('un cambio de operador durante el envío no confirma ni borra la solicitud original', async () => {
  mocks.rpc.mockImplementation(async () => {
    mocks.state.usuario = { ...mocks.state.usuario, id: 'other-owner' }
    return { data: { producto: { id, kiosco_id: kid } }, error: null }
  })
  await expect(guardarCatalogoBackupStrict('productos', kid, id, {})).rejects.toThrow(/sesión original/)
  expect(localStorage.length).toBe(1)
})
