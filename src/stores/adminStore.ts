import { create } from 'zustand'
import { supabase, createUnauthenticatedClient } from '../lib/supabase'
import type { KioscoAdminView, Plan, PagoSuscripcion, RubroComercio } from '../types/database'
import { obtenerCatalogoPorRubro, esCatalogoPlantilla } from '../data/catalogosPorRubro'
import { calcularDiasRestantes } from './authStore'
import { getFechaLocal } from '../lib/utils'
import toast from 'react-hot-toast'

interface NuevoKioscoPayload {
  nombreKiosco: string
  direccion?: string
  telefono?: string
  rubro?: RubroComercio
  nombreDueno: string
  emailDueno: string
  passwordDueno: string
  planId: string
  diasValidez: number
}

export interface EditarKioscoPayload {
  nombreKiosco: string
  direccion?: string
  telefono?: string
  rubro?: RubroComercio
  estadoKiosco: 'ACTIVO' | 'SOLO_LECTURA' | 'SUSPENDIDO'
  duenoUsuarioId?: string | null
  nombreDueno?: string
  emailDueno?: string
  suscripcionId?: string | null
  planId?: string
  fechaVencimiento?: string
}

export interface PagoSuscripcionDetallado extends PagoSuscripcion {
  kiosco_id?: string
  nombre_kiosco?: string
  rubro?: RubroComercio
  nombre_dueno?: string
  email_dueno?: string
  nombre_plan?: string
}

interface AdminState {
  kioscos: KioscoAdminView[]
  planes: Plan[]
  todosLosPagos: PagoSuscripcionDetallado[]
  cargando: boolean
  cargandoAccion: boolean
  cargandoReportes: boolean
  error: string | null

  cargarDatosAdmin: () => Promise<void>
  cargarReportesAdmin: () => Promise<void>
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
  editarKiosco: (kioscoId: string, payload: EditarKioscoPayload) => Promise<boolean>
  eliminarKiosco: (kioscoId: string) => Promise<boolean>
  crearKioscoCliente: (payload: NuevoKioscoPayload) => Promise<boolean>
  obtenerHistorialPagos: (suscripcionId: string) => Promise<PagoSuscripcion[]>
  actualizarPrecioPlan: (planId: string, nuevoPrecio: number, nuevoNombre?: string) => Promise<boolean>
  crearPlan: (nombre: string, precioMensual: number, maxUsuarios?: number, descripcion?: string) => Promise<boolean>
  eliminarPlan: (planId: string) => Promise<boolean>
}

