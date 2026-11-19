import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  obtenerUltimasVentas: vi.fn(),
  emitir: vi.fn(),
  user: { kiosco_id: 'k1', auth_user_id: 'a1', rol: 'DUEÑO', activo: true, es_superadmin: false },
}))

vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({ usuario: mocks.user, kiosco: null }),
}))
vi.mock('../../stores/devolucionStore', () => ({
  useDevolucionStore: () => ({ obtenerUltimasVentas: mocks.obtenerUltimasVentas }),
  limpiarCodigoTicket: (value: string) => value,
}))
vi.mock('../../stores/afipStore', () => ({
  useAFIPStore: () => ({ emitirFacturaVenta: mocks.emitir, config: null, cargarConfiguracion: vi.fn() }),
  validarCUIT: () => true,
}))
vi.mock('../ui/Modal', () => ({
  Modal: (props: { isOpen: boolean; children: React.ReactNode }) => props.isOpen ? <div>{props.children}</div> : null,
}))
vi.mock('../ui/SearchInput', () => ({ SearchInput: () => <input aria-label="buscar" /> }))
vi.mock('../ui/RefreshButton', () => ({ RefreshButton: () => <button>Actualizar</button> }))
vi.mock('./TicketReceiptModal', () => ({ TicketReceiptModal: () => null }))
vi.mock('./FiscalDocumentModal', () => ({ FiscalDocumentModal: (props: { isOpen: boolean; scope: { saleId: string } }) => props.isOpen ? <div>Revisión de {props.scope.saleId}</div> : null }))

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
  afterEach(() => { vi.unstubAllEnvs(); Object.assign(mocks.user, { rol: 'DUEÑO', activo: true, es_superadmin: false }); mocks.emitir.mockClear() })

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
  it('abre preparación/revisión desde venta con flag explícito y Dueño, sin usar emisión heredada', async () => {
    vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true'); vi.stubEnv('VITE_KIOSKO_ARCA_REVISION_HOMO', 'true')
    mocks.obtenerUltimasVentas.mockResolvedValue([venta])
    render(<HistorialTicketsModal isOpen onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Preparar / revisar ARCA' }))
    expect(screen.getByText('Revisión de venta-12345678')).toBeTruthy()
    expect(screen.queryByText('Facturar ARCA')).toBeNull(); expect(mocks.emitir).not.toHaveBeenCalled()
  })
  it.each(['CAJERO', 'VISOR', 'INACTIVO', 'SUPERADMIN'])('no ofrece preparación a %s', async role => {
    vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true'); vi.stubEnv('VITE_KIOSKO_ARCA_REVISION_HOMO', 'true')
    Object.assign(mocks.user, { rol: ['CAJERO', 'VISOR'].includes(role) ? role : 'DUEÑO', activo: role !== 'INACTIVO', es_superadmin: role === 'SUPERADMIN' })
    mocks.obtenerUltimasVentas.mockResolvedValue([venta]); render(<HistorialTicketsModal isOpen onClose={vi.fn()} />)
    await screen.findByText('Ver / Reimprimir')
    expect(screen.queryByRole('button', { name: 'Preparar / revisar ARCA' })).toBeNull()
  })
})
