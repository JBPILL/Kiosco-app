import { useState, useEffect } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import toast from 'react-hot-toast'

const MAX_INTENTOS = 5
const TIEMPO_BLOQUEO_SEGUNDOS = 60 // 1 minuto de enfriamiento

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { login, cargando, error, esModoRecuperacion, setModoRecuperacion, cargarSesion } = useAuthStore()

  // Estados para solicitar enlace de recuperación
  const [modalRecuperarOpen, setModalRecuperarOpen] = useState(false)
  const [emailRecuperar, setEmailRecuperar] = useState('')
  const [enviandoRecuperacion, setEnviandoRecuperacion] = useState(false)
  const [recuperacionEnviada, setRecuperacionEnviada] = useState(false)

  // Estados para establecer nueva contraseña desde el enlace del email
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [confirmarPassword, setConfirmarPassword] = useState('')
  const [guardandoNuevaPassword, setGuardandoNuevaPassword] = useState(false)

  // Protección contra fuerza bruta
  const [intentos, setIntentos] = useState<number>(() => {
    const saved = localStorage.getItem('kioskopos_login_intentos')
    return saved ? parseInt(saved, 10) : 0
  })
  const [bloqueadoHasta, setBloqueadoHasta] = useState<number | null>(() => {
    const saved = localStorage.getItem('kioskopos_login_bloqueo')
    if (saved) {
      const timestamp = parseInt(saved, 10)
      if (timestamp > Date.now()) return timestamp
      localStorage.removeItem('kioskopos_login_bloqueo')
      localStorage.removeItem('kioskopos_login_intentos')
    }
    return null
  })
  const [segundosRestantes, setSegundosRestantes] = useState<number>(0)

  // Temporizador para cuenta regresiva de desbloqueo
  useEffect(() => {
    if (!bloqueadoHasta) {
      setSegundosRestantes(0)
      return
    }

    const actualizarSegundos = () => {
      const diff = Math.max(0, Math.ceil((bloqueadoHasta - Date.now()) / 1000))
      setSegundosRestantes(diff)
      if (diff === 0) {
        setBloqueadoHasta(null)
        setIntentos(0)
        localStorage.removeItem('kioskopos_login_bloqueo')
        localStorage.removeItem('kioskopos_login_intentos')
      }
    }

    actualizarSegundos()
    const timer = setInterval(actualizarSegundos, 1000)
    return () => clearInterval(timer)
  }, [bloqueadoHasta])

  const estaBloqueado = segundosRestantes > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (estaBloqueado) return

    try {
      await login(email, password)
      // Login exitoso: reiniciar contador
      localStorage.removeItem('kioskopos_login_intentos')
      localStorage.removeItem('kioskopos_login_bloqueo')
      setIntentos(0)
      setBloqueadoHasta(null)
    } catch {
      const nuevosIntentos = intentos + 1
      setIntentos(nuevosIntentos)
      localStorage.setItem('kioskopos_login_intentos', String(nuevosIntentos))

      if (nuevosIntentos >= MAX_INTENTOS) {
        const hasta = Date.now() + TIEMPO_BLOQUEO_SEGUNDOS * 1000
        setBloqueadoHasta(hasta)
        localStorage.setItem('kioskopos_login_bloqueo', String(hasta))
      }
    }
  }

  const handleSolicitarRecuperacion = async (e: React.FormEvent) => {
    e.preventDefault()
    const correo = emailRecuperar.trim()
    if (!correo) {
      toast.error('Ingresá tu correo electrónico')
      return
    }

    setEnviandoRecuperacion(true)
    try {
      const redirectUrl = window.location.origin
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(correo, {
        redirectTo: redirectUrl,
      })

      if (resetError) {
        let msg = resetError.message
        const lower = msg.toLowerCase()
        if (lower.includes('rate limit')) {
          msg = 'Demasiadas solicitudes seguidas. Por favor esperá unos minutos antes de volver a intentar.'
        } else if (lower.includes('error sending recovery email') || lower.includes('error sending')) {
          msg = 'No se pudo enviar el correo de recuperación. Verificá la configuración del servidor de correos (Resend/SMTP).'
        }
        throw new Error(msg)
      }

      setRecuperacionEnviada(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al solicitar recuperación')
    } finally {
      setEnviandoRecuperacion(false)
    }
  }

  const handleGuardarNuevaPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (nuevaPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }

    if (nuevaPassword !== confirmarPassword) {
      toast.error('Las contraseñas no coinciden')
      return
    }

    setGuardandoNuevaPassword(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: nuevaPassword,
      })

      if (updateError) throw updateError

      toast.success('¡Contraseña actualizada con éxito! Ingresando al sistema...', { duration: 5000 })

      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname)
      }
      setModoRecuperacion(false)
      setNuevaPassword('')
      setConfirmarPassword('')

      await cargarSesion()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar la contraseña')
    } finally {
      setGuardandoNuevaPassword(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-8 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mb-2 tracking-tight">KioskoPOS</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Sistema de Ventas</p>
        </div>

        {/* Modo 1: Restablecer Contraseña (abierto desde el correo de Resend/Supabase) */}
        {esModoRecuperacion ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <div className="text-center pb-2 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Crear nueva contraseña</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Ingresá tu nueva clave para acceder a tu cuenta de KioskoPOS.
              </p>
            </div>

            <form onSubmit={handleGuardarNuevaPassword} className="space-y-4">
              <Input
                label="Nueva contraseña *"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={nuevaPassword}
                onChange={(e) => setNuevaPassword(e.target.value)}
                required
                minLength={6}
                autoFocus
              />
              <Input
                label="Confirmar nueva contraseña *"
                type="password"
                placeholder="Repetí la contraseña"
                value={confirmarPassword}
                onChange={(e) => setConfirmarPassword(e.target.value)}
                required
                minLength={6}
              />

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={guardandoNuevaPassword}
                className="mt-4"
              >
                Guardar nueva contraseña
              </Button>

              <button
                type="button"
                onClick={() => {
                  setModoRecuperacion(false)
                  if (typeof window !== 'undefined') {
                    window.history.replaceState(null, '', window.location.pathname)
                  }
                }}
                className="w-full text-center text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 pt-2"
              >
                Volver al inicio de sesión
              </button>
            </form>
          </div>
        ) : (
          /* Modo 2: Formulario de inicio de sesión estándar */
          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={estaBloqueado}
                autoComplete="email"
              />
              <div>
                <Input
                  label="Contraseña"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={estaBloqueado}
                  autoComplete="current-password"
                />
                <div className="flex justify-end mt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEmailRecuperar(email)
                      setRecuperacionEnviada(false)
                      setModalRecuperarOpen(true)
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              </div>
            </div>

            {/* Alerta de bloqueo por fuerza bruta */}
            {estaBloqueado ? (
              <div className="mt-4 p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-center space-y-1">
                <p className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">
                  Acceso temporalmente bloqueado
                </p>
                <p className="text-xs text-red-600 dark:text-red-300">
                  Se detectaron {MAX_INTENTOS} intentos fallidos consecutivos. Por motivos de seguridad, espere:
                </p>
                <p className="text-lg font-bold text-red-700 dark:text-red-400 font-mono">
                  {segundosRestantes} segundos
                </p>
              </div>
            ) : (
              <>
                {error && (
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                    {intentos > 0 && intentos < MAX_INTENTOS && (
                      <p className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-1">
                        Intentos restantes antes del bloqueo temporal: {MAX_INTENTOS - intentos}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            <Button
              type="submit"
              fullWidth
              size="lg"
              loading={cargando}
              disabled={estaBloqueado}
              className="mt-6"
            >
              {estaBloqueado ? `Bloqueado (${segundosRestantes}s)` : 'Ingresar'}
            </Button>
          </form>
        )}

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
          KioskoPOS v1.0 · Sistema de gestión de kioscos
        </p>
      </div>

      {/* Modal para solicitar enlace de recuperación de contraseña */}
      <Modal
        isOpen={modalRecuperarOpen}
        onClose={() => {
          setModalRecuperarOpen(false)
          setRecuperacionEnviada(false)
          setEmailRecuperar('')
        }}
        title="Recuperar contraseña"
        size="sm"
      >
        {recuperacionEnviada ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
              ✓
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
              ¡Enlace enviado con éxito!
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              Enviamos las instrucciones a <strong>{emailRecuperar}</strong>. Abrí el correo y tocá el enlace para definir tu nueva clave.
            </p>
            <p className="text-[11px] text-gray-400 italic">
              Si no lo encontrás en tu bandeja de entrada, revisá la carpeta de correo no deseado o spam.
            </p>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setModalRecuperarOpen(false)
                setRecuperacionEnviada(false)
                setEmailRecuperar('')
              }}
              className="mt-2 text-xs font-semibold"
            >
              Cerrar y volver al ingreso
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSolicitarRecuperacion} className="space-y-4 py-1">
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              Ingresá tu correo electrónico. Te enviaremos un enlace seguro para que puedas crear una nueva contraseña.
            </p>

            <Input
              label="Correo electrónico *"
              type="email"
              placeholder="tu@email.com"
              value={emailRecuperar}
              onChange={(e) => setEmailRecuperar(e.target.value)}
              required
              autoFocus
            />

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => setModalRecuperarOpen(false)}
                disabled={enviandoRecuperacion}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                fullWidth
                loading={enviandoRecuperacion}
              >
                Enviar enlace
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
