import { afterEach, expect, it, vi } from 'vitest'
import { envioNotasCreditoHomologacionActivo, conciliacionNotasCreditoHomologacionActiva, aplicacionNotasCreditoHomologacionActiva, casosNotasCreditoHomologacionActivos, devolucionesEfectivoActivas, envasesTransaccionalesActivos } from './pilotExpansion'

afterEach(() => vi.unstubAllEnvs())
it.each(['','false','TRUE','true'])('envío/consulta NC conservan flags independientes con valor %s',value=>{
 vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE','true');vi.stubEnv('VITE_KIOSKO_ARCA_REVISION_HOMO','true');vi.stubEnv('VITE_KIOSKO_ARCA_CASOS_NC_HOMO','true')
 vi.stubEnv('VITE_KIOSKO_ARCA_ENVIO_NC_HOMO',value);vi.stubEnv('VITE_KIOSKO_ARCA_CONCILIACION_NC_HOMO','false');vi.stubEnv('VITE_KIOSKO_ARCA_APLICACION_NC_HOMO','false')
 expect(envioNotasCreditoHomologacionActivo()).toBe(value==='true');expect(conciliacionNotasCreditoHomologacionActiva()).toBe(false);expect(aplicacionNotasCreditoHomologacionActiva()).toBe(false)
 vi.stubEnv('VITE_KIOSKO_ARCA_ENVIO_NC_HOMO','false');vi.stubEnv('VITE_KIOSKO_ARCA_CONCILIACION_NC_HOMO',value)
 expect(envioNotasCreditoHomologacionActivo()).toBe(false);expect(conciliacionNotasCreditoHomologacionActiva()).toBe(value==='true')
 vi.stubEnv('VITE_KIOSKO_ARCA_CASOS_NC_HOMO','false');expect(envioNotasCreditoHomologacionActivo()).toBe(false);expect(conciliacionNotasCreditoHomologacionActiva()).toBe(false)
})
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

it.each([['true','true','true','true',true],['false','true','true','true',false],['true','false','true','true',false],['true','true','false','true',false],['true','true','true','',false],['true','true','true','TRUE',false]] as const)('aplicación NC requiere todos sus gates %s/%s/%s/%s',(strict,review,cases,apply,expected)=>{
 vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE',strict);vi.stubEnv('VITE_KIOSKO_ARCA_REVISION_HOMO',review);vi.stubEnv('VITE_KIOSKO_ARCA_CASOS_NC_HOMO',cases);vi.stubEnv('VITE_KIOSKO_ARCA_APLICACION_NC_HOMO',apply);expect(aplicacionNotasCreditoHomologacionActiva()).toBe(expected)
})
