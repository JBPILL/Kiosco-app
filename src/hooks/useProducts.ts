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
  'proveedor_id',
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
  'es_retornable',
  'precio_envase',
  'nombre_envase',
  'requiere_vencimiento',
  'dias_alerta_vencimiento',
  'es_pesable',
  'unidad_medida',
  'plu_balanza',
  'es_combo',
])

// Cache dinámico en memoria para columnas que la base de datos Supabase aún no tenga (si aplica)
const COLUMNAS_INEXISTENTES_SUPABASE = new Set<string>()

function prepararPayloadSupabase(obj: Record<string, any>): Record<string, any> {
  const payload: Record<string, any> = {}
  for (const key of Object.keys(obj)) {
    // Excluir relaciones de join que no son columnas de la tabla productos
    if (key === 'categoria' || key === 'proveedor') continue
    // Excluir columnas sabidas que no existen en Supabase para evitar fallas 400
    if (COLUMNAS_INEXISTENTES_SUPABASE.has(key)) continue
    payload[key] = obj[key]
  }
  return payload
}

function filtrarColumnasBase(obj: Record<string, any>): Record<string, any> {
  const base: Record<string, any> = {}
  for (const key of Object.keys(obj)) {
    if (CORE_PRODUCT_KEYS.has(key) && !COLUMNAS_INEXISTENTES_SUPABASE.has(key)) {
      base[key] = obj[key]
    }
  }
  return base
}

async function ejecutarOperacionSupabaseSegura(
  payloadInicial: Record<string, any>,
  operacion: (payload: Record<string, any>) => PromiseLike<{ error: any }>
): Promise<{ ok: boolean; error?: any }> {
  let datos = prepararPayloadSupabase(payloadInicial)
  let intentos = 0

  while (intentos < 5) {
    intentos++
    const { error } = await operacion(datos)
    if (!error) return { ok: true }

    const msg = (error.message || '').toLowerCase()
    if (
      error.code === '42703' ||
      error.code === 'PGRST204' ||
      msg.includes('column') ||
      msg.includes('schema cache')
    ) {
      const matchPgrst = error.message.match(/Could not find the '([^']+)' column/i)
      const matchPg = error.message.match(/column [^.]*\.?([a-zA-Z0-9_]+) does not exist/i)
      const col = matchPgrst?.[1] || matchPg?.[1]
      if (col && col in datos) {
        console.warn(`Columna '${col}' no existe en Supabase productos. Reintentando sin ella...`)
        COLUMNAS_INEXISTENTES_SUPABASE.add(col)
        delete datos[col]
        continue
      }
      console.warn('Reintentando con columnas base de productos...')
      datos = filtrarColumnasBase(datos)
      const { error: coreErr } = await operacion(datos)
      return { ok: !coreErr, error: coreErr }
    }

    console.warn('Error en operación de productos Supabase:', error)
    return { ok: false, error }
  }

  return { ok: false }
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
          if (!local) return item
          return {
            ...local,
            ...item,
            es_retornable:
              item.es_retornable !== undefined && item.es_retornable !== null
                ? Boolean(item.es_retornable)
                : Boolean(local.es_retornable),
            precio_envase:
              item.precio_envase !== undefined && item.precio_envase !== null
                ? Number(item.precio_envase)
                : local.precio_envase,
            nombre_envase: item.nombre_envase ?? local.nombre_envase,
            requiere_vencimiento:
              item.requiere_vencimiento !== undefined && item.requiere_vencimiento !== null
                ? Boolean(item.requiere_vencimiento)
                : Boolean(local.requiere_vencimiento),
            dias_alerta_vencimiento:
              item.dias_alerta_vencimiento !== undefined && item.dias_alerta_vencimiento !== null
                ? Number(item.dias_alerta_vencimiento)
                : (local.dias_alerta_vencimiento || 15),
            es_pesable:
              item.es_pesable !== undefined && item.es_pesable !== null
                ? Boolean(item.es_pesable)
                : Boolean(local.es_pesable),
            unidad_medida: item.unidad_medida ?? local.unidad_medida,
            plu_balanza: item.plu_balanza ?? local.plu_balanza,
            proveedor_id: item.proveedor_id ?? local.proveedor_id,
            es_combo:
              item.es_combo !== undefined && item.es_combo !== null
                ? Boolean(item.es_combo)
                : Boolean(local.es_combo),
          }
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
    const codigoBarrasLimpio = producto.codigo_barras?.trim()
    if (codigoBarrasLimpio) {
      const yaExiste = productos.some(
        (p) => p.activo && p.codigo_barras?.trim().toLowerCase() === codigoBarrasLimpio.toLowerCase()
      )
      if (yaExiste) {
        toast.error(`Ya existe un producto activo con el código de barras "${codigoBarrasLimpio}"`)
        return null
      }
    }

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
      const res = await ejecutarOperacionSupabaseSegura(payload, (datos) =>
        supabase.from('productos').insert(datos)
      )
      insertadoEnSupabase = res.ok
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
    const codigoBarrasLimpio = cambios.codigo_barras?.trim()
    if (codigoBarrasLimpio) {
      const yaExiste = productos.some(
        (p) => p.id !== id && p.activo && p.codigo_barras?.trim().toLowerCase() === codigoBarrasLimpio.toLowerCase()
      )
      if (yaExiste) {
        toast.error(`Ya existe otro producto activo con el código de barras "${codigoBarrasLimpio}"`)
        return false
      }
    }

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
      await ejecutarOperacionSupabaseSegura(cambiosCompletos, (datos) =>
        supabase.from('productos').update(datos).eq('id', id)
      )
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
