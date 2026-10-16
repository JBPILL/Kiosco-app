import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CatalogoPage } from './CatalogoPage'
const mocks = vi.hoisted(() => ({ cargar: vi.fn(), buscar: vi.fn(), categoria: vi.fn(), lookup: vi.fn(), eq: vi.fn(), scan: null as null | ((code: string) => Promise<void>),
 auth: { usuario: { id: 'owner', auth_user_id: 'auth-owner', kiosco_id: 'k1', rol: 'DUEÑO', activo: true }, kiosco: { id: 'k1' } } }))
vi.mock('../stores/authStore', () => ({ useAuthStore: Object.assign(() => mocks.auth, { getState: () => mocks.auth }) }))
vi.mock('../hooks/useBarcodeGun', () => ({ useBarcodeGun: (options: { onScan: (code: string) => Promise<void> }) => { mocks.scan = options.onScan } }))
vi.mock('../lib/supabase', () => ({ supabase: { from: () => {
 const query = { select: () => query, eq: mocks.eq, maybeSingle: mocks.lookup }
 mocks.eq.mockReturnValue(query); return query
} } }))
vi.mock('../components/ui/BarcodeCaptureModal', () => ({ BarcodeCaptureModal: ({ isOpen, onBarcodeCaptured }: { isOpen: boolean; onBarcodeCaptured: (code: string) => void }) =>
 isOpen ? <button onClick={() => onBarcodeCaptured('7791234567890')}>capturar-codigo</button> : null }))
vi.mock('../hooks/useTenantConfig', () => ({ useTenantConfig: () => ({ tieneEnvases: false, esFotocopiadora: false }) }))
vi.mock('../hooks/useProducts', () => ({ useProducts: () => ({ productos: [], categorias: [], cargando: false, busqueda: '', categoriaFiltro: null, setBusqueda: mocks.buscar, setCategoriaFiltro: mocks.categoria, cargarProductos: mocks.cargar, cargarCategorias: mocks.cargar }) }))
vi.mock('../stores/proveedorStore', () => ({ useProveedorStore: () => ({ proveedores: [], cargarProveedores: mocks.cargar }) }))
vi.mock('../components/catalogo/CategoryManager', () => ({ CategoryManager: () => null }))
vi.mock('../components/catalogo/ProductForm', () => ({ ProductForm: ({ isOpen, codigoInicial, producto }: { isOpen: boolean; codigoInicial: string; producto: { id: string } | null }) =>
 isOpen ? <div data-testid="product-form" data-code={codigoInicial} data-product={producto?.id} /> : null }))
vi.mock('../components/catalogo/SiembraCatalogoModal', () => ({ SiembraCatalogoModal: () => null }))
vi.mock('../components/catalogo/AumentoPreciosModal', () => ({ AumentoPreciosModal: () => null }))
vi.mock('../components/catalogo/PreciosEnvasesModal', () => ({ PreciosEnvasesModal: () => null }))
vi.mock('../components/catalogo/EtiquetasGondolaModal', () => ({ EtiquetasGondolaModal: () => null }))
vi.mock('../components/catalogo/ImportarCatalogoModal', () => ({ ImportarCatalogoModal: () => null }))
afterEach(cleanup)
beforeEach(() => {
 vi.clearAllMocks()
 mocks.auth.usuario = { id: 'owner', auth_user_id: 'auth-owner', kiosco_id: 'k1', rol: 'DUEÑO', activo: true }
 mocks.lookup.mockResolvedValue({ data: null, error: null })
})
it('presenta indicadores, herramientas y ayudas del catálogo sin perder filtros', () => {
 render(<CatalogoPage />)
 expect(screen.getAllByRole('article')).toHaveLength(4)
 expect(screen.getByRole('heading', { name: 'Herramientas del catálogo' })).toBeTruthy()
 expect(screen.getByRole('combobox', { name: 'Filtrar por categoría' })).toBeTruthy()
 expect(screen.getByRole('combobox', { name: 'Filtrar por proveedor' })).toBeTruthy()
 expect(screen.getByText('No hay productos en el catálogo.')).toBeTruthy()
 const categorias = screen.getByRole('button', { name: /Gestionar Categorías/ })
 expect(categorias.getAttribute('aria-expanded')).toBe('false')
 fireEvent.click(categorias)
 expect(categorias.getAttribute('aria-expanded')).toBe('true')
 expect(screen.queryByRole('button', { name: 'Precios de Envases' })).toBeNull()
})

it('un código nuevo desde pistola abre el formulario editable con código y tenant correcto', async () => {
 render(<CatalogoPage />)
 await act(async () => { await mocks.scan?.(' 7791234567890 ') })
 expect(screen.getByTestId('product-form').getAttribute('data-code')).toBe('7791234567890')
 expect(mocks.eq).toHaveBeenCalledWith('kiosco_id', 'k1')
 expect(mocks.buscar).toHaveBeenCalledWith('7791234567890')
})
it('la cámara permite abrir el alta de un producto no registrado', async () => {
 render(<CatalogoPage />)
 fireEvent.click(screen.getByRole('button', { name: 'Escanear con cámara' }))
 fireEvent.click(screen.getByRole('button', { name: 'capturar-codigo' }))
 await waitFor(() => expect(screen.getByTestId('product-form').getAttribute('data-code')).toBe('7791234567890'))
})
it('un código existente abre edición y no duplica el producto', async () => {
 mocks.lookup.mockResolvedValue({ data: { id: 'existing', activo: true }, error: null })
 render(<CatalogoPage />)
 await act(async () => { await mocks.scan?.('7791234567890') })
 expect(screen.getByTestId('product-form').getAttribute('data-product')).toBe('existing')
})
it('un error de consulta no se convierte en alta', async () => {
 mocks.lookup.mockResolvedValue({ data: null, error: { message: 'network' } })
 render(<CatalogoPage />)
 await act(async () => { await mocks.scan?.('7791234567890') })
 expect(screen.queryByTestId('product-form')).toBeNull()
})
it('descarta la consulta si cambió el comercio durante la espera', async () => {
 let resolve!: (value: unknown) => void
 mocks.lookup.mockReturnValue(new Promise(done => { resolve = done }))
 render(<CatalogoPage />)
 let pending: Promise<void> | undefined
 act(() => { pending = mocks.scan?.('7791234567890') })
 mocks.auth.usuario = { ...mocks.auth.usuario, kiosco_id: 'other' }
 await act(async () => { resolve({ data: null, error: null }); await pending })
 expect(screen.queryByTestId('product-form')).toBeNull()
})
