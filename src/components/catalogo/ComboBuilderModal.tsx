import { useState, useEffect, useMemo } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { SearchInput } from '../ui/SearchInput'
import { useComboStore } from '../../stores/comboStore'
import { useAuthStore } from '../../stores/authStore'
import { formatPrecio } from '../../lib/utils'
import type { Producto } from '../../types/database'
import toast from 'react-hot-toast'

interface ComboBuilderModalProps {
  isOpen: boolean
  onClose: () => void
  comboProducto: Producto | null
  todosLosProductos: Producto[]
  onGuardado?: () => void
}

interface ComponenteItem {
  componente_producto_id: string
  cantidad: number
}

export function ComboBuilderModal({
  isOpen,
  onClose,
  comboProducto,
  todosLosProductos,
  onGuardado,
}: ComboBuilderModalProps) {
  const { usuario } = useAuthStore()
  const { itemsCombo, guardarComponentes } = useComboStore()

  const [componentes, setComponentes] = useState<ComponenteItem[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Cargar componentes actuales cuando se abre con un producto combo
  useEffect(() => {
    if (isOpen && comboProducto) {
      const existentes = itemsCombo.filter((i) => i.combo_producto_id === comboProducto.id)
      setComponentes(
        existentes.map((i) => ({
          componente_producto_id: i.componente_producto_id,
          cantidad: i.cantidad,
        }))
      )
      setBusqueda('')
    }
  }, [isOpen, comboProducto, itemsCombo])

  // Mapa rápido de productos por ID
  const productosMap = useMemo(() => {
    return new Map(todosLosProductos.map((p) => [p.id, p]))
  }, [todosLosProductos])

  // Productos disponibles para agregar (excluyendo el propio combo y los ya seleccionados)
  const productosCandidatos = useMemo(() => {
    if (!comboProducto) return []
    const yaAgregadosIds = new Set(componentes.map((c) => c.componente_producto_id))

    return todosLosProductos.filter((p) => {
      if (p.id === comboProducto.id) return false
      if (yaAgregadosIds.has(p.id)) return false
      if (p.es_combo) return false // No permitir combos recursivos anidados
      if (!busqueda) return true
      const q = busqueda.toLowerCase()
      return (
        p.descripcion.toLowerCase().includes(q) ||
        (p.codigo_barras && p.codigo_barras.toLowerCase().includes(q))
      )
    })
  }, [todosLosProductos, comboProducto, componentes, busqueda])

  // Cálculos económicos y de stock virtual
  const resumen = useMemo(() => {
    let costoTotal = 0
    let ventaSumada = 0
    let stockMaximo = componentes.length > 0 ? Infinity : 0
    let productoCuelloBotella: { descripcion: string; stock: number; necesita: number } | null = null

    for (const comp of componentes) {
      const prod = productosMap.get(comp.componente_producto_id)
      if (prod) {
        costoTotal += (prod.precio_costo || 0) * comp.cantidad
        ventaSumada += (prod.precio_venta || 0) * comp.cantidad

        if (comp.cantidad > 0) {
          const posibles = Math.floor(prod.stock_actual / comp.cantidad)
          if (posibles < stockMaximo) {
            stockMaximo = Math.max(0, posibles)
            productoCuelloBotella = {
              descripcion: prod.descripcion,
              stock: prod.stock_actual,
              necesita: comp.cantidad,
            }
          }
        }
      }
    }

    if (stockMaximo === Infinity) stockMaximo = 0

    return {
      costoTotal,
      ventaSumada,
      stockMaximo,
      productoCuelloBotella,
    }
  }, [componentes, productosMap])

  const agregarComponente = (prodId: string) => {
    setComponentes((prev) => [...prev, { componente_producto_id: prodId, cantidad: 1 }])
    setBusqueda('')
  }

  const quitarComponente = (prodId: string) => {
    setComponentes((prev) => prev.filter((c) => c.componente_producto_id !== prodId))
  }

  const actualizarCantidad = (prodId: string, cantidad: number) => {
    const val = Math.max(0.001, cantidad)
    setComponentes((prev) =>
      prev.map((c) => (c.componente_producto_id === prodId ? { ...c, cantidad: val } : c))
    )
  }

  const handleGuardar = async () => {
    if (!comboProducto || guardando) return
    if (componentes.length === 0) {
      toast.error('Debes agregar al menos un producto componente al combo')
      return
    }

    setGuardando(true)
    const ok = await guardarComponentes(
      comboProducto.id,
      componentes,
      usuario?.kiosco_id || comboProducto.kiosco_id
    )
    setGuardando(false)

    if (ok) {
      if (onGuardado) onGuardado()
      onClose()
    }
  }

  if (!comboProducto) return null

  const precioVentaCombo = comboProducto.precio_venta || 0
  const ahorroCliente = resumen.ventaSumada > precioVentaCombo ? resumen.ventaSumada - precioVentaCombo : 0
  const porcentajeAhorro =
    resumen.ventaSumada > 0 ? Math.round((ahorroCliente / resumen.ventaSumada) * 100) : 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Armar Combo: ${comboProducto.descripcion}`}
      size="lg"
    >
      <div className="space-y-4">
        {/* Cabecera Informativa */}
        <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
            <div>
              <span className="font-semibold text-indigo-900 dark:text-indigo-300">
                Precio de Venta del Combo:
              </span>{' '}
              <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400">
                {formatPrecio(precioVentaCombo)}
              </span>
            </div>
            {ahorroCliente > 0 && (
              <div className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded font-medium">
                Ahorro para el cliente: {formatPrecio(ahorroCliente)} ({porcentajeAhorro}% OFF)
              </div>
            )}
          </div>
        </div>

        {/* Buscador de productos para añadir al combo */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Buscar y agregar productos que integran este pack:
          </label>
          <SearchInput
            placeholder="Escribí el nombre del producto o código de barras..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onClear={() => setBusqueda('')}
          />

          {/* Lista de sugerencias cuando hay búsqueda */}
          {busqueda.trim().length > 0 && (
            <div className="mt-1 max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-md divide-y divide-gray-100 dark:divide-gray-700 z-10">
              {productosCandidatos.length === 0 ? (
                <div className="p-2.5 text-xs text-gray-400 text-center">
                  No se encontraron productos disponibles
                </div>
              ) : (
                productosCandidatos.slice(0, 8).map((prod) => (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => agregarComponente(prod.id)}
                    className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs transition-colors cursor-pointer"
                  >
                    <div>
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        {prod.descripcion}
                      </span>
                      <span className="text-gray-400 ml-2 font-mono">
                        (Stock: {prod.stock_actual})
                      </span>
                    </div>
                    <div className="font-semibold text-indigo-600 dark:text-indigo-400">
                      + Agregar ({formatPrecio(prod.precio_venta)})
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Tabla de componentes seleccionados */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            Componentes del Combo ({componentes.length})
          </h4>

          {componentes.length === 0 ? (
            <div className="p-6 text-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-gray-400 dark:text-gray-500 text-xs">
              No hay productos en este combo aún. Buscá arriba para agregar los artículos (ej. Fernet 750ml + 2 Cocas 1.5L).
            </div>
          ) : (
            <div className="border border-gray-300 dark:border-gray-700 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-semibold">
                  <tr>
                    <th className="px-3 py-2 text-left">Producto Componente</th>
                    <th className="px-2 py-2 text-center w-24">Cantidad</th>
                    <th className="px-2 py-2 text-right">Stock Act.</th>
                    <th className="px-2 py-2 text-right">Costo Total</th>
                    <th className="px-2 py-2 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {componentes.map((comp) => {
                    const prod = productosMap.get(comp.componente_producto_id)
                    if (!prod) return null
                    const costoSubtotal = (prod.precio_costo || 0) * comp.cantidad
                    return (
                      <tr key={comp.componente_producto_id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                        <td className="px-3 py-2">
                          <p className="font-semibold text-gray-900 dark:text-gray-100">
                            {prod.descripcion}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            P. Venta individual: {formatPrecio(prod.precio_venta)}
                          </p>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={comp.cantidad}
                            onChange={(e) =>
                              actualizarCantidad(comp.componente_producto_id, parseFloat(e.target.value) || 1)
                            }
                            className="w-16 text-center text-xs py-1 px-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-bold outline-none focus:border-indigo-500"
                          />
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-gray-600 dark:text-gray-300">
                          {prod.stock_actual}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-gray-800 dark:text-gray-200">
                          {formatPrecio(costoSubtotal)}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => quitarComponente(comp.componente_producto_id)}
                            className="text-red-500 hover:text-red-700 font-bold p-1 cursor-pointer"
                            title="Quitar componente"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Resumen de Stock Calculado y Métricas */}
        {componentes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-2.5 bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 rounded-lg">
              <span className="text-gray-500 dark:text-gray-400 block text-[11px]">Costo acumulado:</span>
              <span className="font-bold text-gray-800 dark:text-gray-200 font-mono text-sm">
                {formatPrecio(resumen.costoTotal)}
              </span>
            </div>

            <div className="p-2.5 bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 rounded-lg">
              <span className="text-gray-500 dark:text-gray-400 block text-[11px]">Suma de venta individual:</span>
              <span className="font-bold text-gray-800 dark:text-gray-200 font-mono text-sm">
                {formatPrecio(resumen.ventaSumada)}
              </span>
            </div>

            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg">
              <span className="text-emerald-700 dark:text-emerald-400 block text-[11px]">Stock virtual disponible:</span>
              <span className="font-bold text-emerald-800 dark:text-emerald-300 text-sm">
                {resumen.stockMaximo} packs
              </span>
              {resumen.productoCuelloBotella && (
                <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
                  Limitado por: {resumen.productoCuelloBotella.descripcion} ({resumen.productoCuelloBotella.stock} un)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-2 pt-2">
          <Button type="button" fullWidth loading={guardando} onClick={handleGuardar}>
            Guardar receta del combo
          </Button>
          <Button type="button" variant="secondary" fullWidth onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
