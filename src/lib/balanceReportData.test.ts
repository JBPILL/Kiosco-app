import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from: m.from } }))
import { cargarDatosBalance } from './balanceReportData'

interface Fila { id: string; [k: string]: unknown }
interface Consulta { tabla: string; select: string; filtros: Record<string, unknown>; cursor?: string; orden?: string; limite?: number }
let filas: Record<string, Fila[]>, consultas: Consulta[], falla: (q: Consulta) => boolean, nulo: string | null
const tablas = ['ventas', 'movimientos_caja', 'devoluciones_venta', 'proveedores', 'compras_proveedor', 'pagos_proveedor']
const venta = (id: string): Fila => ({ id, kiosco_id: 'k1', fecha_hora: '2026-10-18T12:00:00Z', total: 10, estado: 'COMPLETADA', notas: null, pagos: [{ medio_pago: 'EFECTIVO', monto: 10 }], detalles: [{ cantidad: 1, subtotal: 10 }] })
beforeEach(() => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
  consultas = []; falla = () => false; nulo = null
  filas = {
    ventas: [venta('v1'), venta('v2')],
    movimientos_caja: [1, 2].map(n => ({ id: `m${n}`, kiosco_id: 'k1', fecha_hora: '2026-10-18T12:00:00Z', monto: 10 })),
    devoluciones_venta: [1, 2].map(n => ({ id: `d${n}`, kiosco_id: 'k1', fecha_hora: '2026-10-18T12:00:00Z', monto_total: 1, venta: venta('original') })),
    proveedores: [1, 2].map(n => ({ id: `p${n}`, kiosco_id: 'k1', nombre: `Proveedor ${n}`, activo: true, saldo_pendiente: 5 })),
    compras_proveedor: [1, 2].map(n => ({ id: `c${n}`, kiosco_id: 'k1', fecha: '2026-10-18T12:00:00Z', total: 10, estado: 'RECIBIDA' })),
    pagos_proveedor: [1, 2].map(n => ({ id: `q${n}`, kiosco_id: 'k1', fecha: '2026-10-18T12:00:00Z', monto: 1, estado: 'ACTIVO' })),
  }
  m.from.mockImplementation((tabla: string) => {
    const q: Consulta = { tabla, select: '', filtros: {} }
    const b = {
      returns() { return b },
      select(s: string) { q.select = s; return b }, eq(k: string, v: unknown) { q.filtros[k] = v; return b },
      gte(k: string, v: string) { q.filtros[`desde_${k}`] = v; return b }, lte(k: string, v: string) { q.filtros[`hasta_${k}`] = v; return b },
      order(k: string) { q.orden = k; return b }, limit(n: number) { q.limite = n; return b }, gt(_k: string, v: string) { q.cursor = v; return b },
      then(resolve: (r: unknown) => unknown) {
        consultas.push(q)
        return Promise.resolve(resolve(falla(q) ? { data: null, error: { message: 'Página denegada' } } : { data: nulo === tabla ? null : filas[tabla].filter(f => (!q.cursor || f.id > q.cursor) && Object.entries(q.filtros).every(([k, v]) => k.startsWith('desde_') ? String(f[k.slice(6)]) >= String(v) : k.startsWith('hasta_') ? String(f[k.slice(6)]) <= String(v) : f[k] === v)).slice(0, 1), error: null }))
      },
    }
    return b
  })
})
afterEach(() => vi.unstubAllEnvs())

it('completa las seis fuentes con páginas menores al límite y todos sus filtros', async () => {
  for (const tabla of tablas) filas[tabla].push({ ...filas[tabla][0], id: 'z-ajeno', kiosco_id: 'otro' })
  filas.proveedores.push({ ...filas.proveedores[0], id: 'z-inactivo', activo: false })
  filas.ventas.push({ ...venta('v3'), fecha_hora: '2025-01-01T12:00:00Z' })
  const d = await cargarDatosBalance('k1', 2026)
  expect([d.ventas, d.movimientos, d.devoluciones, d.proveedores, d.compras, d.pagos].map(a => a.length)).toEqual([2, 2, 2, 2, 2, 2])
  expect(consultas).toHaveLength(18)
  expect(consultas.every(q => q.filtros.kiosco_id === 'k1' && q.orden === 'id' && q.limite === 500)).toBe(true)
  for (const q of consultas) {
    if (q.tabla === 'proveedores') expect(q.filtros.activo).toBe(true)
    else { const campo = ['compras_proveedor', 'pagos_proveedor'].includes(q.tabla) ? 'fecha' : 'fecha_hora'; expect(q.filtros[`desde_${campo}`]).toBeTruthy(); expect(q.filtros[`hasta_${campo}`]).toBeTruthy() }
  }
  expect(consultas.filter(q => ['ventas', 'devoluciones_venta'].includes(q.tabla)).every(q => !q.select.includes('afip_cae'))).toBe(true)
})
it.each(tablas)('no publica datos parciales si falla una página tardía de %s', async tabla => {
  falla = q => q.tabla === tabla && Boolean(q.cursor)
  await expect(cargarDatosBalance('k1', 2026)).rejects.toThrow('Página denegada')
})
it.each(tablas)('no interpreta data null en %s como colección vacía', async tabla => {
  nulo = tabla
  await expect(cargarDatosBalance('k1', 2026)).rejects.toThrow('no confirmó')
})
it('conserva columnas fiscales en instalaciones completas y créditos de envase negativos', async () => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'false')
  filas.ventas[0].detalles = [{ cantidad: 1, subtotal: -100, es_devolucion_envase: true }]
  const d = await cargarDatosBalance('k1', 2026)
  expect(d.ventas[0].detalles[0].subtotal).toBe(-100)
  expect(consultas.filter(q => ['ventas', 'devoluciones_venta'].includes(q.tabla)).every(q => q.select.includes('afip_cae'))).toBe(true)
})
it('rechaza importes o relaciones incompletos en vez de convertirlos en cero', async () => {
  filas.compras_proveedor[0].total = null
  await expect(cargarDatosBalance('k1', 2026)).rejects.toThrow('Importe contable')
  filas.compras_proveedor[0].total = 10; filas.ventas[0].pagos = null
  await expect(cargarDatosBalance('k1', 2026)).rejects.toThrow('sin detalle o pagos')
})
it('no consulta sin comercio o con año inválido', async () => {
  await expect(cargarDatosBalance('', 2026)).rejects.toThrow()
  await expect(cargarDatosBalance('k1', NaN)).rejects.toThrow()
  expect(consultas).toHaveLength(0)
})
