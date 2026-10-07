import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BarcodeScannerModal } from './BarcodeScannerModal'
import { BarcodeCaptureModal } from '../ui/BarcodeCaptureModal'

const mocks = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), clear: vi.fn() }))
vi.mock('html5-qrcode', () => ({
  Html5QrcodeSupportedFormats: {},
  Html5Qrcode: class {
    isScanning = false
    async start() { await mocks.start(); this.isScanning = true }
    async stop() { mocks.stop(); this.isScanning = false }
    clear() { mocks.clear() }
    getRunningTrackSettings() { return { deviceId: 'trasera' } }
    getRunningTrackCapabilities() { return {} }
  },
}))
vi.mock('../../stores/authStore', () => ({ useAuthStore: { getState: () => ({}) } }))
vi.mock('../../stores/cartStore', () => ({ useCartStore: { getState: () => ({}) } }))
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.start.mockResolvedValue(undefined)
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: vi.fn(), enumerateDevices: vi.fn().mockResolvedValue([]),
  } })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it.each(['ventas', 'catálogo'])('reanuda %s al reabrir durante un inicio pendiente', async tipo => {
  let resolver = () => {}
  mocks.start.mockImplementationOnce(() => new Promise<void>(resolve => { resolver = resolve }))
  const ventana = (abierta: boolean) => tipo === 'ventas'
    ? <BarcodeScannerModal isOpen={abierta} onClose={vi.fn()} onProductScanned={vi.fn()} />
    : <BarcodeCaptureModal isOpen={abierta} onClose={vi.fn()} onBarcodeCaptured={vi.fn()} />
  const vista = render(ventana(true))
  await act(async () => { await vi.advanceTimersByTimeAsync(150) })
  expect(mocks.start).toHaveBeenCalledTimes(1)
  vista.rerender(ventana(false))
  vista.rerender(ventana(true))
  await act(async () => { await vi.advanceTimersByTimeAsync(150) })
  await act(async () => { resolver() })
  expect(mocks.stop).toHaveBeenCalledTimes(1)
  expect(mocks.start).toHaveBeenCalledTimes(2)
})

it.each(['ventas', 'catálogo'])('libera %s sin reiniciar si se desmonta con una reapertura pendiente', async tipo => {
  let resolver = () => {}
  mocks.start.mockImplementationOnce(() => new Promise<void>(resolve => { resolver = resolve }))
  const ventana = (abierta: boolean) => tipo === 'ventas'
    ? <BarcodeScannerModal isOpen={abierta} onClose={vi.fn()} onProductScanned={vi.fn()} />
    : <BarcodeCaptureModal isOpen={abierta} onClose={vi.fn()} onBarcodeCaptured={vi.fn()} />
  const vista = render(ventana(true))
  await act(async () => { await vi.advanceTimersByTimeAsync(150) })
  vista.rerender(ventana(false))
  vista.rerender(ventana(true))
  await act(async () => { await vi.advanceTimersByTimeAsync(150) })
  vista.unmount()
  await act(async () => { resolver() })
  expect(mocks.stop).toHaveBeenCalledTimes(1)
  expect(mocks.start).toHaveBeenCalledTimes(1)
})
