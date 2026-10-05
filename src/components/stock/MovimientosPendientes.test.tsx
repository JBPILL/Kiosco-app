import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MovimientosPendientes } from './MovimientosPendientes'
import { listarMovimientosStockPendientes, prepararMovimientoStock } from '../../lib/stockOperation'
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))
const solicitud = { p_producto_id: 'p1', p_tipo: 'EGRESO', p_cantidad: 2, p_motivo: 'MERMA' }
beforeEach(() => { localStorage.clear(); vi.clearAllMocks() })
function abrir() {
  const operacion = prepararMovimientoStock('k1', solicitud)
  const refrescar = vi.fn().mockResolvedValue(undefined)
  render(<MovimientosPendientes kioscoId="k1" onRefrescar={refrescar} nombreProducto={() => 'Alfajor'} />)
  return { operacion, refrescar }
}
it('consultar una operación ausente conserva el pendiente', async () => {
  mocks.rpc.mockResolvedValue({ data: { estado: 'NO_REGISTRADA' }, error: null })
  const { refrescar } = abrir()
  fireEvent.click(screen.getByText('Consultar estado'))
  await waitFor(() => expect(screen.getByText('Consultar estado').hasAttribute('disabled')).toBe(false))
  expect(listarMovimientosStockPendientes('k1')).toHaveLength(1)
  expect(refrescar).not.toHaveBeenCalled()
})
it('cancelar usa la RPC atómica y limpia solo tras confirmación del servidor', async () => {
  mocks.rpc.mockResolvedValue({ data: { estado: 'CANCELADA' }, error: null })
  const { operacion, refrescar } = abrir()
  fireEvent.click(screen.getByText('Cancelar solicitud pendiente'))
  await waitFor(() => expect(listarMovimientosStockPendientes('k1')).toHaveLength(0))
  expect(mocks.rpc).toHaveBeenCalledWith('resolver_operacion_stock', { p_operacion_id: operacion.parametros.p_operacion_id, p_kiosco_id: 'k1', p_producto_id: 'p1', p_cancelar: true })
  expect(refrescar).toHaveBeenCalledOnce()
})
it('una falla de red conserva la solicitud original', async () => {
  mocks.rpc.mockRejectedValue(new Error('Sin conexión'))
  abrir()
  fireEvent.click(screen.getByText('Cancelar solicitud pendiente'))
  await waitFor(() => expect(screen.getByText('Consultar estado').hasAttribute('disabled')).toBe(false))
  expect(listarMovimientosStockPendientes('k1')).toHaveLength(1)
})
it('reintenta los parámetros originales y la misma identidad', async () => {
  mocks.rpc.mockResolvedValue({ data: [{ movimiento_id: 'm1', stock_nuevo: 8 }], error: null })
  const { operacion } = abrir()
  fireEvent.click(screen.getByText('Reintentar solicitud original'))
  await waitFor(() => expect(listarMovimientosStockPendientes('k1')).toHaveLength(0))
  expect(mocks.rpc).toHaveBeenCalledWith('registrar_movimiento_stock_idempotente', operacion.parametros)
})
it('no borra el pendiente si el servidor dice aplicado sin identificar el movimiento', async () => {
  mocks.rpc.mockResolvedValue({ data: { estado: 'APLICADA' }, error: null })
  const { refrescar } = abrir()
  fireEvent.click(screen.getByText('Consultar estado'))
  await waitFor(() => expect(screen.getByText('Consultar estado').hasAttribute('disabled')).toBe(false))
  expect(listarMovimientosStockPendientes('k1')).toHaveLength(1)
  expect(refrescar).not.toHaveBeenCalled()
})
