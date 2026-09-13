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
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 p-1" role="grid" aria-label="Catálogo de productos">
      {productos.map((prod, index) => (
        <button
          key={prod.id}
          ref={(el) => { buttonRefs.current[index] = el }}
          onClick={() => onSelect(prod)}
          onKeyDown={(e) => handleKeyDown(e, index, prod)}
          className="group relative flex flex-col items-center justify-center p-2.5 rounded-xl text-center
            border border-gray-200 dark:border-gray-700
            bg-white dark:bg-gray-800
            hover:border-indigo-400 dark:hover:border-indigo-500
            hover:bg-indigo-50/40 dark:hover:bg-gray-700/60
            focus:outline-hidden focus:z-10
            focus:border-indigo-500 dark:focus:border-indigo-400
            focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:focus:ring-indigo-400
            focus:bg-indigo-50/90 dark:focus:bg-gray-700
            active:scale-95 transition-colors duration-100
            min-h-[68px] sm:min-h-[74px] cursor-pointer select-none"
        >
          <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 group-focus:text-indigo-950 dark:group-focus:text-white line-clamp-2 leading-tight">
            {prod.descripcion}
          </span>
          <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 group-focus:text-emerald-700 dark:group-focus:text-emerald-300 mt-1">
            {formatPrecio(prod.precio_venta)}
          </span>
          {prod.stock_actual <= prod.stock_minimo && prod.stock_actual > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-bold mt-1">
              Bajo ({prod.stock_actual})
            </span>
          )}
          {prod.stock_actual <= 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-bold mt-1">
              Sin stock
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
