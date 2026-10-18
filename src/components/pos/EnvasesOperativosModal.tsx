import { useEffect, useRef, useState } from 'react'
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
          <label className="block text-sm">Tipo de envase
            <select className={entrada} value={seleccion} onChange={e => setSeleccion(e.target.value)}>
              <option value="">Seleccionar</option>
              {tipos.filter(t => administracion || t.activo).map(t => <option key={t.id} value={t.id}>{t.nombre}{t.activo ? '' : ' (inactivo)'}</option>)}
            </select>
          </label>
          {tipo && <div className="rounded-xl bg-gray-100 p-3 dark:bg-gray-800 flex justify-between"><span>{formatPrecio(tipo.precio)} por envase</span><strong>{tipo.stockVacios} vacíos</strong></div>}
          <label className="block text-sm">{administracion ? 'Cantidad / nuevo saldo' : 'Cantidad recibida'}
            <input className={entrada} type="number" min={administracion ? 0 : 1} step="1" value={cantidad} onChange={e => setCantidad(e.target.value)} />
          </label>
          <label className="block text-sm">Observaciones<input className={entrada} maxLength={1000} value={notas} onChange={e => setNotas(e.target.value)} /></label>
          {!administracion && <>
            <p className="text-xl font-bold">{formatPrecio(tipo && cantidadValida ? tipo.precio * cant : 0)}</p>
            {tipo && !Number.isInteger(tipo.precio) && <p className="text-sm">El ticket admite valores en pesos enteros. Para este precio usá el reintegro en efectivo.</p>}
            <Button fullWidth disabled={!tipo?.activo || !cantidadValida || tipo.precio <= 0 || !Number.isInteger(tipo.precio)} onClick={agregarAlTicket}>Descontar del ticket</Button>
            <Button fullWidth variant="secondary" disabled={!tipo?.activo || !cantidadValida || tipo.precio <= 0} onClick={() => {
              const caja = useCajaStore.getState().sesionActiva
              if (!caja || caja.kiosco_id !== contexto.kioscoId) { setError('Abrí una caja de este comercio para reintegrar efectivo.'); return }
              if (tipo) void registrar({ version: 1, id: crypto.randomUUID(), accion: 'RECIBIR_EFECTIVO', tipoId: tipo.id, datos: { cantidad: cant, precioEsperado: tipo.precio, sesionCajaId: caja.id, notas: notas || null } })
            }}>Registrar recepción y reintegro en efectivo</Button>
          </>}
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
      <Button fullWidth variant="ghost" disabled={ocupado} onClick={onClose}>Cerrar</Button>
    </div>
  </Modal>
}
