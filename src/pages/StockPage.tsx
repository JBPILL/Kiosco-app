import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { formatFecha, formatPrecio } from '../lib/utils'
import { exportarMovimientosStockExcel } from '../lib/exportUtils'
import { playScanSound } from '../lib/sound'
import { useBarcodeGun } from '../hooks/useBarcodeGun'
import { useAuthStore } from '../stores/authStore'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { BarcodeScannerModal } from '../components/pos/BarcodeScannerModal'
import { TicketReceiptModal, type TicketData } from '../components/pos/TicketReceiptModal'
import { ventaToTicketData } from '../lib/ticketUtils'
import { useDevolucionStore } from '../stores/devolucionStore'
import { useLoteStore, calcularDiasHastaVencimiento } from '../stores/loteStore'
import type { Producto, MovimientoStock } from '../types/database'
import toast from 'react-hot-toast'

export function StockPage() {
  const { usuario, kiosco } = useAuthStore()
  const { buscarVentaParaDevolucion } = useDevolucionStore()

  // Estados de datos
  const [movimientos, setMovimientos] = useState<(MovimientoStock & { producto?: Producto })[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [ticketParaVer, setTicketParaVer] = useState<TicketData | null>(null)

  // Lotes y Vencimientos (FIFO / FEFO)
  const { lotes, cargarLotes, crearLote, darDeBajaLote, obtenerAlertas } = useLoteStore()
  const [vistaPrincipal, setVistaPrincipal] = useState<'MOVIMIENTOS' | 'VENCIMIENTOS'>('MOVIMIENTOS')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [numeroLote, setNumeroLote] = useState('')
  const [filtroEstadoLote, setFiltroEstadoLote] = useState<'TODOS' | 'VENCIDOS' | 'CRITICOS' | 'PROXIMOS' | 'VIGENTES'>('TODOS')
  const [busquedaLote, setBusquedaLote] = useState('')

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
    cargarLotes(usuario?.kiosco_id || undefined)
  }, [cargarMovimientos, cargarProductos, cargarLotes, usuario?.kiosco_id])

  const handleVerTicketDesdeNota = async (textoNota: string) => {
    const match = textoNota.match(/venta\s*#?([a-f0-9-]{8,36})/i)
    if (!match) return
    const v = await buscarVentaParaDevolucion(match[1], usuario?.kiosco_id || kiosco?.id)
    if (v) {
      setTicketParaVer(ventaToTicketData(v, kiosco))
    } else {
      toast.error('No se pudo encontrar el comprobante de esta venta')
    }
  }

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
    const esPesable = Boolean(productoSeleccionado.es_pesable)
    const cantNum = esPesable
      ? Number(parseFloat(cantidad || '0').toFixed(3))
      : parseInt(cantidad || '0', 10)

    if (isNaN(cantNum) || cantNum < 0) {
      return { stockActual, nuevoStock: stockActual, delta: 0 }
    }

    if (tipoMovimiento === 'INGRESO') {
      const nuevo = esPesable ? Number((stockActual + cantNum).toFixed(3)) : stockActual + cantNum
      return {
        stockActual,
        nuevoStock: nuevo,
        delta: cantNum,
      }
    } else if (tipoMovimiento === 'EGRESO') {
      const nuevo = Math.max(0, esPesable ? Number((stockActual - cantNum).toFixed(3)) : stockActual - cantNum)
      return {
        stockActual,
        nuevoStock: nuevo,
        delta: -cantNum,
      }
    } else {
      // AJUSTE: cantidad representa el stock físico real contado
      const delta = esPesable ? Number((cantNum - stockActual).toFixed(3)) : cantNum - stockActual
      return {
        stockActual,
        nuevoStock: cantNum,
        delta,
      }
    }
  }, [productoSeleccionado, cantidad, tipoMovimiento])

  // Confirmar y registrar movimiento
  const registrarMovimiento = async () => {
    if (!productoSeleccionado) {
      toast.error('Seleccioná un producto del catálogo')
      return
    }

    const esPesable = Boolean(productoSeleccionado.es_pesable)
    const cantNum = esPesable
      ? Number(parseFloat(cantidad).toFixed(3))
      : parseInt(cantidad, 10)

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

      // Sincronizar de inmediato la caché local de productos para el POS
      try {
        const cachedRaw = localStorage.getItem('kiosko_cache_productos')
        if (cachedRaw) {
          const cachedProds: Producto[] = JSON.parse(cachedRaw)
          const actualizados = cachedProds.map((p) =>
            p.id === productoSeleccionado.id
              ? {
                  ...p,
                  stock_actual: calculoStockResultante.nuevoStock,
                  fecha_actualizacion: new Date().toISOString(),
                }
              : p
          )
          localStorage.setItem('kiosko_cache_productos', JSON.stringify(actualizados))
        }
      } catch (cacheErr) {
        console.warn('Error sincronizando stock local:', cacheErr)
      }

      // 3. Si fue un ingreso y se indicó fecha de vencimiento, crear el lote correspondiente
      if (tipoMovimiento === 'INGRESO' && fechaVencimiento) {
        try {
          await crearLote({
            kiosco_id: usuario?.kiosco_id || '',
            producto_id: productoSeleccionado.id,
            numero_lote: numeroLote.trim() || null,
            fecha_vencimiento: fechaVencimiento,
            cantidad: cantNum,
          })
        } catch (errLote) {
          console.warn('Aviso al registrar lote de vencimiento:', errLote)
        }
      }

      playScanSound('success')
      toast.success(
        `Stock actualizado: "${productoSeleccionado.descripcion}" (${calculoStockResultante.stockActual} → ${calculoStockResultante.nuevoStock})`
      )

      setModalOpen(false)
      setProductoSeleccionado(null)
      setBusquedaProductoInput('')
      setCantidad('1')
      setNotas('')
      setFechaVencimiento('')
      setNumeroLote('')

      await Promise.all([cargarMovimientos(), cargarProductos(), cargarLotes(usuario?.kiosco_id || undefined)])
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

  // Lotes y Vencimientos calculados
  const alertasLotes = useMemo(() => obtenerAlertas(30), [obtenerAlertas, lotes])

  const lotesFiltrados = useMemo(() => {
    return lotes.filter((l) => {
      if (!l.activo || l.cantidad_actual <= 0) return false
      const prod = productos.find((p) => p.id === l.producto_id)
      const desc = prod?.descripcion.toLowerCase() || ''
      const code = prod?.codigo_barras?.toLowerCase() || ''
      const loteNum = l.numero_lote?.toLowerCase() || ''
      const q = busquedaLote.toLowerCase()

      if (q && !desc.includes(q) && !code.includes(q) && !loteNum.includes(q)) {
        return false
      }

      const dias = calcularDiasHastaVencimiento(l.fecha_vencimiento)
      if (filtroEstadoLote === 'VENCIDOS') return dias < 0
      if (filtroEstadoLote === 'CRITICOS') return dias >= 0 && dias <= 7
      if (filtroEstadoLote === 'PROXIMOS') return dias > 7 && dias <= 30
      if (filtroEstadoLote === 'VIGENTES') return dias > 30

      return true
    })
  }, [lotes, productos, busquedaLote, filtroEstadoLote])

  const handleDarDeBajaLote = async (loteId: string) => {
    const lote = lotes.find((l) => l.id === loteId)
    if (!lote) return
    const prod = productos.find((p) => p.id === lote.producto_id)
    const nombreProd = prod?.descripcion || 'este producto'

    const confirmar = window.confirm(
      `¿Confirmás dar de baja el lote de "${nombreProd}" (${lote.cantidad_actual} unidades)?\n\nSe registrará un egreso de stock con motivo VENCIMIENTO y el lote quedará en 0.`
    )
    if (!confirmar) return

    try {
      await darDeBajaLote(loteId)

      await supabase.from('movimientos_stock').insert({
        producto_id: lote.producto_id,
        kiosco_id: usuario?.kiosco_id,
        tipo: 'EGRESO',
        cantidad: -lote.cantidad_actual,
        motivo: 'VENCIMIENTO',
        notas: `Baja de lote vencido ${lote.numero_lote ? `(${lote.numero_lote})` : ''} - Vto: ${lote.fecha_vencimiento}`,
        usuario_id: usuario?.id || null,
        fecha: new Date().toISOString(),
      })

      if (prod) {
        const nuevoStock = Math.max(0, prod.stock_actual - lote.cantidad_actual)
        await supabase
          .from('productos')
          .update({ stock_actual: nuevoStock, fecha_actualizacion: new Date().toISOString() })
          .eq('id', prod.id)
      }

      toast.success(`Lote de "${nombreProd}" dado de baja correctamente`)
      await Promise.all([cargarMovimientos(), cargarProductos(), cargarLotes(usuario?.kiosco_id || undefined)])
    } catch (e: any) {
      toast.error('Error al dar de baja lote: ' + (e?.message || ''))
    }
  }

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

      {/* Selector de Vista Principal: Movimientos vs. Lotes y Vencimientos */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setVistaPrincipal('MOVIMIENTOS')}
          className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            vistaPrincipal === 'MOVIMIENTOS'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Historial de Movimientos
        </button>
        <button
          type="button"
          onClick={() => setVistaPrincipal('VENCIMIENTOS')}
          className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            vistaPrincipal === 'VENCIMIENTOS'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          <span>Lotes y Vencimientos (FIFO)</span>
          {alertasLotes.vencidos.length + alertasLotes.criticos.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
              {alertasLotes.vencidos.length + alertasLotes.criticos.length}
            </span>
          )}
        </button>
      </div>

      {vistaPrincipal === 'MOVIMIENTOS' ? (
        /* Historial de Movimientos de Stock */
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
                variant="primary"
                size="sm"
                onClick={() => {
                  setProductoSeleccionado(null)
                  setBusquedaProductoInput('')
                  setTipoMovimiento('INGRESO')
                  setCantidad('1')
                  setModalOpen(true)
                }}
                className="text-xs whitespace-nowrap shadow-xs font-semibold"
                title="Cargar un nuevo ingreso, egreso o ajuste de mercadería"
              >
                + Registrar Movimiento
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportarMovimientosStockExcel(movimientosFiltrados, kiosco?.nombre || 'Kiosco')}
                disabled={movimientosFiltrados.length === 0}
                className="text-xs whitespace-nowrap"
                title="Descargar historial filtrado en formato Excel corporativo (.xlsx)"
              >
                Exportar Excel (.XLSX)
              </Button>
            </div>
          </div>

          {/* Lista de Movimientos */}
          {cargando ? (
            <div className="p-12 text-center text-gray-400 dark:text-gray-500">
              <div className="animate-spin h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-xs">Cargando movimientos...</p>
            </div>
          ) : movimientosFiltrados.length === 0 ? (
            <div className="p-12 text-center text-gray-400 dark:text-gray-500">
              <p className="font-semibold text-sm">No se encontraron movimientos registrados</p>
              <p className="text-xs mt-1">
                {busquedaHistorial || filtroTipo !== 'TODOS'
                  ? 'Probá cambiando los filtros o la búsqueda'
                  : 'Hacé clic en "+ Registrar Movimiento" o utilizá el lector de código de barras para comenzar'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-[560px] overflow-y-auto">
              {movimientosFiltrados.map((mov) => {
                const esIngreso = mov.tipo === 'INGRESO'
                const esEgreso = mov.tipo === 'EGRESO'
                const cantDisplay = esIngreso
                  ? `+${mov.cantidad}`
                  : esEgreso
                  ? `${mov.cantidad}`
                  : `=${mov.cantidad}`

                return (
                  <div
                    key={mov.id}
                    className="p-3 sm:p-4 hover:bg-gray-50/70 dark:hover:bg-gray-750/50 flex items-center justify-between gap-3 transition-colors text-xs"
                  >
                    {/* Badge de tipo y datos de producto */}
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`font-black text-[10px] tracking-wider px-2 py-1 rounded-md uppercase flex-shrink-0 ${
                          tipoBadges[mov.tipo]
                        }`}
                      >
                        {mov.tipo}
                      </span>

                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 dark:text-gray-100 truncate text-xs sm:text-sm">
                          {mov.producto?.descripcion || 'Producto sin descripción'}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5 flex-wrap">
                          {mov.producto?.codigo_barras && (
                            <span className="font-mono">{mov.producto.codigo_barras}</span>
                          )}
                          <span>·</span>
                          {mov.notas && (
                            <>
                              <span>·</span>
                              {/venta\s*#?[a-f0-9]{8}/i.test(mov.notas) ? (
                                <button
                                  type="button"
                                  onClick={() => handleVerTicketDesdeNota(mov.notas!)}
                                  className="font-mono font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 hover:underline cursor-pointer bg-indigo-50/70 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded transition-colors text-left"
                                  title="Hacé clic para ver el comprobante de esta venta"
                                >
                                  {mov.notas}
                                </button>
                              ) : (
                                <span className="italic truncate max-w-[200px]" title={mov.notas}>
                                  "{mov.notas}"
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Fecha del movimiento */}
                    <div className="hidden sm:block text-right text-[11px] text-gray-400 flex-shrink-0">
                      <p className="font-medium text-gray-600 dark:text-gray-300">
                        {formatFecha(mov.fecha)}
                      </p>
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
      ) : (
        /* Vista de Control de Lotes y Vencimientos (FIFO) */
        <div className="space-y-4">
          {/* Tarjetas de Semáforo de Vencimiento */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div
              onClick={() => setFiltroEstadoLote('VENCIDOS')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                filtroEstadoLote === 'VENCIDOS'
                  ? 'border-red-500 bg-red-50 dark:bg-red-950/40 ring-2 ring-red-500'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-red-300'
              }`}
            >
              <span className="text-xs font-bold text-red-600 dark:text-red-400 block">
                🔴 Vencidos
              </span>
              <p className="text-2xl font-black text-red-700 dark:text-red-300 mt-1">
                {alertasLotes.vencidos.length}
              </p>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                Dar de baja inmediata
              </span>
            </div>

            <div
              onClick={() => setFiltroEstadoLote('CRITICOS')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                filtroEstadoLote === 'CRITICOS'
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 ring-2 ring-orange-500'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-orange-300'
              }`}
            >
              <span className="text-xs font-bold text-orange-600 dark:text-orange-400 block">
                🟠 Críticos (≤ 7 días)
              </span>
              <p className="text-2xl font-black text-orange-700 dark:text-orange-300 mt-1">
                {alertasLotes.criticos.length}
              </p>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                Poner al frente / Oferta
              </span>
            </div>

            <div
              onClick={() => setFiltroEstadoLote('PROXIMOS')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                filtroEstadoLote === 'PROXIMOS'
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 ring-2 ring-amber-500'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-amber-300'
              }`}
            >
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 block">
                🟡 Próximos (8 a 30 días)
              </span>
              <p className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">
                {alertasLotes.proximos.length}
              </p>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                En seguimiento
              </span>
            </div>

            <div
              onClick={() => setFiltroEstadoLote('VIGENTES')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                filtroEstadoLote === 'VIGENTES'
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 ring-2 ring-emerald-500'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-emerald-300'
              }`}
            >
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 block">
                🟢 Vigentes (&gt; 30 días)
              </span>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
                {alertasLotes.vigentes.length}
              </p>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                Stock saludable
              </span>
            </div>
          </div>

          {/* Tabla de Lotes */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gray-50/50 dark:bg-gray-900/30">
              <div className="flex items-center gap-1.5 flex-wrap">
                {(['TODOS', 'VENCIDOS', 'CRITICOS', 'PROXIMOS', 'VIGENTES'] as const).map((fil) => (
                  <button
                    key={fil}
                    type="button"
                    onClick={() => setFiltroEstadoLote(fil)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      filtroEstadoLote === fil
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {fil === 'TODOS'
                      ? 'Todos'
                      : fil === 'VENCIDOS'
                      ? 'Vencidos'
                      : fil === 'CRITICOS'
                      ? '≤ 7 días'
                      : fil === 'PROXIMOS'
                      ? '8 a 30 días'
                      : 'Vigentes'}
                  </button>
                ))}
              </div>

              <div className="relative w-full md:w-72">
                <input
                  type="text"
                  placeholder="Buscar por producto, código o lote..."
                  value={busquedaLote}
                  onChange={(e) => setBusquedaLote(e.target.value)}
                  className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
                />
                {busquedaLote && (
                  <button
                    type="button"
                    onClick={() => setBusquedaLote('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {lotesFiltrados.length === 0 ? (
              <div className="p-12 text-center text-gray-400 dark:text-gray-500">
                <p className="font-semibold text-sm">No hay lotes que coincidan con los filtros</p>
                <p className="text-xs mt-1">
                  Al registrar ingresos de stock con fecha de vencimiento, aparecerán listados aquí para control FIFO.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Producto</th>
                      <th className="py-3 px-4">Lote</th>
                      <th className="py-3 px-4">Vencimiento</th>
                      <th className="py-3 px-4">Estado / Días</th>
                      <th className="py-3 px-4 text-center">Cantidad en Lote</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {lotesFiltrados.map((lote) => {
                      const prod = productos.find((p) => p.id === lote.producto_id)
                      const dias = calcularDiasHastaVencimiento(lote.fecha_vencimiento)
                      const estaVencido = dias < 0
                      const esCritico = dias >= 0 && dias <= 7
                      const esProximo = dias > 7 && dias <= 30

                      return (
                        <tr
                          key={lote.id}
                          className="hover:bg-gray-50/60 dark:hover:bg-gray-750/40 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <p className="font-bold text-gray-900 dark:text-gray-100">
                              {prod?.descripcion || 'Producto sin nombre'}
                            </p>
                            {prod?.codigo_barras && (
                              <p className="font-mono text-[11px] text-gray-400">
                                {prod.codigo_barras}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-gray-600 dark:text-gray-300">
                            {lote.numero_lote || '—'}
                          </td>
                          <td className="py-3 px-4 font-mono text-gray-900 dark:text-gray-100 font-bold">
                            {lote.fecha_vencimiento}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-black inline-flex items-center gap-1 ${
                                estaVencido
                                  ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                  : esCritico
                                  ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                                  : esProximo
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              }`}
                            >
                              {estaVencido
                                ? `Venció hace ${Math.abs(dias)} días`
                                : dias === 0
                                ? 'Vence hoy'
                                : `Vence en ${dias} días`}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-sm text-gray-900 dark:text-gray-100">
                            {lote.cantidad_actual} u.
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleDarDeBajaLote(lote.id)}
                              className="px-2.5 py-1 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 rounded-lg transition-colors active:scale-95 cursor-pointer"
                              title="Dar de baja por vencimiento (genera egreso de stock)"
                            >
                              Dar de baja
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

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
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 sm:hidden"
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
              <span className="text-[11px] text-gray-400">
                {productoSeleccionado?.es_pesable ? 'Kilogramos (decimales permitidos)' : 'Unidades enteras'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={inputCantidadRef}
                type="number"
                min={productoSeleccionado?.es_pesable ? '0.001' : '1'}
                step={productoSeleccionado?.es_pesable ? '0.001' : '1'}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder={productoSeleccionado?.es_pesable ? 'Ej: 1.5' : '1'}
                className="w-full text-base font-bold rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3.5 py-2.5 outline-none focus:border-indigo-500 shadow-xs"
              />
            </div>

            {/* Chips de incremento rápido */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-[11px] text-gray-400 font-medium mr-1">Rápido:</span>
              {(productoSeleccionado?.es_pesable ? [0.25, 0.5, 1, 2, 5, 10] : [1, 5, 10, 25, 50, 100]).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    const actual = parseFloat(cantidad) || 0
                    const nuevo = productoSeleccionado?.es_pesable
                      ? Number((actual + val).toFixed(3))
                      : Math.floor(actual) + val
                    setCantidad(String(nuevo))
                  }}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 active:scale-95 transition-all shadow-2xs"
                >
                  +{val}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCantidad(productoSeleccionado?.es_pesable ? '0.5' : '1')}
                className="px-2 py-1 text-[11px] font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-auto"
              >
                Reset ({productoSeleccionado?.es_pesable ? '0.5' : '1'})
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

          {/* Lote y Vencimiento opcional (si es INGRESO) */}
          {tipoMovimiento === 'INGRESO' && (
            <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wide">
                  Control de Lote y Vencimiento (Opcional)
                </label>
                {productoSeleccionado?.requiere_vencimiento && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                    Perecedero
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Fecha de Vencimiento
                  </label>
                  <input
                    type="date"
                    value={fechaVencimiento}
                    onChange={(e) => setFechaVencimiento(e.target.value)}
                    className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 outline-none focus:border-indigo-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                    N° de Lote (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: L2026-A"
                    value={numeroLote}
                    onChange={(e) => setNumeroLote(e.target.value)}
                    className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 outline-none focus:border-indigo-500 uppercase font-mono"
                  />
                </div>
              </div>
            </div>
          )}

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

      {/* Modal de visualización de Comprobante / Ticket */}
      <TicketReceiptModal
        isOpen={Boolean(ticketParaVer)}
        onClose={() => setTicketParaVer(null)}
        ticket={ticketParaVer}
      />
    </div>
  )
}
