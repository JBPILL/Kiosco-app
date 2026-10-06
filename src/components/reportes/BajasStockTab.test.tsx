import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../stores/authStore'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
import { BajasStockTab } from './BajasStockTab'

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: { movimientos: 0, por_motivo: [] }, error: null })
  useAuthStore.setState({ usuario: { rol: 'DUEÑO', kiosco_id: 'k1' } as never, kiosco: null })
})

it('consulta el período completo mediante RPC y muestra costos parciales', async () => {
  rpc.mockResolvedValue({ data: {
    movimientos: 1202, por_motivo: [{ motivo: 'MERMA', movimientos: 1202, sin_costo: 2, estimacion: 1200 }],
  }, error: null })
  render(<BajasStockTab />)
  await screen.findByRole('rowheader', { name: 'Merma' })
  expect(screen.getAllByText('1202').length).toBeGreaterThan(0)
  expect(rpc).toHaveBeenCalledWith('resumir_bajas_stock', expect.objectContaining({ p_kiosco_id: 'k1' }))
  expect(screen.getByText(/estimación es parcial/)).toBeTruthy()
  expect(screen.getByText(/todos los movimientos/)).toBeTruthy()
})

it('impide solicitar costos de un cajero', () => {
  useAuthStore.setState({ usuario: { rol: 'CAJERO', kiosco_id: 'k1' } as never })
  render(<BajasStockTab />)
  expect(rpc).not.toHaveBeenCalled()
  expect(screen.queryByRole('table')).toBeNull()
})

it('explica migración faltante y permite reintentar sin presentar ceros', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'function missing' } })
  render(<BajasStockTab />)
  expect((await screen.findByRole('alert')).textContent).toContain('supabase_fase_reporte_bajas_stock.sql')
  expect(screen.queryByRole('table')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
  await screen.findByText('No hay bajas registradas en este período.')
})

it('rechaza un rango invertido sin llamar al servidor', async () => {
  render(<BajasStockTab />)
  await screen.findByText('No hay bajas registradas en este período.')
  rpc.mockClear()
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2099-12-31' } })
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('rango'))
  expect(rpc).not.toHaveBeenCalled()
})

it('rechaza respuesta inválida y finaliza el indicador de carga ante caída de red', async () => {
  rpc.mockResolvedValueOnce({ data: { movimientos: 1, por_motivo: [] }, error: null })
  render(<BajasStockTab />)
  expect((await screen.findByRole('alert')).textContent).toContain('Respuesta inválida')
  rpc.mockRejectedValueOnce(new Error('Sin conexión'))
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Sin conexión'))
  expect(screen.queryByText('Cargando bajas...')).toBeNull()
})

it('descarta una respuesta tardía de un período anterior', async () => {
  let resolver: (valor: { data: unknown; error: null }) => void = () => undefined
  rpc.mockImplementationOnce(() => new Promise((resolve) => { resolver = resolve }))
  rpc.mockResolvedValue({ data: {
    movimientos: 1, por_motivo: [{ motivo: 'ROBO', movimientos: 1, sin_costo: 0, estimacion: 12 }],
  }, error: null })
  render(<BajasStockTab />)
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1))
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2020-01-01' } })
  await screen.findByRole('rowheader', { name: 'Robo' })
  await act(async () => resolver({ data: {
    movimientos: 1, por_motivo: [{ motivo: 'MERMA', movimientos: 1, sin_costo: 0, estimacion: 99 }],
  }, error: null }))
  expect(screen.queryByRole('rowheader', { name: 'Merma' })).toBeNull()
  expect(screen.getByRole('rowheader', { name: 'Robo' })).toBeTruthy()
})
