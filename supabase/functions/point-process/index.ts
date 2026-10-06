import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import { recibirProcesoPoint } from '../_shared/pointProcessorHttp.ts'
import { PointApiClient } from '../_shared/pointClient.ts'
import { procesarNotificacionPoint } from '../_shared/pointNotificationProcessor.ts'
import { contextoPointDesdeRegistro, leerCuentasPoint } from '../_shared/pointServerConfig.ts'
import { recuperarOrdenPoint } from '../_shared/pointOrphanRecovery.ts'

serve(async (request: Request) => recibirProcesoPoint(request, {
  secret: Deno.env.get('POINT_WORKER_SECRET') ?? '',
  ejecutar: async (notificationId) => {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) throw new Error('Servicio no configurado')
    const cuentas = leerCuentasPoint(Deno.env.get('POINT_ACCOUNTS_JSON') ?? '{}')
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await admin.from('point_notificaciones').select('id,order_id,application_id')
      .eq('id', notificationId).maybeSingle()
    const receipt: unknown = data
    if (error || !receipt || typeof receipt !== 'object' || !('order_id' in receipt)
      || typeof receipt.order_id !== 'string' || !('application_id' in receipt)
      || typeof receipt.application_id !== 'string') throw new Error('Recepción no encontrada')
    const resultado = await procesarNotificacionPoint({ id: notificationId,
      orderId: receipt.order_id, applicationId: receipt.application_id }, {
      buscarContexto: async (orderId) => {
        const { data, error } = await admin.from('point_intentos').select('id,kiosco_id,order_id,terminal_id,monto_centavos,application_id,account_id,modo')
          .eq('order_id', orderId).maybeSingle()
        if (error) throw new Error('No se pudo cargar el intento')
        return data ? contextoPointDesdeRegistro(data, cuentas) : null
      },
      consultarProveedor: async (orderId, kioscoId) => {
        const cuenta = cuentas[kioscoId.toLowerCase()]
        if (!cuenta) throw new Error('Cuenta no configurada')
        return new PointApiClient(cuenta.accessToken).consultar(orderId)
      },
      recuperarContexto: (notification) => recuperarOrdenPoint(notification, {
        cuentas,
        consultar: (orderId, kioscoId) => new PointApiClient(cuentas[kioscoId].accessToken).consultar(orderId),
        buscarIntento: async (attemptId, kioscoId) => {
          const { data, error } = await admin.from('point_intentos')
            .select('id,kiosco_id,order_id,terminal_id,monto_centavos,application_id,account_id,modo')
            .eq('id', attemptId).eq('kiosco_id', kioscoId).maybeSingle()
          if (error) throw new Error('No se pudo recuperar el intento')
          return data
        },
        vincular: async (context) => {
          const { data, error } = await admin.rpc('vincular_orden_point', {
            p_intento_id: context.expected.attemptId, p_kiosco_id: context.kioscoId,
            p_application_id: context.applicationId, p_account_id: context.expected.accountId,
            p_order_id: context.expected.orderId,
          })
          if (error || typeof data !== 'string') throw new Error('No se pudo recuperar la vinculación')
        },
      }),
      guardarResultado: async (notification, context, result) => {
        const { data, error } = await admin.rpc('aplicar_resultado_point', {
          p_notificacion_id: notification.id, p_intento_id: context.expected.attemptId,
          p_kiosco_id: context.kioscoId, p_application_id: notification.applicationId,
          p_order_id: notification.orderId, p_estado: result.estado,
          p_payment_id: result.estado === 'PAGO_CONFIRMADO' ? result.paymentId : null,
        })
        if (error || typeof data !== 'string') throw new Error('No se pudo guardar el resultado')
        return data
      },
      confirmarVenta: async (context) => {
        const { data, error } = await admin.rpc('confirmar_venta_point', {
          p_intento_id: context.expected.attemptId, p_kiosco_id: context.kioscoId,
        })
        if (error || typeof data !== 'string') throw new Error('La venta Point sigue pendiente de confirmación')
        return data
      },
    })
    return { estadoPersistido: resultado.estadoPersistido, estadoEvaluado: resultado.evaluacion.estado,
      ventaId: resultado.ventaId }
  },
}))