export const useAdminStore = create<AdminState>((set, get) => ({
  kioscos: [],
  planes: [],
  todosLosPagos: [],
  cargando: false,
  cargandoAccion: false,
  cargandoReportes: false,
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
          rubro: k.rubro || 'KIOSCO',
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
      const nuevaFechaStr = getFechaLocal(nuevaFecha)
      const hoyStr = getFechaLocal()

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
          .maybeSingle()
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

  editarKiosco: async (kioscoId, payload) => {
    set({ cargandoAccion: true })
    try {
      // 1. Actualizar datos base del kiosco
      const { error: kError } = await supabase
        .from('kioscos')
        .update({
          nombre: payload.nombreKiosco.trim(),
          direccion: payload.direccion?.trim() || null,
          telefono: payload.telefono?.trim() || null,
          estado_suscripcion: payload.estadoKiosco,
          ...(payload.rubro ? { rubro: payload.rubro } : {}),
        })
        .eq('id', kioscoId)

      if (kError) throw kError

      // 2. Actualizar datos del dueño si existe
      if (payload.duenoUsuarioId && payload.nombreDueno) {
        const { error: uError } = await supabase
          .from('usuarios')
          .update({
            nombre: payload.nombreDueno.trim(),
            email: payload.emailDueno?.trim() || null,
          })
          .eq('id', payload.duenoUsuarioId)

        if (uError) throw uError
      }

      // 3. Actualizar suscripción si existe
      if (payload.suscripcionId) {
        const subUpdates: Record<string, any> = {}
        if (payload.planId) subUpdates.plan_id = payload.planId
        if (payload.fechaVencimiento) subUpdates.fecha_vencimiento = payload.fechaVencimiento
        if (payload.estadoKiosco === 'ACTIVO') subUpdates.estado = 'ACTIVA'
        else if (payload.estadoKiosco === 'SUSPENDIDO') subUpdates.estado = 'SUSPENDIDA'

        if (Object.keys(subUpdates).length > 0) {
          const { error: sError } = await supabase
            .from('suscripciones')
            .update(subUpdates)
            .eq('id', payload.suscripcionId)

          if (sError) throw sError
        }
      }

      toast.success('Datos del kiosco actualizados correctamente')
      await get().cargarDatosAdmin()
      set({ cargandoAccion: false })
      return true
    } catch (err) {
      console.error('Error editando kiosco:', err)
      toast.error('Error al guardar las modificaciones del kiosco')
      set({ cargandoAccion: false })
      return false
    }
  },

  eliminarKiosco: async (kioscoId) => {
    set({ cargandoAccion: true })
    try {
      // 1. Intentar funciones RPC en Supabase con privilegios SECURITY DEFINER
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('admin_eliminar_kiosco', {
          p_kiosco_id: kioscoId,
        })
        if (!rpcError && rpcData) {
          toast.success('Kiosco eliminado correctamente')
          await get().cargarDatosAdmin()
          set({ cargandoAccion: false })
          return true
        }
        if (rpcError) {
          console.warn('RPC admin_eliminar_kiosco retornó aviso:', rpcError)
        }
      } catch (e) {
        console.warn('Excepción al llamar admin_eliminar_kiosco:', e)
      }

      try {
        const { data: rpcData2, error: rpcError2 } = await supabase.rpc('fn_eliminar_kiosco', {
          p_kiosco_id: kioscoId,
        })
        if (!rpcError2 && rpcData2) {
          toast.success('Kiosco eliminado correctamente')
          await get().cargarDatosAdmin()
          set({ cargandoAccion: false })
          return true
        }
      } catch {}

      // 2. Fallback exhaustivo eliminando tablas dependientes en orden inverso de claves foráneas
      // 2.1 Cuentas corrientes y clientes
      try { await supabase.from('movimientos_cuenta_corriente').delete().eq('kiosco_id', kioscoId) } catch {}
      try { await supabase.from('clientes').delete().eq('kiosco_id', kioscoId) } catch {}

      // 2.2 Proveedores y compras
      try { await supabase.from('pagos_proveedor').delete().eq('kiosco_id', kioscoId) } catch {}
      try {
        const { data: compras } = await supabase.from('compras_proveedor').select('id').eq('kiosco_id', kioscoId).limit(10000)
        if (compras && compras.length > 0) {
          const cIds = compras.map((c) => c.id)
          await supabase.from('detalles_compra').delete().in('compra_id', cIds)
        }
        await supabase.from('compras_proveedor').delete().eq('kiosco_id', kioscoId)
      } catch {}
      try { await supabase.from('proveedores').delete().eq('kiosco_id', kioscoId) } catch {}

      // 2.3 Devoluciones de venta
      try {
        const { data: devs } = await supabase.from('devoluciones_venta').select('id').eq('kiosco_id', kioscoId).limit(10000)
        if (devs && devs.length > 0) {
          const dIds = devs.map((d) => d.id)
          await supabase.from('detalles_devolucion').delete().in('devolucion_id', dIds)
        }
        await supabase.from('devoluciones_venta').delete().eq('kiosco_id', kioscoId)
      } catch {}

      // 2.4 Tickets de soporte
      try { await supabase.from('tickets_soporte').delete().eq('kiosco_id', kioscoId) } catch {}

      // 2.5 Combos, lotes y promociones
      try { await supabase.from('combo_items').delete().eq('kiosco_id', kioscoId) } catch {}
      try { await supabase.from('lotes_producto').delete().eq('kiosco_id', kioscoId) } catch {}
      try { await supabase.from('promociones').delete().eq('kiosco_id', kioscoId) } catch {}

      // 2.6 Ventas, detalles y pagos
      try {
        const { data: vts } = await supabase.from('ventas').select('id').eq('kiosco_id', kioscoId).limit(10000)
        if (vts && vts.length > 0) {
          const vIds = vts.map((v) => v.id)
          await supabase.from('detalles_venta').delete().in('venta_id', vIds)
          await supabase.from('pagos_venta').delete().in('venta_id', vIds)
          await supabase.from('ventas').delete().eq('kiosco_id', kioscoId)
        }
      } catch {}

      // 2.7 Movimientos de stock
      try { await supabase.from('movimientos_stock').delete().eq('kiosco_id', kioscoId) } catch {}

      // 2.8 Cajas y sesiones
      try { await supabase.from('movimientos_caja').delete().eq('kiosco_id', kioscoId) } catch {}
      try { await supabase.from('sesiones_caja').delete().eq('kiosco_id', kioscoId) } catch {}
      try { await supabase.from('cajas').delete().eq('kiosco_id', kioscoId) } catch {}

      // 2.9 Limpieza profunda de referencias hijas por producto_id antes de borrar productos
      try {
        const { data: prods } = await supabase.from('productos').select('id').eq('kiosco_id', kioscoId).limit(10000)
        if (prods && prods.length > 0) {
          const pIds = prods.map((p) => p.id)
          await supabase.from('detalles_compra').delete().in('producto_id', pIds)
          await supabase.from('detalles_venta').delete().in('producto_id', pIds)
          await supabase.from('detalles_devolucion').delete().in('producto_id', pIds)
          await supabase.from('combo_items').delete().in('combo_producto_id', pIds)
          await supabase.from('combo_items').delete().in('componente_producto_id', pIds)
          await supabase.from('movimientos_stock').delete().in('producto_id', pIds)
          await supabase.from('lotes_producto').delete().in('producto_id', pIds)
          await supabase.from('promociones').delete().in('producto_id', pIds)
        }
      } catch (errDet) {
        console.warn('Limpieza de detalles por producto:', errDet)
      }

      // 2.10 Productos y categorías
      try { await supabase.from('productos').delete().eq('kiosco_id', kioscoId) } catch {}
      try { await supabase.from('categorias').delete().eq('kiosco_id', kioscoId) } catch {}

      // 2.11 Suscripciones y pagos de suscripción
      try {
        const { data: subs } = await supabase.from('suscripciones').select('id').eq('kiosco_id', kioscoId)
        if (subs && subs.length > 0) {
          const subIds = subs.map((s) => s.id)
          await supabase.from('pagos_suscripcion').delete().in('suscripcion_id', subIds)
          await supabase.from('suscripciones').delete().eq('kiosco_id', kioscoId)
        }
      } catch {}

      // 2.12 Configuración AFIP si existiese
      try { await supabase.from('configuracion_afip').delete().eq('kiosco_id', kioscoId) } catch {}

      // 2.13 Usuarios asociados a este kiosco
      try { await supabase.from('usuarios').delete().eq('kiosco_id', kioscoId) } catch {}

      // 2.14 Finalmente eliminar el kiosco
      const { error: kError } = await supabase.from('kioscos').delete().eq('id', kioscoId)
      if (kError) {
        console.error('Error final borrando kiosco:', kError)
        if (
          kError.message?.includes('violates foreign key constraint') ||
          kError.message?.includes('detalles_compra') ||
          kError.message?.includes('relation')
        ) {
          throw new Error(
            'Falta actualizar la función de borrado en Supabase. Ejecutá el script SQL "supabase_admin_eliminar_kiosco.sql" en el Editor SQL de Supabase para activar la eliminación en cascada.'
          )
        }
        throw new Error(kError.message || 'No se pudo eliminar el kiosco de la base de datos')
      }

      toast.success('Kiosco eliminado del sistema')
      await get().cargarDatosAdmin()
      set({ cargandoAccion: false })
      return true
    } catch (err: any) {
      console.error('Error al eliminar kiosco:', err)
      toast.error(err?.message ? `Error: ${err.message}` : 'Error al eliminar el kiosco')
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
          rubro: payload.rubro || 'KIOSCO',
        })
        .select('id')
        .maybeSingle()

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

      const hoyStr = getFechaLocal(hoy)
      const vencimientoStr = getFechaLocal(vencimiento)

      const { error: sError } = await supabase.from('suscripciones').insert({
        kiosco_id: kioscoId,
        plan_id: payload.planId,
        fecha_inicio: hoyStr,
        fecha_vencimiento: vencimientoStr,
        estado: 'ACTIVA',
      })

      if (sError) throw sError

      // 5. Inicializar categorías estándar según el rubro
      try {
        const esFotocopiadora = payload.rubro === 'FOTOCOPIADORA_LIBRERIA'
        const categoriasIniciales = payload.rubro && esCatalogoPlantilla(payload.rubro)
          ? [...new Set(obtenerCatalogoPorRubro(payload.rubro).map(p => p.categoria_nombre))]
            .map((nombre, i) => ({ nombre, color: '#4f46e5', orden: i + 1 }))
          : esFotocopiadora
          ? [
              { nombre: 'Fotocopias e Impresiones', color: '#3b82f6', orden: 1 },
              { nombre: 'Librería Escolar', color: '#10b981', orden: 2 },
              { nombre: 'Librería Comercial', color: '#f59e0b', orden: 3 },
              { nombre: 'Anillados y Plastificados', color: '#8b5cf6', orden: 4 },
              { nombre: 'Insumos e Informática', color: '#6366f1', orden: 5 },
              { nombre: 'Papelería y Resmas', color: '#ec4899', orden: 6 },
            ]
          : [
              { nombre: 'Golosinas', color: '#f59e0b', orden: 1 },
              { nombre: 'Bebidas', color: '#3b82f6', orden: 2 },
              { nombre: 'Snacks', color: '#ef4444', orden: 3 },
              { nombre: 'Cigarrillos', color: '#6b7280', orden: 4 },
              { nombre: 'Almacén', color: '#10b981', orden: 5 },
              { nombre: 'Lácteos', color: '#8b5cf6', orden: 6 },
            ]

        await supabase.from('categorias').insert(
          categoriasIniciales.map((c) => ({
            kiosco_id: kioscoId,
            nombre: c.nombre,
            color: c.color,
            orden: c.orden,
          }))
        )
      } catch (catErr) {
        console.warn('Error sembrando categorías iniciales:', catErr)
      }

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

  actualizarPrecioPlan: async (planId: string, nuevoPrecio: number, nuevoNombre?: string) => {
    set({ cargandoAccion: true })
    try {
      const updates: Record<string, any> = { precio_mensual: nuevoPrecio }
      if (nuevoNombre) updates.nombre = nuevoNombre.trim()

      const { error } = await supabase
        .from('planes')
        .update(updates)
        .eq('id', planId)

      if (error) throw error

      toast.success('Precio del plan actualizado correctamente')
      await get().cargarDatosAdmin()
      set({ cargandoAccion: false })
      return true
    } catch (err) {
      console.error('Error actualizando plan:', err)
      toast.error('Error al actualizar el precio del plan')
      set({ cargandoAccion: false })
      return false
    }
  },

  crearPlan: async (nombre: string, precioMensual: number, maxUsuarios: number = 3, descripcion?: string) => {
    set({ cargandoAccion: true })
    try {
      const { error } = await supabase.from('planes').insert({
        nombre: nombre.trim(),
        precio_mensual: precioMensual,
        max_usuarios: maxUsuarios,
        descripcion: descripcion?.trim() || null,
        activo: true,
      })

      if (error) throw error

      toast.success(`Plan "${nombre}" creado con éxito`)
      await get().cargarDatosAdmin()
      set({ cargandoAccion: false })
      return true
    } catch (err) {
      console.error('Error creando plan:', err)
      toast.error('Error al crear el nuevo plan')
      set({ cargandoAccion: false })
      return false
    }
  },

  eliminarPlan: async (planId: string) => {
    set({ cargandoAccion: true })
    try {
      // 1. Verificar si hay kioscos vinculados actualmente a este plan
      const kioscosVinculados = get().kioscos.filter((k) => k.plan_id === planId)
      if (kioscosVinculados.length > 0) {
        toast.error(
          `No se puede eliminar este plan: tiene ${kioscosVinculados.length} kiosco(s) asignado(s). Reasigna los comercios antes de darlo de baja.`
        )
        set({ cargandoAccion: false })
        return false
      }

      // 2. Intentar eliminación física de la tabla planes
      const { error: deleteError } = await supabase.from('planes').delete().eq('id', planId)

      if (deleteError) {
        // Si no se puede borrar físicamente por historial de suscripciones pasadas, marcar como inactivo (soft-delete)
        console.warn('No se pudo borrar físicamente el plan (posible historial previo), procediendo a desactivarlo:', deleteError)
        const { error: updateError } = await supabase
          .from('planes')
          .update({ activo: false })
          .eq('id', planId)

        if (updateError) throw updateError
      }

      toast.success('Plan eliminado correctamente')
      await get().cargarDatosAdmin()
      set({ cargandoAccion: false })
      return true
    } catch (err) {
      console.error('Error al eliminar plan:', err)
      toast.error('Error al eliminar el plan')
      set({ cargandoAccion: false })
      return false
    }
  },

  cargarReportesAdmin: async () => {
    set({ cargandoReportes: true })
    try {
      if (get().kioscos.length === 0) {
        await get().cargarDatosAdmin()
      }
      const kioscosList = get().kioscos

      const [{ data: pagos, error }, { data: subsData }] = await Promise.all([
        supabase
          .from('pagos_suscripcion')
          .select('*')
          .order('fecha_pago', { ascending: false }),
        supabase
          .from('suscripciones')
          .select('id, kiosco_id, plan:planes(nombre)'),
      ])

      if (error) throw error

      const mapaSubs = new Map<string, { kiosco_id: string; nombre_plan?: string }>()
      for (const s of subsData || []) {
        mapaSubs.set(s.id, {
          kiosco_id: s.kiosco_id,
          nombre_plan: (s.plan as any)?.nombre,
        })
      }

      const enriquecidos: PagoSuscripcionDetallado[] = (pagos || []).map((p: any) => {
        const subInfo = mapaSubs.get(p.suscripcion_id)
        const kMatch = kioscosList.find(
          (k) => (subInfo && k.kiosco_id === subInfo.kiosco_id) || k.suscripcion_id === p.suscripcion_id
        )
        return {
          id: p.id,
          suscripcion_id: p.suscripcion_id,
          monto: Number(p.monto) || 0,
          fecha_pago: p.fecha_pago,
          medio_pago: p.medio_pago || 'TRANSFERENCIA',
          comprobante: p.comprobante,
          notas: p.notas,
          kiosco_id: kMatch?.kiosco_id || subInfo?.kiosco_id,
          nombre_kiosco: kMatch?.nombre_kiosco || 'Comercio Registrado',
          rubro: kMatch?.rubro || 'KIOSCO',
          nombre_dueno: kMatch?.nombre_dueno || 'Cliente',
          email_dueno: kMatch?.email_dueno || '',
          nombre_plan: kMatch?.nombre_plan || subInfo?.nombre_plan || 'Plan SaaS',
        }
      })

      set({ todosLosPagos: enriquecidos, cargandoReportes: false })
    } catch (err) {
      console.error('Error al cargar reportes globales de Super-Admin:', err)
      set({ cargandoReportes: false })
    }
  },
}))
