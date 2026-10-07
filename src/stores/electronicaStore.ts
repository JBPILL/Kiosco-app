import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'
import { validarRegistroUnidad, validarReparacion } from '../lib/electronicaValidation'
import type { DatosReparacion, RegistroUnidad, ReparacionElectronica, UnidadElectronica, VentaElectronica } from '../types/electronica'

interface ElectronicaState {
  unidades: UnidadElectronica[]
  reparaciones: ReparacionElectronica[]
  cargando: boolean
  error: string | null
  limpiar: () => void
  cargar: () => Promise<void>
  buscarVenta: (codigo: string) => Promise<VentaElectronica>
  registrarUnidad: (datos: RegistroUnidad, solicitudId: string) => Promise<void>
  guardarReparacion: (datos: DatosReparacion, solicitudId: string, anterior?: ReparacionElectronica) => Promise<void>
}
let generacion = 0
function contexto(escritura = false): { kioscoId: string; usuarioId: string } {
  const { usuario, kiosco } = useAuthStore.getState()
  if (usuario?.rol !== 'DUEÑO' || !usuario.kiosco_id || kiosco?.id !== usuario.kiosco_id || kiosco.rubro !== 'ELECTRONICA_CELULARES') {
    throw new Error('Esta función requiere un dueño del comercio de electrónica activo')
  }
  if (escritura && kiosco.estado_suscripcion !== 'ACTIVO') throw new Error('El comercio está en modo de lectura; no se pueden registrar cambios')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Conectate para registrar equipos y reparaciones')
  return { kioscoId: usuario.kiosco_id, usuarioId: usuario.id }
}
function vigente(capturado: ReturnType<typeof contexto>, version: number): boolean {
  try {
    const actual = contexto()
    return version === generacion && actual.kioscoId === capturado.kioscoId && actual.usuarioId === capturado.usuarioId
  } catch { return false }
}
async function leerListado<T extends { kiosco_id: string }>(tabla: string, kioscoId: string, fecha: string): Promise<T[]> {
  const filas: T[] = []
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase.from(tabla).select('*').eq('kiosco_id', kioscoId)
      .order(fecha, { ascending: false }).order('id', { ascending: false }).range(inicio, inicio + 499)
    if (error || !data || data.some(fila => fila.kiosco_id !== kioscoId)) throw new Error('No se pudieron cargar los registros de electrónica. Revisá la conexión y el SQL de esta fase')
    filas.push(...data as T[])
    if (data.length < 500) return filas
  }
}
function validarRespuesta(data: unknown, kioscoId: string): void {
  const fila = Array.isArray(data) ? data[0] : data
  if (!fila || typeof fila !== 'object' || !('id' in fila) || !('kiosco_id' in fila)
    || typeof fila.id !== 'string' || fila.kiosco_id !== kioscoId) throw new Error('El servidor no confirmó el registro')
}
export const useElectronicaStore = create<ElectronicaState>((set, get) => ({
  unidades: [], reparaciones: [], cargando: false, error: null,
  limpiar: () => { generacion++; set({ unidades: [], reparaciones: [], cargando: false, error: null }) },
  cargar: async () => {
    const capturado = contexto()
    const version = ++generacion
    set({ cargando: true, error: null })
    try {
      const [unidades, reparaciones] = await Promise.all([
        leerListado<UnidadElectronica>('v_electronica_unidades', capturado.kioscoId, 'fecha_creacion'),
        leerListado<ReparacionElectronica>('electronica_reparaciones', capturado.kioscoId, 'fecha_ingreso'),
      ])
      if (vigente(capturado, version)) set({ unidades, reparaciones })
    } catch {
      if (vigente(capturado, version)) set({ error: 'No se pudieron cargar los datos. Aplicá el SQL de electrónica y revisá la conexión.' })
    } finally { if (vigente(capturado, version)) set({ cargando: false }) }
  },
  buscarVenta: async (codigo) => {
    const capturado = contexto()
    const version = generacion
    const limpio = codigo.trim().replace(/^(?:ticket|venta)\s*#?\s*/i, '').replace(/^T-/i, '').toLowerCase()
    const completo = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(limpio)
    if (!completo && !/^[0-9a-f]{8}$/.test(limpio)) throw new Error('Ingresá el ID de venta o el código de ocho caracteres del ticket')
    let consulta = supabase.from('ventas').select('id,fecha_hora,estado,sincronizado,detalles:detalles_venta(id,producto_id,cantidad,producto:productos(descripcion,es_pesable,es_combo))').eq('kiosco_id', capturado.kioscoId)
    consulta = completo ? consulta.eq('id', limpio) : consulta.gte('id', `${limpio}-0000-0000-0000-000000000000`).lte('id', `${limpio}-ffff-ffff-ffff-ffffffffffff`)
    const { data, error } = await consulta.limit(2)
    if (!vigente(capturado, version)) throw new Error('Cambió el comercio activo; repetí la búsqueda')
    if (error || !data || data.length !== 1) throw new Error('No se encontró una venta única. Usá el ID completo y verificá que esté sincronizada')
    const venta = data[0] as unknown as VentaElectronica
    if (venta.estado !== 'COMPLETADA' || !venta.sincronizado) throw new Error('La venta debe estar completada y sincronizada')
    return venta
  },
  registrarUnidad: async (datos, solicitudId) => {
    const capturado = contexto(true)
    const version = generacion
    const valido = validarRegistroUnidad(datos)
    const { data, error } = await supabase.rpc('electronica_registrar_unidad', {
      p_solicitud_id: solicitudId, p_detalle_venta_id: valido.detalleVentaId, p_tipo: valido.tipo,
      p_identificador: valido.identificador, p_garantia_hasta: valido.garantiaHasta, p_condiciones: valido.condiciones,
    })
    if (error) throw new Error('No se pudo registrar la unidad. Verificá identificador, cantidad vendida y garantía; reintentá con los mismos datos si hubo un corte')
    validarRespuesta(data, capturado.kioscoId)
    if (!vigente(capturado, version)) throw new Error('Cambió el comercio activo; revisá el registro al volver')
    await get().cargar()
  },
  guardarReparacion: async (datos, solicitudId, anterior) => {
    const capturado = contexto(true)
    const version = generacion
    if (anterior && anterior.kiosco_id !== capturado.kioscoId) throw new Error('La reparación pertenece a otro comercio')
    const valido = validarReparacion(datos, anterior?.estado)
    const { data, error } = await supabase.rpc('electronica_guardar_reparacion', {
      p_solicitud_id: solicitudId, p_reparacion_id: anterior?.id ?? null, p_version: anterior?.version ?? null, p_datos: valido,
    })
    if (error) throw new Error('No se pudo guardar. Si otro puesto modificó la orden, actualizá la lista antes de editar nuevamente')
    validarRespuesta(data, capturado.kioscoId)
    if (!vigente(capturado, version)) throw new Error('Cambió el comercio activo; revisá la orden al volver')
    await get().cargar()
  },
}))
useAuthStore.subscribe((actual, previo) => {
  if (actual.usuario?.id !== previo.usuario?.id || actual.usuario?.kiosco_id !== previo.usuario?.kiosco_id
    || actual.usuario?.rol !== previo.usuario?.rol || actual.kiosco?.rubro !== previo.kiosco?.rubro) useElectronicaStore.getState().limpiar()
})
