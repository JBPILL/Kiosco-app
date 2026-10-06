import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import { recibirDespachoPoint } from '../_shared/pointDispatcherHttp.ts'
import { despacharPoint } from '../_shared/pointDispatcher.ts'
import { crearProcesadorPoint } from '../_shared/pointProcessingBackend.ts'
import { leerCuentasPoint } from '../_shared/pointServerConfig.ts'
import { solicitarBackendPoint } from '../_shared/pointWorkerFetch.ts'

serve(async (request: Request) => recibirDespachoPoint(request, {
  secret: Deno.env.get('POINT_WORKER_SECRET') ?? '',
  ejecutar: async () => {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) throw new Error('Servicio no configurado')
    const admin = createClient(url, key, { auth: { persistSession: false,autoRefreshToken: false },
      global: { fetch: solicitarBackendPoint } })
    const procesador = crearProcesadorPoint(admin, leerCuentasPoint(Deno.env.get('POINT_ACCOUNTS_JSON') ?? '{}'))
    return despacharPoint({
      ahora: () => Date.now(),
      tomar: async () => {
        const { data, error } = await admin.rpc('tomar_trabajo_point')
        if (error) throw new Error('Cola Point no disponible')
        return data
      },
      procesar: async (trabajo) => {
        const resultado = trabajo.intentoId ? await procesador.procesarIntento(trabajo.intentoId)
          : await procesador.procesarNotificacion(trabajo.notificacionId!)
        return { estadoPersistido: resultado.estadoPersistido,estadoEvaluado: resultado.evaluacion.estado }
      },
      terminar: async (trabajo, resultado) => {
        const { data, error } = await admin.rpc('terminar_trabajo_point', {
          p_id: trabajo.id,p_lease_token: trabajo.leaseToken,p_resultado: resultado,
        })
        if (error || typeof data !== 'boolean') throw new Error('No se pudo registrar el despacho')
        return data
      },
    })
  },
}))
