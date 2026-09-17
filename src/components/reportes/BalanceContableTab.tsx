import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useProveedorStore } from '../../stores/proveedorStore'
import { formatPrecio, formatFecha, labelMedioPago } from '../../lib/utils'
import { exportarLibroContableCSV, type MovimientoContableCSV } from '../../lib/exportUtils'
import { Button } from '../ui/Button'
import { SearchInput } from '../ui/SearchInput'
import toast from 'react-hot-toast'
import type { MovimientoCaja, Venta } from '../../types/database'

type TipoPeriodo = 'HOY' | 'SEMANA' | 'MES' | 'MES_ANTERIOR' | 'PERSONALIZADO'
type FiltroTipoMovimiento = 'TODOS' | 'VENTAS' | 'COMPRAS' | 'PAGOS' | 'CAJA'

interface AsientoContable {
  id: string
  fecha: string
  tipo: 'VENTA' | 'COMPRA' | 'PAGO_PROVEEDOR' | 'EGRESO_CAJA' | 'INGRESO_CAJA'
  comprobante: string
  concepto: string
  medio_pago: string
  ingreso: number
  egreso: number
  notas?: string | null
}

export function BalanceContableTab() {
  const { usuario, kiosco } = useAuthStore()
  const {
    proveedores,
    compras,
    pagos,
    cargarProveedores,
    cargarCompras,
    cargarPagos,
  } = useProveedorStore()

  // Período contable
  const [periodo, setPeriodo] = useState<TipoPeriodo>('MES')
  const [fechaDesdePersonalizada, setFechaDesdePersonalizada] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [fechaHastaPersonalizada, setFechaHastaPersonalizada] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })

  // Datos locales
  const [ventas, setVentas] = useState<Venta[]>([])
  const [movimientosCaja, setMovimientosCaja] = useState<MovimientoCaja[]>([])
  const [cargando, setCargando] = useState(true)

  // Filtros de tabla
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipoMovimiento>('TODOS')
  const [busqueda, setBusqueda] = useState('')

  // Calcular rango de fechas ISO según el período seleccionado
  const { rangoInicio, rangoFin, etiquetaPeriodo } = useMemo(() => {
    const ahora = new Date()

    if (periodo === 'HOY') {
      const hoyStr = ahora.toISOString().split('T')[0]
      return {
        rangoInicio: `${hoyStr}T00:00:00`,
        rangoFin: `${hoyStr}T23:59:59`,
        etiquetaPeriodo: `Hoy (${formatFecha(ahora.toISOString())})`,
      }
    }

    if (periodo === 'SEMANA') {
      const d = new Date(ahora)
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Lunes
      d.setDate(diff)
      const inicioSemana = d.toISOString().split('T')[0]
      const finSemana = ahora.toISOString().split('T')[0]
      return {
        rangoInicio: `${inicioSemana}T00:00:00`,
        rangoFin: `${finSemana}T23:59:59`,
        etiquetaPeriodo: `Esta semana (desde ${formatFecha(inicioSemana)})`,
      }
    }

    if (periodo === 'MES') {
      const y = ahora.getFullYear()
      const m = ahora.getMonth()
      const primerDia = new Date(y, m, 1).toISOString().split('T')[0]
      const ultimoDia = new Date(y, m + 1, 0).toISOString().split('T')[0]
      const mesNombre = ahora.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
      return {
        rangoInicio: `${primerDia}T00:00:00`,
        rangoFin: `${ultimoDia}T23:59:59`,
        etiquetaPeriodo: `Mes actual (${mesNombre})`,
      }
    }

    if (periodo === 'MES_ANTERIOR') {
      const y = ahora.getFullYear()
      const m = ahora.getMonth() - 1
      const primerDia = new Date(y, m, 1).toISOString().split('T')[0]
      const ultimoDia = new Date(y, m + 1, 0).toISOString().split('T')[0]
      const refDate = new Date(y, m, 1)
      const mesNombre = refDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
      return {
        rangoInicio: `${primerDia}T00:00:00`,
        rangoFin: `${ultimoDia}T23:59:59`,
        etiquetaPeriodo: `Mes anterior (${mesNombre})`,
      }
    }

    // PERSONALIZADO
    return {
      rangoInicio: `${fechaDesdePersonalizada}T00:00:00`,
      rangoFin: `${fechaHastaPersonalizada}T23:59:59`,
      etiquetaPeriodo: `Desde ${fechaDesdePersonalizada} hasta ${fechaHastaPersonalizada}`,
    }
  }, [periodo, fechaDesdePersonalizada, fechaHastaPersonalizada])

  // Cargar todos los datos contables del período
  const cargarDatosContables = useCallback(async () => {
    if (!usuario?.kiosco_id) return
    setCargando(true)

    try {
      // 1. Cargar proveedores, compras y pagos de la tienda
      await Promise.all([cargarProveedores(), cargarCompras(), cargarPagos()])

      // 2. Cargar ventas del período
      const { data: ventasData, error: ventasError } = await supabase
        .from('ventas')
        .select(`
          id, fecha_hora, total, estado, notas,
          usuario:usuarios(nombre),
          pagos:pagos_venta(medio_pago, monto)
        `)
        .eq('kiosco_id', usuario.kiosco_id)
        .gte('fecha_hora', rangoInicio)
        .lte('fecha_hora', rangoFin)
        .order('fecha_hora', { ascending: false })

      if (!ventasError && ventasData) {
        setVentas(ventasData as unknown as Venta[])
      }

      // 3. Cargar movimientos de caja del período
      const { data: movsData } = await supabase
        .from('movimientos_caja')
        .select('*')
        .gte('fecha_hora', rangoInicio)
        .lte('fecha_hora', rangoFin)
        .order('fecha_hora', { ascending: false })

      if (movsData) {
        setMovimientosCaja(movsData as MovimientoCaja[])
      }
    } catch (err) {
      console.error('Error cargando balance contable:', err)
      toast.error('Error al cargar datos contables')
    } finally {
      setCargando(false)
    }
  }, [usuario?.kiosco_id, rangoInicio, rangoFin, cargarProveedores, cargarCompras, cargarPagos])

  useEffect(() => {
    cargarDatosContables()
  }, [cargarDatosContables])

  // Filtrar compras del período
  const comprasPeriodo = useMemo(() => {
    return compras.filter((c) => {
      if (c.estado === 'ANULADA') return false
      const f = c.fecha
      return f >= rangoInicio && f <= rangoFin
    })
  }, [compras, rangoInicio, rangoFin])

  // Filtrar pagos a proveedores del período
  const pagosPeriodo = useMemo(() => {
    return pagos.filter((p) => {
      if (p.estado === 'ANULADO') return false
      const f = p.fecha
      return f >= rangoInicio && f <= rangoFin
    })
  }, [pagos, rangoInicio, rangoFin])

  // Filtrar movimientos varios de caja del período (excluyendo pagos a proveedores duplicados)
  const egresosCajaPeriodo = useMemo(() => {
    return movimientosCaja.filter((m) => {
      return (
        m.tipo === 'EGRESO' &&
        m.motivo !== 'PROVEEDOR' &&
        m.fecha_hora >= rangoInicio &&
        m.fecha_hora <= rangoFin
      )
    })
  }, [movimientosCaja, rangoInicio, rangoFin])

  // Filtrar ingresos directos de caja del período
  const ingresosCajaPeriodo = useMemo(() => {
    return movimientosCaja.filter((m) => {
      return (
        m.tipo === 'INGRESO' &&
        m.fecha_hora >= rangoInicio &&
        m.fecha_hora <= rangoFin
      )
    })
  }, [movimientosCaja, rangoInicio, rangoFin])

  // Ventas completadas del período
  const ventasValidas = useMemo(() => {
    return ventas.filter((v) => v.estado === 'COMPLETADA')
  }, [ventas])

  // ==========================================
  // KPIs FINANCIEROS Y CONTABLES
  // ==========================================
  const totalIngresos = useMemo(() => {
    return ventasValidas.reduce((sum, v) => sum + v.total, 0)
  }, [ventasValidas])

  const totalComprasMercaderia = useMemo(() => {
    return comprasPeriodo.reduce((sum, c) => sum + c.total, 0)
  }, [comprasPeriodo])

  const totalPagosAbonados = useMemo(() => {
    return pagosPeriodo.reduce((sum, p) => sum + p.monto, 0)
  }, [pagosPeriodo])

  const totalGastosCaja = useMemo(() => {
    return egresosCajaPeriodo.reduce((sum, m) => sum + m.monto, 0)
  }, [egresosCajaPeriodo])

  const totalIngresosCaja = useMemo(() => {
    return ingresosCajaPeriodo.reduce((sum, m) => sum + m.monto, 0)
  }, [ingresosCajaPeriodo])

  const totalSalidasFinancieras = totalPagosAbonados + totalGastosCaja

  // Margen bruto sobre mercadería ingresada
  const resultadoOperativo = totalIngresos - totalComprasMercaderia

  // Flujo neto de dinero real (ingresos por ventas y caja menos desembolsos de caja y pagos)
  const flujoCajaNeto = (totalIngresos + totalIngresosCaja) - totalSalidasFinancieras

  // Deuda total acumulada con proveedores al día de hoy
  const deudaTotalProveedores = useMemo(() => {
    return proveedores.reduce((sum, p) => sum + (p.saldo_pendiente || 0), 0)
  }, [proveedores])

  // Desglose de ingresos por medio de pago
  const ventasPorMedioPago = useMemo(() => {
    const mapa = new Map<string, number>()
    ventasValidas.forEach((v: any) => {
      if (v.pagos && Array.isArray(v.pagos) && v.pagos.length > 0) {
        v.pagos.forEach((p: any) => {
          mapa.set(p.medio_pago, (mapa.get(p.medio_pago) || 0) + p.monto)
        })
      } else {
        mapa.set('EFECTIVO', (mapa.get('EFECTIVO') || 0) + v.total)
      }
    })
    return Array.from(mapa.entries()).map(([medio, monto]) => ({ medio, monto }))
  }, [ventasValidas])

  // ==========================================
  // CONSTRUCCIÓN DEL LIBRO DIARIO UNIFICADO
  // ==========================================
  const libroDiario = useMemo<AsientoContable[]>(() => {
    const asientos: AsientoContable[] = []

    // 1. Ventas
    ventasValidas.forEach((v: any) => {
      const medioStr =
        v.pagos && v.pagos.length > 0
          ? v.pagos.map((p: any) => labelMedioPago(p.medio_pago)).join(', ')
          : 'Efectivo'

      const ticketRef = v.afip_nro_comprobante
        ? `T-${v.afip_nro_comprobante}`
        : `T-${v.id.slice(0, 8).toUpperCase()}`

      asientos.push({
        id: `v-${v.id}`,
        fecha: v.fecha_hora,
        tipo: 'VENTA',
        comprobante: ticketRef,
        concepto: `Venta en mostrador${v.usuario?.nombre ? ` (${v.usuario.nombre})` : ''}`,
        medio_pago: medioStr,
        ingreso: v.total,
        egreso: 0,
        notas: v.notas,
      })
    })

    // 2. Compras a proveedores
    comprasPeriodo.forEach((c) => {
      asientos.push({
        id: `c-${c.id}`,
        fecha: c.fecha,
        tipo: 'COMPRA',
        comprobante: c.nro_comprobante || 'Remito S/N',
        concepto: `Compra mercadería: ${c.proveedor?.nombre || 'Proveedor'}`,
        medio_pago: c.medio_pago === 'CUENTA_CORRIENTE' ? 'Cuenta Corriente (Deuda)' : c.medio_pago,
        ingreso: 0,
        egreso: c.total,
        notas: c.notas || (c.pagado_en_caja ? 'Abonado en efectivo de caja' : null),
      })
    })

    // 3. Pagos / Abonos de deuda a proveedores
    pagosPeriodo.forEach((p) => {
      asientos.push({
        id: `p-${p.id}`,
        fecha: p.fecha,
        tipo: 'PAGO_PROVEEDOR',
        comprobante: p.comprobante_ref || `REC-${p.id.slice(0, 8).toUpperCase()}`,
        concepto: `Pago a proveedor: ${p.proveedor?.nombre || 'Proveedor'}`,
        medio_pago: p.medio_pago,
        ingreso: 0,
        egreso: p.monto,
        notas: p.notas || (p.pagado_en_caja ? 'Salida de caja registrada' : null),
      })
    })

    // 4. Egresos varios de caja (gastos menores, viáticos, retiros)
    egresosCajaPeriodo.forEach((m) => {
      asientos.push({
        id: `m-${m.id}`,
        fecha: m.fecha_hora,
        tipo: 'EGRESO_CAJA',
        comprobante: `CAJA-${m.id.slice(0, 6).toUpperCase()}`,
        concepto: `Gasto de caja: ${m.motivo.replace('_', ' ')} (${m.descripcion || 'Sin descripción'})`,
        medio_pago: 'Efectivo',
        ingreso: 0,
        egreso: m.monto,
        notas: m.descripcion,
      })
    })

    // 5. Ingresos varios de caja (reposición de cambio, aportes varios)
    ingresosCajaPeriodo.forEach((m) => {
      asientos.push({
        id: `m-in-${m.id}`,
        fecha: m.fecha_hora,
        tipo: 'INGRESO_CAJA',
        comprobante: `CAJA-${m.id.slice(0, 6).toUpperCase()}`,
        concepto: `Ingreso de caja: ${m.motivo.replace('_', ' ')} (${m.descripcion || 'Sin descripción'})`,
        medio_pago: 'Efectivo',
        ingreso: m.monto,
        egreso: 0,
        notas: m.descripcion,
      })
    })

    // Ordenar cronológicamente descendente (lo más reciente primero)
    return asientos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
  }, [ventasValidas, comprasPeriodo, pagosPeriodo, egresosCajaPeriodo, ingresosCajaPeriodo])

  // Filtrado de asientos para la tabla
  const asientosFiltrados = useMemo(() => {
    return libroDiario.filter((a) => {
      // Filtro por tipo
      if (filtroTipo === 'VENTAS' && a.tipo !== 'VENTA') return false
      if (filtroTipo === 'COMPRAS' && a.tipo !== 'COMPRA') return false
      if (filtroTipo === 'PAGOS' && a.tipo !== 'PAGO_PROVEEDOR') return false
      if (filtroTipo === 'CAJA' && a.tipo !== 'EGRESO_CAJA' && a.tipo !== 'INGRESO_CAJA') return false

      // Filtro por búsqueda
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase()
        const matchComp = a.comprobante.toLowerCase().includes(q)
        const matchConc = a.concepto.toLowerCase().includes(q)
        const matchMedio = a.medio_pago.toLowerCase().includes(q)
        const matchNotas = a.notas?.toLowerCase().includes(q)
        if (!matchComp && !matchConc && !matchMedio && !matchNotas) return false
      }

      return true
    })
  }, [libroDiario, filtroTipo, busqueda])

  // Exportar libro diario contable a CSV para Excel
  const handleExportarLibroDiario = () => {
    if (libroDiario.length === 0) {
      toast.error('No hay movimientos en este período para exportar')
      return
    }

    const exportRows: MovimientoContableCSV[] = libroDiario.map((a) => ({
      fecha_hora: a.fecha,
      tipo: a.tipo,
      comprobante: a.comprobante,
      concepto: a.concepto,
      medio_pago: a.medio_pago,
      ingreso: a.ingreso,
      egreso: a.egreso,
      observaciones: a.notas || undefined,
    }))

    exportarLibroContableCSV(
      exportRows,
      etiquetaPeriodo.replace(/[^a-zA-Z0-9]/g, '_'),
      kiosco?.nombre || 'Kiosco'
    )
    toast.success('Libro contable descargado en formato CSV para Excel')
  }

  return (
    <div className="space-y-6">
      {/* Selector de Período y Botón de Descarga Excel */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
            Período de Balance Contable
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {etiquetaPeriodo} · Auditoría para control impositivo y contable
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          <div className="flex bg-gray-100 dark:bg-gray-700/60 p-1 rounded-lg text-xs font-semibold shrink-0">
            <button
              type="button"
              onClick={() => setPeriodo('HOY')}
              className={`px-3 py-1 rounded-md transition-colors ${
                periodo === 'HOY'
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setPeriodo('SEMANA')}
              className={`px-3 py-1 rounded-md transition-colors ${
                periodo === 'SEMANA'
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setPeriodo('MES')}
              className={`px-3 py-1 rounded-md transition-colors ${
                periodo === 'MES'
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Este Mes
            </button>
            <button
              type="button"
              onClick={() => setPeriodo('MES_ANTERIOR')}
              className={`px-3 py-1 rounded-md transition-colors ${
                periodo === 'MES_ANTERIOR'
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Mes Anterior
            </button>
            <button
              type="button"
              onClick={() => setPeriodo('PERSONALIZADO')}
              className={`px-3 py-1 rounded-md transition-colors ${
                periodo === 'PERSONALIZADO'
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Fechas
            </button>
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportarLibroDiario}
            disabled={libroDiario.length === 0}
            className="text-xs font-semibold whitespace-nowrap shrink-0"
            title="Descargar libro contable completo con ingresos y egresos en CSV para Excel"
          >
            Descargar Libro Diario (.CSV)
          </Button>
        </div>
      </div>

      {/* Rango de fechas personalizado si está seleccionado */}
      {periodo === 'PERSONALIZADO' && (
        <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-xs">
          <span className="font-semibold text-gray-700 dark:text-gray-300">Desde:</span>
          <input
            type="date"
            value={fechaDesdePersonalizada}
            onChange={(e) => setFechaDesdePersonalizada(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1 text-xs"
          />
          <span className="font-semibold text-gray-700 dark:text-gray-300">Hasta:</span>
          <input
            type="date"
            value={fechaHastaPersonalizada}
            onChange={(e) => setFechaHastaPersonalizada(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1 text-xs"
          />
        </div>
      )}

      {cargando ? (
        <div className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Calculando balance contable...</p>
        </div>
      ) : (
        <>
          {/* Tarjetas Principales de KPIs Contables */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Total Ingresos (Ventas) */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2 min-h-[28px]">
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide leading-snug">
                    Ingresos Totales
                  </p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold whitespace-nowrap flex-shrink-0">
                    {ventasValidas.length} {ventasValidas.length === 1 ? 'venta' : 'ventas'}
                  </span>
                </div>
                <p className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mt-1">
                  {formatPrecio(totalIngresos)}
                </p>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                Facturación bruta cobrada en el período
              </p>
            </div>

            {/* Total Compras de Mercadería */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2 min-h-[28px]">
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide leading-snug">
                    Compras Mercadería
                  </p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 font-bold whitespace-nowrap flex-shrink-0">
                    {comprasPeriodo.length} {comprasPeriodo.length === 1 ? 'remito' : 'remitos'}
                  </span>
                </div>
                <p className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mt-1">
                  {formatPrecio(totalComprasMercaderia)}
                </p>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                Stock y mercadería recibida (costo)
              </p>
            </div>

            {/* Total Pagos y Egresos Efectivos */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2 min-h-[28px]">
                  <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide leading-snug">
                    Salidas Financieras
                  </p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 font-bold whitespace-nowrap flex-shrink-0">
                    {pagosPeriodo.length + egresosCajaPeriodo.length}{' '}
                    {pagosPeriodo.length + egresosCajaPeriodo.length === 1 ? 'salida' : 'salidas'}
                  </span>
                </div>
                <p className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mt-1">
                  {formatPrecio(totalSalidasFinancieras)}
                </p>
              </div>
              <p
                className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 truncate"
                title={`Pagos a prov. (${formatPrecio(totalPagosAbonados)}) + Gastos caja (${formatPrecio(totalGastosCaja)})`}
              >
                Pagos a prov. ({formatPrecio(totalPagosAbonados)}) + Gastos caja ({formatPrecio(totalGastosCaja)})
              </p>
            </div>

            {/* Resultado Operativo / Margen */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2 min-h-[28px]">
                  <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide leading-snug">
                    Margen Bruto
                  </p>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap flex-shrink-0 ${
                      resultadoOperativo >= 0
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                    }`}
                  >
                    {resultadoOperativo >= 0 ? '+ Rentable' : 'Déficit'}
                  </span>
                </div>
                <p
                  className={`text-2xl sm:text-3xl font-black mt-1 ${
                    resultadoOperativo >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {formatPrecio(resultadoOperativo)}
                </p>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                Flujo de caja neto: <strong>{formatPrecio(flujoCajaNeto)}</strong>
              </p>
            </div>
          </div>

          {/* Paneles de Desglose de Ingresos y Cuentas por Pagar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Desglose por Medio de Pago en Ventas */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center justify-between">
                <span>Ingresos por Medio de Pago</span>
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                  Total: {formatPrecio(totalIngresos)}
                </span>
              </h3>
              {ventasPorMedioPago.length === 0 ? (
                <p className="text-xs text-gray-400 py-3">No hay ventas registradas en este período.</p>
              ) : (
                <div className="space-y-2">
                  {ventasPorMedioPago.map(({ medio, monto }) => {
                    const pct = totalIngresos > 0 ? Math.round((monto / totalIngresos) * 100) : 0
                    return (
                      <div key={medio} className="space-y-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="text-gray-700 dark:text-gray-300">{labelMedioPago(medio)}</span>
                          <span className="font-bold text-gray-900 dark:text-gray-100">
                            {formatPrecio(monto)}{' '}
                            <span className="text-gray-400 text-[10px] font-normal">({pct}%)</span>
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-indigo-600 dark:bg-indigo-400 h-full rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Pasivos y Deuda con Proveedores */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Cuentas por Pagar (Pasivos)
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Deuda acumulada vigente con proveedores
                  </p>
                </div>
                <span className="text-lg sm:text-xl font-black text-amber-600 dark:text-amber-400">
                  {formatPrecio(deudaTotalProveedores)}
                </span>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-44 overflow-y-auto pr-1">
                {proveedores.filter((p) => (p.saldo_pendiente || 0) > 0).length === 0 ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 py-3 font-medium">
                    Excelente: no hay saldos adeudados a proveedores actualmente.
                  </p>
                ) : (
                  proveedores
                    .filter((p) => (p.saldo_pendiente || 0) > 0)
                    .map((p) => (
                      <div key={p.id} className="py-2 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-gray-900 dark:text-gray-100">{p.nombre}</span>
                          {p.contacto_nombre && (
                            <span className="text-gray-400 ml-1.5">({p.contacto_nombre})</span>
                          )}
                        </div>
                        <span className="font-bold text-red-600 dark:text-red-400">
                          {formatPrecio(p.saldo_pendiente || 0)}
                        </span>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>

          {/* ==========================================
              LIBRO DIARIO CONTABLE (TABLA CRONOLÓGICA)
              ========================================== */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xs space-y-3 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  Libro Diario de Movimientos Contables
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Registro cronológico unificado de todas las operaciones registradas ({asientosFiltrados.length} movimientos)
                </p>
              </div>

              {/* Filtros rápidos de tipo de operación */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { tipo: 'TODOS', label: 'Todos' },
                    { tipo: 'VENTAS', label: 'Ventas' },
                    { tipo: 'COMPRAS', label: 'Compras' },
                    { tipo: 'PAGOS', label: 'Pagos Prov.' },
                    { tipo: 'CAJA', label: 'Caja' },
                  ] as const
                ).map(({ tipo, label }) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setFiltroTipo(tipo)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      filtroTipo === tipo
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Buscador dentro del libro diario */}
            <div className="max-w-md">
              <SearchInput
                placeholder="Buscar por comprobante, proveedor, concepto..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onClear={() => setBusqueda('')}
              />
            </div>

            {/* Tabla de Asientos Contables */}
            <div className="overflow-x-auto">
              {asientosFiltrados.length === 0 ? (
                <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">
                  No se encontraron asientos contables en este período.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
                      <th className="py-2.5 px-3">Fecha y Hora</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3">Comprobante / Ref</th>
                      <th className="py-2.5 px-3">Concepto / Detalle</th>
                      <th className="py-2.5 px-3">Medio de Pago</th>
                      <th className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400">
                        Ingreso (+)
                      </th>
                      <th className="py-2.5 px-3 text-right text-red-600 dark:text-red-400">
                        Egreso (-)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                    {asientosFiltrados.map((asiento) => (
                      <tr
                        key={asiento.id}
                        className="hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors"
                      >
                        <td className="py-2 px-3 whitespace-nowrap text-gray-600 dark:text-gray-400 font-mono">
                          {formatFecha(asiento.fecha)}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {asiento.tipo === 'VENTA' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              VENTA
                            </span>
                          )}
                          {asiento.tipo === 'COMPRA' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                              COMPRA REMITO
                            </span>
                          )}
                          {asiento.tipo === 'PAGO_PROVEEDOR' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                              PAGO PROV.
                            </span>
                          )}
                          {asiento.tipo === 'EGRESO_CAJA' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">
                              EGRESO CAJA
                            </span>
                          )}
                          {asiento.tipo === 'INGRESO_CAJA' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                              INGRESO CAJA
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap font-mono font-semibold text-gray-800 dark:text-gray-200">
                          {asiento.comprobante}
                        </td>
                        <td className="py-2 px-3">
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {asiento.concepto}
                          </p>
                          {asiento.notas && (
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 italic truncate max-w-xs">
                              {asiento.notas}
                            </p>
                          )}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-gray-600 dark:text-gray-400">
                          {asiento.medio_pago}
                        </td>
                        <td className="py-2 px-3 text-right font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          {asiento.ingreso > 0 ? formatPrecio(asiento.ingreso) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-bold font-mono text-red-600 dark:text-red-400">
                          {asiento.egreso > 0 ? formatPrecio(asiento.egreso) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 font-bold text-gray-900 dark:text-white">
                      <td colSpan={5} className="py-2.5 px-3 text-right uppercase tracking-wider text-xs">
                        Totales del Período:
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                        {formatPrecio(totalIngresos)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-red-600 dark:text-red-400 text-sm">
                        {formatPrecio(
                          asientosFiltrados.reduce((sum, a) => sum + (a.egreso || 0), 0)
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
