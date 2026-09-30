import { useState, useEffect, useRef } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { formatPrecio, getCachedProductos, saveCachedProductos } from '../../lib/utils'
import { playScanSound } from '../../lib/sound'
import type { Producto, Categoria } from '../../types/database'
import type { ProductoMaestro } from '../../data/catalogoMaestroArgentino'
import { v4 as uuidv4 } from 'uuid'
import toast from 'react-hot-toast'

interface AltaRapidaModalProps {
  isOpen: boolean
  onClose: () => void
  codigo: string
  productoSugerido?: ProductoMaestro | null
  categorias: Categoria[]
  onGuardadoExitoso: (producto: Producto, cantidad?: number) => void
  onCategoriaCreada?: (categoria: Categoria) => void
}

export function AltaRapidaModal({
  isOpen,
  onClose,
  codigo,
  productoSugerido,
  categorias,
  onGuardadoExitoso,
  onCategoriaCreada,
}: AltaRapidaModalProps) {
  const { usuario, kiosco } = useAuthStore()
  const kioscoId = usuario?.kiosco_id || kiosco?.id

  const [descripcion, setDescripcion] = useState('')
  const [precioVenta, setPrecioVenta] = useState<number | string>('')
  const [precioCosto, setPrecioCosto] = useState<number | string>('')
  const [stockInicial, setStockInicial] = useState<number | string>(10)
  const [categoriaId, setCategoriaId] = useState<string>('')
  const [guardando, setGuardando] = useState(false)

  const ventaInputRef = useRef<HTMLInputElement>(null)
  const descInputRef = useRef<HTMLInputElement>(null)

  // Inicializar campos cuando se abre el modal
  useEffect(() => {
    if (!isOpen) return

    if (productoSugerido) {
      setDescripcion(productoSugerido.descripcion)
      setPrecioVenta(productoSugerido.precio_venta_sugerido)
      setPrecioCosto(productoSugerido.precio_costo_ref)
      setStockInicial(productoSugerido.stock_inicial_sugerido ?? 12)

      // Intentar vincular con categoría existente por nombre normalizado
      const normSugerida = productoSugerido.categoria_nombre.toLowerCase().trim()
      const catMatch = categorias.find(
        (c) => c.nombre.toLowerCase().trim() === normSugerida
      )
      setCategoriaId(catMatch ? catMatch.id : '')

      // Foco inmediato en Precio de Venta (seleccionado para confirmar con Enter o tipear otro valor)
      setTimeout(() => {
        ventaInputRef.current?.focus()
        ventaInputRef.current?.select()
      }, 50)
    } else {
      setDescripcion('')
      setPrecioVenta('')
      setPrecioCosto('')
      setStockInicial(10)
      setCategoriaId(categorias[0]?.id || '')

      setTimeout(() => {
        descInputRef.current?.focus()
      }, 50)
    }
  }, [isOpen, productoSugerido, categorias])

  // Resolver o crear categoría si hace falta
  const resolverCategoriaId = async (): Promise<string | null> => {
    if (categoriaId) return categoriaId
    if (!productoSugerido?.categoria_nombre || !kioscoId) return null

    const nombreCat = productoSugerido.categoria_nombre.trim()
    const existente = categorias.find(
      (c) => c.nombre.toLowerCase().trim() === nombreCat.toLowerCase()
    )
    if (existente) return existente.id

    try {
      const nuevaId = uuidv4()
      const { data, error } = await supabase
        .from('categorias')
        .insert({
          id: nuevaId,
          kiosco_id: kioscoId,
          nombre: nombreCat,
          color: '#4f46e5',
          orden: categorias.length + 1,
        })
        .select()
        .single()

      if (!error && data) {
        onCategoriaCreada?.(data as Categoria)
        return data.id
      }
    } catch {
      // Ignorar si falla creación de categoría en red
    }
    return null
  }

  const handleGuardarYVender = async () => {
    if (guardando) return
    const descTrim = descripcion.trim()
    if (!descTrim) {
      toast.error('Ingresá una descripción para el producto')
      descInputRef.current?.focus()
      return
    }

    const vNum = Number(precioVenta)
    if (isNaN(vNum) || vNum <= 0) {
      toast.error('El precio de venta debe ser mayor a $0')
      ventaInputRef.current?.focus()
      return
    }

    const cNum = Number(precioCosto) || 0
    const sNum = Number(stockInicial) || 0
    const codigoLimpio = codigo.trim() ? codigo.trim() : null

    setGuardando(true)

    try {
      const resolvedCatId = await resolverCategoriaId()
      const nuevoId = uuidv4()
      const now = new Date().toISOString()

      const payload: Producto = {
        id: nuevoId,
        kiosco_id: kioscoId || '',
        codigo_barras: codigoLimpio,
        descripcion: descTrim,
        precio_venta: Math.round(vNum),
        precio_costo: Math.round(cNum),
        stock_actual: Math.max(0, sNum),
        stock_minimo: 5,
        categoria_id: resolvedCatId,
        unidad_medida: productoSugerido?.unidad_medida || 'UN',
        es_pesable: Boolean(productoSugerido?.es_pesable),
        es_favorito: false,
        activo: true,
        fecha_creacion: now,
        fecha_actualizacion: now,
      }

      // 1. Guardar en Supabase (si hay red)
      let guardadoEnNube = false
      if (kioscoId) {
        try {
          const { error } = await supabase.from('productos').insert({
            id: payload.id,
            kiosco_id: payload.kiosco_id,
            codigo_barras: payload.codigo_barras,
            descripcion: payload.descripcion,
            precio_venta: payload.precio_venta,
            precio_costo: payload.precio_costo,
            stock_actual: payload.stock_actual,
            stock_minimo: payload.stock_minimo,
            categoria_id: payload.categoria_id,
            unidad_medida: payload.unidad_medida,
            es_pesable: payload.es_pesable,
            activo: true,
          })
          guardadoEnNube = !error
          if (error) {
            console.warn('Aviso al insertar en Supabase productos:', error.message)
          }
        } catch (e) {
          console.warn('Fallo de red al insertar producto en Supabase:', e)
        }
      }

      payload._local_offline = !guardadoEnNube

      // 2. Guardar de inmediato en la caché local para que próximos escaneos respondan en 0ms
      const actuales = getCachedProductos(kioscoId)
      const actualizados = [payload, ...actuales.filter((p) => p.id !== payload.id)]
      saveCachedProductos(actualizados, kioscoId)

      // 3. Notificar y agregar al ticket en curso
      playScanSound('success')
      toast.success(`"${payload.descripcion}" dado de alta y sumado al ticket`, {
        icon: '⚡',
        duration: 3000,
      })

      onGuardadoExitoso(payload, 1)
      onClose()
    } catch (err: any) {
      console.error('Error al dar de alta rápida el producto:', err)
      toast.error('Ocurrió un error al guardar el producto')
    } finally {
      setGuardando(false)
    }
  }

  const handleKeyDownForm = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleGuardarYVender()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="md"
    >
      <div onKeyDown={handleKeyDownForm} className="space-y-4 -mt-2">
        {/* Cabecera visual del asistente */}
        <div className="flex items-start gap-3 border-b border-gray-100 dark:border-gray-700/60 pb-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                {productoSugerido ? 'Producto Detectado en Catálogo Semilla' : 'Alta Rápida de Producto'}
              </h2>
              {productoSugerido && (
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Semilla AR
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Código EAN: <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{codigo}</span>
            </p>
          </div>
        </div>

        {/* Formulario rápido con autofocus */}
        <div className="space-y-3 pt-1">
          {/* Descripción */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Descripción del Producto
            </label>
            <Input
              ref={descInputRef}
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Alfajor Jorgito Chocolate 55g"
              required
              className="font-medium"
            />
          </div>

          {/* Fila: Precios y Stock */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Precio Venta (Foco principal) */}
            <div className="col-span-1">
              <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                Precio Venta ($) *
              </label>
              <Input
                ref={ventaInputRef}
                type="number"
                min="0"
                step="10"
                value={precioVenta}
                onChange={(e) => setPrecioVenta(e.target.value)}
                placeholder="0"
                required
                className="font-bold text-base text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-600 focus:ring-indigo-500"
              />
            </div>

            {/* Precio Costo */}
            <div className="col-span-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Costo ($)
              </label>
              <Input
                type="number"
                min="0"
                step="10"
                value={precioCosto}
                onChange={(e) => setPrecioCosto(e.target.value)}
                placeholder="0"
              />
            </div>

            {/* Stock Inicial */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Stock Inicial (u.)
              </label>
              <Input
                type="number"
                min="0"
                step="1"
                value={stockInicial}
                onChange={(e) => setStockInicial(e.target.value)}
                placeholder="10"
              />
            </div>
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Categoría
            </label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="w-full text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              <option value="">
                {productoSugerido?.categoria_nombre
                  ? `Crear/Asignar "${productoSugerido.categoria_nombre}"`
                  : 'Sin categoría específica'}
              </option>
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Margen calculado en vivo */}
        {Number(precioVenta) > 0 && Number(precioCosto) > 0 && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-2.5 flex items-center justify-between text-xs">
            <span className="text-emerald-800 dark:text-emerald-300 font-medium">
              Ganancia estimada por unidad:
            </span>
            <span className="font-bold text-emerald-700 dark:text-emerald-200">
              {formatPrecio(Number(precioVenta) - Number(precioCosto))} (+
              {Math.round(((Number(precioVenta) - Number(precioCosto)) / Number(precioCosto)) * 100)}%)
            </span>
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100 dark:border-gray-700/60">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={guardando}
            className="text-xs"
          >
            Cancelar (Esc)
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={handleGuardarYVender}
            disabled={guardando || !descripcion.trim() || Number(precioVenta) <= 0}
            className="text-xs font-bold px-4 py-2.5 shadow-md flex items-center gap-1.5"
          >
            {guardando ? (
              'Guardando...'
            ) : (
              <>
                <span>Guardar y Cobrar</span>
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-indigo-700 text-indigo-100 text-[10px] font-mono">
                  Enter
                </kbd>
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
