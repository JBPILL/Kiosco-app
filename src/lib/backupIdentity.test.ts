import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { identidadRestaurada } from './backupIdentity'
beforeEach(() => vi.stubGlobal('crypto', webcrypto))
afterEach(() => vi.unstubAllGlobals())
it('conserva el ID para recuperar en el mismo comercio', async () => {
  expect(await identidadRestaurada('k1', 'k1', 'promociones', 'p1')).toBe('p1')
})
it('genera un UUID reproducible y separa origen, destino y colección', async () => {
  const id = await identidadRestaurada('k1', 'k2', 'promociones', 'p1')
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(await identidadRestaurada('k1', 'k2', 'promociones', 'p1')).toBe(id)
  expect(await identidadRestaurada('k1', 'k3', 'promociones', 'p1')).not.toBe(id)
  expect(await identidadRestaurada('k3', 'k2', 'promociones', 'p1')).not.toBe(id)
  expect(await identidadRestaurada('k1', 'k2', 'lotes_producto', 'p1')).not.toBe(id)
})
it('rechaza registros sin identidad estable', async () => {
  await expect(identidadRestaurada('k1', 'k1', 'promociones', '')).rejects.toThrow('identidad')
})
