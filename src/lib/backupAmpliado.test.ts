import { beforeEach, expect, it, vi } from 'vitest'
import { capturarPreferenciasEquipo, restaurarPreferenciasEquipo, validarAmpliacionBackup } from './backupAmpliado'

const clientes = [{ id: 'c1', saldo_deudor: 23 }]
const proveedores = [{ id: 'p1', saldo_pendiente: 45 }]
function ampliacion() {
  return { configuracion_comercio: { nombre: 'Local', rubro: 'KIOSCO', direccion: null, afip_punto_venta: 1,
    capacidades_operativas: { envases: true }, equipos_comercio: { impresoraModelo: 'Modelo' } },
  saldos_snapshot: { clientes: [...clientes], proveedores: [...proveedores] } }
}
beforeEach(() => { vi.restoreAllMocks(); localStorage.clear() })

it('valida configuración segura y saldos exactamente iguales a las colecciones', () => {
  expect(validarAmpliacionBackup(ampliacion(), clientes, proveedores)).toEqual(ampliacion())
})
it('rechaza extensiones, credenciales y campos anidados desconocidos', () => {
  for (const configuracion of [{ certificado_crt: 'secret' }, { equipos_comercio: { token: 'secret' } },
    { capacidades_operativas: { clínica: true } }, { afip_habilitado: 'true' }]) {
    expect(() => validarAmpliacionBackup({ ...ampliacion(), configuracion_comercio: configuracion }, clientes, proveedores)).toThrow()
  }
  expect(() => validarAmpliacionBackup({ ...ampliacion(), secret: 'value' }, clientes, proveedores)).toThrow()
})
it('rechaza saldos alterados, duplicados, ausentes, infinitos y sobredimensionados', () => {
  for (const filas of [[], [{ id: 'c1', saldo_deudor: 24 }], [{ id: 'c2', saldo_deudor: 23 }],
    [{ id: 'c1', saldo_deudor: Infinity }], [{ id: 'c1', saldo_deudor: 1e11 }]]) {
    expect(() => validarAmpliacionBackup({ ...ampliacion(), saldos_snapshot: { clientes: filas, proveedores } }, clientes, proveedores)).toThrow()
  }
  expect(() => validarAmpliacionBackup({ ...ampliacion(), saldos_snapshot: { clientes: [clientes[0], clientes[0]], proveedores } },
    [clientes[0], { id: 'c2', saldo_deudor: 23 }], proveedores)).toThrow()
})
it('proyecta fiscalidad local sin certificados, claves, números de comprobante ni puertos', () => {
  localStorage.setItem('kioskopos_afip_config_k1', JSON.stringify({ cuit: '123', habilitado: true,
    certificado_crt: 'secret', clave_privada_key: 'secret', ultimo_nro_comprobante: 99 }))
  localStorage.setItem('kioskopos_ancho_ticket', '80mm')
  localStorage.setItem('kioskopos_abrir_cajon_efectivo_v1', 'true')
  expect(capturarPreferenciasEquipo('k1')).toEqual({ anchoPapel: '80mm', aperturaAutomatica: true,
    impresionSilenciosa: false, fiscalLocal: { cuit: '123', habilitado: true } })
  expect(capturarPreferenciasEquipo('otro').fiscalLocal).toEqual({})
})
it('rechaza almacenamiento corrupto o inaccesible sin disfrazarlo de captura exitosa', () => {
  localStorage.setItem('kioskopos_afip_config_k1', '{')
  expect(() => capturarPreferenciasEquipo('k1')).toThrow()
  localStorage.clear()
  localStorage.setItem('kioskopos_ancho_ticket', 'malo')
  expect(() => capturarPreferenciasEquipo('k1')).toThrow()
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
  expect(() => capturarPreferenciasEquipo('k1')).toThrow('bloqueado')
})
it('restaura ancho y desactiva apertura sin activar fiscalidad ni copiar claves', () => {
  localStorage.setItem('kioskopos_afip_config_k1', 'original')
  restaurarPreferenciasEquipo({ anchoPapel: '80mm', aperturaAutomatica: true, impresionSilenciosa: true,
    fiscalLocal: { habilitado: true, facturar_automatico: true } })
  expect(localStorage.getItem('kioskopos_ancho_ticket')).toBe('80mm')
  expect(localStorage.getItem('kioskopos_abrir_cajon_efectivo_v1')).toBe('false')
  expect(localStorage.getItem('kioskopos_afip_config_k1')).toBe('original')
  expect(localStorage.length).toBe(3)
})
it('rechaza credenciales fiscales importadas y propaga errores al restaurar', () => {
  expect(() => restaurarPreferenciasEquipo({ anchoPapel: '58mm', aperturaAutomatica: false,
    impresionSilenciosa: false, fiscalLocal: { clave_privada_key: 'secret' } })).toThrow()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(() => restaurarPreferenciasEquipo({ anchoPapel: '58mm', aperturaAutomatica: false,
    impresionSilenciosa: false, fiscalLocal: {} })).toThrow('quota')
})
