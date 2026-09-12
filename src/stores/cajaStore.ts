import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'
import type { SesionCaja, ResumenCaja, Usuario } from '../types/database'
import toast from 'react-hot-toast'

interface CajaState {
  sesionActiva: (SesionCaja & { usuario?: Usuario }) | null
  resumenActivo: ResumenCaja | null
  cargando: boolean

  verificarSesionActiva: () => Promise<void>
  abrirCaja: (montoInicial: number) => Promise<boolean>
  cargarResumenSesion: (sesionId?: string) => Promise<ResumenCaja | null>
  cerrarCaja: (montoDeclarado: number) => Promise<boolean>
}

export const useCajaStore = create<CajaState>((set, get) => ({
  sesionActiva: null,
  resumenActivo: null,
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

      set({ sesionActiva: data as (SesionCaja & { usuario?: Usuario }) || null })

      if (data?.id) {
        await get().cargarResumenSesion(data.id)
      } else {
        set({ resumenActivo: null })
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

  cargarResumenSesion: async (sesionId?: string) => {
    const targetId = sesionId || get().sesionActiva?.id
    if (!targetId) return null

    try {
      // Intentar cargar desde la vista v_resumen_caja
      const { data: resumenView, error: viewError } = await supabase
        .from('v_resumen_caja')
        .select('*')
        .eq('sesion_caja_id', targetId)
        .maybeSingle()

      if (!viewError && resumenView) {
        const resumen = resumenView as ResumenCaja
        set({ resumenActivo: resumen })
        return resumen
      }

      // Fallback manual calculando desde ventas y pagos en caso de vista sin permisos directos
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
        efectivo_esperado_en_caja: sesionData.monto_inicial + totalEfectivo,
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

      set({ sesionActiva: null, resumenActivo: null })
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
}))
