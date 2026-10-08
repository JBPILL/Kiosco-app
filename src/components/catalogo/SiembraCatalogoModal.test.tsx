import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { crearProducto } from '../../test/factories'
import type { Producto } from '../../types/database'
import type { ReactNode } from 'react'

const mocks = vi.hoisted(() => ({
  plantilla: true, actualizar: vi.fn(),
  from: vi.fn(), cacheLeer: vi.fn(), cacheGuardar: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn(),
}))
vi.mock('../../lib/supabase', () => ({ supabase: { from: mocks.from } }))
vi.mock('../../lib/utils', () => ({ getCachedProductos: mocks.cacheLeer, saveCachedProductos: mocks.cacheGuardar }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: () => ({ usuario: { kiosco_id: 'local' } }) }))
vi.mock('../../hooks/useTenantConfig', () => ({ useTenantConfig: () => ({ rubro: 'PETSHOP_VETERINARIA', tipoComercioLabel: 'Veterinaria', esFotocopiadora: false }) }))
vi.mock('../../data/catalogosPorRubro', () => ({
  esCatalogoPlantilla: () => mocks.plantilla,
  obtenerCatalogoPorRubro: () => articulos,
}))
vi.mock('../ui/Modal', () => ({ Modal: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('react-hot-toast', () => ({ default: Object.assign(mocks.info, { success: mocks.success, error: mocks.error }) }))
import { SiembraCatalogoModal } from './SiembraCatalogoModal'

const articulos = Array.from({ length: 45 }, (_, i) => ({
  codigo_barras: `VET-TEST-${i}`, descripcion: `Artículo ${i}`, categoria_nombre: 'Mascotas', unidad_medida: i === 1 ? 'KG' as const : 'UN' as const,
  precio_costo_ref: 100, precio_venta_sugerido: 200, stock_inicial_sugerido: 10,
  ...(i === 1 ? { es_pesable: true, requiere_vencimiento: true, dias_alerta_vencimiento: 30 } : {}),
}))
let cache: Producto[]
let existentes: Array<{ codigo_barras: string; id?: string }>
let errorLectura: boolean
let errorCategorias: boolean
let errorCrearCategoria: boolean
let categoriaExiste: boolean
let falloLote: number
let lotes: Array<{ filas: Array<Record<string, unknown>>; opciones: unknown }>
let omitidoPorCarrera: boolean

beforeEach(() => {
  mocks.plantilla = true
  vi.clearAllMocks()
  cache = []; existentes = []; errorLectura = false; errorCategorias = false; errorCrearCategoria = false
  categoriaExiste = true; falloLote = -1; lotes = []; omitidoPorCarrera = false
  mocks.cacheLeer.mockImplementation(() => cache)
  mocks.cacheGuardar.mockImplementation((filas: Producto[]) => { cache = filas })
  mocks.from.mockImplementation((tabla: string) => ({
    select: () => ({ eq: async () => tabla === 'productos'
      ? { data: existentes, error: errorLectura ? new Error('Sin lectura') : null }
      : { data: categoriaExiste ? [{ id: 'cat', nombre: 'Mascotas' }] : [], error: errorCategorias ? new Error('Sin categorías') : null } }),
    insert: (filas: Array<Record<string, unknown>>) => ({ select: async () => ({ data: filas, error: errorCrearCategoria ? new Error('Sin escritura de categorías') : null }) }),
    update: (campos: Record<string, unknown>) => {
      mocks.actualizar(campos)
      const consulta = { eq: () => consulta, select: async () => ({ data: [crearProducto({ id: 'existente', ...campos })], error: null }) }
      return consulta
    },
    upsert: (valor: Array<Record<string, unknown>> | Record<string, unknown>, opciones: unknown) => {
      const filas = Array.isArray(valor) ? valor : [valor]
      const numero = lotes.length
      lotes.push({ filas, opciones })
      return { select: async () => ({
        data: numero === falloLote ? null : filas.filter((_, i) => !(omitidoPorCarrera && numero === 0 && i === 0)).map(fila => crearProducto(fila)),
        error: numero === falloLote ? new Error('Lote falló') : null,
      }) }
    },
  }))
})
afterEach(() => vi.unstubAllEnvs())

it('actualiza un existente con motivo y separa altas que conservan conflictos concurrentes', async () => {
  vi.stubEnv('VITE_AUDITORIA_MOTIVO_PRECIO', 'true')
  mocks.plantilla = false
  existentes = [{ id: 'existente', codigo_barras: 'VET-TEST-0' }]
  abrir(false)
  fireEvent.click(screen.getByRole('checkbox', { name: /Omitir códigos/ }))
  fireEvent.click(screen.getByRole('button', { name: /Sembrar 45 Productos/ }))
  expect(mocks.actualizar).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox', { name: 'Motivo del cambio de precio' }), { target: { value: '  Renovación de catálogo  ' } })
  fireEvent.click(screen.getByRole('button', { name: /Sembrar 45 Productos/ }))
  await waitFor(() => expect(mocks.success).toHaveBeenCalled())
  expect(mocks.actualizar).toHaveBeenCalledWith(expect.objectContaining({ motivo_cambio_precio: 'Renovación de catálogo' }))
  expect(mocks.actualizar.mock.calls[0][0]).not.toHaveProperty('id')
  expect(lotes.every(lote => (lote.opciones as { ignoreDuplicates: boolean }).ignoreDuplicates)).toBe(true)
  expect(lotes.every(lote => lote.filas.every(fila => !('motivo_cambio_precio' in fila)))).toBe(true)
})

function abrir(ejecutar = true) {
  const completar = vi.fn().mockResolvedValue(undefined)
  const cerrar = vi.fn()
  render(<SiembraCatalogoModal isOpen onClose={cerrar} categoriasExistentes={[]} onSiembraCompletada={completar} />)
  if (ejecutar) fireEvent.click(screen.getByRole('button', { name: /Sembrar 45 Productos/ }))
  return { completar, cerrar }
}

it('protege plantillas de sobrescritura y fuerza ceros e inactivos', async () => {
  existentes = [{ codigo_barras: 'VET-TEST-0' }]
  const previo = crearProducto({ id: 'previo', codigo_barras: 'VET-TEST-0', precio_venta: 999, stock_actual: 7, activo: true })
  cache = [previo]
  abrir(false)
  expect(screen.queryByText('Estrategia de Precios')).toBeNull()
  expect(screen.queryByText('Stock inicial para cada producto:')).toBeNull()
  const omitir = screen.getByRole('checkbox', { name: /Omitir códigos/ }) as HTMLInputElement
  expect(omitir.disabled).toBe(true)
  expect(omitir.checked).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: /Sembrar 45 Productos/ }))
  await waitFor(() => expect(mocks.success).toHaveBeenCalled())
  expect(lotes.flatMap(lote => lote.filas)).toHaveLength(44)
  for (const lote of lotes) {
    expect(lote.opciones).toEqual({ onConflict: 'kiosco_id,codigo_barras', ignoreDuplicates: true })
    expect(new Set(lote.filas.map(fila => Object.keys(fila).sort().join(','))).size).toBe(1)
    for (const fila of lote.filas) expect(fila).toMatchObject({ precio_costo: 0, precio_venta: 0, stock_actual: 0, activo: false })
  }
  expect(cache.find(p => p.id === 'previo')).toEqual(previo)
  expect(lotes.flatMap(lote => lote.filas).find(fila => fila.codigo_barras === 'VET-TEST-1')).toMatchObject({
    unidad_medida: 'KG', es_pesable: true, requiere_vencimiento: true, dias_alerta_vencimiento: 30,
  })
  expect(cache.find(p => p.codigo_barras === 'VET-TEST-1')).toMatchObject({ requiere_vencimiento: true, dias_alerta_vencimiento: 30 })
  expect(lotes.flatMap(lote => lote.filas).find(fila => fila.codigo_barras === 'VET-TEST-2')).toMatchObject({ requiere_vencimiento: false, dias_alerta_vencimiento: 30 })
  expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('44 artículos inactivos'), expect.anything())
})

