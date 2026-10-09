import { moduleTabsClassName, moduleTabClassName, moduleTabActiveClassName, moduleTabInactiveClassName } from '../components/ui/moduleTabStyles'
import { IndicatorCard } from '../components/ui/IndicatorCard'
import { CobrosManualesRemotos } from '../components/pos/CobrosManualesRemotos'
import { checkoutManualTransaccionalActivo } from '../lib/manualCheckoutCart'
import { RefreshButton } from '../components/ui/RefreshButton'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useCajaStore } from '../stores/cajaStore'
import { formatPrecio, formatFecha } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { TicketCierreCajaModal, type DatosCierreCaja } from '../components/pos/TicketCierreCajaModal'
import { procesarDespachoCierre } from '../lib/whatsappReport'
import toast from 'react-hot-toast'
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

const MOTIVOS_EGRESO: { valor: MotivoMovimientoCaja; label: string; desc: string }[] = [
  { valor: 'PROVEEDOR', label: 'Pago a Proveedor', desc: 'Panadería, bebidas, lácteos, golosinas' },
  { valor: 'GASTO_GENERAL', label: 'Gasto del Kiosco', desc: 'Bolsas, rollos de ticket, limpieza, librería' },
  { valor: 'RETIRO_DUENO', label: 'Retiro del Dueño', desc: 'Extracción de ganancia o sangría de seguridad' },
  { valor: 'OTRO', label: 'Otro Gasto / Salida', desc: 'Cualquier otra salida de dinero del cajón' },
]

const MOTIVOS_INGRESO: { valor: MotivoMovimientoCaja; label: string; desc: string }[] = [
  { valor: 'REPOSICION_CAMBIO', label: 'Poner Cambio / Sencillo', desc: 'Billetes chicos o monedas para dar vuelto' },
  { valor: 'OTRO', label: 'Plata Extra / Aporte', desc: 'Ingreso extraordinario o cobro extra de dinero' },
]

const MONTOS_RAPIDOS_MOVIMIENTO = [1000, 2000, 5000, 10000, 20000, 50000]
const DENOMINACIONES_BILLETES = [20000, 10000, 2000, 1000, 500, 200, 100, 50]

interface SesionHistorial extends SesionCaja {
  usuario?: Usuario
}

