import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PaymentModal } from './PaymentModal'

const mocks = vi.hoisted(() => ({ recuperar: vi.fn(), nuevo: vi.fn(), completar: vi.fn(),
  from: vi.fn(), cargar: vi.fn(), factura: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: mocks.from } }))
vi.mock('../../lib/manualCheckoutFlow', () => ({ recuperarFlujoCobroManual: mocks.recuperar, ejecutarCobroManual: mocks.nuevo }))
vi.mock('../../stores/cartStore', () => {
  const state = { items: [], totalMonto: () => 100, subtotalMonto: () => 100, montoAjuste: () => 0,
    tipoAjuste: 'NINGUNO', valorAjuste: 0, descripcionAjuste: () => '', tabActivaId: 'tab-original',
    cobrosBloqueados: { 'tab-original': 'venta-original' }, completarCobroTab: mocks.completar }
  return { useCartStore: Object.assign(() => state, { getState: () => state }) }
})
vi.mock('../../stores/authStore', () => ({ useAuthStore: { getState: () => ({ usuario: { id: 'operador' }, kiosco: { id: 'comercio' } }) } }))
vi.mock('../../stores/cajaStore', () => ({ useCajaStore: { getState: () => ({ sesionActiva: null }) } }))
vi.mock('../../stores/clienteStore', () => ({ useClienteStore: () => ({ clientes: [], cargarClientes: mocks.cargar }) }))
vi.mock('../../stores/afipStore', () => ({ useAFIPStore: () => ({ config: null, cargarConfiguracion: mocks.cargar, emitirFacturaVenta: mocks.factura }) }))
vi.mock('../../stores/loteStore', () => ({ useLoteStore: {} }))
vi.mock('../../stores/comboStore', () => ({ useComboStore: {} }))
vi.mock('../../stores/offlineSyncStore', () => ({ useOfflineSyncStore: {} }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_CHECKOUT_MANUAL_TRANSACCIONAL', 'true')
  mocks.recuperar.mockResolvedValue({ ventaId: 'venta-original', recibo: null, pendiente: false, recuperado: true })
})
afterEach(() => vi.unstubAllEnvs())

it('recupera el cobro congelado aunque cambie el pago y la caja ya no esté abierta', async () => {
  const onClose = vi.fn()
  const onVenta = vi.fn()
  render(<PaymentModal isOpen onClose={onClose} onVentaCompletada={onVenta} />)
  fireEvent.click(screen.getByRole('button', { name: 'Fiar / Cuenta' }))
  fireEvent.click(screen.getByRole('button', { name: 'Recuperar cobro guardado' }))
  await waitFor(() => expect(mocks.completar).toHaveBeenCalledWith('tab-original'))
  expect(mocks.recuperar).toHaveBeenCalledWith('comercio', 'operador', 'tab-original')
  expect(mocks.nuevo).not.toHaveBeenCalled()
  expect(mocks.from).not.toHaveBeenCalled()
  expect(mocks.factura).not.toHaveBeenCalled()
  expect(onVenta).not.toHaveBeenCalled()
  expect(onClose).toHaveBeenCalledOnce()
})

it('un error conserva el ticket y no cae en escrituras separadas ni emisión fiscal', async () => {
  mocks.recuperar.mockRejectedValue(new Error('Cierre pendiente'))
  const onClose = vi.fn()
  render(<PaymentModal isOpen onClose={onClose} onVentaCompletada={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Recuperar cobro guardado' }))
  await waitFor(() => expect(mocks.recuperar).toHaveBeenCalledOnce())
  expect(mocks.completar).not.toHaveBeenCalled()
  expect(mocks.nuevo).not.toHaveBeenCalled()
  expect(mocks.from).not.toHaveBeenCalled()
  expect(mocks.factura).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
})
