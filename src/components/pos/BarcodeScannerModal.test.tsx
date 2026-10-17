import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BarcodeScannerModal } from './BarcodeScannerModal'
import { BarcodeCaptureModal } from '../ui/BarcodeCaptureModal'
import { saveCachedProductos } from '../../lib/utils'
import { crearProducto } from '../../test/factories'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), cart: vi.fn(), buscar: vi.fn(), eq: vi.fn(), select: vi.fn() }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: { getState: mocks.auth } }))
vi.mock('../../stores/cartStore', () => ({ useCartStore: { getState: mocks.cart } }))
vi.mock('html5-qrcode', () => ({ Html5Qrcode: class {}, Html5QrcodeSupportedFormats: {} }))
vi.mock('../../lib/sound', () => ({ playScanSound: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ select: mocks.select }) } }))
const auth = { usuario: { id: 'u1', auth_user_id: 'a1', kiosco_id: 'k1', activo: true }, kiosco: { id: 'k1' } }
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  mocks.auth.mockReturnValue(auth); mocks.cart.mockReturnValue({ tabActivaId: 't1' })
  const query = { eq: mocks.eq, maybeSingle: mocks.buscar }
  mocks.eq.mockReturnValue(query); mocks.select.mockReturnValue(query)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
function buscar() {
  fireEvent.change(screen.getByPlaceholderText('Ingresar código numérico a mano...'), { target: { value: '7791234567890' } })
  fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
}
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


it('el lector compartido en captura asigna el texto sin consultar productos ni tocar el ticket', async () => {
  const capturar = vi.fn(); const cerrar = vi.fn()
  mocks.auth.mockReturnValue({})
  render(<BarcodeCaptureModal isOpen onClose={cerrar} onBarcodeCaptured={capturar} />)
  expect(screen.queryByRole('checkbox', { name: 'Escaneo continuo' })).toBeNull()
  fireEvent.change(screen.getByRole('textbox', { name: 'Código manual' }), { target: { value: '  0012345678905  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Asignar' }))
  await waitFor(() => expect(capturar).toHaveBeenCalledExactlyOnceWith('0012345678905'))
  expect(cerrar).toHaveBeenCalledOnce()
  expect(mocks.auth).not.toHaveBeenCalled()
  expect(mocks.cart).not.toHaveBeenCalled()
  expect(mocks.select).not.toHaveBeenCalled()
  expect(mocks.buscar).not.toHaveBeenCalled()
})
