import { useState, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Producto, Categoria } from '../types/database'
import toast from 'react-hot-toast'

const CORE_PRODUCT_KEYS = new Set([
  'id',
  'kiosco_id',
  'categoria_id',
  'codigo_barras',
  'descripcion',
  'precio_costo',
  'precio_venta',
  'stock_actual',
  'stock_minimo',
  'es_favorito',
  'activo',
  'fecha_creacion',
  'fecha_actualizacion',
])

function filtrarColumnasBase(obj: Record<string, any>): Record<string, any> {
  const base: Record<string, any> = {}
  for (const key of Object.keys(obj)) {
    if (CORE_PRODUCT_KEYS.has(key)) {
      base[key] = obj[key]
    }
  }
  return base
}

export function useProducts() {
  const { usuario, kiosco } = useAuthStore()
  const [productos, setProductos] = useState<Producto[]>(() => {
    try {
      const cached = localStorage.getItem('kiosko_cache_productos')
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  const [categorias, setCategorias] = useState<Categoria[]>(() => {
    try {
      const cached = localStorage.getItem('kiosko_cache_categorias')
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  const [cargando, setCargando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null)

  // Cargar productos con join a categoría
  const cargarProductos = useCallback(async () => {
    setCargando(true)
    const kioscoId = usuario?.kiosco_id || kiosco?.id

    let query = supabase
      .from('productos')
      .select('*, categoria:categorias(id, nombre, color)')
      .eq('activo', true)
      .order('descripcion')

    if (kioscoId) {
      query = query.eq('kiosco_id', kioscoId)
    }

    const { data, error } = await query

    if (error) {
      const cached = localStorage.getItem('kiosko_cache_productos')
      if (cached && productos.length === 0) {
        try {
          setProductos(JSON.parse(cached))
          toast('Modo local: Mostrando catálogo guardado en memoria', { icon: '📦' })
        } catch {
          toast.error('Error al cargar productos')
        }
      } else if (!cached) {
        toast.error('Error al cargar productos: ' + (error.message || ''))
      }
      console.error('Error al cargar productos:', error)
    } else if (data) {
      setProductos((prev) => {
        // Enriquecer datos remotos con atributos locales si existen
        const localMap = new Map(prev.map((p) => [p.id, p]))
        const merged = data.map((item) => {
          const local = localMap.get(item.id)
          return local ? { ...local, ...item } : item
        })

        // Preservar productos creados localmente que aún no figuran en Supabase
        const remoteIds = new Set(data.map((d) => d.id))
        const soloLocales = prev.filter((p) => !remoteIds.has(p.id))
        const total = [...soloLocales, ...merged]

        try {
          localStorage.setItem('kiosko_cache_productos', JSON.stringify(total))
        } catch (e) {
          console.warn('No se pudo guardar catálogo en localStorage:', e)
        }
        return total
      })
    }
    setCargando(false)
  }, [usuario?.kiosco_id, kiosco?.id])

  // Cargar categorías
  const cargarCategorias = useCallback(async () => {
    let query = supabase
      .from('categorias')
      .select('*')
      .order('orden')

    if (usuario?.kiosco_id) {
      query = query.eq('kiosco_id', usuario.kiosco_id)
    }

    const { data, error } = await query

    if (error) {
      const cached = localStorage.getItem('kiosko_cache_categorias')
      if (cached && categorias.length === 0) {
        try {
          setCategorias(JSON.parse(cached))
        } catch {
          toast.error('Error al cargar categorías')
        }
      } else if (!cached) {
        toast.error('Error al cargar categorías: ' + (error.message || ''))
      }
      console.error('Error al cargar categorías:', error)
    } else {
      setCategorias(data || [])
      if (data && data.length > 0) {
        try {
          localStorage.setItem('kiosko_cache_categorias', JSON.stringify(data))
        } catch (e) {
          console.warn('No se pudo guardar categorías en localStorage:', e)
        }
      }
    }
  }, [usuario?.kiosco_id])

  useEffect(() => {
    cargarProductos()
  }, [cargarProductos])

  useEffect(() => {
    cargarCategorias()
  }, [cargarCategorias])

  // Crear producto
  const crearProducto = async (
    producto: Omit<Producto, 'id' | 'kiosco_id' | 'fecha_creacion' | 'fecha_actualizacion' | 'activo'>
  ): Promise<Producto | null> => {
    const nuevoId = uuidv4()
    const now = new Date().toISOString()
    const kioscoId = usuario?.kiosco_id || kiosco?.id || ''
    const payload: Producto = {
      id: nuevoId,
      kiosco_id: kioscoId,
      activo: true,
      fecha_creacion: now,
      fecha_actualizacion: now,
      ...producto,
    }

    let insertadoEnSupabase = false

    try {
      // 1. Intentar insertar con todas las columnas
      const { error: fullError } = await supabase.from('productos').insert(payload)
      if (!fullError) {
        insertadoEnSupabase = true
      } else {
        console.warn('Inserción completa rechazada por Supabase:', fullError.message)
        // 2. Si falló por falta de columnas en la BD, reintentar solo con columnas base
        if (
          fullError.code === '42703' ||
          fullError.code === 'PGRST204' ||
          fullError.message?.toLowerCase().includes('column')
        ) {
          const payloadBase = filtrarColumnasBase(payload)
          const { error: coreError } = await supabase.from('productos').insert(payloadBase)
          if (!coreError) {
            insertadoEnSupabase = true
            console.info('Producto insertado con éxito en Supabase usando esquema base')
          } else {
            console.error('Error insertando esquema base en Supabase:', coreError)
          }
        }
      }
    } catch (e) {
      console.warn('Fallo de red al crear producto:', e)
    }

    // Actualizar estado local inmediatamente
    setProductos((prev) => {
      const listaActualizada = [payload, ...prev.filter((p) => p.id !== payload.id)]
      try {
        localStorage.setItem('kiosko_cache_productos', JSON.stringify(listaActualizada))
      } catch {}
      return listaActualizada
    })

    if (insertadoEnSupabase) {
      toast.success('Producto creado y sincronizado')
      await cargarProductos()
    } else {
      toast.success('Producto guardado en memoria local')
    }

    return payload
  }

  // Actualizar producto
  const actualizarProducto = async (id: string, cambios: Partial<Producto>) => {
    const cambiosCompletos = { ...cambios, fecha_actualizacion: new Date().toISOString() }

    // Actualizar UI localmente de inmediato
    setProductos((prev) => {
      const actualizados = prev.map((p) => (p.id === id ? { ...p, ...cambiosCompletos } : p))
      try {
        localStorage.setItem('kiosko_cache_productos', JSON.stringify(actualizados))
      } catch {}
      return actualizados
    })

    try {
      const { error: fullError } = await supabase
        .from('productos')
        .update(cambiosCompletos)
        .eq('id', id)

      if (fullError) {
        if (
          fullError.code === '42703' ||
          fullError.code === 'PGRST204' ||
          fullError.message?.toLowerCase().includes('column')
        ) {
          const cambiosBase = filtrarColumnasBase(cambiosCompletos)
          const { error: coreError } = await supabase
            .from('productos')
            .update(cambiosBase)
            .eq('id', id)
          if (coreError) {
            console.error('Error al actualizar en Supabase:', coreError)
          }
        }
      }
    } catch (err) {
      console.warn('Error de red al actualizar producto:', err)
    }

    toast.success('Producto actualizado')
    await cargarProductos()
    return true
  }

  // Eliminar producto (soft delete)
  const eliminarProducto = async (id: string) => {
    const { error } = await supabase
      .from('productos')
      .update({ activo: false })
      .eq('id', id)
    if (error) {
      toast.error('Error al eliminar producto')
      return false
    }
    toast.success('Producto eliminado')
    await cargarProductos()
    return true
  }

  // Toggle favorito
  const toggleFavorito = async (id: string, esFavorito: boolean) => {
    const { error } = await supabase
      .from('productos')
      .update({ es_favorito: !esFavorito })
      .eq('id', id)
    if (error) {
      toast.error('Error al actualizar favorito')
      return
    }
    await cargarProductos()
  }

  // CRUD Categorías
  const crearCategoria = async (nombre: string, color: string = '#6366f1') => {
    const payload: Record<string, any> = { nombre, color }
    if (usuario?.kiosco_id) {
      payload.kiosco_id = usuario.kiosco_id
    }

    const { error } = await supabase.from('categorias').insert(payload as any)
    if (error) {
      toast.error('Error al crear categoría: ' + error.message)
      return false
    }
    toast.success('Categoría creada')
    await cargarCategorias()
    return true
  }

  const actualizarCategoria = async (id: string, nombre: string, color: string) => {
    const { error } = await supabase
      .from('categorias')
      .update({ nombre, color })
      .eq('id', id)
    if (error) {
      toast.error('Error al actualizar categoría')
      return false
    }
    toast.success('Categoría actualizada')
    await cargarCategorias()
    return true
  }

  const eliminarCategoria = async (id: string) => {
    const { error } = await supabase.from('categorias').delete().eq('id', id)
    if (error) {
      toast.error('Error al eliminar categoría')
      return false
    }
    toast.success('Categoría eliminada')
    await cargarCategorias()
    return true
  }

  return {
    productos,
    categorias,
    cargando,
    busqueda,
    setBusqueda,
    categoriaFiltro,
    setCategoriaFiltro,
    cargarProductos,
    cargarCategorias,
    crearProducto,
    actualizarProducto,
    eliminarProducto,
    toggleFavorito,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria,
  }
}
