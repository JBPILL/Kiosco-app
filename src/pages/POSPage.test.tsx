import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import { llamadasA, resetDb, responder } from '../test/supabaseMock'
import { crearProducto, crearPromocion } from '../test/factories'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  onScan: null as null | ((code: string) => Promise<void>),
  scanEnabled: true,
  atajos: {} as Record<string, (() => void) | undefined>,
  tenant: { tieneEnvases: false, tieneBalanza: true, tieneServiciosRapidos: false, esFotocopiadora: false },
  buscarVenta: vi.fn(),
}))

vi.mock('../lib/supabase', async () => (await import('../test/supabaseMock')).crearModuloSupabase())
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('../hooks/useBarcodeGun', () => ({
  useBarcodeGun: (opts: { onScan: (code: string) => Promise<void>; enabled: boolean }) => {
    mocks.onScan = opts.onScan
    mocks.scanEnabled = opts.enabled
  },
}))
vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: (handlers: Record<string, (() => void) | undefined>) => {
    mocks.atajos = handlers
  },
}))
vi.mock('../hooks/useRealtimeSync', () => ({ useRealtimeSync: () => undefined }))
vi.mock('../hooks/useTenantConfig', () => ({ useTenantConfig: () => mocks.tenant }))
vi.mock('../lib/sound', () => ({ playScanSound: vi.fn() }))

vi.mock('../components/pos/ProductSearch', () => ({
  ProductSearch: (p: { onCodigoNoEncontrado: (c: string) => void }) => (
    <button onClick={() => p.onCodigoNoEncontrado('  7791234567890 ')}>buscador-codigo-desconocido</button>
  ),
}))
vi.mock('../components/pos/FavoritesGrid', () => ({
  FavoritesGrid: (p: { productos: { id: string; descripcion: string }[]; onSelect: (x: unknown) => void }) => (
    <div>
      {p.productos.map((x) => (
        <button key={x.id} onClick={() => p.onSelect(x)}>{`fav-${x.descripcion}`}</button>
      ))}
    </div>
  ),
}))
vi.mock('../components/pos/CartPanel', () => ({
  CartPanel: (p: { onCobrar: () => void }) => <button onClick={p.onCobrar}>cobrar</button>,
}))
vi.mock('../components/pos/PaymentModal', () => ({
  PaymentModal: (p: { isOpen: boolean; onVentaCompletada: (t?: unknown) => void }) =>
    p.isOpen ? (
      <div data-testid="payment">
        <button onClick={() => p.onVentaCompletada({ ventaId: 'v1' })}>completar-venta</button>
      </div>
    ) : null,
}))
vi.mock('../components/pos/TicketReceiptModal', () => ({
  TicketReceiptModal: (p: { isOpen: boolean }) => (p.isOpen ? <div data-testid="ticket-modal" /> : null),
}))
vi.mock('../components/pos/BalanzaManualModal', () => ({
  BalanzaManualModal: (p: { isOpen: boolean; producto: { descripcion: string } | null; onConfirmar: (kg: number) => void; lecturaSerialHabilitada?: boolean }) =>
    p.isOpen ? (
      <div data-testid="balanza" data-producto={p.producto?.descripcion} data-serial={String(p.lecturaSerialHabilitada)}>
        <button onClick={() => p.onConfirmar(0.75)}>confirmar-peso</button>
      </div>
    ) : null,
}))
vi.mock('../components/pos/DevolucionModal', () => ({
  DevolucionModal: (p: { isOpen: boolean; ventaInicial: { id: string } | null }) =>
    p.isOpen ? <div data-testid="devolucion" data-venta={p.ventaInicial?.id} /> : null,
}))
vi.mock('../components/pos/AltaRapidaModal', () => ({
  AltaRapidaModal: (p: { isOpen: boolean; codigo: string; productoSugerido: { descripcion: string } | null }) =>
    p.isOpen ? <div data-testid="alta" data-codigo={p.codigo} data-sugerido={p.productoSugerido?.descripcion ?? ''} /> : null,
}))
vi.mock('../components/pos/BarcodeScannerModal', () => ({ BarcodeScannerModal: () => null }))
vi.mock('../components/pos/KeyboardShortcutsModal', () => ({
  KeyboardShortcutsModal: (p: { isOpen: boolean }) => (p.isOpen ? <div data-testid="ayuda" /> : null),
}))
vi.mock('../components/pos/ArticuloLibreModal', () => ({
  ArticuloLibreModal: (p: { isOpen: boolean; descripcionInicial?: string }) => p.isOpen
    ? <div data-testid="articulo-libre" data-descripcion={p.descripcionInicial || ''} /> : null,
}))
vi.mock('../components/pos/HistorialTicketsModal', () => ({ HistorialTicketsModal: () => null }))
vi.mock('../components/pos/RecibirEnvaseModal', () => ({ RecibirEnvaseModal: () => null }))
vi.mock('../components/pos/RetiroCajaModal', () => ({
  RetiroCajaModal: (p: { isOpen: boolean }) => (p.isOpen ? <div data-testid="retiro" /> : null),
}))

