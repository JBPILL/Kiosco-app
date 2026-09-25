import { useState, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import type { Producto } from '../../types/database'
import { formatPrecio } from '../../lib/utils'
import { SearchInput } from '../ui/SearchInput'
import { buscarProductoPorCodigoBalanza } from '../../lib/barcodeParser'
import { useCartStore } from '../../stores/cartStore'
import { useAuthStore } from '../../stores/authStore'

interface ProductSearchProps {
  onSelect: (producto: Producto, cantidad?: number) => void
  onOpenScanner?: () => void
}

export function ProductSearch({ onSelect, onOpenScanner }: ProductSearchProps) {
  const { usuario, kiosco } = useAuthStore()
  const kioscoId = usuario?.kiosco_id || kiosco?.id
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
    }
    window.addEventListener('pos-focus-search', handleFocus)
    return () => window.removeEventListener('pos-focus-search', handleFocus)
  }, [])

  // Buscar productos
  const buscar = useCallback(async (texto: string) => {
    if (!texto.trim()) {
      setResultados([])
      setMostrarResultados(false)
      return
    }

    const q = texto.trim()

    // 1. Intentar buscar primero en la caché local para respuesta instantánea (< 2ms)
    let locales: Producto[] = []
    try {
      const cached = localStorage.getItem('kiosko_cache_productos')
      if (cached) {
        locales = JSON.parse(cached)
      }
    } catch {}

    if (locales.length > 0) {
      const qLower = q.toLowerCase()
      const matches = locales.filter((p) => {
        if (!p.activo) return false
        if (kioscoId && p.kiosco_id && p.kiosco_id !== kioscoId) return false
        const matchDesc = p.descripcion.toLowerCase().includes(qLower)
        const matchCode = p.codigo_barras?.toLowerCase().includes(qLower) || false
        const matchPlu = p.plu_balanza?.toLowerCase().includes(qLower) || false
        return matchDesc || matchCode || matchPlu
      }).slice(0, 8)

      if (matches.length > 0) {
        setResultados(matches)
        setSelectedIndex(0)
        setMostrarResultados(true)
        return
      }
    }

    // 2. Si no hubo coincidencias en memoria local o no hay caché, consultar Supabase
    // Sanitizar caracteres que rompen la sintaxis URL/or() de PostgREST (, () \ %)
    const qSanitized = q.replace(/[,()\\%]/g, ' ').trim()
    if (!qSanitized) {
      setResultados([])
      setMostrarResultados(false)
      return
    }

    let querySupa = supabase
      .from('productos')
      .select('*, categoria:categorias(nombre, color)')
      .eq('activo', true)
      .or(`descripcion.ilike.%${qSanitized}%,codigo_barras.ilike.%${qSanitized}%,plu_balanza.ilike.%${qSanitized}%`)
      .limit(8)

    if (kioscoId) {
      querySupa = querySupa.eq('kiosco_id', kioscoId)
    }

    const { data } = await querySupa

    setResultados(data || [])
    setSelectedIndex(0)
    setMostrarResultados(true)
  }, [kioscoId])

  // Debounce de búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      buscar(query)
    }, 150)
    return () => clearTimeout(timer)
  }, [query, buscar])

  const seleccionar = (producto: Producto) => {
    const itemEnTicket = useCartStore.getState().items.find((it) => it.producto.id === producto.id)
    const cantEnTicket = itemEnTicket ? itemEnTicket.cantidad : 0
    const tieneStockLimitado = !producto.es_pesable && producto.stock_actual > 0 && producto.stock_actual !== 99999

    if (tieneStockLimitado && cantEnTicket >= producto.stock_actual) {
      toast.error(
        `Stock máximo alcanzado: Ya tenés el total (${producto.stock_actual} u.) de "${producto.descripcion}" en el ticket.`,
        { id: `search-stock-${producto.id}` }
      )
      return
    }

    if (producto.stock_actual <= 0) {
      toast(`Aviso: "${producto.descripcion}" figura con stock 0 (se registrará con stock negativo)`, { duration: 3500 })
    }
    onSelect(producto)
    setQuery('')
    setResultados([])
    setMostrarResultados(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = async (e: React.KeyboardEvent) => {
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
    } else if (e.key === 'Tab' && mostrarResultados && resultados.length > 0) {
      // Permitir que Tab navegue por los resultados si la lista está abierta
      if (!e.shiftKey) {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % resultados.length)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const queryTrim = query.trim()
      if (!queryTrim) return

      // 1. Chequear si es código de balanza comercial (EAN-13 con prefijo 20 o 02)
      let todosLocales: Producto[] = []
      try {
        const cached = localStorage.getItem('kiosko_cache_productos')
        if (cached) todosLocales = JSON.parse(cached)
      } catch {}

      const matchBalanza = buscarProductoPorCodigoBalanza(queryTrim, todosLocales.length > 0 ? todosLocales : resultados)
      if (matchBalanza) {
        onSelect(matchBalanza.producto, matchBalanza.pesoKg)
        setQuery('')
        setResultados([])
        setMostrarResultados(false)
        return
      }

      // 2. Coincidencia inmediata en memoria/caché local (vital para lectores de código de barras rápidos)
      if (todosLocales.length > 0) {
        const exactLocal = todosLocales.find(
          (p) => p.activo && (p.codigo_barras === queryTrim || p.plu_balanza === queryTrim)
        )
        if (exactLocal) {
          seleccionar(exactLocal)
          return
        }
      }

      // 3. Coincidencia exacta en resultados ya filtrados
      if (resultados.length > 0) {
        const exactMatch = resultados.find(
          (r) => r.codigo_barras === queryTrim || r.plu_balanza === queryTrim
        )
        if (exactMatch) {
          seleccionar(exactMatch)
          return
        }
      }

      // 4. Si el lector disparó Enter antes de que terminara el debounce y no estaba en caché, buscar directo en Supabase
      const qSanitized = queryTrim.replace(/[,()\\%]/g, ' ').trim()
      if (qSanitized) {
        let queryDirecta = supabase
          .from('productos')
          .select('*, categoria:categorias(nombre, color)')
          .eq('activo', true)
          .or(`codigo_barras.eq.${qSanitized},plu_balanza.eq.${qSanitized}`)
          .limit(1)

        if (kioscoId) {
          queryDirecta = queryDirecta.eq('kiosco_id', kioscoId)
        }

        const { data: supaMatches } = await queryDirecta
        if (supaMatches && supaMatches.length > 0) {
          seleccionar(supaMatches[0])
          return
        }
      }

      // 5. Fallback a navegación de lista por índice si no es código exacto
      if (resultados.length > 0) {
        seleccionar(resultados[selectedIndex])
      }
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
          placeholder="Escribí el nombre del producto o pasá el código de barras..."
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
          className="sm:hidden h-10 px-3 flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold flex-shrink-0 active:scale-95 transition-all shadow-xs"
          title="Escanear con cámara"
        >
          <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </button>
      )}

      {/* Dropdown de resultados */}
      {mostrarResultados && resultados.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg z-30 max-h-80 overflow-y-auto">
          {resultados.map((prod, idx) => {
            const itemEnTicket = useCartStore.getState().items.find((it) => it.producto.id === prod.id)
            const cantEnTicket = itemEnTicket ? itemEnTicket.cantidad : 0
            const tieneStockLimitado = !prod.es_pesable && prod.stock_actual > 0 && prod.stock_actual !== 99999
            const stockMaxAlcanzado = tieneStockLimitado && cantEnTicket >= prod.stock_actual

            return (
              <button
                key={prod.id}
                onClick={() => seleccionar(prod)}
                className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors ${
                  idx === selectedIndex ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
                } ${stockMaxAlcanzado ? 'opacity-60 bg-amber-50/40 dark:bg-amber-950/20' : ''} ${idx < resultados.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}
              >
                <div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{prod.descripcion}</span>
                  {prod.categoria && (
                    <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{prod.categoria.nombre}</span>
                  )}
                  {cantEnTicket > 0 && (
                    <span className="ml-2 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                      {cantEnTicket} en ticket
                    </span>
                  )}
                  <span className={`block text-xs mt-0.5 ${
                    prod.stock_actual <= 0
                      ? 'text-red-600 dark:text-red-400 font-bold'
                      : stockMaxAlcanzado
                      ? 'text-amber-600 dark:text-amber-400 font-bold'
                      : prod.stock_actual <= prod.stock_minimo
                      ? 'text-amber-600 dark:text-amber-400 font-medium'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {prod.stock_actual <= 0
                      ? 'Sin stock (0)'
                      : stockMaxAlcanzado
                      ? `Máximo en ticket (${prod.stock_actual} u.)`
                      : `Stock: ${prod.stock_actual}`}
                  </span>
                </div>
                <span className="font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap ml-3">
                  {formatPrecio(prod.precio_venta)}
                </span>
              </button>
            )
          })}
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
