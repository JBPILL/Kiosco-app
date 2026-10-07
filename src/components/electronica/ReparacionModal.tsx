import { useId, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { Smartphone, Wrench, ShieldCheck } from './ElectronicaIconos'
import { ETIQUETAS_REPARACION, TRANSICIONES_REPARACION, validarReparacion } from '../../lib/electronicaValidation'
import { useElectronicaStore } from '../../stores/electronicaStore'
import type { DatosReparacion, EstadoReparacion, ReparacionElectronica } from '../../types/electronica'
import { useElectronicaContexto, useSolicitudElectronica } from './useElectronicaContexto'

interface Props { anterior?: ReparacionElectronica; identidad: string; onClose: () => void }
const tarjeta = 'rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/25 p-3.5 shadow-sm'
const campo = 'w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500'

export function ReparacionModal({ anterior, identidad, onClose }: Props) {
  const formularioId = useId()
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
  return <Modal isOpen title={anterior ? 'Editar orden de reparación' : 'Nueva reparación'} size="lg"
    onClose={() => { if (!guardando) onClose() }}
    footer={<div className="grid w-full grid-cols-2 gap-2"><Button size="sm" type="button" variant="secondary" disabled={guardando} onClick={onClose}>Cancelar</Button><Button size="sm" form={formularioId} type="submit" loading={guardando} disabled={terminal}>Guardar reparación</Button></div>}>
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50 dark:bg-indigo-950/30 p-3">
      <span className="rounded-lg bg-indigo-100 dark:bg-indigo-900/50 p-2 text-indigo-600 dark:text-indigo-400"><Wrench size={20} /></span>
      <div><p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">Orden de servicio</p><p className="mt-0.5 text-xs text-indigo-700 dark:text-indigo-300">Registrá quién deja el equipo y qué necesita reparar.</p></div>
    </div>
    <form id={formularioId} className="space-y-3" onSubmit={e => { e.preventDefault(); void guardar() }}>
      <fieldset disabled={guardando || terminal} className="space-y-3">
        <section className={tarjeta}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><Smartphone size={17} className="text-indigo-500" />Cliente y equipo</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Nombre del cliente *" aria-label="Nombre del cliente" placeholder="Ej: Ana García" maxLength={160} value={datos.cliente_nombre} onChange={e => cambiar('cliente_nombre', e.target.value)} />
            <Input label="Contacto (opcional)" aria-label="Contacto" placeholder="Teléfono o WhatsApp" maxLength={120} value={datos.cliente_contacto ?? ''} onChange={e => cambiar('cliente_contacto', e.target.value)} />
            <Input label="Equipo y modelo *" aria-label="Equipo y modelo" placeholder="Ej: Samsung Galaxy A54" maxLength={160} value={datos.equipo} onChange={e => cambiar('equipo', e.target.value)} />
            <Input label="Serie / IMEI (opcional)" aria-label="Identificador del equipo" placeholder="Tal como figura en el equipo" maxLength={80} value={datos.identificador ?? ''} onChange={e => cambiar('identificador', e.target.value)} />
          </div>
        </section>
        <section className={tarjeta}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Wrench size={17} className="text-amber-500" />Motivo del servicio</h3>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Falla informada *<textarea aria-label="Falla informada" aria-describedby={`${formularioId}-falla`} className={`${campo} mt-1.5 resize-y`} rows={2} placeholder="Ej: No carga. El cliente indica que recibió un golpe." maxLength={2000} value={datos.informe_falla} onChange={e => cambiar('informe_falla', e.target.value)} /></label>
          <p id={`${formularioId}-falla`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">Describí lo que cuenta el cliente y el estado en que recibís el equipo.</p>
          <details className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-2.5" open={anterior?.diagnostico ? true : undefined}>
            <summary className="cursor-pointer text-xs font-semibold text-indigo-600 dark:text-indigo-400">Agregar diagnóstico técnico (opcional)</summary>
            <label className="mt-2 block text-xs font-semibold text-gray-700 dark:text-gray-300">Diagnóstico<textarea aria-label="Diagnóstico" aria-describedby={`${formularioId}-diagnostico`} className={`${campo} mt-1.5 resize-y`} rows={2} placeholder="Ej: Conector de carga dañado; requiere reemplazo." maxLength={2000} value={datos.diagnostico ?? ''} onChange={e => cambiar('diagnostico', e.target.value)} /></label>
            <p id={`${formularioId}-diagnostico`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">Podés completarlo después de revisar el equipo.</p>
          </details>
        </section>
        <section className={tarjeta}>
          <h3 className="mb-3 text-sm font-bold">Seguimiento y presupuesto</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Estado<select aria-label="Estado de reparación" aria-describedby={`${formularioId}-estado`} className={`${campo} mt-1.5`} value={datos.estado} onChange={e => cambiar('estado', e.target.value as EstadoReparacion)}>{estados.map(estado => <option key={estado} value={estado}>{ETIQUETAS_REPARACION[estado]}</option>)}</select></label>
            <Input label="Presupuesto en $ (opcional)" aria-label="Presupuesto" aria-describedby={`${formularioId}-presupuesto`} placeholder="Sin definir" type="number" min="0" step="0.01" value={presupuesto} onChange={e => { setPresupuesto(e.target.value); setError('') }} />
          </div>
          <p id={`${formularioId}-estado`} className="mt-2 text-xs text-gray-500 dark:text-gray-400">{anterior ? 'Actualizá el estado a medida que avanza el trabajo.' : 'La orden comienza como Recibida. Después podés actualizarla al revisar el equipo.'}</p>
          <p id={`${formularioId}-presupuesto`} className="mt-2 rounded-lg border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-2 text-xs text-emerald-800 dark:text-emerald-300">Guardar el presupuesto no realiza un cobro. Cuando corresponda, registrá el pago desde Punto de Venta.</p>
        </section>
      </fieldset>
      <p className="flex items-start gap-2 px-1 text-xs text-gray-500 dark:text-gray-400"><ShieldCheck size={15} className="shrink-0 mt-0.5" /><span>No ingreses PIN, contraseñas ni claves del dispositivo. Los campos con * son obligatorios.</span></p>
      {error && <p role="alert" className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 p-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  </Modal>
}
