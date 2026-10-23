import { supabase, supabaseUrl } from './supabase'
import { createFiscalClient } from './fiscalClient'
import type { FiscalClientScope, FiscalClient } from './fiscalClient'
import { revisionFiscalHomologacionActiva } from './pilotExpansion'

export function createFiscalBrowserClient(scope: FiscalClientScope): FiscalClient {
  if (!revisionFiscalHomologacionActiva() || supabaseUrl !== 'https://acoyfwwmhaeruciyedri.supabase.co') throw new Error('FISCAL_NO_HABILITADO')
  const authId = scope.authId
  return createFiscalClient(scope, {
    storage: window.localStorage,
    async runExclusive(name, task) {
      if (typeof navigator.locks?.request !== 'function') throw new Error('FISCAL_COORDINACION_NO_DISPONIBLE')
      return navigator.locks.request(name, { mode: 'exclusive' }, async () => {
        if (!revisionFiscalHomologacionActiva()) throw new Error('FISCAL_NO_HABILITADO')
        return task()
      })
    },
    async send(command) {
      if (!revisionFiscalHomologacionActiva()) throw new Error('FISCAL_NO_HABILITADO')
      const session = await supabase.auth.getSession()
      const original = session.data.session
      if (session.error || original?.user.id !== authId || typeof original.access_token !== 'string'
        || original.access_token.length > 16384 || !/^\S+$/.test(original.access_token)) throw new Error('FISCAL_SESION_CAMBIO')
      // Fijar el token de la sesión comprobada: el SDK no debe elegir otra cuenta
      // si cambia la sesión entre esta comprobación y el fetch de Functions.
      const { data, error } = await supabase.functions.invoke('arca-homologacion', {
        body: command, timeout: ['PREPARAR_COMPROBANTE', 'CORREGIR_RECHAZO_FISCAL', 'CONCILIAR'].includes(String(command.accion)) ? 40000 : 15000, headers: { Authorization: `Bearer ${original.access_token}` },
      })
      if (error) throw new Error('FISCAL_RESPUESTA_NO_CONFIRMADA')
      return data
    },
  })
}
