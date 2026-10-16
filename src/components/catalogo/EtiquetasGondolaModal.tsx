import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { GondolaLabel, LABEL_DIMENSIONS } from './GondolaLabel'
import type { FormatoEtiqueta } from './GondolaLabel'
import { formatPrecio } from '../../lib/utils'
import type { Producto, Categoria } from '../../types/database'

interface EtiquetasGondolaModalProps {
  isOpen: boolean
  onClose: () => void
  productos: Producto[]
  categorias: Categoria[]
  kioscoNombre?: string
}


export function EtiquetasGondolaModal({
  isOpen,
  onClose,
  productos,
  categorias,
  kioscoNombre = 'AlPaso POS',
}: EtiquetasGondolaModalProps) {
  const [busqueda, setBusqueda] = useState('')
  const [categoriaId, setCategoriaId] = useState<string>('TODAS')
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [formato, setFormato] = useState<FormatoEtiqueta>('A4')
  const [mostrarCodigo, setMostrarCodigo] = useState(true)
  const [mostrarNegocio, setMostrarNegocio] = useState(true)
  const [mostrarFecha, setMostrarFecha] = useState(true)

  // Filtrado de productos disponibles
  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      // Excluir inactivos o combos si no tienen sentido como producto físico suelto
      if (!p.activo) return false
      if (categoriaId !== 'TODAS' && p.categoria_id !== categoriaId) return false
      if (busqueda.trim()) {
        const query = busqueda.toLowerCase().trim()
        const coincideDesc = p.descripcion.toLowerCase().includes(query)
        const coincideCodigo = p.codigo_barras?.toLowerCase().includes(query)
        return coincideDesc || coincideCodigo
      }
      return true
    })
  }, [productos, categoriaId, busqueda])

  // Manejo de selecciones
  const toggleSeleccionar = (id: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        if (!cantidades[id]) {
          setCantidades((c) => ({ ...c, [id]: 1 }))
        }
      }
      return next
    })
  }

  const seleccionarTodosVisibles = () => {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      const nuevasCantidades = { ...cantidades }
      productosFiltrados.forEach((p) => {
        next.add(p.id)
        if (!nuevasCantidades[p.id]) nuevasCantidades[p.id] = 1
      })
      setCantidades(nuevasCantidades)
      return next
    })
  }

  const deseleccionarTodos = () => {
    setSeleccionados(new Set())
  }

  const cambiarCantidad = (id: string, delta: number) => {
    const actual = cantidades[id] || 1
    const nueva = Math.max(1, Math.min(99, actual + delta))
    setCantidades((prev) => ({ ...prev, [id]: nueva }))
  }

  // Lista expandida de etiquetas a imprimir (considerando cantidades repetidas)
  const etiquetasAImprimir = useMemo(() => {
    const list: Producto[] = []
    productos.forEach((p) => {
      if (seleccionados.has(p.id)) {
        const count = cantidades[p.id] || 1
        for (let i = 0; i < count; i++) {
          list.push(p)
        }
      }
    })
    return list
  }, [productos, seleccionados, cantidades])

  const fechaHoy = useMemo(() => {
    const d = new Date()
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
  }, [])

  const handleImprimir = () => {
    if (etiquetasAImprimir.length === 0) return
    window.print()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Impresión de Etiquetas de Góndola y Precios" size="3xl">
      <div className="flex flex-col gap-4 max-h-[82vh] overflow-hidden">
        {/* Controles de Configuración y Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 text-xs shrink-0">
          {/* Búsqueda y categoría */}
          <div className="md:col-span-5 space-y-2">
            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Buscar Producto</label>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre o código de barras..."
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Filtrar Categoría</label>
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="TODAS">Todas las categorías ({productos.length})</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Formato de papel */}
          <div className="md:col-span-4 space-y-2">
            <label className="block font-semibold text-gray-700 dark:text-gray-300">Formato de Impresión</label>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white dark:hover:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-700">
                <input
                  type="radio"
                  name="formato"
                  checked={formato === 'A4'}
                  onChange={() => setFormato('A4')}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">Hoja A4 (Estantería)</span>
                  <p className="text-[10px] text-gray-500">Grilla 3x8 · 65 × 33 mm · 24 por hoja</p>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white dark:hover:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-700">
                <input
                  type="radio"
                  name="formato"
                  checked={formato === 'TERMICA_58'}
                  onChange={() => setFormato('TERMICA_58')}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">Rollo Térmico 58 mm</span>
                  <p className="text-[10px] text-gray-500">Etiqueta fija de 54 × 40 mm</p>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white dark:hover:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-700">
                <input
                  type="radio"
                  name="formato"
                  checked={formato === 'TERMICA_80'}
                  onChange={() => setFormato('TERMICA_80')}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">Rollo Térmico 80 mm</span>
                  <p className="text-[10px] text-gray-500">Etiqueta fija de 76 × 40 mm</p>
                </div>
              </label>
            </div>
          </div>

          {/* Opciones visuales */}
          <div className="md:col-span-3 space-y-2">
            <label className="block font-semibold text-gray-700 dark:text-gray-300">Elementos Visibles</label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={mostrarCodigo}
                  onChange={(e) => setMostrarCodigo(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Código de Barras</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={mostrarNegocio}
                  onChange={(e) => setMostrarNegocio(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Nombre del Kiosco</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={mostrarFecha}
                  onChange={(e) => setMostrarFecha(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Fecha de Emisión</span>
              </label>
            </div>
          </div>
        </div>

        {/* Panel Principal: Selector de Artículos & Vista Previa */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 overflow-hidden flex-1 min-h-0">
          {/* Selector de Artículos (columna izq) */}
          <div className="md:col-span-6 flex flex-col border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800">
            <div className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-700 text-xs">
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                {seleccionados.size} productos ({etiquetasAImprimir.length} etiquetas)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={seleccionarTodosVisibles}
                  className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium cursor-pointer"
                >
                  Marcar todos
                </button>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <button
                  type="button"
                  onClick={deseleccionarTodos}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 cursor-pointer"
                >
                  Limpiar
                </button>
              </div>
            </div>

            {/* Lista scrollable de productos */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/60 text-xs">
              {productosFiltrados.length === 0 ? (
                <div className="p-6 text-center text-gray-400">No se encontraron productos con ese filtro.</div>
              ) : (
                productosFiltrados.map((p) => {
                  const isChecked = seleccionados.has(p.id)
                  const cant = cantidades[p.id] || 1
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                        isChecked ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSeleccionar(p.id)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 shrink-0"
                        />
                        <div className="min-w-0 pr-2">
                          <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{p.descripcion}</p>
                          <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {formatPrecio(p.precio_venta)}
                            </span>
                            {p.codigo_barras && (
                              <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">
                                {p.codigo_barras}
                              </span>
                            )}
                          </div>
                        </div>
                      </label>

                      {isChecked && (
                        <div className="flex items-center gap-1 shrink-0 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => cambiarCantidad(p.id, -1)}
                            className="w-5 h-5 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-600 rounded"
                          >
                            -
                          </button>
                          <span className="w-6 text-center font-bold text-gray-800 dark:text-gray-200">{cant}</span>
                          <button
                            type="button"
                            onClick={() => cambiarCantidad(p.id, 1)}
                            className="w-5 h-5 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-600 rounded"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Vista Previa en Pantalla (columna der) */}
          <div className="md:col-span-6 flex flex-col border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-gray-100/70 dark:bg-gray-900/70">
            <div className="p-2.5 bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-700 text-xs flex items-center justify-between">
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                Vista previa {formato === 'A4' ? 'Hoja A4 (Grilla)' : 'Rollo Térmico'}
              </span>
              <span className="text-[11px] text-gray-500">
                {etiquetasAImprimir.length} etiqueta{etiquetasAImprimir.length !== 1 ? 's' : ''} a imprimir
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {etiquetasAImprimir.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                  <p className="font-medium text-sm">No hay etiquetas seleccionadas</p>
                  <p className="text-xs mt-1">Marcá los productos en la lista izquierda para previsualizarlos.</p>
                </div>
              ) : (
                <div className="grid justify-center gap-2" style={{ gridTemplateColumns: formato === 'A4' ? 'repeat(auto-fit, 65mm)' : `${LABEL_DIMENSIONS[formato].width}mm` }}>
                  {etiquetasAImprimir.slice(0, 8).map((prod, idx) => (
                    <GondolaLabel key={`${prod.id}-${idx}`} producto={prod} formato={formato}
                      negocio={kioscoNombre} fecha={fechaHoy} mostrarCodigo={mostrarCodigo}
                      mostrarNegocio={mostrarNegocio} mostrarFecha={mostrarFecha} />
                  ))}
                  {etiquetasAImprimir.length > 8 && (
                    <div className="col-span-2 text-center text-xs text-gray-500 py-2">
                      ... y {etiquetasAImprimir.length - 8} etiqueta(s) más para imprimir.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer con Acciones */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Escala de impresión: 100%, sin ajustar. Total: <strong className="text-indigo-600 dark:text-indigo-400">{etiquetasAImprimir.length}</strong> etiquetas
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleImprimir}
              disabled={etiquetasAImprimir.length === 0}
              className="flex items-center gap-1.5 shadow-xs font-semibold"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>Imprimir {etiquetasAImprimir.length > 0 ? `(${etiquetasAImprimir.length})` : ''}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Preview and printed output use the same fixed-size card. */}
      {createPortal(<div id="printable-etiquetas" className="hidden">
        {formato === 'A4' ? Array.from({ length: Math.ceil(etiquetasAImprimir.length / 24) }, (_, page) => (
          <div key={page} className="page-a4-labels">
            {etiquetasAImprimir.slice(page * 24, (page + 1) * 24).map((prod, idx) => (
              <GondolaLabel key={`print-${page}-${idx}`} producto={prod} formato={formato}
                negocio={kioscoNombre} fecha={fechaHoy} mostrarCodigo={mostrarCodigo}
                mostrarNegocio={mostrarNegocio} mostrarFecha={mostrarFecha} />
            ))}
          </div>
        )) : <div className="thermal-labels">
          {etiquetasAImprimir.map((prod, idx) => (
            <GondolaLabel key={`print-${idx}`} producto={prod} formato={formato}
              negocio={kioscoNombre} fecha={fechaHoy} mostrarCodigo={mostrarCodigo}
              mostrarNegocio={mostrarNegocio} mostrarFecha={mostrarFecha} />
          ))}
        </div>}
      </div>, document.body)}
      <style>{`
        @media print {
          body > *:not(#printable-etiquetas) { display: none !important; }
          html, body { height: auto !important; overflow: visible !important; }
          #printable-etiquetas [data-label-hidden="true"],
          #printable-etiquetas [data-label-hidden="true"] * { visibility: hidden !important; }
          #printable-etiquetas {
            display: block !important;
            position: static !important;
            width: ${formato === 'A4' ? '200mm' : formato === 'TERMICA_58' ? '58mm' : '80mm'} !important;
            margin: 0 !important; padding: 0 !important;
            background: #fff !important; color: #111 !important;
          }
          @page { size: ${formato === 'A4' ? 'A4 portrait' : formato === 'TERMICA_58' ? '58mm 40mm' : '80mm 40mm'}; margin: ${formato === 'A4' ? '5mm' : '0'}; }
          .page-a4-labels {
            display: grid !important;
            grid-template-columns: repeat(3, 65mm) !important;
            grid-auto-rows: 33mm !important;
            gap: 2.5mm !important;
            width: 200mm !important;
            break-after: page;
          }
          .page-a4-labels:last-child { break-after: auto; }
          .thermal-labels { padding: 0 2mm; }
          .thermal-labels .gondola-label { break-after: page; }
          .thermal-labels .gondola-label:last-child { break-after: auto; }
        }
      `}</style>
    </Modal>
  )
}
