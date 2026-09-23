import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useCajaStore } from '../stores/cajaStore'
import { formatPrecio, formatFecha } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { TicketCierreCajaModal, type DatosCierreCaja } from '../components/pos/TicketCierreCajaModal'
import type {
  SesionCaja,
  Usuario,
  TipoMovimientoCaja,
  MotivoMovimientoCaja,
} from '../types/database'

function formatMotivoMovimiento(motivo: MotivoMovimientoCaja): string {
  switch (motivo) {
    case 'PROVEEDOR':
      return 'Pago Proveedor'
    case 'GASTO_GENERAL':
      return 'Gasto General'
    case 'RETIRO_DUENO':
      return 'Retiro Dueño'
    case 'REPOSICION_CAMBIO':
      return 'Reposición Cambio'
    case 'OTRO':
    default:
      return 'Movimiento'
  }
}

interface SesionHistorial extends SesionCaja {
  usuario?: Usuario
}

export function CajaPage() {
  const { usuario } = useAuthStore()
  const {
    sesionActiva,
    resumenActivo,
    movimientosCaja,
    cargando,
    verificarSesionActiva,
    abrirCaja,
    cargarResumenSesion,
    registrarMovimientoCaja,
    cerrarCaja,
    arqueoCiegoObligatorio,
    cargarArqueoCiegoConfig,
  } = useCajaStore()

  const esDueno = usuario?.rol === 'DUEÑO'
  const [tabActiva, setTabActiva] = useState<'turno' | 'movimientos' | 'historial'>('turno')

  useEffect(() => {
    cargarArqueoCiegoConfig()
  }, [cargarArqueoCiegoConfig])

  // Estados para apertura
  const [montoInicial, setMontoInicial] = useState('0')
  const [abriendo, setAbriendo] = useState(false)

  // Estados para movimientos de caja (gastos/ingresos)
  const [modalMovimientoOpen, setModalMovimientoOpen] = useState(false)
  const [tipoMovimiento, setTipoMovimiento] = useState<TipoMovimientoCaja>('EGRESO')
  const [motivoMovimiento, setMotivoMovimiento] = useState<MotivoMovimientoCaja>('PROVEEDOR')
  const [montoMovimiento, setMontoMovimiento] = useState('')
  const [descripcionMovimiento, setDescripcionMovimiento] = useState('')
  const [guardandoMovimiento, setGuardandoMovimiento] = useState(false)

  // Estados para cierre / arqueo
  const [modalArqueoOpen, setModalArqueoOpen] = useState(false)
  const [efectivoContado, setEfectivoContado] = useState('')
  const [cerrando, setCerrando] = useState(false)
  const [modoCiego, setModoCiego] = useState(!esDueno && arqueoCiegoObligatorio)
  const [mostrarDesgloseBilletes, setMostrarDesgloseBilletes] = useState(false)
  const [desgloseBilletes, setDesgloseBilletes] = useState<Record<number, number>>({
    20000: 0,
    10000: 0,
    2000: 0,
    1000: 0,
    500: 0,
    200: 0,
    100: 0,
    50: 0,
  })

  const modoCiegoEfectivo = esDueno ? modoCiego : arqueoCiegoObligatorio

  // Historial de cierres
  const [historial, setHistorial] = useState<SesionHistorial[]>([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [sesionDetalle, setSesionDetalle] = useState<SesionHistorial | null>(null)
  const [modalTicketCierreOpen, setModalTicketCierreOpen] = useState(false)
  const [ticketCierre, setTicketCierre] = useState<DatosCierreCaja | null>(null)

  const cargarHistorial = useCallback(async () => {
    if (!usuario?.kiosco_id) return
    setCargandoHistorial(true)

    try {
      const { data, error } = await supabase
        .from('sesiones_caja')
        .select('*, usuario:usuarios(id, nombre, rol)')
        .eq('kiosco_id', usuario.kiosco_id)
        .eq('estado', 'CERRADA')
        .order('fecha_cierre', { ascending: false })
        .limit(20)

      if (error) throw error
      setHistorial((data as SesionHistorial[]) || [])
    } catch (err) {
      console.error('Error cargando historial de caja:', err)
    } finally {
      setCargandoHistorial(false)
    }
  }, [usuario?.kiosco_id])

  useEffect(() => {
    verificarSesionActiva()
    cargarHistorial()
  }, [verificarSesionActiva, cargarHistorial])

  const handleAbrirCaja = async (e: React.FormEvent) => {
    e.preventDefault()
    const fondo = parseFloat(montoInicial) || 0
    setAbriendo(true)
    const ok = await abrirCaja(fondo)
    setAbriendo(false)
    if (ok) {
      setMontoInicial('0')
    }
  }

  const handleCambioBillete = (denominacion: number, cantidad: number) => {
    const cantidadValida = Math.max(0, isNaN(cantidad) ? 0 : Math.floor(cantidad))
    const nuevoDesglose = {
      ...desgloseBilletes,
      [denominacion]: cantidadValida,
    }
    setDesgloseBilletes(nuevoDesglose)
    const total = Object.entries(nuevoDesglose).reduce(
      (acc, [den, cant]) => acc + Number(den) * cant,
      0
    )
    setEfectivoContado(total > 0 ? total.toString() : '')
  }

  const handleAbrirModalArqueo = async () => {
    if (sesionActiva) {
      await cargarResumenSesion(sesionActiva.id)
    }
    setEfectivoContado('')
    setModoCiego(esDueno ? false : arqueoCiegoObligatorio)
    setMostrarDesgloseBilletes(false)
    setDesgloseBilletes({
      20000: 0,
      10000: 0,
      2000: 0,
      1000: 0,
      500: 0,
      200: 0,
      100: 0,
      50: 0,
    })
    setModalArqueoOpen(true)
  }

  const efectivoEsperado = resumenActivo?.efectivo_esperado_en_caja ?? (sesionActiva?.monto_inicial || 0)
  const contadoNum = Math.max(0, parseFloat(efectivoContado) || 0)
  const diferenciaArqueo = contadoNum - efectivoEsperado

  const handleConfirmarCierre = async () => {
    setCerrando(true)
    const kiosco = useAuthStore.getState().kiosco
    const facturadoTotal = resumenActivo?.total_facturado || 0
    const operacionesTotal = resumenActivo?.total_ventas || 0
    const otrosPagos = Math.max(
      0,
      facturadoTotal -
        ((resumenActivo?.total_efectivo || 0) +
          (resumenActivo?.total_mercadopago || 0) +
          (resumenActivo?.total_transferencia || 0) +
          (resumenActivo?.total_tarjeta || 0))
    )

    const snapshotCierre: DatosCierreCaja = {
      kioscoNombre: kiosco?.nombre,
      cajeroNombre: usuario?.nombre,
      fechaApertura: sesionActiva?.fecha_apertura || new Date().toISOString(),
      fechaCierre: new Date().toISOString(),
      montoInicial: sesionActiva?.monto_inicial || 0,
      ventasPorMedio: [
        { medio: 'Efectivo', total: resumenActivo?.total_efectivo || 0 },
        { medio: 'Mercado Pago', total: resumenActivo?.total_mercadopago || 0 },
        { medio: 'Transferencia', total: resumenActivo?.total_transferencia || 0 },
        { medio: 'Tarjeta', total: resumenActivo?.total_tarjeta || 0 },
        { medio: 'Fiado / Cta Cte', total: resumenActivo?.total_cuenta_corriente ?? otrosPagos },
      ].filter((m) => m.total > 0),
      totalVentas: facturadoTotal,
      cantidadVentas: operacionesTotal,
      ingresosExtra: resumenActivo?.total_ingresos_extra || 0,
      egresosExtra: resumenActivo?.total_egresos || 0,
      efectivoEsperado,
      efectivoContado: contadoNum,
      diferencia: diferenciaArqueo,
    }

    const ok = await cerrarCaja(contadoNum)
    setCerrando(false)
    if (ok) {
      setModalArqueoOpen(false)
      cargarHistorial()
      setTicketCierre(snapshotCierre)
      setModalTicketCierreOpen(true)
    }
  }

  const handleImprimirHistorico = async (s: SesionHistorial) => {
    const resumen = await cargarResumenSesion(s.id)
    const facturadoTotal = resumen?.total_facturado || 0
    const operacionesTotal = resumen?.total_ventas || 0
    const otrosPagos = Math.max(
      0,
      facturadoTotal -
        ((resumen?.total_efectivo || 0) +
          (resumen?.total_mercadopago || 0) +
          (resumen?.total_transferencia || 0) +
          (resumen?.total_tarjeta || 0))
    )

    const datos: DatosCierreCaja = {
      kioscoNombre: useAuthStore.getState().kiosco?.nombre,
      cajeroNombre: s.usuario?.nombre || usuario?.nombre,
      fechaApertura: s.fecha_apertura,
      fechaCierre: s.fecha_cierre || s.fecha_apertura,
      montoInicial: s.monto_inicial,
      ventasPorMedio: [
        { medio: 'Efectivo', total: resumen?.total_efectivo || 0 },
        { medio: 'Mercado Pago', total: resumen?.total_mercadopago || 0 },
        { medio: 'Transferencia', total: resumen?.total_transferencia || 0 },
        { medio: 'Tarjeta', total: resumen?.total_tarjeta || 0 },
        { medio: 'Fiado / Cta Cte', total: resumen?.total_cuenta_corriente ?? otrosPagos },
      ].filter((m) => m.total > 0),
      totalVentas: facturadoTotal,
      cantidadVentas: operacionesTotal,
      ingresosExtra: resumen?.total_ingresos_extra || 0,
      egresosExtra: resumen?.total_egresos || 0,
      efectivoEsperado: s.monto_final_sistema || (resumen?.efectivo_esperado_en_caja ?? s.monto_inicial),
      efectivoContado: s.monto_final_declarado || 0,
      diferencia: s.diferencia || 0,
    }
    setTicketCierre(datos)
    setModalTicketCierreOpen(true)
  }

  const handleAbrirModalMovimiento = (tipo: TipoMovimientoCaja) => {
    setTipoMovimiento(tipo)
    setMotivoMovimiento(tipo === 'INGRESO' ? 'REPOSICION_CAMBIO' : 'PROVEEDOR')
    setMontoMovimiento('')
    setDescripcionMovimiento('')
    setModalMovimientoOpen(true)
  }

  const handleGuardarMovimiento = async (e: React.FormEvent) => {
    e.preventDefault()
    const monto = parseFloat(montoMovimiento) || 0
    if (monto <= 0) return

    setGuardandoMovimiento(true)
    const ok = await registrarMovimientoCaja(
      tipoMovimiento,
      motivoMovimiento,
      monto,
      descripcionMovimiento
    )
    setGuardandoMovimiento(false)
    if (ok) {
      setModalMovimientoOpen(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            Control de Caja y Dinero del Turno
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
            Apertura de turno, control de plata en caja y cierre al terminar la jornada
          </p>
        </div>

        {/* Pestañas de navegación ordenadas estilo Proveedores */}
        <div className="flex items-center flex-nowrap overflow-x-auto scrollbar-hide max-w-full bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 self-start lg:self-auto gap-1">
          <button
            type="button"
            onClick={() => setTabActiva('turno')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              tabActiva === 'turno'
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-700/60'
            }`}
          >
            Turno Actual
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('movimientos')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              tabActiva === 'movimientos'
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-700/60'
            }`}
          >
            Entradas y Retiros ({movimientosCaja.length})
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('historial')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              tabActiva === 'historial'
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-700/60'
            }`}
          >
            Historial de Cierres ({historial.length})
          </button>
        </div>
      </div>

      {cargando ? (
        <div className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Consultando estado de caja...</p>
        </div>
      ) : tabActiva === 'turno' ? (
        !sesionActiva ? (
          /* ── CAJA CERRADA: FORMULARIO DE APERTURA ── */
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
            <div className="max-w-md mx-auto text-center space-y-4">
              <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                Caja Cerrada
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                No hay un turno de caja abierto
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Para registrar ventas y cobrar en el punto de venta, iniciá un nuevo turno ingresando el fondo de caja inicial.
              </p>

              <form onSubmit={handleAbrirCaja} className="space-y-4 pt-2 text-left">
                <Input
                  label="Plata inicial con la que abrís la caja (efectivo para cambio) *"
                  type="number"
                  min="0"
                  step="100"
                  placeholder="Ej: 10000"
                  value={montoInicial}
                  onChange={(e) => setMontoInicial(e.target.value)}
                  required
                  autoFocus
                />

                <div className="flex gap-2">
                  {[5000, 10000, 20000].map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setMontoInicial(m.toString())}
                      className="flex-1 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      {formatPrecio(m)}
                    </button>
                  ))}
                </div>

                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  loading={abriendo}
                  className="mt-4"
                >
                  Iniciar turno de caja
                </Button>
              </form>
            </div>
          </div>
        ) : (
          /* ── CAJA ABIERTA: MONITOR EN VIVO Y CIERRE ── */
          <div className="space-y-6">
            {/* Tarjeta de estado de turno */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400">
                    Turno en curso
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Cajero: {sesionActiva.usuario?.nombre || usuario?.nombre || 'Personal'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Apertura: {formatFecha(sesionActiva.fecha_apertura)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => cargarResumenSesion(sesionActiva.id)}
                  >
                    Actualizar valores
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleAbrirModalArqueo}
                  >
                    {esDueno || !arqueoCiegoObligatorio ? 'Contar plata y cerrar turno' : 'Cerrar turno (Conteo a ciegas)'}
                  </Button>
                </div>
              </div>

              {/* Cuadrícula financiera del turno */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4">
                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xs">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Plata de inicio</p>
                  <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
                    {formatPrecio(sesionActiva.monto_inicial)}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xs">
                  <p className="text-xs text-gray-500 dark:text-gray-400">(+) Ventas en efectivo</p>
                  <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {!modoCiegoEfectivo ? formatPrecio(resumenActivo?.total_efectivo || 0) : '••••••'}
                  </p>
                  {modoCiegoEfectivo && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 block">Modo ciego</span>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xs">
                  <p className="text-xs text-gray-500 dark:text-gray-400">(+) Entradas de plata</p>
                  <p className="text-base sm:text-lg font-bold text-blue-600 dark:text-blue-400 mt-1">
                    +{formatPrecio(resumenActivo?.total_ingresos_extra || 0)}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xs">
                  <p className="text-xs text-gray-500 dark:text-gray-400">(-) Retiros / Gastos</p>
                  <p className="text-base sm:text-lg font-bold text-red-600 dark:text-red-400 mt-1">
                    -{formatPrecio(resumenActivo?.total_egresos || 0)}
                  </p>
                </div>

                <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 shadow-xs">
                  <p className="text-xs text-indigo-700 dark:text-indigo-400 font-semibold">
                    {!modoCiegoEfectivo ? '(=) Debería haber en cajón' : 'Control de Turno'}
                  </p>
                  <p className="text-base sm:text-lg font-bold text-indigo-700 dark:text-indigo-300 mt-1 truncate">
                    {!modoCiegoEfectivo ? formatPrecio(efectivoEsperado) : 'Modo Ciego'}
                  </p>
                  {modoCiegoEfectivo && (
                    <p className="text-[10px] text-indigo-600/70 dark:text-indigo-400/70 mt-0.5">
                      Conteo físico al cierre
                    </p>
                  )}
                </div>
              </div>

              {/* Medios de cobro del turno */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-4 border-t border-gray-100 dark:border-gray-700 mt-4">
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Mercado Pago</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
                    {formatPrecio(resumenActivo?.total_mercadopago || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Transferencia</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
                    {formatPrecio(resumenActivo?.total_transferencia || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Tarjeta</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
                    {formatPrecio(resumenActivo?.total_tarjeta || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Fiados / Cta. Cte.</p>
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                    {formatPrecio(resumenActivo?.total_cuenta_corriente || 0)}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Total ventas turno</p>
                  <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                    {resumenActivo?.total_ventas || 0} operaciones ({formatPrecio(resumenActivo?.total_facturado || 0)})
                  </p>
                </div>
              </div>
            </div>

            {/* Tarjeta de Movimientos de Caja (Gastos y Entradas directas) */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-700">
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                    Gastos y Movimientos de Caja
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Registrá pagos a proveedores, gastos menores, retiros o reposición de cambio
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleAbrirModalMovimiento('INGRESO')}
                    className="text-xs text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                  >
                    + Registrar Ingreso
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleAbrirModalMovimiento('EGRESO')}
                    className="text-xs text-red-700 dark:text-red-400 border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    - Registrar Gasto / Egreso
                  </Button>
                </div>
              </div>

              {/* Lista de movimientos de la sesión */}
              {movimientosCaja.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-400 dark:text-gray-500">
                  No se registraron gastos ni ingresos directos en este turno.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-60 overflow-y-auto">
                  {movimientosCaja.map((mov) => (
                    <div key={mov.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                            mov.tipo === 'INGRESO'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'
                          }`}
                        >
                          {mov.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'}
                        </span>
                        <div>
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {formatMotivoMovimiento(mov.motivo)}
                          </span>
                          {mov.descripcion && (
                            <span className="text-gray-500 dark:text-gray-400 ml-1.5">
                              — {mov.descripcion}
                            </span>
                          )}
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                            {formatFecha(mov.fecha_hora)}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`font-bold text-sm ${
                          mov.tipo === 'INGRESO'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {mov.tipo === 'INGRESO' ? '+' : '-'}{formatPrecio(mov.monto)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {movimientosCaja.length > 5 && (
                <div className="pt-2 text-right">
                  <button
                    type="button"
                    onClick={() => setTabActiva('movimientos')}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Ver todos los movimientos en su pestaña ({movimientosCaja.length}) →
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      ) : tabActiva === 'movimientos' ? (
        /* ── PESTAÑA DEDICADA DE MOVIMIENTOS ── */
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-700">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
                  Gastos y Movimientos de Caja
                </h2>
                {sesionActiva ? (
                  <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400">
                    Turno en curso
                  </span>
                ) : (
                  <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                    Caja Cerrada
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Registrá pagos a proveedores, gastos menores, retiros o reposición de cambio
              </p>
            </div>
            {sesionActiva ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleAbrirModalMovimiento('INGRESO')}
                  className="text-xs text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                >
                  + Registrar Ingreso
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleAbrirModalMovimiento('EGRESO')}
                  className="text-xs text-red-700 dark:text-red-400 border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  - Registrar Gasto / Egreso
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="primary"
                onClick={() => setTabActiva('turno')}
              >
                Abrir turno para registrar
              </Button>
            )}
          </div>

          {/* Lista de movimientos de la sesión */}
          {movimientosCaja.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-400 dark:text-gray-500">
              No se registraron gastos ni ingresos directos en este turno.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {movimientosCaja.map((mov) => (
                <div key={mov.id} className="py-3 flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-1 rounded-md font-semibold text-xs ${
                        mov.tipo === 'INGRESO'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'
                      }`}
                    >
                      {mov.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'}
                    </span>
                    <div>
                      <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                        {formatMotivoMovimiento(mov.motivo)}
                      </span>
                      {mov.descripcion && (
                        <span className="text-gray-500 dark:text-gray-400 ml-2">
                          — {mov.descripcion}
                        </span>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {formatFecha(mov.fecha_hora)}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`font-bold text-base ${
                      mov.tipo === 'INGRESO'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {mov.tipo === 'INGRESO' ? '+' : '-'}{formatPrecio(mov.monto)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── PESTAÑA DEDICADA DE HISTORIAL DE CIERRES ── */
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Historial de Cierres de Turno
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Auditoría histórica de arqueos de caja, diferencias y firmas de cajero
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={cargarHistorial}
              disabled={cargandoHistorial}
            >
              Actualizar Historial
            </Button>
          </div>

          {cargandoHistorial ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-4">Cargando historial...</p>
          ) : historial.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
              Aún no se registraron cierres de caja en el sistema.
            </p>
          ) : (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Cierre</th>
                      <th className="px-4 py-3 font-medium">Cajero</th>
                      <th className="px-4 py-3 font-medium">Fondo inicial</th>
                      {esDueno && <th className="px-4 py-3 font-medium">Esperado</th>}
                      <th className="px-4 py-3 font-medium">{esDueno ? 'Contado' : 'Monto Declarado'}</th>
                      {esDueno && <th className="px-4 py-3 font-medium">Diferencia</th>}
                      {!esDueno && <th className="px-4 py-3 font-medium">Estado</th>}
                      <th className="px-4 py-3 font-medium text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {historial.map((item) => {
                      const dif = item.diferencia ?? 0
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">
                            {item.fecha_cierre ? formatFecha(item.fecha_cierre) : '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                            {item.usuario?.nombre || 'Cajero'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                            {formatPrecio(item.monto_inicial)}
                          </td>
                          {esDueno && (
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">
                              {formatPrecio(item.monto_final_sistema || 0)}
                            </td>
                          )}
                          <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-semibold">
                            {formatPrecio(item.monto_final_declarado || 0)}
                          </td>
                          {esDueno ? (
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                                dif === 0
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400'
                                  : dif > 0
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'
                              }`}>
                                {dif === 0 ? 'Exacto' : dif > 0 ? `+${formatPrecio(dif)}` : formatPrecio(dif)}
                              </span>
                            </td>
                          ) : (
                            <td className="px-4 py-3">
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                                Turno Registrado
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSesionDetalle(item)}
                            >
                              Ver
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL DE ARQUEO Y CIERRE DE CAJA (CIEGO / GUIADO) ── */}
      <Modal
        isOpen={modalArqueoOpen}
        onClose={() => setModalArqueoOpen(false)}
        title={modoCiegoEfectivo ? 'Arqueo y Cierre de Turno (Ciego)' : 'Arqueo y Cierre de Turno (Guiado)'}
        size="md"
        footer={
          <div className="flex gap-2 w-full">
            <Button
              variant="danger"
              fullWidth
              loading={cerrando}
              disabled={efectivoContado === '' || parseFloat(efectivoContado) < 0}
              onClick={handleConfirmarCierre}
            >
              {modoCiego ? 'Confirmar y Finalizar Turno' : 'Confirmar Cierre de Caja'}
            </Button>
            <Button
              variant="secondary"
              fullWidth
              disabled={cerrando}
              onClick={() => setModalArqueoOpen(false)}
            >
              Volver
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {/* Selector de modo si es Dueño o si no se exige arqueo ciego obligatorio */}
          {(esDueno || !arqueoCiegoObligatorio) && (
            <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1 border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setModoCiego(false)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  !modoCiego
                    ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                Arqueo Guiado
              </button>
              <button
                type="button"
                onClick={() => setModoCiego(true)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  modoCiego
                    ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                Arqueo Ciego
              </button>
            </div>
          )}

          {modoCiegoEfectivo ? (
            /* Banner explicativo de Arqueo Ciego */
            <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-300">
              <p className="font-semibold text-sm mb-1">Control de Arqueo Ciego</p>
              <p className="text-amber-800/90 dark:text-amber-300/80 leading-relaxed">
                Por seguridad y control interno, contá físicamente todo el dinero en el cajón e ingresá el total. El valor quedará asentado para la auditoría administrativa del Dueño.
              </p>
            </div>
          ) : (
            /* Resumen guiado visible sólo para el Dueño */
            <div className="p-4 rounded-lg bg-gray-50/80 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Fondo inicial de turno:</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatPrecio(sesionActiva?.monto_inicial || 0)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">(+) Efectivo ventas:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  +{formatPrecio(resumenActivo?.total_efectivo || 0)}
                </span>
              </div>
              {(resumenActivo?.total_ingresos_extra || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-blue-600 dark:text-blue-400">(+) Ingresos extra de caja:</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    +{formatPrecio(resumenActivo?.total_ingresos_extra || 0)}
                  </span>
                </div>
              )}
              {(resumenActivo?.total_egresos || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-red-600 dark:text-red-400">(-) Gastos / Egresos de caja:</span>
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    -{formatPrecio(resumenActivo?.total_egresos || 0)}
                  </span>
                </div>
              )}
              <div className="border-t border-gray-300 dark:border-gray-700 pt-2 flex justify-between text-base font-bold">
                <span className="text-gray-800 dark:text-gray-200">Total en cajón esperado:</span>
                <span className="text-indigo-600 dark:text-indigo-400">
                  {formatPrecio(efectivoEsperado)}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Efectivo físico contado en el cajón *
              </label>
              <button
                type="button"
                onClick={() => setMostrarDesgloseBilletes(!mostrarDesgloseBilletes)}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
              >
                {mostrarDesgloseBilletes ? 'Ocultar desglosador' : '+ Contar por billetes'}
              </button>
            </div>

            <Input
              type="number"
              min="0"
              step="100"
              placeholder="Ingresá el dinero total contado"
              value={efectivoContado}
              onChange={(e) => setEfectivoContado(e.target.value)}
              required
              autoFocus
            />

            {/* Desglosador interactivo de billetes */}
            {mostrarDesgloseBilletes && (
              <div className="p-3 bg-gray-50/80 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-700 space-y-2">
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Calculadora de Billetes y Monedas
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[20000, 10000, 2000, 1000, 500, 200, 100, 50].map((den) => (
                    <div key={den} className="flex flex-col">
                      <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
                        ${den.toLocaleString('es-AR')}
                      </span>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={desgloseBilletes[den] || ''}
                        onChange={(e) => handleCambioBillete(den, parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Cálculo de diferencia (SÓLO visible en Arqueo Guiado) */}
          {!modoCiego && efectivoContado !== '' && (
            <div className={`p-4 rounded-lg text-center ${
              diferenciaArqueo === 0
                ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : diferenciaArqueo > 0
                ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                : 'bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
            }`}>
              <p className="text-xs font-semibold uppercase tracking-wider">
                {diferenciaArqueo === 0
                  ? 'Caja exacta'
                  : diferenciaArqueo > 0
                  ? 'Sobrante de caja'
                  : 'Faltante de caja'}
              </p>
              <p className="text-2xl font-bold mt-1">
                {diferenciaArqueo === 0
                  ? '$0'
                  : diferenciaArqueo > 0
                  ? `+${formatPrecio(diferenciaArqueo)}`
                  : formatPrecio(diferenciaArqueo)}
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* ── MODAL REGISTRAR MOVIMIENTO DE CAJA (INGRESO / GASTO) ── */}
      <Modal
        isOpen={modalMovimientoOpen}
        onClose={() => setModalMovimientoOpen(false)}
        title={tipoMovimiento === 'INGRESO' ? 'Registrar Ingreso de Caja' : 'Registrar Gasto / Egreso de Caja'}
        size="md"
        footer={
          <div className="flex gap-2 w-full">
            <Button
              type="button"
              variant="secondary"
              fullWidth
              disabled={guardandoMovimiento}
              onClick={() => setModalMovimientoOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-movimiento-caja"
              variant={tipoMovimiento === 'INGRESO' ? 'primary' : 'danger'}
              fullWidth
              loading={guardandoMovimiento}
              disabled={!montoMovimiento || parseFloat(montoMovimiento) <= 0}
            >
              {tipoMovimiento === 'INGRESO' ? 'Confirmar Ingreso' : 'Confirmar Gasto'}
            </Button>
          </div>
        }
      >
        <form id="form-movimiento-caja" onSubmit={handleGuardarMovimiento} className="space-y-3">
          {/* Selector de Tipo */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setTipoMovimiento('EGRESO')
                setMotivoMovimiento('PROVEEDOR')
              }}
              className={`py-2 rounded-lg text-xs font-bold border transition-colors ${
                tipoMovimiento === 'EGRESO'
                  ? 'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-700 dark:text-red-400'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              Gasto / Egreso
            </button>
            <button
              type="button"
              onClick={() => {
                setTipoMovimiento('INGRESO')
                setMotivoMovimiento('REPOSICION_CAMBIO')
              }}
              className={`py-2 rounded-lg text-xs font-bold border transition-colors ${
                tipoMovimiento === 'INGRESO'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-400'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              Ingreso Extra
            </button>
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Concepto / Motivo
            </label>
            <select
              value={motivoMovimiento}
              onChange={(e) => setMotivoMovimiento(e.target.value as MotivoMovimientoCaja)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
            >
              {tipoMovimiento === 'EGRESO' ? (
                <>
                  <option value="PROVEEDOR">Pago a Proveedor (Panadería, lácteos, etc.)</option>
                  <option value="GASTO_GENERAL">Gasto General / Insumos (Bolsas, limpieza)</option>
                  <option value="RETIRO_DUENO">Retiro de Ganancia / Retiro del Dueño</option>
                  <option value="OTRO">Otro Egreso</option>
                </>
              ) : (
                <>
                  <option value="REPOSICION_CAMBIO">Reposición de Cambio / Billetes</option>
                  <option value="OTRO">Otro Ingreso</option>
                </>
              )}
            </select>
          </div>

          {/* Monto */}
          <div>
            <Input
              label="Monto en efectivo ($) *"
              type="number"
              min="1"
              step="50"
              placeholder="Ej: 5000"
              value={montoMovimiento}
              onChange={(e) => setMontoMovimiento(e.target.value)}
              required
              autoFocus
            />
            {/* Atajos de billetes */}
            <div className="flex gap-2 mt-2">
              {[1000, 2000, 5000, 10000, 20000].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMontoMovimiento(m.toString())}
                  className="flex-1 py-1 text-[11px] font-medium rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  +{formatPrecio(m)}
                </button>
              ))}
            </div>
          </div>

          {/* Descripción */}
          <Input
            label="Detalle o descripción (opcional)"
            type="text"
            placeholder="Ej: 3 barras de hielo, panadería Don Juan..."
            value={descripcionMovimiento}
            onChange={(e) => setDescripcionMovimiento(e.target.value)}
          />
        </form>
      </Modal>

      {/* ── MODAL DE DETALLE DE ARQUEO HISTÓRICO ── */}
      <Modal
        isOpen={!!sesionDetalle}
        onClose={() => setSesionDetalle(null)}
        title="Detalle del Cierre de Caja"
        size="md"
        footer={
          sesionDetalle ? (
            <div className="flex gap-2 w-full">
              <Button
                variant="primary"
                fullWidth
                onClick={() => handleImprimirHistorico(sesionDetalle)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Imprimir Arqueo
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setSesionDetalle(null)}
              >
                Cerrar
              </Button>
            </div>
          ) : undefined
        }
      >
        {sesionDetalle && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Apertura</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {formatFecha(sesionDetalle.fecha_apertura)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cierre</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {sesionDetalle.fecha_cierre ? formatFecha(sesionDetalle.fecha_cierre) : '—'}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Fondo inicial:</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatPrecio(sesionDetalle.monto_inicial)}
                </span>
              </div>
              {esDueno && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Monto esperado por sistema:</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {formatPrecio(sesionDetalle.monto_final_sistema || 0)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Monto contado en mano:</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatPrecio(sesionDetalle.monto_final_declarado || 0)}
                </span>
              </div>
              {esDueno ? (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-bold">
                  <span className="text-gray-800 dark:text-gray-200">Diferencia final:</span>
                  <span className={`${
                    (sesionDetalle.diferencia ?? 0) === 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : (sesionDetalle.diferencia ?? 0) > 0
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {(sesionDetalle.diferencia ?? 0) === 0
                      ? 'Exacto ($0)'
                      : (sesionDetalle.diferencia ?? 0) > 0
                      ? `+${formatPrecio(sesionDetalle.diferencia ?? 0)} (Sobrante)`
                      : `${formatPrecio(sesionDetalle.diferencia ?? 0)} (Faltante)`}
                  </span>
                </div>
              ) : (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 text-xs text-gray-500 dark:text-gray-400">
                  Turno registrado y enviado para auditoría de la administración.
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── MODAL TÉRMICO DE CIERRE DE CAJA (ARQUEO Z) ── */}
      <TicketCierreCajaModal
        isOpen={modalTicketCierreOpen}
        onClose={() => setModalTicketCierreOpen(false)}
        datos={ticketCierre}
      />
    </div>
  )
}
