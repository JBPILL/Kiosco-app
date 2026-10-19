import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from: m.from } }))
import { cargarHistorialDevolucionesTicket, cargarMovimientosEnvases } from './pilotOperationHistory'

const id = (n: number) => `ea000000-0000-4000-8000-${String(n).padStart(12, '0')}`
interface Consulta { tabla: string; cursor?: string; filtros: Record<string, unknown>; orden?: string; limite?: number }
let consultas: Consulta[], paginas: Record<string, { id: string; [k: string]: unknown }[]>, fallo: ((q: Consulta) => boolean) | null
const desde = '2026-10-01T00:00:00Z', hasta = '2026-10-18T23:00:00Z'
beforeEach(() => {
  consultas = []; fallo = null
  paginas = {
    envases_movimientos: [1, 2].map(n => ({ id: id(n), tipo_id: 'vidrio', accion: 'RECIBIR_TICKET', cantidad: 1, stock_resultante: n, importe: 100, distribuidor: null, creado_en: `2026-10-${String(n + 10)}T12:00:00Z` })),
    devoluciones_venta: [1, 2].map(n => ({ id: id(n), monto_total: n === 1 ? '0.33' : '0.34', detalles: [{ detalle_venta_id: id(9), cantidad: n === 1 ? '0.1' : '0.2' }] })),
  }
  m.from.mockImplementation((tabla: string) => {
    const q: Consulta = { tabla, filtros: {} }
    const chain = {
      select: () => chain, eq: (k: string, v: unknown) => { q.filtros[k] = v; return chain },
      gte: (k: string, v: unknown) => { q.filtros[`desde_${k}`] = v; return chain },
      lte: (k: string, v: unknown) => { q.filtros[`hasta_${k}`] = v; return chain },
      order: (k: string) => { q.orden = k; return chain }, limit: (n: number) => { q.limite = n; return chain },
      gt: (_k: string, v: string) => { q.cursor = v; return chain },
      then: (resolve: (r: unknown) => unknown) => {
        consultas.push(q)
        return Promise.resolve(resolve(fallo?.(q) ? { data: null, error: { message: 'Página rechazada' } }
          : { data: paginas[tabla].filter(r => !q.cursor || r.id > q.cursor).slice(0, 1), error: null }))
      },
    }
    return chain
  })
})

it('lee todo el período aunque el servidor limite páginas a una fila, con tenant y cortes en cada página', async () => {
  const filas = await cargarMovimientosEnvases(id(20), desde, hasta)
  expect(filas.map(f => f.id)).toEqual([id(2), id(1)])
  expect(consultas).toHaveLength(3)
  expect(consultas.every(q => q.filtros.kiosco_id === id(20) && q.filtros.desde_creado_en === desde && q.filtros.hasta_creado_en === hasta && q.orden === 'id' && q.limite === 500)).toBe(true)
})
it('acumula cantidades en milésimas y reintegros en centavos sin mezclar líneas del mismo producto', async () => {
  const historial = await cargarHistorialDevolucionesTicket(id(20), id(30))
  expect(historial).toEqual({ operaciones: 2, importeReintegrado: 0.67, cantidadesPorDetalle: { [id(9)]: 0.3 } })
  expect(consultas.every(q => q.filtros.kiosco_id === id(20) && q.filtros.venta_id === id(30))).toBe(true)
})
it.each(['envases_movimientos', 'devoluciones_venta'])('no devuelve historial parcial cuando falla una página tardía de %s', async tabla => {
  fallo = q => q.tabla === tabla && Boolean(q.cursor)
  await expect(tabla === 'envases_movimientos' ? cargarMovimientosEnvases(id(20), desde, hasta) : cargarHistorialDevolucionesTicket(id(20), id(30))).rejects.toThrow('Página rechazada')
})
it.each([
  { monto_total: null }, { monto_total: -1 }, { detalles: null },
  { detalles: [{ detalle_venta_id: null, cantidad: 1 }] },
  { detalles: [{ detalle_venta_id: id(9), cantidad: 0 }] },
  { detalles: [{ detalle_venta_id: id(9), cantidad: 1 }, { detalle_venta_id: id(9), cantidad: 1 }] },
])('rechaza devoluciones sin historia verificable %j', async cambios => {
  paginas.devoluciones_venta = [{ ...paginas.devoluciones_venta[0], ...cambios }]
  await expect(cargarHistorialDevolucionesTicket(id(20), id(30))).rejects.toThrow()
})
it('acepta ajuste descendente, pero rechaza stock negativo de envases', async () => {
  paginas.envases_movimientos = [{ ...paginas.envases_movimientos[0], accion: 'AJUSTAR_SALDO', cantidad: -1, importe: 0 }]
  expect((await cargarMovimientosEnvases(id(20), desde, hasta))[0].cantidad).toBe(-1)
  paginas.envases_movimientos[0] = { ...paginas.envases_movimientos[0], stock_resultante: -1 }
  await expect(cargarMovimientosEnvases(id(20), desde, hasta)).rejects.toThrow('inconsistente')
})
it('interpreta la entrega al distribuidor como salida firmada, igual que el ledger SQL', async () => {
  paginas.envases_movimientos = [{ ...paginas.envases_movimientos[0], accion: 'ENTREGAR_DISTRIBUIDOR', cantidad: -2, importe: 0, distribuidor: 'Ensayo' }]
  expect((await cargarMovimientosEnvases(id(20), desde, hasta))[0].cantidad).toBe(-2)
  paginas.envases_movimientos[0] = { ...paginas.envases_movimientos[0], cantidad: 2 }
  await expect(cargarMovimientosEnvases(id(20), desde, hasta)).rejects.toThrow('inconsistente')
})
it('no consulta con comercio o período inválidos', async () => {
  await expect(cargarMovimientosEnvases('', desde, hasta)).rejects.toThrow()
  await expect(cargarMovimientosEnvases(id(20), hasta, desde)).rejects.toThrow()
  expect(m.from).not.toHaveBeenCalled()
})
