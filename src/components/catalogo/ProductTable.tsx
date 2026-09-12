import { useState } from 'react'
import type { Producto, Categoria } from '../../types/database'
import { formatPrecio, nivelStock } from '../../lib/utils'
import { SearchInput } from '../ui/SearchInput'
import { Button } from '../ui/Button'

const stockColors = {
  ok: 'text-emerald-600 bg-emerald-50',
  bajo: 'text-amber-600 bg-amber-50',
  critico: 'text-red-600 bg-red-50',
  sin_stock: 'text-red-700 bg-red-100 font-bold',
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
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500"
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
        <div className="text-center py-12 text-gray-500">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-3" />
          Cargando productos...
        </div>
      ) : productos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-3">📦</p>
          <p>{busqueda ? 'No se encontraron productos' : 'No hay productos. Creá el primero.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Producto</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">Categoría</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Costo</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Venta</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Stock</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">⭐</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {productos.map((prod) => {
                const nivel = nivelStock(prod.stock_actual, prod.stock_minimo)
                return (
                  <tr key={prod.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{prod.descripcion}</span>
                      {prod.codigo_barras && (
                        <span className="block text-xs text-gray-400 mt-0.5">{prod.codigo_barras}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {prod.categoria ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: prod.categoria.color }} />
                          {prod.categoria.nombre}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatPrecio(prod.precio_costo)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatPrecio(prod.precio_venta)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${stockColors[nivel]}`}>
                        {prod.stock_actual} · {stockLabels[nivel]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => onToggleFavorito(prod.id, prod.es_favorito)}
                        className="text-lg hover:scale-125 transition-transform"
                        title={prod.es_favorito ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                      >
                        {prod.es_favorito ? '⭐' : '☆'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => onEditar(prod)}
                          className="p-1.5 rounded hover:bg-indigo-50 text-indigo-600"
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => setConfirmDelete(prod.id)}
                          className="p-1.5 rounded hover:bg-red-50 text-red-600"
                          title="Eliminar"
                        >
                          🗑️
                        </button>
                      </div>
                      {confirmDelete === prod.id && (
                        <div className="absolute mt-1 bg-white border rounded-lg shadow-lg p-3 z-10">
                          <p className="text-xs text-gray-600 mb-2">¿Confirmar?</p>
                          <div className="flex gap-1">
                            <button
                              onClick={() => { onEliminar(prod.id); setConfirmDelete(null) }}
                              className="px-2 py-1 bg-red-600 text-white rounded text-xs"
                            >
                              Sí
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="px-2 py-1 bg-gray-200 rounded text-xs"
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
      <p className="text-xs text-gray-400 mt-3">
        {productos.length} producto{productos.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}
