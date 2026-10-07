import { RefreshButton } from '../components/ui/RefreshButton'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Smartphone, Wrench, ShieldCheck } from '../components/electronica/ElectronicaIconos'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { ReparacionModal } from '../components/electronica/ReparacionModal'
import { identidadElectronica, useElectronicaContexto, useSolicitudElectronica } from '../components/electronica/useElectronicaContexto'
import { useAuthStore } from '../stores/authStore'
import { useElectronicaStore } from '../stores/electronicaStore'
import { ETIQUETAS_REPARACION, TRANSICIONES_REPARACION, validarRegistroUnidad } from '../lib/electronicaValidation'
import type { RegistroUnidad, ReparacionElectronica, VentaElectronica } from '../types/electronica'
import { formatPrecio } from '../lib/utils'

const tarjeta = 'rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-md dark:shadow-black/20'
const campo = 'w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all'
const unidadInicial: RegistroUnidad = { detalleVentaId: '', tipo: 'SERIE', identificador: '', garantiaHasta: null, condiciones: null }
function fechaLocal(): string {
  const fecha = new Date()
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

export function ElectronicaPage() {
  const { usuario, kiosco } = useAuthStore()
  const permitida = usuario?.rol === 'DUEÑO' && usuario.kiosco_id === kiosco?.id && kiosco?.rubro === 'ELECTRONICA_CELULARES'
  if (!permitida) return <p className="p-6" role="alert">Este módulo está disponible para el dueño del comercio de electrónica activo.</p>
  const identidad = identidadElectronica()
  return <ElectronicaContenido key={identidad} identidad={identidad} kioscoId={kiosco.id} />
}

function ElectronicaContenido({ identidad, kioscoId }: { identidad: string; kioscoId: string }) {
  const { unidades, reparaciones, cargando, error: errorServidor, cargar, limpiar, buscarVenta, registrarUnidad } = useElectronicaStore()
  const vigente = useElectronicaContexto(identidad)
  const [pestana, setPestana] = useState<'unidades' | 'reparaciones'>('unidades')
  const [codigoVenta, setCodigoVenta] = useState('')
  const [venta, setVenta] = useState<VentaElectronica | null>(null)
  const [unidad, setUnidad] = useState<RegistroUnidad>(unidadInicial)
  const [buscando, setBuscando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<'nueva' | ReparacionElectronica | null>(null)
  const solicitudId = useSolicitudElectronica(JSON.stringify({ unidad, venta: venta?.id }))
  const secuenciaBusqueda = useRef(0)
  const propias = unidades.filter(u => u.kiosco_id === kioscoId)
  const ordenes = reparaciones.filter(r => r.kiosco_id === kioscoId)
  const detalles = venta?.detalles.filter(d => Number.isInteger(d.cantidad) && d.cantidad > 0 && d.producto
    && !d.producto.es_pesable && !d.producto.es_combo) ?? []
  const pendientes = ordenes.filter(r => TRANSICIONES_REPARACION[r.estado].length > 0).length

  useEffect(() => {
    limpiar()
    void cargar().catch(() => { if (vigente()) setError('Conectate y verificá el SQL de electrónica para cargar los registros.') })
    return () => { secuenciaBusqueda.current++; limpiar() }
  }, [identidad, cargar, limpiar, vigente])

  async function actualizar() {
    if (!vigente()) return
    setError('')
    try { await cargar() } catch { if (vigente()) setError('No se pudieron cargar los registros. Revisá la conexión y el SQL de electrónica.') }
  }
  async function buscar() {
    if (!vigente() || buscando || guardando) return
    const numero = ++secuenciaBusqueda.current
    setBuscando(true); setError(''); setVenta(null); setUnidad(unidadInicial)
    try {
      const resultado = await buscarVenta(codigoVenta)
      if (!vigente() || numero !== secuenciaBusqueda.current) return
      setVenta(resultado)
    } catch (err) { if (vigente() && numero === secuenciaBusqueda.current) setError(err instanceof Error ? err.message : 'No se pudo buscar la venta') }
    finally { if (vigente() && numero === secuenciaBusqueda.current) setBuscando(false) }
  }
  async function registrar() {
    if (!vigente() || guardando || !venta || venta.estado !== 'COMPLETADA' || !venta.sincronizado) return
    let valido: RegistroUnidad
    try {
      if (!detalles.some(d => d.id === unidad.detalleVentaId)) throw new Error('Seleccioná un artículo de unidades enteras, sin pesaje ni combo')
      valido = validarRegistroUnidad(unidad)
    } catch (err) { setError(err instanceof Error ? err.message : 'Revisá los datos'); return }
    setGuardando(true); setError('')
    try {
      await registrarUnidad(valido, solicitudId)
      if (!vigente()) return
      toast.success('Unidad registrada')
      setUnidad(unidadInicial)
    } catch (err) { if (vigente()) setError(err instanceof Error ? err.message : 'El servidor no confirmó la unidad') }
    finally { if (vigente()) setGuardando(false) }
  }
  const cambiarUnidad = (cambios: Partial<RegistroUnidad>) => { setUnidad(prev => ({ ...prev, ...cambios })); setError('') }
  return <div className="space-y-6 p-4 md:p-6 text-gray-900 dark:text-gray-100">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Electrónica y reparaciones</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Unidades vendidas, garantías y seguimiento de órdenes de servicio.</p></div><RefreshButton refreshing={cargando} disabled={buscando || guardando} onClick={() => void actualizar()} /></header>
    <div className="grid gap-3 sm:grid-cols-3">{[
      { icono: Smartphone, valor: propias.length, texto: 'Unidades registradas', color: 'text-indigo-600 dark:text-indigo-400', fondo: 'bg-indigo-50 dark:bg-indigo-900/30', descripcion: 'Series e IMEI vinculados a ventas' },
      { icono: Wrench, valor: pendientes, texto: 'Reparaciones abiertas', color: 'text-amber-600 dark:text-amber-400', fondo: 'bg-amber-50 dark:bg-amber-900/30', descripcion: 'Órdenes con seguimiento pendiente' },
      { icono: ShieldCheck, valor: propias.filter(u => u.garantia_hasta && u.venta_estado !== 'ANULADA').length, texto: 'Plazos de garantía registrados', color: 'text-emerald-600 dark:text-emerald-400', fondo: 'bg-emerald-50 dark:bg-emerald-900/30', descripcion: 'Unidades con fecha de garantía informada' },
    ].map(({ icono: Icono, valor, texto, color, fondo, descripcion }) => <div className={tarjeta} key={texto}><div className="flex items-start justify-between gap-3"><p className={`text-xs font-bold uppercase tracking-wide ${color}`}>{texto}</p><span className={`rounded-xl p-2.5 ${fondo} ${color}`}><Icono size={22} /></span></div><p className="mt-2 text-3xl font-bold tabular-nums">{valor}</p><p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{descripcion}</p></div>)}</div>
    <p className="rounded-xl bg-indigo-50 p-3 text-xs text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200">Registrá cada unidad después de una venta sincronizada. Las garantías muestran las condiciones del comercio; las reparaciones se cobran desde Punto de Venta.</p>
    {(errorServidor || error) && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">{error || errorServidor}</div>}
    <div role="tablist" aria-label="Gestión electrónica" className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-1 shadow-sm"><Button size="sm" role="tab" aria-selected={pestana === 'unidades'} variant="ghost" className={pestana === 'unidades' ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : ''} onClick={() => setPestana('unidades')}>Unidades y garantías</Button><Button size="sm" role="tab" aria-selected={pestana === 'reparaciones'} variant="ghost" className={pestana === 'reparaciones' ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : ''} onClick={() => setPestana('reparaciones')}>Reparaciones</Button></div>
    {pestana === 'unidades' ? <section className="space-y-4">
      <div className={tarjeta}><h2 className="mb-3 font-bold">Registrar unidad de una venta</h2><form className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end" onSubmit={e => { e.preventDefault(); void buscar() }}><Input label="ID de venta o código de ticket" aria-label="ID de venta o código de ticket" placeholder="ID completo o 8 caracteres del ticket" value={codigoVenta} disabled={buscando || guardando} onChange={e => { setCodigoVenta(e.target.value); setVenta(null); setUnidad(unidadInicial); setError('') }} /><Button size="sm" className="shrink-0 whitespace-nowrap sm:mb-0.5" type="submit" loading={buscando} disabled={guardando || !codigoVenta.trim()}>Buscar venta</Button></form>
        {venta && <div className="mt-4 space-y-3"><p className="text-xs text-gray-500">Venta {venta.id} · {venta.estado === 'ANULADA' ? 'Anulada' : 'Completada'} · {venta.sincronizado ? 'Sincronizada' : 'Sin sincronizar'}</p>
          {venta.estado !== 'COMPLETADA' || !venta.sincronizado ? <p role="alert">La venta debe estar completada y sincronizada.</p> : !detalles.length ? <p>No hay artículos de unidades enteras aptos para registrar.</p> : <form className="space-y-3" onSubmit={e => { e.preventDefault(); void registrar() }}><fieldset disabled={guardando} className="space-y-3">
            <label className="block text-xs font-semibold">Artículo vendido<select aria-label="Artículo vendido" className={`${campo} mt-1`} value={unidad.detalleVentaId} onChange={e => cambiarUnidad({ detalleVentaId: e.target.value })}><option value="">Seleccionar artículo</option>{detalles.map(d => <option key={d.id} value={d.id}>{d.producto?.descripcion} · {d.cantidad} unidades</option>)}</select></label>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Tipo de identificador<select aria-label="Tipo de identificador" className={`${campo} mt-1`} value={unidad.tipo} onChange={e => cambiarUnidad({ tipo: e.target.value as RegistroUnidad['tipo'] })}><option value="SERIE">Número de serie</option><option value="IMEI">IMEI</option></select></label><Input label="Serie o IMEI" aria-label="Serie o IMEI" maxLength={80} value={unidad.identificador} onChange={e => cambiarUnidad({ identificador: e.target.value })} /></div>
            <Input label="Garantía hasta (opcional)" aria-label="Garantía hasta" type="date" value={unidad.garantiaHasta ?? ''} onChange={e => cambiarUnidad({ garantiaHasta: e.target.value || null })} />
            <label className="block text-xs font-semibold">Condiciones internas de garantía<textarea aria-label="Condiciones internas de garantía" className={`${campo} mt-1`} maxLength={2000} rows={2} value={unidad.condiciones ?? ''} onChange={e => cambiarUnidad({ condiciones: e.target.value || null })} /></label>
          </fieldset><Button type="submit" loading={guardando}>Registrar unidad</Button></form>}
        </div>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">{propias.map(u => <article className={tarjeta} key={u.id}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{u.tipo_identificador}: {u.identificador}</h3><span className="rounded-full bg-gray-100 px-2 py-1 text-xs dark:bg-gray-700">Registro interno</span></div><p className="mt-2 text-xs text-gray-500">Venta {u.venta_id.slice(0, 8)} · {u.venta_fecha.slice(0, 10)}</p>{u.venta_estado === 'ANULADA' ? <p className="mt-2 text-sm font-semibold text-amber-600">Venta anulada · revisar garantía</p> : <p className="mt-2 text-sm">{u.garantia_hasta ? `Fecha registrada: ${u.garantia_hasta}${u.garantia_hasta < fechaLocal() ? ' · fecha cumplida' : ''}` : 'Sin plazo registrado'}</p>}{u.condiciones_garantia && <p className="mt-2 whitespace-pre-wrap text-xs text-gray-500">{u.condiciones_garantia}</p>}</article>)}</div>
      {!propias.length && !cargando && <div className={`${tarjeta} flex flex-col items-center gap-3 py-10 text-center`}><span className="rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 p-4 text-indigo-500"><Smartphone size={28} /></span><h3 className="font-semibold">Todavía no hay unidades registradas.</h3><p className="text-sm text-gray-500 dark:text-gray-400">Buscá un ticket para registrar su serie o IMEI y las condiciones de garantía.</p></div>}
    </section> : <section className="space-y-4"><div className={`${tarjeta} flex flex-wrap items-center justify-between gap-4`}><div><h2 className="font-bold">Órdenes de reparación</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Recepción, diagnóstico y seguimiento de equipos.</p></div><Button size="sm" onClick={() => setModal('nueva')}><Wrench size={16} />Nueva reparación</Button></div><div className="grid gap-3 md:grid-cols-2">{ordenes.map(r => <article className={tarjeta} key={r.id}><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{r.equipo}</h2><span className="rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200">{ETIQUETAS_REPARACION[r.estado]}</span></div><p className="mt-2 text-sm">{r.cliente_nombre}{r.cliente_contacto ? ` · ${r.cliente_contacto}` : ''}</p>{r.identificador && <p className="mt-1 text-xs text-gray-500">Identificador: {r.identificador}</p>}<p className="mt-3 whitespace-pre-wrap text-sm">{r.informe_falla}</p>{r.diagnostico && <p className="mt-2 whitespace-pre-wrap text-xs text-gray-500">Diagnóstico: {r.diagnostico}</p>}<p className="mt-3 text-sm">{r.presupuesto === null ? 'Sin presupuesto' : `Presupuesto: ${formatPrecio(r.presupuesto)} · no cobrado`}</p><p className="mt-1 text-xs text-gray-500">Ingreso {r.fecha_ingreso.slice(0, 10)} · revisión {r.version}</p>{TRANSICIONES_REPARACION[r.estado].length > 0 ? <Button className="mt-3" size="sm" variant="secondary" onClick={() => setModal(r)}>Editar orden</Button> : <p className="mt-3 text-xs text-gray-500">Orden cerrada · sin edición</p>}</article>)}</div>{!ordenes.length && !cargando && <div className={`${tarjeta} flex flex-col items-center gap-3 py-10 text-center`}><span className="rounded-2xl bg-amber-50 dark:bg-amber-900/30 p-4 text-amber-500"><Wrench size={28} /></span><h3 className="font-semibold">Todavía no hay órdenes de reparación.</h3><p className="text-sm text-gray-500 dark:text-gray-400">Creá una orden para registrar el equipo y seguir el estado del servicio.</p></div>}</section>}
    {modal && <ReparacionModal key={modal === 'nueva' ? 'nueva' : `${modal.id}/${modal.version}`} identidad={identidad} anterior={modal === 'nueva' ? undefined : modal} onClose={() => setModal(null)} />}
  </div>
}
