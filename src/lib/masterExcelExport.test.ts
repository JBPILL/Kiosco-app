import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), exportar: vi.fn(), costos: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from: mocks.from } }))
vi.mock('./exportUtils', () => ({ exportarMasterExcel: mocks.exportar }))
vi.mock('./productCostAccess', async importOriginal => ({
  ...await importOriginal<typeof import('./productCostAccess')>(), cargarCostosProtegidos: mocks.costos,
}))

import { exportarExcelMaestroComercio } from './masterExcelExport'

interface Fila { id: string; [campo: string]: unknown }
interface Consulta { tabla: string; seleccion: string; tenant?: string; cursor?: string; estado?: string }
let filas: Record<string, Fila[]>
let consultas: Consulta[]
let fallo: (consulta: Consulta) => boolean
let nulo: boolean
let invalido: boolean

beforeEach(() => {
  vi.clearAllMocks()
  const baseRows = () => [
    { id: '001', descripcion: 'Zeta', nombre: 'Zeta', fecha: '2026-10-16', fecha_hora: '2026-10-16', creado_en: '2026-10-16', estado: 'COMPLETADA', precio: 100, activo: true, cantidad: 5, monto: 50, monto_total: 10, stock_resultante: 5, importe: 100, tipo: 'EGRESO', motivo: 'DEVOLUCION_ENVASE', accion: 'RECIBIR_EFECTIVO' },
    { id: '002', descripcion: 'Alfa', nombre: 'Alfa', fecha: '2026-10-17', fecha_hora: '2026-10-17', creado_en: '2026-10-17', estado: 'COMPLETADA', precio: 100, activo: true, cantidad: 5, monto: 50, monto_total: 10, stock_resultante: 10, importe: 100, tipo: 'EGRESO', motivo: 'DEVOLUCION_VENTA', accion: 'RECIBIR_TICKET' },
    { id: '003', descripcion: 'Beta', nombre: 'Beta', fecha: '2026-10-15', fecha_hora: '2026-10-15', creado_en: '2026-10-15', estado: 'COMPLETADA', precio: 100, activo: true, cantidad: 5, monto: 50, monto_total: 10, stock_resultante: 15, importe: 0, tipo: 'INGRESO', motivo: 'REPOSICION_CAMBIO', accion: 'AJUSTAR_SALDO' },
  ]
  filas = Object.fromEntries([
    'productos', 'categorias', 'movimientos_stock', 'clientes', 'proveedores', 'ventas',
    'movimientos_caja', 'devoluciones_venta', 'envases_tipos_comercio', 'envases_saldos', 'envases_pendientes', 'envases_movimientos',
  ].map(tabla => [tabla, baseRows()]))
  consultas = []
  fallo = () => false
  nulo = false
  invalido = false
  mocks.costos.mockImplementation(async (ids: string[]) => ids.map(producto_id => ({ producto_id, precio_costo: 17 })))
  mocks.exportar.mockResolvedValue(undefined)
  mocks.from.mockImplementation((tabla: string) => {
    const consulta: Consulta = { tabla, seleccion: '' }
    consultas.push(consulta)
    const builder = {
      select(seleccion: string) { consulta.seleccion = seleccion; return builder },
      eq(campo: string, valor: string) {
        if (campo === 'kiosco_id') consulta.tenant = valor
        if (campo === 'estado') consulta.estado = valor
        return builder
      },
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      gt(_campo: string, valor: string) { consulta.cursor = valor; return builder },
      then(resolve: (resultado: unknown) => void) {
        const error = fallo(consulta) || consulta.seleccion.includes('afip_') && import.meta.env.VITE_KIOSKO_PILOT_STRICT_SCOPE === 'true'
        return Promise.resolve(error ? { data: null, error: { message: 'Lectura rechazada' } }
          : { data: nulo ? null : invalido ? [{ sinId: true }] : filas[tabla].filter(fila => (!consulta.cursor || fila.id > consulta.cursor)
            && (!consulta.estado || fila.estado === consulta.estado)).slice(0, 2), error: null }).then(resolve)
      },
    }
    return builder
  })
})
afterEach(() => vi.unstubAllEnvs())

