import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import { PointApiClient } from './pointClient.ts'
import { procesarNotificacionPoint, procesarOrdenPoint, type PointProcessingContext, type PointProcessingResult } from './pointNotificationProcessor.ts'
import { contextoPointDesdeRegistro, type PointServerAccounts } from './pointServerConfig.ts'
import { recuperarOrdenPoint } from './pointOrphanRecovery.ts'

const columnas = 'id,kiosco_id,order_id,terminal_id,monto_centavos,application_id,account_id,modo,estado,payment_id,revision_pendiente_at'

export interface ProcesadorPoint {
  procesarIntento: (attemptId: string) => Promise<PointProcessingResult>
  procesarNotificacion: (notificationId: string) => Promise<PointProcessingResult>
}

export function crearProcesadorPoint(admin: SupabaseClient, cuentas: PointServerAccounts): ProcesadorPoint {
  const consultarProveedor = async (orderId: string, kioscoId: string) => {
    const cuenta = cuentas[kioscoId.toLowerCase()]
    if (!cuenta) throw new Error('Cuenta no configurada')
    return new PointApiClient(cuenta.accessToken).consultar(orderId)
  }
  const confirmarVenta = async (context: PointProcessingContext): Promise<string> => {
    const { data, error } = await admin.rpc('confirmar_venta_point', {
      p_intento_id: context.expected.attemptId, p_kiosco_id: context.kioscoId,
    })
    if (error || typeof data !== 'string') throw new Error('La venta Point sigue pendiente de confirmación')
    return data
  }
  return {
    procesarIntento: async (attemptId: string) => {
      const { data, error } = await admin.from('point_intentos').select(columnas).eq('id', attemptId).maybeSingle()
      if (error || !data) throw new Error('Intento no encontrado')
      return procesarOrdenPoint(contextoPointDesdeRegistro(data, cuentas), {
        consultarProveedor, confirmarVenta, recuperarCierrePersistido: true,
        guardarResultado: async (context, result) => {
          const { data, error } = await admin.rpc('conciliar_intento_point', {
            p_intento_id: context.expected.attemptId,p_kiosco_id: context.kioscoId,
            p_application_id: context.applicationId,p_account_id: context.expected.accountId,
            p_order_id: context.expected.orderId,p_estado: result.estado,
            p_payment_id: result.estado === 'PAGO_CONFIRMADO' ? result.paymentId : null,
          })
          if (error || !data || typeof data !== 'object' || typeof data.estado !== 'string') {
            throw new Error('No se pudo guardar la consulta Point')
          }
          return data.estado as string
        },
      })
    },
    procesarNotificacion: async (notificationId: string) => {
      const { data, error } = await admin.from('point_notificaciones').select('order_id,application_id,recuperacion_checkpoint,recuperacion_version')
        .eq('id', notificationId).maybeSingle()
      if (error || !data || typeof data.order_id !== 'string' || typeof data.application_id !== 'string') {
        throw new Error('Recepción no encontrada')
      }
      if (!Number.isSafeInteger(data.recuperacion_version)) throw new Error('Recuperación Point no configurada')
      let versionRecuperacion: number = data.recuperacion_version
      return procesarNotificacionPoint({ id: notificationId,orderId: data.order_id,applicationId: data.application_id }, {
        consultarProveedor, confirmarVenta,
        buscarContexto: async (orderId) => {
          const { data, error } = await admin.from('point_intentos').select(columnas).eq('order_id', orderId).maybeSingle()
          if (error) throw new Error('No se pudo cargar el intento')
          return data ? contextoPointDesdeRegistro(data, cuentas) : null
        },
        recuperarContexto: (notification) => recuperarOrdenPoint(notification, {
        cuentas, consultar: consultarProveedor, checkpoint: data.recuperacion_checkpoint,
        guardarCheckpoint: async (checkpoint) => {
          const { data: version, error } = await admin.rpc('guardar_recuperacion_point', {
            p_notificacion_id: notificationId, p_version: versionRecuperacion, p_checkpoint: checkpoint,
          })
          if (error || !Number.isSafeInteger(version)) throw new Error('Recuperación Point pendiente de persistencia')
          versionRecuperacion = version
        },
          buscarIntento: async (attemptId, kioscoId) => {
            const { data, error } = await admin.from('point_intentos').select(columnas)
              .eq('id', attemptId).eq('kiosco_id', kioscoId).maybeSingle()
            if (error) throw new Error('No se pudo recuperar el intento')
            return data
          },
          vincular: async (context) => {
            const { data, error } = await admin.rpc('vincular_orden_point', {
              p_intento_id: context.expected.attemptId,p_kiosco_id: context.kioscoId,
              p_application_id: context.applicationId,p_account_id: context.expected.accountId,p_order_id: context.expected.orderId,
            })
            if (error || typeof data !== 'string') throw new Error('No se pudo recuperar la vinculación')
          },
        }),
        guardarResultado: async (notification, context, result) => {
          const { data, error } = await admin.rpc('aplicar_resultado_point', {
            p_notificacion_id: notification.id,p_intento_id: context.expected.attemptId,p_kiosco_id: context.kioscoId,
            p_application_id: notification.applicationId,p_order_id: notification.orderId,p_estado: result.estado,
            p_payment_id: result.estado === 'PAGO_CONFIRMADO' ? result.paymentId : null,
          })
          if (error || typeof data !== 'string') throw new Error('No se pudo guardar el resultado')
          return data
        },
      })
    },
  }
}
