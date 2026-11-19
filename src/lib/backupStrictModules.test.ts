import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), state: { usuario: { id: 'owner', auth_user_id: 'auth', activo: true, rol: 'DUEÑO', kiosco_id: 'tenant' }, kiosco: { id: 'tenant' } } }))
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: () => mocks.state } }))
import { comprobarModulosBackupStrict, datosContactoBackup, guardarModuloBackupStrict, prepararLotesBackupStrict } from './backupStrictModules'
const id = '10000000-0000-0000-0000-000000000001'
const data = { nombre: 'Nombre privado de ensayo', saldo_deudor: 150, telefono: 'Contacto privado' }
const ack = () => ({ data: { id, kiosco_id: 'tenant', creado: true, saldo_conservado: false,
  registro: { id, kiosco_id: 'tenant', ...data } }, error: null })
beforeEach(() => {
  mocks.rpc.mockReset(); localStorage.clear(); vi.stubGlobal('crypto', webcrypto)
  mocks.state.usuario = { id: 'owner', auth_user_id: 'auth', activo: true, rol: 'DUEÑO', kiosco_id: 'tenant' }
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('recupera una respuesta incierta con la misma operación sin guardar datos personales en el pendiente', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Sin respuesta' } }).mockResolvedValueOnce(ack())
  await expect(guardarModuloBackupStrict('clientes', 'tenant', id, data)).rejects.toThrow('Sin respuesta')
  const pending = localStorage.getItem(localStorage.key(0)!)!
  expect(pending).not.toContain(data.nombre); expect(pending).not.toContain(data.telefono)
  expect(JSON.parse(pending)).toEqual({ id: expect.any(String), firma: expect.stringMatching(/^[a-f0-9]{64}$/) })
  await guardarModuloBackupStrict('clientes', 'tenant', id, data)
  expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[0])
  expect(localStorage.length).toBe(0)
})
it('no reemplaza solicitud incierta ni envía sin persistir la operación', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Sin ACK' } })
  await expect(guardarModuloBackupStrict('clientes', 'tenant', id, data)).rejects.toThrow()
  await expect(guardarModuloBackupStrict('clientes', 'tenant', id, { ...data, saldo_deudor: 10 })).rejects.toThrow('original')
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
  localStorage.clear()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Cuota') })
  await expect(guardarModuloBackupStrict('clientes', 'tenant', id, data)).rejects.toThrow('Cuota')
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
})
it.each([null, { ...ack().data, kiosco_id: 'other' }, { ...ack().data, saldo_conservado: true },
  { ...ack().data, registro: { id, kiosco_id: 'other' } }])('conserva el pendiente ante ACK incompleto o ajeno %#', async value => {
  mocks.rpc.mockResolvedValue({ data: value, error: null })
  await expect(guardarModuloBackupStrict('clientes', 'tenant', id, data)).rejects.toThrow('no confirmó')
  expect(localStorage.length).toBe(1)
})
it('cambio de sesión durante el envío impide confirmar', async () => {
  mocks.rpc.mockImplementation(async () => { mocks.state.usuario = { ...mocks.state.usuario, id: 'otro' }; return ack() })
  await expect(guardarModuloBackupStrict('clientes', 'tenant', id, data)).rejects.toThrow('sesión original')
  expect(localStorage.length).toBe(1)
})
it('productos y lotes usan RPC distintos y exigen pertenencia en el ACK', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: { producto: { id, kiosco_id: 'tenant' } }, error: null })
    .mockResolvedValueOnce({ data: { id, kiosco_id: 'tenant', registro: { id, kiosco_id: 'tenant' } }, error: null })
  await guardarModuloBackupStrict('productos', 'tenant', id, { proveedor_id: null })
  await guardarModuloBackupStrict('lotes_producto', 'tenant', id, { producto_id: id })
  expect(mocks.rpc.mock.calls[0]).toEqual(['restaurar_producto_backup', expect.objectContaining({ p_producto_id: id, p_kiosco_id: 'tenant' })])
  expect(mocks.rpc.mock.calls[1]).toEqual(['restaurar_lote_backup', expect.objectContaining({ p_lote_id: id, p_kiosco_id: 'tenant' })])
})
it.each([null, { version: 1, kiosco_id: 'other', modulos: ['contactos', 'producto_proveedor', 'lotes'] },
  { version: 1, kiosco_id: 'tenant', modulos: ['contactos'] }])('no habilita módulos con contrato incompleto %#', async value => {
  mocks.rpc.mockResolvedValue({ data: value, error: null })
  await expect(comprobarModulosBackupStrict('tenant')).rejects.toThrow('No se escribió')
})
it('acepta la capacidad completa exclusivamente para el dueño original', async () => {
  mocks.rpc.mockResolvedValue({ data: { version: 1, kiosco_id: 'tenant', modulos: ['contactos', 'producto_proveedor', 'lotes'] }, error: null })
  await comprobarModulosBackupStrict('tenant')
  mocks.state.usuario = { ...mocks.state.usuario, rol: 'CAJERO' }
  await expect(comprobarModulosBackupStrict('tenant')).rejects.toThrow('Dueño')
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
})
it('valida contactos antes de escribir sin descartar puntos, decimales extra o importes corruptos', () => {
  for (const fila of [{ nombre: 'Ensayo', puntos_fidelidad: 2 }, { nombre: 'Ensayo', saldo_deudor: 0.001 },
    { nombre: 'Ensayo', saldo_deudor: null }, { nombre: 'Ensayo', saldo_deudor: '12' }, { nombre: 'Ensayo', activo: 'false' }]) {
    expect(() => datosContactoBackup('clientes', fila)).toThrow()
  }
  expect(datosContactoBackup('clientes', { nombre: ' Ensayo ', activo: false, puntos_fidelidad: 0 }))
    .toMatchObject({ nombre: 'Ensayo', activo: false, limite_credito: 0, saldo_deudor: 0, email: null })
})

it('valida unidades, fechas y total de lotes antes de cualquier escritura', () => {
  const product = { id, stock_actual: 2, es_pesable: false }
  const batch = { producto_id: id, cantidad_inicial: 2, cantidad_actual: 1, fecha_vencimiento: '2027-01-01', fecha_ingreso: '2026-10-01T10:00:00Z' }
  expect(prepararLotesBackupStrict([batch], [product])).toEqual([{ ...batch, activo: true, numero_lote: null }])
  for (const input of [{ ...batch, cantidad_actual: 0.5 }, { ...batch, cantidad_actual: '1' },
    { ...batch, cantidad_actual: 3 }, { ...batch, fecha_vencimiento: '2027-02-30' },
    { ...batch, fecha_ingreso: '2026-10-01' }, { ...batch, activo: 'false' }]) {
    expect(() => prepararLotesBackupStrict([input], [product])).toThrow()
  }
  expect(() => prepararLotesBackupStrict([batch, batch, batch], [product])).toThrow('stock físico')
  expect(() => prepararLotesBackupStrict([batch], [{ ...product, es_combo: true }])).toThrow('virtual')
  expect(prepararLotesBackupStrict([{ ...batch, cantidad_actual: 0.125 }], [{ ...product, es_pesable: true }]))
    .toMatchObject([{ cantidad_actual: 0.125 }])
})
