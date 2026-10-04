import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useProveedorStore } from '../../stores/proveedorStore'
import { formatPrecio, formatFecha, labelMedioPago, getLimitesISORango } from '../../lib/utils'
import {
  exportarLibroContableExcel,
  exportarLibroIvaVentasExcel,
  exportarRendimientosDuenoExcel,
  type MovimientoContableCSV,
  type MetricasBalanceExport,
  type RendimientoMesDuenoExport,
  type DetalleVentaRendimientoExport,
} from '../../lib/exportUtils'
import { Button } from '../ui/Button'
import { IconExportar } from '../ui/Icons'
import { SearchInput } from '../ui/SearchInput'
import { TicketReceiptModal, type TicketData } from '../pos/TicketReceiptModal'
import { ventaToTicketData } from '../../lib/ticketUtils'
import toast from 'react-hot-toast'
import type { MovimientoCaja } from '../../types/database'

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

type FiltroTipoMovimiento = 'TODOS' | 'VENTAS' | 'COMPRAS' | 'PAGOS' | 'CAJA' | 'DEVOLUCIONES'
type FiltroFiscal = 'TODAS' | 'SOLO_FISCALES' | 'SOLO_INTERNAS'

interface AsientoContable {
  id: string
  fecha: string
  tipo: 'VENTA' | 'COMPRA' | 'PAGO_PROVEEDOR' | 'EGRESO_CAJA' | 'INGRESO_CAJA' | 'DEVOLUCION'
  comprobante: string
  concepto: string
  medio_pago: string
  ingreso: number
  egreso: number
  notas?: string | null
  ventaData?: any
  ticketRef?: string | null
}

interface VentaContable {
  id: string
  fecha_hora: string
  total: number
  estado: string
  notas: string | null
  afip_cae?: string | null
  afip_vto_cae?: string | null
  afip_tipo_comprobante?: number | null
  afip_nro_comprobante?: number | null
  afip_qr_url?: string | null
  usuario?: { nombre: string } | null
  pagos: { medio_pago: string; monto: number }[]
  detalles: {
    cantidad: number
    precio_unitario?: number
    subtotal: number
    producto?: { descripcion: string } | null
  }[]
}

