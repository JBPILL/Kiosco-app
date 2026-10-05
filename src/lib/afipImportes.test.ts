import { describe, it, expect } from 'vitest'
import { calcularImportesAFIP } from './afipImportes'

describe('afipImportes - calcularImportesAFIP', () => {
  it('calcula correctamente Factura C (Monotributo) sin discriminar IVA', () => {
    const res = calcularImportesAFIP({ total: 1500, tipoComprobante: 11 })
    expect(res.importeTotal).toBe(1500)
    expect(res.importeNeto).toBe(1500)
    expect(res.importeIva).toBe(0)
    expect(res.alicuotaCodigo).toBe(3)
  })

  it('calcula correctamente Factura B (Responsable Inscripto) con alícuota 21%', () => {
    const res = calcularImportesAFIP({ total: 1210, tipoComprobante: 6, alicuotaIva: 21 })
    expect(res.importeTotal).toBe(1210)
    expect(res.importeNeto).toBe(1000)
    expect(res.importeIva).toBe(210)
    expect(res.alicuotaCodigo).toBe(5)
  })

  it('calcula correctamente Factura A con alícuota reducida de 10.5%', () => {
    const res = calcularImportesAFIP({ total: 1105, tipoComprobante: 1, alicuotaIva: 10.5 })
    expect(res.importeTotal).toBe(1105)
    expect(res.importeNeto).toBe(1000)
    expect(res.importeIva).toBe(105)
    expect(res.alicuotaCodigo).toBe(4)
  })

  it('maneja importes con decimales y redondea a 2 dígitos', () => {
    const res = calcularImportesAFIP({ total: 100, tipoComprobante: 6, alicuotaIva: 21 })
    expect(res.importeTotal).toBe(100)
    expect(res.importeNeto).toBe(82.64)
    expect(res.importeIva).toBe(17.36)
    expect(Number((res.importeNeto + res.importeIva).toFixed(2))).toBe(100)
  })

  it('protege ante valores nulos, negativos o NaN', () => {
    const res = calcularImportesAFIP({ total: -50, tipoComprobante: 11 })
    expect(res.importeTotal).toBe(0)
    expect(res.importeNeto).toBe(0)
  })
})
