import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase, createUnauthenticatedClient } from '../lib/supabase'
import { useAuthStore, calcularDiasRestantes } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import type { Kiosco, Usuario, Suscripcion, Categoria } from '../types/database'
import { formatPrecio, formatFechaCorta } from '../lib/utils'
import { exportarCatalogoCSV, exportarVentasCSV } from '../lib/exportUtils'
import { AFIPConfigSection } from '../components/config/AFIPConfigSection'
import { useConfigAdminStore, formatearLinkWhatsApp } from '../stores/configAdminStore'
import { ImportarCatalogoModal } from '../components/catalogo/ImportarCatalogoModal'
import { usePwaStore } from '../stores/pwaStore'
import toast from 'react-hot-toast'

export function ConfigPage() {
  const { usuario } = useAuthStore()
  const { tema, toggleTema } = useThemeStore()
  const { config: configAdmin, cargarConfig: cargarConfigAdmin } = useConfigAdminStore()
  const { puedeInstalar, estaInstalado, instalarApp } = usePwaStore()

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
  }, [cargarConfigAdmin])

  const copiarDato = (texto: string, label: string) => {
    navigator.clipboard.writeText(texto)
    toast.success(`${label} copiado al portapapeles`)
  }

  // Formulario Kiosco
  const [nombreKiosco, setNombreKiosco] = useState('')
  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')

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

  const cargarDatos = useCallback(async () => {
    if (!usuario?.kiosco_id) return
    setCargando(true)

    try {
      // 1. Cargar datos del Kiosco
      const { data: kioscoData } = await supabase
        .from('kioscos')
        .select('*')
        .eq('id', usuario.kiosco_id)
        .single()

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
        .eq('kiosco_id', usuario.kiosco_id)
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
        .eq('kiosco_id', usuario.kiosco_id)
        .order('fecha_creacion')

      if (usuariosData) {
        setUsuarios(usuariosData)
      }

      // 4. Cargar categorías del Kiosco
      const { data: categoriasData } = await supabase
        .from('categorias')
        .select('*')
        .eq('kiosco_id', usuario.kiosco_id)
        .order('orden')

      if (categoriasData) {
        setCategorias(categoriasData as Categoria[])
      }
    } catch (err) {
      console.error('Error al cargar configuración:', err)
      toast.error('Error al cargar datos de configuración')
    } finally {
      setCargando(false)
    }
  }, [usuario?.kiosco_id])

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
      cargarDatos()
    } catch (err) {
      console.error('Error actualizando kiosco:', err)
      toast.error('Error al guardar datos del kiosco')
    } finally {
      setGuardandoKiosco(false)
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
      if (pErr) throw pErr

      const { data: cats } = await supabase
        .from('categorias')
        .select('*')
        .eq('kiosco_id', usuario.kiosco_id)

      exportarCatalogoCSV(prods || [], cats || [], kiosco?.nombre || 'Kiosco')
      toast.success('Copia del catálogo descargada')
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
        .select('*, pagos:pagos_venta(*)')
        .eq('kiosco_id', usuario.kiosco_id)
        .order('fecha', { ascending: false })
      if (vErr) throw vErr

      exportarVentasCSV(vtas || [], kiosco?.nombre || 'Kiosco')
      toast.success('Copia de ventas descargada')
    } catch (err) {
      console.error(err)
      toast.error('Error al exportar ventas')
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
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Configuración</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Administrá tu kiosco, suscripción y equipo de trabajo</p>
      </div>

      {cargando ? (
        <div className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Cargando configuración...</p>
        </div>
      ) : (
        <>
          {/* Apariencia / Modo Oscuro */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Apariencia del Sistema</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Alterná entre tema claro y tema oscuro según la iluminación de tu local.
            </p>

            <div className="flex items-center gap-4">
              <Button
                variant={tema === 'light' ? 'primary' : 'secondary'}
                onClick={() => tema !== 'light' && toggleTema()}
              >
                Modo claro
              </Button>
              <Button
                variant={tema === 'dark' ? 'primary' : 'secondary'}
                onClick={() => tema !== 'dark' && toggleTema()}
              >
                Modo oscuro
              </Button>
            </div>
          </div>

          {/* Datos del Kiosco */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Datos del Negocio</h2>
            <form onSubmit={handleGuardarKiosco} className="space-y-4">
              <Input
                label="Nombre del Kiosco *"
                placeholder="Ej: Kiosco Central"
                value={nombreKiosco}
                onChange={(e) => setNombreKiosco(e.target.value)}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Dirección"
                  placeholder="Ej: Av. San Martín 1234"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                />
                <Input
                  label="Teléfono"
                  placeholder="Ej: 11-2345-6789"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
              </div>

              <div className="pt-2">
                <Button type="submit" loading={guardandoKiosco}>
                  Guardar cambios
                </Button>
              </div>
            </form>
          </div>

          {/* Configuración Fiscal AFIP */}
          <AFIPConfigSection />

          {/* Estado de Suscripción */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Estado de la Suscripción</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Tarjeta 1: Plan */}
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xs">
                <p className="text-xs text-gray-500 dark:text-gray-400">Plan contratado</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {suscripcion?.plan?.nombre || 'Kiosco Pro'}
                </p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">
                  {suscripcion?.plan?.precio_mensual
                    ? `${formatPrecio(suscripcion.plan.precio_mensual)} / mes`
                    : '$35.000 / mes'}
                </p>
              </div>

              {/* Tarjeta 2: Estado del Servicio */}
              <div
                className={`p-4 rounded-xl border shadow-xs ${
                  estadoEfectivo === 'ACTIVO'
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/50'
                    : estadoEfectivo === 'SOLO_LECTURA'
                    ? 'bg-amber-50/50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/60'
                    : 'bg-red-50/50 dark:bg-red-950/30 border-red-300 dark:border-red-800/60'
                }`}
              >
                <p className="text-xs text-gray-500 dark:text-gray-400">Estado de servicio</p>
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
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xs">
                <p className="text-xs text-gray-500 dark:text-gray-400">Vencimiento del Abono</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {suscripcion?.fecha_vencimiento
                    ? formatFechaCorta(suscripcion.fecha_vencimiento)
                    : 'Al día'}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
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
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 space-y-3 mt-3 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700/80 pb-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      Datos de Pago para Renovación de Abono
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Transferí el monto de tu plan y enviá el comprobante al WhatsApp del administrador para registrar la renovación.
                    </p>
                  </div>
                  {configAdmin.whatsapp_soporte && (
                    <a
                      href={formatearLinkWhatsApp(
                        configAdmin.whatsapp_soporte,
                        `Hola! Me comunico desde "${kiosco?.nombre || 'Mi Kiosco'}" para consultar sobre la renovación de mi abono en KioskoPOS.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
                    >
                      WhatsApp Soporte
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
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
                        className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-200 transition-colors flex-shrink-0 active:scale-95"
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
                        className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-200 transition-colors flex-shrink-0 active:scale-95"
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

          {/* Gestión de Personal / Usuarios */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Usuarios del Kiosco</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Roles asignados para operar la caja y reportes</p>
              </div>
              <Button size="sm" onClick={() => setModalUsuarioOpen(true)}>
                + Nuevo usuario
              </Button>
            </div>

            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Nombre</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Rol</th>
                      <th className="px-4 py-3 font-medium">Acceso / Login</th>
                      <th className="px-4 py-3 font-medium">Cuenta de Usuario</th>
                      <th className="px-4 py-3 font-medium text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {usuarios.map((u) => {
                      const esUltimoAdmin = u.rol === 'DUEÑO' && duenosActivos <= 1
                      const esSesionActual = u.id === usuario?.id

                      return (
                        <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{u.nombre}</td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{u.email || '—'}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center justify-center min-w-[70px] px-2.5 py-0.5 text-xs font-semibold rounded-full tracking-wide ${
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
                              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                Habilitado
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium" title="Este usuario aún no tiene contraseña de inicio de sesión">
                                  Sin clave de acceso
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUsuarioParaClave(u)
                                    setAsignarEmail(u.email || '')
                                    setAsignarPassword('')
                                  }}
                                  className="px-2 py-0.5 text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded border border-indigo-200 dark:border-indigo-800 transition-colors"
                                  title="Crear y asignar contraseña para que pueda iniciar sesión"
                                >
                                  Asignar clave
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                                u.activo
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                              }`}
                            >
                              {u.activo ? 'Habilitado' : 'Deshabilitado'}
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
                                className="text-xs text-indigo-600 dark:text-indigo-400 font-medium"
                                title="Sesión activa actualmente"
                              >
                                Tu usuario
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setUsuarioAEliminar(u)}
                                className="px-2.5 py-1 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 rounded-lg transition-colors active:scale-95"
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

          {/* Copias de Seguridad y Resguardo de Datos */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Copias de Seguridad (Backup de Datos)
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Descargá una copia física de la información de tu negocio en formato Excel (.CSV) para tener siempre un resguardo seguro en tu computadora.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 space-y-2 flex flex-col justify-between">
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
                  className="w-full text-xs font-semibold"
                >
                  {exportandoBackup ? 'Generando...' : 'Descargar Catálogo (.CSV)'}
                </Button>
              </div>

              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 space-y-2 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Resguardo Histórico de Ventas
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Descargá el registro histórico de todas las ventas emitidas, totales, fechas y medios de pago cobrados.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleExportarVentas}
                  disabled={exportandoBackup}
                  className="w-full text-xs font-semibold"
                >
                  {exportandoBackup ? 'Generando...' : 'Descargar Ventas (.CSV)'}
                </Button>
              </div>

              <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-indigo-950 dark:text-indigo-200">
                      Restauración y Rollback
                    </h3>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                      Recuperación
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                    Importá un backup de Excel (.CSV) previo para revertir o recuperar productos, precios y niveles de stock.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setModalImportarOpen(true)}
                  className="w-full text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Importar / Restaurar (.CSV)
                </Button>
              </div>
            </div>
          </div>

          {/* Aplicación de Escritorio e Instalación PWA */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Aplicación de Escritorio (PWA Offline)
                  </h2>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      estaInstalado
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : puedeInstalar
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {estaInstalado
                      ? 'Instalada en este equipo'
                      : puedeInstalar
                      ? 'Disponible para instalar'
                      : 'Navegador Web'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Ejecutá KioskoPOS como un programa nativo de Windows: con acceso directo en el Escritorio, fijado en la Barra de Tareas, sin barra del navegador y listo para vender sin conexión a internet.
                </p>
              </div>

              {puedeInstalar && !estaInstalado && (
                <Button
                  variant="primary"
                  onClick={async () => {
                    const exito = await instalarApp()
                    if (exito) toast.success('¡KioskoPOS se instaló exitosamente en tu PC!')
                  }}
                  className="font-bold shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                >
                  Instalar en esta PC
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-xs">
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 space-y-1">
                <span className="font-bold text-gray-800 dark:text-gray-200 block">
                  1. Ventana Independiente
                </span>
                <p className="text-gray-500 dark:text-gray-400">
                  Se abre en su propia ventana maximizada sin distracciones ni barras de navegación para agilizar el cobro en mostrador.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 space-y-1">
                <span className="font-bold text-gray-800 dark:text-gray-200 block">
                  2. 100% Operativo Sin Conexión
                </span>
                <p className="text-gray-500 dark:text-gray-400">
                  Gracias al Service Worker local y caché permanente, si se corta internet el sistema abre al instante y permite seguir vendiendo.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 space-y-1">
                <span className="font-bold text-gray-800 dark:text-gray-200 block">
                  3. Instalación desde el Navegador
                </span>
                <p className="text-gray-500 dark:text-gray-400">
                  En Google Chrome o Edge también podés hacer clic en el ícono de instalación que aparece a la derecha de la barra de direcciones.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal para nuevo usuario */}
      <Modal
        isOpen={modalUsuarioOpen}
        onClose={() => setModalUsuarioOpen(false)}
        title="Agregar usuario"
        size="md"
      >
        <form onSubmit={handleCrearUsuario} className="space-y-4">
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

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rol en el kiosco
            </label>
            <select
              value={nuevoRol}
              onChange={(e) => setNuevoRol(e.target.value as 'CAJERO' | 'VISOR')}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-base text-gray-900 dark:text-gray-100"
            >
              <option value="CAJERO">CAJERO (Solo Punto de Venta, Caja y Clientes)</option>
              <option value="VISOR">VISOR (Solo consulta de reportes y ventas)</option>
            </select>
          </div>

          {/* Información de permisos */}
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl text-xs text-indigo-900 dark:text-indigo-300 space-y-1">
            <p className="font-semibold">Control de permisos del rol CAJERO:</p>
            <p>
              El cajero ingresará a la app con este email y contraseña. No tendrá permisos de administrador: las secciones de <strong>Catálogo</strong>, <strong>Stock</strong>, <strong>Reportes</strong> y <strong>Configuración</strong> estarán totalmente bloqueadas y ocultas.
            </p>
          </div>

          {/* Opciones avanzadas para vincular Auth UID manualmente */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setMostrarAvanzadoAuth(!mostrarAvanzadoAuth)}
              className="text-xs text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 underline font-medium"
            >
              {mostrarAvanzadoAuth ? 'Ocultar opciones avanzadas' : 'Vincular ID de Supabase Auth manualmente'}
            </button>

            {mostrarAvanzadoAuth && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2 text-xs">
                <p className="text-gray-600 dark:text-gray-400">
                  Si ya creaste el usuario directamente en el Dashboard de Supabase (Authentication → Users), pegá acá su User UID:
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

          <div className="flex gap-2 pt-2">
            <Button type="submit" fullWidth loading={creandoUsuario}>
              Guardar usuario
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => setModalUsuarioOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal de confirmación para eliminar usuario */}
      <Modal
        isOpen={!!usuarioAEliminar}
        onClose={() => setUsuarioAEliminar(null)}
        title="Eliminar usuario"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            ¿Estás seguro de que deseás eliminar al usuario <strong>{usuarioAEliminar?.nombre}</strong> ({usuarioAEliminar?.rol})?
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Esta persona ya no podrá ingresar a la aplicación ni operar la caja del kiosco.
          </p>

          <div className="flex gap-2 pt-2">
            <Button
              variant="danger"
              fullWidth
              loading={eliminandoUsuario}
              onClick={handleEliminarUsuario}
            >
              Confirmar eliminación
            </Button>
            <Button
              variant="secondary"
              fullWidth
              disabled={eliminandoUsuario}
              onClick={() => setUsuarioAEliminar(null)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal para asignar clave a usuario existente */}
      <Modal
        isOpen={!!usuarioParaClave}
        onClose={() => setUsuarioParaClave(null)}
        title={`Asignar clave a ${usuarioParaClave?.nombre || ''}`}
        size="sm"
      >
        <form onSubmit={handleAsignarClave} className="space-y-4">
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

          <div className="flex gap-2 pt-2">
            <Button type="submit" fullWidth loading={guardandoClave}>
              Guardar clave
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              disabled={guardandoClave}
              onClick={() => setUsuarioParaClave(null)}
            >
              Cancelar
            </Button>
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
