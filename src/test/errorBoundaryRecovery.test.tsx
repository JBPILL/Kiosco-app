import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'

const draft = vi.hoisted(() => ({ items: [{ cantidad: 2 }], tabs: [{ items: [{ cantidad: 2 }] }] }))
vi.mock('../stores/cartStore', () => ({ useCartStore: { getState: () => draft } }))

function BrokenRoute() {
  if (window.location.pathname !== '/') throw new TypeError("'text/html' is not a valid JavaScript MIME type.")
  return <p>Ticket activo: {draft.items[0].cantidad} unidades</p>
}

describe('Recuperación de pantalla sin descartar carrito', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/stock')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  it('vuelve al POS y conserva el borrador sin recargar', () => {
    render(<ErrorBoundary><BrokenRoute /></ErrorBoundary>)
    expect(screen.getByText('Actualización del sistema disponible')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Volver al punto de venta' }))
    expect(screen.getByText('Ticket activo: 2 unidades')).toBeTruthy()
    expect(window.location.pathname).toBe('/')
  })
  it('permite cancelar la recarga cuando existen tickets', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<ErrorBoundary><BrokenRoute /></ErrorBoundary>)
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar a la nueva versión' }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/stock')
    expect(draft.items[0].cantidad).toBe(2)
  })
  it('no necesita sessionStorage para mostrar y recuperar el error', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage bloqueado') })
    render(<ErrorBoundary><BrokenRoute /></ErrorBoundary>)
    fireEvent.click(screen.getByRole('button', { name: 'Volver al punto de venta' }))
    expect(screen.getByText('Ticket activo: 2 unidades')).toBeTruthy()
  })
})
