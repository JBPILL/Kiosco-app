import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Usuario } from '../types/database'

interface AuthState {
  // Estado
  usuario: Usuario | null
  cargando: boolean
  error: string | null

  // Acciones
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  cargarSesion: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  usuario: null,
  cargando: true,
  error: null,

  login: async (email: string, password: string) => {
    set({ cargando: true, error: null })
    try {
      // 1. Login con Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) throw new Error(authError.message)

      // 2. Obtener datos del usuario (nombre, rol, kiosco)
      const { data: usuario, error: userError } = await supabase
        .from('usuarios')
        .select('*')
        .eq('auth_user_id', authData.user.id)
        .eq('activo', true)
        .single()

      if (userError) throw new Error('No se encontró el usuario en el sistema')

      // 3. Verificar que el kiosco tenga suscripción activa
      const { data: kiosco } = await supabase
        .from('kioscos')
        .select('estado_suscripcion')
        .eq('id', usuario.kiosco_id)
        .single()

      if (kiosco?.estado_suscripcion === 'SUSPENDIDO') {
        await supabase.auth.signOut()
        throw new Error('La suscripción del kiosco está suspendida. Contactá al soporte.')
      }

      set({ usuario, cargando: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Error desconocido',
        cargando: false,
      })
    }
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ usuario: null, error: null })
  },

  cargarSesion: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        set({ cargando: false })
        return
      }

      const { data: usuario } = await supabase
        .from('usuarios')
        .select('*')
        .eq('auth_user_id', session.user.id)
        .eq('activo', true)
        .single()

      set({ usuario: usuario || null, cargando: false })
    } catch {
      set({ cargando: false })
    }
  },
}))
