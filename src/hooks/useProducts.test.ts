import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import type { Producto } from '../types/database'
import { getCachedProductos } from '../lib/utils'
import { leerCostosProtegidosLocales } from '../lib/productCostAccess'
import { db, resetDb, responder } from '../test/supabaseMock'
import { useProducts } from './useProducts'

const sesion = vi.hoisted(() => ({
  usuario: { rol: 'DUEÑO', kiosco_id: 'k1', es_superadmin: false },
  kiosco: { id: 'k1' },
}))
vi.mock('../stores/authStore', () => ({ useAuthStore: () => sesion }))
vi.mock('../lib/supabase', async () => {
  const { crearModuloSupabase } = await import('../test/supabaseMock')
  return crearModuloSupabase()
})

const producto: Producto = {
  id: 'p1', kiosco_id: 'k1', categoria_id: null, codigo_barras: '123',
  descripcion: 'Agua', precio_costo: 0, precio_venta: 200, stock_actual: 10,
  stock_minimo: 2, es_favorito: false, activo: true,
  fecha_creacion: '2026-01-01', fecha_actualizacion: '2026-01-01',
}

beforeEach(() => {
  resetDb()
  vi.clearAllMocks()
  localStorage.clear()
  sesion.usuario.rol = 'DUEÑO'
  responder('productos.select', { data: [producto], error: null })
  responder('producto_costos.select', { data: [{ producto_id: 'p1', precio_costo: 100 }], error: null })
  responder('categorias.select', { data: [], error: null })
})

describe('useProducts: guardar cambios respetando autorización', () => {
  it.each(['esquema', 'red'])('no altera caché ni elimina motivo ante fallo de %s', async fallo => {
    const { result } = renderHook(() => useProducts())
    await waitFor(() => expect(result.current.productos[0]?.precio_venta).toBe(200))
    if (fallo === 'red') db.lanzar.add('productos.update')
    else responder('productos.update', { error: { code: 'PGRST204', message: "Could not find the 'motivo_cambio_precio' column" } })
    let guardado = true
    await act(async () => { guardado = await result.current.actualizarProducto('p1', { precio_venta: 350, motivo_cambio_precio: 'Lista nueva' }) })
    expect(guardado).toBe(false)
    expect(result.current.productos[0]?.precio_venta).toBe(200)
    expect(getCachedProductos('k1')[0]?.precio_venta).toBe(200)
    expect(toast.success).not.toHaveBeenCalled()
  })
  it('un rechazo de servidor conserva catálogo y costo local y no informa éxito', async () => {
    const { result } = renderHook(() => useProducts())
    await waitFor(() => expect(result.current.productos[0]?.precio_costo).toBe(100))
    responder('productos.update', { error: { code: '42501', message: 'Permiso denegado' } })
    responder('productos.select', { error: { message: 'Failed to fetch' } })
    let guardado = true
    await act(async () => { guardado = await result.current.actualizarProducto('p1', { precio_venta: 350, precio_costo: 400 }) })
    expect(guardado).toBe(false)
    expect(result.current.productos[0]?.precio_venta).toBe(200)
    expect(getCachedProductos('k1')[0]?.precio_venta).toBe(200)
    expect(leerCostosProtegidosLocales('k1')).toEqual([{ producto_id: 'p1', precio_costo: 100 }])
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Permiso denegado'))
  })

  it('una actualización aceptada sincroniza catálogo y muestra éxito', async () => {
    const { result } = renderHook(() => useProducts())
    await waitFor(() => expect(result.current.productos[0]?.precio_venta).toBe(200))
    responder('productos.update', { error: null })
    responder('productos.select', { data: [{ ...producto, precio_venta: 350 }], error: null })
    let guardado = false
    await act(async () => { guardado = await result.current.actualizarProducto('p1', { precio_venta: 350 }) })
    expect(guardado).toBe(true)
    expect(getCachedProductos('k1')[0]?.precio_venta).toBe(350)
    expect(toast.success).toHaveBeenCalledWith('Producto actualizado')
  })

  it('un fallo de red conserva el cambio local y comunica que falta sincronizar', async () => {
    const { result } = renderHook(() => useProducts())
    await waitFor(() => expect(result.current.productos[0]?.precio_venta).toBe(200))
    db.lanzar.add('productos.update')
    let guardado = false
    await act(async () => { guardado = await result.current.actualizarProducto('p1', { precio_venta: 350 }) })
    expect(guardado).toBe(true)
    expect(result.current.productos[0]?.precio_venta).toBe(350)
    expect(getCachedProductos('k1')[0]?.precio_venta).toBe(350)
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('falta sincronizar'), expect.any(Object))
  })
})
