import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import { readSupabaseSecretKey } from '../_shared/supabaseApiKeys.ts'
import { crearBackendCheckoutManual } from '../_shared/manualCheckoutBackend.ts'
import { recibirCheckoutManual } from '../_shared/manualCheckoutHttp.ts'

serve(async (request: Request) => {
  const url = Deno.env.get('SUPABASE_URL')
  const key = readSupabaseSecretKey()
  if (!url || !key) return new Response('Servicio no configurado', { status: 503 })
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const envasesCompartidos = Deno.env.get('KIOSKO_ENVASES_TRANSACCIONAL') === 'true'
  return recibirCheckoutManual(request, {
    ...crearBackendCheckoutManual(admin, { envasesCompartidos }),
    origins: (Deno.env.get('CHECKOUT_ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean),
    pilotStrictScope: Deno.env.get('KIOSKO_PILOT_STRICT_SCOPE') === 'true',
  })
})
