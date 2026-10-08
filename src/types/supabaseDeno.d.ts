// Equivalencia de tipos para pruebas locales de adaptadores Edge.
// El runtime Deno conserva su import HTTPS; Vite usa el paquete instalado.
declare module 'https://esm.sh/@supabase/supabase-js@2.116.0' {
  export type { SupabaseClient } from '@supabase/supabase-js'
}
