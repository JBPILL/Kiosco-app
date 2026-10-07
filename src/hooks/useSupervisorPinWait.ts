import { useEffect, useState } from 'react'

/** Ayuda de interfaz: la fecha y el permiso siempre los valida el servidor. */
export function useSupervisorPinWait(reintentarEn: string | null): number {
  const [ahora, setAhora] = useState(Date.now)
  const hasta = reintentarEn ? Date.parse(reintentarEn) : 0
  useEffect(() => {
    setAhora(Date.now())
    if (!Number.isFinite(hasta) || hasta <= Date.now()) return
    const timer = window.setInterval(() => {
      const actual = Date.now()
      setAhora(actual)
      if (actual >= hasta) window.clearInterval(timer)
    }, 250)
    return () => window.clearInterval(timer)
  }, [hasta])
  return Number.isFinite(hasta) ? Math.max(0, Math.ceil((hasta - ahora) / 1000)) : 0
}