it('exporta en piloto sin columnas fiscales y recorre páginas cortas de todas las colecciones', async () => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
  await exportarExcelMaestroComercio('k1', 'Comercio')
  expect(mocks.exportar).toHaveBeenCalledOnce()
  const datos = mocks.exportar.mock.calls[0][0]
  for (const campo of ['productos', 'categorias', 'movimientosStock', 'clientes', 'proveedores', 'ventas']) {
    expect(datos[campo]).toHaveLength(3)
  }
  expect(datos.productos.map((p: Fila) => p.descripcion)).toEqual(['Alfa', 'Beta', 'Zeta'])
  expect(datos.productos.every((p: Fila) => p.precio_costo === 17)).toBe(true)
  expect(datos.ventas.map((v: Fila) => v.fecha_hora)).toEqual(['2026-10-17', '2026-10-16', '2026-10-15'])
  expect(consultas.every(c => c.tenant === 'k1')).toBe(true)
  const ventas = consultas.filter(c => c.tabla === 'ventas')
  expect(ventas.map(c => c.cursor)).toEqual([undefined, '002', '003'])
  expect(ventas.every(c => c.estado === 'COMPLETADA' && !c.seleccion.includes('afip_'))).toBe(true)
  expect(ventas[0].seleccion).toContain('usuarios!usuario_id(nombre)')
  expect(datos.movimientosCaja).toHaveLength(3)
  expect(consultas.some(c => c.tabla === 'devoluciones_venta' || c.tabla.startsWith('envases_'))).toBe(false)
})

it('incluye caja, devoluciones y envases en piloto cuando sus flags están habilitados sin columnas fiscales', async () => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
  vi.stubEnv('VITE_CHECKOUT_MANUAL_TRANSACCIONAL', 'true')
  vi.stubEnv('VITE_KIOSKO_ENVASES_TRANSACCIONAL', 'true')
  vi.stubEnv('VITE_KIOSKO_DEVOLUCIONES_EFECTIVO', 'true')
  await exportarExcelMaestroComercio('k1', 'Comercio')
  const datos = mocks.exportar.mock.calls[0][0]
  expect(datos.movimientosCaja).toHaveLength(3)
  expect(datos.devoluciones).toHaveLength(3)
  expect(datos.incluirDevoluciones).toBe(true)
  expect(datos.envasesTipos).toHaveLength(3)
  expect(datos.envasesMovimientos).toHaveLength(3)
  expect(datos.incluirEnvases).toBe(true)
  expect(consultas.find(c => c.tabla === 'ventas')?.seleccion).not.toContain('afip_')
})

it('conserva columnas fiscales en instalaciones completas y excluye ventas anuladas', async () => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'false')
  filas.ventas.push({ id: '004', estado: 'ANULADA' })
  await exportarExcelMaestroComercio('k1', 'Comercio')
  expect(consultas.find(c => c.tabla === 'ventas')?.seleccion).toContain('afip_cae')
  expect(mocks.exportar.mock.calls[0][0].ventas).toHaveLength(3)
  expect(mocks.exportar.mock.calls[0][0].devoluciones).toHaveLength(3)
  expect(mocks.exportar.mock.calls[0][0].envasesTipos).toHaveLength(3)
})

it('carga todos los costos en lotes acotados aunque el servidor limite las páginas', async () => {
  filas.productos = Array.from({ length: 203 }, (_, i) => ({ id: String(i).padStart(4, '0') }))
  await exportarExcelMaestroComercio('k1', 'Comercio')
  expect(mocks.costos.mock.calls.map(([ids]) => ids.length)).toEqual([200, 3])
  expect(mocks.exportar.mock.calls[0][0].productos).toHaveLength(203)
  expect(mocks.exportar.mock.calls[0][0].productos.every((p: Fila) => p.precio_costo === 17)).toBe(true)
})

it('no descarga ni registra éxito si falla una página posterior', async () => {
  fallo = c => c.tabla === 'ventas' && !!c.cursor
  await expect(exportarExcelMaestroComercio('k1', 'Comercio')).rejects.toThrow('Lectura rechazada')
  expect(mocks.exportar).not.toHaveBeenCalled()
})

it('no descarga si los costos protegidos no se pudieron leer', async () => {
  filas.productos = Array.from({ length: 201 }, (_, i) => ({ id: String(i).padStart(4, '0') }))
  mocks.costos.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Costos denegados'))
  await expect(exportarExcelMaestroComercio('k1', 'Comercio')).rejects.toThrow('Costos denegados')
  expect(mocks.exportar).not.toHaveBeenCalled()
})

it('rechaza filas inválidas sin producir un archivo parcial', async () => {
  invalido = true
  await expect(exportarExcelMaestroComercio('k1', 'Comercio')).rejects.toThrow('filas inválidas')
  expect(mocks.exportar).not.toHaveBeenCalled()
})

it('no transforma una respuesta sin datos confirmados en un archivo vacío', async () => {
  nulo = true
  await expect(exportarExcelMaestroComercio('k1', 'Comercio')).rejects.toThrow('no confirmó')
  expect(mocks.exportar).not.toHaveBeenCalled()
})

it('no consulta ni descarga sin comercio identificado', async () => {
  await expect(exportarExcelMaestroComercio('', 'Comercio')).rejects.toThrow('Falta identificar')
  expect(mocks.from).not.toHaveBeenCalled()
  expect(mocks.exportar).not.toHaveBeenCalled()
})