export function CajaPage() {
  const { usuario, kiosco } = useAuthStore()
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
  const [tabActiva, setTabActiva] = useState<'turno' | 'historial'>('turno')

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

  const [sincronizando, setSincronizando] = useState(false)

  const handleSincronizar = async () => {
    setSincronizando(true)
    await Promise.all([
      verificarSesionActiva(),
      cargarHistorial(),
      cargarArqueoCiegoConfig(),
    ])
    setSincronizando(false)
    toast.success('Caja sincronizada con el servidor')
  }

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

  const handleIncrementarBillete = (denominacion: number, delta: number) => {
    const actual = desgloseBilletes[denominacion] || 0
    handleCambioBillete(denominacion, Math.max(0, actual + delta))
  }

  const handleLimpiarBilletes = () => {
    const reset = DENOMINACIONES_BILLETES.reduce((acc, d) => ({ ...acc, [d]: 0 }), {})
    setDesgloseBilletes(reset)
    setEfectivoContado('')
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
  const totalBilletesContados = Object.values(desgloseBilletes).reduce((acc, c) => acc + (c || 0), 0)
  const diferenciaArqueo = contadoNum - efectivoEsperado

  const handleConfirmarCierre = async () => {
    if (cerrando) return
    setCerrando(true)
    const kiosco = useAuthStore.getState().kiosco

    // BUG-07: Refrescar el resumen justo antes del cierre para capturar
    // todas las ventas que hayan ocurrido desde que se abrió el modal de arqueo.
    let resumenFinal = resumenActivo
    if (sesionActiva?.id) {
      try {
        resumenFinal = await cargarResumenSesion(sesionActiva.id)
      } catch {
        // Si falla, usar el resumen que ya estaba en memoria
      }
    }

    const facturadoTotal = resumenFinal?.total_facturado || 0
    const operacionesTotal = resumenFinal?.total_ventas || 0
    const otrosPagos = Math.max(
      0,
      facturadoTotal -
        ((resumenFinal?.total_efectivo || 0) +
          (resumenFinal?.total_mercadopago || 0) +
          (resumenFinal?.total_transferencia || 0) +
          (resumenFinal?.total_tarjeta || 0))
    )

    const esperadoFinal = resumenFinal?.efectivo_esperado_en_caja ?? (sesionActiva?.monto_inicial || 0)
    const diferenciaFinal = contadoNum - esperadoFinal

    const snapshotCierre: DatosCierreCaja = {
      sesionId: sesionActiva?.id,
      kioscoNombre: kiosco?.nombre,
      kioscoDireccion: kiosco?.direccion,
      kioscoTelefono: kiosco?.telefono,
      cajeroNombre: usuario?.nombre,
      fechaApertura: sesionActiva?.fecha_apertura || new Date().toISOString(),
      fechaCierre: new Date().toISOString(),
      montoInicial: sesionActiva?.monto_inicial || 0,
      ventasPorMedio: [
        { medio: 'Efectivo', total: resumenFinal?.total_efectivo || 0 },
        { medio: 'Mercado Pago', total: resumenFinal?.total_mercadopago || 0 },
        { medio: 'Transferencia', total: resumenFinal?.total_transferencia || 0 },
        { medio: 'Tarjeta', total: resumenFinal?.total_tarjeta || 0 },
        { medio: 'Fiado / Cta Cte', total: resumenFinal?.total_cuenta_corriente ?? otrosPagos },
      ].filter((m) => m.total > 0),
      totalVentas: facturadoTotal,
      cantidadVentas: operacionesTotal,
      ingresosExtra: resumenFinal?.total_ingresos_extra || 0,
      egresosExtra: resumenFinal?.total_egresos || 0,
      efectivoEsperado: esperadoFinal,
      efectivoContado: contadoNum,
      diferencia: diferenciaFinal,
    }

    const ok = await cerrarCaja(contadoNum)
    setCerrando(false)
    if (ok) {
      setModalArqueoOpen(false)
      cargarHistorial()
      setTicketCierre(snapshotCierre)
      setModalTicketCierreOpen(true)

      // Despacho no-bloqueante del reporte al Webhook del comercio o apertura de WhatsApp
      const kid = usuario?.kiosco_id || kiosco?.id
      if (kid) {
        procesarDespachoCierre(kid, snapshotCierre)
          .then((res) => {
            if (res.webhookIntentado) {
              if (res.webhookExito) {
                toast.success('Reporte de cierre enviado por Webhook al dueño')
              } else {
                toast.error(`Aviso Webhook: ${res.errorWebhook || 'Sin respuesta'}`, { duration: 4000 })
              }
            }
          })
          .catch((err) => {
            console.warn('Error en despacho de cierre:', err)
          })
      }
    }
  }

  const handleImprimirArqueoActual = () => {
    try {
      if (!sesionActiva) {
        toast.error('No hay una sesión de caja activa')
        return
      }
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

      const datos: DatosCierreCaja = {
        sesionId: sesionActiva.id,
        kioscoNombre: kiosco?.nombre,
        kioscoDireccion: kiosco?.direccion,
        kioscoTelefono: kiosco?.telefono,
        cajeroNombre: sesionActiva.usuario?.nombre || usuario?.nombre || 'Personal',
        fechaApertura: sesionActiva.fecha_apertura || new Date().toISOString(),
        fechaCierre: new Date().toISOString(),
        montoInicial: sesionActiva.monto_inicial || 0,
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
        efectivoEsperado: efectivoEsperado || 0,
        efectivoContado: efectivoEsperado || 0,
        diferencia: 0,
        esParcial: true,
      }
      setTicketCierre(datos)
      setModalTicketCierreOpen(true)
    } catch (err: any) {
      console.error('Error al generar arqueo actual:', err)
      toast.error('No se pudo preparar el arqueo actual')
    }
  }

  const handleImprimirHistorico = async (s: SesionHistorial) => {
    try {
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
        sesionId: s.id,
        kioscoNombre: useAuthStore.getState().kiosco?.nombre,
        kioscoDireccion: useAuthStore.getState().kiosco?.direccion,
        kioscoTelefono: useAuthStore.getState().kiosco?.telefono,
        cajeroNombre: s.usuario?.nombre || usuario?.nombre || 'Personal',
        fechaApertura: s.fecha_apertura || new Date().toISOString(),
        fechaCierre: s.fecha_cierre || s.fecha_apertura || new Date().toISOString(),
        montoInicial: s.monto_inicial || 0,
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
        efectivoEsperado: s.monto_final_sistema || (resumen?.efectivo_esperado_en_caja ?? s.monto_inicial) || 0,
        efectivoContado: s.monto_final_declarado || 0,
        diferencia: s.diferencia || 0,
      }
      setSesionDetalle(null)
      setTicketCierre(datos)
      setModalTicketCierreOpen(true)
    } catch (err: any) {
      console.error('Error al cargar ticket de cierre histórico:', err)
      toast.error('No se pudo preparar el comprobante del turno')
    }
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

    if (tipoMovimiento === 'EGRESO') {
      const efectivoDisponible = resumenActivo?.efectivo_esperado_en_caja ?? (sesionActiva?.monto_inicial || 0)
      if (monto > efectivoDisponible) {
        const confirmar = window.confirm(
          `Atención: El monto a retirar ($${monto.toLocaleString('es-AR')}) supera el efectivo registrado en el cajón ($${efectivoDisponible.toLocaleString('es-AR')}).\n\n¿Deseas registrar la salida de dinero de todas formas?`
        )
        if (!confirmar) return
      }
    }

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

      </div>
      <div className="flex items-center gap-3 min-w-0">
          {/* Pestañas de navegación ordenadas estilo Proveedores */}
          <div className={moduleTabsClassName}>
            <button
              type="button"
              onClick={() => setTabActiva('turno')}
              className={`${moduleTabClassName} ${
                tabActiva === 'turno'
                  ? moduleTabActiveClassName
                  : moduleTabInactiveClassName
              }`}
            >
              Turno Actual
            </button>
            <button
              type="button"
              onClick={() => setTabActiva('historial')}
              className={`${moduleTabClassName} ${
                tabActiva === 'historial'
                  ? moduleTabActiveClassName
                  : moduleTabInactiveClassName
              }`}
            >
              Historial de Cierres ({historial.length})
            </button>
          </div>

          <RefreshButton refreshing={sincronizando || cargando} onClick={handleSincronizar} label="Actualizar caja" />
      </div>

      {checkoutManualTransaccionalActivo() && usuario?.activo && usuario.rol === 'DUEÑO'
        && kiosco?.id === usuario.kiosco_id && (
          <details className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-200">Revisar cobros pendientes del servidor</summary>
            <div className="mt-3"><CobrosManualesRemotos key={`${kiosco.id}/${usuario.id}`} kioscoId={kiosco.id} /></div>
          </details>
        )}
      {cargando ? (
        <div className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Consultando estado de caja...</p>
        </div>
      ) : tabActiva === 'turno' ? (
        !sesionActiva ? (
          /* ── CAJA CERRADA: FORMULARIO DE APERTURA ── */
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 shadow-md dark:shadow-black/20 sm:p-8">
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
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 shadow-md dark:shadow-black/20">
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
                    onClick={handleImprimirArqueoActual}
                    title="Generar o imprimir comprobante térmico de control del turno en curso (Arqueo X)"
                  >
                    Imprimir Arqueo Actual
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleAbrirModalArqueo}
                  >
                    {esDueno || !arqueoCiegoObligatorio ? 'Contar plata y cerrar turno' : 'Cerrar turno (Conteo a ciegas)'}
                  </Button>
                </div>
              </div>

              {/* Cuadrícula financiera del turno */}
              <div className="pt-5">
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Efectivo del cajón</h2>
                <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">El fondo inicial y los ingresos suman; los retiros y gastos descuentan efectivo.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 pt-4">
                <IndicatorCard label="Plata de inicio" valor={formatPrecio(sesionActiva.monto_inicial)} detalle="Fondo para dar vuelto al abrir el turno" icono="caja" />
                <IndicatorCard label="Ventas en efectivo" valor={!modoCiegoEfectivo ? formatPrecio(resumenActivo?.total_efectivo || 0) : '••••••'} detalle={modoCiegoEfectivo ? 'Importe oculto durante el arqueo ciego' : 'Cobros en efectivo registrados en ventas'} icono="dinero" tono="emerald" />
                <IndicatorCard label="Entradas de plata" valor={`+${formatPrecio(resumenActivo?.total_ingresos_extra || 0)}`} detalle="Aportes y reposiciones de cambio" icono="rotacion" tono="teal" />
                <IndicatorCard label="Retiros / Gastos" valor={`-${formatPrecio(resumenActivo?.total_egresos || 0)}`} detalle="Dinero retirado del cajón durante el turno" icono="alerta" tono="rose" />
                <IndicatorCard label={!modoCiegoEfectivo ? 'Debería haber en cajón' : 'Control de turno'} valor={!modoCiegoEfectivo ? formatPrecio(efectivoEsperado) : 'Modo Ciego'} detalle={modoCiegoEfectivo ? 'Contá el efectivo físico al cerrar' : 'Importe esperado para comparar con el conteo físico'} icono="check" tono="purple" />
              </div>

              {/* Medios de cobro del turno */}
              <div className="mt-6 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 p-4">
                <h3 className="text-sm font-bold text-indigo-700 dark:text-indigo-300">Otros medios de cobro y resumen de ventas</h3>
                <p className="mt-1 text-xs leading-relaxed text-indigo-600 dark:text-indigo-300/80">Mercado Pago, transferencias y tarjetas no suman efectivo al cajón. Los fiados quedan pendientes de cobro en cuenta corriente.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-4 border-t border-gray-100 dark:border-gray-700 mt-4">
                <div className="min-w-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 shadow-sm">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Mercado Pago</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
                    {formatPrecio(resumenActivo?.total_mercadopago || 0)}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 shadow-sm">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Transferencia</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
                    {formatPrecio(resumenActivo?.total_transferencia || 0)}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 shadow-sm">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Tarjeta</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
                    {formatPrecio(resumenActivo?.total_tarjeta || 0)}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 shadow-sm">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Fiados / Cta. Cte.</p>
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                    {formatPrecio(resumenActivo?.total_cuenta_corriente || 0)}
                  </p>
                </div>
                <div className="min-w-0 col-span-2 sm:col-span-1 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/30 p-4 shadow-sm">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Total ventas turno</p>
                  <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                    {resumenActivo?.total_ventas || 0} operaciones ({formatPrecio(resumenActivo?.total_facturado || 0)})
                  </p>
                </div>
              </div>
            </div>

            {/* Tarjeta de Movimientos de Caja (Gastos y Entradas directas) */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 shadow-md dark:shadow-black/20 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-700">
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                    Gastos y Movimientos de Caja
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Registrá pagos a proveedores, gastos menores, retiros o reposición de cambio
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-4 py-8 text-center">
                  <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 7h18v14H3V7Zm3-4h12v4M8 12h8M12 9v6" /></svg></span>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sin movimientos de efectivo adicionales</p>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">No se registraron gastos ni ingresos directos en este turno.</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Usá Registrar Ingreso para reponer cambio o Registrar Gasto / Egreso cuando saques dinero del cajón.</p>
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

            </div>
          </div>
        )
      ) : (
        /* ── PESTAÑA DEDICADA DE HISTORIAL DE CIERRES ── */
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 shadow-md dark:shadow-black/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Historial de Cierres de Turno
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Auditoría histórica de arqueos de caja, diferencias y firmas de cajero
              </p>
            </div>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <IndicatorCard label="Cierres cargados" valor={historial.length} detalle="Últimos 20 turnos cerrados disponibles" icono="caja" />
            <IndicatorCard label="Efectivo declarado" valor={formatPrecio(historial.reduce((total, item) => total + (item.monto_final_declarado || 0), 0))} detalle="Suma de los conteos declarados en estos cierres" icono="dinero" tono="teal" />
            {esDueno ? <IndicatorCard label="Con diferencias" valor={historial.filter((item) => item.diferencia != null && item.diferencia !== 0).length} detalle="Cierres cuyo conteo difiere del importe esperado" icono="alerta" tono="amber" /> : <IndicatorCard label="Control de cierre" valor="Registrado" detalle="El detalle de diferencias se reserva al dueño" icono="check" tono="emerald" />}
          </div>
          <div className="mb-5 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50 dark:bg-indigo-950/30 p-4 text-xs leading-relaxed text-indigo-700 dark:text-indigo-300">
            {esDueno ? 'Exacto: el conteo coincide con el sistema. Una diferencia positiva indica sobrante y una negativa, faltante. Abrí el detalle para revisar cada arqueo.' : 'Consultá el efectivo declarado y el detalle de los turnos cerrados. Los importes esperados y las diferencias son visibles únicamente para el dueño.'}
          </div>

          {cargandoHistorial ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-4">Cargando historial...</p>
          ) : historial.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
              Aún no se registraron cierres de caja en el sistema.
            </p>
          ) : (
            <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm tabular-nums">
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
                              Ver detalle
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
        title="Control y Cierre de Turno de Caja"
        size="xl"
        footer={
          <div className="flex flex-col sm:flex-row gap-2.5 w-full">
            <Button
              type="button"
              variant="secondary"
              disabled={cerrando}
              onClick={() => setModalArqueoOpen(false)}
              className="order-2 sm:order-1 sm:w-1/3 py-2.5 text-sm font-semibold"
            >
              Volver a la Caja
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={cerrando}
              disabled={efectivoContado === '' || parseFloat(efectivoContado) < 0}
              onClick={handleConfirmarCierre}
              className="order-1 sm:order-2 sm:w-2/3 py-2.5 text-sm font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm"
            >
              {modoCiegoEfectivo ? 'Finalizar y Cerrar Turno' : 'Confirmar Cierre de Caja'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Selector de modo si es Dueño o si no se exige arqueo ciego obligatorio */}
          {(esDueno || !arqueoCiegoObligatorio) && (
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setModoCiego(false)}
                className={`py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer text-center ${
                  !modoCiegoEfectivo
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-xs border border-gray-200 dark:border-gray-600'
                    : 'border border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Arqueo Guiado
              </button>
              <button
                type="button"
                onClick={() => setModoCiego(true)}
                className={`py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer text-center ${
                  modoCiegoEfectivo
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-xs border border-gray-200 dark:border-gray-600'
                    : 'border border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Arqueo Ciego
              </button>
            </div>
          )}

          {modoCiegoEfectivo ? (
            /* Banner explicativo de Arqueo Ciego */
            <div className="p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 text-amber-950 dark:text-amber-200 flex flex-col sm:flex-row items-start gap-3">
              <span className="font-bold uppercase text-[10px] tracking-wider px-2 py-0.5 rounded border border-amber-400 dark:border-amber-600 bg-amber-100 dark:bg-amber-900/60 shrink-0">
                Auditoría Ciega
              </span>
              <div className="text-xs sm:text-sm">
                <p className="font-bold text-sm mb-0.5">Control de Cierre de Caja</p>
                <p className="opacity-90 leading-relaxed">
                  Por seguridad y orden del comercio, contá todo el dinero en el cajón e ingresá el valor exacto. El monto quedará guardado para la revisión administrativa del Dueño.
                </p>
              </div>
            </div>
          ) : (
            /* Resumen guiado con tarjetas claras de dinero */
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">Fondo inicial:</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    {formatPrecio(sesionActiva?.monto_inicial || 0)}
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">(+) Ventas efectivo:</span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    +{formatPrecio(resumenActivo?.total_efectivo || 0)}
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">(+) Ingresos extra:</span>
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                    +{(resumenActivo?.total_ingresos_extra || 0) > 0 ? formatPrecio(resumenActivo?.total_ingresos_extra || 0) : '$0'}
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">(-) Gastos / Salidas:</span>
                  <span className="text-sm font-bold text-red-600 dark:text-red-400">
                    -{(resumenActivo?.total_egresos || 0) > 0 ? formatPrecio(resumenActivo?.total_egresos || 0) : '$0'}
                  </span>
                </div>
              </div>

              {/* Total esperado destacado */}
              <div className="p-3.5 bg-gray-50 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 block">
                    Total esperado en cajón:
                  </span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    (Fondo inicial + Efectivo cobrado + Entradas extra - Gastos)
                  </span>
                </div>
                <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100">
                  {formatPrecio(efectivoEsperado)}
                </span>
              </div>
            </div>
          )}

          {/* Bloque de Conteo Físico */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gray-50/60 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-gray-100">
                  ¿Cuánta plata en efectivo contaste en el cajón? *
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Ingresá el total en mano o usá la calculadora para desglosar por billete.
                </p>
              </div>

              {/* Botón de toggle elegante */}
              <button
                type="button"
                onClick={() => setMostrarDesgloseBilletes(!mostrarDesgloseBilletes)}
                className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 transition-colors cursor-pointer self-start sm:self-auto shadow-2xs"
              >
                <span>{mostrarDesgloseBilletes ? 'Ocultar calculadora' : 'Contar billete por billete'}</span>
              </button>
            </div>

            {/* Display prominente de monto con prefijo $ tipo panel bancario */}
            <div className="relative flex items-center rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus-within:border-indigo-500 dark:focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-r border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 font-black text-2xl select-none flex items-center">
                $
              </div>
              <input
                type="number"
                min="0"
                step="100"
                placeholder="0"
                value={efectivoContado}
                onChange={(e) => setEfectivoContado(e.target.value)}
                required
                autoFocus
                className="w-full px-4 py-3 bg-transparent text-gray-900 dark:text-gray-100 text-2xl sm:text-3xl font-black tracking-tight outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600"
              />
            </div>

            {/* Desglosador interactivo táctil de billetes */}
            {mostrarDesgloseBilletes && (
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                      Calculadora de Billetes y Monedas
                    </h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Indicá la cantidad de billetes que tenés de cada valor.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLimpiarBilletes}
                    className="px-2.5 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-800 hover:bg-red-50/50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                  >
                    Poner en cero
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {DENOMINACIONES_BILLETES.map((den) => {
                    const cant = desgloseBilletes[den] || 0
                    return (
                      <div
                        key={den}
                        className={`p-3.5 sm:p-4 rounded-xl border-2 transition-all flex items-center justify-between gap-3 ${
                          cant > 0
                            ? 'bg-gray-50/90 dark:bg-gray-800 border-gray-400 dark:border-gray-500 shadow-2xs'
                            : 'bg-white dark:bg-gray-800/60 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        {/* Denominación y conteo */}
                        <div className="flex flex-col">
                          <span className="text-base sm:text-lg font-black text-gray-900 dark:text-gray-100 tracking-tight">
                            ${den.toLocaleString('es-AR')}
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              cant > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'
                            }`}
                          >
                            {cant > 0 ? `${cant} ${cant === 1 ? 'billete' : 'billetes'}` : '0 billetes'}
                          </span>
                        </div>

                        {/* Stepper amplio y cómodo */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleIncrementarBillete(den, -1)}
                            disabled={cant <= 0}
                            className="w-9 h-9 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-20 disabled:pointer-events-none text-gray-800 dark:text-gray-200 font-black text-lg flex items-center justify-center cursor-pointer transition-transform active:scale-95 shadow-2xs select-none"
                            aria-label={`Restar billete de $${den}`}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={cant || ''}
                            onChange={(e) => handleCambioBillete(den, parseInt(e.target.value) || 0)}
                            className="w-16 text-center py-1.5 font-black text-base rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:border-indigo-500 outline-none shadow-2xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleIncrementarBillete(den, 1)}
                            className="w-9 h-9 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-black text-lg flex items-center justify-center cursor-pointer transition-transform active:scale-95 shadow-2xs select-none"
                            aria-label={`Sumar billete de $${den}`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 rounded-xl bg-gray-100/90 dark:bg-gray-900/70 border border-gray-200 dark:border-gray-700 text-xs sm:text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-gray-600 dark:text-gray-400 font-medium">
                      Billetes contados:
                    </span>
                    <span className="font-black text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 px-2.5 py-0.5 rounded-md border border-gray-300 dark:border-gray-600">
                      {totalBilletesContados} un.
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-gray-600 dark:text-gray-400 font-medium">
                      Total dinero:
                    </span>
                    <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400">
                      {formatPrecio(contadoNum)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tarjeta de Conciliación de Diferencia (Visible en Arqueo Guiado) */}
          {!modoCiegoEfectivo && efectivoContado !== '' && (
            <div
              className={`p-4 rounded-xl text-center border transition-all ${
                diferenciaArqueo === 0
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-300'
                  : diferenciaArqueo > 0
                  ? 'bg-blue-50/80 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800/60 text-blue-900 dark:text-blue-300'
                  : 'bg-red-50/80 dark:bg-red-950/20 border-red-300 dark:border-red-800/60 text-red-900 dark:text-red-300'
              }`}
            >
              <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-1 uppercase tracking-wider bg-white/80 dark:bg-black/20 border border-current">
                {diferenciaArqueo === 0
                  ? 'Caja Exacta (Sin Diferencias)'
                  : diferenciaArqueo > 0
                  ? 'Sobrante de Caja'
                  : 'Faltante de Caja'}
              </div>
              <p className="text-2xl sm:text-3xl font-black mt-1">
                {diferenciaArqueo === 0
                  ? '$0'
                  : diferenciaArqueo > 0
                  ? `+${formatPrecio(diferenciaArqueo)}`
                  : formatPrecio(diferenciaArqueo)}
              </p>
              <p className="text-xs sm:text-sm font-medium mt-1 opacity-90 max-w-md mx-auto">
                {diferenciaArqueo === 0
                  ? 'El dinero contado coincide al centavo con lo esperado por el sistema.'
                  : diferenciaArqueo > 0
                  ? 'Tenés más dinero en el cajón de lo que calculó el sistema.'
                  : 'Hay menos dinero en el cajón de lo esperado. Revisá si quedó algún gasto o comprobante sin registrar.'}
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* ── MODAL REGISTRAR MOVIMIENTO DE CAJA (INGRESO / GASTO) ── */}
      <Modal
        isOpen={modalMovimientoOpen}
        onClose={() => setModalMovimientoOpen(false)}
        title={tipoMovimiento === 'INGRESO' ? 'Registrar Entrada de Dinero' : 'Registrar Salida de Dinero / Gasto'}
        size="lg"
        footer={
          <div className="flex flex-col sm:flex-row gap-2.5 w-full">
            <Button
              type="button"
              variant="secondary"
              disabled={guardandoMovimiento}
              onClick={() => setModalMovimientoOpen(false)}
              className="order-2 sm:order-1 sm:w-1/3 py-2.5 text-sm font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-movimiento-caja"
              variant={tipoMovimiento === 'INGRESO' ? 'primary' : 'danger'}
              loading={guardandoMovimiento}
              disabled={!montoMovimiento || parseFloat(montoMovimiento) <= 0}
              className={`order-1 sm:order-2 sm:w-2/3 py-2.5 text-sm font-bold shadow-sm ${
                tipoMovimiento === 'INGRESO'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {tipoMovimiento === 'INGRESO' ? 'Confirmar Entrada de Dinero' : 'Confirmar Salida de Dinero'}
            </Button>
          </div>
        }
      >
        <form id="form-movimiento-caja" onSubmit={handleGuardarMovimiento} className="space-y-4">
          {/* Selector de Tipo (Salida vs Entrada) */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setTipoMovimiento('EGRESO')
                setMotivoMovimiento('PROVEEDOR')
              }}
              className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer text-left flex flex-col justify-between ${
                tipoMovimiento === 'EGRESO'
                  ? 'bg-red-50 dark:bg-red-950/50 border-red-500 text-red-950 dark:text-red-200 shadow-xs'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                  Salida de Dinero
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-red-300 dark:border-red-700 bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300">
                  Egreso
                </span>
              </div>
              <p className="text-sm font-black mt-1.5">Gasto o Retiro</p>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Resta plata física del cajón
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTipoMovimiento('INGRESO')
                setMotivoMovimiento('REPOSICION_CAMBIO')
              }}
              className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer text-left flex flex-col justify-between ${
                tipoMovimiento === 'INGRESO'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-950 dark:text-emerald-200 shadow-xs'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Entrada de Dinero
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                  Ingreso
                </span>
              </div>
              <p className="text-sm font-black mt-1.5">Cambio o Aporte Extra</p>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Suma plata física al cajón
              </span>
            </button>
          </div>

          {/* Motivo del Movimiento en Tarjetas Táctiles */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              ¿Por qué motivo se mueve la plata? *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(tipoMovimiento === 'EGRESO' ? MOTIVOS_EGRESO : MOTIVOS_INGRESO).map((mot) => {
                const seleccionado = motivoMovimiento === mot.valor
                return (
                  <button
                    key={mot.valor}
                    type="button"
                    onClick={() => setMotivoMovimiento(mot.valor)}
                    className={`p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      seleccionado
                        ? tipoMovimiento === 'EGRESO'
                          ? 'border-red-500 bg-red-50/80 dark:bg-red-950/50 text-red-950 dark:text-red-200 shadow-xs ring-1 ring-red-500/50'
                          : 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-200 shadow-xs ring-1 ring-emerald-500/50'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{mot.label}</span>
                      {seleccionado && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                          tipoMovimiento === 'EGRESO'
                            ? 'bg-red-100 dark:bg-red-900 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300'
                            : 'bg-emerald-100 dark:bg-emerald-900 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                        }`}>
                          Activo
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                      {mot.desc}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Monto e importe */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Monto en efectivo ($) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-400">
                $
              </span>
              <input
                type="number"
                min="1"
                step="any"
                placeholder="0"
                value={montoMovimiento}
                onChange={(e) => setMontoMovimiento(e.target.value)}
                required
                autoFocus
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border-2 border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xl font-black tracking-tight focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-300"
              />
            </div>

            {/* Billetes rápidos estilo touch con bordes nítidos */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1 w-full">
              {MONTOS_RAPIDOS_MOVIMIENTO.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMontoMovimiento(m.toString())}
                  className={`w-full py-2 px-1 text-xs font-bold rounded-xl border-2 transition-all cursor-pointer text-center select-none active:scale-95 ${
                    parseFloat(montoMovimiento) === m
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs ring-1 ring-indigo-500/40'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                  }`}
                >
                  {formatPrecio(m)}
                </button>
              ))}
            </div>
          </div>

          {/* Detalle o descripción */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Anotación o detalle (opcional)
            </label>
            <input
              type="text"
              placeholder={
                tipoMovimiento === 'EGRESO'
                  ? 'Ej: Se le pagó al repartidor de pan Don Juan...'
                  : 'Ej: Se pusieron monedas de $100 y billetes chicos para cambio...'
              }
              value={descripcionMovimiento}
              onChange={(e) => setDescripcionMovimiento(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </form>
      </Modal>

      {/* ── MODAL DE DETALLE DE ARQUEO HISTÓRICO ── */}
      <Modal
        isOpen={!!sesionDetalle}
        onClose={() => setSesionDetalle(null)}
        title="Detalle del Turno de Caja"
        size="lg"
        footer={
          sesionDetalle ? (
            <div className="flex flex-col sm:flex-row gap-2.5 w-full">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setSesionDetalle(null)}
                className="order-2 sm:order-1 sm:w-1/3 py-2.5 text-sm font-semibold"
              >
                Cerrar
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={() => handleImprimirHistorico(sesionDetalle)}
                className="order-1 sm:order-2 sm:w-2/3 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center justify-center gap-2"
              >
                Imprimir Ticket de Cierre
              </Button>
            </div>
          ) : undefined
        }
      >
        {sesionDetalle && (
          <div className="space-y-4">
            {/* Metadatos del Turno */}
            <div className="p-3.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="text-gray-500 dark:text-gray-400 block font-medium">Cajero responsable:</span>
                <span className="text-sm font-black text-gray-900 dark:text-gray-100">
                  {sesionDetalle.usuario?.nombre || usuario?.nombre || 'Personal'}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block font-medium">Apertura:</span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">
                    {formatFecha(sesionDetalle.fecha_apertura)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block font-medium">Cierre:</span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">
                    {sesionDetalle.fecha_cierre ? formatFecha(sesionDetalle.fecha_cierre) : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Tarjetas KPI de Balance */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-3 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">Fondo inicial:</span>
                <span className="text-base font-black text-gray-900 dark:text-gray-100">
                  {formatPrecio(sesionDetalle.monto_inicial)}
                </span>
              </div>
              {esDueno && (
                <div className="p-3 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">Esperado según sistema:</span>
                  <span className="text-base font-black text-indigo-600 dark:text-indigo-400">
                    {formatPrecio(sesionDetalle.monto_final_sistema || 0)}
                  </span>
                </div>
              )}
              <div className="p-3 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">Contado físicamente:</span>
                <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                  {formatPrecio(sesionDetalle.monto_final_declarado || 0)}
                </span>
              </div>
            </div>

            {/* Resultado Final de la Conciliación */}
            {esDueno ? (
              <div
                className={`p-4 rounded-xl text-center border-2 ${
                  (sesionDetalle.diferencia ?? 0) === 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600 text-emerald-900 dark:text-emerald-300'
                    : (sesionDetalle.diferencia ?? 0) > 0
                    ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 dark:border-blue-600 text-blue-900 dark:text-blue-300'
                    : 'bg-red-50 dark:bg-red-950/30 border-red-400 dark:border-red-600 text-red-900 dark:text-red-300'
                }`}
              >
                <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-1 uppercase tracking-wider bg-white/70 dark:bg-black/20 border border-current">
                  {(sesionDetalle.diferencia ?? 0) === 0
                    ? 'Caja Exacta (Sin Diferencias)'
                    : (sesionDetalle.diferencia ?? 0) > 0
                    ? 'Sobrante de Caja'
                    : 'Faltante de Caja'}
                </div>
                <p className="text-2xl font-black mt-1">
                  {(sesionDetalle.diferencia ?? 0) === 0
                    ? '$0'
                    : (sesionDetalle.diferencia ?? 0) > 0
                    ? `+${formatPrecio(sesionDetalle.diferencia ?? 0)}`
                    : formatPrecio(sesionDetalle.diferencia ?? 0)}
                </p>
                <p className="text-xs mt-1 opacity-80">
                  {(sesionDetalle.diferencia ?? 0) === 0
                    ? 'El arqueo cerró sin diferencias de dinero.'
                    : (sesionDetalle.diferencia ?? 0) > 0
                    ? 'El cajero declaró más dinero que el calculado por ventas.'
                    : 'El cajero declaró menos dinero que el esperado por ventas.'}
                </p>
              </div>
            ) : (
              <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 text-center">
                Turno registrado y enviado para la auditoría de la administración.
              </div>
            )}
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
