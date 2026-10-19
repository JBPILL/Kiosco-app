import { useEffect, useRef, useState } from 'react'
import { QuantityStepper } from '../ui/QuantityStepper'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useAuthStore } from '../../stores/authStore'
import { useCajaStore } from '../../stores/cajaStore'
import { useCartStore } from '../../stores/cartStore'
import { cargarEnvasesCompartidos, type TipoEnvaseCompartido } from '../../lib/envasesData'
import { confirmarEntregaPiloto, contextoOperacionPiloto, ejecutarOperacionEnvase } from '../../lib/pilotOperationClient'
import { formatPrecio } from '../../lib/utils'
import type { ResultadoEnvase } from '../../lib/envasesOutbox'
import type { SolicitudEnvase } from '../../../supabase/functions/_shared/envasesRequest'
import { HistorialEnvases } from './HistorialEnvases'

interface Props { isOpen: boolean; onClose: () => void; administracion?: boolean }
export function EnvasesOperativosModal({ isOpen, onClose, administracion = false }: Props) {
  const usuario = useAuthStore(state => state.usuario)
  if (!isOpen || !usuario?.kiosco_id) return null
  if (!usuario.activo || usuario.rol === 'VISOR') return <Modal isOpen onClose={onClose} title="Envases"><p>Se requiere un Dueño o Cajero activo para operar envases.</p></Modal>
  return <ContenidoEnvases key={`${usuario.id}:${usuario.kiosco_id}:${administracion}`} onClose={onClose} administracion={administracion} />
}

