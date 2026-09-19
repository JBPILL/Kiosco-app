import { useState, useMemo, useRef } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { BarcodeSvg } from '../../lib/barcodeSvg'
import { formatPrecio } from '../../lib/utils'
import type { Producto, Categoria } from '../../types/database'

interface EtiquetasGondolaModalProps {
  isOpen: boolean
  onClose: () => void
  productos: Producto[]
  categorias: Categoria[]
  kioscoNombre?: string
}

type FormatoEtiqueta = 'A4' | 'TERMICA_58' | 'TERMICA_80'

export function EtiquetasGondolaModal({
  isOpen,
  onClose,
  productos,
  categorias,
  kioscoNombre = 'KioskoPOS',
}: EtiquetasGondolaModalProps) {
  const [busqueda, setBusqueda] = useState('')
  const [categoriaId, setCategoriaId] = useState<string>('TODAS')
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [formato, setFormato] = useState<FormatoEtiqueta>('A4')
  const [mostrarCodigo, setMostrarCodigo] = useState(true)
  const [mostrarNegocio, setMostrarNegocio] = useState(true)
  const [mostrarFecha, setMostrarFecha] = useState(true)

  const printContainerRef = useRef<HTMLDivElement>(null)

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
                  <p className="text-[10px] text-gray-500">Grilla 3x8 (24 etiquetas por carilla)</p>
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
                  <p className="text-[10px] text-gray-500">Etiqueta individual continua</p>
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
                  <p className="text-[10px] text-gray-500">Etiqueta ancha góndola</p>
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
                <div
                  className={
                    formato === 'A4'
                      ? 'grid grid-cols-2 gap-2'
                      : 'flex flex-col items-center gap-2 max-w-[280px] mx-auto'
                  }
                >
                  {etiquetasAImprimir.slice(0, 8).map((prod, idx) => (
                    <div
                      key={`${prod.id}-${idx}`}
                      className="bg-white text-gray-900 p-2 rounded border border-gray-300 shadow-xs flex flex-col justify-between select-none"
                      style={{ minHeight: '110px' }}
                    >
                      {mostrarNegocio && (
                        <div className="text-[9px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100 pb-0.5 truncate">
                          {kioscoNombre}
                        </div>
                      )}
                      <div className="my-1">
                        <div className="font-bold text-xs leading-tight text-gray-900 line-clamp-2">
                          {prod.descripcion}
                        </div>
                        <div className="text-right font-black text-xl text-black tracking-tight mt-0.5">
                          {formatPrecio(prod.precio_venta)}
                          {prod.es_pesable && prod.unidad_medida && (
                            <span className="text-[10px] font-normal text-gray-600 ml-1">/{prod.unidad_medida}</span>
                          )}
                        </div>
                      </div>

                      <div className="mt-auto pt-1 border-t border-gray-100 flex flex-col items-center">
                        {mostrarCodigo && (
                          <div className="w-full max-w-[140px] flex flex-col items-center">
                            <BarcodeSvg
                              value={prod.codigo_barras || prod.id.slice(0, 8).toUpperCase()}
                              height={24}
                              className="w-full"
                            />
                            <span className="font-mono text-[8px] text-gray-600 tracking-wider">
                              {prod.codigo_barras || prod.id.slice(0, 8).toUpperCase()}
                            </span>
                          </div>
                        )}
                        {mostrarFecha && (
                          <div className="w-full text-right text-[8px] text-gray-400 mt-0.5">{fechaHoy}</div>
                        )}
                      </div>
                    </div>
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
            Total a imprimir: <strong className="text-indigo-600 dark:text-indigo-400">{etiquetasAImprimir.length}</strong> etiquetas
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

      {/* CONTENEDOR EXCLUSIVO PARA IMPRESIÓN (visible únicamente al disparar window.print()) */}
      <div
        ref={printContainerRef}
        id="printable-etiquetas"
        className="hidden"
      >
        <div
          className={
            formato === 'A4'
              ? 'grid-a4-labels'
              : formato === 'TERMICA_80'
              ? 'flex-termica-80'
              : 'flex-termica-58'
          }
        >
          {etiquetasAImprimir.map((prod, idx) => (
            <div
              key={`print-${prod.id}-${idx}`}
              className={`etiqueta-card ${formato === 'A4' ? 'card-a4' : 'card-termica'}`}
            >
              {mostrarNegocio && (
                <div className="etiqueta-header">
                  {kioscoNombre}
                </div>
              )}

              <div className="etiqueta-body">
                <div className="etiqueta-descripcion">
                  {prod.descripcion}
                </div>
                <div className="etiqueta-precio">
                  {formatPrecio(prod.precio_venta)}
                  {prod.es_pesable && prod.unidad_medida && (
                    <span className="etiqueta-unidad">/{prod.unidad_medida}</span>
                  )}
                </div>
              </div>

              <div className="etiqueta-footer">
                {mostrarCodigo && (
                  <div className="etiqueta-barcode-box">
                    <BarcodeSvg
                      value={prod.codigo_barras || prod.id.slice(0, 8).toUpperCase()}
                      height={26}
                    />
                    <div className="etiqueta-codigo-texto">
                      {prod.codigo_barras || prod.id.slice(0, 8).toUpperCase()}
                    </div>
                  </div>
                )}
                {mostrarFecha && (
                  <div className="etiqueta-fecha">{fechaHoy}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ESTILOS CSS AISLADOS PARA IMPRESIÓN */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-etiquetas, #printable-etiquetas * {
            visibility: visible !important;
          }
          #printable-etiquetas {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: ${formato === 'A4' ? '5mm' : '2mm'} !important;
            background: white !important;
            color: black !important;
          }

          @page {
            margin: ${formato === 'A4' ? '5mm' : '1mm'};
            size: auto;
          }

          /* Grilla estándar A4: 3 columnas x 8 filas (24 por carilla) */
          .grid-a4-labels {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 2.5mm !important;
            width: 100% !important;
          }

          .card-a4 {
            width: 100% !important;
            min-height: 33mm !important;
            max-height: 35mm !important;
            border: 0.5pt dashed #777 !important;
            padding: 2mm !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* Formato térmico continuo */
          .flex-termica-58 {
            display: flex !important;
            flex-direction: column !important;
            width: 54mm !important;
            margin: 0 auto !important;
          }

          .flex-termica-80 {
            display: flex !important;
            flex-direction: column !important;
            width: 76mm !important;
            margin: 0 auto !important;
          }

          .card-termica {
            width: 100% !important;
            border-bottom: 1pt dashed #444 !important;
            padding: 3mm 1mm !important;
            margin-bottom: 2mm !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .etiqueta-header {
            font-size: 7pt !important;
            font-weight: 700 !important;
            text-transform: uppercase !important;
            color: #333 !important;
            border-bottom: 0.5pt solid #ccc !important;
            padding-bottom: 1mm !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }

          .etiqueta-body {
            margin: 1.5mm 0 !important;
          }

          .etiqueta-descripcion {
            font-size: 9pt !important;
            font-weight: 800 !important;
            line-height: 1.15 !important;
            color: #000 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
          }

          .etiqueta-precio {
            font-size: 16pt !important;
            font-weight: 900 !important;
            text-align: right !important;
            line-height: 1 !important;
            margin-top: 1mm !important;
            color: #000 !important;
            letter-spacing: -0.5px !important;
          }

          .etiqueta-unidad {
            font-size: 7pt !important;
            font-weight: 400 !important;
            margin-left: 1mm !important;
          }

          .etiqueta-footer {
            margin-top: auto !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
          }

          .etiqueta-barcode-box {
            width: 80% !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
          }

          .etiqueta-codigo-texto {
            font-family: monospace !important;
            font-size: 7pt !important;
            color: #111 !important;
            margin-top: 0.5mm !important;
            letter-spacing: 1px !important;
          }

          .etiqueta-fecha {
            width: 100% !important;
            text-align: right !important;
            font-size: 6pt !important;
            color: #555 !important;
          }
        }
      `}</style>
    </Modal>
  )
}
