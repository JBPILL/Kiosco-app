import { beforeEach, describe, expect, it } from 'vitest'
import {
  calcularVuelto,
  clearCachedProductos,
  extraerPatronPromo,
  formatNumero,
  formatPrecio,
  formatearPromoTicket,
  getCachedProductos,
  getFechaLocal,
  getLimitesISODia,
  getLimitesISORango,
  nivelStock,
  obtenerEtiquetaPromocion,
  saveCachedProductos,
  truncar,
} from './utils'

describe('formatPrecio / formatNumero', () => {
  it('formatea montos en pesos argentinos', () => {
    expect(formatPrecio(2500.5).replace(/\s/g, ' ')).toContain('2.500,5')
    expect(formatNumero(10000)).toBe('10.000')
  })

  it('trata null, undefined y NaN como cero', () => {
    expect(formatNumero(null)).toBe('0')
    expect(formatNumero(undefined)).toBe('0')
    expect(formatNumero(NaN)).toBe('0')
    expect(formatPrecio(NaN)).toContain('0')
  })
})

describe('extraerPatronPromo', () => {
  it.each([
    ['Promo 2x1 BIC Cristal Azul (3 gratis)', '2x1'],
    ['3x2 Cerveza Quilmes', '3x2'],
    ['2da al 50% Cuaderno Gloria 48h (25% OFF x2+)', '2da al 50%'],
    ['segunda al 30% en galletitas', 'segunda al 30%'],
    ['15% OFF Goma Eva (Llevando 5+) (15% OFF x5+)', '15% OFF'],
    ['Promo 3 Cartulinas x $700 ($233,33 c/u)', '3 x $700'],
  ])('reconoce el patrón en "%s"', (texto, esperado) => {
    expect(extraerPatronPromo(texto)).toBe(esperado)
  })

  it('reconoce porcentaje al final del texto', () => {
    expect(extraerPatronPromo('Descuento 15%')).toBe('15% OFF')
    expect(extraerPatronPromo('15%')).toBe('15% OFF')
  })

  it('devuelve null para textos sin patrón o vacíos', () => {
    expect(extraerPatronPromo('Boligrafos Bic cristal')).toBeNull()
    expect(extraerPatronPromo('')).toBeNull()
    expect(extraerPatronPromo(null)).toBeNull()
    expect(extraerPatronPromo(undefined)).toBeNull()
  })

  it('no confunde un tamaño de producto con una promoción NxM inválida', () => {
    // 1x3 no es promo: n1 debe ser mayor que n2
    expect(extraerPatronPromo('Caja 1x3')).toBeNull()
  })
})

describe('obtenerEtiquetaPromocion', () => {
  it('prioriza el patrón presente en el nombre', () => {
    expect(obtenerEtiquetaPromocion({ tipo: 'PORCENTAJE', nombre: '2x1 Alfajores', descuento_porcentaje: 10 })).toBe('2x1')
  })

  it('deriva la etiqueta del tipo cuando el nombre es genérico', () => {
    expect(obtenerEtiquetaPromocion({ tipo: 'PORCENTAJE', nombre: 'Lapiceras', descuento_porcentaje: 15 })).toBe('15% OFF')
    expect(obtenerEtiquetaPromocion({ tipo: 'NXM', nombre: 'Lapiceras', cantidad_minima: 3, cantidad_paga: 2 })).toBe('3x2')
    expect(
      obtenerEtiquetaPromocion({ tipo: 'VOLUMEN', nombre: 'Lapiceras', cantidad_minima: 3, precio_unitario_promo: 233.33 })
    ).toMatch(/^3 x \$/)
    expect(obtenerEtiquetaPromocion({ tipo: 'VOLUMEN', nombre: 'Lapiceras', cantidad_minima: 4 })).toBe('Pack x4')
  })

  it('PORCENTAJE sin descuento configurado no devuelve "0% OFF"', () => {
    expect(obtenerEtiquetaPromocion({ tipo: 'PORCENTAJE', nombre: 'Lapiceras', descuento_porcentaje: 0 })).toBe('Descuento')
  })
})

