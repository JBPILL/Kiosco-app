import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BarcodeScannerModal } from './BarcodeScannerModal'
import { saveCachedProductos } from '../../lib/utils'
import { crearProducto } from '../../test/factories'
import toast from 'react-hot-toast'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), cart: vi.fn(), buscar: vi.fn(), eq: vi.fn(), select: vi.fn(), decodificar: null as ((codigo: string) => void) | null }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: { getState: mocks.auth } }))
vi.mock('../../stores/cartStore', () => ({ useCartStore: { getState: mocks.cart } }))
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    isScanning = false
    async start(_camera: unknown, _config: unknown, onDecoded: (codigo: string) => void) {
      mocks.decodificar = onDecoded
      this.isScanning = true
    }
    async stop() { this.isScanning = false }
    clear() {}
    getRunningTrackSettings() { return {} }
    getRunningTrackCapabilities() { return {} }
  },
  Html5QrcodeSupportedFormats: {},
}))
vi.mock('../../lib/sound', () => ({ playScanSound: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ select: mocks.select }) } }))
const auth = { usuario: { id: 'u1', auth_user_id: 'a1', kiosco_id: 'k1', activo: true }, kiosco: { id: 'k1' } }
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mocks.decodificar = null
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  mocks.auth.mockReturnValue(auth); mocks.cart.mockReturnValue({ tabActivaId: 't1' })
  const query = { eq: mocks.eq, maybeSingle: mocks.buscar }
  mocks.eq.mockReturnValue(query); mocks.select.mockReturnValue(query)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function buscar() {
  fireEvent.change(screen.getByPlaceholderText('Ingresar código numérico a mano...'), { target: { value: '7791234567890' } })
  fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
}
it.each(['manual', 'cámara', 'sin conexión'])('un código inactivo por %s no agrega ni ofrece alta rápida', async origen => {
  const agregar = vi.fn()
  const alta = vi.fn()
  const inactivo = crearProducto({ kiosco_id: 'k1', codigo_barras: '7791234567890', activo: false })
  mocks.buscar.mockResolvedValue({ data: inactivo, error: null })
  if (origen === 'sin conexión') {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    saveCachedProductos([inactivo], 'k1')
  }
  if (origen === 'cámara') {
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', { onLine: true, mediaDevices: { getUserMedia: vi.fn(), enumerateDevices: vi.fn().mockResolvedValue([]) } })
  }
  render(<BarcodeScannerModal isOpen onClose={vi.fn()} onProductScanned={agregar} onCodigoNoEncontrado={alta} />)
  if (origen === 'cámara') {
    await waitFor(() => expect(mocks.decodificar).not.toBeNull())
    await act(async () => { mocks.decodificar!('7791234567890') })
  } else buscar()

  await screen.findByText('Producto inactivo')
  expect(screen.getByText('El dueño debe reactivarlo desde Catálogo.')).toBeTruthy()
  expect(agregar).not.toHaveBeenCalled()
  expect(alta).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Agregar y editar producto' })).toBeNull()
  expect(toast.error).toHaveBeenCalledWith('Producto inactivo. El dueño debe reactivarlo desde Catálogo.')
  expect(mocks.eq).not.toHaveBeenCalledWith('activo', true)
  if (origen === 'sin conexión') expect(mocks.select).not.toHaveBeenCalled()
})

it('un código remoto inexistente permite solicitar alta sin agregar al ticket', async () => {
  mocks.buscar.mockResolvedValue({ data: null, error: null })
  const agregar = vi.fn()
  const alta = vi.fn()
  render(<BarcodeScannerModal isOpen onClose={vi.fn()} onProductScanned={agregar} onCodigoNoEncontrado={alta} />)
  buscar()
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar y editar producto' }))
  expect(alta).toHaveBeenCalledWith('7791234567890')
  expect(agregar).not.toHaveBeenCalled()
})

it('filtra por comercio activo y agrega producto encontrado', async () => {
  const agregar = vi.fn()
  mocks.buscar.mockResolvedValue({ data: { id: 'p1', descripcion: 'Producto' }, error: null })
  render(<BarcodeScannerModal isOpen onClose={vi.fn()} onProductScanned={agregar} />)
  buscar()
  await waitFor(() => expect(agregar).toHaveBeenCalledOnce())
  expect(mocks.eq).toHaveBeenCalledWith('kiosco_id', 'k1')
})
it('sin conexión usa sólo catálogo propio y no consulta Supabase', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  saveCachedProductos([crearProducto({ kiosco_id: 'k1', codigo_barras: '7791234567890', activo: true })], 'k1')
  const agregar = vi.fn()
  render(<BarcodeScannerModal isOpen onClose={vi.fn()} onProductScanned={agregar} />)
  buscar()
  await waitFor(() => expect(agregar).toHaveBeenCalledOnce())
  expect(mocks.select).not.toHaveBeenCalled()
  expect(agregar.mock.calls[0][0].kiosco_id).toBe('k1')
})
it.each(['cerrado', 'operador', 'ticket'])('descarta respuesta tardía tras cambio de %s', async cambio => {
  let resolver!: (value: unknown) => void
  mocks.buscar.mockReturnValue(new Promise(resolve => { resolver = resolve }))
  const agregar = vi.fn(); const cerrar = vi.fn()
  const { rerender } = render(<BarcodeScannerModal isOpen onClose={cerrar} onProductScanned={agregar} />)
  buscar()
  if (cambio === 'cerrado') rerender(<BarcodeScannerModal isOpen={false} onClose={cerrar} onProductScanned={agregar} />)
  if (cambio === 'operador') mocks.auth.mockReturnValue({ ...auth, usuario: { ...auth.usuario, id: 'u2' } })
  if (cambio === 'ticket') mocks.cart.mockReturnValue({ tabActivaId: 't2' })
  await act(async () => { resolver({ data: { id: 'p1', descripcion: 'Producto' }, error: null }) })
  expect(agregar).not.toHaveBeenCalled()
})
