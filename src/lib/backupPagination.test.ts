import { expect, it, vi } from 'vitest'
import { leerColeccionPorId } from './backupPagination'
it('continúa las páginas cortas y usa el último ID como cursor', async () => {
  const query = vi.fn().mockResolvedValueOnce({ data: [{ id: 'a' }], error: null })
    .mockResolvedValueOnce({ data: [{ id: 'b' }], error: null })
    .mockResolvedValueOnce({ data: [], error: null })
  expect(await leerColeccionPorId(query, 'productos')).toEqual([{ id: 'a' }, { id: 'b' }])
  expect(query.mock.calls).toEqual([[null], ['a'], ['b']])
})
it('rechaza una página repetida sin entrar en un bucle', async () => {
  const query = vi.fn().mockResolvedValue({ data: [{ id: 'a' }], error: null })
  await expect(leerColeccionPorId(query, 'productos')).rejects.toThrow('no avanzó')
  expect(query).toHaveBeenCalledTimes(2)
})
it('rechaza una respuesta sin colección confirmada', async () => {
  await expect(leerColeccionPorId(async () => ({ data: null, error: null }), 'productos')).rejects.toThrow('no confirmó')
})
