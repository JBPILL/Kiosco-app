import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useProveedorStore } from '../../stores/proveedorStore'
import { formatPrecio, getCachedProductos } from '../../lib/utils'
import { exportarStockInmovilizadoExcel, type ItemStockInmovilizado } from '../../lib/exportUtils'
import { SearchInput } from '../ui/SearchInput'
import { Button } from '../ui/Button'
import type { Producto, Categoria } from '../../types/database'
import toast from 'react-hot-toast'

export function StockInmovilizadoTab() {
  const { usuario, kiosco } = useAuthStore()
  const { proveedores, cargarProveedores } = useProveedorStore()

  const [diasFiltro, setDiasFiltro] = useState<number>(30)
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('TODAS')
  const [busqueda, setBusqueda] = useState<string>('')
  const [cargando, setCargando] = useState<boolean>(true)
  const [exportando, setExportando] = useState<boolean>(false)

  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [ultimasVentasMap, setUltimasVentasMap] = useState<Map<string, string>>(new Map())

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    const kioscoId = usuario?.kiosco_id || kiosco?.id

    try {
      // 1. Cargar proveedores si no están en memoria
      cargarProveedores()

      // 2. Cargar categorías
      let catQuery = supabase.from('categorias').select('*').order('nombre')
      if (kioscoId) catQuery = catQuery.eq('kiosco_id', kioscoId)
      const { data: catData } = await catQuery
      if (catData) setCategorias(catData)

      // 3. Cargar productos con stock > 0
      let prodQuery = supabase
        .from('productos')
        .select('*, categoria:categorias(id, nombre, color)')
        .eq('activo', true)
        .gt('stock_actual', 0)
        .order('descripcion')

      if (kioscoId) prodQuery = prodQuery.eq('kiosco_id', kioscoId)
      const { data: prodData, error: prodErr } = await prodQuery

      if (prodErr) {
        // Fallback a localStorage si estamos offline o en modo simulado
        const localCache = getCachedProductos(kioscoId)
        if (localCache && localCache.length > 0) {
          setProductos(localCache.filter((p: Producto) => p.activo && p.stock_actual > 0))
        }
      } else if (prodData) {
        setProductos(prodData)
      }

      // 4. Obtener las últimas ventas agrupadas por producto
      // Consultamos los detalles de venta de los últimos 180 días con la fecha de la venta
      const fechaLimite = new Date()
      fechaLimite.setDate(fechaLimite.getDate() - 180)

      let detallesQuery = supabase
        .from('detalles_venta')
        .select('producto_id, venta:ventas!inner(fecha_hora, estado, kiosco_id)')
        .gte('venta.fecha_hora', fechaLimite.toISOString())
        .eq('venta.estado', 'COMPLETADA')
        .order('venta(fecha_hora)', { ascending: false })

      if (kioscoId) {
        detallesQuery = detallesQuery.eq('venta.kiosco_id', kioscoId)
      }

      const { data: detData, error: detErr } = await detallesQuery

      const ultVentaMap = new Map<string, string>()
      if (!detErr && detData) {
        for (const item of detData as any[]) {
          const prodId = item.producto_id
          const fechaHora = item.venta?.fecha_hora
          if (prodId && fechaHora && !ultVentaMap.has(prodId)) {
            ultVentaMap.set(prodId, fechaHora)
          }
        }
      }
      setUltimasVentasMap(ultVentaMap)
    } catch (e) {
      console.warn('Error al calcular rotación de stock:', e)
    } finally {
      setCargando(false)
    }
  }, [usuario?.kiosco_id, kiosco?.id, cargarProveedores])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const proveedoresMap = useMemo(() => {
    const map = new Map<string, string>()
    proveedores.forEach((p) => map.set(p.id, p.nombre))
    return map
  }, [proveedores])

  // Calcular items inmovilizados
  const itemsInmovilizados = useMemo<ItemStockInmovilizado[]>(() => {
    const ahora = Date.now()
    const msPorDia = 1000 * 60 * 60 * 24
    const result: ItemStockInmovilizado[] = []

    for (const prod of productos) {
      if (prod.stock_actual <= 0 || prod.es_combo) continue

      const fechaUltima = ultimasVentasMap.get(prod.id)
      let diasSinVenta = 0

      if (fechaUltima) {
        const msDif = ahora - new Date(fechaUltima).getTime()
        diasSinVenta = Math.max(0, Math.floor(msDif / msPorDia))
      } else {
        const fechaCreacion = prod.fecha_creacion ? new Date(prod.fecha_creacion).getTime() : ahora
        const msDif = ahora - fechaCreacion
        diasSinVenta = Math.max(0, Math.floor(msDif / msPorDia))
      }

      const costo = prod.precio_costo || 0
      const venta = prod.precio_venta || 0
      const capCosto = prod.stock_actual * costo
      const capVenta = prod.stock_actual * venta

      result.push({
        id: prod.id,
        descripcion: prod.descripcion,
        codigo_barras: prod.codigo_barras,
        categoria_nombre: prod.categoria?.nombre || 'Sin categoría',
        proveedor_nombre: prod.proveedor_id ? (proveedoresMap.get(prod.proveedor_id) || undefined) : undefined,
        stock_actual: prod.stock_actual,
        precio_costo: costo,
        precio_venta: venta,
        capital_inmovilizado_costo: capCosto,
        capital_inmovilizado_venta: capVenta,
        dias_sin_ventas: diasSinVenta,
        fecha_ultima_venta: fechaUltima || null,
      })
    }

    return result
  }, [productos, ultimasVentasMap, proveedoresMap])

  // Filtrar según umbral de días, categoría y búsqueda
  const itemsFiltrados = useMemo(() => {
    return itemsInmovilizados.filter((it) => {
      // 1. Umbral de días
      if (it.dias_sin_ventas < diasFiltro) return false

      // 2. Filtro categoría
      if (categoriaFiltro !== 'TODAS') {
        const prod = productos.find((p) => p.id === it.id)
        if (prod?.categoria_id !== categoriaFiltro) return false
      }

      // 3. Búsqueda de texto
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim()
        const desc = it.descripcion.toLowerCase()
        const cod = (it.codigo_barras || '').toLowerCase()
        const cat = it.categoria_nombre.toLowerCase()
        const prov = (it.proveedor_nombre || '').toLowerCase()
        if (!desc.includes(q) && !cod.includes(q) && !cat.includes(q) && !prov.includes(q)) {
          return false
        }
      }

      return true
    }).sort((a, b) => b.capital_inmovilizado_costo - a.capital_inmovilizado_costo) // Ordenar por mayor capital parado
  }, [itemsInmovilizados, diasFiltro, categoriaFiltro, busqueda, productos])

  // Totales ejecutivos KPI
  const totalCapitalInmovilizadoCosto = useMemo(() => {
    return itemsFiltrados.reduce((sum, it) => sum + it.capital_inmovilizado_costo, 0)
  }, [itemsFiltrados])

  const totalCapitalInmovilizadoVenta = useMemo(() => {
    return itemsFiltrados.reduce((sum, it) => sum + it.capital_inmovilizado_venta, 0)
  }, [itemsFiltrados])

  const totalUnidadesInmovilizadas = useMemo(() => {
    return itemsFiltrados.reduce((sum, it) => sum + it.stock_actual, 0)
  }, [itemsFiltrados])

  const handleExportarExcel = async () => {
    if (itemsFiltrados.length === 0) {
      toast.error('No hay datos de stock inmovilizado para exportar con los filtros seleccionados')
      return
    }

    setExportando(true)
    try {
      await exportarStockInmovilizadoExcel(
        itemsFiltrados,
        kiosco?.nombre || 'AlPaso POS',
        diasFiltro
      )
      toast.success('Informe de stock inmovilizado exportado en formato Excel (.xlsx)')
    } catch (e) {
      console.error('Error exportando Excel de stock inmovilizado:', e)
      toast.error('No se pudo generar el archivo Excel')
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Encabezado y Selector de Umbral de Inactividad */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span>Mercadería Sin Rotación (Stock Inmovilizado)</span>
            <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 font-bold">
              {itemsFiltrados.length} artículos
            </span>
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Artículos con existencias físicas en el comercio sin registrar ventas en el período seleccionado.
          </p>
        </div>

        {/* Chips de Días Sin Venta */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 mr-1">Inactividad:</span>
          {[30, 60, 90, 180].map((dias) => (
            <button
              key={dias}
              type="button"
              onClick={() => setDiasFiltro(dias)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                diasFiltro === dias
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              +{dias} días
            </button>
          ))}
        </div>
      </div>

      {/* Tarjetas Ejecutivas KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Capital al costo */}
        <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-red-900 dark:text-red-200 uppercase tracking-wider">
              Capital Inmovilizado (Costo)
            </span>
            <span className="w-2 h-2 rounded-full bg-red-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-red-700 dark:text-red-300 mt-1">
            {formatPrecio(totalCapitalInmovilizadoCosto)}
          </div>
          <p className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-1">
            Dinero invertido parado en góndolas o depósito
          </p>
        </div>

        {/* Valor comercial potencial */}
        <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
              Valor de Venta Parado
            </span>
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-700 dark:text-amber-300 mt-1">
            {formatPrecio(totalCapitalInmovilizadoVenta)}
          </div>
          <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-1">
            Ingreso potencial estimado al liquidar la mercadería
          </p>
        </div>

        {/* Unidades paradas */}
        <div className="p-4 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Unidades Estancadas
            </span>
            <span className="w-2 h-2 rounded-full bg-slate-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 mt-1">
            {totalUnidadesInmovilizadas.toLocaleString('es-AR')}{' '}
            <span className="text-xs font-normal text-slate-500">un.</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Distribuidas en {itemsFiltrados.length} productos diferentes
          </p>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row gap-2.5 bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex-1">
          <SearchInput
            placeholder="Buscar por nombre, código o proveedor..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onClear={() => setBusqueda('')}
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-xs sm:text-sm focus:border-indigo-500 min-h-[36px]"
          >
            <option value="TODAS">Todas las categorías</option>
            {categorias.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.nombre}
              </option>
            ))}
          </select>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportarExcel}
            loading={exportando}
            disabled={itemsFiltrados.length === 0}
            className="flex items-center gap-1.5 whitespace-nowrap font-semibold border-gray-300 dark:border-gray-600"
            title="Descargar informe de mercadería inmovilizada en formato Excel (.xlsx)"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Exportar (.XLSX)</span>
          </Button>
        </div>
      </div>

      {/* Tabla de Productos Inmovilizados */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xs">
        {cargando ? (
          <div className="text-center py-12 text-gray-500">
            <div className="animate-spin h-7 w-7 border-3 border-red-600 border-t-transparent rounded-full mx-auto mb-2" />
            <span className="text-xs">Analizando rotación histórica de ventas...</span>
          </div>
        ) : itemsFiltrados.length === 0 ? (
          <div className="text-center py-12 p-4 text-gray-500 text-sm">
            <p className="font-semibold text-gray-800 dark:text-gray-200">
              No hay mercadería inmovilizada con más de {diasFiltro} días sin rotación.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Todos los productos activos con stock tuvieron movimiento comercial reciente o cumplen con el filtro.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[58vh]">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-200 uppercase text-[10px] tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="px-3.5 py-2.5">Producto</th>
                  <th className="px-3.5 py-2.5">Categoría</th>
                  <th className="px-3.5 py-2.5">Proveedor</th>
                  <th className="px-3.5 py-2.5 text-center">Stock Parado</th>
                  <th className="px-3.5 py-2.5 text-center">Días Inactivo</th>
                  <th className="px-3.5 py-2.5 text-center">Última Venta</th>
                  <th className="px-3.5 py-2.5 text-right">Costo Unit.</th>
                  <th className="px-3.5 py-2.5 text-right font-black">Capital Parado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {itemsFiltrados.map((it) => {
                  const esMuyCritico = it.dias_sin_ventas >= 90
                  const esCritico = it.dias_sin_ventas >= 60

                  return (
                    <tr key={it.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                      <td className="px-3.5 py-2.5">
                        <div className="font-bold text-gray-900 dark:text-gray-100">{it.descripcion}</div>
                        {it.codigo_barras && (
                          <span className="font-mono text-[10px] text-gray-400">{it.codigo_barras}</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-gray-600 dark:text-gray-300">
                        {it.categoria_nombre}
                      </td>
                      <td className="px-3.5 py-2.5 text-gray-600 dark:text-gray-300">
                        {it.proveedor_nombre ? (
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px]">
                            {it.proveedor_nombre}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <span className="font-black text-gray-900 dark:text-gray-100 text-sm">
                          {it.stock_actual}
                        </span>{' '}
                        <span className="text-[10px] text-gray-400">un.</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            esMuyCritico
                              ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                              : esCritico
                              ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800'
                              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                          }`}
                        >
                          +{it.dias_sin_ventas} días
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-center text-gray-500 dark:text-gray-400 text-[11px]">
                        {it.fecha_ultima_venta ? (
                          new Date(it.fecha_ultima_venta).toLocaleDateString('es-AR')
                        ) : (
                          <span className="italic text-gray-400">Sin ventas</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-medium text-gray-600 dark:text-gray-300">
                        {formatPrecio(it.precio_costo)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-black text-red-600 dark:text-red-400 text-sm font-mono">
                        {formatPrecio(it.capital_inmovilizado_costo)}
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
  )
}
