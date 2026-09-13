import { useState, useEffect } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useAuthStore } from '../../stores/authStore'

const MAX_INTENTOS = 5
const TIEMPO_BLOQUEO_SEGUNDOS = 60 // 1 minuto de enfriamiento

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { login, cargando, error } = useAuthStore()

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

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-8 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mb-2 tracking-tight">KioskoPOS</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Sistema de Ventas</p>
        </div>

        {/* Formulario */}
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

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
          KioskoPOS v1.0 · Sistema de gestión de kioscos
        </p>
      </div>
    </div>
  )
}
