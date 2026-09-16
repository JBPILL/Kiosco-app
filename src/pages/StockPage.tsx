import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { formatFecha, formatPrecio } from '../lib/utils'
import { exportarMovimientosStockCSV } from '../lib/exportUtils'
import { playScanSound } from '../lib/sound'
import { useBarcodeGun } from '../hooks/useBarcodeGun'
import { useAuthStore } from '../stores/authStore'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { BarcodeScannerModal } from '../components/pos/BarcodeScannerModal'
import type { Producto, MovimientoStock } from '../types/database'
import toast from 'react-hot-toast'

export function StockPage() {
  const { usuario, kiosco } = useAuthStore()

  // Estados de datos
  const [movimientos, setMovimientos] = useState<(MovimientoStock & { producto?: Producto })[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  // Modales
  const [modalOpen, setModalOpen] = useState(false)
  const [modalScannerOpen, setModalScannerOpen] = useState(false)

  // Formulario de movimiento
  const [tipoMovimiento, setTipoMovimiento] = useState<'INGRESO' | 'EGRESO' | 'AJUSTE'>('INGRESO')
  const [productoSeleccionado, setProductoSeleccionado] = useState<Producto | null>(null)
  const [busquedaProductoInput, setBusquedaProductoInput] = useState('')
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)
  const [cantidad, setCantidad] = useState('1')
  const [motivo, setMotivo] = useState<string>('COMPRA')
  const [notas, setNotas] = useState('')

  // Filtros del historial
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | 'INGRESO' | 'EGRESO' | 'AJUSTE'>('TODOS')
  const [busquedaHistorial, setBusquedaHistorial] = useState('')
  const [panelStockBajoExpandido, setPanelStockBajoExpandido] = useState(true)

  const inputCantidadRef = useRef<HTMLInputElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Cargar movimientos desde Supabase
  const cargarMovimientos = useCallback(async () => {
    setCargando(true)
    let query = supabase
      .from('movimientos_stock')
      .select('*, producto:productos(id, descripcion, stock_actual, codigo_barras, precio_costo, precio_venta)')
      .order('fecha', { ascending: false })
      .limit(100)

    if (usuario?.kiosco_id) {
      query = query.eq('kiosco_id', usuario.kiosco_id)
    }

    const { data, error } = await query
    if (!error && data) {
      setMovimientos(data as (MovimientoStock & { producto?: Producto })[])
    }
    setCargando(false)
  }, [usuario?.kiosco_id])

  // Cargar productos activos
  const cargarProductos = useCallback(async () => {
    let query = supabase
      .from('productos')
      .select('id, descripcion, stock_actual, stock_minimo, precio_costo, precio_venta, codigo_barras, activo')
      .eq('activo', true)
      .order('descripcion')

    if (usuario?.kiosco_id) {
      query = query.eq('kiosco_id', usuario.kiosco_id)
    }

    const { data, error } = await query
    if (!error && data) {
      setProductos((data as Producto[]) || [])
    }
  }, [usuario?.kiosco_id])

  useEffect(() => {
    cargarMovimientos()
    cargarProductos()
  }, [cargarMovimientos, cargarProductos])

  // Cerrar sugerencias al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setMostrarSugerencias(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Métricas y KPIs de Stock
  const metricas = useMemo(() => {
    const total = productos.length
    const bajoStock = productos.filter((p) => p.stock_actual <= (p.stock_minimo ?? 5))
    const optimos = productos.filter((p) => p.stock_actual > (p.stock_minimo ?? 5)).length
    const valorInventario = productos.reduce(
      (acc, p) => acc + (p.stock_actual > 0 ? p.stock_actual * (p.precio_costo || 0) : 0),
      0
    )
    const unidadesTotales = productos.reduce((acc, p) => acc + Math.max(0, p.stock_actual), 0)

    return {
      total,
      bajoStock,
      cantBajoStock: bajoStock.length,
      optimos,
      valorInventario,
      unidadesTotales,
    }
  }, [productos])

  // Lector de Código de Barras Físico (USB / Bluetooth)
  useBarcodeGun({
    enabled: true,
    onScan: (barcode) => {
      const codigoLimpio = barcode.trim().toLowerCase()
      const match = productos.find(
        (p) => p.codigo_barras?.trim().toLowerCase() === codigoLimpio
      )

      if (match) {
        playScanSound('success')
        abrirModalConProducto(match, 'INGRESO', 'COMPRA')
        toast.success(`Producto detectado: ${match.descripcion}`)
      } else {
        playScanSound('error')
        toast.error(`Código no encontrado en catálogo: ${barcode}`)
      }
    },
  })

  // Escaneo por Cámara
  const handleProductoEscaneadoCamara = (prod: Producto) => {
    setModalScannerOpen(false)
    playScanSound('success')
    abrirModalConProducto(prod, 'INGRESO', 'COMPRA')
    toast.success(`Producto escaneado: ${prod.descripcion}`)
  }

  // Abrir modal con producto pre-seleccionado
  const abrirModalConProducto = (
    prod: Producto,
    tipo: 'INGRESO' | 'EGRESO' | 'AJUSTE' = 'INGRESO',
    motivoInicial?: string,
    cantInicial: string = '1'
  ) => {
    setProductoSeleccionado(prod)
    setBusquedaProductoInput(prod.descripcion)
    setTipoMovimiento(tipo)
    setMotivo(motivoInicial || (tipo === 'INGRESO' ? 'COMPRA' : tipo === 'EGRESO' ? 'ROTURA' : 'CONTEO'))
    setCantidad(cantInicial)
    setNotas('')
    setMostrarSugerencias(false)
    setModalOpen(true)

    // Foco en el input de cantidad
    setTimeout(() => {
      inputCantidadRef.current?.select()
    }, 100)
  }

  // Filtrado de sugerencias de productos para el buscador inteligente
  const sugerenciasProductos = useMemo(() => {
    const q = busquedaProductoInput.trim().toLowerCase()
    if (!q) return productos.slice(0, 15)

    return productos
      .filter((p) => {
        const matchNombre = p.descripcion.toLowerCase().includes(q)
        const matchCodigo = p.codigo_barras?.toLowerCase().includes(q) || false
        return matchNombre || matchCodigo
      })
      .slice(0, 15)
  }, [productos, busquedaProductoInput])

  // Motivos según el tipo de movimiento
  const motivosPorTipo = {
    INGRESO: [
      { value: 'COMPRA', label: 'Compra a proveedor / Reposición' },
      { value: 'DEVOLUCION', label: 'Devolución de cliente' },
      { value: 'REPOSICION', label: 'Ingreso extraordinario' },
    ],
    EGRESO: [
      { value: 'ROTURA', label: 'Rotura o deterioro' },
      { value: 'VENCIMIENTO', label: 'Producto vencido' },
      { value: 'PERDIDA', label: 'Pérdida o faltante' },
      { value: 'VENTA', label: 'Venta manual fuera de caja' },
    ],
    AJUSTE: [
      { value: 'CONTEO', label: 'Conteo físico de inventario' },
      { value: 'OTRO', label: 'Ajuste de balance / Corrección' },
    ],
  }

  // Cálculo en vivo del nuevo stock resultante
  const calculoStockResultante = useMemo(() => {
    if (!productoSeleccionado) return null
    const stockActual = productoSeleccionado.stock_actual || 0
    const cantNum = parseInt(cantidad, 10)

    if (isNaN(cantNum) || cantNum < 0) {
      return { stockActual, nuevoStock: stockActual, delta: 0 }
    }

    if (tipoMovimiento === 'INGRESO') {
      return {
        stockActual,
        nuevoStock: stockActual + cantNum,
        delta: cantNum,
      }
    } else if (tipoMovimiento === 'EGRESO') {
      const nuevo = Math.max(0, stockActual - cantNum)
      return {
        stockActual,
        nuevoStock: nuevo,
        delta: -cantNum,
      }
    } else {
      // AJUSTE: cantidad representa el stock físico real contado
      return {
        stockActual,
        nuevoStock: cantNum,
        delta: cantNum - stockActual,
      }
    }
  }, [productoSeleccionado, cantidad, tipoMovimiento])

  // Confirmar y registrar movimiento
  const registrarMovimiento = async () => {
    if (!productoSeleccionado) {
      toast.error('Seleccioná un producto del catálogo')
      return
    }

    const cantNum = parseInt(cantidad, 10)
    if (isNaN(cantNum) || cantNum <= 0) {
      toast.error('Ingresá una cantidad válida mayor a 0')
      return
    }

    if (!calculoStockResultante) return

    setGuardando(true)
    try {
      // Cantidad a guardar en movimientos_stock
      const cantidadMovimiento =
        tipoMovimiento === 'INGRESO'
          ? cantNum
          : tipoMovimiento === 'EGRESO'
          ? -cantNum
          : calculoStockResultante.delta

      // 1. Insertar registro de movimiento
      const { error: movError } = await supabase.from('movimientos_stock').insert({
        producto_id: productoSeleccionado.id,
        kiosco_id: usuario?.kiosco_id,
        tipo: tipoMovimiento,
        cantidad: cantidadMovimiento,
        motivo: motivo as any,
        notas: notas.trim() || null,
        usuario_id: usuario?.id || null,
      })

      if (movError) throw movError

      // 2. Actualizar stock_actual en la tabla productos
      const { error: prodError } = await supabase
        .from('productos')
        .update({
          stock_actual: calculoStockResultante.nuevoStock,
          fecha_actualizacion: new Date().toISOString(),
        })
        .eq('id', productoSeleccionado.id)

      if (prodError) throw prodError

      playScanSound('success')
      toast.success(
        `Stock actualizado: "${productoSeleccionado.descripcion}" (${calculoStockResultante.stockActual} → ${calculoStockResultante.nuevoStock})`
      )

      setModalOpen(false)
      setProductoSeleccionado(null)
      setBusquedaProductoInput('')
      setCantidad('1')
      setNotas('')

      await Promise.all([cargarMovimientos(), cargarProductos()])
    } catch (err: any) {
      playScanSound('error')
      toast.error(err?.message || 'Error al actualizar stock')
    } finally {
      setGuardando(false)
    }
  }

  // Historial filtrado
  const movimientosFiltrados = useMemo(() => {
    return movimientos.filter((m) => {
      // Filtro por tipo
      if (filtroTipo !== 'TODOS' && m.tipo !== filtroTipo) {
        return false
      }

      // Filtro por texto de búsqueda
      if (busquedaHistorial.trim()) {
        const q = busquedaHistorial.toLowerCase()
        const matchDesc = m.producto?.descripcion?.toLowerCase().includes(q) || false
        const matchCodigo = m.producto?.codigo_barras?.toLowerCase().includes(q) || false
        const matchMotivo = m.motivo?.toLowerCase().includes(q) || false
        const matchNotas = m.notas?.toLowerCase().includes(q) || false
        return matchDesc || matchCodigo || matchMotivo || matchNotas
      }

      return true
    })
  }, [movimientos, filtroTipo, busquedaHistorial])

  // Colores de badges de tipo
  const tipoBadges = {
    INGRESO: 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60',
    EGRESO: 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-800/60',
    AJUSTE: 'text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60',
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            Gestión de Inventario y Stock
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Control de existencias, lectura con código de barras, ingresos, egresos y ajustes
          </p>
        </div>

        {/* Acciones de Cabecera */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            onClick={() => setModalScannerOpen(true)}
            className="text-xs sm:text-sm"
            title="Escanear producto con la cámara del celular o webcam"
          >
            Escanear Cámara
          </Button>

          <Button
            variant="primary"
            onClick={() => {
              setProductoSeleccionado(null)
              setBusquedaProductoInput('')
              setTipoMovimiento('INGRESO')
              setCantidad('1')
              setModalOpen(true)
            }}
            className="text-xs sm:text-sm shadow-xs"
          >
            + Registrar Movimiento
          </Button>
        </div>
      </div>

      {/* Cuadrícula de Métricas Rápidas (KPIs) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* KPI 1: Total Artículos */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Total Productos</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {metricas.total}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            {metricas.unidadesTotales} unidades en inventario
          </p>
        </div>

        {/* KPI 2: Stock Óptimo */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Stock Óptimo</p>
          <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {metricas.optimos}
          </p>
          <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
            Por encima del mínimo
          </p>
        </div>

        {/* KPI 3: Stock Bajo / Reposición */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Stock Bajo</p>
            {metricas.cantBajoStock > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                Alerta
              </span>
            )}
          </div>
          <p
            className={`text-xl sm:text-2xl font-bold mt-1 ${
              metricas.cantBajoStock > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-gray-900 dark:text-gray-100'
            }`}
          >
            {metricas.cantBajoStock}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            {metricas.cantBajoStock === 1 ? '1 artículo a reponer' : `${metricas.cantBajoStock} artículos a reponer`}
          </p>
        </div>

        {/* KPI 4: Valorización de Inventario */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Valorización (Costo)</p>
          <p className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
            {formatPrecio(metricas.valorInventario)}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            Costo total en mercadería
          </p>
        </div>
      </div>

      {/* Panel de Alertas de Stock Bajo / Reposición Sugerida */}
      {metricas.cantBajoStock > 0 && (
        <div className="bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <h3 className="font-bold text-sm text-amber-900 dark:text-amber-200">
                Productos con Stock Bajo o Agotado ({metricas.cantBajoStock})
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setPanelStockBajoExpandido(!panelStockBajoExpandido)}
              className="text-xs font-semibold text-amber-800 dark:text-amber-300 hover:underline"
            >
              {panelStockBajoExpandido ? 'Ocultar' : 'Ver productos'}
            </button>
          </div>

          {panelStockBajoExpandido && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-1">
              {metricas.bajoStock.map((p) => {
                const agotado = p.stock_actual <= 0
                return (
                  <div
                    key={p.id}
                    className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-2 shadow-2xs"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                        {p.descripcion}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                        <span
                          className={`font-black ${
                            agotado ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          Stock: {p.stock_actual}
                        </span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          Mín: {p.stock_minimo ?? 5}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        abrirModalConProducto(
                          p,
                          'INGRESO',
                          'COMPRA',
                          String(Math.max(5, (p.stock_minimo ?? 5) * 2 - p.stock_actual))
                        )
                      }
                      className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all active:scale-95 flex-shrink-0"
                    >
                      + Reponer
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Historial de Movimientos de Stock */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
        {/* Barra superior de control: Pestañas, Buscador y Exportación */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gray-50/50 dark:bg-gray-900/30">
          {/* Pestañas de filtrado por Tipo */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800/80 p-1 rounded-lg border border-gray-200 dark:border-gray-700 self-start md:self-auto flex-wrap">
            {(['TODOS', 'INGRESO', 'EGRESO', 'AJUSTE'] as const).map((tipo) => (
              <button
                key={tipo}
                type="button"
                onClick={() => setFiltroTipo(tipo)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                  filtroTipo === tipo
                    ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                {tipo === 'TODOS'
                  ? 'Todos'
                  : tipo === 'INGRESO'
                  ? 'Ingresos (+)'
                  : tipo === 'EGRESO'
                  ? 'Egresos (-)'
                  : 'Ajustes (=)'}
              </button>
            ))}
          </div>

          {/* Buscador y Exportar CSV */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <input
                type="text"
                placeholder="Buscar por producto, código o motivo..."
                value={busquedaHistorial}
                onChange={(e) => setBusquedaHistorial(e.target.value)}
                className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
              />
              {busquedaHistorial && (
                <button
                  type="button"
                  onClick={() => setBusquedaHistorial('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => exportarMovimientosStockCSV(movimientosFiltrados, kiosco?.nombre || 'Kiosco')}
              disabled={movimientosFiltrados.length === 0}
              className="text-xs whitespace-nowrap"
              title="Descargar historial filtrado en formato CSV compatible con Excel"
            >
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* Lista / Tabla de Movimientos */}
        {cargando ? (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full mx-auto" />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Cargando movimientos de stock...</p>
          </div>
        ) : movimientosFiltrados.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              No se encontraron movimientos registrados
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-sm mx-auto">
              {busquedaHistorial || filtroTipo !== 'TODOS'
                ? 'Probá ajustando el filtro de búsqueda o el tipo de movimiento seleccionado.'
                : 'Registrá un ingreso o escaneá un producto con código de barras para comenzar.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {movimientosFiltrados.map((mov) => {
              const esIngreso = mov.tipo === 'INGRESO'
              const esEgreso = mov.tipo === 'EGRESO'
              const cantDisplay =
                mov.cantidad > 0 ? `+${mov.cantidad}` : `${mov.cantidad}`

              return (
                <div
                  key={mov.id}
                  className="p-3.5 sm:px-4 flex items-center justify-between gap-3 hover:bg-gray-50/70 dark:hover:bg-gray-750 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Badge de tipo */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${
                        tipoBadges[mov.tipo]
                      }`}
                    >
                      {mov.tipo}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                          {mov.producto?.descripcion || 'Producto eliminado'}
                        </p>
                        {mov.producto?.codigo_barras && (
                          <span className="hidden sm:inline-block font-mono text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.2 rounded">
                            {mov.producto.codigo_barras}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {formatFecha(mov.fecha)} ·{' '}
                        <span className="font-medium text-gray-600 dark:text-gray-400">
                          {mov.motivo}
                        </span>
                        {mov.notas && ` · ${mov.notas}`}
                      </p>
                    </div>
                  </div>

                  {/* Cantidad variada */}
                  <div className="text-right flex-shrink-0">
                    <span
                      className={`font-mono text-base font-black ${
                        esIngreso
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : esEgreso
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-indigo-600 dark:text-indigo-400'
                      }`}
                    >
                      {cantDisplay}
                    </span>
                    <span className="block text-[10px] text-gray-400">unidades</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal de Registro de Movimiento Renovado */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Registrar Movimiento de Stock"
        size="md"
      >
        <div className="space-y-4">
          {/* Selector de Tipo de Movimiento */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1.5">
              Tipo de Operación
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTipoMovimiento('INGRESO')
                  setMotivo('COMPRA')
                }}
                className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all ${
                  tipoMovimiento === 'INGRESO'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 shadow-xs ring-1 ring-emerald-500/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                }`}
              >
                + Ingreso
              </button>

              <button
                type="button"
                onClick={() => {
                  setTipoMovimiento('EGRESO')
                  setMotivo('ROTURA')
                }}
                className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all ${
                  tipoMovimiento === 'EGRESO'
                    ? 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 shadow-xs ring-1 ring-red-500/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                }`}
              >
                - Egreso
              </button>

              <button
                type="button"
                onClick={() => {
                  setTipoMovimiento('AJUSTE')
                  setMotivo('CONTEO')
                  if (productoSeleccionado) {
                    setCantidad(String(productoSeleccionado.stock_actual || 0))
                  }
                }}
                className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all ${
                  tipoMovimiento === 'AJUSTE'
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 shadow-xs ring-1 ring-indigo-500/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                }`}
              >
                = Ajuste Físico
              </button>
            </div>
          </div>

          {/* Selector Inteligente de Producto con Código de Barras */}
          <div ref={searchContainerRef} className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                Producto
              </label>
              <button
                type="button"
                onClick={() => setModalScannerOpen(true)}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                Escanear con Cámara
              </button>
            </div>

            {productoSeleccionado ? (
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 shadow-2xs">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                    {productoSeleccionado.descripcion}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs">
                    <span className="text-gray-500 dark:text-gray-400">
                      Stock actual: <strong className="text-gray-800 dark:text-gray-200">{productoSeleccionado.stock_actual}</strong>
                    </span>
                    {productoSeleccionado.codigo_barras && (
                      <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">
                        ({productoSeleccionado.codigo_barras})
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setProductoSeleccionado(null)
                    setBusquedaProductoInput('')
                  }}
                  className="px-2.5 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-xs font-bold text-gray-700 dark:text-gray-300 transition-colors flex-shrink-0"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  placeholder="Escribí nombre o pasá la pistola de código de barras..."
                  value={busquedaProductoInput}
                  onChange={(e) => {
                    setBusquedaProductoInput(e.target.value)
                    setMostrarSugerencias(true)
                  }}
                  onFocus={() => setMostrarSugerencias(true)}
                  className="w-full text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3.5 py-2.5 outline-none focus:border-indigo-500 shadow-xs transition-colors"
                />

                {mostrarSugerencias && sugerenciasProductos.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg divide-y divide-gray-100 dark:divide-gray-700">
                    {sugerenciasProductos.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setProductoSeleccionado(p)
                          setBusquedaProductoInput(p.descripcion)
                          setMostrarSugerencias(false)
                          if (tipoMovimiento === 'AJUSTE') {
                            setCantidad(String(p.stock_actual || 0))
                          }
                          setTimeout(() => inputCantidadRef.current?.select(), 50)
                        }}
                        className="w-full text-left p-2.5 hover:bg-indigo-50 dark:hover:bg-gray-700/60 flex items-center justify-between gap-2 text-xs transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {p.descripcion}
                          </p>
                          {p.codigo_barras && (
                            <p className="font-mono text-[11px] text-gray-400 mt-0.5">
                              {p.codigo_barras}
                            </p>
                          )}
                        </div>
                        <span className="font-mono font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded flex-shrink-0">
                          Stock: {p.stock_actual}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cantidad e Incrementos Rápidos */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                {tipoMovimiento === 'AJUSTE' ? 'Nuevo Stock Real (Conteo Físico)' : 'Cantidad'}
              </label>
              <span className="text-[11px] text-gray-400">Unidades enteras</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={inputCantidadRef}
                type="number"
                min="1"
                step="1"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="1"
                className="w-full text-base font-bold rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3.5 py-2.5 outline-none focus:border-indigo-500 shadow-xs"
              />
            </div>

            {/* Chips de incremento rápido */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-[11px] text-gray-400 font-medium mr-1">Rápido:</span>
              {[1, 5, 10, 25, 50, 100].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    const actual = parseInt(cantidad, 10) || 0
                    setCantidad(String(actual + val))
                  }}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 active:scale-95 transition-all shadow-2xs"
                >
                  +{val}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCantidad('1')}
                className="px-2 py-1 text-[11px] font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-auto"
              >
                Reset (1)
              </button>
            </div>
          </div>

          {/* Previsualización en Vivo del Stock Resultante */}
          {calculoStockResultante && productoSeleccionado && (
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs shadow-2xs">
              <div className="space-y-0.5">
                <span className="text-gray-500 dark:text-gray-400 block font-medium">
                  Stock actual:
                </span>
                <span className="font-bold text-gray-800 dark:text-gray-200 text-sm">
                  {calculoStockResultante.stockActual} u.
                </span>
              </div>

              <div className="text-center">
                <span className="text-gray-400 block text-[11px]">Operación</span>
                <span
                  className={`font-black text-sm ${
                    tipoMovimiento === 'INGRESO'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : tipoMovimiento === 'EGRESO'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-indigo-600 dark:text-indigo-400'
                  }`}
                >
                  {tipoMovimiento === 'INGRESO'
                    ? `+${cantidad || 0}`
                    : tipoMovimiento === 'EGRESO'
                    ? `-${cantidad || 0}`
                    : `Conteo: ${cantidad || 0}`}
                </span>
              </div>

              <div className="text-right space-y-0.5">
                <span className="text-gray-500 dark:text-gray-400 block font-medium">
                  Nuevo Stock:
                </span>
                <span
                  className={`font-black text-base ${
                    calculoStockResultante.nuevoStock <= (productoSeleccionado.stock_minimo ?? 5)
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {calculoStockResultante.nuevoStock} u.
                </span>
              </div>
            </div>
          )}

          {/* Motivo de la Operación */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">
              Motivo
            </label>
            <select
              className="w-full text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3.5 py-2.5 outline-none focus:border-indigo-500 shadow-xs"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            >
              {motivosPorTipo[tipoMovimiento].map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notas Adicionales */}
          <Input
            label="Notas / Remito / Detalle (opcional)"
            placeholder="Ej: Remito #4812, proveedor Distribuidora Sur, etc."
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />

          {/* Acciones */}
          <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-200 dark:border-gray-700">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={registrarMovimiento}
              loading={guardando}
              disabled={!productoSeleccionado || !cantidad || parseInt(cantidad, 10) <= 0}
              className="shadow-xs"
            >
              Confirmar Movimiento
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de Escaneo por Cámara */}
      <BarcodeScannerModal
        isOpen={modalScannerOpen}
        onClose={() => setModalScannerOpen(false)}
        onProductScanned={handleProductoEscaneadoCamara}
      />
    </div>
  )
}
