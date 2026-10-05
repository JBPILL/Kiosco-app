import { expect, it } from 'vitest'
import { validarReporteBajas } from './stockLossReport'

const fila = { motivo: 'MERMA', movimientos: 2, sin_costo: 0, estimacion: 0 }

it('acepta costo cero y desconocido sin convertirlos entre sí', () => {
  expect(validarReporteBajas({ movimientos: 2, por_motivo: [fila] }).por_motivo[0].estimacion).toBe(0)
  expect(validarReporteBajas({ movimientos: 2, por_motivo: [{ ...fila, sin_costo: 2, estimacion: null }] }).por_motivo[0].estimacion).toBeNull()
})

it('rechaza totales inconsistentes, motivos duplicados o no soportados', () => {
  for (const resultado of [
    { movimientos: 3, por_motivo: [fila] },
    { movimientos: 4, por_motivo: [fila, fila] },
    { movimientos: 2, por_motivo: [{ ...fila, motivo: 'VENTA' }] },
  ]) expect(() => validarReporteBajas(resultado)).toThrow('Respuesta inválida')
})

it('rechaza números inválidos y contradicciones en costos faltantes', () => {
  for (const cambio of [
    { estimacion: -1 }, { estimacion: Number.POSITIVE_INFINITY },
    { movimientos: 0 }, { sin_costo: 3 }, { sin_costo: 0.5 },
    { sin_costo: 2, estimacion: 0 }, { estimacion: null },
  ]) expect(() => validarReporteBajas({ movimientos: 2, por_motivo: [{ ...fila, ...cambio }] })).toThrow()
})

it('acepta conjunto vacío y rechaza estructura incompleta', () => {
  expect(validarReporteBajas({ movimientos: 0, por_motivo: [] })).toEqual({ movimientos: 0, por_motivo: [] })
  for (const valor of [null, [], 'ok', { movimientos: 0 }]) expect(() => validarReporteBajas(valor)).toThrow()
})
