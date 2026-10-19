import { useEffect, useRef, useState } from 'react'
import { QuantityStepper } from '../ui/QuantityStepper'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useAuthStore } from '../../stores/authStore'
import { useCajaStore } from '../../stores/cajaStore'
import type { VentaConDetalles } from '../../stores/devolucionStore'
import { confirmarEntregaPiloto, contextoOperacionPiloto, ejecutarDevolucionEfectivo } from '../../lib/pilotOperationClient'
import type { ResultadoDevolucionEfectivo, SolicitudDevolucionEfectivo } from '../../lib/cashReturnOutbox'
import { formatPrecio } from '../../lib/utils'
import { cargarHistorialDevolucionesTicket, type HistorialDevolucionesTicket } from '../../lib/pilotOperationHistory'

interface Props { isOpen: boolean; ventaInicial: VentaConDetalles | null; onClose: () => void; onDevolucionExitosa: () => void }
export function DevolucionEfectivoModal(props: Props) {
  const usuario = useAuthStore(state => state.usuario)
  if (!props.isOpen || !usuario?.kiosco_id) return null
  if (!usuario.activo || usuario.rol === 'VISOR') return <Modal isOpen onClose={props.onClose} title="Devoluciones"><p>Se requiere un Dueño o Cajero activo para registrar devoluciones.</p></Modal>
  return <ContenidoDevolucion key={`${usuario.id}:${usuario.kiosco_id}:${props.ventaInicial?.id}`} {...props} />
}

