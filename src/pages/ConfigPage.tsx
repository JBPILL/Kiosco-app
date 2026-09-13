import { useState, useEffect, useCallback } from 'react'
import { supabase, createUnauthenticatedClient } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import type { Kiosco, Usuario } from '../types/database'
import toast from 'react-hot-toast'

export function ConfigPage() {
  const { usuario } = useAuthStore()
  const { tema, toggleTema } = useThemeStore()

  const [kiosco, setKiosco] = useState<Kiosco | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardandoKiosco, setGuardandoKiosco] = useState(false)

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

      // 2. Cargar usuarios del Kiosco
      const { data: usuariosData } = await supabase
        .from('usuarios')
        .select('*')
        .eq('kiosco_id', usuario.kiosco_id)
        .order('fecha_creacion')

      if (usuariosData) {
        setUsuarios(usuariosData)
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
        try {
          const tempClient = createUnauthenticatedClient()
          const { data: authData, error: authError } = await tempClient.auth.signUp({
            email: nuevoEmail.trim(),
            password: nuevoPassword.trim(),
          })

          if (authError) {
            console.warn('Error en signUp:', authError)
            toast.error(`Aviso en credencial: ${authError.message}`, { duration: 4000 })
          } else if (authData?.user?.id) {
            authUserId = authData.user.id
          }
        } catch (authErr) {
          console.warn('Fallo creación auth:', authErr)
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
      toast.error(err instanceof Error ? err.message : 'Error al crear usuario')
    } finally {
      setCreandoUsuario(false)
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

          {/* Estado de Suscripción */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Estado de la Suscripción</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">Plan contratado</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">Kiosco Pro</p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">$30.000 / mes</p>
              </div>

              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">Estado de servicio</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {kiosco?.estado_suscripcion === 'ACTIVO' ? 'Activo' : kiosco?.estado_suscripcion || 'Activo'}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Acceso total al sistema</p>
              </div>

              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">Soporte y Mantenimiento</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">Incluido</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Copias y actualizaciones</p>
              </div>
            </div>
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
                      <th className="px-4 py-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {usuarios.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{u.nombre}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{u.email || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                            u.rol === 'DUEÑO'
                              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400'
                              : u.rol === 'CAJERO'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                              : 'bg-gray-100 text-gray-700 dark:text-gray-700 dark:text-gray-300'
                          }`}>
                            {u.rol}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {u.auth_user_id ? (
                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              Habilitado
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium" title="Este usuario fue registrado sin contraseña en Supabase Auth">
                              Sin clave de acceso
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                            {u.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
    </div>
  )
}
