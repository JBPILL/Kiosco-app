import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CommercialAuditSection } from './CommercialAuditSection'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), rol: 'DUEÑO', activo: true, kiosco: 'k1' }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('../../stores/authStore', () => {
  const getState = () => ({ usuario: { id: 'u1', auth_user_id: 'a1', kiosco_id: mocks.kiosco, activo: mocks.activo, rol: mocks.rol } })
  return { useAuthStore: Object.assign((selector: (state: ReturnType<typeof getState>) => unknown) => selector(getState()), { getState }) }
})
beforeEach(() => { mocks.rol = 'DUEÑO'; mocks.activo = true; mocks.kiosco = 'k1'; mocks.rpc.mockReset().mockResolvedValue({ data: [], error: null }) })
afterEach(cleanup)
it('consulta un máximo de 50 eventos y presenta vacío sólo con respuesta correcta', async () => {
  render(<CommercialAuditSection />)
  expect(await screen.findByText('Sin eventos registrados')).toBeTruthy()
  expect(mocks.rpc).toHaveBeenCalledWith('consultar_auditoria_comercial', { p_limite: 50 })
})
it('no consulta ni muestra tarjeta al cajero', () => {
  mocks.rol = 'CAJERO'
  const { container } = render(<CommercialAuditSection />)
  expect(container.innerHTML).toBe('')
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('error remoto no se presenta como vacío ni expone su mensaje', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: new Error('SECRET_SQL') })
  render(<CommercialAuditSection />)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.queryByText('Sin eventos registrados')).toBeNull()
  expect(screen.queryByText('SECRET_SQL')).toBeNull()
})

it('oculta la tarjeta y no consulta cuando el dueño está inactivo', () => {
  mocks.activo = false
  const { container } = render(<CommercialAuditSection />)
  expect(container.innerHTML).toBe('')
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it('presenta motivo y precios del cambio', async () => {
  mocks.rpc.mockResolvedValue({ data: [{ id: 'e1', fecha: '2026-10-08T12:00:00Z', accion: 'PRECIO_VENTA_MODIFICADO', entidad: 'productos', entidad_id: 'p1', motivo: 'Actualización proveedor', actor_auth_id: 'a1', actor_rol: 'DUEÑO', detalles: { precio_anterior: 100, precio_nuevo: 200 } }], error: null })
  render(<CommercialAuditSection />)
  expect(await screen.findByText('Actualización proveedor')).toBeTruthy()
  expect(screen.getByText('Cambio de precio')).toBeTruthy()
})
it('rechaza datos privados inesperados', async () => {
  mocks.rpc.mockResolvedValue({ data: [{ id: 'e1', fecha: '2026-10-08T12:00:00Z', accion: 'VENTA_ANULADA', entidad: 'ventas', entidad_id: 'v1', motivo: 'Error ticket', actor_auth_id: 'a1', actor_rol: 'DUEÑO', detalles: { token: 'SECRET' } }], error: null })
  render(<CommercialAuditSection />)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.queryByText('SECRET')).toBeNull()
})
it('descarta una respuesta anterior al cambiar de comercio', async () => {
  let resolver: (respuesta: { data: unknown[]; error: null }) => void = () => {}
  mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { resolver = resolve }))
  const vista = render(<CommercialAuditSection />)
  mocks.kiosco = 'k2'
  vista.rerender(<CommercialAuditSection />)
  expect(await screen.findByText('Sin eventos registrados')).toBeTruthy()
  await act(async () => { resolver({ data: [{ id: 'viejo' }], error: null }) })
  expect(screen.queryByRole('alert')).toBeNull()
})
