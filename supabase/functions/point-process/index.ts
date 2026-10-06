import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import { recibirProcesoPoint } from '../_shared/pointProcessorHttp.ts'
import { leerCuentasPoint } from '../_shared/pointServerConfig.ts'
import { crearProcesadorPoint } from '../_shared/pointProcessingBackend.ts'
import { solicitarBackendPoint } from '../_shared/pointWorkerFetch.ts'

serve(async (request: Request) => recibirProcesoPoint(request, {
  secret: Deno.env.get('POINT_WORKER_SECRET') ?? '',
  ejecutar: async (notificationId) => {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) throw new Error('Servicio no configurado')
    const cuentas = leerCuentasPoint(Deno.env.get('POINT_ACCOUNTS_JSON') ?? '{}')
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: solicitarBackendPoint } })
    const resultado = await crearProcesadorPoint(admin, cuentas).procesarNotificacion(notificationId)
    return { estadoPersistido: resultado.estadoPersistido, estadoEvaluado: resultado.evaluacion.estado,ventaId: resultado.ventaId }
  },
}))
