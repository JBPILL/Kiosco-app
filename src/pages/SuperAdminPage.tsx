import { useState, useEffect, useMemo } from 'react'
import { useAdminStore } from '../stores/adminStore'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import type { KioscoAdminView, PagoSuscripcion } from '../types/database'
import { formatPrecio } from '../lib/utils'

export function SuperAdminPage() {
  const {
    kioscos,
    planes,
    cargando,
    cargandoAccion,
    cargarDatosAdmin,
    renovarSuscripcion,
    cambiarEstadoKiosco,
    crearKioscoCliente,
    obtenerHistorialPagos,
  } = useAdminStore()

  // Filtros y búsqueda
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<
    'TODOS' | 'ACTIVOS' | 'POR_VENCER' | 'VENCIDOS' | 'SUSPENDIDOS'
  >('TODOS')

  // Modal Nuevo Kiosco
  const [modalNuevoOpen, setModalNuevoOpen] = useState(false)
  const [nuevoNombreKiosco, setNuevoNombreKiosco] = useState('')
  const [nuevaDireccion, setNuevaDireccion] = useState('')
  const [nuevoTelefono, setNuevoTelefono] = useState('')
  const [nuevoNombreDueno, setNuevoNombreDueno] = useState('')
  const [nuevoEmailDueno, setNuevoEmailDueno] = useState('')
  const [nuevoPasswordDueno, setNuevoPasswordDueno] = useState('')
  const [nuevoPlanId, setNuevoPlanId] = useState('')
  const [nuevosDiasValidez, setNuevosDiasValidez] = useState(30)

  // Modal Renovar
  const [modalRenovarOpen, setModalRenovarOpen] = useState(false)
  const [kioscoParaRenovar, setKioscoParaRenovar] = useState<KioscoAdminView | null>(null)
  const [mesesRenovacion, setMesesRenovacion] = useState(1)
  const [montoRenovacion, setMontoRenovacion] = useState(0)
  const [medioPagoRenovacion, setMedioPagoRenovacion] = useState('TRANSFERENCIA')
  const [notasRenovacion, setNotasRenovacion] = useState('')

  // Modal Historial de Pagos
  const [modalPagosOpen, setModalPagosOpen] = useState(false)
  const [kioscoHistorial, setKioscoHistorial] = useState<KioscoAdminView | null>(null)
  const [historialPagos, setHistorialPagos] = useState<PagoSuscripcion[]>([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  // Cargar datos al montar
  useEffect(() => {
    cargarDatosAdmin()
  }, [cargarDatosAdmin])

  // Establecer plan por defecto al abrir modal nuevo
  useEffect(() => {
    if (planes.length > 0 && !nuevoPlanId) {
      setNuevoPlanId(planes[0].id)
    }
  }, [planes, nuevoPlanId])

  // Calcular métricas KPI
  const metricas = useMemo(() => {
    const total = kioscos.length
    const activos = kioscos.filter((k) => k.estado_kiosco === 'ACTIVO').length
    const porVencer = kioscos.filter(
      (k) =>
        k.estado_kiosco === 'ACTIVO' &&
        k.dias_restantes !== null &&
        k.dias_restantes >= 0 &&
        k.dias_restantes <= 5
    ).length
    const vencidos = kioscos.filter(
      (k) =>
        k.estado_kiosco === 'SOLO_LECTURA' ||
        (k.dias_restantes !== null && k.dias_restantes < 0)
    ).length
    const suspendidos = kioscos.filter((k) => k.estado_kiosco === 'SUSPENDIDO').length

    // MRR: Suma de precios mensuales de kioscos activos
    const mrr = kioscos.reduce((acc, k) => {
      if (k.estado_kiosco === 'ACTIVO') {
        return acc + (k.precio_mensual || 0)
      }
      return acc
    }, 0)

    return { total, activos, porVencer, vencidos, suspendidos, mrr }
  }, [kioscos])

  // Filtrado de kioscos
  const kioscosFiltrados = useMemo(() => {
    return kioscos.filter((k) => {
      // Filtro de búsqueda
      const q = busqueda.toLowerCase().trim()
      const matchBusqueda =
        !q ||
        k.nombre_kiosco?.toLowerCase().includes(q) ||
        k.nombre_dueno?.toLowerCase().includes(q) ||
        k.email_dueno?.toLowerCase().includes(q) ||
        k.telefono_kiosco?.toLowerCase().includes(q)

      if (!matchBusqueda) return false

      // Filtro de estado
      if (filtroEstado === 'ACTIVOS') {
        return k.estado_kiosco === 'ACTIVO' && (k.dias_restantes === null || k.dias_restantes > 5)
      }
      if (filtroEstado === 'POR_VENCER') {
        return (
          k.estado_kiosco === 'ACTIVO' &&
          k.dias_restantes !== null &&
          k.dias_restantes >= 0 &&
          k.dias_restantes <= 5
        )
      }
      if (filtroEstado === 'VENCIDOS') {
        return (
          k.estado_kiosco === 'SOLO_LECTURA' ||
          (k.dias_restantes !== null && k.dias_restantes < 0)
        )
      }
      if (filtroEstado === 'SUSPENDIDOS') {
        return k.estado_kiosco === 'SUSPENDIDO'
      }

      return true
    })
  }, [kioscos, busqueda, filtroEstado])

  // Handlers para acciones
  const abrirModalRenovar = (kiosco: KioscoAdminView) => {
    setKioscoParaRenovar(kiosco)
    setMesesRenovacion(1)
    setMontoRenovacion(kiosco.precio_mensual || 30000)
    setMedioPagoRenovacion('TRANSFERENCIA')
    setNotasRenovacion('')
    setModalRenovarOpen(true)
  }

  const handleCambiarMeses = (m: number) => {
    setMesesRenovacion(m)
    const base = kioscoParaRenovar?.precio_mensual || 30000
    setMontoRenovacion(base * m)
  }

  const handleConfirmarRenovacion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!kioscoParaRenovar) return

    const ok = await renovarSuscripcion(
      kioscoParaRenovar.kiosco_id,
      mesesRenovacion,
      montoRenovacion,
      medioPagoRenovacion,
      notasRenovacion
    )

    if (ok) {
      setModalRenovarOpen(false)
      setKioscoParaRenovar(null)
    }
  }

  const handleCrearNuevoKiosco = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevoNombreKiosco.trim() || !nuevoNombreDueno.trim() || !nuevoEmailDueno.trim() || !nuevoPasswordDueno.trim()) {
      return
    }

    const ok = await crearKioscoCliente({
      nombreKiosco: nuevoNombreKiosco.trim(),
      direccion: nuevaDireccion.trim() || undefined,
      telefono: nuevoTelefono.trim() || undefined,
      nombreDueno: nuevoNombreDueno.trim(),
      emailDueno: nuevoEmailDueno.trim(),
      passwordDueno: nuevoPasswordDueno.trim(),
      planId: nuevoPlanId,
      diasValidez: Number(nuevosDiasValidez) || 30,
    })

    if (ok) {
      setModalNuevoOpen(false)
      setNuevoNombreKiosco('')
      setNuevaDireccion('')
      setNuevoTelefono('')
      setNuevoNombreDueno('')
      setNuevoEmailDueno('')
      setNuevoPasswordDueno('')
      setNuevosDiasValidez(30)
    }
  }

  const handleVerPagos = async (kiosco: KioscoAdminView) => {
    if (!kiosco.suscripcion_id) return
    setKioscoHistorial(kiosco)
    setModalPagosOpen(true)
    setCargandoHistorial(true)
    const pagos = await obtenerHistorialPagos(kiosco.suscripcion_id)
    setHistorialPagos(pagos)
    setCargandoHistorial(false)
  }

  const generarLinkWhatsApp = (kiosco: KioscoAdminView) => {
    const rawTel = (kiosco.telefono_kiosco || '').replace(/[^0-9]/g, '')
    if (!rawTel) return null

    // Asegurar código de país si es de Argentina
    let tel = rawTel
    if (tel.length === 10) {
      tel = `549${tel}`
    } else if (tel.length === 11 && tel.startsWith('0')) {
      tel = `549${tel.slice(1)}`
    }

    const dias = kiosco.dias_restantes
    const fecha = kiosco.fecha_vencimiento || 'próxima fecha'
    const plan = kiosco.nombre_plan || 'Kiosco Pro'
    const monto = kiosco.precio_mensual ? formatPrecio(kiosco.precio_mensual) : ''

    let texto = `Hola ${kiosco.nombre_dueno || 'Estimado'}! Te escribimos de KioskoPOS.`
    if (dias !== null && dias > 0) {
      texto += ` Te recordamos que la suscripción de "${kiosco.nombre_kiosco}" vence en ${dias} días (${fecha}).`
    } else if (dias !== null && dias === 0) {
      texto += ` Te recordamos que la suscripción de "${kiosco.nombre_kiosco}" vence hoy (${fecha}).`
    } else {
      texto += ` La suscripción de "${kiosco.nombre_kiosco}" se encuentra vencida desde el ${fecha}.`
    }

    if (monto) {
      texto += ` Valor de renovación mensual (${plan}): ${monto}.`
    }
    texto += ' Avisanos si necesitas el alias o datos de cuenta para continuar operando sin interrupciones. Muchas gracias!'

    return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider uppercase px-2.5 py-1 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
              Super-Admin
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">Control Central SaaS</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            Gestión de Alquileres y Clientes
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Supervisión global de kioscos, cobranzas, renovaciones de servicio y recordatorios.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="secondary"
            onClick={() => cargarDatosAdmin()}
            disabled={cargando}
            className="text-sm"
          >
            {cargando ? 'Actualizando...' : 'Actualizar'}
          </Button>
          <Button
            variant="primary"
            onClick={() => setModalNuevoOpen(true)}
            className="text-sm shadow-sm"
          >
            + Nuevo Kiosco Cliente
          </Button>
        </div>
      </div>

      {/* Tarjetas KPI de Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Kioscos Activos
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {metricas.activos}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              de {metricas.total} total
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
            Por Vencer (≤ 5 d)
          </span>
          <div className="mt-2">
            <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {metricas.porVencer}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
            Vencidos / Impagos
          </span>
          <div className="mt-2">
            <span className="text-2xl font-bold text-red-600 dark:text-red-400">
              {metricas.vencidos}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Suspendidos
          </span>
          <div className="mt-2">
            <span className="text-2xl font-bold text-gray-700 dark:text-gray-300">
              {metricas.suspendidos}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs col-span-2 lg:col-span-1">
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">
            MRR Estimado
          </span>
          <div className="mt-2">
            <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
              {formatPrecio(metricas.mrr)}
            </span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Pestañas de Filtro */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setFiltroEstado('TODOS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filtroEstado === 'TODOS'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Todos ({metricas.total})
          </button>
          <button
            onClick={() => setFiltroEstado('ACTIVOS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filtroEstado === 'ACTIVOS'
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Al Día ({metricas.activos - metricas.porVencer})
          </button>
          <button
            onClick={() => setFiltroEstado('POR_VENCER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filtroEstado === 'POR_VENCER'
                ? 'bg-amber-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Por Vencer ({metricas.porVencer})
          </button>
          <button
            onClick={() => setFiltroEstado('VENCIDOS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filtroEstado === 'VENCIDOS'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Vencidos ({metricas.vencidos})
          </button>
          <button
            onClick={() => setFiltroEstado('SUSPENDIDOS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filtroEstado === 'SUSPENDIDOS'
                ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Suspendidos ({metricas.suspendidos})
          </button>
        </div>

        {/* Input Buscador */}
        <div className="w-full sm:w-72">
          <Input
            placeholder="Buscar por kiosco, dueño o teléfono..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {/* Lista de Kioscos (Desktop y Mobile) */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xs">
        {cargando ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-3" />
            <p>Cargando información de clientes...</p>
          </div>
        ) : kioscosFiltrados.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <p className="font-semibold">No se encontraron kioscos</p>
            <p className="text-sm mt-1">Intentá cambiar los filtros o dar de alta un nuevo kiosco cliente.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {kioscosFiltrados.map((k) => {
              const waLink = generarLinkWhatsApp(k)
              const dias = k.dias_restantes

              // Determinar badge de vencimiento
              let badgeColor = 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
              let badgeTexto = 'Sin datos'

              if (k.estado_kiosco === 'SUSPENDIDO') {
                badgeColor = 'bg-gray-200 text-gray-800 dark:bg-gray-900 dark:text-gray-300 border border-gray-400'
                badgeTexto = 'SUSPENDIDO'
              } else if (k.estado_kiosco === 'SOLO_LECTURA' || (dias !== null && dias < 0)) {
                badgeColor = 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-bold'
                badgeTexto = dias !== null ? `Vencido (${Math.abs(dias)}d)` : 'Vencido'
              } else if (dias !== null && dias <= 5) {
                badgeColor = 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-bold'
                badgeTexto = `Vence en ${dias}d`
              } else if (dias !== null) {
                badgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                badgeTexto = `Al día (${dias}d)`
              }

              return (
                <div
                  key={k.kiosco_id}
                  className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors"
                >
                  {/* Info del Kiosco y Dueño */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                        {k.nombre_kiosco}
                      </h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeColor}`}>
                        {badgeTexto}
                      </span>
                      {k.nombre_plan && (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-medium">
                          {k.nombre_plan} ({k.precio_mensual ? formatPrecio(k.precio_mensual) : ''}/mes)
                        </span>
                      )}
                    </div>

                    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
                      <span>
                        <strong className="text-gray-700 dark:text-gray-300">Dueño:</strong> {k.nombre_dueno || 'Sin asignar'}
                      </span>
                      {k.email_dueno && (
                        <span>
                          <strong className="text-gray-700 dark:text-gray-300">Email:</strong> {k.email_dueno}
                        </span>
                      )}
                      {k.telefono_kiosco && (
                        <span>
                          <strong className="text-gray-700 dark:text-gray-300">Tel:</strong> {k.telefono_kiosco}
                        </span>
                      )}
                      {k.direccion && (
                        <span>
                          <strong className="text-gray-700 dark:text-gray-300">Dirección:</strong> {k.direccion}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-gray-400 dark:text-gray-500 flex flex-wrap gap-x-3 pt-0.5">
                      <span>Vencimiento: {k.fecha_vencimiento || 'No registrado'}</span>
                      {k.fecha_ultimo_pago && (
                        <span>
                          Último cobro: {k.fecha_ultimo_pago} ({formatPrecio(k.monto_ultimo_pago || 0)} vía {k.medio_ultimo_pago || '—'})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Acciones del Kiosco */}
                  <div className="flex items-center gap-2 flex-wrap self-start lg:self-center">
                    {/* Botón WhatsApp */}
                    {waLink ? (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
                      >
                        WhatsApp
                      </a>
                    ) : (
                      <button
                        disabled
                        title="No posee número de teléfono cargado"
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed"
                      >
                        WhatsApp (Sin Tel)
                      </button>
                    )}

                    {/* Botón Renovar */}
                    <Button
                      variant="primary"
                      onClick={() => abrirModalRenovar(k)}
                      disabled={cargandoAccion}
                      className="text-xs px-3 py-2"
                    >
                      Renovar +30d
                    </Button>

                    {/* Selector de Estado Rápido */}
                    <select
                      value={k.estado_kiosco}
                      onChange={(e) =>
                        cambiarEstadoKiosco(
                          k.kiosco_id,
                          e.target.value as 'ACTIVO' | 'SOLO_LECTURA' | 'SUSPENDIDO'
                        )
                      }
                      disabled={cargandoAccion}
                      className="px-2.5 py-2 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600 focus:outline-hidden"
                    >
                      <option value="ACTIVO">Activo</option>
                      <option value="SOLO_LECTURA">Solo Lectura</option>
                      <option value="SUSPENDIDO">Suspendido</option>
                    </select>

                    {/* Historial de Pagos */}
                    {k.suscripcion_id && (
                      <button
                        type="button"
                        onClick={() => handleVerPagos(k)}
                        className="px-2.5 py-2 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        Pagos
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* MODAL NUEVO KIOSCO CLIENTE */}
      <Modal
        isOpen={modalNuevoOpen}
        onClose={() => setModalNuevoOpen(false)}
        title="Dar de Alta Nuevo Kiosco Cliente"
      >
        <form onSubmit={handleCrearNuevoKiosco} className="space-y-4">
          <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-xl text-xs text-indigo-800 dark:text-indigo-300">
            Esta acción crea el nuevo local (tenant), registra la cuenta de acceso para el dueño y genera la suscripción inicial.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Input
                label="Nombre del Kiosco / Comercio *"
                placeholder="Ej: Kiosco El Paso"
                value={nuevoNombreKiosco}
                onChange={(e) => setNuevoNombreKiosco(e.target.value)}
                required
              />
            </div>

            <div>
              <Input
                label="Dirección del Local"
                placeholder="Ej: Av. San Martín 1234"
                value={nuevaDireccion}
                onChange={(e) => setNuevaDireccion(e.target.value)}
              />
            </div>

            <div>
              <Input
                label="Teléfono / WhatsApp de Contacto"
                placeholder="Ej: 1123456789"
                value={nuevoTelefono}
                onChange={(e) => setNuevoTelefono(e.target.value)}
              />
            </div>

            <div>
              <Input
                label="Nombre del Dueño *"
                placeholder="Ej: Carlos Gómez"
                value={nuevoNombreDueno}
                onChange={(e) => setNuevoNombreDueno(e.target.value)}
                required
              />
            </div>

            <div>
              <Input
                label="Email de Acceso (Login) *"
                type="email"
                placeholder="carlos@gmail.com"
                value={nuevoEmailDueno}
                onChange={(e) => setNuevoEmailDueno(e.target.value)}
                required
              />
            </div>

            <div>
              <Input
                label="Contraseña Inicial *"
                type="password"
                placeholder="Clave de 6+ caracteres"
                value={nuevoPasswordDueno}
                onChange={(e) => setNuevoPasswordDueno(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Plan Asignado
              </label>
              <select
                value={nuevoPlanId}
                onChange={(e) => setNuevoPlanId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-hidden"
              >
                {planes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({formatPrecio(p.precio_mensual)}/mes)
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <Input
                label="Días de Período Inicial (Prueba / Pago)"
                type="number"
                min={1}
                max={365}
                value={nuevosDiasValidez}
                onChange={(e) => setNuevosDiasValidez(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalNuevoOpen(false)}
              disabled={cargandoAccion}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={cargandoAccion}>
              {cargandoAccion ? 'Creando Kiosco...' : 'Crear Kiosco'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL RENOVAR SUSCRIPCIÓN */}
      <Modal
        isOpen={modalRenovarOpen}
        onClose={() => setModalRenovarOpen(false)}
        title="Registrar Cobro y Renovar Alquiler"
      >
        {kioscoParaRenovar && (
          <form onSubmit={handleConfirmarRenovacion} className="space-y-4">
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-xs space-y-1">
              <p>
                <strong className="text-gray-800 dark:text-gray-200">Kiosco:</strong> {kioscoParaRenovar.nombre_kiosco}
              </p>
              <p>
                <strong className="text-gray-800 dark:text-gray-200">Dueño:</strong> {kioscoParaRenovar.nombre_dueno} ({kioscoParaRenovar.email_dueno})
              </p>
              <p>
                <strong className="text-gray-800 dark:text-gray-200">Vencimiento Actual:</strong> {kioscoParaRenovar.fecha_vencimiento || 'Sin fecha'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tiempo a Renovar
                </label>
                <select
                  value={mesesRenovacion}
                  onChange={(e) => handleCambiarMeses(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-hidden"
                >
                  <option value={1}>1 Mes (+30 días)</option>
                  <option value={2}>2 Meses (+60 días)</option>
                  <option value={3}>3 Meses (+90 días)</option>
                  <option value={6}>6 Meses (+180 días)</option>
                  <option value={12}>1 Año (+360 días)</option>
                </select>
              </div>

              <div>
                <Input
                  label="Monto Cobrado ($)"
                  type="number"
                  min={0}
                  step="100"
                  value={montoRenovacion}
                  onChange={(e) => setMontoRenovacion(Number(e.target.value))}
                  required
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Medio de Pago
                </label>
                <select
                  value={medioPagoRenovacion}
                  onChange={(e) => setMedioPagoRenovacion(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-hidden"
                >
                  <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                  <option value="MERCADOPAGO">Mercado Pago</option>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>

              <div className="col-span-2">
                <Input
                  label="Notas o Comprobante (Opcional)"
                  placeholder="Ej: Transferencia recibida vía MP con alias kioscopos"
                  value={notasRenovacion}
                  onChange={(e) => setNotasRenovacion(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModalRenovarOpen(false)}
                disabled={cargandoAccion}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={cargandoAccion}>
                {cargandoAccion ? 'Registrando...' : 'Confirmar Renovación'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL HISTORIAL DE PAGOS */}
      <Modal
        isOpen={modalPagosOpen}
        onClose={() => setModalPagosOpen(false)}
        title={`Historial de Pagos: ${kioscoHistorial?.nombre_kiosco || ''}`}
      >
        <div className="space-y-4">
          {cargandoHistorial ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <div className="animate-spin h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-xs">Buscando pagos registrados...</p>
            </div>
          ) : historialPagos.length === 0 ? (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
              No hay cobros registrados aún para esta suscripción.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase">
                  <tr>
                    <th className="py-2 px-3">Fecha</th>
                    <th className="py-2 px-3">Monto</th>
                    <th className="py-2 px-3">Medio</th>
                    <th className="py-2 px-3">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {historialPagos.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 px-3 font-medium">{p.fecha_pago}</td>
                      <td className="py-2 px-3 font-bold text-emerald-600 dark:text-emerald-400">
                        {formatPrecio(p.monto)}
                      </td>
                      <td className="py-2 px-3">{p.medio_pago || '—'}</td>
                      <td className="py-2 px-3 text-gray-500">{p.notas || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end pt-3 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalPagosOpen(false)}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