import { POSPage } from './POSPage'
import { useAuthStore } from '../stores/authStore'
import { useCajaStore } from '../stores/cajaStore'
import { useCartStore } from '../stores/cartStore'
import { useDevolucionStore } from '../stores/devolucionStore'
import { usePromocionStore } from '../stores/promocionStore'
import { useComboStore } from '../stores/comboStore'
import { saveCachedProductos } from '../lib/utils'

const KIOSCO = 'k1'
const sesion = { id: 's1', estado: 'ABIERTA' } as never

function cantidadEnCarrito(): number {
  return useCartStore.getState().totalItems()
}

async function montar() {
  render(<POSPage />)
  await waitFor(() => expect(mocks.onScan).not.toBeNull())
  await waitFor(() => expect(llamadasA('productos', 'select').length).toBeGreaterThan(0))
}

async function escanear(code: string) {
  await act(async () => {
    await mocks.onScan!(code)
  })
}

beforeEach(() => {
  localStorage.clear()
  resetDb()
  vi.clearAllMocks()
  mocks.onScan = null
  mocks.atajos = {}
  mocks.tenant = { tieneEnvases: false, tieneBalanza: true, tieneServiciosRapidos: false, esFotocopiadora: false }
  useCartStore.setState({
    items: [],
    tipoAjuste: 'NINGUNO',
    valorAjuste: 0,
    tabs: [{ id: 't1', nombre: 'Ticket 1', items: [], tipoAjuste: 'NINGUNO', valorAjuste: 0 }],
    tabActivaId: 't1',
    ventasEnEspera: [],
  })
  useAuthStore.setState({ usuario: { id: 'u1', rol: 'CAJERO', kiosco_id: KIOSCO } as never, kiosco: null })
  useCajaStore.setState({ sesionActiva: sesion, verificarSesionActiva: vi.fn().mockResolvedValue(undefined) } as never)
  usePromocionStore.setState({ promociones: [], cargarPromociones: vi.fn().mockResolvedValue(undefined) } as never)
  useComboStore.setState({ cargarCombos: vi.fn().mockResolvedValue(undefined) } as never)
  useDevolucionStore.setState({ buscarVentaParaDevolucion: mocks.buscarVenta } as never)
  mocks.buscarVenta.mockResolvedValue(null)
  responder('productos.select', { data: null, error: null })
  responder('categorias.select', { data: [], error: null })
})

describe('POSPage: cobro', () => {
  it('con caja cerrada muestra el banner y bloquea el cobro', async () => {
    useCajaStore.setState({ sesionActiva: null } as never)
    await montar()

    expect(screen.getByText('Caja cerrada:')).toBeTruthy()
    fireEvent.click(screen.getByText('cobrar'))

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Caja cerrada'), expect.anything())
    expect(screen.queryByTestId('payment')).toBeNull()
  })

  it('el botón "Abrir turno" lleva a /caja', async () => {
    useCajaStore.setState({ sesionActiva: null } as never)
    await montar()
    fireEvent.click(screen.getByText('Abrir turno'))
    expect(mocks.navigate).toHaveBeenCalledWith('/caja')
  })

  it('con ticket vacío (monto 0) no abre el modal de pago', async () => {
    await montar()
    fireEvent.click(screen.getByText('cobrar'))

    expect(toast.error).toHaveBeenCalled()
    expect(screen.queryByTestId('payment')).toBeNull()
  })

  it('con caja abierta y monto positivo abre el pago y, al completar, muestra el comprobante', async () => {
    await montar()
    act(() => useCartStore.getState().agregarProducto(crearProducto({ id: 'a', precio_venta: 100 })))

    fireEvent.click(screen.getByText('cobrar'))
    expect(screen.getByTestId('payment')).toBeTruthy()

    fireEvent.click(screen.getByText('completar-venta'))
    expect(screen.getByTestId('ticket-modal')).toBeTruthy()
    expect(mocks.scanEnabled).toBe(false) // la pistola se pausa mientras hay modales abiertos
  })

  it('el atajo de cobro solo actúa con items y monto positivo', async () => {
    await montar()
    act(() => mocks.atajos.onCobrar?.())
    expect(screen.queryByTestId('payment')).toBeNull()

    act(() => useCartStore.getState().agregarProducto(crearProducto({ id: 'a', precio_venta: 100 })))
    act(() => mocks.atajos.onCobrar?.())
    expect(screen.getByTestId('payment')).toBeTruthy()
  })
})

