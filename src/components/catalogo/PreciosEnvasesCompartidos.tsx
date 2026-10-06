import { useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useEnvasesStore } from '../../stores/envasesStore'
import { Button } from '../ui/Button'

interface PrecioCompartido {
  id: string
  nombre: string
  precio: number
}

function leerPrecios(value: unknown): PrecioCompartido[] {
  if (!Array.isArray(value)) throw new Error('Respuesta de precios inválida')
  return value.map((fila: unknown) => {
    if (!fila || typeof fila !== 'object' || !('id' in fila) || typeof fila.id !== 'string'
      || !('nombre' in fila) || typeof fila.nombre !== 'string' || !('precio' in fila)) {
      throw new Error('Respuesta de precios inválida')
    }
    const precio = typeof fila.precio === 'number' ? fila.precio
      : typeof fila.precio === 'string' && /^\d+(\.\d{1,2})?$/.test(fila.precio) ? Number(fila.precio) : NaN
    if (!Number.isFinite(precio) || precio < 0) throw new Error('Precio compartido inválido')
    return { id: fila.id, nombre: fila.nombre, precio }
  })
}

export function PreciosEnvasesCompartidos() {
  const usuario = useAuthStore((state) => state.usuario)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('Los precios de este puesto todavía deben compararse con los compartidos.')
  const operar = async (publicar: boolean) => {
    const kioscoId = usuario?.kiosco_id
    const usuarioId = usuario?.id
    if (!kioscoId || ocupado) return
    setOcupado(true)
    const mismaSesion = () => {
      const actual = useAuthStore.getState().usuario
      return actual?.id === usuarioId && actual?.kiosco_id === kioscoId
    }
    try {
      if (publicar) {
        const tipos = useEnvasesStore.getState().tiposEnvases.map(({ id, nombre, precio }) => ({ id, nombre, precio }))
        const { data, error } = await supabase.rpc('guardar_precios_envases', { p_kiosco_id: kioscoId, p_tipos: tipos })
        if (error) throw error
        if (data !== tipos.length) throw new Error('No se confirmó el guardado completo')
        if (!mismaSesion()) return
        setMensaje('Se publicaron los precios enviados. Los demás puestos pueden cargarlos.')
        toast.success('Precios de envases publicados')
      } else {
        const { data, error } = await supabase.from('envases_tipos_comercio')
          .select('id,nombre,precio').eq('kiosco_id', kioscoId).eq('activo', true).limit(101)
        if (error) throw error
        const precios = leerPrecios(data)
        if (precios.length > 100) throw new Error('Catálogo de envases demasiado grande')
        if (!mismaSesion()) return
        if (precios.length === 0) {
          setMensaje('El comercio aún no tiene precios compartidos activos. El dueño debe publicarlos.')
          return
        }
        const locales = useEnvasesStore.getState().tiposEnvases
        const ids = new Set(precios.map((tipo) => tipo.id))
        const pendientes = locales.filter((tipo) => !ids.has(tipo.id))
        const fusionados = precios.map((tipo) => ({ ...locales.find((local) => local.id === tipo.id),
          ...tipo, stock_vacios: locales.find((local) => local.id === tipo.id)?.stock_vacios || 0 }))
        useEnvasesStore.getState().guardarTodosTipos([...fusionados, ...pendientes], kioscoId)
        setMensaje(pendientes.length > 0
          ? `Precios cargados. ${pendientes.length} tipos locales no tienen precio compartido activo; requieren revisión para Point.`
          : 'Precios compartidos cargados; el stock de vacíos de este puesto se conserva.')
        toast.success('Precios compartidos cargados')
      }
    } catch {
      if (mismaSesion()) toast.error('No se completó la operación. Revisá conexión, permisos y la migración de precios de envases.')
    } finally { setOcupado(false) }
  }
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-3 space-y-2">
      <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Precios compartidos del comercio</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400" role="status">{mensaje}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => void operar(false)}>Cargar precios compartidos</Button>
        {(usuario?.rol === 'DUEÑO' || usuario?.es_superadmin) && (
          <Button size="sm" disabled={ocupado} onClick={() => void operar(true)}>Publicar precios de este puesto</Button>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">Publicar reemplaza el catálogo de precios del comercio. El stock de vacíos y los precios de los productos se administran por separado.</p>
    </section>
  )
}
