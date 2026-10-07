import { RefreshButton } from '../ui/RefreshButton'
import { useState, useMemo, useEffect } from 'react'
import type { Producto, Categoria } from '../../types/database'
import { formatPrecio, nivelStock } from '../../lib/utils'
import { SearchInput } from '../ui/SearchInput'
import { Button } from '../ui/Button'
import { useProveedorStore } from '../../stores/proveedorStore'
import { useTenantConfig } from '../../hooks/useTenantConfig'

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
  onPurgarHuerfanos?: () => void
  onSincronizar?: () => void
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
  onPurgarHuerfanos,
  onSincronizar,
}: ProductTableProps) {
  const { tieneEnvases, tieneBalanza, tieneVencimientos } = useTenantConfig()
  const { proveedores, cargarProveedores } = useProveedorStore()
  const [proveedorFiltro, setProveedorFiltro] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('categoria')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    cargarProveedores()
  }, [cargarProveedores])

  const proveedoresMap = useMemo(() => {
    const map = new Map<string, string>()
    proveedores.forEach((p) => map.set(p.id, p.nombre))
    return map
  }, [proveedores])

  const categoriasMap = useMemo(() => {
    const map = new Map<string, Categoria>()
    categorias.forEach((c) => map.set(c.id, c))
    return map
  }, [categorias])

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
    // 0. Ocultar estrictamente productos inactivos (eliminados lógicamente)
    let list = productos.filter((p) => p.activo !== false)

    // 1. Filtrar por categoría
    if (categoriaFiltro) {
      if (categoriaFiltro === '__SIN_CATEGORIA__') {
        list = list.filter((p) => !p.categoria_id && !p.categoria?.id)
      } else {
        const catObj = categorias.find((c) => c.id === categoriaFiltro)
        const catNombreNorm = catObj?.nombre?.toLowerCase().trim()

        list = list.filter((p) => {
          if (p.categoria_id && p.categoria_id === categoriaFiltro) return true
          if (p.categoria?.id && p.categoria.id === categoriaFiltro) return true
          if (catNombreNorm && p.categoria?.nombre && p.categoria.nombre.toLowerCase().trim() === catNombreNorm) return true
          return false
        })
      }
    }

    // 1b. Filtrar por proveedor
    if (proveedorFiltro) {
      list = list.filter((p) => p.proveedor_id === proveedorFiltro)
    }

    const obtenerNombreCategoria = (p: Producto): string => {
      if (p.categoria?.nombre) return p.categoria.nombre
      if (p.categoria_id && categoriasMap.has(p.categoria_id)) {
        return categoriasMap.get(p.categoria_id)!.nombre
      }
      return 'Sin categoría'
    }

    // 2. Filtrar por búsqueda
    if (busqueda && busqueda.trim()) {
      const q = busqueda.toLowerCase().trim()
      list = list.filter((p) => {
        const desc = (p.descripcion || '').toLowerCase()
        const cod = (p.codigo_barras || '').toLowerCase()
        const cat = obtenerNombreCategoria(p).toLowerCase()
        return desc.includes(q) || cod.includes(q) || cat.includes(q)
      })
    }

    // 3. Ordenar
    return [...list].sort((a, b) => {
      let valA: any = ''
      let valB: any = ''

      if (sortField === 'categoria') {
        valA = obtenerNombreCategoria(a).toLowerCase()
        valB = obtenerNombreCategoria(b).toLowerCase()
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
  }, [productos, categoriaFiltro, proveedorFiltro, busqueda, sortField, sortDirection, categorias])

  return (
    <div>
      {/* Barra de búsqueda y filtros compacta */}
      <div className="flex flex-col xl:flex-row gap-3 mb-5 rounded-xl bg-gray-50 dark:bg-gray-900/30 p-3 border border-gray-100 dark:border-gray-700">
        <div className="flex-1">
          <SearchInput
            placeholder="Buscar por nombre o código..."
            value={busqueda}
            onChange={(e) => onBusquedaChange(e.target.value)}
            onClear={() => onBusquedaChange('')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="flex-1 sm:flex-initial rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-xs sm:text-sm focus:border-indigo-500 min-h-[36px]"
            aria-label="Filtrar por categoría"
            value={categoriaFiltro || ''}
            onChange={(e) => onCategoriaChange(e.target.value || null)}
          >
            <option value="">Todas las categorías</option>
            <option value="__SIN_CATEGORIA__">Sin categoría (—)</option>
            {categorias.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.nombre}</option>
            ))}
          </select>

          <select
            className="flex-1 sm:flex-initial rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-xs sm:text-sm focus:border-indigo-500 min-h-[36px]"
            aria-label="Filtrar por proveedor"
            value={proveedorFiltro || ''}
            onChange={(e) => setProveedorFiltro(e.target.value || null)}
          >
            <option value="">Todos los proveedores</option>
            {proveedores.filter((p) => p.activo).map((prov) => (
              <option key={prov.id} value={prov.id}>{prov.nombre}</option>
            ))}
          </select>

          <Button size="sm" onClick={onNuevo} className="whitespace-nowrap flex items-center gap-1.5 font-semibold">
            + Nuevo Producto
          </Button>

          {onSincronizar && (
            <RefreshButton refreshing={cargando} onClick={onSincronizar} label="Actualizar catálogo" />
          )}
        </div>
      </div>

      {/* Banner de depuración cuando se filtran productos huérfanos sin categoría */}
      {categoriaFiltro === '__SIN_CATEGORIA__' && productosFiltradosYOrdenados.length > 0 && (
        <div className="mb-3.5 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="text-xs text-amber-800 dark:text-amber-300">
            <span className="font-bold">{productosFiltradosYOrdenados.length} producto(s) huérfano(s)</span> sin categoría asignada. Podés editarlos para asignarles categoría o eliminarlos directamente.
          </div>
          {onPurgarHuerfanos && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`¿Confirmás la eliminación permanente de todos los ${productosFiltradosYOrdenados.length} productos sin categoría?`)) {
                  onPurgarHuerfanos()
                }
              }}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer self-start sm:self-auto shrink-0 shadow-xs"
            >
              Depurar todos los huérfanos
            </button>
          )}
        </div>
      )}

      {/* Estado de carga */}
      {cargando ? (
        <div className="text-center py-10 text-gray-500 dark:text-gray-400">
          <div className="animate-spin h-7 w-7 border-3 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full mx-auto mb-2" />
          <span className="text-xs">Cargando productos...</span>
        </div>
      ) : productosFiltradosYOrdenados.length === 0 ? (
        <div className="text-center px-4 py-12 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 text-gray-500 dark:text-gray-400 text-sm">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 7 12 2l9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10" /></svg></span>
          <p className="font-medium text-gray-700 dark:text-gray-300">
            {categoriaFiltro === '__SIN_CATEGORIA__'
              ? 'No hay productos huérfanos sin categoría.'
              : categoriaFiltro
              ? `No hay productos cargados en la categoría "${categorias.find((c) => c.id === categoriaFiltro)?.nombre || 'seleccionada'}".`
              : proveedorFiltro
              ? `No hay productos asociados al proveedor "${proveedores.find((p) => p.id === proveedorFiltro)?.nombre || 'seleccionado'}".`
              : busqueda
              ? 'No se encontraron productos coincidentes con la búsqueda.'
              : 'No hay productos en el catálogo.'}
          </p>
          <p className="mt-2 text-xs">{busqueda || categoriaFiltro || proveedorFiltro ? 'Probá otra búsqueda o limpiá los filtros para ampliar el listado.' : 'Creá tu primer producto o importá una lista desde las herramientas del catálogo.'}</p>
          {(busqueda || categoriaFiltro || proveedorFiltro) && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => {
                  onBusquedaChange('')
                  onCategoriaChange(null)
                  setProveedorFiltro(null)
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer"
              >
                Limpiar filtros y ver todos
              </button>
              <Button size="sm" onClick={onNuevo}>
                + Nuevo Producto
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* VISTA MOBILE: Lista compacta tipo tarjeta (igual a StockPage) */}
          <div className="space-y-3 sm:hidden">
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
                      {tieneEnvases && prod.es_retornable && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 font-medium whitespace-nowrap">
                          Retornable (+{formatPrecio(prod.precio_envase || 0)})
                        </span>
                      )}
                      {tieneVencimientos && prod.requiere_vencimiento && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 font-medium whitespace-nowrap">
                          Perecedero ({prod.dias_alerta_vencimiento || 15}d)
                        </span>
                      )}
                      {tieneBalanza && prod.es_pesable && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/60 font-medium whitespace-nowrap">
                          Balanza ({prod.unidad_medida || 'KG'})
                        </span>
                      )}
                      {prod.proveedor_id && proveedoresMap.has(prod.proveedor_id) && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 font-medium whitespace-nowrap">
                          {proveedoresMap.get(prod.proveedor_id)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${stockColors[nivel]}`}>
                        Stock: {prod.stock_actual}
                      </span>
                      {(() => {
                        const cat = prod.categoria || (prod.categoria_id ? categoriasMap.get(prod.categoria_id) : undefined)
                        return cat ? (
                          <span className="inline-flex items-center gap-1 truncate max-w-[140px] whitespace-nowrap">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="truncate">{cat.nombre}</span>
                          </span>
                        ) : null
                      })()}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400 tabular-nums">
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
                        className="inline-flex items-center justify-center text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 transition-all active:scale-95 shadow-2xs whitespace-nowrap cursor-pointer"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(prod.id)}
                        title="Eliminar producto"
                        className="inline-flex items-center justify-center text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800/60 transition-all active:scale-95 shadow-2xs whitespace-nowrap cursor-pointer"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* VISTA DESKTOP: Tabla limpia y fluida */}
          <div className="hidden sm:block overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xs">
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
                          {tieneEnvases && prod.es_retornable && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 font-medium whitespace-nowrap">
                              Retornable (+{formatPrecio(prod.precio_envase || 0)})
                            </span>
                          )}
                          {tieneVencimientos && prod.requiere_vencimiento && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 font-medium whitespace-nowrap">
                              Perecedero ({prod.dias_alerta_vencimiento || 15}d)
                            </span>
                          )}
                          {tieneBalanza && prod.es_pesable && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/60 font-medium whitespace-nowrap">
                              Balanza ({prod.unidad_medida || 'KG'})
                            </span>
                          )}
                          {prod.proveedor_id && proveedoresMap.has(prod.proveedor_id) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 font-medium whitespace-nowrap">
                              {proveedoresMap.get(prod.proveedor_id)}
                            </span>
                          )}
                        </div>
                        {prod.codigo_barras && (
                          <span className="block text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                            {prod.codigo_barras}
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        {(() => {
                          const cat = prod.categoria || (prod.categoria_id ? categoriasMap.get(prod.categoria_id) : undefined)
                          return cat ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-700/80 text-gray-800 dark:text-gray-100 border border-gray-200/60 dark:border-gray-600/60 shadow-2xs whitespace-nowrap">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-2xs" style={{ backgroundColor: cat.color }} />
                              <span className="whitespace-nowrap">{cat.nombre}</span>
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                          )
                        })()}
                      </td>
                      <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${stockColors[nivel]}`}>
                          {prod.stock_actual} ({stockLabels[nivel]})
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-bold text-sm text-gray-900 dark:text-gray-100 tabular-nums whitespace-nowrap">
                        {formatPrecio(prod.precio_venta)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-xs text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
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
                            className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(prod.id)}
                            title="Eliminar producto"
                            className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 dark:bg-black/75 backdrop-blur-xs transition-opacity animate-in fade-in duration-150">
          <div
            role="dialog"
            aria-modal="true"
            className="modal-container bg-white dark:bg-gray-800 rounded-2xl p-5 max-w-sm w-full space-y-3 border border-slate-300 dark:border-gray-700 ring-1 ring-slate-900/15 dark:ring-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          >
            <h4 className="font-bold text-slate-900 dark:text-gray-100">¿Eliminar producto?</h4>
            <p className="text-sm text-slate-600 dark:text-gray-400">El producto dejará de estar visible en el sistema.</p>
            <div className="flex gap-2 pt-2">
              <Button
                variant="danger"
                fullWidth
                size="sm"
                onClick={async () => {
                  const idABorrar = confirmDelete
                  setConfirmDelete(null)
                  if (idABorrar) {
                    await onEliminar(idABorrar)
                  }
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
