import { useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useAuthStore } from '../../stores/authStore'
import { useCajaStore } from '../../stores/cajaStore'
import type { VentaConDetalles } from '../../stores/devolucionStore'
import { confirmarEntregaPiloto, contextoOperacionPiloto, ejecutarDevolucionEfectivo } from '../../lib/pilotOperationClient'
import type { ResultadoDevolucionEfectivo, SolicitudDevolucionEfectivo } from '../../lib/cashReturnOutbox'
import { formatPrecio } from '../../lib/utils'

interface Props { isOpen: boolean; ventaInicial: VentaConDetalles | null; onClose: () => void; onDevolucionExitosa: () => void }
export function DevolucionEfectivoModal(props: Props) {
  const usuario = useAuthStore(state => state.usuario)
  if (!props.isOpen || !usuario?.kiosco_id) return null
  if (!usuario.activo || usuario.rol === 'VISOR') return <Modal isOpen onClose={props.onClose} title="Devoluciones"><p>Se requiere un Dueño o Cajero activo para registrar devoluciones.</p></Modal>
  return <ContenidoDevolucion key={`${usuario.id}:${usuario.kiosco_id}:${props.ventaInicial?.id}`} {...props} />
}

function ContenidoDevolucion({ ventaInicial: venta, onClose, onDevolucionExitosa }: Props) {
  const contexto = useRef(contextoOperacionPiloto()).current
  const [seleccion, setSeleccion] = useState<Record<string, { cantidad: string; reingresaStock: boolean }>>({})
  const [motivo, setMotivo] = useState<SolicitudDevolucionEfectivo['motivo']>('CAMBIO_PRODUCTO')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [intentado, setIntentado] = useState(false)
  const [resultado, setResultado] = useState<ResultadoDevolucionEfectivo | null>(null)
  const bloqueo = useRef(false)
  const items = Object.entries(seleccion).filter(([, valor]) => Number(valor.cantidad) > 0)
    .map(([detalleId, valor]) => ({ detalleId, cantidad: Number(valor.cantidad), reingresaStock: valor.reingresaStock }))
  const valida = items.length > 0 && items.every(item => Number.isFinite(item.cantidad) && Number(item.cantidad.toFixed(3)) === item.cantidad
    && item.cantidad >= 0.001 && item.cantidad <= Number(venta?.detalles.find(d => d.id === item.detalleId)?.cantidad ?? 0))
  const excluida = !venta || venta.kiosco_id !== contexto.kioscoId || venta.estado !== 'COMPLETADA' || Boolean(venta.afip_cae)
    || venta.detalles.some(d => d.es_devolucion_envase) || Boolean(venta.pagos?.some(p => p.medio_pago !== 'EFECTIVO'))

  async function confirmar() {
    if (!venta || !valida || excluida || bloqueo.current) return
    const caja = useCajaStore.getState().sesionActiva
    if (!caja || caja.kiosco_id !== contexto.kioscoId) { setError('Abrí una caja de este comercio antes de registrar el reintegro.'); return }
    bloqueo.current = true; setIntentado(true); setOcupado(true); setError('')
    try {
      const ack = await ejecutarDevolucionEfectivo(contexto, { version: 1, id: crypto.randomUUID(), ventaId: venta.id,
        sesionReintegroId: caja.id, metodo: 'EFECTIVO_CAJA', motivo, notas: notas || null, items })
      setResultado(ack)
      onDevolucionExitosa()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo confirmar. Revisá las operaciones pendientes del POS.') }
    finally { setOcupado(false) }
  }

  async function entregar() {
    if (!resultado || ocupado) return
    setOcupado(true)
    try { await confirmarEntregaPiloto(contexto, 'DEVOLUCION', resultado.id); onClose() }
    catch { setError('No se guardó la marca de entrega. Revisá los pendientes antes de volver a pagar.') }
    finally { setOcupado(false) }
  }

  const entrada = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 text-gray-900 dark:text-gray-100'
  return <Modal isOpen onClose={ocupado ? () => {} : onClose} title="Devolución en efectivo" size="lg">
    <div className="space-y-4">
      {error && <p role="alert" className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
      {resultado ? <>
        <h3 className="font-bold text-lg">Devolución registrada</h3>
        <p>Reintegro confirmado: <strong>{formatPrecio(resultado.monto_total)}</strong></p>
        <p className="text-sm">Verificá que no se haya entregado antes. Si ya se pagó al cliente, no vuelvas a entregar efectivo.</p>
        <Button fullWidth disabled={ocupado} onClick={() => void entregar()}>Ya verifiqué la entrega de efectivo</Button>
        {motivo === 'CAMBIO_PRODUCTO' && <p className="text-sm">Después del reintegro, cargá el reemplazo como una venta normal en el POS.</p>}
      </> : <>
        <p className="text-sm">Seleccioná las unidades recibidas. El sistema calcula el reintegro con los descuentos del ticket original y valida lo ya devuelto. No entregues efectivo hasta ver la confirmación y su importe.</p>
        {excluida && <p role="alert" className="text-amber-700 dark:text-amber-300">Esta primera versión requiere una venta completada, no fiscal y pagada íntegramente en efectivo, sin recepción de envases. Abrí una venta compatible desde Tickets emitidos.</p>}
        <fieldset disabled={ocupado || intentado || excluida} className="space-y-3 disabled:opacity-60">
          {venta?.detalles.filter(d => !d.es_devolucion_envase).map(detalle => <div key={detalle.id} className="rounded-xl border border-gray-300 dark:border-gray-600 p-3 space-y-2">
            <p className="font-semibold">{detalle.producto?.descripcion || 'Artículo del ticket'} · {Number(detalle.cantidad)} vendidos</p>
            <label className="block text-sm">Cantidad a devolver
              <input className={entrada} type="number" min="0" max={Number(detalle.cantidad)} step="0.001" value={seleccion[detalle.id]?.cantidad ?? ''} placeholder="0" onChange={e => setSeleccion(s => ({ ...s, [detalle.id]: { cantidad: e.target.value, reingresaStock: s[detalle.id]?.reingresaStock ?? true } }))} />
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={seleccion[detalle.id]?.reingresaStock ?? true} onChange={e => setSeleccion(s => ({ ...s, [detalle.id]: { cantidad: s[detalle.id]?.cantidad ?? '', reingresaStock: e.target.checked } }))} />Reponer al stock vendible (desmarcar si está dañado o vencido)</label>
          </div>)}
          <label className="block text-sm">Motivo<select className={entrada} value={motivo} onChange={e => setMotivo(e.target.value as SolicitudDevolucionEfectivo['motivo'])}>
            <option value="CAMBIO_PRODUCTO">Cambio de producto</option><option value="FALLA_ROTURA">Falla o rotura</option><option value="VENCIDO">Vencido</option><option value="ERROR_COBRO">Error de cobro</option><option value="OTRO">Otro motivo</option>
          </select></label>
          <label className="block text-sm">Observaciones<textarea className={entrada} maxLength={1000} value={notas} onChange={e => setNotas(e.target.value)} /></label>
          <Button fullWidth disabled={!valida || excluida} onClick={() => void confirmar()}>Registrar devolución y calcular reintegro</Button>
        </fieldset>
        {intentado && !ocupado && <p className="text-sm">Si no se confirmó, cerrá y recuperá la operación original desde el panel del POS antes de intentar otra devolución.</p>}
      </>}
      <Button fullWidth variant="ghost" disabled={ocupado} onClick={onClose}>Cerrar</Button>
    </div>
  </Modal>
}
