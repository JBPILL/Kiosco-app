import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase, createUnauthenticatedClient } from '../lib/supabase'
import { useAuthStore, calcularDiasRestantes } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import type { Kiosco, Usuario, Suscripcion, Categoria } from '../types/database'
import { formatPrecio, formatFechaCorta } from '../lib/utils'
import { exportarCatalogoExcel, exportarVentasExcel } from '../lib/exportUtils'
import { generarBackupIntegral } from '../lib/backupUtils'
import { AFIPConfigSection } from '../components/config/AFIPConfigSection'
import { AccessibilityConfigSection } from '../components/config/AccessibilityConfigSection'
import { useConfigAdminStore, formatearLinkWhatsApp } from '../stores/configAdminStore'
import { ImportarCatalogoModal } from '../components/catalogo/ImportarCatalogoModal'
import { usePwaStore } from '../stores/pwaStore'
import { useCajaStore } from '../stores/cajaStore'
import {
  getWhatsAppReportConfig,
  saveWhatsAppReportConfig,
  type WhatsAppReportConfig,
  generarEnlaceWhatsApp,
  enviarWebhookCierreCaja,
  formatearReporteCierreTexto,
} from '../lib/whatsappReport'
import toast from 'react-hot-toast'

export function ConfigPage() {
  const { usuario } = useAuthStore()
  const { tema, toggleTema } = useThemeStore()
  const { config: configAdmin, cargarConfig: cargarConfigAdmin } = useConfigAdminStore()
  const { puedeInstalar, estaInstalado, instalarApp } = usePwaStore()
  const { arqueoCiegoObligatorio, cargarArqueoCiegoConfig, guardarArqueoCiegoConfig } = useCajaStore()

  const [kiosco, setKiosco] = useState<Kiosco | null>(null)
  const [suscripcion, setSuscripcion] = useState<Suscripcion | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardandoKiosco, setGuardandoKiosco] = useState(false)
  const [exportandoBackup, setExportandoBackup] = useState(false)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [modalImportarOpen, setModalImportarOpen] = useState(false)

  useEffect(() => {
    cargarConfigAdmin()
    cargarArqueoCiegoConfig()
  }, [cargarConfigAdmin, cargarArqueoCiegoConfig])

  const copiarDato = (texto: string, label: string) => {
    navigator.clipboard.writeText(texto)
    toast.success(`${label} copiado al portapapeles`)
  }

  // Formulario Kiosco
  const [nombreKiosco, setNombreKiosco] = useState('')
  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')

  // Configuración de Notificaciones (WhatsApp & Webhook)
  const [waConfig, setWaConfig] = useState<WhatsAppReportConfig>({
    whatsappDueno: '',
    webhookUrl: '',
    webhookToken: '',
    autoAbrirWhatsApp: false,
    habilitado: true,
  })
  const [guardandoWaConfig, setGuardandoWaConfig] = useState(false)
  const [probandoWebhook, setProbandoWebhook] = useState(false)

  // Navegación por pestañas de configuración
  const [pestanaActiva, setPestanaActiva] = useState<
    'GENERAL' | 'FISCAL' | 'SEGURIDAD' | 'USUARIOS' | 'SUSCRIPCION' | 'BACKUP'
  >('GENERAL')

  // Modal nuevo usuario
  const [modalUsuarioOpen, setModalUsuarioOpen] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoEmail, setNuevoEmail] = useState('')
  const [nuevoPassword, setNuevoPassword] = useState('')
  const [authUserIdManual, setAuthUserIdManual] = useState('')
  const [mostrarAvanzadoAuth, setMostrarAvanzadoAuth] = useState(false)
  const [nuevoRol, setNuevoRol] = useState<'CAJERO' | 'VISOR'>('CAJERO')
  const [creandoUsuario, setCreandoUsuario] = useState(false)

  // Modal eliminar usuario
  const [usuarioAEliminar, setUsuarioAEliminar] = useState<Usuario | null>(null)
  const [eliminandoUsuario, setEliminandoUsuario] = useState(false)

  // Modal asignar contraseña a usuario existente
  const [usuarioParaClave, setUsuarioParaClave] = useState<Usuario | null>(null)
  const [asignarEmail, setAsignarEmail] = useState('')
  const [asignarPassword, setAsignarPassword] = useState('')
  const [guardandoClave, setGuardandoClave] = useState(false)

  const kioscoId = usuario?.kiosco_id

  const cargarDatos = useCallback(async () => {
    if (!kioscoId) return
    setCargando(true)

    try {
      // 1. Cargar datos del Kiosco
      const { data: kioscoData } = await supabase
        .from('kioscos')
        .select('*')
        .eq('id', kioscoId)
        .maybeSingle()

      if (kioscoData) {
        setKiosco(kioscoData)
        setNombreKiosco(kioscoData.nombre || '')
        setDireccion(kioscoData.direccion || '')
        setTelefono(kioscoData.telefono || '')
      }

      // 2. Cargar suscripción del Kiosco con datos de plan
      const { data: subData } = await supabase
        .from('suscripciones')
        .select('*, plan:planes(*)')
        .eq('kiosco_id', kioscoId)
        .order('fecha_vencimiento', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (subData) {
        setSuscripcion(subData as Suscripcion)
      }

      // 3. Cargar usuarios del Kiosco
      const { data: usuariosData } = await supabase
        .from('usuarios')
        .select('*')
        .eq('kiosco_id', kioscoId)
        .order('fecha_creacion')
        .limit(1000)

      if (usuariosData) {
        setUsuarios(usuariosData)
      }

      // 4. Cargar categorías del Kiosco
      const { data: categoriasData } = await supabase
        .from('categorias')
        .select('*')
        .eq('kiosco_id', kioscoId)
        .order('orden')
        .limit(1000)

      if (categoriasData) {
        setCategorias(categoriasData as Categoria[])
      }

      // 5. Cargar configuración de notificaciones (WhatsApp / Webhook)
      const waGuardada = getWhatsAppReportConfig(kioscoId)
      setWaConfig(waGuardada)
    } catch (err) {
      console.error('Error al cargar configuración:', err)
      toast.error('Error al cargar datos de configuración')
    } finally {
      setCargando(false)
    }
  }, [kioscoId])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const handleGuardarKiosco = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!usuario?.kiosco_id || !nombreKiosco.trim()) return

    setGuardandoKiosco(true)
    try {
      const { error } = await supabase
        .from('kioscos')
        .update({
          nombre: nombreKiosco.trim(),
          direccion: direccion.trim() || null,
          telefono: telefono.trim() || null,
        })
        .eq('id', usuario.kiosco_id)

      if (error) throw error

      toast.success('Datos del kiosco actualizados correctamente')
      // BUG-24: Refrescar datos del comercio en useAuthStore para que los tickets reflejen los cambios sin relogin
      useAuthStore.getState().refrescarKiosco()
      cargarDatos()
    } catch (err) {
      console.error('Error actualizando kiosco:', err)
      toast.error('Error al guardar datos del kiosco')
    } finally {
      setGuardandoKiosco(false)
    }
  }

  const handleGuardarWaConfig = (e: React.FormEvent) => {
    e.preventDefault()
    if (!usuario?.kiosco_id) return
    setGuardandoWaConfig(true)
    try {
      const guardada = saveWhatsAppReportConfig(usuario.kiosco_id, waConfig)
      setWaConfig(guardada)
      toast.success('Configuración de notificaciones guardada correctamente')
    } catch {
      toast.error('Error al guardar configuración de notificaciones')
    } finally {
      setGuardandoWaConfig(false)
    }
  }

  const handleProbarWhatsApp = () => {
    if (!waConfig.whatsappDueno.trim()) {
      toast('Abriendo WhatsApp para elegir destinatario (ingresá tu número para enviártelo directo)', {
        duration: 4000,
      })
    }
    const datosPrueba = {
      kioscoNombre: nombreKiosco || kiosco?.nombre || 'Mi Kiosco',
      kioscoDireccion: direccion || kiosco?.direccion || null,
      kioscoTelefono: telefono || kiosco?.telefono || null,
      cajeroNombre: usuario?.nombre || 'Cajero de Prueba',
      fechaApertura: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
      fechaCierre: new Date().toISOString(),
      montoInicial: 10000,
      totalVentas: 75400,
      cantidadVentas: 48,
      ventasPorMedio: [
        { medio: 'Efectivo', total: 42000 },
        { medio: 'Mercado Pago', total: 25400 },
        { medio: 'Transferencia', total: 8000 },
      ],
      ingresosExtra: 0,
      egresosExtra: 5000,
      efectivoEsperado: 47000,
      efectivoContado: 47000,
      diferencia: 0,
    }
    const texto = formatearReporteCierreTexto(datosPrueba)
    const url = generarEnlaceWhatsApp(waConfig.whatsappDueno, texto)
    window.open(url, '_blank')
  }

  const handleProbarWebhook = async () => {
    if (!waConfig.webhookUrl.trim()) {
      toast.error('Ingresá primero una URL de Webhook válida')
      return
    }
    setProbandoWebhook(true)
    const datosPrueba = {
      kioscoNombre: nombreKiosco || kiosco?.nombre || 'Mi Kiosco',
      kioscoDireccion: direccion || kiosco?.direccion || null,
      kioscoTelefono: telefono || kiosco?.telefono || null,
      cajeroNombre: usuario?.nombre || 'Cajero de Prueba',
      fechaApertura: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
      fechaCierre: new Date().toISOString(),
      montoInicial: 10000,
      totalVentas: 75400,
      cantidadVentas: 48,
      ventasPorMedio: [
        { medio: 'Efectivo', total: 42000 },
        { medio: 'Mercado Pago', total: 25400 },
        { medio: 'Transferencia', total: 8000 },
      ],
      ingresosExtra: 0,
      egresosExtra: 5000,
      efectivoEsperado: 47000,
      efectivoContado: 47000,
      diferencia: 0,
    }
    const texto = formatearReporteCierreTexto(datosPrueba)
    try {
      const res = await enviarWebhookCierreCaja(waConfig, datosPrueba, texto)
      if (res.ok) {
        toast.success(`Webhook exitoso (Respuesta ${res.status || 200} OK)`)
      } else {
        toast.error(`Fallo Webhook: ${res.error}`)
      }
    } catch (e: any) {
      const msg = e?.message || ''
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        toast.error('Error de red o CORS: asegurate de que el Webhook acepte peticiones POST desde el navegador.')
      } else {
        toast.error('Error al contactar Webhook: ' + msg)
      }
    } finally {
      setProbandoWebhook(false)
    }
  }

  const handleCrearUsuario = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!usuario?.kiosco_id || !nuevoNombre.trim()) return

    setCreandoUsuario(true)
    try {
      let authUserId: string | null = authUserIdManual.trim() || null

      // Si se proporcionó email y contraseña, intentar crear credencial en Supabase Auth
      if (!authUserId && nuevoEmail.trim() && nuevoPassword.trim()) {
        const tempClient = createUnauthenticatedClient()
        const { data: authData, error: authError } = await tempClient.auth.signUp({
          email: nuevoEmail.trim(),
          password: nuevoPassword.trim(),
        })

        if (authError) {
          console.warn('Error en signUp:', authError)
          let msg = authError.message
          if (msg.toLowerCase().includes('rate limit')) {
            msg = 'Límite de correos en Supabase alcanzado. Desactivá "Confirm email" en Supabase Dashboard (Authentication -> Providers -> Email) para crear usuarios ilimitados al instante.'
          } else if (msg.toLowerCase().includes('already registered')) {
            msg = 'Ya existe un usuario con este correo electrónico en Supabase Auth.'
          }
          throw new Error(msg)
        }

        if (authData?.user?.id) {
          authUserId = authData.user.id
        } else {
          throw new Error('No se pudo generar la cuenta de acceso. Verificá la configuración de Supabase Auth.')
        }
      }

      const { error } = await supabase.from('usuarios').insert({
        kiosco_id: usuario.kiosco_id,
        auth_user_id: authUserId,
        nombre: nuevoNombre.trim(),
        email: nuevoEmail.trim() || null,
        rol: nuevoRol,
        activo: true,
      })

      if (error) throw error

      toast.success(
        authUserId
          ? 'Usuario creado con credenciales de acceso activas'
          : 'Usuario agregado a la lista del kiosco'
      )
      setModalUsuarioOpen(false)
      setNuevoNombre('')
      setNuevoEmail('')
      setNuevoPassword('')
      setAuthUserIdManual('')
      setMostrarAvanzadoAuth(false)
      setNuevoRol('CAJERO')
      cargarDatos()
    } catch (err) {
      console.error('Error creando usuario:', err)
      toast.error(err instanceof Error ? err.message : 'Error al crear usuario', { duration: 6000 })
    } finally {
      setCreandoUsuario(false)
    }
  }

  const handleAsignarClave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!usuarioParaClave || !asignarEmail.trim() || !asignarPassword.trim()) return

    setGuardandoClave(true)
    try {
      const tempClient = createUnauthenticatedClient()
      const { data: authData, error: authError } = await tempClient.auth.signUp({
        email: asignarEmail.trim(),
        password: asignarPassword.trim(),
      })

      if (authError) {
        let msg = authError.message
        if (msg.toLowerCase().includes('rate limit')) {
          msg = 'Límite de emails en Supabase. Desactivá "Confirm email" en Supabase (Authentication -> Providers -> Email).'
        } else if (msg.toLowerCase().includes('already registered')) {
          msg = 'Ya existe este correo en Supabase Auth. Ingresá otro email o vinculá su ID.'
        }
        throw new Error(msg)
      }

      if (!authData?.user?.id) {
        throw new Error('No se pudo registrar la clave en Supabase Auth.')
      }

      const { error: updError } = await supabase
        .from('usuarios')
        .update({
          auth_user_id: authData.user.id,
          email: asignarEmail.trim(),
        })
        .eq('id', usuarioParaClave.id)

      if (updError) throw updError

      toast.success(`Clave asignada correctamente a ${usuarioParaClave.nombre}`)
      setUsuarioParaClave(null)
      setAsignarEmail('')
      setAsignarPassword('')
      cargarDatos()
    } catch (err) {
      console.error('Error asignando clave:', err)
      toast.error(err instanceof Error ? err.message : 'Error al asignar clave', { duration: 6000 })
    } finally {
      setGuardandoClave(false)
    }
  }

  const duenosActivos = usuarios.filter((u) => u.rol === 'DUEÑO' && u.activo).length

  const diasRestantes = useMemo(() => {
    return calcularDiasRestantes(suscripcion?.fecha_vencimiento)
  }, [suscripcion?.fecha_vencimiento])

  const estadoEfectivo = useMemo<'ACTIVO' | 'SOLO_LECTURA' | 'SUSPENDIDO'>(() => {
    if (kiosco?.estado_suscripcion === 'SUSPENDIDO') return 'SUSPENDIDO'
    if (kiosco?.estado_suscripcion === 'SOLO_LECTURA') return 'SOLO_LECTURA'
    if (diasRestantes !== null && diasRestantes < 0) return 'SOLO_LECTURA'
    return 'ACTIVO'
  }, [kiosco?.estado_suscripcion, diasRestantes])

  const handleExportarCatalogo = async () => {
    if (!usuario?.kiosco_id) return
    setExportandoBackup(true)
    try {
      const { data: prods, error: pErr } = await supabase
        .from('productos')
        .select('*, categoria:categorias(*)')
        .eq('kiosco_id', usuario.kiosco_id)
        .eq('activo', true)
      if (pErr) throw pErr

      const { data: cats } = await supabase
        .from('categorias')
        .select('*')
        .eq('kiosco_id', usuario.kiosco_id)

      await exportarCatalogoExcel(prods || [], cats || [], kiosco?.nombre || 'Kiosco')
      toast.success('Copia del catálogo descargada en Excel (.xlsx)')
    } catch (err) {
      console.error(err)
      toast.error('Error al exportar catálogo')
    } finally {
      setExportandoBackup(false)
    }
  }

  const handleExportarVentas = async () => {
    if (!usuario?.kiosco_id) return
    setExportandoBackup(true)
    try {
      const { data: vtas, error: vErr } = await supabase
        .from('ventas')
        .select(`
          id, fecha_hora, total, estado, notas,
          afip_cae, afip_tipo_comprobante, afip_nro_comprobante,
          usuario:usuarios(nombre),
          pagos:pagos_venta(medio_pago, monto)
        `)
        .eq('kiosco_id', usuario.kiosco_id)
        .order('fecha_hora', { ascending: false })
      if (vErr) throw vErr

      await exportarVentasExcel(vtas || [], kiosco?.nombre || 'Kiosco', 'Histórico Completo')
      toast.success('Copia de ventas descargada en Excel (.xlsx)')
    } catch (err: any) {
      console.error('Error al exportar ventas:', err)
      toast.error(err?.message ? `Error al exportar ventas: ${err.message}` : 'Error al exportar ventas')
    } finally {
      setExportandoBackup(false)
    }
  }

  const handleExportarBackupIntegral = async () => {
    if (!usuario?.kiosco_id) return
    setExportandoBackup(true)
    try {
      const res = await generarBackupIntegral(usuario.kiosco_id, kiosco?.nombre)
      if (res.ok) {
        toast.success(res.mensaje)
      } else {
        toast.error(res.mensaje)
      }
    } catch (err: any) {
      console.error('Error al generar backup:', err)
      toast.error(err?.message ? `Error al generar backup: ${err.message}` : 'Error al generar backup')
    } finally {
      setExportandoBackup(false)
    }
  }

  const handleEliminarUsuario = async () => {
    if (!usuarioAEliminar || !usuario?.kiosco_id) return

    // Protección 1: No permitir borrar si es el único dueño activo
    if (usuarioAEliminar.rol === 'DUEÑO' && duenosActivos <= 1) {
      toast.error('No podés eliminar el único perfil de administrador del sistema')
      setUsuarioAEliminar(null)
      return
    }

    // Protección 2: No permitir borrar la propia sesión activa
    if (usuarioAEliminar.id === usuario.id) {
      toast.error('No podés eliminar tu propia cuenta mientras estás conectado')
      setUsuarioAEliminar(null)
      return
    }

    setEliminandoUsuario(true)
    try {
      // 1. Intentar eliminación física
      const { error: delError } = await supabase
        .from('usuarios')
        .delete()
        .eq('id', usuarioAEliminar.id)

      if (delError) {
        console.warn('Eliminación física restringida por FK o RLS, aplicando desactivación:', delError)
        // 2. Si tenía turnos de caja o ventas históricas, desactivar para no violar FK
        const { error: updError } = await supabase
          .from('usuarios')
          .update({ activo: false })
          .eq('id', usuarioAEliminar.id)

        if (updError) throw updError
        toast.success('Usuario desactivado del sistema')
      } else {
        toast.success('Usuario eliminado correctamente')
      }

      setUsuarioAEliminar(null)
      cargarDatos()
    } catch (err) {
      console.error('Error al eliminar usuario:', err)
      toast.error(err instanceof Error ? err.message : 'Error al eliminar usuario')
    } finally {
      setEliminandoUsuario(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider uppercase px-2.5 py-1 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
              Panel del Comercio
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">Ajustes & Parámetros</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            Configuración General
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Administrá los datos del local, facturación electrónica, equipo, seguridad y resguardos.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {kiosco && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-900/70 border border-gray-200 dark:border-gray-700 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold text-gray-800 dark:text-gray-200 truncate max-w-[180px]">
                {kiosco.nombre}
              </span>
            </div>
          )}
          <Button
            variant="secondary"
            onClick={cargarDatos}
            disabled={cargando}
            className="text-xs"
          >
            {cargando ? 'Actualizando...' : 'Actualizar'}
          </Button>
        </div>
      </div>

      {/* Selector de Pestañas de Configuración */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setPestanaActiva('GENERAL')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            pestanaActiva === 'GENERAL'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span>Negocio y Apariencia</span>
        </button>

        <button
          type="button"
          onClick={() => setPestanaActiva('FISCAL')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            pestanaActiva === 'FISCAL'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span>Facturación ARCA</span>
        </button>

        <button
          type="button"
          onClick={() => setPestanaActiva('SEGURIDAD')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            pestanaActiva === 'SEGURIDAD'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span>Seguridad y Caja</span>
          {arqueoCiegoObligatorio && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setPestanaActiva('USUARIOS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            pestanaActiva === 'USUARIOS'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span>Equipo y Usuarios</span>
          <span
            className={`text-xs px-2 py-0.2 rounded-full font-semibold ${
              pestanaActiva === 'USUARIOS'
                ? 'bg-white/20 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            {usuarios.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setPestanaActiva('SUSCRIPCION')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            pestanaActiva === 'SUSCRIPCION'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span>Suscripción</span>
          <span
            className={`text-xs px-2 py-0.2 rounded-full font-semibold ${
              estadoEfectivo === 'ACTIVO'
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
            }`}
          >
            {estadoEfectivo === 'ACTIVO' ? 'Al día' : 'Atención'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setPestanaActiva('BACKUP')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            pestanaActiva === 'BACKUP'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span>Backups y App</span>
        </button>
      </div>

      {cargando ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mt-3">
            Cargando configuración del kiosco...
          </p>
        </div>
      ) : (
        <>
          {/* PESTAÑA: GENERAL Y LOCAL */}
          {pestanaActiva === 'GENERAL' && (
            <div className="space-y-6">
              {/* Datos del Kiosco */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300">
                    Identificación
                  </span>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Datos del Negocio
                  </h2>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Información oficial del local que se imprime en los tickets de venta y comprobantes.
                </p>

                <form onSubmit={handleGuardarKiosco} className="space-y-4">
                  <Input
                    label="Nombre del Kiosco / Comercio *"
                    placeholder="Ej: Kiosco Central"
                    value={nombreKiosco}
                    onChange={(e) => setNombreKiosco(e.target.value)}
                    required
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Dirección del Local"
                      placeholder="Ej: Av. San Martín 1234"
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                    />
                    <Input
                      label="Teléfono de Contacto"
                      placeholder="Ej: 11-2345-6789"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                    />
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button type="submit" variant="primary" loading={guardandoKiosco} className="shadow-xs">
                      Guardar Cambios del Comercio
                    </Button>
                  </div>
                </form>
              </div>

              {/* Apariencia / Modo Oscuro */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300">
                    Interfaz Visual
                  </span>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Tema y Modo de Visualización
                  </h2>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Alterná entre tema claro y tema oscuro según la iluminación de tu local comercial.
                </p>

                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  <button
                    type="button"
                    onClick={() => tema !== 'light' && toggleTema()}
                    className={`p-3 rounded-xl border text-center font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      tema === 'light'
                        ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/30 shadow-xs'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span>Modo Claro</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => tema !== 'dark' && toggleTema()}
                    className={`p-3 rounded-xl border text-center font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      tema === 'dark'
                        ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/30 shadow-xs'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                    <span>Modo Oscuro</span>
                  </button>
                </div>
              </div>

              {/* Tamaño de Letra y Accesibilidad Visual */}
              <AccessibilityConfigSection />
            </div>
          )}

          {/* PESTAÑA: FACTURACIÓN ARCA */}
          {pestanaActiva === 'FISCAL' && (
            <div className="space-y-6">
              <AFIPConfigSection />
            </div>
          )}

          {/* PESTAÑA: SEGURIDAD Y CONTROL DE CAJA */}
          {pestanaActiva === 'SEGURIDAD' && (
            <div className="space-y-6">
              {/* Tarjeta 1: Arqueo Ciego */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300">
                    Seguridad Operativa
                  </span>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Políticas de Turno y Control de Efectivo
                  </h2>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Reglas de control y auditoría financiera aplicables a los cajeros del comercio.
                </p>

                <div className="p-4 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      Exigir Arqueo Ciego Obligatorio a Cajeros
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed max-w-xl">
                      Al activarse, los empleados con rol Cajero no podrán ver el efectivo esperado por el sistema ni las ventas del turno. Deberán contar el dinero físicamente en el cajón a ciegas al cerrar para prevenir desvíos y manipulaciones.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      arqueoCiegoObligatorio
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {arqueoCiegoObligatorio ? 'Obligatorio' : 'Opcional (Guiado)'}
                    </span>

                    <button
                      type="button"
                      onClick={async () => {
                        const nuevo = !arqueoCiegoObligatorio
                        await guardarArqueoCiegoConfig(nuevo)
                        toast.success(
                          nuevo
                            ? 'Arqueo ciego obligatorio activado para cajeros'
                            : 'Arqueo ciego opcional: cajeros podrán ver efectivo esperado'
                        )
                      }}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        arqueoCiegoObligatorio ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                      role="switch"
                      aria-checked={arqueoCiegoObligatorio}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          arqueoCiegoObligatorio ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Tarjeta 2: Notificaciones y Reportes de Cierre a WhatsApp & Webhook */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300">
                      Auditoría Remota
                    </span>
                    <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      Reportes de Cierre de Caja a WhatsApp y Webhook
                    </h2>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                    Notificación Instantánea
                  </span>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Recibí en tu celular un resumen completo cada vez que un cajero cierra su turno: facturación total, cobros por medio de pago (efectivo, Mercado Pago, transferencias) y faltante/sobrante de caja.
                </p>

                <form onSubmit={handleGuardarWaConfig} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Input
                        label="Número de WhatsApp del Dueño / Titular"
                        type="text"
                        value={waConfig.whatsappDueno}
                        onChange={(e) =>
                          setWaConfig((prev) => ({ ...prev, whatsappDueno: e.target.value }))
                        }
                        placeholder="Ej: 11 2345-6789 o 5491123456789"
                      />
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                        Formato nacional o internacional. El sistema normaliza automáticamente números de Argentina (+54 9 11...).
                      </p>
                    </div>

                    <div className="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-gray-900 dark:text-gray-100">
                            Habilitar Notificaciones de Cierre
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            Activa el envío de reportes al finalizar turnos.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setWaConfig((prev) => ({ ...prev, habilitado: !prev.habilitado }))
                          }
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                            waConfig.habilitado ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              waConfig.habilitado ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700/60 pt-2.5">
                        <div>
                          <p className="text-xs font-bold text-gray-900 dark:text-gray-100">
                            Abrir WhatsApp Web automáticamente
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            Abre una pestaña con el mensaje listo al confirmar el cierre de caja.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setWaConfig((prev) => ({
                              ...prev,
                              autoAbrirWhatsApp: !prev.autoAbrirWhatsApp,
                            }))
                          }
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                            waConfig.autoAbrirWhatsApp
                              ? 'bg-indigo-600'
                              : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              waConfig.autoAbrirWhatsApp ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Integración Avanzada con Webhooks */}
                  <div className="p-4 bg-gray-50/70 dark:bg-gray-900/40 rounded-xl border border-gray-200 dark:border-gray-700/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-bold text-gray-900 dark:text-gray-100">
                          Integración con Webhook (n8n, Make, Evolution API, Baileys)
                        </h3>
                      </div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">
                        Opcional (HTTP POST JSON)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Input
                          label="URL del Webhook (HTTP POST)"
                          type="url"
                          value={waConfig.webhookUrl}
                          onChange={(e) =>
                            setWaConfig((prev) => ({ ...prev, webhookUrl: e.target.value }))
                          }
                          placeholder="https://n8n.tudominio.com/webhook/cierre-caja"
                        />
                      </div>
                      <div>
                        <Input
                          label="Token de Autorización Bearer (Opcional)"
                          type="password"
                          value={waConfig.webhookToken}
                          onChange={(e) =>
                            setWaConfig((prev) => ({ ...prev, webhookToken: e.target.value }))
                          }
                          placeholder="Bearer token o secret key"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Botonera de Acciones y Pruebas */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleProbarWhatsApp}
                        className="w-full sm:w-auto text-xs font-semibold"
                        title="Abre WhatsApp Web con un reporte simulado de prueba"
                      >
                        <span>Probar WhatsApp</span>
                      </Button>

                      {waConfig.webhookUrl && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleProbarWebhook}
                          loading={probandoWebhook}
                          disabled={probandoWebhook}
                          className="w-full sm:w-auto text-xs font-semibold"
                          title="Envía una petición de prueba al Webhook"
                        >
                          <span>Probar Webhook</span>
                        </Button>
                      )}
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      loading={guardandoWaConfig}
                      disabled={guardandoWaConfig}
                      className="w-full sm:w-auto text-xs font-bold shadow-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      Guardar Configuración
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* PESTAÑA: PERSONAL Y USUARIOS */}
          {pestanaActiva === 'USUARIOS' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3 border-b border-gray-100 dark:border-gray-700 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300">
                      Equipo y Accesos
                    </span>
                    <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      Usuarios y Empleados del Kiosco
                    </h2>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Roles asignados para operar la caja, ventas y consulta de reportes.
                  </p>
                </div>
                <Button size="sm" variant="primary" onClick={() => setModalUsuarioOpen(true)} className="shadow-xs">
                  + Nuevo Usuario
                </Button>
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase text-[11px]">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Nombre</th>
                        <th className="px-4 py-3 font-semibold">Email</th>
                        <th className="px-4 py-3 font-semibold">Rol</th>
                        <th className="px-4 py-3 font-semibold">Acceso / Login</th>
                        <th className="px-4 py-3 font-semibold">Estado</th>
                        <th className="px-4 py-3 font-semibold text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {usuarios.map((u) => {
                        const esUltimoAdmin = u.rol === 'DUEÑO' && duenosActivos <= 1
                        const esSesionActual = u.id === usuario?.id

                        return (
                          <tr key={u.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/50 transition-colors">
                            <td className="px-4 py-3 font-bold text-gray-900 dark:text-gray-100">{u.nombre}</td>
                            <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{u.email || '—'}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center justify-center min-w-[70px] px-2.5 py-0.5 text-xs font-bold rounded-full tracking-wide ${
                                  u.rol === 'DUEÑO'
                                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400'
                                    : u.rol === 'CAJERO'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                                    : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400'
                                }`}
                              >
                                {u.rol}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {u.auth_user_id ? (
                                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Habilitado
                                </span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                    Sin clave
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setUsuarioParaClave(u)
                                      setAsignarEmail(u.email || '')
                                      setAsignarPassword('')
                                    }}
                                    className="px-2 py-0.5 text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded border border-indigo-200 dark:border-indigo-800 transition-colors"
                                  >
                                    Asignar clave
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                                  u.activo
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                }`}
                              >
                                {u.activo ? 'Activo' : 'Desactivado'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {esUltimoAdmin ? (
                                <span
                                  className="text-xs text-gray-400 dark:text-gray-500 font-medium italic"
                                  title="No se puede eliminar el único administrador del kiosco"
                                >
                                  Admin principal
                                </span>
                              ) : esSesionActual ? (
                                <span
                                  className="text-xs text-indigo-600 dark:text-indigo-400 font-bold"
                                  title="Sesión activa actualmente"
                                >
                                  Tu cuenta
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setUsuarioAEliminar(u)}
                                  className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-300 bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800/60 rounded-lg transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                                  title="Eliminar este usuario"
                                >
                                  Eliminar
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* PESTAÑA: SUSCRIPCIÓN Y COBERTURA */}
          {pestanaActiva === 'SUSCRIPCION' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300">
                  Abono Mensual
                </span>
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  Estado de la Suscripción
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Tarjeta 1: Plan */}
                <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700 shadow-2xs">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Plan contratado</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
                    {suscripcion?.plan?.nombre || 'Kiosco Pro'}
                  </p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 font-bold mt-0.5">
                    {suscripcion?.plan?.precio_mensual
                      ? `${formatPrecio(suscripcion.plan.precio_mensual)} / mes`
                      : '$35.000 / mes'}
                  </p>
                </div>

                {/* Tarjeta 2: Estado del Servicio */}
                <div
                  className={`p-4 rounded-xl border shadow-2xs ${
                    estadoEfectivo === 'ACTIVO'
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/50'
                      : estadoEfectivo === 'SOLO_LECTURA'
                      ? 'bg-amber-50/50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/60'
                      : 'bg-red-50/50 dark:bg-red-950/30 border-red-300 dark:border-red-800/60'
                  }`}
                >
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Estado de servicio</p>
                  <p
                    className={`text-lg font-bold mt-1 ${
                      estadoEfectivo === 'ACTIVO'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : estadoEfectivo === 'SOLO_LECTURA'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {estadoEfectivo === 'ACTIVO'
                      ? 'Activo'
                      : estadoEfectivo === 'SOLO_LECTURA'
                      ? 'Solo Lectura'
                      : 'Suspendido'}
                  </p>
                  <p
                    className={`text-xs mt-0.5 ${
                      estadoEfectivo === 'ACTIVO'
                        ? 'text-gray-500 dark:text-gray-400'
                        : estadoEfectivo === 'SOLO_LECTURA'
                        ? 'text-amber-700 dark:text-amber-300 font-medium'
                        : 'text-red-700 dark:text-red-300 font-medium'
                    }`}
                  >
                    {estadoEfectivo === 'ACTIVO'
                      ? 'Acceso total habilitado'
                      : estadoEfectivo === 'SOLO_LECTURA'
                      ? 'Ventas pausadas (período vencido)'
                      : 'Servicio pausado temporalmente'}
                  </p>
                </div>

                {/* Tarjeta 3: Vencimiento */}
                <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700 shadow-2xs">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Vencimiento del Abono</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
                    {suscripcion?.fecha_vencimiento
                      ? formatFechaCorta(suscripcion.fecha_vencimiento)
                      : 'Al día'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {diasRestantes !== null
                      ? diasRestantes > 5
                        ? `Quedan ${diasRestantes} días de cobertura`
                        : diasRestantes > 0
                        ? `Vence en ${diasRestantes} días`
                        : diasRestantes === 0
                        ? 'Vence hoy'
                        : `Vencido hace ${Math.abs(diasRestantes)} días`
                      : 'Suscripción por tiempo indeterminado'}
                  </p>
                </div>
              </div>

              {/* Aviso informativo condicional */}
              {estadoEfectivo === 'SOLO_LECTURA' && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200">
                  <span className="font-bold">Modo Solo Lectura: </span>
                  Las ventas en el punto de venta (POS) están bloqueadas temporalmente por vencimiento del abono. Podés seguir consultando stock, caja y reportes de tu negocio. Para habilitar las ventas, comunicate con el administrador para regularizar tu suscripción.
                </div>
              )}

              {estadoEfectivo === 'SUSPENDIDO' && (
                <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs text-red-900 dark:text-red-200">
                  <span className="font-bold">Servicio Suspendido: </span>
                  El servicio se encuentra pausado temporalmente. Por favor, regularizá el abono para reactivar el sistema.
                </div>
              )}

              {/* Datos para pago y renovación de suscripción */}
              {(configAdmin.alias_mp || configAdmin.cbu_banco || configAdmin.titular_cuenta || configAdmin.whatsapp_soporte) && (
                <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/70 border border-gray-200 dark:border-gray-700 space-y-3 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700/80 pb-2.5">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        Datos de Pago para Renovación de Abono
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Transferí el monto de tu plan y enviá el comprobante al WhatsApp oficial del administrador.
                      </p>
                    </div>
                    {configAdmin.whatsapp_soporte && (
                      <a
                        href={formatearLinkWhatsApp(
                          configAdmin.whatsapp_soporte,
                          `Hola! Me comunico desde "${kiosco?.nombre || 'Mi Kiosco'}" para consultar sobre la renovación de mi abono en AlPaso POS.`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-colors self-start sm:self-auto"
                      >
                        WhatsApp Soporte
                      </a>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {configAdmin.titular_cuenta && (
                      <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xs">
                        <span className="text-gray-400 dark:text-gray-500 block font-medium">Titular de la cuenta:</span>
                        <span className="font-bold text-gray-900 dark:text-gray-100 mt-1 block text-sm leading-snug break-words">
                          {configAdmin.titular_cuenta}
                        </span>
                      </div>
                    )}

                    {configAdmin.alias_mp && (
                      <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 shadow-2xs">
                        <div className="min-w-0">
                          <span className="text-gray-400 dark:text-gray-500 block font-medium">Alias Mercado Pago:</span>
                          <span className="font-bold text-sky-600 dark:text-sky-400 mt-1 block text-sm break-words select-all">
                            {configAdmin.alias_mp}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copiarDato(configAdmin.alias_mp, 'Alias')}
                          className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-xs font-bold text-gray-700 dark:text-gray-200 transition-colors flex-shrink-0 active:scale-95"
                        >
                          Copiar
                        </button>
                      </div>
                    )}

                    {configAdmin.cbu_banco && (
                      <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 shadow-2xs">
                        <div className="min-w-0">
                          <span className="text-gray-400 dark:text-gray-500 block font-medium">CBU / CVU Bancario:</span>
                          <span className="font-bold text-gray-900 dark:text-gray-100 mt-1 block font-mono text-sm tracking-wide break-all select-all">
                            {configAdmin.cbu_banco}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copiarDato(configAdmin.cbu_banco, 'CBU')}
                          className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-xs font-bold text-gray-700 dark:text-gray-200 transition-colors flex-shrink-0 active:scale-95"
                        >
                          Copiar
                        </button>
                      </div>
                    )}

                    {configAdmin.banco_nombre && (
                      <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xs">
                        <span className="text-gray-400 dark:text-gray-500 block font-medium">Banco / Billetera:</span>
                        <span className="font-bold text-gray-900 dark:text-gray-100 mt-1 block text-sm break-words">
                          {configAdmin.banco_nombre}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PESTAÑA: COPIAS DE SEGURIDAD Y PWA */}
          {pestanaActiva === 'BACKUP' && (
            <div className="space-y-6">
              {/* Copias de Seguridad */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300">
                    Resguardo Local
                  </span>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Copias de Seguridad (Backup de Datos)
                  </h2>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Descargá una copia física de la información de tu negocio en formato Excel corporativo (.XLSX) para tener siempre un resguardo seguro en tu computadora.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
                  <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2 flex flex-col justify-between shadow-2xs">
                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">
                          Backup Completo (JSON)
                        </h3>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                          1 Clic
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        Descargá la totalidad de tus datos (catálogo, categorías, clientes, proveedores, promociones y lotes) en un archivo JSON único.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleExportarBackupIntegral}
                      disabled={exportandoBackup}
                      className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {exportandoBackup ? 'Generando...' : 'Descargar Todo (.JSON)'}
                    </Button>
                  </div>

                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 space-y-2 flex flex-col justify-between shadow-2xs">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        Resguardo de Catálogo y Stock
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Incluye todos tus productos con códigos de barra, categorías, costos, precios de venta y stock actual.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleExportarCatalogo}
                      disabled={exportandoBackup}
                      className="w-full text-xs font-bold"
                    >
                      {exportandoBackup ? 'Generando...' : 'Descargar Catálogo (.XLSX)'}
                    </Button>
                  </div>

                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 space-y-2 flex flex-col justify-between shadow-2xs">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        Histórico de Ventas (Auditoría)
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Descargá el informe contable de todas las ventas emitidas con fecha, comprobante, cajero y medios de pago para auditoría o contabilidad.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleExportarVentas}
                      disabled={exportandoBackup}
                      className="w-full text-xs font-bold"
                    >
                      {exportandoBackup ? 'Generando...' : 'Descargar Ventas (.XLSX)'}
                    </Button>
                  </div>

                  <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2 flex flex-col justify-between shadow-2xs">
                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-indigo-950 dark:text-indigo-200">
                          Restaurar Catálogo / Rollback
                        </h3>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                          Recuperación
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        Importá la copia de seguridad de tu catálogo (.xlsx o .csv) para actualizar precios, costos y stock, o revertir a un estado anterior.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setModalImportarOpen(true)}
                      className="w-full text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      Restaurar Catálogo (.XLSX / .CSV)
                    </Button>
                  </div>
                </div>
              </div>

              {/* Aplicación de Escritorio e Instalación PWA */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300">
                        Nativo Windows / Mobile
                      </span>
                      <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        Aplicación de Escritorio (PWA Offline)
                      </h2>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Ejecutá AlPaso POS como un programa nativo de Windows: acceso directo en el Escritorio, fijado en la Barra de Tareas y listo para operar sin internet.
                    </p>
                  </div>

                  {puedeInstalar && !estaInstalado && (
                    <Button
                      variant="primary"
                      onClick={async () => {
                        const exito = await instalarApp()
                        if (exito) toast.success('¡AlPaso POS se instaló exitosamente en tu PC!')
                      }}
                      className="font-bold shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                    >
                      Instalar en esta PC
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-xs">
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 space-y-1">
                    <span className="font-bold text-gray-800 dark:text-gray-200 block">
                      1. Ventana Independiente
                    </span>
                    <p className="text-gray-500 dark:text-gray-400">
                      Se abre en su propia ventana maximizada sin distracciones ni barras de navegación.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 space-y-1">
                    <span className="font-bold text-gray-800 dark:text-gray-200 block">
                      2. 100% Operativo Sin Conexión
                    </span>
                    <p className="text-gray-500 dark:text-gray-400">
                      Caché permanente local: si se interrumpe internet, podés seguir vendiendo con normalidad.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 space-y-1">
                    <span className="font-bold text-gray-800 dark:text-gray-200 block">
                      3. Acceso Directo de Windows
                    </span>
                    <p className="text-gray-500 dark:text-gray-400">
                      Podés fijarlo a la Barra de Tareas e iniciarlo con un clic al encender tu PC.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal para nuevo usuario */}
      <Modal
        isOpen={modalUsuarioOpen}
        onClose={() => setModalUsuarioOpen(false)}
        title="Dar de Alta Usuario"
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalUsuarioOpen(false)}
              disabled={creandoUsuario}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              form="form-crear-usuario"
              loading={creandoUsuario}
              className="shadow-sm"
            >
              Guardar Usuario
            </Button>
          </div>
        }
      >
        <form id="form-crear-usuario" onSubmit={handleCrearUsuario} className="space-y-4">
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 space-y-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300">
                1. Credenciales
              </span>
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                Datos de Identificación y Acceso
              </span>
            </div>

            <Input
              label="Nombre completo *"
              placeholder="Ej: Laura Pérez"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              required
              autoFocus
            />

            <Input
              label="Email para iniciar sesión *"
              type="email"
              placeholder="cajero@mitienda.com"
              value={nuevoEmail}
              onChange={(e) => setNuevoEmail(e.target.value)}
              required
            />

            <Input
              label="Contraseña *"
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={nuevoPassword}
              onChange={(e) => setNuevoPassword(e.target.value)}
              required={!authUserIdManual}
              minLength={6}
            />
          </div>

          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 space-y-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300">
                2. Nivel de Acceso
              </span>
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                Rol en el Punto de Venta
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Rol Asignado
              </label>
              <select
                value={nuevoRol}
                onChange={(e) => setNuevoRol(e.target.value as 'CAJERO' | 'VISOR')}
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none"
              >
                <option value="CAJERO">CAJERO — Solo Punto de Venta, Caja y Clientes</option>
                <option value="VISOR">VISOR — Solo lectura de reportes y ventas</option>
              </select>
            </div>

            {/* Información de permisos */}
            <div className="p-3 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl text-xs text-indigo-900 dark:text-indigo-300 space-y-1">
              <p className="font-bold">Permisos de seguridad del rol CAJERO:</p>
              <p className="leading-relaxed">
                El cajero solo podrá registrar cobros y operar la caja. Las secciones de <strong>Catálogo</strong>, <strong>Stock</strong>, <strong>Reportes de Ganancia</strong> y <strong>Configuración</strong> estarán bloqueadas y ocultas.
              </p>
            </div>
          </div>

          {/* Opciones avanzadas para vincular Auth UID manualmente */}
          <div className="pt-0.5">
            <button
              type="button"
              onClick={() => setMostrarAvanzadoAuth(!mostrarAvanzadoAuth)}
              className="text-xs text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 underline font-medium cursor-pointer"
            >
              {mostrarAvanzadoAuth ? 'Ocultar opciones avanzadas' : 'Vincular ID de Supabase Auth manualmente'}
            </button>

            {mostrarAvanzadoAuth && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2 text-xs">
                <p className="text-gray-600 dark:text-gray-400">
                  Si creaste el usuario directamente en Supabase Auth Dashboard, pegá acá su UUID:
                </p>
                <Input
                  label="Supabase Auth User ID (UUID)"
                  placeholder="Ej: a1b2c3d4-e5f6-7890-..."
                  value={authUserIdManual}
                  onChange={(e) => setAuthUserIdManual(e.target.value)}
                />
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* Modal de confirmación para eliminar usuario */}
      <Modal
        isOpen={!!usuarioAEliminar}
        onClose={() => setUsuarioAEliminar(null)}
        title="Eliminar Usuario"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <Button
              type="button"
              variant="secondary"
              disabled={eliminandoUsuario}
              onClick={() => setUsuarioAEliminar(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={eliminandoUsuario}
              onClick={handleEliminarUsuario}
            >
              Confirmar Eliminación
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs text-red-800 dark:text-red-200 space-y-1.5">
            <p className="font-bold text-sm">
              ¿Estás seguro de eliminar al usuario "{usuarioAEliminar?.nombre}"?
            </p>
            <p>
              El usuario con rol <strong>{usuarioAEliminar?.rol}</strong> ({usuarioAEliminar?.email || 'Sin correo'}) ya no podrá acceder al sistema ni abrir turnos de caja en este comercio.
            </p>
          </div>
        </div>
      </Modal>

      {/* Modal para asignar clave a usuario existente */}
      <Modal
        isOpen={!!usuarioParaClave}
        onClose={() => setUsuarioParaClave(null)}
        title={`Asignar Clave: ${usuarioParaClave?.nombre || ''}`}
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <Button
              type="button"
              variant="secondary"
              disabled={guardandoClave}
              onClick={() => setUsuarioParaClave(null)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              form="form-asignar-clave"
              loading={guardandoClave}
              className="shadow-sm"
            >
              Guardar Clave
            </Button>
          </div>
        }
      >
        <form id="form-asignar-clave" onSubmit={handleAsignarClave} className="space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Establecé las credenciales de acceso para que este {usuarioParaClave?.rol.toLowerCase()} pueda iniciar sesión en el punto de venta.
          </p>

          <Input
            label="Email de acceso *"
            type="email"
            placeholder="cajero@ejemplo.com"
            value={asignarEmail}
            onChange={(e) => setAsignarEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <Input
            label="Nueva contraseña *"
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={asignarPassword}
            onChange={(e) => setAsignarPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />

          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-900 dark:text-amber-300">
            <strong>Importante:</strong> Para que el cajero entre de inmediato sin confirmación por correo, desactivá <em>Confirm email</em> en Supabase (Authentication → Providers → Email).
          </div>
        </form>
      </Modal>

      {/* Modal para importar y restaurar backup (Rollback) */}
      <ImportarCatalogoModal
        isOpen={modalImportarOpen}
        onClose={() => setModalImportarOpen(false)}
        onImportCompletado={async () => {
          await cargarDatos()
          toast.success('Catálogo restaurado y sincronizado correctamente')
        }}
        categorias={categorias}
        modoInicial="ROLLBACK"
        titulo="Restaurar Copia de Seguridad (Rollback de Datos)"
      />
    </div>
  )
}