describe('formatearPromoTicket', () => {
  it('descarta textos truncados sin patrón', () => {
    expect(formatearPromoTicket('Boligrafos Bic cri...')).toBe('')
  })
  it('mantiene nombres cortos', () => {
    expect(formatearPromoTicket('Fin de semana')).toBe('Fin de semana')
  })
  it('devuelve vacío para null', () => {
    expect(formatearPromoTicket(null)).toBe('')
  })
})

describe('helpers simples de caja y stock', () => {
  it('calcularVuelto nunca es negativo', () => {
    expect(calcularVuelto(1000, 1500)).toBe(500)
    expect(calcularVuelto(1000, 800)).toBe(0)
  })

  it('truncar respeta el largo máximo', () => {
    expect(truncar('corto', 10)).toBe('corto')
    expect(truncar('abcdefghij', 5)).toBe('abcde...')
  })

  it('nivelStock clasifica correctamente', () => {
    expect(nivelStock(0, 10)).toBe('sin_stock')
    expect(nivelStock(-3, 10)).toBe('sin_stock')
    expect(nivelStock(5, 10)).toBe('critico')
    expect(nivelStock(8, 10)).toBe('bajo')
    expect(nivelStock(11, 10)).toBe('ok')
  })
})

describe('manejo de fechas locales', () => {
  it('getFechaLocal no se desfasa por UTC', () => {
    expect(getFechaLocal(new Date(2026, 0, 5, 23, 59, 59))).toBe('2026-01-05')
    expect(getFechaLocal(new Date(2026, 11, 31, 0, 0, 1))).toBe('2026-12-31')
  })

  it('getLimitesISODia cubre exactamente el día local', () => {
    const { inicioISO, finISO } = getLimitesISODia('2026-03-10')
    const inicio = new Date(inicioISO)
    const fin = new Date(finISO)
    expect(inicio.getHours()).toBe(0)
    expect(inicio.getDate()).toBe(10)
    expect(fin.getHours()).toBe(23)
    expect(fin.getMinutes()).toBe(59)
    expect(fin.getDate()).toBe(10)
  })

  it('getLimitesISORango abarca varios días', () => {
    const { inicioISO, finISO } = getLimitesISORango('2026-03-01', '2026-03-31')
    expect(new Date(inicioISO).getDate()).toBe(1)
    expect(new Date(finISO).getDate()).toBe(31)
  })
})

describe('caché local de productos (multi-kiosco)', () => {
  beforeEach(() => localStorage.clear())

  it('guarda y lee por kiosco', () => {
    saveCachedProductos([{ id: 'a' }], 'k1')
    expect(getCachedProductos('k1')).toEqual([{ id: 'a', precio_costo: 0 }])
  })

  it('elimina costos privados existentes al leer y guardar la caché', () => {
    localStorage.setItem('kiosko_cache_productos_k1', JSON.stringify([
      { id: 'p1', precio_costo: 950, descripcion: 'Alfajor' },
    ]))

    expect(getCachedProductos('k1')).toEqual([
      { id: 'p1', precio_costo: 0, descripcion: 'Alfajor' },
    ])
    expect(localStorage.getItem('kiosko_cache_productos_k1')).not.toContain('950')

    saveCachedProductos([{ id: 'p1', precio_costo: 1200 }], 'k1')
    expect(localStorage.getItem('kiosko_cache_productos_k1')).not.toContain('1200')
  })

  it('no mezcla productos entre kioscos distintos', () => {
    saveCachedProductos([{ id: 'a' }], 'k1')
    localStorage.removeItem('kiosko_cache_productos')
    expect(getCachedProductos('k2')).toEqual([])
  })

  it('devuelve [] ante JSON corrupto', () => {
    localStorage.setItem('kiosko_cache_productos_k1', '{no-json')
    expect(getCachedProductos('k1')).toEqual([])
  })

  it('clearCachedProductos limpia ambas claves', () => {
    saveCachedProductos([{ id: 'a' }], 'k1')
    clearCachedProductos('k1')
    expect(getCachedProductos('k1')).toEqual([])
  })
})
