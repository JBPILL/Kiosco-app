import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import type { Producto } from '../../types/database'
import { formatPrecio } from '../../lib/utils'
import { SearchInput } from '../ui/SearchInput'

interface ProductSearchProps {
  onSelect: (producto: Producto) => void
}

export function ProductSearch({ onSelect }: ProductSearchProps) {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<Producto[]>([])
  const [mostrarResultados, setMostrarResultados] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Buscar productos mientras se escribe
  const buscar = useCallback(async (texto: string) => {
    if (texto.length < 2) {
      setResultados([])
      return
    }

    const { data } = await supabase
      .from('productos')
      .select('*, categoria:categorias(nombre, color)')
      .eq('activo', true)
      .ilike('descripcion', `%${texto}%`)
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
    onSelect(producto)
    setQuery('')
    setResultados([])
    setMostrarResultados(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, resultados.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && resultados.length > 0) {
      e.preventDefault()
      seleccionar(resultados[selectedIndex])
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
    <div ref={containerRef} className="relative">
      <SearchInput
        ref={inputRef}
        placeholder="Buscar producto..."
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
                <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Stock: {prod.stock_actual}
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