function ContenidoEnvases({ onClose, administracion }: Omit<Props, 'isOpen'>) {
  const contexto = useRef(contextoOperacionPiloto()).current
  const dueno = useAuthStore(state => state.usuario?.rol === 'DUEÑO')
  const [tipos, setTipos] = useState<TipoEnvaseCompartido[]>([])
  const [seleccion, setSeleccion] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [pendientes, setPendientes] = useState('')
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [distribuidor, setDistribuidor] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [confirmado, setConfirmado] = useState<ResultadoEnvase | null>(null)
  const bloqueo = useRef(false)
  const vigente = useRef(true)
  const tipo = tipos.find(t => t.id === seleccion)
  const cant = Number(cantidad)
  const cantidadValida = Number.isInteger(cant) && cant > 0 && cant <= 999999
  useEffect(() => {
    vigente.current = true
    void cargarEnvasesCompartidos(contexto.kioscoId).then(datos => {
      if (vigente.current) { setTipos(datos); setSeleccion(datos.find(t => t.activo)?.id ?? '') }
    }).catch(() => { if (vigente.current) setError('No se pudo cargar el saldo compartido. Cerrá y volvé a intentar.') })
      .finally(() => { if (vigente.current) setCargando(false) })
    return () => { vigente.current = false }
  }, [contexto.kioscoId])

  async function registrar(solicitud: SolicitudEnvase) {
    if (bloqueo.current) return
    bloqueo.current = true; setOcupado(true); setError('')
    try {
      const r = await ejecutarOperacionEnvase(contexto, solicitud)
      if (!vigente.current) return
      if (solicitud.accion === 'RECIBIR_EFECTIVO') setConfirmado(r)
      else onClose()
    } catch (e) {
      if (vigente.current) setError(e instanceof Error ? e.message : 'No se confirmó la operación.')
      // An uncertain request is recovered from the POS panel, never replaced with another ID.
    } finally {
      if (vigente.current) setOcupado(false)
      // Keep this form locked after any attempt; recovery retains the immutable request.
    }
  }

  function agregarAlTicket() {
    if (!tipo?.activo || !cantidadValida || !Number.isInteger(tipo.precio) || tipo.precio <= 0) return
    const actual = contextoOperacionPiloto()
    if (actual.usuarioId !== contexto.usuarioId || actual.kioscoId !== contexto.kioscoId) return
    const carrito = useCartStore.getState()
    if (carrito.cobrosBloqueados[carrito.tabActivaId]) { setError('Recuperá el cobro guardado antes de modificar este ticket.'); return }
    carrito.agregarDevolucionEnvase(tipo.nombre, tipo.precio, cant, tipo.id, true)
    onClose()
  }

  async function entrega() {
    if (!confirmado || ocupado) return
    setOcupado(true)
    try { await confirmarEntregaPiloto(contexto, 'ENVASES', confirmado.id); if (vigente.current) onClose() }
    catch { if (vigente.current) setError('No se pudo guardar la marca de entrega. Revisá el panel de pendientes.') }
    finally { if (vigente.current) setOcupado(false) }
  }

  const entrada = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 text-gray-900 dark:text-gray-100'
  return <Modal isOpen onClose={ocupado ? () => {} : onClose} title={administracion ? 'Depósito de envases' : 'Recibir envases'} size="md">
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {confirmado ? <>
        <h3 className="text-lg font-bold">Recepción registrada</h3>
        <p>Reintegro en caja: <strong>{formatPrecio(confirmado.importe ?? 0)}</strong></p>
        <p className="text-sm">Verificá si el cliente ya recibió el dinero antes de entregarlo. No repitas el pago si ya se realizó.</p>
        <Button fullWidth disabled={ocupado} onClick={() => void entrega()}>Ya verifiqué la entrega de efectivo</Button>
      </> : <fieldset disabled={cargando || ocupado || bloqueo.current} className="space-y-4 disabled:opacity-70">
        <p className="text-sm text-gray-600 dark:text-gray-300">{administracion ? 'Saldo compartido entre cajas. Los ajustes deben corresponder al conteo físico del depósito.' : 'La recepción en ticket se registra al confirmar la venta. El efectivo requiere una caja abierta.'}</p>
        {cargando ? <p role="status">Cargando envases…</p> : <>
          <div>
            <p className="mb-2 text-sm font-semibold">Tipo de envase</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Tipos de envase">
              {tipos.filter(t => administracion || t.activo || t.pendientes > 0).map(t => <button type="button" key={t.id} aria-pressed={seleccion === t.id} onClick={() => { setSeleccion(t.id); setPendientes('') }} className={`rounded-xl border p-3 text-left ${seleccion === t.id ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500 dark:bg-indigo-950/40' : 'border-gray-300 dark:border-gray-600'}`}>
                <span className="block text-sm font-bold">{t.nombre}{t.activo ? '' : ' (inactivo)'}</span>
                <span className="block font-bold text-indigo-600 dark:text-indigo-300">{formatPrecio(t.precio)}</span>
              </button>)}
            </div>
            {tipos.length === 0 && <p className="text-sm">No hay tipos de envase configurados.</p>}
          </div>
          {tipo && <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-3 dark:bg-gray-800">
            <div><span className="block text-xs">Vacíos en el negocio</span><strong className="text-xl">{tipo.stockVacios}</strong></div>
            <div><span className="block text-xs">Pendientes de traer</span><strong className="text-xl">{tipo.pendientes}</strong></div>
          </div>}
          <QuantityStepper label={administracion ? 'Cantidad / nuevo saldo' : 'Cantidad recibida'} min={administracion ? 0 : 1} max={administracion ? 999999999 : 999999} value={cantidad} onChange={setCantidad} />
          {!administracion && <div className="flex gap-2" role="group" aria-label="Cantidades rápidas">{[1, 2, 3, 4, 5, 6].map(n => <button type="button" key={n} aria-pressed={cant === n} onClick={() => setCantidad(String(n))} className={`flex-1 rounded-lg border py-1 ${cant === n ? 'bg-indigo-600 text-white' : ''}`}>{n}</button>)}</div>}
          <details><summary className="cursor-pointer text-sm">Agregar observaciones</summary><label className="block text-sm">Observaciones<input className={entrada} maxLength={1000} value={notas} onChange={e => setNotas(e.target.value)} /></label></details>
          {!administracion && <>
            {tipo && tipo.pendientes > 0 && <div className="space-y-2 rounded-xl border border-amber-500 p-3">
              <p className="text-sm">Si los trae porque quedaron pendientes, no se paga ni se descuenta dinero.</p>
              <Button fullWidth variant="secondary" disabled={!cantidadValida || cant > tipo.pendientes} onClick={() => void registrar({ version: 1, id: crypto.randomUUID(), accion: 'RECIBIR_PENDIENTES', tipoId: tipo.id, datos: { cantidad: cant, notas: notas || null } })}>Recibir pendientes sin pagar</Button>
            </div>}
            <div className="flex items-center justify-between rounded-xl border border-emerald-500 bg-emerald-50 p-3 dark:bg-emerald-950/30"><span className="text-sm">Total a reconocer<br /><span className="text-xs">{cantidadValida ? cant : 0} × {formatPrecio(tipo?.precio ?? 0)}</span></span><strong className="text-2xl">{formatPrecio(tipo && cantidadValida ? tipo.precio * cant : 0)}</strong></div>
            {tipo && !Number.isInteger(tipo.precio) && <p className="text-sm">El ticket admite valores en pesos enteros. Para este precio usá el reintegro en efectivo.</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button fullWidth disabled={!tipo?.activo || !cantidadValida || tipo.precio <= 0 || !Number.isInteger(tipo.precio)} onClick={agregarAlTicket}>Descontar del ticket</Button>
              <Button fullWidth variant="secondary" disabled={!tipo?.activo || !cantidadValida || tipo.precio <= 0} onClick={() => {
                const caja = useCajaStore.getState().sesionActiva
                if (!caja || caja.kiosco_id !== contexto.kioscoId) { setError('Abrí una caja de este comercio para reintegrar efectivo.'); return }
                if (tipo) void registrar({ version: 1, id: crypto.randomUUID(), accion: 'RECIBIR_EFECTIVO', tipoId: tipo.id, datos: { cantidad: cant, precioEsperado: tipo.precio, sesionCajaId: caja.id, notas: notas || null } })
              }}>Pagar en efectivo</Button>
            </div>
          </>}
          {dueno && tipo && <details className="rounded-xl border border-gray-300 p-3 dark:border-gray-600"><summary className="cursor-pointer text-sm font-semibold">Registrar envases pendientes</summary>
            <div className="mt-3 space-y-3"><p className="text-sm">Anotá el total que falta traer por este tipo porque no se cobró el envase. No cambia los vacíos del negocio ni mueve dinero.</p>
              <QuantityStepper label="Nuevo total pendiente" max={999999999} value={pendientes} onChange={setPendientes} />
              <label className="block text-sm">Motivo del cambio<input className={entrada} maxLength={1000} value={notas} onChange={e => setNotas(e.target.value)} /></label>
              <Button fullWidth variant="secondary" disabled={!pendientes || !Number.isInteger(Number(pendientes)) || Number(pendientes) < 0 || Number(pendientes) > 999999999 || !notas.trim()} onClick={() => void registrar({ version: 1, id: crypto.randomUUID(), accion: 'AJUSTAR_PENDIENTES', tipoId: tipo.id, datos: { pendientesEsperados: tipo.pendientes, nuevosPendientes: Number(pendientes), notas: notas.trim() } })}>Guardar total pendiente</Button>
            </div>
          </details>}
          {administracion && dueno && <>
            <Button fullWidth disabled={!tipo || !Number.isInteger(cant) || cant < 0 || cant > 999999999 || !notas.trim()} onClick={() => {
              if (tipo) void registrar({ version: 1, id: crypto.randomUUID(), accion: 'AJUSTAR_SALDO', tipoId: tipo.id, datos: { stockEsperado: tipo.stockVacios, nuevoStock: cant, notas } })
            }}>Confirmar saldo contado</Button>
            <label className="block text-sm">Distribuidor<input className={entrada} maxLength={150} value={distribuidor} onChange={e => setDistribuidor(e.target.value)} /></label>
            <Button fullWidth variant="secondary" disabled={!tipo || !cantidadValida || cant > tipo.stockVacios || !distribuidor.trim()} onClick={() => {
              if (tipo) void registrar({ version: 1, id: crypto.randomUUID(), accion: 'ENTREGAR_DISTRIBUIDOR', tipoId: tipo.id, datos: { cantidad: cant, distribuidor: distribuidor.trim(), notas: notas || null } })
            }}>Registrar entrega al distribuidor</Button>
            <hr className="border-gray-300 dark:border-gray-600" />
            <h3 className="font-semibold">Nuevo tipo de envase</h3>
            <label className="block text-sm">Nombre<input className={entrada} maxLength={150} value={nombre} onChange={e => setNombre(e.target.value)} /></label>
            <label className="block text-sm">Precio<input className={entrada} type="number" min="0" step="0.01" value={precio} onChange={e => setPrecio(e.target.value)} /></label>
            <Button fullWidth disabled={!nombre.trim() || !precio || !Number.isFinite(Number(precio)) || Number(precio) < 0} onClick={() => void registrar({ version: 1, id: crypto.randomUUID(), accion: 'CONFIGURAR_TIPO', tipoId: crypto.randomUUID(), datos: { nombre: nombre.trim(), precio: Number(precio), activo: true } })}>Crear tipo de envase</Button>
            <Button fullWidth variant="secondary" disabled={!tipo || !precio || !Number.isFinite(Number(precio)) || Number(precio) < 0} onClick={() => {
              if (tipo) void registrar({ version: 1, id: crypto.randomUUID(), accion: 'CONFIGURAR_TIPO', tipoId: tipo.id, datos: { nombre: nombre.trim() || tipo.nombre, precio: Number(precio), activo: tipo.activo } })
            }}>Actualizar nombre y precio del seleccionado</Button>
          </>}
        </>}
      </fieldset>}
      {administracion && dueno && <HistorialEnvases kioscoId={contexto.kioscoId} tipos={tipos} />}
      <Button fullWidth variant="ghost" disabled={ocupado} onClick={onClose}>Cerrar</Button>
    </div>
  </Modal>
}
