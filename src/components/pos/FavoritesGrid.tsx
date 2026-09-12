import type { Producto } from '../../types/database'
import { formatPrecio } from '../../lib/utils'

interface FavoritesGridProps {
  productos: Producto[]
  onSelect: (producto: Producto) => void
}

export function FavoritesGrid({ productos, onSelect }: FavoritesGridProps) {
  if (productos.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
        <p>No hay favoritos marcados.</p>
        <p>Marcá productos como Fav desde el Catálogo.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
      {productos.map((prod) => (
        <button
          key={prod.id}
          onClick={() => onSelect(prod)}
          className="flex flex-col items-center justify-center p-3 rounded-xl
            border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-indigo-400 dark:hover:border-indigo-500
            hover:bg-indigo-50 dark:hover:bg-indigo-900/30 active:bg-indigo-100 dark:active:bg-indigo-900/50 transition-all
            min-h-[80px] text-center"
        >
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-tight">
            {prod.descripcion}
          </span>
          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-1">
            {formatPrecio(prod.precio_venta)}
          </span>
          {prod.stock_actual <= prod.stock_minimo && prod.stock_actual > 0 && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">Stock bajo</span>
          )}
          {prod.stock_actual <= 0 && (
            <span className="text-[10px] text-red-600 dark:text-red-400 font-bold mt-0.5">Sin stock</span>
          )}
        </button>
      ))}
    </div>
  )
}