export function BalanceContableTab() {
  const { usuario, kiosco } = useAuthStore()
  const esDueno = usuario?.rol === 'DUEÑO' || Boolean(usuario?.es_superadmin)
  const kid = usuario?.kiosco_id || kiosco?.id

  const {
    proveedores,
    compras,
    pagos,
    cargarProveedores,
    cargarCompras,
    cargarPagos,
  } = useProveedorStore()

  const fechaHoy = new Date()
  const anioActual = fechaHoy.getFullYear()
  const mesActual = fechaHoy.getMonth() + 1 // 1 a 12

  // Selector de Año y Mes (sincronizado con barras interactivas y tablas)
  const [anioSeleccionado, setAnioSeleccionado] = useState<number>(anioActual)
  const [mesSeleccionado, setMesSeleccionado] = useState<number | 'TODOS'>(mesActual)

  // Modo Dual / Filtro Fiscal
  const [filtroFiscal, setFiltroFiscal] = useState<FiltroFiscal>('TODAS')

  // Estado del acordeón de tabla comparativa de 12 meses
  const [tablaRendimientosAbierta, setTablaRendimientosAbierta] = useState(false)

  // Filtros del Libro Diario
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipoMovimiento>('TODOS')
  const [busqueda, setBusqueda] = useState('')

  // Datos del año cargados en memoria
  const [ventasAnio, setVentasAnio] = useState<VentaContable[]>([])
  const [movimientosCajaAnio, setMovimientosCajaAnio] = useState<MovimientoCaja[]>([])
  const [devolucionesAnio, setDevolucionesAnio] = useState<any[]>([])

  const [cargando, setCargando] = useState(true)
  const [exportando, setExportando] = useState(false)
  const [ticketParaVer, setTicketParaVer] = useState<TicketData | null>(null)

  // 1. Cargar datos del año seleccionado
  const cargarDatosAnio = useCallback(async () => {
    if (!kid) return
    setCargando(true)

    const { inicioISO, finISO } = getLimitesISORango(
      `${anioSeleccionado}-01-01`,
      `${anioSeleccionado}-12-31`
    )

    try {
      // Cargar proveedores, compras y pagos en paralelo
      try {
        await Promise.all([cargarProveedores(), cargarCompras(), cargarPagos()])
      } catch (errProv) {
        console.warn('Advertencia al cargar proveedores/compras/pagos:', errProv)
      }

      // Cargar ventas del año con detalles y pagos
      const { data: vData, error: vErr } = await supabase
        .from('ventas')
        .select(`
          id, fecha_hora, total, estado, notas,
          afip_cae, afip_vto_cae, afip_tipo_comprobante, afip_nro_comprobante, afip_qr_url,
          usuario:usuarios(nombre),
          pagos:pagos_venta(medio_pago, monto),
          detalles:detalles_venta(cantidad, precio_unitario, subtotal, producto:productos(descripcion))
        `)
        .eq('kiosco_id', kid)
        .gte('fecha_hora', inicioISO)
        .lte('fecha_hora', finISO)
        .order('fecha_hora', { ascending: false })
        .limit(15000)

      if (vErr) {
        console.error('Error cargando ventas anuales:', vErr)
        toast.error('No se pudieron cargar las ventas del período')
      } else {
        setVentasAnio((vData || []) as unknown as VentaContable[])
      }

      // Cargar movimientos de caja del año
      const { data: mData, error: mErr } = await supabase
        .from('movimientos_caja')
        .select('*')
        .eq('kiosco_id', kid)
        .gte('fecha_hora', inicioISO)
        .lte('fecha_hora', finISO)
        .order('fecha_hora', { ascending: false })
        .limit(10000)

      if (mErr) {
        console.warn('Advertencia cargando movimientos de caja:', mErr.message)
      } else {
        setMovimientosCajaAnio(mData || [])
      }

      // Cargar devoluciones del año con comprobante de venta original vinculado
      const { data: dData, error: dErr } = await supabase
        .from('devoluciones_venta')
        .select(`
          *,
          venta:ventas(
            id, fecha_hora, total, estado, notas,
            afip_cae, afip_vto_cae, afip_tipo_comprobante, afip_nro_comprobante, afip_qr_url,
            usuario:usuarios(nombre),
            pagos:pagos_venta(medio_pago, monto),
            detalles:detalles_venta(cantidad, precio_unitario, subtotal, producto:productos(descripcion))
          )
        `)
        .eq('kiosco_id', kid)
        .gte('fecha_hora', inicioISO)
        .lte('fecha_hora', finISO)
        .order('fecha_hora', { ascending: false })
        .limit(10000)

      if (dErr) {
        console.warn('Advertencia cargando devoluciones:', dErr.message)
      } else {
        setDevolucionesAnio(dData || [])
      }
    } catch (err: any) {
      console.error('Error general al cargar balance anual:', err)
      toast.error('Error al sincronizar balance contable')
    } finally {
      setCargando(false)
    }
  }, [kid, anioSeleccionado, cargarProveedores, cargarCompras, cargarPagos])

  useEffect(() => {
    cargarDatosAnio()
  }, [cargarDatosAnio])

  // Años disponibles según el historial de ventas
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

  // Rango de fechas ISO según el mes seleccionado (o año completo)
  const { rangoInicio, rangoFin, etiquetaPeriodo } = useMemo(() => {
    if (mesSeleccionado === 'TODOS') {
      const { inicioISO, finISO } = getLimitesISORango(
        `${anioSeleccionado}-01-01`,
        `${anioSeleccionado}-12-31`
      )
      return {
        rangoInicio: inicioISO,
        rangoFin: finISO,
        etiquetaPeriodo: `Todo el Año ${anioSeleccionado}`,
      }
    }

    const mm = String(mesSeleccionado).padStart(2, '0')
    const ultimoDia = new Date(anioSeleccionado, mesSeleccionado, 0).getDate()
    const { inicioISO, finISO } = getLimitesISORango(
      `${anioSeleccionado}-${mm}-01`,
      `${anioSeleccionado}-${mm}-${ultimoDia}`
    )
    return {
      rangoInicio: inicioISO,
      rangoFin: finISO,
      etiquetaPeriodo: `${NOMBRES_MESES[mesSeleccionado - 1]} ${anioSeleccionado}`,
    }
  }, [anioSeleccionado, mesSeleccionado])

  // Ventas completadas filtradas por circuito fiscal (100% Real vs Solo ARCA vs Solo Internas)
  const ventasValidasAnio = useMemo(() => {
    return ventasAnio.filter((v) => {
      if (v.estado !== 'COMPLETADA') return false
      if (filtroFiscal === 'SOLO_FISCALES') return Boolean(v.afip_cae)
      if (filtroFiscal === 'SOLO_INTERNAS') return !v.afip_cae
      return true
    })
  }, [ventasAnio, filtroFiscal])

  // Ventas del período seleccionado (mes o año completo)
  const ventasPeriodo = useMemo(() => {
    return ventasValidasAnio.filter((v) => {
      return v.fecha_hora >= rangoInicio && v.fecha_hora <= rangoFin
    })
  }, [ventasValidasAnio, rangoInicio, rangoFin])

  // Ventas fiscales y no fiscales del período para el banner y exportación
  const ventasFiscalesPeriodo = useMemo(() => {
    return ventasAnio.filter(
      (v) =>
        v.estado === 'COMPLETADA' &&
        Boolean(v.afip_cae) &&
        v.fecha_hora >= rangoInicio &&
        v.fecha_hora <= rangoFin
    )
  }, [ventasAnio, rangoInicio, rangoFin])

  const ventasInternasPeriodo = useMemo(() => {
    return ventasAnio.filter(
      (v) =>
        v.estado === 'COMPLETADA' &&
        !v.afip_cae &&
        v.fecha_hora >= rangoInicio &&
        v.fecha_hora <= rangoFin
    )
  }, [ventasAnio, rangoInicio, rangoFin])

  const totalFacturadoAFIP = useMemo(() => {
    return ventasFiscalesPeriodo.reduce((sum, v) => sum + Number(v.total || 0), 0)
  }, [ventasFiscalesPeriodo])

  // Devoluciones del período
  const devolucionesPeriodo = useMemo(() => {
    return devolucionesAnio.filter((d) => d.fecha_hora >= rangoInicio && d.fecha_hora <= rangoFin)
  }, [devolucionesAnio, rangoInicio, rangoFin])

  const totalDevoluciones = useMemo(() => {
    return devolucionesPeriodo.reduce((sum, d) => sum + Number(d.monto_total || 0), 0)
  }, [devolucionesPeriodo])

  // Compras a proveedores del período
  const comprasPeriodo = useMemo(() => {
    return compras.filter((c) => {
      if (c.estado === 'ANULADA') return false
      const f = c.fecha
      const fISO = f.includes('T') ? f : `${f}T00:00:00`
      const t = new Date(fISO).getTime()
      const tIni = new Date(rangoInicio).getTime()
      const tFin = new Date(rangoFin).getTime()
      return !isNaN(t) ? t >= tIni && t <= tFin : f >= rangoInicio && f <= rangoFin
    })
  }, [compras, rangoInicio, rangoFin])

  // Pagos / amortizaciones de deuda a proveedores del período
  const pagosPeriodo = useMemo(() => {
    return pagos.filter((p) => {
      if (p.estado === 'ANULADO') return false
      const f = p.fecha
      const fISO = f.includes('T') ? f : `${f}T00:00:00`
      const t = new Date(fISO).getTime()
      const tIni = new Date(rangoInicio).getTime()
      const tFin = new Date(rangoFin).getTime()
      return !isNaN(t) ? t >= tIni && t <= tFin : f >= rangoInicio && f <= rangoFin
    })
  }, [pagos, rangoInicio, rangoFin])

  // Egresos varios de caja (excluyendo deducciones automáticas computadas en Compras o Pagos)
  const egresosCajaPeriodo = useMemo(() => {
    return movimientosCajaAnio.filter((m) => {
      if (m.tipo !== 'EGRESO') return false
      if (m.fecha_hora < rangoInicio || m.fecha_hora > rangoFin) return false
      if (m.motivo === 'DEVOLUCION_VENTA') return false

      if (m.motivo === 'PROVEEDOR') {
        const desc = m.descripcion || ''
        if (desc.startsWith('Pago de saldo a proveedor:') || desc.startsWith('Compra a ')) {
          return false
        }
      }
      return true
    })
  }, [movimientosCajaAnio, rangoInicio, rangoFin])

  // Ingresos varios de caja del período
  const ingresosCajaPeriodo = useMemo(() => {
    return movimientosCajaAnio.filter((m) => {
      return m.tipo === 'INGRESO' && m.fecha_hora >= rangoInicio && m.fecha_hora <= rangoFin
    })
  }, [movimientosCajaAnio, rangoInicio, rangoFin])

  // ==========================================
  // 1. MÉTRICAS CLAVE (KPIS)
  // ==========================================
  const kpisPeriodo = useMemo(() => {
    const totalFacturadoBruto = ventasPeriodo.reduce((acc, v) => acc + Number(v.total || 0), 0)
    const totalFacturado = Math.max(0, totalFacturadoBruto - totalDevoluciones)
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
        const ventasMesAnt = ventasValidasAnio.filter((v) => {
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
  }, [ventasPeriodo, totalDevoluciones, mesSeleccionado, anioSeleccionado, ventasValidasAnio])

  // Finanzas del período: Compras, Salidas Financieras, Margen y Flujo de Caja
  const totalComprasMercaderia = useMemo(() => {
    return comprasPeriodo.reduce((sum, c) => sum + c.total, 0)
  }, [comprasPeriodo])

  const comprasContadoPeriodo = useMemo(() => {
    return comprasPeriodo.filter((c) => c.medio_pago !== 'CUENTA_CORRIENTE')
  }, [comprasPeriodo])

  const totalComprasContado = useMemo(() => {
    return comprasContadoPeriodo.reduce((sum, c) => sum + c.total, 0)
  }, [comprasContadoPeriodo])

  const totalPagosAbonados = useMemo(() => {
    return pagosPeriodo.reduce((sum, p) => sum + p.monto, 0)
  }, [pagosPeriodo])

  const totalGastosCaja = useMemo(() => {
    return egresosCajaPeriodo.reduce((sum, m) => sum + m.monto, 0)
  }, [egresosCajaPeriodo])

  const totalIngresosCaja = useMemo(() => {
    return ingresosCajaPeriodo.reduce((sum, m) => sum + m.monto, 0)
  }, [ingresosCajaPeriodo])

  const totalSalidasFinancieras = totalPagosAbonados + totalComprasContado + totalGastosCaja
  const resultadoOperativo = kpisPeriodo.totalFacturado - totalComprasMercaderia

  const totalVentasCredito = useMemo(() => {
    return ventasPeriodo.reduce((sum, v) => {
      if (v.pagos && Array.isArray(v.pagos)) {
        const fiado = v.pagos
          .filter((p) => p.medio_pago === 'CUENTA_CORRIENTE')
          .reduce((s, p) => s + (p.monto || 0), 0)
        return sum + fiado
      }
      return sum
    }, 0)
  }, [ventasPeriodo])

  const ventasCobradasContado = Math.max(0, kpisPeriodo.totalFacturado - totalVentasCredito)
  const flujoCajaNeto = (ventasCobradasContado + totalIngresosCaja) - totalSalidasFinancieras

  const deudaTotalProveedores = useMemo(() => {
    return proveedores.reduce((sum, p) => sum + (p.saldo_pendiente || 0), 0)
  }, [proveedores])

  // ==========================================
  // 2. EVOLUCIÓN MENSUAL (12 MESES)
  // ==========================================
  const datosPorMesDelAnio = useMemo(() => {
    const meses = Array.from({ length: 12 }, (_, i) => {
      const numMes = i + 1
      const ventasDelMes = ventasValidasAnio.filter((v) => {
        const d = new Date(v.fecha_hora)
        return d.getMonth() + 1 === numMes
      })

      const totalVentas = ventasDelMes.reduce((acc, v) => acc + Number(v.total || 0), 0)
      const cantidadTickets = ventasDelMes.length
      const ticketPromedio = cantidadTickets > 0 ? totalVentas / cantidadTickets : 0

      // Medio de pago principal
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

    // Variación con mes anterior
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
  }, [ventasValidasAnio])

  const maxMontoMensual = useMemo(() => {
    return Math.max(1, ...datosPorMesDelAnio.map((m) => m.totalVentas))
  }, [datosPorMesDelAnio])

  // ==========================================
  // 3. DESGLOSE POR MEDIO DE PAGO
  // ==========================================
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

  // ==========================================
  // 4. LIBRO DIARIO DE MOVIMIENTOS CONTABLES
  // ==========================================
  const libroDiario = useMemo<AsientoContable[]>(() => {
    const asientos: AsientoContable[] = []

    // 1. Ventas
    ventasPeriodo.forEach((v) => {
      const medioStr =
        v.pagos && v.pagos.length > 0
          ? v.pagos.map((p) => labelMedioPago(p.medio_pago)).join(', ')
          : 'Efectivo'

      const esFiscal = Boolean(v.afip_cae)
      const ticketRef =
        esFiscal && v.afip_nro_comprobante
          ? `FC-${String(v.afip_nro_comprobante).padStart(8, '0')}`
          : `T-${v.id.slice(0, 8).toUpperCase()}`

      asientos.push({
        id: `v-${v.id}`,
        fecha: v.fecha_hora,
        tipo: 'VENTA',
        comprobante: ticketRef,
        concepto: `${esFiscal ? 'Factura Electrónica ARCA' : 'Venta en mostrador'}${v.usuario?.nombre ? ` (${v.usuario.nombre})` : ''}`,
        medio_pago: medioStr,
        ingreso: Number(v.total || 0),
        egreso: 0,
        notas: v.notas,
        ventaData: v,
      })
    })

    // 2. Compras
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

    // 3. Pagos / Amortizaciones a proveedores
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

    // 4. Egresos de caja
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

    // 5. Ingresos de caja
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

    // 6. Devoluciones
    devolucionesPeriodo.forEach((d) => {
      let canal = 'Efectivo'
      if (d.metodo_reintegro === 'EFECTIVO_CAJA') canal = 'Efectivo'
      else if (d.metodo_reintegro === 'MERCADOPAGO') canal = 'Mercado Pago'
      else if (d.metodo_reintegro === 'TRANSFERENCIA') canal = 'Transferencia'
      else if (d.metodo_reintegro === 'CUENTA_CORRIENTE') canal = 'Cuenta Corriente'

      const ventaAsociada = (d.venta as VentaContable) || ventasAnio.find((v) => v.id === d.venta_id)
      const ticketRef = d.venta_id ? `T-${d.venta_id.slice(0, 8).toUpperCase()}` : null

      asientos.push({
        id: `dev-${d.id}`,
        fecha: d.fecha_hora,
        tipo: 'DEVOLUCION',
        comprobante: `DEV-${d.id.slice(0, 8).toUpperCase()}`,
        ticketRef,
        ventaData: ventaAsociada || null,
        concepto: `Reintegro por devolución (${d.motivo || 'Devolución'})${ticketRef ? ` · Ticket ${ticketRef}` : ''}`,
        medio_pago: canal,
        ingreso: 0,
        egreso: Number(d.monto_total || 0),
        notas: d.notas,
      })
    })

    return asientos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
  }, [
    ventasPeriodo,
    comprasPeriodo,
    pagosPeriodo,
    egresosCajaPeriodo,
    ingresosCajaPeriodo,
    devolucionesPeriodo,
    ventasAnio,
  ])

  // Filtrado de asientos del Libro Diario
  const asientosFiltrados = useMemo(() => {
    return libroDiario.filter((a) => {
      if (filtroTipo === 'VENTAS' && a.tipo !== 'VENTA') return false
      if (filtroTipo === 'COMPRAS' && a.tipo !== 'COMPRA') return false
      if (filtroTipo === 'PAGOS' && a.tipo !== 'PAGO_PROVEEDOR') return false
      if (filtroTipo === 'CAJA' && a.tipo !== 'EGRESO_CAJA' && a.tipo !== 'INGRESO_CAJA') return false
      if (filtroTipo === 'DEVOLUCIONES' && a.tipo !== 'DEVOLUCION') return false

      if (busqueda.trim()) {
        const q = busqueda.toLowerCase()
        const matchComp = a.comprobante.toLowerCase().includes(q)
        const matchConc = a.concepto.toLowerCase().includes(q)
        const matchMedio = a.medio_pago.toLowerCase().includes(q)
        const matchNotas = (a.notas || '').toLowerCase().includes(q)
        if (!matchComp && !matchConc && !matchMedio && !matchNotas) return false
      }

      return true
    })
  }, [libroDiario, filtroTipo, busqueda])

  // ==========================================
  // EXPORTACIONES A EXCEL (.XLSX)
  // ==========================================
  const handleExportarRendimientos = async () => {
    setExportando(true)
    try {
      const mesNombre =
        mesSeleccionado === 'TODOS'
          ? `Todo el Año (${anioSeleccionado})`
          : NOMBRES_MESES[mesSeleccionado - 1]

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

      const ventasExport: DetalleVentaRendimientoExport[] = ventasPeriodo.map((v) => ({
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

  const handleExportarLibroDiario = async () => {
    if (libroDiario.length === 0) {
      toast.error('No hay movimientos en este período para exportar')
      return
    }

    setExportando(true)
    try {
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

      const metricas: MetricasBalanceExport = {
        totalIngresos: kpisPeriodo.totalFacturado,
        totalComprasMercaderia,
        resultadoOperativo,
        totalSalidasFinancieras,
        flujoCajaNeto,
        totalFacturadoAFIP,
        totalVentasInternas: kpisPeriodo.totalFacturado - totalFacturadoAFIP,
        deudaTotalProveedores,
      }

      await exportarLibroContableExcel(
        exportRows,
        etiquetaPeriodo.replace(/[^a-zA-Z0-9]/g, '_'),
        kiosco?.nombre || 'Comercio',
        metricas
      )
      toast.success('Libro diario contable descargado en formato Excel (.xlsx)')
    } catch (err: any) {
      console.error('Error al exportar libro diario contable:', err)
      toast.error('No se pudo generar el libro diario Excel')
    } finally {
      setExportando(false)
    }
  }

  const handleExportarLibroIvaVentas = async () => {
    if (ventasFiscalesPeriodo.length === 0) {
      toast.error('No hay ventas con factura electrónica ARCA en este período')
      return
    }

    setExportando(true)
    try {
      await exportarLibroIvaVentasExcel(
        ventasFiscalesPeriodo as any,
        kiosco,
        etiquetaPeriodo.replace(/[^a-zA-Z0-9]/g, '_')
      )
      toast.success('Libro IVA Ventas exportado en formato Excel (.xlsx) para el contador')
    } catch (err: any) {
      console.error('Error al exportar libro IVA ARCA:', err)
      toast.error('No se pudo generar el archivo Excel')
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. BARRA SUPERIOR: Período, Circuito Fiscal y Acciones */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>Balance Contable y Rendimientos</span>
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {etiquetaPeriodo} · Analítica comercial, evolución anual, estados financieros y libro diario
          </p>
        </div>

        {/* Controles de Período y Botón de Recarga */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de Año */}
          <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700/60 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Año:</span>
            <select
              value={anioSeleccionado}
              onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
              aria-label="Seleccionar año de balance"
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
              aria-label="Seleccionar mes de balance"
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

          {/* Botón Actualizar compacto con ícono */}
          <button
            type="button"
            onClick={cargarDatosAnio}
            disabled={cargando}
            title="Recargar ventas, gastos y libro contable"
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
        </div>
      </div>

      {/* 2. SELECTOR DE CIRCUITO FISCAL Y ACCIONES DE EXPORTACIÓN */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-gray-700 dark:text-gray-300 mr-1">
            Circuito:
          </span>
          <div className="flex bg-gray-100 dark:bg-gray-700/60 p-1 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => setFiltroFiscal('TODAS')}
              className={`px-3 py-1 rounded-md transition-all ${
                filtroFiscal === 'TODAS'
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Control Real (100%)
            </button>
            <button
              type="button"
              onClick={() => setFiltroFiscal('SOLO_FISCALES')}
              className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                filtroFiscal === 'SOLO_FISCALES'
                  ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <span>Facturas ARCA</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-bold">
                {ventasFiscalesPeriodo.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFiltroFiscal('SOLO_INTERNAS')}
              className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                filtroFiscal === 'SOLO_INTERNAS'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-xs font-bold'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <span>Tickets Internos (X)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300 font-bold">
                {ventasInternasPeriodo.length}
              </span>
            </button>
          </div>
        </div>

        {/* Botones de Descarga Excel Corporativo */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportarLibroDiario}
            loading={exportando}
            disabled={libroDiario.length === 0}
            className="text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
            title="Descargar libro diario contable detallado en Excel (.xlsx)"
          >
            <IconExportar />
            <span>Descargar Libro Diario</span>
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportarRendimientos}
            loading={exportando}
            className="text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
            title="Descargar analítica de rendimientos mensuales y desglose de medios de pago en Excel (.xlsx)"
          >
            <IconExportar />
            <span>Exportar Rendimientos</span>
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportarLibroIvaVentas}
            loading={exportando}
            disabled={ventasFiscalesPeriodo.length === 0}
            className="text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
            title="Descargar reporte fiscal de ventas ARCA para el contador en Excel (.xlsx)"
          >
            <IconExportar />
            <span>Exportar Libro IVA ARCA</span>
          </Button>
        </div>
      </div>

      {/* Banner informativo de modo fiscal */}
      {filtroFiscal === 'SOLO_FISCALES' && (
        <div className="p-3 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-blue-900 dark:text-blue-200">
            <span className="font-bold">Vista Fiscal Oficial:</span> Mostrando exclusivamente las {ventasFiscalesPeriodo.length} ventas con CAE emitidas ante ARCA. Total facturado: <strong>{formatPrecio(totalFacturadoAFIP)}</strong>.
          </div>
          <span className="text-[11px] text-blue-700 dark:text-blue-400 font-mono">
            Punto de Venta: {String(kiosco?.afip_punto_venta || 2).padStart(4, '0')}
          </span>
        </div>
      )}

      {cargando ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 font-medium">
            Calculando balance contable y consolidando rendimientos...
          </p>
        </div>
      ) : (
        <>
          {/* 3. TARJETAS DE MÉTRICAS CLAVE (KPIS) - Diseño sobrio sin íconos genéricos */}
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

          {/* 4. GRÁFICO DE BARRAS INTERACTIVO (12 MESES DE anioSeleccionado) */}
          <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>Evolución Mensual de Facturación ({anioSeleccionado})</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Hacé click sobre cualquier mes para filtrar el libro diario y analizar sus ventas específicas
                </p>
              </div>

              {mesSeleccionado !== 'TODOS' && (
                <button
                  type="button"
                  onClick={() => setMesSeleccionado('TODOS')}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer self-start sm:self-auto"
                >
                  ← Ver año completo ({anioSeleccionado})
                </button>
              )}
            </div>

            {/* Contenedor del Gráfico de 12 Barras con scroll horizontal fluido en celulares */}
            <div className="pt-6 pb-2 overflow-x-auto scrollbar-thin">
              <div className="min-w-[500px] sm:min-w-full">
                <div className="grid grid-cols-12 gap-1.5 sm:gap-3 h-52 border-b border-gray-200 dark:border-gray-700 px-1 sm:px-2 pb-2">
                  {datosPorMesDelAnio.map((m) => {
                    const estaSeleccionado = mesSeleccionado === m.numeroMes
                    const porcentaje =
                      maxMontoMensual > 0
                        ? m.totalVentas > 0
                          ? Math.max(10, Math.round((m.totalVentas / maxMontoMensual) * 100))
                          : 0
                        : 0

                    return (
                      <div
                        key={m.numeroMes}
                        onClick={() => setMesSeleccionado(m.numeroMes)}
                        className="flex flex-col items-center h-full justify-end group cursor-pointer select-none"
                        title={`${m.nombre}: ${formatPrecio(m.totalVentas)} (${m.cantidadTickets} tickets)`}
                      >
                        {/* Etiqueta con el monto arriba */}
                        <span
                          className={`text-[9px] sm:text-[10px] font-bold mb-1 transition-all truncate max-w-full leading-tight ${
                            estaSeleccionado
                              ? 'text-indigo-600 dark:text-indigo-400 font-extrabold scale-105'
                              : m.totalVentas > 0
                              ? 'text-gray-800 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}
                        >
                          {m.totalVentas > 0 ? (
                            m.totalVentas >= 1000000
                              ? `$${(m.totalVentas / 1000000).toFixed(1)}M`
                              : m.totalVentas >= 1000
                              ? `$${Math.round(m.totalVentas / 1000)}k`
                              : `$${m.totalVentas}`
                          ) : (
                            '$0'
                          )}
                        </span>

                        {/* Pista / Track de la barra con altura fija para compatibilidad total con WebKit/iOS */}
                        <div className="w-full relative h-36 sm:h-[148px] bg-gray-100/90 dark:bg-gray-800/80 rounded-t-lg p-0.5 overflow-hidden border border-transparent group-hover:border-indigo-300 dark:group-hover:border-indigo-500/40 transition-colors">
                          <div
                            style={{ height: `${porcentaje}%`, minHeight: m.totalVentas > 0 ? '8px' : '0px' }}
                            className={`absolute bottom-0 left-0 right-0 rounded-t-md transition-all duration-300 flex items-center justify-center ${
                              estaSeleccionado
                                ? 'bg-gradient-to-t from-indigo-600 to-indigo-500 shadow-md ring-2 ring-indigo-400 ring-offset-1 dark:ring-offset-gray-900'
                                : m.totalVentas > 0
                                ? 'bg-gradient-to-t from-indigo-500 to-indigo-400 dark:from-indigo-600 dark:to-cyan-400 shadow-xs group-hover:brightness-110'
                                : 'bg-transparent'
                            }`}
                          >
                            {m.cantidadTickets > 0 && porcentaje >= 25 && (
                              <span className="text-[9px] font-bold text-white drop-shadow-xs px-0.5 truncate pointer-events-none">
                                {m.cantidadTickets}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Nombre del Mes */}
                        <span
                          className={`text-[10px] sm:text-xs font-semibold mt-2 transition-colors ${
                            estaSeleccionado
                              ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                              : 'text-gray-600 dark:text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
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
          </div>

          {/* 5. SEGMENTACIÓN Y DESGLOSES: Medios de Pago y Pasivos / Finanzas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Desglose por Medio de Pago */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center justify-between mb-3">
                <span>Facturación por Medio de Pago</span>
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                  Total: {formatPrecio(kpisPeriodo.totalFacturado)}
                </span>
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

            {/* Cuentas por Pagar (Pasivos) y Resumen Financiero */}
            {esDueno && (
              <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">
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

                  {/* Lista de saldos con proveedores */}
                  <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-36 overflow-y-auto pr-1">
                    {proveedores.filter((p) => (p.saldo_pendiente || 0) > 0).length === 0 ? (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 py-2.5 font-medium">
                        Excelente: no hay saldos adeudados a proveedores actualmente.
                      </p>
                    ) : (
                      proveedores
                        .filter((p) => (p.saldo_pendiente || 0) > 0)
                        .map((p) => (
                          <div key={p.id} className="py-1.5 flex items-center justify-between text-xs">
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

                {/* Indicadores Financieros Operativos */}
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-1.5 text-xs">
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Compras mercadería período:</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      {formatPrecio(totalComprasMercaderia)}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Salidas financieras efectivas:</span>
                    <span className="font-bold text-red-600 dark:text-red-400">
                      {formatPrecio(totalSalidasFinancieras)}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Margen bruto operativo:</span>
                    <span
                      className={`font-bold ${
                        resultadoOperativo >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {formatPrecio(resultadoOperativo)}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">Flujo neto estimado:</span>
                    <span
                      className={`font-bold ${
                        flujoCajaNeto >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {formatPrecio(flujoCajaNeto)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 6. TABLA COMPARATIVA DE RENDIMIENTOS (12 Meses - Desplegable con anchos fijos) */}
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
                  className={`w-4 h-4 transition-transform duration-200 ${
                    tablaRendimientosAbierta ? 'rotate-180' : ''
                  }`}
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

          {/* 7. LIBRO DIARIO DE MOVIMIENTOS CONTABLES (TABLA CRONOLÓGICA UNIFICADA) */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xs space-y-4 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Libro Diario de Movimientos Contables
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
                    { tipo: 'DEVOLUCIONES', label: 'Devoluciones' },
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
                placeholder="Buscar por comprobante, concepto, cajero, proveedor..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onClear={() => setBusqueda('')}
              />
            </div>

            {/* Contenedor del Libro Diario: Tarjetas Ejecutivas en Celulares y Tabla Ancha en Computadoras */}
            <div>
              {asientosFiltrados.length === 0 ? (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                  No se encontraron asientos contables en este período.
                </div>
              ) : (
                <>
                  {/* 1. VISTA MÓVIL (PANTALLAS PEQUEÑAS / CELULARES) */}
                  <div className="block md:hidden space-y-2.5">
                    {asientosFiltrados.map((asiento) => {
                      const esIngreso = (asiento.ingreso || 0) > 0
                      const esEgreso = (asiento.egreso || 0) > 0

                      return (
                        <div
                          key={asiento.id}
                          className="bg-white dark:bg-gray-800 rounded-xl p-3.5 border border-gray-200 dark:border-gray-700 shadow-2xs space-y-2"
                        >
                          {/* Fila superior: Tipo, Fecha y Monto Destacado */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {asiento.tipo === 'VENTA' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                                  VENTA
                                </span>
                              )}
                              {asiento.tipo === 'COMPRA' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300">
                                  COMPRA
                                </span>
                              )}
                              {asiento.tipo === 'PAGO_PROVEEDOR' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300">
                                  PAGO PROV.
                                </span>
                              )}
                              {asiento.tipo === 'EGRESO_CAJA' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300">
                                  EGRESO CAJA
                                </span>
                              )}
                              {asiento.tipo === 'INGRESO_CAJA' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300">
                                  INGRESO CAJA
                                </span>
                              )}
                              {asiento.tipo === 'DEVOLUCION' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                                  DEVOLUCIÓN
                                </span>
                              )}
                              <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                                {formatFecha(asiento.fecha)}
                              </span>
                            </div>

                            {/* Monto financiero */}
                            <div className="text-right shrink-0">
                              {esIngreso && (
                                <span className="text-sm font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
                                  +{formatPrecio(asiento.ingreso)}
                                </span>
                              )}
                              {esEgreso && (
                                <span className="text-sm font-extrabold tabular-nums text-red-600 dark:text-red-400">
                                  -{formatPrecio(asiento.egreso)}
                                </span>
                              )}
                              {!esIngreso && !esEgreso && (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </div>
                          </div>

                          {/* Concepto del asiento y notas */}
                          <div>
                            <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 leading-snug">
                              {asiento.concepto}
                            </p>
                            {asiento.notas && (
                              <p className="text-[11px] text-gray-400 dark:text-gray-500 italic mt-0.5">
                                {asiento.notas}
                              </p>
                            )}
                          </div>

                          {/* Fila inferior: Comprobante / Ticket interactivo + Medio de Pago */}
                          <div className="flex items-center justify-between pt-1.5 border-t border-gray-100 dark:border-gray-700/60 text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {asiento.tipo === 'VENTA' && asiento.ventaData ? (
                                <button
                                  type="button"
                                  onClick={() => setTicketParaVer(ventaToTicketData(asiento.ventaData, kiosco))}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all shadow-2xs active:scale-95 cursor-pointer truncate ${
                                    asiento.ventaData.afip_cae
                                      ? 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                      : 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                                  }`}
                                  title="Tocar para ver el comprobante completo"
                                >
                                  <span>🧾 {asiento.comprobante}</span>
                                  {asiento.ventaData.afip_cae ? (
                                    <span className="text-[9px] font-black px-1 rounded bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-100 shrink-0">
                                      ARCA
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-indigo-600 dark:text-indigo-400 shrink-0 underline">
                                      Ver
                                    </span>
                                  )}
                                </button>
                              ) : asiento.tipo === 'DEVOLUCION' ? (
                                <div className="inline-flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono text-gray-700 dark:text-gray-300 font-semibold text-xs">
                                    {asiento.comprobante}
                                  </span>
                                  {asiento.ticketRef && (
                                    asiento.ventaData ? (
                                      <button
                                        type="button"
                                        onClick={() => setTicketParaVer(ventaToTicketData(asiento.ventaData, kiosco))}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
                                        title="Ver comprobante de venta original modificado"
                                      >
                                        <span>Ticket:</span> {asiento.ticketRef}
                                      </button>
                                    ) : (
                                      <span className="text-[10px] font-mono text-gray-400">
                                        Ticket: {asiento.ticketRef}
                                      </span>
                                    )
                                  )}
                                </div>
                              ) : (
                                <span className="font-mono text-gray-600 dark:text-gray-400 text-xs truncate">
                                  {asiento.comprobante}
                                </span>
                              )}
                            </div>

                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 shrink-0">
                              {asiento.medio_pago}
                            </span>
                          </div>
                        </div>
                      )
                    })}

                    {/* Resumen Total para Móvil */}
                    <div className="bg-gray-50 dark:bg-gray-800/80 rounded-xl p-3.5 border border-gray-200 dark:border-gray-700 text-xs space-y-1.5 mt-3 shadow-2xs">
                      <div className="font-bold text-gray-800 dark:text-gray-200 flex justify-between">
                        <span>Totales ({asientosFiltrados.length} operaciones)</span>
                      </div>
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                        <span>Total Ingresos:</span>
                        <span className="tabular-nums font-bold">
                          +{formatPrecio(asientosFiltrados.reduce((sum, a) => sum + (a.ingreso || 0), 0))}
                        </span>
                      </div>
                      <div className="flex justify-between text-red-600 dark:text-red-400 font-semibold">
                        <span>Total Egresos:</span>
                        <span className="tabular-nums font-bold">
                          -{formatPrecio(asientosFiltrados.reduce((sum, a) => sum + (a.egreso || 0), 0))}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2. VISTA ESCRITORIO (PANTALLAS MEDIANAS Y GRANDES) */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                    <table className="w-full min-w-[850px] text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">
                          <th className="py-2.5 px-3 whitespace-nowrap w-[140px]">Fecha y Hora</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap w-[100px]">Tipo</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap w-[160px]">Comprobante / Ref</th>
                          <th className="py-2.5 px-3">Concepto / Detalle</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap w-[130px]">Medio de Pago</th>
                          <th className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400 whitespace-nowrap w-[110px]">
                            Ingreso (+)
                          </th>
                          <th className="py-2.5 px-3 text-right text-red-600 dark:text-red-400 whitespace-nowrap w-[110px]">
                            Egreso (-)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-800">
                        {asientosFiltrados.map((asiento) => (
                          <tr
                            key={asiento.id}
                            className="hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors"
                          >
                            <td className="py-2.5 px-3 whitespace-nowrap text-gray-600 dark:text-gray-400 tabular-nums">
                              {formatFecha(asiento.fecha)}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap text-center">
                              {asiento.tipo === 'VENTA' && (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  VENTA
                                </span>
                              )}
                              {asiento.tipo === 'COMPRA' && (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                                  COMPRA
                                </span>
                              )}
                              {asiento.tipo === 'PAGO_PROVEEDOR' && (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                                  PAGO PROV.
                                </span>
                              )}
                              {asiento.tipo === 'EGRESO_CAJA' && (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">
                                  EGRESO CAJA
                                </span>
                              )}
                              {asiento.tipo === 'INGRESO_CAJA' && (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                                  INGRESO CAJA
                                </span>
                              )}
                              {asiento.tipo === 'DEVOLUCION' && (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                  DEVOLUCIÓN
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap tabular-nums font-semibold text-gray-800 dark:text-gray-200 text-center">
                              {asiento.tipo === 'VENTA' && asiento.ventaData ? (
                                <div className="inline-flex items-center justify-center gap-1.5 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => setTicketParaVer(ventaToTicketData(asiento.ventaData, kiosco))}
                                    className={`font-mono font-bold hover:underline cursor-pointer px-2 py-0.5 rounded transition-colors text-center ${
                                      asiento.ventaData.afip_cae
                                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:text-blue-900'
                                        : 'bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800'
                                    }`}
                                    title="Hacé clic para ver o imprimir el comprobante de esta venta"
                                  >
                                    {asiento.comprobante}
                                  </button>
                                  {asiento.ventaData.afip_cae ? (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 uppercase shrink-0">
                                      ARCA
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 shrink-0">
                                      Interno
                                    </span>
                                  )}
                                </div>
                              ) : asiento.tipo === 'DEVOLUCION' ? (
                                <div className="inline-flex flex-col items-center justify-center gap-0.5 min-w-0">
                                  <span className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">
                                    {asiento.comprobante}
                                  </span>
                                  {asiento.ticketRef && (
                                    asiento.ventaData ? (
                                      <button
                                        type="button"
                                        onClick={() => setTicketParaVer(ventaToTicketData(asiento.ventaData, kiosco))}
                                        className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer bg-indigo-50/80 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded transition-colors"
                                        title="Ver comprobante de venta original modificado"
                                      >
                                        <span>Ticket:</span> {asiento.ticketRef}
                                      </button>
                                    ) : (
                                      <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">
                                        Ticket: {asiento.ticketRef}
                                      </span>
                                    )
                                  )}
                                </div>
                              ) : (
                                <span className="font-mono text-center">{asiento.comprobante}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <p className="font-medium text-gray-900 dark:text-gray-100">
                                {asiento.concepto}
                              </p>
                              {asiento.notas && (
                                <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">
                                  {asiento.notas}
                                </p>
                              )}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap text-center text-gray-600 dark:text-gray-400">
                              {asiento.medio_pago}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                              {asiento.ingreso > 0 ? (
                                formatPrecio(asiento.ingreso)
                              ) : (
                                <span className="text-gray-400 dark:text-gray-600 font-normal mr-1">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold tabular-nums text-red-600 dark:text-red-400 whitespace-nowrap">
                              {asiento.egreso > 0 ? (
                                formatPrecio(asiento.egreso)
                              ) : (
                                <span className="text-gray-400 dark:text-gray-600 font-normal mr-1">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 font-bold text-gray-900 dark:text-white">
                          <td colSpan={5} className="py-3 px-3 text-right uppercase tracking-wider text-xs">
                            Totales del Período ({asientosFiltrados.length} op.):
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400 text-sm whitespace-nowrap">
                            {formatPrecio(
                              asientosFiltrados.reduce((sum, a) => sum + (a.ingreso || 0), 0)
                            )}
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums text-red-600 dark:text-red-400 text-sm whitespace-nowrap">
                            {formatPrecio(
                              asientosFiltrados.reduce((sum, a) => sum + (a.egreso || 0), 0)
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modal de visualización / reimpresión de comprobante */}
      <TicketReceiptModal
        isOpen={Boolean(ticketParaVer)}
        onClose={() => setTicketParaVer(null)}
        ticket={ticketParaVer}
      />
    </div>
  )
}
