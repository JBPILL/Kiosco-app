import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import { crearBackendCotizacionPoint } from './pointQuoteBackend.ts'
import type { DependenciasHttpSupervisor } from './supervisorPinHttp.ts'
import { leerPepperSupervisor } from './supervisorPinSecrets.ts'

export function crearBackendSupervisorPin(admin: SupabaseClient, secretos: {
  json: () => string | undefined; version: () => string | undefined
}): Omit<DependenciasHttpSupervisor, 'origins'> {
  let peppers: ReturnType<typeof leerPepperSupervisor> | undefined
  const cargarSecretos = () => peppers ||= leerPepperSupervisor(secretos.json(), secretos.version())
  const rpc = async (nombre: string, parametros: Record<string, unknown>): Promise<unknown> => {
    const { data, error } = await admin.rpc(nombre, parametros)
    if (error || data == null) throw new Error('Operación de supervisor sin confirmar')
    return data
  }
  return {
    autenticar: crearBackendCotizacionPoint(admin).autenticar,
    consultarEstado: async kioscoId => {
      const { data, error } = await admin.from('supervisor_pin_secretos').select('kiosco_id').eq('kiosco_id', kioscoId).maybeSingle()
      if (error) throw new Error('Estado de supervisor no disponible')
      return data !== null
    },
    versionPepperActual: () => cargarSecretos().versionActual,
    obtenerPepper: version => cargarSecretos().obtenerPepper(version),
    configurar: async (actor, hash) => {
      const revision = await rpc('configurar_hash_pin_supervisor', { p_actor_auth_id: actor, p_hash: hash })
      if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Configuración sin confirmar')
    },
    reservarOperacion: (actor, accion, entrada) => rpc('reservar_intento_pin_supervisor', { p_actor_auth_id: actor, p_accion: accion, p_solicitud: entrada }),
    finalizar: (actor, intento, valido) => rpc('finalizar_intento_pin_supervisor', { p_actor_auth_id: actor, p_id: intento, p_valido: valido }),
    emitir: (actor, intento) => rpc('emitir_autorizacion_supervisor', { p_actor_auth_id: actor, p_intento_id: intento }),
  }
}
