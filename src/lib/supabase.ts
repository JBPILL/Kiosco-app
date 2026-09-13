import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://wlqujnwxrmksheubfrha.supabase.co'
) as string

export const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_KahvHYMRzFtEPOp0aADHFw_iuSFxp-_'
) as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Cliente temporal sin persistencia en localStorage para crear usuarios
 * sin sobreescribir la sesión actual del dueño.
 */
export function createUnauthenticatedClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

