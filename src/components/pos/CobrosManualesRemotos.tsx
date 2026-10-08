import { useEffect, useState } from 'react'
import { consultarPendientesRemotos, recuperarEntradaRemota, type CobroManualRemoto } from '../../lib/manualCheckoutRemote'
import { cancelarCobroManualRemoto, recuperarCancelacionManualLocal } from '../../lib/manualCheckoutClient'
import type { CobroManualLocal } from '../../lib/manualCheckoutOutbox'
import { CancelarCobroManualModal } from './CancelarCobroManualModal'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { RefreshButton } from '../ui/RefreshButton'
import { Button } from '../ui/Button'
import { RecuperarCobroRemotoModal } from './RecuperarCobroRemotoModal'
import type { EntradaCheckoutManual } from '../../types/checkoutManual'
import { formatPrecio } from '../../lib/utils'

export function CobrosManualesRemotos({ kioscoId }: { kioscoId: string }) {
  const online = useOnlineStatus()
  const [filas, setFilas] = useState<CobroManualRemoto[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [mas, setMas] = useState(false)
  const [revision, setRevision] = useState(0)
  const [cancelar, setCancelar] = useState<CobroManualLocal | null>(null)
  const [recuperando, setRecuperando] = useState(false)
  const [confirmar, setConfirmar] = useState<EntradaCheckoutManual | null>(null)
  async function recuperar(cobro: CobroManualRemoto) {
    if (!online || recuperando || ocupado) return
    setRecuperando(true); setError('')
    try {
      const entrada = await recuperarEntradaRemota(cobro)
      if (await recuperarCancelacionManualLocal(cobro.id)) throw new Error('Cancelación en curso')
      setConfirmar(entrada)
    } catch { setError('No se pudo recuperar el cobro. Revisá cancelaciones pendientes y Reportes antes de continuar.') }
    finally { setRecuperando(false) }
  }
  async function revisar(cobro: CobroManualRemoto) {
    if (!online || recuperando || ocupado) return
    setRecuperando(true); setError('')
    try {
      const entrada = await recuperarEntradaRemota(cobro)
      const durable = await recuperarCancelacionManualLocal(cobro.id)
      setCancelar(durable ?? { id: cobro.id, kioscoId: cobro.kioscoId, usuarioId: cobro.usuarioId,
        ticketClave: `remoto:${cobro.id}`, entrada, estado: 'PENDIENTE', resultado: null, ultimoError: null })
    } catch { setError('No se pudo recuperar el pendiente. Actualizá la revisión o consultá Reportes.') }
    finally { setRecuperando(false) }
  }
  useEffect(() => { if (online) setCursor(null) }, [online])
  useEffect(() => {
    let vigente = true
    if (!online) return
    setOcupado(true); setError('')
    void consultarPendientesRemotos(kioscoId, cursor).then(datos => {
      if (!vigente) return
      setFilas(previas => cursor ? [...previas.filter(f => !datos.some(d => d.id === f.id)), ...datos] : datos)
      setMas(datos.length === 50)
    }).catch(() => { if (vigente) { setError('No se pudo actualizar la revisión del servidor.'); setMas(false) } })
      .finally(() => { if (vigente) setOcupado(false) })
    return () => { vigente = false }
  }, [kioscoId, online, cursor, revision])
  return <section className="shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-sm">
    <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-bold">Pendientes del servidor · {filas.length}</h2><RefreshButton refreshing={ocupado} disabled={!online || recuperando} label="Actualizar pendientes del servidor" onClick={() => { setCursor(null); setRevision(v => v + 1) }} /></div>
    {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
    {confirmar && <RecuperarCobroRemotoModal entrada={confirmar} onClose={() => setConfirmar(null)} onConfirmado={() => { setConfirmar(null); setCursor(null); setRevision(v => v + 1) }} />}
    {!online && <p className="mt-2 text-xs text-amber-500">Sin conexión · revisión sin actualizar</p>}
    <div className="mt-2 max-h-32 overflow-y-auto space-y-2">{filas.map(f => <div key={f.id} className="rounded-lg bg-gray-50 dark:bg-gray-900/30 p-2 text-xs"><strong>{f.id.slice(0, 8).toUpperCase()} · {formatPrecio(f.total)}</strong><span className="ml-2 text-gray-500">{new Date(f.fechaHora).toLocaleString('es-AR')}</span><p className="text-gray-500">Operador {f.usuarioId.slice(0, 8)} · Caja {f.sesionCajaId.slice(0, 8)}</p><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="danger" disabled={!online || ocupado || recuperando} onClick={() => void revisar(f)}>Revisar cancelación</Button><Button size="sm" variant="secondary" disabled={!online || ocupado || recuperando} onClick={() => void recuperar(f)}>Recuperar cobro</Button></div></div>)}</div>
    {mas && <Button size="sm" variant="secondary" disabled={ocupado || recuperando || !online} onClick={() => setCursor(filas[filas.length - 1].id)}>Ver más pendientes</Button>}
    {cancelar && <CancelarCobroManualModal key={cancelar.id} cobro={cancelar} onClose={() => setCancelar(null)} onCancelado={() => { setCancelar(null); setCursor(null); setRevision(v => v + 1) }} onConfirmar={async solicitud => {
      try { await cancelarCobroManualRemoto(cancelar.entrada, solicitud) }
      catch (fallo) {
        const durable = await recuperarCancelacionManualLocal(cancelar.id)
        if (durable) setCancelar(durable)
        throw fallo
      }
    }} />}
  </section>
}
