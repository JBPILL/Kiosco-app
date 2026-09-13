import { useState, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import type { Producto } from '../../types/database'
import { formatPrecio } from '../../lib/utils'
import { SearchInput } from '../ui/SearchInput'

interface ProductSearchProps {
  onSelect: (producto: Producto) => void
  onOpenScanner?: () => void
}

export function ProductSearch({ onSelect, onOpenScanner }: ProductSearchProps) {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<Producto[]>([])
  const [mostrarResultados, setMostrarResultados] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Escuchar evento global de foco para el atajo F2
  useEffect(() => {
    const handleFocus = () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('pos-focus-search', handleFocus)
    return () => window.removeEventListener('pos-focus-search', handleFocus)
  }, [])

  // Buscar productos mientras se escribe o escanea
  const buscar = useCallback(async (texto: string) => {
    const queryTrim = texto.trim()
    if (queryTrim.length < 2) {
      setResultados([])
      return
    }

    let queryBuilder = supabase
      .from('productos')
      .select('*, categoria:categorias(nombre, color)')
      .eq('activo', true)

    // Si contiene números, buscar también por coincidencia en código de barras
    if (/^\d+$/.test(queryTrim)) {
      queryBuilder = queryBuilder.or(`codigo_barras.ilike.%${queryTrim}%,descripcion.ilike.%${queryTrim}%`)
    } else {
      queryBuilder = queryBuilder.ilike('descripcion', `%${queryTrim}%`)
    }

    const { data } = await queryBuilder
      .order('es_favorito', { ascending: false })
      .limit(8)

    setResultados(data || [])
    setSelectedIndex(0)
  }, [])

  // Debounce de búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      buscar(query)
    }, 200)
    return () => clearTimeout(timer)
  }, [query, buscar])

  const seleccionar = (producto: Producto) => {
    if (producto.stock_actual <= 0) {
      toast.error(`"${producto.descripcion}" no tiene stock disponible (0 unidades)`)
      return
    }
    onSelect(producto)
    setQuery('')
    setResultados([])
    setMostrarResultados(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (resultados.length > 0 && mostrarResultados) {
        setSelectedIndex((prev) => Math.min(prev + 1, resultados.length - 1))
      } else {
        // Si no hay resultados de búsqueda abiertos, bajar el foco a las categorías
        window.dispatchEvent(new CustomEvent('pos-focus-category'))
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && resultados.length > 0) {
      e.preventDefault()
      // Si hay un producto con coincidencia exacta de código de barras, seleccionarlo
      const exactMatch = resultados.find((r) => r.codigo_barras === query.trim())
      seleccionar(exactMatch || resultados[selectedIndex])
    } else if (e.key === 'Escape') {
      setMostrarResultados(false)
    }
  }

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMostrarResultados(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative flex items-center gap-2">
      <div className="flex-1 min-w-0 relative">
        <SearchInput
          ref={inputRef}
          placeholder="Buscar producto o escanear [F2]..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setMostrarResultados(true)
          }}
          onFocus={() => query.length >= 2 && setMostrarResultados(true)}
          onKeyDown={handleKeyDown}
          onClear={() => { setQuery(''); setResultados([]) }}
          autoFocus
        />
      </div>

      {onOpenScanner && (
        <button
          type="button"
          onClick={onOpenScanner}
          className="h-10 px-3.5 flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold flex-shrink-0 active:scale-95 transition-all shadow-xs"
          title="Escanear con cámara (Alt+S)"
        >
          <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <span className="hidden sm:inline">Cámara</span>
        </button>
      )}

      {/* Dropdown de resultados */}
      {mostrarResultados && resultados.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg z-30 max-h-80 overflow-y-auto">
          {resultados.map((prod, idx) => (
            <button
              key={prod.id}
              onClick={() => seleccionar(prod)}
              className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors ${
                idx === selectedIndex ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
              } ${idx < resultados.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}
            >
              <div>
                <span className="font-medium text-gray-900 dark:text-gray-100">{prod.descripcion}</span>
                {prod.categoria && (
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{prod.categoria.nombre}</span>
                )}
                <span className={`block text-xs mt-0.5 ${
                  prod.stock_actual <= 0
                    ? 'text-red-600 dark:text-red-400 font-bold'
                    : prod.stock_actual <= prod.stock_minimo
                    ? 'text-amber-600 dark:text-amber-400 font-medium'
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {prod.stock_actual <= 0 ? 'Sin stock (0)' : `Stock: ${prod.stock_actual}`}
                </span>
              </div>
              <span className="font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap ml-3">
                {formatPrecio(prod.precio_venta)}
              </span>
            </button>
          ))}
        </div>
      )}

      {mostrarResultados && query.length >= 2 && resultados.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg z-30 p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
          No se encontró "{query}"
        </div>
      )}
    </div>
  )
}
