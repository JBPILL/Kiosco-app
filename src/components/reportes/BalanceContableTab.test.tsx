import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { DatosBalance } from '../../lib/balanceReportData'
const m = vi.hoisted(() => ({ cargar: vi.fn(), exportar: vi.fn(), kid: 'k1' }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: () => ({ usuario: { id: `u-${m.kid}`, kiosco_id: m.kid, rol: 'DUEÑO' }, kiosco: { id: m.kid, nombre: 'Comercio de ensayo' } }) }))
vi.mock('../../lib/balanceReportData', () => ({ cargarDatosBalance: m.cargar }))
vi.mock('../../lib/exportUtils', () => ({ exportarRendimientosDuenoExcel: m.exportar, exportarLibroContableExcel: m.exportar, exportarLibroIvaVentasExcel: m.exportar }))
vi.mock('../pos/TicketReceiptModal', () => ({ TicketReceiptModal: () => null }))
import { BalanceContableTab } from './BalanceContableTab'
const vacio = (): DatosBalance => ({ ventas: [], movimientos: [], devoluciones: [], proveedores: [], compras: [], pagos: [] })
beforeEach(() => { vi.clearAllMocks(); m.kid = 'k1'; m.cargar.mockResolvedValue(vacio()) })

it('bloquea las tres exportaciones en carga y error, sin presentar cifras parciales, y permite reintentar', async () => {
  let rechazar!: (e: Error) => void
  m.cargar.mockReturnValueOnce(new Promise((_r, reject) => { rechazar = reject }))
  render(<BalanceContableTab />)
  for (const n of ['Descargar Libro Diario', 'Exportar Rendimientos', 'Exportar Libro IVA ARCA']) expect(screen.getByRole('button', { name: n }).hasAttribute('disabled')).toBe(true)
  await act(async () => { rechazar(new Error('Página tardía')) })
  expect((await screen.findByRole('alert')).textContent).toContain('No se muestran cifras parciales')
  expect(screen.queryByText(/Tickets emitidos/i)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Exportar Rendimientos' }))
  expect(m.exportar).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar balance' }))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(screen.getByRole('button', { name: 'Exportar Rendimientos' }).hasAttribute('disabled')).toBe(false)
  expect(m.cargar).toHaveBeenCalledTimes(2)
})

it('descarta una respuesta vieja cuando cambia el año, incluso si esa respuesta falla', async () => {
  let rechazar!: (e: Error) => void
  m.cargar.mockReturnValueOnce(new Promise((_r, reject) => { rechazar = reject }))
  render(<BalanceContableTab />)
  const selector = screen.getByLabelText('Seleccionar año de balance') as HTMLSelectElement
  fireEvent.change(selector, { target: { value: String(new Date().getFullYear() - 1) } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Exportar Rendimientos' }).hasAttribute('disabled')).toBe(false))
  await act(async () => { rechazar(new Error('Respuesta de año viejo')) })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(m.cargar).toHaveBeenLastCalledWith('k1', new Date().getFullYear() - 1)
})

it('oculta de inmediato resultados de otro comercio y descarta su respuesta tardía', async () => {
  let resolver!: (d: DatosBalance) => void
  m.cargar.mockReturnValueOnce(new Promise(resolve => { resolver = resolve }))
  const vista = render(<BalanceContableTab />)
  m.kid = 'k2'; vista.rerender(<BalanceContableTab />)
  await waitFor(() => expect(m.cargar).toHaveBeenLastCalledWith('k2', new Date().getFullYear()))
  await act(async () => { resolver({ ...vacio(), proveedores: [{ id: 'privado-viejo', nombre: 'Proveedor del comercio anterior', saldo_pendiente: 9000 } as DatosBalance['proveedores'][number]] }) })
  expect(screen.queryByText('Proveedor del comercio anterior')).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
})
