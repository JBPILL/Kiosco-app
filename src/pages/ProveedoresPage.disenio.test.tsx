import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ProveedoresPage } from './ProveedoresPage'

const mocks = vi.hoisted(() => ({ cargar: vi.fn(), registrar: vi.fn(), productos: [], proveedores: [] }))
vi.mock('../stores/proveedorStore', () => ({ useProveedorStore: () => ({ proveedores: mocks.proveedores,
  compras: [], pagos: [], cargando: false, cargarProveedores: mocks.cargar, cargarCompras: mocks.cargar,
  cargarPagos: mocks.cargar, registrarCompra: mocks.registrar }) }))
vi.mock('../hooks/useProducts', () => ({ useProducts: () => ({ productos: mocks.productos, categorias: [], cargarProductos: mocks.cargar }) }))
vi.mock('../stores/cajaStore', () => ({ useCajaStore: () => ({ sesionActiva: null, verificarSesionActiva: mocks.cargar }) }))
vi.mock('../stores/authStore', () => ({ useAuthStore: () => ({ usuario: { id: 'u1', kiosco_id: 'k1', rol: 'DUEÑO' }, kiosco: { id: 'k1' } }) }))
vi.mock('../hooks/useBarcodeGun', () => ({ useBarcodeGun: () => undefined }))
vi.mock('../components/proveedores/ComprobantePagoModal', () => ({ ComprobantePagoModal: () => null }))

beforeEach(() => vi.clearAllMocks())

it('presenta cuatro tarjetas con explicación y conserva la búsqueda del directorio', () => {
  render(<MemoryRouter><ProveedoresPage /></MemoryRouter>)
  expect(screen.getAllByRole('article')).toHaveLength(4)
  expect(screen.getByText('Pagos registrados, sin incluir anulados')).toBeTruthy()
  expect(screen.getByPlaceholderText('Buscar proveedor, contacto, CUIT o teléfono...')).toBeTruthy()
  expect(screen.getByText('No se encontraron proveedores')).toBeTruthy()
})

it('explica el impacto de carga rápida y permite comenzar creando un proveedor', () => {
  render(<MemoryRouter><ProveedoresPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Nueva Compra' }))
  expect(screen.getByRole('heading', { name: 'Carga Rápida de Compra' })).toBeTruthy()
  expect(screen.getByText(/no aumenta el stock/)).toBeTruthy()
  expect(screen.getByText(/aumenta la cuenta corriente del proveedor/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Crear proveedor para comenzar' }))
  expect(screen.getByRole('heading', { name: 'Registrar Nuevo Proveedor' })).toBeTruthy()
  expect(mocks.registrar).not.toHaveBeenCalled()
})
