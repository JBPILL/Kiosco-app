import type { Producto } from '../../types/database'
import { formatPrecio } from '../../lib/utils'

interface FavoritesGridProps {
  productos: Producto[]
  onSelect: (producto: Producto) => void
}

export function FavoritesGrid({ productos, onSelect }: FavoritesGridProps) {
  if (productos.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400 text-sm">
        <p>No hay favoritos marcados.</p>
        <p>Marcá productos como ⭐ desde el Catálogo.</p>
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
            border-2 border-gray-200 bg-white hover:border-indigo-400
            hover:bg-indigo-50 active:bg-indigo-100 transition-all
            min-h-[80px] text-center"
        >
          <span className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight">
            {prod.descripcion}
          </span>
          <span className="text-xs font-bold text-indigo-600 mt-1">
            {formatPrecio(prod.precio_venta)}
          </span>
          {prod.stock_actual <= prod.stock_minimo && prod.stock_actual > 0 && (
            <span className="text-[10px] text-amber-600 mt-0.5">Stock bajo</span>
          )}
          {prod.stock_actual <= 0 && (
            <span className="text-[10px] text-red-600 font-bold mt-0.5">Sin stock</span>
          )}
        </button>
      ))}
    </div>
  )
}
