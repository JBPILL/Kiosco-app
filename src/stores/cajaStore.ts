import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'
import type {
  SesionCaja,
  ResumenCaja,
  Usuario,
  MovimientoCaja,
  TipoMovimientoCaja,
  MotivoMovimientoCaja,
} from '../types/database'
import toast from 'react-hot-toast'

interface CajaState {
  sesionActiva: (SesionCaja & { usuario?: Usuario }) | null
  resumenActivo: ResumenCaja | null
  movimientosCaja: MovimientoCaja[]
  cargando: boolean

  verificarSesionActiva: () => Promise<void>
  abrirCaja: (montoInicial: number) => Promise<boolean>
  cargarResumenSesion: (sesionId?: string) => Promise<ResumenCaja | null>
  cargarMovimientosSesion: (sesionId: string) => Promise<MovimientoCaja[]>
  registrarMovimientoCaja: (
    tipo: TipoMovimientoCaja,
    motivo: MotivoMovimientoCaja,
    monto: number,
    descripcion: string
  ) => Promise<boolean>
  cerrarCaja: (montoDeclarado: number) => Promise<boolean>
  arqueoCiegoObligatorio: boolean
  cargarArqueoCiegoConfig: () => Promise<boolean>
  guardarArqueoCiegoConfig: (obligatorio: boolean) => Promise<boolean>
}

