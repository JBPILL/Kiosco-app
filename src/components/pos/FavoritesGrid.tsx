import { useRef, useEffect } from 'react'
import toast from 'react-hot-toast'
import type { Producto } from '../../types/database'
import { formatPrecio } from '../../lib/utils'
import { useCartStore } from '../../stores/cartStore'

interface FavoritesGridProps {
  productos: Producto[]
  onSelect: (producto: Producto) => void
}

export function FavoritesGrid({ productos, onSelect }: FavoritesGridProps) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])
  const itemsTicket = useCartStore((s) => s.items)

  // Escuchar evento para enfocar el primer producto de la grilla
  useEffect(() => {
    const handleFocusGrid = () => {
      buttonRefs.current[0]?.focus()
    }
    window.addEventListener('pos-focus-grid', handleFocusGrid)
    return () => window.removeEventListener('pos-focus-grid', handleFocusGrid)
  }, [])

  // Obtener número aproximado de columnas según el ancho de pantalla actual
  const getColsCount = () => {
    if (typeof window === 'undefined') return 3
    const width = window.innerWidth
    if (width >= 1536) return 5
    if (width >= 1280) return 4
    if (width >= 1024) return 3
    if (width >= 768) return 4
    if (width >= 640) return 3
    return 2
  }

  const handleItemSelect = (prod: Producto) => {
    if (prod.stock_actual <= 0) {
      toast.error(`"${prod.descripcion}" no tiene stock disponible (0 unidades)`)
      return
    }

    const itemEnTicket = itemsTicket.find((it) => it.producto.id === prod.id)
    const cantEnTicket = itemEnTicket ? itemEnTicket.cantidad : 0
    const tieneStockLimitado = !prod.es_pesable && prod.stock_actual > 0 && prod.stock_actual !== 99999

    if (tieneStockLimitado && cantEnTicket >= prod.stock_actual) {
      toast.error(`"${prod.descripcion}" ya alcanzó el stock máximo disponible en el ticket (${prod.stock_actual} u.)`, {
        id: `grid-stock-${prod.id}`,
      })
      return
    }

    onSelect(prod)
  }

  const handleKeyDown = (e: React.KeyboardEvent, index: number, prod: Producto) => {
    const cols = getColsCount()

    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        window.dispatchEvent(new CustomEvent('pos-focus-category'))
      } else {
        window.dispatchEvent(new CustomEvent('pos-focus-ticket'))
      }
      return
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (index < productos.length - 1) {
        buttonRefs.current[index + 1]?.focus()
      } else {
        window.dispatchEvent(new CustomEvent('pos-focus-ticket'))
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (index > 0) {
        buttonRefs.current[index - 1]?.focus()
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = index + cols
      if (nextIndex < productos.length) {
        buttonRefs.current[nextIndex]?.focus()
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = index - cols
      if (prevIndex >= 0) {
        buttonRefs.current[prevIndex]?.focus()
      } else {
        // Si está en la primera fila, subir el foco a las pestañas de categorías
        window.dispatchEvent(new CustomEvent('pos-focus-category'))
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleItemSelect(prod)
    }
  }

  if (productos.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-xs bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <p className="font-medium">No hay productos en esta vista.</p>
        <p className="text-[11px] mt-0.5">Marcá productos como favoritos desde el Catálogo para verlos acá.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 p-1" role="grid" aria-label="Catálogo de productos">
      {productos.map((prod, index) => {
        const sinStock = prod.stock_actual <= 0
        const stockBajo = prod.stock_actual <= prod.stock_minimo && prod.stock_actual > 0
        const itemEnTicket = itemsTicket.find((it) => it.producto.id === prod.id)
        const cantEnTicket = itemEnTicket ? itemEnTicket.cantidad : 0
        const tieneStockLimitado = !prod.es_pesable && prod.stock_actual > 0 && prod.stock_actual !== 99999
        const stockMaxAlcanzado = tieneStockLimitado && cantEnTicket >= prod.stock_actual
        const bloqueado = sinStock || stockMaxAlcanzado

        return (
          <button
            key={prod.id}
            ref={(el) => { buttonRefs.current[index] = el }}
            tabIndex={index === 0 ? 0 : -1}
            onClick={() => handleItemSelect(prod)}
            onKeyDown={(e) => handleKeyDown(e, index, prod)}
            disabled={bloqueado}
            className={`group relative flex flex-col items-start justify-start p-3 sm:p-3.5 rounded-2xl text-left shadow-md dark:shadow-black/20
              border transition-all duration-100 ${cantEnTicket > 0 && !bloqueado ? 'ring-2 ring-indigo-500/70' : ''} min-h-[112px] sm:min-h-[120px] select-none ${
                sinStock
                  ? 'opacity-40 cursor-not-allowed border-dashed border-gray-300 dark:border-gray-700 bg-gray-100/50 dark:bg-gray-800/40'
                  : stockMaxAlcanzado
                  ? 'opacity-50 cursor-not-allowed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-gray-700/60 active:scale-95 cursor-pointer focus:outline-hidden focus:z-10 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:bg-indigo-50/90 dark:focus:bg-gray-700'
              }`}
          >
            <svg className="mb-2 shrink-0 text-indigo-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 7 12 2l9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10" /></svg>
            {/* Badge de cantidad presente en el ticket */}
            {cantEnTicket > 0 && !sinStock && (
              <span
                className={`absolute top-1 right-1 px-1.5 py-0.2 text-[9px] font-bold rounded-full shadow-xs ${
                  stockMaxAlcanzado
                    ? 'bg-amber-600 text-white'
                    : 'bg-indigo-600 text-white'
                }`}
                title={`Tenés ${cantEnTicket} unidad(es) de este producto en el ticket actual`}
              >
                {cantEnTicket}
              </span>
            )}

            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 group-focus:text-indigo-950 dark:group-focus:text-white line-clamp-3 leading-snug min-h-[32px]">
              {prod.descripcion}
            </span>
            <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 group-focus:text-emerald-700 dark:group-focus:text-emerald-300 mt-1">
              {formatPrecio(prod.precio_venta)}
            </span>

            {/* Indicador de stock actual y estado en ticket */}
            {sinStock ? (
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-bold mt-1">
                Sin stock
              </span>
            ) : stockMaxAlcanzado ? (
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-bold mt-1">
                Máx en ticket ({prod.stock_actual})
              </span>
            ) : stockBajo ? (
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-bold mt-1">
                Bajo ({prod.stock_actual})
              </span>
            ) : (
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 font-medium mt-1">
                Stock: {prod.stock_actual}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
