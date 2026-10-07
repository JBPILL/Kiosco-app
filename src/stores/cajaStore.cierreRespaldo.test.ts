import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'

const mocks = vi.hoisted(() => ({
  actualizar: vi.fn(), crear: vi.fn(), guardar: vi.fn(), pendientes: vi.fn(), usuario: { id: 'u1', kiosco_id: 'k1' },
}))
vi.mock('./authStore', () => ({ useAuthStore: { getState: () => ({ usuario: mocks.usuario }) } }))
vi.mock('./offlineSyncStore', () => ({ useOfflineSyncStore: { getState: () => ({ cargarCola: () => [] }) } }))
vi.mock('../lib/backupCierreLocal', () => ({ crearRespaldoCierreLocal: mocks.crear, guardarRespaldoCierreLocal: mocks.guardar }))
vi.mock('../lib/manualCheckoutClient', () => ({ hayCobrosManualesPendientes: mocks.pendientes }))
vi.mock('../lib/supabase', () => ({ supabase: { from: () => {
  const chain = {
    update: mocks.actualizar, eq: () => chain,
    select: async () => ({ data: [{ id: 's1' }], error: null }),
  }
  mocks.actualizar.mockReturnValue(chain)
  return chain
} } }))
import { useCajaStore } from './cajaStore'

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mocks.crear.mockReset().mockReturnValue({ tipo: 'ARQUEO_CAJA' })
  mocks.guardar.mockReset().mockResolvedValue(undefined)
  mocks.pendientes.mockReset().mockResolvedValue(false)
  useCajaStore.setState({
    sesionActiva: { id: 's1', kiosco_id: 'k1', usuario_id: 'u1', estado: 'ABIERTA',
      fecha_apertura: '2026-10-06T10:00:00Z', fecha_cierre: null, monto_inicial: 100,
      monto_final_declarado: null, monto_final_sistema: null, diferencia: null },
    resumenActivo: null, movimientosCaja: [], cargando: false,
    cargarResumenSesion: vi.fn().mockResolvedValue(null),
  })
})
afterEach(() => vi.unstubAllEnvs())

it('no cierra ni guarda un arqueo mientras hay cobros manuales sin confirmar en esa caja', async () => {
  vi.stubEnv('VITE_CHECKOUT_MANUAL_TRANSACCIONAL', 'true')
  mocks.pendientes.mockResolvedValue(true)
  expect(await useCajaStore.getState().cerrarCaja(100)).toBe(false)
  expect(mocks.pendientes).toHaveBeenCalledWith('k1', 's1')
  expect(mocks.actualizar).not.toHaveBeenCalled()
  expect(mocks.guardar).not.toHaveBeenCalled()
  expect(useCajaStore.getState().sesionActiva?.id).toBe('s1')
  expect(useCajaStore.getState().cargando).toBe(false)
})

it('un fallo de lectura de pendientes conserva abierta la sesión', async () => {
  vi.stubEnv('VITE_CHECKOUT_MANUAL_TRANSACCIONAL', 'true')
  mocks.pendientes.mockRejectedValue(new Error('IndexedDB no disponible'))
  expect(await useCajaStore.getState().cerrarCaja(100)).toBe(false)
  expect(mocks.actualizar).not.toHaveBeenCalled()
  expect(useCajaStore.getState().sesionActiva?.id).toBe('s1')
})

it('limpia la sesión confirmada aunque el constructor del respaldo lance', async () => {
  mocks.crear.mockImplementationOnce(() => { throw new Error('Cache movimientos inválida') })
  expect(await useCajaStore.getState().cerrarCaja(110)).toBe(true)
  expect(useCajaStore.getState().sesionActiva).toBeNull()
  expect(useCajaStore.getState().cargando).toBe(false)
  expect(mocks.guardar).not.toHaveBeenCalled()
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('falló su copia local'))
  expect(await useCajaStore.getState().cerrarCaja(110)).toBe(false)
  expect(mocks.actualizar).toHaveBeenCalledOnce()
})

it('un rechazo de IndexedDB no hace fallar el cierre ni permite enviarlo dos veces', async () => {
  mocks.guardar.mockRejectedValueOnce(new Error('QuotaExceeded'))
  expect(await useCajaStore.getState().cerrarCaja(100)).toBe(true)
  await Promise.resolve()
  expect(useCajaStore.getState().sesionActiva).toBeNull()
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('falló su copia local'))
  expect(await useCajaStore.getState().cerrarCaja(100)).toBe(false)
  expect(mocks.actualizar).toHaveBeenCalledOnce()
})

it('no espera una escritura local pendiente para liberar la caja confirmada', async () => {
  let completar: (() => void) | undefined
  mocks.guardar.mockImplementationOnce(() => new Promise<void>((resolve) => { completar = resolve }))
  expect(await useCajaStore.getState().cerrarCaja(100)).toBe(true)
  expect(useCajaStore.getState().sesionActiva).toBeNull()
  expect(useCajaStore.getState().cargando).toBe(false)
  completar?.()
})
