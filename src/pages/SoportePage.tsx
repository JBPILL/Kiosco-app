import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useConfigAdminStore, formatearLinkWhatsApp } from '../stores/configAdminStore'
import { useSoporteStore } from '../stores/soporteStore'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { Button } from '../components/ui/Button'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

type TipoConsulta = 'ERROR' | 'CONSULTA' | 'SUGERENCIA' | 'FACTURACION'

const TIPOS_CONSULTA: { id: TipoConsulta; label: string }[] = [
  { id: 'ERROR', label: 'Error o falla técnica' },
  { id: 'CONSULTA', label: 'Consulta operativa' },
  { id: 'SUGERENCIA', label: 'Sugerencia o mejora' },
  { id: 'FACTURACION', label: 'Abono y Suscripción' },
]

const MODULOS = [
  'Punto de Venta (POS)',
  'Caja y Arqueo',
  'Ticketera Térmica',
  'Stock y Productos',
  'Clientes y Fiados',
  'Proveedores',
  'Reportes y Balance',
  'Facturación AFIP',
  'Otro',
]

const FAQ_ITEMS = [
  {
    pregunta: '¿Qué hago si se corta la conexión a internet?',
    respuesta:
      'KioskoPOS está diseñado con arquitectura Offline-First. Podés seguir cobrando en efectivo normalmente sin interrupciones. En cuanto vuelva la señal, todas las operaciones se sincronizarán solas y en segundo plano con la nube.',
  },
  {
    pregunta: '¿Cómo configuro o pruebo la impresora térmica de tickets?',
    respuesta:
      'En Configuración podés seleccionar el ancho de papel (58mm o 80mm). Al confirmar una venta o un Cierre de Caja, el diálogo de impresión de Windows te permitirá seleccionar tu impresora térmica USB o Bluetooth.',
  },
  {
    pregunta: '¿Cómo registrar un gasto o pago a proveedores desde la caja?',
    respuesta:
      'Ingresá a "Caja y Arqueo" y presioná "+ Movimiento Extra". Seleccioná "Egreso", elegí el motivo (Proveedor, Gasto general, Retiro del dueño) e ingresá el monto para que el arqueo de billetes quede exacto.',
  },
  {
    pregunta: '¿Cómo realizar el Cierre de Caja (Cierre Z) al terminar el turno?',
    respuesta:
      'En "Caja y Arqueo", hacé clic en "Cerrar Caja". Contá los billetes en el cajón y cargá el efectivo real contado. El sistema calculará diferencias y te permitirá imprimir el ticket térmico de Cierre Z.',
  },
  {
    pregunta: '¿Cómo anular una venta equivocada y devolver el stock?',
    respuesta:
      'En "Reportes", buscá la venta en el listado y presioná "Anular". El sistema cancelará la venta, reincorporará automáticamente los productos al stock del local y anulará el cargo en cuenta corriente si fue fiado.',
  },
]

const ATAJOS_TECLADO = [
  { tecla: 'F1', accion: 'Buscar producto en el catálogo' },
  { tecla: 'F2', accion: 'Abrir ventana de Cobro' },
  { tecla: 'F4', accion: 'Agregar ítem libre / varios' },
  { tecla: 'Alt + M', accion: 'Enfocar el menú lateral' },
  { tecla: 'Alt + 1..8', accion: 'Navegación directa de pantallas' },
  { tecla: 'Esc', accion: 'Cerrar ventanas y modales' },
]

