import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import { crearBackendSupervisorPin } from '../_shared/supervisorPinBackend.ts'
import { recibirSupervisorPin } from '../_shared/supervisorPinHttp.ts'

serve(async (request: Request) => {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return new Response('Servicio no configurado', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return recibirSupervisorPin(request, {
    ...crearBackendSupervisorPin(admin, {
      json: () => Deno.env.get('SUPERVISOR_PIN_PEPPERS_JSON'),
      version: () => Deno.env.get('SUPERVISOR_PIN_PEPPER_VERSION'),
    }),
    origins: (Deno.env.get('CHECKOUT_ALLOWED_ORIGINS') || '').split(',').map(origin => origin.trim()).filter(Boolean),
  })
})
