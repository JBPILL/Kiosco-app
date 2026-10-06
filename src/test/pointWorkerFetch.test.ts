// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { solicitarBackendPoint } from '../../supabase/functions/_shared/pointWorkerFetch'

afterEach(() => vi.unstubAllGlobals())

it('añade un límite de red sin quitar la cancelación del llamador', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
  vi.stubGlobal('fetch', fetchMock)
  const controller = new AbortController()
  await solicitarBackendPoint('https://example.test/rpc', { signal: controller.signal })
  const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
  expect(signal.aborted).toBe(false)
  controller.abort()
  expect(signal.aborted).toBe(true)
})

it('conserva la señal de un Request cuando no se pasa init', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
  vi.stubGlobal('fetch', fetchMock)
  const controller = new AbortController()
  await solicitarBackendPoint(new Request('https://example.test/rpc', { signal: controller.signal }))
  controller.abort()
  expect((fetchMock.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true)
})
