import { useState, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Producto, Categoria } from '../types/database'
import toast from 'react-hot-toast'

export function useProducts() {
  const { usuario } = useAuthStore()
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
    let query = supabase
      .from('productos')
      .select('*, categoria:categorias(id, nombre, color)')
      .eq('activo', true)
      .order('descripcion')

    if (usuario?.kiosco_id) {
      query = query.eq('kiosco_id', usuario.kiosco_id)
    }

    if (busqueda) {
      query = query.ilike('descripcion', `%${busqueda}%`)
    }
    if (categoriaFiltro) {
      query = query.eq('categoria_id', categoriaFiltro)
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
    } else {
      setProductos(data || [])
      if (!busqueda && !categoriaFiltro && data && data.length > 0) {
        try {
          localStorage.setItem('kiosko_cache_productos', JSON.stringify(data))
        } catch (e) {
          console.warn('No se pudo guardar catálogo en localStorage:', e)
        }
      }
    }
    setCargando(false)
  }, [busqueda, categoriaFiltro, usuario?.kiosco_id])

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
    const payload: Producto = {
      id: nuevoId,
      kiosco_id: usuario?.kiosco_id || '',
      activo: true,
      fecha_creacion: now,
      fecha_actualizacion: now,
      ...producto,
    }

    try {
      const { error } = await supabase.from('productos').insert(payload)
      if (error) {
        console.warn('Error al crear producto en Supabase, guardando localmente:', error.message)
      }
    } catch (e) {
      console.warn('Error de red creando producto:', e)
    }

    const listaActualizada = [payload, ...productos]
    setProductos(listaActualizada)
    try {
      localStorage.setItem('kiosko_cache_productos', JSON.stringify(listaActualizada))
    } catch {}

    toast.success('Producto creado')
    await cargarProductos()
    return payload
  }

  // Actualizar producto
  const actualizarProducto = async (id: string, cambios: Partial<Producto>) => {
    const { error } = await supabase
      .from('productos')
      .update({ ...cambios, fecha_actualizacion: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      toast.error('Error al actualizar producto')
      return false
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
    crearProducto,
    actualizarProducto,
    eliminarProducto,
    toggleFavorito,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria,
  }
}
