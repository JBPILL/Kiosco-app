import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AltaRapidaModal } from './AltaRapidaModal'
import { crearProducto } from '../../test/factories'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), insert: vi.fn(), cache: vi.fn(),
  actor: { id: 'owner', auth_user_id: 'auth-owner', rol: 'DUEÑO', activo: true, kiosco_id: 'k1' } }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: Object.assign(() => ({ usuario: mocks.actor, kiosco: { id: 'k1' } }), { getState: () => ({ usuario: mocks.actor }) }) }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc, from: () => ({ insert: mocks.insert }) } }))
vi.mock('../../lib/utils', () => ({ formatPrecio: (n: number) => String(n), getCachedProductos: () => [], saveCachedProductos: mocks.cache }))
vi.mock('../../lib/sound', () => ({ playScanSound: vi.fn() }))
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); mocks.actor = { id: 'owner', auth_user_id: 'auth-owner', rol: 'DUEÑO', activo: true, kiosco_id: 'k1' } })
afterEach(() => { cleanup(); vi.unstubAllEnvs() })
function fill(): void {
  fireEvent.change(screen.getByPlaceholderText('Ej: Alfajor Jorgito Chocolate 55g'), { target: { value: 'Nuevo producto' } })
  fireEvent.change(screen.getAllByPlaceholderText('0')[0], { target: { value: '12.50' } })
  fireEvent.change(screen.getAllByPlaceholderText('0')[1], { target: { value: '5.25' } })
}
it.each(['CAJERO', 'VISOR'])('no ofrece alta de productos al rol %s', rol => {
  mocks.actor = { ...mocks.actor, rol }
  render(<AltaRapidaModal isOpen codigo="7791234567890" categorias={[]} onClose={vi.fn()} onGuardadoExitoso={vi.fn()} />)
  expect(screen.queryByRole('button', { name: /Guardar y agregar/ })).toBeNull()
})
it('revalida el dueño al guardar aunque haya cambiado la sesión con el modal abierto', () => {
  render(<AltaRapidaModal isOpen codigo="7791234567890" categorias={[]} onClose={vi.fn()} onGuardadoExitoso={vi.fn()} />)
  fill()
  mocks.actor = { ...mocks.actor, rol: 'CAJERO' }
  fireEvent.click(screen.getByRole('button', { name: /Guardar y agregar/ }))
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(mocks.insert).not.toHaveBeenCalled()
})
it('un rechazo de permisos legacy no crea un producto offline ni lo suma al ticket', async () => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'false')
  mocks.insert.mockResolvedValue({ error: { code: '42501', message: 'denied' } })
  const saved = vi.fn()
  render(<AltaRapidaModal isOpen codigo="7791234567890" categorias={[]} onClose={vi.fn()} onGuardadoExitoso={saved} />)
  fill()
  fireEvent.click(screen.getByRole('button', { name: /Guardar y agregar/ }))
  await waitFor(() => expect(mocks.insert).toHaveBeenCalledOnce())
  await waitFor(() => expect((screen.getByRole('button', { name: /Guardar y agregar/ }) as HTMLButtonElement).disabled).toBe(false))
  expect(saved).not.toHaveBeenCalled()
  expect(mocks.cache).not.toHaveBeenCalled()
})
it('strict conserva ID/cuerpo en reintento, costo privado y centavos; éxito sólo tras ACK', async () => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'response lost' } })
  mocks.rpc.mockImplementationOnce(async (_name, args) => ({ data: { producto: crearProducto({ id: args.p_producto_id, codigo_barras: '7791234567890', descripcion: 'Nuevo producto', precio_venta: 12.5, precio_costo: 0 }) }, error: null }))
  const saved = vi.fn()
  render(<AltaRapidaModal isOpen codigo="7791234567890" categorias={[]} onClose={vi.fn()} onGuardadoExitoso={saved} />)
  fill()
  fireEvent.click(screen.getByRole('button', { name: /Guardar y agregar/ }))
  await waitFor(() => expect((screen.getByRole('button', { name: /Guardar y agregar/ }) as HTMLButtonElement).disabled).toBe(false))
  expect(saved).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /Guardar y agregar/ }))
  await waitFor(() => expect(saved).toHaveBeenCalledOnce())
  const first = mocks.rpc.mock.calls[0][1]
  expect(first).toEqual(mocks.rpc.mock.calls[1][1])
  expect(first.p_producto_id).toBe(first.p_operacion_id)
  expect(first.p_datos.precio_venta).toBe(12.5)
  expect(first.p_datos.precio_costo).toBe(5.25)
  expect(mocks.cache).toHaveBeenCalledOnce()
})