describe('POSPage: pistola de códigos de barras', () => {
  it('encuentra el producto en la caché local sin consultar a la red', async () => {
    const leche = crearProducto({ id: 'leche', descripcion: 'Leche', codigo_barras: '7790001112223' })
    saveCachedProductos([leche], KIOSCO)
    await montar()
    const consultasAntes = llamadasA('productos', 'select').length

    await escanear('7790001112223')

    expect(cantidadEnCarrito()).toBe(1)
    expect(toast.success).toHaveBeenCalledWith('Leche agregado')
    expect(llamadasA('productos', 'select')).toHaveLength(consultasAntes)
  })

  it('ignora productos inactivos de la caché y consulta a la base', async () => {
    saveCachedProductos([crearProducto({ id: 'x', codigo_barras: '111222333', activo: false })], KIOSCO)
    await montar()
    responder('productos.select', { data: crearProducto({ id: 'x', descripcion: 'Reactivado', codigo_barras: '111222333' }), error: null })

    await escanear('111222333')

    expect(toast.success).toHaveBeenCalledWith('Reactivado agregado')
  })

  it('si no está en caché lo busca en Supabase, lo agrega y lo guarda en caché', async () => {
    await montar()
    responder('productos.select', {
      data: crearProducto({ id: 'rem', descripcion: 'Remoto', codigo_barras: '555666777' }),
      error: null,
    })

    await escanear('555666777')

    expect(cantidadEnCarrito()).toBe(1)
    const filtros = llamadasA('productos', 'select').at(-1)!.filtros
    expect(filtros).toContainEqual(['eq', ['codigo_barras', '555666777']])
    expect(filtros).toContainEqual(['eq', ['kiosco_id', KIOSCO]])
    expect(JSON.stringify(localStorage)).toContain('Remoto')
  })

  it('un código desconocido abre el alta rápida sin agregar nada al ticket', async () => {
    await montar()
    await escanear('  9999999999999 ')

    const alta = await screen.findByTestId('alta')
    expect(alta.getAttribute('data-codigo')).toBe('9999999999999')
    expect(cantidadEnCarrito()).toBe(0)
  })

  it('si falla la red avisa al cajero y no abre el alta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await montar()
    responder('productos.select', { data: null, error: { message: 'network' } })

    await escanear('123123123')

    expect(toast.error).toHaveBeenCalledWith('No se pudo verificar el código de barras en la red')
    expect(screen.queryByTestId('alta')).toBeNull()
    expect(cantidadEnCarrito()).toBe(0)
  })

  it('un código vacío o con espacios se ignora', async () => {
    await montar()
    const antes = llamadasA('productos', 'select').length
    await escanear('   ')
    expect(llamadasA('productos', 'select')).toHaveLength(antes)
    expect(cantidadEnCarrito()).toBe(0)
  })

  it('un producto pesable abre el modal de peso en lugar de agregarse directo', async () => {
    saveCachedProductos([crearProducto({ id: 'q', descripcion: 'Queso', codigo_barras: '777', es_pesable: true } as never)], KIOSCO)
    await montar()

    await escanear('777')

    expect(screen.getByTestId('balanza').getAttribute('data-producto')).toBe('Queso')
    expect(cantidadEnCarrito()).toBe(0)

    fireEvent.click(screen.getByText('confirmar-peso'))
    expect(useCartStore.getState().totalMonto()).toBe(75) // 0.75 kg * $100
  })

  it('con balanza deshabilitada, un pesable del caché permite ingresar su peso manualmente', async () => {
    mocks.tenant = { ...mocks.tenant, tieneBalanza: false }
    saveCachedProductos([crearProducto({ id: 'q', descripcion: 'Queso', codigo_barras: '777', es_pesable: true })], KIOSCO)
    await montar()
    await escanear('777')
    expect(screen.getByTestId('balanza')).toBeTruthy()
    expect(screen.getByTestId('balanza').getAttribute('data-serial')).toBe('false')
    expect(cantidadEnCarrito()).toBe(0)
    fireEvent.click(screen.getByText('confirmar-peso'))
    expect(useCartStore.getState().totalMonto()).toBe(75)
  })

  it('con balanza deshabilitada, un pesable remoto también solicita peso', async () => {
    mocks.tenant = { ...mocks.tenant, tieneBalanza: false }
    await montar()
    responder('productos.select', { data: crearProducto({ id: 'q', descripcion: 'Queso', codigo_barras: '777', es_pesable: true }), error: null })
    await escanear('777')
    expect(screen.getByTestId('balanza')).toBeTruthy()
    expect(cantidadEnCarrito()).toBe(0)
  })

  it('un favorito pesable conserva la venta por peso al deshabilitar la balanza', async () => {
    mocks.tenant = { ...mocks.tenant, tieneBalanza: false }
    responder('productos.select', { data: [crearProducto({ id: 'q', descripcion: 'Queso', es_pesable: true })], error: null })
    await montar()
    fireEvent.click(await screen.findByText('fav-Queso'))
    expect(screen.getByTestId('balanza')).toBeTruthy()
    expect(cantidadEnCarrito()).toBe(0)
  })

  it('un código de balanza (prefijo 20) agrega el producto con el peso codificado', async () => {
    saveCachedProductos([crearProducto({ id: 'j', descripcion: 'Jamón', plu_balanza: '1234', precio_venta: 1000 } as never)], KIOSCO)
    await montar()

    await escanear('2012340150000') // PLU 1234, 150 g... según parser

    expect(cantidadEnCarrito()).toBeGreaterThan(0)
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Jamón'))
  })

  it('sin balanza habilitada, un código con prefijo 20 se trata como código común', async () => {
    mocks.tenant = { ...mocks.tenant, tieneBalanza: false }
    saveCachedProductos([crearProducto({ id: 'j', plu_balanza: '1234' } as never)], KIOSCO)
    await montar()

    await escanear('2012340150000')

    expect(cantidadEnCarrito()).toBe(0)
    expect(await screen.findByTestId('alta')).toBeTruthy()
  })
})

