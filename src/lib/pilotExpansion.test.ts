import { afterEach, expect, it, vi } from 'vitest'
import { casosNotasCreditoHomologacionActivos, devolucionesEfectivoActivas, envasesTransaccionalesActivos } from './pilotExpansion'

afterEach(() => vi.unstubAllEnvs())
it.each([
  ['false', 'true', 'true'], ['true', 'false', 'true'], ['true', 'true', 'false'],
  ['true', 'true', ''], ['true', 'true', 'TRUE'],
])('no habilita módulos con flags incompletas %s/%s/%s', (strict, checkout, modulo) => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', strict)
  vi.stubEnv('VITE_CHECKOUT_MANUAL_TRANSACCIONAL', checkout)
  vi.stubEnv('VITE_KIOSKO_ENVASES_TRANSACCIONAL', modulo)
  vi.stubEnv('VITE_KIOSKO_DEVOLUCIONES_EFECTIVO', modulo)
  expect(envasesTransaccionalesActivos()).toBe(false)
  expect(devolucionesEfectivoActivas()).toBe(false)
})
it('habilita capacidades por separado sin apagar strict', () => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
  vi.stubEnv('VITE_CHECKOUT_MANUAL_TRANSACCIONAL', 'true')
  vi.stubEnv('VITE_KIOSKO_ENVASES_TRANSACCIONAL', 'true')
  vi.stubEnv('VITE_KIOSKO_DEVOLUCIONES_EFECTIVO', 'false')
  expect(envasesTransaccionalesActivos()).toBe(true)
  expect(devolucionesEfectivoActivas()).toBe(false)
})

it.each([['false','true','true',false],['true','false','true',false],['true','true','',false],['true','true','TRUE',false],['true','true','true',true]] as const)('casos NC requieren strict/revisión/flag propio %s/%s/%s', (strict,revision,credit,expected) => {
 vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE',strict);vi.stubEnv('VITE_KIOSKO_ARCA_REVISION_HOMO',revision);vi.stubEnv('VITE_KIOSKO_ARCA_CASOS_NC_HOMO',credit)
 expect(casosNotasCreditoHomologacionActivos()).toBe(expected)
})
