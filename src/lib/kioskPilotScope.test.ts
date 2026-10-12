import { describe, expect, it, vi } from 'vitest'
import { ERROR_FACTURACION_FUERA_DE_ALCANCE, ERROR_ENVASE_FUERA_DE_ALCANCE,
  ERROR_DEVOLUCIONES_FUERA_DE_ALCANCE, ejecutarCheckoutConAlcanceFiscal,
  errorCheckoutFueraDeAlcance, errorDevolucionFueraDeAlcance } from './kioskPilotScope'

describe('alcance estricto del piloto KioskoPOS', () => {
  it('rechaza facturación antes de iniciar el checkout y no invoca el emisor', async () => {
    const checkout = vi.fn(async () => 'venta-confirmada')
    const emitirFactura = vi.fn(async () => {})
    expect(errorCheckoutFueraDeAlcance(true, true, [])).toBe(ERROR_FACTURACION_FUERA_DE_ALCANCE)
    await expect(ejecutarCheckoutConAlcanceFiscal(true, true, checkout, emitirFactura))
      .rejects.toThrow(ERROR_FACTURACION_FUERA_DE_ALCANCE)
    expect(checkout).not.toHaveBeenCalled()
    expect(emitirFactura).not.toHaveBeenCalled()
  })

  it('bloquea devoluciones de envases en la validación local', () => {
    expect(errorCheckoutFueraDeAlcance(true, false, [{ es_devolucion_envase: true }]))
      .toBe(ERROR_ENVASE_FUERA_DE_ALCANCE)
  })

  it('mantiene checkout y facturación fuera del modo estricto', async () => {
    const checkout = vi.fn(async () => 'venta-confirmada')
    const emitirFactura = vi.fn(async () => {})
    expect(errorCheckoutFueraDeAlcance(false, true, [{ es_devolucion_envase: true }])).toBeNull()
    await expect(ejecutarCheckoutConAlcanceFiscal(false, true, checkout, emitirFactura)).resolves.toBe('venta-confirmada')
    expect(checkout).toHaveBeenCalledOnce()
    expect(emitirFactura).toHaveBeenCalledOnce()
  })

  it('permite venta normal en modo estricto sin emitir factura', async () => {
    const checkout = vi.fn(async () => 'venta-confirmada')
    const emitirFactura = vi.fn(async () => {})
    expect(errorCheckoutFueraDeAlcance(true, false, [])).toBeNull()
    await expect(ejecutarCheckoutConAlcanceFiscal(true, false, checkout, emitirFactura)).resolves.toBe('venta-confirmada')
    expect(checkout).toHaveBeenCalledOnce()
    expect(emitirFactura).not.toHaveBeenCalled()
  })

  it('centraliza el bloqueo de devoluciones solo en modo estricto', () => {
    expect(errorDevolucionFueraDeAlcance(true)).toBe(ERROR_DEVOLUCIONES_FUERA_DE_ALCANCE)
    expect(errorDevolucionFueraDeAlcance(false)).toBeNull()
  })
})
