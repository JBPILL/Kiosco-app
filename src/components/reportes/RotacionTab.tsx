import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { usePromocionStore } from '../../stores/promocionStore'
import {
  calcularRotacionInventario,
  type SegmentoRotacion,
  type ItemRotacion,
  type LineaVentaHistorial,
} from '../../lib/rotacionInventario'
import { exportarRotacionExcel } from '../../lib/exportUtils'
import { formatPrecio, formatFecha, getCachedProductos, getFechaLocal } from '../../lib/utils'
import { IconExportar } from '../ui/Icons'
import { Button } from '../ui/Button'
import { RefreshButton } from '../ui/RefreshButton'
import { Modal } from '../ui/Modal'
import { SearchInput } from '../ui/SearchInput'
import type { Producto } from '../../types/database'
import toast from 'react-hot-toast'
import { adjuntarCostosProtegidos, cargarCostosProtegidos } from '../../lib/productCostAccess'

type FiltroSegmento = 'TODOS' | SegmentoRotacion
type TipoLiquidacion = '2X1' | '20_OFF' | '30_OFF' | '50_OFF'

export function RotacionTab() {
  const navigate = useNavigate()
  const { usuario, kiosco } = useAuthStore()
  const kioscoId = usuario?.kiosco_id || kiosco?.id

  const [cargando, setCargando] = useState(true)
  const [productos, setProductos] = useState<Producto[]>([])
  const [lineasVentas, setLineasVentas] = useState<LineaVentaHistorial[]>([])

  const [filtroSegmento, setFiltroSegmento] = useState<FiltroSegmento>('TODOS')
  const [busqueda, setBusqueda] = useState('')

  // Modal de liquidación
  const [modalPromoOpen, setModalPromoOpen] = useState(false)
  const [productoParaLiquidar, setProductoParaLiquidar] = useState<ItemRotacion | null>(null)
  const [tipoLiquidacion, setTipoLiquidacion] = useState<TipoLiquidacion>('2X1')
  const [diasVigencia, setDiasVigencia] = useState(14)
  const [guardandoPromo, setGuardandoPromo] = useState(false)

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    const fecha90diasAtras = new Date(Date.now() - 90 * 86400000).toISOString()

    try {
      // 1. Cargar productos activos
      let queryProds = supabase
        .from('productos')
        .select('*, categoria:categorias(nombre, color)')
        .eq('activo', true)
        .order('descripcion')
        .limit(10000)

      if (kioscoId) {
        queryProds = queryProds.eq('kiosco_id', kioscoId)
      }

      const { data: dataProds, error: errProds } = await queryProds

      if (errProds) {
        console.warn('Fallo cargando productos para rotación:', errProds)
        const cached = getCachedProductos(kioscoId)
        setProductos(cached || [])
      } else {
        const costos = await cargarCostosProtegidos((dataProds || []).map((producto: Producto) => producto.id))
        setProductos(adjuntarCostosProtegidos((dataProds || []) as Producto[], costos))
      }

      // 2. Cargar ventas de los últimos 90 días con sus líneas
      let queryVentas = supabase
        .from('ventas')
        .select(`
          fecha_hora,
          detalles:detalles_venta(
            producto_id,
            cantidad,
            precio_unitario,
            sin_envase,
            es_devolucion_envase
          )
        `)
        .eq('estado', 'COMPLETADA')
        .gte('fecha_hora', fecha90diasAtras)
        .order('fecha_hora', { ascending: false })
        .limit(10000)

      if (kioscoId) {
        queryVentas = queryVentas.eq('kiosco_id', kioscoId)
      }

      const { data: dataVentas, error: errVentas } = await queryVentas

      if (errVentas) {
        console.warn('Aviso cargando historial de ventas para rotación:', errVentas)
        setLineasVentas([])
      } else {
        const ventas = (dataVentas || []) as {
          fecha_hora: string
          detalles: { producto_id: string; cantidad: number; es_devolucion_envase: boolean }[] | null
        }[]
        const costosVentas = await cargarCostosProtegidos(ventas.flatMap((venta) => (venta.detalles || []).map((detalle) => detalle.producto_id)))
        const costosPorId = new Map(costosVentas.map((costo) => [costo.producto_id, Number(costo.precio_costo) || 0]))
        const lineasPlanas: LineaVentaHistorial[] = []
        if (ventas) {
          for (const v of ventas) {
            if (!v.detalles) continue
            for (const d of v.detalles) {
              lineasPlanas.push({
                producto_id: d.producto_id,
                cantidad: Number(d.cantidad) || 0,
                precio_costo: costosPorId.get(d.producto_id) || 0,
                fecha_hora: v.fecha_hora,
                es_devolucion_envase: Boolean(d.es_devolucion_envase),
              })
            }
          }
        }
        setLineasVentas(lineasPlanas)
      }
    } catch (err) {
      console.error('Error general calculando rotación:', err)
      toast.error('Error cargando datos de rotación')
    } finally {
      setCargando(false)
    }
  }, [kioscoId])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  // Cálculo de métricas puro
  const metricas = useMemo(() => {
    return calcularRotacionInventario(productos, lineasVentas, new Date(), 90)
  }, [productos, lineasVentas])

  // Filtro de items para la tabla
  const itemsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return metricas.items.filter((it) => {
      if (filtroSegmento !== 'TODOS' && it.segmento !== filtroSegmento) {
        return false
      }
      if (q) {
        const desc = it.producto.descripcion.toLowerCase()
        const cb = (it.producto.codigo_barras || '').toLowerCase()
        return desc.includes(q) || cb.includes(q)
      }
      return true
    })
  }, [metricas.items, filtroSegmento, busqueda])

  const handleExportarExcel = async () => {
    try {
      await exportarRotacionExcel(metricas, kiosco?.nombre || 'Kiosco')
      toast.success('Informe de rotación exportado a Excel')
    } catch (err) {
      console.error('Error exportando rotación a Excel:', err)
      toast.error('Error al exportar archivo')
    }
  }

  const handleAbrirLiquidar = (it: ItemRotacion) => {
    setProductoParaLiquidar(it)
    setTipoLiquidacion('2X1')
    setDiasVigencia(14)
    setModalPromoOpen(true)
  }

  const handleConfirmarLiquidacion = async () => {
    if (!productoParaLiquidar || !kioscoId) return

    setGuardandoPromo(true)
    const hoyIso = getFechaLocal(new Date())
    const finDate = new Date(Date.now() + diasVigencia * 86400000)
    const finIso = getFechaLocal(finDate)

    const prod = productoParaLiquidar.producto
    let tipoPromo: 'NXM' | 'PORCENTAJE' = 'NXM'
    let cantMinima = 2
    let cantPaga: number | null = 1
    let descPorcentaje: number | null = null
    let nombrePromo = `Liquidación 2x1 ${prod.descripcion}`

    if (tipoLiquidacion === '2X1') {
      tipoPromo = 'NXM'
      cantMinima = 2
      cantPaga = 1
      nombrePromo = `Liquidación 2x1 ${prod.descripcion}`
    } else if (tipoLiquidacion === '20_OFF') {
      tipoPromo = 'PORCENTAJE'
      cantMinima = 1
      cantPaga = null
      descPorcentaje = 20
      nombrePromo = `Liquidación 20% OFF ${prod.descripcion}`
    } else if (tipoLiquidacion === '30_OFF') {
      tipoPromo = 'PORCENTAJE'
      cantMinima = 1
      cantPaga = null
      descPorcentaje = 30
      nombrePromo = `Liquidación 30% OFF ${prod.descripcion}`
    } else if (tipoLiquidacion === '50_OFF') {
      tipoPromo = 'PORCENTAJE'
      cantMinima = 1
      cantPaga = null
      descPorcentaje = 50
      nombrePromo = `Liquidación 50% OFF ${prod.descripcion}`
    }

    try {
      const ok = await usePromocionStore.getState().crearPromocion({
        kiosco_id: kioscoId,
        nombre: nombrePromo,
        tipo: tipoPromo,
        producto_id: prod.id,
        categoria_id: null,
        cantidad_minima: cantMinima,
        cantidad_paga: cantPaga,
        precio_unitario_promo: null,
        descuento_porcentaje: descPorcentaje,
        precio_combo: null,
        items_combo: null,
        dias_semana: [0, 1, 2, 3, 4, 5, 6],
        fecha_inicio: hoyIso,
        fecha_fin: finIso,
        activo: true,
      })

      if (ok) {
        toast.success(`Promoción creada: "${nombrePromo}" válida por ${diasVigencia} días`, {
          icon: '🏷️',
        })
        setModalPromoOpen(false)
        setProductoParaLiquidar(null)
      } else {
        toast.error('No se pudo guardar la promoción de liquidación')
      }
    } catch (err) {
      console.error('Error creando promoción:', err)
      toast.error('Error al crear promoción')
    } finally {
      setGuardandoPromo(false)
    }
  }

  const handleDevolverAProveedor = (it: ItemRotacion) => {
    navigate('/proveedores', {
      state: {
        productoId: it.producto.id,
        proveedorId: it.producto.proveedor_id || undefined,
      },
    })
  }

  const getBadgeSegmento = (segmento: SegmentoRotacion, nuncaVendido = false) => {
    switch (segmento) {
      case 'ACTIVA':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-semibold whitespace-normal leading-relaxed bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            Activa (0-30d)
          </span>
        )
      case 'ALERTA':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-semibold whitespace-normal leading-relaxed bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
            Alerta (31-60d)
          </span>
        )
      case 'ESTANCADO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-semibold whitespace-normal leading-relaxed bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border border-orange-200 dark:border-orange-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
            Estancado (61-90d)
          </span>
        )
      case 'MUERTO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-semibold whitespace-normal leading-relaxed bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
            {nuncaVendido ? 'Sin ventas registradas' : 'Stock Muerto (>90d)'}
          </span>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Header con KPIs Ejecutivos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Capital Inmovilizado */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 shadow-md dark:shadow-black/20 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 min-h-[26px]">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400 truncate">
              Capital Inmovilizado (&gt;30d)
            </span>
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-bold whitespace-nowrap shrink-0 bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60">
              {metricas.porcentajeInmovilizado}%
            </span>
          </div>
          <div>
            <p className="text-2xl font-black text-gray-900 dark:text-gray-100 mt-2">
              {formatPrecio(metricas.capitalInmovilizadoTotal)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Dinero estancado en stock sin rotar
            </p>
          </div>
        </div>

        {/* KPI 2: Artículos en Riesgo */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-md dark:shadow-black/20 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 min-h-[26px]">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">
              Artículos Inmovilizados
            </span>
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-bold whitespace-nowrap shrink-0 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
              {metricas.totalProductosAnalizados} analizados
            </span>
          </div>
          <div>
            <p className="text-2xl font-black text-gray-900 dark:text-gray-100 mt-2">
              {metricas.totalProductosInmovilizados}{' '}
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">artículos</span>
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
              {metricas.conteoPorSegmento.MUERTO} en stock muerto
            </p>
          </div>
        </div>

        {/* KPI 3: Índice de Rotación */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 shadow-md dark:shadow-black/20 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 min-h-[26px]">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 truncate">
              Índice de Rotación (90d)
            </span>
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-bold whitespace-nowrap shrink-0 bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/60">
              CMV / Stock
            </span>
          </div>
          <div>
            <p className="text-2xl font-black text-gray-900 dark:text-gray-100 mt-2">
              {metricas.indiceRotacion !== null ? `${metricas.indiceRotacion}x` : '—'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              CMV del período: {formatPrecio(metricas.cmvPeriodo)}
            </p>
          </div>
        </div>

        {/* KPI 4: Capital Total Inventario */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-md dark:shadow-black/20 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 min-h-[26px]">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">
              Inventario Total a Costo
            </span>
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-bold whitespace-nowrap shrink-0 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60">
              {metricas.conteoPorSegmento.ACTIVA} activos
            </span>
          </div>
          <div>
            <p className="text-2xl font-black text-gray-900 dark:text-gray-100 mt-2">
              {formatPrecio(metricas.capitalTotalInventario)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Valuación de compra total de stock disponible
            </p>
          </div>
        </div>
      </div>

      {/* 2. Barra de Control: Filtros por segmento + Buscador + Botón Exportar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Segmented Control de Filtros */}
          <div className="flex flex-wrap items-center max-w-full bg-gray-100 dark:bg-gray-800/90 p-1 rounded-xl border border-gray-200 dark:border-gray-700 self-start md:self-auto gap-1">
            <button
              type="button"
              onClick={() => setFiltroSegmento('TODOS')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                filtroSegmento === 'TODOS'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-xs border border-gray-200 dark:border-gray-600'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
              }`}
            >
              <span>Todos</span>
              <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                {metricas.items.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFiltroSegmento('ACTIVA')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                filtroSegmento === 'ACTIVA'
                  ? 'bg-white dark:bg-gray-700 text-emerald-700 dark:text-emerald-400 shadow-xs border border-emerald-200 dark:border-emerald-800'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>Activa</span>
              <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">
                {metricas.conteoPorSegmento.ACTIVA}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFiltroSegmento('ALERTA')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                filtroSegmento === 'ALERTA'
                  ? 'bg-white dark:bg-gray-700 text-amber-700 dark:text-amber-400 shadow-xs border border-amber-200 dark:border-amber-800'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>Alerta</span>
              <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300">
                {metricas.conteoPorSegmento.ALERTA}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFiltroSegmento('ESTANCADO')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                filtroSegmento === 'ESTANCADO'
                  ? 'bg-white dark:bg-gray-700 text-orange-700 dark:text-orange-400 shadow-xs border border-orange-200 dark:border-orange-800'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
              <span>Estancado</span>
              <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-orange-100 dark:bg-orange-950/70 text-orange-700 dark:text-orange-300">
                {metricas.conteoPorSegmento.ESTANCADO}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFiltroSegmento('MUERTO')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                filtroSegmento === 'MUERTO'
                  ? 'bg-white dark:bg-gray-700 text-rose-700 dark:text-rose-400 shadow-xs border border-rose-200 dark:border-rose-800'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
              <span>Stock Muerto</span>
              <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300">
                {metricas.conteoPorSegmento.MUERTO}
              </span>
            </button>
          </div>

          {/* Exportar Excel */}
          <div className="flex items-center gap-2">
            <RefreshButton refreshing={cargando} onClick={() => void cargarDatos()} label="Actualizar rotación" />
            <Button
              size="sm"
              variant="secondary"
              onClick={handleExportarExcel}
              disabled={metricas.items.length === 0}
              className="flex items-center gap-1.5"
            >
              <IconExportar className="w-4 h-4 text-emerald-600" />
              <span>Exportar Excel</span>
            </Button>
          </div>
        </div>

        {/* Buscador */}
        <div className="pt-1">
          <SearchInput
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onClear={() => setBusqueda('')}
            placeholder="Buscar por nombre de producto o código de barras..."
            className="w-full sm:max-w-md"
          />
        </div>
      </div>

      {/* 3. Tabla de Productos con Rotación y Acciones */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-md dark:shadow-black/20 overflow-hidden">
        {cargando ? (
          <div className="py-16 text-center text-gray-500 dark:text-gray-400">
            <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm font-medium">Analizando rotación del catálogo y ventas...</p>
          </div>
        ) : itemsFiltrados.length === 0 ? (
          <div className="py-16 text-center text-gray-500 dark:text-gray-400">
            <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
              No se encontraron artículos para este filtro
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Modificá el segmento seleccionado o el término de búsqueda.
            </p>
          </div>
        ) : (
          <div className="w-full min-w-0">
            <table className="block lg:table w-full table-fixed text-left text-xs [&_th]:align-middle [&_td]:align-middle [&_td]:break-words">
              <thead className="hidden lg:table-header-group bg-gray-50 dark:bg-gray-900/60 text-gray-600 dark:text-gray-400 uppercase text-[10px] font-bold border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 w-[24%]">Artículo</th>
                  <th className="px-3 py-3 text-right">Stock</th>
                  <th className="px-3 py-3 text-right">Costo / Precio</th>
                  <th className="px-3 py-3 text-right font-black text-rose-600 dark:text-rose-400">
                    Capital Inmov.
                  </th>
                  <th className="px-3 py-3 text-center">Movimiento / Última venta</th>
                  <th className="px-3 py-3 text-center w-[17%]">Estado</th>
                  <th className="px-4 py-3 text-center w-[12%]">Acciones</th>
                </tr>
              </thead>
              <tbody className="block lg:table-row-group divide-y divide-gray-100 dark:divide-gray-700/60">
                {itemsFiltrados.map((it) => {
                  return (
                    <tr
                      key={it.producto.id}
                      className="grid grid-cols-2 sm:grid-cols-3 lg:table-row hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors"
                    >
                      <td className="block lg:table-cell col-span-2 sm:col-span-3 px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                        <div className="leading-relaxed break-words" title={it.producto.descripcion}>
                          {it.producto.descripcion}
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono break-all mt-1">
                          {it.producto.codigo_barras || 'Sin código'}
                        </div>
                      </td>
                      <td className="block lg:table-cell px-3 py-3 lg:text-right font-semibold text-gray-800 dark:text-gray-200">
                        <span className="block lg:hidden mb-1 text-[10px] font-normal text-gray-500">Stock</span>
                        {it.stock} {it.producto.es_pesable ? it.producto.unidad_medida || 'KG' : 'u.'}
                      </td>
                      <td className="block lg:table-cell px-3 py-3 lg:text-right text-gray-800 dark:text-gray-200 tabular-nums">
                        <span className="block lg:hidden mb-1 text-[10px] text-gray-500">Costo / Precio</span>
                        <span className="block text-gray-500 dark:text-gray-400" title="Costo unitario">{formatPrecio(it.precioCosto)}</span>
                        <span className="block mt-1 font-semibold" title="Precio de venta">{formatPrecio(it.precioVenta)}</span>
                      </td>
                      <td className="block lg:table-cell px-3 py-3 lg:text-right font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                        <span className="block lg:hidden mb-1 text-[10px] font-normal text-gray-500">Capital inmovilizado</span>
                        {formatPrecio(it.capitalInmovilizado)}
                      </td>
                      <td className="block lg:table-cell px-3 py-3 lg:text-center text-xs text-gray-500 dark:text-gray-400">
                        <span className="block lg:hidden mb-1 text-[10px]">Movimiento / Última venta</span>
                        <span className="block font-semibold text-gray-700 dark:text-gray-300">{it.diasSinMovimiento} días</span>
                        <span className="block mt-1 text-[10px]">{it.ultimaVentaFecha ? formatFecha(it.ultimaVentaFecha) : (
                          <span className="text-rose-500 font-semibold">Nunca vendido</span>
                        )}</span>
                      </td>
                      <td className="block lg:table-cell px-3 py-3 lg:text-center">
                        <span className="block lg:hidden mb-1 text-[10px] text-gray-500">Estado</span>
                        {getBadgeSegmento(it.segmento, !it.ultimaVentaFecha)}
                      </td>
                      <td className="block lg:table-cell px-3 py-3 lg:text-center">
                        <div className="flex flex-wrap items-center lg:justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleAbrirLiquidar(it)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors cursor-pointer whitespace-nowrap"
                            title="Crear promoción de liquidación"
                          >
                            Liquidar
                          </button>
                          {it.producto.proveedor_id && (
                            <button
                              type="button"
                              onClick={() => handleDevolverAProveedor(it)}
                              className="px-2 py-1 text-xs font-semibold rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                              title="Gestionar devolución o compra al proveedor"
                            >
                              ↩ Proveedor
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Modal de Liquidación Rápida con Promoción */}
      <Modal
        isOpen={modalPromoOpen}
        onClose={() => {
          if (!guardandoPromo) {
            setModalPromoOpen(false)
            setProductoParaLiquidar(null)
          }
        }}
        title="Liquidar Artículo con Promoción"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setModalPromoOpen(false)
                setProductoParaLiquidar(null)
              }}
              disabled={guardandoPromo}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmarLiquidacion}
              disabled={guardandoPromo}
            >
              {guardandoPromo ? 'Creando promoción...' : 'Confirmar y Activar Promo'}
            </Button>
          </div>
        }
      >
        {productoParaLiquidar && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase">
                Artículo Seleccionado
              </p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                {productoParaLiquidar.producto.descripcion}
              </p>
              <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-300 mt-2">
                <span>
                  Stock disponible:{' '}
                  <strong>{productoParaLiquidar.stock} u.</strong>
                </span>
                <span>
                  Precio actual:{' '}
                  <strong>{formatPrecio(productoParaLiquidar.precioVenta)}</strong>
                </span>
                <span>
                  Costo: <strong>{formatPrecio(productoParaLiquidar.precioCosto)}</strong>
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-2">
                Elegí la oferta de liquidación:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTipoLiquidacion('2X1')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    tipoLiquidacion === '2X1'
                      ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/60 ring-2 ring-indigo-500'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <p className="font-bold text-sm text-gray-900 dark:text-gray-100">Promo 2x1</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Lleva 2 unidades, paga 1
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setTipoLiquidacion('20_OFF')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    tipoLiquidacion === '20_OFF'
                      ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/60 ring-2 ring-indigo-500'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <p className="font-bold text-sm text-gray-900 dark:text-gray-100">20% OFF</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Descuento directo por unidad
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setTipoLiquidacion('30_OFF')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    tipoLiquidacion === '30_OFF'
                      ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/60 ring-2 ring-indigo-500'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <p className="font-bold text-sm text-gray-900 dark:text-gray-100">30% OFF</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Mayor incentivo de rotación
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setTipoLiquidacion('50_OFF')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    tipoLiquidacion === '50_OFF'
                      ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/60 ring-2 ring-indigo-500'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <p className="font-bold text-sm text-rose-600 dark:text-rose-400">50% OFF</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Liquidación total al costo
                  </p>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">
                Vigencia de la oferta:
              </label>
              <select
                value={diasVigencia}
                onChange={(e) => setDiasVigencia(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
              >
                <option value={7}>7 días (1 semana)</option>
                <option value={14}>14 días (2 semanas - Recomendado)</option>
                <option value={30}>30 días (1 mes)</option>
              </select>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