export function SoportePage() {
  const { usuario, kiosco } = useAuthStore()
  const { config: configAdmin, cargarConfig } = useConfigAdminStore()
  const {
    tickets,
    cargarTicketsKiosco,
    crearTicket,
    guardando: guardandoTicket,
  } = useSoporteStore()
  const isOnline = useOnlineStatus()

  // Estado del formulario de consulta
  const [tipoConsulta, setTipoConsulta] = useState<TipoConsulta>('ERROR')
  const [moduloSeleccionado, setModuloSeleccionado] = useState(MODULOS[0])
  const [mensaje, setMensaje] = useState('')
  const [adjuntarDiagnostico, setAdjuntarDiagnostico] = useState(true)

  // Estado de FAQ (acordeón interactivo)
  const [faqAbierta, setFaqAbierta] = useState<number | null>(0)

  // Diagnóstico del sistema
  const [comprobandoNube, setComprobandoNube] = useState(false)
  const [estadoNube, setEstadoNube] = useState<'CONECTADO' | 'DESCONECTADO' | 'VERIFICANDO'>('CONECTADO')
  const [anchoTicket, setAnchoTicket] = useState('80mm')

  useEffect(() => {
    cargarConfig()
    cargarTicketsKiosco(kiosco?.id)
    const anchoGuardado = localStorage.getItem('kiosko_ticket_width')
    if (anchoGuardado) setAnchoTicket(anchoGuardado)
  }, [cargarConfig, cargarTicketsKiosco, kiosco?.id])

  // Comprobar conexión a la nube
  const verificarConexionNube = async () => {
    setComprobandoNube(true)
    setEstadoNube('VERIFICANDO')
    try {
      const inicio = Date.now()
      const { error } = await supabase.from('planes').select('id').limit(1)
      const latencia = Date.now() - inicio
      if (error) throw error
      setEstadoNube('CONECTADO')
      toast.success(`Conexión con Supabase verificada (${latencia} ms)`)
    } catch {
      setEstadoNube('DESCONECTADO')
      toast.error('No se pudo conectar con la base de datos en la nube')
    } finally {
      setComprobandoNube(false)
    }
  }

  // Generar ticket central y opcionalmente abrir WhatsApp
  const handleEnviarConsulta = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!mensaje.trim()) {
      toast.error('Por favor, ingresá una descripción en el casillero de mensaje.')
      return
    }

    const tipoLabel = TIPOS_CONSULTA.find((t) => t.id === tipoConsulta)?.label || tipoConsulta
    const ahora = new Date().toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })

    const datosDiag = adjuntarDiagnostico
      ? {
          conexion: isOnline ? 'Online (Conectado)' : 'Modo Offline',
          ticketera: anchoTicket,
          navegador: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : 'Desconocido',
          pantalla: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'Desconocido',
          fechaHora: ahora,
        }
      : undefined

    // 1. Guardar en store / Supabase
    await crearTicket({
      kiosco_id: kiosco?.id || null,
      kiosco_nombre: kiosco?.nombre || 'Mi Kiosco',
      usuario_id: usuario?.id || null,
      usuario_nombre: usuario?.nombre || 'Usuario',
      usuario_telefono: kiosco?.telefono || null,
      usuario_email: usuario?.email || null,
      usuario_rol: usuario?.rol || 'CAJERO',
      tipo: tipoConsulta,
      modulo: moduloSeleccionado,
      mensaje: mensaje.trim(),
      datos_diagnostico: datosDiag,
    })

    // 2. Si el admin tiene WhatsApp, preparar y abrir el chat estructurado
    if (configAdmin.whatsapp_soporte) {
      let cuerpo = `*REPORTE DE SOPORTE - KIOSKOPOS*\n`
      cuerpo += `*Tipo:* ${tipoLabel}\n`
      cuerpo += `*Módulo:* ${moduloSeleccionado}\n`
      cuerpo += `------------------------------------\n`
      cuerpo += `*Mensaje:*\n${mensaje.trim()}\n`
      cuerpo += `------------------------------------\n`

      if (adjuntarDiagnostico) {
        cuerpo += `*Datos de Diagnóstico:*\n`
        cuerpo += `• Comercio: ${kiosco?.nombre || 'No asignado'}\n`
        cuerpo += `• Usuario: ${usuario?.nombre || 'Anónimo'} (${usuario?.rol || 'Rol'})\n`
        cuerpo += `• Conexión: ${isOnline ? 'Online (Conectado)' : 'Modo Offline'}\n`
        cuerpo += `• Ticketera: ${anchoTicket}\n`
        cuerpo += `• Navegador: ${typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 45) : 'Desconocido'}...\n`
        cuerpo += `• Fecha/Hora: ${ahora}\n`
      }

      const url = formatearLinkWhatsApp(configAdmin.whatsapp_soporte, cuerpo)
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer')
        toast.success('Consulta enviada y abriendo WhatsApp...')
      } else {
        toast.success('Consulta registrada en el sistema de soporte.')
      }
    } else {
      toast.success('Consulta registrada en la bandeja del Administrador.')
    }

    setMensaje('')
  }

  const linkChatDirecto = formatearLinkWhatsApp(
    configAdmin.whatsapp_soporte,
    `Hola! Me comunico desde "${kiosco?.nombre || 'Mi Kiosco'}" para consultar sobre soporte técnico de KioskoPOS.`
  )

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* Encabezado Principal */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider uppercase px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
              Soporte y Ayuda
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">Atención personalizada</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            Centro de Soporte y Ayuda
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Canal de contacto directo con tu administrador, reporte de errores y guías operativas.
          </p>
        </div>

        {linkChatDirecto && (
          <a
            href={linkChatDirecto}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-md transition-all self-start sm:self-auto active:scale-95 flex-shrink-0"
          >
            Chat Rápido WhatsApp
          </a>
        )}
      </div>

      {/* Grid de 2 Columnas Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUMNA IZQUIERDA: Contacto + Casillero de Mensajes (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Tarjeta de Contacto Directo */}
          <div className="p-5 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/60 bg-gradient-to-r from-indigo-50/70 via-purple-50/40 to-white dark:from-indigo-950/30 dark:via-gray-800 dark:to-gray-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  Administrador de la Plataforma
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-words">
                  {configAdmin.titular_cuenta ? `Titular: ${configAdmin.titular_cuenta}` : 'Soporte KioskoPOS'}
                </p>
              </div>

              <div className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                Canal Activo
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
              <div className="p-3 rounded-xl bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700">
                <span className="text-gray-400 dark:text-gray-500 block font-medium">WhatsApp directo:</span>
                {configAdmin.whatsapp_soporte ? (
                  <span className="text-sm font-black text-gray-900 dark:text-gray-100 mt-0.5 block">
                    +{configAdmin.whatsapp_soporte.replace(/\D/g, '')}
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold mt-0.5 block">
                    Sin vincular por el administrador
                  </span>
                )}
              </div>

              <div className="p-3 rounded-xl bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700">
                <span className="text-gray-400 dark:text-gray-500 block font-medium">Tiempo de respuesta:</span>
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5 block">
                  Habitual: &lt; 15 minutos
                </span>
              </div>
            </div>
          </div>

          {/* Casillero de Mensajes y Reporte de Errores */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-xs space-y-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Casillero de Mensajes y Reporte de Errores
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Redactá tu duda o inconveniente. Se armará un reporte formateado y se enviará directo al WhatsApp de tu administrador.
              </p>
            </div>

            <form onSubmit={handleEnviarConsulta} className="space-y-4">
              {/* Selector de Tipo de Consulta */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Tipo de solicitud *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {TIPOS_CONSULTA.map((tipo) => (
                    <button
                      key={tipo.id}
                      type="button"
                      onClick={() => setTipoConsulta(tipo.id)}
                      className={`py-3 px-3 rounded-xl border text-center text-xs font-semibold transition-all active:scale-95 flex items-center justify-center min-h-[46px] ${
                        tipoConsulta === tipo.id
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 shadow-2xs ring-1 ring-indigo-500/20 font-bold'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <span>{tipo.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Selector de Módulo */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Módulo o pantalla afectada
                </label>
                <div className="relative">
                  <select
                    value={moduloSeleccionado}
                    onChange={(e) => setModuloSeleccionado(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 appearance-none cursor-pointer pr-9"
                  >
                    {MODULOS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Casillero de Texto */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Descripción del error o consulta *
                  </label>
                  <span className="text-[11px] text-gray-400">
                    {mensaje.length} caracteres
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  placeholder="Describí detalladamente lo que necesitás. Si ocurrió un error, contanos qué estabas haciendo o qué mensaje viste en pantalla..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all resize-y"
                  required
                />
              </div>

              {/* Checkbox Diagnóstico Automático */}
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-semibold text-gray-800 dark:text-gray-200 block">
                    Adjuntar telemetría de diagnóstico
                  </span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    Incluye nombre de tu local, usuario, conexión y ticketera para agilizar la respuesta técnica.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={adjuntarDiagnostico}
                  onChange={(e) => setAdjuntarDiagnostico(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded-md border-gray-300 focus:ring-indigo-500 cursor-pointer flex-shrink-0"
                />
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {configAdmin.whatsapp_soporte ? (
                    <span>Destino: Notifica directo al WhatsApp del administrador</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      Quedará registrado en la bandeja del SuperAdmin
                    </span>
                  )}
                </span>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={!mensaje.trim() || guardandoTicket}
                  className="w-full sm:w-auto px-5 py-2.5 shadow-sm text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {guardandoTicket
                    ? 'Enviando...'
                    : configAdmin.whatsapp_soporte
                    ? 'Enviar Reporte por WhatsApp'
                    : 'Enviar Consulta'}
                </Button>
              </div>
            </form>
          </div>

          {/* Historial de Consultas de este Kiosco */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  Mis Consultas Anteriores
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Seguimiento de mensajes y errores enviados desde tu local
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}
              </span>
            </div>

            {tickets.length === 0 ? (
              <div className="text-center py-6 px-4 text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                Aún no has enviado consultas ni reportes. Al enviar uno quedará registrado aquí con su estado y respuesta del soporte técnico.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    className="p-3.5 rounded-xl border border-gray-200/90 dark:border-gray-700/80 bg-gray-50/70 dark:bg-gray-900/40 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            t.tipo === 'ERROR'
                              ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                              : t.tipo === 'FACTURACION'
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                          }`}
                        >
                          {t.tipo}
                        </span>
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                          {t.modulo}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                          {new Date(t.fecha_creacion).toLocaleString('es-AR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                            t.estado === 'RESUELTO'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : t.estado === 'EN_PROCESO'
                              ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {t.estado === 'RESUELTO'
                            ? 'RESUELTO'
                            : t.estado === 'EN_PROCESO'
                            ? 'EN REVISIÓN'
                            : 'PENDIENTE'}
                        </span>
                      </div>
                    </div>

                    <p className="text-gray-800 dark:text-gray-200 whitespace-pre-line">
                      {t.mensaje}
                    </p>

                    {t.respuesta_admin && (
                      <div className="mt-2 p-2.5 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-800/60">
                        <span className="font-bold text-[11px] text-indigo-700 dark:text-indigo-300 block mb-0.5">
                          Respuesta del Administrador:
                        </span>
                        <p className="text-gray-700 dark:text-gray-300 text-xs">
                          {t.respuesta_admin}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: Diagnóstico + FAQ + Atajos (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Tarjeta de Diagnóstico del Sistema (Health Check) */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  Diagnóstico del Sistema
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Estado en tiempo real de tu terminal KioskoPOS
                </p>
              </div>
              <button
                type="button"
                onClick={verificarConexionNube}
                disabled={comprobandoNube}
                className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold transition-colors"
              >
                {comprobandoNube ? 'Probando...' : 'Comprobar'}
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              {/* 1. Internet */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/80 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className="font-semibold text-gray-800 dark:text-gray-200">Conexión a Internet</span>
                </div>
                <span className={`font-bold px-2 py-0.5 rounded-md ${isOnline ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'}`}>
                  {isOnline ? 'En línea' : 'Sin señal'}
                </span>
              </div>

              {/* 2. Base de datos nube */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/80 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${estadoNube === 'CONECTADO' ? 'bg-emerald-500' : estadoNube === 'VERIFICANDO' ? 'bg-amber-500 animate-ping' : 'bg-red-500'}`} />
                  <span className="font-semibold text-gray-800 dark:text-gray-200">Servidor Supabase</span>
                </div>
                <span className="font-bold text-gray-700 dark:text-gray-300 font-mono text-[11px]">
                  {estadoNube === 'CONECTADO' ? 'Sincronizado' : estadoNube === 'VERIFICANDO' ? 'Chequeando...' : 'Error de enlace'}
                </span>
              </div>

              {/* 3. Ticketera */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/80 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span className="font-semibold text-gray-800 dark:text-gray-200">Ticketera Térmica</span>
                </div>
                <span className="font-bold px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono">
                  {anchoTicket}
                </span>
              </div>

              {/* 4. LocalStorage Offline */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/80 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-gray-800 dark:text-gray-200">Modo Offline Local</span>
                </div>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  Listo para operar
                </span>
              </div>
            </div>
          </div>

          {/* Preguntas Frecuentes (FAQ Interactivo) */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                Preguntas Frecuentes y Guías
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Respuestas inmediatas a las dudas operativas del día a día
              </p>
            </div>

            <div className="space-y-2">
              {FAQ_ITEMS.map((item, idx) => {
                const abierta = faqAbierta === idx
                return (
                  <div
                    key={idx}
                    className="border border-gray-200/80 dark:border-gray-700/80 rounded-xl overflow-hidden transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => setFaqAbierta(abierta ? null : idx)}
                      className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center justify-between gap-2 transition-colors"
                    >
                      <span>{item.pregunta}</span>
                      <span className="text-gray-400 text-sm font-mono flex-shrink-0">
                        {abierta ? '−' : '+'}
                      </span>
                    </button>
                    {abierta && (
                      <div className="px-3.5 pb-3 pt-1 text-xs text-gray-600 dark:text-gray-400 leading-relaxed border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-900/30">
                        {item.respuesta}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Atajos de Teclado del POS */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
              Atajos de Teclado para Cajeros
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {ATAJOS_TECLADO.map((a) => (
                <div
                  key={a.tecla}
                  className="p-2 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-200/60 dark:border-gray-700/60 flex items-center justify-between"
                >
                  <kbd className="px-1.5 py-0.5 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 font-mono font-bold text-[11px] text-gray-800 dark:text-gray-200 shadow-2xs">
                    {a.tecla}
                  </kbd>
                  <span className="text-[11px] text-gray-600 dark:text-gray-400 text-right truncate ml-1">
                    {a.accion}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
