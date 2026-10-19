import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ cargar: vi.fn() }))
vi.mock('../../lib/pilotOperationHistory', () => ({ cargarMovimientosEnvases: m.cargar }))
import { HistorialEnvases } from './HistorialEnvases'
const tipos = [{ id: 'vidrio', nombre: 'Vidrio', precio: 100, activo: true, stockVacios: 2, pendientes: 0 }]
beforeEach(() => { vi.clearAllMocks(); m.cargar.mockResolvedValue([]) })
it('muestra movimientos de ticket y distribuidor con cantidad y saldo compartidos', async () => {
  m.cargar.mockResolvedValue([{ id: 'm1', tipo_id: 'vidrio', accion: 'RECIBIR_TICKET', cantidad: 1, stock_resultante: 2, importe: 100, distribuidor: null, creado_en: '2026-10-18T12:00:00Z' },
    { id: 'm2', tipo_id: 'vidrio', accion: 'ENTREGAR_DISTRIBUIDOR', cantidad: -2, stock_resultante: 0, importe: 0, distribuidor: 'Proveedor de ensayo', creado_en: '2026-10-18T11:00:00Z' }])
  render(<HistorialEnvases kioscoId="k1" tipos={tipos} />)
  await screen.findByRole('list', { name: 'Movimientos registrados' })
  expect(screen.getByText('Recepción en ticket · Vidrio')).toBeTruthy()
  expect(screen.getByText('Distribuidor: Proveedor de ensayo')).toBeTruthy()
  const [kid, desde, hasta] = m.cargar.mock.calls[0]
  expect(kid).toBe('k1')
  expect(Date.parse(hasta) - Date.parse(desde)).toBe(30 * 86400000)
})
it('un error no se interpreta como período sin movimientos y permite reintentar', async () => {
  m.cargar.mockRejectedValueOnce(new Error('Página tardía rechazada'))
  render(<HistorialEnvases kioscoId="k1" tipos={tipos} />)
  await screen.findByRole('alert')
  expect(screen.queryByText('No hay movimientos registrados en este período.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar movimientos' }))
  await screen.findByText('No hay movimientos registrados en este período.')
})
it('oculta el historial anterior al cambiar de comercio', async () => {
  m.cargar.mockResolvedValueOnce([{ id: 'm1', tipo_id: 'vidrio', accion: 'RECIBIR_TICKET', cantidad: 1, stock_resultante: 2, importe: 100, distribuidor: null, creado_en: '2026-10-18T12:00:00Z' }])
  const { rerender } = render(<HistorialEnvases kioscoId="k1" tipos={tipos} />)
  await screen.findByText('Recepción en ticket · Vidrio')
  m.cargar.mockReturnValue(new Promise(() => {}))
  rerender(<HistorialEnvases kioscoId="k2" tipos={tipos} />)
  expect(screen.queryByText('Recepción en ticket · Vidrio')).toBeNull()
  expect(screen.getByRole('status')).toBeTruthy()
})
