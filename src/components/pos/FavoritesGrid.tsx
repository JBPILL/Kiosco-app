import type { Producto } from '../../types/database'
import { formatPrecio } from '../../lib/utils'

interface FavoritesGridProps {
  productos: Producto[]
  onSelect: (producto: Producto) => void
}

export function FavoritesGrid({ productos, onSelect }: FavoritesGridProps) {
  if (productos.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <p className="font-medium">No hay productos en esta vista.</p>
        <p className="text-xs mt-1">Marcá productos como favoritos desde el Catálogo para verlos acá.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
      {productos.map((prod) => (
        <button
          key={prod.id}
          onClick={() => onSelect(prod)}
          className="flex flex-col items-center justify-center p-3.5 rounded-2xl
            border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-indigo-500 dark:hover:border-indigo-400
            hover:bg-indigo-50/50 dark:hover:bg-indigo-900/30 active:scale-95 active:bg-indigo-100 dark:active:bg-indigo-900/50 transition-all
            min-h-[88px] text-center shadow-xs"
        >
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 leading-tight">
            {prod.descripcion}
          </span>
          <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 mt-1.5">
            {formatPrecio(prod.precio_venta)}
          </span>
          {prod.stock_actual <= prod.stock_minimo && prod.stock_actual > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-medium mt-1">
              Stock bajo ({prod.stock_actual})
            </span>
          )}
          {prod.stock_actual <= 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-bold mt-1">
              Sin stock
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
