import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import type { ManualCheckoutHttpDependencies } from './manualCheckoutHttp.ts'
import { crearBackendCotizacionPoint } from './pointQuoteBackend.ts'
import { autorizarCotizacionPoint } from './pointQuoteAuthorization.ts'

export function crearBackendCheckoutManual(admin: SupabaseClient): Omit<ManualCheckoutHttpDependencies, 'origins'> {
  const comercial = crearBackendCotizacionPoint(admin)
  return {
    ahora: comercial.ahora, autenticar: comercial.autenticar,
    buscar: async (contexto, entrada) => {
      const { data, error } = await admin.from('checkout_manual_entradas').select('entrada,snapshot')
        .eq('id', entrada.checkoutId).eq('kiosco_id', contexto.kiosco.id).maybeSingle()
      if (error) throw new Error('No se pudo recuperar el checkout')
      return data
    },
    cargarDatos: async (contexto, entrada) => {
      const permisos = autorizarCotizacionPoint(contexto.authUserId, contexto.usuario, contexto.kiosco)
      const datos = await comercial.cargarDatos(permisos, { intentoId: entrada.checkoutId, checkoutId: entrada.checkoutId,
        clienteId: entrada.clienteId, tipoAjuste: entrada.tipoAjuste, valorAjuste: entrada.valorAjuste,
        lineas: entrada.lineas, pagos: [] })
      return { ...datos, componentes: datos.componentes || [] }
    },
    preparar: async (contexto, entrada, snapshot) => {
      const { data, error } = await admin.rpc('preparar_checkout_manual', {
        p_actor_auth_id: contexto.authUserId, p_entrada: entrada, p_snapshot: snapshot,
      })
      if (error || !data) throw new Error('No se confirmó la preparación del checkout')
      return data
    },
    confirmar: async (contexto, snapshot) => {
      const { data, error } = await admin.rpc('confirmar_venta_manual', { p_actor_auth_id: contexto.authUserId, p_solicitud: snapshot })
      if (error || !data) throw new Error('No se confirmó el cierre del checkout')
      return data
    },
  }
}
