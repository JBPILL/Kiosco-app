import { beforeEach, expect, it, vi } from 'vitest'
import type { SesionCaja } from '../types/database'
const memoria = vi.hoisted(() => ({ filas: new Map<string, unknown>(), fallar: false }))
vi.mock('dexie', () => ({ default: class {
  version() { return { stores: vi.fn() } }
  table() { return {
    put: async (fila: { kioscoId: string; sesionId: string }) => {
      if (memoria.fallar) throw new Error('Almacenamiento no disponible')
      memoria.filas.set(`${fila.kioscoId}/${fila.sesionId}`, fila)
    },
    where: () => ({ equals: (id: string) => ({ toArray: async () => [...memoria.filas.values()]
      .filter(f => (f as { kioscoId: string }).kioscoId === id) }) }),
  } }
} }))
import { crearRespaldoCierreLocal, guardarRespaldoCierreLocal, listarRespaldosCierreLocal } from './backupCierreLocal'

const sesion: SesionCaja = { id: 's1', kiosco_id: 'k1', usuario_id: 'u1',
  fecha_apertura: '2026-10-06T08:00:00Z', fecha_cierre: '2026-10-06T18:00:00Z',
  monto_inicial: 100, monto_final_declarado: 120, monto_final_sistema: 120, diferencia: 0, estado: 'CERRADA' }
beforeEach(() => { memoria.filas.clear(); memoria.fallar = false })

it('proyecta el arqueo sin copiar campos de credenciales o relaciones', () => {
  const entrada = { ...sesion, secreto: 'privado' }
  const copia = crearRespaldoCierreLocal(entrada, null, [], true)
  expect(copia.sesion).toEqual(sesion)
  expect(JSON.stringify(copia)).not.toContain('privado')
})
it('rechaza una caja abierta y distingue cierre remoto de arqueo pendiente', () => {
  expect(() => crearRespaldoCierreLocal({ ...sesion, estado: 'ABIERTA' }, null, [], true)).toThrow()
  expect(crearRespaldoCierreLocal(sesion, null, [], false).cierreConfirmadoRemoto).toBe(false)
})
it('guarda una identidad por sesión y lista únicamente el comercio solicitado', async () => {
  await guardarRespaldoCierreLocal(crearRespaldoCierreLocal(sesion, null, [], true))
  await guardarRespaldoCierreLocal(crearRespaldoCierreLocal(sesion, null, [], true))
  await guardarRespaldoCierreLocal(crearRespaldoCierreLocal({ ...sesion, kiosco_id: 'k2' }, null, [], true))
  expect(memoria.filas.size).toBe(2)
  expect(await listarRespaldosCierreLocal('k1')).toHaveLength(1)
})
it('no informa éxito si IndexedDB rechaza la escritura', async () => {
  memoria.fallar = true
  await expect(guardarRespaldoCierreLocal(crearRespaldoCierreLocal(sesion, null, [], true))).rejects.toThrow()
})
