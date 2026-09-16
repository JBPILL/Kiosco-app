import { useState, useMemo } from 'react'
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

type SortField = 'descripcion' | 'categoria' | 'stock' | 'precio_venta' | 'precio_costo'

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
  const [sortField, setSortField] = useState<SortField>('categoria')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <span className="text-gray-300 dark:text-gray-600 text-xs font-mono select-none">↕</span>
    }
    return (
      <span className="text-indigo-600 dark:text-indigo-400 text-xs font-bold font-mono select-none">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  const productosFiltradosYOrdenados = useMemo(() => {
    // 1. Filtrar por categoría
    let list = productos
    if (categoriaFiltro) {
      list = list.filter(
        (p) => p.categoria_id === categoriaFiltro || p.categoria?.id === categoriaFiltro
      )
    }

    // 2. Filtrar por búsqueda
    if (busqueda && busqueda.trim()) {
      const q = busqueda.toLowerCase().trim()
      list = list.filter((p) => {
        const desc = (p.descripcion || '').toLowerCase()
        const cod = (p.codigo_barras || '').toLowerCase()
        const cat = (p.categoria?.nombre || '').toLowerCase()
        return desc.includes(q) || cod.includes(q) || cat.includes(q)
      })
    }

    // 3. Ordenar
    return [...list].sort((a, b) => {
      let valA: any = ''
      let valB: any = ''

      if (sortField === 'categoria') {
        valA = a.categoria?.nombre?.toLowerCase() || 'zzz'
        valB = b.categoria?.nombre?.toLowerCase() || 'zzz'
        if (valA === valB) {
          return a.descripcion.localeCompare(b.descripcion)
        }
      } else if (sortField === 'descripcion') {
        valA = a.descripcion.toLowerCase()
        valB = b.descripcion.toLowerCase()
      } else if (sortField === 'stock') {
        valA = a.stock_actual
        valB = b.stock_actual
      } else if (sortField === 'precio_venta') {
        valA = a.precio_venta
        valB = b.precio_venta
      } else if (sortField === 'precio_costo') {
        valA = a.precio_costo
        valB = b.precio_costo
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [productos, categoriaFiltro, busqueda, sortField, sortDirection])

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
      ) : productosFiltradosYOrdenados.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
          <p>
            {busqueda || categoriaFiltro
              ? 'No se encontraron productos coincidentes con los filtros seleccionados.'
              : 'No hay productos en el catálogo.'}
          </p>
          {(busqueda || categoriaFiltro) && (
            <button
              type="button"
              onClick={() => {
                onBusquedaChange('')
                onCategoriaChange(null)
              }}
              className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          {/* VISTA MOBILE: Lista compacta tipo tarjeta (igual a StockPage) */}
          <div className="divide-y divide-gray-100 dark:divide-gray-700 sm:hidden">
            {productosFiltradosYOrdenados.map((prod) => {
              const nivel = nivelStock(prod.stock_actual, prod.stock_minimo)
              return (
                <div key={prod.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
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
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${stockColors[nivel]}`}>
                        Stock: {prod.stock_actual}
                      </span>
                      {prod.categoria && (
                        <span className="inline-flex items-center gap-1 truncate max-w-[140px] whitespace-nowrap">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: prod.categoria.color }} />
                          <span className="truncate">{prod.categoria.nombre}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400 font-mono">
                      {formatPrecio(prod.precio_venta)}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
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
                        type="button"
                        onClick={() => onEditar(prod)}
                        title="Editar producto"
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 transition-all active:scale-95 shadow-2xs"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(prod.id)}
                        title="Eliminar producto"
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800/60 transition-all active:scale-95 shadow-2xs"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* VISTA DESKTOP: Tabla limpia y fluida */}
          <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 shadow-2xs">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th
                    onClick={() => handleSort('descripcion')}
                    className="px-3.5 py-2.5 text-left font-semibold text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none transition-colors"
                  >
                    <div className="inline-flex items-center gap-1.5">
                      <span>Producto</span>
                      {renderSortIcon('descripcion')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('categoria')}
                    className="px-3.5 py-2.5 text-left font-semibold text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none transition-colors whitespace-nowrap"
                  >
                    <div className="inline-flex items-center gap-1.5">
                      <span>Categoría</span>
                      {renderSortIcon('categoria')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('stock')}
                    className="px-3.5 py-2.5 text-center font-semibold text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none transition-colors whitespace-nowrap"
                  >
                    <div className="inline-flex items-center justify-center gap-1.5">
                      <span>Stock</span>
                      {renderSortIcon('stock')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('precio_venta')}
                    className="px-3.5 py-2.5 text-right font-semibold text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none transition-colors whitespace-nowrap"
                  >
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <span>Precio Venta</span>
                      {renderSortIcon('precio_venta')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('precio_costo')}
                    className="px-3.5 py-2.5 text-right font-semibold text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none transition-colors whitespace-nowrap"
                  >
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <span>Costo</span>
                      {renderSortIcon('precio_costo')}
                    </div>
                  </th>
                  <th className="px-3.5 py-2.5 text-center font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">
                    Favorito
                  </th>
                  <th className="px-3.5 py-2.5 text-center font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {productosFiltradosYOrdenados.map((prod) => {
                  const nivel = nivelStock(prod.stock_actual, prod.stock_minimo)
                  return (
                    <tr key={prod.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors">
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">{prod.descripcion}</span>
                        </div>
                        {prod.codigo_barras && (
                          <span className="block text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                            {prod.codigo_barras}
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        {prod.categoria ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-700/80 text-gray-800 dark:text-gray-100 border border-gray-200/60 dark:border-gray-600/60 shadow-2xs whitespace-nowrap">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-2xs" style={{ backgroundColor: prod.categoria.color }} />
                            <span className="whitespace-nowrap">{prod.categoria.nombre}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${stockColors[nivel]}`}>
                          {prod.stock_actual} ({stockLabels[nivel]})
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-bold text-sm text-gray-900 dark:text-gray-100 font-mono whitespace-nowrap">
                        {formatPrecio(prod.precio_venta)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">
                        {formatPrecio(prod.precio_costo)}
                      </td>
                      <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onToggleFavorito(prod.id, prod.es_favorito)}
                          title={prod.es_favorito ? 'Quitar de favoritos del POS' : 'Marcar como favorito para acceso rápido en POS'}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
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
                      <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onEditar(prod)}
                            title="Editar producto"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(prod.id)}
                            title="Eliminar producto"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <line x1="10" y1="11" x2="10" y2="17" />
                              <line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
                            <span>Eliminar</span>
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
