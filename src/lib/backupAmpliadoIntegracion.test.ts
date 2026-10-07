import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), descargar: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }))
vi.mock('./exportUtils', () => ({ descargarArchivo: mocks.descargar, sanitizarNombreArchivo: () => 'local' }))
vi.mock('./utils', () => ({ clearCachedProductos: vi.fn() }))
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: () => ({ usuario: { rol: 'DUEÑO', kiosco_id: 'k1' } }) } }))
import { generarBackupIntegral, restaurarBackupIntegral, validarBackupJSON } from './backupUtils'

function copia() {
  return {
    version: '4.0', app: 'KioskoApp', exportDate: new Date().toISOString(), kiosco: { id: 'k1', nombre: 'Local' },
    productos: [], categorias: [], clientes: [], proveedores: [], promociones: [], lotes_producto: [],
    estadisticas: { totalProductos: 0, totalCategorias: 0, totalClientes: 0, totalProveedores: 0, totalPromociones: 0, totalLotes: 0 },
    configuracion_comercio: { nombre: 'Local', rubro: 'KIOSCO', cuit: null, afip_habilitado: true, equipos_comercio: { impresoraModelo: 'Modelo' } },
    saldos_snapshot: { clientes: [], proveedores: [] },
    preferencias_equipo: { anchoPapel: '80mm' as const, aperturaAutomatica: true, impresionSilenciosa: false, fiscalLocal: {} },
    contenido: { incluyeConfiguracion: true, incluyeSaldos: true, incluyeVentas: false, incluyeMovimientosCaja: false, incluyeCredenciales: false },
  }
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear()
  mocks.rpc.mockResolvedValue({ data: { nombre: 'Local', rubro: 'KIOSCO', cuit: null }, error: null })
  mocks.from.mockImplementation(() => {
    const consulta = { select: () => consulta, eq: () => consulta, order: () => consulta, gt: () => consulta, limit: () => consulta,
      then: (resolver: (valor: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolver) }
    return consulta
  })
})
it('conserva configuración y foto de saldos en el formato validado', () => {
  const resultado = validarBackupJSON(JSON.stringify(copia()), 'k1')
  expect(resultado.valido).toBe(true)
  expect(resultado.datos?.saldos_snapshot).toEqual({ clientes: [], proveedores: [] })
  expect(resultado.datos?.configuracion_comercio?.nombre).toBe('Local')
})
it('rechaza ampliación incompleta o secretos en campos de configuración', () => {
  expect(validarBackupJSON(JSON.stringify({ ...copia(), configuracion_comercio: {} }), 'k1').valido).toBe(false)
  expect(validarBackupJSON(JSON.stringify({ ...copia(), configuracion_comercio: { ...copia().configuracion_comercio, token: 'secret' } }), 'k1').valido).toBe(false)
})
it('proyecta sólo los campos públicos permitidos al restaurar configuración', async () => {
  const datos = validarBackupJSON(JSON.stringify(copia()), 'k1').datos!
  expect((await restaurarBackupIntegral(datos, 'FUSION', 'k1', undefined, { restaurarConfiguracion: true })).ok).toBe(true)
  expect(mocks.rpc).toHaveBeenCalledWith('restaurar_configuracion_backup', { p_kiosco_id: 'k1', p_configuracion: { nombre: 'Local', rubro: 'KIOSCO', cuit: null } })
})
it('restaurar ancho desactiva apertura y conserva configuración fiscal local', async () => {
  localStorage.setItem('kioskopos_abrir_cajon_efectivo_v1', 'true')
  localStorage.setItem('kioskopos_afip_config_k1', 'fiscal vigente')
  const datos = validarBackupJSON(JSON.stringify(copia()), 'k1').datos!
  expect((await restaurarBackupIntegral(datos, 'FUSION', 'k1', undefined, { restaurarPreferencias: true })).ok).toBe(true)
  expect(localStorage.getItem('kioskopos_abrir_cajon_efectivo_v1')).toBe('false')
  expect(localStorage.getItem('kioskopos_ancho_ticket')).toBe('80mm')
  expect(localStorage.getItem('kioskopos_afip_config_k1')).toBe('fiscal vigente')
})
it('rechaza configuración de otro comercio antes de restaurar cualquier colección', async () => {
  const datos = validarBackupJSON(JSON.stringify(copia()), 'k1').datos!
  expect((await restaurarBackupIntegral(datos, 'FUSION', 'k2', undefined, { restaurarConfiguracion: true })).ok).toBe(false)
  expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled()
})
it('no declara configuración restaurada ante una respuesta sin campos confirmados', async () => {
  mocks.rpc.mockResolvedValue({ data: [], error: null })
  const datos = validarBackupJSON(JSON.stringify(copia()), 'k1').datos!
  expect((await restaurarBackupIntegral(datos, 'FUSION', 'k1', undefined, { restaurarConfiguracion: true })).ok).toBe(false)
})
it('no descarga si el servidor aún devuelve formato 3.0 o faltan datos ampliados', async () => {
  mocks.rpc.mockResolvedValue({ data: { ...copia(), version: '3.0' }, error: null })
  expect((await generarBackupIntegral('k1')).ok).toBe(false)
  expect(mocks.descargar).not.toHaveBeenCalled()
})
