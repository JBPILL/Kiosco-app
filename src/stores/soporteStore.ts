import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export type TipoTicket = 'ERROR' | 'CONSULTA' | 'SUGERENCIA' | 'FACTURACION' | 'URGENTE'
export type EstadoTicket = 'PENDIENTE' | 'EN_PROCESO' | 'RESUELTO'

export interface DatosDiagnostico {
  conexion?: string
  ticketera?: string
  navegador?: string
  pantalla?: string
  version?: string
  fechaHora?: string
  [key: string]: unknown
}

export interface TicketSoporte {
  id: string
  kiosco_id?: string | null
  kiosco_nombre: string
  usuario_id?: string | null
  usuario_nombre: string
  usuario_telefono?: string | null
  usuario_email?: string | null
  usuario_rol: string
  tipo: TipoTicket
  modulo: string
  mensaje: string
  datos_diagnostico?: DatosDiagnostico | null
  estado: EstadoTicket
  respuesta_admin?: string | null
  fecha_creacion: string
  fecha_actualizacion?: string
}

export interface CrearTicketPayload {
  kiosco_id?: string | null
  kiosco_nombre: string
  usuario_id?: string | null
  usuario_nombre: string
  usuario_telefono?: string | null
  usuario_email?: string | null
  usuario_rol?: string
  tipo: TipoTicket
  modulo: string
  mensaje: string
  datos_diagnostico?: DatosDiagnostico
}

const STORAGE_KEY = 'kiosko_tickets_soporte'

function getLocalTickets(): TicketSoporte[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (err) {
    console.warn('[SoporteStore] Error al leer tickets locales:', err)
  }
  return []
}

function saveLocalTickets(tickets: TicketSoporte[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets))
  } catch (err) {
    console.warn('[SoporteStore] Error al guardar tickets locales:', err)
  }
}

interface SoporteState {
  tickets: TicketSoporte[]
  cargando: boolean
  guardando: boolean
  error: string | null
  tablaExiste: boolean

  cargarTicketsAdmin: () => Promise<TicketSoporte[]>
  cargarTicketsKiosco: (kioscoId?: string | null) => Promise<TicketSoporte[]>
  crearTicket: (payload: CrearTicketPayload) => Promise<{ ok: boolean; ticket?: TicketSoporte }>
  actualizarEstadoTicket: (id: string, nuevoEstado: EstadoTicket, respuestaAdmin?: string) => Promise<boolean>
  eliminarTicket: (id: string) => Promise<boolean>
  suscribirRealtimeTickets: () => () => void
}

