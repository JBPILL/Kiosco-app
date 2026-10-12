import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  obtenerUltimasVentas: vi.fn(),
}))

vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({ usuario: { kiosco_id: 'k1' }, kiosco: null }),
}))
vi.mock('../../stores/devolucionStore', () => ({
  useDevolucionStore: () => ({ obtenerUltimasVentas: mocks.obtenerUltimasVentas }),
  limpiarCodigoTicket: (value: string) => value,
}))
vi.mock('../../stores/afipStore', () => ({
  useAFIPStore: () => ({ emitirFacturaVenta: vi.fn(), config: null, cargarConfiguracion: vi.fn() }),
  validarCUIT: () => true,
}))
vi.mock('../ui/Modal', () => ({
  Modal: (props: { isOpen: boolean; children: React.ReactNode }) => props.isOpen ? <div>{props.children}</div> : null,
}))
vi.mock('../ui/SearchInput', () => ({ SearchInput: () => <input aria-label="buscar" /> }))
vi.mock('../ui/RefreshButton', () => ({ RefreshButton: () => <button>Actualizar</button> }))
vi.mock('./TicketReceiptModal', () => ({ TicketReceiptModal: () => null }))

import { HistorialTicketsModal } from './HistorialTicketsModal'

const venta = {
  id: 'venta-12345678',
  fecha_hora: '2026-10-12T12:00:00Z',
  total: 100,
  estado: 'COMPLETADA',
  detalles: [{ cantidad: 1, producto: { descripcion: 'Producto' } }],
  pagos: [],
} as never

describe('HistorialTicketsModal: acción de devolución', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('oculta devolución en modo estricto y conserva ver/reimprimir', async () => {
    vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
    mocks.obtenerUltimasVentas.mockResolvedValue([venta])

    render(<HistorialTicketsModal isOpen onClose={vi.fn()} onIniciarDevolucion={vi.fn()} />)

    expect(await screen.findByText('Ver / Reimprimir')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Hacer Devolución')).toBeNull())
  })

  it('mantiene disponible devolución cuando el flag es false', async () => {
    vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'false')
    mocks.obtenerUltimasVentas.mockResolvedValue([venta])

    render(<HistorialTicketsModal isOpen onClose={vi.fn()} onIniciarDevolucion={vi.fn()} />)

    expect(await screen.findByText('Hacer Devolución')).toBeTruthy()
    expect(screen.getByText('Ver / Reimprimir')).toBeTruthy()
  })
})
