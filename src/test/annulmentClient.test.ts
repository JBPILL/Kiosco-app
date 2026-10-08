import { beforeEach, expect, it, vi } from 'vitest'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { rpc } }))
import { anularVentaAtomica } from '../lib/annulmentClient'
beforeEach(() => rpc.mockReset())
it('envía una sola operación y recibe stock absoluto confirmado', async () => {
  rpc.mockResolvedValue({ data: { venta_id: 'venta', kiosco_id: 'comercio', estado: 'ANULADA', stock: [{ producto_id: 'producto', stock_actual: 10 }] }, error: null })
  const result = await anularVentaAtomica('venta', 'comercio', ' Error de carga ', null)
  expect(result.stock[0].stock_actual).toBe(10)
  expect(rpc).toHaveBeenCalledExactlyOnceWith('anular_venta_atomica', { p_venta_id: 'venta', p_motivo: 'Error de carga', p_sesion_reintegro: null })
})
it('propaga el rechazo sin ejecutar escrituras alternativas', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'Falta el histórico' } })
  await expect(anularVentaAtomica('venta', 'comercio', 'Error de carga', null)).rejects.toThrow('histórico')
  expect(rpc).toHaveBeenCalledTimes(1)
})
it.each([
  null,
  { venta_id: 'otra', kiosco_id: 'comercio', estado: 'ANULADA', stock: [] },
  { venta_id: 'venta', kiosco_id: 'otro', estado: 'ANULADA', stock: [] },
  { venta_id: 'venta', kiosco_id: 'comercio', estado: 'ANULADA', stock: [{ producto_id: 'producto', stock_actual: NaN }] },
])('rechaza una confirmación inválida', async data => {
  rpc.mockResolvedValue({ data, error: null })
  await expect(anularVentaAtomica('venta', 'comercio', 'Error de carga', null)).rejects.toThrow()
})
