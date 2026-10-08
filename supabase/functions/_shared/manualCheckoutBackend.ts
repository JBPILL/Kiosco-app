import { registrarFalloCheckout } from './checkoutDiagnostic.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import type { ManualCheckoutHttpDependencies } from './manualCheckoutHttp.ts'
import { crearBackendCotizacionPoint } from './pointQuoteBackend.ts'
import { autorizarCotizacionPoint } from './pointQuoteAuthorization.ts'
import { requiereRenovarPermisoManual } from './manualCheckoutSupervisorError.ts'

export function crearBackendCheckoutManual(admin: SupabaseClient): Omit<ManualCheckoutHttpDependencies, 'origins'> {
  const comercial = crearBackendCotizacionPoint(admin)
  return {
    ahora: comercial.ahora, autenticar: comercial.autenticar,
    cargarPolitica: async contexto => {
      const { data, error } = await admin.from('supervisor_politicas').select('umbral_descuento,revision')
        .eq('kiosco_id', contexto.kiosco.id).maybeSingle()
      if (error) { registrarFalloCheckout('POLITICA', error); throw new Error('No se pudo consultar la política de descuento') }
      return data ? { umbralPorcentaje: Number(data.umbral_descuento), revision: Number(data.revision) }
        : { umbralPorcentaje: 15, revision: 0 }
    },
    buscar: async (contexto, entrada) => {
      const { data, error } = await admin.from('checkout_manual_entradas').select('entrada,snapshot,requiere_supervisor,politica_umbral,politica_revision')
        .eq('id', entrada.checkoutId).eq('kiosco_id', contexto.kiosco.id).maybeSingle()
      if (error) { registrarFalloCheckout('RECUPERAR_ENTRADA', error); throw new Error('No se pudo recuperar el checkout') }
      return data
    },
    cargarDatos: async (contexto, entrada) => {
      const permisos = autorizarCotizacionPoint(contexto.authUserId, contexto.usuario, contexto.kiosco)
      const datos = await comercial.cargarDatos(permisos, { intentoId: entrada.checkoutId, checkoutId: entrada.checkoutId,
        clienteId: entrada.clienteId, tipoAjuste: entrada.tipoAjuste, valorAjuste: entrada.valorAjuste,
        lineas: entrada.lineas, pagos: [] })
      return { ...datos, componentes: datos.componentes || [] }
    },
    preparar: async (contexto, entrada, snapshot, requiereSupervisor, politica) => {
      const { data, error } = await admin.rpc('preparar_checkout_manual', {
        p_actor_auth_id: contexto.authUserId, p_entrada: entrada, p_snapshot: snapshot, p_requiere_supervisor: requiereSupervisor,
        p_umbral_porcentaje: politica.umbralPorcentaje, p_politica_revision: politica.revision,
      })
      if (error || !data) { registrarFalloCheckout('PREPARAR', error); throw new Error('No se confirmó la preparación del checkout') }
      return data
    },
    confirmar: async (contexto, snapshot) => {
      const { data, error } = await admin.rpc('confirmar_venta_manual', { p_actor_auth_id: contexto.authUserId, p_solicitud: snapshot })
      if (error || !data) { registrarFalloCheckout('CONFIRMAR', error); throw new Error('No se confirmó el cierre del checkout') }
      return data
    },
    confirmarAutorizado: async (contexto, entrada, snapshot, autorizacionId) => {
      const { data, error } = await admin.rpc('confirmar_venta_manual_autorizada', {
        p_actor_auth_id: contexto.authUserId, p_entrada: entrada, p_snapshot: snapshot, p_autorizacion_id: autorizacionId,
      })
      if (error || !data) {
        if (requiereRenovarPermisoManual(error)) throw new Error('Se requiere autorización de supervisor')
        throw new Error('No se confirmó el cierre autorizado del checkout')
      }
      return data
    },
  }
}
