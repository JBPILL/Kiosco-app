import { useRef, useEffect } from 'react'
import type { Producto } from '../../types/database'
import { formatPrecio } from '../../lib/utils'

interface FavoritesGridProps {
  productos: Producto[]
  onSelect: (producto: Producto) => void
}

export function FavoritesGrid({ productos, onSelect }: FavoritesGridProps) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

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
    if (width >= 1024) return 5
    if (width >= 640) return 4
    return 3
  }

  const handleKeyDown = (e: React.KeyboardEvent, index: number, prod: Producto) => {
    const cols = getColsCount()

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (index < productos.length - 1) {
        buttonRefs.current[index + 1]?.focus()
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
      onSelect(prod)
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
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2" role="grid" aria-label="Catálogo de productos">
      {productos.map((prod, index) => (
        <button
          key={prod.id}
          ref={(el) => { buttonRefs.current[index] = el }}
          onClick={() => onSelect(prod)}
          onKeyDown={(e) => handleKeyDown(e, index, prod)}
          className="flex flex-col items-center justify-center p-2 rounded-xl
            border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-indigo-500 dark:hover:border-indigo-400
            hover:bg-indigo-50/40 dark:hover:bg-indigo-900/20 active:scale-95 transition-all
            focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:outline-hidden
            min-h-[66px] sm:min-h-[72px] text-center"
        >
          <span className="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-tight">
            {prod.descripcion}
          </span>
          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
            {formatPrecio(prod.precio_venta)}
          </span>
          {prod.stock_actual <= prod.stock_minimo && prod.stock_actual > 0 && (
            <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-medium mt-0.5">
              Bajo ({prod.stock_actual})
            </span>
          )}
          {prod.stock_actual <= 0 && (
            <span className="text-[9px] px-1 rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-bold mt-0.5">
              Sin stock
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
