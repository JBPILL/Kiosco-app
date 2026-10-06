import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { formatPrecio, formatFecha, labelMedioPago, getFechaLocal, getLimitesISODia, getCachedProductos, saveCachedProductos } from '../lib/utils'
import { exportarVentasExcel } from '../lib/exportUtils'
import { IconExportar } from '../components/ui/Icons'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { TicketReceiptModal, type TicketData } from '../components/pos/TicketReceiptModal'
import { BalanceContableTab } from '../components/reportes/BalanceContableTab'
import { RotacionTab } from '../components/reportes/RotacionTab'
import { BajasStockTab } from '../components/reportes/BajasStockTab'
import { useClienteStore } from '../stores/clienteStore'
import { useCajaStore } from '../stores/cajaStore'
import { useComboStore } from '../stores/comboStore'
import { useLoteStore } from '../stores/loteStore'
import { cargarCostosProtegidos } from '../lib/productCostAccess'
import { ventaToTicketData } from '../lib/ticketUtils'
import type { Producto } from '../types/database'
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
        .update({ estado: 'ANULADA', motivo_anulacion: motivoAnulacion.trim() })
        .eq('id', ventaParaAnular.id)

      if (error) throw error

      // 2. Reincorporar stock de cada producto y registrar INGRESO por DEVOLUCION
      for (const det of ventaParaAnular.detalles) {
        if (det.es_devolucion_envase || (det.producto as any)?.activo === false || (det.precio_unitario || 0) <= 0) continue

        const prodId = det.producto_id || det.producto?.id
        if (!prodId) continue

        try {
          // Consultar el stock actual en base de datos y si es combo
          const { data: prodData } = await supabase
            .from('productos')
            .select('id, stock_actual, descripcion, es_combo')
            .eq('id', prodId)
            .maybeSingle()

          if (!prodData) continue

          if (prodData.es_combo) {
            // Si es un combo, restituir el stock físico de sus componentes individuales
            const componentes = useComboStore.getState().obtenerComponentesDeCombo(prodData.id)
            for (const comp of componentes) {
              const cantRestituir = comp.cantidad * det.cantidad
              const { data: compProd } = await supabase
                .from('productos')
                .select('id, stock_actual, descripcion')
                .eq('id', comp.componente_producto_id)
                .maybeSingle()

              if (compProd) {
                const nuevoStockComp = Number(((compProd.stock_actual || 0) + cantRestituir).toFixed(3))
                await supabase
                  .from('productos')
                  .update({
                    stock_actual: nuevoStockComp,
                    fecha_actualizacion: ahora,
                  })
                  .eq('id', compProd.id)

                if (kioscoId) {
                  await supabase.from('movimientos_stock').insert({
                    kiosco_id: kioscoId,
                    producto_id: compProd.id,
                    tipo: 'INGRESO',
                    cantidad: cantRestituir,
                    motivo: 'DEVOLUCION',
                    notas: `Devolución Combo #${ventaParaAnular.id.slice(0, 8).toUpperCase()} - ${prodData.descripcion}`,
                    usuario_id: usuario?.id || null,
                    fecha: ahora,
                  })
                }

                try {
                  await useLoteStore.getState().restituirStockLote(compProd.id, cantRestituir, kioscoId || undefined)
                } catch (errLote) {
                  console.warn(`Error al reponer lote de componente ${compProd.id}:`, errLote)
                }
              }
            }
          } else {
            const stockActual = prodData?.stock_actual ?? det.producto?.stock_actual ?? 0
            const nuevoStock = Math.round((stockActual + det.cantidad) * 1000) / 1000

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

            try {
              await useLoteStore.getState().restituirStockLote(prodId, det.cantidad, kioscoId || undefined)
            } catch (errLote) {
              console.warn(`Error al reponer lote de producto ${prodId}:`, errLote)
            }
          }
        } catch (errStock) {
          console.warn(`Error al reponer stock de producto ${prodId}:`, errStock)
        }
      }

      // Actualizar la caché local de productos asegurando coherencia multi-inquilino
      try {
        const prodList: Producto[] = getCachedProductos(kioscoId)
        if (prodList && prodList.length > 0) {
          const cantidadesMap = new Map<string, number>()

          for (const det of ventaParaAnular.detalles) {
            if (det.es_devolucion_envase || (det.producto as any)?.activo === false || (det.precio_unitario || 0) <= 0) continue

            const pId = det.producto_id || det.producto?.id
            if (!pId) continue

            const prod = prodList.find((p) => p.id === pId)
            if (prod?.es_combo) {
              const componentes = useComboStore.getState().obtenerComponentesDeCombo(prod.id)
              for (const comp of componentes) {
                const actual = cantidadesMap.get(comp.componente_producto_id) || 0
                cantidadesMap.set(comp.componente_producto_id, actual + comp.cantidad * det.cantidad)
              }
            } else {
              cantidadesMap.set(pId, (cantidadesMap.get(pId) || 0) + det.cantidad)
            }
          }

          const actualizados = prodList.map((p) => {
            const devuelto = cantidadesMap.get(p.id)
            if (devuelto !== undefined) {
              const st = Math.round(((p.stock_actual || 0) + devuelto) * 1000) / 1000
              return { ...p, stock_actual: st, fecha_actualizacion: ahora }
            }
            return p
          })
          saveCachedProductos(actualizados, kioscoId)
        }
      } catch (errCache) {
        console.warn('Error al actualizar caché local tras anulación:', errCache)
      }

      // 3. Si la venta tuvo pagos en CUENTA_CORRIENTE, revertir el total adeudado
      const montoTotalCC = (ventaParaAnular.pagos || [])
        .filter((p) => p.medio_pago === 'CUENTA_CORRIENTE')
        .reduce((sum, p) => sum + (Number(p.monto) || 0), 0)
      if (montoTotalCC > 0) {
        await useClienteStore.getState().revertirCargoVenta(ventaParaAnular.id, montoTotalCC)
      }

      // 4. Si la venta tuvo pagos en EFECTIVO, asentar el egreso compensatorio en caja SOLO si hay sesión abierta
      const montoTotalEf = (ventaParaAnular.pagos || [])
        .filter((p) => p.medio_pago === 'EFECTIVO')
        .reduce((sum, p) => sum + (Number(p.monto) || 0), 0)
      if (montoTotalEf > 0) {
        const sesionActiva = useCajaStore.getState().sesionActiva
        const descMov = `Reintegro en efectivo por anulación de Venta #${ventaParaAnular.id.slice(0, 8).toUpperCase()}`
        if (sesionActiva && !sesionActiva.fecha_cierre && sesionActiva.estado === 'ABIERTA') {
          try {
            await useCajaStore.getState().registrarMovimientoCaja(
              'EGRESO',
              'DEVOLUCION_VENTA',
              montoTotalEf,
              descMov
            )
          } catch (errCaja) {
            console.warn('Error registrando egreso de caja en sesión activa:', errCaja)
          }
        } else if (kioscoId) {
          // Buscar última sesión abierta si no hay sesión activa en el store
          const { data: ultSesion } = await supabase
            .from('sesiones_caja')
            .select('id, estado, fecha_cierre')
            .eq('kiosco_id', kioscoId)
            .is('fecha_cierre', null)
            .eq('estado', 'ABIERTA')
            .order('fecha_apertura', { ascending: false })
            .limit(1)
            .maybeSingle()
            
          if (ultSesion) {
            try {
              await supabase.from('movimientos_caja').insert({
                kiosco_id: kioscoId,
                sesion_caja_id: ultSesion.id,
                usuario_id: usuario?.id || null,
                tipo: 'EGRESO',
                motivo: 'DEVOLUCION_VENTA',
                monto: montoTotalEf,
                descripcion: descMov,
                fecha_hora: ahora,
              })
            } catch (errCaja) {
              console.warn('Error registrando egreso compensatorio en Supabase:', errCaja)
            }
          } else {
            toast.error('No hay ninguna sesión de caja abierta. Omitiendo movimiento de egreso de caja para no alterar arqueos cerrados.', { duration: 6000 })
          }
        }
      }

      toast.success('Venta anulada. Stock reincorporado y balance actualizado.')
      setVentaParaAnular(null)
      setMotivoAnulacion('')
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
                className="text-xs inline-flex items-center gap-1.5"
                title="Descargar las ventas de este día en formato Excel corporativo (.xlsx)"
              >
                <IconExportar />
                <span>Exportar Día</span>
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
            <div className={`grid grid-cols-1 ${esDueno ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'} gap-4`}>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total facturado</p>
                <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                  {formatPrecio(resumen.totalVentas)}
                </p>
                {resumen.totalDevoluciones !== undefined && resumen.totalDevoluciones > 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                    Deducidos {formatPrecio(resumen.totalDevoluciones)} en devoluciones
                  </p>
                )}
              </div>

              {esDueno && (
                <div className={`rounded-xl border-2 p-4 flex flex-col justify-between shadow-2xs ${
                  resumen.gananciaBruta < 0
                    ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
                    : 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                }`}>
                  <div>
                    <div className="flex items-center justify-between">
                      <p className={`text-xs font-bold uppercase tracking-wider ${
                        resumen.gananciaBruta < 0
                          ? 'text-rose-800 dark:text-rose-300'
                          : 'text-emerald-800 dark:text-emerald-300'
                      }`}>
                        {resumen.gananciaBruta < 0 ? 'Pérdida Neta' : 'Ganancia Bruta'}
                      </p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        resumen.gananciaBruta < 0
                          ? 'bg-rose-100 dark:bg-rose-900 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-300'
                          : 'bg-emerald-100 dark:bg-emerald-900 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                      }`}>
                        Solo Dueño
                      </span>
                    </div>
                    <p className={`text-2xl font-black mt-1 ${
                      resumen.gananciaBruta < 0
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-emerald-700 dark:text-emerald-300'
                    }`}>
                      {resumen.gananciaBruta < 0
                        ? `-${formatPrecio(Math.abs(resumen.gananciaBruta))}`
                        : formatPrecio(resumen.gananciaBruta)}
                    </p>
                  </div>
                  <div className={`mt-1 flex items-center justify-between text-xs font-medium ${
                    resumen.gananciaBruta < 0
                      ? 'text-rose-800/90 dark:text-rose-300/90'
                      : 'text-emerald-800/90 dark:text-emerald-300/90'
                  }`}>
                    <span>Margen: <strong>{resumen.margenPorcentaje.toFixed(1)}%</strong></span>
                    <span className="opacity-80">Costo: {formatPrecio(resumen.totalCosto)}</span>
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Ventas completadas</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{resumen.cantidadVentas}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Tickets emitidos en el día</p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Ticket promedio</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{formatPrecio(resumen.ventaPromedio)}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Promedio por cliente</p>
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
              maxLength={500}
              rows={3}
              disabled={anulando}
              placeholder="Ej.: venta duplicada, error en los productos..."
              className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-normal"
              required
            />
          </label>
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
