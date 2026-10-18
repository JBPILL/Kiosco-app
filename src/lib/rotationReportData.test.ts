import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), costos: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from: mocks.from } }))
vi.mock('./productCostAccess', async original => ({
  ...await original<typeof import('./productCostAccess')>(), cargarCostosProtegidos: mocks.costos,
}))
import { cargarDatosRotacion } from './rotationReportData'

interface Fila { id: string; [campo: string]: unknown }
interface Consulta { tabla: string; filtros: Record<string, unknown>; cursor?: string; orden?: string; limite?: number }
let filas: Record<string, Fila[]>
let consultas: Consulta[]
let fallo: (consulta: Consulta) => boolean
let nulo: boolean
beforeEach(() => {
  vi.clearAllMocks()
  consultas = []; fallo = () => false; nulo = false
  filas = {
    productos: ['Zeta', 'Alfa', 'Beta'].map((descripcion, i) => ({ id: `p${i}`, descripcion, activo: true, kiosco_id: 'k1', precio_costo: 0 })),
    ventas: [0, 1, 2].map(i => ({ id: `v${i}`, kiosco_id: 'k1', estado: 'COMPLETADA', fecha_hora: '2026-10-18', detalles: [{ producto_id: `p${i}`, cantidad: 2, es_devolucion_envase: false }] })),
  }
  mocks.costos.mockImplementation(async (ids: string[]) => ids.map(producto_id => ({ producto_id, precio_costo: 17 })))
  mocks.from.mockImplementation((tabla: string) => {
    const c: Consulta = { tabla, filtros: {} }; consultas.push(c)
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq(campo: string, valor: unknown) { c.filtros[campo] = valor; return builder },
      gte(campo: string, valor: string) { c.filtros[`desde_${campo}`] = valor; return builder },
      order(campo: string) { c.orden = campo; return builder },
      limit(limite: number) { c.limite = limite; return builder },
      gt(_campo: string, valor: string) { c.cursor = valor; return builder },
      then(resolve: (resultado: unknown) => void) {
        return Promise.resolve(fallo(c) ? { data: null, error: { message: 'Lectura rechazada' } } : {
          data: nulo ? null : filas[tabla].filter(fila => (!c.cursor || fila.id > c.cursor)
            && Object.entries(c.filtros).every(([campo, valor]) => campo.startsWith('desde_') ? String(fila[campo.slice(6)]) >= String(valor) : fila[campo] === valor)).slice(0, 2), error: null,
        }).then(resolve)
      },
    }
    return builder
  })
})

it('completa páginas cortas y aplica tenant, estado, fecha y cursor en todas ellas', async () => {
  filas.productos.push({ ...filas.productos[0], id: 'p3', activo: false }, { ...filas.productos[0], id: 'p4', kiosco_id: 'otro' })
  filas.ventas.push({ ...filas.ventas[0], id: 'v3', estado: 'ANULADA' }, { ...filas.ventas[0], id: 'v4', fecha_hora: '2025-01-01' })
  const datos = await cargarDatosRotacion('k1', '2026-09-01')
  expect(datos.productos.map(p => p.descripcion)).toEqual(['Alfa', 'Beta', 'Zeta'])
  expect(datos.lineasVentas).toHaveLength(3)
  expect(datos.lineasVentas.every(l => l.precio_costo === 17)).toBe(true)
  expect(consultas.every(c => c.filtros.kiosco_id === 'k1' && c.orden === 'id' && c.limite === 500)).toBe(true)
  expect(consultas.filter(c => c.tabla === 'ventas').every(c => c.filtros.estado === 'COMPLETADA' && c.filtros.desde_fecha_hora === '2026-09-01')).toBe(true)
  expect(consultas.filter(c => c.tabla === 'ventas').map(c => c.cursor)).toEqual([undefined, 'v1', 'v2'])
})
it('deduplica y acota costos, incluyendo productos vendidos actualmente inactivos', async () => {
  filas.productos = Array.from({ length: 201 }, (_, i) => ({ ...filas.productos[0], id: `p${String(i).padStart(3, '0')}` }))
  filas.ventas = [{ ...filas.ventas[0], detalles: [{ producto_id: 'inactivo', cantidad: 1 }, { producto_id: 'p000', cantidad: 1 }] }]
  const datos = await cargarDatosRotacion('k1', '2026-09-01')
  expect(mocks.costos.mock.calls.map(([ids]) => ids.length)).toEqual([200, 2])
  expect(new Set(mocks.costos.mock.calls.flatMap(([ids]) => ids)).size).toBe(202)
  expect(datos.lineasVentas[0].precio_costo).toBe(17)
})
it('rechaza un fallo de página tardía sin producir informe parcial', async () => {
  fallo = c => c.tabla === 'ventas' && !!c.cursor
  await expect(cargarDatosRotacion('k1', '2026-09-01')).rejects.toThrow('Lectura rechazada')
  expect(mocks.costos).not.toHaveBeenCalled()
})
it('propaga fallo tardío de costos', async () => {
  filas.productos = Array.from({ length: 201 }, (_, i) => ({ ...filas.productos[0], id: `p${String(i).padStart(3, '0')}` }))
  mocks.costos.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Costos denegados'))
  await expect(cargarDatosRotacion('k1', '2026-09-01')).rejects.toThrow('Costos denegados')
})
it('distingue respuesta no confirmada de informe vacío confirmado', async () => {
  nulo = true
  await expect(cargarDatosRotacion('k1', '2026-09-01')).rejects.toThrow('no confirmó')
  nulo = false; filas.productos = []; filas.ventas = []
  expect(await cargarDatosRotacion('k1', '2026-09-01')).toEqual({ productos: [], lineasVentas: [] })
})
it('rechaza detalles ausentes y no consulta sin comercio', async () => {
  await expect(cargarDatosRotacion('', '2026-09-01')).rejects.toThrow('Falta identificar')
  expect(mocks.from).not.toHaveBeenCalled()
  filas.ventas[0].detalles = null
  await expect(cargarDatosRotacion('k1', '2026-09-01')).rejects.toThrow('No se confirmó el detalle')
})
