import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  EVENTO_RESPALDO_EXTERNO, leerDescargaRespaldoExterno, necesitaRecordatorioRespaldo,
} from '../../lib/externalBackupReminder'

interface ExternalBackupReminderProps {
  kioscoId?: string | null
  fechaCreacion?: string
  abrirRespaldos?: () => void
}

export function ExternalBackupReminder({ kioscoId, fechaCreacion, abrirRespaldos }: ExternalBackupReminderProps) {
  const [, actualizar] = useState(0)
  useEffect(() => {
    const refrescar = () => actualizar((version) => version + 1)
    window.addEventListener(EVENTO_RESPALDO_EXTERNO, refrescar)
    window.addEventListener('storage', refrescar)
    window.addEventListener('focus', refrescar)
    const intervalo = window.setInterval(refrescar, 60_000)
    return () => {
      window.removeEventListener(EVENTO_RESPALDO_EXTERNO, refrescar)
      window.removeEventListener('storage', refrescar)
      window.removeEventListener('focus', refrescar)
      window.clearInterval(intervalo)
    }
  }, [])
  if (!kioscoId) return null
  const descarga = leerDescargaRespaldoExterno(kioscoId)
  if (!necesitaRecordatorioRespaldo(descarga, fechaCreacion)) return null
  const estiloAccion = 'shrink-0 text-xs font-semibold underline underline-offset-2 hover:no-underline'
  return (
    <aside aria-label="Recordatorio de respaldo externo" className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-amber-900 dark:text-amber-200">
      <div className="flex-1 text-xs space-y-1">
        <p className="font-semibold">{descarga && Date.parse(descarga.fecha) <= Date.now()
          ? 'Hace más de 7 días que no descargás una copia de seguridad externa.'
          : 'No hay descargas de respaldo registradas en este navegador.'}</p>
        <p>Recomendamos descargar un respaldo a un pendrive o disco externo.</p>
        <p className="text-amber-800 dark:text-amber-300">La fecha registra la solicitud de descarga; verificá que el archivo quedó guardado.</p>
      </div>
      {abrirRespaldos
        ? <button type="button" className={estiloAccion} onClick={abrirRespaldos}>Ir a copias de seguridad</button>
        : <Link className={estiloAccion} to="/config?seccion=backup">Ir a copias de seguridad</Link>}
    </aside>
  )
}
