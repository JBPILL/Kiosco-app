import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { generarBackupIntegral, type BackupData } from './backupUtils'
import { descifrarBackupJson, esBackupCifrado } from './backupCrypto'
import { leerDescargaRespaldoExterno } from './externalBackupReminder'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), descargar: vi.fn(), consultar: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.consultar } }))
vi.mock('./exportUtils', () => ({
  descargarArchivo: mocks.descargar,
  sanitizarNombreArchivo: (nombre: string) => nombre.replace(/\s/g, '_'),
}))

function snapshot(): BackupData {
  return {
    app: 'KioskoApp', version: '3.0', exportDate: '2026-10-05T15:00:00.000Z',
    kiosco: { id: 'k1', nombre: 'Comercio' },
    productos: Array.from({ length: 1502 }, (_, i) => ({ id: `p${i}`, kiosco_id: 'k1', descripcion: `Producto ${i}`, precio_costo: 12, precio_venta: 24, stock_actual: 5 })),
    categorias: [], clientes: [], proveedores: [], promociones: [], lotes_producto: [],
    estadisticas: { totalProductos: 1502, totalCategorias: 0, totalClientes: 0, totalProveedores: 0, totalPromociones: 0, totalLotes: 0 },
    contenido: { colecciones: ['productos', 'categorias', 'clientes', 'proveedores', 'promociones', 'lotes_producto'], incluyeVentas: false, incluyeMovimientosCaja: false, incluyeCredenciales: false },
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.stubGlobal('crypto', webcrypto)
  mocks.consultar.mockImplementation(() => { throw new Error('No usar consultas parciales para generar el respaldo') })
  mocks.rpc.mockResolvedValue({ data: snapshot(), error: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('descarga del snapshot integral', () => {
  it('descarga todos los registros de la RPC sin consultas parciales a tablas', async () => {
    const resultado = await generarBackupIntegral('k1', 'Comercio')
    expect(resultado.ok).toBe(true)
    expect(leerDescargaRespaldoExterno('k1')?.formato).toBe('JSON')
    expect(mocks.rpc).toHaveBeenCalledWith('generar_snapshot_backup', { p_kiosco_id: 'k1' })
    expect(mocks.consultar).not.toHaveBeenCalled()
    const datos = JSON.parse(mocks.descargar.mock.calls[0][0] as string)
    expect(datos.productos).toHaveLength(1502)
    expect(datos.estadisticas.totalProductos).toBe(1502)
  })

  it('un rechazo de permisos no descarga un respaldo vacío ni parcial', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Permiso denegado' } })
    const resultado = await generarBackupIntegral('k1')
    expect(resultado.ok).toBe(false)
    expect(resultado.mensaje).toContain('Permiso denegado')
    expect(mocks.descargar).not.toHaveBeenCalled()
  })

  it('no descarga si los conteos declarados contradicen el contenido recibido', async () => {
    const datos = snapshot()
    datos.estadisticas.totalProductos = 1
    mocks.rpc.mockResolvedValue({ data: datos, error: null })
    expect((await generarBackupIntegral('k1')).ok).toBe(false)
    expect(mocks.descargar).not.toHaveBeenCalled()
  })

  it('no descarga una respuesta correspondiente a otro comercio', async () => {
    const datos = snapshot()
    datos.kiosco.id = 'k2'
    mocks.rpc.mockResolvedValue({ data: datos, error: null })
    expect((await generarBackupIntegral('k1')).ok).toBe(false)
    expect(mocks.descargar).not.toHaveBeenCalled()
  })

  it('el archivo cifrado recupera el snapshot completo con su contraseña', async () => {
    const clave = 'contraseña larga de prueba'
    expect((await generarBackupIntegral('k1', 'Comercio', { claveCifrado: clave })).ok).toBe(true)
    const archivo = mocks.descargar.mock.calls[0][0] as string
    expect(esBackupCifrado(archivo)).toBe(true)
    expect(archivo).not.toContain('precio_costo')
    const datos = JSON.parse(await descifrarBackupJson(archivo, clave))
    expect(datos.productos).toHaveLength(1502)
    expect(datos.productos[0].precio_costo).toBe(12)
  })

  it('si falta la función instalada, explica el servicio pendiente sin usar la exportación antigua', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Function not found' } })
    const resultado = await generarBackupIntegral('k1')
    expect(resultado.ok).toBe(false)
    expect(resultado.mensaje).toContain('servicio de respaldo')
    expect(mocks.consultar).not.toHaveBeenCalled()
    expect(mocks.descargar).not.toHaveBeenCalled()
  })

  it('un fallo de transporte cancela la descarga', async () => {
    mocks.rpc.mockRejectedValue(new Error('Failed to fetch'))
    expect((await generarBackupIntegral('k1')).ok).toBe(false)
    expect(mocks.descargar).not.toHaveBeenCalled()
    expect(leerDescargaRespaldoExterno('k1')).toBeNull()
  })

  it('no marca descarga cuando falla la solicitud al navegador', async () => {
    mocks.descargar.mockImplementationOnce(() => { throw new Error('Download falló') })
    expect((await generarBackupIntegral('k1')).ok).toBe(false)
    expect(leerDescargaRespaldoExterno('k1')).toBeNull()
  })

  it('rechaza una respuesta que declara incluir credenciales', async () => {
    mocks.rpc.mockResolvedValue({ data: { ...snapshot(), contenido: { incluyeCredenciales: true } }, error: null })
    expect((await generarBackupIntegral('k1')).ok).toBe(false)
    expect(mocks.descargar).not.toHaveBeenCalled()
  })
})
