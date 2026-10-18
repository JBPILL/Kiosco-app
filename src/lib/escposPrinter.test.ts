import { describe, expect, it } from 'vitest'
import { construirBufferEscPos } from './escposPrinter'
import type { TicketData } from '../components/pos/TicketReceiptModal'

describe.each(['58mm', '80mm'] as const)('ticket térmico %s', ancho => {
  it('conserva centavos de artículos, descuento, total, abono y vuelto', () => {
    const ticket: TicketData = {
      ventaId: 'test-venta', fecha: '2026-10-18T15:00:00Z',
      items: [{ descripcion: 'Producto', cantidad: 2, precioUnitario: 1250.75, subtotal: 2501.5 }],
      subtotal: 2501.5, ajuste: { descripcion: 'Descuento', monto: 0.25, esDescuento: true },
      total: 2501.25, medioPago: 'Efectivo', pagaCon: 3000.5, vuelto: 499.25,
    }
    const original = structuredClone(ticket)
    const texto = new TextDecoder().decode(construirBufferEscPos(ticket, ancho))
    expect(texto).toContain('2 x $ 1.250,75')
    expect(texto).toMatch(/Subtotal:.*\$\s*2\.501,5\n/)
    expect(texto).toMatch(/Descuento:.*-\$\s*0,25\n/)
    expect(texto).toMatch(/TOTAL:.*\$2\.501,25\n/)
    expect(texto).toMatch(/Abono:.*\$\s*3\.000,5\n/)
    expect(texto).toMatch(/Vuelto:.*\$\s*499,25\n/)
    expect(ticket).toEqual(original)
  })

  it('conserva el formato compacto de importes enteros', () => {
    const texto = new TextDecoder().decode(construirBufferEscPos({
      ventaId: 'test-entero', fecha: '2026-10-18T15:00:00Z',
      items: [{ descripcion: 'Producto', cantidad: 1, precioUnitario: 5350, subtotal: 5350 }],
      subtotal: 5350, total: 5350, medioPago: 'Efectivo',
    }, ancho))
    expect(texto).toContain('1 x $ 5.350')
    expect(texto).toMatch(/TOTAL:.*\$5\.350\n/)
    expect(texto).not.toContain('5.350,00')
  })
})
