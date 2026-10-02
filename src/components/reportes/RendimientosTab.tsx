import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { formatPrecio, formatFecha, labelMedioPago } from '../../lib/utils'
import { exportarRendimientosDuenoExcel, type RendimientoMesDuenoExport, type DetalleVentaRendimientoExport } from '../../lib/exportUtils'
import { Button } from '../ui/Button'
import toast from 'react-hot-toast'

const NOMBRES_MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

const NOMBRES_MESES_CORTOS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
]

interface VentaRendimiento {
  id: string
  fecha_hora: string
  total: number
  estado: string
  afip_nro_comprobante?: number | null
  usuario?: { nombre: string } | null
  pagos: { medio_pago: string; monto: number }[]
  detalles: { cantidad: number; subtotal: number }[]
}

export function RendimientosTab() {
  const { usuario, kiosco } = useAuthStore()
  const kid = usuario?.kiosco_id || kiosco?.id

  const fechaHoy = new Date()
  const anioActual = fechaHoy.getFullYear()
  const mesActual = fechaHoy.getMonth() + 1 // 1 a 12

  const [anioSeleccionado, setAnioSeleccionado] = useState<number>(anioActual)
  const [mesSeleccionado, setMesSeleccionado] = useState<number | 'TODOS'>(mesActual)
  const [busquedaDetalle, setBusquedaDetalle] = useState('')
  const [filtroMedio, setFiltroMedio] = useState<string>('TODOS')
  const [tablaRendimientosAbierta, setTablaRendimientosAbierta] = useState(false)
  const [ventasAnio, setVentasAnio] = useState<VentaRendimiento[]>([])
  const [cargando, setCargando] = useState(true)
  const [exportando, setExportando] = useState(false)

  // Cargar ventas de todo el año seleccionado para el comercio activo
  const cargarVentasAnio = useCallback(async () => {
    if (!kid) return
    setCargando(true)

    const inicioISO = `${anioSeleccionado}-01-01T00:00:00.000Z`
    const finISO = `${anioSeleccionado}-12-31T23:59:59.999Z`

    try {
      const { data, error } = await supabase
        .from('ventas')
        .select(`
          id, fecha_hora, total, estado, afip_nro_comprobante,
          usuario:usuarios(nombre),
          pagos:pagos_venta(medio_pago, monto),
          detalles:detalles_venta(cantidad, subtotal)
        `)
        .eq('kiosco_id', kid)
        .eq('estado', 'COMPLETADA')
        .gte('fecha_hora', inicioISO)
        .lte('fecha_hora', finISO)
        .order('fecha_hora', { ascending: false })
        .limit(15000)

      if (error) {
        console.error('Error cargando ventas anuales:', error)
        toast.error('No se pudieron cargar los datos de rendimiento')
        return
      }

      setVentasAnio((data || []) as unknown as VentaRendimiento[])
    } catch (err: any) {
      console.error('Error en cargarVentasAnio:', err)
      toast.error('Error de conexión al cargar rendimientos')
    } finally {
      setCargando(false)
    }
  }, [kid, anioSeleccionado])

  useEffect(() => {
    cargarVentasAnio()
  }, [cargarVentasAnio])

  // Años disponibles en base al historial del comercio
  const aniosDisponibles = useMemo(() => {
    const setAnios = new Set<number>([anioActual, anioActual - 1])
    for (const v of ventasAnio) {
      if (v.fecha_hora) {
        const d = new Date(v.fecha_hora)
        if (!isNaN(d.getFullYear())) {
          setAnios.add(d.getFullYear())
        }
      }
    }
    return Array.from(setAnios).sort((a, b) => b - a)
  }, [ventasAnio, anioActual])

  // Ventas agrupadas y filtradas por el mes seleccionado
  const ventasPeriodo = useMemo(() => {
    if (mesSeleccionado === 'TODOS') return ventasAnio
    return ventasAnio.filter((v) => {
      const d = new Date(v.fecha_hora)
      return d.getMonth() + 1 === mesSeleccionado
    })
  }, [ventasAnio, mesSeleccionado])

  // 1. Métricas Clave del Período (KPIs)
  const kpisPeriodo = useMemo(() => {
    const totalFacturado = ventasPeriodo.reduce((acc, v) => acc + Number(v.total || 0), 0)
    const cantidadTickets = ventasPeriodo.length
    const ticketPromedio = cantidadTickets > 0 ? totalFacturado / cantidadTickets : 0

    let totalArticulos = 0
    for (const v of ventasPeriodo) {
      for (const det of v.detalles || []) {
        totalArticulos += Number(det.cantidad || 0)
      }
    }

    // Comparativa vs mes anterior si hay mes seleccionado
    let variacionVsAnterior: number | null = null
    let textoComparativa = 'Período completo'

    if (mesSeleccionado !== 'TODOS') {
      const mesAnt = mesSeleccionado - 1
      if (mesAnt >= 1) {
        const ventasMesAnt = ventasAnio.filter((v) => {
          const d = new Date(v.fecha_hora)
          return d.getMonth() + 1 === mesAnt
        })
        const factMesAnt = ventasMesAnt.reduce((acc, v) => acc + Number(v.total || 0), 0)
        if (factMesAnt > 0) {
          variacionVsAnterior = ((totalFacturado - factMesAnt) / factMesAnt) * 100
          textoComparativa = `${variacionVsAnterior >= 0 ? '+' : ''}${variacionVsAnterior.toFixed(1)}% vs ${NOMBRES_MESES[mesAnt - 1]}`
        } else if (totalFacturado > 0) {
          variacionVsAnterior = 100
          textoComparativa = '+100% vs mes anterior ($0 previo)'
        } else {
          textoComparativa = 'Sin ventas en mes previo'
        }
      } else {
        textoComparativa = 'Primer mes del año'
      }
    } else {
      textoComparativa = `Consolidado anual ${anioSeleccionado}`
    }

    return {
      totalFacturado,
      cantidadTickets,
      ticketPromedio,
      totalArticulos,
      variacionVsAnterior,
      textoComparativa,
    }
  }, [ventasPeriodo, ventasAnio, mesSeleccionado, anioSeleccionado])

  // 2. Evolución mensual (Enero a Diciembre)
  const datosPorMesDelAnio = useMemo(() => {
    const meses = Array.from({ length: 12 }, (_, i) => {
      const numMes = i + 1
      const ventasDelMes = ventasAnio.filter((v) => {
        const d = new Date(v.fecha_hora)
        return d.getMonth() + 1 === numMes
      })

      const totalVentas = ventasDelMes.reduce((acc, v) => acc + Number(v.total || 0), 0)
      const cantidadTickets = ventasDelMes.length
      const ticketPromedio = cantidadTickets > 0 ? totalVentas / cantidadTickets : 0

      // Medio de pago preponderante
      const conteoMedios = new Map<string, number>()
      for (const v of ventasDelMes) {
        for (const p of v.pagos || []) {
          conteoMedios.set(p.medio_pago, (conteoMedios.get(p.medio_pago) || 0) + Number(p.monto || 0))
        }
      }
      let medioPrincipal = '—'
      let maxMonto = 0
      for (const [m, total] of conteoMedios.entries()) {
        if (total > maxMonto) {
          maxMonto = total
          medioPrincipal = labelMedioPago(m)
        }
      }

      return {
        numeroMes: numMes,
        nombre: NOMBRES_MESES[i],
        nombreCorto: NOMBRES_MESES_CORTOS[i],
        totalVentas,
        cantidadTickets,
        ticketPromedio,
        medioPrincipal,
        variacionPorcentaje: null as number | null,
      }
    })

    // Calcular variación con el mes previo
    for (let i = 1; i < meses.length; i++) {
      const prev = meses[i - 1].totalVentas
      const curr = meses[i].totalVentas
      if (prev > 0) {
        meses[i].variacionPorcentaje = ((curr - prev) / prev) * 100
      } else if (curr > 0) {
        meses[i].variacionPorcentaje = 100
      }
    }

    return meses
  }, [ventasAnio])

  const maxMontoMensual = useMemo(() => {
    return Math.max(1, ...datosPorMesDelAnio.map((m) => m.totalVentas))
  }, [datosPorMesDelAnio])

  // 3. Desglose por Medio de Pago en el período
  const desgloseMediosPago = useMemo(() => {
    const mapa = new Map<string, { total: number; count: number }>()

    for (const v of ventasPeriodo) {
      if (v.pagos && v.pagos.length > 0) {
        for (const p of v.pagos) {
          const actual = mapa.get(p.medio_pago) || { total: 0, count: 0 }
          mapa.set(p.medio_pago, {
            total: actual.total + Number(p.monto || 0),
            count: actual.count + 1,
          })
        }
      } else {
        const actual = mapa.get('EFECTIVO') || { total: 0, count: 0 }
        mapa.set('EFECTIVO', {
          total: actual.total + Number(v.total || 0),
          count: actual.count + 1,
        })
      }
    }

    const totalPeriodo = kpisPeriodo.totalFacturado || 1
    const lista = Array.from(mapa.entries()).map(([medio, val]) => ({
      medio: labelMedioPago(medio),
      total: val.total,
      count: val.count,
      porcentaje: Math.min(100, (val.total / totalPeriodo) * 100),
    }))

    return lista.sort((a, b) => b.total - a.total)
  }, [ventasPeriodo, kpisPeriodo.totalFacturado])

  // 4. Detalle de tickets filtrados
  const transaccionesFiltradas = useMemo(() => {
    return ventasPeriodo.filter((v) => {
      // Filtro por medio de pago
      if (filtroMedio !== 'TODOS') {
        const tieneMedio = (v.pagos || []).some((p) => p.medio_pago === filtroMedio)
        if (!tieneMedio && !(v.pagos?.length === 0 && filtroMedio === 'EFECTIVO')) {
          return false
        }
      }

      // Filtro por buscador (ticket o cajero)
      if (busquedaDetalle.trim()) {
        const q = busquedaDetalle.toLowerCase()
        const idTicket = v.id.toLowerCase()
        const nroComprobante = v.afip_nro_comprobante ? String(v.afip_nro_comprobante) : ''
        const cajero = (v.usuario?.nombre || '').toLowerCase()

        if (!idTicket.includes(q) && !nroComprobante.includes(q) && !cajero.includes(q)) {
          return false
        }
      }

      return true
    })
  }, [ventasPeriodo, filtroMedio, busquedaDetalle])

  // 5. Exportar reporte ejecutivo a Excel con write-excel-file
  const handleExportarExcel = async () => {
    setExportando(true)
    try {
      const mesNombre =
        mesSeleccionado === 'TODOS'
          ? `Todo el Año (${anioSeleccionado})`
          : NOMBRES_MESES[(mesSeleccionado as number) - 1]

      const datosMesesExport: RendimientoMesDuenoExport[] = datosPorMesDelAnio.map((m) => ({
        numeroMes: m.numeroMes,
        nombre: m.nombre,
        nombreCorto: m.nombreCorto,
        totalVentas: m.totalVentas,
        cantidadTickets: m.cantidadTickets,
        ticketPromedio: m.ticketPromedio,
        variacionPorcentaje: m.variacionPorcentaje,
        medioPrincipal: m.medioPrincipal,
      }))

      const ventasExport: DetalleVentaRendimientoExport[] = transaccionesFiltradas.map((v) => ({
        id: v.id,
        fecha_hora: v.fecha_hora,
        nro_comprobante: v.afip_nro_comprobante,
        cajero: v.usuario?.nombre || 'Cajero',
        medio_pago: (v.pagos || []).map((p) => labelMedioPago(p.medio_pago)).join(', ') || 'Efectivo',
        total: Number(v.total || 0),
      }))

      await exportarRendimientosDuenoExcel({
        nombreKiosco: kiosco?.nombre || 'Comercio',
        anio: anioSeleccionado,
        mesNombre,
        totalFacturado: kpisPeriodo.totalFacturado,
        cantidadTickets: kpisPeriodo.cantidadTickets,
        ticketPromedio: kpisPeriodo.ticketPromedio,
        totalArticulos: kpisPeriodo.totalArticulos,
        datosMeses: datosMesesExport,
        mediosPago: desgloseMediosPago,
        ventas: ventasExport,
      })

      toast.success('Rendimientos exportados en formato Excel corporativo (.xlsx)')
    } catch (err: any) {
      console.error('Error al exportar rendimientos Excel:', err)
      toast.error('No se pudo generar el archivo Excel')
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Barra Superior con Selector de Período y Acciones */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>Rendimientos Mensuales y Evolución Comercial</span>
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Analítica de facturación, ticket promedio, distribución de cobros y rendimiento de tu negocio
          </p>
        </div>

        {/* Controles de Período y Botones */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de Año */}
          <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700/60 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Año:</span>
            <select
              value={anioSeleccionado}
              onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
              aria-label="Seleccionar año de reporte"
              className="bg-transparent text-sm font-bold text-gray-800 dark:text-white focus:outline-hidden cursor-pointer"
            >
              {aniosDisponibles.map((a) => (
                <option key={a} value={a} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Selector de Mes */}
          <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700/60 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Mes:</span>
            <select
              value={mesSeleccionado}
              onChange={(e) =>
                setMesSeleccionado(e.target.value === 'TODOS' ? 'TODOS' : Number(e.target.value))
              }
              aria-label="Seleccionar mes de reporte"
              className="bg-transparent text-sm font-bold text-gray-800 dark:text-white focus:outline-hidden cursor-pointer"
            >
              <option value="TODOS" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                Todo el año ({anioSeleccionado})
              </option>
              {NOMBRES_MESES.map((nombre, idx) => (
                <option
                  key={idx + 1}
                  value={idx + 1}
                  className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  {nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Botón Actualizar compacto */}
          <button
            type="button"
            onClick={cargarVentasAnio}
            disabled={cargando}
            title="Recargar ventas y métricas del año seleccionado"
            className="inline-flex items-center justify-center p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer shadow-2xs shrink-0"
          >
            <svg
              className={`w-4 h-4 ${cargando ? 'animate-spin text-indigo-600' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
            </svg>
          </button>

          {/* Botón Exportar Excel con diseño sobrio */}
          <Button
            variant="primary"
            size="sm"
            onClick={handleExportarExcel}
            loading={exportando}
            className="text-xs font-bold shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            title="Descargar reporte corporativo de rendimientos en archivo Excel (.xlsx)"
          >
            <span>📥 Exportar Excel (.XLSX)</span>
          </Button>
        </div>
      </div>

      {/* Tarjetas de Métricas Clave (KPIs) - Diseño sobrio sin íconos genéricos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Ventas Totales Netas */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {mesSeleccionado === 'TODOS'
                ? `Ventas Totales (${anioSeleccionado})`
                : `Ventas en ${NOMBRES_MESES[(mesSeleccionado as number) - 1]}`}
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {formatPrecio(kpisPeriodo.totalFacturado)}
          </p>
          <div className="flex items-center gap-1.5 mt-1 text-xs">
            {kpisPeriodo.variacionVsAnterior !== null ? (
              <span
                className={`font-bold px-1.5 py-0.5 rounded-md ${
                  kpisPeriodo.variacionVsAnterior >= 0
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                    : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                }`}
              >
                {kpisPeriodo.textoComparativa}
              </span>
            ) : (
              <span className="text-gray-500 dark:text-gray-400">{kpisPeriodo.textoComparativa}</span>
            )}
          </div>
        </div>

        {/* KPI 2: Tickets Emitidos */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Tickets Emitidos</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {kpisPeriodo.cantidadTickets}
            <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 ml-1.5">
              operaciones
            </span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Ventas completadas en el período seleccionado
          </p>
        </div>

        {/* KPI 3: Ticket Promedio */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Ticket Promedio</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {formatPrecio(kpisPeriodo.ticketPromedio)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Monto promedio de compra por cada cliente atendido
          </p>
        </div>

        {/* KPI 4: Artículos Despachados */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between text-purple-600 dark:text-purple-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Artículos Despachados</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {Math.round(kpisPeriodo.totalArticulos)}
            <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 ml-1.5">
              unidades
            </span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {kpisPeriodo.cantidadTickets > 0
              ? `Promedio de ${(kpisPeriodo.totalArticulos / kpisPeriodo.cantidadTickets).toFixed(1)} art. por ticket`
              : 'Sin artículos registrados'}
          </p>
        </div>
      </div>

      {/* Gráfico de Barras Mensual Interactivo (Enero a Diciembre de anioSeleccionado) */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span>Evolución Mensual de Facturación ({anioSeleccionado})</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Hacé click sobre cualquier mes para filtrar y analizar sus ventas específicas
            </p>
          </div>

          {mesSeleccionado !== 'TODOS' && (
            <button
              onClick={() => setMesSeleccionado('TODOS')}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer self-start sm:self-auto"
            >
              ← Ver año completo ({anioSeleccionado})
            </button>
          )}
        </div>

        {/* Contenedor del Gráfico de 12 Barras */}
        <div className="pt-8 pb-2">
          <div className="grid grid-cols-12 gap-1.5 sm:gap-3 items-end h-56 border-b border-gray-200 dark:border-gray-700 px-1 sm:px-2">
            {datosPorMesDelAnio.map((m) => {
              const estaSeleccionado = mesSeleccionado === m.numeroMes
              const porcentajeAltura =
                maxMontoMensual > 0 ? Math.max(4, Math.round((m.totalVentas / maxMontoMensual) * 100)) : 4

              return (
                <div
                  key={m.numeroMes}
                  onClick={() => setMesSeleccionado(m.numeroMes)}
                  className="flex flex-col items-center h-full justify-end group cursor-pointer"
                  title={`${m.nombre}: ${formatPrecio(m.totalVentas)} (${m.cantidadTickets} tickets)`}
                >
                  {/* Etiqueta con el monto */}
                  <span
                    className={`text-[9px] sm:text-[10px] font-bold mb-1 transition-all truncate max-w-full ${
                      estaSeleccionado
                        ? 'text-indigo-600 dark:text-indigo-400 scale-105'
                        : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-800 dark:group-hover:text-gray-200'
                    }`}
                  >
                    {m.totalVentas > 0 ? `$${Math.round(m.totalVentas / 1000)}k` : '$0'}
                  </span>

                  {/* Barra vertical interactiva */}
                  <div
                    style={{ height: `${porcentajeAltura}%` }}
                    className={`w-full rounded-t-lg transition-all duration-300 relative ${
                      estaSeleccionado
                        ? 'bg-gradient-to-t from-indigo-600 to-indigo-500 shadow-md ring-2 ring-indigo-400 ring-offset-2 dark:ring-offset-gray-800'
                        : m.totalVentas > 0
                        ? 'bg-gradient-to-t from-indigo-300 to-indigo-400 dark:from-indigo-900/60 dark:to-indigo-600 group-hover:from-indigo-400 group-hover:to-indigo-500'
                        : 'bg-gray-100 dark:bg-gray-700/60 group-hover:bg-gray-200'
                    }`}
                  >
                    {/* Badge de cantidad de tickets en la barra */}
                    {m.cantidadTickets > 0 && porcentajeAltura > 20 && (
                      <span className="hidden sm:inline-block absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white/90">
                        {m.cantidadTickets}
                      </span>
                    )}
                  </div>

                  {/* Nombre del Mes */}
                  <span
                    className={`text-[10px] sm:text-xs font-semibold mt-2 transition-colors ${
                      estaSeleccionado
                        ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                        : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200'
                    }`}
                  >
                    {m.nombreCorto}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Segmentación y Desgloses: Medios de Pago y Resumen Comercial */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Desglose por Medio de Pago */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
            <span>Facturación por Medio de Pago</span>
          </h3>

          {desgloseMediosPago.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 py-4 text-center">
              No hay ventas registradas en este período.
            </p>
          ) : (
            <div className="space-y-3">
              {desgloseMediosPago.map((item) => (
                <div key={item.medio} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      {item.medio} ({item.count} ticket{item.count !== 1 ? 's' : ''})
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 dark:text-white">
                        {formatPrecio(item.total)}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 text-[11px] w-10 text-right">
                        {item.porcentaje.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${item.porcentaje}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resumen Comercial de Operaciones */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
              <span>Resumen Operativo del Período</span>
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-500 dark:text-gray-400">Total facturado en el año ({anioSeleccionado}):</span>
                <span className="font-bold text-gray-900 dark:text-white">
                  {formatPrecio(ventasAnio.reduce((s, v) => s + Number(v.total || 0), 0))}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-500 dark:text-gray-400">Total tickets anuales:</span>
                <span className="font-bold text-gray-900 dark:text-white">
                  {ventasAnio.length} ventas
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-500 dark:text-gray-400">Mes de mayor recaudación:</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {(() => {
                    const top = [...datosPorMesDelAnio].sort((a, b) => b.totalVentas - a.totalVentas)[0]
                    return top && top.totalVentas > 0
                      ? `${top.nombre} (${formatPrecio(top.totalVentas)})`
                      : 'Sin datos'
                  })()}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-gray-500 dark:text-gray-400">Participación del mes seleccionado:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {(() => {
                    const totalAnio = ventasAnio.reduce((s, v) => s + Number(v.total || 0), 0)
                    if (totalAnio <= 0) return '0.0%'
                    return `${((kpisPeriodo.totalFacturado / totalAnio) * 100).toFixed(1)}% del año`
                  })()}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex justify-between items-center">
            <span>Comercio:</span>
            <span className="font-bold text-gray-800 dark:text-gray-200">
              {kiosco?.nombre || 'Mi Comercio'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabla Comparativa de Rendimientos Mes a Mes (Desplegable para no ocupar espacio) */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xs transition-all">
        <button
          type="button"
          onClick={() => setTablaRendimientosAbierta((prev) => !prev)}
          className="w-full p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between text-left hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
        >
          <div>
            <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span>Tabla de Rendimientos Mensuales ({anioSeleccionado})</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
                12 Meses
              </span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {tablaRendimientosAbierta
                ? 'Hacé click para contraer la tabla y ahorrar espacio'
                : 'Hacé click para desplegar el historial consolidado con comparativa intermensual'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            <span>{tablaRendimientosAbierta ? 'Ocultar tabla' : 'Desplegar tabla'}</span>
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${tablaRendimientosAbierta ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </button>

        {tablaRendimientosAbierta && (
          <div className="overflow-x-auto">
            <table className="table-fixed w-full text-left text-xs">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[20%]" />
                <col className="w-[12%]" />
                <col className="w-[18%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
              </colgroup>
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 truncate">Mes</th>
                  <th className="px-4 py-3 truncate">Facturado Total</th>
                  <th className="px-4 py-3 text-center truncate">Tickets</th>
                  <th className="px-4 py-3 truncate">Ticket Promedio</th>
                  <th className="px-4 py-3 truncate">Variación Mes Previo</th>
                  <th className="px-4 py-3 truncate">Medio Principal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {datosPorMesDelAnio.map((m) => {
                  const esMesSeleccionado = mesSeleccionado === m.numeroMes
                  return (
                    <tr
                      key={m.numeroMes}
                      onClick={() => setMesSeleccionado(m.numeroMes)}
                      className={`hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 cursor-pointer transition-colors ${
                        esMesSeleccionado ? 'bg-indigo-50/70 dark:bg-indigo-950/40 font-semibold' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-gray-900 dark:text-white font-bold">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate">{m.nombre}</span>
                          {esMesSeleccionado && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-600 text-white font-bold shrink-0">
                              Activo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white font-bold truncate">
                        {formatPrecio(m.totalVentas)}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300 font-medium truncate">
                        {m.cantidadTickets}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 truncate">
                        {formatPrecio(m.ticketPromedio)}
                      </td>
                      <td className="px-4 py-3 truncate">
                        {m.variacionPorcentaje !== null ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${
                              m.variacionPorcentaje >= 0
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                            }`}
                          >
                            {m.variacionPorcentaje >= 0 ? '▲ +' : '▼ '}
                            {m.variacionPorcentaje.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 truncate">
                        {m.medioPrincipal}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detalle Individual de Tickets del Período */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span>Comprobantes y Ventas del Período ({transaccionesFiltradas.length})</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Listado individual de ventas efectuadas con desglose de medio de pago
            </p>
          </div>

          {/* Filtros de la tabla de detalle */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Buscar por ticket o cajero..."
              value={busquedaDetalle}
              onChange={(e) => setBusquedaDetalle(e.target.value)}
              aria-label="Buscar ventas"
              className="text-xs px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 text-gray-900 dark:text-gray-100 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-48 sm:w-56"
            />

            <select
              value={filtroMedio}
              onChange={(e) => setFiltroMedio(e.target.value)}
              aria-label="Filtrar por medio de pago"
              className="text-xs px-2.5 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 text-gray-800 dark:text-gray-200 focus:outline-hidden cursor-pointer"
            >
              <option value="TODOS">Todos los medios</option>
              <option value="EFECTIVO">Efectivo</option>
              <option value="MERCADO_PAGO">Mercado Pago</option>
              <option value="DEBITO">Débito</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="CREDITO">Crédito</option>
              <option value="CUENTA_CORRIENTE">Cuenta Corriente</option>
            </select>
          </div>
        </div>

        {transaccionesFiltradas.length === 0 ? (
          <div className="py-12 text-center text-gray-500 dark:text-gray-400 text-xs">
            <p className="font-semibold text-gray-800 dark:text-gray-200">
              No se encontraron ventas con los filtros seleccionados
            </p>
            <p className="mt-1">Probá cambiando el mes o los criterios de búsqueda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-fixed w-full text-left text-xs">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[22%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 truncate">Comprobante</th>
                  <th className="px-4 py-3 truncate">Fecha y Hora</th>
                  <th className="px-4 py-3 truncate">Cajero / Operador</th>
                  <th className="px-4 py-3 truncate">Medio de Pago</th>
                  <th className="px-4 py-3 text-right truncate">Total ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {transaccionesFiltradas.map((v) => {
                  const ticketStr = v.afip_nro_comprobante
                    ? `FC-${String(v.afip_nro_comprobante).padStart(8, '0')}`
                    : `T-${v.id.slice(0, 8).toUpperCase()}`

                  const mediosStr =
                    v.pagos && v.pagos.length > 0
                      ? v.pagos.map((p) => labelMedioPago(p.medio_pago)).join(', ')
                      : 'Efectivo'

                  return (
                    <tr
                      key={v.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-bold text-gray-900 dark:text-white truncate">
                        {ticketStr}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 truncate">
                        {formatFecha(v.fecha_hora)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 truncate">
                        {v.usuario?.nombre || 'Cajero'}
                      </td>
                      <td className="px-4 py-3 text-gray-800 dark:text-gray-200 font-medium truncate">
                        {mediosStr}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-gray-900 dark:text-white text-sm truncate">
                        {formatPrecio(v.total)}
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
