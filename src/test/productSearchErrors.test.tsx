// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductSearch } from '../components/pos/ProductSearch'

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  response: { data: null as unknown[] | null, error: null as { message: string } | null },
}))

vi.mock('react-hot-toast', () => ({ default: { error: mocks.toastError, } }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        or: () => query,
        limit: () => query,
        then: (resolve: (value: typeof mocks.response) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(mocks.response).then(resolve, reject),
      }
      return query
    },
  },
}))
vi.mock('../lib/utils', () => ({ formatPrecio: () => '$1', getCachedProductos: () => [] }))
vi.mock('../stores/cartStore', () => ({ useCartStore: { getState: () => ({ items: [] }) } }))
vi.mock('../stores/authStore', () => ({ useAuthStore: () => ({ usuario: { kiosco_id: 'kiosk' }, kiosco: null }) }))
vi.mock('../hooks/useTenantConfig', () => ({ useTenantConfig: () => ({ tieneBalanza: false }) }))
vi.mock('../lib/barcodeParser', () => ({ buscarProductoPorCodigoBalanza: () => null }))

describe('errores de búsqueda de productos', () => {
  beforeEach(() => {
    mocks.toastError.mockReset()
    mocks.response = { data: null, error: { message: 'PostgREST relationship error' } }
  })

  it('informa el error de la búsqueda principal sin mostrar falsamente que no hay coincidencias', async () => {
    render(<ProductSearch onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'leche' } })

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      'No se pudieron buscar productos. Revisá tu conexión e intentá nuevamente.',
    ))
    expect(screen.queryByText('No se encontró "leche"')).toBeNull()
  })

  it('aborta Alta Rápida si falla la búsqueda exacta directa', async () => {
    const onCodigoNoEncontrado = vi.fn()
    render(<ProductSearch onSelect={vi.fn()} onCodigoNoEncontrado={onCodigoNoEncontrado} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '7791234567890' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      'No se pudo verificar el código del producto. Revisá tu conexión e intentá nuevamente.',
    ))
    expect(onCodigoNoEncontrado).not.toHaveBeenCalled()
  })

  it('conserva el estado vacío normal cuando Supabase responde sin error y sin filas', async () => {
    mocks.response = { data: [], error: null }
    render(<ProductSearch onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'leche' } })

    expect(await screen.findByText('No se encontró "leche"')).toBeTruthy()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
