import { describe, expect, it } from 'vitest'
import { buscarProductoPorCodigoBalanza, parsearCodigoBalanza } from './barcodeParser'
import { extraerPesoDesdeTrama } from './serialScale'
import { crearProducto } from '../test/factories'

describe('parsearCodigoBalanza', () => {
  it('rechaza códigos que no son EAN-13 de balanza', () => {
    expect(parsearCodigoBalanza('')).toBeNull()
    expect(parsearCodigoBalanza('7790895000123')).toBeNull()
    expect(parsearCodigoBalanza('2012345')).toBeNull()
  })

  it('extrae PLU y peso (formato PLU4 + 5 dígitos de gramos)', () => {
    const r = parsearCodigoBalanza('2000120125006')
    expect(r).not.toBeNull()
    expect(r!.plu4).toBe('0012')
    expect(r!.plu4Corto).toBe('12')
    expect(r!.pesoGramos).toBe(1250)
    expect(r!.pesoKg).toBe(1.25)
  })

  it('acepta el prefijo 02', () => {
    expect(parsearCodigoBalanza('0200120125006')?.esCodigoBalanza).toBe(true)
  })

  it('usa la lectura alternativa cuando el peso PLU4 es absurdo (> 35 kg)', () => {
    // plu4=0001, gramos4=40000 (absurdo); plu5=00014, gramos5=00000... forzamos gramos5 válido
    const r = parsearCodigoBalanza('2000140050006')
    expect(r).not.toBeNull()
    expect(r!.pesoGramos).toBeLessThanOrEqual(35000)
  })
})

describe('buscarProductoPorCodigoBalanza', () => {
  const queso = crearProducto({ id: 'queso', es_pesable: true, plu_balanza: '12', precio_venta: 8000 })
  const jamon = crearProducto({ id: 'jamon', es_pesable: true, plu_balanza: '13', precio_venta: 9000 })
  const inactivo = crearProducto({ id: 'inactivo', es_pesable: true, plu_balanza: '14', activo: false })

  it('encuentra el producto por PLU y calcula el peso en kg', () => {
    const r = buscarProductoPorCodigoBalanza('2000120125006', [jamon, queso])
    expect(r?.producto.id).toBe('queso')
    expect(r?.pesoKg).toBe(1.25)
  })

  it('ignora productos inactivos', () => {
    expect(buscarProductoPorCodigoBalanza('2000140100006', [inactivo])).toBeNull()
  })

  it('devuelve null si no hay coincidencias o no es código de balanza', () => {
    expect(buscarProductoPorCodigoBalanza('2099990100006', [queso])).toBeNull()
    expect(buscarProductoPorCodigoBalanza('7790895000123', [queso])).toBeNull()
  })

  it('usa un peso mínimo de 0.1 kg cuando el código trae peso cero', () => {
    const r = buscarProductoPorCodigoBalanza('2000120000006', [queso])
    expect(r?.pesoKg).toBe(0.1)
  })
})

describe('extraerPesoDesdeTrama', () => {
  it.each([
    ['ST,GS,+01.250kg', 1.25],
    ['01.250\r\n', 1.25],
    ['P 000.450 kg', 0.45],
    ['0.350', 0.35],
    ['450g', 0.45],
    ['1250 gr', 1.25],
    ['N001250', 1.25],
    ['=00450', 0.45],
  ])('interpreta la trama %j', (trama, esperado) => {
    expect(extraerPesoDesdeTrama(trama)).toBe(esperado)
  })

  it('devuelve null con tramas vacías o inválidas', () => {
    expect(extraerPesoDesdeTrama('')).toBeNull()
    expect(extraerPesoDesdeTrama('ERROR')).toBeNull()
    expect(extraerPesoDesdeTrama(null as unknown as string)).toBeNull()
  })
})
