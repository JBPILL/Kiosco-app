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
import { useOfflineSyncStore } from './offlineSyncStore'

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

const CODIGO_DUPLICADO = '23505'

function getPendientes(sesionId: string): MovimientoCaja[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(`kioskopos_movimientos_pendientes_${sesionId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePendientes(sesionId: string, pendientes: MovimientoCaja[]) {
  if (typeof window === 'undefined') return
  try {
    const key = `kioskopos_movimientos_pendientes_${sesionId}`
    if (pendientes.length === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(pendientes))
  } catch (e) {
    console.error('Error guardando movimientos pendientes:', e)
  }
}

async function insertarMovimiento(m: MovimientoCaja): Promise<boolean> {
  try {
    const { error } = await supabase.from('movimientos_caja').insert({
      id: m.id,
      kiosco_id: m.kiosco_id,
      sesion_caja_id: m.sesion_caja_id,
      usuario_id: m.usuario_id,
      tipo: m.tipo,
      motivo: m.motivo,
      monto: m.monto,
      descripcion: m.descripcion,
      fecha_hora: m.fecha_hora,
    })
    // Un duplicado significa que ya está en la base: se considera sincronizado
    return !error || error.code === CODIGO_DUPLICADO
  } catch {
    return false
  }
}

async function sincronizarPendientes(sesionId: string): Promise<MovimientoCaja[]> {
  const pendientes = getPendientes(sesionId)
  if (pendientes.length === 0) return []

  const restantes: MovimientoCaja[] = []
  for (const mov of pendientes) {
    const ok = await insertarMovimiento(mov)
    if (!ok) restantes.push(mov)
  }
  savePendientes(sesionId, restantes)
  return restantes
}

export const useCajaStore = create<CajaState>((set, get) => ({
  sesionActiva: null,
  resumenActivo: null,
  movimientosCaja: [],
  cargando: false,

  verificarSesionActiva: async () => {
    // BUG-10: Semáforo para evitar ejecución concurrente que limpia el estado válido
    if (get().cargando) return
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
        const cierrePendiente = localStorage.getItem(`kioskopos_cierre_offline_${data.id}`)
        if (cierrePendiente) {
          try {
            const cierreObj = JSON.parse(cierrePendiente)
            await supabase.from('sesiones_caja').update(cierreObj).eq('id', data.id)
            localStorage.removeItem(`kioskopos_cierre_offline_${data.id}`)
            set({ sesionActiva: null, resumenActivo: null, movimientosCaja: [] })
            return
          } catch (e) {
            console.warn('Error sincronizando cierre de caja pendiente:', e)
          }
        }
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

    // BUG-CAJA-01: Evitar abrir otra caja si ya existe una abierta en memoria
    if (get().sesionActiva && get().sesionActiva?.estado === 'ABIERTA') {
      toast.error('Ya existe una sesión de caja abierta en este turno')
      return false
    }

    set({ cargando: true })
    try {
      // Validar si ya existe una sesión ABIERTA en la base de datos para este kiosco
      const { data: sesionExistente } = await supabase
        .from('sesiones_caja')
        .select('id, estado')
        .eq('kiosco_id', usuario.kiosco_id)
        .eq('estado', 'ABIERTA')
        .order('fecha_apertura', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (sesionExistente) {
        toast.error('Ya existe una sesión de caja abierta en este turno')
        await get().verificarSesionActiva()
        return false
      }

      const { data, error } = await supabase
        .from('sesiones_caja')
        .insert({
          kiosco_id: usuario.kiosco_id,
          usuario_id: usuario.id,
          monto_inicial: Math.max(0, montoInicial),
          estado: 'ABIERTA',
        })
        .select('*, usuario:usuarios(id, nombre, rol)')
        .maybeSingle()

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
      const pendientes = await sincronizarPendientes(sesionId)

      const { data, error } = await supabase
        .from('movimientos_caja')
        .select('*, usuario:usuarios(id, nombre)')
        .eq('sesion_caja_id', sesionId)
        .order('fecha_hora', { ascending: false })
        .limit(10000)

      if (!error && data) {
        const idsRemotos = new Set((data as MovimientoCaja[]).map(m => m.id))
        const sinSincronizar = pendientes.filter(m => !idsRemotos.has(m.id))
        const combinados = [...(data as MovimientoCaja[]), ...sinSincronizar].sort(
          (a, b) => b.fecha_hora.localeCompare(a.fecha_hora)
        )
        set({ movimientosCaja: combinados })
        return combinados
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
    if (!sesion?.id || !usuario?.kiosco_id || sesion.fecha_cierre !== null || (sesion.estado && sesion.estado !== 'ABIERTA')) {
      toast.error('No hay una sesión de caja abierta')
      return false
    }

    // BUG-12: Guard contra doble-click — si ya hay una operación de caja en curso, esperar
    if (get().cargando) {
      toast('Operación en curso, esperá un momento...', { duration: 1500 })
      return false
    }

    // BUG-CAJA-02: No registrar movimientos de $0, no tienen sentido contable
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error('El monto debe ser mayor a $0')
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

    set({ cargando: true })  // BUG-12: deshabilitar durante el await para evitar duplicados
    let sincronizado = false
    try {
      sincronizado = await insertarMovimiento(nuevoMovimiento)
      if (!sincronizado) {
        // supabase-js no lanza: un insert rechazado devuelve { error }. Se encola para reintentar
        // y para que el resumen lo siga contando aunque la base aún no lo tenga.
        savePendientes(sesion.id, [nuevoMovimiento, ...getPendientes(sesion.id)])
      }
    } finally {
      set({ cargando: false })
    }

    set({ movimientosCaja: actualizados })
    await get().cargarResumenSesion(sesion.id)

    if (sincronizado) {
      toast.success(tipo === 'INGRESO' ? 'Ingreso registrado en caja' : 'Gasto registrado en caja')
    } else {
      toast(
        `${tipo === 'INGRESO' ? 'Ingreso' : 'Gasto'} guardado en este equipo. Se sincronizará cuando haya conexión.`,
        { icon: '⚠️', duration: 4000 }
      )
    }
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
        let totalCC = (resumenView as any).total_cuenta_corriente ?? (resumenView as any).total_cta_cte
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

        try {
          const kioscoId = get().sesionActiva?.kiosco_id || resumen.kiosco_id
          if (kioscoId) {
            const cola = useOfflineSyncStore.getState().cargarCola(kioscoId)
            const offlineDeSesion = cola.filter(v => v.sesion_caja_id === targetId)
            let efectivoOffline = 0
            let mpOffline = 0
            let transfOffline = 0
            let tarjetaOffline = 0
            let ccOffline = 0
            let facturadoOffline = 0

            for (const v of offlineDeSesion) {
              facturadoOffline += v.total
              for (const p of v.pagos) {
                if (p.medio_pago === 'EFECTIVO') efectivoOffline += p.monto
                else if (p.medio_pago === 'MERCADOPAGO') mpOffline += p.monto
                else if (p.medio_pago === 'TRANSFERENCIA') transfOffline += p.monto
                else if (p.medio_pago === 'TARJETA') tarjetaOffline += p.monto
                else if (p.medio_pago === 'CUENTA_CORRIENTE') ccOffline += p.monto
              }
            }

            resumen.total_ventas += offlineDeSesion.length
            resumen.total_facturado += facturadoOffline
            resumen.total_efectivo = (resumen.total_efectivo || 0) + efectivoOffline
            resumen.total_mercadopago = (resumen.total_mercadopago || 0) + mpOffline
            resumen.total_transferencia = (resumen.total_transferencia || 0) + transfOffline
            resumen.total_tarjeta = (resumen.total_tarjeta || 0) + tarjetaOffline
            resumen.total_cuenta_corriente = (resumen.total_cuenta_corriente || 0) + ccOffline
            resumen.efectivo_esperado_en_caja += efectivoOffline
          }
        } catch (e) {
          console.warn('Error calculando offline para resumen', e)
        }

        if (!sesionId || sesionId === get().sesionActiva?.id) {
          set({ resumenActivo: resumen })
        }
        return resumen
      }

      // Fallback manual calculando desde ventas y pagos
      const { data: sesionData } = await supabase
        .from('sesiones_caja')
        .select('*, usuario:usuarios(nombre)')
        .eq('id', targetId)
        .maybeSingle()

      if (!sesionData) return null

      const { data: ventasSesion } = await supabase
        .from('ventas')
        .select('id, total, pagos:pagos_venta(medio_pago, monto)')
        .eq('sesion_caja_id', targetId)
        .eq('estado', 'COMPLETADA')
        .limit(10000)

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

      try {
        const kioscoId = get().sesionActiva?.kiosco_id || resumen.kiosco_id
        if (kioscoId) {
          const cola = useOfflineSyncStore.getState().cargarCola(kioscoId)
          const offlineDeSesion = cola.filter(v => v.sesion_caja_id === targetId)
          let efectivoOffline = 0
          let mpOffline = 0
          let transfOffline = 0
          let tarjetaOffline = 0
          let ccOffline = 0
          let facturadoOffline = 0

          for (const v of offlineDeSesion) {
            facturadoOffline += v.total
            for (const p of v.pagos) {
              if (p.medio_pago === 'EFECTIVO') efectivoOffline += p.monto
              else if (p.medio_pago === 'MERCADOPAGO') mpOffline += p.monto
              else if (p.medio_pago === 'TRANSFERENCIA') transfOffline += p.monto
              else if (p.medio_pago === 'TARJETA') tarjetaOffline += p.monto
              else if (p.medio_pago === 'CUENTA_CORRIENTE') ccOffline += p.monto
            }
          }

          resumen.total_ventas += offlineDeSesion.length
          resumen.total_facturado += facturadoOffline
          resumen.total_efectivo = (resumen.total_efectivo || 0) + efectivoOffline
          resumen.total_mercadopago = (resumen.total_mercadopago || 0) + mpOffline
          resumen.total_transferencia = (resumen.total_transferencia || 0) + transfOffline
          resumen.total_tarjeta = (resumen.total_tarjeta || 0) + tarjetaOffline
          resumen.total_cuenta_corriente = (resumen.total_cuenta_corriente || 0) + ccOffline
          resumen.efectivo_esperado_en_caja += efectivoOffline
        }
      } catch (e) {
        console.warn('Error calculando offline para resumen', e)
      }

      if (!sesionId || sesionId === get().sesionActiva?.id) {
        set({ resumenActivo: resumen })
      }
      return resumen
    } catch (err) {
      console.error('Error al calcular resumen de caja:', err)
      return null
    }
  },

  cerrarCaja: async (montoDeclarado: number) => {
    // BUG-11: Semáforo — prevenir doble cierre concurrente por doble-click
    if (get().cargando) return false
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
      const ahora = new Date().toISOString()

      try {
        const { error } = await supabase
          .from('sesiones_caja')
          .update({
            fecha_cierre: ahora,
            monto_final_declarado: montoDeclarado,
            monto_final_sistema: montoFinalSistema,
            diferencia: diferencia,
            estado: 'CERRADA',
          })
          .eq('id', sesion.id)
          .eq('estado', 'ABIERTA')  // BUG-11: guard atómico en DB — solo actualizar sesiones abiertas

        if (error) throw error
      } catch (errDb) {
        console.warn('Cierre de caja en modo offline o fallo de conexión remota:', errDb)
        // Guardar cierre localmente para sincronizar cuando vuelva internet
        try {
          const cierreLocal = {
            fecha_cierre: ahora,
            monto_final_declarado: montoDeclarado,
            monto_final_sistema: montoFinalSistema,
            diferencia: diferencia,
            estado: 'CERRADA',
          }
          localStorage.setItem(`kioskopos_cierre_offline_${sesion.id}`, JSON.stringify(cierreLocal))
        } catch (e) {
          console.error('Error guardando cierre offline en storage:', e)
        }
      }

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
