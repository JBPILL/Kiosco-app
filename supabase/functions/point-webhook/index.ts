import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import { recibirWebhookPoint } from '../_shared/pointWebhookHandler.ts'

serve(async (request: Request) => {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return new Response('Servicio no configurado', { status: 503 })
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return recibirWebhookPoint(request, {
    secret: Deno.env.get('POINT_WEBHOOK_SECRET') ?? '',
    applicationId: Deno.env.get('POINT_APPLICATION_ID') ?? '',
    guardar: async (receipt) => {
      const { error } = await admin.rpc('registrar_notificacion_point', {
        p_application_id: receipt.applicationId, p_order_id: receipt.orderId,
        p_request_id: receipt.requestId, p_firma_ts: receipt.timestamp,
      })
      if (error) throw new Error('No se pudo guardar la recepción Point')
    },
  })
})
