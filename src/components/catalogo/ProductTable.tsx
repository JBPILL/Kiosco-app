import { useState } from 'react'
import type { Producto, Categoria } from '../../types/database'
import { formatPrecio, nivelStock } from '../../lib/utils'
import { SearchInput } from '../ui/SearchInput'
import { Button } from '../ui/Button'

const stockColors = {
  ok: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30',
  bajo: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30',
  critico: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30',
  sin_stock: 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/50 font-bold',
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
      {/* Barra de búsqueda y filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <SearchInput
            placeholder="Buscar producto..."
            value={busqueda}
            onChange={(e) => onBusquedaChange(e.target.value)}
            onClear={() => onBusquedaChange('')}
          />
        </div>
        <div className="flex gap-2">
          <select
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-indigo-500"
            value={categoriaFiltro || ''}
            onChange={(e) => onCategoriaChange(e.target.value || null)}
          >
            <option value="">Todas las categorías</option>
            {categorias.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.nombre}</option>
            ))}
          </select>
          <Button onClick={onNuevo}>+ Nuevo</Button>
        </div>
      </div>

      {/* Tabla de productos */}
      {cargando ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full mx-auto mb-3" />
          Cargando productos...
        </div>
      ) : productos.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p>{busqueda ? 'No se encontraron productos' : 'No hay productos. Creá el primero.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Producto</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300 hidden sm:table-cell">Categoría</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Costo</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Venta</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Stock</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Fav</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {productos.map((prod) => {
                const nivel = nivelStock(prod.stock_actual, prod.stock_minimo)
                return (
                  <tr key={prod.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{prod.descripcion}</span>
                      {prod.codigo_barras && (
                        <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">{prod.codigo_barras}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {prod.categoria ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: prod.categoria.color }} />
                          {prod.categoria.nombre}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{formatPrecio(prod.precio_costo)}</td>
                    <td className="px-4 py-3 text-right font-medium dark:text-gray-100">{formatPrecio(prod.precio_venta)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${stockColors[nivel]}`}>
                        {prod.stock_actual} · {stockLabels[nivel]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => onToggleFavorito(prod.id, prod.es_favorito)}
                        className="text-sm font-medium dark:text-gray-100 hover:scale-110 transition-transform"
                        title={prod.es_favorito ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                      >
                        {prod.es_favorito ? 'Fav' : '—'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => onEditar(prod)}
                          className="p-1.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs"
                          title="Editar"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setConfirmDelete(prod.id)}
                          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 text-xs"
                          title="Eliminar"
                        >
                          Eliminar
                        </button>
                      </div>
                      {confirmDelete === prod.id && (
                        <div className="absolute mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg p-3 z-10 right-4 sm:right-auto">
                          <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">¿Confirmar?</p>
                          <div className="flex gap-1">
                            <button
                              onClick={() => { onEliminar(prod.id); setConfirmDelete(null) }}
                              className="px-2 py-1 bg-red-600 text-white rounded text-xs"
                            >
                              Sí
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="px-2 py-1 bg-gray-200 dark:bg-gray-700 dark:text-white rounded text-xs"
                            >
                              No
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Contador */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
        {productos.length} producto{productos.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}
