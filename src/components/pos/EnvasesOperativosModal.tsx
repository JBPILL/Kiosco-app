import { useEffect, useRef, useState } from 'react'
import { QuantityStepper } from '../ui/QuantityStepper'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useAuthStore } from '../../stores/authStore'
import { useCajaStore } from '../../stores/cajaStore'
import { useCartStore } from '../../stores/cartStore'
import { cargarEnvasesCompartidos, type TipoEnvaseCompartido } from '../../lib/envasesData'
import { confirmarEntregaPiloto, contextoOperacionPiloto, ejecutarOperacionEnvase } from '../../lib/pilotOperationClient'
import { formatPrecio } from '../../lib/utils'
import type { ResultadoEnvase } from '../../lib/envasesOutbox'
import type { SolicitudEnvase } from '../../../supabase/functions/_shared/envasesRequest'
import { HistorialEnvases } from './HistorialEnvases'
import type { Producto } from '../../types/database'

interface Props { isOpen: boolean; onClose: () => void; administracion?: boolean; productos?: Producto[]; cargandoProductos?: boolean; onEditarProducto?: (producto: Producto) => void }
export function EnvasesOperativosModal({ isOpen, onClose, administracion = false, productos, cargandoProductos, onEditarProducto }: Props) {
  const usuario = useAuthStore(state => state.usuario)
  if (!isOpen || !usuario?.kiosco_id) return null
  if (!usuario.activo || usuario.rol === 'VISOR') return <Modal isOpen onClose={onClose} title="Envases"><p>Se requiere un Dueño o Cajero activo para operar envases.</p></Modal>
  return <ContenidoEnvases key={`${usuario.id}:${usuario.kiosco_id}:${administracion}`} onClose={onClose} administracion={administracion} productos={productos} cargandoProductos={cargandoProductos} onEditarProducto={onEditarProducto} />
}

