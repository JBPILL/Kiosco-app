import { create } from 'zustand'
import { supabase, createUnauthenticatedClient } from '../lib/supabase'
import type { KioscoAdminView, Plan, PagoSuscripcion } from '../types/database'
import { calcularDiasRestantes } from './authStore'
import toast from 'react-hot-toast'

interface NuevoKioscoPayload {
  nombreKiosco: string
  direccion?: string
  telefono?: string
  nombreDueno: string
  emailDueno: string
  passwordDueno: string
  planId: string
  diasValidez: number
}

interface AdminState {
  kioscos: KioscoAdminView[]
  planes: Plan[]
  cargando: boolean
  cargandoAccion: boolean
  error: string | null

  cargarDatosAdmin: () => Promise<void>
  renovarSuscripcion: (
    kioscoId: string,
    meses: number,
    monto: number,
    medioPago: string,
    notas?: string
  ) => Promise<boolean>
  cambiarEstadoKiosco: (
    kioscoId: string,
    nuevoEstado: 'ACTIVO' | 'SOLO_LECTURA' | 'SUSPENDIDO'
  ) => Promise<boolean>
  crearKioscoCliente: (payload: NuevoKioscoPayload) => Promise<boolean>
  obtenerHistorialPagos: (suscripcionId: string) => Promise<PagoSuscripcion[]>
}

