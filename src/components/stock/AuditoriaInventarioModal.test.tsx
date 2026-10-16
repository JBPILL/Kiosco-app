import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { crearProducto } from '../../test/factories'
import { AuditoriaInventarioModal } from './AuditoriaInventarioModal'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), scan: null as null | ((code: string) => void), enabled: false }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: () => ({ usuario: { id: 'owner', kiosco_id: 'k1' }, kiosco: { id: 'k1' } }) }))
vi.mock('../../lib/sound', () => ({ playScanSound: vi.fn() }))
vi.mock('../../hooks/useBarcodeGun', () => ({ useBarcodeGun: (options: { onScan: (code: string) => void; enabled: boolean }) => { mocks.scan = options.onScan; mocks.enabled = options.enabled } }))
vi.mock('../ui/BarcodeCaptureModal', () => ({ BarcodeCaptureModal: ({ isOpen, onBarcodeCaptured, onClose }: { isOpen: boolean; onBarcodeCaptured: (code: string) => void; onClose: () => void }) =>
  isOpen ? <button onClick={() => { onBarcodeCaptured('7791234567890'); onClose() }}>capturar-conteo</button> : null }))
vi.mock('../../stores/loteStore', () => ({ useLoteStore: { getState: () => ({}) } }))
afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())
it('cámara y pistola incrementan el mismo conteo sin persistir stock antes de aplicar ajustes', () => {
  render(<AuditoriaInventarioModal isOpen onClose={vi.fn()} productos={[crearProducto({ codigo_barras: '7791234567890' })]} onInventarioAplicado={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Escanear con cámara' }))
  expect(mocks.enabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'capturar-conteo' }))
  expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('1')
  act(() => { mocks.scan?.('7791234567890') })
  expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('2')
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(mocks.from).not.toHaveBeenCalled()
})
it('no incorpora al conteo un código de otro comercio', () => {
  render(<AuditoriaInventarioModal isOpen onClose={vi.fn()} productos={[crearProducto({ kiosco_id: 'other', codigo_barras: '7791234567890' })]} onInventarioAplicado={vi.fn()} />)
  act(() => { mocks.scan?.('7791234567890') })
  expect(screen.queryByRole('spinbutton')).toBeNull()
  expect(mocks.rpc).not.toHaveBeenCalled()
})
