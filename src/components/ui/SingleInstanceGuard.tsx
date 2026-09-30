import { useState, useEffect, useRef, useCallback } from 'react'
import { AlPasoLogo } from './AlPasoLogo'
import { Button } from './Button'
import { useAuthStore } from '../../stores/authStore'

const LOCK_NAME = 'alpaso_pos_single_tab_lock'
const CHANNEL_NAME = 'alpaso_pos_single_instance_channel'
const LS_ACTIVE_TAB = 'alpaso_pos_active_tab_id'
const LS_HEARTBEAT = 'alpaso_pos_active_tab_heartbeat'

interface MessagePayload {
  type: 'CLAIM_PRIMARY' | 'PRIMARY_CLOSED' | 'PING' | 'PONG'
  tabId: string
}

/**
 * Detecta si el dispositivo es un teléfono o tablet (iOS, Android, etc.)
 * En dispositivos móviles, los sistemas operativos congelan las pestañas en segundo plano
 * y no se operan dos cajas con pistola en paralelo, por lo que el bloqueo no debe aplicarse.
 */
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  const isTouchSmallScreen =
    Boolean(window.matchMedia && window.matchMedia('(max-width: 1024px)').matches) &&
    (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)
  return isMobileUA || isTouchSmallScreen
}

export function SingleInstanceGuard({ children }: { children: React.ReactNode }) {
  const usuario = useAuthStore((s) => s.usuario)
  const [isBlocked, setIsBlocked] = useState(false)
  const [cerrarAviso, setCerrarAviso] = useState(false)

  // En dispositivos móviles o cuando no hay un usuario autenticado (pantalla de Login),
  // no activamos el bloqueo exclusivo para evitar dejar encerrado al usuario.
  const isMobile = isMobileDevice()
  const enabled = Boolean(usuario) && !isMobile

  // Identificador único para esta pestaña en memoria
  const tabIdRef = useRef<string>(
    'tab_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now()
  )

  const isPrimaryRef = useRef(false)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const releaseLockRef = useRef<(() => void) | null>(null)
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Detener el latido de actividad
  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
  }, [])

  // Iniciar latido de actividad en localStorage (respaldo adicional a Web Locks)
  const startHeartbeat = useCallback(() => {
    stopHeartbeat()
    localStorage.setItem(LS_ACTIVE_TAB, tabIdRef.current)
    localStorage.setItem(LS_HEARTBEAT, Date.now().toString())

    heartbeatTimerRef.current = setInterval(() => {
      if (isPrimaryRef.current) {
        localStorage.setItem(LS_ACTIVE_TAB, tabIdRef.current)
        localStorage.setItem(LS_HEARTBEAT, Date.now().toString())
      }
    }, 2000)
  }, [stopHeartbeat])

  // Ceder el control si otra pestaña lo solicitó
  const yieldLock = useCallback(() => {
    isPrimaryRef.current = false
    stopHeartbeat()
    if (releaseLockRef.current) {
      releaseLockRef.current()
      releaseLockRef.current = null
    }
    setIsBlocked(true)
  }, [stopHeartbeat])

  // Intentar adquirir el bloqueo exclusivo de ventana
  const requestAppLock = useCallback(async () => {
    if (!enabled) {
      setIsBlocked(false)
      return
    }

    // 1. Usar Web Locks API si está soportado nativamente por el navegador
    if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks?.request) {
      try {
        navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            // El candado ya lo tiene otra pestaña abierta
            isPrimaryRef.current = false
            setIsBlocked(true)
            return
          }

          // Candado obtenido con éxito
          isPrimaryRef.current = true
          setIsBlocked(false)
          startHeartbeat()

          // Mantener el candado activo hasta que la pestaña se cierre o ceda voluntariamente
          await new Promise<void>((resolve) => {
            releaseLockRef.current = resolve
          })
        }).catch((err) => {
          // Si otra pestaña fuerza la toma del candado (steal: true)
          if (err?.name === 'AbortError') {
            isPrimaryRef.current = false
            setIsBlocked(true)
            stopHeartbeat()
          } else {
            console.warn('Error al solicitar Web Lock:', err)
          }
        })
        return
      } catch (err) {
        console.warn('Fallo en navigator.locks, usando fallback:', err)
      }
    }

    // 2. Fallback mediante localStorage + timestamp si Web Locks no estuviera disponible
    const activeId = localStorage.getItem(LS_ACTIVE_TAB)
    const lastHeartbeat = parseInt(localStorage.getItem(LS_HEARTBEAT) || '0', 10)
    const isRecent = Date.now() - lastHeartbeat < 4000

    if (activeId && activeId !== tabIdRef.current && isRecent) {
      isPrimaryRef.current = false
      setIsBlocked(true)
    } else {
      isPrimaryRef.current = true
      setIsBlocked(false)
      startHeartbeat()
    }
  }, [enabled, startHeartbeat, stopHeartbeat])

  useEffect(() => {
    if (!enabled) {
      setIsBlocked(false)
      return
    }

    // Configurar canal de comunicación entre pestañas
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CHANNEL_NAME)
      channelRef.current = channel

      channel.onmessage = (event: MessageEvent<MessagePayload>) => {
        const { type, tabId } = event.data || {}

        // Otra pestaña pidió tomar el control
        if (type === 'CLAIM_PRIMARY' && tabId !== tabIdRef.current) {
          if (isPrimaryRef.current) {
            yieldLock()
          }
        }

        // La pestaña primaria se cerró
        if (type === 'PRIMARY_CLOSED' && tabId !== tabIdRef.current) {
          setTimeout(() => {
            requestAppLock()
          }, 200)
        }
      }
    }

    // Solicitar bloqueo inicial al cargar la página
    requestAppLock()

    // Si la pestaña vuelve a tener foco / visibilidad y el candado anterior expiró
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isPrimaryRef.current) {
        const lastHeartbeat = parseInt(localStorage.getItem(LS_HEARTBEAT) || '0', 10)
        if (Date.now() - lastHeartbeat > 4000) {
          requestAppLock()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Limpieza al cerrar o navegar
    const handleBeforeUnload = () => {
      if (isPrimaryRef.current) {
        channelRef.current?.postMessage({
          type: 'PRIMARY_CLOSED',
          tabId: tabIdRef.current,
        })
        if (localStorage.getItem(LS_ACTIVE_TAB) === tabIdRef.current) {
          localStorage.removeItem(LS_ACTIVE_TAB)
          localStorage.removeItem(LS_HEARTBEAT)
        }
        if (releaseLockRef.current) {
          releaseLockRef.current()
        }
      }
      stopHeartbeat()
      channelRef.current?.close()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      stopHeartbeat()
      channelRef.current?.close()
    }
  }, [enabled, requestAppLock, yieldLock, stopHeartbeat])

  // Acción: Reclamar el control forzosamente en esta ventana
  const handleClaimPrimary = async () => {
    // 1. Notificar a las demás pestañas para que cedan amigablemente
    channelRef.current?.postMessage({
      type: 'CLAIM_PRIMARY',
      tabId: tabIdRef.current,
    })

    // 2. Forzar toma del candado con Web Locks API (steal: true desaloja inmediatamente a pestañas congeladas)
    if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks?.request) {
      try {
        navigator.locks.request(LOCK_NAME, { steal: true }, async (lock) => {
          if (lock) {
            isPrimaryRef.current = true
            setIsBlocked(false)
            startHeartbeat()
            await new Promise<void>((resolve) => {
              releaseLockRef.current = resolve
            })
          }
        }).catch((err) => {
          if (err?.name === 'AbortError') {
            isPrimaryRef.current = false
            setIsBlocked(true)
            stopHeartbeat()
          }
        })
        isPrimaryRef.current = true
        setIsBlocked(false)
        return
      } catch (err) {
        console.warn('Fallo steal WebLock, usando fallback:', err)
      }
    }

    // 3. Fallback en localStorage
    localStorage.setItem(LS_ACTIVE_TAB, tabIdRef.current)
    localStorage.setItem(LS_HEARTBEAT, Date.now().toString())
    isPrimaryRef.current = true
    setIsBlocked(false)
    startHeartbeat()
  }

  // Acción: Cerrar esta ventana
  const handleCloseWindow = () => {
    try {
      window.close()
    } catch {
      // Ignorar si el navegador bloquea scripts
    }
    setCerrarAviso(true)
  }

  // Si no está habilitado (móviles o sin usuario), renderizar directamente
  if (!enabled) {
    return <>{children}</>
  }

  return (
    <>
      {children}

      {/* Pantalla de bloqueo si la app ya está abierta en otra pestaña de esta misma computadora */}
      {isBlocked && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-gray-950/85 backdrop-blur-md select-none">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-3xl border-2 border-gray-300 dark:border-gray-700 p-6 sm:p-8 text-center shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Logo */}
            <div className="flex justify-center">
              <AlPasoLogo size="md" layout="vertical" />
            </div>

            {/* Badge de estado */}
            <div>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300">
                Ventana en segundo plano
              </span>
            </div>

            {/* Título y Explicación */}
            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight">
                Sistema en uso en otra ventana
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                AlPaso POS ya se encuentra activo en otra pestaña de este equipo o navegador. Para evitar ventas duplicadas, desajustes de stock o errores en el arqueo de caja, solo se permite operar en una ventana a la vez.
              </p>
            </div>

            {/* Acciones */}
            <div className="space-y-3 pt-2">
              <Button
                type="button"
                variant="primary"
                onClick={handleClaimPrimary}
                className="w-full py-3 text-sm font-bold shadow-md cursor-pointer"
              >
                Usar en esta ventana
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={handleCloseWindow}
                className="w-full py-2.5 text-xs font-semibold cursor-pointer"
              >
                Cerrar esta ventana
              </Button>

              {cerrarAviso && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Podés cerrar esta pestaña directamente desde la cruz de tu navegador.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
