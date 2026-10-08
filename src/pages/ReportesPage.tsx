import { IndicatorCard } from '../components/ui/IndicatorCard'
import { RefreshButton } from '../components/ui/RefreshButton'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { formatPrecio, formatFecha, labelMedioPago, getFechaLocal, getLimitesISODia, clearCachedProductos } from '../lib/utils'
import { exportarVentasExcel } from '../lib/exportUtils'
import { IconExportar } from '../components/ui/Icons'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { TicketReceiptModal, type TicketData } from '../components/pos/TicketReceiptModal'
import { BalanceContableTab } from '../components/reportes/BalanceContableTab'
import { RotacionTab } from '../components/reportes/RotacionTab'
import { BajasStockTab } from '../components/reportes/BajasStockTab'
import { ExternalBackupReminder } from '../components/config/ExternalBackupReminder'
import { useClienteStore } from '../stores/clienteStore'
import { useCajaStore } from '../stores/cajaStore'
import { anularVentaAtomica } from '../lib/annulmentClient'

import { cargarCostosProtegidos } from '../lib/productCostAccess'
import { ventaToTicketData } from '../lib/ticketUtils'

import toast from 'react-hot-toast'

interface ResumenDiario {
  totalVentas: number
  totalDevoluciones?: number
  cantidadVentas: number
  ventaPromedio: number
  totalCosto: number
  gananciaBruta: number
  margenPorcentaje: number
  porMedioPago: { medio: string; total: number; cantidad: number }[]
}

interface VentaResumen {
  id: string
  fecha_hora: string
  total: number
  estado: string
  notas: string | null
  sesion_caja_id?: string | null
  afip_cae?: string | null
  afip_vto_cae?: string | null
  afip_tipo_comprobante?: number | null
  afip_nro_comprobante?: number | null
  afip_qr_url?: string | null
  usuario?: { nombre: string }
  pagos: { medio_pago: string; monto: number }[]
  detalles: {
    cantidad: number
    precio_unitario?: number
    subtotal: number
    producto_id: string
    sin_envase?: boolean
    es_devolucion_envase?: boolean
    producto?: { id: string; descripcion: string; stock_actual: number; precio_costo?: number }
  }[]
}

