import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import type { Producto } from '../types/database'
import { getCachedProductos, saveCachedProductos } from '../lib/utils'
import { leerCostosProtegidosLocales } from '../lib/productCostAccess'
import { db, encolar, llamadasRpcA, resetDb, responder, responderRpc } from '../test/supabaseMock'
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
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'false')
  localStorage.clear()
  sesion.usuario.rol = 'DUEÑO'
  responder('productos.select', { data: [producto], error: null })
  responder('producto_costos.select', { data: [{ producto_id: 'p1', precio_costo: 100 }], error: null })
  responder('categorias.select', { data: [], error: null })
})

describe('useProducts: guardar cambios respetando autorización', () => {
  it.each(['respuesta incierta', 'conexión interrumpida'])('recupera el alta strict con IDs y datos estables tras %s', async fallo => {
    vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
    const { result, unmount } = renderHook(() => useProducts())
    await waitFor(() => expect(result.current.productos).toHaveLength(1))
    const datos = { ...producto, codigo_barras: 'nuevo', descripcion: 'Alta recuperable', precio_costo: 125 }
    if (fallo === 'conexión interrumpida') db.lanzar.add('rpc.guardar_producto_transaccional')
    else responderRpc('guardar_producto_transaccional', { data: null, error: { message: 'Respuesta perdida' } })

    await act(async () => { expect(await result.current.crearProducto(datos)).toBeNull() })
    const primero = llamadasRpcA('guardar_producto_transaccional')[0].args
    expect(primero.p_producto_id).toBe(primero.p_operacion_id)
    expect(result.current.productos).toHaveLength(1)
    expect(toast.success).not.toHaveBeenCalled()
    expect(localStorage.getItem('kioskopos_operaciones_catalogo-producto')).not.toBeNull()

    // Recrear el hook comprueba que la identidad sobrevive a un nuevo submit de la pantalla.
    unmount()
    const reintento = renderHook(() => useProducts())
    await waitFor(() => expect(reintento.result.current.productos).toHaveLength(1))
    const recuperado = { ...datos, id: primero.p_producto_id as string }
    db.lanzar.delete('rpc.guardar_producto_transaccional')
    responderRpc('guardar_producto_transaccional', { data: { producto: recuperado, precio_costo: 125 }, error: null })
    responder('productos.select', { data: [recuperado, producto], error: null })
    let confirmado: Producto | null = null
    await act(async () => { confirmado = await reintento.result.current.crearProducto(datos) })

    const llamadas = llamadasRpcA('guardar_producto_transaccional')
    expect(llamadas).toHaveLength(2)
    expect(llamadas[1].args.p_operacion_id).toBe(primero.p_operacion_id)
    expect(llamadas[1].args.p_producto_id).toBe(primero.p_producto_id)
    expect(llamadas[1].args.p_datos).toEqual(primero.p_datos)
    expect(confirmado).toEqual(recuperado)
    expect(reintento.result.current.productos.filter(p => p.id === recuperado.id)).toHaveLength(1)
    expect(getCachedProductos('k1').filter(p => p.id === recuperado.id)).toHaveLength(1)
    expect(localStorage.getItem('kioskopos_operaciones_catalogo-producto')).toBeNull()
    expect(db.llamadas.some(llamada => llamada.op === 'insert')).toBe(false)
  })

  it('un alta sin red conserva borrador y no permite reemplazar ID ni comercio del contexto', async () => {
    const { result } = renderHook(() => useProducts())
    await waitFor(() => expect(result.current.productos).toHaveLength(1))
    db.lanzar.add('productos.insert')
    let creado: Producto | null = null
    const datos = { ...producto, id: 'falso', kiosco_id: 'otro', codigo_barras: 'nuevo' }
    await act(async () => { creado = await result.current.crearProducto(datos) })
    expect(creado).toEqual(expect.objectContaining({ kiosco_id: 'k1', _local_offline: true }))
    expect(creado).not.toEqual(expect.objectContaining({ id: 'falso' }))
  })

  it('recupera el precio confirmado del servidor y avisa si difiere del borrador', async () => {
    saveCachedProductos([{ ...producto, _local_offline: true }], 'k1')
    responder('productos.select', { data: [{ ...producto, precio_venta: 500 }], error: null })
    const { result } = renderHook(() => useProducts())
    await waitFor(() => expect(result.current.productos[0]?.precio_venta).toBe(500))
    expect(result.current.productos[0]?._local_offline).toBe(false)
    expect(db.llamadas.filter(llamada => llamada.op === 'insert' || llamada.op === 'update')).toHaveLength(0)
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('cambió en el servidor'))
  })
  it('no convierte un alta rechazada en un producto offline', async () => {
    const { result } = renderHook(() => useProducts())
    await waitFor(() => expect(result.current.productos).toHaveLength(1))
    responder('productos.insert', { error: { code: '42501', message: 'Permiso denegado' } })
    let creado: Producto | null = producto
    await act(async () => { creado = await result.current.crearProducto({ ...producto, codigo_barras: 'nuevo', descripcion: 'Otro' }) })
    expect(creado).toBeNull()
    expect(result.current.productos).toHaveLength(1)
    expect(getCachedProductos('k1')).toHaveLength(1)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it.each([false, true])('sincroniza alta por inserción y confirma duplicado=%s sin sobrescribir', async duplicado => {
    const local = { ...producto, id: 'local', codigo_barras: 'local', _local_offline: true }
    saveCachedProductos([local], 'k1')
    encolar('productos.select', { data: [], error: null }, { data: [local], error: null })
    responder('productos.insert', { error: duplicado ? { code: '23505', message: 'Duplicado' } : null })
    const { result } = renderHook(() => useProducts())
    await waitFor(() => expect(result.current.productos.find(p => p.id === 'local')?._local_offline).toBe(false))
    expect(db.llamadas.filter(llamada => llamada.op === 'insert')).toHaveLength(1)
    expect(db.llamadas.filter(llamada => llamada.op === 'update')).toHaveLength(0)
    expect(getCachedProductos('k1')[0]?._local_offline).toBe(false)
  })

  it('conserva pendiente un ID duplicado cuyo precio cambió', async () => {
    const local = { ...producto, id: 'local', codigo_barras: 'local', _local_offline: true }
    saveCachedProductos([local], 'k1')
    encolar('productos.select', { data: [], error: null }, { data: [{ ...local, precio_venta: 500 }], error: null })
    responder('productos.insert', { error: { code: '23505', message: 'Duplicado' } })
    const { result } = renderHook(() => useProducts())
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('conflicto')))
    expect(result.current.productos[0]?._local_offline).toBe(true)
    expect(result.current.productos[0]?.precio_venta).toBe(200)
    expect(db.llamadas.filter(llamada => llamada.op === 'update')).toHaveLength(0)
  })
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
