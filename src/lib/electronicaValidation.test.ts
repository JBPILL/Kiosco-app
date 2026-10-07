import { expect, it } from 'vitest'
import { normalizarIdentificador, validarRegistroUnidad, validarReparacion } from './electronicaValidation'
import type { DatosReparacion } from '../types/electronica'

const orden: DatosReparacion = {
  cliente_nombre: ' Cliente ', cliente_contacto: ' 123 ', equipo: ' Celular ', identificador: null,
  informe_falla: ' No enciende ', diagnostico: null, estado: 'RECIBIDA', presupuesto: null,
}
it('normaliza serie y valida el dígito de control IMEI', () => {
  expect(normalizarIdentificador('SERIE', ' abc-123/4 ')).toBe('ABC-123/4')
  expect(normalizarIdentificador('IMEI', '490154203237518')).toBe('490154203237518')
  for (const imei of ['490154203237519', '123', '49015420323751X']) expect(() => normalizarIdentificador('IMEI', imei)).toThrow()
  for (const serie of ['', 'abc def', 'x'.repeat(81), '<script>']) expect(() => normalizarIdentificador('SERIE', serie)).toThrow()
})
it('exige detalle válido y condiciones cuando se registra garantía', () => {
  const datos = { detalleVentaId: '11111111-1111-1111-1111-111111111111', tipo: 'SERIE' as const, identificador: 's1', garantiaHasta: null, condiciones: null }
  expect(validarRegistroUnidad(datos).identificador).toBe('S1')
  expect(() => validarRegistroUnidad({ ...datos, detalleVentaId: 'otro' })).toThrow()
  expect(() => validarRegistroUnidad({ ...datos, garantiaHasta: '2027-01-01' })).toThrow()
  expect(() => validarRegistroUnidad({ ...datos, condiciones: 'Condición sin fecha' })).toThrow()
  expect(() => validarRegistroUnidad({ ...datos, garantiaHasta: 'fecha', condiciones: 'C' })).toThrow()
  expect(() => validarRegistroUnidad({ ...datos, garantiaHasta: '2027-02-31', condiciones: 'C' })).toThrow()
})
it('limpia la orden y exige campos comerciales acotados', () => {
  expect(validarReparacion(orden)).toMatchObject({ cliente_nombre: 'Cliente', equipo: 'Celular', informe_falla: 'No enciende', cliente_contacto: '123' })
  expect(() => validarReparacion({ ...orden, informe_falla: ' ' })).toThrow()
  expect(() => validarReparacion({ ...orden, cliente_contacto: 'x'.repeat(121) })).toThrow()
})
it('acepta sólo presupuesto finito no negativo con dos decimales', () => {
  for (const presupuesto of [-1, Infinity, NaN, 0.001, 10000000000]) expect(() => validarReparacion({ ...orden, presupuesto })).toThrow()
  expect(validarReparacion({ ...orden, presupuesto: 123.45 }).presupuesto).toBe(123.45)
})
it('respeta el flujo de estados y bloquea edición de órdenes terminales', () => {
  expect(() => validarReparacion({ ...orden, estado: 'ENTREGADA' })).toThrow()
  expect(() => validarReparacion({ ...orden, estado: 'LISTA' }, 'RECIBIDA')).toThrow()
  expect(validarReparacion({ ...orden, estado: 'DIAGNOSTICO' }, 'RECIBIDA').estado).toBe('DIAGNOSTICO')
  expect(() => validarReparacion({ ...orden, estado: 'CANCELADA' }, 'CANCELADA')).toThrow()
  expect(() => validarReparacion({ ...orden, estado: 'ENTREGADA' }, 'ENTREGADA')).toThrow()
})
