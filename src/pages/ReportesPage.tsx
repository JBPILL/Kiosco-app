import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { formatPrecio, formatFecha, labelMedioPago, getFechaLocal, getLimitesISODia } from '../lib/utils'
import { exportarVentasExcel } from '../lib/exportUtils'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { TicketReceiptModal, type TicketData } from '../components/pos/TicketReceiptModal'
import { BalanceContableTab } from '../components/reportes/BalanceContableTab'
import { StockInmovilizadoTab } from '../components/reportes/StockInmovilizadoTab'
import { useClienteStore } from '../stores/clienteStore'
import { useCajaStore } from '../stores/cajaStore'
import { ventaToTicketData } from '../lib/ticketUtils'
import toast from 'react-hot-toast'

interface ResumenDiario {
  totalVentas: number
  cantidadVentas: number
  ventaPromedio: number
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
    producto?: { id: string; descripcion: string; stock_actual: number }
  }[]
}

export function ReportesPage() {
  const { usuario } = useAuthStore()
  const [tabActiva, setTabActiva] = useState<'balance' | 'ventas' | 'inmovilizado'>('balance')
  const [fecha, setFecha] = useState(() => getFechaLocal())
  const [ventas, setVentas] = useState<VentaResumen[]>([])
  const [resumen, setResumen] = useState<ResumenDiario | null>(null)
  const [cargando, setCargando] = useState(true)
  const [ventaExpandida, setVentaExpandida] = useState<string | null>(null)
  const [ventaParaAnular, setVentaParaAnular] = useState<VentaResumen | null>(null)
  const [anulando, setAnulando] = useState(false)
  const [ticketParaImprimir, setTicketParaImprimir] = useState<TicketData | null>(null)

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    const { inicioISO, finISO } = getLimitesISODia(fecha)

    // Cargar ventas del día con detalles y pagos
    const { data, error } = await supabase
      .from('ventas')
      .select(`
        id, fecha_hora, total, estado, notas, sesion_caja_id,
        afip_cae, afip_vto_cae, afip_tipo_comprobante, afip_nro_comprobante, afip_qr_url,
        usuario:usuarios(nombre),
        pagos:pagos_venta(medio_pago, monto),
        detalles:detalles_venta(cantidad, precio_unitario, subtotal, producto_id, producto:productos(id, descripcion, stock_actual))
      `)
      .gte('fecha_hora', inicioISO)
      .lte('fecha_hora', finISO)
      .order('fecha_hora', { ascending: false })

    if (error) {
      console.error('Error cargando ventas:', error)
      toast.error('Error al cargar ventas')
      setCargando(false)
      return
    }

    const ventasData = (data || []) as unknown as VentaResumen[]
    setVentas(ventasData)

    // Solo ventas COMPLETADAS para el resumen financiero
    const ventasValidas = ventasData.filter((v) => v.estado === 'COMPLETADA')
    const totalVentas = ventasValidas.reduce((sum, v) => sum + v.total, 0)
    const cantidadVentas = ventasValidas.length
    const ventaPromedio = cantidadVentas > 0 ? totalVentas / cantidadVentas : 0

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
    const porMedioPago = Array.from(mediosMap.entries()).map(([medio, data]) => ({
      medio,
      ...data,
    }))

    setResumen({ totalVentas, cantidadVentas, ventaPromedio, porMedioPago })
    setCargando(false)
  }, [fecha])

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
    if (!ventaParaAnular) return
    setAnulando(true)

    try {
      // 0. Proteger contra anulación de ventas que ya tienen devoluciones parciales
      const { data: devsPrevias } = await supabase
        .from('devoluciones_venta')
        .select('id, monto_total')
        .eq('venta_id', ventaParaAnular.id)

      if (devsPrevias && devsPrevias.length > 0) {
        toast.error(
          'Esta venta posee devoluciones parciales registradas. No puede anularse en su totalidad para no duplicar reintegros de dinero ni alterar el stock.',
          { duration: 6000 }
        )
        setVentaParaAnular(null)
        setAnulando(false)
        return
      }

      const ahora = new Date().toISOString()
      const kioscoId = usuario?.kiosco_id

      // 1. Cambiar estado de la venta a ANULADA
      const { error } = await supabase
        .from('ventas')
        .update({ estado: 'ANULADA' })
        .eq('id', ventaParaAnular.id)

      if (error) throw error

      // 2. Reincorporar stock de cada producto y registrar INGRESO por DEVOLUCION
      for (const det of ventaParaAnular.detalles) {
        const prodId = det.producto_id || det.producto?.id
        if (!prodId) continue

        try {
          // Consultar el stock actual en base de datos
          const { data: prodData } = await supabase
            .from('productos')
            .select('stock_actual, descripcion')
            .eq('id', prodId)
            .maybeSingle()

          const stockActual = prodData?.stock_actual ?? det.producto?.stock_actual ?? 0
          const nuevoStock = stockActual + det.cantidad

          await supabase
            .from('productos')
            .update({
              stock_actual: nuevoStock,
              fecha_actualizacion: ahora,
            })
            .eq('id', prodId)

          if (kioscoId) {
            await supabase.from('movimientos_stock').insert({
              kiosco_id: kioscoId,
              producto_id: prodId,
              tipo: 'INGRESO',
              cantidad: det.cantidad,
              motivo: 'DEVOLUCION',
              notas: `Devolución por anulación de Venta #${ventaParaAnular.id.slice(0, 8).toUpperCase()}`,
              usuario_id: usuario?.id || null,
              fecha: ahora,
            })
          }
        } catch (errStock) {
          console.warn(`Error al reponer stock de producto ${prodId}:`, errStock)
        }
      }

      // 3. Si la venta tuvo pago en CUENTA_CORRIENTE, revertir la deuda del cliente
      const pagoCC = ventaParaAnular.pagos.find((p) => p.medio_pago === 'CUENTA_CORRIENTE')
      if (pagoCC) {
        await useClienteStore.getState().revertirCargoVenta(ventaParaAnular.id, pagoCC.monto)
      }

      // 4. Si la venta tuvo pago en EFECTIVO, asentar el egreso compensatorio en caja
      const pagoEf = ventaParaAnular.pagos.find((p) => p.medio_pago === 'EFECTIVO')
      if (pagoEf && pagoEf.monto > 0) {
        const sesionActiva = useCajaStore.getState().sesionActiva
        const descMov = `Reintegro en efectivo por anulación de Venta #${ventaParaAnular.id.slice(0, 8).toUpperCase()}`
        if (sesionActiva) {
          try {
            await useCajaStore.getState().registrarMovimientoCaja(
              'EGRESO',
              'DEVOLUCION_VENTA',
              pagoEf.monto,
              descMov
            )
          } catch (errCaja) {
            console.warn('Error registrando egreso de caja en sesión activa:', errCaja)
          }
        } else if (ventaParaAnular.sesion_caja_id && kioscoId) {
          try {
            await supabase.from('movimientos_caja').insert({
              kiosco_id: kioscoId,
              sesion_caja_id: ventaParaAnular.sesion_caja_id,
              usuario_id: usuario?.id || null,
              tipo: 'EGRESO',
              motivo: 'DEVOLUCION_VENTA',
              monto: pagoEf.monto,
              descripcion: descMov,
              fecha_hora: ahora,
            })
          } catch (errCaja) {
            console.warn('Error registrando egreso compensatorio en Supabase:', errCaja)
          }
        }
      }

      toast.success('Venta anulada. Stock reincorporado y balance actualizado.')
      setVentaParaAnular(null)
      await cargarDatos()
    } catch (err) {
      console.error('Error al anular venta:', err)
      toast.error('No se pudo anular la venta')
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
      {/* Encabezado con selector de pestañas para Dueño y Visor */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            Reportes y Contabilidad
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            {tabActiva === 'ventas'
              ? 'Detalle de tickets y facturación diaria por jornada'
              : tabActiva === 'inmovilizado'
              ? 'Detección de artículos sin rotación y capital estancado en depósito'
              : 'Balance financiero, compras a proveedores y libro diario contable'}
          </p>
        </div>

        {/* Selector de Pestañas */}
        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 self-start sm:self-auto gap-1">
          <button
            type="button"
            onClick={() => setTabActiva('balance')}
            className={`px-3 sm:px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
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
            className={`px-3 sm:px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
              tabActiva === 'ventas'
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Ventas Diarias
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('inmovilizado')}
            className={`px-3 sm:px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
              tabActiva === 'inmovilizado'
                ? 'bg-white dark:bg-gray-700 text-red-600 dark:text-red-400 shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Stock Inmovilizado
          </button>
        </div>
      </div>

      {tabActiva === 'balance' ? (
        <BalanceContableTab />
      ) : tabActiva === 'inmovilizado' ? (
        <StockInmovilizadoTab />
      ) : (
        <div className="space-y-6">
          {/* Header con selector de fecha */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Ventas por Jornada</h2>
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
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-900 dark:text-gray-100"
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
              <Button
                size="sm"
                variant="secondary"
                onClick={handleExportarVentasDia}
                disabled={ventas.length === 0}
                className="text-xs"
                title="Descargar las ventas de este día en formato Excel corporativo (.xlsx)"
              >
                Exportar Día (.XLSX)
              </Button>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Total facturado</p>
                <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {formatPrecio(resumen.totalVentas)}
                </p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Ventas completadas</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{resumen.cantidadVentas}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Ticket promedio</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatPrecio(resumen.ventaPromedio)}</p>
              </div>
            </div>
          )}

          {/* Desglose por medio de pago */}
          {resumen && resumen.porMedioPago.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
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
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Ventas del día</h3>
            {ventas.length === 0 ? (
              <p className="text-center text-gray-400 dark:text-gray-500 py-8">No hay ventas registradas en esta fecha</p>
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
                              {!esAnulada && usuario?.rol === 'DUEÑO' && (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => setVentaParaAnular(venta)}
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
        onClose={() => setVentaParaAnular(null)}
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
              onClick={() => setVentaParaAnular(null)}
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