function ContenidoDevolucion({ ventaInicial: venta, onClose, onDevolucionExitosa }: Props) {
  const esDueno = useAuthStore(state => state.usuario?.rol === 'DUEÑO')
  const contexto = useRef(contextoOperacionPiloto()).current
  const [seleccion, setSeleccion] = useState<Record<string, { cantidad: string; reingresaStock: boolean }>>({})
  const [motivo, setMotivo] = useState<SolicitudDevolucionEfectivo['motivo']>('CAMBIO_PRODUCTO')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [intentado, setIntentado] = useState(false)
  const [resultado, setResultado] = useState<ResultadoDevolucionEfectivo | null>(null)
  const [historial, setHistorial] = useState<HistorialDevolucionesTicket | null>(null)
  const [errorHistorial, setErrorHistorial] = useState('')
  const [revisionHistorial, setRevisionHistorial] = useState(0)
  const bloqueo = useRef(false)
  const disponible = (detalleId: string) => historial === null ? 0 : Math.max(0, (Math.round(Number(venta?.detalles.find(d => d.id === detalleId)?.cantidad ?? 0) * 1000)
    - Math.round((historial?.cantidadesPorDetalle[detalleId] ?? 0) * 1000)) / 1000)
  const items = Object.entries(seleccion).filter(([, valor]) => Number(valor.cantidad) > 0)
    .map(([detalleId, valor]) => ({ detalleId, cantidad: Number(valor.cantidad), reingresaStock: valor.reingresaStock }))
  const conEnvases = Boolean(venta?.detalles.some(d => d.es_devolucion_envase))
  const mercaderia = venta?.detalles.filter(d => !d.es_devolucion_envase) ?? []
  const completa = items.length === mercaderia.length && mercaderia.every(d => items.some(i => i.detalleId === d.id && i.cantidad === Number(d.cantidad)))
  const admiteFraccion = (detalleId: string) => {
    const d = mercaderia.find(item => item.id === detalleId)
    return Boolean(d && (!Number.isInteger(Number(d.cantidad)) || d.producto?.es_pesable || (d.producto?.unidad_medida && d.producto.unidad_medida !== 'UN')))
  }
  const valida = historial !== null && !errorHistorial && (!conEnvases || (historial.operaciones === 0 && completa))
    && items.length > 0 && items.every(item => Number.isFinite(item.cantidad) && Number(item.cantidad.toFixed(3)) === item.cantidad
    && (admiteFraccion(item.detalleId) || Number.isInteger(item.cantidad)) && item.cantidad >= 0.001 && item.cantidad <= disponible(item.detalleId))
  const excluida = !venta || venta.kiosco_id !== contexto.kioscoId || venta.estado !== 'COMPLETADA' || Boolean(venta.afip_cae)
    || (conEnvases && !esDueno) || Boolean(venta.pagos?.some(p => p.medio_pago !== 'EFECTIVO'))

  useEffect(() => {
    let vigente = true
    setHistorial(null); setErrorHistorial('')
    if (!venta || excluida) return
    void cargarHistorialDevolucionesTicket(contexto.kioscoId, venta.id).then(h => {
      for (const [id, cantidad] of Object.entries(h.cantidadesPorDetalle)) {
        const original = venta.detalles.find(d => d.id === id)
        if (!original || cantidad > Number(original.cantidad)) throw new Error('Historia inconsistente')
      }
      if (vigente) {
        setHistorial(h)
        if (conEnvases && h.operaciones === 0) setSeleccion(Object.fromEntries(mercaderia.map(d => [d.id, { cantidad: String(d.cantidad), reingresaStock: true }])))
      }
    }).catch(() => { if (vigente) setErrorHistorial('No se pudo verificar lo ya devuelto. No se registrará otro reintegro hasta recuperar el historial.') })
    return () => { vigente = false }
  }, [venta, excluida, contexto.kioscoId, revisionHistorial])

  async function confirmar() {
    if (!venta || !valida || excluida || bloqueo.current) return
    const caja = useCajaStore.getState().sesionActiva
    if (!caja || caja.kiosco_id !== contexto.kioscoId) { setError('Abrí una caja de este comercio antes de registrar el reintegro.'); return }
    bloqueo.current = true; setIntentado(true); setOcupado(true); setError('')
    try {
      const base = { id: crypto.randomUUID(), ventaId: venta.id, sesionReintegroId: caja.id, metodo: 'EFECTIVO_CAJA' as const, motivo, notas: notas || null, items }
      const solicitud: SolicitudDevolucionEfectivo = conEnvases
        ? { ...base, version: 2, modalidadEnvases: 'ENTREGAR_ENVASES' } : { ...base, version: 1 }
      const ack = await ejecutarDevolucionEfectivo(contexto, solicitud)
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
        {resultado.envases && <div className="rounded-lg border border-amber-500 p-3 text-sm">
          {resultado.envases.modalidad === 'CONSERVAR_ENVASES' ? <p>Los envases quedan en el kiosco. No entregues vacíos al cliente.</p>
            : <><p>Entregá también los vacíos registrados, después de verificar que no se hayan entregado antes:</p><ul>{resultado.envases.entregas.map(e => <li key={e.tipo_id}>{e.cantidad} × {e.tipo_id}</li>)}</ul></>}
        </div>}
        <p className="text-sm">Verificá que no se haya entregado antes. Si ya se pagó al cliente, no vuelvas a entregar efectivo.</p>
        <Button fullWidth disabled={ocupado} onClick={() => void entregar()}>{resultado.envases?.modalidad === 'ENTREGAR_ENVASES' ? 'Ya verifiqué la entrega de efectivo y envases' : 'Ya verifiqué la entrega de efectivo'}</Button>
        {motivo === 'CAMBIO_PRODUCTO' && <p className="text-sm">Después del reintegro, cargá el reemplazo como una venta normal en el POS.</p>}
      </> : <>
        <p className="text-sm">Elegí qué recibís. Entregá el efectivo sólo después de ver el reintegro confirmado.</p>
        {excluida && <p role="alert" className="text-amber-700 dark:text-amber-300">Se requiere una venta completada, no fiscal y pagada íntegramente en efectivo. Los tickets con envases sólo puede devolverlos el Dueño. Abrí una venta compatible desde Tickets emitidos.</p>}
        {!excluida && (errorHistorial ? <div role="alert" className="space-y-2 text-sm"><p>{errorHistorial}</p><Button size="sm" variant="secondary" onClick={() => setRevisionHistorial(n => n + 1)}>Reintentar historial</Button></div>
          : historial ? <p className="rounded-lg bg-gray-100 p-3 text-sm dark:bg-gray-800">Ya devuelto: {formatPrecio(historial.importeReintegrado)} · {historial.operaciones} devoluciones</p>
          : <p role="status" className="text-sm">Verificando devoluciones anteriores…</p>)}
        <fieldset disabled={ocupado || intentado || excluida || !historial || Boolean(errorHistorial)} className="space-y-3 disabled:opacity-60">
          {conEnvases && <div className="rounded-xl border border-amber-500 p-3 space-y-3">
            <p className="text-sm">Este ticket recibió envases. Se reintegra el efectivo que pagó el cliente y se le devuelven sus envases vacíos. Requiere devolver todos los artículos, sin devoluciones anteriores. Si faltan vacíos, la operación no se confirma.</p>
            {historial !== null && historial.operaciones > 0 && <p role="alert">El ticket ya tiene devoluciones; requiere conciliación antes de continuar.</p>}
            <Button variant="secondary" size="sm" onClick={() => setSeleccion(Object.fromEntries(mercaderia.map(d => [d.id, { cantidad: String(d.cantidad), reingresaStock: seleccion[d.id]?.reingresaStock ?? true }])))}>Seleccionar devolución completa</Button>
          </div>}
          {venta?.detalles.filter(d => !d.es_devolucion_envase).map(detalle => <div key={detalle.id} className="rounded-xl border border-gray-300 dark:border-gray-600 p-3 space-y-2">
            <p className="font-semibold">{detalle.producto?.descripcion || 'Artículo del ticket'} · {Number(detalle.cantidad)} vendidos · {historial ? `${disponible(detalle.id)} disponibles para devolver` : 'disponibilidad pendiente de verificar'}</p>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1"><QuantityStepper label="Cantidad a devolver" max={disponible(detalle.id)} fractional={admiteFraccion(detalle.id)} value={seleccion[detalle.id]?.cantidad ?? ''} onChange={cantidad => setSeleccion(s => ({ ...s, [detalle.id]: { cantidad, reingresaStock: s[detalle.id]?.reingresaStock ?? true } }))} /></div>
              <Button size="sm" variant="secondary" onClick={() => setSeleccion(s => ({ ...s, [detalle.id]: { cantidad: String(disponible(detalle.id)), reingresaStock: s[detalle.id]?.reingresaStock ?? true } }))}>Todo</Button>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={seleccion[detalle.id]?.reingresaStock ?? true} onChange={e => setSeleccion(s => ({ ...s, [detalle.id]: { cantidad: s[detalle.id]?.cantidad ?? '', reingresaStock: e.target.checked } }))} />Volver a poner a la venta</label>
          </div>)}
          <label className="block text-sm">Motivo<select className={entrada} value={motivo} onChange={e => setMotivo(e.target.value as SolicitudDevolucionEfectivo['motivo'])}>
            <option value="CAMBIO_PRODUCTO">Cambio de producto</option><option value="FALLA_ROTURA">Falla o rotura</option><option value="VENCIDO">Vencido</option><option value="ERROR_COBRO">Error de cobro</option><option value="OTRO">Otro motivo</option>
          </select></label>
          <details><summary className="cursor-pointer text-sm">Agregar observaciones</summary><label className="block text-sm">Observaciones<textarea className={entrada} maxLength={1000} value={notas} onChange={e => setNotas(e.target.value)} /></label></details>
          <Button fullWidth disabled={!valida || excluida} onClick={() => void confirmar()}>Confirmar devolución</Button>
        </fieldset>
        {intentado && !ocupado && <p className="text-sm">Si no se confirmó, cerrá y recuperá la operación original desde el panel del POS antes de intentar otra devolución.</p>}
      </>}
      <Button fullWidth variant="ghost" disabled={ocupado} onClick={onClose}>Cerrar</Button>
    </div>
  </Modal>
}
