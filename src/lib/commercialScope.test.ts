import { afterEach, expect, it, vi } from 'vitest'
import { administracionComercialHabilitada } from './commercialScope'
import { errorCheckoutFueraDeAlcance, errorDevolucionFueraDeAlcance, kioskoPilotStrictScopeActivo } from './kioskPilotScope'
afterEach(() => vi.unstubAllEnvs())
it.each([undefined, 'false', 'TRUE', '1'])('comercial permanece cerrado con %s', value => {
  vi.stubEnv('VITE_ADMIN_COMERCIAL_HABILITADO', value)
  expect(administracionComercialHabilitada()).toBe(false)
})
it('habilita sólo comercio y conserva fiscal, envases y devoluciones bloqueados', () => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
  vi.stubEnv('VITE_ADMIN_COMERCIAL_HABILITADO', 'true')
  expect(administracionComercialHabilitada()).toBe(true)
  expect(kioskoPilotStrictScopeActivo()).toBe(true)
  expect(errorCheckoutFueraDeAlcance(true, true, [])).not.toBeNull()
  expect(errorCheckoutFueraDeAlcance(true, false, [{ es_devolucion_envase: true }])).not.toBeNull()
  expect(errorDevolucionFueraDeAlcance(true)).not.toBeNull()
})
