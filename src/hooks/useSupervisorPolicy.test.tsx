import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useSupervisorPolicy } from './useSupervisorPolicy'
const consultar = vi.hoisted(() => vi.fn())
vi.mock('../lib/supervisorPolicyClient', () => ({ consultarPoliticaSupervisor: consultar }))
beforeEach(() => consultar.mockReset().mockResolvedValue({ umbralPorcentaje: 5, revision: 1 }))
afterEach(cleanup)
it('sólo consulta si el nuevo descuento necesita política', async () => {
  const { result, rerender } = renderHook(({ activo }) => useSupervisorPolicy(activo, 'k1'), { initialProps: { activo: false } })
  expect(consultar).not.toHaveBeenCalled()
  expect(result.current.politica).toBeNull()
  rerender({ activo: true })
  await waitFor(() => expect(result.current.politica?.umbralPorcentaje).toBe(5))
})
it('un error no se convierte en umbral 15 y permite reintentar', async () => {
  consultar.mockRejectedValueOnce(new Error('SECRET'))
  const { result } = renderHook(() => useSupervisorPolicy(true, 'k1'))
  await waitFor(() => expect(result.current.error).toBe(true))
  expect(result.current.politica).toBeNull()
  act(() => result.current.reintentar())
  await waitFor(() => expect(result.current.politica?.umbralPorcentaje).toBe(5))
})
it('descarta respuesta tardía del operador o ticket anterior', async () => {
  let resolver: (politica: { umbralPorcentaje: number; revision: number }) => void = () => {}
  consultar.mockImplementationOnce(() => new Promise(resolve => { resolver = resolve }))
  const { result, rerender } = renderHook(({ contexto }) => useSupervisorPolicy(true, contexto), { initialProps: { contexto: 'k1/t1' } })
  rerender({ contexto: 'k2/t2' })
  await waitFor(() => expect(result.current.politica?.umbralPorcentaje).toBe(5))
  await act(async () => { resolver({ umbralPorcentaje: 50, revision: 3 }) })
  expect(result.current.politica?.umbralPorcentaje).toBe(5)
})
