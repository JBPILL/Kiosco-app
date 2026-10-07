import { useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { ETIQUETAS_REPARACION, TRANSICIONES_REPARACION, validarReparacion } from '../../lib/electronicaValidation'
import { useElectronicaStore } from '../../stores/electronicaStore'
import type { DatosReparacion, EstadoReparacion, ReparacionElectronica } from '../../types/electronica'
import { useElectronicaContexto, useSolicitudElectronica } from './useElectronicaContexto'

interface Props { anterior?: ReparacionElectronica; identidad: string; onClose: () => void }
const campo = 'w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all'

export function ReparacionModal({ anterior, identidad, onClose }: Props) {
  const { guardarReparacion } = useElectronicaStore()
  const vigente = useElectronicaContexto(identidad)
  const [datos, setDatos] = useState<DatosReparacion>(() => anterior ? {
    cliente_nombre: anterior.cliente_nombre, cliente_contacto: anterior.cliente_contacto, equipo: anterior.equipo,
    identificador: anterior.identificador, informe_falla: anterior.informe_falla, diagnostico: anterior.diagnostico,
    estado: anterior.estado, presupuesto: anterior.presupuesto,
  } : { cliente_nombre: '', cliente_contacto: null, equipo: '', identificador: null, informe_falla: '', diagnostico: null, estado: 'RECIBIDA', presupuesto: null })
  const [presupuesto, setPresupuesto] = useState(anterior?.presupuesto?.toString() ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const solicitudId = useSolicitudElectronica(JSON.stringify({ datos, presupuesto, id: anterior?.id, version: anterior?.version }))
  const terminal = anterior ? TRANSICIONES_REPARACION[anterior.estado].length === 0 : false
  const estados = anterior ? [anterior.estado, ...TRANSICIONES_REPARACION[anterior.estado]] : ['RECIBIDA'] as const
  function cambiar<K extends keyof DatosReparacion>(campoNombre: K, valor: DatosReparacion[K]) {
    setDatos(previo => ({ ...previo, [campoNombre]: valor }))
    setError('')
  }
  async function guardar() {
    if (!vigente() || terminal || guardando) return
    let valido: DatosReparacion
    try { valido = validarReparacion({ ...datos, presupuesto: presupuesto.trim() ? Number(presupuesto) : null }, anterior?.estado) }
    catch (err) { setError(err instanceof Error ? err.message : 'Revisá los datos'); return }
    if (anterior?.estado !== valido.estado && ['AUTORIZADA', 'ENTREGADA', 'CANCELADA'].includes(valido.estado)) {
      const aviso = valido.estado === 'AUTORIZADA' ? 'Confirmá que el cliente autorizó el presupuesto. Este registro no cobra.'
        : valido.estado === 'ENTREGADA' ? 'Confirmá que se entregó el equipo. La entrega queda cerrada; este registro no cobra.'
          : 'Confirmá la cancelación. Esta orden quedará cerrada.'
      if (!window.confirm(aviso)) return
    }
    setGuardando(true); setError('')
    try {
      await guardarReparacion(valido, solicitudId, anterior)
      if (!vigente()) return
      toast.success('Orden de reparación guardada')
      onClose()
    } catch (err) {
      if (vigente()) setError(err instanceof Error ? err.message : 'El servidor no confirmó la orden')
    } finally { if (vigente()) setGuardando(false) }
  }
  return <Modal isOpen title={anterior ? 'Editar orden de reparación' : 'Nueva reparación'} size="xl" onClose={() => { if (!guardando) onClose() }}>
    <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">No registres PIN, contraseñas ni claves del dispositivo. Pedí únicamente datos necesarios para el servicio.</p>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); void guardar() }}>
      <fieldset disabled={guardando || terminal} className="space-y-4">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4 shadow-sm grid gap-3 sm:grid-cols-2">
          <h3 className="sm:col-span-2 text-sm font-bold">Cliente y equipo</h3>
          <Input label="Nombre del cliente" aria-label="Nombre del cliente" maxLength={160} value={datos.cliente_nombre} onChange={e => cambiar('cliente_nombre', e.target.value)} />
          <Input label="Contacto" aria-label="Contacto" maxLength={120} value={datos.cliente_contacto ?? ''} onChange={e => cambiar('cliente_contacto', e.target.value)} />
          <Input label="Equipo y modelo" aria-label="Equipo y modelo" maxLength={160} value={datos.equipo} onChange={e => cambiar('equipo', e.target.value)} />
          <Input label="Identificador del equipo (opcional)" aria-label="Identificador del equipo" maxLength={80} value={datos.identificador ?? ''} onChange={e => cambiar('identificador', e.target.value)} />
        </div>
        <label className="block text-xs font-semibold">Falla informada<textarea aria-label="Falla informada" className={`${campo} mt-1`} rows={3} maxLength={2000} value={datos.informe_falla} onChange={e => cambiar('informe_falla', e.target.value)} /></label>
        <label className="block text-xs font-semibold">Diagnóstico (opcional)<textarea aria-label="Diagnóstico" className={`${campo} mt-1`} rows={3} maxLength={2000} value={datos.diagnostico ?? ''} onChange={e => cambiar('diagnostico', e.target.value)} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">Estado<select aria-label="Estado de reparación" className={`${campo} mt-1`} value={datos.estado} onChange={e => cambiar('estado', e.target.value as EstadoReparacion)}>{estados.map(estado => <option key={estado} value={estado}>{ETIQUETAS_REPARACION[estado]}</option>)}</select></label>
          <Input label="Presupuesto (opcional)" aria-label="Presupuesto" type="number" min="0" step="0.01" value={presupuesto} onChange={e => { setPresupuesto(e.target.value); setError('') }} />
        </div>
      </fieldset>
      <p className="text-xs text-gray-500">El presupuesto es informativo y no está cobrado. Registrá el cobro por el circuito habitual de ventas.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 dark:border-gray-700 pt-4"><Button size="sm" type="button" variant="secondary" disabled={guardando} onClick={onClose}>Cancelar</Button><Button size="sm" type="submit" loading={guardando} disabled={terminal}>Guardar reparación</Button></div>
    </form>
  </Modal>
}
