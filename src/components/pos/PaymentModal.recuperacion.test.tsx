import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PaymentModal } from './PaymentModal'

const mocks = vi.hoisted(() => ({ recuperar: vi.fn(), nuevo: vi.fn(), completar: vi.fn(),
  from: vi.fn(), cargar: vi.fn(), factura: vi.fn(), politica: vi.fn(), guardado: true, rol: '', tipoAjuste: 'NINGUNO', valorAjuste: 0 }))
vi.mock('../../lib/supervisorPolicyClient', () => ({ consultarPoliticaSupervisor: mocks.politica }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: mocks.from } }))
vi.mock('../../lib/manualCheckoutFlow', () => ({ recuperarFlujoCobroManual: mocks.recuperar, ejecutarCobroManual: mocks.nuevo }))
vi.mock('../../stores/cartStore', () => {
  const state = () => ({ items: [], totalMonto: () => 100, subtotalMonto: () => 100, montoAjuste: () => 0,
    tipoAjuste: mocks.tipoAjuste, valorAjuste: mocks.valorAjuste, descripcionAjuste: () => '', tabActivaId: 'tab-original',
    cobrosBloqueados: mocks.guardado ? { 'tab-original': 'venta-original' } : {}, completarCobroTab: mocks.completar })
  return { useCartStore: Object.assign(state, { getState: state }) }
})
vi.mock('../../stores/authStore', () => {
  const getState = () => ({ usuario: { id: 'operador', rol: mocks.rol }, kiosco: { id: 'comercio' } })
  return { useAuthStore: Object.assign((selector: (state: ReturnType<typeof getState>) => unknown) => selector(getState()), { getState }) }
})
vi.mock('../../stores/cajaStore', () => ({ useCajaStore: { getState: () => ({ sesionActiva: null }) } }))
vi.mock('../../stores/clienteStore', () => ({ useClienteStore: () => ({ clientes: [], cargarClientes: mocks.cargar }) }))
vi.mock('../../stores/afipStore', () => ({ useAFIPStore: () => ({ config: null, cargarConfiguracion: mocks.cargar, emitirFacturaVenta: mocks.factura }) }))
vi.mock('../../stores/loteStore', () => ({ useLoteStore: {} }))
vi.mock('../../stores/comboStore', () => ({ useComboStore: {} }))
vi.mock('../../stores/offlineSyncStore', () => ({ useOfflineSyncStore: {} }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.guardado = true; mocks.rol = ''; mocks.tipoAjuste = 'NINGUNO'; mocks.valorAjuste = 0
  mocks.politica.mockReset().mockResolvedValue({ umbralPorcentaje: 5, revision: 1 })
  vi.stubEnv('VITE_CHECKOUT_MANUAL_TRANSACCIONAL', 'true')
  mocks.recuperar.mockResolvedValue({ ventaId: 'venta-original', recibo: null, pendiente: false, recuperado: true })
})
afterEach(() => vi.unstubAllEnvs())

it('presenta el umbral vigente en el pedido de PIN del cajero', async () => {
  mocks.guardado = false; mocks.rol = 'CAJERO'; mocks.tipoAjuste = 'DESCUENTO_PORCENTAJE'; mocks.valorAjuste = 10
  render(<PaymentModal isOpen onClose={vi.fn()} onVentaCompletada={vi.fn()} />)
  expect(await screen.findByText('PIN del supervisor (descuento mayor al 5%)')).toBeTruthy()
  expect(screen.getByLabelText('PIN del supervisor')).toBeTruthy()
})

it('con el circuito antiguo muestra PIN y bloquea el descuento protegido sin escribir la venta', async () => {
  vi.stubEnv('VITE_CHECKOUT_MANUAL_TRANSACCIONAL', 'false')
  mocks.guardado = false; mocks.rol = 'CAJERO'; mocks.tipoAjuste = 'DESCUENTO_PORCENTAJE'; mocks.valorAjuste = 20
  mocks.politica.mockResolvedValue({ umbralPorcentaje: 15, revision: 1 })
  render(<PaymentModal isOpen onClose={vi.fn()} onVentaCompletada={vi.fn()} />)
  expect(await screen.findByLabelText('PIN del supervisor')).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toContain('Habilitá el cobro transaccional')
  const boton = screen.getByRole('button', { name: 'Confirmar y Cobrar' })
  expect((boton as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(boton)
  expect(mocks.from).not.toHaveBeenCalled()
  expect(mocks.nuevo).not.toHaveBeenCalled()
})

it('no pide PIN para descuento inferior al umbral configurado y muestra fallo de consulta', async () => {
  mocks.guardado = false; mocks.rol = 'CAJERO'; mocks.tipoAjuste = 'DESCUENTO_PORCENTAJE'; mocks.valorAjuste = 20
  mocks.politica.mockResolvedValueOnce({ umbralPorcentaje: 25, revision: 2 })
  const vista = render(<PaymentModal isOpen onClose={vi.fn()} onVentaCompletada={vi.fn()} />)
  await waitFor(() => expect(screen.queryByText('Verificando descuento…')).toBeNull())
  expect(screen.queryByLabelText('PIN del supervisor')).toBeNull()
  vista.unmount()
  mocks.politica.mockRejectedValueOnce(new Error('SECRET'))
  render(<PaymentModal isOpen onClose={vi.fn()} onVentaCompletada={vi.fn()} />)
  expect(await screen.findByText('No se pudo verificar el umbral de descuento')).toBeTruthy()
  expect(screen.queryByText('SECRET')).toBeNull()
})

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
