import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Usuario, Kiosco } from '../types/database'

interface AuthState {
  // Estado
  usuario: Usuario | null
  kiosco: Kiosco | null
  cargando: boolean
  error: string | null

  // Acciones
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  cargarSesion: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  usuario: null,
  kiosco: null,
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

      if (authError) {
        let msg = authError.message
        if (msg.toLowerCase().includes('invalid login credentials')) {
          msg = 'Email o contraseña incorrectos. Verificá que el email coincida exactamente (ej: @hotmail.com vs @gmail.com) y que la clave sea la correcta.'
        } else if (msg.toLowerCase().includes('email not confirmed')) {
          msg = 'El correo aún no fue confirmado. Desactivá "Confirm email" en Supabase (Authentication -> Providers -> Email) para permitir acceso directo.'
        } else if (msg.toLowerCase().includes('too many requests')) {
          msg = 'Demasiados intentos seguidos. Por seguridad, esperá unos instantes antes de volver a intentar.'
        }
        throw new Error(msg)
      }

      // 2. Obtener datos del usuario (nombre, rol, kiosco)
      const { data: usuario, error: userError } = await supabase
        .from('usuarios')
        .select('*')
        .eq('auth_user_id', authData.user.id)
        .eq('activo', true)
        .single()

      if (userError || !usuario) {
        await supabase.auth.signOut()
        throw new Error('Este usuario no tiene un perfil activo asociado a ningún kiosco.')
      }

      // 3. Verificar que el kiosco tenga suscripción activa y traer sus datos
      const { data: kiosco } = await supabase
        .from('kioscos')
        .select('*')
        .eq('id', usuario.kiosco_id)
        .single()

      if (kiosco?.estado_suscripcion === 'SUSPENDIDO') {
        await supabase.auth.signOut()
        throw new Error('La suscripción del kiosco está suspendida. Contactá al soporte.')
      }

      set({ usuario, kiosco: (kiosco as Kiosco) || null, cargando: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Error desconocido',
        cargando: false,
      })
    }
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ usuario: null, kiosco: null, error: null })
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

      if (usuario?.kiosco_id) {
        const { data: kiosco } = await supabase
          .from('kioscos')
          .select('*')
          .eq('id', usuario.kiosco_id)
          .single()

        set({ usuario: usuario || null, kiosco: (kiosco as Kiosco) || null, cargando: false })
      } else {
        set({ usuario: usuario || null, kiosco: null, cargando: false })
      }
    } catch {
      set({ cargando: false })
    }
  },
}))
