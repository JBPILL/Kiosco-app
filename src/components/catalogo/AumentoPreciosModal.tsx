import { useState, useMemo, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { supabase } from '../../lib/supabase'
import { formatPrecio, getCachedProductos, saveCachedProductos } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'
import type { Producto, Categoria } from '../../types/database'
import { useProveedorStore } from '../../stores/proveedorStore'
import toast from 'react-hot-toast'

interface AumentoPreciosModalProps {
  isOpen: boolean
  onClose: () => void
  categorias: Categoria[]
  productos: Producto[]
  onAumentoAplicado: () => Promise<void> | void
}

type TipoRedondeo = 'NINGUNO' | '50' | '100'

export function AumentoPreciosModal({
  isOpen,
  onClose,
  categorias,
  productos,
  onAumentoAplicado,
}: AumentoPreciosModalProps) {
  const { proveedores, cargarProveedores } = useProveedorStore()
  const [criterioFiltro, setCriterioFiltro] = useState<'CATEGORIA' | 'PROVEEDOR' | 'TODOS'>('CATEGORIA')
  const [categoriaId, setCategoriaId] = useState<string>('TODAS')
  const [proveedorId, setProveedorId] = useState<string>('TODOS')
  const [porcentaje, setPorcentaje] = useState<number>(10)
  const [porcentajeInput, setPorcentajeInput] = useState<string>('10')
  const [tipoPrecio, setTipoPrecio] = useState<'VENTA' | 'COSTO_Y_VENTA'>('VENTA')
  const [redondeo, setRedondeo] = useState<TipoRedondeo>('100')
  const [procesando, setProcesando] = useState(false)

  useEffect(() => {
    if (isOpen) {
      cargarProveedores()
      setPorcentaje(10)
      setPorcentajeInput('10')
    }
  }, [isOpen, cargarProveedores])

  const handlePorcentajeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Permitir dígitos y una sola coma o punto
    const raw = e.target.value.replace(/[^0-9.,]/g, '')
    const parts = raw.split(/[.,]/)
    let formatted = parts[0]
    if (parts.length > 1) {
      // Permitir hasta 2 decimales después de la coma
      formatted += ',' + parts.slice(1).join('').slice(0, 2)
    }

    setPorcentajeInput(formatted)

    const normalized = formatted.replace(',', '.')
    const parsed = parseFloat(normalized)
    if (!isNaN(parsed) && parsed >= 0) {
      setPorcentaje(parsed)
    } else {
      setPorcentaje(0)
    }
  }

  const handlePorcentajeBlur = () => {
    if (porcentajeInput.endsWith(',') || porcentajeInput.endsWith('.')) {
      const cleaned = porcentajeInput.slice(0, -1)
      setPorcentajeInput(cleaned)
    }
    if (!porcentajeInput || porcentaje <= 0) {
      setPorcentaje(1)
      setPorcentajeInput('1')
    }
  }

  // Función para calcular nuevo precio aplicando incremento y regla de redondeo
  const calcularNuevo = (precio: number, pct: number, reg: TipoRedondeo): number => {
    if (precio <= 0) return 0
    let calc = precio * (1 + pct / 100)
    if (reg === '50') {
      calc = Math.round(calc / 50) * 50
    } else if (reg === '100') {
      calc = Math.round(calc / 100) * 100
    } else {
      calc = Math.round(calc)
    }
    return Math.max(0, calc)
  }

  // Filtrar productos afectados
  const productosAfectados = useMemo(() => {
    return productos.filter((p) => {
      if (!p.activo) return false
      if (criterioFiltro === 'CATEGORIA') {
        if (categoriaId !== 'TODAS' && p.categoria_id !== categoriaId) return false
      } else if (criterioFiltro === 'PROVEEDOR') {
        if (proveedorId !== 'TODOS' && p.proveedor_id !== proveedorId) return false
      }
      return true
    })
  }, [productos, criterioFiltro, categoriaId, proveedorId])

  // Vista previa de los primeros 5 productos
  const vistaPrevia = useMemo(() => {
    return productosAfectados.slice(0, 5).map((p) => ({
      id: p.id,
      descripcion: p.descripcion,
      ventaActual: p.precio_venta,
      ventaNueva: calcularNuevo(p.precio_venta, porcentaje, redondeo),
      costoActual: p.precio_costo,
      costoNuevo: calcularNuevo(p.precio_costo, porcentaje, redondeo),
    }))
  }, [productosAfectados, porcentaje, redondeo])

  const handleAplicar = async () => {
    if (productosAfectados.length === 0) {
      toast.error('No hay productos que cumplan con el criterio seleccionado')
      return
    }

    if (porcentaje === 0) {
      toast.error('El porcentaje de aumento debe ser distinto de cero')
      return
    }

    const confirmar = window.confirm(
      `¿Confirmás aplicar un aumento del ${porcentaje.toLocaleString('es-AR', { maximumFractionDigits: 2 })}% a ${productosAfectados.length} productos?`
    )
    if (!confirmar) return

    setProcesando(true)
    const ahora = new Date().toISOString()
    let exitosos = 0

    try {
      // 1. Calcular y preparar mapa de actualización
      const nuevosPreciosMap = new Map<string, { precio_venta: number; precio_costo?: number }>()
      for (const p of productosAfectados) {
        const nuevaVenta = calcularNuevo(p.precio_venta, porcentaje, redondeo)
        const itemUpdate: { precio_venta: number; precio_costo?: number } = { precio_venta: nuevaVenta }
        if (tipoPrecio === 'COSTO_Y_VENTA' && p.precio_costo > 0) {
          itemUpdate.precio_costo = calcularNuevo(p.precio_costo, porcentaje, redondeo)
        }
        nuevosPreciosMap.set(p.id, itemUpdate)
      }

      // 2. Procesar en tandas de 20 para no saturar conexiones remotas
      const idsExitosos = new Set<string>()
      const TAMAÑO_LOTE = 20
      for (let i = 0; i < productosAfectados.length; i += TAMAÑO_LOTE) {
        const lote = productosAfectados.slice(i, i + TAMAÑO_LOTE)
        await Promise.all(
          lote.map(async (p) => {
            const upd = nuevosPreciosMap.get(p.id)
            if (!upd) return

            const updates: Record<string, any> = {
              precio_venta: upd.precio_venta,
              fecha_actualizacion: ahora,
            }
            if (upd.precio_costo !== undefined) {
              updates.precio_costo = upd.precio_costo
            }

            const { error } = await supabase
              .from('productos')
              .update(updates)
              .eq('id', p.id)

            if (!error) {
              exitosos++
              idsExitosos.add(p.id)
            }
          })
        )
      }

      // 3. Sincronizar la caché local únicamente con los confirmados
      try {
        const usuario = useAuthStore.getState().usuario
        const kioscoId = usuario?.kiosco_id
        const cachedProds = getCachedProductos(kioscoId)
        if (cachedProds && cachedProds.length > 0 && idsExitosos.size > 0) {
          const actualizados = cachedProds.map((prod: Producto) => {
            if (idsExitosos.has(prod.id)) {
              const upd = nuevosPreciosMap.get(prod.id)
              if (upd) {
                return {
                  ...prod,
                  precio_venta: upd.precio_venta,
                  precio_costo: upd.precio_costo !== undefined ? upd.precio_costo : prod.precio_costo,
                  fecha_actualizacion: ahora,
                }
              }
            }
            return prod
          })
          saveCachedProductos(actualizados, kioscoId)
        }
      } catch (cacheErr) {
        console.warn('Error sincronizando caché local en aumento masivo:', cacheErr)
      }

      if (exitosos === productosAfectados.length) {
        toast.success(`Aumento aplicado exitosamente a ${exitosos} productos`)
      } else if (exitosos > 0) {
        toast.success(`Aumento aplicado a ${exitosos} de ${productosAfectados.length} productos`)
        toast.error('Algunos productos no pudieron actualizarse por error de conexión')
      } else {
        toast.error('No se pudo actualizar ningún producto. Verificá la conexión.')
      }

      await onAumentoAplicado()
      onClose()
    } catch (err) {
      console.error('Error aplicando aumento masivo:', err)
      toast.error('Ocurrió un error al actualizar algunos precios')
    } finally {
      setProcesando(false)
    }
  }

  const porcentajesRapidos = [5, 10, 15, 20, 25, 30, 50]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Aumento Masivo de Precios"
      size="lg"
      footer={
        <div className="flex justify-end gap-2.5 w-full">
          <Button variant="secondary" onClick={onClose} disabled={procesando} className="text-xs sm:text-sm">
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleAplicar}
            disabled={procesando || productosAfectados.length === 0}
            className="text-xs sm:text-sm shadow-sm"
          >
            {procesando ? 'Actualizando...' : `Aplicar a ${productosAfectados.length} productos`}
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        {/* Cabecera informativa tipo Banner */}
        <div className="p-3.5 bg-gradient-to-r from-indigo-50/90 via-indigo-50/50 to-purple-50/40 dark:from-indigo-950/40 dark:via-indigo-950/20 dark:to-purple-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-xl flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              Ajuste masivo por inflación o costos
            </span>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Calcula y aplica nuevos precios en lote conservando márgenes.
            </p>
          </div>
          <div className="text-right flex-shrink-0 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-900/60 shadow-2xs">
            <span className="text-[10px] text-gray-400 dark:text-gray-400 block font-semibold uppercase">
              Afectados
            </span>
            <span className="text-base font-black text-indigo-600 dark:text-indigo-400">
              {productosAfectados.length}{' '}
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">prod.</span>
            </span>
          </div>
        </div>

        {/* Selector de Criterio: Categoría / Proveedor / Todo el Catálogo */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
            Criterio de Aplicación
          </label>
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setCriterioFiltro('CATEGORIA')}
              className={`py-1.5 px-2 rounded-lg transition-all text-center cursor-pointer ${
                criterioFiltro === 'CATEGORIA'
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              Por Categoría
            </button>
            <button
              type="button"
              onClick={() => setCriterioFiltro('PROVEEDOR')}
              className={`py-1.5 px-2 rounded-lg transition-all text-center cursor-pointer ${
                criterioFiltro === 'PROVEEDOR'
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              Por Proveedor
            </button>
            <button
              type="button"
              onClick={() => setCriterioFiltro('TODOS')}
              className={`py-1.5 px-2 rounded-lg transition-all text-center cursor-pointer ${
                criterioFiltro === 'TODOS'
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              Todo el Catálogo
            </button>
          </div>
        </div>

        {/* Selectores de Alcance: Categoría / Proveedor y Tipo de Precio */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Objetivo según criterio */}
          <div>
            {criterioFiltro === 'CATEGORIA' ? (
              <>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Categoría a incrementar
                </label>
                <div className="relative">
                  <select
                    value={categoriaId}
                    onChange={(e) => setCategoriaId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all font-medium appearance-none cursor-pointer pr-9"
                  >
                    <option value="TODAS">Todas las categorías ({productos.length})</option>
                    {categorias.map((c) => {
                      const cant = productos.filter((p) => p.categoria_id === c.id).length
                      return (
                        <option key={c.id} value={c.id}>
                          {c.nombre} ({cant} prod.)
                        </option>
                      )
                    })}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </>
            ) : criterioFiltro === 'PROVEEDOR' ? (
              <>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Proveedor a incrementar
                </label>
                <div className="relative">
                  <select
                    value={proveedorId}
                    onChange={(e) => setProveedorId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all font-medium appearance-none cursor-pointer pr-9"
                  >
                    <option value="TODOS">Todos los proveedores</option>
                    {proveedores.filter((p) => p.activo).map((prov) => {
                      const cant = productos.filter((p) => p.proveedor_id === prov.id).length
                      return (
                        <option key={prov.id} value={prov.id}>
                          {prov.nombre} ({cant} prod.)
                        </option>
                      )
                    })}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </>
            ) : (
              <>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Alcance
                </label>
                <div className="p-2.5 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                  Se actualizará el catálogo completo ({productosAfectados.length} artículos activos)
                </div>
              </>
            )}
          </div>

          {/* Tipo de precio */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Precios a modificar
            </label>
            <div className="relative">
              <select
                value={tipoPrecio}
                onChange={(e) => setTipoPrecio(e.target.value as 'VENTA' | 'COSTO_Y_VENTA')}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all font-medium appearance-none cursor-pointer pr-9"
              >
                <option value="VENTA">Solo Precio de Venta al Público</option>
                <option value="COSTO_Y_VENTA">Precio de Venta y Costo (ambos)</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Sección de Porcentaje Unificada e Interactiva con soporte para decimales */}
        <div className="space-y-2.5 p-4 rounded-xl border border-gray-200 dark:border-gray-700/80 bg-white dark:bg-gray-800/60 shadow-2xs">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Porcentaje de aumento
            </label>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
              +{porcentaje > 0 ? porcentaje.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : 0}%
            </span>
          </div>

          {/* Selector de Chips Rápidos */}
          <div className="flex flex-wrap items-center gap-1.5">
            {porcentajesRapidos.map((pct) => {
              const activo = porcentaje === pct
              return (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    setPorcentaje(pct)
                    setPorcentajeInput(pct.toString())
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                    activo
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-gray-100 dark:bg-gray-700/70 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600'
                  }`}
                >
                  +{pct}%
                </button>
              )
            })}
          </div>

          {/* Stepper numérico preciso con botón +/- y soporte de decimales con coma */}
          <div className="flex items-center gap-3 pt-1">
            <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-900/60">
              <button
                type="button"
                onClick={() => {
                  const nuevo = Math.max(0.1, Math.round((porcentaje - 1) * 10) / 10)
                  setPorcentaje(nuevo)
                  setPorcentajeInput(nuevo.toString().replace('.', ','))
                }}
                className="w-9 h-9 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-90 transition-all font-bold text-lg cursor-pointer"
              >
                −
              </button>
              <div className="relative flex items-center justify-center px-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={porcentajeInput}
                  onChange={handlePorcentajeChange}
                  onBlur={handlePorcentajeBlur}
                  placeholder="0"
                  className="w-20 text-center text-base font-black text-indigo-600 dark:text-indigo-400 bg-transparent focus:outline-hidden py-1"
                />
                <span className="text-xs font-bold text-gray-400 -ml-1">%</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nuevo = Math.min(500, Math.round((porcentaje + 1) * 10) / 10)
                  setPorcentaje(nuevo)
                  setPorcentajeInput(nuevo.toString().replace('.', ','))
                }}
                className="w-9 h-9 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-90 transition-all font-bold text-lg cursor-pointer"
              >
                +
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">
              Podés ingresar valores con coma (ej: 1,5%) o usar los atajos de un clic.
            </p>
          </div>
        </div>

        {/* Regla de redondeo estilizada con tarjetas */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
            Regla de redondeo de precios
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Múltiplos de $100 */}
            <button
              type="button"
              onClick={() => setRedondeo('100')}
              className={`p-3 rounded-xl border text-left transition-all relative active:scale-98 ${
                redondeo === '100'
                  ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100 shadow-xs ring-1 ring-indigo-500/20'
                  : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold">Múltiplos de $100</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                  Recomendado
                </span>
              </div>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 block">
                Ej: $1.420 → <strong className="text-gray-800 dark:text-gray-200">$1.400</strong>
              </span>
            </button>

            {/* Múltiplos de $50 */}
            <button
              type="button"
              onClick={() => setRedondeo('50')}
              className={`p-3 rounded-xl border text-left transition-all relative active:scale-98 ${
                redondeo === '50'
                  ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100 shadow-xs ring-1 ring-indigo-500/20'
                  : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold">Múltiplos de $50</span>
              </div>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 block">
                Ej: $1.420 → <strong className="text-gray-800 dark:text-gray-200">$1.450</strong>
              </span>
            </button>

            {/* Sin redondeo */}
            <button
              type="button"
              onClick={() => setRedondeo('NINGUNO')}
              className={`p-3 rounded-xl border text-left transition-all relative active:scale-98 ${
                redondeo === 'NINGUNO'
                  ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100 shadow-xs ring-1 ring-indigo-500/20'
                  : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold">Sin redondeo</span>
              </div>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 block">
                Valor matemático exacto
              </span>
            </button>
          </div>
        </div>

        {/* Vista previa con estilo nativo limpio en modo claro y oscuro */}
        <div className="rounded-xl border border-gray-300 dark:border-gray-700/80 bg-gray-50/80 dark:bg-gray-900 p-3.5 space-y-2.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
              <span>Vista previa</span>
              <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
                ({productosAfectados.length} productos afectados)
              </span>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 font-black text-xs">
              +{porcentaje > 0 ? porcentaje.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : 0}%
            </span>
          </div>

          {vistaPrevia.length === 0 ? (
            <p className="text-xs text-gray-500 py-3 text-center">No hay productos seleccionados.</p>
          ) : (
            <div className="space-y-1.5 text-xs">
              {vistaPrevia.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200/70 dark:border-gray-700/70 shadow-2xs"
                >
                  <span className="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[180px] sm:max-w-[260px]">
                    {item.descripcion}
                  </span>
                  <div className="flex items-center gap-2 tabular-nums flex-shrink-0">
                    <span className="text-gray-400 dark:text-gray-500 line-through text-xs">
                      {formatPrecio(item.ventaActual)}
                    </span>
                    <span className="text-gray-300 dark:text-gray-600">→</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-black text-xs sm:text-sm">
                      {formatPrecio(item.ventaNueva)}
                    </span>
                  </div>
                </div>
              ))}

              {productosAfectados.length > 5 && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center pt-1 italic">
                  ... y {productosAfectados.length - 5} productos más se actualizarán con este mismo criterio.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
