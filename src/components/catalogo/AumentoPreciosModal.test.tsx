import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { crearProducto } from '../../test/factories'
import { db, resetDb, responder } from '../../test/supabaseMock'

vi.mock('../../lib/supabase', async () => {
  const { crearModuloSupabase } = await import('../../test/supabaseMock')
  return crearModuloSupabase()
})
const mocks = vi.hoisted(() => ({ cargar: vi.fn() }))
vi.mock('../../stores/proveedorStore', () => ({ useProveedorStore: () => ({ proveedores: [], cargarProveedores: mocks.cargar }) }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: { getState: () => ({ usuario: { kiosco_id: 'k1' } }) } }))
import { AumentoPreciosModal } from './AumentoPreciosModal'

beforeEach(() => { resetDb(); vi.clearAllMocks(); localStorage.clear(); vi.stubEnv('VITE_AUDITORIA_MOTIVO_PRECIO', 'true') })
afterEach(() => vi.unstubAllEnvs())

it('no envía aumentos sin motivo', () => {
  render(<AumentoPreciosModal isOpen onClose={vi.fn()} categorias={[]} productos={[crearProducto()]} onAumentoAplicado={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar a 1 productos' }))
  expect(db.llamadas.filter(llamada => llamada.op === 'update')).toHaveLength(0)
})

it('envía el motivo por producto y sólo notifica después de terminar', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  responder('productos.update', { error: null })
  const recargar = vi.fn()
  render(<AumentoPreciosModal isOpen onClose={vi.fn()} categorias={[]} productos={[crearProducto()]} onAumentoAplicado={recargar} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Motivo del cambio de precio' }), { target: { value: '  Ajuste por proveedor  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar a 1 productos' }))
  await waitFor(() => expect(recargar).toHaveBeenCalledTimes(1))
  expect(db.llamadas.find(llamada => llamada.op === 'update')?.payload).toEqual(expect.objectContaining({ motivo_cambio_precio: 'Ajuste por proveedor' }))
})
