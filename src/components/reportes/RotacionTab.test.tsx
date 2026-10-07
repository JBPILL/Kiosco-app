import { beforeEach, expect, it, vi } from 'vitest'
import { render, waitFor, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { llamadasA, resetDb, responder } from '../../test/supabaseMock'
vi.mock('../../lib/supabase', async () => (await import('../../test/supabaseMock')).crearModuloSupabase())
import { RotacionTab } from './RotacionTab'
import { useAuthStore } from '../../stores/authStore'
import { crearProducto } from '../../test/factories'

beforeEach(() => {
  resetDb()
  useAuthStore.setState({ usuario: { id: 'u1', rol: 'DUEÑO', kiosco_id: 'k1' } as never, kiosco: { id: 'k1' } as never })
})
it('distingue un artículo sin ventas de uno con más de noventa días de inactividad', async () => {
  responder('productos.select', { data: [crearProducto({ id: 'p1', descripcion: 'Artículo reciente', stock_actual: 2,
    fecha_creacion: new Date().toISOString() })], error: null })
  responder('ventas.select', { data: [], error: null })
  responder('producto_costos.select', { data: [{ producto_id: 'p1', precio_costo: 10 }], error: null })
  render(<MemoryRouter><RotacionTab /></MemoryRouter>)
  expect(await screen.findByText('Sin ventas registradas')).toBeTruthy()
  const tabla = screen.getByRole('table')
  expect(tabla.className).toContain('table-fixed')
  expect(tabla.className).not.toContain('min-w-[')
  expect(screen.getByRole('button', { name: 'Actualizar rotación' }).textContent).toBe('')
})
it('consulta costos protegidos de productos e historial sin pedirlos en el join público', async () => {
  responder('productos.select', { data: [{ id: 'p1', descripcion: 'Producto', precio_costo: 0, precio_venta: 20, stock_actual: 2, activo: true }], error: null })
  responder('ventas.select', { data: [{ fecha_hora: new Date().toISOString(), detalles: [{ producto_id: 'p1', cantidad: 1 }] }], error: null })
  responder('producto_costos.select', { data: [{ producto_id: 'p1', precio_costo: 10 }], error: null })
  render(<MemoryRouter><RotacionTab /></MemoryRouter>)
  await waitFor(() => expect(llamadasA('producto_costos', 'select')).toHaveLength(2))
  expect(JSON.stringify(llamadasA('ventas', 'select')[0].filtros)).not.toContain('precio_costo')
})
