import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import { recibirCotizacionPoint } from '../_shared/pointQuoteHttp.ts'
import { crearBackendCotizacionPoint } from '../_shared/pointQuoteBackend.ts'
import { leerCuentasPoint } from '../_shared/pointServerConfig.ts'
import { PointApiClient } from '../_shared/pointClient.ts'
import { iniciarCheckoutPoint } from '../_shared/pointCheckoutStart.ts'
import { leerRegistroInicioPoint } from '../_shared/pointCheckoutRecord.ts'
import { cotizarCobroPoint } from '../_shared/pointQuote.ts'
import { validarCreditoCotizacionPoint } from '../_shared/pointQuoteAuthorization.ts'
import { resolverSesionCajaPoint } from '../_shared/pointCashSession.ts'

serve(async (request: Request) => {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return new Response('Servicio no configurado', { status: 503 })
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const backend = crearBackendCotizacionPoint(admin)
  return recibirCotizacionPoint(request, {
    ...backend,
    origins: (Deno.env.get('POINT_ALLOWED_ORIGINS') ?? '').split(',').map((v) => v.trim()).filter(Boolean),
    iniciarCheckout: async (permisos, entrada) => {
      const cuenta = leerCuentasPoint(Deno.env.get('POINT_ACCOUNTS_JSON') ?? '{}')[permisos.kioscoId]
      if (!cuenta) throw new Error('Cuenta Point no configurada')
      const { data: comercio, error } = await admin.from('kioscos').select('equipos_comercio')
        .eq('id', permisos.kioscoId).maybeSingle()
      const equipos: unknown = comercio?.equipos_comercio
      if (error || !equipos || typeof equipos !== 'object' || !('pointTerminalId' in equipos)
        || typeof equipos.pointTerminalId !== 'string' || !equipos.pointTerminalId.trim()) {
        throw new Error('Terminal Point no configurada')
      }
      const client = new PointApiClient(cuenta.accessToken)
      return iniciarCheckoutPoint(permisos, entrada, {
        cuenta: { ...cuenta, terminalId: equipos.pointTerminalId.trim() },
        permitirProduccion: Deno.env.get('POINT_PRODUCTION_ENABLED') === 'true',
        resolverCaja: async (permisos) => {
          const { data, error } = await admin.from('sesiones_caja')
            .select('id,kiosco_id,usuario_id,estado').eq('kiosco_id', permisos.kioscoId)
            .eq('usuario_id', permisos.usuarioId).eq('estado', 'ABIERTA').limit(2)
          if (error) throw new Error('No se pudo verificar la caja')
          return resolverSesionCajaPoint(data, permisos.kioscoId, permisos.usuarioId)
        },
        buscar: async (id, kioscoId) => {
          const { data, error } = await admin.from('point_intentos').select('*')
            .eq('id', id).eq('kiosco_id', kioscoId).maybeSingle()
          if (error) throw new Error('No se pudo recuperar el intento')
          return data ? leerRegistroInicioPoint(data) : null
        },
        cotizar: async (permisos, entrada) => {
          const datos = await backend.cargarDatos(permisos, entrada)
          const cotizacion = cotizarCobroPoint(entrada.lineas, entrada.tipoAjuste, entrada.valorAjuste,
            { ...datos, kioscoId: permisos.kioscoId, permiteServicios: permisos.permiteServicios,
              permiteAjustes: permisos.permiteAjustes, fecha: backend.ahora() }, entrada.pagos, entrada.clienteId)
          validarCreditoCotizacionPoint(permisos.kioscoId, entrada.clienteId, datos.cliente,
            cotizacion.cobro.montoCuentaCorrienteCentavos)
          return cotizacion
        },
        reservar: async (registro) => {
          const intento = registro.intento
          const { data, error } = await admin.rpc('preparar_intento_point', {
            p_id: intento.id, p_kiosco_id: intento.kioscoId, p_checkout_id: entrada.checkoutId,
            p_terminal_id: intento.terminalId, p_monto_centavos: intento.montoCentavos,
            p_application_id: intento.applicationId, p_account_id: intento.accountId, p_modo: intento.modo,
            p_solicitud: { version: 2, entrada: registro.entrada,
              usuarioId: registro.usuarioId, sesionCajaId: registro.sesionCajaId, cotizacion: registro.cotizacion },
          })
          if (error || !data) throw new Error('No se pudo reservar el intento')
          return leerRegistroInicioPoint(data)
        },
        crear: (input) => client.crear(input),
        vincular: async (intento, orderId) => {
          const { data, error } = await admin.rpc('vincular_orden_point', { p_intento_id: intento.id,
            p_kiosco_id: intento.kioscoId, p_application_id: intento.applicationId,
            p_account_id: intento.accountId, p_order_id: orderId })
          if (error || typeof data !== 'string') throw new Error('No se pudo guardar la respuesta Point')
          return data
        },
      })
    },
  })
})
