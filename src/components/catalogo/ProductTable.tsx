import { useState } from 'react'
import type { Producto, Categoria } from '../../types/database'
import { formatPrecio, nivelStock } from '../../lib/utils'
import { SearchInput } from '../ui/SearchInput'
import { Button } from '../ui/Button'

const stockColors = {
  ok: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
  bajo: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30',
  critico: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30',
  sin_stock: 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950/50 font-bold',
}

const stockLabels = {
  ok: 'OK',
  bajo: 'Bajo',
  critico: 'Crítico',
  sin_stock: 'Sin stock',
}

interface ProductTableProps {
  productos: Producto[]
  categorias: Categoria[]
  busqueda: string
  onBusquedaChange: (valor: string) => void
  categoriaFiltro: string | null
  onCategoriaChange: (id: string | null) => void
  onEditar: (producto: Producto) => void
  onEliminar: (id: string) => void
  onToggleFavorito: (id: string, esFavorito: boolean) => void
  onNuevo: () => void
  cargando: boolean
}

export function ProductTable({
  productos,
  categorias,
  busqueda,
  onBusquedaChange,
  categoriaFiltro,
  onCategoriaChange,
  onEditar,
  onEliminar,
  onToggleFavorito,
  onNuevo,
  cargando,
}: ProductTableProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  return (
    <div>
      {/* Barra de búsqueda y filtros compacta */}
      <div className="flex flex-col sm:flex-row gap-2.5 mb-3.5">
        <div className="flex-1">
          <SearchInput
            placeholder="Buscar por nombre o código..."
            value={busqueda}
            onChange={(e) => onBusquedaChange(e.target.value)}
            onClear={() => onBusquedaChange('')}
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            className="flex-1 sm:flex-initial rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-xs sm:text-sm focus:border-indigo-500 min-h-[36px]"
            value={categoriaFiltro || ''}
            onChange={(e) => onCategoriaChange(e.target.value || null)}
          >
            <option value="">Todas las categorías</option>
            {categorias.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.nombre}</option>
            ))}
          </select>
          <Button size="sm" onClick={onNuevo}>
            + Nuevo
          </Button>
        </div>
      </div>

      {/* Estado de carga */}
      {cargando ? (
        <div className="text-center py-10 text-gray-500 dark:text-gray-400">
          <div className="animate-spin h-7 w-7 border-3 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full mx-auto mb-2" />
          <span className="text-xs">Cargando productos...</span>
        </div>
      ) : productos.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
          <p>{busqueda ? 'No se encontraron productos coincidentes' : 'No hay productos en el catálogo.'}</p>
        </div>
      ) : (
        <>
          {/* VISTA MOBILE: Lista compacta tipo tarjeta (igual a StockPage) */}
          <div className="divide-y divide-gray-100 dark:divide-gray-700 sm:hidden">
            {productos.map((prod) => {
              const nivel = nivelStock(prod.stock_actual, prod.stock_minimo)
              return (
                <div key={prod.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                        {prod.descripcion}
                      </p>
                      {prod.es_favorito && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-bold flex-shrink-0 flex items-center gap-0.5">
                          ★ Fav
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${stockColors[nivel]}`}>
                        Stock: {prod.stock_actual}
                      </span>
                      {prod.categoria && (
                        <span className="truncate max-w-[120px]">
                          {prod.categoria.nombre}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400">
                      {formatPrecio(prod.precio_venta)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onToggleFavorito(prod.id, prod.es_favorito)}
                        className={`text-xs px-2 py-1 rounded-lg border flex items-center gap-1 transition-all ${
                          prod.es_favorito
                            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 font-bold'
                            : 'border-gray-200 dark:border-gray-700 text-gray-400'
                        }`}
                      >
                        <svg className={`w-3.5 h-3.5 ${prod.es_favorito ? 'fill-amber-400 text-amber-500' : 'text-gray-400'}`} viewBox="0 0 24 24" fill={prod.es_favorito ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        <span>{prod.es_favorito ? 'Fav' : '+Fav'}</span>
                      </button>
                      <button
                        onClick={() => onEditar(prod)}
                        className="text-xs text-indigo-600 dark:text-indigo-400 font-medium px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 rounded-md"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setConfirmDelete(prod.id)}
                        className="text-xs text-red-500 dark:text-red-400 font-medium px-2 py-1 bg-red-50 dark:bg-red-900/30 rounded-md"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* VISTA DESKTOP: Tabla limpia y fluida (sin scrollbar horizontal forzado) */}
          <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-600 dark:text-gray-300">Producto</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-600 dark:text-gray-300">Categoría</th>
                  <th className="px-3 py-2.5 text-right font-medium text-gray-600 dark:text-gray-300">Costo</th>
                  <th className="px-3 py-2.5 text-right font-medium text-gray-600 dark:text-gray-300">Venta</th>
                  <th className="px-3 py-2.5 text-center font-medium text-gray-600 dark:text-gray-300">Stock</th>
                  <th className="px-3 py-2.5 text-center font-medium text-gray-600 dark:text-gray-300">Favorito</th>
                  <th className="px-3 py-2.5 text-center font-medium text-gray-600 dark:text-gray-300">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {productos.map((prod) => {
                  const nivel = nivelStock(prod.stock_actual, prod.stock_minimo)
                  return (
                    <tr key={prod.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{prod.descripcion}</span>
                        {prod.codigo_barras && (
                          <span className="block text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                            {prod.codigo_barras}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {prod.categoria ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: prod.categoria.color }} />
                            <span>{prod.categoria.nombre}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-500 dark:text-gray-400 font-mono">
                        {formatPrecio(prod.precio_costo)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-gray-900 dark:text-gray-100 font-mono">
                        {formatPrecio(prod.precio_venta)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${stockColors[nivel]}`}>
                          {prod.stock_actual} ({stockLabels[nivel]})
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => onToggleFavorito(prod.id, prod.es_favorito)}
                          title={prod.es_favorito ? 'Quitar de favoritos del POS' : 'Marcar como favorito para acceso rápido en POS'}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                            prod.es_favorito
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <svg
                            className={`w-3.5 h-3.5 ${prod.es_favorito ? 'fill-amber-400 text-amber-500' : 'text-gray-400'}`}
                            viewBox="0 0 24 24"
                            fill={prod.es_favorito ? 'currentColor' : 'none'}
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                          <span>{prod.es_favorito ? 'Favorito' : 'Marcar'}</span>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onEditar(prod)}
                            className="px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors cursor-pointer"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(prod.id)}
                            className="px-2.5 py-1 text-xs font-medium rounded-md bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors cursor-pointer"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal confirmar eliminación */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 max-w-sm w-full space-y-3 border border-gray-200 dark:border-gray-700">
            <h4 className="font-bold text-gray-900 dark:text-gray-100">¿Eliminar producto?</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">El producto dejará de estar visible en el sistema.</p>
            <div className="flex gap-2 pt-2">
              <Button
                variant="danger"
                fullWidth
                size="sm"
                onClick={() => {
                  onEliminar(confirmDelete)
                  setConfirmDelete(null)
                }}
              >
                Eliminar
              </Button>
              <Button
                variant="secondary"
                fullWidth
                size="sm"
                onClick={() => setConfirmDelete(null)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
