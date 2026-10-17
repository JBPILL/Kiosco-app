import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { ejecutarMutacionComercial, exigirAdminComercial, prepararOperacionComercial, confirmarOperacionComercial } from '../lib/commercialClient'
import type { KioscoAdminView, Plan, PagoSuscripcion, RubroComercio } from '../types/database'
import toast from 'react-hot-toast'

interface NuevoKioscoPayload {
  nombreKiosco: string; direccion?: string; telefono?: string; rubro?: RubroComercio
  nombreDueno: string; emailDueno: string; passwordDueno: string; planId: string; diasValidez: number
}
export interface EditarKioscoPayload {
  nombreKiosco: string; direccion?: string; telefono?: string; rubro?: RubroComercio
  estadoKiosco: 'ACTIVO' | 'SOLO_LECTURA' | 'SUSPENDIDO'
  duenoUsuarioId?: string | null; nombreDueno?: string; emailDueno?: string
  suscripcionId?: string | null; planId?: string; fechaVencimiento?: string
}
export interface PagoSuscripcionDetallado extends PagoSuscripcion {
  kiosco_id?: string; nombre_kiosco?: string; rubro?: RubroComercio
  nombre_dueno?: string; email_dueno?: string; nombre_plan?: string
}
interface AdminState {
  kioscos: KioscoAdminView[]; planes: Plan[]; todosLosPagos: PagoSuscripcionDetallado[]
  cargando: boolean; cargandoAccion: boolean; cargandoReportes: boolean; error: string | null
  cargarDatosAdmin: () => Promise<void>; cargarReportesAdmin: () => Promise<void>
  renovarSuscripcion: (kioscoId: string, meses: number, monto: number, medioPago: string, notas?: string) => Promise<boolean>
  cambiarEstadoKiosco: (kioscoId: string, estado: 'ACTIVO' | 'SOLO_LECTURA' | 'SUSPENDIDO') => Promise<boolean>
  editarKiosco: (kioscoId: string, payload: EditarKioscoPayload) => Promise<boolean>
  eliminarKiosco: (kioscoId: string) => Promise<boolean>
  crearKioscoCliente: (payload: NuevoKioscoPayload) => Promise<boolean>
  obtenerHistorialPagos: (suscripcionId: string) => Promise<PagoSuscripcion[]>
  actualizarPrecioPlan: (planId: string, precio: number, nombre?: string) => Promise<boolean>
  crearPlan: (nombre: string, precio: number, maxUsuarios?: number, descripcion?: string) => Promise<boolean>
  eliminarPlan: (planId: string) => Promise<boolean>
}
const mensaje = (error: unknown): string => error instanceof Error ? error.message : 'Operación comercial no confirmada.'
export const useAdminStore = create<AdminState>((set, get) => {
  const mutate = async (name: string, scope: string, args: Record<string, unknown>, success: string): Promise<boolean> => {
    if (get().cargandoAccion) return false
    set({ cargandoAccion: true, error: null })
    try {
      await ejecutarMutacionComercial(name, scope, args)
      toast.success(success)
      await get().cargarDatosAdmin()
      return true
    } catch (error) { set({ error: mensaje(error) }); toast.error(mensaje(error)); return false }
    finally { set({ cargandoAccion: false }) }
  }
  const savePlan = (p: Plan) => mutate('actualizar_plan', `plan:${p.id}`, {
    p_plan_id: p.id, p_nombre: p.nombre, p_precio: p.precio_mensual, p_max_usuarios: p.max_usuarios,
    p_activo: p.activo, p_descripcion: p.descripcion,
  }, 'Plan confirmado')
  return {
    kioscos: [], planes: [], todosLosPagos: [], cargando: false, cargandoAccion: false, cargandoReportes: false, error: null,
    cargarDatosAdmin: async () => {
      set({ cargando: true, error: null })
      try {
        exigirAdminComercial()
        const { data, error } = await supabase.rpc('leer_administracion_comercial')
        if (error || !data || !Array.isArray(data.kioscos) || !Array.isArray(data.planes) || !Array.isArray(data.pagos)) throw new Error('No se pudo cargar administración comercial.')
        set({ kioscos: data.kioscos, planes: data.planes, todosLosPagos: data.pagos })
      } catch (error) { set({ kioscos: [], planes: [], todosLosPagos: [], error: mensaje(error) }) }
      finally { set({ cargando: false }) }
    },
    cargarReportesAdmin: async () => {
      set({ cargandoReportes: true })
      try { await get().cargarDatosAdmin() } finally { set({ cargandoReportes: false }) }
    },
    renovarSuscripcion: (id, meses, monto, medioPago, notas) => mutate('renovar_suscripcion_comercial', `renovar:${id}`,
      { p_kiosco_id: id, p_meses: meses, p_monto: monto, p_medio_pago: medioPago, p_notas: notas || null }, 'Renovación confirmada'),
    cambiarEstadoKiosco: (id, estado) => mutate('cambiar_estado_comercial', `estado:${id}`,
      { p_kiosco_id: id, p_estado: estado }, 'Estado comercial confirmado'),
    editarKiosco: (id, payload) => mutate('editar_comercio_comercial', `editar:${id}`,
      { p_kiosco_id: id, p_datos: payload }, 'Datos del comercio confirmados'),
    eliminarKiosco: async () => {
      toast.error('La eliminación de comercios está fuera de alcance. Usá la suspensión auditada.')
      return false
    },
    crearKioscoCliente: async payload => {
      if (get().cargandoAccion) return false
      set({ cargandoAccion: true, error: null })
      try {
        const safe = { nombreKiosco: payload.nombreKiosco.trim(), nombreDueno: payload.nombreDueno.trim(),
          email: payload.emailDueno.trim().toLowerCase(), direccion: payload.direccion?.trim() || '',
          telefono: payload.telefono?.trim() || '', rubro: payload.rubro || 'KIOSCO', planId: payload.planId, diasValidez: payload.diasValidez }
        const { key, pending } = prepararOperacionComercial(`crear:${safe.email}`, safe)
        const { data, error } = await supabase.functions.invoke('provision-commerce', {
          body: { ...pending.solicitud, operacionId: pending.id, password: payload.passwordDueno },
        })
        if (error || !data || data.success !== true) throw new Error('Alta no confirmada. Conservá los datos; si persiste, requiere conciliación administrativa.')
        confirmarOperacionComercial(key)
        toast.success('Comercio y Dueño confirmados')
        await get().cargarDatosAdmin()
        return true
      } catch (error) { set({ error: mensaje(error) }); toast.error(mensaje(error)); return false }
      finally { set({ cargandoAccion: false }) }
    },
    obtenerHistorialPagos: async id => {
      await get().cargarDatosAdmin()
      if (get().error) { toast.error(get().error!); return [] }
      return get().todosLosPagos.filter(p => p.suscripcion_id === id)
    },
    actualizarPrecioPlan: async (id, precio, nombre) => {
      const plan = get().planes.find(p => p.id === id)
      if (!plan) { toast.error('Plan no disponible'); return false }
      return savePlan({ ...plan, precio_mensual: precio, nombre: nombre?.trim() || plan.nombre })
    },
    crearPlan: (nombre, precio, max = 3, descripcion) => mutate('actualizar_plan', `crear-plan:${nombre.trim()}`,
      { p_plan_id: null, p_nombre: nombre.trim(), p_precio: precio, p_max_usuarios: max, p_activo: true, p_descripcion: descripcion?.trim() || null }, 'Plan creado'),
    eliminarPlan: async id => {
      const plan = get().planes.find(p => p.id === id)
      if (!plan) { toast.error('Plan no disponible'); return false }
      return savePlan({ ...plan, activo: false })
    },
  }
})
