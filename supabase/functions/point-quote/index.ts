import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import { recibirCotizacionPoint } from '../_shared/pointQuoteHttp.ts'
import { crearBackendCotizacionPoint } from '../_shared/pointQuoteBackend.ts'

serve(async (request: Request) => {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return new Response('Servicio no configurado', { status: 503 })
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return recibirCotizacionPoint(request, {
    ...crearBackendCotizacionPoint(admin),
    origins: (Deno.env.get('POINT_ALLOWED_ORIGINS') ?? '').split(',').map((v) => v.trim()).filter(Boolean),
  })
})
