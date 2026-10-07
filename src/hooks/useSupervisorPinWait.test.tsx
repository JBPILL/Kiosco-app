import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useSupervisorPinWait } from './useSupervisorPinWait'
afterEach(() => vi.useRealTimers())
it('cuenta hasta cero y libera su intervalo al terminar', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T12:00:00Z'))
  const { result } = renderHook(() => useSupervisorPinWait('2026-10-07T12:00:02Z'))
  expect(result.current).toBe(2)
  act(() => vi.advanceTimersByTime(1000)); expect(result.current).toBe(1)
  act(() => vi.advanceTimersByTime(1000)); expect(result.current).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})
it('ignora fechas malformadas o vencidas', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T12:00:00Z'))
  const { result, rerender } = renderHook(({ fecha }) => useSupervisorPinWait(fecha), { initialProps: { fecha: 'ayer' } })
  expect(result.current).toBe(0)
  rerender({ fecha: '2026-10-07T11:00:00Z' }); expect(result.current).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})
it('limpia el intervalo al desmontar', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T12:00:00Z'))
  const { unmount } = renderHook(() => useSupervisorPinWait('2026-10-07T12:15:00Z'))
  expect(vi.getTimerCount()).toBe(1)
  unmount(); expect(vi.getTimerCount()).toBe(0)
})
