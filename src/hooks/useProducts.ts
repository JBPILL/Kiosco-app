import { useState, useEffect, useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Producto, Categoria } from '../types/database'
import {
  adjuntarCostosProtegidos,
  cargarCostosProtegidos,
  guardarCostosProtegidosLocales,
  leerCostosProtegidosLocales,
} from '../lib/productCostAccess'
import { getCachedProductos, saveCachedProductos } from '../lib/utils'
import type { KioskoProductsUpdatedDetail } from './useRealtimeSync'
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

function esErrorDeRed(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  if ('code' in error && error.code) return false
  const mensaje = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return /failed to fetch|fetch failed|network|load failed|supabase ca[ií]do/i.test(mensaje)
}

function mensajeDeError(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'El servidor no aceptó el cambio.'
}


export function useProducts() {
  const { usuario, kiosco } = useAuthStore()
  const kioscoId = usuario?.kiosco_id || kiosco?.id
  const idsBorradosRef = useRef<Set<string>>(new Set())

  const getCacheKeyCategorias = useCallback(() => {
    return kioscoId ? `kiosko_cache_categorias_${kioscoId}` : 'kiosko_cache_categorias'
  }, [kioscoId])

  const guardarProductosEnCache = useCallback((lista: Producto[]) => {
    const limpios = lista.filter(
      (p) =>
        p &&
        p.activo !== false &&
        !idsBorradosRef.current.has(p.id) &&
        (!kioscoId || !p.kiosco_id || p.kiosco_id === kioscoId)
    )
    saveCachedProductos(limpios, kioscoId)
  }, [kioscoId])

  const guardarCategoriasEnCache = useCallback((lista: Categoria[]) => {
    try {
      localStorage.setItem(getCacheKeyCategorias(), JSON.stringify(lista))
      localStorage.setItem('kiosko_cache_categorias', JSON.stringify(lista))
    } catch (e) {
      console.warn('Error al guardar categorías en caché:', e)
    }
  }, [getCacheKeyCategorias])

  const [productos, setProductos] = useState<Producto[]>(() => {
    try {
      const parsed = getCachedProductos(kioscoId)
      if (Array.isArray(parsed)) {
        const validos = parsed.filter(
          (p: Producto) =>
            p &&
            p.activo !== false &&
            (!kioscoId || !p.kiosco_id || p.kiosco_id === kioscoId)
        )
        if ((usuario?.rol === 'DUEÑO' || usuario?.es_superadmin) && kioscoId) {
          return adjuntarCostosProtegidos(validos, leerCostosProtegidosLocales(kioscoId))
        }
        return validos
      }
      return []
    } catch {
      return []
    }
  })

  const [categorias, setCategorias] = useState<Categoria[]>(() => {
    try {
      const cached =
        (kioscoId && localStorage.getItem(`kiosko_cache_categorias_${kioscoId}`)) ||
        localStorage.getItem('kiosko_cache_categorias')
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })

  const [cargando, setCargando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null)

  // Si cambia el kiosco autenticado, resetear o purgar el catálogo residual de otros comercios
  useEffect(() => {
    if (kioscoId) {
      setProductos((prev) => {
        const filtrados = prev.filter(
          (p) => p && p.activo !== false && (!p.kiosco_id || p.kiosco_id === kioscoId)
        )
        guardarProductosEnCache(filtrados)
        return filtrados
      })
    }
  }, [kioscoId, guardarProductosEnCache])

  // Cargar productos con join a categoría
  const cargarProductos = useCallback(async () => {
    setCargando(true)
    const currentKioscoId = usuario?.kiosco_id || kiosco?.id

    let query = supabase
      .from('productos')
      .select('*, categoria:categorias(id, nombre, color)')
      .eq('activo', true)
      .order('descripcion')
      .limit(10000)

    if (currentKioscoId) {
      query = query.eq('kiosco_id', currentKioscoId)
    }

    const { data, error } = await query

    if (error) {
      const cachedList = getCachedProductos(currentKioscoId)
      if (cachedList.length > 0 && productos.length === 0) {
        let validos = cachedList.filter(
          (p: Producto) =>
            p &&
            p.activo !== false &&
            !idsBorradosRef.current.has(p.id) &&
            (!currentKioscoId || !p.kiosco_id || p.kiosco_id === currentKioscoId)
        )
        if ((usuario?.rol === 'DUEÑO' || usuario?.es_superadmin) && currentKioscoId) {
          validos = adjuntarCostosProtegidos(validos, leerCostosProtegidosLocales(currentKioscoId))
        }
        setProductos(validos)
        toast('Modo local: Mostrando catálogo guardado en memoria', { icon: '📦' })
      } else if (cachedList.length === 0) {
        toast.error('Error al cargar productos: ' + (error.message || ''))
      }
      console.error('Error al cargar productos:', error)
    } else if (data) {
      let productosRemotos = data as Producto[]
      const puedeVerCostos = usuario?.rol === 'DUEÑO' || Boolean(usuario?.es_superadmin)
      if (puedeVerCostos && productosRemotos.length > 0) {
        try {
          const costos = await cargarCostosProtegidos(productosRemotos.map((producto) => producto.id))
          productosRemotos = adjuntarCostosProtegidos(productosRemotos, costos)
          if (currentKioscoId) guardarCostosProtegidosLocales(currentKioscoId, costos)
        } catch (errCostos) {
          console.error('Error cargando costos protegidos:', errCostos)
          if (currentKioscoId) {
            productosRemotos = adjuntarCostosProtegidos(
              productosRemotos,
              leerCostosProtegidosLocales(currentKioscoId)
            )
          }
          toast.error('No se pudieron sincronizar los costos privados. Se muestran los últimos datos locales disponibles.')
        }
      }

      setProductos((prev) => {
        const localMap = new Map(prev.map((p) => [p.id, p]))
        const remoteIds = new Set(productosRemotos.map((d) => d.id))
        const cleanData = productosRemotos.filter(
          (item) => item.activo !== false && !idsBorradosRef.current.has(item.id)
        )

        const merged = cleanData.map((item) => {
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

        // Preservar ÚNICAMENTE borradores locales legítimos (offline), NUNCA productos inactivos, borrados o de otro comercio
        const soloLocales = prev.filter(
          (p) =>
            Boolean(p._local_offline) &&
            p.activo !== false &&
            !remoteIds.has(p.id) &&
            !idsBorradosRef.current.has(p.id) &&
            (!currentKioscoId || !p.kiosco_id || p.kiosco_id === currentKioscoId)
        )
        const total = [...soloLocales, ...merged].filter(
          (p) => p.activo !== false && !idsBorradosRef.current.has(p.id)
        )

        // Auto-sincronizar productos creados offline cuando hay conexión (BUG-CAT-02)
        if (soloLocales.length > 0 && typeof navigator !== 'undefined' && navigator.onLine) {
          ;(async () => {
            try {
              for (const prodOffline of soloLocales) {
                const { _local_offline, categoria, proveedor, ...datosDB } = prodOffline as any
                const { ok } = await ejecutarOperacionSupabaseSegura(datosDB, (d) =>
                  supabase.from('productos').upsert(d, { onConflict: 'id' })
                )
                if (ok) {
                  setProductos((curr) => {
                    const actualizados = curr.map((p) => (p.id === prodOffline.id ? { ...p, _local_offline: false } : p))
                    guardarProductosEnCache(actualizados)
                    return actualizados
                  })
                }
              }
            } catch (errSync) {
              console.warn('Aviso al sincronizar productos locales offline:', errSync)
            }
          })()
        }

        guardarProductosEnCache(total)
        return total
      })
    }
    setCargando(false)
  }, [usuario?.kiosco_id, usuario?.rol, usuario?.es_superadmin, kiosco?.id, guardarProductosEnCache])

  // Cargar categorías
  const cargarCategorias = useCallback(async () => {
    const currentKioscoId = usuario?.kiosco_id || kiosco?.id
    let query = supabase
      .from('categorias')
      .select('*')
      .order('orden')

    if (currentKioscoId) {
      query = query.eq('kiosco_id', currentKioscoId)
    }

    const { data, error } = await query

    if (error) {
      const cached =
        localStorage.getItem(currentKioscoId ? `kiosko_cache_categorias_${currentKioscoId}` : 'kiosko_cache_categorias') ||
        localStorage.getItem('kiosko_cache_categorias')
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
      const cleanCats = data || []
      setCategorias(cleanCats)
      guardarCategoriasEnCache(cleanCats)
    }
  }, [usuario?.kiosco_id, kiosco?.id, guardarCategoriasEnCache])

  useEffect(() => {
    cargarProductos()
  }, [cargarProductos])

  useEffect(() => {
    cargarCategorias()
  }, [cargarCategorias])

  // Sincronización reactiva en tiempo real con CustomEvent('kiosko-products-updated') sin recarga masiva
  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent<KioskoProductsUpdatedDetail>).detail
      if (!detail) return

      const { eventType, producto, productoOld } = detail
      setProductos((prev) => {
        let actualizados = prev
        if (eventType === 'UPDATE' && producto) {
          if (producto.activo === false) {
            actualizados = prev.filter((p) => p.id !== producto.id)
          } else {
            const index = prev.findIndex((p) => p.id === producto.id)
            if (index >= 0) {
              actualizados = prev.map((p) => (p.id === producto.id ? { ...p, ...producto } : p))
            } else {
              actualizados = [producto, ...prev]
            }
          }
        } else if (eventType === 'INSERT' && producto) {
          if (producto.activo !== false && !prev.some((p) => p.id === producto.id)) {
            actualizados = [producto, ...prev]
          }
        } else if (eventType === 'DELETE') {
          const idBorrado = producto?.id || productoOld?.id
          if (idBorrado) {
            actualizados = prev.filter((p) => p.id !== idBorrado)
          }
        }
        guardarProductosEnCache(actualizados)
        return actualizados
      })
    }

    window.addEventListener('kiosko-products-updated', handleUpdate)
    return () => {
      window.removeEventListener('kiosko-products-updated', handleUpdate)
    }
  }, [guardarProductosEnCache])

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

    const pluLimpio = producto.plu_balanza?.trim()
    if (pluLimpio) {
      const yaExistePlu = productos.some(
        (p) => p.activo && p.plu_balanza?.trim() === pluLimpio
      )
      if (yaExistePlu) {
        toast.error(`Ya existe un producto activo con el código PLU de balanza "${pluLimpio}"`)
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

    const itemFinal: Producto = {
      ...payload,
      _local_offline: !insertadoEnSupabase,
    }
    if ((usuario?.rol === 'DUEÑO' || usuario?.es_superadmin) && kioscoId) {
      guardarCostosProtegidosLocales(kioscoId, [{ producto_id: nuevoId, precio_costo: payload.precio_costo }])
    }

    // Actualizar estado local inmediatamente
    setProductos((prev) => {
      const listaActualizada = [itemFinal, ...prev.filter((p) => p.id !== itemFinal.id)]
      guardarProductosEnCache(listaActualizada)
      return listaActualizada
    })

    if (insertadoEnSupabase) {
      toast.success('Producto creado y sincronizado')
      await cargarProductos()
    } else {
      toast.success('Producto guardado en memoria local')
    }

    return itemFinal
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

    const pluLimpio = cambios.plu_balanza?.trim()
    if (pluLimpio) {
      const yaExistePlu = productos.some(
        (p) => p.id !== id && p.activo && p.plu_balanza?.trim() === pluLimpio
      )
      if (yaExistePlu) {
        toast.error(`Ya existe otro producto activo con el código PLU de balanza "${pluLimpio}"`)
        return false
      }
    }

    const cambiosCompletos = { ...cambios, fecha_actualizacion: new Date().toISOString() }
    let sincronizado = false
    try {
      const resultado = await ejecutarOperacionSupabaseSegura(cambiosCompletos, (datos) =>
        supabase.from('productos').update(datos).eq('id', id)
      )
      if (!resultado.ok && !esErrorDeRed(resultado.error)) {
        toast.error(`No se pudo actualizar el producto: ${mensajeDeError(resultado.error)}`)
        return false
      }
      sincronizado = resultado.ok
    } catch (error) {
      if (!esErrorDeRed(error)) {
        toast.error(`No se pudo actualizar el producto: ${mensajeDeError(error)}`)
        return false
      }
    }

    // Guardar solo tras aceptación del servidor o un fallo de transporte conocido.
    // Un rechazo de permisos/validación conserva el producto y sus costos locales.
    if (
      cambiosCompletos.precio_costo !== undefined &&
      (usuario?.rol === 'DUEÑO' || usuario?.es_superadmin) &&
      kioscoId
    ) {
      guardarCostosProtegidosLocales(kioscoId, [{ producto_id: id, precio_costo: cambiosCompletos.precio_costo }])
    }

    // Actualizar UI y caché de forma inmutable.
    setProductos((prev) => {
      const actualizados = prev.map((p) => (p.id === id ? { ...p, ...cambiosCompletos } : p))
      guardarProductosEnCache(actualizados)
      return actualizados
    })

    if (sincronizado) {
      toast.success('Producto actualizado')
      await cargarProductos()
    } else {
      toast('Cambio guardado en este dispositivo; falta sincronizar con el servidor.', { icon: '📦' })
    }
    return true
  }

  // Eliminar producto (soft delete y purga definitiva de memoria)
  const eliminarProducto = async (id: string) => {
    idsBorradosRef.current.add(id)

    // 1. Purgar inmediatamente del estado local y del caché en localStorage para evitar efecto zombie
    setProductos((prev) => {
      const filtrados = prev.filter((p) => p.id !== id)
      guardarProductosEnCache(filtrados)
      return filtrados
    })

    // 2. Si es un combo o componente, limpiar también sus recetas en combo_items
    try {
      await supabase.from('combo_items').delete().or(`combo_producto_id.eq.${id},componente_producto_id.eq.${id}`)
    } catch {}

    // 3. Desactivar en Supabase (soft-delete)
    const { error } = await supabase
      .from('productos')
      .update({ activo: false, fecha_actualizacion: new Date().toISOString() })
      .eq('id', id)

    // 4. Intento adicional de eliminación por si fuera un producto huérfano / demo local sin ventas
    try {
      await supabase.from('productos').delete().eq('id', id)
    } catch {}

    if (error) {
      console.warn('Advertencia al desactivar producto en Supabase:', error)
    }

    toast.success('Producto eliminado')
    await cargarProductos()
    return true
  }

  // Eliminar todos los productos sin categoría asignada (huérfanos) o residuales
  const purgarProductosHuerfanos = async () => {
    const currentKioscoId = usuario?.kiosco_id || kiosco?.id
    const huerfanos = productos.filter(
      (p) =>
        (!p.categoria_id && !p.categoria?.id) ||
        p.activo === false ||
        (currentKioscoId && p.kiosco_id && p.kiosco_id !== currentKioscoId)
    )
    if (huerfanos.length === 0) {
      toast('No hay productos huérfanos sin categoría.')
      return false
    }

    const ids = huerfanos.map((p) => p.id)
    ids.forEach((id) => idsBorradosRef.current.add(id))

    setProductos((prev) => {
      const filtrados = prev.filter((p) => !ids.includes(p.id))
      guardarProductosEnCache(filtrados)
      return filtrados
    })

    try {
      await supabase.from('combo_items').delete().in('combo_producto_id', ids)
      await supabase.from('combo_items').delete().in('componente_producto_id', ids)
    } catch {}

    try {
      await supabase
        .from('productos')
        .update({ activo: false, fecha_actualizacion: new Date().toISOString() })
        .in('id', ids)
    } catch {}

    try {
      await supabase.from('productos').delete().in('id', ids)
    } catch {}

    toast.success(`${ids.length} producto(s) huérfano(s) eliminado(s)`)
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

  const eliminarCategoria = async (id: string, eliminarProductos?: boolean) => {
    try {
      if (eliminarProductos) {
        // 1. Identificar productos a borrar tanto de memoria como de base de datos
        const productosABorrar = productos.filter((p) => p.categoria_id === id || p.categoria?.id === id)
        const idsABorrar = productosABorrar.map((p) => p.id)

        // Traer de Supabase también por si hay productos no cargados en memoria
        let idsRemotos: string[] = []
        try {
          const { data: dbProds } = await supabase
            .from('productos')
            .select('id')
            .eq('categoria_id', id)
          if (dbProds) idsRemotos = dbProds.map((p) => p.id)
        } catch {}

        const allIds = Array.from(new Set([...idsABorrar, ...idsRemotos]))
        allIds.forEach((pid) => idsBorradosRef.current.add(pid))

        // Purgar inmediatamente del estado local de productos y de la caché
        setProductos((prev) => {
          const filtrados = prev.filter(
            (p) => !allIds.includes(p.id) && p.categoria_id !== id && p.categoria?.id !== id
          )
          guardarProductosEnCache(filtrados)
          return filtrados
        })

        if (allIds.length > 0) {
          // Desactivar en Supabase
          await supabase
            .from('productos')
            .update({ activo: false, categoria_id: null, fecha_actualizacion: new Date().toISOString() })
            .in('id', allIds)

          // Si son combos, limpiar también sus recetas en combo_items
          try {
            await supabase.from('combo_items').delete().in('combo_producto_id', allIds)
            await supabase.from('combo_items').delete().in('componente_producto_id', allIds)
          } catch {}
        }

        // También desactivar en Supabase por categoria_id directo
        try {
          await supabase
            .from('productos')
            .update({ activo: false, categoria_id: null, fecha_actualizacion: new Date().toISOString() })
            .eq('categoria_id', id)
        } catch {}
      } else {
        // Si no se eliminan productos, desvincularlos en Supabase para que no fallen por foreign key
        try {
          await supabase
            .from('productos')
            .update({ categoria_id: null, fecha_actualizacion: new Date().toISOString() })
            .eq('categoria_id', id)
        } catch {}

        setProductos((prev) => {
          const actualizados = prev.map((p) =>
            p.categoria_id === id || p.categoria?.id === id
              ? { ...p, categoria_id: null, categoria: undefined }
              : p
          )
          guardarProductosEnCache(actualizados)
          return actualizados
        })
      }

      // 2. Eliminar la categoría de la base de datos
      const { error } = await supabase.from('categorias').delete().eq('id', id)
      if (error) {
        toast.error('Error al eliminar categoría: ' + (error.message || ''))
        return false
      }

      // 3. Purgar categoría del estado local y caché
      setCategorias((prev) => {
        const filtradas = prev.filter((c) => c.id !== id)
        guardarCategoriasEnCache(filtradas)
        return filtradas
      })

      toast.success(
        eliminarProductos
          ? 'Categoría y productos asociados eliminados'
          : 'Categoría eliminada'
      )

      await Promise.all([cargarCategorias(), cargarProductos()])
      return true
    } catch (err) {
      console.error('Error en eliminarCategoria:', err)
      toast.error('Error al eliminar categoría')
      return false
    }
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
    purgarProductosHuerfanos,
    toggleFavorito,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria,
  }
}
