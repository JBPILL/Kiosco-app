import { describe, expect, it } from 'vitest'
import { construirURLQRAFIP } from './afipQR'
import { validarBackupJSON } from './backupUtils'

function decodificarQR(url: string) {
  const base64 = new URL(url).searchParams.get('p') as string
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'))
}

describe('construirURLQRAFIP', () => {
  const base = {
    fecha: '2026-05-10T14:30:00.000Z',
    cuit: '20-12345678-6',
    puntoVenta: 2,
    tipoComprobante: 11,
    numeroComprobante: 345,
    importe: 1234.567,
    codigoAutorizacion: '71234567890123',
  }

  it('apunta al dominio oficial de AFIP', () => {
    expect(construirURLQRAFIP(base).startsWith('https://www.afip.gob.ar/fe/qr/?p=')).toBe(true)
  })

  it('serializa el payload según RG 4892', () => {
    const p = decodificarQR(construirURLQRAFIP(base))
    expect(p).toMatchObject({
      ver: 1,
      fecha: '2026-05-10',
      cuit: 20123456786,
      ptoVta: 2,
      tipoCmp: 11,
      nroCmp: 345,
      importe: 1234.57,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 99,
      nroDocRec: 0,
      tipoCodAut: 'E',
      codAut: 71234567890123,
    })
  })

  it('respeta documento del receptor', () => {
    const p = decodificarQR(
      construirURLQRAFIP({ ...base, tipoDocReceptor: 80, nroDocReceptor: '30-69345023-9' })
    )
    expect(p.tipoDocRec).toBe(80)
    expect(p.nroDocRec).toBe(30693450239)
  })
})

describe('validarBackupJSON', () => {
  const backupValido = {
    app: 'KioskoApp',
    version: '2.0',
    exportDate: new Date().toISOString(),
    kiosco: { id: 'k1', nombre: 'Don Pedro' },
    productos: [{ id: 'p1' }],
    clientes: [{ id: 'c1' }],
  }

  it('rechaza contenido vacío, no JSON, y estructuras inválidas', () => {
    expect(validarBackupJSON('').valido).toBe(false)
    expect(validarBackupJSON('{no json').valido).toBe(false)
    expect(validarBackupJSON('null').valido).toBe(false)
    expect(validarBackupJSON('[1,2,3]').valido).toBe(false)
  })

  it('rechaza archivos sin la firma de la app', () => {
    expect(validarBackupJSON(JSON.stringify({ ...backupValido, app: 'Otra' })).valido).toBe(false)
  })

  it('rechaza backups sin catálogo de productos', () => {
    const { productos: _omit, ...sinProductos } = backupValido
    expect(validarBackupJSON(JSON.stringify(sinProductos)).valido).toBe(false)
  })

  it('acepta un backup válido y calcula estadísticas', () => {
    const r = validarBackupJSON(JSON.stringify(backupValido), 'k1')
    expect(r.valido).toBe(true)
    expect(r.esMismoKiosco).toBe(true)
    expect(r.datos?.estadisticas.totalProductos).toBe(1)
    expect(r.datos?.estadisticas.totalClientes).toBe(1)
    expect(r.datos?.categorias).toEqual([])
  })

  it('advierte cuando el backup viene de otro comercio', () => {
    const r = validarBackupJSON(JSON.stringify(backupValido), 'otro-kiosco')
    expect(r.valido).toBe(true)
    expect(r.esMismoKiosco).toBe(false)
    expect(r.advertencias.length).toBeGreaterThan(0)
  })

  it('advierte cuando la copia tiene más de 30 días', () => {
    const vieja = { ...backupValido, exportDate: '2020-01-01T00:00:00.000Z' }
    const r = validarBackupJSON(JSON.stringify(vieja), 'k1')
    expect(r.advertencias.some((a) => a.includes('hace más de'))).toBe(true)
  })
})
