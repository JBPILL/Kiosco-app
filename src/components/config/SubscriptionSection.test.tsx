import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SubscriptionSection } from './SubscriptionSection'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), user: { id: 'owner', auth_user_id: 'a1', kiosco_id: 'k1', activo: true, rol: 'DUEÑO' } }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: Object.assign(() => ({ usuario: mocks.user }),
  { getState: () => ({ usuario: mocks.user }) }) }))
const snapshot = { estado: 'ACTIVO', dias_restantes: 3, pagos: [], instrucciones: {},
  suscripcion: { id: 's1', kiosco_id: 'k1', plan_id: 'p1', estado: 'ACTIVA', fecha_inicio: '2026-10-01', fecha_vencimiento: '2026-10-19',
    plan: { id: 'p1', nombre: 'Plan real', precio_mensual: 0 } } }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.user.rol = 'DUEÑO'; mocks.user.id = 'owner'; mocks.user.kiosco_id = 'k1'
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
  vi.stubEnv('VITE_ADMIN_COMERCIAL_HABILITADO', 'true')
  mocks.rpc.mockResolvedValue({ data: snapshot, error: null })
})
afterEach(() => { cleanup(); vi.unstubAllEnvs() })
it('strict true + comercial false conserva cartel sin consultas', () => {
  vi.stubEnv('VITE_ADMIN_COMERCIAL_HABILITADO', 'false')
  render(<SubscriptionSection />)
  expect(screen.getByText('Administración comercial fuera del piloto')).toBeTruthy()
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('strict true + comercial true muestra plan real, incluso precio cero, sin acciones privilegiadas', async () => {
  render(<SubscriptionSection />)
  await screen.findByText('Plan real')
  expect(screen.getByText('La suscripción está próxima a vencer.')).toBeTruthy()
  expect(screen.queryByText(/35\.000/)).toBeNull()
  expect(screen.queryByRole('button', { name: /renovar|cambiar plan|registrar pago/i })).toBeNull()
  expect(mocks.rpc).toHaveBeenCalledWith('obtener_mi_suscripcion_comercial')
})
it.each([['SOLO_LECTURA', 'Solo lectura'], ['SUSPENDIDO', 'Suspendido']])('explica estado %s sin permitir mutaciones', async (estado, label) => {
  mocks.rpc.mockResolvedValue({ data: { ...snapshot, estado }, error: null })
  render(<SubscriptionSection />)
  await screen.findByText(label)
  expect(screen.getByRole('status')).toBeTruthy()
})
it('presenta fechas DATE del comercio sin restar un día por la zona horaria', async () => {
  mocks.rpc.mockResolvedValue({ data: { ...snapshot, dias_restantes: 31,
    suscripcion: { ...snapshot.suscripcion, fecha_inicio: '2026-10-17', fecha_vencimiento: '2026-11-17' } }, error: null })
  render(<SubscriptionSection />)
  expect(await screen.findByText('17/10/2026')).toBeTruthy()
  expect(screen.getByText('17/11/2026')).toBeTruthy()
  expect(screen.queryByText('16/10/2026')).toBeNull()
})
it('muestra un pago confirmado de importe cero sin inventar un monto ni notas internas', async () => {
  mocks.rpc.mockResolvedValue({ data: { ...snapshot, pagos: [{ id: 'pay1', suscripcion_id: 's1', monto: 0,
    fecha_pago: '2026-10-17T15:00:00Z', medio_pago: 'OTRO', meses: 1 }] }, error: null })
  render(<SubscriptionSection />)
  const table = await screen.findByRole('table', { name: 'Pagos confirmados de tu suscripción' })
  expect(table.textContent).toContain('OTRO')
  expect(table.textContent).toMatch(/\$\s*0/)
  expect(screen.queryByText('No hay pagos registrados.')).toBeNull()
})
it('sin suscripción no inventa plan, precio ni vigencia', async () => {
  mocks.rpc.mockResolvedValue({ data: { ...snapshot, suscripcion: null, dias_restantes: null }, error: null })
  render(<SubscriptionSection />)
  await screen.findByText('Plan no disponible')
  expect(screen.getByText('Precio no disponible')).toBeTruthy()
  expect(screen.queryByText('Kiosco Pro')).toBeNull()
})
it.each(['CAJERO', 'VISOR'])('%s no consulta datos comerciales sensibles', rol => {
  mocks.user.rol = rol
  render(<SubscriptionSection />)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('un error es visible y permite reintentar', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'denied' } })
  render(<SubscriptionSection />)
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar suscripción' }))
  await screen.findByText('Plan real')
})
it('descarta respuesta tardía al cambiar de comercio/operador', async () => {
  let resolver!: (value: unknown) => void
  mocks.rpc.mockReturnValueOnce(new Promise(resolve => { resolver = resolve }))
  const { rerender } = render(<SubscriptionSection />)
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce())
  mocks.user.id = 'otro'; mocks.user.kiosco_id = 'k2'
  mocks.rpc.mockResolvedValue({ data: { ...snapshot, suscripcion: null }, error: null })
  rerender(<SubscriptionSection />)
  await act(async () => { resolver({ data: snapshot, error: null }) })
  expect(screen.queryByText('Plan real')).toBeNull()
})
