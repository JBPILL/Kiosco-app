import { describe, expect, it } from 'vitest'
import {
  formatearCUIT,
  limpiarDocumento,
  validarCUIT,
  validarDNI,
  validarDocumentoArgentino,
} from './cuitUtils'

describe('validarCUIT (Módulo 11)', () => {
  it('acepta CUITs con dígito verificador correcto', () => {
    expect(validarCUIT('20-12345678-6')).toBe(true)
    expect(validarCUIT('30-69345023-9')).toBe(true)
    expect(validarCUIT('30500010912')).toBe(true)
  })

  it('rechaza dígito verificador incorrecto', () => {
    expect(validarCUIT('20-12345678-5')).toBe(false)
  })

  it('rechaza largo incorrecto y prefijos inexistentes', () => {
    expect(validarCUIT('2012345678')).toBe(false)
    expect(validarCUIT('99123456789')).toBe(false)
    expect(validarCUIT('')).toBe(false)
    expect(validarCUIT(null)).toBe(false)
  })

  it('resuelve los casos especiales del dígito (resto 0 -> 0, resto 1 -> 9)', () => {
    expect(validarCUIT('27200000000')).toBe(true)
    expect(validarCUIT('20300000003')).toBe(true)
  })
})

describe('validarDNI', () => {
  it('acepta 7 y 8 dígitos', () => {
    expect(validarDNI('12.345.678')).toBe(true)
    expect(validarDNI('1234567')).toBe(true)
  })
  it('rechaza largos inválidos', () => {
    expect(validarDNI('123456')).toBe(false)
    expect(validarDNI('123456789')).toBe(false)
    expect(validarDNI('')).toBe(false)
  })
})

describe('formatearCUIT / limpiarDocumento', () => {
  it('formatea con guiones', () => {
    expect(formatearCUIT('20123456786')).toBe('20-12345678-6')
  })
  it('deja el valor limpio si no tiene 11 dígitos', () => {
    expect(formatearCUIT('12.345')).toBe('12345')
  })
  it('limpia caracteres no numéricos', () => {
    expect(limpiarDocumento(' 20-123.456 ')).toBe('20123456')
    expect(limpiarDocumento(null)).toBe('')
  })
})

describe('validarDocumentoArgentino', () => {
  it('sin documento es Consumidor Final por defecto', () => {
    expect(validarDocumentoArgentino('').tipo).toBe('CONSUMIDOR_FINAL')
    expect(validarDocumentoArgentino('', 99).valido).toBe(true)
  })

  it('sin documento falla si el tipo exige datos', () => {
    expect(validarDocumentoArgentino('', 80).valido).toBe(false)
    expect(validarDocumentoArgentino('', 96).valido).toBe(false)
  })

  it('tipo 80 exige CUIT válido', () => {
    expect(validarDocumentoArgentino('20123456786', 80).valido).toBe(true)
    expect(validarDocumentoArgentino('20123456785', 80).valido).toBe(false)
    expect(validarDocumentoArgentino('123', 80).mensaje).toMatch(/11 dígitos/)
  })

  it('tipo 96 exige DNI válido', () => {
    expect(validarDocumentoArgentino('30123456', 96).valido).toBe(true)
    expect(validarDocumentoArgentino('123', 96).valido).toBe(false)
  })

  it('autodetecta según longitud', () => {
    expect(validarDocumentoArgentino('20123456786').tipo).toBe('CUIT')
    expect(validarDocumentoArgentino('30123456').tipo).toBe('DNI')
    expect(validarDocumentoArgentino('123456789').valido).toBe(false)
  })
})
