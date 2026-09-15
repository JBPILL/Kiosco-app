import { useState, useMemo } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { supabase } from '../../lib/supabase'
import { formatPrecio } from '../../lib/utils'
import type { Producto, Categoria } from '../../types/database'
import toast from 'react-hot-toast'

interface AumentoPreciosModalProps {
  isOpen: boolean
  onClose: () => void
  categorias: Categoria[]
  productos: Producto[]
  onAumentoAplicado: () => Promise<void> | void
}

type TipoRedondeo = 'NINGUNO' | '50' | '100'

export function AumentoPreciosModal({
  isOpen,
  onClose,
  categorias,
  productos,
  onAumentoAplicado,
}: AumentoPreciosModalProps) {
  const [categoriaId, setCategoriaId] = useState<string>('TODAS')
  const [porcentaje, setPorcentaje] = useState<number>(10)
  const [tipoPrecio, setTipoPrecio] = useState<'VENTA' | 'COSTO_Y_VENTA'>('VENTA')
  const [redondeo, setRedondeo] = useState<TipoRedondeo>('100')
  const [procesando, setProcesando] = useState(false)

  // Función para calcular nuevo precio aplicando incremento y regla de redondeo
  const calcularNuevo = (precio: number, pct: number, reg: TipoRedondeo): number => {
    if (precio <= 0) return 0
    let calc = precio * (1 + pct / 100)
    if (reg === '50') {
      calc = Math.round(calc / 50) * 50
    } else if (reg === '100') {
      calc = Math.round(calc / 100) * 100
    } else {
      calc = Math.round(calc)
    }
    return Math.max(0, calc)
  }

  // Filtrar productos afectados
  const productosAfectados = useMemo(() => {
    if (categoriaId === 'TODAS') return productos.filter((p) => p.activo)
    return productos.filter((p) => p.activo && p.categoria_id === categoriaId)
  }, [productos, categoriaId])

  // Vista previa de los primeros 5 productos
  const vistaPrevia = useMemo(() => {
    return productosAfectados.slice(0, 5).map((p) => ({
      id: p.id,
      descripcion: p.descripcion,
      ventaActual: p.precio_venta,
      ventaNueva: calcularNuevo(p.precio_venta, porcentaje, redondeo),
      costoActual: p.precio_costo,
      costoNuevo: calcularNuevo(p.precio_costo, porcentaje, redondeo),
    }))
  }, [productosAfectados, porcentaje, redondeo])

  const handleAplicar = async () => {
    if (productosAfectados.length === 0) {
      toast.error('No hay productos que cumplan con el criterio seleccionado')
      return
    }

    if (porcentaje === 0) {
      toast.error('El porcentaje de aumento debe ser distinto de cero')
      return
    }

    const confirmar = window.confirm(
      `¿Confirmás aplicar un aumento del ${porcentaje}% a ${productosAfectados.length} productos?`
    )
    if (!confirmar) return

    setProcesando(true)
    const ahora = new Date().toISOString()
    let exitosos = 0

    try {
      // Procesar en tandas de 20 para no saturar conexiones
      const TAMAÑO_LOTE = 20
      for (let i = 0; i < productosAfectados.length; i += TAMAÑO_LOTE) {
        const lote = productosAfectados.slice(i, i + TAMAÑO_LOTE)
        await Promise.all(
          lote.map(async (p) => {
            const nuevaVenta = calcularNuevo(p.precio_venta, porcentaje, redondeo)
            const updates: Record<string, any> = {
              precio_venta: nuevaVenta,
              fecha_actualizacion: ahora,
            }

            if (tipoPrecio === 'COSTO_Y_VENTA' && p.precio_costo > 0) {
              updates.precio_costo = calcularNuevo(p.precio_costo, porcentaje, redondeo)
            }

            const { error } = await supabase
              .from('productos')
              .update(updates)
              .eq('id', p.id)

            if (!error) exitosos++
          })
        )
      }

      toast.success(`Aumento aplicado exitosamente a ${exitosos} productos`)
      await onAumentoAplicado()
      onClose()
    } catch (err) {
      console.error('Error aplicando aumento masivo:', err)
      toast.error('Ocurrió un error al actualizar algunos precios')
    } finally {
      setProcesando(false)
    }
  }

  const porcentajesRapidos = [5, 10, 15, 20, 25, 30]

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Aumento Masivo de Precios" size="lg">
      <div className="space-y-4">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Ajustá los precios de tus productos rápidamente por porcentaje ante subas de distribuidores o inflación.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Categoría objetivo */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Categoría a incrementar
            </label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-indigo-500"
            >
              <option value="TODAS">Todo el catálogo ({productos.length} productos)</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({productos.filter((p) => p.categoria_id === c.id).length})
                </option>
              ))}
            </select>
          </div>

          {/* Tipo de precio */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Precios a modificar
            </label>
            <select
              value={tipoPrecio}
              onChange={(e) => setTipoPrecio(e.target.value as 'VENTA' | 'COSTO_Y_VENTA')}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-indigo-500"
            >
              <option value="VENTA">Solo Precio de Venta al Público</option>
              <option value="COSTO_Y_VENTA">Precio de Venta y Precio de Costo</option>
            </select>
          </div>
        </div>

        {/* Porcentaje */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
            Porcentaje de aumento (%)
          </label>
          <div className="flex flex-wrap gap-2">
            {porcentajesRapidos.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setPorcentaje(pct)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                  porcentaje === pct
                    ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-600 dark:text-gray-400'
                }`}
              >
                +{pct}%
              </button>
            ))}
            <div className="w-24">
              <Input
                type="number"
                min="1"
                max="300"
                value={porcentaje}
                onChange={(e) => setPorcentaje(parseInt(e.target.value, 10) || 0)}
              />
            </div>
          </div>
        </div>

        {/* Regla de redondeo */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Regla de redondeo en pesos
          </label>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setRedondeo('100')}
              className={`p-2 rounded-lg border text-center font-medium transition-all ${
                redondeo === '100'
                  ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              Múltiplos de $100
              <span className="block text-[10px] text-gray-400 font-normal">Recomendado</span>
            </button>
            <button
              type="button"
              onClick={() => setRedondeo('50')}
              className={`p-2 rounded-lg border text-center font-medium transition-all ${
                redondeo === '50'
                  ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              Múltiplos de $50
              <span className="block text-[10px] text-gray-400 font-normal">Ej: $1.450</span>
            </button>
            <button
              type="button"
              onClick={() => setRedondeo('NINGUNO')}
              className={`p-2 rounded-lg border text-center font-medium transition-all ${
                redondeo === 'NINGUNO'
                  ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              Sin redondeo
              <span className="block text-[10px] text-gray-400 font-normal">Entero exacto</span>
            </button>
          </div>
        </div>

        {/* Vista previa */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-850 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              Vista previa ({productosAfectados.length} productos afectados)
            </span>
            <span className="text-indigo-600 dark:text-indigo-400 font-bold">
              +{porcentaje}%
            </span>
          </div>

          {vistaPrevia.length === 0 ? (
            <p className="text-xs text-gray-500 py-2 text-center">No hay productos seleccionados.</p>
          ) : (
            <div className="space-y-1.5 text-xs">
              {vistaPrevia.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-1.5 bg-white dark:bg-gray-800 rounded border border-gray-200/60 dark:border-gray-700/60"
                >
                  <span className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[180px] sm:max-w-[240px]">
                    {item.descripcion}
                  </span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-gray-400 line-through">{formatPrecio(item.ventaActual)}</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {formatPrecio(item.ventaNueva)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
          <Button variant="secondary" onClick={onClose} disabled={procesando}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleAplicar}
            disabled={procesando || productosAfectados.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {procesando ? 'Actualizando...' : `Aplicar a ${productosAfectados.length} productos`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