export function ReportesPage() {
  const { usuario, kiosco } = useAuthStore()
  const esDueno = usuario?.rol === 'DUEÑO' || Boolean(usuario?.es_superadmin)
  const [tabActiva, setTabActiva] = useState<'balance' | 'ventas' | 'rotacion' | 'bajas'>('balance')
  const [fecha, setFecha] = useState(() => getFechaLocal())
  const [ventas, setVentas] = useState<VentaResumen[]>([])
  const [resumen, setResumen] = useState<ResumenDiario | null>(null)
  const [cargando, setCargando] = useState(true)
  const [ventaExpandida, setVentaExpandida] = useState<string | null>(null)
  const [ventaParaAnular, setVentaParaAnular] = useState<VentaResumen | null>(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [usarCajaActual, setUsarCajaActual] = useState(false)
  const [anulando, setAnulando] = useState(false)
  const [ticketParaImprimir, setTicketParaImprimir] = useState<TicketData | null>(null)

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    const { inicioISO, finISO } = getLimitesISODia(fecha)
    const kid = usuario?.kiosco_id || kiosco?.id
    const productoResumenSelect = 'id, descripcion, stock_actual, precio_venta'

    // Cargar ventas del día con detalles y pagos
    let query = supabase
      .from('ventas')
      .select(`
        id, fecha_hora, total, estado, notas, sesion_caja_id,
        afip_cae, afip_vto_cae, afip_tipo_comprobante, afip_nro_comprobante, afip_qr_url,
        usuario:usuarios!usuario_id(nombre),
        pagos:pagos_venta(medio_pago, monto),
        detalles:detalles_venta(cantidad, precio_unitario, subtotal, producto_id, sin_envase, es_devolucion_envase, producto:productos(${productoResumenSelect}))
      `)
      .gte('fecha_hora', inicioISO)
      .lte('fecha_hora', finISO)
      .order('fecha_hora', { ascending: false })
      .limit(10000)

    if (kid) {
      query = query.eq('kiosco_id', kid)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error cargando ventas:', error)
      toast.error('Error al cargar ventas')
      setCargando(false)
      return
    }

    let ventasData = (data || []) as unknown as VentaResumen[]

    // Cargar devoluciones del día para calcular ventas netas y deducir reintegros y costo devuelto
    let queryDevs = supabase
      .from('devoluciones_venta')
      .select('id, monto_total, metodo_reintegro, fecha_hora, detalles:detalles_devolucion(cantidad, producto_id, producto:productos(id))')
      .gte('fecha_hora', inicioISO)
      .lte('fecha_hora', finISO)
      .limit(10000)

    if (kid) {
      queryDevs = queryDevs.eq('kiosco_id', kid)
    }

    const { data: devsData } = await queryDevs

    let devolucionesData = devsData || []
    if (esDueno) {
      const idsProductos = [
        ...ventasData.flatMap((venta) => (venta.detalles || []).map((detalle) => detalle.producto_id)),
        ...devolucionesData.flatMap((devolucion: any) =>
          (devolucion.detalles || []).map((detalle: any) => detalle.producto_id || detalle.producto?.id)
        ),
      ]
      try {
        const costos = await cargarCostosProtegidos(idsProductos)
        const costoPorId = new Map(costos.map((costo) => [costo.producto_id, Number(costo.precio_costo) || 0]))
        ventasData = ventasData.map((venta) => ({
          ...venta,
          detalles: (venta.detalles || []).map((detalle) => ({
            ...detalle,
            producto: detalle.producto
              ? { ...detalle.producto, precio_costo: costoPorId.get(detalle.producto_id) ?? (Number(detalle.producto.precio_costo) || 0) }
              : undefined,
          })),
        }))
        devolucionesData = devolucionesData.map((devolucion: any) => ({
          ...devolucion,
          detalles: (devolucion.detalles || []).map((detalle: any) => ({
            ...detalle,
            producto: detalle.producto
              ? { ...detalle.producto, precio_costo: costoPorId.get(detalle.producto_id) ?? (Number(detalle.producto.precio_costo) || 0) }
              : undefined,
          })),
        }))
      } catch (errCostos) {
        console.error('Error cargando costos protegidos para reportes:', errCostos)
        toast.error('No se pudieron cargar los costos privados del reporte.')
      }
    } else {
        ventasData = ventasData.map((venta) => ({
        ...venta,
        detalles: (venta.detalles || []).map(({ producto, ...detalle }) => {
          if (!producto) return detalle
          const { precio_costo: _precioCosto, ...productoPublico } = producto
          return { ...detalle, producto: productoPublico }
        }),
      }))
    }

    setVentas(ventasData)

    // Solo ventas COMPLETADAS para el resumen financiero
    const ventasValidas = ventasData.filter((v) => v.estado === 'COMPLETADA')
    const totalVentasBrutas = ventasValidas.reduce((sum, v) => sum + v.total, 0)
    const cantidadVentas = ventasValidas.length

    // Calcular costo total de la mercadería vendida (CMV) con datos privados del dueño.
    let totalCostoVentas = 0
    if (esDueno) {
      for (const venta of ventasValidas) {
        for (const det of venta.detalles || []) {
          if (det.es_devolucion_envase) continue
          totalCostoVentas += (Number(det.cantidad) || 0) * (Number(det.producto?.precio_costo) || 0)
        }
      }
    }
    const totalDevoluciones = devolucionesData.reduce((acc: number, d: any) => acc + (d.monto_total || 0), 0)

    // Deducir el costo de la mercadería reincorporada por devolución para que el CMV refleje el costo neto real
    let totalCostoDevoluciones = 0
    if (esDueno) {
      for (const d of devolucionesData) {
        for (const det of (d as any).detalles || []) {
          const costoUnit = Number(det.producto?.precio_costo) || 0
          totalCostoDevoluciones += (Number(det.cantidad) || 0) * costoUnit
        }
      }
    }
    const totalCostoVentasNeto = Math.max(0, totalCostoVentas - totalCostoDevoluciones)

    const totalVentas = Math.max(0, totalVentasBrutas - totalDevoluciones)
    const ventaPromedio = cantidadVentas > 0 ? totalVentas / cantidadVentas : 0

    const gananciaBruta = totalVentas - totalCostoVentasNeto
    const margenPorcentaje = totalVentas > 0 ? (gananciaBruta / totalVentas) * 100 : 0

    // Agrupar por medio de pago
    const mediosMap = new Map<string, { total: number; cantidad: number }>()
    for (const venta of ventasValidas) {
      for (const pago of venta.pagos) {
        const actual = mediosMap.get(pago.medio_pago) || { total: 0, cantidad: 0 }
        mediosMap.set(pago.medio_pago, {
          total: actual.total + pago.monto,
          cantidad: actual.cantidad + 1,
        })
      }
    }

    // Deducir reintegros según el canal correspondiente
    if (devolucionesData.length > 0) {
      for (const dev of devolucionesData) {
        if (dev.metodo_reintegro === 'OTRO') continue
        
        let canal = 'EFECTIVO'
        if (dev.metodo_reintegro === 'EFECTIVO_CAJA') canal = 'EFECTIVO'
        else if (dev.metodo_reintegro === 'MERCADOPAGO') canal = 'MERCADOPAGO'
        else if (dev.metodo_reintegro === 'TRANSFERENCIA') canal = 'TRANSFERENCIA'
        else if (dev.metodo_reintegro === 'CUENTA_CORRIENTE') canal = 'CUENTA_CORRIENTE'

        const actual = mediosMap.get(canal)
        if (actual) {
          mediosMap.set(canal, {
            total: Math.max(0, actual.total - (dev.monto_total || 0)),
            cantidad: actual.cantidad,
          })
        }
      }
    }

    const porMedioPago = Array.from(mediosMap.entries()).map(([medio, data]) => ({
      medio,
      ...data,
    }))

    setResumen({
      totalVentas,
      totalDevoluciones,
      cantidadVentas,
      ventaPromedio,
      totalCosto: totalCostoVentasNeto,
      gananciaBruta,
      margenPorcentaje,
      porMedioPago,
    })
    setCargando(false)
  }, [fecha, usuario?.kiosco_id, kiosco?.id, esDueno])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const cambiarFecha = (dias: number) => {
    const [año, mes, dia] = fecha.split('-').map(Number)
    const d = new Date(año, mes - 1, dia + dias)
    setFecha(getFechaLocal(d))
  }

  const esHoy = fecha === getFechaLocal()

  const handleAnularVenta = async () => {
    if (!ventaParaAnular || anulando) return
    if (motivoAnulacion.trim().length < 5) {
      toast.error('Escribí un motivo de al menos 5 caracteres para auditar la anulación.')
      return
    }
    setAnulando(true)

    try {
      const kioscoId = usuario?.kiosco_id
      if (!kioscoId) throw new Error('No se identificó el comercio activo.')
      const sesion = useCajaStore.getState().sesionActiva
      await anularVentaAtomica(
        ventaParaAnular.id, kioscoId, motivoAnulacion,
        usarCajaActual ? sesion?.id ?? null : null,
      )
      // Un reintento puede devolver una confirmación anterior a otras ventas.
      // Invalidar la copia obliga al catálogo a obtener stock vigente del servidor.
      try {
        clearCachedProductos(kioscoId)
        await useClienteStore.getState().cargarClientes()
        if (sesion) await useCajaStore.getState().cargarMovimientosSesion(sesion.id)
      } catch {
        toast.error('La venta quedó anulada; recargá la pantalla para actualizar los datos locales.')
      }
      toast.success('Venta anulada. Stock reincorporado y balance actualizado.')
      setVentaParaAnular(null)
      setMotivoAnulacion('')
      setUsarCajaActual(false)
      await cargarDatos()
    } catch (err) {
      console.error('Error al anular venta:', err)
      toast.error(err instanceof Error ? err.message : 'No se confirmó la anulación. Reintentá con la misma venta.')
    } finally {
      setAnulando(false)
    }
  }

  const handleVerTicket = (v: VentaResumen) => {
    const kiosco = useAuthStore.getState().kiosco
    setTicketParaImprimir(ventaToTicketData(v, kiosco))
  }

  const handleExportarVentasDia = async () => {
    if (ventas.length === 0) return
    const kiosco = useAuthStore.getState().kiosco
    await exportarVentasExcel(ventas, kiosco?.nombre || 'Kiosco', fecha)
    toast.success('Reporte diario exportado en formato Excel (.xlsx)')
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {usuario?.rol === 'DUEÑO' && <ExternalBackupReminder kioscoId={usuario.kiosco_id} fechaCreacion={kiosco?.fecha_creacion} />}
      {/* Encabezado con selector de pestañas para Dueño y Visor */}
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            Reportes y Contabilidad
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
            {tabActiva === 'ventas'
              ? 'Detalle de tickets y facturación diaria por jornada'
              : tabActiva === 'rotacion'
              ? 'Rotación de mercadería, capital inmovilizado y liquidación de stock'
              : tabActiva === 'bajas'
              ? 'Mermas y otras bajas de inventario con estimación a costo histórico'
              : 'Rendimientos comerciales, balance financiero, compras a proveedores y libro diario contable'}
          </p>
        </div>

        {/* Selector de Pestañas */}
        <div className="flex w-full min-w-0 flex-wrap items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setTabActiva('balance')}
            className={`px-3 sm:px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
              tabActiva === 'balance'
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Balance Contable
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('ventas')}
            className={`px-3 sm:px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
              tabActiva === 'ventas'
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Ventas Diarias
          </button>
          {esDueno && (
            <button
              type="button"
              onClick={() => setTabActiva('rotacion')}
              className={`px-3 sm:px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                tabActiva === 'rotacion'
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Rotación y Stock Inmovilizado
            </button>
          )}
          {esDueno && (
            <button
              type="button"
              onClick={() => setTabActiva('bajas')}
              className={`px-3 sm:px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                tabActiva === 'bajas'
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Bajas de Inventario
            </button>
          )}
        </div>
      </div>

      {tabActiva === 'balance' ? (
        <BalanceContableTab />
      ) : tabActiva === 'rotacion' ? (
        <RotacionTab />
      ) : tabActiva === 'bajas' ? (
        <BajasStockTab />
      ) : (
        <div className="space-y-6">
          {/* Header con selector de fecha */}
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5 shadow-md dark:shadow-black/20">
            <div>
              <span className="mb-2 inline-flex rounded-lg bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Control diario</span><h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Ventas por Jornada</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Auditoría de tickets y comprobantes del día</p>
            </div>

            {/* Navegación por fecha y Exportar */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="secondary" onClick={() => cambiarFecha(-1)}>
                &lt; Anterior
              </Button>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                aria-label="Fecha de ventas" className="h-10 min-w-0 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm font-medium text-gray-900 dark:text-gray-100"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => cambiarFecha(1)}
                disabled={esHoy}
              >
                Siguiente &gt;
              </Button>
              {!esHoy && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFecha(getFechaLocal())}
                >
                  Hoy
                </Button>
              )}
              <div className="inline-flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleExportarVentasDia}
                disabled={ventas.length === 0}
                className="h-10 text-xs inline-flex items-center gap-1.5"
                title="Descargar las ventas de este día en formato Excel corporativo (.xlsx)"
              >
                <IconExportar />
                <span>Exportar Día</span>
              </Button>
              <RefreshButton refreshing={cargando} onClick={() => void cargarDatos()} label="Actualizar ventas diarias" />
              </div>
            </div>
          </div>

      {cargando ? (
        <div className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Cargando reporte...</p>
        </div>
      ) : (
        <>
          {/* Tarjetas resumen */}
          {resumen && (
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${esDueno ? 'xl:grid-cols-4' : 'xl:grid-cols-3'} gap-4`}>
              <IndicatorCard label="Total facturado" valor={formatPrecio(resumen.totalVentas)} icono="dinero" detalle="Importe neto de ventas de la jornada" pie={resumen.totalDevoluciones !== undefined && resumen.totalDevoluciones > 0 ? `Deducidos ${formatPrecio(resumen.totalDevoluciones)} en devoluciones` : undefined} />
              {esDueno && <IndicatorCard label={resumen.gananciaBruta < 0 ? 'Pérdida Neta' : 'Ganancia Bruta'} valor={resumen.gananciaBruta < 0 ? `-${formatPrecio(Math.abs(resumen.gananciaBruta))}` : formatPrecio(resumen.gananciaBruta)} icono="rotacion" tono={resumen.gananciaBruta < 0 ? 'rose' : 'emerald'} detalle="Solo Dueño · ventas menos costo de mercadería" pie={<div className="flex flex-wrap justify-between gap-2"><span>Margen: <strong>{resumen.margenPorcentaje.toFixed(1)}%</strong></span><span>Costo: {formatPrecio(resumen.totalCosto)}</span></div>} />}
              <IndicatorCard label="Ventas completadas" valor={resumen.cantidadVentas} icono="check" tono="emerald" detalle="Tickets emitidos en el día" />
              <IndicatorCard label="Ticket promedio" valor={formatPrecio(resumen.ventaPromedio)} icono="oferta" tono="purple" detalle="Promedio por venta completada" />
            </div>
          )}
          {/* Desglose por medio de pago */}
          {resumen && resumen.porMedioPago.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5 shadow-md dark:shadow-black/20">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Desglose por medio de pago</h3>
              <div className="space-y-2">
                {resumen.porMedioPago.map((mp) => (
                  <div key={mp.medio} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <span className="text-base dark:text-gray-200">{labelMedioPago(mp.medio)}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">({mp.cantidad} ops.)</span>
                    </div>
                    <span className="font-bold dark:text-gray-100">{formatPrecio(mp.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lista de ventas */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5 shadow-md dark:shadow-black/20">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Ventas del día</h3>
            {ventas.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center"><span className="rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 p-4 text-indigo-500"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 7h6M9 11h6M9 15h3" /></svg></span><p className="font-semibold text-gray-900 dark:text-gray-100">No hay ventas registradas en esta fecha</p><p className="max-w-md text-xs leading-relaxed text-gray-500 dark:text-gray-400">Elegí otra jornada o usá Anterior para revisar tickets. Los indicadores corresponden únicamente al día seleccionado.</p></div>
            ) : (
              <div className="space-y-2">
                {ventas.map((venta) => {
                  const esAnulada = venta.estado === 'ANULADA'
                  return (
                    <div
                      key={venta.id}
                      className={`border rounded-lg overflow-hidden transition-colors ${
                        esAnulada
                          ? 'border-red-200 bg-red-50/40 dark:border-red-900/30 dark:bg-red-950/10 opacity-75'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <button
                        onClick={() => setVentaExpandida(ventaExpandida === venta.id ? null : venta.id)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            esAnulada
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                          }`}>
                            {esAnulada ? 'Anulada' : 'Completada'}
                          </span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {formatFecha(venta.fecha_hora)}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {venta.detalles.length} item{venta.detalles.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <span className={`font-bold ${
                          esAnulada
                            ? 'line-through text-gray-400 dark:text-gray-500'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          {formatPrecio(venta.total)}
                        </span>
                      </button>

                      {ventaExpandida === venta.id && (
                        <div className="px-4 pb-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                          <div className="py-2 space-y-1">
                            {venta.detalles.map((det, i) => (
                              <div key={i} className="flex justify-between text-sm py-1">
                                <span className="text-gray-600 dark:text-gray-300">
                                  {det.cantidad}x {det.producto?.descripcion || 'Producto'}
                                </span>
                                <span className="text-gray-900 dark:text-gray-100 font-medium">
                                  {formatPrecio(det.subtotal)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {esDueno && !esAnulada && (() => {
                            const costoTicket = (venta.detalles || []).reduce((acc, det) => {
                              if (det.es_devolucion_envase) return acc
                              return acc + (Number(det.cantidad) || 0) * (Number(det.producto?.precio_costo) || 0)
                            }, 0)
                            const gananciaTicket = venta.total - costoTicket
                            const margenTicket = venta.total > 0 ? (gananciaTicket / venta.total) * 100 : 0
                            const esPerdida = gananciaTicket < 0

                            return (
                              <div className={`my-2 px-3 py-1.5 rounded-lg border flex flex-wrap items-center justify-between text-xs gap-1 ${
                                esPerdida
                                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                                  : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                              }`}>
                                <span className="font-medium">
                                  Costo mercadería: <strong className="font-semibold">{formatPrecio(costoTicket)}</strong>
                                </span>
                                <span className="font-medium">
                                  {esPerdida ? 'Pérdida ticket:' : 'Ganancia ticket:'}{' '}
                                  <strong className={`font-bold ${esPerdida ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                                    {esPerdida ? `-${formatPrecio(Math.abs(gananciaTicket))}` : `+${formatPrecio(gananciaTicket)}`}
                                  </strong>{' '}
                                  ({margenTicket.toFixed(1)}% margen)
                                </span>
                              </div>
                            )
                          })()}

                          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex flex-wrap gap-3">
                              {venta.pagos.map((p, i) => (
                                <span key={i} className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                  {labelMedioPago(p.medio_pago)}: {formatPrecio(p.monto)}
                                </span>
                              ))}
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleVerTicket(venta)}
                              >
                                Ver Ticket
                              </Button>
                              {!esAnulada && esDueno && (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => {
                                    setMotivoAnulacion('')
                                    setUsarCajaActual(false)
                                    setVentaParaAnular(venta)
                                  }}
                                >
                                  Anular venta
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
        </div>
      )}

      {/* Modal de confirmación para anular venta */}
      <Modal
        isOpen={!!ventaParaAnular}
        onClose={() => {
          setVentaParaAnular(null)
          setMotivoAnulacion('')
        }}
        title="Confirmar anulación de venta"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            ¿Estás seguro de anular esta venta por un total de{' '}
            <strong className="text-gray-900 dark:text-gray-100">
              {ventaParaAnular ? formatPrecio(ventaParaAnular.total) : ''}
            </strong>?
          </p>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300">
            Esta acción devolverá automáticamente los productos vendidos al inventario de stock y restará la venta del total facturado del día.
          </div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
            Motivo de la anulación *
            <textarea
              value={motivoAnulacion}
              onChange={(e) => setMotivoAnulacion(e.target.value)}
              minLength={5}
              maxLength={300}
              rows={3}
              disabled={anulando}
              placeholder="Ej.: venta duplicada, error en los productos..."
              className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-normal"
              required
            />
          </label>
          <label className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={usarCajaActual} disabled={anulando}
              onChange={event => setUsarCajaActual(event.target.checked)} />
            Reintegrar efectivo desde la caja actual si la caja original está cerrada.
          </label>
          <p className="text-xs text-gray-500">
            Con la caja original abierta, el reintegro corresponde a esa caja. Los pagos
            electrónicos requieren además devolver el dinero por su medio original.
          </p>
          <div className="flex gap-2 pt-2">
            <Button
              variant="danger"
              fullWidth
              loading={anulando}
              onClick={handleAnularVenta}
            >
              Sí, anular venta
            </Button>
            <Button
              variant="secondary"
              fullWidth
              disabled={anulando}
              onClick={() => {
                setVentaParaAnular(null)
                setMotivoAnulacion('')
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de Ticket Térmico / WhatsApp */}
      <TicketReceiptModal
        isOpen={!!ticketParaImprimir}
        onClose={() => setTicketParaImprimir(null)}
        ticket={ticketParaImprimir}
      />
    </div>
  )
}