it.each(['productos', 'categorias', 'crear categorías'])('detiene importación si falla verificar o crear %s', async (paso) => {
  errorLectura = paso === 'productos'; errorCategorias = paso === 'categorias'
  errorCrearCategoria = paso === 'crear categorías'; categoriaExiste = !errorCrearCategoria
  const { completar, cerrar } = abrir()
  await waitFor(() => expect(mocks.error).toHaveBeenCalled())
  expect(lotes).toHaveLength(0)
  expect(mocks.cacheGuardar).not.toHaveBeenCalled()
  expect(mocks.success).not.toHaveBeenCalled()
  expect(completar).not.toHaveBeenCalled()
  expect(cerrar).not.toHaveBeenCalled()
})

it('conserva sólo filas confirmadas si falla un lote posterior y permite reintentar', async () => {
  falloLote = 1
  abrir()
  await waitFor(() => expect(mocks.error).toHaveBeenCalled())
  expect(cache).toHaveLength(40)
  expect(cache.some(p => p.codigo_barras === 'VET-TEST-44')).toBe(false)
  expect(mocks.success).not.toHaveBeenCalled()
  expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('Se confirmaron 40 artículos'))
  existentes = cache.map(p => ({ codigo_barras: p.codigo_barras ?? '' }))
  falloLote = -1
  fireEvent.click(screen.getByRole('button', { name: /Sembrar 45 Productos/ }))
  await waitFor(() => expect(mocks.success).toHaveBeenCalled())
  expect(lotes.at(-1)?.filas).toHaveLength(5)
  expect(cache).toHaveLength(45)
})

it('no cachea ni cuenta una fila omitida por conflicto concurrente en servidor', async () => {
  omitidoPorCarrera = true
  abrir()
  await waitFor(() => expect(mocks.success).toHaveBeenCalled())
  expect(cache).toHaveLength(44)
  expect(cache.some(p => p.codigo_barras === 'VET-TEST-0')).toBe(false)
  expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('44 artículos inactivos'), expect.anything())
})
