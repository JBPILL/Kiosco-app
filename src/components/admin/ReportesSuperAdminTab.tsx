import { useState, useEffect, useMemo } from 'react'
import { useAdminStore } from '../../stores/adminStore'
import { formatPrecio, formatFecha, labelMedioPago } from '../../lib/utils'
import { exportarRendimientosSuperAdminExcel } from '../../lib/exportUtils'
import { Button } from '../ui/Button'
import toast from 'react-hot-toast'

/**
 * Parsea año, mes y día de forma local sin desfasaje de zona horaria UTC.
 */
function parsePartesFecha(fechaStr?: string | null): { anio: number; mes: number; dia: number } {
  if (!fechaStr) return { anio: 0, mes: 0, dia: 0 }
  if (fechaStr.includes('T') || fechaStr.includes(' ')) {
    const d = new Date(fechaStr)
    return { anio: d.getFullYear(), mes: d.getMonth() + 1, dia: d.getDate() }
  }
  const [y, m, d] = fechaStr.split('-').map(Number)
  return { anio: y || 0, mes: m || 0, dia: d || 0 }
}

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

export function ReportesSuperAdminTab() {
  const {
    kioscos,
    todosLosPagos,
    cargandoReportes,
    cargarReportesAdmin,
    cargarDatosAdmin,
  } = useAdminStore()

  const fechaHoy = new Date()
  const anioActual = fechaHoy.getFullYear()
  const mesActual = fechaHoy.getMonth() + 1 // 1 a 12

  const [anioSeleccionado, setAnioSeleccionado] = useState<number>(anioActual)
  const [mesSeleccionado, setMesSeleccionado] = useState<number | 'TODOS'>(mesActual)
  const [busquedaDetalle, setBusquedaDetalle] = useState('')
  const [filtroMedio, setFiltroMedio] = useState<string>('TODOS')
  const [filtroRubro, setFiltroRubro] = useState<string>('TODOS')
  const [tablaRendimientosAbierta, setTablaRendimientosAbierta] = useState(false)

  useEffect(() => {
    cargarReportesAdmin()
    if (kioscos.length === 0) {
      cargarDatosAdmin()
    }
  }, [cargarReportesAdmin, cargarDatosAdmin, kioscos.length])

  // Años disponibles a partir de los pagos registrados o por defecto
  const aniosDisponibles = useMemo(() => {
    const setAnios = new Set<number>([anioActual, anioActual - 1])
    for (const p of todosLosPagos) {
      if (p.fecha_pago) {
        const d = new Date(p.fecha_pago)
        if (!isNaN(d.getFullYear())) {
          setAnios.add(d.getFullYear())
        }
      }
    }
    for (const k of kioscos) {
      if (k.fecha_creacion) {
        const d = new Date(k.fecha_creacion)
        if (!isNaN(d.getFullYear())) {
          setAnios.add(d.getFullYear())
        }
      }
    }
    return Array.from(setAnios).sort((a, b) => b - a)
  }, [todosLosPagos, kioscos, anioActual])

  // 1. MRR (Monthly Recurring Revenue) actual estimado
  const mrrActual = useMemo(() => {
    return kioscos.reduce((acc, k) => {
      if (k.estado_kiosco === 'ACTIVO' && k.precio_mensual) {
        return acc + Number(k.precio_mensual)
      }
      return acc
    }, 0)
  }, [kioscos])

  // 2. Pagos filtrados por el año seleccionado
  const pagosDelAnio = useMemo(() => {
    return todosLosPagos.filter((p) => {
      if (!p.fecha_pago) return false
      const partes = parsePartesFecha(p.fecha_pago)
      return partes.anio === anioSeleccionado
    })
  }, [todosLosPagos, anioSeleccionado])

  // 3. Totales mes a mes para el año seleccionado (12 meses)
  const datosPorMesDelAnio = useMemo(() => {
    const meses = Array.from({ length: 12 }, (_, i) => ({
      numeroMes: i + 1,
      nombre: NOMBRES_MESES[i],
      nombreCorto: NOMBRES_MESES_CORTOS[i],
      totalMonto: 0,
      cantidadPagos: 0,
      kioscosIds: new Set<string>(),
      medios: {} as Record<string, number>,
    }))

    for (const p of pagosDelAnio) {
      const partes = parsePartesFecha(p.fecha_pago)
      const mIdx = partes.mes - 1
      if (mIdx >= 0 && mIdx < 12) {
        const m = meses[mIdx]
        m.totalMonto += Number(p.monto) || 0
        m.cantidadPagos += 1
        if (p.kiosco_id) m.kioscosIds.add(p.kiosco_id)
        const medioNorm = (p.medio_pago || 'TRANSFERENCIA').toUpperCase()
        m.medios[medioNorm] = (m.medios[medioNorm] || 0) + (Number(p.monto) || 0)
      }
    }

    return meses.map((m, idx, arr) => {
      const prevM = idx > 0 ? arr[idx - 1] : null
      let variacionPorcentaje: number | null = null
      if (prevM && prevM.totalMonto > 0) {
        variacionPorcentaje = ((m.totalMonto - prevM.totalMonto) / prevM.totalMonto) * 100
      } else if (prevM && prevM.totalMonto === 0 && m.totalMonto > 0) {
        variacionPorcentaje = 100
      }

      // Medio predominante
      let medioMasUsado = '-'
      let maxMedioVal = 0
      for (const [k, v] of Object.entries(m.medios)) {
        if (v > maxMedioVal) {
          maxMedioVal = v
          medioMasUsado = k
        }
      }

      return {
        ...m,
        cantidadKioscosUnicos: m.kioscosIds.size,
        ticketPromedio: m.cantidadPagos > 0 ? m.totalMonto / m.cantidadPagos : 0,
        variacionPorcentaje,
        medioMasUsado,
      }
    })
  }, [pagosDelAnio])

  // Valor máximo mensual para escalar el gráfico de barras
  const maxMontoMensual = useMemo(() => {
    return Math.max(1, ...datosPorMesDelAnio.map((m) => m.totalMonto))
  }, [datosPorMesDelAnio])

  // 4. Pagos del período seleccionado (según año y mes elegidos)
  const pagosPeriodo = useMemo(() => {
    return pagosDelAnio.filter((p) => {
      if (mesSeleccionado === 'TODOS') return true
      const partes = parsePartesFecha(p.fecha_pago)
      return partes.mes === mesSeleccionado
    })
  }, [pagosDelAnio, mesSeleccionado])

  // 5. KPIs del período seleccionado
  const kpisPeriodo = useMemo(() => {
    const totalFacturado = pagosPeriodo.reduce((acc, p) => acc + (Number(p.monto) || 0), 0)
    const cantidadPagos = pagosPeriodo.length
    const kioscosUnicos = new Set(pagosPeriodo.map((p) => p.kiosco_id).filter(Boolean)).size
    const ticketPromedio = cantidadPagos > 0 ? totalFacturado / cantidadPagos : 0

    // Cálculo comparativo vs mes anterior
    let variacionVsAnterior: number | null = null
    let textoComparativa = ''

    if (mesSeleccionado !== 'TODOS') {
      const idxMes = (mesSeleccionado as number) - 1
      const datosMesActual = datosPorMesDelAnio[idxMes]
      variacionVsAnterior = datosMesActual.variacionPorcentaje

      const mesPrevNombre = idxMes > 0 ? NOMBRES_MESES_CORTOS[idxMes - 1] : 'Dic (año ant.)'
      if (variacionVsAnterior !== null) {
        textoComparativa = `${variacionVsAnterior >= 0 ? '+' : ''}${variacionVsAnterior.toFixed(1)}% vs ${mesPrevNombre}`
      } else {
        textoComparativa = 'Sin datos comparativos previos'
      }
    } else {
      textoComparativa = `Acumulado total de ${anioSeleccionado}`
    }

    return {
      totalFacturado,
      cantidadPagos,
      kioscosUnicos,
      ticketPromedio,
      variacionVsAnterior,
      textoComparativa,
    }
  }, [pagosPeriodo, mesSeleccionado, datosPorMesDelAnio, anioSeleccionado])

  // 6. Desglose por Medio de Pago en el período seleccionado
  const desgloseMediosPago = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>()
    for (const p of pagosPeriodo) {
      const medio = (p.medio_pago || 'TRANSFERENCIA').toUpperCase()
      const actual = map.get(medio) || { total: 0, count: 0 }
      actual.total += Number(p.monto) || 0
      actual.count += 1
      map.set(medio, actual)
    }

    const totalPeriodo = kpisPeriodo.totalFacturado || 1
    return Array.from(map.entries())
      .map(([medio, d]) => ({
        medio,
        total: d.total,
        count: d.count,
        porcentaje: (d.total / totalPeriodo) * 100,
      }))
      .sort((a, b) => b.total - a.total)
  }, [pagosPeriodo, kpisPeriodo.totalFacturado])

  // 7. Desglose por Rubro en el período seleccionado
  const desgloseRubro = useMemo(() => {
    let montoKiosco = 0
    let countKiosco = 0
    let montoFotocopiadora = 0
    let countFotocopiadora = 0

    for (const p of pagosPeriodo) {
      const m = Number(p.monto) || 0
      if (p.rubro === 'FOTOCOPIADORA_LIBRERIA') {
        montoFotocopiadora += m
        countFotocopiadora += 1
      } else {
        montoKiosco += m
        countKiosco += 1
      }
    }

    const total = kpisPeriodo.totalFacturado || 1
    return [
      {
        rubro: 'KIOSCO',
        etiqueta: 'Kiosco / Almacén',
        total: montoKiosco,
        count: countKiosco,
        porcentaje: (montoKiosco / total) * 100,
        color: '#6366f1',
      },
      {
        rubro: 'FOTOCOPIADORA_LIBRERIA',
        etiqueta: 'Fotocopiadora / Librería',
        total: montoFotocopiadora,
        count: countFotocopiadora,
        porcentaje: (montoFotocopiadora / total) * 100,
        color: '#06b6d4',
      },
    ]
  }, [pagosPeriodo, kpisPeriodo.totalFacturado])

  // 8. Filtrado de transacciones detalladas
  const transaccionesFiltradas = useMemo(() => {
    return pagosPeriodo.filter((p) => {
      if (filtroMedio !== 'TODOS') {
        const medioNorm = (p.medio_pago || 'TRANSFERENCIA').toUpperCase()
        const matchMP = (filtroMedio === 'MERCADOPAGO' || filtroMedio === 'MERCADO_PAGO') && (medioNorm === 'MERCADOPAGO' || medioNorm === 'MERCADO_PAGO')
        if (medioNorm !== filtroMedio && !matchMP) return false
      }
      if (filtroRubro !== 'TODOS') {
        const rubroNorm = p.rubro || 'KIOSCO'
        if (rubroNorm !== filtroRubro) return false
      }
      if (busquedaDetalle.trim()) {
        const q = busquedaDetalle.toLowerCase()
        const matchKiosco = p.nombre_kiosco?.toLowerCase().includes(q)
        const matchDueno = p.nombre_dueno?.toLowerCase().includes(q)
        const matchEmail = p.email_dueno?.toLowerCase().includes(q)
        const matchNotas = p.notas?.toLowerCase().includes(q)
        const matchComp = p.comprobante?.toLowerCase().includes(q)
        const matchPlan = p.nombre_plan?.toLowerCase().includes(q)
        if (!matchKiosco && !matchDueno && !matchEmail && !matchNotas && !matchComp && !matchPlan) {
          return false
        }
      }
      return true
    })
  }, [pagosPeriodo, filtroMedio, filtroRubro, busquedaDetalle])

  // Exportar a Excel (.xlsx) con diseño corporativo sobrio (write-excel-file)
  const handleExportarExcel = async () => {
    try {
      const mesNombre =
        mesSeleccionado === 'TODOS'
          ? `Todo el Año (${anioSeleccionado})`
          : NOMBRES_MESES[(mesSeleccionado as number) - 1]

      await exportarRendimientosSuperAdminExcel({
        anio: anioSeleccionado,
        mesNombre,
        mrrActual,
        totalFacturado: kpisPeriodo.totalFacturado,
        cantidadPagos: kpisPeriodo.cantidadPagos,
        kioscosUnicos: kpisPeriodo.kioscosUnicos,
        ticketPromedio: kpisPeriodo.ticketPromedio,
        datosMeses: datosPorMesDelAnio,
        transacciones: transaccionesFiltradas,
      })

      toast.success('Reporte ejecutivo exportado en formato Excel (.xlsx)')
    } catch (err: any) {
      console.error('Error al exportar reporte Excel:', err)
      toast.error('No se pudo generar el archivo Excel')
    }
  }

  return (
    <div className="space-y-6">
      {/* Barra Superior con Selector de Período y Acciones */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Rendimientos Mensuales de Suscripciones SaaS
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Analítica de cobros, ingresos recurrentes (MRR), evolución mes a mes y métricas de retención
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
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

          {/* Botón Actualizar */}
          <button
            type="button"
            onClick={() => cargarReportesAdmin()}
            disabled={cargandoReportes}
            title="Recargar pagos y métricas desde el servidor"
            className="inline-flex items-center justify-center p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer shadow-2xs shrink-0"
          >
            <svg
              className={`w-4 h-4 ${cargandoReportes ? 'animate-spin text-indigo-600' : ''}`}
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

          {/* Botón Exportar Excel */}
          <Button
            variant="primary"
            size="sm"
            onClick={handleExportarExcel}
            className="text-xs font-bold shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            title="Descargar reporte completo en archivo Excel (.xlsx)"
          >
            <span>Exportar Excel</span>
          </Button>
        </div>
      </div>

      {/* Tarjetas de Métricas Clave (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: MRR Actual */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">MRR Estimado Actual</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {formatPrecio(mrrActual)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Ingresos mensuales recurrentes con base de clientes activa
          </p>
        </div>

        {/* KPI 2: Total Cobrado en el Período */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {mesSeleccionado === 'TODOS'
                ? `Cobrado en ${anioSeleccionado}`
                : `Cobrado en ${NOMBRES_MESES[(mesSeleccionado as number) - 1]}`}
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

        {/* KPI 3: Transacciones y Comercios Cobrados */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Cobros Realizados</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {kpisPeriodo.cantidadPagos}
            <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 ml-1.5">
              operaciones
            </span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {kpisPeriodo.kioscosUnicos} comercio{kpisPeriodo.kioscosUnicos !== 1 ? 's' : ''} distinto{kpisPeriodo.kioscosUnicos !== 1 ? 's' : ''} abonaron
          </p>
        </div>

        {/* KPI 4: Ticket Promedio por Renovación */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between text-purple-600 dark:text-purple-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Ticket Promedio</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {formatPrecio(kpisPeriodo.ticketPromedio)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Monto promedio por renovación o alquiler registrado
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
              Hacé click sobre cualquier mes para filtrar y analizar sus transacciones específicas
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
                maxMontoMensual > 0 ? Math.max(4, Math.round((m.totalMonto / maxMontoMensual) * 100)) : 4

              return (
                <div
                  key={m.numeroMes}
                  onClick={() => setMesSeleccionado(m.numeroMes)}
                  className="flex flex-col items-center h-full justify-end group cursor-pointer"
                  title={`${m.nombre}: ${formatPrecio(m.totalMonto)} (${m.cantidadPagos} cobros)`}
                >
                  {/* Etiqueta flotante con el monto */}
                  <span
                    className={`text-[9px] sm:text-[10px] font-bold mb-1 transition-all truncate max-w-full ${
                      estaSeleccionado
                        ? 'text-indigo-600 dark:text-indigo-400 scale-105'
                        : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-800 dark:group-hover:text-gray-200'
                    }`}
                  >
                    {m.totalMonto > 0 ? `$${Math.round(m.totalMonto / 1000)}k` : '$0'}
                  </span>

                  {/* Barra vertical interactiva */}
                  <div
                    style={{ height: `${porcentajeAltura}%` }}
                    className={`w-full rounded-t-lg transition-all duration-300 relative ${
                      estaSeleccionado
                        ? 'bg-gradient-to-t from-indigo-600 to-indigo-500 shadow-md ring-2 ring-indigo-400 ring-offset-2 dark:ring-offset-gray-800'
                        : m.totalMonto > 0
                        ? 'bg-gradient-to-t from-indigo-300 to-indigo-400 dark:from-indigo-900/60 dark:to-indigo-600 group-hover:from-indigo-400 group-hover:to-indigo-500'
                        : 'bg-gray-100 dark:bg-gray-700/60 group-hover:bg-gray-200'
                    }`}
                  >
                    {/* Badge de cantidad de operaciones en la barra si hay espacio */}
                    {m.cantidadPagos > 0 && porcentajeAltura > 20 && (
                      <span className="hidden sm:inline-block absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white/90">
                        {m.cantidadPagos}
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

      {/* Segmentación y Desgloses: Medios de Pago y Rubros */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Desglose por Medio de Pago */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
            <span>Facturación por Medio de Pago</span>
          </h3>

          {desgloseMediosPago.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 py-4 text-center">
              No hay transacciones registradas en este período.
            </p>
          ) : (
            <div className="space-y-3">
              {desgloseMediosPago.map((item) => (
                <div key={item.medio} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      {item.medio} ({item.count} cobro{item.count !== 1 ? 's' : ''})
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

        {/* Desglose por Rubro del Comercio */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
            <span>Distribución de Clientes por Rubro</span>
          </h3>

          <div className="space-y-3">
            {desgloseRubro.map((r) => (
              <div key={r.rubro} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: r.color }}
                    />
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      {r.etiqueta} ({r.count} cobro{r.count !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 dark:text-white">
                      {formatPrecio(r.total)}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 text-[11px] w-10 text-right">
                      {r.porcentaje.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${r.porcentaje}%`,
                      backgroundColor: r.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex justify-between items-center">
            <span>Comercios activos en plataforma:</span>
            <span className="font-bold text-gray-800 dark:text-gray-200">
              {kioscos.filter((k) => k.estado_kiosco === 'ACTIVO').length} de {kioscos.length} totales
            </span>
          </div>
        </div>
      </div>

      {/* Tabla Comparativa de Rendimientos Mes a Mes (Desplegable) */}
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
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[15%]" />
                <col className="w-[14%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 truncate">Mes</th>
                  <th className="px-4 py-3 truncate">Facturado Total</th>
                  <th className="px-4 py-3 text-center truncate">Cobros</th>
                  <th className="px-4 py-3 text-center truncate">Comercios</th>
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
                        {formatPrecio(m.totalMonto)}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300 font-medium truncate">
                        {m.cantidadPagos}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300 font-medium truncate">
                        {m.cantidadKioscosUnicos}
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
                        {m.medioMasUsado}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detalle Individual de Transacciones y Cobros del Período */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span>Transacciones y Cobros Detallados ({transaccionesFiltradas.length})</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Registros individuales de suscripciones con medio de pago y comercio emisor
            </p>
          </div>

          {/* Filtros de la tabla de detalle */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Buscar comercio, dueño o nota..."
              value={busquedaDetalle}
              onChange={(e) => setBusquedaDetalle(e.target.value)}
              aria-label="Buscar transacciones"
              className="text-xs px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 text-gray-900 dark:text-gray-100 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-48 sm:w-56"
            />

            <select
              value={filtroMedio}
              onChange={(e) => setFiltroMedio(e.target.value)}
              aria-label="Filtrar por medio de pago"
              className="text-xs px-2.5 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 text-gray-800 dark:text-gray-200 focus:outline-hidden cursor-pointer"
            >
              <option value="TODOS">Todos los medios</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="MERCADOPAGO">Mercado Pago</option>
              <option value="EFECTIVO">Efectivo</option>
              <option value="TARJETA">Tarjeta</option>
              <option value="OTRO">Otro</option>
            </select>

            <select
              value={filtroRubro}
              onChange={(e) => setFiltroRubro(e.target.value)}
              aria-label="Filtrar por rubro"
              className="text-xs px-2.5 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 text-gray-800 dark:text-gray-200 focus:outline-hidden cursor-pointer"
            >
              <option value="TODOS">Todos los rubros</option>
              <option value="KIOSCO">Kiosco</option>
              <option value="FOTOCOPIADORA_LIBRERIA">Fotocopiadora</option>
            </select>
          </div>
        </div>

        {transaccionesFiltradas.length === 0 ? (
          <div className="py-12 text-center text-gray-500 dark:text-gray-400 text-xs">
            <p className="font-semibold text-gray-800 dark:text-gray-200">
              No se encontraron cobros con los filtros seleccionados
            </p>
            <p className="mt-1">Probá cambiando el mes, año o los criterios de búsqueda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-fixed w-full text-left text-xs">
              <colgroup>
                <col className="w-[12%]" />
                <col className="w-[18%]" />
                <col className="w-[20%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 truncate">Fecha</th>
                  <th className="px-4 py-3 truncate">Comercio</th>
                  <th className="px-4 py-3 truncate">Titular / Email</th>
                  <th className="px-4 py-3 truncate">Plan</th>
                  <th className="px-4 py-3 truncate">Medio de Pago</th>
                  <th className="px-4 py-3 text-right truncate">Monto</th>
                  <th className="px-4 py-3 truncate">Notas / Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {transaccionesFiltradas.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 truncate">
                      {formatFecha(t.fecha_pago)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{t.nombre_kiosco}</span>
                        {t.rubro === 'FOTOCOPIADORA_LIBRERIA' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 font-bold shrink-0">
                            Fotocopiadora
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      <p className="font-medium truncate">{t.nombre_dueno}</p>
                      {t.email_dueno && (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                          {t.email_dueno}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-[11px] font-semibold truncate inline-block max-w-full">
                        {t.nombre_plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-800 dark:text-gray-200 font-medium truncate">
                      {labelMedioPago(t.medio_pago || 'TRANSFERENCIA')}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-gray-900 dark:text-white text-sm truncate">
                      {formatPrecio(t.monto)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 truncate">
                      {t.notas || t.comprobante || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