function ContenidoEnvases({ onClose, administracion, productos = [], cargandoProductos = false, onEditarProducto }: Omit<Props, 'isOpen'>) {
  const contexto = useRef(contextoOperacionPiloto()).current
  const dueno = useAuthStore(state => state.usuario?.rol === 'DUEÑO')
  const [pestana, setPestana] = useState<'DEPOSITO' | 'TIPOS' | 'PRODUCTOS' | 'MOVIMIENTOS'>('DEPOSITO')
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [soloRetornables, setSoloRetornables] = useState(true)
  const productosDelComercio = productos.filter(p => p.kiosco_id === contexto.kioscoId && p.activo)
  const productosVisibles = productosDelComercio.filter(p => (!soloRetornables || p.es_retornable) && `${p.descripcion} ${p.nombre_envase ?? ''}`.toLocaleLowerCase().includes(busquedaProducto.trim().toLocaleLowerCase()))
  const [tipos, setTipos] = useState<TipoEnvaseCompartido[]>([])
  const [seleccion, setSeleccion] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [recepcionPendiente, setRecepcionPendiente] = useState(false)
  const [pendientes, setPendientes] = useState('')
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoPrecio, setNuevoPrecio] = useState('')
  const [confirmarEstado, setConfirmarEstado] = useState(false)
  const [notasStock, setNotasStock] = useState('')
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
  const precioValido = (valor: string) => valor.trim() !== '' && Number.isFinite(Number(valor)) && Number(valor) >= 0 && Number(valor) <= 9999999999.99 && Number(Number(valor).toFixed(2)) === Number(valor)
  useEffect(() => {
    setNombre(tipo?.nombre ?? '')
    setPrecio(tipo ? String(tipo.precio) : '')
    if (administracion && tipo) setCantidad(String(tipo.stockVacios))
    setNotasStock('')
    setConfirmarEstado(false)
  }, [tipo?.id, tipo?.nombre, tipo?.precio, tipo?.stockVacios, administracion])
  useEffect(() => {
    vigente.current = true
    void cargarEnvasesCompartidos(contexto.kioscoId).then(datos => {
      if (vigente.current) { setTipos(datos); setSeleccion(datos.find(t => t.activo)?.id ?? datos.find(t => administracion || t.pendientes > 0)?.id ?? '') }
    }).catch(() => { if (vigente.current) setError('No se pudo cargar el saldo compartido. Cerrá y volvé a intentar.') })
      .finally(() => { if (vigente.current) setCargando(false) })
    return () => { vigente.current = false }
  }, [contexto.kioscoId, administracion])

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
  return <Modal isOpen onClose={ocupado ? () => {} : onClose} title={administracion ? 'Depósito de envases' : 'Recibir Envases Retornables'} size={administracion ? 'xl' : 'lg'} footer={administracion ? <div className="flex w-full items-center justify-between gap-3"><p className="text-xs text-gray-500 dark:text-gray-400">Los cambios se guardan al confirmar cada operación.</p><Button variant="secondary" disabled={ocupado} onClick={onClose}>Cerrar</Button></div> : undefined}>
    <div className={`envases-controls space-y-4 ${administracion ? '' : 'envases-recepcion'}`}>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {confirmado ? <>
        <h3 className="text-lg font-bold">Recepción registrada</h3>
        <p>Reintegro en caja: <strong>{formatPrecio(confirmado.importe ?? 0)}</strong></p>
        <p className="text-sm">Verificá si el cliente ya recibió el dinero antes de entregarlo. No repitas el pago si ya se realizó.</p>
        <Button fullWidth disabled={ocupado} onClick={() => void entrega()}>Ya verifiqué la entrega de efectivo</Button>
      </> : <fieldset disabled={cargando || ocupado || bloqueo.current} className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">{administracion ? 'Controlá los vacíos del negocio y los pendientes que faltan traer.' : 'Seleccioná el tipo de envase y la cantidad devuelta para descontar del ticket o abonar en efectivo al cliente.'}</p>
        {administracion && <div role="tablist" aria-label="Administración de envases" className="flex gap-1 overflow-x-auto border-b border-gray-200 pb-1 dark:border-gray-700">
          {([{ id: 'DEPOSITO', texto: 'Depósito de vacíos' }, { id: 'TIPOS', texto: 'Tipos y precios' }, { id: 'PRODUCTOS', texto: 'Productos del catálogo' }, { id: 'MOVIMIENTOS', texto: 'Movimientos' }] as const).map(p => <button key={p.id} type="button" role="tab" aria-selected={pestana === p.id} onClick={() => setPestana(p.id)} className={`shrink-0 rounded-t-lg border-b-2 px-3 py-2 text-xs font-bold transition-colors ${pestana === p.id ? 'border-indigo-600 bg-indigo-50/50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400' : 'border-transparent text-gray-500 dark:text-gray-400'}`}>{p.texto}</button>)}
        </div>}
        {cargando ? <p role="status">Cargando envases…</p> : <>
          {administracion && (pestana === 'DEPOSITO' || pestana === 'TIPOS') && <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 bg-gray-50 p-2.5 dark:border-gray-700 dark:bg-gray-900/60"><h3 className="text-xs font-bold">Stock en Depósito por Tipo de Envase</h3><p className="text-[11px] text-gray-500">Seleccioná un tipo para {pestana === 'TIPOS' ? 'editar su nombre, precio o estado' : 'registrar el conteo o los pendientes'}.</p></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-gray-100 text-[10px] uppercase tracking-wider text-gray-600 dark:bg-gray-700/50 dark:text-gray-300"><tr><th className="px-3 py-2">Tipo de envase</th><th className="px-3 py-2 text-right">Valor unitario</th><th className="px-3 py-2 text-center">Vacíos</th><th className="px-3 py-2 text-center">Pendientes de traer</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-700">{tipos.map(t => <tr key={t.id} aria-selected={seleccion === t.id} onClick={() => { if (cargando || ocupado || bloqueo.current) return; setSeleccion(t.id); setPendientes(''); setConfirmarEstado(false) }} className={`cursor-pointer ${seleccion === t.id ? 'bg-indigo-50/70 dark:bg-indigo-950/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}><td className="px-3 py-2.5"><button type="button" aria-pressed={seleccion === t.id} className="text-left font-bold text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300">{t.nombre}{t.activo ? '' : ' (inactivo)'}</button></td><td className="px-3 py-2.5 text-right tabular-nums">{formatPrecio(t.precio)}</td><td className="px-3 py-2.5 text-center font-bold tabular-nums">{t.stockVacios}</td><td className="px-3 py-2.5 text-center font-bold tabular-nums">{t.pendientes}</td></tr>)}</tbody></table></div>
            {tipos.length === 0 && <p className="p-3 text-sm">No hay tipos de envase configurados.</p>}
          </div>}
          {administracion && pestana === 'PRODUCTOS' && <section className="space-y-3" aria-label="Productos del catálogo">
            <div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><Input aria-label="Buscar producto o tipo de envase" placeholder="Buscar por nombre de producto o tipo de envase…" value={busquedaProducto} onChange={e => setBusquedaProducto(e.target.value)} /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soloRetornables} onChange={e => setSoloRetornables(e.target.checked)} />Sólo retornables</label></div>
            {cargandoProductos ? <p role="status">Cargando catálogo…</p> : <div className="overflow-x-auto rounded-xl border border-gray-300 dark:border-gray-600"><table className="w-full text-left text-xs"><thead className="bg-gray-100 dark:bg-gray-700"><tr><th className="p-3">Retornable</th><th className="p-3">Producto</th><th className="p-3">Tipo de envase</th><th className="p-3">Precio envase</th><th className="p-3">Acción</th></tr></thead><tbody>{productosVisibles.map(p => <tr key={p.id} className="border-t border-gray-200 dark:border-gray-700"><td className="p-3">{p.es_retornable ? 'Sí' : 'No'}</td><td className="p-3 font-semibold">{p.descripcion}</td><td className="p-3">{p.nombre_envase || 'Sin asignar'}</td><td className="p-3">{formatPrecio(p.precio_envase ?? 0)}</td><td className="p-3">{dueno && onEditarProducto && <Button size="sm" variant="secondary" onClick={() => { onClose(); onEditarProducto(p) }}>Configurar</Button>}</td></tr>)}</tbody></table>{productosVisibles.length === 0 && <div className="space-y-3 p-6 text-center"><p className="text-sm">No se encontraron productos con los filtros aplicados.</p>{soloRetornables && <Button size="sm" variant="secondary" onClick={() => setSoloRetornables(false)}>Ver todos los productos del catálogo</Button>}</div>}</div>}
            <p className="text-xs text-gray-500 dark:text-gray-400">Mostrando {productosVisibles.length} productos. La configuración se guarda desde el formulario habitual del producto.</p>
          </section>}
          {!administracion && <div>
            <p className="mb-2 text-sm font-semibold">Tipo de envase</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Tipos de envase">
              {tipos.filter(t => administracion || t.activo || t.pendientes > 0).map(t => <button type="button" key={t.id} aria-pressed={seleccion === t.id} onClick={() => { setSeleccion(t.id); setPendientes(''); setRecepcionPendiente(false) }} className={`rounded-lg border text-left ${seleccion === t.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-gray-300 dark:border-gray-600'}`}>
                <span className="block text-xs font-bold">{t.nombre}{t.activo ? '' : ' (inactivo)'}</span>
                <span className="envase-price block font-bold">{formatPrecio(t.precio)}</span>
              </button>)}
            </div>
            {tipos.length === 0 && <p className="text-sm">No hay tipos de envase configurados.</p>}
          </div>}
          {(!administracion || pestana === 'DEPOSITO') && <section className="space-y-3 rounded-xl border border-gray-300 bg-gray-50/80 p-3.5 dark:border-gray-700 dark:bg-gray-800/80" aria-label="Cantidad y depósito">
            {!administracion && <div className="flex items-center justify-between border-b border-gray-300 pb-2 dark:border-gray-700">
              <div><p className="text-xs font-semibold">Precio unitario asignado</p><p className="text-[11px] text-gray-500 dark:text-gray-400">{tipo?.nombre ?? 'Seleccioná un envase'}</p></div>
              <strong className="tabular-nums">{formatPrecio(tipo?.precio ?? 0)}</strong>
            </div>}
            <div className={administracion ? 'max-w-xs' : undefined}><QuantityStepper label={administracion ? 'Vacíos contados' : 'Cantidad recibida'} min={administracion ? 0 : 1} max={administracion ? 999999999 : 999999} value={cantidad} onChange={setCantidad} /></div>
            {!administracion && <div className="flex gap-1.5" role="group" aria-label="Cantidades rápidas">{[1, 2, 3, 4, 5, 6].map(n => <button type="button" key={n} aria-pressed={cant === n} onClick={() => setCantidad(String(n))} className={`flex-1 rounded-md border py-1 text-xs font-semibold ${cant === n ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'}`}>{n}</button>)}</div>}
            {!administracion && tipo && <div className="grid grid-cols-2 gap-2 border-t border-gray-300 pt-2 text-xs dark:border-gray-700">
              <p><span className="block text-gray-500 dark:text-gray-400">Vacíos en el negocio</span><strong className="text-base tabular-nums">{tipo.stockVacios}</strong></p>
              <p><span className="block text-gray-500 dark:text-gray-400">Pendientes de traer</span><strong className="text-base tabular-nums">{tipo.pendientes}</strong></p>
            </div>}
            {administracion && dueno && <div className="space-y-3 border-t border-gray-300 pt-3 dark:border-gray-700">
              <label className="block text-xs font-semibold">Motivo del ajuste de stock<input className={entrada} maxLength={1000} value={notasStock} onChange={e => setNotasStock(e.target.value)} /></label>
              <Button fullWidth disabled={!tipo || !cantidad || !Number.isInteger(cant) || cant < 0 || cant > 999999999 || !notasStock.trim()} onClick={() => {
                if (tipo) void registrar({ version: 1, id: crypto.randomUUID(), accion: 'AJUSTAR_SALDO', tipoId: tipo.id, datos: { stockEsperado: tipo.stockVacios, nuevoStock: cant, notas: notasStock.trim() } })
              }}>Guardar conteo de vacíos</Button>
            </div>}
          </section>}
          {!administracion && tipo && tipo.pendientes > 0 && <label className="flex items-start gap-2 rounded-lg border border-gray-300 p-2.5 text-xs dark:border-gray-600"><input type="checkbox" checked={recepcionPendiente} onChange={e => setRecepcionPendiente(e.target.checked)} /><span>Son envases pendientes de traer<br /><span className="text-gray-500 dark:text-gray-400">Se reciben sin pagar ni descontar dinero.</span></span></label>}
          {!administracion && <>
            <div className="envase-total flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-800/60 dark:bg-emerald-950/40">
              <div><p className="text-xs font-bold">{recepcionPendiente ? 'Pendientes que se reciben' : 'Total a reconocer al cliente'}</p><p className="text-[11px]">{recepcionPendiente ? 'Sin reintegro ni descuento' : `${cantidadValida ? cant : 0} ${cant === 1 ? 'unidad' : 'unidades'} × ${formatPrecio(tipo?.precio ?? 0)}`}</p></div>
              <strong className="text-xl font-black tabular-nums">{recepcionPendiente ? `${cantidadValida ? cant : 0} ${cant === 1 ? 'envase' : 'envases'}` : formatPrecio(tipo && cantidadValida ? tipo.precio * cant : 0)}</strong>
            </div>
            {recepcionPendiente ? <Button fullWidth disabled={!tipo || !cantidadValida || cant > tipo.pendientes} onClick={() => {
              if (tipo) void registrar({ version: 1, id: crypto.randomUUID(), accion: 'RECIBIR_PENDIENTES', tipoId: tipo.id, datos: { cantidad: cant, notas: notas || null } })
            }}>Recibir pendientes sin pagar</Button> : <>
              {tipo && !Number.isInteger(tipo.precio) && <p className="text-xs">El ticket admite pesos enteros. Para este precio usá efectivo.</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button fullWidth disabled={!tipo?.activo || !cantidadValida || tipo.precio <= 0 || !Number.isInteger(tipo.precio)} onClick={agregarAlTicket}>Descontar del ticket</Button>
                <Button fullWidth variant="success" disabled={!tipo?.activo || !cantidadValida || tipo.precio <= 0} onClick={() => {
                  const caja = useCajaStore.getState().sesionActiva
                  if (!caja || caja.kiosco_id !== contexto.kioscoId) { setError('Abrí una caja de este comercio para reintegrar efectivo.'); return }
                  if (tipo) void registrar({ version: 1, id: crypto.randomUUID(), accion: 'RECIBIR_EFECTIVO', tipoId: tipo.id, datos: { cantidad: cant, precioEsperado: tipo.precio, sesionCajaId: caja.id, notas: notas || null } })
                }}>Pagar en efectivo</Button>
              </div>
            </>}
          </>}
          {!administracion && <details><summary className="cursor-pointer text-xs text-gray-500 dark:text-gray-400">Agregar observaciones</summary><label className="block text-sm">Observaciones<input className={entrada} maxLength={1000} value={notas} onChange={e => setNotas(e.target.value)} /></label></details>}
          {dueno && tipo && (!administracion || pestana === 'DEPOSITO') && <details className="border-t border-gray-200 pt-2 dark:border-gray-700"><summary className="cursor-pointer text-xs text-gray-500 dark:text-gray-400">Registrar envases pendientes</summary>
            <div className="mt-3 space-y-3"><p className="text-sm">Anotá el total que falta traer por este tipo porque no se cobró el envase. No cambia los vacíos del negocio ni mueve dinero.</p>
              <QuantityStepper label="Nuevo total pendiente" max={999999999} value={pendientes} onChange={setPendientes} />
              <label className="block text-sm">Observaciones (opcional)<input className={entrada} maxLength={1000} value={notas} onChange={e => setNotas(e.target.value)} /></label>
              <Button fullWidth disabled={!pendientes || !Number.isInteger(Number(pendientes)) || Number(pendientes) < 0 || Number(pendientes) > 999999999} onClick={() => void registrar({ version: 1, id: crypto.randomUUID(), accion: 'AJUSTAR_PENDIENTES', tipoId: tipo.id, datos: { pendientesEsperados: tipo.pendientes, nuevosPendientes: Number(pendientes), notas: notas.trim() || 'Sin observaciones adicionales' } })}>Guardar total pendiente</Button>
            </div>
          </details>}
          {administracion && dueno && pestana === 'TIPOS' && <div className="space-y-2">
            {tipo && <details className="rounded-xl border border-gray-300 p-3 dark:border-gray-600">
              <summary className="cursor-pointer text-sm font-semibold">Editar nombre y precio</summary>
              <div className="mt-3 space-y-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">{tipo.nombre} · {formatPrecio(tipo.precio)}</p>
                <Input label="Nombre del tipo seleccionado" aria-label="Nombre del tipo seleccionado" maxLength={150} value={nombre} onChange={e => setNombre(e.target.value)} />
                <Input label="Precio del tipo seleccionado" aria-label="Precio del tipo seleccionado" type="number" min="0" step="0.01" value={precio} onChange={e => setPrecio(e.target.value)} />
                <Button fullWidth disabled={!nombre.trim() || !precioValido(precio)} onClick={() => void registrar({ version: 1, id: crypto.randomUUID(), accion: 'CONFIGURAR_TIPO', tipoId: tipo.id, datos: { nombre: nombre.trim(), precio: Number(precio), activo: tipo.activo } })}>Guardar nombre y precio</Button>
              </div>
            </details>}
            {tipo && <section className="rounded-xl border border-gray-200 p-3 dark:border-gray-700" aria-label="Estado del tipo de envase">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-xs font-bold">{tipo.nombre} · {tipo.activo ? 'Activo' : 'Inactivo'}</h3><p className="text-xs text-gray-500 dark:text-gray-400">Desactivar conserva el historial, los vacíos y los pendientes.</p></div><Button size="sm" variant="secondary" onClick={() => setConfirmarEstado(true)}>{tipo.activo ? 'Desactivar tipo' : 'Reactivar tipo'}</Button></div>
              {confirmarEstado && <div role="group" aria-label="Confirmar cambio de estado" className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-700"><p className="text-sm">{tipo.activo ? `¿Desactivar ${tipo.nombre}? Dejará de ofrecerse para nuevos cobros y descuentos. Los ${tipo.stockVacios} vacíos y ${tipo.pendientes} pendientes seguirán visibles; podrás recibir los pendientes sin pagar.` : `¿Reactivar ${tipo.nombre} para volver a utilizarlo?`}</p><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => setConfirmarEstado(false)}>Volver</Button><Button size="sm" variant={tipo.activo ? 'danger' : 'primary'} onClick={() => void registrar({ version: 1, id: crypto.randomUUID(), accion: 'CONFIGURAR_TIPO', tipoId: tipo.id, datos: { nombre: tipo.nombre, precio: tipo.precio, activo: !tipo.activo } })}>{tipo.activo ? 'Confirmar desactivación' : 'Confirmar reactivación'}</Button></div></div>}
            </section>}
            <details className="rounded-xl border border-gray-300 p-3 dark:border-gray-600">
              <summary className="cursor-pointer text-sm font-semibold">Nuevo tipo de envase</summary>
              <div className="mt-3 space-y-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Agregá otro tipo sin modificar el seleccionado.</p>
                <Input label="Nombre del nuevo envase" aria-label="Nombre del nuevo envase" maxLength={150} value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} />
                <Input label="Precio del nuevo envase" aria-label="Precio del nuevo envase" type="number" min="0" step="0.01" value={nuevoPrecio} onChange={e => setNuevoPrecio(e.target.value)} />
                <Button fullWidth disabled={!nuevoNombre.trim() || !precioValido(nuevoPrecio)} onClick={() => void registrar({ version: 1, id: crypto.randomUUID(), accion: 'CONFIGURAR_TIPO', tipoId: crypto.randomUUID(), datos: { nombre: nuevoNombre.trim(), precio: Number(nuevoPrecio), activo: true } })}>Crear tipo de envase</Button>
              </div>
            </details>
          </div>}

        </>}
      </fieldset>}
      {administracion && dueno && pestana === 'MOVIMIENTOS' && <HistorialEnvases kioscoId={contexto.kioscoId} tipos={tipos} />}
      {!administracion && <Button fullWidth variant="secondary" disabled={ocupado} onClick={onClose}>Cancelar</Button>}
    </div>
  </Modal>
}
