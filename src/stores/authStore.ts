import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Usuario, Kiosco, Suscripcion } from '../types/database'

export function calcularDiasRestantes(fechaVencimientoStr?: string | null): number | null {
  if (!fechaVencimientoStr) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const partes = fechaVencimientoStr.split('-').map(Number)
  if (partes.length !== 3) return null
  const [year, month, day] = partes
  const vencimiento = new Date(year, month - 1, day)
  vencimiento.setHours(0, 0, 0, 0)
  const diffMs = vencimiento.getTime() - hoy.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

interface AuthState {
  // Estado
  usuario: Usuario | null
  kiosco: Kiosco | null
  suscripcion: Suscripcion | null
  diasRestantes: number | null
  esModoRecuperacion: boolean
  cargando: boolean
  error: string | null

  // Acciones
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  cargarSesion: () => Promise<void>
  refrescarKiosco: () => Promise<void>
  setModoRecuperacion: (modo: boolean) => void
}

let authRecoveryListenerRegistered = false
let authSubscription: { unsubscribe: () => void } | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
  usuario: null,
  kiosco: null,
  suscripcion: null,
  diasRestantes: null,
  esModoRecuperacion: false,
  cargando: true,
  error: null,

  setModoRecuperacion: (modo: boolean) => set({ esModoRecuperacion: modo }),

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
          msg = 'Email o contraseña incorrectos. Verificá que el email coincida exactamente y que la clave sea la correcta.'
        } else if (msg.toLowerCase().includes('email not confirmed')) {
          msg = 'El correo aún no fue confirmado. Desactivá "Confirm email" en Supabase para permitir acceso directo.'
        } else if (msg.toLowerCase().includes('too many requests')) {
          msg = 'Demasiados intentos seguidos. Por seguridad, esperá unos instantes antes de volver a intentar.'
        }
        throw new Error(msg)
      }

      // 2. Obtener datos del usuario (nombre, rol, kiosco, es_superadmin)
      const { data: usuario, error: userError } = await supabase
        .from('usuarios')
        .select('*')
        .eq('auth_user_id', authData.user.id)
        .eq('activo', true)
        .single()

      if (userError || !usuario) {
        await supabase.auth.signOut()
        throw new Error('Este usuario no tiene un perfil activo en la plataforma.')
      }

      if (!usuario.es_superadmin && !usuario.kiosco_id) {
        await supabase.auth.signOut()
        throw new Error('Este usuario no tiene un comercio asignado. Contactá al soporte.')
      }

      // 3. Traer datos del kiosco
      let kioscoData: Kiosco | null = null
      let subData: Suscripcion | null = null
      let dias: number | null = null

      if (usuario.kiosco_id) {
        const { data: kData } = await supabase
          .from('kioscos')
          .select('*')
          .eq('id', usuario.kiosco_id)
          .single()

        kioscoData = (kData as Kiosco) || null

        // 4. Traer suscripción más reciente
        const { data: sData } = await supabase
          .from('suscripciones')
          .select('*, plan:planes(*)')
          .eq('kiosco_id', usuario.kiosco_id)
          .order('fecha_vencimiento', { ascending: false })
          .limit(1)
          .maybeSingle()

        subData = (sData as Suscripcion) || null
        dias = calcularDiasRestantes(subData?.fecha_vencimiento)
      }

      set({
        usuario: usuario as Usuario,
        kiosco: kioscoData,
        suscripcion: subData,
        diasRestantes: dias,
        cargando: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Error desconocido',
        cargando: false,
      })
    }
  },

  logout: async () => {
    if (authSubscription) {
      try {
        authSubscription.unsubscribe()
      } catch {}
      authSubscription = null
      authRecoveryListenerRegistered = false
    }
    await supabase.auth.signOut()
    try {
      localStorage.removeItem('kiosko_cache_productos')
      localStorage.removeItem('kiosko_cache_categorias')
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('kiosko_cache_')) {
          localStorage.removeItem(key)
        }
      })
    } catch {}
    set({
      usuario: null,
      kiosco: null,
      suscripcion: null,
      diasRestantes: null,
      error: null,
    })
  },

  cargarSesion: async () => {
    try {
      // 0. Detectar si el usuario llega con un token de recuperación de contraseña
      if (
        typeof window !== 'undefined' &&
        (window.location.hash.includes('type=recovery') ||
          window.location.search.includes('type=recovery'))
      ) {
        set({ esModoRecuperacion: true, cargando: false })
        return
      }

      if (!authRecoveryListenerRegistered) {
        authRecoveryListenerRegistered = true
        const { data } = supabase.auth.onAuthStateChange((event) => {
          if (event === 'PASSWORD_RECOVERY') {
            set({ esModoRecuperacion: true, cargando: false })
          } else if (event === 'SIGNED_OUT') {
            // BUG-16: Si la sesión expira o es revocada por el servidor, limpiar el estado zombie
            set({
              usuario: null,
              kiosco: null,
              suscripcion: null,
              diasRestantes: null,
              cargando: false,
            })
          }
        })
        authSubscription = data?.subscription || null
      }

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

      if (!usuario) {
        set({ cargando: false })
        return
      }

      let kioscoData: Kiosco | null = null
      let subData: Suscripcion | null = null
      let dias: number | null = null

      if (usuario.kiosco_id) {
        const { data: kData } = await supabase
          .from('kioscos')
          .select('*')
          .eq('id', usuario.kiosco_id)
          .single()

        kioscoData = (kData as Kiosco) || null

        const { data: sData } = await supabase
          .from('suscripciones')
          .select('*, plan:planes(*)')
          .eq('kiosco_id', usuario.kiosco_id)
          .order('fecha_vencimiento', { ascending: false })
          .limit(1)
          .maybeSingle()

        subData = (sData as Suscripcion) || null
        dias = calcularDiasRestantes(subData?.fecha_vencimiento)
      }

      set({
        usuario: usuario as Usuario,
        kiosco: kioscoData,
        suscripcion: subData,
        diasRestantes: dias,
        cargando: false,
      })
    } catch {
      set({ cargando: false })
    }
  },

  refrescarKiosco: async () => {
    const { usuario } = get()
    if (!usuario?.kiosco_id) return

    try {
      const { data: kData } = await supabase
        .from('kioscos')
        .select('*')
        .eq('id', usuario.kiosco_id)
        .single()

      const { data: sData } = await supabase
        .from('suscripciones')
        .select('*, plan:planes(*)')
        .eq('kiosco_id', usuario.kiosco_id)
        .order('fecha_vencimiento', { ascending: false })
        .limit(1)
        .maybeSingle()

      const subData = (sData as Suscripcion) || null
      const dias = calcularDiasRestantes(subData?.fecha_vencimiento)

      set({
        kiosco: (kData as Kiosco) || null,
        suscripcion: subData,
        diasRestantes: dias,
      })
    } catch (err) {
      console.error('Error refrescando kiosco:', err)
    }
  },
}))