export const useAdminStore = create<AdminState>((set, get) => ({
  kioscos: [],
  planes: [],
  cargando: false,
  cargandoAccion: false,
  error: null,

  cargarDatosAdmin: async () => {
    set({ cargando: true, error: null })
    try {
      // 1. Cargar Planes
      const { data: planesData } = await supabase
        .from('planes')
        .select('*')
        .order('precio_mensual', { ascending: true })

      if (planesData) {
        set({ planes: planesData as Plan[] })
      }

      // 2. Intentar cargar vista consolidada v_admin_kioscos
      const { data: vistaData, error: vistaError } = await supabase
        .from('v_admin_kioscos')
        .select('*')
        .order('fecha_creacion', { ascending: false })

      if (!vistaError && vistaData) {
        set({
          kioscos: vistaData.map((k: KioscoAdminView) => ({
            ...k,
            dias_restantes: calcularDiasRestantes(k.fecha_vencimiento),
          })),
          cargando: false,
        })
        return
      }

      // Fallback manual si la vista v_admin_kioscos aún no se ejecutó en Supabase
      const { data: kioscosRaw, error: kError } = await supabase
        .from('kioscos')
        .select('*')
        .order('fecha_creacion', { ascending: false })

      if (kError) throw kError

      const { data: subsRaw } = await supabase
        .from('suscripciones')
        .select('*, plan:planes(*)')
        .order('fecha_vencimiento', { ascending: false })

      const { data: usuariosRaw } = await supabase
        .from('usuarios')
        .select('*')
        .eq('rol', 'DUEÑO')
        .eq('activo', true)

      const { data: pagosRaw } = await supabase
        .from('pagos_suscripcion')
        .select('*')
        .order('fecha_pago', { ascending: false })

      const listaConsolidada: KioscoAdminView[] = (kioscosRaw || []).map((k) => {
        const sub = (subsRaw || []).find((s) => s.kiosco_id === k.id)
        const dueno = (usuariosRaw || []).find((u) => u.kiosco_id === k.id)
        const ultPago = sub ? (pagosRaw || []).find((p) => p.suscripcion_id === sub.id) : null
        const dias = calcularDiasRestantes(sub?.fecha_vencimiento)

        return {
          kiosco_id: k.id,
          nombre_kiosco: k.nombre,
          direccion: k.direccion,
          telefono_kiosco: k.telefono,
          estado_kiosco: k.estado_suscripcion,
          fecha_creacion: k.fecha_creacion,
          dueno_usuario_id: dueno?.id || null,
          nombre_dueno: dueno?.nombre || null,
          email_dueno: dueno?.email || null,
          suscripcion_id: sub?.id || null,
          fecha_inicio: sub?.fecha_inicio || null,
          fecha_vencimiento: sub?.fecha_vencimiento || null,
          estado_suscripcion: sub?.estado || null,
          dias_restantes: dias,
          plan_id: sub?.plan_id || null,
          nombre_plan: sub?.plan?.nombre || null,
          precio_mensual: sub?.plan?.precio_mensual || null,
          fecha_ultimo_pago: ultPago?.fecha_pago || null,
          monto_ultimo_pago: ultPago?.monto || null,
          medio_ultimo_pago: ultPago?.medio_pago || null,
        }
      })

      set({ kioscos: listaConsolidada, cargando: false })
    } catch (error) {
      console.error('Error cargando datos de Super-Admin:', error)
      set({
        error: error instanceof Error ? error.message : 'Error al cargar panel de administración',
        cargando: false,
      })
    }
  },

  renovarSuscripcion: async (kioscoId, meses, monto, medioPago, notas) => {
    set({ cargandoAccion: true })
    try {
      // 1. Intentar RPC atómica
      const { data: rpcData, error: rpcError } = await supabase.rpc('fn_renovar_suscripcion', {
        p_kiosco_id: kioscoId,
        p_meses: meses,
        p_monto: monto,
        p_medio_pago: medioPago,
        p_notas: notas || null,
      })

      if (!rpcError && rpcData?.success) {
        toast.success(`Suscripción renovada con éxito por ${meses} mes(es)`)
        await get().cargarDatosAdmin()
        set({ cargandoAccion: false })
        return true
      }

      // Fallback directo si la RPC aún no fue migrada
      // Buscar suscripción actual
      const { data: subActual } = await supabase
        .from('suscripciones')
        .select('*')
        .eq('kiosco_id', kioscoId)
        .order('fecha_vencimiento', { ascending: false })
        .limit(1)
        .maybeSingle()

      let subId = subActual?.id
      let fechaBase = new Date()
      if (subActual?.fecha_vencimiento) {
        const [y, m, d] = subActual.fecha_vencimiento.split('-').map(Number)
        const vDate = new Date(y, m - 1, d)
        if (vDate > fechaBase) {
          fechaBase = vDate
        }
      }

      const nuevaFecha = new Date(fechaBase)
      nuevaFecha.setDate(nuevaFecha.getDate() + meses * 30)
      const nuevaFechaStr = nuevaFecha.toISOString().split('T')[0]
      const hoyStr = new Date().toISOString().split('T')[0]

      if (subId) {
        await supabase
          .from('suscripciones')
          .update({
            fecha_vencimiento: nuevaFechaStr,
            estado: 'ACTIVA',
          })
          .eq('id', subId)
      } else {
        const { data: planes } = await supabase.from('planes').select('id').limit(1)
        const planId = planes?.[0]?.id
        const { data: newSub } = await supabase
          .from('suscripciones')
          .insert({
            kiosco_id: kioscoId,
            plan_id: planId,
            fecha_inicio: hoyStr,
            fecha_vencimiento: nuevaFechaStr,
            estado: 'ACTIVA',
          })
          .select('id')
          .single()
        subId = newSub?.id
      }

      // Actualizar estado del kiosco a ACTIVO
      await supabase
        .from('kioscos')
        .update({ estado_suscripcion: 'ACTIVO' })
        .eq('id', kioscoId)

      // Registrar pago si hay suscripción
      if (subId) {
        await supabase.from('pagos_suscripcion').insert({
          suscripcion_id: subId,
          monto,
          fecha_pago: hoyStr,
          medio_pago: medioPago,
          notas: notas || null,
        })
      }

      toast.success(`Suscripción renovada hasta el ${nuevaFechaStr}`)
      await get().cargarDatosAdmin()
      set({ cargandoAccion: false })
      return true
    } catch (err) {
      console.error('Error al renovar suscripción:', err)
      toast.error('Error al registrar la renovación de la suscripción')
      set({ cargandoAccion: false })
      return false
    }
  },

  cambiarEstadoKiosco: async (kioscoId, nuevoEstado) => {
    set({ cargandoAccion: true })
    try {
      const { error } = await supabase
        .from('kioscos')
        .update({ estado_suscripcion: nuevoEstado })
        .eq('id', kioscoId)

      if (error) throw error

      toast.success(`Estado del kiosco cambiado a ${nuevoEstado}`)
      await get().cargarDatosAdmin()
      set({ cargandoAccion: false })
      return true
    } catch (err) {
      console.error('Error cambiando estado:', err)
      toast.error('Error al modificar el estado del kiosco')
      set({ cargandoAccion: false })
      return false
    }
  },

  crearKioscoCliente: async (payload) => {
    set({ cargandoAccion: true })
    try {
      // 1. Crear credenciales en Supabase Auth usando cliente no autenticado
      const tempClient = createUnauthenticatedClient()
      const { data: authData, error: authError } = await tempClient.auth.signUp({
        email: payload.emailDueno.trim(),
        password: payload.passwordDueno.trim(),
      })

      if (authError) {
        let msg = authError.message
        if (msg.toLowerCase().includes('already registered')) {
          msg = 'Ese correo ya se encuentra registrado en Supabase Auth.'
        }
        throw new Error(msg)
      }

      const authUserId = authData?.user?.id || null

      // 2. Crear kiosco
      const { data: kioscoNuevo, error: kError } = await supabase
        .from('kioscos')
        .insert({
          nombre: payload.nombreKiosco.trim(),
          direccion: payload.direccion?.trim() || null,
          telefono: payload.telefono?.trim() || null,
          estado_suscripcion: 'ACTIVO',
        })
        .select('id')
        .single()

      if (kError || !kioscoNuevo) throw kError || new Error('No se pudo crear el kiosco')

      const kioscoId = kioscoNuevo.id

      // 3. Crear usuario DUEÑO asociado
      const { error: uError } = await supabase.from('usuarios').insert({
        kiosco_id: kioscoId,
        auth_user_id: authUserId,
        nombre: payload.nombreDueno.trim(),
        email: payload.emailDueno.trim(),
        rol: 'DUEÑO',
        activo: true,
        es_superadmin: false,
      })

      if (uError) throw uError

      // 4. Crear suscripción inicial
      const hoy = new Date()
      const vencimiento = new Date()
      vencimiento.setDate(vencimiento.getDate() + payload.diasValidez)

      const hoyStr = hoy.toISOString().split('T')[0]
      const vencimientoStr = vencimiento.toISOString().split('T')[0]

      const { error: sError } = await supabase.from('suscripciones').insert({
        kiosco_id: kioscoId,
        plan_id: payload.planId,
        fecha_inicio: hoyStr,
        fecha_vencimiento: vencimientoStr,
        estado: 'ACTIVA',
      })

      if (sError) throw sError

      toast.success(`Kiosco "${payload.nombreKiosco}" dado de alta con éxito`)
      await get().cargarDatosAdmin()
      set({ cargandoAccion: false })
      return true
    } catch (err) {
      console.error('Error creando kiosco cliente:', err)
      toast.error(err instanceof Error ? err.message : 'Error al registrar el nuevo kiosco')
      set({ cargandoAccion: false })
      return false
    }
  },

  obtenerHistorialPagos: async (suscripcionId) => {
    try {
      const { data, error } = await supabase
        .from('pagos_suscripcion')
        .select('*')
        .eq('suscripcion_id', suscripcionId)
        .order('fecha_pago', { ascending: false })

      if (error) throw error
      return (data as PagoSuscripcion[]) || []
    } catch (err) {
      console.error('Error al obtener historial de pagos:', err)
      return []
    }
  },
}))
