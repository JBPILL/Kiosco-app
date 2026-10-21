import { expect, it } from 'vitest'
import { enmascararFechaInicioActividades, errorFechaInicioActividades, normalizarFechaInicioActividades } from './afipFecha'

it.each(['20/10/2026', '29/02/2024', '29/02/2000', '01/01/1900'])('conserva una fecha válida %s', value => {
  expect(normalizarFechaInicioActividades(value)).toBe(value)
})
it.each(['31/02/2026', '29/02/2026', '29/02/1900', '31/04/2026', '00/12/2026', '20/13/2026',
  '20/10/26', '20261020', '10/20/2026', '01/01/0000', '1/1/2026', 'fecha'])('rechaza fecha inválida o ambigua %s', value => {
  expect(() => normalizarFechaInicioActividades(value)).toThrow('dd/mm/aaaa')
  expect(errorFechaInicioActividades(value)).toContain('dd/mm/aaaa')
})
it('adapta ISO guardado sin invertir día y mes y admite fecha vacía', () => {
  expect(normalizarFechaInicioActividades('2026-10-20')).toBe('20/10/2026')
  expect(normalizarFechaInicioActividades('')).toBe('')
  expect(errorFechaInicioActividades('')).toBeUndefined()
})
it('inserta barras al escribir y pegar, limita dígitos y permite borrar', () => {
  expect(enmascararFechaInicioActividades('2')).toBe('2')
  expect(enmascararFechaInicioActividades('201')).toBe('20/1')
  expect(enmascararFechaInicioActividades('20102026')).toBe('20/10/2026')
  expect(enmascararFechaInicioActividades('2026-10-20')).toBe('20/10/2026')
  expect(enmascararFechaInicioActividades('20/10/202655')).toBe('20/10/2026')
  expect(enmascararFechaInicioActividades('20/')).toBe('20')
  expect(enmascararFechaInicioActividades('')).toBe('')
})
