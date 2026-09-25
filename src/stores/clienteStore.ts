import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'
import { useCajaStore } from './cajaStore'
import type {
  Cliente,
  MovimientoCuentaCorriente,
  MedioPago,
} from '../types/database'
import toast from 'react-hot-toast'

interface ClienteState {
  clientes: Cliente[]
  cargando: boolean

  cargarClientes: () => Promise<Cliente[]>
  crearCliente: (datos: {
    nombre: string
    telefono?: string | null
    dni_cuit?: string | null
    direccion?: string | null
    email?: string | null
    limite_credito?: number
    notas?: string | null
  }) => Promise<Cliente | null>
  actualizarCliente: (id: string, datos: Partial<Cliente>) => Promise<boolean>
  eliminarCliente: (id: string) => Promise<boolean>

  imputarCargoVenta: (
    clienteId: string,
    ventaId: string,
    monto: number,
    notas?: string
  ) => Promise<boolean>

  revertirCargoVenta: (
    ventaId: string,
    monto: number,
    notas?: string
  ) => Promise<boolean>

  registrarAbono: (
    clienteId: string,
    monto: number,
    medioPago: MedioPago,
    notas?: string,
    impactarEnCaja?: boolean
  ) => Promise<boolean>

  sumarPuntosCliente: (clienteId: string, puntos: number) => Promise<boolean>
  canjearPuntosCliente: (clienteId: string, puntos: number) => Promise<boolean>

  cargarMovimientosCliente: (clienteId: string) => Promise<MovimientoCuentaCorriente[]>
}