function getLocalMovimientos(sesionId: string): MovimientoCaja[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(`kioskopos_movimientos_${sesionId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalMovimientos(sesionId: string, movimientos: MovimientoCaja[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`kioskopos_movimientos_${sesionId}`, JSON.stringify(movimientos))
  } catch (e) {
    console.error('Error guardando movimientos locales:', e)
  }
}

export const useCajaStore = create<CajaState>((set, get) => ({
  sesionActiva: null,
  resumenActivo: null,
  movimientosCaja: [],
  cargando: false,

  verificarSesionActiva: async () => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) return

    set({ cargando: true })
    try {
      const { data, error } = await supabase
        .from('sesiones_caja')
        .select('*, usuario:usuarios(id, nombre, rol)')
        .eq('kiosco_id', usuario.kiosco_id)
        .eq('estado', 'ABIERTA')
        .order('fecha_apertura', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Error al verificar sesión de caja:', error)
      }

      set({ sesionActiva: (data as (SesionCaja & { usuario?: Usuario })) || null })

      if (data?.id) {
        await get().cargarMovimientosSesion(data.id)
        await get().cargarResumenSesion(data.id)
      } else {
        set({ resumenActivo: null, movimientosCaja: [] })
      }
    } catch (err) {
      console.error('Error verificando sesión de caja:', err)
    } finally {
      set({ cargando: false })
    }
  },

  abrirCaja: async (montoInicial: number) => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id || !usuario?.id) {
      toast.error('No se pudo identificar al usuario activo')
      return false
    }

    set({ cargando: true })
    try {
      const { data, error } = await supabase
        .from('sesiones_caja')
        .insert({
          kiosco_id: usuario.kiosco_id,
          usuario_id: usuario.id,
          monto_inicial: Math.max(0, montoInicial),
          estado: 'ABIERTA',
        })
        .select('*, usuario:usuarios(id, nombre, rol)')
        .single()

      if (error) throw error

      set({
        sesionActiva: data as (SesionCaja & { usuario?: Usuario }),
        movimientosCaja: [],
        resumenActivo: {
          sesion_caja_id: data.id,
          kiosco_id: data.kiosco_id,
          usuario_id: data.usuario_id,
          nombre_cajero: usuario.nombre,
          fecha_apertura: data.fecha_apertura,
          fecha_cierre: null,
          monto_inicial: data.monto_inicial,
          total_ventas: 0,
          total_facturado: 0,
          total_efectivo: 0,
          total_mercadopago: 0,
          total_transferencia: 0,
          total_tarjeta: 0,
          total_cuenta_corriente: 0,
          total_ingresos_extra: 0,
          total_egresos: 0,
          efectivo_esperado_en_caja: data.monto_inicial,
        },
      })

      toast.success('Caja abierta correctamente')
      return true
    } catch (err) {
      console.error('Error al abrir caja:', err)
      toast.error('Error al abrir la caja')
      return false
    } finally {
      set({ cargando: false })
    }
  },

  cargarMovimientosSesion: async (sesionId: string) => {
    try {
      const { data, error } = await supabase
        .from('movimientos_caja')
        .select('*, usuario:usuarios(id, nombre)')
        .eq('sesion_caja_id', sesionId)
        .order('fecha_hora', { ascending: false })

      if (!error && data) {
        set({ movimientosCaja: data as MovimientoCaja[] })
        return data as MovimientoCaja[]
      }
    } catch {
      // Fallback a almacenamiento local
    }

    const locales = getLocalMovimientos(sesionId)
    set({ movimientosCaja: locales })
    return locales
  },

  registrarMovimientoCaja: async (tipo, motivo, monto, descripcion) => {
    const sesion = get().sesionActiva
    const usuario = useAuthStore.getState().usuario
    if (!sesion?.id || !usuario?.kiosco_id) {
      toast.error('No hay una sesión de caja abierta')
      return false
    }

    const nuevoMovimiento: MovimientoCaja = {
      id: uuidv4(),
      kiosco_id: usuario.kiosco_id,
      sesion_caja_id: sesion.id,
      usuario_id: usuario.id,
      tipo,
      motivo,
      monto: Math.max(0, monto),
      descripcion: descripcion.trim(),
      fecha_hora: new Date().toISOString(),
      usuario: { id: usuario.id, nombre: usuario.nombre } as Usuario,
    }

    const actuales = getLocalMovimientos(sesion.id)
    const actualizados = [nuevoMovimiento, ...actuales]
    saveLocalMovimientos(sesion.id, actualizados)

    try {
      await supabase.from('movimientos_caja').insert({
        id: nuevoMovimiento.id,
        kiosco_id: nuevoMovimiento.kiosco_id,
        sesion_caja_id: nuevoMovimiento.sesion_caja_id,
        usuario_id: nuevoMovimiento.usuario_id,
        tipo: nuevoMovimiento.tipo,
        motivo: nuevoMovimiento.motivo,
        monto: nuevoMovimiento.monto,
        descripcion: nuevoMovimiento.descripcion,
        fecha_hora: nuevoMovimiento.fecha_hora,
      })
    } catch (err) {
      console.warn('Supabase movimientos_caja no accesible, resguardado local:', err)
    }

    set({ movimientosCaja: actualizados })
    await get().cargarResumenSesion(sesion.id)
    toast.success(tipo === 'INGRESO' ? 'Ingreso registrado en caja' : 'Gasto registrado en caja')
    return true
  },

  cargarResumenSesion: async (sesionId?: string) => {
    const targetId = sesionId || get().sesionActiva?.id
    if (!targetId) return null

    try {
      const movimientos = await get().cargarMovimientosSesion(targetId)
      let totalIngresosExtra = 0
      let totalEgresos = 0
      for (const m of movimientos) {
        if (m.tipo === 'INGRESO') totalIngresosExtra += m.monto
        else if (m.tipo === 'EGRESO') totalEgresos += m.monto
      }

      // Intentar cargar desde la vista v_resumen_caja
      const { data: resumenView, error: viewError } = await supabase
        .from('v_resumen_caja')
        .select('*')
        .eq('sesion_caja_id', targetId)
        .maybeSingle()

      if (!viewError && resumenView) {
        let totalCC = (resumenView as any).total_cuenta_corriente
        if (totalCC === undefined || totalCC === null) {
          const { data: pagosCC } = await supabase
            .from('pagos_venta')
            .select('monto, venta:ventas!inner(sesion_caja_id, estado)')
            .eq('medio_pago', 'CUENTA_CORRIENTE')
            .eq('venta.sesion_caja_id', targetId)
            .eq('venta.estado', 'COMPLETADA')
          totalCC = pagosCC ? pagosCC.reduce((acc, p) => acc + (p.monto || 0), 0) : 0
        }

        const baseEsperado = resumenView.monto_inicial + (resumenView.total_efectivo || 0)
        const resumen: ResumenCaja = {
          ...(resumenView as ResumenCaja),
          total_cuenta_corriente: totalCC || 0,
          total_ingresos_extra: totalIngresosExtra,
          total_egresos: totalEgresos,
          efectivo_esperado_en_caja: baseEsperado + totalIngresosExtra - totalEgresos,
        }
        set({ resumenActivo: resumen })
        return resumen
      }

      // Fallback manual calculando desde ventas y pagos
      const { data: sesionData } = await supabase
        .from('sesiones_caja')
        .select('*, usuario:usuarios(nombre)')
        .eq('id', targetId)
        .single()

      if (!sesionData) return null

      const { data: ventasSesion } = await supabase
        .from('ventas')
        .select('id, total, pagos:pagos_venta(medio_pago, monto)')
        .eq('sesion_caja_id', targetId)
        .eq('estado', 'COMPLETADA')

      let totalVentas = 0
      let totalFacturado = 0
      let totalEfectivo = 0
      let totalMP = 0
      let totalTransf = 0
      let totalTarjeta = 0
      let totalCC = 0

      if (ventasSesion) {
        totalVentas = ventasSesion.length
        for (const v of ventasSesion) {
          totalFacturado += v.total
          const pagos = (v.pagos as { medio_pago: string; monto: number }[]) || []
          for (const p of pagos) {
            if (p.medio_pago === 'EFECTIVO') totalEfectivo += p.monto
            else if (p.medio_pago === 'MERCADOPAGO') totalMP += p.monto
            else if (p.medio_pago === 'TRANSFERENCIA') totalTransf += p.monto
            else if (p.medio_pago === 'TARJETA') totalTarjeta += p.monto
            else if (p.medio_pago === 'CUENTA_CORRIENTE') totalCC += p.monto
          }
        }
      }

      const resumen: ResumenCaja = {
        sesion_caja_id: targetId,
        kiosco_id: sesionData.kiosco_id,
        usuario_id: sesionData.usuario_id,
        nombre_cajero: sesionData.usuario?.nombre || 'Cajero',
        fecha_apertura: sesionData.fecha_apertura,
        fecha_cierre: sesionData.fecha_cierre,
        monto_inicial: sesionData.monto_inicial,
        total_ventas: totalVentas,
        total_facturado: totalFacturado,
        total_efectivo: totalEfectivo,
        total_mercadopago: totalMP,
        total_transferencia: totalTransf,
        total_tarjeta: totalTarjeta,
        total_cuenta_corriente: totalCC,
        total_ingresos_extra: totalIngresosExtra,
        total_egresos: totalEgresos,
        efectivo_esperado_en_caja:
          sesionData.monto_inicial + totalEfectivo + totalIngresosExtra - totalEgresos,
      }

      set({ resumenActivo: resumen })
      return resumen
    } catch (err) {
      console.error('Error al calcular resumen de caja:', err)
      return null
    }
  },

  cerrarCaja: async (montoDeclarado: number) => {
    const sesion = get().sesionActiva
    if (!sesion?.id) {
      toast.error('No hay ninguna sesión de caja abierta')
      return false
    }

    set({ cargando: true })
    try {
      const resumen = await get().cargarResumenSesion(sesion.id)
      const montoFinalSistema = resumen?.efectivo_esperado_en_caja ?? sesion.monto_inicial
      const diferencia = montoDeclarado - montoFinalSistema

      const { error } = await supabase
        .from('sesiones_caja')
        .update({
          fecha_cierre: new Date().toISOString(),
          monto_final_declarado: montoDeclarado,
          monto_final_sistema: montoFinalSistema,
          diferencia: diferencia,
          estado: 'CERRADA',
        })
        .eq('id', sesion.id)

      if (error) throw error

      set({ sesionActiva: null, resumenActivo: null, movimientosCaja: [] })
      toast.success('Caja cerrada y arqueo completado')
      return true
    } catch (err) {
      console.error('Error al cerrar caja:', err)
      toast.error('Error al realizar el cierre de caja')
      return false
    } finally {
      set({ cargando: false })
    }
  },

  arqueoCiegoObligatorio: true,

  cargarArqueoCiegoConfig: async () => {
    const usuario = useAuthStore.getState().usuario
    const kiosco = useAuthStore.getState().kiosco
    const kid = usuario?.kiosco_id || kiosco?.id
    if (!kid) return true

    // 1. Fallback local rápido
    const local = localStorage.getItem(`kioskopos_arqueo_ciego_${kid}`)
    let val = local !== null ? local === 'true' : true

    // 2. Consulta a base de datos
    try {
      const { data } = await supabase.from('kioscos').select('arqueo_ciego_obligatorio').eq('id', kid).maybeSingle()
      if (data && typeof data.arqueo_ciego_obligatorio === 'boolean') {
        val = data.arqueo_ciego_obligatorio
        localStorage.setItem(`kioskopos_arqueo_ciego_${kid}`, String(val))
      }
    } catch {
      // Usar fallback local
    }

    set({ arqueoCiegoObligatorio: val })
    return val
  },

  guardarArqueoCiegoConfig: async (obligatorio: boolean) => {
    const usuario = useAuthStore.getState().usuario
    const kiosco = useAuthStore.getState().kiosco
    const kid = usuario?.kiosco_id || kiosco?.id
    if (!kid) return false

    localStorage.setItem(`kioskopos_arqueo_ciego_${kid}`, String(obligatorio))
    set({ arqueoCiegoObligatorio: obligatorio })

    try {
      await supabase.from('kioscos').update({ arqueo_ciego_obligatorio: obligatorio }).eq('id', kid)
    } catch (e) {
      console.warn('Persistencia en kioscos.arqueo_ciego_obligatorio con fallback local:', e)
    }

    return true
  },
}))
