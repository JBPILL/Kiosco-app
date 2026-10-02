import { useState, useEffect, useMemo } from 'react'
import { useAdminStore } from '../stores/adminStore'
import { useConfigAdminStore, formatearLinkWhatsApp } from '../stores/configAdminStore'
import { useSoporteStore, type TicketSoporte, type EstadoTicket, type TipoTicket } from '../stores/soporteStore'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import type { KioscoAdminView, PagoSuscripcion, RubroComercio } from '../types/database'
import { formatPrecio } from '../lib/utils'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { supabase } from '../lib/supabase'
import { ReportesSuperAdminTab } from '../components/admin/ReportesSuperAdminTab'
import toast from 'react-hot-toast'

export function SuperAdminPage() {
  const {
    kioscos,
    planes,
    cargando,
    cargandoAccion,
    cargarDatosAdmin,
    renovarSuscripcion,
    cambiarEstadoKiosco,
    editarKiosco,
    eliminarKiosco,
    crearKioscoCliente,
    obtenerHistorialPagos,
    actualizarPrecioPlan,
    crearPlan,
    eliminarPlan,
  } = useAdminStore()

  // Configuración de cobro y soporte centralizado
  const {
    config: configAdmin,
    cargarConfig: cargarConfigAdmin,
    guardarConfig: guardarConfigAdmin,
    guardando: guardandoConfigAdmin,
  } = useConfigAdminStore()

  // Modal Configuración de Cobro y Soporte
  const [modalCobroOpen, setModalCobroOpen] = useState(false)
  const [cfgWhatsApp, setCfgWhatsApp] = useState('')
  const [cfgAliasMp, setCfgAliasMp] = useState('')
  const [cfgCbuBanco, setCfgCbuBanco] = useState('')
  const [cfgTitularCuenta, setCfgTitularCuenta] = useState('')
  const [cfgBancoNombre, setCfgBancoNombre] = useState('')

  // Filtros y búsqueda
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<
    'TODOS' | 'ACTIVOS' | 'POR_VENCER' | 'VENCIDOS' | 'SUSPENDIDOS'
  >('TODOS')

  // Modal Nuevo Kiosco
  const [modalNuevoOpen, setModalNuevoOpen] = useState(false)
  const [nuevoNombreKiosco, setNuevoNombreKiosco] = useState('')
  const [nuevoRubro, setNuevoRubro] = useState<RubroComercio>('KIOSCO')
  const [nuevaDireccion, setNuevaDireccion] = useState('')
  const [nuevoTelefono, setNuevoTelefono] = useState('')
  const [nuevoNombreDueno, setNuevoNombreDueno] = useState('')
  const [nuevoEmailDueno, setNuevoEmailDueno] = useState('')
  const [nuevoPasswordDueno, setNuevoPasswordDueno] = useState('')
  const [nuevoPlanId, setNuevoPlanId] = useState('')
  const [nuevosDiasValidez, setNuevosDiasValidez] = useState(30)

  // Modal Editar Kiosco
  const [modalEditarOpen, setModalEditarOpen] = useState(false)
  const [kioscoParaEditar, setKioscoParaEditar] = useState<KioscoAdminView | null>(null)
  const [editNombreKiosco, setEditNombreKiosco] = useState('')
  const [editRubro, setEditRubro] = useState<RubroComercio>('KIOSCO')
  const [editDireccion, setEditDireccion] = useState('')
  const [editTelefono, setEditTelefono] = useState('')
  const [editEstadoKiosco, setEditEstadoKiosco] = useState<'ACTIVO' | 'SOLO_LECTURA' | 'SUSPENDIDO'>('ACTIVO')
  const [editNombreDueno, setEditNombreDueno] = useState('')
  const [editEmailDueno, setEditEmailDueno] = useState('')
  const [editPlanId, setEditPlanId] = useState('')
  const [editFechaVencimiento, setEditFechaVencimiento] = useState('')

  // Modal Eliminar Kiosco
  const [modalEliminarOpen, setModalEliminarOpen] = useState(false)
  const [kioscoParaEliminar, setKioscoParaEliminar] = useState<KioscoAdminView | null>(null)
  const [textoConfirmacion, setTextoConfirmacion] = useState('')

  // Modal Planes y Precios (Ajuste por Inflación)
  const [modalPlanesOpen, setModalPlanesOpen] = useState(false)
  const [preciosEditados, setPreciosEditados] = useState<Record<string, number>>({})
  const [creandoNuevoPlan, setCreandoNuevoPlan] = useState(false)
  const [nuevoPlanNombre, setNuevoPlanNombre] = useState('')
  const [nuevoPlanPrecio, setNuevoPlanPrecio] = useState(35000)
  const [nuevoPlanDesc, setNuevoPlanDesc] = useState('')

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

  // Navegación principal de pestañas (Kioscos vs Bandeja de Soporte vs Rendimientos)
  const [pestanaActiva, setPestanaActiva] = useState<'KIOSCOS' | 'SOPORTE' | 'REPORTES'>('KIOSCOS')

  // Store de Soporte Centralizado
  const {
    tickets,
    cargando: cargandoTickets,
    tablaExiste: tablaSoporteExiste,
    cargarTicketsAdmin,
    actualizarEstadoTicket,
    eliminarTicket,
  } = useSoporteStore()

  // Filtros y modales de Bandeja de Soporte
  const [busquedaTicket, setBusquedaTicket] = useState('')
  const [filtroEstadoTicket, setFiltroEstadoTicket] = useState<'TODOS' | EstadoTicket>('TODOS')
  const [filtroTipoTicket, setFiltroTipoTicket] = useState<'TODOS' | TipoTicket>('TODOS')
  const [expandedDiagIds, setExpandedDiagIds] = useState<Record<string, boolean>>({})

  // Modal para responder / anotar ticket
  const [modalRespuestaOpen, setModalRespuestaOpen] = useState(false)
  const [ticketParaResponder, setTicketParaResponder] = useState<TicketSoporte | null>(null)
  const [textoRespuesta, setTextoRespuesta] = useState('')
  const [nuevoEstadoRespuesta, setNuevoEstadoRespuesta] = useState<EstadoTicket>('RESUELTO')

  // Diagnóstico del Sistema para SuperAdmin
  const isOnline = useOnlineStatus()
  const [comprobandoNube, setComprobandoNube] = useState(false)
  const [estadoNube, setEstadoNube] = useState<'CONECTADO' | 'DESCONECTADO' | 'VERIFICANDO'>('CONECTADO')
  const [latenciaNube, setLatenciaNube] = useState<number | null>(null)

  const verificarConexionNube = async () => {
    setComprobandoNube(true)
    setEstadoNube('VERIFICANDO')
    try {
      const inicio = Date.now()
      const { error } = await supabase.from('planes').select('id').limit(1)
      const latencia = Date.now() - inicio
      if (error) throw error
      setEstadoNube('CONECTADO')
      setLatenciaNube(latencia)
      toast.success(`Conexión con Supabase verificada (${latencia} ms)`)
    } catch {
      setEstadoNube('DESCONECTADO')
      setLatenciaNube(null)
      toast.error('No se pudo conectar con la base de datos en la nube')
    } finally {
      setComprobandoNube(false)
    }
  }

  // Filtrar planes comerciales (excluye fila interna de configuración de sistema y planes dados de baja)
  const planesComerciales = useMemo(
    () => planes.filter((p) => p.nombre !== '__CONFIG_SISTEMA__' && p.activo !== false),
    [planes]
  )

  // Cargar datos al montar y suscribir a eventos en tiempo real
  useEffect(() => {
    cargarDatosAdmin()
    cargarConfigAdmin()
    cargarTicketsAdmin()
    const desuscribirRealtime = useSoporteStore.getState().suscribirRealtimeTickets?.()
    return () => {
      desuscribirRealtime?.()
    }
  }, [cargarDatosAdmin, cargarConfigAdmin, cargarTicketsAdmin])

  // Establecer plan por defecto al abrir modal nuevo
  useEffect(() => {
    if (planesComerciales.length > 0 && !nuevoPlanId) {
      setNuevoPlanId(planesComerciales[0].id)
    }
  }, [planesComerciales, nuevoPlanId])

  const abrirModalCobro = () => {
    setCfgWhatsApp(configAdmin.whatsapp_soporte || '')
    setCfgAliasMp(configAdmin.alias_mp || '')
    setCfgCbuBanco(configAdmin.cbu_banco || '')
    setCfgTitularCuenta(configAdmin.titular_cuenta || '')
    setCfgBancoNombre(configAdmin.banco_nombre || '')
    setModalCobroOpen(true)
  }

  const handleGuardarConfigCobro = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await guardarConfigAdmin({
      whatsapp_soporte: cfgWhatsApp.trim(),
      alias_mp: cfgAliasMp.trim(),
      cbu_banco: cfgCbuBanco.trim(),
      titular_cuenta: cfgTitularCuenta.trim(),
      banco_nombre: cfgBancoNombre.trim(),
    })
    if (ok) {
      setModalCobroOpen(false)
    }
  }

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
    if (!kioscoParaRenovar || cargandoAccion) return

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
    if (cargandoAccion || !nuevoNombreKiosco.trim() || !nuevoNombreDueno.trim() || !nuevoEmailDueno.trim() || !nuevoPasswordDueno.trim()) {
      return
    }

    const ok = await crearKioscoCliente({
      nombreKiosco: nuevoNombreKiosco.trim(),
      direccion: nuevaDireccion.trim() || undefined,
      telefono: nuevoTelefono.trim() || undefined,
      rubro: nuevoRubro,
      nombreDueno: nuevoNombreDueno.trim(),
      emailDueno: nuevoEmailDueno.trim(),
      passwordDueno: nuevoPasswordDueno.trim(),
      planId: nuevoPlanId,
      diasValidez: Number(nuevosDiasValidez) || 30,
    })

    if (ok) {
      setModalNuevoOpen(false)
      setNuevoNombreKiosco('')
      setNuevoRubro('KIOSCO')
      setNuevaDireccion('')
      setNuevoTelefono('')
      setNuevoNombreDueno('')
      setNuevoEmailDueno('')
      setNuevoPasswordDueno('')
      setNuevosDiasValidez(30)
    }
  }

  const abrirModalEditar = (k: KioscoAdminView) => {
    setKioscoParaEditar(k)
    setEditNombreKiosco(k.nombre_kiosco || '')
    setEditRubro(k.rubro || 'KIOSCO')
    setEditDireccion(k.direccion || '')
    setEditTelefono(k.telefono_kiosco || '')
    setEditEstadoKiosco(k.estado_kiosco)
    setEditNombreDueno(k.nombre_dueno || '')
    setEditEmailDueno(k.email_dueno || '')
    setEditPlanId(k.plan_id || (planes[0]?.id || ''))
    setEditFechaVencimiento(k.fecha_vencimiento || '')
    setModalEditarOpen(true)
  }

  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!kioscoParaEditar || cargandoAccion || !editNombreKiosco.trim()) return

    const ok = await editarKiosco(kioscoParaEditar.kiosco_id, {
      nombreKiosco: editNombreKiosco.trim(),
      direccion: editDireccion.trim() || undefined,
      telefono: editTelefono.trim() || undefined,
      rubro: editRubro,
      estadoKiosco: editEstadoKiosco,
      duenoUsuarioId: kioscoParaEditar.dueno_usuario_id,
      nombreDueno: editNombreDueno.trim() || undefined,
      emailDueno: editEmailDueno.trim() || undefined,
      suscripcionId: kioscoParaEditar.suscripcion_id,
      planId: editPlanId || undefined,
      fechaVencimiento: editFechaVencimiento || undefined,
    })

    if (ok) {
      setModalEditarOpen(false)
      setKioscoParaEditar(null)
    }
  }

  const abrirModalEliminar = (k: KioscoAdminView) => {
    setKioscoParaEliminar(k)
    setTextoConfirmacion('')
    setModalEliminarOpen(true)
  }

  const handleConfirmarEliminacion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!kioscoParaEliminar || cargandoAccion) return
    const esperado = 'ELIMINAR'
    if (
      textoConfirmacion.trim().toUpperCase() !== esperado &&
      textoConfirmacion.trim().toLowerCase() !== kioscoParaEliminar.nombre_kiosco.toLowerCase()
    ) {
      return
    }

    const ok = await eliminarKiosco(kioscoParaEliminar.kiosco_id)
    if (ok) {
      setModalEliminarOpen(false)
      setKioscoParaEliminar(null)
      setTextoConfirmacion('')
    }
  }

  const abrirModalPlanes = () => {
    const map: Record<string, number> = {}
    planesComerciales.forEach((p) => {
      map[p.id] = p.precio_mensual
    })
    setPreciosEditados(map)
    setCreandoNuevoPlan(false)
    setNuevoPlanNombre('')
    setNuevoPlanPrecio(35000)
    setNuevoPlanDesc('')
    setModalPlanesOpen(true)
  }

  const handleGuardarPrecioPlan = async (planId: string) => {
    const precio = preciosEditados[planId]
    if (precio === undefined || precio < 0) return
    await actualizarPrecioPlan(planId, precio)
  }

  const handleCrearNuevoPlan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevoPlanNombre.trim() || nuevoPlanPrecio < 0) return
    const ok = await crearPlan(
      nuevoPlanNombre.trim(),
      nuevoPlanPrecio,
      10,
      nuevoPlanDesc.trim() || undefined
    )
    if (ok) {
      setCreandoNuevoPlan(false)
      setNuevoPlanNombre('')
      setNuevoPlanPrecio(35000)
      setNuevoPlanDesc('')
    }
  }

  const handleEliminarPlan = async (plan: (typeof planesComerciales)[0], kioscosEnPlan: number) => {
    if (kioscosEnPlan > 0) {
      toast.error(
        `No se puede eliminar el plan "${plan.nombre}": tiene ${kioscosEnPlan} kiosco(s) asignado(s). Reasigna los comercios a otro plan antes de darlo de baja.`
      )
      return
    }

    const confirmar = window.confirm(
      `¿Deseás eliminar el plan "${plan.nombre}"? Esta acción lo quitará de la lista de planes disponibles.`
    )
    if (!confirmar) return

    await eliminarPlan(plan.id)
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

  // Métricas de Bandeja de Soporte
  const ticketsPendientesCount = useMemo(
    () => tickets.filter((t) => t.estado === 'PENDIENTE').length,
    [tickets]
  )

  const ticketsMetricas = useMemo(() => {
    return {
      total: tickets.length,
      pendientes: tickets.filter((t) => t.estado === 'PENDIENTE').length,
      enProceso: tickets.filter((t) => t.estado === 'EN_PROCESO').length,
      resueltos: tickets.filter((t) => t.estado === 'RESUELTO').length,
      errores: tickets.filter((t) => t.tipo === 'ERROR').length,
    }
  }, [tickets])

  const ticketsFiltrados = useMemo(() => {
    return tickets.filter((t) => {
      if (filtroEstadoTicket !== 'TODOS' && t.estado !== filtroEstadoTicket) return false
      if (filtroTipoTicket !== 'TODOS' && t.tipo !== filtroTipoTicket) return false
      if (busquedaTicket.trim()) {
        const q = busquedaTicket.toLowerCase()
        const matchKiosco = (t.kiosco_nombre || '').toLowerCase().includes(q)
        const matchUsuario = (t.usuario_nombre || '').toLowerCase().includes(q)
        const matchMensaje = (t.mensaje || '').toLowerCase().includes(q)
        const matchModulo = (t.modulo || '').toLowerCase().includes(q)
        if (!matchKiosco && !matchUsuario && !matchMensaje && !matchModulo) return false
      }
      return true
    })
  }, [tickets, filtroEstadoTicket, filtroTipoTicket, busquedaTicket])

  const toggleDiag = (id: string) => {
    setExpandedDiagIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const abrirModalRespuesta = (ticket: TicketSoporte) => {
    setTicketParaResponder(ticket)
    setTextoRespuesta(ticket.respuesta_admin || '')
    setNuevoEstadoRespuesta(ticket.estado === 'PENDIENTE' ? 'RESUELTO' : ticket.estado)
    setModalRespuestaOpen(true)
  }

  const handleGuardarRespuesta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ticketParaResponder) return
    await actualizarEstadoTicket(ticketParaResponder.id, nuevoEstadoRespuesta, textoRespuesta.trim())
    setModalRespuestaOpen(false)
    setTicketParaResponder(null)
    setTextoRespuesta('')
  }

  const generarLinkWhatsAppRespuesta = (ticket: TicketSoporte, mensajePersonalizado?: string) => {
    const rawTel = (ticket.usuario_telefono || '').replace(/[^0-9]/g, '')
    let tel = rawTel
    if (!tel && ticket.kiosco_id) {
      const matchKiosco = kioscos.find((k) => k.kiosco_id === ticket.kiosco_id)
      if (matchKiosco?.telefono_kiosco) {
        tel = matchKiosco.telefono_kiosco.replace(/[^0-9]/g, '')
      }
    }

    if (tel.length === 10) {
      tel = `549${tel}`
    } else if (tel.length === 11 && tel.startsWith('0')) {
      tel = `549${tel.slice(1)}`
    }

    let texto = `Hola ${ticket.usuario_nombre || 'Estimado'}! Te escribimos de Soporte KioskoPOS por tu consulta de "${ticket.kiosco_nombre}" sobre ${ticket.modulo}.`
    if (mensajePersonalizado) {
      texto += `\n\n${mensajePersonalizado}`
    } else {
      texto += `\n\n¿Cómo podemos ayudarte? Ya estamos revisando tu caso.`
    }

    if (tel) {
      return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
    }
    return `https://web.whatsapp.com/send?text=${encodeURIComponent(texto)}`
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
            onClick={abrirModalPlanes}
            className="text-sm"
          >
            Planes y Precios
          </Button>
          <button
            type="button"
            onClick={() => {
              cargarDatosAdmin()
              cargarTicketsAdmin()
            }}
            disabled={cargando || cargandoTickets}
            title="Actualizar datos y tickets"
            className="inline-flex items-center justify-center p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer shadow-2xs shrink-0"
          >
            <svg
              className={`w-4 h-4 ${cargando || cargandoTickets ? 'animate-spin text-indigo-600' : ''}`}
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
          <Button
            variant="primary"
            onClick={() => setModalNuevoOpen(true)}
            className="text-sm shadow-sm"
          >
            + Nuevo Kiosco Cliente
          </Button>
        </div>
      </div>

      {/* Tarjeta de Diagnóstico del Sistema (Health Check SuperAdmin) */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
              Diagnóstico del Sistema
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Estado en tiempo real de la infraestructura, base de datos y conectividad
            </p>
          </div>
          <button
            type="button"
            onClick={verificarConexionNube}
            disabled={comprobandoNube}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold transition-colors flex-shrink-0"
          >
            {comprobandoNube ? 'Probando...' : 'Comprobar'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* 1. Internet */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/80 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span className="font-semibold text-gray-800 dark:text-gray-200">Conexión a Internet</span>
            </div>
            <span
              className={`font-bold px-2 py-0.5 rounded-md ${
                isOnline
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                  : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
              }`}
            >
              {isOnline ? 'En línea' : 'Sin señal'}
            </span>
          </div>

          {/* 2. Servidor Supabase */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/80 shadow-2xs">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  estadoNube === 'CONECTADO'
                    ? 'bg-emerald-500'
                    : estadoNube === 'VERIFICANDO'
                    ? 'bg-amber-500 animate-ping'
                    : 'bg-red-500'
                }`}
              />
              <span className="font-semibold text-gray-800 dark:text-gray-200">Servidor Supabase</span>
            </div>
            <span className="font-bold text-gray-700 dark:text-gray-300 font-mono text-xs">
              {estadoNube === 'CONECTADO'
                ? latenciaNube !== null
                  ? `Sincronizado (${latenciaNube} ms)`
                  : 'Sincronizado'
                : estadoNube === 'VERIFICANDO'
                ? 'Chequeando...'
                : 'Error de enlace'}
            </span>
          </div>

          {/* 3. Base de Datos / Tickets */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/80 shadow-2xs">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  tablaSoporteExiste ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span className="font-semibold text-gray-800 dark:text-gray-200">Tabla de Soporte</span>
            </div>
            <span
              className={`font-bold px-2 py-0.5 rounded-md ${
                tablaSoporteExiste
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
              }`}
            >
              {tablaSoporteExiste ? 'Nube Conectada' : 'Caché Local'}
            </span>
          </div>

          {/* 4. Modo Offline / Almacenamiento Local */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/80 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="font-semibold text-gray-800 dark:text-gray-200">Modo Offline Local</span>
            </div>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              Listo para operar
            </span>
          </div>
        </div>
      </div>

      {/* Selector de Pestañas Principales (Kioscos vs Bandeja de Soporte) */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        <button
          onClick={() => setPestanaActiva('KIOSCOS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
            pestanaActiva === 'KIOSCOS'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span>Kioscos y Alquileres</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              pestanaActiva === 'KIOSCOS'
                ? 'bg-white/20 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            {kioscos.length}
          </span>
        </button>

        <button
          onClick={() => setPestanaActiva('SOPORTE')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all relative ${
            pestanaActiva === 'SOPORTE'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span>Bandeja de Soporte</span>
          {ticketsPendientesCount > 0 ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white font-black animate-pulse">
              {ticketsPendientesCount} pendiente{ticketsPendientesCount > 1 ? 's' : ''}
            </span>
          ) : (
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                pestanaActiva === 'SOPORTE'
                  ? 'bg-white/20 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              {tickets.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setPestanaActiva('REPORTES')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all relative ${
            pestanaActiva === 'REPORTES'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span>Rendimientos y Reportes</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              pestanaActiva === 'REPORTES'
                ? 'bg-white/20 text-white'
                : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            SaaS
          </span>
        </button>
      </div>

      {pestanaActiva === 'KIOSCOS' && (
        <>
          {/* Tarjeta de Cobro y Soporte para Kioscos */}
      <div className="bg-gradient-to-r from-indigo-50/70 via-purple-50/40 to-white dark:from-indigo-950/30 dark:via-gray-800 dark:to-gray-800 p-4 sm:p-5 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/60 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/50 px-2 py-0.5 rounded-md">
              Datos de Cobro y Soporte para Kioscos
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Visible para los dueños en cuentas vencidas, bloqueo por suscripción y renovación
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 text-xs">
            <div className="p-2.5 rounded-xl bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700">
              <span className="text-gray-500 dark:text-gray-400 block font-medium">WhatsApp Soporte:</span>
              {configAdmin.whatsapp_soporte ? (
                <a
                  href={formatearLinkWhatsApp(configAdmin.whatsapp_soporte, 'Prueba de enlace desde SuperAdmin')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 mt-0.5"
                >
                  +{configAdmin.whatsapp_soporte.replace(/\D/g, '')}
                  <span className="text-[10px] text-gray-400 font-normal">(probar)</span>
                </a>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 font-semibold mt-0.5 block">Sin vincular</span>
              )}
            </div>

            <div className="p-2.5 rounded-xl bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700">
              <span className="text-gray-500 dark:text-gray-400 block font-medium">Alias Mercado Pago:</span>
              <span className="font-bold text-gray-800 dark:text-gray-200 mt-0.5 block break-all select-all">
                {configAdmin.alias_mp || <span className="text-amber-600 dark:text-amber-400 font-normal">Sin alias</span>}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700">
              <span className="text-gray-500 dark:text-gray-400 block font-medium">CBU / CVU Bancario:</span>
              <span className="font-bold text-gray-800 dark:text-gray-200 mt-0.5 block break-all font-mono select-all">
                {configAdmin.cbu_banco || <span className="text-amber-600 dark:text-amber-400 font-normal">Sin CBU</span>}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700">
              <span className="text-gray-500 dark:text-gray-400 block font-medium">Titular de Cuenta:</span>
              <span className="font-bold text-gray-800 dark:text-gray-200 mt-0.5 block break-words">
                {configAdmin.titular_cuenta || <span className="text-amber-600 dark:text-amber-400 font-normal">Sin titular</span>}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
          <Button
            variant="secondary"
            onClick={abrirModalCobro}
            className="text-xs font-bold px-3.5 py-2 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 shadow-2xs"
          >
            Modificar Datos
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
                      {k.rubro === 'FOTOCOPIADORA_LIBRERIA' ? (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-bold">
                          Librería / Copiado
                        </span>
                      ) : k.rubro === 'GENERAL' ? (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-800 text-purple-800 dark:text-purple-300 font-bold">
                          Comercio General
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-300 font-bold">
                          Kiosco / Minimercado
                        </span>
                      )}
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

                    {/* Botón Editar */}
                    <button
                      type="button"
                      onClick={() => abrirModalEditar(k)}
                      disabled={cargandoAccion}
                      className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                    >
                      Editar
                    </button>

                    {/* Botón Eliminar */}
                    <button
                      type="button"
                      onClick={() => abrirModalEliminar(k)}
                      disabled={cargandoAccion}
                      className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 dark:text-red-300 bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
        </>
      )}

      {pestanaActiva === 'SOPORTE' && (
        /* BANDEJA DE SOPORTE */
        <div className="space-y-6">
          {/* Tarjetas KPI de Soporte */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Total Consultas
              </span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {ticketsMetricas.total}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">recibidas</span>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                Pendientes
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {ticketsMetricas.pendientes}
                </span>
                {ticketsMetricas.pendientes > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 font-bold text-amber-700 dark:text-amber-300">
                    Por atender
                  </span>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                En Revisión
              </span>
              <div className="mt-2">
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {ticketsMetricas.enProceso}
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                Resueltos
              </span>
              <div className="mt-2">
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {ticketsMetricas.resueltos}
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs col-span-2 lg:col-span-1">
              <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
                Fallas o Errores
              </span>
              <div className="mt-2">
                <span className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {ticketsMetricas.errores}
                </span>
              </div>
            </div>
          </div>

          {/* Barra de Filtros y Búsqueda */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Filtro de Estado */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              {(['TODOS', 'PENDIENTE', 'EN_PROCESO', 'RESUELTO'] as const).map((est) => (
                <button
                  key={est}
                  onClick={() => setFiltroEstadoTicket(est)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    filtroEstadoTicket === est
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {est === 'TODOS' ? 'Todos los Estados' : est === 'EN_PROCESO' ? 'En Revisión' : est}
                </button>
              ))}
            </div>

            {/* Filtro de Tipo y Búsqueda */}
            <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
              <select
                value={filtroTipoTicket}
                onChange={(e) => setFiltroTipoTicket(e.target.value as typeof filtroTipoTicket)}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-xs font-medium focus:outline-hidden"
              >
                <option value="TODOS">Todos los tipos</option>
                <option value="ERROR">Errores técnicos</option>
                <option value="CONSULTA">Consultas operativas</option>
                <option value="SUGERENCIA">Sugerencias</option>
                <option value="FACTURACION">Abono / Facturación</option>
              </select>

              <input
                type="text"
                placeholder="Buscar por local, usuario, mensaje..."
                value={busquedaTicket}
                onChange={(e) => setBusquedaTicket(e.target.value)}
                className="px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 w-full md:w-64"
              />
            </div>
          </div>

          {/* Listado de Tarjetas de Tickets */}
          <div className="space-y-4">
            {ticketsFiltrados.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  No se encontraron consultas
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                  {busquedaTicket || filtroEstadoTicket !== 'TODOS' || filtroTipoTicket !== 'TODOS'
                    ? 'No hay registros que coincidan con los filtros y búsqueda aplicados.'
                    : 'Aún no se han recibido consultas o reportes de errores de ningún kiosco.'}
                </p>
              </div>
            ) : (
              ticketsFiltrados.map((ticket) => {
                const diagExpanded = expandedDiagIds[ticket.id]
                const waLink = generarLinkWhatsAppRespuesta(ticket)

                return (
                  <div
                    key={ticket.id}
                    className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-4 transition-all hover:border-gray-300 dark:hover:border-gray-600"
                  >
                    {/* Header del Ticket */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-700/80">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-bold text-base text-gray-900 dark:text-gray-100">
                          {ticket.kiosco_nombre || 'Kiosco sin nombre'}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium">
                          {ticket.usuario_nombre} ({ticket.usuario_rol || 'Usuario'})
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                            ticket.tipo === 'ERROR'
                              ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                              : ticket.tipo === 'FACTURACION'
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                          }`}
                        >
                          {ticket.tipo}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5 flex-wrap self-start sm:self-auto">
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(ticket.fecha_creacion).toLocaleString('es-AR', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            ticket.estado === 'RESUELTO'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              : ticket.estado === 'EN_PROCESO'
                              ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          }`}
                        >
                          {ticket.estado === 'RESUELTO'
                            ? 'RESUELTO'
                            : ticket.estado === 'EN_PROCESO'
                            ? 'EN REVISIÓN'
                            : 'PENDIENTE'}
                        </span>
                      </div>
                    </div>

                    {/* Cuerpo del Ticket */}
                    <div className="space-y-3 text-xs sm:text-sm">
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span className="text-gray-400 dark:text-gray-500 font-medium">Módulo:</span>
                        <span className="font-semibold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50">
                          {ticket.modulo}
                        </span>
                        {ticket.usuario_telefono && (
                          <span className="text-gray-500 dark:text-gray-400 ml-1">
                            Tel: <strong>{ticket.usuario_telefono}</strong>
                          </span>
                        )}
                        {ticket.usuario_email && (
                          <span className="text-gray-500 dark:text-gray-400 ml-1">
                            Email: <strong>{ticket.usuario_email}</strong>
                          </span>
                        )}
                      </div>

                      {/* Mensaje */}
                      <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200/80 dark:border-gray-700/80 text-gray-900 dark:text-gray-100 whitespace-pre-line leading-relaxed">
                        {ticket.mensaje}
                      </div>

                      {/* Datos de Diagnóstico / Telemetría (si existen) */}
                      {ticket.datos_diagnostico && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => toggleDiag(ticket.id)}
                            className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1"
                          >
                            <span>{diagExpanded ? 'Ocultar' : 'Ver'} datos de diagnóstico y dispositivo</span>
                          </button>

                          {diagExpanded && (
                            <div className="mt-2 p-3 rounded-xl bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-gray-600 dark:text-gray-400">
                              <div>
                                <span className="font-semibold block text-gray-800 dark:text-gray-200">Conexión:</span>
                                <span>{String(ticket.datos_diagnostico.conexion || 'Desconocida')}</span>
                              </div>
                              <div>
                                <span className="font-semibold block text-gray-800 dark:text-gray-200">Ticketera:</span>
                                <span>{String(ticket.datos_diagnostico.ticketera || 'Estándar')}</span>
                              </div>
                              <div>
                                <span className="font-semibold block text-gray-800 dark:text-gray-200">Resolución:</span>
                                <span>{String(ticket.datos_diagnostico.pantalla || 'Desconocida')}</span>
                              </div>
                              <div className="sm:col-span-2 lg:col-span-4 truncate">
                                <span className="font-semibold block text-gray-800 dark:text-gray-200">Navegador:</span>
                                <span className="font-mono text-[11px]">{String(ticket.datos_diagnostico.navegador || 'Desconocido')}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Respuesta previa del Admin */}
                      {ticket.respuesta_admin && (
                        <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs">
                          <span className="font-bold text-emerald-800 dark:text-emerald-300 block mb-1">
                            Respuesta o Nota Interna del Administrador:
                          </span>
                          <p className="text-gray-800 dark:text-gray-200 whitespace-pre-line">
                            {ticket.respuesta_admin}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Acciones del Ticket */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-gray-700/80">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Botón WhatsApp */}
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-xs transition-colors active:scale-95"
                        >
                          <span>Responder por WhatsApp</span>
                        </a>

                        {/* Botón Escribir Respuesta / Nota */}
                        <button
                          type="button"
                          onClick={() => abrirModalRespuesta(ticket)}
                          className="px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-semibold text-xs transition-colors"
                        >
                          {ticket.respuesta_admin ? 'Editar Respuesta' : '+ Agregar Respuesta'}
                        </button>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                        {/* Cambiar Estado Rápido */}
                        {ticket.estado === 'PENDIENTE' && (
                          <button
                            type="button"
                            onClick={() => actualizarEstadoTicket(ticket.id, 'EN_PROCESO')}
                            className="px-3 py-2 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition-colors"
                          >
                            Poner en Revisión
                          </button>
                        )}

                        {ticket.estado !== 'RESUELTO' && (
                          <button
                            type="button"
                            onClick={() => actualizarEstadoTicket(ticket.id, 'RESUELTO')}
                            className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-colors"
                          >
                            Marcar Resuelto
                          </button>
                        )}

                        {ticket.estado === 'RESUELTO' && (
                          <button
                            type="button"
                            onClick={() => actualizarEstadoTicket(ticket.id, 'PENDIENTE')}
                            className="px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-300 transition-colors"
                          >
                            Reabrir Ticket
                          </button>
                        )}

                        {/* Eliminar Ticket */}
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`¿Eliminar la consulta de "${ticket.kiosco_nombre}"?`)) {
                              eliminarTicket(ticket.id)
                            }
                          }}
                          className="px-2.5 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {pestanaActiva === 'REPORTES' && <ReportesSuperAdminTab />}

      {/* MODAL NUEVO KIOSCO CLIENTE */}
      <Modal
        isOpen={modalNuevoOpen}
        onClose={() => setModalNuevoOpen(false)}
        title="Dar de Alta Nuevo Kiosco Cliente"
        size="xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
              Crea el comercio y la cuenta de acceso inicial
            </span>
            <div className="flex items-center gap-2.5 ml-auto">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModalNuevoOpen(false)}
                disabled={cargandoAccion}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                form="form-nuevo-kiosco"
                disabled={cargandoAccion}
                className="shadow-sm"
              >
                {cargandoAccion ? 'Creando Kiosco...' : 'Crear Kiosco'}
              </Button>
            </div>
          </div>
        }
      >
        <form id="form-nuevo-kiosco" onSubmit={handleCrearNuevoKiosco} className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 shadow-2xs">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-400/10 flex items-center justify-center flex-shrink-0 text-indigo-600 dark:text-indigo-400 mt-0.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="text-xs space-y-0.5">
              <span className="font-bold text-indigo-950 dark:text-indigo-200 block text-xs sm:text-sm">
                Alta de Nuevo Comercio (Tenant)
              </span>
              <p className="text-indigo-800/90 dark:text-indigo-300/80 leading-relaxed text-[11px] sm:text-xs">
                Esta acción crea el nuevo local aislado en la base de datos, registra el usuario con rol de Dueño y activa la suscripción inicial.
              </p>
            </div>
          </div>

          {/* Bloque 1: Datos del Comercio */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 space-y-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300">
                1. Comercio
              </span>
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                Identificación del Local
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Input
                  label="Nombre del Kiosco / Comercio *"
                  placeholder="Ej: Kiosco El Paso o Fotocopiadora Central"
                  value={nuevoNombreKiosco}
                  onChange={(e) => setNuevoNombreKiosco(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Rubro del Comercio *
                </label>
                <select
                  value={nuevoRubro}
                  onChange={(e) => setNuevoRubro(e.target.value as RubroComercio)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-hidden"
                >
                  <option value="KIOSCO">Kiosco / Minimercado / Almacén</option>
                  <option value="FOTOCOPIADORA_LIBRERIA">Fotocopiadora / Librería / Centro de Copiado</option>
                  <option value="GENERAL">Comercio General / Retail</option>
                </select>
              </div>

              <div>
                <Input
                  label="Teléfono / WhatsApp de Contacto"
                  placeholder="Ej: 1123456789"
                  value={nuevoTelefono}
                  onChange={(e) => setNuevoTelefono(e.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <Input
                  label="Dirección del Local"
                  placeholder="Ej: Av. San Martín 1234"
                  value={nuevaDireccion}
                  onChange={(e) => setNuevaDireccion(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Bloque 2: Cuenta del Dueño */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 space-y-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300">
                2. Dueño
              </span>
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                Acceso y Credenciales de Administrador
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  label="Email de Login *"
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
                  placeholder="Mínimo 6 caracteres"
                  value={nuevoPasswordDueno}
                  onChange={(e) => setNuevoPasswordDueno(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Bloque 3: Plan y Validez */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 space-y-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300">
                3. Suscripción
              </span>
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                Plan Asignado y Días Iniciales
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Plan Contratado
                </label>
                <select
                  value={nuevoPlanId}
                  onChange={(e) => setNuevoPlanId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-hidden"
                >
                  {planesComerciales.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} — {formatPrecio(p.precio_mensual)}/mes
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Días Iniciales
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setNuevosDiasValidez(15)}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                        nuevosDiasValidez === 15
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      15d (Prueba)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNuevosDiasValidez(30)}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                        nuevosDiasValidez === 30
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      30d (1 mes)
                    </button>
                  </div>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={nuevosDiasValidez}
                  onChange={(e) => setNuevosDiasValidez(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* MODAL RENOVAR SUSCRIPCIÓN */}
      <Modal
        isOpen={modalRenovarOpen}
        onClose={() => setModalRenovarOpen(false)}
        title="Registrar Cobro y Renovar Alquiler"
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalRenovarOpen(false)}
              disabled={cargandoAccion}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              form="form-renovar-suscripcion"
              disabled={cargandoAccion}
              className="shadow-sm"
            >
              {cargandoAccion ? 'Registrando...' : 'Confirmar Renovación'}
            </Button>
          </div>
        }
      >
        {kioscoParaRenovar && (
          <form id="form-renovar-suscripcion" onSubmit={handleConfirmarRenovacion} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-xs space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                  {kioscoParaRenovar.nombre_kiosco}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-semibold">
                  {kioscoParaRenovar.nombre_plan || 'Plan Activo'}
                </span>
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                <strong>Dueño:</strong> {kioscoParaRenovar.nombre_dueno} ({kioscoParaRenovar.email_dueno})
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                <strong>Vencimiento Actual:</strong> {kioscoParaRenovar.fecha_vencimiento || 'Sin fecha'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Tiempo a Renovar
                </label>
                <select
                  value={mesesRenovacion}
                  onChange={(e) => handleCambiarMeses(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-hidden"
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

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Medio de Pago Utilizado
                </label>
                <select
                  value={medioPagoRenovacion}
                  onChange={(e) => setMedioPagoRenovacion(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-hidden"
                >
                  <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                  <option value="MERCADOPAGO">Mercado Pago</option>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <Input
                  label="Notas o Comprobante (Opcional)"
                  placeholder="Ej: Transferencia recibida vía MP con alias kioscopos"
                  value={notasRenovacion}
                  onChange={(e) => setNotasRenovacion(e.target.value)}
                />
              </div>
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

      {/* MODAL EDITAR KIOSCO */}
      <Modal
        isOpen={modalEditarOpen}
        onClose={() => setModalEditarOpen(false)}
        title={`Modificar Kiosco: ${kioscoParaEditar?.nombre_kiosco || ''}`}
        size="xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
              Modificá parámetros operativos o vencimiento del comercio
            </span>
            <div className="flex items-center gap-2.5 ml-auto">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModalEditarOpen(false)}
                disabled={cargandoAccion}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                form="form-editar-kiosco"
                disabled={cargandoAccion}
                className="shadow-sm"
              >
                {cargandoAccion ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </div>
          </div>
        }
      >
        {kioscoParaEditar && (
          <form id="form-editar-kiosco" onSubmit={handleGuardarEdicion} className="space-y-4">
            {/* Bloque 1: Datos del Local */}
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 space-y-3 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300">
                  Comercio
                </span>
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                  Identificación y Contacto
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Input
                    label="Nombre del Kiosco / Comercio *"
                    value={editNombreKiosco}
                    onChange={(e) => setEditNombreKiosco(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Rubro del Comercio
                  </label>
                  <select
                    value={editRubro}
                    onChange={(e) => setEditRubro(e.target.value as RubroComercio)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-hidden"
                  >
                    <option value="KIOSCO">Kiosco / Minimercado / Almacén</option>
                    <option value="FOTOCOPIADORA_LIBRERIA">Fotocopiadora / Librería / Centro de Copiado</option>
                    <option value="GENERAL">Comercio General / Retail</option>
                  </select>
                </div>

                <div>
                  <Input
                    label="Teléfono / WhatsApp"
                    value={editTelefono}
                    onChange={(e) => setEditTelefono(e.target.value)}
                    placeholder="Ej: 1123456789"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Input
                    label="Dirección del Local"
                    value={editDireccion}
                    onChange={(e) => setEditDireccion(e.target.value)}
                    placeholder="Ej: Av. San Martín 1234"
                  />
                </div>
              </div>
            </div>

            {/* Bloque 2: Cuenta del Dueño */}
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 space-y-3 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300">
                  Dueño
                </span>
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                  Datos de Contacto y Acceso
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Input
                    label="Nombre del Dueño"
                    value={editNombreDueno}
                    onChange={(e) => setEditNombreDueno(e.target.value)}
                  />
                </div>

                <div>
                  <Input
                    label="Email del Dueño"
                    type="email"
                    value={editEmailDueno}
                    onChange={(e) => setEditEmailDueno(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Bloque 3: Estado y Suscripción */}
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 space-y-3 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300">
                  Operación y Suscripción
                </span>
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                  Estado de Servicio y Vencimiento
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Estado Operativo
                  </label>
                  <select
                    value={editEstadoKiosco}
                    onChange={(e) =>
                      setEditEstadoKiosco(
                        e.target.value as 'ACTIVO' | 'SOLO_LECTURA' | 'SUSPENDIDO'
                      )
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-hidden"
                  >
                    <option value="ACTIVO">Activo (Operación normal)</option>
                    <option value="SOLO_LECTURA">Solo Lectura (Ventas pausadas)</option>
                    <option value="SUSPENDIDO">Suspendido (Bloqueo total)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Plan Contratado
                  </label>
                  <select
                    value={editPlanId}
                    onChange={(e) => setEditPlanId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-hidden"
                  >
                    {planesComerciales.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} — {formatPrecio(p.precio_mensual)}/mes
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Input
                    label="Fecha de Vencimiento"
                    type="date"
                    value={editFechaVencimiento}
                    onChange={(e) => setEditFechaVencimiento(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL ELIMINAR KIOSCO CON CONFIRMACIÓN */}
      <Modal
        isOpen={modalEliminarOpen}
        onClose={() => setModalEliminarOpen(false)}
        title="Eliminar Kiosco Definitivamente"
      >
        {kioscoParaEliminar && (
          <form onSubmit={handleConfirmarEliminacion} className="space-y-4">
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs text-red-800 dark:text-red-200 space-y-2">
              <p className="font-bold text-sm">
                Atención: Esta acción es irreversible
              </p>
              <p>
                Estás a punto de eliminar de forma permanente al comercio{' '}
                <strong>"{kioscoParaEliminar.nombre_kiosco}"</strong>.
              </p>
              <p>
                Se borrarán todos sus productos cargados, historial de ventas, movimientos de caja, sesiones, cuentas corrientes de clientes y las credenciales de acceso de sus empleados.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Para confirmar la eliminación, escribí la palabra <strong className="text-red-600 dark:text-red-400">ELIMINAR</strong> o el nombre exacto del comercio:
              </label>
              <Input
                placeholder='Escribí "ELIMINAR"'
                value={textoConfirmacion}
                onChange={(e) => setTextoConfirmacion(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModalEliminarOpen(false)}
                disabled={cargandoAccion}
              >
                Cancelar
              </Button>
              <button
                type="submit"
                disabled={
                  cargandoAccion ||
                  (textoConfirmacion.trim().toUpperCase() !== 'ELIMINAR' &&
                    textoConfirmacion.trim().toLowerCase() !==
                      kioscoParaEliminar.nombre_kiosco.toLowerCase())
                }
                className="px-4 py-2 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-xs transition-colors"
              >
                {cargandoAccion ? 'Eliminando...' : 'Eliminar Kiosco'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL PLANES Y PRECIOS (AJUSTE POR INFLACIÓN) */}
      <Modal
        isOpen={modalPlanesOpen}
        onClose={() => setModalPlanesOpen(false)}
        title="Planes de Alquiler y Precios (Ajuste por Inflación)"
        size="xl"
      >
        <div className="space-y-5">
          <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-xs text-indigo-900 dark:text-indigo-200 space-y-1">
            <p className="font-bold text-sm">Ajuste de Precios del Alquiler</p>
            <p>
              Modificá el valor mensual de alquiler en caso de aumentos por inflación.
            </p>
            <p className="text-gray-600 dark:text-gray-400">
              Al guardar el nuevo monto, se actualizarán en tiempo real la facturación proyectada (MRR), los mensajes de cobro por WhatsApp y las renovaciones de todos los clientes vinculados a ese plan.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Planes Existentes
            </h3>

            {planesComerciales.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">No hay planes configurados.</p>
            ) : (
              <div className="space-y-4">
                {planesComerciales.map((p) => {
                  const kioscosEnPlan = kioscos.filter((k) => k.plan_id === p.id).length
                  const precioActual =
                    preciosEditados[p.id] !== undefined ? preciosEditados[p.id] : p.precio_mensual
                  const tieneCambios = precioActual !== p.precio_mensual && precioActual >= 0

                  return (
                    <div
                      key={p.id}
                      className="p-5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/60 space-y-4"
                    >
                      {/* Cabecera del plan: Nombre, badge de comercios y tarifa mensual actual bien visible */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200/80 dark:border-gray-700/80 pb-3.5">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">
                              {p.nombre}
                            </h4>
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-semibold">
                              {kioscosEnPlan} {kioscosEnPlan === 1 ? 'kiosco activo' : 'kioscos activos'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleEliminarPlan(p, kioscosEnPlan)}
                              disabled={cargandoAccion}
                              className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                              title={
                                kioscosEnPlan > 0
                                  ? `No se puede eliminar: tiene ${kioscosEnPlan} kiosco(s) asignado(s)`
                                  : `Eliminar plan "${p.nombre}"`
                              }
                            >
                              <svg
                                className="w-4 h-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            </button>
                          </div>
                          {p.descripcion && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {p.descripcion}
                            </p>
                          )}
                        </div>

                        {/* Tarifa actual destacada */}
                        <div className="bg-white dark:bg-gray-900 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-left sm:text-right flex-shrink-0">
                          <span className="block text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">
                            Tarifa mensual actual
                          </span>
                          <div className="flex items-baseline gap-1 sm:justify-end">
                            <span className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">
                              {p.precio_mensual === 0 ? 'Gratis' : formatPrecio(p.precio_mensual)}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                              {p.precio_mensual === 0 ? '(Prueba)' : '/ mes'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Bloque de edición con etiqueta grande, input espacioso y botón visible */}
                      <div className="bg-white dark:bg-gray-900/90 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                          Modificar Monto de Alquiler Mensual ($ ARS)
                        </label>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                          <div className="relative flex-1">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-gray-400 dark:text-gray-500 select-none">
                              $
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="500"
                              value={precioActual}
                              onChange={(e) =>
                                setPreciosEditados((prev) => ({
                                  ...prev,
                                  [p.id]: Number(e.target.value),
                                }))
                              }
                              placeholder="Ej: 55000"
                              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 pl-8 pr-3 py-2.5 text-base font-bold text-gray-900 dark:text-gray-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900 outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>

                          <Button
                            type="button"
                            variant={tieneCambios ? 'primary' : 'secondary'}
                            onClick={() => handleGuardarPrecioPlan(p.id)}
                            disabled={cargandoAccion || !tieneCambios}
                            className="px-5 py-2.5 font-bold text-sm whitespace-nowrap shadow-xs"
                          >
                            {cargandoAccion
                              ? 'Guardando...'
                              : tieneCambios
                              ? 'Guardar Nuevo Precio'
                              : 'Sin cambios'}
                          </Button>
                        </div>

                        {/* Comparación visual cuando el monto cambia */}
                        {tieneCambios && (
                          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 pt-1">
                            El valor pasará de {p.precio_mensual === 0 ? 'Gratis' : formatPrecio(p.precio_mensual)} a {precioActual === 0 ? 'Gratis' : formatPrecio(precioActual)} (Diferencia:{' '}
                            {precioActual > p.precio_mensual ? '+' : ''}
                            {formatPrecio(precioActual - p.precio_mensual)}).
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Sección para crear nuevo plan */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            {!creandoNuevoPlan ? (
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setCreandoNuevoPlan(true)
                    setNuevoPlanNombre('')
                    setNuevoPlanPrecio(35000)
                    setNuevoPlanDesc('')
                  }}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  + Crear un nuevo plan o categoría de alquiler
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreandoNuevoPlan(true)
                    setNuevoPlanNombre('Plan de Prueba (15 días)')
                    setNuevoPlanPrecio(0)
                    setNuevoPlanDesc('Período inicial de prueba gratuito por 15 días sin costo.')
                  }}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
                >
                  + Agregar Plan de Prueba ($0)
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleCrearNuevoPlan}
                className="space-y-3 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-950/20"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wide">
                    Nuevo Plan
                  </h4>
                  <button
                    type="button"
                    onClick={() => setCreandoNuevoPlan(false)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Nombre del Plan *
                    </label>
                    <Input
                      placeholder="Ej: Kiosco Mini o Supermercado"
                      value={nuevoPlanNombre}
                      onChange={(e) => setNuevoPlanNombre(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Precio Mensual ($) *
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="500"
                      value={nuevoPlanPrecio}
                      onChange={(e) => setNuevoPlanPrecio(Number(e.target.value))}
                      required
                    />
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 block">
                      Podés ingresar 0 para crear un plan o período de prueba gratuito.
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Descripción (opcional)
                  </label>
                  <Input
                    placeholder="Ej: Plan para sucursales con hasta 5 cajas"
                    value={nuevoPlanDesc}
                    onChange={(e) => setNuevoPlanDesc(e.target.value)}
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={cargandoAccion || !nuevoPlanNombre.trim() || nuevoPlanPrecio < 0}
                    className="text-xs"
                  >
                    {cargandoAccion ? 'Creando...' : 'Crear Plan'}
                  </Button>
                </div>
              </form>
            )}
          </div>

          <div className="flex justify-end pt-3 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalPlanesOpen(false)}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL CONFIGURACIÓN DE COBRO Y WHATSAPP */}
      <Modal
        isOpen={modalCobroOpen}
        onClose={() => setModalCobroOpen(false)}
        title="Datos de Cobro y Canales de Soporte"
        size="xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
              Los cambios se sincronizan en tiempo real para todos los clientes
            </span>
            <div className="flex items-center gap-2.5 ml-auto">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModalCobroOpen(false)}
                disabled={guardandoConfigAdmin}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                form="form-config-cobro"
                disabled={guardandoConfigAdmin}
                className="shadow-sm"
              >
                {guardandoConfigAdmin ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </div>
          </div>
        }
      >
        <form id="form-config-cobro" onSubmit={handleGuardarConfigCobro} className="space-y-4">
          {/* Banner Informativo Superior */}
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 shadow-2xs">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-400/10 flex items-center justify-center flex-shrink-0 text-indigo-600 dark:text-indigo-400 mt-0.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-xs space-y-0.5">
              <span className="font-bold text-indigo-950 dark:text-indigo-200 block text-xs sm:text-sm">
                Información oficial visible para clientes
              </span>
              <p className="text-indigo-800/90 dark:text-indigo-300/80 leading-relaxed text-[11px] sm:text-xs">
                Estos datos se transmiten automáticamente a las terminales de los kioscos. Se mostrarán cuando soliciten renovar su servicio, en las pantallas de advertencia o suspensión por mora, y en los botones de contacto directo de soporte.
              </p>
            </div>
          </div>

          {/* Bloque 1: Canal de Comunicación y WhatsApp */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300">
                  Canal Oficial
                </span>
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                  Línea de WhatsApp de Atención y Cobranzas
                </span>
              </div>
              {cfgWhatsApp.trim() && (
                <a
                  href={formatearLinkWhatsApp(cfgWhatsApp, 'Hola! Mensaje de prueba desde el panel de SuperAdmin.')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                >
                  <span>Probar chat de WhatsApp</span>
                  <span className="text-emerald-500 font-bold">↗</span>
                </a>
              )}
            </div>

            <div className="space-y-1">
              <Input
                label="Número de WhatsApp *"
                placeholder="Ej: 3644751119 o 1123456789"
                value={cfgWhatsApp}
                onChange={(e) => setCfgWhatsApp(e.target.value)}
                required
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 px-0.5">
                Ingresá el número con o sin prefijo de país. El sistema lo formateará automáticamente (código internacional +54 9 para Argentina).
              </p>
            </div>
          </div>

          {/* Bloque 2: Cuentas Bancarias y Billeteras Virtuales */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 space-y-3.5 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300">
                Cobranza
              </span>
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                Datos de Cuenta Bancaria / Billeteras para Transferencias
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="sm:col-span-2">
                <Input
                  label="Nombre del Titular de la Cuenta *"
                  placeholder="Ej: Jonathan Valerio Benítez Penayo"
                  value={cfgTitularCuenta}
                  onChange={(e) => setCfgTitularCuenta(e.target.value)}
                  required
                />
              </div>

              <div>
                <Input
                  label="Alias de Cobro (Mercado Pago o Bancario)"
                  placeholder="Ej: jonathan.penayo o kiosko.pos"
                  value={cfgAliasMp}
                  onChange={(e) => setCfgAliasMp(e.target.value)}
                />
              </div>

              <div>
                <Input
                  label="Entidad Bancaria o Billetera (Opcional)"
                  placeholder="Ej: Mercado Pago / Santander / Brubank"
                  value={cfgBancoNombre}
                  onChange={(e) => setCfgBancoNombre(e.target.value)}
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    CBU o CVU Bancario (22 dígitos)
                  </label>
                  {cfgCbuBanco.trim() && (
                    <span
                      className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md ${
                        cfgCbuBanco.replace(/\D/g, '').length === 22
                          ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300'
                      }`}
                    >
                      {cfgCbuBanco.replace(/\D/g, '').length}/22 dígitos
                      {cfgCbuBanco.replace(/\D/g, '').length === 22 ? ' (Válido)' : ' (Incompleto)'}
                    </span>
                  )}
                </div>
                <Input
                  placeholder="Ej: 0000003100021052629320"
                  value={cfgCbuBanco}
                  onChange={(e) => setCfgCbuBanco(e.target.value)}
                  className="font-mono tracking-wider"
                />
              </div>
            </div>
          </div>

          {/* Bloque 3: Vista Previa Digital en Tiempo Real */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Vista previa en tiempo real
              </span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                Así se presenta en la pantalla del kiosco
              </span>
            </div>

            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4 sm:p-5 text-white border border-indigo-500/30 shadow-xl space-y-4">
              <div className="absolute -top-12 -right-12 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-center justify-between border-b border-white/10 pb-3 relative z-10">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[11px] font-bold tracking-wider uppercase text-indigo-300">
                    Datos Oficiales de Cobro
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  KioskoPOS SaaS
                </span>
              </div>

              <div className="relative z-10">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Titular de la Cuenta
                </span>
                <p className="text-base font-bold text-white tracking-tight mt-0.5">
                  {cfgTitularCuenta.trim() || <span className="text-slate-500 italic font-normal">Sin titular especificado</span>}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 relative z-10 text-xs">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-0.5">
                  <span className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wider block">
                    Alias de Cobro
                  </span>
                  <p className="font-mono font-bold text-emerald-400 break-all select-all">
                    {cfgAliasMp.trim() || <span className="text-slate-500 italic font-sans font-normal">Sin alias</span>}
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-0.5">
                  <span className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wider block">
                    Entidad / Billetera
                  </span>
                  <p className="font-medium text-slate-200 truncate">
                    {cfgBancoNombre.trim() || <span className="text-slate-500 italic font-normal">Mercado Pago / Banco</span>}
                  </p>
                </div>

                <div className="sm:col-span-2 p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wider">
                      CBU / CVU Bancario
                    </span>
                    {cfgCbuBanco.replace(/\D/g, '').length === 22 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                        22 dígitos
                      </span>
                    )}
                  </div>
                  <p className="font-mono font-bold text-slate-100 tracking-wider text-xs sm:text-sm break-all select-all">
                    {cfgCbuBanco.trim() || <span className="text-slate-500 italic font-sans font-normal">Sin CBU/CVU cargado</span>}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-white/10 text-xs relative z-10">
                <span className="text-slate-400 font-medium">WhatsApp Oficial:</span>
                {cfgWhatsApp.trim() ? (
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    +{cfgWhatsApp.replace(/\D/g, '')}
                  </span>
                ) : (
                  <span className="text-amber-400 italic">Sin número asignado</span>
                )}
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* MODAL RESPUESTA DE SOPORTE */}
      <Modal
        isOpen={modalRespuestaOpen}
        onClose={() => setModalRespuestaOpen(false)}
        title={`Responder Ticket: ${ticketParaResponder?.kiosco_nombre || ''}`}
        size="lg"
      >
        {ticketParaResponder && (
          <form onSubmit={handleGuardarRespuesta} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  {ticketParaResponder.usuario_nombre} ({ticketParaResponder.usuario_rol})
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 uppercase">
                  {ticketParaResponder.modulo}
                </span>
              </div>
              <p className="text-gray-700 dark:text-gray-300 italic whitespace-pre-line">
                "{ticketParaResponder.mensaje}"
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Respuesta o Solución al Cliente *
              </label>
              <textarea
                rows={4}
                value={textoRespuesta}
                onChange={(e) => setTextoRespuesta(e.target.value)}
                placeholder="Escribí aquí la respuesta o solución que verá el dueño del kiosco..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all resize-y"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Nuevo Estado del Ticket
                </label>
                <select
                  value={nuevoEstadoRespuesta}
                  onChange={(e) => setNuevoEstadoRespuesta(e.target.value as EstadoTicket)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs sm:text-sm font-medium focus:outline-hidden"
                >
                  <option value="RESUELTO">RESUELTO (Cerrado)</option>
                  <option value="EN_PROCESO">EN REVISIÓN (En proceso)</option>
                  <option value="PENDIENTE">PENDIENTE</option>
                </select>
              </div>

              <div className="flex items-end">
                <a
                  href={generarLinkWhatsAppRespuesta(ticketParaResponder, textoRespuesta)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs text-center flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                >
                  <span>Enviar también por WhatsApp</span>
                </a>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModalRespuestaOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="primary">
                Guardar Respuesta y Actualizar Estado
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