function getLocalClientes(kioscoId: string): Cliente[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(`kioskopos_clientes_${kioscoId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalClientes(kioscoId: string, clientes: Cliente[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`kioskopos_clientes_${kioscoId}`, JSON.stringify(clientes))
  } catch (e) {
    console.error('Error guardando clientes en local:', e)
  }
}

function getLocalMovimientosCC(clienteId: string): MovimientoCuentaCorriente[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(`kioskopos_cc_movimientos_${clienteId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalMovimientosCC(clienteId: string, movs: MovimientoCuentaCorriente[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`kioskopos_cc_movimientos_${clienteId}`, JSON.stringify(movs))
  } catch (e) {
    console.error('Error guardando movimientos de cuenta corriente:', e)
  }
}

export const useClienteStore = create<ClienteState>((set, get) => ({
  clientes: [],
  cargando: false,

  cargarClientes: async () => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) return []

    set({ cargando: true })
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('kiosco_id', usuario.kiosco_id)
        .order('nombre')

      if (!error && data) {
        set({ clientes: data as Cliente[], cargando: false })
        saveLocalClientes(usuario.kiosco_id, data as Cliente[])
        return data as Cliente[]
      }
    } catch {
      // Fallback a localStorage si Supabase no tiene la tabla aún
    }

    const locales = getLocalClientes(usuario.kiosco_id)
    set({ clientes: locales, cargando: false })
    return locales
  },

  crearCliente: async (datos) => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) {
      toast.error('No se pudo identificar el kiosco')
      return null
    }

    const nuevoCliente: Cliente = {
      id: uuidv4(),
      kiosco_id: usuario.kiosco_id,
      nombre: datos.nombre.trim(),
      telefono: datos.telefono?.trim() || null,
      dni_cuit: datos.dni_cuit?.trim() || null,
      direccion: datos.direccion?.trim() || null,
      email: datos.email?.trim() || null,
      limite_credito: Math.max(0, datos.limite_credito || 0),
      saldo_deudor: 0,
      activo: true,
      notas: datos.notas?.trim() || null,
      fecha_creacion: new Date().toISOString(),
    }

    const actualizados = [...get().clientes, nuevoCliente].sort((a, b) =>
      a.nombre.localeCompare(b.nombre)
    )
    saveLocalClientes(usuario.kiosco_id, actualizados)
    set({ clientes: actualizados })

    try {
      await supabase.from('clientes').insert({
        id: nuevoCliente.id,
        kiosco_id: nuevoCliente.kiosco_id,
        nombre: nuevoCliente.nombre,
        telefono: nuevoCliente.telefono,
        dni_cuit: nuevoCliente.dni_cuit,
        direccion: nuevoCliente.direccion,
        email: nuevoCliente.email,
        limite_credito: nuevoCliente.limite_credito,
        saldo_deudor: 0,
        activo: true,
        notas: nuevoCliente.notas,
        fecha_creacion: nuevoCliente.fecha_creacion,
      })
    } catch (err) {
      console.warn('Supabase clientes no disponible, guardado en local:', err)
    }

    toast.success('Cliente registrado correctamente')
    return nuevoCliente
  },

  actualizarCliente: async (id, datos) => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) return false

    const actualizados = get().clientes.map((c) =>
      c.id === id ? { ...c, ...datos } : c
    )
    saveLocalClientes(usuario.kiosco_id, actualizados)
    set({ clientes: actualizados })

    try {
      await supabase
        .from('clientes')
        .update(datos)
        .eq('id', id)
    } catch (err) {
      console.warn('Supabase clientes update no disponible, actualizado local:', err)
    }

    toast.success('Cliente actualizado')
    return true
  },

  sumarPuntosCliente: async (clienteId, puntos) => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) return false
    const cliente = get().clientes.find((c) => c.id === clienteId)
    if (!cliente) return false

    const nuevosPuntos = Math.max(0, (cliente.puntos_fidelidad || 0) + Math.round(puntos))
    const actualizados = get().clientes.map((c) =>
      c.id === clienteId ? { ...c, puntos_fidelidad: nuevosPuntos } : c
    )
    saveLocalClientes(usuario.kiosco_id, actualizados)
    set({ clientes: actualizados })

    try {
      await supabase
        .from('clientes')
        .update({ puntos_fidelidad: nuevosPuntos })
        .eq('id', clienteId)
    } catch (err) {
      console.warn('No se pudo sincronizar puntos en Supabase:', err)
    }
    return true
  },

  canjearPuntosCliente: async (clienteId, puntos) => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) return false
    const cliente = get().clientes.find((c) => c.id === clienteId)
    if (!cliente) return false
    if ((cliente.puntos_fidelidad || 0) < puntos) {
      toast.error('Puntos insuficientes para canje')
      return false
    }

    const nuevosPuntos = Math.max(0, (cliente.puntos_fidelidad || 0) - Math.round(puntos))
    const actualizados = get().clientes.map((c) =>
      c.id === clienteId ? { ...c, puntos_fidelidad: nuevosPuntos } : c
    )
    saveLocalClientes(usuario.kiosco_id, actualizados)
    set({ clientes: actualizados })

    try {
      await supabase
        .from('clientes')
        .update({ puntos_fidelidad: nuevosPuntos })
        .eq('id', clienteId)
    } catch (err) {
      console.warn('No se pudo sincronizar puntos en Supabase:', err)
    }
    toast.success(`Se canjearon ${puntos} puntos de fidelidad`)
    return true
  },

  eliminarCliente: async (id) => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) return false

    const cliente = get().clientes.find((c) => c.id === id)
    if (cliente) {
      const saldo = cliente.saldo_deudor || 0
      if (saldo > 0) {
        toast.error(`No se puede dar de baja un cliente con saldo deudor pendiente ($${saldo})`)
        return false
      }
      if (saldo < 0) {
        toast.error(`No se puede dar de baja un cliente con saldo a favor pendiente ($${Math.abs(saldo)})`)
        return false
      }
    }

    // Verificar en Supabase para evitar eliminar si otro puesto registró deuda o saldo a favor
    try {
      const { data: cliDB } = await supabase
        .from('clientes')
        .select('saldo_deudor')
        .eq('id', id)
        .single()

      if (cliDB) {
        const saldoRemoto = cliDB.saldo_deudor || 0
        if (saldoRemoto > 0) {
          toast.error(`No se puede dar de baja: el cliente posee deuda pendiente ($${saldoRemoto})`)
          return false
        }
        if (saldoRemoto < 0) {
          toast.error(`No se puede dar de baja: el cliente posee saldo a favor pendiente ($${Math.abs(saldoRemoto)})`)
          return false
        }
      }
    } catch (checkErr) {
      console.warn('Aviso comprobando saldo remoto de cliente:', checkErr)
    }

    const actualizados = get().clientes.filter((c) => c.id !== id)
    saveLocalClientes(usuario.kiosco_id, actualizados)
    set({ clientes: actualizados })

    try {
      await supabase.from('clientes').update({ activo: false }).eq('id', id)
    } catch (err) {
      console.warn('Supabase clientes desactivar no disponible:', err)
    }

    toast.success('Cliente eliminado')
    return true
  },

  imputarCargoVenta: async (clienteId, ventaId, monto, notas) => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) return false

    const cliente = get().clientes.find((c) => c.id === clienteId)
    if (!cliente) {
      toast.error('Cliente no encontrado')
      return false
    }

    const nuevoSaldo = (cliente.saldo_deudor || 0) + monto

    // Actualizar cliente en estado y local
    const actualizados = get().clientes.map((c) =>
      c.id === clienteId ? { ...c, saldo_deudor: nuevoSaldo } : c
    )
    saveLocalClientes(usuario.kiosco_id, actualizados)
    set({ clientes: actualizados })

    // Registrar movimiento de cuenta corriente
    const nuevoMovimiento: MovimientoCuentaCorriente = {
      id: uuidv4(),
      cliente_id: clienteId,
      kiosco_id: usuario.kiosco_id,
      venta_id: ventaId,
      tipo: 'CARGO_VENTA',
      monto,
      medio_pago: 'CUENTA_CORRIENTE',
      saldo_resultante: nuevoSaldo,
      notas: notas || 'Venta a cuenta corriente',
      fecha_hora: new Date().toISOString(),
      usuario_id: usuario.id,
    }

    const movsActuales = getLocalMovimientosCC(clienteId)
    saveLocalMovimientosCC(clienteId, [nuevoMovimiento, ...movsActuales])

    // Sincronizar con Supabase si está disponible
    try {
      await supabase
        .from('clientes')
        .update({ saldo_deudor: nuevoSaldo })
        .eq('id', clienteId)

      await supabase.from('movimientos_cuenta_corriente').insert({
        id: nuevoMovimiento.id,
        cliente_id: nuevoMovimiento.cliente_id,
        kiosco_id: nuevoMovimiento.kiosco_id,
        venta_id: nuevoMovimiento.venta_id,
        tipo: nuevoMovimiento.tipo,
        monto: nuevoMovimiento.monto,
        medio_pago: nuevoMovimiento.medio_pago,
        saldo_resultante: nuevoMovimiento.saldo_resultante,
        notas: nuevoMovimiento.notas,
        fecha_hora: nuevoMovimiento.fecha_hora,
        usuario_id: nuevoMovimiento.usuario_id,
      })
    } catch (err) {
      console.warn('Supabase cuenta corriente no disponible, resguardado local:', err)
    }

    return true
  },

  revertirCargoVenta: async (ventaId, monto, notas) => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) return false

    try {
      // 1. Buscar si existe movimiento de cuenta corriente asociado a esta venta
      let clienteId: string | null = null

      const { data: movs, error: movErr } = await supabase
        .from('movimientos_cuenta_corriente')
        .select('*')
        .eq('venta_id', ventaId)
        .order('fecha_hora', { ascending: false })
        .limit(1)

      if (!movErr && movs && movs.length > 0) {
        clienteId = movs[0].cliente_id
      } else {
        // Buscar en local
        const todosLosClientes = get().clientes
        for (const cl of todosLosClientes) {
          const movsLocales = getLocalMovimientosCC(cl.id)
          if (movsLocales.some((m) => m.venta_id === ventaId)) {
            clienteId = cl.id
            break
          }
        }
      }

      if (!clienteId) {
        console.warn(`No se encontró cliente asociado a la venta ${ventaId}`)
        return false
      }

      const cliente = get().clientes.find((c) => c.id === clienteId)
      const saldoActual = cliente?.saldo_deudor ?? 0
      const nuevoSaldo = Math.max(0, saldoActual - monto)

      // Actualizar cliente localmente
      const actualizados = get().clientes.map((c) =>
        c.id === clienteId ? { ...c, saldo_deudor: nuevoSaldo } : c
      )
      saveLocalClientes(usuario.kiosco_id, actualizados)
      set({ clientes: actualizados })

      // Crear movimiento de reversión
      const movReversion: MovimientoCuentaCorriente = {
        id: uuidv4(),
        cliente_id: clienteId,
        kiosco_id: usuario.kiosco_id,
        venta_id: ventaId,
        tipo: 'ABONO_PAGO',
        monto,
        medio_pago: 'CUENTA_CORRIENTE',
        saldo_resultante: nuevoSaldo,
        notas: notas || `Reversión por anulación de Venta #${ventaId.slice(0, 8).toUpperCase()}`,
        fecha_hora: new Date().toISOString(),
        usuario_id: usuario.id,
      }

      const movsActuales = getLocalMovimientosCC(clienteId)
      saveLocalMovimientosCC(clienteId, [movReversion, ...movsActuales])

      // Actualizar en Supabase
      try {
        await supabase
          .from('clientes')
          .update({ saldo_deudor: nuevoSaldo })
          .eq('id', clienteId)

        await supabase.from('movimientos_cuenta_corriente').insert({
          id: movReversion.id,
          cliente_id: movReversion.cliente_id,
          kiosco_id: movReversion.kiosco_id,
          venta_id: movReversion.venta_id,
          tipo: movReversion.tipo,
          monto: movReversion.monto,
          medio_pago: movReversion.medio_pago,
          saldo_resultante: movReversion.saldo_resultante,
          notas: movReversion.notas,
          fecha_hora: movReversion.fecha_hora,
          usuario_id: movReversion.usuario_id,
        })
      } catch (errSupabase) {
        console.warn('Supabase reversión cuenta corriente falló, resguardado local:', errSupabase)
      }

      toast.success('Deuda de cuenta corriente revertida en la ficha del cliente')
      return true
    } catch (err) {
      console.error('Error al revertir cargo de cuenta corriente:', err)
      return false
    }
  },

  registrarAbono: async (clienteId, monto, medioPago, notas, impactarEnCaja = true) => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) return false

    const cliente = get().clientes.find((c) => c.id === clienteId)
    if (!cliente) {
      toast.error('Cliente no encontrado')
      return false
    }

    const nuevoSaldo = Math.max(0, (cliente.saldo_deudor || 0) - monto)

    // Actualizar cliente
    const actualizados = get().clientes.map((c) =>
      c.id === clienteId ? { ...c, saldo_deudor: nuevoSaldo } : c
    )
    saveLocalClientes(usuario.kiosco_id, actualizados)
    set({ clientes: actualizados })

    // Registrar movimiento de cuenta corriente
    const nuevoMovimiento: MovimientoCuentaCorriente = {
      id: uuidv4(),
      cliente_id: clienteId,
      kiosco_id: usuario.kiosco_id,
      venta_id: null,
      tipo: 'ABONO_PAGO',
      monto,
      medio_pago: medioPago,
      saldo_resultante: nuevoSaldo,
      notas: notas?.trim() || `Abono recibido (${medioPago})`,
      fecha_hora: new Date().toISOString(),
      usuario_id: usuario.id,
    }

    const movsActuales = getLocalMovimientosCC(clienteId)
    saveLocalMovimientosCC(clienteId, [nuevoMovimiento, ...movsActuales])

    // Sincronizar con Supabase
    try {
      await supabase
        .from('clientes')
        .update({ saldo_deudor: nuevoSaldo })
        .eq('id', clienteId)

      await supabase.from('movimientos_cuenta_corriente').insert({
        id: nuevoMovimiento.id,
        cliente_id: nuevoMovimiento.cliente_id,
        kiosco_id: nuevoMovimiento.kiosco_id,
        venta_id: null,
        tipo: nuevoMovimiento.tipo,
        monto: nuevoMovimiento.monto,
        medio_pago: nuevoMovimiento.medio_pago,
        saldo_resultante: nuevoMovimiento.saldo_resultante,
        notas: nuevoMovimiento.notas,
        fecha_hora: nuevoMovimiento.fecha_hora,
        usuario_id: nuevoMovimiento.usuario_id,
      })
    } catch (err) {
      console.warn('Supabase registro abono no disponible, resguardado local:', err)
    }

    // Si el abono es en EFECTIVO y se solicitó impactar en caja, asentar el ingreso único en la caja activa
    if (medioPago === 'EFECTIVO' && monto > 0 && impactarEnCaja) {
      const sesionActiva = useCajaStore.getState().sesionActiva
      if (sesionActiva) {
        try {
          await useCajaStore.getState().registrarMovimientoCaja(
            'INGRESO',
            'COBRO_CUENTA_CORRIENTE',
            monto,
            `Cobro cta. cte.: ${cliente.nombre}`
          )
        } catch (cajaErr) {
          console.warn('No se pudo registrar ingreso de abono en caja:', cajaErr)
        }
      }
    }

    toast.success(`Abono de $${monto.toLocaleString('es-AR')} registrado con éxito`)
    return true
  },

  cargarMovimientosCliente: async (clienteId) => {
    try {
      const { data, error } = await supabase
        .from('movimientos_cuenta_corriente')
        .select('*, usuario:usuarios(id, nombre)')
        .eq('cliente_id', clienteId)
        .order('fecha_hora', { ascending: false })

      if (!error && data) {
        saveLocalMovimientosCC(clienteId, data as MovimientoCuentaCorriente[])
        return data as MovimientoCuentaCorriente[]
      }
    } catch {
      // Fallback
    }

    return getLocalMovimientosCC(clienteId)
  },
}))
