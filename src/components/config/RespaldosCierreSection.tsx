import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '../ui/Button'
import { useAuthStore } from '../../stores/authStore'
import { listarRespaldosCierreLocal, type RespaldoCierreLocal } from '../../lib/backupCierreLocal'
import { descargarArchivo } from '../../lib/exportUtils'

export function RespaldosCierreSection() {
  const { usuario } = useAuthStore()
  const [copias, setCopias] = useState<RespaldoCierreLocal[]>([])
  const [fallo, setFallo] = useState(false)
  const kioscoId = usuario?.rol === 'DUEÑO' ? usuario.kiosco_id : null
  useEffect(() => {
    let vigente = true
    setCopias([])
    setFallo(false)
    if (kioscoId) void listarRespaldosCierreLocal(kioscoId).then(datos => {
      if (vigente) setCopias(datos.slice(0, 5))
    }).catch(() => { if (vigente) setFallo(true) })
    return () => { vigente = false }
  }, [kioscoId])
  if (!kioscoId) return null
  const copiasDelComercio = copias.filter(copia => copia.kioscoId === kioscoId)
  return <section className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Copias locales de arqueos</h3>
    <p className="text-xs text-gray-500 dark:text-gray-400">
      Últimos cinco cierres guardados en este navegador. Incluyen arqueo y movimientos de caja;
      el catálogo y el historial completo requieren sus propios respaldos.
    </p>
    {fallo ? <p role="alert" className="text-xs text-amber-600 dark:text-amber-300">No se pudieron leer las copias locales.</p>
      : copiasDelComercio.length === 0 ? <p className="text-xs text-gray-500">Todavía no hay arqueos respaldados en este equipo.</p>
      : copiasDelComercio.map(copia => <div key={copia.sesionId} className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 dark:border-gray-700 pt-3">
        <div className="text-xs text-gray-700 dark:text-gray-300">
          <p className="font-semibold">{new Date(copia.fecha).toLocaleString('es-AR')}</p>
          <p>{copia.cierreConfirmadoRemoto ? 'Confirmado en el servidor al crear la copia' : 'Pendiente de sincronización al crear la copia'}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => {
          const actual = useAuthStore.getState().usuario
          if (actual?.rol !== 'DUEÑO' || actual.kiosco_id !== copia.kioscoId) {
            toast.error('La copia no pertenece al comercio activo')
            return
          }
          try {
            descargarArchivo(JSON.stringify(copia, null, 2), `arqueo-${copia.sesionId}.json`, 'application/json')
          } catch { toast.error('No se pudo descargar el arqueo') }
        }}>Descargar arqueo</Button>
      </div>)}
  </section>
}