describe('POSPage: comprobantes escaneados', () => {
  it('un ticket válido abre el modal de devolución', async () => {
    mocks.buscarVenta.mockResolvedValue({ id: 'abcdef1234567890' })
    await montar()

    await escanear('T-abcdef12')

    expect(mocks.buscarVenta).toHaveBeenCalledWith('T-abcdef12', KIOSCO)
    expect(screen.getByTestId('devolucion').getAttribute('data-venta')).toBe('abcdef1234567890')
  })

  it('un ticket inexistente avisa y no abre devolución', async () => {
    await montar()
    await escanear('t-0123abcd')

    expect(toast.error).toHaveBeenCalledWith('No se encontró la venta con código t-0123abcd')
    expect(screen.queryByTestId('devolucion')).toBeNull()
  })

  it('un comprobante de cierre de caja (Z/X) no se busca como producto', async () => {
    await montar()
    const antes = llamadasA('productos', 'select').length
    await escanear('z-abcdef12')

    expect(toast).toHaveBeenCalledWith(expect.stringContaining('cierre de caja'), expect.anything())
    expect(llamadasA('productos', 'select')).toHaveLength(antes)
    expect(mocks.buscarVenta).not.toHaveBeenCalled()
  })
})

describe('POSPage: servicios rápidos', () => {
  it('oculta accesos de servicios cuando la capacidad está desactivada', async () => {
    await montar()
    expect(screen.queryByRole('button', { name: 'Fotocopias' })).toBeNull()
    expect(screen.getByRole('button', { name: /Cobro Manual/ })).toBeTruthy()
  })

  it('muestra accesos y abre el cobro con el concepto seleccionado', async () => {
    mocks.tenant = { ...mocks.tenant, tieneServiciosRapidos: true }
    await montar()
    for (const concepto of ['Fotocopias', 'Impresiones', 'Anillado', 'Plastificado']) {
      expect(screen.getByRole('button', { name: concepto })).toBeTruthy()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Fotocopias' }))
    expect(screen.getByTestId('articulo-libre').getAttribute('data-descripcion')).toBe('Fotocopias')
  })
})

describe('POSPage: búsqueda manual, atajos y promociones', () => {
  it('un código desconocido ingresado en el buscador abre el alta con el código limpio', async () => {
    await montar()
    fireEvent.click(screen.getByText('buscador-codigo-desconocido'))
    expect((await screen.findByTestId('alta')).getAttribute('data-codigo')).toBe('7791234567890')
  })

  it('los favoritos cargados se pueden agregar al ticket', async () => {
    responder('productos.select', { data: [crearProducto({ id: 'f1', descripcion: 'Alfajor' })], error: null })
    await montar()

    fireEvent.click(await screen.findByText('fav-Alfajor'))
    expect(cantidadEnCarrito()).toBe(1)
  })

  it('carga los datos filtrando por el kiosco del usuario', async () => {
    await montar()
    expect(llamadasA('productos', 'select')[0].filtros).toContainEqual(['eq', ['kiosco_id', KIOSCO]])
    expect(llamadasA('categorias', 'select')[0].filtros).toContainEqual(['eq', ['kiosco_id', KIOSCO]])
  })

  it('F1 abre la ayuda y Escape cierra el modal abierto', async () => {
    await montar()
    act(() => mocks.atajos.onOpenHelp?.())
    expect(screen.getByTestId('ayuda')).toBeTruthy()
    act(() => mocks.atajos.onEscape?.())
    expect(screen.queryByTestId('ayuda')).toBeNull()
  })

  it('el atajo de retiro de caja alterna el modal', async () => {
    await montar()
    act(() => mocks.atajos.onRetiroCaja?.())
    expect(screen.getByTestId('retiro')).toBeTruthy()
    act(() => mocks.atajos.onRetiroCaja?.())
    expect(screen.queryByTestId('retiro')).toBeNull()
  })

  it('cargar un combo agrega cada componente con su cantidad exacta', async () => {
    const ron = crearProducto({ id: 'ron', descripcion: 'Ron', precio_venta: 100 })
    const hielo = crearProducto({ id: 'hielo', descripcion: 'Hielo', precio_venta: 10 })
    usePromocionStore.setState({
      promociones: [
        crearPromocion({
          id: 'c1',
          nombre: 'Pack Fiesta',
          tipo: 'COMBO',
          precio_combo: 250,
          items_combo: [
            { producto_id: 'ron', cantidad: 2 },
            { producto_id: 'hielo', cantidad: 3 },
          ] as never,
        }),
      ],
    } as never)
    responder('productos.select', { data: [ron, hielo], error: null })
    await montar()

    fireEvent.click(screen.getByText('Combos y Ofertas'))
    fireEvent.click(await screen.findByRole('button', { name: '+ Cargar al Ticket' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Combo "Pack Fiesta" cargado al ticket'))
    const items = useCartStore.getState().items
    expect(items.find((i) => i.producto.id === 'ron')?.cantidad).toBe(2)
    expect(items.find((i) => i.producto.id === 'hielo')?.cantidad).toBe(3)
    expect(screen.queryByRole('button', { name: '+ Cargar al Ticket' })).toBeNull() // el modal se cierra
  })

  it('si faltan productos del combo en el catálogo avisa y no agrega nada', async () => {
    usePromocionStore.setState({
      promociones: [
        crearPromocion({
          id: 'c1',
          tipo: 'COMBO',
          items_combo: [{ producto_id: 'fantasma', cantidad: 1 }] as never,
        }),
      ],
    } as never)
    await montar()

    fireEvent.click(screen.getByText('Combos y Ofertas'))
    fireEvent.click(await screen.findByRole('button', { name: '+ Cargar al Ticket' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('No se encontraron los productos del combo en el catálogo')
    )
    expect(cantidadEnCarrito()).toBe(0)
  })
})