export const useSoporteStore = create<SoporteState>((set, get) => ({
  tickets: getLocalTickets(),
  cargando: false,
  guardando: false,
  error: null,
  tablaExiste: true,

  cargarTicketsAdmin: async () => {
    set({ cargando: true, error: null })
    try {
      const { data, error } = await supabase
        .from('tickets_soporte')
        .select('*')
        .order('fecha_creacion', { ascending: false })

      if (error) {
        // Código 42P01 indica que la tabla no existe aún en la base de datos
        if (error.code === '42P01' || error.message?.includes('tickets_soporte')) {
          console.info('[SoporteStore] Tabla tickets_soporte no existe en Supabase. Usando almacenamiento local.')
          const locales = getLocalTickets()
          set({ tickets: locales, tablaExiste: false, cargando: false })
          return locales
        }
        throw error
      }

      const ticketsSupabase = (data as TicketSoporte[]) || []
      // Sincronizar con local para disponibilidad offline
      saveLocalTickets(ticketsSupabase)
      set({ tickets: ticketsSupabase, tablaExiste: true, cargando: false })
      return ticketsSupabase
    } catch (err: unknown) {
      console.warn('[SoporteStore] Fallback a caché local por error al cargar:', err)
      const locales = getLocalTickets()
      const mensaje = err instanceof Error ? err.message : 'Error al conectar con la base de datos'
      set({ tickets: locales, cargando: false, error: mensaje })
      return locales
    }
  },

  cargarTicketsKiosco: async (kioscoId?: string | null) => {
    set({ cargando: true, error: null })
    try {
      if (kioscoId) {
        const { data, error } = await supabase
          .from('tickets_soporte')
          .select('*')
          .eq('kiosco_id', kioscoId)
          .order('fecha_creacion', { ascending: false })

        if (!error && data) {
          const ticketsKiosco = data as TicketSoporte[]
          set({ tickets: ticketsKiosco, tablaExiste: true, cargando: false })
          return ticketsKiosco
        }
      }
      // Fallback
      const locales = getLocalTickets().filter((t) => !kioscoId || t.kiosco_id === kioscoId)
      set({ tickets: locales, cargando: false })
      return locales
    } catch (err) {
      console.warn('[SoporteStore] Error al cargar tickets del kiosco:', err)
      const locales = getLocalTickets().filter((t) => !kioscoId || t.kiosco_id === kioscoId)
      set({ tickets: locales, cargando: false })
      return locales
    }
  },

  crearTicket: async (payload: CrearTicketPayload) => {
    set({ guardando: true, error: null })
    const nuevoId = crypto.randomUUID ? crypto.randomUUID() : `ticket_${Date.now()}`
    const nuevoTicket: TicketSoporte = {
      id: nuevoId,
      kiosco_id: payload.kiosco_id || null,
      kiosco_nombre: payload.kiosco_nombre,
      usuario_id: payload.usuario_id || null,
      usuario_nombre: payload.usuario_nombre,
      usuario_telefono: payload.usuario_telefono || null,
      usuario_email: payload.usuario_email || null,
      usuario_rol: payload.usuario_rol || 'CAJERO',
      tipo: payload.tipo,
      modulo: payload.modulo,
      mensaje: payload.mensaje,
      datos_diagnostico: payload.datos_diagnostico || null,
      estado: 'PENDIENTE',
      respuesta_admin: null,
      fecha_creacion: new Date().toISOString(),
      fecha_actualizacion: new Date().toISOString(),
    }

    try {
      // Intentar insertar en Supabase
      const { data, error } = await supabase
        .from('tickets_soporte')
        .insert([nuevoTicket])
        .select()
        .single()

      if (error) {
        if (error.code === '42P01' || error.message?.includes('tickets_soporte')) {
          set({ tablaExiste: false })
        }
        console.warn('[SoporteStore] No se pudo guardar en Supabase (se guardará localmente):', error.message)
      } else if (data) {
        // Asignar el generado por Supabase si difiere
        Object.assign(nuevoTicket, data)
      }
    } catch (err) {
      console.warn('[SoporteStore] Error de red al insertar en Supabase, guardando local:', err)
    }

    // Guardar en caché local y estado
    const actualizados = [nuevoTicket, ...get().tickets.filter((t) => t.id !== nuevoTicket.id)]
    saveLocalTickets(actualizados)
    set({ tickets: actualizados, guardando: false })

    return { ok: true, ticket: nuevoTicket }
  },

  actualizarEstadoTicket: async (id: string, nuevoEstado: EstadoTicket, respuestaAdmin?: string) => {
    const ahora = new Date().toISOString()
    const cambios: Partial<TicketSoporte> = {
      estado: nuevoEstado,
      fecha_actualizacion: ahora,
      ...(respuestaAdmin !== undefined ? { respuesta_admin: respuestaAdmin } : {}),
    }

    // Actualizar estado local inmediatamente para feedback instantáneo
    const ticketsActualizados = get().tickets.map((t) =>
      t.id === id ? { ...t, ...cambios } : t
    )
    saveLocalTickets(ticketsActualizados)
    set({ tickets: ticketsActualizados })

    try {
      const { error } = await supabase
        .from('tickets_soporte')
        .update(cambios)
        .eq('id', id)

      if (error && error.code !== '42P01') {
        console.warn('[SoporteStore] Advertencia al sincronizar estado con Supabase:', error.message)
      }
      toast.success(
        nuevoEstado === 'RESUELTO'
          ? 'Ticket marcado como RESUELTO'
          : nuevoEstado === 'EN_PROCESO'
          ? 'Ticket en curso de atención'
          : 'Estado del ticket actualizado'
      )
      return true
    } catch (err) {
      console.warn('[SoporteStore] Error actualizando estado en Supabase:', err)
      toast.success('Estado actualizado localmente')
      return true
    }
  },

  eliminarTicket: async (id: string) => {
    const filtrados = get().tickets.filter((t) => t.id !== id)
    saveLocalTickets(filtrados)
    set({ tickets: filtrados })

    try {
      await supabase.from('tickets_soporte').delete().eq('id', id)
      toast.success('Ticket eliminado')
      return true
    } catch (err) {
      console.warn('[SoporteStore] Error al eliminar en Supabase:', err)
      toast.success('Ticket eliminado del historial local')
      return true
    }
  },

  suscribirRealtimeTickets: () => {
    try {
      const channelName = 'tickets_soporte_realtime'

      // BUG-32: Si ya existe un canal registrado con este topic, removerlo para evitar suscripciones duplicadas
      const canalesExistentes = supabase.getChannels ? supabase.getChannels() : []
      const canalPrevio = canalesExistentes.find((c: any) => c.topic === channelName || c.subTopic === channelName)
      if (canalPrevio) {
        supabase.removeChannel(canalPrevio)
      }

      const canal = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tickets_soporte' },
          () => {
            get().cargarTicketsAdmin()
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(canal)
      }
    } catch (e) {
      console.warn('[SoporteStore] Error al iniciar suscripción Realtime:', e)
      return () => {}
    }
  },
}))
